import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('candles')
@Index(['instrument', 'timeframe', 'timestamp'])
export class Candle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  instrument!: string;

  @Column({ type: 'varchar', length: 10 })
  timeframe!: string;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  open!: number;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  high!: number;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  low!: number;

  @Column({ type: 'decimal', precision: 14, scale: 6 })
  close!: number;

  @Column({ type: 'integer' })
  volume!: number;
}
