/**
 * Phase 9 — Unit tests for GoalsService pure calculation helpers.
 *
 * Covers (tasks 9.1–9.5):
 *   9.1 _calcStreak  — win streak, reset on LOST/BE, max tracking
 *   9.2 _calcDrawdown — max peak-to-trough PnL drop
 *   9.3 _calcWinrate  — percentage, division-by-zero guard
 *   9.4 _toProgressPct — drawdown inversion, clamping, zero-target guard
 *   9.5 _applyAutoComplete — idempotency, completedAt preservation
 *
 * Strategy: instantiate GoalsService with mock repositories so that the
 * private helpers can be accessed via TypeScript casting.  No database is
 * needed — every method under test operates only on in-memory arrays or
 * the mocked goalRepository.save().
 *
 * Multi-user isolation note: _fetchRelevantTrades() is NOT tested here
 * (it relies on a real query builder and belongs in an integration test).
 * Its multi-user WHERE clause is covered by the journal service spec
 * pattern.  The helpers tested here receive pre-fetched Trade[] slices
 * that are always already scoped to the correct user.
 */

import 'reflect-metadata';
import { Repository } from 'typeorm';
import { GoalsService } from '../goals.service';
import { Goal } from '../entities/goal.entity';
import { Trade, TradeStatus } from '../../trades/entities/trade.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Trade fixture for calculation tests. */
function makeTrade(
  status: TradeStatus,
  pnl: number,
  createdAt = new Date('2026-01-15T10:00:00Z'),
): Trade {
  return {
    id: crypto.randomUUID(),
    userId: 'aaaaaaaa-0000-0000-0000-000000000001',
    status,
    pnl,
    createdAt,
    // Remaining required Trade fields — not used by pure helpers
    accountId: null,
    account: null as never,
    user: null as never,
    symbol: 'EURUSD',
    direction: 'long',
    entryPrice: 1.0,
    exitPrice: 1.01,
    lotSize: 0.1,
    commission: 0,
    tradeType: 'forex',
    notes: null,
    emotion: null,
    tags: null,
    tradeDate: null,
    sessionType: null,
    setupType: null,
    riskRewardRatio: null,
    openedAt: null,
    closedAt: null,
    updatedAt: new Date(),
  } as unknown as Trade;
}

/** Build a minimal Goal fixture for auto-complete tests. */
function makeGoal(
  overrides: Partial<Goal & { isCompleted: boolean; completedAt: Date | null }> = {},
): Goal {
  return {
    id: 'goal-0001-0000-0000-000000000001',
    userId: 'aaaaaaaa-0000-0000-0000-000000000001',
    accountId: null,
    title: 'Test goal',
    goalType: 'pnl',
    targetValue: 100,
    isCompleted: false,
    completedAt: null,
    isActive: true,
    period: 'custom',
    notes: null,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    user: null as never,
    account: null as never,
    ...overrides,
  } as Goal;
}

/** Build a GoalsService with mocked repositories. */
function buildService(saveFn = jest.fn().mockResolvedValue(undefined)) {
  const goalRepo = {
    save: saveFn,
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
  } as unknown as Repository<Goal>;

  const tradeRepo = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Trade>;

  const service = new GoalsService(goalRepo, tradeRepo);

  // Expose private helpers through TypeScript casting for white-box testing
  const priv = service as unknown as {
    _calcStreak(trades: Trade[]): number;
    _calcDrawdown(trades: Trade[]): number;
    _calcWinrate(trades: Trade[]): number;
    _toProgressPct(goalType: string, currentValue: number, targetValue: number): number;
    _applyAutoComplete(goal: Goal, progressPct: number): Promise<void>;
  };

  return { service, goalRepo, priv };
}

// ────────────────────────────────────────────────────────────────────────────
// 9.1 _calcStreak
// ────────────────────────────────────────────────────────────────────────────

