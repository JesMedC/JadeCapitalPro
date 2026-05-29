import 'reflect-metadata';
import { computeKpis, buildEquityCurve } from './kpi-calculator';
import { Trade, TradeStatus, TradeType, TradeDirection } from '../../trades/entities/trade.entity';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    userId: 'user-1',
    accountId: 'account-1',
    type: TradeType.BINARY,
    instrument: 'EUR/USD',
    direction: TradeDirection.CALL,
    entryPrice: 1.1 as unknown as number,
    exitPrice: null,
    amount: 100 as unknown as number,
    pnl: null,
    payoutPct: 80 as unknown as number,
    expiryTime: '5m',
    stopLoss: null,
    takeProfit: null,
    status: TradeStatus.WON,
    notes: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    user: null as never,
    account: null as never,
    ...overrides,
  };
}

// ── computeKpis ──────────────────────────────────────────────────────────────

describe('computeKpis', () => {
  it('returns zeroed KPIs for an empty trade set', () => {
    const result = computeKpis([]);
    expect(result).toEqual({
      winRate: 0,
      netPnl: 0,
      roi: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    });
  });

  it('computes KPIs for all-wins', () => {
    const trades = [
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.winRate).toBe(1);
    expect(kpis.netPnl).toBe(160);
    expect(kpis.roi).toBeCloseTo(80);
    expect(kpis.profitFactor).toBe(Infinity);
    expect(kpis.maxDrawdown).toBe(0);
  });

  it('computes KPIs for all-losses', () => {
    const trades = [
      makeTrade({ pnl: -100 as unknown as number, status: TradeStatus.LOST, amount: 100 as unknown as number }),
      makeTrade({ pnl: -100 as unknown as number, status: TradeStatus.LOST, amount: 100 as unknown as number }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.winRate).toBe(0);
    expect(kpis.netPnl).toBe(-200);
    expect(kpis.roi).toBeCloseTo(-100);
    expect(kpis.profitFactor).toBe(0);
    expect(kpis.maxDrawdown).toBeLessThan(0);
  });

  it('computes KPIs for mixed win/loss trades', () => {
    const trades = [
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
      makeTrade({ pnl: -100 as unknown as number, status: TradeStatus.LOST, amount: 100 as unknown as number }),
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.winRate).toBeCloseTo(0.6667, 3);
    expect(kpis.netPnl).toBe(60);
    expect(kpis.profitFactor).toBe(1.6); // 160 / 100
  });

  it('handles single trade', () => {
    const trades = [
      makeTrade({ pnl: 50 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.winRate).toBe(1);
    expect(kpis.netPnl).toBe(50);
    expect(kpis.maxDrawdown).toBe(0);
  });

  it('filters out OPEN and CANCELLED trades', () => {
    const trades = [
      makeTrade({ pnl: null, status: TradeStatus.OPEN, amount: 100 as unknown as number }),
      makeTrade({ pnl: null, status: TradeStatus.CANCELLED, amount: 100 as unknown as number }),
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.winRate).toBe(1);
    expect(kpis.netPnl).toBe(80);
  });

  it('computes max drawdown correctly with a peak-to-trough scenario', () => {
    // cumPnl after trade 1 (won +100) = 100, peak = 100
    // cumPnl after trade 2 (lost -150) = -50, drawdown = -50 - 100 = -150
    const trades = [
      makeTrade({ pnl: 100 as unknown as number, status: TradeStatus.WON, amount: 200 as unknown as number, createdAt: new Date('2026-01-01') }),
      makeTrade({ pnl: -150 as unknown as number, status: TradeStatus.LOST, amount: 200 as unknown as number, createdAt: new Date('2026-01-02') }),
    ];
    const kpis = computeKpis(trades);
    expect(kpis.maxDrawdown).toBe(-150);
  });

  it('returns Infinity for profitFactor when there are no losses', () => {
    const trades = [
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, amount: 100 as unknown as number }),
    ];
    expect(computeKpis(trades).profitFactor).toBe(Infinity);
  });
});

// ── buildEquityCurve ─────────────────────────────────────────────────────────

describe('buildEquityCurve', () => {
  it('returns empty array for empty input', () => {
    expect(buildEquityCurve([])).toEqual([]);
  });

  it('returns sorted cumulative P&L points', () => {
    const trades = [
      makeTrade({ pnl: 50 as unknown as number, status: TradeStatus.WON, createdAt: new Date('2026-01-02') }),
      makeTrade({ pnl: -30 as unknown as number, status: TradeStatus.LOST, createdAt: new Date('2026-01-01') }),
    ];
    const curve = buildEquityCurve(trades);
    // Should be sorted: Jan 01 first
    expect(curve[0].cumPnl).toBe(-30);
    expect(curve[1].cumPnl).toBe(20);
  });

  it('filters out non-closed trades', () => {
    const trades = [
      makeTrade({ pnl: null, status: TradeStatus.OPEN }),
      makeTrade({ pnl: 80 as unknown as number, status: TradeStatus.WON, createdAt: new Date('2026-01-01') }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toHaveLength(1);
    expect(curve[0].cumPnl).toBe(80);
  });

  it('includes BE trades with 0 contribution', () => {
    const trades = [
      makeTrade({ pnl: 0 as unknown as number, status: TradeStatus.BE, createdAt: new Date('2026-01-01') }),
      makeTrade({ pnl: 50 as unknown as number, status: TradeStatus.WON, createdAt: new Date('2026-01-02') }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toHaveLength(2);
    expect(curve[0].cumPnl).toBe(0);
    expect(curve[1].cumPnl).toBe(50);
  });
});
