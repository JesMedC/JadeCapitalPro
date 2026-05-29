/**
 * Task 5.2 — Integration tests for AlertEvaluatorService.
 *
 * Strategy: instantiate AlertEvaluatorService with mocked dependencies
 * (alertRepository, TradingGateway, ConfigService) and a mock Redis pmessage
 * emitter (EventEmitter-based). No real Redis connection is established.
 *
 * Covers:
 *  (a) Emit a price tick that crosses a threshold → broadcastAlert called with
 *      correct REQ-WS-02 payload (AC-02, AC-03)
 *  (b) Emit the same tick again → broadcastAlert NOT called again (one-shot, AC-06)
 *  (c) Disable alert via invalidateCache → emit tick → no trigger (AC-07)
 *  (d) Multi-user isolation: two alerts on same instrument — each user receives
 *      only their own broadcast
 *
 * The mock Redis client simulates the ioredis psubscribe pattern by emitting
 * 'pmessage' events directly on the EventEmitter. AlertEvaluatorService's
 * onModuleInit registers the handler before psubscribing, so we bypass the
 * real network entirely.
 */

import 'reflect-metadata';
import { EventEmitter } from 'events';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AlertEvaluatorService } from '../alert-evaluator.service';
import { Alert, AlertCondition, AlertStatus, AlertType } from '../entities/alert.entity';
import { TradingGateway } from '../../../websockets/trading.gateway';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

// ── Mock Redis client ──────────────────────────────────────────────────────

/**
 * Minimal Redis mock that satisfies the interface used by AlertEvaluatorService:
 * - connect()      — resolves immediately (simulates successful connection)
 * - on()           — delegates to EventEmitter so pmessage events are fired
 * - psubscribe()   — resolves immediately (no-op)
 * - punsubscribe() — resolves immediately (no-op)
 * - quit()         — resolves immediately (no-op)
 *
 * Test code emits 'pmessage' events via emitter.emit() to simulate Redis ticks.
 */
class MockRedisClient extends EventEmitter {
  connect = jest.fn().mockResolvedValue(undefined);
  psubscribe = jest.fn().mockResolvedValue(undefined);
  punsubscribe = jest.fn().mockResolvedValue(undefined);
  quit = jest.fn().mockResolvedValue(undefined);
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    userId: USER_A,
    name: 'Test alert',
    type: AlertType.PRICE,
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1 as unknown as number,
    status: AlertStatus.ACTIVE,
    triggeredAt: null,
    createdAt: new Date('2026-05-23T00:00:00Z'),
    user: null as never,
    ...overrides,
  };
}

// ── Builder ────────────────────────────────────────────────────────────────

