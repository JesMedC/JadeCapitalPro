/**
 * BookmarksService — unit tests with mocked TypeORM repository.
 *
 * Covers:
 * - AC-2:  POST creates bookmark with correct user_id
 * - AC-3:  GET isolation — user A cannot see user B's bookmarks
 * - AC-4:  DELETE → 403 when caller is not owner
 * - AC-5:  Idempotent POST — second call returns existing row
 * - AC-10: Delete non-existent bookmark → NotFoundException
 * - AC-12: GET returns [] for user with no bookmarks
 */

import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BookmarksService } from '../bookmarks.service';
import { PatternBookmark } from '../entities/pattern-bookmark.entity';
import { CreateBookmarkDto } from '../dto/create-bookmark.dto';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const BM_ID_A = '11111111-0000-0000-0000-000000000001';
const BM_ID_B = '22222222-0000-0000-0000-000000000002';

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeBookmark(overrides: Partial<PatternBookmark> = {}): PatternBookmark {
  return {
    id: BM_ID_A,
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

function makeDto(overrides: Partial<CreateBookmarkDto> = {}): CreateBookmarkDto {
  return {
    instrument: 'EUR/USD',
    timeframe: '1h',
    pattern: 'Gartley',
    direction: 'BULLISH',
    ...overrides,
  };
}

// ── Builder ────────────────────────────────────────────────────────────────

function buildService() {
  const bookmarkRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    updateNotes: jest.fn(),
  } as unknown as Repository<PatternBookmark>;

  const service = new BookmarksService(bookmarkRepository);
  return { service, bookmarkRepository };
}

// ── findAll ────────────────────────────────────────────────────────────────

describe('BookmarksService.findAll', () => {
  it('AC-12: returns [] for user with no bookmarks', async () => {
    const { service, bookmarkRepository } = buildService();
    (bookmarkRepository.find as jest.Mock).mockResolvedValue([]);

    const result = await service.findAll(USER_A);

    expect(result).toEqual([]);
    expect(bookmarkRepository.find).toHaveBeenCalledWith({
      where: { userId: USER_A },
      order: { createdAt: 'DESC' },
    });
  });

  it('AC-3: user A cannot see user B bookmarks', async () => {
    const { service, bookmarkRepository } = buildService();

    const bmA = makeBookmark({ id: BM_ID_A, userId: USER_A });
    const bmB = makeBookmark({ id: BM_ID_B, userId: USER_B });

    (bookmarkRepository.find as jest.Mock).mockImplementation(
      (opts: { where: { userId: string } }) => {
        const { userId } = opts.where;
        const all = [bmA, bmB];
        return Promise.resolve(all.filter((b) => b.userId === userId));
      },
    );

    const resultsA = await service.findAll(USER_A);
    const resultsB = await service.findAll(USER_B);

    expect(resultsA).toHaveLength(1);
    expect(resultsA[0].userId).toBe(USER_A);
    expect(resultsA.some((b) => b.userId === USER_B)).toBe(false);

    expect(resultsB).toHaveLength(1);
    expect(resultsB[0].userId).toBe(USER_B);
    expect(resultsB.some((b) => b.userId === USER_A)).toBe(false);
  });

  it('returns multiple bookmarks owned by the same user', async () => {
    const { service, bookmarkRepository } = buildService();

    const bms = [
      makeBookmark({ id: BM_ID_A, pattern: 'Gartley' }),
      makeBookmark({ id: BM_ID_B, pattern: 'Bat' }),
    ];
    (bookmarkRepository.find as jest.Mock).mockResolvedValue(bms);

    const result = await service.findAll(USER_A);

    expect(result).toHaveLength(2);
    expect(result.every((b) => b.userId === USER_A)).toBe(true);
  });
});

// ── upsert ─────────────────────────────────────────────────────────────────

describe('BookmarksService.upsert', () => {
  it('AC-2: creates bookmark with correct user_id and returns created=true', async () => {
    const { service, bookmarkRepository } = buildService();

    const dto = makeDto();
    const saved = makeBookmark({ userId: USER_A });

    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(null);
    (bookmarkRepository.create as jest.Mock).mockReturnValue(saved);
    (bookmarkRepository.save as jest.Mock).mockResolvedValue(saved);

    const result = await service.upsert(USER_A, dto);

    expect(result.created).toBe(true);
    expect(result.bookmark.userId).toBe(USER_A);
    expect(bookmarkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A }),
    );
  });

  it('AC-5: idempotent — second POST with same compound key returns created=false', async () => {
    const { service, bookmarkRepository } = buildService();

    const existing = makeBookmark({ userId: USER_A });
    const dto = makeDto();

    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(existing);

    const result = await service.upsert(USER_A, dto);

    expect(result.created).toBe(false);
    expect(result.bookmark).toBe(existing);
    // No new row should be inserted
    expect(bookmarkRepository.create).not.toHaveBeenCalled();
    expect(bookmarkRepository.save).not.toHaveBeenCalled();
  });

  it('AC-5: single row — second upsert does not create duplicate', async () => {
    const { service, bookmarkRepository } = buildService();

    const dto = makeDto();
    const saved = makeBookmark({ userId: USER_A });

    // First call: no existing row
    (bookmarkRepository.findOne as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);
    (bookmarkRepository.create as jest.Mock).mockReturnValue(saved);
    (bookmarkRepository.save as jest.Mock).mockResolvedValue(saved);

    const first = await service.upsert(USER_A, dto);
    const second = await service.upsert(USER_A, dto);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(bookmarkRepository.save).toHaveBeenCalledTimes(1);
  });

  it('stores user_id from the parameter, not from any body injection', async () => {
    const { service, bookmarkRepository } = buildService();

    const dto = makeDto();
    const saved = makeBookmark({ userId: USER_B });

    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(null);
    (bookmarkRepository.create as jest.Mock).mockReturnValue(saved);
    (bookmarkRepository.save as jest.Mock).mockResolvedValue(saved);

    await service.upsert(USER_B, dto);

    expect(bookmarkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_B }),
    );
  });
});

