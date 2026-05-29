/**
 * BacktestProcessor — progress emission unit tests
 *
 * Covers Sprint 15 tasks 7.1–7.8:
 *
 * AC-4: Progress events emitted every PROGRESS_BATCH (10) candles + on final candle
 * AC-5: Terminal completed/failed events fire after repo.update()
 *
 * Strategy: inject a mock TradingGateway via the third constructor parameter;
 * inspect `broadcastBacktestProgress` call count and payload shape.
 */

import 'reflect-metadata';
import { BacktestProcessor } from '../backtest.processor';
import { BacktestSession, BacktestStatus } from '../entities/backtest-session.entity';
import { Repository } from 'typeorm';
import { Job } from 'bull';

// ── Helpers ────────────────────────────────────────────────────────────────

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

function makeCandle(close: number, ts = '2026-01-01T00:00:00.000Z'): Candle {
  return { open: close, high: close + 0.001, low: close - 0.001, close, volume: 100, timestamp: ts };
}

/**
 * Build a candle array of `count` items where consecutive closes alternate
 * slightly so the engine never skips (non-flat). The array is in descending
 * order (most-recent first) matching MarketDataService output.
 *
 * @param count Total number of candles (including the 2 edge candles that
 *              the engine skips — sorted.length - 2 is the actionable count)
 */
function makeCandleArray(count: number): Candle[] {
  // Build chronological array first (ascending index = ascending time)
  const chronological: Candle[] = [];
  for (let i = 0; i < count; i++) {
    // Alternate between slightly rising and slightly falling so no flat candles
    const close = 1.0 + (i % 2 === 0 ? i * 0.001 : -i * 0.001);
    chronological.push(makeCandle(parseFloat(close.toFixed(5))));
  }
  // MarketDataService returns descending (most-recent first)
  return [...chronological].reverse();
}

