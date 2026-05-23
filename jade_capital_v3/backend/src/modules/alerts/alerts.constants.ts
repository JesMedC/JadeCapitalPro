/**
 * Alerts module constants.
 *
 * SUPPORTED_INSTRUMENTS must match the keys in INSTRUMENT_CATALOG from
 * market-data.service.ts — any symbol added there should be added here too.
 */

export const SUPPORTED_INSTRUMENTS = [
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

export type SupportedInstrument = (typeof SUPPORTED_INSTRUMENTS)[number];
