/**
 * ScannerScheduler — WebSocket push unit tests (Sprint 10A)
 *
 * Covers tasks 2.7 (broadcastScanner called once with correct shape),
 * 2.8 (SCANNER_ENABLED=false → no broadcast), and
 * 2.9 (empty cycle still broadcasts with count: 0).
 *
 * AC-4: broadcastScanner called once per cron cycle
 * AC-5: Payload contains { timestamp, count, results }
 * AC-6: SCANNER_ENABLED=false → no broadcast
 * AC-7: Payload shape validated
 */

import { ScannerScheduler } from '../scanner-scheduler.service';
import { ScannerResult } from '../entities/scanner-result.entity';

// ── Fixture builder ───────────────────────────────────────────────────────────

function makeResult(id: string, instrument = 'EUR/USD'): ScannerResult {
  const r = new ScannerResult();
  r.id = id;
  r.instrument = instrument;
  r.timeframe = '5m';
  r.pattern = 'Gartley';
  r.direction = 'CALL';
  r.entryPrice = 1.0850;
  r.stopLoss = 1.0800;
  r.takeProfit = 1.0920;
  r.takeProfit2 = 1.0980;
  r.confidence = 88;
  r.scannerType = 'harmonic';
  r.userId = null;
  r.metadata = null;
  r.createdAt = new Date('2026-05-23T00:00:00Z');
  return r;
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeScheduler(opts: {
  scannerEnabled?: string;
  runScanReturn?: ScannerResult[][];
}) {
  const { scannerEnabled = 'true', runScanReturn = [[]] } = opts;

  let callIdx = 0;
  const runScanMock = jest.fn().mockImplementation(() => {
    const result = runScanReturn[callIdx] ?? [];
    callIdx++;
    return Promise.resolve(result);
  });

  const scannerService = { runScan: runScanMock } as unknown as ConstructorParameters<typeof ScannerScheduler>[0];

  const marketData = {
    getCandles: jest.fn().mockReturnValue([]),
  } as unknown as ConstructorParameters<typeof ScannerScheduler>[1];

  const configService = {
    get: jest.fn().mockReturnValue(scannerEnabled),
  } as unknown as ConstructorParameters<typeof ScannerScheduler>[2];

  const broadcastScannerMock = jest.fn();
  const tradingGateway = {
    broadcastScanner: broadcastScannerMock,
  } as unknown as ConstructorParameters<typeof ScannerScheduler>[3];

  const scheduler = new ScannerScheduler(
    scannerService,
    marketData,
    configService,
    tradingGateway,
  );

  return { scheduler, broadcastScannerMock, runScanMock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScannerScheduler — WS push (Sprint 10A)', () => {

  // ── AC-4, AC-5, AC-7: broadcastScanner called once per cycle ─────────────

  it('calls broadcastScanner exactly once per cycle with correct shape (AC-4, AC-5, AC-7)', async () => {
    // Mock: first two runScan calls return fixtures, rest return []
    const r1 = makeResult('r-1', 'EUR/USD');
    const r2 = makeResult('r-2', 'GBP/USD');

    // 10 instruments × 5 timeframes = 50 calls total
    // We'll make calls 0 and 1 return results, rest return []
    const runScanReturn: ScannerResult[][] = [
      [r1],   // first pair
      [r2],   // second pair
      ...Array.from({ length: 48 }, () => []),  // rest
    ];

    const { scheduler, broadcastScannerMock } = makeScheduler({ runScanReturn });
    await scheduler.handleCron();

    expect(broadcastScannerMock).toHaveBeenCalledTimes(1);

    const [payload] = broadcastScannerMock.mock.calls[0] as [Record<string, unknown>];
    expect(typeof payload.timestamp).toBe('string');
    // Must be a valid ISO date
    expect(() => new Date(payload.timestamp as string).toISOString()).not.toThrow();
    expect(typeof payload.count).toBe('number');
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it('accumulates results from all pairs into a single payload (AC-5)', async () => {
    const r1 = makeResult('r-1');
    const r2 = makeResult('r-2');
    const r3 = makeResult('r-3');

    const runScanReturn: ScannerResult[][] = [
      [r1],
      [r2, r3],
      ...Array.from({ length: 48 }, () => []),
    ];

    const { scheduler, broadcastScannerMock } = makeScheduler({ runScanReturn });
    await scheduler.handleCron();

    const [payload] = broadcastScannerMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.count).toBe(3);
    expect((payload.results as ScannerResult[]).length).toBe(3);
  });

  // ── AC-6: SCANNER_ENABLED=false → no broadcast ────────────────────────────

  it('does NOT call broadcastScanner when SCANNER_ENABLED=false (AC-6)', async () => {
    const { scheduler, broadcastScannerMock } = makeScheduler({
      scannerEnabled: 'false',
    });
    await scheduler.handleCron();

    expect(broadcastScannerMock).not.toHaveBeenCalled();
  });

  it('does NOT call broadcastScanner when SCANNER_ENABLED is absent/undefined (AC-6)', async () => {
    const { scheduler, broadcastScannerMock } = makeScheduler({
      scannerEnabled: '',
    });
    await scheduler.handleCron();

    expect(broadcastScannerMock).not.toHaveBeenCalled();
  });

  // ── Empty cycle (spec scenario) ───────────────────────────────────────────

  it('broadcasts with count: 0 and results: [] when all pairs return empty (AC-5)', async () => {
    // All 50 pairs return []
    const { scheduler, broadcastScannerMock } = makeScheduler({
      runScanReturn: Array.from({ length: 50 }, () => []),
    });
    await scheduler.handleCron();

    expect(broadcastScannerMock).toHaveBeenCalledTimes(1);
    const [payload] = broadcastScannerMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.count).toBe(0);
    expect(payload.results).toEqual([]);
  });

  // ── Regression: runScan errors don't stop broadcast ──────────────────────

  it('still broadcasts after a pair throws an error (resilience)', async () => {
    const r1 = makeResult('r-safe');
    let callCount = 0;
    const runScanMock = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('market data unavailable');
      if (callCount === 2) return Promise.resolve([r1]);
      return Promise.resolve([]);
    });

    const scannerService = { runScan: runScanMock } as unknown as ConstructorParameters<typeof ScannerScheduler>[0];
    const marketData = { getCandles: jest.fn().mockReturnValue([]) } as unknown as ConstructorParameters<typeof ScannerScheduler>[1];
    const configService = { get: jest.fn().mockReturnValue('true') } as unknown as ConstructorParameters<typeof ScannerScheduler>[2];
    const broadcastScannerMock = jest.fn();
    const tradingGateway = { broadcastScanner: broadcastScannerMock } as unknown as ConstructorParameters<typeof ScannerScheduler>[3];

    const scheduler = new ScannerScheduler(scannerService, marketData, configService, tradingGateway);
    await scheduler.handleCron();

    expect(broadcastScannerMock).toHaveBeenCalledTimes(1);
    const [payload] = broadcastScannerMock.mock.calls[0] as [Record<string, unknown>];
    // r1 from the second pair was saved
    expect((payload.results as ScannerResult[]).length).toBeGreaterThanOrEqual(1);
  });
});
