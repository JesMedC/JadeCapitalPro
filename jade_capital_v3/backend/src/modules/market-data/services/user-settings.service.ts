import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from '../entities/user-settings.entity';
import { ChartPrefsResponseDto, UpdateChartPrefsDto, VALID_INSTRUMENTS } from '../dto/chart-preferences.dto';

const DEFAULT_CHART_PREFS: ChartPrefsResponseDto = {
  instrument: 'EUR/USD',
  timeframe: '5m',
};

const DEFAULT_WATCHLIST = ['EUR/USD', 'GBP/USD', 'USD/JPY'];

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private readonly repo: Repository<UserSettings>,
  ) {}

  /**
   * Returns the chart preferences for the given user.
   * Falls back to defaults if no row exists or chart_prefs is null
   * (pre-migration rows).
   */
  async getChartPrefs(userId: string): Promise<ChartPrefsResponseDto> {
    const row = await this.repo.findOne({ where: { userId } });

    if (!row || !row.chartPrefs) {
      return { ...DEFAULT_CHART_PREFS };
    }

    return {
      instrument: row.chartPrefs.instrument,
      timeframe: row.chartPrefs.timeframe,
    };
  }

  /**
   * Upserts the chart preferences for the given user.
   * Uses raw SQL INSERT ... ON CONFLICT DO UPDATE to guarantee idempotency.
   * Multi-user isolation: userId always comes from the JWT claim, never the body.
   */
  async upsertChartPrefs(
    userId: string,
    dto: UpdateChartPrefsDto,
  ): Promise<ChartPrefsResponseDto> {
    const chartPrefs = JSON.stringify({ instrument: dto.instrument, timeframe: dto.timeframe });

    await this.repo.query(
      `INSERT INTO user_settings (user_id, chart_prefs)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET chart_prefs = EXCLUDED.chart_prefs, updated_at = NOW()`,
      [userId, chartPrefs],
    );

    return {
      instrument: dto.instrument,
      timeframe: dto.timeframe,
    };
  }

  /**
   * Returns the watchlist for the given user.
   * If no row exists, ensures one is created with defaults (INSERT ... ON CONFLICT DO NOTHING)
   * and returns the default instrument list.
   * Multi-user isolation: userId always comes from the JWT claim.
   */
  async getWatchlist(userId: string): Promise<string[]> {
    // Ensure the row exists (first-login scenario)
    await this.repo.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const row = await this.repo.findOne({ where: { userId } });

    if (!row || !row.watchlist || row.watchlist.length === 0) {
      return [...DEFAULT_WATCHLIST];
    }

    return row.watchlist;
  }

  /**
   * Upserts the watchlist for the given user.
   * Belt-and-suspenders validation in addition to DTO validation.
   * Multi-user isolation: userId always comes from the JWT claim, never the body.
   */
  async upsertWatchlist(userId: string, instruments: string[]): Promise<string[]> {
    // Belt-and-suspenders: DTO already validated via ValidationPipe, but service guards too
    if (instruments.length === 0) {
      throw new BadRequestException('Watchlist must have at least 1 instrument');
    }
    if (instruments.length > 10) {
      throw new BadRequestException('Watchlist cannot exceed 10 instruments');
    }

    const invalid = instruments.filter((s) => !VALID_INSTRUMENTS.includes(s as typeof VALID_INSTRUMENTS[number]));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown instruments: ${invalid.join(', ')}`);
    }

    const payload = JSON.stringify(instruments);

    await this.repo.query(
      `INSERT INTO user_settings (user_id, watchlist)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET watchlist = EXCLUDED.watchlist, updated_at = NOW()`,
      [userId, payload],
    );

    return instruments;
  }
}
