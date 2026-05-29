/**
 * BookmarksController — integration tests via NestJS TestingModule.
 *
 * Strategy: mocked BookmarksService + mocked JwtAuthGuard (no DB, no real JWT).
 *
 * Covers:
 * - AC-2:  POST → 201, bookmark in body with correct user_id
 * - AC-4:  DELETE → 403 when service throws ForbiddenException
 * - AC-5:  Idempotent POST → 200 when bookmark already exists
 * - AC-10: DELETE non-existent → 404
 * - AC-12: GET returns [] for user with no bookmarks
 * - DTO validation: 400 on missing required fields
 * - User-id injection blocked (forbidNonWhitelisted)
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BookmarksController } from '../bookmarks.controller';
import { BookmarksService } from '../bookmarks.service';
import { PatternBookmark } from '../entities/pattern-bookmark.entity';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const BM_ID = '11111111-0000-0000-0000-000000000001';

// ── Mock guard ─────────────────────────────────────────────────────────────

class MockJwtGuard {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
    req.user = { sub: USER_A, email: 'trader@jade.test', username: 'trader', roles: ['trader'] };
    return true;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeBookmark(overrides: Partial<PatternBookmark> = {}): PatternBookmark {
  return {
    id: BM_ID,
    userId: USER_A,
    instrument: 'EUR/USD',
    timeframe: '1h',
    pattern: 'Gartley',
    direction: 'BULLISH',
    notes: null,
    createdAt: new Date('2026-05-24T10:00:00Z'),
    user: null as never,
    ...overrides,
  };
}

const mockBookmarksService = {
  findAll: jest.fn(),
  upsert: jest.fn(),
  remove: jest.fn(),
  updateNotes: jest.fn(),
};

// ── Test setup ─────────────────────────────────────────────────────────────

describe('BookmarksController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [
        { provide: BookmarksService, useValue: mockBookmarksService },
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

  // ── GET /bookmarks ─────────────────────────────────────────────────────────

  describe('GET /bookmarks', () => {
    it('AC-12: returns 200 with [] when user has no bookmarks', async () => {
      mockBookmarksService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual([]);
      expect(mockBookmarksService.findAll).toHaveBeenCalledWith(USER_A);
    });

    it('returns 200 with list of bookmarks for authenticated user', async () => {
      const bms = [makeBookmark(), makeBookmark({ id: '22222222-0000-0000-0000-000000000002' })];
      mockBookmarksService.findAll.mockResolvedValue(bms);

      const res = await request(app.getHttpServer())
        .get('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockBookmarksService.findAll).toHaveBeenCalledWith(USER_A);
    });
  });

  // ── POST /bookmarks ────────────────────────────────────────────────────────

  describe('POST /bookmarks', () => {
    it('AC-2: returns 201 with bookmark on first create', async () => {
      const bm = makeBookmark();
      mockBookmarksService.upsert.mockResolvedValue({ bookmark: bm, created: true });

      const res = await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'BULLISH',
        })
        .expect(201);

      expect(res.body.userId).toBe(USER_A);
      expect(mockBookmarksService.upsert).toHaveBeenCalledWith(
        USER_A,
        expect.objectContaining({
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'BULLISH',
        }),
      );
    });

    it('AC-5: returns 200 when bookmark already exists (idempotent)', async () => {
      const existing = makeBookmark();
      mockBookmarksService.upsert.mockResolvedValue({ bookmark: existing, created: false });

      const res = await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'BULLISH',
        })
        .expect(200);

      expect(res.body.id).toBe(BM_ID);
    });

    it('returns 400 when instrument is missing', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({ timeframe: '1h', pattern: 'Gartley', direction: 'BULLISH' })
        .expect(400);

      expect(mockBookmarksService.upsert).not.toHaveBeenCalled();
    });

    it('returns 400 when timeframe is missing', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', pattern: 'Gartley', direction: 'BULLISH' })
        .expect(400);
    });

    it('returns 400 when pattern is missing', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', timeframe: '1h', direction: 'BULLISH' })
        .expect(400);
    });

    it('returns 400 when direction is missing', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({ instrument: 'EUR/USD', timeframe: '1h', pattern: 'Gartley' })
        .expect(400);
    });

    it('returns 400 when userId injection is attempted via body (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', 'Bearer mock-token')
        .send({
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'BULLISH',
          userId: USER_B,
        })
        .expect(400);

      expect(mockBookmarksService.upsert).not.toHaveBeenCalled();
    });
  });

  // ── PATCH /bookmarks/:id/notes ─────────────────────────────────────────────

  describe('PATCH /bookmarks/:id/notes', () => {
    it('200 success — returns updated bookmark', async () => {
      const updated = makeBookmark({ notes: 'text' });
      mockBookmarksService.updateNotes.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/bookmarks/${BM_ID}/notes`)
        .set('Authorization', 'Bearer mock-token')
        .send({ notes: 'text' })
        .expect(200);

      expect(res.body.notes).toBe('text');
      expect(mockBookmarksService.updateNotes).toHaveBeenCalledWith(BM_ID, USER_A, 'text');
    });

    it('403 forbidden — service throws ForbiddenException', async () => {
      mockBookmarksService.updateNotes.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .patch(`/bookmarks/${BM_ID}/notes`)
        .set('Authorization', 'Bearer mock-token')
        .send({ notes: 'text' })
        .expect(403);
    });

    it('404 not found — service throws NotFoundException', async () => {
      mockBookmarksService.updateNotes.mockRejectedValue(
        new NotFoundException('Bookmark not found'),
      );

      await request(app.getHttpServer())
        .patch(`/bookmarks/${BM_ID}/notes`)
        .set('Authorization', 'Bearer mock-token')
        .send({ notes: 'text' })
        .expect(404);
    });

    it('400 bad request — missing notes field', async () => {
      await request(app.getHttpServer())
        .patch(`/bookmarks/${BM_ID}/notes`)
        .set('Authorization', 'Bearer mock-token')
        .send({})
        .expect(400);

      expect(mockBookmarksService.updateNotes).not.toHaveBeenCalled();
    });

    it('400 bad request — notes exceeds 500 characters', async () => {
      await request(app.getHttpServer())
        .patch(`/bookmarks/${BM_ID}/notes`)
        .set('Authorization', 'Bearer mock-token')
        .send({ notes: 'x'.repeat(501) })
        .expect(400);

      expect(mockBookmarksService.updateNotes).not.toHaveBeenCalled();
    });
  });

  // ── DELETE /bookmarks/:id ──────────────────────────────────────────────────

  describe('DELETE /bookmarks/:id', () => {
    it('returns 200 with {status:"deleted"} on success', async () => {
      mockBookmarksService.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/bookmarks/${BM_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(res.body).toEqual({ status: 'deleted' });
      expect(mockBookmarksService.remove).toHaveBeenCalledWith(BM_ID, USER_A);
    });

    it('AC-4: returns 403 when bookmark belongs to another user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockBookmarksService.remove.mockRejectedValue(new ForbiddenException());

      await request(app.getHttpServer())
        .delete(`/bookmarks/${BM_ID}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(403);
    });

    it('AC-10: returns 404 when bookmark does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockBookmarksService.remove.mockRejectedValue(new NotFoundException('Bookmark not found'));

      await request(app.getHttpServer())
        .delete('/bookmarks/nonexistent-id')
        .set('Authorization', 'Bearer mock-token')
        .expect(404);
    });
  });
});
