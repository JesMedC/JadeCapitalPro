import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Trade } from '../../trades/entities/trade.entity';
import { AccountAccess } from './account-access.entity';

@Entity('trading_accounts')
export class TradingAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  name!: string;

  @Column()
  marketType!: string;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  balance!: number;

  @Column({ default: 'USD' })
  currency!: string;

  @Column('varchar', { length: 100, nullable: true })
  broker!: string | null;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  initialBalance!: number;

  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Trade, (trade) => trade.account)
  trades!: Trade[];

  @OneToMany(() => AccountAccess, (access) => access.account)
  accessGrants!: AccountAccess[];
}
