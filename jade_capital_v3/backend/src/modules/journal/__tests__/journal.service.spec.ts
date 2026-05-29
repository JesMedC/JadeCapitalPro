/**
 * Task 2.2 — Unit tests for JournalService.findAll filtering.
 *
 * Covers:
 * - Emotion filter (exact match)
 * - Date range filter (start, end, combined)
 * - Multi-user isolation: userId always injected as a mandatory WHERE clause
 * - No filters: returns all entries for a given user in DESC order
 *
 * Strategy: mock the TypeORM Repository with a mock SelectQueryBuilder.
 * The mock captures all `.where()`, `.andWhere()`, `.orderBy()` calls and
 * their parameters so we can assert the correct SQL conditions without
 * hitting a real database.
 */

import 'reflect-metadata';
import { JournalService } from '../journal.service';
import { JournalEntry } from '../entities/journal-entry.entity';
import { EmotionTag } from '../enums/emotion-tag.enum';
import { Repository } from 'typeorm';

// ── Mock query builder ─────────────────────────────────────────────────────

interface CallRecord {
  condition: string;
  params: Record<string, unknown>;
}

function buildMockQueryBuilder(returnData: JournalEntry[] = []) {
  const calls: {
    where: CallRecord[];
    andWhere: CallRecord[];
    orderBy: { column: string; direction: string }[];
  } = {
    where: [],
    andWhere: [],
    orderBy: [],
  };

  const qb = {
    calls,
    where: jest.fn().mockImplementation((cond: string, params: Record<string, unknown>) => {
      calls.where.push({ condition: cond, params });
      return qb;
    }),
    andWhere: jest.fn().mockImplementation((cond: string, params: Record<string, unknown>) => {
      calls.andWhere.push({ condition: cond, params });
      return qb;
    }),
    orderBy: jest.fn().mockImplementation((col: string, dir: string) => {
      calls.orderBy.push({ column: col, direction: dir });
      return qb;
    }),
    getMany: jest.fn().mockResolvedValue(returnData),
  };

  return qb;
}

function buildMockRepository(qb: ReturnType<typeof buildMockQueryBuilder>) {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<JournalEntry>;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: '11111111-0000-0000-0000-000000000001',
    userId: USER_A,
    title: 'Test entry',
    content: null,
    emotion: null,
    tradeIds: null,
    tags: null,
    mood: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    user: undefined as never,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JournalService.findAll', () => {
  // ── No filters ────────────────────────────────────────────────────────────

  describe('with no filters', () => {
    it('always applies a userId WHERE clause', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A);

      expect(qb.where).toHaveBeenCalledWith(
        'entry.userId = :userId',
        expect.objectContaining({ userId: USER_A }),
      );
    });

    it('orders results by createdAt DESC', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A);

      expect(qb.orderBy).toHaveBeenCalledWith('entry.createdAt', 'DESC');
    });

    it('adds no additional andWhere calls when no filters provided', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, {});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('returns entries from the query builder', async () => {
      const entries = [makeEntry(), makeEntry({ id: '22222222-0000-0000-0000-000000000002' })];
      const qb = buildMockQueryBuilder(entries);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      const result = await service.findAll(USER_A);

      expect(result).toEqual(entries);
    });
  });

  // ── Emotion filter ─────────────────────────────────────────────────────────

  describe('with emotion filter', () => {
    it('adds an andWhere clause for emotion exact match', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, { emotion: EmotionTag.CALM });

      const emotionCall = qb.calls.andWhere.find((c) =>
        c.condition.includes('entry.emotion'),
      );
      expect(emotionCall).toBeDefined();
      expect(emotionCall?.params).toEqual(expect.objectContaining({ emotion: EmotionTag.CALM }));
    });

    it('does NOT add an emotion andWhere when emotion is undefined', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, { startDate: undefined, endDate: undefined });

      const emotionCall = qb.calls.andWhere.find((c) =>
        c.condition.includes('entry.emotion'),
      );
      expect(emotionCall).toBeUndefined();
    });
  });

  // ── Date range filter ──────────────────────────────────────────────────────

  describe('with date range filters', () => {
    it('adds a startDate andWhere clause with beginning-of-day time', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, { startDate: '2026-01-01' });

      const startCall = qb.calls.andWhere.find((c) =>
        c.condition.includes(':startDate'),
      );
      expect(startCall).toBeDefined();
      const startDate = startCall?.params['startDate'] as Date;
      expect(startDate).toBeInstanceOf(Date);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);
      expect(startDate.getMilliseconds()).toBe(0);
    });

    it('adds an endDate andWhere clause with end-of-day time', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, { endDate: '2026-03-31' });

      const endCall = qb.calls.andWhere.find((c) =>
        c.condition.includes(':endDate'),
      );
      expect(endCall).toBeDefined();
      const endDate = endCall?.params['endDate'] as Date;
      expect(endDate).toBeInstanceOf(Date);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);
      expect(endDate.getMilliseconds()).toBe(999);
    });

    it('applies both startDate and endDate when both provided', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      });

      const startCall = qb.calls.andWhere.find((c) => c.condition.includes(':startDate'));
      const endCall = qb.calls.andWhere.find((c) => c.condition.includes(':endDate'));
      expect(startCall).toBeDefined();
      expect(endCall).toBeDefined();
    });

    it('combines emotion + date range as separate AND clauses', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A, {
        emotion: EmotionTag.CONFIDENT,
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });

      expect(qb.calls.andWhere.length).toBe(3); // emotion + start + end
    });
  });

  // ── Multi-user isolation ───────────────────────────────────────────────────

  describe('multi-user isolation', () => {
    it('uses USER_A userId when calling findAll for USER_A', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A);

      expect(qb.where).toHaveBeenCalledWith(
        'entry.userId = :userId',
        expect.objectContaining({ userId: USER_A }),
      );
      expect(qb.where).not.toHaveBeenCalledWith(
        'entry.userId = :userId',
        expect.objectContaining({ userId: USER_B }),
      );
    });

    it('uses USER_B userId when calling findAll for USER_B', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_B);

      expect(qb.where).toHaveBeenCalledWith(
        'entry.userId = :userId',
        expect.objectContaining({ userId: USER_B }),
      );
    });

    it('createQueryBuilder is called with the table alias "entry"', async () => {
      const qb = buildMockQueryBuilder([]);
      const repo = buildMockRepository(qb);
      const service = new JournalService(repo);

      await service.findAll(USER_A);

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('entry');
    });
  });
});
