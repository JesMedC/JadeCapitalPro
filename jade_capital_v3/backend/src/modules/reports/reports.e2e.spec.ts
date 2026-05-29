/**
 * Controller integration tests for the ReportsController.
 *
 * Strategy: NestJS testing module that mounts ONLY the controller and a mock
 * ReportsService. Avoids wiring TypeORM (no real DB connection needed for
 * controller-level integration tests).
 *
 * Tests cover:
 *  AC-1: 200 + Content-Type: application/pdf on valid request
 *  AC-3: 401 when guard throws UnauthorizedException (no JWT — corrected from 403)
 *  AC-4: 403 when wrong account owner (ReportsService throws ForbiddenException)
 *  AC-5: 404 { error: 'no_trades_in_range' } when no trades in range
 *  AC-6: 400 when from > to (resolvePreset throws BadRequestException)
 */

import 'reflect-metadata';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import {
  INestApplication,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ExecutionContext,
  CanActivate,
} from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const PDF_BYTES = Buffer.from('%PDF-1.4 mock-pdf-content');

const mockReportsService = {
  resolvePreset: jest.fn(),
  generate: jest.fn(),
};

/** Guard that always authenticates with a fixed user payload. */
class MockJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      roles: ['trader'],
    };
    return true;
  }
}

/** Guard that always rejects (simulates missing/invalid token). */
class RejectJwtGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

/** Guard that throws UnauthorizedException (simulates missing/expired JWT → 401). */
class UnauthorizedJwtGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException('No valid token');
  }
}

// ── Helper: build app ─────────────────────────────────────────────────────────

async function buildApp(
  guardClass: new () => CanActivate,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [ReportsController],
    providers: [
      { provide: ReportsService, useValue: mockReportsService },
    ],
  })
    .overrideGuard(AuthGuard('jwt'))
    .useClass(guardClass)
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReportsController (integration)', () => {
  let app: INestApplication;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // AC-1: Valid request returns 200 + application/pdf
  it('GET /accounts/:id/report?preset=30d → 200 + application/pdf', async () => {
    app = await buildApp(MockJwtGuard);
    mockReportsService.resolvePreset.mockReturnValue({
      fromDate: new Date('2026-04-24'),
      toDate: new Date('2026-05-24'),
    });
    mockReportsService.generate.mockResolvedValue(PDF_BYTES);

    const res = await request(app.getHttpServer())
      .get('/accounts/account-1/report')
      .query({ preset: '30d' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  // AC-3: No JWT → guard throws UnauthorizedException → 401
  it('GET /accounts/:id/report without token → 401', async () => {
    app = await buildApp(UnauthorizedJwtGuard);

    const res = await request(app.getHttpServer())
      .get('/accounts/account-1/report')
      .query({ preset: '30d' });

    expect(res.status).toBe(401);
  });

  // AC-4: Wrong account owner → 403
  it('GET /accounts/:id/report with wrong owner → 403', async () => {
    app = await buildApp(MockJwtGuard);
    mockReportsService.resolvePreset.mockReturnValue({
      fromDate: new Date('2026-04-24'),
      toDate: new Date('2026-05-24'),
    });
    mockReportsService.generate.mockRejectedValue(
      new ForbiddenException('Account not found or access denied.'),
    );

    const res = await request(app.getHttpServer())
      .get('/accounts/other-account/report')
      .query({ preset: '30d' });

    expect(res.status).toBe(403);
  });

  // AC-5: No trades in range → 404 with error key
  it('GET /accounts/:id/report with no trades → 404 no_trades_in_range', async () => {
    app = await buildApp(MockJwtGuard);
    mockReportsService.resolvePreset.mockReturnValue({
      fromDate: new Date('2026-01-01'),
      toDate: new Date('2026-01-07'),
    });
    mockReportsService.generate.mockRejectedValue(
      new NotFoundException({
        error: 'no_trades_in_range',
        message: 'No closed trades found between 2026-01-01 and 2026-01-07',
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/accounts/account-1/report')
      .query({ preset: '7d' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('no_trades_in_range');
  });

  // AC-6: from > to → 400
  it('GET /accounts/:id/report with from > to → 400', async () => {
    app = await buildApp(MockJwtGuard);
    mockReportsService.resolvePreset.mockImplementation(() => {
      throw new BadRequestException('from must not be after to.');
    });

    const res = await request(app.getHttpServer())
      .get('/accounts/account-1/report')
      .query({ from: '2026-02-01', to: '2026-01-01' });

    expect(res.status).toBe(400);
  });
});
