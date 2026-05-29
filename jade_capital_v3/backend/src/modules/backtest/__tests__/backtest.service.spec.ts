/**
 * Unit tests for BacktestService.
 *
 * Strategy: mock the TypeORM Repository and Bull Queue directly —
 * no database or Redis needed.
 *
 * Covers:
 * - findAll returns only sessions for the requesting user (multi-user isolation)
 * - findById returns the session when ownership matches
 * - findById throws NotFoundException when session not found
 * - findById throws ForbiddenException when session belongs to a different user
 * - create inserts a session, enqueues a job, and returns the session
 * - delete removes the session when ownership matches
 * - delete throws NotFoundException when session not found
 * - delete throws ForbiddenException when session belongs to a different user
 */

import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BacktestService } from '../backtest.service';
import { BacktestSession, BacktestStatus } from '../entities/backtest-session.entity';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { CreateBacktestDto } from '../dto/create-backtest.dto';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const SESSION_ID = 'ssssssss-0000-0000-0000-000000000001';

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function buildMockRepo(overrides: Partial<Repository<BacktestSession>> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockReturnValue(makeSession()),
    save: jest.fn().mockResolvedValue(makeSession()),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Repository<BacktestSession>;
}

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  } as unknown as Queue;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BacktestService', () => {
  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls repository.find with userId = USER_A (multi-user isolation)', async () => {
      const repo = buildMockRepo({
        find: jest.fn().mockResolvedValue([makeSession()]),
      });
      const service = new BacktestService(repo, buildMockQueue());

      await service.findAll(USER_A);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_A },
        }),
      );
    });

    it('returns only sessions for the requesting user', async () => {
      const sessionA = makeSession({ userId: USER_A });
      const repo = buildMockRepo({
        find: jest.fn().mockResolvedValue([sessionA]),
      });
      const service = new BacktestService(repo, buildMockQueue());

      const result = await service.findAll(USER_A);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(USER_A);
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the session when userId matches', async () => {
      const session = makeSession();
      const repo = buildMockRepo({
        findOne: jest.fn().mockResolvedValue(session),
      });
      const service = new BacktestService(repo, buildMockQueue());

      const result = await service.findById(SESSION_ID, USER_A);
      expect(result.id).toBe(SESSION_ID);
    });

    it('throws NotFoundException when session does not exist', async () => {
      const repo = buildMockRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const service = new BacktestService(repo, buildMockQueue());

      await expect(service.findById(SESSION_ID, USER_A)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when session belongs to a different user', async () => {
      const session = makeSession({ userId: USER_B });
      const repo = buildMockRepo({ findOne: jest.fn().mockResolvedValue(session) });
      const service = new BacktestService(repo, buildMockQueue());

      await expect(service.findById(SESSION_ID, USER_A)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('saves a session and enqueues a run-backtest job', async () => {
      const savedSession = makeSession();
      const repo = buildMockRepo({
        create: jest.fn().mockReturnValue(savedSession),
        save: jest.fn().mockResolvedValue(savedSession),
      });
      const queue = buildMockQueue();
      const service = new BacktestService(repo, queue);

      const dto: CreateBacktestDto = {
        name: 'Test run',
        config: {
          instrument: 'EUR/USD',
          timeframe: '15m',
          strategy: 'candle-direction',
          lastNCandles: 50,
        },
      };

      const result = await service.create(USER_A, dto);

      expect(repo.save).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'run-backtest',
        expect.objectContaining({
          sessionId: savedSession.id,
          userId: USER_A,
        }),
      );
      expect(result.id).toBe(SESSION_ID);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes the session when userId matches', async () => {
      const session = makeSession();
      const repo = buildMockRepo({
        findOne: jest.fn().mockResolvedValue(session),
        remove: jest.fn().mockResolvedValue(undefined),
      });
      const service = new BacktestService(repo, buildMockQueue());

      await expect(service.delete(SESSION_ID, USER_A)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(session);
    });

    it('throws NotFoundException when session does not exist', async () => {
      const repo = buildMockRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const service = new BacktestService(repo, buildMockQueue());

      await expect(service.delete(SESSION_ID, USER_A)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when session belongs to a different user', async () => {
      const session = makeSession({ userId: USER_B });
      const repo = buildMockRepo({ findOne: jest.fn().mockResolvedValue(session) });
      const service = new BacktestService(repo, buildMockQueue());

      await expect(service.delete(SESSION_ID, USER_A)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
