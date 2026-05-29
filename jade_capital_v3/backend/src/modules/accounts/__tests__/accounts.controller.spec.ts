/**
 * AccountsController — integration tests via NestJS TestingModule.
 *
 * Sprint 18: Closes S16 test coverage gap.
 *
 * Strategy: mocked AccountsService + mocked JwtAuthGuard (no DB, no real JWT).
 *
 * Covers:
 * - POST   /accounts              → 201
 * - GET    /accounts              → 200 array
 * - PATCH  /accounts/:id          → 200
 * - GET    /accounts/aggregate    → 200
 * - GET    /accounts/:id/dashboard → 200
 * - Unauthenticated guard → 403
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { AccountsController } from '../accounts.controller';
import { AccountsService } from '../accounts.service';
import { TradingAccount } from '../entities/trading-account.entity';

// ── Constants ──────────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACCOUNT_ID = 'acct-0000-0000-0000-000000000001';

// ── Mock guards ────────────────────────────────────────────────────────────────

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

class RejectJwtGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: ACCOUNT_ID,
    userId: USER_A,
    name: 'Test Account',
    marketType: 'forex',
    balance: 1000 as unknown as number,
    currency: 'USD',
    broker: null,
    initialBalance: 1000 as unknown as number,
    isDefault: false,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    trades: [],
    accessGrants: [],
    user: null as never,
    ...overrides,
  };
}

// ── Mock service ──────────────────────────────────────────────────────────────

const mockAccountsService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getDashboard: jest.fn(),
  getAggregate: jest.fn(),
  deposit: jest.fn(),
  withdraw: jest.fn(),
};

// ── Build app helper ──────────────────────────────────────────────────────────

async function buildApp(
  guardClass: new () => CanActivate,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AccountsController],
    providers: [
      { provide: AccountsService, useValue: mockAccountsService },
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccountsController (integration)', () => {
  let app: INestApplication;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── POST /accounts → 201 ──────────────────────────────────────────────────

  describe('POST /accounts', () => {
    it('returns 201 with created account', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.create.mockResolvedValue(makeAccount());

      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test Account', marketType: 'forex', currency: 'USD' })
        .expect(201);

      expect(res.body.userId).toBe(USER_A);
      expect(mockAccountsService.create).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({ name: 'Test Account' }),
      );
    });
  });

  // ── GET /accounts → 200 array ─────────────────────────────────────────────

  describe('GET /accounts', () => {
    it('returns 200 with array of accounts', async () => {
      app = await buildApp(MockJwtGuard);
      const accounts = [makeAccount(), makeAccount({ id: 'acct-0002' })];
      mockAccountsService.findAll.mockResolvedValue(accounts);

      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockAccountsService.findAll).toHaveBeenCalledWith(USER_A);
    });

    it('returns 200 with empty array when user has no accounts', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ── PATCH /accounts/:id → 200 ─────────────────────────────────────────────

  describe('PATCH /accounts/:id', () => {
    it('returns 200 with updated account', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.update.mockResolvedValue(makeAccount({ name: 'Updated' }));

      const res = await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Updated' })
        .expect(200);

      expect(res.body.name).toBe('Updated');
      expect(mockAccountsService.update).toHaveBeenCalledWith(
        ACCOUNT_ID,
        USER_A,
        expect.objectContaining({ name: 'Updated' }),
      );
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.update.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Hack' })
        .expect(403);
    });

    it('returns 404 when service throws NotFoundException', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.update.mockRejectedValue(
        new NotFoundException('Account not found'),
      );

      await request(app.getHttpServer())
        .patch(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test' })
        .expect(404);
    });
  });

  // ── GET /accounts/aggregate → 200 ────────────────────────────────────────

  describe('GET /accounts/aggregate', () => {
    it('returns 200 with aggregate response', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.getAggregate.mockResolvedValue({
        totalBalance: 1500,
        combinedPnl: 100,
        combinedWinRate: 60,
        combinedEquityCurve: [],
        accounts: [],
        overall: {
          winRate: 0.6,
          profitFactor: 1.5,
          avgWin: 50,
          avgLoss: 30,
          totalWins: 6,
          totalLosses: 4,
          totalClosed: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/accounts/aggregate')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body.totalBalance).toBe(1500);
      expect(mockAccountsService.getAggregate).toHaveBeenCalledWith(USER_A);
    });
  });

  // ── GET /accounts/:id/dashboard → 200 ────────────────────────────────────

  describe('GET /accounts/:id/dashboard', () => {
    it('returns 200 with dashboard response', async () => {
      app = await buildApp(MockJwtGuard);
      mockAccountsService.getDashboard.mockResolvedValue({
        account: makeAccount(),
        overall: {
          winRate: 0.5,
          profitFactor: 1,
          avgWin: 0,
          avgLoss: 0,
          totalWins: 0,
          totalLosses: 0,
          totalClosed: 0,
        },
        equityCurve: [],
        byInstrument: [],
        risk: {
          overallLevel: 'low',
          dailyPnl: 0,
          dailyLossPct: 0,
          maxDailyLossPct: 5,
          tradesToday: 0,
          maxTradesSession: 20,
          tradesLevel: 'low',
          lossLevel: 'low',
          blocked: false,
        },
        openTrades: { binary: [], forex: [] },
        goals: [],
      });

      const res = await request(app.getHttpServer())
        .get(`/accounts/${ACCOUNT_ID}/dashboard`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toHaveProperty('account');
      expect(res.body).toHaveProperty('overall');
      expect(res.body).toHaveProperty('equityCurve');
      expect(mockAccountsService.getDashboard).toHaveBeenCalledWith(ACCOUNT_ID, USER_A);
    });
  });

  // ── Unauthenticated → 403 ─────────────────────────────────────────────────

  describe('unauthenticated', () => {
    it('GET /accounts → 403 when guard rejects', async () => {
      app = await buildApp(RejectJwtGuard);

      await request(app.getHttpServer())
        .get('/accounts')
        .expect(403);
    });
  });
});
