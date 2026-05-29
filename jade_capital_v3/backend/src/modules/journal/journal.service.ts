import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { JournalEntry } from './entities/journal-entry.entity';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalQueryDto } from './dto/journal-query.dto';

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalRepository: Repository<JournalEntry>,
  ) {}

  async findAll(userId: string, filters: JournalQueryDto = {}): Promise<JournalEntry[]> {
    const qb: SelectQueryBuilder<JournalEntry> = this.journalRepository
      .createQueryBuilder('entry')
      .where('entry.userId = :userId', { userId })
      .orderBy('entry.createdAt', 'DESC');

    if (filters.emotion) {
      qb.andWhere('entry.emotion = :emotion', { emotion: filters.emotion });
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      qb.andWhere('entry.createdAt >= :startDate', { startDate: start });
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('entry.createdAt <= :endDate', { endDate: end });
    }

    return qb.getMany();
  }

  async findById(id: string, userId: string): Promise<JournalEntry> {
    const entry = await this.journalRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();
    return entry;
  }

  async create(userId: string, dto: CreateJournalEntryDto): Promise<JournalEntry> {
    const entry = this.journalRepository.create({ ...dto, userId });
    return this.journalRepository.save(entry);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateJournalEntryDto,
  ): Promise<JournalEntry> {
    const entry = await this.findById(id, userId);
    Object.assign(entry, dto);
    return this.journalRepository.save(entry);
  }

  async remove(id: string, userId: string): Promise<void> {
    const entry = await this.findById(id, userId);
    await this.journalRepository.remove(entry);
  }
}
