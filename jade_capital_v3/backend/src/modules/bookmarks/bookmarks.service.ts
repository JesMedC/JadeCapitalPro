import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatternBookmark } from './entities/pattern-bookmark.entity';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';

export interface CreateResult {
  bookmark: PatternBookmark;
  created: boolean;
}

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(PatternBookmark)
    private readonly bookmarkRepository: Repository<PatternBookmark>,
  ) {}

  async findAll(userId: string): Promise<PatternBookmark[]> {
    return this.bookmarkRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * First-or-create by compound key.
   * Returns `created: true` (HTTP 201) when a new row was inserted,
   * `created: false` (HTTP 200) when the bookmark already existed.
   */
  async upsert(userId: string, dto: CreateBookmarkDto): Promise<CreateResult> {
    const existing = await this.bookmarkRepository.findOne({
      where: {
        userId,
        instrument: dto.instrument,
        timeframe: dto.timeframe,
        pattern: dto.pattern,
        direction: dto.direction,
      },
    });

    if (existing) {
      return { bookmark: existing, created: false };
    }

    const bookmark = this.bookmarkRepository.create({
      userId,
      instrument: dto.instrument,
      timeframe: dto.timeframe,
      pattern: dto.pattern,
      direction: dto.direction,
      notes: dto.notes ?? null,
    });

    const saved = await this.bookmarkRepository.save(bookmark);
    return { bookmark: saved, created: true };
  }

  async remove(id: string, userId: string): Promise<void> {
    const bookmark = await this.bookmarkRepository.findOne({ where: { id } });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.userId !== userId) {
      throw new ForbiddenException('You do not own this bookmark');
    }

    await this.bookmarkRepository.remove(bookmark);
  }

  async updateNotes(
    id: string,
    userId: string,
    notes: string,
  ): Promise<PatternBookmark> {
    const bookmark = await this.bookmarkRepository.findOne({ where: { id } });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.userId !== userId) {
      throw new ForbiddenException('You do not own this bookmark');
    }

    bookmark.notes = notes;
    return this.bookmarkRepository.save(bookmark);
  }
}