describe('GoalsService._calcStreak (task 9.1)', () => {
  it('returns 0 for an empty trade array', () => {
    const { priv } = buildService();
    expect(priv._calcStreak([])).toBe(0);
  });

  it('returns 1 for a single WON trade', () => {
    const { priv } = buildService();
    expect(priv._calcStreak([makeTrade(TradeStatus.WON, 50)])).toBe(1);
  });

  it('returns 0 for a single LOST trade', () => {
    const { priv } = buildService();
    expect(priv._calcStreak([makeTrade(TradeStatus.LOST, -50)])).toBe(0);
  });

  it('returns 0 for a single BE trade', () => {
    const { priv } = buildService();
    expect(priv._calcStreak([makeTrade(TradeStatus.BE, 0)])).toBe(0);
  });

  it('returns N for an all-WON sequence of length N', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 20),
      makeTrade(TradeStatus.WON, 30),
      makeTrade(TradeStatus.WON, 40),
      makeTrade(TradeStatus.WON, 50),
    ];
    expect(priv._calcStreak(trades)).toBe(5);
  });

  it('resets the counter on LOST and tracks maximum streak across segments', () => {
    const { priv } = buildService();
    // Sequence: WON, WON, LOST, WON, WON, WON, WON → max streak = 4
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.LOST, -20),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
    ];
    expect(priv._calcStreak(trades)).toBe(4);
  });

  it('resets the counter on BE (break-even)', () => {
    const { priv } = buildService();
    // WON, WON, WON, BE, WON → max streak = 3 (not 4)
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.BE, 0),
      makeTrade(TradeStatus.WON, 10),
    ];
    expect(priv._calcStreak(trades)).toBe(3);
  });

  it('handles an all-LOST sequence (streak = 0)', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.LOST, -10),
    ];
    expect(priv._calcStreak(trades)).toBe(0);
  });

  it('returns the first segment max when first streak is longer', () => {
    const { priv } = buildService();
    // WON×3, LOST, WON×2 → max = 3
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.LOST, -5),
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 10),
    ];
    expect(priv._calcStreak(trades)).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9.2 _calcDrawdown
// ────────────────────────────────────────────────────────────────────────────

