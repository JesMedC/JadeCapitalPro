import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { TradingAccount } from '../accounts/entities/trading-account.entity';
import { Trade, TradeStatus, TradeType, TradeDirection } from '../trades/entities/trade.entity';

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACCOUNT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const OTHER_USER = 'cccccccc-0000-0000-0000-000000000001';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    name: 'Test Account',
    marketType: 'binary',
    balance: 1000 as unknown as number,
    currency: 'USD',
    broker: null,
    initialBalance: 1000 as unknown as number,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    trades: [],
    accessGrants: [],
    user: null as never,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    userId: USER_ID,
    accountId: ACCOUNT_ID,
    type: TradeType.BINARY,
    instrument: 'EUR/USD',
    direction: TradeDirection.CALL,
    entryPrice: 1.1 as unknown as number,
    exitPrice: null,
    amount: 100 as unknown as number,
    pnl: 80 as unknown as number,
    payoutPct: 80 as unknown as number,
    expiryTime: '5m',
    stopLoss: null,
    takeProfit: null,
    status: TradeStatus.WON,
    notes: null,
    createdAt: new Date(),
    user: null as never,
    account: null as never,
    ...overrides,
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildService() {
  const accountRepository = {
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<TradingAccount>>;

  const tradeRepository = {
    find: jest.fn(),
  } as unknown as jest.Mocked<Repository<Trade>>;

  const service = new ReportsService(
    accountRepository as Repository<TradingAccount>,
    tradeRepository as Repository<Trade>,
  );

  return { service, accountRepository, tradeRepository };
}

// ── resolvePreset ─────────────────────────────────────────────────────────────

describe('ReportsService.resolvePreset', () => {
  it('resolves 7d preset: toDate is today UTC, fromDate is 7 days earlier', () => {
    const { service } = buildService();
    const { fromDate, toDate } = service.resolvePreset('7d');
    // The span is 7 calendar days: fromDate day+6 == toDate day
    const diffDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(7);
    // toDate should be today at 23:59:59
    const now = new Date();
    expect(toDate.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(toDate.getUTCMonth()).toBe(now.getUTCMonth());
  });

  it('resolves 30d preset: span is 30 calendar days', () => {
    const { service } = buildService();
    const { fromDate, toDate } = service.resolvePreset('30d');
    const diffDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(30);
  });

  it('resolves 90d preset: span is 90 calendar days', () => {
    const { service } = buildService();
    const { fromDate, toDate } = service.resolvePreset('90d');
    const diffDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(90);
  });

  it('throws BadRequestException when from > to', () => {
    const { service } = buildService();
    expect(() => service.resolvePreset(undefined, '2026-02-01', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when neither preset nor from/to provided', () => {
    const { service } = buildService();
    expect(() => service.resolvePreset()).toThrow(BadRequestException);
  });

  it('resolves explicit from/to range', () => {
    const { service } = buildService();
    const { fromDate, toDate } = service.resolvePreset(undefined, '2026-01-01', '2026-01-31');
    expect(fromDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(toDate.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('preset takes precedence over explicit from/to when both provided', () => {
    const { service } = buildService();
    const { fromDate, toDate } = service.resolvePreset('7d', '2026-01-01', '2026-01-31');
    const today = new Date();
    // toDate should be today
    expect(toDate.getUTCFullYear()).toBe(today.getUTCFullYear());
    expect(toDate.getUTCMonth()).toBe(today.getUTCMonth());
    expect(toDate.getUTCDate()).toBe(today.getUTCDate());
    // fromDate should be 7 days before today (using UTC to avoid timezone issues)
    const expectedFrom = new Date(today);
    expectedFrom.setUTCDate(today.getUTCDate() - 7);
    // Compare timestamps to avoid timezone issues
    expect(fromDate.getTime()).toBeLessThanOrEqual(expectedFrom.getTime() + 24 * 60 * 60 * 1000);
    expect(fromDate.getTime()).toBeGreaterThanOrEqual(expectedFrom.getTime() - 24 * 60 * 60 * 1000);
  });
});

// ── generate ─────────────────────────────────────────────────────────────────

describe('ReportsService.generate', () => {
  it('throws ForbiddenException when account does not belong to caller', async () => {
    const { service, accountRepository } = buildService();
    accountRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.generate(ACCOUNT_ID, OTHER_USER, new Date('2026-01-01'), new Date('2026-01-31')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException with error "no_trades_in_range" when no closed trades found', async () => {
    const { service, accountRepository, tradeRepository } = buildService();
    // Set up two calls: both resolve account, both return empty trades
    accountRepository.findOne.mockResolvedValue(makeAccount());
    tradeRepository.find.mockResolvedValue([]);

    let caught: NotFoundException | undefined;
    try {
      await service.generate(ACCOUNT_ID, USER_ID, new Date('2026-01-01'), new Date('2026-01-31'));
    } catch (e: unknown) {
      caught = e as NotFoundException;
    }

    expect(caught).toBeInstanceOf(NotFoundException);
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response['error']).toBe('no_trades_in_range');
  });

  it('throws NotFoundException when only OPEN/CANCELLED trades exist (no closed)', async () => {
    const { service, accountRepository, tradeRepository } = buildService();
    accountRepository.findOne.mockResolvedValueOnce(makeAccount());
    tradeRepository.find.mockResolvedValueOnce([
      makeTrade({ status: TradeStatus.OPEN, pnl: null }),
      makeTrade({ status: TradeStatus.CANCELLED, pnl: null }),
    ]);

    await expect(
      service.generate(ACCOUNT_ID, USER_ID, new Date('2026-01-01'), new Date('2026-01-31')),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns a non-empty Buffer when valid closed trades exist', async () => {
    const { service, accountRepository, tradeRepository } = buildService();
    accountRepository.findOne.mockResolvedValueOnce(makeAccount());
    tradeRepository.find.mockResolvedValueOnce([
      makeTrade({ status: TradeStatus.WON, pnl: 80 as unknown as number }),
      makeTrade({ status: TradeStatus.LOST, pnl: -100 as unknown as number }),
    ]);

    const buffer = await service.generate(
      ACCOUNT_ID,
      USER_ID,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('PDF buffer starts with %PDF magic bytes', async () => {
    const { service, accountRepository, tradeRepository } = buildService();
    accountRepository.findOne.mockResolvedValueOnce(makeAccount());
    tradeRepository.find.mockResolvedValueOnce([
      makeTrade({ status: TradeStatus.WON, pnl: 80 as unknown as number }),
    ]);

    const buffer = await service.generate(
      ACCOUNT_ID,
      USER_ID,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    // All valid PDFs begin with the %PDF signature
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });
});
