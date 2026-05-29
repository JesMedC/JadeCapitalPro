/**
 * Sprint 7 — Unit tests for UserSettingsService watchlist methods.
 *
 * Covers:
 * - getWatchlist: ensures row exists before querying; returns instruments when row found
 * - getWatchlist: returns defaults when no row or empty watchlist (first-login scenario)
 * - upsertWatchlist: valid list persists via raw SQL upsert
 * - upsertWatchlist: returns the persisted instruments
 * - upsertWatchlist: unknown symbol throws BadRequestException (400)
 * - upsertWatchlist: 11-item list throws BadRequestException (400)
 * - upsertWatchlist: empty array throws BadRequestException (400)
 * - Multi-user isolation: userId always comes from the argument, never shared state
 *
 * Strategy: mock the TypeORM Repository<UserSettings> with jest.fn() mocks.
 * No real database is hit.
 */

import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserSettingsService } from '../services/user-settings.service';
import { UserSettings } from '../entities/user-settings.entity';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const DEFAULT_WATCHLIST = ['EUR/USD', 'GBP/USD', 'USD/JPY'];

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
    chartPrefs: { instrument: 'EUR/USD', timeframe: '5m' },
    watchlist: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
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

// ── Tests: getWatchlist ────────────────────────────────────────────────────

describe('UserSettingsService.getWatchlist', () => {
  it('ensures the row exists (INSERT ON CONFLICT DO NOTHING) before fetching', async () => {
    const repo = buildMockRepo(makeRow());
    const service = new UserSettingsService(repo);

    await service.getWatchlist(USER_A);

    const queryCalls = (repo.query as jest.Mock).mock.calls as [string, unknown[]][];
    const insertCall = queryCalls.find(([sql]) => sql.includes('INSERT INTO user_settings'));

    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toBe(USER_A);
    expect(insertCall![0]).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('returns the stored watchlist when the row has instruments', async () => {
    const row = makeRow({ watchlist: ['AUD/USD', 'EUR/JPY'] });
    const repo = buildMockRepo(row);
    const service = new UserSettingsService(repo);

    const result = await service.getWatchlist(USER_A);

    expect(result).toEqual(['AUD/USD', 'EUR/JPY']);
  });

  it('returns the default watchlist when no row exists (first-login scenario)', async () => {
    const repo = buildMockRepo(null);
    const service = new UserSettingsService(repo);

    const result = await service.getWatchlist(USER_A);

    expect(result).toEqual(DEFAULT_WATCHLIST);
  });

  it('returns the default watchlist when watchlist is an empty array', async () => {
    const row = makeRow({ watchlist: [] });
    const repo = buildMockRepo(row);
    const service = new UserSettingsService(repo);

    const result = await service.getWatchlist(USER_A);

    expect(result).toEqual(DEFAULT_WATCHLIST);
  });

  it('uses the userId argument for multi-user isolation', async () => {
    const repo = buildMockRepo(null);
    const service = new UserSettingsService(repo);

    await service.getWatchlist(USER_B);

    const queryCalls = (repo.query as jest.Mock).mock.calls as [string, unknown[]][];
    const insertCall = queryCalls.find(([sql]) => sql.includes('INSERT INTO user_settings'));
    expect(insertCall![1][0]).toBe(USER_B);
    expect(insertCall![1][0]).not.toBe(USER_A);
  });
});

// ── Tests: upsertWatchlist ─────────────────────────────────────────────────

describe('UserSettingsService.upsertWatchlist', () => {
  it('persists valid instruments via upsert SQL and returns the list', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const instruments = ['EUR/USD', 'AUD/USD'];
    const result = await service.upsertWatchlist(USER_A, instruments);

    expect(result).toEqual(instruments);
    expect(repo.query).toHaveBeenCalledTimes(1);

    const [sql, params] = (repo.query as jest.Mock).mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('INSERT INTO user_settings');
    expect(sql).toContain('ON CONFLICT (user_id)');
    expect(sql).toContain('DO UPDATE SET watchlist = EXCLUDED.watchlist');
    expect(params[0]).toBe(USER_A);

    const parsed = JSON.parse(params[1] as string) as string[];
    expect(parsed).toEqual(instruments);
  });

  it('throws BadRequestException for unknown instrument symbol', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    await expect(
      service.upsertWatchlist(USER_A, ['EUR/USD', 'XRP/USD']),
    ).rejects.toThrow(BadRequestException);

    expect(repo.query).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when instruments list exceeds 10 items', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    const tooMany = [
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
      'EUR/JPY', 'GBP/JPY', 'NZD/USD', 'USD/CHF', 'BTC/USD', 'EUR/USD',
    ];

    await expect(
      service.upsertWatchlist(USER_A, tooMany),
    ).rejects.toThrow(BadRequestException);

    expect(repo.query).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when instruments list is empty', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    await expect(
      service.upsertWatchlist(USER_A, []),
    ).rejects.toThrow(BadRequestException);

    expect(repo.query).not.toHaveBeenCalled();
  });

  it('uses the userId argument — never any injected value (multi-user isolation)', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    await service.upsertWatchlist(USER_B, ['EUR/USD']);

    const [, params] = (repo.query as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER_B);
    expect(params[0]).not.toBe(USER_A);
  });

  it('calls repo.query exactly once per upsert call', async () => {
    const repo = buildMockRepo();
    const service = new UserSettingsService(repo);

    await service.upsertWatchlist(USER_A, ['GBP/USD', 'USD/JPY']);

    expect(repo.query).toHaveBeenCalledTimes(1);
  });
});
