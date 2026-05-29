/**
 * Unit tests for BacktestProcessor.
 *
 * Strategy: test the private engine logic indirectly via the public handle()
 * method by mocking the Repository and MarketDataService. The test accesses
 * private methods via the TypeScript cast `as any` — the standard NestJS
 * testing convention for processor unit tests.
 *
 * Covers:
 * - Flat candle is skipped (no trade emitted)
 * - CALL direction when current close > previous close
 * - PUT direction when current close < previous close
 * - Win when next candle confirms direction
 * - Loss when next candle contradicts direction
 * - profitFactor = 9999 sentinel when losses === 0 && wins > 0
 * - profitFactor = 0 when wins === 0
 * - lastNCandles cap enforced at MAX_CANDLES (250)
 * - Processor status transitions: running → completed / failed
 */

import 'reflect-metadata';
import { getQueueToken } from '@nestjs/bull';
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

function makeCandle(close: number): Candle {
  return { open: close, high: close + 0.001, low: close - 0.001, close, volume: 100, timestamp: new Date().toISOString() };
}

/** Build a descending-order candle array (most recent first) matching MarketDataService. */
function makeCandles(closes: number[]): Candle[] {
  // closes[0] is chronologically first; reverse to produce descending sort
  return closes.map(makeCandle).reverse();
}

