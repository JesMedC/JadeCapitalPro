import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export interface ChartPrefs {
  instrument: string;
  timeframe: string;
}

export const DEFAULT_WATCHLIST = ['EUR/USD', 'GBP/USD', 'USD/JPY'] as const;

@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 10, default: 'dark' })
  theme!: string;

  @Column({ type: 'varchar', length: 5, default: 'es' })
  language!: string;

  @Column({ type: 'varchar', length: 50, default: 'America/Argentina/Buenos_Aires' })
  timezone!: string;

  @Column({
    type: 'jsonb',
    name: 'risk_config',
    default: () => `'{"max_daily_loss_pct": 5, "max_trades_session": 20, "default_risk_pct": 2}'`,
  })
  riskConfig!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    name: 'scanner_config',
    default: () => `'{"instruments": ["EUR/USD","GBP/USD","USD/JPY"], "interval_minutes": 5}'`,
  })
  scannerConfig!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    name: 'notification_prefs',
    default: () => `'{"email": true, "push": true, "sound": true}'`,
  })
  notificationPrefs!: Record<string, unknown>;

  /**
   * Per-user chart preferences added in Sprint 4.
   * Nullable: rows created before the migration may have NULL until backfilled.
   * Service always falls back to defaults if null.
   */
  @Column({
    type: 'jsonb',
    name: 'chart_prefs',
    default: () => `'{"instrument": "EUR/USD", "timeframe": "5m"}'`,
    nullable: true,
  })
  chartPrefs!: ChartPrefs | null;

  /**
   * Per-user watchlist added in Sprint 7.
   * Stores an ordered array of instrument symbols (max 10).
   * Default: EUR/USD, GBP/USD, USD/JPY — matches the SQL migration default.
   */
  @Column({
    type: 'jsonb',
    name: 'watchlist',
    default: () => `'["EUR/USD","GBP/USD","USD/JPY"]'`,
  })
  watchlist!: string[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
