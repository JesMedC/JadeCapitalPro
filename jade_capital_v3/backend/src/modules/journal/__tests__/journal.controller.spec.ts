/**
 * Task 2.3 — Integration tests for JournalController CRUD endpoints.
 *
 * Strategy: use @nestjs/testing TestingModule with mocked JournalService
 * and a mocked JwtAuthGuard (bypasses database + real JWT validation).
 *
 * Tests:
 * POST   /journal         — create entry, userId injection rejected
 * GET    /journal         — list with emotion/date filters
 * GET    /journal/:id     — get single entry
 * PATCH  /journal/:id     — partial update
 * DELETE /journal/:id     — remove entry
 *
 * Auth: all requests include a mock Authorization header that the overridden
 * guard always accepts, injecting a fixed UserPayload with sub = USER_A.
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JournalController } from '../journal.controller';
import { JournalService } from '../journal.service';
import { EmotionTag } from '../enums/emotion-tag.enum';
import { JournalEntry } from '../entities/journal-entry.entity';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ENTRY_ID = '11111111-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

/**
 * Overrides the real JWT guard: always allows the request and injects
 * a fixed UserPayload for USER_A into request.user.
 */
class MockJwtGuard {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
    req.user = { sub: USER_A, email: 'trader@jade.test', username: 'trader', roles: ['trader'] };
    return true;
  }
}

// ── Mock service ───────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: ENTRY_ID,
    userId: USER_A,
    title: 'Test entry',
    content: 'Some notes.',
    emotion: EmotionTag.CALM,
    tradeIds: ['550e8400-e29b-41d4-a716-446655440000'],
    tags: ['discipline'],
    mood: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    user: undefined as never,
    ...overrides,
  };
}

const mockJournalService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

// ── Test setup ─────────────────────────────────────────────────────────────

