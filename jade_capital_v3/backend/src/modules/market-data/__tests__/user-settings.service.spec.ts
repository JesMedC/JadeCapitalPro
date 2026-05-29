/**
 * Task 10.1 — Unit tests for UserSettingsService.
 *
 * Covers:
 * - getChartPrefs: returns row's chartPrefs when found
 * - getChartPrefs: returns defaults when no row exists (first-login scenario)
 * - getChartPrefs: returns defaults when chartPrefs is null (pre-migration row)
 * - upsertChartPrefs: calls repo.query with correct SQL and params
 * - upsertChartPrefs: returns the persisted values from the DTO
 * - Multi-user isolation: userId always comes from the argument, not any shared state
 *
 * Strategy: mock the TypeORM Repository<UserSettings> with jest.fn() mocks.
 * No real database is hit.
 */

import 'reflect-metadata';
import { Repository } from 'typeorm';
import { UserSettingsService } from '../services/user-settings.service';
import { UserSettings } from '../entities/user-settings.entity';
import { UpdateChartPrefsDto } from '../dto/chart-preferences.dto';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const DEFAULT_PREFS = { instrument: 'EUR/USD', timeframe: '5m' };

// ── Mock helpers ───────────────────────────────────────────────────────────

function makeRow(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    userId: USER_A,
    theme: 'dark',
    language: 'es',
    timezone: 'America/Argentina/Buenos_Aires',
    riskConfig: {},
    scannerConfig: {},
    notificationPrefs: {},
    chartPrefs: { instrument: 'GBP/USD', timeframe: '1h' },
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as UserSettings;
}

function buildMockRepo(findOneResult: UserSettings | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(findOneResult),
    query: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<UserSettings>;
}

// ── Tests: getChartPrefs ───────────────────────────────────────────────────

describe('UserSettingsService.getChartPrefs', () => {
  it('returns the row chartPrefs when a row with non-null chartPrefs exists', async () => {
    const row = makeRow({ chartPrefs: { instrument: 'GBP/USD', timeframe: '1h' } });
    const repo = buildMockRepo(row);
    const service = new UserSettingsService(repo);

    const result = await service.getChartPrefs(USER_A);

    expect(result).toEqual({ instrument: 'GBP/USD', timeframe: '1h' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: USER_A } });
  });

  it('returns defaults when no row exists (first-login scenario)', async () => {
    const repo = buildMockRepo(null);
    const service = new UserSettingsService(repo);

    const result = await service.getChartPrefs(USER_A);

    expect(result).toEqual(DEFAULT_PREFS);
  });

  it('returns defaults when chartPrefs is null (pre-migration row)', async () => {
    const row = makeRow({ chartPrefs: null });
    const repo = buildMockRepo(row);
    const service = new UserSettingsService(repo);

    const result = await service.getChartPrefs(USER_A);

    expect(result).toEqual(DEFAULT_PREFS);
  });

  it('uses the userId argument for the WHERE clause (multi-user isolation)', async () => {
    const repo = buildMockRepo(null);
    const service = new UserSettingsService(repo);

    await service.getChartPrefs(USER_B);

    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: USER_B } });
    expect(repo.findOne).not.toHaveBeenCalledWith({ where: { userId: USER_A } });
  });

  it('returns a new object each call (no shared mutable state)', async () => {
    const repo = buildMockRepo(null);
    const service = new UserSettingsService(repo);

    const r1 = await service.getChartPrefs(USER_A);
    const r2 = await service.getChartPrefs(USER_A);

    expect(r1).toEqual(r2);
    expect(r1).not.toBe(r2); // different object references
  });
});

// ── Tests: upsertChartPrefs ────────────────────────────────────────────────

describe('UserSettingsService.upsertChartPrefs', () => {
  it('calls repo.query with the upsert SQL containing the correct userId and chartPrefs', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const dto: UpdateChartPrefsDto = { instrument: 'USD/JPY', timeframe: '4h' };
    await service.upsertChartPrefs(USER_A, dto);

    expect(repo.query).toHaveBeenCalledTimes(1);

    const [sql, params] = (repo.query as jest.Mock).mock.calls[0] as [string, unknown[]];

    // SQL must be an upsert with conflict target on user_id
    expect(sql).toContain('INSERT INTO user_settings');
    expect(sql).toContain('ON CONFLICT (user_id)');
    expect(sql).toContain('DO UPDATE SET chart_prefs = EXCLUDED.chart_prefs');

    // First param is userId
    expect(params[0]).toBe(USER_A);

    // Second param is the JSON string with the correct values
    const parsed = JSON.parse(params[1] as string) as { instrument: string; timeframe: string };
    expect(parsed.instrument).toBe('USD/JPY');
    expect(parsed.timeframe).toBe('4h');
  });

  it('returns the persisted instrument and timeframe from the DTO', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const dto: UpdateChartPrefsDto = { instrument: 'AUD/USD', timeframe: '15m' };
    const result = await service.upsertChartPrefs(USER_A, dto);

    expect(result).toEqual({ instrument: 'AUD/USD', timeframe: '15m' });
  });

  it('uses the userId argument — never any value from the DTO (multi-user isolation)', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const dto: UpdateChartPrefsDto = { instrument: 'EUR/USD', timeframe: '5m' };
    await service.upsertChartPrefs(USER_B, dto);

    const [, params] = (repo.query as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER_B);
    expect(params[0]).not.toBe(USER_A);
  });

  it('calls repo.query exactly once per upsert call', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const dto: UpdateChartPrefsDto = { instrument: 'EUR/USD', timeframe: '1d' };
    await service.upsertChartPrefs(USER_A, dto);

    expect(repo.query).toHaveBeenCalledTimes(1);
  });
});
