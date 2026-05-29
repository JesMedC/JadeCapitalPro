import { IsArray, ArrayMinSize, ArrayMaxSize, IsIn } from 'class-validator';
import { VALID_INSTRUMENTS } from './chart-preferences.dto';

// ── Watchlist DTOs ────────────────────────────────────────────────────────────

export class WatchlistUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsIn(VALID_INSTRUMENTS, { each: true })
  instruments!: string[];
}

export class WatchlistResponseDto {
  instruments!: string[];
}

// ── Market Data DTOs ──────────────────────────────────────────────────────────

export class PriceResponse {
  instrument!: string;
  bid!: number;
  ask!: number;
  spread!: number;
  timestamp!: number;
}

export class CandleResponse {
  instrument!: string;
  timeframe!: string;
  timestamp!: number;
  open!: number;
  high!: number;
  low!: number;
  close!: number;
  volume!: number;
}

export interface CandlesQuery {
  tf?: string;
  limit?: number;
}

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface EconomicEventResponse {
  timestamp: string;
  currency: string;
  event: string;
  impact: ImpactLevel;
  detail: string;
}

export interface InstrumentInfo {
  symbol: string;
  type: string;
  name: string;
  pipPrecision: number;
  minSpread: number;
}
