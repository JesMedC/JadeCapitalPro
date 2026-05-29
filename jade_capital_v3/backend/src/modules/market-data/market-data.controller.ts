import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MarketDataService } from './market-data.service';
import { UserSettingsService } from './services/user-settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';
import {
  PriceResponse,
  CandleResponse,
  EconomicEventResponse,
  InstrumentInfo,
  WatchlistUpdateDto,
  WatchlistResponseDto,
} from './dto/market-data.dto';
import { UpdateChartPrefsDto, ChartPrefsResponseDto } from './dto/chart-preferences.dto';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly userSettingsService: UserSettingsService,
  ) {}

  /**
   * GET /api/market-data/price/:instrument
   * Returns the current bid/ask/spread for a single instrument.
   */
  @Get('price/:instrument')
  getPrice(@Param('instrument') instrument: string): PriceResponse | { error: string } {
    const price = this.marketDataService.getPrice(instrument);
    if (!price) {
      return { error: `Instrument ${instrument} not found` };
    }

    return {
      instrument,
      bid: price.bid,
      ask: price.ask,
      spread: +(price.ask - price.bid).toFixed(6),
      timestamp: price.timestamp,
    };
  }

  /**
   * GET /api/market-data/candles/:instrument?tf=5m&limit=100
   * Returns OHLC candles for the given instrument and timeframe.
   */
  @Get('candles/:instrument')
  getCandles(
    @Param('instrument') instrument: string,
    @Query('tf', new DefaultValuePipe('5m')) tf: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ): CandleResponse[] {
    const candles = this.marketDataService.getCandles(instrument, tf, limit);
    return candles.map((c) => ({
      instrument: c.instrument,
      timeframe: c.timeframe,
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  /**
   * GET /api/market-data/instruments
   * Lists all available instruments with metadata.
   */
  @Get('instruments')
  getInstruments(): InstrumentInfo[] {
    return this.marketDataService.getAvailableInstruments();
  }

  /**
   * GET /api/market-data/economic-calendar
   * Returns simulated economic events for the next 7 days.
   */
  @Get('economic-calendar')
  getEconomicCalendar(): EconomicEventResponse[] {
    return this.marketDataService.getEconomicCalendar();
  }

  /**
   * GET /api/market-data/preferences
   * Returns the chart preferences (instrument + timeframe) for the authenticated user.
   * Guard: AuthGuard('jwt') — requires a valid Bearer JWT.
   * Identity: @CurrentUser() extracts the UserPayload from req.user (set by JwtStrategy).
   */
  @Get('preferences')
  @UseGuards(AuthGuard('jwt'))
  async getPreferences(
    @CurrentUser() user: UserPayload,
  ): Promise<ChartPrefsResponseDto> {
    return this.userSettingsService.getChartPrefs(user.sub);
  }

  /**
   * PUT /api/market-data/preferences
   * Upserts the chart preferences for the authenticated user.
   * Guard: AuthGuard('jwt') — requires a valid Bearer JWT.
   * Body is validated via ValidationPipe with class-validator @IsIn constraints.
   * userId always comes from the JWT claim (user.sub) — never from the request body.
   */
  @Put('preferences')
  @UseGuards(AuthGuard('jwt'))
  async updatePreferences(
    @CurrentUser() user: UserPayload,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateChartPrefsDto,
  ): Promise<ChartPrefsResponseDto> {
    return this.userSettingsService.upsertChartPrefs(user.sub, dto);
  }

  /**
   * GET /api/market-data/watchlist
   * Returns the watchlist instrument list for the authenticated user.
   * Guard: AuthGuard('jwt') — requires a valid Bearer JWT.
   * Identity: @CurrentUser() extracts UserPayload from req.user (set by JwtStrategy).
   */
  @Get('watchlist')
  @UseGuards(AuthGuard('jwt'))
  async getWatchlist(
    @CurrentUser() user: UserPayload,
  ): Promise<WatchlistResponseDto> {
    const instruments = await this.userSettingsService.getWatchlist(user.sub);
    return { instruments };
  }

  /**
   * PUT /api/market-data/watchlist
   * Replaces the full watchlist for the authenticated user.
   * Guard: AuthGuard('jwt') — requires a valid Bearer JWT.
   * Body validated via ValidationPipe: 1–10 instruments from VALID_INSTRUMENTS.
   * userId always comes from the JWT claim (user.sub) — never from the request body.
   */
  @Put('watchlist')
  @UseGuards(AuthGuard('jwt'))
  async updateWatchlist(
    @CurrentUser() user: UserPayload,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: WatchlistUpdateDto,
  ): Promise<WatchlistResponseDto> {
    const instruments = await this.userSettingsService.upsertWatchlist(user.sub, dto.instruments);
    return { instruments };
  }
}
