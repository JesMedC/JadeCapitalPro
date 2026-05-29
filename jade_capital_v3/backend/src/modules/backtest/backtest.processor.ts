import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { MarketDataService } from '../market-data/market-data.service';
import { BacktestSession, BacktestStatus } from './entities/backtest-session.entity';
import { TradingGateway } from '../../websockets/trading.gateway';

// Local type mirrors of shared interfaces (shared package not linked in backend node_modules)
interface BacktestConfig {
  instrument: string;
  timeframe: string;
  strategy: string;
  lastNCandles: number;
}

interface BacktestTrade {
  index: number;
  direction: 'CALL' | 'PUT';
  entryCandle: number;
  result: 'win' | 'loss';
  pnl: number;
}

interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  equityCurve: number[];
}

/** Hard cap on candles fetched per job — defense-in-depth beyond the DTO @Max(250). */
const MAX_CANDLES = 250;

/** Emit a WebSocket progress event every N candles (plus unconditionally on the final candle). */
const PROGRESS_BATCH = 10;

@Processor('backtest')
export class BacktestProcessor {
  private readonly logger = new Logger(BacktestProcessor.name);

  constructor(
    @InjectRepository(BacktestSession)
    private readonly repo: Repository<BacktestSession>,
    private readonly marketDataService: MarketDataService,
    private readonly gateway: TradingGateway,
  ) {}

  @Process('run-backtest')
  async handle(
    job: Job<{ sessionId: string; userId: string; config: BacktestConfig }>,
  ): Promise<void> {
    const { sessionId, userId, config } = job.data;

    // Step 1: Mark session as running
    await this.repo.update(sessionId, { status: BacktestStatus.RUNNING });

    try {
      // Step 2: Fetch candles (cap at MAX_CANDLES — DTO already enforces @Max(250))
      const limit = Math.min(config.lastNCandles, MAX_CANDLES);
      // MarketDataService.getCandles() returns candles sorted descending (most recent first).
      // The engine reverses them to chronological order before processing.
      const candles = this.marketDataService.getCandles(
        config.instrument,
        config.timeframe,
        limit,
      );

      this.logger.debug(
        `Backtest ${sessionId} — fetched ${candles.length} candles for ${config.instrument}/${config.timeframe}`,
      );

      // Step 3: Run candle-direction engine
      const result = this.runCandleEngine(candles, userId, sessionId);

      // Step 4: Persist completed result
      // Cast through any to satisfy TypeORM's _QueryDeepPartialEntity constraint on jsonb columns
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repo.update(sessionId, {
        status: BacktestStatus.COMPLETED,
        results: result as any,
      } as any);

      // Step 5: Emit terminal 'completed' WebSocket event (display hint — HTTP poll is source of truth)
      const completedTotal = candles.length - 2;
      this.gateway.broadcastBacktestProgress(userId, {
        sessionId,
        processed: completedTotal,
        total: completedTotal,
        percent: 100,
        status: 'completed',
      });

      this.logger.log(
        `Backtest ${sessionId} completed — ${result.totalTrades} trades, winrate ${result.winrate}%`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.update(sessionId, {
        status: BacktestStatus.FAILED,
        error: message,
      });

      // Emit terminal 'failed' WebSocket event (sentinel processed:0/total:1 — UI ignores for non-running)
      this.gateway.broadcastBacktestProgress(userId, {
        sessionId,
        processed: 0,
        total: 1,
        percent: 100,
        status: 'failed',
      });

      this.logger.error(`Backtest ${sessionId} failed: ${message}`);
      // NOT re-thrown — Bull worker stays alive and processes next jobs
    }
  }

  /**
   * Candle-direction engine.
   *
   * Strategy: if current candle closed higher than previous → CALL;
   *           if current candle closed lower than previous → PUT;
   *           if flat → skip.
   *
   * Win condition: the next candle confirms the direction.
   * pnl = price delta in instrument units (raw close difference), rounded to 5dp.
   *
   * @param candles   Candles sorted **descending** (most-recent first) by MarketDataService.
   * @param userId    Owner of the session — used to target the per-user WS room.
   * @param sessionId Session UUID — included in every progress payload.
   */
  private runCandleEngine(
    candles: ReturnType<MarketDataService['getCandles']>,
    userId: string,
    sessionId: string,
  ): BacktestResult {
    // Reverse descending → chronological for sequential processing
    const sorted = [...candles].reverse();

    const trades: BacktestTrade[] = [];

    // total = last valid loop index (sorted.length - 2)
    // Loop runs i = 1 to sorted.length - 2 (inclusive)
    const total = sorted.length - 2;

    // Iterate i=1..n-2: we need a previous candle (i-1) and a next candle (i+1)
    for (let i = 1; i < sorted.length - 1; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const next = sorted[i + 1];

      // Skip flat candles (no directional signal)
      if (curr.close === prev.close) continue;

      const direction: 'CALL' | 'PUT' = curr.close > prev.close ? 'CALL' : 'PUT';

      // Win condition: next candle confirms direction
      const win =
        direction === 'CALL' ? next.close > curr.close : next.close < curr.close;

      // pnl in instrument price units, rounded to 5dp (matching MarketDataService pipPrecision)
      const rawPnl =
        direction === 'CALL' ? next.close - curr.close : curr.close - next.close;
      const pnl = parseFloat(rawPnl.toFixed(5));

      trades.push({
        index: trades.length,
        direction,
        entryCandle: i, // 1-based relative to original array; i=0 has no prior
        result: win ? 'win' : 'loss',
        pnl,
      });

      // Emit progress every PROGRESS_BATCH candles and unconditionally on the final candle
      if (i % PROGRESS_BATCH === 0 || i === total) {
        this.gateway.broadcastBacktestProgress(userId, {
          sessionId,
          processed: i,
          total,
          percent: Math.round((i / total) * 100),
          status: 'running',
        });
      }
    }

    return this.computeMetrics(trades);
  }

  /**
   * Compute summary metrics from a list of trades.
   * profitFactor sentinel: when losses === 0 && wins > 0, returns 9999.
   * Infinity is not valid JSON; sentinel 9999 is displayed as "∞" by Flutter.
   */
  private computeMetrics(trades: BacktestTrade[]): BacktestResult {
    const totalTrades = trades.length;
    const wins = trades.filter((t) => t.result === 'win').length;
    const losses = totalTrades - wins;

    const winrate =
      totalTrades === 0
        ? 0
        : parseFloat(((wins / totalTrades) * 100).toFixed(2));

    const sumWin = trades
      .filter((t) => t.result === 'win')
      .reduce((s, t) => s + t.pnl, 0);
    const sumLoss = Math.abs(
      trades
        .filter((t) => t.result === 'loss')
        .reduce((s, t) => s + t.pnl, 0),
    );

    // Infinity is not valid JSON; sentinel 9999 displayed as "∞" by Flutter
    let profitFactor: number;
    if (losses === 0) {
      profitFactor = wins > 0 ? 9999 : 0;
    } else {
      profitFactor = parseFloat((sumWin / sumLoss).toFixed(4));
    }

    // Equity curve and max drawdown
    const equityCurve: number[] = [];
    let cumPnl = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const t of trades) {
      cumPnl = parseFloat((cumPnl + t.pnl).toFixed(5));
      equityCurve.push(cumPnl);
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = parseFloat(dd.toFixed(5));
    }

    return {
      trades,
      totalTrades,
      wins,
      losses,
      winrate,
      profitFactor,
      maxDrawdown,
      equityCurve,
    };
  }
}
