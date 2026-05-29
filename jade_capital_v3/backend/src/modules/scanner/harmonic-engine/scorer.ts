import type { RawCandidate, PatternCandidate } from './types';
import { HARMONIC_PATTERNS, PATTERN_WIN_RATE, SCORE_THRESHOLD } from './patterns';

/**
 * Score a raw candidate based on how close the ratios are to the ideal values.
 *
 * Scoring formula (100 pts max base):
 * - 25 pts per ratio × 4 ratios = 100 base pts
 *   Each ratio scores 25 if exactly at the ideal midpoint of the range,
 *   and scales down linearly to 0 at the range boundary.
 * - Bonus: +5 if PRZ hit (current close is within ±1 ATR from D price).
 * - Bonus: +PATTERN_WIN_RATE[pattern] × 0.1 (e.g., Gartley 72 × 0.1 = +7.2 pts).
 * - Cap at 100; filter to score >= SCORE_THRESHOLD (82).
 */
function scoreRatio(
  value: number,
  range: [number, number],
): number {
  const mid = (range[0] + range[1]) / 2;
  const halfWidth = (range[1] - range[0]) / 2;
  if (halfWidth === 0) return 25;

  // Distance from ideal midpoint, normalized
  const dist = Math.abs(value - mid) / halfWidth;
  // dist=0 → full 25pts; dist=1 (boundary) → 0pts
  return Math.max(0, 25 * (1 - dist));
}

/**
 * Derive trade levels for a confirmed pattern.
 *
 * CALL (bullish):
 *   entry     = D price
 *   stopLoss  = X price - 1 × ATR
 *   takeProfit1 = D + 0.382 × |XA leg|
 *   takeProfit2 = D + 0.618 × |XA leg|
 *
 * PUT (bearish):
 *   entry     = D price
 *   stopLoss  = X price + 1 × ATR
 *   takeProfit1 = D - 0.382 × |XA leg|
 *   takeProfit2 = D - 0.618 × |XA leg|
 */
function deriveTradeLevels(
  candidate: RawCandidate,
  atr: number,
): { entryPrice: number; stopLoss: number; takeProfit1: number; takeProfit2: number } {
  const { xPrice, aPrice, dPrice, direction } = candidate;
  const xaLeg = Math.abs(aPrice - xPrice);
  const entry = dPrice;

  if (direction === 'CALL') {
    return {
      entryPrice: entry,
      stopLoss: xPrice - atr,
      takeProfit1: entry + 0.382 * xaLeg,
      takeProfit2: entry + 0.618 * xaLeg,
    };
  } else {
    return {
      entryPrice: entry,
      stopLoss: xPrice + atr,
      takeProfit1: entry - 0.382 * xaLeg,
      takeProfit2: entry - 0.618 * xaLeg,
    };
  }
}

/**
 * Score and build trade levels for validated candidates.
 * Returns only candidates with score >= SCORE_THRESHOLD.
 */
export function scoreAndBuildLevels(
  rawCandidates: RawCandidate[],
  atr: number,
): PatternCandidate[] {
  const results: PatternCandidate[] = [];

  for (const raw of rawCandidates) {
    const p = HARMONIC_PATTERNS[raw.patternName];

    // Base score: 25 pts per ratio × 4 ratios
    const baseScore =
      scoreRatio(raw.ratioAB, p.AB) +
      scoreRatio(raw.ratioBC, p.BC) +
      scoreRatio(raw.ratioCD, p.CD) +
      scoreRatio(raw.ratioXD, p.XD);

    // PRZ proximity bonus
    const przBonus = raw.metadata.przHit ? 5 : 0;

    // Win-rate bonus
    const winRateBonus = PATTERN_WIN_RATE[raw.patternName] * 0.1;

    const score = Math.min(100, baseScore + przBonus + winRateBonus);

    if (score < SCORE_THRESHOLD) continue;

    const levels = deriveTradeLevels(raw, atr);

    results.push({
      ...raw,
      score,
      ...levels,
    });
  }

  return results;
}
