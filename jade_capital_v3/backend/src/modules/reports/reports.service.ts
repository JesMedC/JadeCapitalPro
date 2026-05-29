import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TradingAccount } from '../accounts/entities/trading-account.entity';
import { Trade, TradeStatus } from '../trades/entities/trade.entity';
import { computeKpis, buildEquityCurve } from './helpers/kpi-calculator';
import { PdfRenderer } from './helpers/pdf-renderer';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly pdfRenderer = new PdfRenderer();

  constructor(
    @InjectRepository(TradingAccount)
    private readonly accountRepository: Repository<TradingAccount>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
  ) {}

  // ── Preset resolution ──────────────────────────────────────────────────────

  /**
   * Resolve a preset string ('7d' | '30d' | '90d') or explicit from/to strings
   * into UTC Date objects.
   *
   * Server-side resolution guarantees timezone-correct UTC dates regardless of
   * the client device timezone (spec AC-7).
   */
  resolvePreset(
    preset?: string,
    from?: string,
    to?: string,
  ): { fromDate: Date; toDate: Date } {
    const toDate = new Date();
    toDate.setUTCHours(23, 59, 59, 999);

    if (preset) {
      const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
      const fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);
      fromDate.setUTCHours(0, 0, 0, 0);
      return { fromDate, toDate };
    }

    if (!from || !to) {
      throw new BadRequestException(
        'Either preset or both from and to query parameters are required.',
      );
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const parsedTo = new Date(`${to}T23:59:59.999Z`);

    if (isNaN(fromDate.getTime()) || isNaN(parsedTo.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }

    if (fromDate > parsedTo) {
      throw new BadRequestException('from must not be after to.');
    }

    return { fromDate, toDate: parsedTo };
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  /**
   * Generate a PDF report for the given account scoped to the authenticated user.
   *
   * @throws ForbiddenException  if accountId does not belong to userId
   * @throws NotFoundException   if no closed trades exist in the date range
   */
  async generate(
    accountId: string,
    userId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Buffer> {
    // 1. Ownership check
    const account = await this.accountRepository.findOne({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new ForbiddenException('Account not found or access denied.');
    }

    // 2. Date-range trade query (closed trades only)
    const trades = await this.tradeRepository.find({
      where: {
        accountId,
        createdAt: Between(fromDate, toDate),
      },
      order: { createdAt: 'ASC' },
    });

    const closedTrades = trades.filter(
      (t) =>
        t.status === TradeStatus.WON ||
        t.status === TradeStatus.LOST ||
        t.status === TradeStatus.BE,
    );

    if (closedTrades.length === 0) {
      const from = fromDate.toISOString().split('T')[0];
      const to = toDate.toISOString().split('T')[0];
      throw new NotFoundException({
        error: 'no_trades_in_range',
        message: `No closed trades found between ${from} and ${to}`,
      });
    }

    // 3. Compute KPIs and equity curve
    const kpis = computeKpis(closedTrades);
    const curve = buildEquityCurve(closedTrades);

    // 4. Render PDF
    const buffer = await this.pdfRenderer.render(account, kpis, curve, closedTrades, {
      from: fromDate,
      to: toDate,
    });

    this.logger.log(
      `PDF report generated for account ${accountId} (${closedTrades.length} trades, ${buffer.length} bytes)`,
    );

    return buffer;
  }
}
