/**
 * AccountsService — unit tests with mocked TypeORM repositories.
 *
 * Sprint 18: Closes S16 test coverage gap.
 *
 * Covers:
 * - AccountsService.findById: NotFoundException (missing), ForbiddenException (wrong owner)
 * - AccountsService.update: success path, ForbiddenException (wrong owner)
 * - AccountsService.getAggregate: combined owned+granted, empty accounts
 */

import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts.service';
import { TradingAccount } from '../entities/trading-account.entity';
import { AccountAccess } from '../entities/account-access.entity';
import { Trade, TradeStatus, TradeType, TradeDirection } from '../../trades/entities/trade.entity';
import { Goal } from '../../goals/entities/goal.entity';

// ── Constants ──────────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ACCOUNT_ID = 'acct-0000-0000-0000-000000000001';
const GRANTED_ACCOUNT_ID = 'acct-0000-0000-0000-000000000002';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: ACCOUNT_ID,
    userId: USER_A,
    name: 'Test Account',
    marketType: 'forex',
    balance: 1000 as unknown as number,
    currency: 'USD',
    broker: null,
    initialBalance: 1000 as unknown as number,
    isDefault: false,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    trades: [],
    accessGrants: [],
    user: null as never,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-0001',
    userId: USER_A,
    accountId: ACCOUNT_ID,
    type: TradeType.FOREX,
    instrument: 'EUR/USD',
    direction: TradeDirection.CALL,
    entryPrice: 1.08765 as unknown as number,
    exitPrice: null,
    amount: 100 as unknown as number,
    pnl: 50 as unknown as number,
    payoutPct: null,
    expiryTime: null,
    stopLoss: null,
    takeProfit: null,
    status: TradeStatus.WON,
    notes: null,
    createdAt: new Date('2026-05-15T00:00:00Z'),
    user: null as never,
    account: null as never,
    ...overrides,
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildService() {
  const accountRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<TradingAccount>;

  const accountAccessRepository = {
    find: jest.fn(),
  } as unknown as Repository<AccountAccess>;

  const tradeRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Trade>;

  const goalRepository = {
    find: jest.fn(),
  } as unknown as Repository<Goal>;

  const service = new AccountsService(
    accountRepository,
    accountAccessRepository,
    tradeRepository,
    goalRepository,
  );

  return { service, accountRepository, accountAccessRepository, tradeRepository, goalRepository };
}

// Helper: chainable createQueryBuilder stub
function makeQbStub(trades: Trade[] = []) {
  return {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(trades),
  };
}

// ── AccountsService.findById ──────────────────────────────────────────────────

