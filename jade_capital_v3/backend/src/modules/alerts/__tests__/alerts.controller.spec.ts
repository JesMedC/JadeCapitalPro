/**
 * Task 1.7 — Integration tests for AlertsController CRUD endpoints.
 *
 * Strategy: NestJS TestingModule with mocked AlertsService and a mocked
 * JwtAuthGuard (bypasses database + real JWT validation).
 *
 * Tests:
 * GET    /alerts        — returns list for authenticated user
 * POST   /alerts        — 201 on valid DTO, 400 on invalid, 400 on userId injection
 * PATCH  /alerts/:id    — 200 on valid update, 403 on ownership violation
 * DELETE /alerts/:id    — 200 on success, 403 on ownership violation
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AlertsController } from '../alerts.controller';
import { AlertsService } from '../alerts.service';
import { Alert, AlertCondition, AlertStatus, AlertType } from '../entities/alert.entity';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ALERT_ID = '11111111-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

class MockJwtGuard {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
    req.user = { sub: USER_A, email: 'trader@jade.test', username: 'trader', roles: ['trader'] };
    return true;
  }
}

// ── Mock data ──────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: ALERT_ID,
    userId: USER_A,
    name: 'My EUR/USD alert',
    type: AlertType.PRICE,
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1000,
    status: AlertStatus.ACTIVE,
    triggeredAt: null,
    createdAt: new Date('2026-05-23T10:00:00Z'),
    user: undefined as never,
    ...overrides,
  };
}

const mockAlertsService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

// ── Test setup ─────────────────────────────────────────────────────────────

describe('AlertsController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: AlertsService, useValue: mockAlertsService },
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

  // ── GET /alerts ────────────────────────────────────────────────────────────

  describe('GET /alerts', () => {
    it('returns 200 with the list of alerts for the authenticated user', async () => {
      const alerts = [makeAlert(), makeAlert({ id: '22222222-0000-0000-0000-000000000002' })];
      mockAlertsService.findAll.mockResolvedValue(alerts);

      const res = await request(app.getHttpServer())
        .get('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockAlertsService.findAll).toHaveBeenCalledWith(USER_A);
    });
  });

  // ── POST /alerts ───────────────────────────────────────────────────────────

  describe('POST /alerts', () => {
    it('returns 201 with the created alert on a valid DTO', async () => {
      const created = makeAlert();
      mockAlertsService.create.mockResolvedValue(created);

      const body = {
        name: 'My EUR/USD alert',
        instrument: 'EUR/USD',
        condition: AlertCondition.ABOVE,
        targetPrice: 1.1000,
      };

      const res = await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send(body)
        .expect(201);

      expect(res.body.id).toBe(ALERT_ID);
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

    it('returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', condition: 'above', targetPrice: 1.1 })
        .expect(400);

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    it('returns 400 when condition is invalid', async () => {
      await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test', instrument: 'EUR/USD', condition: 'greater_than', targetPrice: 1.1 })
        .expect(400);
    });

    it('returns 400 when targetPrice is negative', async () => {
      await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test', instrument: 'EUR/USD', condition: 'above', targetPrice: -0.5 })
        .expect(400);
    });

    it('returns 400 when instrument is unsupported', async () => {
      await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test', instrument: 'XAU/USD', condition: 'above', targetPrice: 1.1 })
        .expect(400);
    });

    it('returns 400 when userId injection is attempted via body (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/alerts')
        .set('Authorization', 'Bearer mock-token')
        .send({
          name: 'Injection',
          instrument: 'EUR/USD',
          condition: 'above',
          targetPrice: 1.1,
          userId: USER_B,
        })
        .expect(400);

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });
  });

  // ── PATCH /alerts/:id ─────────────────────────────────────────────────────

  describe('PATCH /alerts/:id', () => {
    it('returns 200 with the updated alert on valid patch', async () => {
      const updated = makeAlert({ name: 'Updated name' });
      mockAlertsService.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/alerts/${ALERT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Updated name' })
        .expect(200);

      expect(res.body.name).toBe('Updated name');
      expect(mockAlertsService.update).toHaveBeenCalledWith(
        ALERT_ID,
        USER_A,
        expect.objectContaining({ name: 'Updated name' }),
      );
    });

    it('returns 400 when condition is invalid on patch', async () => {
      await request(app.getHttpServer())
        .patch(`/alerts/${ALERT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ condition: 'greater_than' })
        .expect(400);
    });

    it('returns 403 when the alert belongs to another user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockAlertsService.update.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .patch(`/alerts/${ALERT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Unauthorized update' })
        .expect(403);
    });
  });

  // ── DELETE /alerts/:id ────────────────────────────────────────────────────

  describe('DELETE /alerts/:id', () => {
    it('returns 200 on successful removal', async () => {
      mockAlertsService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/alerts/${ALERT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockAlertsService.remove).toHaveBeenCalledWith(ALERT_ID, USER_A);
    });

    it('returns 403 when the alert belongs to another user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockAlertsService.remove.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .delete(`/alerts/${ALERT_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(403);
    });

    it('returns 404 when the alert does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockAlertsService.remove.mockRejectedValue(new NotFoundException('Alert not found'));

      await request(app.getHttpServer())
        .delete('/alerts/nonexistent-id')
        .set('Authorization', 'Bearer mock-token')
        .expect(404);
    });
  });
});
