import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TradingAccount } from '../../accounts/entities/trading-account.entity';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  accountId!: string;

  @ManyToOne(() => TradingAccount, { eager: false })
  @JoinColumn({ name: 'accountId' })
  account!: TradingAccount;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column('decimal', { precision: 15, scale: 2 })
  amount!: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  balanceBefore!: number;

  @Column('decimal', { precision: 15, scale: 2 })
  balanceAfter!: number;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
