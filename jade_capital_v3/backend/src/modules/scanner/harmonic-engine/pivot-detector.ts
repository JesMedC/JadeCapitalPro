import type { CandleTick, PivotPoint } from './types';

/**
 * Calculate Average True Range over the given period.
 * Exported for unit testing.
 */
export function _calculateATR(candles: CandleTick[], period = 14): number {
  if (candles.length < 2) return 0;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }

  const window = trs.slice(-period);
  if (window.length === 0) return 0;
  return window.reduce((s, v) => s + v, 0) / window.length;
}

/**
 * Detect local swing pivot highs and lows from a candle array.
 *
 * Algorithm:
 * 1. For each candle i, check if it is a local high or low within `pivotW` bars.
 * 2. A local high: candle[i].high is strictly greater than all neighboring highs within the window.
 * 3. A local low: candle[i].low is strictly less than all neighboring lows within the window.
 * 4. Compress consecutive same-kind pivots: keep only the most extreme
 *    (highest H, lowest L) when adjacent same-kind pivots occur.
 * 5. Return an alternating H/L sequence.
 */
export function detectPivots(candles: CandleTick[], pivotW: number): PivotPoint[] {
  if (candles.length < pivotW * 2 + 1) return [];

  const rawPivots: PivotPoint[] = [];

  for (let i = pivotW; i < candles.length - pivotW; i++) {
    const c = candles[i];

    let isHigh = true;
    let isLow = true;

    for (let j = i - pivotW; j <= i + pivotW; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }

    if (isHigh) {
      rawPivots.push({ index: i, kind: 'H', price: c.high, time: c.timestamp });
    } else if (isLow) {
      rawPivots.push({ index: i, kind: 'L', price: c.low, time: c.timestamp });
    }
  }

  if (rawPivots.length === 0) return [];

  // Compress consecutive same-kind pivots
  const compressed: PivotPoint[] = [rawPivots[0]];

  for (let i = 1; i < rawPivots.length; i++) {
    const prev = compressed[compressed.length - 1];
    const curr = rawPivots[i];

    if (curr.kind === prev.kind) {
      // Same kind — keep the more extreme one
      if (curr.kind === 'H' && curr.price > prev.price) {
        compressed[compressed.length - 1] = curr;
      } else if (curr.kind === 'L' && curr.price < prev.price) {
        compressed[compressed.length - 1] = curr;
      }
    } else {
      compressed.push(curr);
    }
  }

  return compressed;
}