describe('AccountsService.findById', () => {
  it('throws NotFoundException when account does not exist', async () => {
    const { service, accountRepository } = buildService();
    (accountRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.findById('nonexistent', USER_A)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when caller does not own the account', async () => {
    const { service, accountRepository } = buildService();
    (accountRepository.findOne as jest.Mock).mockResolvedValue(makeAccount({ userId: USER_A }));

    await expect(service.findById(ACCOUNT_ID, USER_B)).rejects.toThrow(ForbiddenException);
  });

  it('returns account when caller is the owner', async () => {
    const { service, accountRepository } = buildService();
    const account = makeAccount({ userId: USER_A });
    (accountRepository.findOne as jest.Mock).mockResolvedValue(account);

    const result = await service.findById(ACCOUNT_ID, USER_A);
    expect(result).toBe(account);
  });
});

// ── AccountsService.update ────────────────────────────────────────────────────

describe('AccountsService.update', () => {
  it('success path — updates account fields and returns updated entity', async () => {
    const { service, accountRepository } = buildService();
    const account = makeAccount({ userId: USER_A, name: 'Old Name' });
    (accountRepository.findOne as jest.Mock).mockResolvedValue(account);
    (accountRepository.save as jest.Mock).mockImplementation(async (acc) => acc);

    const result = await service.update(ACCOUNT_ID, USER_A, { name: 'New Name' });

    expect(accountRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' }),
    );
    expect(result.name).toBe('New Name');
  });

  it('throws ForbiddenException when caller does not own the account', async () => {
    const { service, accountRepository } = buildService();
    (accountRepository.findOne as jest.Mock).mockResolvedValue(makeAccount({ userId: USER_A }));

    await expect(service.update(ACCOUNT_ID, USER_B, { name: 'Hack' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(accountRepository.save).not.toHaveBeenCalled();
  });
});

// ── AccountsService.getAggregate ──────────────────────────────────────────────

describe('AccountsService.getAggregate', () => {
  it('returns empty aggregate when user has no accounts', async () => {
    const { service, accountRepository, accountAccessRepository } = buildService();
    (accountRepository.find as jest.Mock).mockResolvedValue([]);
    (accountAccessRepository.find as jest.Mock).mockResolvedValue([]);

    const result = await service.getAggregate(USER_A);

    expect(result.totalBalance).toBe(0);
    expect(result.accounts).toHaveLength(0);
  });

  it('combines owned and granted accounts, sums balances correctly', async () => {
    const { service, accountRepository, accountAccessRepository, tradeRepository } =
      buildService();

    const ownedAccount = makeAccount({ id: ACCOUNT_ID, balance: 1000 as unknown as number, userId: USER_A });
    const grantedAccount = makeAccount({
      id: GRANTED_ACCOUNT_ID,
      balance: 500 as unknown as number,
      userId: USER_B,
    });

    (accountRepository.find as jest.Mock).mockResolvedValue([ownedAccount]);
    (accountAccessRepository.find as jest.Mock).mockResolvedValue([
      { account: grantedAccount, userId: USER_A, accountId: GRANTED_ACCOUNT_ID },
    ]);
    (tradeRepository.createQueryBuilder as jest.Mock).mockReturnValue(makeQbStub());

    const result = await service.getAggregate(USER_A);

    expect(result.totalBalance).toBe(1500);
    expect(result.accounts).toHaveLength(2);
  });

  it('grant-inclusion: granted account is included in accounts list', async () => {
    const { service, accountRepository, accountAccessRepository, tradeRepository } =
      buildService();

    const ownedAccount = makeAccount({ id: ACCOUNT_ID, userId: USER_A });
    const grantedAccount = makeAccount({
      id: GRANTED_ACCOUNT_ID,
      userId: USER_B,
      name: 'Granted Account',
    });

    (accountRepository.find as jest.Mock).mockResolvedValue([ownedAccount]);
    (accountAccessRepository.find as jest.Mock).mockResolvedValue([
      { account: grantedAccount, userId: USER_A, accountId: GRANTED_ACCOUNT_ID },
    ]);
    (tradeRepository.createQueryBuilder as jest.Mock).mockReturnValue(
      makeQbStub([makeTrade()]),
    );

    const result = await service.getAggregate(USER_A);

    const grantedInResult = result.accounts.find((a) => a.id === GRANTED_ACCOUNT_ID);
    expect(grantedInResult).toBeDefined();
    expect(grantedInResult?.name).toBe('Granted Account');
  });

  it('findById returns account when user owns it', async () => {
    const { service, accountRepository } = buildService();
    const account = makeAccount({ id: ACCOUNT_ID, userId: USER_A });

    (accountRepository.findOne as jest.Mock).mockResolvedValue(account);

    const result = await service.findById(ACCOUNT_ID, USER_A);

    expect(result.id).toBe(ACCOUNT_ID);
    expect(accountRepository.findOne).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID } });
  });

  it('getAggregate returns equity curve with correct shape (cum field)', async () => {
    const { service, accountRepository, accountAccessRepository, tradeRepository } =
      buildService();

    const ownedAccount = makeAccount({ id: ACCOUNT_ID, balance: 1000 as unknown as number, userId: USER_A });
    (accountRepository.find as jest.Mock).mockResolvedValue([ownedAccount]);
    (accountAccessRepository.find as jest.Mock).mockResolvedValue([]);
    (tradeRepository.createQueryBuilder as jest.Mock).mockReturnValue(
      makeQbStub([
        makeTrade({ pnl: 50 as unknown as number, createdAt: new Date('2026-05-01') }),
        makeTrade({ pnl: -30 as unknown as number, createdAt: new Date('2026-05-02') }),
      ]),
    );

    const result = await service.getAggregate(USER_A);

    expect(result.combinedEquityCurve).toBeDefined();
    expect(result.combinedEquityCurve.length).toBeGreaterThan(0);
    expect(result.combinedEquityCurve[0]).toHaveProperty('cum');
    expect(result.combinedPnl).toBe(20); // 50 - 30
  });
});