describe('JournalController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JournalController],
      providers: [
        { provide: JournalService, useValue: mockJournalService },
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

  // ── POST /journal ──────────────────────────────────────────────────────────

  describe('POST /journal', () => {
    it('creates an entry and returns 201 with the created resource', async () => {
      const created = makeEntry();
      mockJournalService.create.mockResolvedValue(created);

      const body = {
        title: 'Test entry',
        content: 'Some notes.',
        emotion: EmotionTag.CALM,
        tradeIds: ['550e8400-e29b-41d4-a716-446655440000'],
        tags: ['discipline'],
      };

      const res = await request(app.getHttpServer())
        .post('/journal')
        .set('Authorization', 'Bearer mock-token')
        .send(body)
        .expect(201);

      expect(res.body.id).toBe(ENTRY_ID);
      expect(mockJournalService.create).toHaveBeenCalledWith(USER_A, expect.objectContaining({
        title: 'Test entry',
        emotion: EmotionTag.CALM,
      }));
    });

    it('calls service.create with the JWT userId (user.sub), not any body userId', async () => {
      const created = makeEntry();
      mockJournalService.create.mockResolvedValue(created);

      // Attempting to inject userId via the request body
      await request(app.getHttpServer())
        .post('/journal')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Injection attempt', userId: USER_B })
        .expect(400); // ValidationPipe rejects unknown field with forbidNonWhitelisted: true

      // Service must NOT be called because the request was rejected
      expect(mockJournalService.create).not.toHaveBeenCalled();
    });

    it('returns 400 when title is missing', async () => {
      await request(app.getHttpServer())
        .post('/journal')
        .set('Authorization', 'Bearer mock-token')
        .send({ content: 'No title here' })
        .expect(400);
    });

    it('returns 400 when emotion is invalid', async () => {
      await request(app.getHttpServer())
        .post('/journal')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Test', emotion: 'euphoric' })
        .expect(400);
    });

    it('returns 400 when tradeIds contains a non-UUID value', async () => {
      await request(app.getHttpServer())
        .post('/journal')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Test', tradeIds: ['not-a-uuid'] })
        .expect(400);
    });
  });

  // ── GET /journal ───────────────────────────────────────────────────────────

  describe('GET /journal', () => {
    it('returns a list of entries for the authenticated user', async () => {
      const entries = [makeEntry(), makeEntry({ id: '22222222-0000-0000-0000-000000000002' })];
      mockJournalService.findAll.mockResolvedValue(entries);

      const res = await request(app.getHttpServer())
        .get('/journal')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockJournalService.findAll).toHaveBeenCalledWith(USER_A, expect.any(Object));
    });

    it('passes emotion query param to service.findAll', async () => {
      mockJournalService.findAll.mockResolvedValue([makeEntry()]);

      await request(app.getHttpServer())
        .get('/journal?emotion=calm')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockJournalService.findAll).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({ emotion: EmotionTag.CALM }),
      );
    });

    it('passes startDate and endDate query params to service.findAll', async () => {
      mockJournalService.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/journal?startDate=2026-01-01&endDate=2026-03-31')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockJournalService.findAll).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        }),
      );
    });

    it('returns 400 when emotion query param is invalid', async () => {
      await request(app.getHttpServer())
        .get('/journal?emotion=angry')
        .set('Authorization', 'Bearer mock-token')
        .expect(400);
    });

    it('always uses JWT userId — never accepts userId as a query param', async () => {
      mockJournalService.findAll.mockResolvedValue([]);

      // userId as a query param should be stripped by whitelist and NOT reach the service
      await request(app.getHttpServer())
        .get(`/journal?userId=${USER_B}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(400); // forbidNonWhitelisted rejects unknown query fields
    });
  });

  // ── GET /journal/:id ───────────────────────────────────────────────────────

  describe('GET /journal/:id', () => {
    it('returns the entry when found for the authenticated user', async () => {
      mockJournalService.findById.mockResolvedValue(makeEntry());

      const res = await request(app.getHttpServer())
        .get(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body.id).toBe(ENTRY_ID);
      expect(mockJournalService.findById).toHaveBeenCalledWith(ENTRY_ID, USER_A);
    });

    it('propagates NotFoundException from the service (404)', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockJournalService.findById.mockRejectedValue(new NotFoundException('Journal entry not found'));

      await request(app.getHttpServer())
        .get('/journal/nonexistent-id')
        .set('Authorization', 'Bearer mock-token')
        .expect(404);
    });

    it('propagates ForbiddenException from the service (403) — user isolation', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      // Simulates: USER_A requests an entry that belongs to USER_B
      mockJournalService.findById.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .get(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(403);
    });
  });

  // ── PATCH /journal/:id ─────────────────────────────────────────────────────

  describe('PATCH /journal/:id', () => {
    it('updates and returns the entry when valid', async () => {
      const updated = makeEntry({ title: 'Updated title', emotion: EmotionTag.CONFIDENT });
      mockJournalService.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated title', emotion: EmotionTag.CONFIDENT })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(mockJournalService.update).toHaveBeenCalledWith(
        ENTRY_ID,
        USER_A,
        expect.objectContaining({ title: 'Updated title' }),
      );
    });

    it('returns 400 when updating with an invalid emotion', async () => {
      await request(app.getHttpServer())
        .patch(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ emotion: 'angry' })
        .expect(400);
    });

    it('returns 403 when the entry belongs to another user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockJournalService.update.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .patch(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Unauthorized update' })
        .expect(403);
    });
  });

  // ── DELETE /journal/:id ────────────────────────────────────────────────────

  describe('DELETE /journal/:id', () => {
    it('removes the entry and returns 200', async () => {
      mockJournalService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(mockJournalService.remove).toHaveBeenCalledWith(ENTRY_ID, USER_A);
    });

    it('returns 403 when the entry belongs to another user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockJournalService.remove.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .delete(`/journal/${ENTRY_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(403);
    });

    it('returns 404 when the entry does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockJournalService.remove.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .delete('/journal/nonexistent-id')
        .set('Authorization', 'Bearer mock-token')
        .expect(404);
    });
  });
});
