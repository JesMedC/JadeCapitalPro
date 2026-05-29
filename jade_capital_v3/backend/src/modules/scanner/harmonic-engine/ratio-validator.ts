import type { CandleTick, PivotPoint, PatternName, PatternDirection, RawCandidate } from './types';
import { HARMONIC_PATTERNS } from './patterns';

const PATTERN_NAMES = Object.keys(HARMONIC_PATTERNS) as PatternName[];

/**
 * Calculate Fibonacci ratio between two legs.
 * Ratio = |legB| / |legA|, where legA is the reference leg.
 */
function fibRatio(legA: number, legB: number): number {
  if (Math.abs(legA) < 1e-10) return 0;
  return Math.abs(legB) / Math.abs(legA);
}

function inRange(value: number, range: [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

/**
 * Validate XABCD Fibonacci ratios for all 5-consecutive-pivot combinations.
 *
 * For each pattern:
 * - AB ratio = |A-B| / |X-A|  (retracement of XA)
 * - BC ratio = |B-C| / |A-B|  (retracement of AB)
 * - CD ratio = |C-D| / |B-C|  (extension of BC)
 * - XD ratio = |X-D| / |X-A|  (retracement/extension of XA to D)
 *
 * Mandatory for filtering: AB and XD must pass.
 * BC and CD are scored but not mandatory for initial inclusion.
 *
 * Direction inference:
 * - If A > X (XA leg is bullish): bullish pattern → direction = 'CALL'
 * - If A < X (XA leg is bearish): bearish pattern → direction = 'PUT'
 */
export function validateRatios(
  pivots: PivotPoint[],
  candles: CandleTick[],
  atr: number,
  minSpan: number,
  minAmplitude: number,
): RawCandidate[] {
  const results: RawCandidate[] = [];

  // Need at least 5 pivots for one XABCD combo
  if (pivots.length < 5) return results;

  // Slide a window of 5 consecutive pivots
  for (let i = 0; i <= pivots.length - 5; i++) {
    const [X, A, B, C, D] = pivots.slice(i, i + 5);

    // Basic structural check: spans at least minSpan candles
    const spanCandles = D.index - X.index;
    if (spanCandles < minSpan) continue;

    // Amplitude check: XA leg must be meaningful vs price level
    const xaLeg = Math.abs(A.price - X.price);
    if (xaLeg < minAmplitude * X.price) continue;

    // Infer direction: XA bullish (A > X) → CALL, XA bearish (A < X) → PUT
    const direction: PatternDirection = A.price > X.price ? 'CALL' : 'PUT';

    // Calculate Fibonacci ratios
    const abLeg = Math.abs(B.price - A.price);
    const bcLeg = Math.abs(C.price - B.price);
    const cdLeg = Math.abs(D.price - C.price);
    const xdLeg = Math.abs(D.price - X.price);

    const ratioAB = fibRatio(xaLeg, abLeg);
    const ratioBC = fibRatio(abLeg, bcLeg);
    const ratioCD = fibRatio(bcLeg, cdLeg);
    const ratioXD = fibRatio(xaLeg, xdLeg);

    // Check against each pattern
    for (const patternName of PATTERN_NAMES) {
      const p = HARMONIC_PATTERNS[patternName];

      // Mandatory: AB and XD must pass
      if (!inRange(ratioAB, p.AB)) continue;
      if (!inRange(ratioXD, p.XD)) continue;

      // PRZ hit check: is the last close near D price?
      const lastClose = candles[candles.length - 1]?.close ?? D.price;
      const przHit = Math.abs(lastClose - D.price) <= atr;

      results.push({
        patternName,
        direction,
        instrument: candles[0]?.instrument ?? '',
        timeframe: candles[0]?.timeframe ?? '',
        score: 0, // computed in scorer
        xPrice: X.price, aPrice: A.price, bPrice: B.price,
        cPrice: C.price, dPrice: D.price,
        xTime: X.time, aTime: A.time, bTime: B.time,
        cTime: C.time, dTime: D.time,
        ratioAB, ratioBC, ratioCD, ratioXD,
        metadata: {
          points: { x: X.price, a: A.price, b: B.price, c: C.price, d: D.price },
          times:  { x: X.time,  a: A.time,  b: B.time,  c: C.time,  d: D.time },
          ratios: { AB: ratioAB, BC: ratioBC, CD: ratioCD, XD: ratioXD },
          przHit,
          atr,
        },
      });
    }
  }

  return results;
}