function buildMockRepo() {
  return {
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<BacktestSession>;
}

function buildJob(
  lastNCandles: number,
  sessionId = 'sess-progress',
  userId = 'user-progress',
): Job<{ sessionId: string; userId: string; config: { lastNCandles: number; instrument: string; timeframe: string; strategy: string } }> {
  return {
    data: {
      sessionId,
      userId,
      config: {
        instrument: 'EUR/USD',
        timeframe: '15m',
        strategy: 'candle-direction',
        lastNCandles,
      },
    },
  } as unknown as Job<{ sessionId: string; userId: string; config: { lastNCandles: number; instrument: string; timeframe: string; strategy: string } }>;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BacktestProcessor — progress emission', () => {
  let mockGateway: { broadcastBacktestProgress: jest.Mock };

  beforeEach(() => {
    mockGateway = { broadcastBacktestProgress: jest.fn() };
  });

  // ── AC-4: Batch boundaries ────────────────────────────────────────────────

  describe('batch emit every 10 candles', () => {
    /**
     * 102-item candle array → total = 102 - 2 = 100 actionable candles.
     * Loop: i = 1..100. Batch fires at i % 10 === 0: {10, 20, ..., 100}.
     * i === 100 is also a 10-boundary → fires once only (not twice).
     */

    it('emits at candle 10 with correct payload (AC-4)', async () => {
      const candles = makeCandleArray(102);
      const repo = buildMockRepo();
      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(102, 'sess-1', 'u-1'));

      const runningCalls = mockGateway.broadcastBacktestProgress.mock.calls.filter(
        ([, p]) => p.status === 'running',
      );

      const at10 = runningCalls.find(([, p]) => p.processed === 10);
      expect(at10).toBeDefined();
      expect(at10![1]).toMatchObject({
        sessionId: 'sess-1',
        processed: 10,
        total: 100,
        percent: 10,
        status: 'running',
      });
    });

    it('emits at candle 20 with correct payload (AC-4)', async () => {
      const candles = makeCandleArray(102);
      const repo = buildMockRepo();
      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(102, 'sess-2', 'u-2'));

      const runningCalls = mockGateway.broadcastBacktestProgress.mock.calls.filter(
        ([, p]) => p.status === 'running',
      );

      const at20 = runningCalls.find(([, p]) => p.processed === 20);
      expect(at20).toBeDefined();
      expect(at20![1]).toMatchObject({ processed: 20, percent: 20 });
    });

    it('emits on final candle (i=100) with percent 100 (AC-4)', async () => {
      const candles = makeCandleArray(102);
      const repo = buildMockRepo();
      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(102, 'sess-3', 'u-3'));

      const runningCalls = mockGateway.broadcastBacktestProgress.mock.calls.filter(
        ([, p]) => p.status === 'running',
      );

      // i=100 is a 10-boundary — fires once with processed:100, percent:100
      const atFinal = runningCalls.filter(([, p]) => p.processed === 100);
      expect(atFinal).toHaveLength(1);
      expect(atFinal[0][1]).toMatchObject({
        processed: 100,
        total: 100,
        percent: 100,
        status: 'running',
      });
    });

    it('does NOT emit on non-boundary candle i=5 (AC-4)', async () => {
      const candles = makeCandleArray(102);
      const repo = buildMockRepo();
      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(102, 'sess-4', 'u-4'));

      const runningCalls = mockGateway.broadcastBacktestProgress.mock.calls.filter(
        ([, p]) => p.status === 'running',
      );

      const atFive = runningCalls.find(([, p]) => p.processed === 5);
      expect(atFive).toBeUndefined();

      // Exactly 10 running calls: i=10,20,30,40,50,60,70,80,90,100
      expect(runningCalls).toHaveLength(10);
    });
  });

  // ── AC-4: Smaller-than-one-batch array ───────────────────────────────────

  describe('candle array smaller than one batch', () => {
    /**
     * 9-item array → total = 9 - 2 = 7 actionable candles.
     * Loop: i = 1..7. No 10-boundary fires. i === 7 → fires once.
     * percent = Math.round(7 / 7 * 100) = 100.
     */
    it('emits exactly once with processed=7 and percent=100 for a 9-item array', async () => {
      const candles = makeCandleArray(9);
      const repo = buildMockRepo();
      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(9, 'sess-5', 'u-5'));

      const runningCalls = mockGateway.broadcastBacktestProgress.mock.calls.filter(
        ([, p]) => p.status === 'running',
      );

      expect(runningCalls).toHaveLength(1);
      expect(runningCalls[0][1]).toMatchObject({
        processed: 7,
        total: 7,
        percent: 100,
        status: 'running',
      });
    });
  });

  // ── AC-5: Terminal events ─────────────────────────────────────────────────

  describe('terminal completed event', () => {
    it('fires broadcastBacktestProgress(status:completed) AFTER repo.update(COMPLETED) (AC-5)', async () => {
      const candles = makeCandleArray(102);
      const repo = buildMockRepo();
      const callOrder: string[] = [];

      (repo.update as jest.Mock).mockImplementation((id: string, data: { status?: BacktestStatus }) => {
        if (data.status === BacktestStatus.COMPLETED) callOrder.push('repo.update(COMPLETED)');
        return Promise.resolve(undefined);
      });

      mockGateway.broadcastBacktestProgress.mockImplementation(
        (_userId: string, payload: { status: string }) => {
          if (payload.status === 'completed') callOrder.push('gateway.completed');
        },
      );

      const mds = { getCandles: jest.fn().mockReturnValue(candles) };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(102, 'sess-6', 'u-6'));

      expect(callOrder).toEqual(['repo.update(COMPLETED)', 'gateway.completed']);

      const completedCall = mockGateway.broadcastBacktestProgress.mock.calls.find(
        ([, p]) => p.status === 'completed',
      );
      expect(completedCall![1]).toMatchObject({
        percent: 100,
        status: 'completed',
      });
    });
  });

  describe('terminal failed event', () => {
    it('fires broadcastBacktestProgress(status:failed) AFTER repo.update(FAILED) in catch (AC-5)', async () => {
      const repo = buildMockRepo();
      const callOrder: string[] = [];

      (repo.update as jest.Mock).mockImplementation((id: string, data: { status?: BacktestStatus }) => {
        if (data.status === BacktestStatus.FAILED) callOrder.push('repo.update(FAILED)');
        return Promise.resolve(undefined);
      });

      mockGateway.broadcastBacktestProgress.mockImplementation(
        (_userId: string, payload: { status: string }) => {
          if (payload.status === 'failed') callOrder.push('gateway.failed');
        },
      );

      const mds = {
        getCandles: jest.fn().mockImplementation(() => {
          throw new Error('market data unavailable');
        }),
      };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob(10, 'sess-7', 'u-7'));

      expect(callOrder).toEqual(['repo.update(FAILED)', 'gateway.failed']);

      const failedCall = mockGateway.broadcastBacktestProgress.mock.calls.find(
        ([, p]) => p.status === 'failed',
      );
      expect(failedCall![1]).toMatchObject({
        processed: 0,
        total: 1,
        percent: 100,
        status: 'failed',
      });
    });
  });
});
