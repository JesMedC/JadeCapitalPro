/**
 * Task 5.3 — E2E tests for AlertsController HTTP flow.
 *
 * Strategy: NestJS Test.createTestingModule with full request-response cycle
 * via supertest. AlertsService is mocked so no DB or Redis is needed.
 * The real JwtAuthGuard is overridden with a MockJwtGuard that injects a
 * known UserPayload, enabling full auth path testing without a real JWT.
 *
 * Covers:
 *  (a) POST /alerts without token → 401    (REQ-DTO-03)
 *  (b) POST /alerts with missing fields → 400 (REQ-DTO-01)
 *  (c) POST /alerts with valid payload → 201 with created alert body (AC-01)
 *  (d) PATCH /alerts/:id owned by other user → 403
 *  (e) GET /alerts returns only requester's alerts (AC-05 HTTP layer)
 *
 * Additional: DELETE flow, NotFoundException → 404, PATCH validation, GET by id.
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as request from 'supertest';
import { AlertsController } from '../alerts.controller';
import { AlertsService } from '../alerts.service';
import { Alert, AlertCondition, AlertStatus, AlertType } from '../entities/alert.entity';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ALERT_ID = '11111111-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

/**
 * JwtGuard override that injects a fixed UserPayload for USER_A.
 * This simulates a successfully authenticated request without a real JWT.
 */
class MockJwtGuardUserA {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
    req.user = {
      sub: USER_A,
      email: 'trader-a@jade.test',
      username: 'trader_a',
      roles: ['trader'],
    };
    return true;
  }
}

/**
 * Guard that throws UnauthorizedException (401).
 * Used to test the protected-route behaviour without a token.
 * Note: returning `false` from canActivate() yields 403 in NestJS — we must
 * throw explicitly to get the correct 401 status code.
 */
class RejectingJwtGuard {
  canActivate(): never {
    const { UnauthorizedException } = require('@nestjs/common') as typeof import('@nestjs/common');
    throw new UnauthorizedException('No token provided');
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: ALERT_ID,
    userId: USER_A,
    name: 'My EUR/USD alert',
    type: AlertType.PRICE,
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1,
    status: AlertStatus.ACTIVE,
    triggeredAt: null,
    createdAt: new Date('2026-05-23T10:00:00Z'),
    user: undefined as never,
    ...overrides,
  };
}

// ── Shared mock service ────────────────────────────────────────────────────

const mockAlertsService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

// ── App factory ────────────────────────────────────────────────────────────

async function buildApp(guardClass = MockJwtGuardUserA): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AlertsController],
    providers: [{ provide: AlertsService, useValue: mockAlertsService }],
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

