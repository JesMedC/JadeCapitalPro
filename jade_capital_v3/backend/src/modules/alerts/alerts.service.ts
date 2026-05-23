import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert, AlertStatus } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { AlertEvaluatorService } from './alert-evaluator.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    private readonly evaluator: AlertEvaluatorService,
  ) {}

  async findAll(userId: string): Promise<Alert[]> {
    return this.alertRepository.find({ where: { userId } });
  }

  async findById(id: string, userId: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.userId !== userId) throw new ForbiddenException();
    return alert;
  }

  async create(userId: string, dto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      ...dto,
      userId,
      status: AlertStatus.ACTIVE,
    });
    const saved = await this.alertRepository.save(alert);

    // Invalidate evaluator cache so new alert is picked up on the next tick
    await this.evaluator.invalidateCache(saved.instrument);

    return saved;
  }

  async update(id: string, userId: string, dto: UpdateAlertDto): Promise<Alert> {
    const alert = await this.findById(id, userId);
    Object.assign(alert, dto);
    const saved = await this.alertRepository.save(alert);

    // Re-seed the evaluator bucket for this instrument
    await this.evaluator.invalidateCache(saved.instrument);

    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const alert = await this.findById(id, userId);
    const instrument = alert.instrument;
    await this.alertRepository.remove(alert);

    // Remove the deleted alert from the evaluator cache
    await this.evaluator.invalidateCache(instrument);
  }
}
