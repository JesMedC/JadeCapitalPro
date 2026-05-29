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

export enum AlertType {
  PRICE = 'price',
  SIGNAL = 'signal',
  PATTERN = 'pattern',
  NEWS = 'news',
}

export enum AlertCondition {
  ABOVE = 'above',
  BELOW = 'below',
  CROSSES_ABOVE = 'crosses_above',
  CROSSES_BELOW = 'crosses_below',
}

export enum AlertStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  DISABLED = 'disabled',
}

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: AlertType })
  type!: AlertType;

  @Column({ type: 'varchar', length: 20 })
  instrument!: string;

  @Column({ type: 'enum', enum: AlertCondition, nullable: true })
  condition!: AlertCondition | null;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  targetPrice!: number | null;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.ACTIVE })
  status!: AlertStatus;

  @Column({ type: 'timestamptz', nullable: true })
  triggeredAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
