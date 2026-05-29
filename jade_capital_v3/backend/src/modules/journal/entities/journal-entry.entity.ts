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
import { EmotionTag } from '../enums/emotion-tag.enum';

@Entity('journal_entries')
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  emotion!: EmotionTag | null;

  // SnakeNamingStrategy maps tradeIds → trade_ids automatically
  @Column({ type: 'uuid', array: true, nullable: true, default: null })
  tradeIds!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  tags!: string[] | null;

  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  mood!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
