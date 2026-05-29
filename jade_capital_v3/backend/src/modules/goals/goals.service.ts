import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './entities/goal.entity';
import { Trade, TradeStatus } from '../trades/entities/trade.entity';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalQueryDto } from './dto/goal-query.dto';
import { GoalResponseDto } from './dto/goal-response.dto';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  async findAll(
    userId: string,
    filters: GoalQueryDto,
  ): Promise<GoalResponseDto[]> {
    const where: Record<string, unknown> = { userId };

    if (filters.activeOnly === true) {
      where['isActive'] = true;
    }
    if (filters.accountId) {
      where['accountId'] = filters.accountId;
    }

    const goals = await this.goalRepository.find({ where });

    const results: GoalResponseDto[] = [];
    for (const goal of goals) {
      const { currentValue, progressPct } =
        await this._calculateProgress(goal);
      await this._applyAutoComplete(goal, progressPct);
      results.push(this._toResponseDto(goal, currentValue, progressPct));
    }
    return results;
  }

  async findById(id: string, userId: string): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();

    const { currentValue, progressPct } = await this._calculateProgress(goal);
    await this._applyAutoComplete(goal, progressPct);
    return this._toResponseDto(goal, currentValue, progressPct);
  }

  async create(
    userId: string,
    dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    const goal = this.goalRepository.create({ ...dto, userId });
    const saved = await this.goalRepository.save(goal);

    // New goal always has 0 progress, but return shape must be consistent
    const { currentValue, progressPct } =
      await this._calculateProgress(saved);
    return this._toResponseDto(saved, currentValue, progressPct);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();

    Object.assign(goal, dto);
    const saved = await this.goalRepository.save(goal);

    const { currentValue, progressPct } =
      await this._calculateProgress(saved);
    await this._applyAutoComplete(saved, progressPct);
    return this._toResponseDto(saved, currentValue, progressPct);
  }

  async remove(id: string, userId: string): Promise<void> {
    const goal = await this.goalRepository.findOne({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.userId !== userId) throw new ForbiddenException();
    await this.goalRepository.remove(goal);
  }

  // ─────────────────────────────────────────────────────────────────
  // Progress engine — private
  // ─────────────────────────────────────────────────────────────────

  private async _calculateProgress(
    goal: Goal,
  ): Promise<{ currentValue: number; progressPct: number }> {
    const trades = await this._fetchRelevantTrades(goal);

    let currentValue: number;
    switch (goal.goalType) {
      case 'pnl':
        currentValue = this._calcPnl(trades);
        break;
      case 'winrate':
        currentValue = this._calcWinrate(trades);
        break;
      case 'trades':
        currentValue = this._calcTradeCount(trades);
        break;
      case 'streak':
        currentValue = this._calcStreak(trades);
        break;
      case 'drawdown':
        currentValue = this._calcDrawdown(trades);
        break;
      default:
        currentValue = 0;
    }

    const progressPct = this._toProgressPct(
      goal.goalType,
      currentValue,
      Number(goal.targetValue),
    );

    return { currentValue, progressPct };
  }

  private async _fetchRelevantTrades(goal: Goal): Promise<Trade[]> {
    const startDate = new Date(goal.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(goal.endDate);
    endDate.setHours(23, 59, 59, 999);

    const qb = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.userId = :userId', { userId: goal.userId }) // multi-user isolation
      .andWhere('trade.status IN (:...statuses)', {
        statuses: [TradeStatus.WON, TradeStatus.LOST, TradeStatus.BE],
      })
      .andWhere('trade.createdAt >= :startDate', { startDate })
      .andWhere('trade.createdAt <= :endDate', { endDate })
      .orderBy('trade.createdAt', 'ASC'); // ASC required for streak + drawdown sequential logic

    if (goal.accountId) {
      qb.andWhere('trade.accountId = :accountId', {
        accountId: goal.accountId,
      });
    }

    return qb.getMany();
  }

  private async _applyAutoComplete(
    goal: Goal,
    progressPct: number,
  ): Promise<void> {
    if (progressPct >= 100 && !goal.isCompleted) {
      goal.isCompleted = true;
      goal.completedAt = new Date();
      await this.goalRepository.save(goal);
    }
    // When goal.isCompleted is already true: do nothing — preserves original completedAt
  }

  private _toResponseDto(
    goal: Goal,
    currentValue: number,
    progressPct: number,
  ): GoalResponseDto {
    return {
      id: goal.id,
      userId: goal.userId,
      accountId: goal.accountId,
      title: goal.title,
      goalType: goal.goalType,
      targetValue: Number(goal.targetValue),
      currentValue,
      progressPct,
      isCompleted: goal.isCompleted,
      isActive: goal.isActive,
      period: goal.period,
      notes: goal.notes,
      startDate: goal.startDate,
      endDate: goal.endDate,
      completedAt: goal.completedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Pure calculation helpers — private, unit-testable
  // ─────────────────────────────────────────────────────────────────

  private _calcPnl(trades: Trade[]): number {
    return trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
  }

  private _calcTradeCount(trades: Trade[]): number {
    return trades.length;
  }

  private _calcWinrate(trades: Trade[]): number {
    if (trades.length === 0) return 0; // guard: no division by zero
    const won = trades.filter((t) => t.status === TradeStatus.WON).length;
    return (won / trades.length) * 100;
  }

  // Max consecutive WON sequence — LOST or BE resets counter
  private _calcStreak(trades: Trade[]): number {
    let maxStreak = 0;
    let currentStreak = 0;
    for (const trade of trades) {
      // trades are sorted ASC by createdAt (from _fetchRelevantTrades)
      if (trade.status === TradeStatus.WON) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    return maxStreak;
  }

  // Max peak-to-trough drop of running PnL cumsum
  private _calcDrawdown(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    let peak = 0;
    let cumPnl = 0;
    let maxDrawdown = 0;
    for (const trade of trades) {
      // trades are sorted ASC by createdAt (from _fetchRelevantTrades)
      cumPnl += Number(trade.pnl ?? 0);
      if (cumPnl > peak) peak = cumPnl;
      const drawdown = peak - cumPnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown;
  }

  // Inverse for drawdown (0 drawdown = 100% safe; full drawdown = 0% safe)
  private _toProgressPct(
    goalType: string,
    currentValue: number,
    targetValue: number,
  ): number {
    if (targetValue <= 0) return 0;
    if (goalType === 'drawdown') {
      const pct = 100 - (currentValue / targetValue) * 100;
      return Math.max(0, Math.min(100, pct));
    }
    const pct = (currentValue / targetValue) * 100;
    return Math.max(0, Math.min(100, pct));
  }
}
