/**
 * Response-shaping DTOs for backtest results.
 * These mirror the shared BacktestTrade / BacktestResult interfaces
 * and are exported for typed controller response annotations.
 * No runtime serialization logic here — the processor persists results
 * as JSONB directly.
 */

export class BacktestTradeDto {
  index!: number;
  direction!: 'CALL' | 'PUT';
  entryCandle!: number;
  result!: 'win' | 'loss';
  pnl!: number;
}

export class BacktestResultDto {
  trades!: BacktestTradeDto[];
  totalTrades!: number;
  wins!: number;
  losses!: number;
  /** 0.0–100.0, rounded to 2dp */
  winrate!: number;
  /**
   * sumWinPnl / abs(sumLossPnl).
   * Sentinel value 9999 means Infinity (no losses).
   * Value 0 means no wins.
   * Note: Infinity is not valid JSON; sentinel 9999 displayed as "∞" by Flutter.
   */
  profitFactor!: number;
  maxDrawdown!: number;
  equityCurve!: number[];
}
