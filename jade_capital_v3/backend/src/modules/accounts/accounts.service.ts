import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradingAccount } from './entities/trading-account.entity';
import { AccountAccess } from './entities/account-access.entity';
import { Trade, TradeStatus, TradeType } from '../trades/entities/trade.entity';
import { Goal } from '../goals/entities/goal.entity';

interface OverallStats {
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalWins: number;
  totalLosses: number;
  totalClosed: number;
}

interface EquityPoint {
  date: string;
  cum: number;
}

interface InstrumentStats {
  instrument: string;
  wins: number;
  losses: number;
  total: number;
  pnl: number;
  winRate: number;
}

interface RiskMetrics {
  overallLevel: string;
  dailyPnl: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  tradesToday: number;
  maxTradesSession: number;
  tradesLevel: string;
  lossLevel: string;
  blocked: boolean;
}

interface GoalSummary {
  id: string;
  title: string;
  goalType: string;
  targetValue: number;
  currentValue: number;
  progressPct: number;
  isCompleted: boolean;
  isActive: boolean;
  daysRemaining: number | null;
}

export interface DashboardResponse {
  account: TradingAccount;
  overall: OverallStats;
  equityCurve: EquityPoint[];
  byInstrument: InstrumentStats[];
  risk: RiskMetrics;
  openTrades: {
    binary: Trade[];
    forex: Trade[];
  };
  goals: GoalSummary[];
}

interface AggregateAccountSummary {
  id: string;
  name: string;
  marketType: string;
  broker: string | null;
  balance: number;
  currency: string;
}

