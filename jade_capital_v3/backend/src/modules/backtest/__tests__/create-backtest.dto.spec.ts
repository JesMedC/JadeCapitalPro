/**
 * Unit tests for CreateBacktestDto and BacktestConfigDto validation.
 *
 * Strategy: use class-validator's `validate()` directly — no NestJS app needed.
 * Each test instantiates the DTO with Object.assign and asserts the number
 * and path of validation errors, following the journal DTO test pattern.
 *
 * Covers:
 * - Valid payload passes with 0 errors
 * - lastNCandles < 10 → rejected
 * - lastNCandles > 250 → rejected
 * - lastNCandles = 10 → accepted (boundary)
 * - lastNCandles = 250 → accepted (boundary)
 * - Unknown instrument → rejected
 * - Unknown timeframe → rejected
 * - Unknown strategy → rejected
 * - name empty → rejected
 * - name > 100 chars → rejected
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBacktestDto } from '../dto/create-backtest.dto';

// ── Helpers ────────────────────────────────────────────────────────────────

function validPayload(): object {
  return {
    name: 'My test backtest',
    config: {
      instrument: 'EUR/USD',
      timeframe: '15m',
      strategy: 'candle-direction',
      lastNCandles: 100,
    },
  };
}

async function validateDto(payload: object): Promise<ReturnType<typeof validate>> {
  const dto = plainToInstance(CreateBacktestDto, payload);
  return validate(dto, { whitelist: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CreateBacktestDto', () => {
  // ── Valid payload ─────────────────────────────────────────────────────────

  it('passes validation with a valid payload', async () => {
    const errors = await validateDto(validPayload());
    expect(errors.length).toBe(0);
  });

  // ── lastNCandles ──────────────────────────────────────────────────────────

  describe('config.lastNCandles', () => {
    it('rejects lastNCandles = 9 (below minimum 10)', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, lastNCandles: 9 } };
      const errors = await validateDto(payload);
      const configErrors = errors.find((e) => e.property === 'config');
      const nestedErrors = configErrors?.children ?? [];
      const candlesError = nestedErrors.find((c) => c.property === 'lastNCandles');
      expect(candlesError).toBeDefined();
    });

    it('rejects lastNCandles = 251 (above maximum 250)', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, lastNCandles: 251 } };
      const errors = await validateDto(payload);
      const configErrors = errors.find((e) => e.property === 'config');
      const nestedErrors = configErrors?.children ?? [];
      const candlesError = nestedErrors.find((c) => c.property === 'lastNCandles');
      expect(candlesError).toBeDefined();
    });

    it('accepts lastNCandles = 10 (lower boundary)', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, lastNCandles: 10 } };
      const errors = await validateDto(payload);
      expect(errors.length).toBe(0);
    });

    it('accepts lastNCandles = 250 (upper boundary)', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, lastNCandles: 250 } };
      const errors = await validateDto(payload);
      expect(errors.length).toBe(0);
    });
  });

  // ── instrument ────────────────────────────────────────────────────────────

  describe('config.instrument', () => {
    it('rejects an unknown instrument', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, instrument: 'XYZ/ABC' } };
      const errors = await validateDto(payload);
      const configErrors = errors.find((e) => e.property === 'config');
      const nestedErrors = configErrors?.children ?? [];
      const instrError = nestedErrors.find((c) => c.property === 'instrument');
      expect(instrError).toBeDefined();
    });
  });

  // ── timeframe ─────────────────────────────────────────────────────────────

  describe('config.timeframe', () => {
    it('rejects an unknown timeframe', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, timeframe: '2h' } };
      const errors = await validateDto(payload);
      const configErrors = errors.find((e) => e.property === 'config');
      const nestedErrors = configErrors?.children ?? [];
      const tfError = nestedErrors.find((c) => c.property === 'timeframe');
      expect(tfError).toBeDefined();
    });
  });

  // ── strategy ──────────────────────────────────────────────────────────────

  describe('config.strategy', () => {
    it('rejects an unknown strategy', async () => {
      const payload = { ...validPayload(), config: { ...(validPayload() as any).config, strategy: 'bollinger-bands' } };
      const errors = await validateDto(payload);
      const configErrors = errors.find((e) => e.property === 'config');
      const nestedErrors = configErrors?.children ?? [];
      const stratError = nestedErrors.find((c) => c.property === 'strategy');
      expect(stratError).toBeDefined();
    });
  });

  // ── name ──────────────────────────────────────────────────────────────────

  describe('name', () => {
    it('rejects an empty name', async () => {
      const payload = { ...validPayload(), name: '' };
      const errors = await validateDto(payload);
      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError).toBeDefined();
    });

    it('rejects a name longer than 100 characters', async () => {
      const payload = { ...validPayload(), name: 'x'.repeat(101) };
      const errors = await validateDto(payload);
      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError).toBeDefined();
    });

    it('accepts a name at exactly 100 characters', async () => {
      const payload = { ...validPayload(), name: 'x'.repeat(100) };
      const errors = await validateDto(payload);
      expect(errors.length).toBe(0);
    });
  });
});
