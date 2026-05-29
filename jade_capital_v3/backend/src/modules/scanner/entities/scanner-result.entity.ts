import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('scanner_results')
@Unique(['instrument', 'timeframe', 'pattern', 'direction'])
export class ScannerResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // userId is nullable — global scan store; null means system-generated
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index()
  userId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  scannerType!: string; // always 'harmonic' for Sprint 9

  @Column({ type: 'varchar', length: 20 })
  @Index()
  instrument!: string;

  @Column({ type: 'varchar', length: 10 })
  timeframe!: string;

  @Column({ type: 'varchar', length: 50 })
  pattern!: string;

  // NEW in Sprint 9
  @Column({ type: 'varchar', length: 10, default: 'CALL' })
  direction!: string; // 'CALL' | 'PUT'

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  entryPrice!: number;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  stopLoss!: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  takeProfit!: number | null;

  // NEW in Sprint 9
  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  takeProfit2!: number | null;

  @Column({ type: 'float', nullable: true })
  confidence!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
  // metadata.points:  { x, a, b, c, d: number } — XABCD prices at detection time
  // metadata.times:   { x, a, b, c, d: number (unix ms) } — candle timestamps for each pivot
  // metadata.ratios:  { AB, BC, CD, XD: number }
  // metadata.confluences?: string[]

  @CreateDateColumn()
  createdAt!: Date;
}