// ── remove ─────────────────────────────────────────────────────────────────

describe('BookmarksService.remove', () => {
  it('AC-4: throws ForbiddenException when caller does not own the bookmark', async () => {
    const { service, bookmarkRepository } = buildService();

    const bmOwnedByB = makeBookmark({ id: BM_ID_A, userId: USER_B });
    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(bmOwnedByB);

    await expect(service.remove(BM_ID_A, USER_A)).rejects.toThrow(ForbiddenException);
    expect(bookmarkRepository.remove).not.toHaveBeenCalled();
  });

  it('AC-10: throws NotFoundException for non-existent bookmark', async () => {
    const { service, bookmarkRepository } = buildService();

    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.remove('nonexistent-id', USER_A)).rejects.toThrow(NotFoundException);
    expect(bookmarkRepository.remove).not.toHaveBeenCalled();
  });

  it('removes the bookmark when caller is the owner', async () => {
    const { service, bookmarkRepository } = buildService();

    const bm = makeBookmark({ id: BM_ID_A, userId: USER_A });
    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(bm);
    (bookmarkRepository.remove as jest.Mock).mockResolvedValue(undefined);

    await service.remove(BM_ID_A, USER_A);

    expect(bookmarkRepository.remove).toHaveBeenCalledWith(bm);
  });
});

// ── updateNotes ────────────────────────────────────────────────────────────

describe('BookmarksService.updateNotes', () => {
  it('success path — updates notes and returns updated entity', async () => {
    const { service, bookmarkRepository } = buildService();

    const original = makeBookmark({ userId: USER_A, notes: null });
    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(original);
    (bookmarkRepository.save as jest.Mock).mockImplementation(async (bm) => bm);

    const result = await service.updateNotes(BM_ID_A, USER_A, 'New note text');

    expect(bookmarkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'New note text' }),
    );
    expect(result.notes).toBe('New note text');
  });

  it('forbidden path — throws ForbiddenException when caller is not owner', async () => {
    const { service, bookmarkRepository } = buildService();

    const ownedByB = makeBookmark({ userId: USER_B });
    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(ownedByB);

    await expect(service.updateNotes(BM_ID_A, USER_A, 'text')).rejects.toThrow(ForbiddenException);
    expect(bookmarkRepository.save).not.toHaveBeenCalled();
  });

  it('not-found path — throws NotFoundException when bookmark does not exist', async () => {
    const { service, bookmarkRepository } = buildService();

    (bookmarkRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.updateNotes('nonexistent-id', USER_A, 'text')).rejects.toThrow(NotFoundException);
  });
});

// ── Multi-user isolation — concurrent users ────────────────────────────────

describe('BookmarksService — multi-user isolation', () => {
  it('two users can bookmark the same signal independently', async () => {
    const { service, bookmarkRepository } = buildService();

    const bmA = makeBookmark({ id: BM_ID_A, userId: USER_A });
    const bmB = makeBookmark({ id: BM_ID_B, userId: USER_B });

    (bookmarkRepository.find as jest.Mock).mockImplementation(
      (opts: { where: { userId: string } }) => {
        const { userId } = opts.where;
        if (userId === USER_A) return Promise.resolve([bmA]);
        if (userId === USER_B) return Promise.resolve([bmB]);
        return Promise.resolve([]);
      },
    );

    const [listA, listB] = await Promise.all([
      service.findAll(USER_A),
      service.findAll(USER_B),
    ]);

    expect(listA).toHaveLength(1);
    expect(listA[0].id).toBe(BM_ID_A);

    expect(listB).toHaveLength(1);
    expect(listB[0].id).toBe(BM_ID_B);

    expect(listA.some((b) => b.userId === USER_B)).toBe(false);
    expect(listB.some((b) => b.userId === USER_A)).toBe(false);
  });
});