async function buildAndInitService(initialAlerts: Alert[] = []) {
  const mockRedis = new MockRedisClient();

  const alertRepository = {
    find: jest.fn().mockResolvedValue(initialAlerts),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<Alert>;

  const tradingGateway = {
    broadcastAlert: jest.fn(),
  } as unknown as TradingGateway;

  const configService = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;

  const service = new AlertEvaluatorService(
    alertRepository,
    tradingGateway,
    configService,
  );

  // Inject the mock Redis client BEFORE onModuleInit runs so the service
  // uses our EventEmitter instead of creating a real ioredis connection.
  // We override the private _subClient via type casting (white-box injection).
  const priv = service as unknown as {
    _subClient: MockRedisClient;
    _cache: Map<string, Alert[]>;
    _prev: Map<string, number>;
    _seedCache(): Promise<void>;
    invalidateCache(instrument: string): Promise<void>;
  };

  // Pre-assign the mock so onModuleInit can attach its 'pmessage' listener.
  // We must also make connect() resolve so the init path continues normally.
  priv._subClient = mockRedis;

  // We call onModuleInit manually but need to bypass the Redis constructor
  // call inside it. Patch the internal constructor call:
  // The service creates _subClient = new Redis({...}) inside onModuleInit —
  // we intercept by stubbing the module-level Redis import isn't straightforward.
  // Instead, we use the seeding approach: call _seedCache + register listener
  // manually, which mirrors what onModuleInit does.
  await priv._seedCache();

  // Register the same pmessage handler that onModuleInit would register.
  // This is the exact listener that processes Redis price ticks.
  priv._subClient.on(
    'pmessage',
    (pattern: string, channel: string, message: string) => {
      // Access evaluateTick via the service's private method
      const svc = service as unknown as {
        _handlePmessage(p: string, c: string, m: string): Promise<void>;
      };
      void svc._handlePmessage(pattern, channel, message);
    },
  );

  /** Helper: emit a price tick to the mock Redis emitter. */
  function emitTick(instrument: string, bid: number) {
    mockRedis.emit(
      'pmessage',
      'market:*:price',
      `market:${instrument}:price`,
      JSON.stringify({ bid, ask: bid + 0.0002, timestamp: Date.now() }),
    );
  }

  return { service, priv, alertRepository, tradingGateway, mockRedis, emitTick };
}

// ── Helper: wait one microtask cycle ──────────────────────────────────────

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

// ────────────────────────────────────────────────────────────────────────────
// (a) Price tick that crosses threshold → broadcastAlert with correct payload
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService integration — (a) tick triggers alert (AC-02, AC-03)', () => {
  it('calls broadcastAlert when a CROSSES_ABOVE condition is met', async () => {
    const alert = makeAlert({
      id: 'alert-crosses-above-01',
      userId: USER_A,
      instrument: 'EUR/USD',
      condition: AlertCondition.CROSSES_ABOVE,
      targetPrice: 1.1 as never,
    });

    const { tradingGateway, priv, emitTick } = await buildAndInitService([alert]);

    // Seed previous price below the target
    priv._prev.set('EUR/USD', 1.0990);

    // Tick above the target — should trigger CROSSES_ABOVE
    emitTick('EUR/USD', 1.1005);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);

    const [calledUserId, payload] = (tradingGateway.broadcastAlert as jest.Mock).mock.calls[0];
    expect(calledUserId).toBe(USER_A);

    // Verify REQ-WS-02 payload shape
    expect(payload).toMatchObject({
      type: 'alert:triggered',
      alertId: 'alert-crosses-above-01',
      instrument: 'EUR/USD',
      condition: AlertCondition.CROSSES_ABOVE,
      targetPrice: 1.1,
      currentPrice: 1.1005,
    });
    expect(typeof payload.triggeredAt).toBe('string');
    // ISO 8601 with Z suffix
    expect(payload.triggeredAt as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('calls broadcastAlert when an ABOVE condition is met', async () => {
    const alert = makeAlert({
      id: 'alert-above-01',
      userId: USER_A,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.25 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alert]);

    emitTick('GBP/USD', 1.2550);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);
    const [uid, payload] = (tradingGateway.broadcastAlert as jest.Mock).mock.calls[0];
    expect(uid).toBe(USER_A);
    expect(payload).toMatchObject({
      type: 'alert:triggered',
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      currentPrice: 1.2550,
    });
  });

  it('calls broadcastAlert when a BELOW condition is met', async () => {
    const alert = makeAlert({
      id: 'alert-below-01',
      userId: USER_A,
      instrument: 'USD/JPY',
      condition: AlertCondition.BELOW,
      targetPrice: 150 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alert]);

    emitTick('USD/JPY', 149.9);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);
    expect((tradingGateway.broadcastAlert as jest.Mock).mock.calls[0][1]).toMatchObject({
      condition: AlertCondition.BELOW,
      currentPrice: 149.9,
    });
  });

  it('does NOT call broadcastAlert when condition is NOT yet met', async () => {
    const alert = makeAlert({
      id: 'alert-above-not-yet',
      userId: USER_A,
      instrument: 'AUD/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 0.75 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alert]);

    // Price below the threshold
    emitTick('AUD/USD', 0.7490);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (b) Same tick emitted again → broadcastAlert NOT called again (one-shot, AC-06)
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService integration — (b) one-shot behaviour (AC-06)', () => {
  it('does NOT fire broadcastAlert a second time when the same tick is re-emitted', async () => {
    const alert = makeAlert({
      id: 'alert-oneshot-01',
      userId: USER_A,
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alert]);

    // First tick — triggers the alert
    emitTick('EUR/USD', 1.1010);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);

    // Second tick at the same price — alert was already fired and removed from cache
    emitTick('EUR/USD', 1.1010);
    await flushPromises();

    // Still only 1 call — one-shot guarantee
    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fire on subsequent ticks that also match the condition', async () => {
    const alert = makeAlert({
      id: 'alert-oneshot-02',
      userId: USER_A,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.25 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alert]);

    // First trigger
    emitTick('GBP/USD', 1.2510);
    await flushPromises();

    // Three more ticks above the threshold
    emitTick('GBP/USD', 1.2520);
    emitTick('GBP/USD', 1.2530);
    emitTick('GBP/USD', 1.2540);
    await flushPromises();

    // broadcastAlert must have been called exactly once
    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);
  });

  it('removes the alert from _cache after the first trigger', async () => {
    const alert = makeAlert({
      id: 'alert-removed-from-cache',
      userId: USER_A,
      instrument: 'NZD/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 0.63 as never,
    });

    const { priv, emitTick } = await buildAndInitService([alert]);

    expect(priv._cache.get('NZD/USD')).toContain(alert);

    emitTick('NZD/USD', 0.6310);
    await flushPromises();

    const bucket = priv._cache.get('NZD/USD') ?? [];
    expect(bucket).not.toContain(alert);
    expect(bucket).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (c) Disable alert via invalidateCache → emit tick → no trigger (AC-07)
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService integration — (c) cache invalidation disables alert (AC-07)', () => {
  it('does NOT trigger an alert that was removed from cache via invalidateCache', async () => {
    const alert = makeAlert({
      id: 'alert-disabled-via-cache',
      userId: USER_A,
      instrument: 'USD/CAD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.36 as never,
    });

    const { service, alertRepository, tradingGateway, emitTick } =
      await buildAndInitService([alert]);

    // Simulate the alert being deleted: the DB no longer returns it
    (alertRepository.find as jest.Mock).mockResolvedValue([]);

    // Invalidate the cache as AlertsService would after a remove() call
    await service.invalidateCache('USD/CAD');

    // Emit a tick that would have matched the condition
    emitTick('USD/CAD', 1.3650);
    await flushPromises();

    // Cache was cleared — no broadcast
    expect(tradingGateway.broadcastAlert).not.toHaveBeenCalled();
  });

  it('triggers the alert BEFORE invalidation but NOT after', async () => {
    const alert = makeAlert({
      id: 'alert-pre-post-invalidation',
      userId: USER_A,
      instrument: 'EUR/JPY',
      condition: AlertCondition.ABOVE,
      targetPrice: 160 as never,
    });

    // Start fresh with the alert in cache
    const { service, alertRepository, tradingGateway, emitTick } =
      await buildAndInitService([alert]);

    // Tick below threshold — no trigger
    emitTick('EUR/JPY', 159.9);
    await flushPromises();
    expect(tradingGateway.broadcastAlert).not.toHaveBeenCalled();

    // User disables the alert → invalidateCache removes it from the bucket
    (alertRepository.find as jest.Mock).mockResolvedValue([]); // DB empty after disable
    await service.invalidateCache('EUR/JPY');

    // Tick above threshold — alert is no longer in cache, should NOT fire
    emitTick('EUR/JPY', 160.5);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).not.toHaveBeenCalled();
  });

  it('re-adds the alert to cache when invalidateCache returns it from DB', async () => {
    const alertV1 = makeAlert({
      id: 'alert-updated-via-cache',
      userId: USER_A,
      instrument: 'USD/CHF',
      condition: AlertCondition.ABOVE,
      targetPrice: 0.90 as never,
    });

    const { service, priv, alertRepository, tradingGateway, emitTick } =
      await buildAndInitService([alertV1]);

    // User updates the target price — DB now returns the updated alert
    const alertV2 = { ...alertV1, targetPrice: 0.95 as never };
    (alertRepository.find as jest.Mock).mockResolvedValue([alertV2]);
    await service.invalidateCache('USD/CHF');

    // Old threshold (0.90) — should NOT trigger (target is now 0.95)
    emitTick('USD/CHF', 0.9100);
    await flushPromises();
    expect(tradingGateway.broadcastAlert).not.toHaveBeenCalled();

    // New threshold (0.95) — should trigger
    emitTick('USD/CHF', 0.9510);
    await flushPromises();
    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);

    const [uid, payload] = (tradingGateway.broadcastAlert as jest.Mock).mock.calls[0];
    expect(uid).toBe(USER_A);
    expect(payload.targetPrice).toBe(0.95);

    void priv; // used above for assertions
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (d) Multi-user isolation: two alerts same instrument, correct user each
// ────────────────────────────────────────────────────────────────────────────

describe('AlertEvaluatorService integration — (d) multi-user isolation', () => {
  it('broadcasts to the correct user when two alerts on the same instrument both trigger', async () => {
    const alertA = makeAlert({
      id: 'alert-user-a',
      userId: USER_A,
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1 as never,
    });
    const alertB = makeAlert({
      id: 'alert-user-b',
      userId: USER_B,
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alertA, alertB]);

    emitTick('EUR/USD', 1.1050);
    await flushPromises();

    const calls = (tradingGateway.broadcastAlert as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);

    const calledUserIds = calls.map(([uid]: [string]) => uid as string);
    expect(calledUserIds).toContain(USER_A);
    expect(calledUserIds).toContain(USER_B);

    // Each user receives only their own alertId in the payload
    const callA = calls.find(([uid]: [string]) => uid === USER_A);
    const callB = calls.find(([uid]: [string]) => uid === USER_B);

    expect(callA[1]).toMatchObject({ alertId: 'alert-user-a', instrument: 'EUR/USD' });
    expect(callB[1]).toMatchObject({ alertId: 'alert-user-b', instrument: 'EUR/USD' });

    // Cross-contamination guard
    expect(callA[1].alertId).not.toBe('alert-user-b');
    expect(callB[1].alertId).not.toBe('alert-user-a');
  });

  it('broadcasts only to userA when userB alert threshold is not crossed', async () => {
    const alertA = makeAlert({
      id: 'alert-user-a-low',
      userId: USER_A,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.27 as never,
    });
    const alertB = makeAlert({
      id: 'alert-user-b-high',
      userId: USER_B,
      instrument: 'GBP/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.30 as never, // higher — not reached by this tick
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alertA, alertB]);

    emitTick('GBP/USD', 1.2750);
    await flushPromises();

    const calls = (tradingGateway.broadcastAlert as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);

    const [calledUserId, payload] = calls[0];
    expect(calledUserId).toBe(USER_A);
    expect(payload.alertId).toBe('alert-user-a-low');
  });

  it('does NOT broadcast to the other user when one alert fires after the other is already removed', async () => {
    const alertA = makeAlert({
      id: 'alert-a-fires-first',
      userId: USER_A,
      instrument: 'BTC/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 65000 as never,
    });
    const alertB = makeAlert({
      id: 'alert-b-different-level',
      userId: USER_B,
      instrument: 'BTC/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 70000 as never,
    });

    const { tradingGateway, emitTick } = await buildAndInitService([alertA, alertB]);

    // First tick crosses alertA's threshold but not alertB's
    emitTick('BTC/USD', 65500);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(1);
    expect((tradingGateway.broadcastAlert as jest.Mock).mock.calls[0][0]).toBe(USER_A);

    // Second tick crosses alertB's threshold; alertA is already gone (one-shot)
    emitTick('BTC/USD', 70500);
    await flushPromises();

    expect(tradingGateway.broadcastAlert).toHaveBeenCalledTimes(2);
    expect((tradingGateway.broadcastAlert as jest.Mock).mock.calls[1][0]).toBe(USER_B);
  });
});
