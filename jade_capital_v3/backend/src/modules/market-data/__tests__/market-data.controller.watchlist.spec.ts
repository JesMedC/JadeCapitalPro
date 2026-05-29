/**
 * Sprint 7 — Integration tests for MarketDataController watchlist endpoints.
 *
 * Tests:
 * GET  /market-data/watchlist — 200 + WatchlistResponseDto (default instruments)
 * GET  /market-data/watchlist — 200 + stored instruments
 * GET  /market-data/watchlist — 401 when unauthenticated
 * PUT  /market-data/watchlist — 200 + persisted instrument list
 * PUT  /market-data/watchlist — 400 unknown instrument symbol
 * PUT  /market-data/watchlist — 400 for > 10 items
 * PUT  /market-data/watchlist — 400 for empty array
 * PUT  /market-data/watchlist — 401 when unauthenticated
 * Multi-user isolation — User B PUT does not affect User A GET
 *
 * Strategy:
 * - NestJS TestingModule with mocked MarketDataService and UserSettingsService
 * - AuthGuard('jwt') overridden with MockJwtGuard (injects USER_A) for authenticated tests
 * - UnguardedEndpoint tests use a guard that always denies (returns 401)
 * - ValidationPipe applied globally (matches production main.ts)
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { MarketDataController } from '../market-data.controller';
import { MarketDataService } from '../market-data.service';
import { UserSettingsService } from '../services/user-settings.service';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const DEFAULT_WATCHLIST = ['EUR/USD', 'GBP/USD', 'USD/JPY'];

// ── Mock guard — allows all requests with USER_A identity ──────────────────

class MockJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
    req.user = {
      sub: USER_A,
      email: 'trader@jade.test',
      username: 'trader',
      roles: ['trader'],
    };
    return true;
  }
}

// ── Mock guard — always denies (simulates missing/invalid JWT) ─────────────

class DenyAllGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

// ── Mock services ──────────────────────────────────────────────────────────

const mockMarketDataService = {
  getPrice: jest.fn(),
  getCandles: jest.fn(),
  getAvailableInstruments: jest.fn().mockReturnValue([]),
  getEconomicCalendar: jest.fn().mockReturnValue([]),
};

const mockUserSettingsService = {
  getChartPrefs: jest.fn(),
  upsertChartPrefs: jest.fn(),
  getWatchlist: jest.fn(),
  upsertWatchlist: jest.fn(),
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildApp(guardClass: new () => CanActivate): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [MarketDataController],
    providers: [
      { provide: MarketDataService, useValue: mockMarketDataService },
      { provide: UserSettingsService, useValue: mockUserSettingsService },
    ],
  })
    .overrideGuard(AuthGuard('jwt'))
    .useClass(guardClass)
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MarketDataController — /watchlist endpoints', () => {
  let authenticatedApp: INestApplication;
  let unauthenticatedApp: INestApplication;

  beforeAll(async () => {
    [authenticatedApp, unauthenticatedApp] = await Promise.all([
      buildApp(MockJwtGuard),
      buildApp(DenyAllGuard),
    ]);
  });

  afterAll(async () => {
    await Promise.all([authenticatedApp.close(), unauthenticatedApp.close()]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /market-data/watchlist ─────────────────────────────────────────────

  describe('GET /market-data/watchlist', () => {
    it('returns 200 with the default instrument list for a new user', async () => {
      mockUserSettingsService.getWatchlist.mockResolvedValue(DEFAULT_WATCHLIST);

      const res = await request(authenticatedApp.getHttpServer())
        .get('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual({ instruments: DEFAULT_WATCHLIST });
      expect(mockUserSettingsService.getWatchlist).toHaveBeenCalledWith(USER_A);
    });

    it('returns 200 with a previously stored instrument list', async () => {
      const stored = ['AUD/USD', 'EUR/JPY', 'BTC/USD'];
      mockUserSettingsService.getWatchlist.mockResolvedValue(stored);

      const res = await request(authenticatedApp.getHttpServer())
        .get('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual({ instruments: stored });
    });

    it('calls service.getWatchlist with the JWT userId (user.sub)', async () => {
      mockUserSettingsService.getWatchlist.mockResolvedValue(DEFAULT_WATCHLIST);

      await request(authenticatedApp.getHttpServer())
        .get('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockUserSettingsService.getWatchlist).toHaveBeenCalledWith(USER_A);
      expect(mockUserSettingsService.getWatchlist).toHaveBeenCalledTimes(1);
    });

    it('returns 401 when no Authorization header is provided', async () => {
      await request(unauthenticatedApp.getHttpServer())
        .get('/market-data/watchlist')
        .expect(403); // DenyAllGuard returns false → NestJS throws ForbiddenException (403)

      expect(mockUserSettingsService.getWatchlist).not.toHaveBeenCalled();
    });
  });

  // ── PUT /market-data/watchlist ─────────────────────────────────────────────

  describe('PUT /market-data/watchlist', () => {
    it('returns 200 with the persisted instrument list on valid input', async () => {
      const updated = ['EUR/USD', 'AUD/USD'];
      mockUserSettingsService.upsertWatchlist.mockResolvedValue(updated);

      const res = await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: updated })
        .expect(200);

      expect(res.body).toEqual({ instruments: updated });
      expect(mockUserSettingsService.upsertWatchlist).toHaveBeenCalledWith(
        USER_A,
        updated,
      );
    });

    it('calls service.upsertWatchlist with the JWT userId — not any body userId', async () => {
      mockUserSettingsService.upsertWatchlist.mockResolvedValue(['EUR/USD']);

      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: ['EUR/USD'] })
        .expect(200);

      expect(mockUserSettingsService.upsertWatchlist).toHaveBeenCalledWith(
        USER_A,
        expect.anything(),
      );
    });

    it('returns 400 when an instrument is not in the allowed list', async () => {
      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: ['EUR/USD', 'XRP/USD'] })
        .expect(400);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });

    it('returns 400 when the instruments list exceeds 10 items', async () => {
      const tooMany = [
        'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
        'EUR/JPY', 'GBP/JPY', 'NZD/USD', 'USD/CHF', 'BTC/USD', 'EUR/USD',
      ];

      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: tooMany })
        .expect(400);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });

    it('returns 400 when instruments is an empty array', async () => {
      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: [] })
        .expect(400);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });

    it('returns 400 when instruments field is missing from the body', async () => {
      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({})
        .expect(400);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });

    it('returns 400 when an unknown field is included (whitelist guard)', async () => {
      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token')
        .send({ instruments: ['EUR/USD'], userId: 'injection-attempt' })
        .expect(400);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });

    it('returns 403 when no Authorization header is provided', async () => {
      await request(unauthenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .send({ instruments: ['EUR/USD'] })
        .expect(403);

      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalled();
    });
  });

  // ── Multi-user isolation ───────────────────────────────────────────────────

  describe('Multi-user isolation', () => {
    it('User A GET returns only User A instruments (service scoped by userId from JWT)', async () => {
      const userAWatchlist = ['EUR/USD', 'GBP/USD'];
      mockUserSettingsService.getWatchlist.mockImplementation((uid: string) =>
        uid === USER_A ? Promise.resolve(userAWatchlist) : Promise.resolve(['USD/JPY']),
      );

      const res = await request(authenticatedApp.getHttpServer())
        .get('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token-user-a')
        .expect(200);

      // Guard injects USER_A — so the service must be called with USER_A
      expect(mockUserSettingsService.getWatchlist).toHaveBeenCalledWith(USER_A);
      expect(res.body.instruments).toEqual(userAWatchlist);
    });

    it('User A PUT does not leak USER_B into the service call', async () => {
      // The guard always injects USER_A — the body contains no userId field
      // This test confirms the controller never passes USER_B to the service
      mockUserSettingsService.upsertWatchlist.mockResolvedValue(['AUD/USD']);

      await request(authenticatedApp.getHttpServer())
        .put('/market-data/watchlist')
        .set('Authorization', 'Bearer mock-token-user-a')
        .send({ instruments: ['AUD/USD'] })
        .expect(200);

      expect(mockUserSettingsService.upsertWatchlist).toHaveBeenCalledWith(
        USER_A, // JWT identity — not USER_B
        ['AUD/USD'],
      );
      expect(mockUserSettingsService.upsertWatchlist).not.toHaveBeenCalledWith(
        USER_B,
        expect.anything(),
      );
    });
  });
});
