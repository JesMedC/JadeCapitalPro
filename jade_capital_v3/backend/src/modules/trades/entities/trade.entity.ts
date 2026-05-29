import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TradingAccount } from '../../accounts/entities/trading-account.entity';

export enum TradeType {
  BINARY = 'binary',
  FOREX = 'forex',
}

export enum TradeDirection {
  CALL = 'call',
  PUT = 'put',
  BUY = 'buy',
  SELL = 'sell',
}

export enum TradeStatus {
  OPEN = 'open',
  WON = 'won',
  LOST = 'lost',
  BE = 'be',
  CANCELLED = 'cancelled',
}

export enum TradeResult {
  WIN = 'win',
  LOSS = 'loss',
  BE = 'be',
}

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => TradingAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  @Index()
  account!: TradingAccount;

  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'enum', enum: TradeType })
  type!: TradeType;

  @Column({ type: 'varchar', length: 20 })
  instrument!: string;

  @Column({ type: 'enum', enum: TradeDirection })
  direction!: TradeDirection;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  entryPrice!: number;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  exitPrice!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  pnl!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  payoutPct!: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  expiryTime!: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  stopLoss!: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  takeProfit!: number | null;

  @Column({ type: 'enum', enum: TradeStatus, default: TradeStatus.OPEN })
  status!: TradeStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
