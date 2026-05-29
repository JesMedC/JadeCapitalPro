import type { CandleTick, PatternCandidate } from './types';
import { _calculateATR, detectPivots } from './pivot-detector';
import { validateRatios } from './ratio-validator';
import { scoreAndBuildLevels } from './scorer';

// Re-exports for consumers
export { TOL, SCORE_THRESHOLD, HARMONIC_PATTERNS, PATTERN_WIN_RATE } from './patterns';
export type {
  CandleTick,
  PivotPoint,
  PatternCandidate,
  PatternName,
  PatternDirection,
  RawCandidate,
} from './types';

/**
 * Per-timeframe configuration for the harmonic engine.
 * - minCandles: minimum candles required to run the engine
 * - pivotW: pivot detection window (half-width in candles)
 * - minSpan: minimum candle span between X and D (structural requirement)
 * - minAmplitude: minimum price amplitude as fraction of X price
 */
export const TIMEFRAME_CONFIG: Record<
  string,
  { minCandles: number; pivotW: number; minSpan: number; minAmplitude: number }
> = {
  '1m':  { minCandles: 500, pivotW: 5, minSpan: 50,  minAmplitude: 0.0008 },
  '5m':  { minCandles: 200, pivotW: 8, minSpan: 40,  minAmplitude: 0.0012 },
  '15m': { minCandles: 140, pivotW: 7, minSpan: 30,  minAmplitude: 0.0020 },
  '30m': { minCandles: 100, pivotW: 6, minSpan: 25,  minAmplitude: 0.0025 },
  '1h':  { minCandles: 100, pivotW: 6, minSpan: 20,  minAmplitude: 0.0040 },
  '4h':  { minCandles:  75, pivotW: 5, minSpan: 15,  minAmplitude: 0.0080 },
  '1d':  { minCandles:  50, pivotW: 4, minSpan: 10,  minAmplitude: 0.0120 },
};

/**
 * Top-level harmonic engine orchestrator.
 *
 * Pipeline: ATR → detectPivots → validateRatios → scoreAndBuildLevels
 *
 * Returns [] if:
 * - timeframe is not in TIMEFRAME_CONFIG
 * - candles.length < minCandles for the timeframe
 * - no patterns meet the score threshold (>= 82)
 */
export function runHarmonicEngine(
  candles: CandleTick[],
  instrument: string,
  timeframe: string,
): PatternCandidate[] {
  const config = TIMEFRAME_CONFIG[timeframe];
  if (!config) return [];
  if (candles.length < config.minCandles) return [];

  // Ensure candles are sorted oldest → newest
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

  const atr = _calculateATR(sorted);
  if (atr === 0) return [];

  const pivots = detectPivots(sorted, config.pivotW);
  if (pivots.length < 5) return [];

  const rawCandidates = validateRatios(
    pivots,
    sorted,
    atr,
    config.minSpan,
    config.minAmplitude,
  );

  if (rawCandidates.length === 0) return [];

  const scored = scoreAndBuildLevels(rawCandidates, atr);

  // Stamp instrument + timeframe (may have been populated by validateRatios but ensure it)
  return scored.map((c) => ({ ...c, instrument, timeframe }));
}
