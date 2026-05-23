/**
 * Task 2.11 — Unit tests for AlertEvaluatorService.
 *
 * Strategy: instantiate AlertEvaluatorService with mocked dependencies
 * (alertRepository, TradingGateway, ConfigService). No DB, no real Redis.
 * Private methods are accessed via TypeScript casting for white-box testing.
 *
 * Covers:
 * a) _matches() — all four conditions with boundary values
 * b) First tick with no previous price: CROSSES_ABOVE → no trigger
 * c) One-shot: after _fireAlert(), alert is absent from cache
 * d) Multi-user isolation: two alerts same instrument, different userId —
 *    broadcastAlert called with correct userId for each
 */

import 'reflect-metadata';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AlertEvaluatorService } from '../alert-evaluator.service';
import { Alert, AlertCondition, AlertStatus, AlertType } from '../entities/alert.entity';
import { TradingGateway } from '../../../websockets/trading.gateway';

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: crypto.randomUUID(),
    userId: USER_A,
    name: 'Test alert',
    type: AlertType.PRICE,
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1000 as unknown as number,
    status: AlertStatus.ACTIVE,
    triggeredAt: null,
    createdAt: new Date('2026-05-23T00:00:00Z'),
    user: null as never,
    ...overrides,
  };
}

/** Build AlertEvaluatorService with all deps mocked. */
function buildService() {
  const mockAlertRepository = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<Alert>;

  const mockTradingGateway = {
    broadcastAlert: jest.fn(),
  } as unknown as TradingGateway;

  const mockConfigService = {
    get: jest.fn((key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;

  const service = new AlertEvaluatorService(
    mockAlertRepository,
    mockTradingGateway,
    mockConfigService,
  );

  // Expose private API for white-box testing
  const priv = service as unknown as {
    _cache: Map<string, Alert[]>;
    _prev: Map<string, number>;
    _matches(alert: Alert, current: number, prev: number | undefined): boolean;
    _fireAlert(alert: Alert, currentPrice: number): Promise<void>;
    _evaluateTick(instrument: string, currentPrice: number): Promise<void>;
  };

  return { service, priv, mockAlertRepository, mockTradingGateway };
}

// ────────────────────────────────────────────────────────────────────────────
// a) _matches() — all four conditions
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService._matches (task 2.11a)', () => {
  const { priv } = buildService();

  // ── ABOVE ──

  it('ABOVE: returns true when current >= targetPrice', () => {
    const alert = makeAlert({ condition: AlertCondition.ABOVE, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.1000, undefined)).toBe(true);
    expect(priv._matches(alert, 1.1001, undefined)).toBe(true);
  });

  it('ABOVE: returns false when current < targetPrice', () => {
    const alert = makeAlert({ condition: AlertCondition.ABOVE, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.0999, undefined)).toBe(false);
  });

  // ── BELOW ──

  it('BELOW: returns true when current <= targetPrice', () => {
    const alert = makeAlert({ condition: AlertCondition.BELOW, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.1000, undefined)).toBe(true);
    expect(priv._matches(alert, 1.0999, undefined)).toBe(true);
  });

  it('BELOW: returns false when current > targetPrice', () => {
    const alert = makeAlert({ condition: AlertCondition.BELOW, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.1001, undefined)).toBe(false);
  });

  // ── CROSSES_ABOVE ──

  it('CROSSES_ABOVE: returns true when prev < target and current >= target', () => {
    const alert = makeAlert({ condition: AlertCondition.CROSSES_ABOVE, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.1001, 1.0999)).toBe(true);
    expect(priv._matches(alert, 1.1000, 1.0999)).toBe(true);
  });

  it('CROSSES_ABOVE: returns false when prev >= target (did not cross)', () => {
    const alert = makeAlert({ condition: AlertCondition.CROSSES_ABOVE, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.1001, 1.1000)).toBe(false);
    expect(priv._matches(alert, 1.1001, 1.1005)).toBe(false);
  });

  it('CROSSES_ABOVE: returns false when current < target (has not reached)', () => {
    const alert = makeAlert({ condition: AlertCondition.CROSSES_ABOVE, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.0990, 1.0980)).toBe(false);
  });

  // ── CROSSES_BELOW ──

  it('CROSSES_BELOW: returns true when prev > target and current <= target', () => {
    const alert = makeAlert({ condition: AlertCondition.CROSSES_BELOW, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.0999, 1.1001)).toBe(true);
    expect(priv._matches(alert, 1.1000, 1.1001)).toBe(true);
  });

  it('CROSSES_BELOW: returns false when prev <= target (did not cross from above)', () => {
    const alert = makeAlert({ condition: AlertCondition.CROSSES_BELOW, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.0999, 1.1000)).toBe(false);
    expect(priv._matches(alert, 1.0999, 1.0998)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// b) First tick — no previous price — CROSSES_ABOVE must NOT trigger
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService first-tick crossover guard (task 2.11b)', () => {
  it('CROSSES_ABOVE does not trigger on the first tick (prev=undefined)', () => {
    const { priv } = buildService();
    const alert = makeAlert({ condition: AlertCondition.CROSSES_ABOVE, targetPrice: 1.1000 as never });
    // prev is undefined on first tick
    expect(priv._matches(alert, 1.1001, undefined)).toBe(false);
  });

  it('CROSSES_BELOW does not trigger on the first tick (prev=undefined)', () => {
    const { priv } = buildService();
    const alert = makeAlert({ condition: AlertCondition.CROSSES_BELOW, targetPrice: 1.1000 as never });
    expect(priv._matches(alert, 1.0999, undefined)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// c) One-shot: alert is removed from cache after _fireAlert()
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService one-shot behaviour (task 2.11c)', () => {
  it('removes the alert from _cache immediately after _fireAlert()', async () => {
    const { priv, mockAlertRepository } = buildService();
    (mockAlertRepository.save as jest.Mock).mockResolvedValue(undefined);

    const alert = makeAlert({ instrument: 'EUR/USD' });
    priv._cache.set('EUR/USD', [alert]);

    await priv._fireAlert(alert, 1.1001);

    const bucket = priv._cache.get('EUR/USD') ?? [];
    expect(bucket).not.toContain(alert);
    expect(bucket).toHaveLength(0);
  });

  it('does NOT remove other alerts from the same instrument bucket', async () => {
    const { priv, mockAlertRepository } = buildService();
    (mockAlertRepository.save as jest.Mock).mockResolvedValue(undefined);

    const alertA = makeAlert({ id: 'aaa', instrument: 'EUR/USD' });
    const alertB = makeAlert({ id: 'bbb', instrument: 'EUR/USD' });
    priv._cache.set('EUR/USD', [alertA, alertB]);

    await priv._fireAlert(alertA, 1.1001);

    const bucket = priv._cache.get('EUR/USD') ?? [];
    expect(bucket).not.toContain(alertA);
    expect(bucket).toContain(alertB);
    expect(bucket).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// d) Multi-user isolation: broadcastAlert called with correct userId
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService multi-user isolation (task 2.11d)', () => {
  it('broadcasts to the correct userId for each alert on the same instrument', async () => {
    const { priv, mockAlertRepository, mockTradingGateway } = buildService();
    (mockAlertRepository.save as jest.Mock).mockResolvedValue(undefined);

    const alertForA = makeAlert({
      id: 'alert-a',
      userId: USER_A,
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1000 as never,
    });
    const alertForB = makeAlert({
      id: 'alert-b',
      userId: USER_B,
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1000 as never,
    });

    priv._cache.set('EUR/USD', [alertForA, alertForB]);
    // prev set below target so ABOVE fires on current >= target
    priv._prev.set('EUR/USD', 1.0990);

    // Tick at 1.1005 — both alerts should fire
    await priv._evaluateTick('EUR/USD', 1.1005);

    const calls = (mockTradingGateway.broadcastAlert as jest.Mock).mock.calls;

    // Each user should receive exactly one broadcast
    const userIds = calls.map(([uid]: [string]) => uid);
    expect(userIds).toContain(USER_A);
    expect(userIds).toContain(USER_B);

    // Verify USER_A never receives USER_B's payload and vice-versa
    const callForA = calls.find(([uid]: [string]) => uid === USER_A);
    const callForB = calls.find(([uid]: [string]) => uid === USER_B);

    expect(callForA[1]).toMatchObject({ alertId: 'alert-a' });
    expect(callForB[1]).toMatchObject({ alertId: 'alert-b' });
  });

  it('does NOT broadcast to userB when only userA alert fires', async () => {
    const { priv, mockAlertRepository, mockTradingGateway } = buildService();
    (mockAlertRepository.save as jest.Mock).mockResolvedValue(undefined);

    // USER_B alert has a higher threshold that is NOT crossed
    const alertForA = makeAlert({
      id: 'alert-a',
      userId: USER_A,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.2700 as never,
    });
    const alertForB = makeAlert({
      id: 'alert-b',
      userId: USER_B,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.3000 as never, // higher — NOT crossed
    });

    priv._cache.set('GBP/USD', [alertForA, alertForB]);
    priv._prev.set('GBP/USD', 1.2650);

    // Tick at 1.2750 — only alertForA should fire
    await priv._evaluateTick('GBP/USD', 1.2750);

    const calls = (mockTradingGateway.broadcastAlert as jest.Mock).mock.calls;
    const userIds = calls.map(([uid]: [string]) => uid);

    expect(userIds).toContain(USER_A);
    expect(userIds).not.toContain(USER_B);
  });
});
