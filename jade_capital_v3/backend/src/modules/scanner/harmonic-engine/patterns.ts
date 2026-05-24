import type { PatternName } from './types';

export const TOL = 0.07;
export const SCORE_THRESHOLD = 82;

export const PATTERN_WIN_RATE: Record<PatternName, number> = {
  Gartley: 72,
  Bat: 70,
  Butterfly: 65,
  Crab: 68,
  'Deep Crab': 66,
  Cypher: 71,
  Shark: 67,
  Allen: 68,
  ABCD:  63,
};

/**
 * Fibonacci ratio ranges for each harmonic pattern.
 * AB and XD are the signature ratios — TOL applies to them.
 * BC and CD use raw literature ranges.
 */
export const HARMONIC_PATTERNS: Record<
  PatternName,
  { AB: [number, number]; BC: [number, number]; CD: [number, number]; XD: [number, number] }
> = {
  Gartley: {
    AB: [0.618 - TOL, 0.618 + TOL],
    BC: [0.382, 0.886],
    CD: [1.272, 1.618],
    XD: [0.786 - TOL, 0.786 + TOL],
  },
  Bat: {
    AB: [0.382, 0.500 + TOL],
    BC: [0.382, 0.886],
    CD: [1.618, 2.618],
    XD: [0.886 - TOL, 0.886 + TOL],
  },
  Butterfly: {
    AB: [0.786 - TOL, 0.786 + TOL],
    BC: [0.382, 0.886],
    CD: [1.618, 2.240],
    XD: [1.272, 1.618],
  },
  Crab: {
    AB: [0.382, 0.618],
    BC: [0.382, 0.886],
    CD: [2.618, 3.618],
    XD: [1.618 - TOL, 1.618 + TOL],
  },
  'Deep Crab': {
    AB: [0.886 - TOL, 0.886 + TOL],
    BC: [0.382, 0.886],
    CD: [2.000, 3.618],
    XD: [1.618 - TOL, 1.618 + TOL],
  },
  Cypher: {
    AB: [0.382, 0.618],
    BC: [1.272, 1.414 + TOL],
    CD: [0.382, 0.786 + TOL],
    XD: [0.786 - TOL, 0.786 + TOL],
  },
  Shark: {
    AB: [0.382, 0.618],
    BC: [1.130, 1.618 + TOL],
    CD: [0.886, 1.130 + TOL],
    XD: [0.886, 1.130 + TOL],
  },
  Allen: {
    AB: [0.716, 0.856],   // 0.786 ± TOL
    BC: [0.382, 0.886],
    CD: [1.128, 2.000],
    XD: [0.816, 0.956],   // 0.886 ± TOL
  },
  ABCD: {
    AB: [0.548, 0.688],   // 0.618 ± TOL
    BC: [0.548, 0.688],   // symmetry constraint (same as AB)
    CD: [1.272, 1.618],
    XD: [1.202, 1.688],   // 1.272–1.618 ± TOL
  },
};
