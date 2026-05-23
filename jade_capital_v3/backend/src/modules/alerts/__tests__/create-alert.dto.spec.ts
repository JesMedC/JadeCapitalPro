/**
 * Task 1.6 — Unit tests for CreateAlertDto validation.
 *
 * Covers:
 * - Valid payload passes without errors
 * - Missing name → ValidationError
 * - Invalid condition enum → ValidationError
 * - Negative targetPrice → ValidationError
 * - Unsupported instrument → ValidationError
 * - DTO does not declare userId, id, or createdAt (injection guard)
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAlertDto } from '../dto/create-alert.dto';
import { AlertCondition } from '../entities/alert.entity';

// ── Helpers ────────────────────────────────────────────────────────────────

function buildValid(overrides: Record<string, unknown> = {}): CreateAlertDto {
  return plainToInstance(CreateAlertDto, {
    name: 'My EUR/USD alert',
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1000,
    ...overrides,
  });
}

// ── Valid cases ────────────────────────────────────────────────────────────

describe('CreateAlertDto', () => {
  it('accepts a fully valid payload', async () => {
    const dto = buildValid();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts each valid AlertCondition value', async () => {
    for (const condition of Object.values(AlertCondition)) {
      const dto = buildValid({ condition });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts all supported instruments', async () => {
    const { SUPPORTED_INSTRUMENTS } = await import('../alerts.constants');
    for (const instrument of SUPPORTED_INSTRUMENTS) {
      const dto = buildValid({ instrument });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts a targetPrice exactly at the minimum (0.0001)', async () => {
    const dto = buildValid({ targetPrice: 0.0001 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // ── Missing / invalid name ────────────────────────────────────────────────

  it('rejects a payload with a missing name', async () => {
    const dto = plainToInstance(CreateAlertDto, {
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1,
    });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
  });

  it('rejects an empty string name', async () => {
    const dto = buildValid({ name: '' });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
  });

  it('rejects a name that exceeds 100 characters', async () => {
    const dto = buildValid({ name: 'a'.repeat(101) });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
  });

  // ── Invalid condition ─────────────────────────────────────────────────────

  it('rejects an invalid condition value ("greater_than")', async () => {
    const dto = buildValid({ condition: 'greater_than' });
    const errors = await validate(dto);
    const conditionErrors = errors.filter((e) => e.property === 'condition');
    expect(conditionErrors.length).toBeGreaterThan(0);
  });

  it('rejects the legacy "crosses" condition (not in enum)', async () => {
    const dto = buildValid({ condition: 'crosses' });
    const errors = await validate(dto);
    const conditionErrors = errors.filter((e) => e.property === 'condition');
    expect(conditionErrors.length).toBeGreaterThan(0);
  });

  // ── Invalid targetPrice ───────────────────────────────────────────────────

  it('rejects a negative targetPrice', async () => {
    const dto = buildValid({ targetPrice: -1 });
    const errors = await validate(dto);
    const priceErrors = errors.filter((e) => e.property === 'targetPrice');
    expect(priceErrors.length).toBeGreaterThan(0);
  });

  it('rejects targetPrice of 0', async () => {
    const dto = buildValid({ targetPrice: 0 });
    const errors = await validate(dto);
    const priceErrors = errors.filter((e) => e.property === 'targetPrice');
    expect(priceErrors.length).toBeGreaterThan(0);
  });

  it('rejects targetPrice below minimum (0.00005)', async () => {
    const dto = buildValid({ targetPrice: 0.00005 });
    const errors = await validate(dto);
    const priceErrors = errors.filter((e) => e.property === 'targetPrice');
    expect(priceErrors.length).toBeGreaterThan(0);
  });

  // ── Unsupported instrument ────────────────────────────────────────────────

  it('rejects an unsupported instrument ("XAU/USD")', async () => {
    const dto = buildValid({ instrument: 'XAU/USD' });
    const errors = await validate(dto);
    const instErrors = errors.filter((e) => e.property === 'instrument');
    expect(instErrors.length).toBeGreaterThan(0);
  });

  it('rejects an empty instrument string', async () => {
    const dto = buildValid({ instrument: '' });
    const errors = await validate(dto);
    const instErrors = errors.filter((e) => e.property === 'instrument');
    expect(instErrors.length).toBeGreaterThan(0);
  });

  // ── Injection guard ───────────────────────────────────────────────────────

  it('DTO class does not declare a userId property', () => {
    const dto = new CreateAlertDto();
    expect(Object.keys(dto)).not.toContain('userId');
  });

  it('DTO class does not declare an id property', () => {
    const dto = new CreateAlertDto();
    expect(Object.keys(dto)).not.toContain('id');
  });

  it('DTO class does not declare a createdAt property', () => {
    const dto = new CreateAlertDto();
    expect(Object.keys(dto)).not.toContain('createdAt');
  });
});