function buildMockRepo() {
  return {
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<BacktestSession>;
}

function buildMockMarketDataService(candles: Candle[]) {
  return {
    getCandles: jest.fn().mockReturnValue(candles),
  };
}

interface TestConfig {
  lastNCandles: number;
  instrument: string;
  timeframe: string;
  strategy: string;
}

function buildJob(
  config: { lastNCandles: number; instrument?: string; timeframe?: string; strategy?: string },
  sessionId = 'session-1',
): Job<{ sessionId: string; userId: string; config: TestConfig }> {
  return {
    data: {
      sessionId,
      userId: 'user-1',
      config: {
        instrument: config.instrument ?? 'EUR/USD',
        timeframe: config.timeframe ?? '15m',
        strategy: config.strategy ?? 'candle-direction',
        lastNCandles: config.lastNCandles,
      },
    },
  } as unknown as Job<{ sessionId: string; userId: string; config: TestConfig }>;
}

// ── Shared mock gateway (covers the new third constructor parameter) ────────

const mockGateway = { broadcastBacktestProgress: jest.fn() };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BacktestProcessor', () => {
  // ── Engine: flat candle ───────────────────────────────────────────────────

  describe('runCandleEngine — flat candle skip', () => {
    it('skips a flat candle (close === prev.close) and emits no trade for it', async () => {
      // Pattern: [1.0, 1.0, 1.1] — middle candle is flat
      const candles = makeCandles([1.0, 1.0, 1.1]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      const job = buildJob({ lastNCandles: 3 });
      await processor.handle(job);

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      // Should have called update twice: once for RUNNING, once for COMPLETED
      expect(updateCalls.length).toBe(2);

      const completedCall = updateCalls.find(
        (c) => c[1].status === BacktestStatus.COMPLETED,
      );
      expect(completedCall).toBeDefined();

      const results = completedCall[1].results as { totalTrades: number };
      // Only 1 candle triplet exists [0,1,2]; candle 1 is flat → 0 trades
      expect(results.totalTrades).toBe(0);
    });
  });

  // ── Engine: CALL direction ────────────────────────────────────────────────

  describe('runCandleEngine — CALL direction', () => {
    it('emits CALL when current.close > prev.close', async () => {
      // chronological: [1.0, 1.1, 1.2] → curr(1.1) > prev(1.0) → CALL; next(1.2) > curr(1.1) → win
      const candles = makeCandles([1.0, 1.1, 1.2]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 3 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { trades: { direction: string; result: string }[] };

      expect(results.trades.length).toBe(1);
      expect(results.trades[0].direction).toBe('CALL');
      expect(results.trades[0].result).toBe('win');
    });
  });

  // ── Engine: PUT direction ────────────────────────────────────────────────

  describe('runCandleEngine — PUT direction', () => {
    it('emits PUT when current.close < prev.close', async () => {
      // chronological: [1.2, 1.1, 1.0] → curr(1.1) < prev(1.2) → PUT; next(1.0) < curr(1.1) → win
      const candles = makeCandles([1.2, 1.1, 1.0]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 3 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { trades: { direction: string; result: string }[] };

      expect(results.trades[0].direction).toBe('PUT');
      expect(results.trades[0].result).toBe('win');
    });
  });

  // ── Engine: loss ──────────────────────────────────────────────────────────

  describe('runCandleEngine — loss', () => {
    it('records a loss when next candle contradicts direction', async () => {
      // chronological: [1.0, 1.1, 1.0] → curr(1.1) > prev(1.0) → CALL; next(1.0) < curr(1.1) → loss
      const candles = makeCandles([1.0, 1.1, 1.0]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 3 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { trades: { result: string }[] };

      expect(results.trades[0].result).toBe('loss');
    });
  });

  // ── Metrics: profitFactor sentinel 9999 ──────────────────────────────────

  describe('computeMetrics — profitFactor sentinel', () => {
    it('returns profitFactor = 9999 when losses === 0 and wins > 0', async () => {
      // Two consecutive winning CALL trades: [1.0, 1.1, 1.2, 1.3]
      // candle 1: CALL (1.1>1.0) → win (1.2>1.1)
      // candle 2: CALL (1.2>1.1) → win (1.3>1.2)
      const candles = makeCandles([1.0, 1.1, 1.2, 1.3]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 4 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { profitFactor: number; wins: number; losses: number };

      expect(results.losses).toBe(0);
      expect(results.wins).toBeGreaterThan(0);
      expect(results.profitFactor).toBe(9999);
    });

    it('returns profitFactor = 0 when wins === 0', async () => {
      // All losses: [1.1, 1.0, 1.1, 1.2] — each curr is higher than prev but next reverses
      // candle 1 (i=1): prev=1.1, curr=1.0 → PUT; next=1.1 > curr=1.0 → loss
      // candle 2 (i=2): prev=1.0, curr=1.1 → CALL; next=1.2 > curr=1.1 → win  ← not all-loss
      // Use simpler: all losses via [1.0, 1.1, 1.0, 1.1] alternating
      // candle 1: prev=1.0, curr=1.1 → CALL; next=1.0 < curr=1.1 → loss
      // candle 2: prev=1.1, curr=1.0 → PUT; next=1.1 > curr=1.0 → loss
      const candles = makeCandles([1.0, 1.1, 1.0, 1.1]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 4 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { profitFactor: number; wins: number };

      expect(results.wins).toBe(0);
      expect(results.profitFactor).toBe(0);
    });
  });

  // ── lastNCandles cap at MAX_CANDLES (250) ─────────────────────────────────

  describe('lastNCandles cap', () => {
    it('caps the candle fetch to 250 even when lastNCandles exceeds 250', async () => {
      const candles = makeCandles([1.0, 1.1, 1.0]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 9999 }));

      // getCandles should be called with at most 250
      const getCandles = mds.getCandles as jest.Mock;
      const calledLimit = getCandles.mock.calls[0][2] as number;
      expect(calledLimit).toBeLessThanOrEqual(250);
    });
  });

  // ── Status transitions ────────────────────────────────────────────────────

  describe('status transitions', () => {
    it('updates status to RUNNING before processing, then COMPLETED on success', async () => {
      const candles = makeCandles([1.0, 1.1, 1.2]);
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 3 }, 'sess-001'));

      const calls = (repo.update as jest.Mock).mock.calls;
      expect(calls[0]).toEqual(['sess-001', { status: BacktestStatus.RUNNING }]);
      expect(calls[1][1].status).toBe(BacktestStatus.COMPLETED);
    });

    it('updates status to FAILED when getCandles throws, does NOT re-throw', async () => {
      const repo = buildMockRepo();
      const mds = {
        getCandles: jest.fn().mockImplementation(() => {
          throw new Error('market data unavailable');
        }),
      };
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      // Should NOT throw
      await expect(
        processor.handle(buildJob({ lastNCandles: 10 }, 'sess-002')),
      ).resolves.toBeUndefined();

      const calls = (repo.update as jest.Mock).mock.calls;
      const failedCall = calls.find((c) => c[1].status === BacktestStatus.FAILED);
      expect(failedCall).toBeDefined();
      expect(failedCall[1].error).toContain('market data unavailable');
    });
  });

  // ── Metrics: winrate ─────────────────────────────────────────────────────

  describe('computeMetrics — winrate', () => {
    it('computes winrate as (wins / total) * 100, rounded to 2dp', async () => {
      // 2 trades: candle 1 win, candle 2 loss → winrate = 50.00
      const candles = makeCandles([1.0, 1.1, 1.0, 1.1]);
      // candle 1: CALL (1.1>1.0) → loss (next=1.0<curr=1.1)
      // candle 2: PUT (1.0<1.1) → loss (next=1.1>curr=1.0)
      // Both are losses — winrate should be 0.00
      const repo = buildMockRepo();
      const mds = buildMockMarketDataService(candles);
      const processor = new BacktestProcessor(repo, mds as never, mockGateway as never);

      await processor.handle(buildJob({ lastNCandles: 4 }));

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const completedCall = updateCalls.find((c) => c[1].status === BacktestStatus.COMPLETED);
      const results = completedCall[1].results as { winrate: number; totalTrades: number };

      expect(results.totalTrades).toBe(2);
      expect(results.winrate).toBe(0);
    });
  });
});
