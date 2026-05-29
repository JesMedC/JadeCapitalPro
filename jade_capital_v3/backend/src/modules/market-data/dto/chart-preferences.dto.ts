import { IsIn } from 'class-validator';

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

export type ValidInstrument = (typeof VALID_INSTRUMENTS)[number];
export type ValidTimeframe = (typeof VALID_TIMEFRAMES)[number];

export class UpdateChartPrefsDto {
  @IsIn(VALID_INSTRUMENTS)
  instrument!: string;

  @IsIn(VALID_TIMEFRAMES)
  timeframe!: string;
}

export class ChartPrefsResponseDto {
  instrument!: string;
  timeframe!: string;
}
