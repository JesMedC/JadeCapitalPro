import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const VALID_INSTRUMENTS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'NZD/USD',
  'USD/CHF',
  'BTC/USD',
] as const;

export const VALID_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

export const VALID_STRATEGIES = ['candle-direction'] as const;

export class BacktestConfigDto {
  @IsString()
  @IsIn(VALID_INSTRUMENTS)
  instrument!: string;

  @IsString()
  @IsIn(VALID_TIMEFRAMES)
  timeframe!: string;

  @IsString()
  @IsIn(VALID_STRATEGIES)
  strategy!: string;

  @IsInt()
  @Min(10)
  @Max(250)
  lastNCandles!: number;
}

export class CreateBacktestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ValidateNested()
  @Type(() => BacktestConfigDto)
  config!: BacktestConfigDto;
}
