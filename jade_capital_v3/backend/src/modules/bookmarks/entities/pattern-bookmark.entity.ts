import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

/**
 * Thin identity bookmark: stores only the 5-tuple compound key that uniquely
 * identifies a pattern signal (user_id, instrument, timeframe, pattern, direction).
 * No join to scanner_results — the frontend performs client-side matching.
 */
@Entity('user_pattern_bookmarks')
@Unique('uq_user_pattern_bookmarks_compound', [
  'userId',
  'instrument',
  'timeframe',
  'pattern',
  'direction',
])
export class PatternBookmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index('ix_user_pattern_bookmarks_user_id')
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 20 })
  instrument!: string;

  @Column({ type: 'varchar', length: 10 })
  timeframe!: string;

  @Column({ type: 'varchar', length: 50 })
  pattern!: string;

  /** Direction value as stored by the scanner (e.g. "BULLISH"/"BEARISH" or "CALL"/"PUT"). */
  @Column({ type: 'varchar', length: 10 })
  direction!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
