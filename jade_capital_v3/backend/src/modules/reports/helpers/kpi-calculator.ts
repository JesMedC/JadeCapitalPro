import { Trade, TradeStatus } from '../../trades/entities/trade.entity';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface KpiData {
  winRate: number;       // 0..1
  netPnl: number;        // currency units
  roi: number;           // percentage: netPnl / totalInvested * 100
  profitFactor: number;  // grossWins / |grossLosses|; Infinity if no losses
  maxDrawdown: number;   // peak-to-trough drop in cumPnl (always <= 0)
}

export interface EquityPoint {
  date: string;    // ISO date string of the trade
  cumPnl: number;  // cumulative P&L at that point
}

// ── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Compute KPI summary from a set of closed trades.
 * Pure function — no I/O, no PDFKit dependency.
 */
export function computeKpis(trades: Trade[]): KpiData {
  const closed = trades.filter(
    (t) =>
      t.status === TradeStatus.WON ||
      t.status === TradeStatus.LOST ||
      t.status === TradeStatus.BE,
  );

  if (closed.length === 0) {
    return {
      winRate: 0,
      netPnl: 0,
      roi: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    };
  }

  const won = closed.filter((t) => t.status === TradeStatus.WON);
  const winRate = won.length / closed.length;

  const netPnl = closed.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
  const totalInvested = closed.reduce((sum, t) => sum + Number(t.amount), 0);
  const roi = totalInvested > 0 ? (netPnl / totalInvested) * 100 : 0;

  const grossWins = won.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
  const grossLosses = Math.abs(
    closed
      .filter((t) => t.status === TradeStatus.LOST)
      .reduce((sum, t) => sum + Number(t.pnl ?? 0), 0),
  );
  const profitFactor = grossLosses === 0 ? Infinity : grossWins / grossLosses;

  // Max drawdown: peak-to-trough on cumulative PnL sequence
  const curve = buildEquityCurve(closed);
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of curve) {
    if (point.cumPnl > peak) peak = point.cumPnl;
    const drawdown = point.cumPnl - peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    winRate: Math.round(winRate * 10000) / 10000,
    netPnl: Math.round(netPnl * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    profitFactor: profitFactor === Infinity ? Infinity : Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
  };
}

/**
 * Build cumulative equity curve from a set of closed trades.
 * Sorted by createdAt ascending. Pure function — no I/O.
 */
export function buildEquityCurve(trades: Trade[]): EquityPoint[] {
  const closed = trades
    .filter(
      (t) =>
        t.status === TradeStatus.WON ||
        t.status === TradeStatus.LOST ||
        t.status === TradeStatus.BE,
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let cumPnl = 0;
  return closed.map((t) => {
    cumPnl += Number(t.pnl ?? 0);
    return {
      date: new Date(t.createdAt).toISOString(),
      cumPnl: Math.round(cumPnl * 100) / 100,
    };
  });
}
