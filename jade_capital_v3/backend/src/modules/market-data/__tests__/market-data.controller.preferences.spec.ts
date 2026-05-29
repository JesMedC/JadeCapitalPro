/**
 * Task 10.2 — Integration tests for MarketDataController chart-preferences endpoints.
 *
 * Tests:
 * GET  /market-data/preferences — 200 + ChartPrefsResponseDto
 * PUT  /market-data/preferences — 200 + persisted DTO
 * PUT  /market-data/preferences — 400 for invalid instrument
 * PUT  /market-data/preferences — 400 for invalid timeframe
 * PUT  /market-data/preferences — 400 for unknown field (whitelist guard)
 *
 * Strategy:
 * - NestJS TestingModule with mocked MarketDataService and UserSettingsService
 * - AuthGuard('jwt') is overridden with MockJwtGuard that always allows + injects USER_A
 * - ValidationPipe is applied with whitelist + forbidNonWhitelisted (matches production main.ts)
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';
import { MarketDataController } from '../market-data.controller';
import { MarketDataService } from '../market-data.service';
import { UserSettingsService } from '../services/user-settings.service';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

/**
 * Bypasses real JWT validation for tests.
 * Injects a fixed UserPayload for USER_A into request.user.
 */
class MockJwtGuard {
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
};

// ── Test setup ─────────────────────────────────────────────────────────────

describe('MarketDataController — /preferences endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketDataController],
      providers: [
        { provide: MarketDataService, useValue: mockMarketDataService },
        { provide: UserSettingsService, useValue: mockUserSettingsService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(MockJwtGuard)
      .compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /market-data/preferences ───────────────────────────────────────────

  describe('GET /market-data/preferences', () => {
    it('returns 200 with ChartPrefsResponseDto for the authenticated user', async () => {
      const prefs = { instrument: 'EUR/USD', timeframe: '5m' };
      mockUserSettingsService.getChartPrefs.mockResolvedValue(prefs);

      const res = await request(app.getHttpServer())
        .get('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual({ instrument: 'EUR/USD', timeframe: '5m' });
      expect(mockUserSettingsService.getChartPrefs).toHaveBeenCalledWith(USER_A);
    });

    it('calls service.getChartPrefs with the JWT userId (user.sub)', async () => {
      mockUserSettingsService.getChartPrefs.mockResolvedValue({
        instrument: 'GBP/USD',
        timeframe: '1h',
      });

      await request(app.getHttpServer())
        .get('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockUserSettingsService.getChartPrefs).toHaveBeenCalledWith(USER_A);
      expect(mockUserSettingsService.getChartPrefs).toHaveBeenCalledTimes(1);
    });

    it('returns the instrument and timeframe from the service', async () => {
      mockUserSettingsService.getChartPrefs.mockResolvedValue({
        instrument: 'USD/JPY',
        timeframe: '4h',
      });

      const res = await request(app.getHttpServer())
        .get('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body.instrument).toBe('USD/JPY');
      expect(res.body.timeframe).toBe('4h');
    });
  });

  // ── PUT /market-data/preferences ───────────────────────────────────────────

  describe('PUT /market-data/preferences', () => {
    it('returns 200 with the persisted ChartPrefsResponseDto on valid input', async () => {
      const persisted = { instrument: 'GBP/USD', timeframe: '1h' };
      mockUserSettingsService.upsertChartPrefs.mockResolvedValue(persisted);

      const res = await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'GBP/USD', timeframe: '1h' })
        .expect(200);

      expect(res.body).toEqual({ instrument: 'GBP/USD', timeframe: '1h' });
      expect(mockUserSettingsService.upsertChartPrefs).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({ instrument: 'GBP/USD', timeframe: '1h' }),
      );
    });

    it('calls service.upsertChartPrefs with the JWT userId — not any body userId', async () => {
      mockUserSettingsService.upsertChartPrefs.mockResolvedValue({
        instrument: 'EUR/USD',
        timeframe: '5m',
      });

      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', timeframe: '5m' })
        .expect(200);

      expect(mockUserSettingsService.upsertChartPrefs).toHaveBeenCalledWith(
        USER_A,
        expect.anything(),
      );
    });

    it('returns 400 when instrument is not in the allowed list', async () => {
      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'XRP/USD', timeframe: '5m' })
        .expect(400);

      expect(mockUserSettingsService.upsertChartPrefs).not.toHaveBeenCalled();
    });

    it('returns 400 when timeframe is not in the allowed list', async () => {
      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', timeframe: '3h' })
        .expect(400);

      expect(mockUserSettingsService.upsertChartPrefs).not.toHaveBeenCalled();
    });

    it('returns 400 when instrument is missing', async () => {
      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ timeframe: '5m' })
        .expect(400);

      expect(mockUserSettingsService.upsertChartPrefs).not.toHaveBeenCalled();
    });

    it('returns 400 when timeframe is missing', async () => {
      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD' })
        .expect(400);

      expect(mockUserSettingsService.upsertChartPrefs).not.toHaveBeenCalled();
    });

    it('returns 400 when an unknown field is included (whitelist)', async () => {
      await request(app.getHttpServer())
        .put('/market-data/preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', timeframe: '5m', userId: 'injection-attempt' })
        .expect(400);

      expect(mockUserSettingsService.upsertChartPrefs).not.toHaveBeenCalled();
    });
  });
});
