import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TradingAccount } from './trading-account.entity';

@Entity('account_access')
export class AccountAccess {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  accountId!: string;

  @ManyToOne(() => TradingAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account!: TradingAccount;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column('uuid', { nullable: true })
  grantedBy!: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'grantedBy' })
  grantedByUser!: User;

  @Column({ default: 'viewer' })
  accessLevel!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