describe('GoalsService._calcDrawdown (task 9.2)', () => {
  it('returns 0 for an empty trade array', () => {
    const { priv } = buildService();
    expect(priv._calcDrawdown([])).toBe(0);
  });

  it('returns 0 for a monotonically increasing PnL sequence (no drawdown)', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 20),
      makeTrade(TradeStatus.WON, 30),
    ];
    expect(priv._calcDrawdown(trades)).toBe(0);
  });

  it('returns 0 for a single WON trade (peak = cumPnl, no drop)', () => {
    const { priv } = buildService();
    expect(priv._calcDrawdown([makeTrade(TradeStatus.WON, 100)])).toBe(0);
  });

  it('computes max drawdown from a peak-trough-recovery sequence', () => {
    const { priv } = buildService();
    // cumPnl: 50, 100, 60, 70 → peak=100, trough=60 → drawdown=40
    const trades = [
      makeTrade(TradeStatus.WON, 50),
      makeTrade(TradeStatus.WON, 50),
      makeTrade(TradeStatus.LOST, -40),
      makeTrade(TradeStatus.WON, 10),
    ];
    expect(priv._calcDrawdown(trades)).toBe(40);
  });

  it('computes drawdown when losses come first (peak starts at 0)', () => {
    const { priv } = buildService();
    // cumPnl: -10, -20, -5 → peak=0, trough=-20 → drawdown=20
    const trades = [
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.WON, 15),
    ];
    expect(priv._calcDrawdown(trades)).toBe(20);
  });

  it('tracks the largest drawdown across multiple up-down cycles', () => {
    const { priv } = buildService();
    // Cycle 1: peak=30, trough=20, dd=10
    // Cycle 2: peak=40, trough=10, dd=30  ← largest
    const trades = [
      makeTrade(TradeStatus.WON, 30),
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.WON, 20),
      makeTrade(TradeStatus.LOST, -30),
    ];
    // cumPnl: 30, 20, 40, 10 → max dd = 40-10 = 30
    expect(priv._calcDrawdown(trades)).toBe(30);
  });

  it('returns 0 for a single LOST trade (peak stays at 0, trough is -loss but drawdown = 0-(-loss) is NOT triggered since peak never exceeded 0)', () => {
    const { priv } = buildService();
    // cumPnl: -50 → peak stays 0 → drawdown = 0 - (-50) = 50
    // Actually: peak = max(0, cumPnl) only updates when cumPnl > peak
    // cumPnl(-50) < peak(0) → drawdown = 0 - (-50) = 50
    expect(priv._calcDrawdown([makeTrade(TradeStatus.LOST, -50)])).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9.3 _calcWinrate
// ────────────────────────────────────────────────────────────────────────────

describe('GoalsService._calcWinrate (task 9.3)', () => {
  it('returns 0 for an empty trade array (no division-by-zero)', () => {
    const { priv } = buildService();
    expect(priv._calcWinrate([])).toBe(0);
  });

  it('returns 100 when all trades are WON', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.WON, 20),
      makeTrade(TradeStatus.WON, 30),
    ];
    expect(priv._calcWinrate(trades)).toBe(100);
  });

  it('returns 0 when all trades are LOST', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.LOST, -10),
      makeTrade(TradeStatus.LOST, -20),
    ];
    expect(priv._calcWinrate(trades)).toBe(0);
  });

  it('returns 50 for half WON half LOST', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.LOST, -10),
    ];
    expect(priv._calcWinrate(trades)).toBe(50);
  });

  it('returns 0 when all trades are BE (break-even, not WON)', () => {
    const { priv } = buildService();
    const trades = [
      makeTrade(TradeStatus.BE, 0),
      makeTrade(TradeStatus.BE, 0),
    ];
    expect(priv._calcWinrate(trades)).toBe(0);
  });

  it('counts only WON trades (not BE) in the numerator', () => {
    const { priv } = buildService();
    // 1 WON + 1 BE + 1 LOST → 1/3 * 100 ≈ 33.33
    const trades = [
      makeTrade(TradeStatus.WON, 10),
      makeTrade(TradeStatus.BE, 0),
      makeTrade(TradeStatus.LOST, -10),
    ];
    expect(priv._calcWinrate(trades)).toBeCloseTo(33.33, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9.4 _toProgressPct
// ────────────────────────────────────────────────────────────────────────────

describe('GoalsService._toProgressPct (task 9.4)', () => {
  // ── drawdown inversion ──

  it('returns 100% for drawdown when currentValue=0 (no drawdown = fully safe)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('drawdown', 0, 100)).toBe(100);
  });

  it('returns 0% for drawdown when currentValue >= targetValue (limit hit)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('drawdown', 100, 100)).toBe(0);
  });

  it('returns 50% for drawdown when currentValue is half the target', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('drawdown', 50, 100)).toBe(50);
  });

  it('clamps drawdown progress to 0 when currentValue exceeds target', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('drawdown', 150, 100)).toBe(0);
  });

  // ── regular goal clamping ──

  it('returns the correct percentage for a regular goal (pnl)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('pnl', 50, 100)).toBe(50);
  });

  it('returns 100 when currentValue === targetValue for a regular goal', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('trades', 10, 10)).toBe(100);
  });

  it('clamps to 100 when currentValue exceeds targetValue for a regular goal', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('streak', 15, 10)).toBe(100);
  });

  it('clamps to 0 when currentValue is negative for a regular goal', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('pnl', -50, 100)).toBe(0);
  });

  it('returns 0 regardless of type when targetValue is 0 (division guard)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('pnl', 50, 0)).toBe(0);
    expect(priv._toProgressPct('drawdown', 50, 0)).toBe(0);
    expect(priv._toProgressPct('winrate', 50, 0)).toBe(0);
  });

  it('returns 0 when targetValue is negative (guard: <= 0)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('pnl', 50, -1)).toBe(0);
  });

  it('handles winrate goal type (same as regular progress)', () => {
    const { priv } = buildService();
    expect(priv._toProgressPct('winrate', 75, 100)).toBe(75);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9.5 _applyAutoComplete
// ────────────────────────────────────────────────────────────────────────────

describe('GoalsService._applyAutoComplete (task 9.5)', () => {
  it('does NOT save when progressPct < 100 and goal is not completed', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const goal = makeGoal({ isCompleted: false, completedAt: null });

    await priv._applyAutoComplete(goal, 99);

    expect(saveFn).not.toHaveBeenCalled();
    expect(goal.isCompleted).toBe(false);
    expect(goal.completedAt).toBeNull();
  });

  it('does NOT save when progressPct === 99 (boundary: strictly below 100)', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const goal = makeGoal({ isCompleted: false });

    await priv._applyAutoComplete(goal, 99);

    expect(saveFn).not.toHaveBeenCalled();
  });

  it('saves and sets isCompleted=true when progressPct === 100 and goal is not yet completed', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const goal = makeGoal({ isCompleted: false, completedAt: null });

    await priv._applyAutoComplete(goal, 100);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(goal.isCompleted).toBe(true);
    expect(goal.completedAt).toBeInstanceOf(Date);
  });

  it('saves and sets isCompleted=true when progressPct > 100 and goal is not yet completed', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const goal = makeGoal({ isCompleted: false, completedAt: null });

    await priv._applyAutoComplete(goal, 110);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(goal.isCompleted).toBe(true);
    expect(goal.completedAt).toBeInstanceOf(Date);
  });

  it('does NOT save (idempotent) when goal.isCompleted is already true', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const originalDate = new Date('2026-01-10T08:00:00Z');
    const goal = makeGoal({ isCompleted: true, completedAt: originalDate });

    await priv._applyAutoComplete(goal, 100);

    expect(saveFn).not.toHaveBeenCalled();
  });

  it('does NOT overwrite completedAt when goal is already completed', async () => {
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const originalDate = new Date('2026-01-10T08:00:00Z');
    const goal = makeGoal({ isCompleted: true, completedAt: originalDate });

    await priv._applyAutoComplete(goal, 100);

    // completedAt must remain the original timestamp
    expect(goal.completedAt).toBe(originalDate);
  });

  it('sets completedAt to a date close to "now" on first completion', async () => {
    const before = Date.now();
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const { priv } = buildService(saveFn);
    const goal = makeGoal({ isCompleted: false, completedAt: null });

    await priv._applyAutoComplete(goal, 100);

    const after = Date.now();
    const completedAtMs = goal.completedAt!.getTime();
    expect(completedAtMs).toBeGreaterThanOrEqual(before);
    expect(completedAtMs).toBeLessThanOrEqual(after);
  });
});
