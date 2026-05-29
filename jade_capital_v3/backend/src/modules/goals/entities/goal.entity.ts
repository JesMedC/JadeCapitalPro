import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TradingAccount } from '../../accounts/entities/trading-account.entity';

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => TradingAccount, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account!: TradingAccount | null;

  @Column({ type: 'uuid', nullable: true })
  accountId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 30 })
  goalType!: string; // pnl | winrate | trades | streak | drawdown

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  targetValue!: number;

  // currentValue and progressPct are NOT stored — computed at query time
  // and returned only in GoalResponseDto

  @Column({ type: 'boolean', default: false })
  isCompleted!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'custom' })
  period!: string; // daily | weekly | monthly | custom

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
