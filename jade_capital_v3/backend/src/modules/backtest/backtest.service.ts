import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BacktestSession } from './entities/backtest-session.entity';
import { CreateBacktestDto } from './dto/create-backtest.dto';

@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);

  constructor(
    @InjectRepository(BacktestSession)
    private readonly sessionRepository: Repository<BacktestSession>,
    @InjectQueue('backtest')
    private readonly backtestQueue: Queue,
  ) {}

  async findAll(userId: string): Promise<BacktestSession[]> {
    return this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<BacktestSession> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Backtest session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }

  async create(userId: string, dto: CreateBacktestDto): Promise<BacktestSession> {
    const session = this.sessionRepository.create({
      name: dto.name,
      config: dto.config as unknown as Record<string, unknown>,
      userId,
    });
    const saved = await this.sessionRepository.save(session);

    await this.backtestQueue.add('run-backtest', {
      sessionId: saved.id,
      userId,
      config: dto.config,
    });

    this.logger.log(`Backtest session created: ${saved.id}`);
    return saved;
  }

  async delete(id: string, userId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Backtest session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    await this.sessionRepository.remove(session);
  }
}
