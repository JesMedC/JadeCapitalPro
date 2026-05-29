import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { TradingAccount } from '../accounts/entities/trading-account.entity';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(TradingAccount)
    private readonly accountRepository: Repository<TradingAccount>,
  ) {}

  async deposit(accountId: string, userId: string, amount: number): Promise<Transaction> {
    const account = await this.accountRepository.findOne({ where: { id: accountId, userId } });
    if (!account) throw new BadRequestException('Account not found');
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const balanceBefore = Number(account.balance);
    account.balance = balanceBefore + amount;
    await this.accountRepository.save(account);
    const balanceAfter = Number(account.balance);

    const transaction = this.transactionRepository.create({
      userId,
      accountId,
      type: TransactionType.DEPOSIT,
      amount,
      balanceBefore,
      balanceAfter,
      description: `Deposit of $${amount}`,
    });

    const saved = await this.transactionRepository.save(transaction);
    this.logger.log(`Deposit: $${amount} to account ${accountId}. Balance: ${balanceBefore} → ${balanceAfter}`);
    return saved;
  }

  async withdraw(accountId: string, userId: string, amount: number): Promise<Transaction> {
    const account = await this.accountRepository.findOne({ where: { id: accountId, userId } });
    if (!account) throw new BadRequestException('Account not found');
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    if (amount > Number(account.balance)) throw new BadRequestException('Insufficient balance');

    const balanceBefore = Number(account.balance);
    account.balance = balanceBefore - amount;
    await this.accountRepository.save(account);
    const balanceAfter = Number(account.balance);

    const transaction = this.transactionRepository.create({
      userId,
      accountId,
      type: TransactionType.WITHDRAWAL,
      amount,
      balanceBefore,
      balanceAfter,
      description: `Withdrawal of $${amount}`,
    });

    const saved = await this.transactionRepository.save(transaction);
    this.logger.log(`Withdrawal: $${amount} from account ${accountId}. Balance: ${balanceBefore} → ${balanceAfter}`);
    return saved;
  }

  async findByAccount(accountId: string, userId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { accountId, userId },
      order: { createdAt: 'DESC' },
    });
  }
}