export interface AggregateResponse {
  totalBalance: number;
  combinedPnl: number;
  combinedWinRate: number;
  combinedEquityCurve: EquityPoint[];
  accounts: AggregateAccountSummary[];
  overall: OverallStats;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(TradingAccount)
    private readonly accountRepository: Repository<TradingAccount>,
    @InjectRepository(AccountAccess)
    private readonly accountAccessRepository: Repository<AccountAccess>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
  ) {}

  async findAll(userId: string): Promise<TradingAccount[]> {
    return this.accountRepository.find({ where: { userId } });
  }

  async findById(id: string, userId: string): Promise<TradingAccount> {
    const account = await this.accountRepository.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.userId !== userId) throw new ForbiddenException();
    return account;
  }

  async create(
    userId: string,
    dto: Partial<TradingAccount>,
  ): Promise<TradingAccount> {
    const account = this.accountRepository.create({ ...dto, userId });
    return this.accountRepository.save(account);
  }

  async update(
    id: string,
    userId: string,
    dto: Partial<TradingAccount>,
  ): Promise<TradingAccount> {
    const account = await this.findById(id, userId);
    Object.assign(account, dto);
    return this.accountRepository.save(account);
  }

  async remove(id: string, userId: string): Promise<void> {
    const account = await this.findById(id, userId);
    await this.accountRepository.remove(account);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────

  async getDashboard(
    accountId: string,
    userId: string,
  ): Promise<DashboardResponse> {
    const account = await this.findById(accountId, userId);

    const [allTrades, goals] = await Promise.all([
      this.tradeRepository.find({
        where: { accountId, userId },
        order: { createdAt: 'ASC' },
      }),
      this.goalRepository.find({ where: { userId } }),
    ]);

    const openTrades = allTrades.filter((t) => t.status === TradeStatus.OPEN);
    const closedTrades = allTrades.filter(
      (t) =>
        t.status === TradeStatus.WON ||
        t.status === TradeStatus.LOST ||
        t.status === TradeStatus.BE,
    );

    const overall = this.computeOverall(closedTrades);
    const equityCurve = this.computeEquityCurve(closedTrades);
    const byInstrument = this.computeByInstrument(closedTrades);
    const risk = this.computeRisk(allTrades, account);
    const goalSummaries = this.computeGoalSummaries(goals);

    return {
      account,
      overall,
      equityCurve,
      byInstrument,
      risk,
      openTrades: {
        binary: openTrades.filter((t) => t.type === TradeType.BINARY),
        forex: openTrades.filter((t) => t.type === TradeType.FOREX),
      },
      goals: goalSummaries,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  private computeOverall(closedTrades: Trade[]): OverallStats {
    const won = closedTrades.filter((t) => t.status === TradeStatus.WON);
    const lost = closedTrades.filter((t) => t.status === TradeStatus.LOST);
    const totalWins = won.length;
    const totalLosses = lost.length;
    const totalClosed = totalWins + totalLosses;

    const totalWinPnl = won.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const totalLossPnl = lost.reduce(
      (sum, t) => sum + Math.abs(t.pnl ?? t.amount),
      0,
    );

    const winRate = totalClosed > 0 ? totalWins / totalClosed : 0;
    const avgWin = totalWins > 0 ? totalWinPnl / totalWins : 0;
    const avgLoss = totalLosses > 0 ? totalLossPnl / totalLosses : 0;
    const profitFactor =
      totalLossPnl > 0
        ? totalWinPnl / totalLossPnl
        : totalWinPnl > 0
          ? 999
          : 1;

    return {
      winRate: Math.round(winRate * 10000) / 10000,
      profitFactor: Math.round(profitFactor * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      totalWins,
      totalLosses,
      totalClosed,
    };
  }

  private computeEquityCurve(closedTrades: Trade[]): EquityPoint[] {
    let cumulative = 0;
    return closedTrades.map((t) => {
      const pnl = t.pnl ?? 0;
      cumulative += Number(pnl);
      return {
        date: t.createdAt.toISOString().split('T')[0],
        cum: Math.round(cumulative * 100) / 100,
      };
    });
  }

  private computeByInstrument(closedTrades: Trade[]): InstrumentStats[] {
    const map = new Map<string, { wins: number; losses: number; pnl: number }>();

    for (const t of closedTrades) {
      const entry = map.get(t.instrument) ?? { wins: 0, losses: 0, pnl: 0 };
      if (t.status === TradeStatus.WON) entry.wins++;
      else if (t.status === TradeStatus.LOST) entry.losses++;
      entry.pnl += Number(t.pnl ?? 0);
      map.set(t.instrument, entry);
    }

    return Array.from(map.entries()).map(([instrument, data]) => {
      const total = data.wins + data.losses;
      return {
        instrument,
        wins: data.wins,
        losses: data.losses,
        total,
        pnl: Math.round(data.pnl * 100) / 100,
        winRate: total > 0 ? Math.round((data.wins / total) * 10000) / 10000 : 0,
      };
    });
  }

  private computeRisk(allTrades: Trade[], account: TradingAccount): RiskMetrics {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const todayTrades = allTrades.filter(
      (t) => new Date(t.createdAt) >= todayStart,
    );
    const tradesToday = todayTrades.length;

    const closedToday = todayTrades.filter(
      (t) =>
        t.status === TradeStatus.WON ||
        t.status === TradeStatus.LOST ||
        t.status === TradeStatus.BE,
    );
    const dailyPnl = closedToday.reduce(
      (sum, t) => sum + Number(t.pnl ?? 0),
      0,
    );

    const balance = Number(account.balance);
    const dailyLossPct =
      dailyPnl < 0 && balance > 0
        ? Math.abs(dailyPnl) / (balance + Math.abs(dailyPnl)) * 100
        : 0;

    const maxDailyLossPct = 5;
    const maxTradesSession = 20;

    const tradesLevel =
      tradesToday >= maxTradesSession
        ? 'blocked'
        : tradesToday > 15
          ? 'high'
          : tradesToday > 10
            ? 'medium'
            : 'low';

    const lossLevel =
      dailyLossPct >= maxDailyLossPct
        ? 'high'
        : dailyLossPct > 2
          ? 'medium'
          : 'low';

    const overallLevel =
      lossLevel === 'high' || tradesLevel === 'blocked'
        ? 'high'
        : lossLevel === 'medium' || tradesLevel === 'high'
          ? 'medium'
          : 'low';

    return {
      overallLevel,
      dailyPnl: Math.round(dailyPnl * 100) / 100,
      dailyLossPct: Math.round(dailyLossPct * 100) / 100,
      maxDailyLossPct,
      tradesToday,
      maxTradesSession,
      tradesLevel,
      lossLevel,
      blocked: tradesToday >= maxTradesSession,
    };
  }

  private computeGoalSummaries(goals: Goal[]): GoalSummary[] {
    const now = new Date();

    return goals.map((goal) => {
      let daysRemaining: number | null = null;
      if (goal.endDate) {
        const diff = new Date(goal.endDate).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }

      // currentValue and progressPct are now computed on-demand by GoalsService.
      // The dashboard summary returns 0 as a safe placeholder — use GET /goals
      // for accurate progress values that reflect actual trade activity.
      return {
        id: goal.id,
        title: goal.title,
        goalType: goal.goalType,
        targetValue: Number(goal.targetValue),
        currentValue: 0,
        progressPct: 0,
        isCompleted: goal.isCompleted,
        isActive: goal.isActive,
        daysRemaining,
      };
    });
  }

  // ─── Deposit / Withdraw ──────────────────────────────────────────────

  async deposit(
    accountId: string,
    userId: string,
    amount: number,
  ): Promise<TradingAccount> {
    const account = await this.findById(accountId, userId);

    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    account.balance = Number(account.balance) + amount;
    await this.accountRepository.save(account);

    this.logger.log(
      `Deposit: ${amount} added to account ${accountId} by user ${userId}. New balance: ${account.balance}`,
    );

    return account;
  }

  async withdraw(
    accountId: string,
    userId: string,
    amount: number,
  ): Promise<TradingAccount> {
    const account = await this.findById(accountId, userId);

    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    if (amount > Number(account.balance)) {
      throw new BadRequestException('Insufficient balance');
    }

    account.balance = Number(account.balance) - amount;
    await this.accountRepository.save(account);

    this.logger.log(
      `Withdrawal: ${amount} removed from account ${accountId} by user ${userId}. New balance: ${account.balance}`,
    );

    return account;
  }

  // ─── Aggregate (ALL accounts view) ───────────────────────────────────

  async getAggregate(userId: string): Promise<AggregateResponse> {
    // Get owned accounts
    const ownedAccounts = await this.accountRepository.find({ where: { userId } });

    // Get granted accounts (accounts other users have shared with this user)
    const grantedAccess = await this.accountAccessRepository.find({
      where: { userId },
      relations: ['account'],
    });
    const grantedAccounts = grantedAccess.map((access) => access.account);

    // Combine owned and granted accounts
    const allAccounts = [...ownedAccounts, ...grantedAccounts];

    if (!allAccounts.length) {
      return {
        totalBalance: 0,
        combinedPnl: 0,
        combinedWinRate: 0,
        combinedEquityCurve: [],
        accounts: [],
        overall: {
          winRate: 0,
          profitFactor: 1,
          avgWin: 0,
          avgLoss: 0,
          totalWins: 0,
          totalLosses: 0,
          totalClosed: 0,
        },
      };
    }

    const totalBalance = allAccounts.reduce(
      (sum, a) => sum + Number(a.balance ?? 0),
      0,
    );

    // Collect all trades across all accounts
    const accountIds = allAccounts.map((a) => a.id);
    const allTrades = await this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.accountId IN (:...ids)', { ids: accountIds })
      .orderBy('trade.createdAt', 'ASC')
      .getMany();

    const closedTrades = allTrades.filter(
      (t) =>
        t.status === TradeStatus.WON ||
        t.status === TradeStatus.LOST ||
        t.status === TradeStatus.BE,
    );

    const overall = this.computeOverall(closedTrades);

    // Build equity curve (capped at 200 points per design decision)
    const equityCurve = this.computeEquityCurve(closedTrades).slice(-200);

    const combinedPnl =
      equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].cum : 0;

    return {
      totalBalance: Math.round(totalBalance * 100) / 100,
      combinedPnl: Math.round(combinedPnl * 100) / 100,
      combinedWinRate: Math.round(overall.winRate * 10000) / 100, // 0–100
      combinedEquityCurve: equityCurve,
      overall,
      accounts: allAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        marketType: a.marketType,
        broker: a.broker ?? null,
        balance: Math.round(Number(a.balance ?? 0) * 100) / 100,
        currency: a.currency,
      })),
    };
  }
}
