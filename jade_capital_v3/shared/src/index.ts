// ── Auth Types ─────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  roles: string[];
}

// ── Trading Types ──────────────────────────────────────────────────────────────

export interface TradingAccount {
  id: string;
  userId: string;
  name: string;
  marketType: 'binary' | 'forex';
  balance: number;
  currency: string;
  isDefault: boolean;
}

export interface TradeBinary {
  id: string;
  userId: string;
  accountId: string;
  instrument: string;
  direction: 'CALL' | 'PUT';
  investment: number;
  payoutPct: number;
  expiryTime: string;
  status: 'open' | 'win' | 'loss' | 'be';
  openDate: string;
  closeDate?: string;
  notes?: string;
}

export interface TradeForex {
  id: string;
  userId: string;
  accountId: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  lotSize: number;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  status: 'open' | 'closed' | 'cancelled';
  openDate: string;
  closeDate?: string;
  notes?: string;
}

export interface OpenTradeRequest {
  accountId: string;
  instrument: string;
  direction: string;
  investment: number;
  payoutPct?: number;
  expiryTime?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

// ── Market Data Types ───────────────────────────────────────────────────────────

export interface PriceTick {
  instrument: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number;
}

export interface Candle {
  time: number;
  instrument: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EconomicEvent {
  id: string;
  date: string;
  time: string;
  country: string;
  currency: string;
  impact: 'low' | 'medium' | 'high';
  title: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

// ── Journal & Goals ─────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  userId: string;
  accountId?: string;
  tradeId?: string;
  entryDate: string;
  title: string;
  content?: string;
  mood?: string;
  tags: string[];
  mistakes: string[];
  lessons: string[];
  aiSummary?: string;
}

export interface Goal {
  id: string;
  userId: string;
  accountId?: string;
  title: string;
  goalType: 'pnl' | 'winrate' | 'trades' | 'streak' | 'drawdown';
  targetValue: number;
  currentValue: number;
  progressPct: number;
  isCompleted: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

// ── Alerts & Signals ────────────────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  userId: string;
  instrument: string;
  condition: 'above' | 'below' | 'crosses';
  price: number;
  message?: string;
  isTriggered: boolean;
}

export interface SignalAlert {
  id: string;
  userId?: string;
  type: 'binary_scanner' | 'harmonic_pattern' | 'pre_alert' | 'entry' | 'result';
  instrument?: string;
  direction?: string;
  entryPrice?: number;
  score: number;
  patternName?: string;
  timeframe?: string;
  message?: string;
}

// ── Watchlist ───────────────────────────────────────────────────────────────────

/** A single watched instrument symbol, e.g. "EUR/USD". */
export type WatchlistEntry = string;

/** Request body for PUT /api/market-data/watchlist */
export interface WatchlistUpdateRequest {
  instruments: WatchlistEntry[];
}

/** Response for GET/PUT /api/market-data/watchlist */
export interface WatchlistResponse {
  instruments: WatchlistEntry[];
}

// ── Backtest Types ──────────────────────────────────────────────────────────────

export interface BacktestConfig {
  instrument: string;   // e.g. "EUR/USD" — must be a key in INSTRUMENT_CATALOG
  timeframe: string;    // e.g. "5m" | "15m" | "1h" — must be in TIMEFRAMES
  strategy: string;     // "candle-direction" for MVP
  lastNCandles: number; // 10–250 inclusive
}

export interface BacktestTrade {
  index: number;              // sequential 0-based
  direction: 'CALL' | 'PUT';
  entryCandle: number;        // candle array index (1-based, since i=0 has no prior)
  result: 'win' | 'loss';
  pnl: number;                // price delta in instrument units; positive for win
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winrate: number;       // 0.0–100.0, rounded to 2dp
  profitFactor: number;  // sumWinPnl / abs(sumLossPnl); Infinity if no losses; 0 if no wins
  maxDrawdown: number;   // max peak-to-trough equity drop
  equityCurve: number[]; // cumulative pnl after each trade; length === totalTrades
}

// ── WebSocket Events ────────────────────────────────────────────────────────────

export type WsClientEvent = 
  | 'subscribe:price'
  | 'subscribe:candles'
  | 'subscribe:prices'
  | 'unsubscribe';

export type WsServerEvent =
  | 'priceUpdate'
  | 'candleUpdate'
  | 'economicEvent'
  | 'tradeOpened'
  | 'tradeClosed'
  | 'alertTriggered'
  | 'subscribed'
  | 'error';

export interface WsTradeUpdate {
  userId: string;
  accountId: string;
  tradeId: string;
  instrument: string;
  direction: string;
  investment: number;
  status: string;
  pnl?: number;
}

export interface WsAlertUpdate {
  userId: string;
  type: string;
  instrument: string;
  direction: string;
  score: number;
  message: string;
  timestamp: number;
}
