import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trade, TradeStatus, TradeType, TradeDirection } from './entities/trade.entity';
import { TradingAccount } from '../accounts/entities/trading-account.entity';
import { OpenTradeDto } from './dto/open-trade.dto';
import { CloseBinaryTradeDto, CloseForexTradeDto } from './dto/close-trade.dto';
import { TradingGateway } from '../../websockets/trading.gateway';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
    @InjectRepository(TradingAccount)
    private readonly accountRepository: Repository<TradingAccount>,
    private readonly tradingGateway: TradingGateway,
  ) {}

  // ─── Queries ──────────────────────────────────────────────────────────

  async findByAccount(
    accountId: string,
    userId: string,
    status?: string,
  ): Promise<Trade[]> {
    const where: Record<string, unknown> = { accountId, userId };
    if (status) where.status = status;

    return this.tradeRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<Trade> {
    const trade = await this.tradeRepository.findOne({ where: { id } });
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.userId !== userId) throw new ForbiddenException();
    return trade;
  }

  // ─── Open Trade ───────────────────────────────────────────────────────

  async openTrade(userId: string, dto: OpenTradeDto): Promise<Trade> {
    // Validate and load account
    const account = await this.accountRepository.findOne({
      where: { id: dto.accountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Determine trade type from account
    const type = account.marketType as unknown as TradeType;

    // Validate direction matches trade type
    this.validateDirection(type, dto.direction);

    // Validate binary-specific fields
    if (type === TradeType.BINARY && !dto.payoutPct) {
      throw new BadRequestException('payoutPct is required for binary trades');
    }
    if (type === TradeType.BINARY && !dto.expiryTime) {
      throw new BadRequestException('expiryTime is required for binary trades');
    }

    // Validate balance
    const balance = Number(account.balance);
    if (balance < dto.investment) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${balance}, Required: ${dto.investment}`,
      );
    }

    try {
      // Deduct investment from balance
      account.balance = balance - dto.investment;
      await this.accountRepository.save(account);

      // Build trade entity
      const trade = this.tradeRepository.create({
        userId,
        accountId: dto.accountId,
        type,
        instrument: dto.instrument,
        direction: dto.direction as TradeDirection,
        entryPrice: dto.entryPrice ?? 0,
        amount: dto.investment,
        status: TradeStatus.OPEN,
        payoutPct: dto.payoutPct ?? null,
        expiryTime: dto.expiryTime ?? null,
        stopLoss: dto.stopLoss ?? null,
        takeProfit: dto.takeProfit ?? null,
      });

      const saved = await this.tradeRepository.save(trade);

      // Broadcast notification
      this.tradingGateway.broadcastTrade(userId, {
        event: 'trade:opened',
        trade: {
          id: saved.id,
          type: saved.type,
          instrument: saved.instrument,
          direction: saved.direction,
          amount: saved.amount,
          status: saved.status,
        },
        accountId: account.id,
      });

      this.logger.log(
        `Trade opened: ${saved.id} (${saved.type}) by user ${userId}`,
      );

      return saved;
    } catch (error) {
      // Rollback balance deduction on error
      account.balance = balance;
      await this.accountRepository.save(account).catch(() => {});
      throw error;
    }
  }

  // ─── Close Binary Trade ──────────────────────────────────────────────

  async closeBinaryTrade(
    tradeId: string,
    userId: string,
    dto: CloseBinaryTradeDto,
  ): Promise<Trade> {
    const trade = await this.findById(tradeId, userId);

    if (trade.type !== TradeType.BINARY) {
      throw new BadRequestException('Trade is not a binary trade');
    }
    if (trade.status !== TradeStatus.OPEN) {
      throw new BadRequestException('Trade is already closed');
    }

    const account = await this.accountRepository.findOne({
      where: { id: trade.accountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Associated account not found');
    }

    const balance = Number(account.balance);
    const amount = Number(trade.amount);
    const pctRaw = Number(trade.payoutPct ?? 0);
    // Coalesce legacy fractional values (e.g. 0.77) to integer percent (77)
    const payoutPct = pctRaw < 1 ? pctRaw * 100 : pctRaw;
    let pnl: number;
    let newStatus: TradeStatus;

    switch (dto.result) {
      case 'win': {
        pnl = amount * (payoutPct / 100);
        newStatus = TradeStatus.WON;
        account.balance = balance + amount + pnl;
        break;
      }
      case 'loss': {
        pnl = -amount;
        newStatus = TradeStatus.LOST;
        // Balance already deducted at open, no further deduction
        break;
      }
      case 'be': {
        pnl = 0;
        newStatus = TradeStatus.BE;
        account.balance = balance + amount; // Return investment
        break;
      }
      default:
        throw new BadRequestException(
          'Invalid result. Must be: win, loss, or be',
        );
    }

    trade.status = newStatus;
    trade.pnl = Math.round(pnl * 100) / 100;

    await this.accountRepository.save(account);
    const saved = await this.tradeRepository.save(trade);

    // Broadcast notification
    this.tradingGateway.broadcastTrade(userId, {
      event: 'trade:closed',
      trade: {
        id: saved.id,
        type: saved.type,
        instrument: saved.instrument,
        status: saved.status,
        pnl: saved.pnl,
        result: dto.result,
      },
      accountId: account.id,
    });

    this.logger.log(
      `Binary trade closed: ${saved.id} → ${dto.result} (pnl: ${saved.pnl})`,
    );

    return saved;
  }

  // ─── Close Forex Trade ────────────────────────────────────────────────

  async closeForexTrade(
    tradeId: string,
    userId: string,
    dto: CloseForexTradeDto,
  ): Promise<Trade> {
    const trade = await this.findById(tradeId, userId);

    if (trade.type !== TradeType.FOREX) {
      throw new BadRequestException('Trade is not a forex trade');
    }
    if (trade.status !== TradeStatus.OPEN) {
      throw new BadRequestException('Trade is already closed');
    }

    const account = await this.accountRepository.findOne({
      where: { id: trade.accountId, userId },
    });
    if (!account) {
      throw new NotFoundException('Associated account not found');
    }

    const entryPrice = Number(trade.entryPrice);
    const exitPrice = dto.exitPrice;
    const amount = Number(trade.amount);
    const balance = Number(account.balance);

    if (entryPrice <= 0) {
      throw new BadRequestException('Invalid entry price on trade record');
    }

    // Calculate PnL based on direction
    let pnl: number;
    const direction = trade.direction;

    if (direction === TradeDirection.BUY) {
      pnl = ((exitPrice - entryPrice) / entryPrice) * amount;
    } else {
      pnl = ((entryPrice - exitPrice) / entryPrice) * amount;
    }

    pnl = Math.round(pnl * 100) / 100;

    trade.status = pnl > 0 ? TradeStatus.WON : pnl < 0 ? TradeStatus.LOST : TradeStatus.BE;
    trade.exitPrice = exitPrice;
    trade.pnl = pnl;

    // Return investment + PnL
    account.balance = balance + amount + pnl;
    if (account.balance < 0) {
      account.balance = 0;
    }

    await this.accountRepository.save(account);
    const saved = await this.tradeRepository.save(trade);

    // Broadcast notification
    this.tradingGateway.broadcastTrade(userId, {
      event: 'trade:closed',
      trade: {
        id: saved.id,
        type: saved.type,
        instrument: saved.instrument,
        status: saved.status,
        pnl: saved.pnl,
        exitPrice: saved.exitPrice,
      },
      accountId: account.id,
    });

    this.logger.log(
      `Forex trade closed: ${saved.id} → ${saved.status} (pnl: ${saved.pnl})`,
    );

    return saved;
  }

  // ─── Cancel Trade ─────────────────────────────────────────────────────

  async cancelTrade(
    tradeId: string,
    userId: string,
  ): Promise<Trade> {
    const trade = await this.findById(tradeId, userId);

    if (trade.status !== TradeStatus.OPEN) {
      throw new BadRequestException('Only open trades can be cancelled');
    }

    // Return investment to balance
    const account = await this.accountRepository.findOne({
      where: { id: trade.accountId, userId },
    });
    if (account) {
      account.balance = Number(account.balance) + Number(trade.amount);
      await this.accountRepository.save(account);
    }

    trade.status = TradeStatus.CANCELLED;
    trade.pnl = 0;
    const saved = await this.tradeRepository.save(trade);

    this.tradingGateway.broadcastTrade(userId, {
      event: 'trade:cancelled',
      trade: {
        id: saved.id,
        type: saved.type,
        instrument: saved.instrument,
        status: saved.status,
      },
      accountId: trade.accountId,
    });

    return saved;
  }

  // ─── Delete Trade ─────────────────────────────────────────────────────

  async deleteTrade(
    tradeId: string,
    userId: string,
  ): Promise<void> {
    const trade = await this.findById(tradeId, userId);

    // If trade is open, return investment to balance
    if (trade.status === TradeStatus.OPEN) {
      const account = await this.accountRepository.findOne({
        where: { id: trade.accountId, userId },
      });
      if (account) {
        account.balance = Number(account.balance) + Number(trade.amount);
        await this.accountRepository.save(account);
      }
    } else if (trade.status === TradeStatus.WON || trade.status === TradeStatus.BE) {
      // If trade won or BE, deduct the payout/investment
      const account = await this.accountRepository.findOne({
        where: { id: trade.accountId, userId },
      });
      if (account) {
        const payoutAmount = trade.pnl && trade.pnl > 0 ? trade.pnl : Number(trade.amount);
        account.balance = Math.max(0, Number(account.balance) - payoutAmount);
        await this.accountRepository.save(account);
      }
    }

    // Delete the trade
    await this.tradeRepository.delete(trade.id);

    this.tradingGateway.broadcastTrade(userId, {
      event: 'trade:deleted',
      tradeId: trade.id,
      accountId: trade.accountId,
    });

    this.logger.log(`Trade deleted: ${tradeId} by user ${userId}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private validateDirection(type: TradeType, direction: string): void {
    if (type === TradeType.BINARY) {
      if (!['call', 'put'].includes(direction.toLowerCase())) {
        throw new BadRequestException(
          'Binary trades must have direction: call or put',
        );
      }
    } else {
      if (!['buy', 'sell'].includes(direction.toLowerCase())) {
        throw new BadRequestException(
          'Forex trades must have direction: buy or sell',
        );
      }
    }
  }
}
