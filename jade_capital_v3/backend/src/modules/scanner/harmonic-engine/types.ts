export type PatternName =
  | 'Gartley'
  | 'Bat'
  | 'Butterfly'
  | 'Crab'
  | 'Deep Crab'
  | 'Cypher'
  | 'Shark'
  | 'Allen'
  | 'ABCD';

export type PatternDirection = 'CALL' | 'PUT';

export interface CandleTick {
  instrument: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PivotPoint {
  index: number;
  kind: 'H' | 'L';
  price: number;
  time: number; // unix ms from CandleTick.timestamp
}

export interface PatternCandidate {
  patternName: PatternName;
  direction: PatternDirection;
  instrument: string;
  timeframe: string;
  score: number; // 0-100
  // XABCD prices
  xPrice: number;
  aPrice: number;
  bPrice: number;
  cPrice: number;
  dPrice: number;
  // XABCD times (unix ms)
  xTime: number;
  aTime: number;
  bTime: number;
  cTime: number;
  dTime: number;
  // Validated ratios
  ratioAB: number;
  ratioBC: number;
  ratioCD: number;
  ratioXD: number;
  // Derived trade levels
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  // Metadata blob (stored as JSONB)
  metadata: {
    points: { x: number; a: number; b: number; c: number; d: number };
    ratios: { AB: number; BC: number; CD: number; XD: number };
    przHit: boolean;
    atr: number;
  };
}

/** Partial candidate before trade levels are computed */
export type RawCandidate = Omit<
  PatternCandidate,
  'entryPrice' | 'stopLoss' | 'takeProfit1' | 'takeProfit2'
>;