// ────────────────────────────────────────────────────────────────────────────
// (a) Unauthenticated request → 401 (REQ-DTO-03)
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — (a) unauthenticated requests (REQ-DTO-03)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(RejectingJwtGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /alerts without a valid token returns 401', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({
        name: 'My alert',
        instrument: 'EUR/USD',
        condition: 'above',
        targetPrice: 1.1,
      })
      .expect(401);
  });

  it('GET /alerts without a valid token returns 401', async () => {
    await request(app.getHttpServer()).get('/alerts').expect(401);
  });

  it('PATCH /alerts/:id without a valid token returns 401', async () => {
    await request(app.getHttpServer())
      .patch(`/alerts/${ALERT_ID}`)
      .send({ name: 'Updated' })
      .expect(401);
  });

  it('DELETE /alerts/:id without a valid token returns 401', async () => {
    await request(app.getHttpServer()).delete(`/alerts/${ALERT_ID}`).expect(401);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (b) POST with missing / invalid fields → 400 (REQ-DTO-01)
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — (b) POST validation (REQ-DTO-01)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when name is missing', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ instrument: 'EUR/USD', condition: 'above', targetPrice: 1.1 })
      .expect(400);

    expect(mockAlertsService.create).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty string', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: '', instrument: 'EUR/USD', condition: 'above', targetPrice: 1.1 })
      .expect(400);
  });

  it('returns 400 when instrument is missing', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: 'Test', condition: 'above', targetPrice: 1.1 })
      .expect(400);
  });

  it('returns 400 when instrument is unsupported', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: 'Test', instrument: 'XAU/USD', condition: 'above', targetPrice: 1.1 })
      .expect(400);
  });

  it('returns 400 when condition is invalid', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: 'Test', instrument: 'EUR/USD', condition: 'greater_than', targetPrice: 1.1 })
      .expect(400);
  });

  it('returns 400 when targetPrice is negative', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: 'Test', instrument: 'EUR/USD', condition: 'above', targetPrice: -1 })
      .expect(400);
  });

  it('returns 400 when targetPrice is zero', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({ name: 'Test', instrument: 'EUR/USD', condition: 'above', targetPrice: 0 })
      .expect(400);
  });

  it('returns 400 when extra non-whitelisted field is present (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/alerts')
      .send({
        name: 'Test',
        instrument: 'EUR/USD',
        condition: 'above',
        targetPrice: 1.1,
        userId: USER_B, // injection attempt
      })
      .expect(400);

    expect(mockAlertsService.create).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (c) POST with valid payload → 201 with created alert body (AC-01)
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — (c) POST valid payload returns 201 (AC-01)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 201 with the created alert when payload is valid', async () => {
    const created = makeAlert({ status: AlertStatus.ACTIVE });
    mockAlertsService.create.mockResolvedValue(created);

    const body = {
      name: 'My EUR/USD alert',
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1,
    };

    const res = await request(app.getHttpServer())
      .post('/alerts')
      .send(body)
      .expect(201);

    expect(res.body.id).toBe(ALERT_ID);
    expect(res.body.status).toBe(AlertStatus.ACTIVE);
    expect(mockAlertsService.create).toHaveBeenCalledWith(
      USER_A,
      expect.objectContaining({
        name: 'My EUR/USD alert',
        instrument: 'EUR/USD',
        condition: AlertCondition.ABOVE,
        targetPrice: 1.1,
      }),
    );
  });

  it('does NOT accept userId from the request body (userId is taken from JWT)', async () => {
    const created = makeAlert();
    mockAlertsService.create.mockResolvedValue(created);

    // This would 400 due to forbidNonWhitelisted, so we test the guard works
    const res = await request(app.getHttpServer())
      .post('/alerts')
      .send({
        name: 'Injection test',
        instrument: 'EUR/USD',
        condition: 'above',
        targetPrice: 1.1,
        userId: USER_B, // attempt to inject a different userId
      })
      .expect(400); // forbidden by ValidationPipe

    expect(res.body.message).toBeDefined();
    expect(mockAlertsService.create).not.toHaveBeenCalled();
  });

  it('accepts all four AlertCondition values in the POST body', async () => {
    for (const condition of Object.values(AlertCondition)) {
      const created = makeAlert({ condition });
      mockAlertsService.create.mockResolvedValue(created);

      const res = await request(app.getHttpServer())
        .post('/alerts')
        .send({ name: 'Test', instrument: 'EUR/USD', condition, targetPrice: 1.1 })
        .expect(201);

      expect(res.body.condition).toBe(condition);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (d) PATCH owned by other user → 403
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — (d) PATCH ownership enforcement', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when the alert belongs to another user', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    mockAlertsService.update.mockRejectedValue(new ForbiddenException());

    await request(app.getHttpServer())
      .patch(`/alerts/${ALERT_ID}`)
      .send({ name: 'Unauthorized' })
      .expect(403);
  });

  it('returns 200 with updated alert when ownership is valid', async () => {
    const updated = makeAlert({ name: 'Updated name' });
    mockAlertsService.update.mockResolvedValue(updated);

    const res = await request(app.getHttpServer())
      .patch(`/alerts/${ALERT_ID}`)
      .send({ name: 'Updated name' })
      .expect(200);

    expect(res.body.name).toBe('Updated name');
    expect(mockAlertsService.update).toHaveBeenCalledWith(
      ALERT_ID,
      USER_A,
      expect.objectContaining({ name: 'Updated name' }),
    );
  });

  it('returns 404 when patching a non-existent alert', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    mockAlertsService.update.mockRejectedValue(new NotFoundException('Alert not found'));

    await request(app.getHttpServer())
      .patch(`/alerts/nonexistent-id`)
      .send({ name: 'Update' })
      .expect(404);
  });

  it('returns 400 when PATCH body contains an invalid condition', async () => {
    await request(app.getHttpServer())
      .patch(`/alerts/${ALERT_ID}`)
      .send({ condition: 'greater_than' })
      .expect(400);
  });

  it('returns 400 when PATCH body contains an invalid status', async () => {
    await request(app.getHttpServer())
      .patch(`/alerts/${ALERT_ID}`)
      .send({ status: 'pending' }) // not in AlertStatus enum
      .expect(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// (e) GET /alerts returns only requester's alerts (AC-05 HTTP layer)
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — (e) GET multi-user isolation (AC-05)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes USER_A\'s sub to AlertsService.findAll (not another user\'s id)', async () => {
    const alertsForA = [
      makeAlert({ id: 'aaa', userId: USER_A }),
      makeAlert({ id: 'bbb', userId: USER_A, instrument: 'GBP/USD' }),
    ];
    mockAlertsService.findAll.mockResolvedValue(alertsForA);

    const res = await request(app.getHttpServer()).get('/alerts').expect(200);

    expect(res.body).toHaveLength(2);
    // The service was called with USER_A's id — not USER_B or any other id
    expect(mockAlertsService.findAll).toHaveBeenCalledWith(USER_A);
    expect(mockAlertsService.findAll).not.toHaveBeenCalledWith(USER_B);
  });

  it('returns an empty array when the user has no alerts', async () => {
    mockAlertsService.findAll.mockResolvedValue([]);

    const res = await request(app.getHttpServer()).get('/alerts').expect(200);

    expect(res.body).toHaveLength(0);
    expect(mockAlertsService.findAll).toHaveBeenCalledWith(USER_A);
  });

  it('returns 200 with the alert when GET /alerts/:id and owner matches', async () => {
    const alert = makeAlert();
    mockAlertsService.findById.mockResolvedValue(alert);

    const res = await request(app.getHttpServer())
      .get(`/alerts/${ALERT_ID}`)
      .expect(200);

    expect(res.body.id).toBe(ALERT_ID);
    expect(mockAlertsService.findById).toHaveBeenCalledWith(ALERT_ID, USER_A);
  });

  it('returns 403 when GET /alerts/:id is called for another user\'s alert', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    mockAlertsService.findById.mockRejectedValue(new ForbiddenException());

    await request(app.getHttpServer()).get(`/alerts/${ALERT_ID}`).expect(403);
  });

  it('returns 404 when GET /alerts/:id does not exist', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    mockAlertsService.findById.mockRejectedValue(new NotFoundException('Alert not found'));

    await request(app.getHttpServer()).get('/alerts/nonexistent-id').expect(404);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE flow
// ────────────────────────────────────────────────────────────────────────────

describe('E2E AlertsController — DELETE flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 on successful DELETE', async () => {
    mockAlertsService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/alerts/${ALERT_ID}`)
      .expect(200);

    expect(mockAlertsService.remove).toHaveBeenCalledWith(ALERT_ID, USER_A);
  });

  it('returns 403 when DELETE targets another user\'s alert', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    mockAlertsService.remove.mockRejectedValue(new ForbiddenException());

    await request(app.getHttpServer())
      .delete(`/alerts/${ALERT_ID}`)
      .expect(403);
  });

  it('returns 404 when DELETE targets a non-existent alert', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    mockAlertsService.remove.mockRejectedValue(new NotFoundException('Alert not found'));

    await request(app.getHttpServer())
      .delete('/alerts/nonexistent-id')
      .expect(404);
  });
});
