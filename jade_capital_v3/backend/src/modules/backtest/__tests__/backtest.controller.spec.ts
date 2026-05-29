/**
 * Integration tests for BacktestController.
 *
 * Strategy: @nestjs/testing TestingModule with a mocked BacktestService
 * and a mocked JwtAuthGuard that injects a fixed UserPayload for USER_A.
 *
 * Tests:
 * GET    /backtest         — returns list for USER_A
 * GET    /backtest/:id     — returns single session; ownership enforced
 * POST   /backtest         — creates session; validation pipe active
 * DELETE /backtest/:id     — 204 on success; ownership enforced
 *
 * Multi-user isolation is asserted by checking that service methods receive
 * the USER_A sub from the JWT, not any userId from the request body.
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { BacktestController } from '../backtest.controller';
import { BacktestService } from '../backtest.service';
import { BacktestSession, BacktestStatus } from '../entities/backtest-session.entity';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const SESSION_ID = 'ssssssss-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

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

// ── Fixture ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<BacktestSession> = {}): BacktestSession {
  return {
    id: SESSION_ID,
    userId: USER_A,
    name: 'Test backtest',
    config: { instrument: 'EUR/USD', timeframe: '15m', strategy: 'candle-direction', lastNCandles: 50 },
    status: BacktestStatus.PENDING,
    results: null,
    error: null,
    createdAt: new Date('2026-05-24T10:00:00Z'),
    updatedAt: new Date('2026-05-24T10:00:00Z'),
    user: undefined as never,
    ...overrides,
  };
}

// ── Mock service ───────────────────────────────────────────────────────────

const mockBacktestService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

// ── Test setup ─────────────────────────────────────────────────────────────

describe('BacktestController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacktestController],
      providers: [
        { provide: BacktestService, useValue: mockBacktestService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(MockJwtGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── GET /backtest ─────────────────────────────────────────────────────────

  describe('GET /backtest', () => {
    it('returns the list for the authenticated user', async () => {
      const sessions = [makeSession(), makeSession({ id: 'ssssssss-0000-0000-0000-000000000002' })];
      mockBacktestService.findAll.mockResolvedValue(sessions);

      const res = await request(app.getHttpServer())
        .get('/backtest')
        .set('Authorization', 'Bearer fake')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockBacktestService.findAll).toHaveBeenCalledWith(USER_A);
    });
  });

  // ── GET /backtest/:id ─────────────────────────────────────────────────────

  describe('GET /backtest/:id', () => {
    it('returns a single session for the authenticated user', async () => {
      const session = makeSession();
      mockBacktestService.findById.mockResolvedValue(session);

      const res = await request(app.getHttpServer())
        .get(`/backtest/${SESSION_ID}`)
        .set('Authorization', 'Bearer fake')
        .expect(200);

      expect(res.body.id).toBe(SESSION_ID);
      // Service receives userId from JWT, not request body
      expect(mockBacktestService.findById).toHaveBeenCalledWith(SESSION_ID, USER_A);
    });
  });

  // ── POST /backtest ────────────────────────────────────────────────────────

  describe('POST /backtest', () => {
    it('creates a session with status=pending and returns 201', async () => {
      const session = makeSession();
      mockBacktestService.create.mockResolvedValue(session);

      const res = await request(app.getHttpServer())
        .post('/backtest')
        .set('Authorization', 'Bearer fake')
        .send({
          name: 'EUR/USD 15m test',
          config: {
            instrument: 'EUR/USD',
            timeframe: '15m',
            strategy: 'candle-direction',
            lastNCandles: 50,
          },
        })
        .expect(201);

      expect(res.body.status).toBe(BacktestStatus.PENDING);
      expect(mockBacktestService.create).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({ name: 'EUR/USD 15m test' }),
      );
    });

    it('returns 400 when lastNCandles is below 10', async () => {
      await request(app.getHttpServer())
        .post('/backtest')
        .set('Authorization', 'Bearer fake')
        .send({
          name: 'Test',
          config: {
            instrument: 'EUR/USD',
            timeframe: '15m',
            strategy: 'candle-direction',
            lastNCandles: 5,
          },
        })
        .expect(400);
    });

    it('returns 400 when instrument is not in the valid list', async () => {
      await request(app.getHttpServer())
        .post('/backtest')
        .set('Authorization', 'Bearer fake')
        .send({
          name: 'Test',
          config: {
            instrument: 'INVALID/PAIR',
            timeframe: '15m',
            strategy: 'candle-direction',
            lastNCandles: 50,
          },
        })
        .expect(400);
    });
  });

  // ── DELETE /backtest/:id ──────────────────────────────────────────────────

  describe('DELETE /backtest/:id', () => {
    it('returns 204 No Content on successful deletion', async () => {
      mockBacktestService.delete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/backtest/${SESSION_ID}`)
        .set('Authorization', 'Bearer fake')
        .expect(204);

      // Service receives userId from JWT — multi-user isolation
      expect(mockBacktestService.delete).toHaveBeenCalledWith(SESSION_ID, USER_A);
    });
  });
});
