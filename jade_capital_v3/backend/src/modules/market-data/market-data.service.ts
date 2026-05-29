import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Candle } from './entities/candle.entity';

// ── Types ──────────────────────────────────────────────────────────────────

interface PriceTick {
  bid: number;
  ask: number;
  timestamp: number;
}

interface CandleTick {
  instrument: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface EconomicEvent {
  timestamp: string;
  currency: string;
  event: string;
  impact: ImpactLevel;
  detail: string;
}

interface InstrumentConfig {
  baseBid: number;
  volatility: number;
  spreadFraction: number;
  pipPrecision: number;
  type: 'forex' | 'crypto';
  name: string;
}

// ── Base Instrument Catalog ────────────────────────────────────────────────

const INSTRUMENT_CATALOG: Record<string, InstrumentConfig> = {
  'EUR/USD': { baseBid: 1.0850, volatility: 0.00009, spreadFraction: 0.00018, pipPrecision: 5, type: 'forex', name: 'Euro / US Dollar' },
  'GBP/USD': { baseBid: 1.2650, volatility: 0.00012, spreadFraction: 0.00024, pipPrecision: 5, type: 'forex', name: 'British Pound / US Dollar' },
  'USD/JPY': { baseBid: 154.50, volatility: 0.018,   spreadFraction: 0.00012, pipPrecision: 3, type: 'forex', name: 'US Dollar / Japanese Yen' },
  'AUD/USD': { baseBid: 0.6520, volatility: 0.00011, spreadFraction: 0.00023, pipPrecision: 5, type: 'forex', name: 'Australian Dollar / US Dollar' },
  'USD/CAD': { baseBid: 1.3580, volatility: 0.00010, spreadFraction: 0.00020, pipPrecision: 5, type: 'forex', name: 'US Dollar / Canadian Dollar' },
  'EUR/JPY': { baseBid: 167.80, volatility: 0.025,   spreadFraction: 0.00015, pipPrecision: 3, type: 'forex', name: 'Euro / Japanese Yen' },
  'GBP/JPY': { baseBid: 195.40, volatility: 0.030,   spreadFraction: 0.00015, pipPrecision: 3, type: 'forex', name: 'British Pound / Japanese Yen' },
  'NZD/USD': { baseBid: 0.5980, volatility: 0.00012, spreadFraction: 0.00025, pipPrecision: 5, type: 'forex', name: 'New Zealand Dollar / US Dollar' },
  'USD/CHF': { baseBid: 0.9050, volatility: 0.00008, spreadFraction: 0.00018, pipPrecision: 5, type: 'forex', name: 'US Dollar / Swiss Franc' },
  'BTC/USD': { baseBid: 67500,  volatility: 45.0,    spreadFraction: 0.00010, pipPrecision: 2, type: 'crypto', name: 'Bitcoin / US Dollar' },
};

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const MAX_CANDLES_PER_KEY = 1000;

// ── Economic Calendar Templates ────────────────────────────────────────────

const ECONOMIC_EVENT_TEMPLATES: Array<{
  event: string;
  currencies: string[];
  impact: 'high' | 'medium' | 'low';
  detailFn: () => string;
}> = [
  { event: 'Non-Farm Payrolls', currencies: ['USD'], impact: 'high', detailFn: () => `Actual: ${(150 + Math.random() * 200).toFixed(0)}K vs Forecast: ${(180 + Math.random() * 50).toFixed(0)}K` },
  { event: 'CPI (YoY)', currencies: ['USD', 'EUR', 'GBP'], impact: 'high', detailFn: () => `Actual: ${(2.0 + Math.random() * 2).toFixed(1)}% vs Forecast: ${(2.5 + Math.random() * 1).toFixed(1)}%` },
  { event: 'GDP (QoQ)', currencies: ['USD', 'EUR', 'GBP', 'JPY'], impact: 'high', detailFn: () => `Actual: ${(0.5 + Math.random() * 2).toFixed(1)}% vs Forecast: ${(1.0 + Math.random()).toFixed(1)}%` },
  { event: 'Interest Rate Decision', currencies: ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF'], impact: 'high', detailFn: () => `Rate: ${(3.0 + Math.random() * 3).toFixed(2)}% (${Math.random() > 0.5 ? 'Hold' : 'Change'})` },
  { event: 'Retail Sales (MoM)', currencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD'], impact: 'medium', detailFn: () => `Actual: ${(0.2 + Math.random() * 1.5).toFixed(1)}% vs Forecast: ${(0.3 + Math.random() * 1).toFixed(1)}%` },
  { event: 'PMI Manufacturing', currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CHF'], impact: 'medium', detailFn: () => `Actual: ${(48 + Math.random() * 8).toFixed(1)} vs Forecast: ${(49 + Math.random() * 6).toFixed(1)}` },
  { event: 'Unemployment Rate', currencies: ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD'], impact: 'medium', detailFn: () => `Actual: ${(3.0 + Math.random() * 3).toFixed(1)}% vs Forecast: ${(3.5 + Math.random() * 2).toFixed(1)}%` },
  { event: 'Trade Balance', currencies: ['USD', 'EUR', 'JPY', 'AUD', 'NZD'], impact: 'low', detailFn: () => `Actual: $${(-80 + Math.random() * 40).toFixed(1)}B vs Forecast: $${(-70 + Math.random() * 30).toFixed(1)}B` },
  { event: 'Consumer Confidence', currencies: ['USD', 'EUR', 'GBP'], impact: 'low', detailFn: () => `Index: ${(95 + Math.random() * 20).toFixed(1)} vs Forecast: ${(98 + Math.random() * 15).toFixed(1)}` },
  { event: 'Industrial Production (MoM)', currencies: ['USD', 'EUR', 'JPY'], impact: 'low', detailFn: () => `Actual: ${(-0.5 + Math.random() * 1.5).toFixed(1)}% vs Forecast: ${0.2.toFixed(1)}%` },
];

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataService.name);

  private prices = new Map<string, PriceTick>();
  private candles = new Map<string, CandleTick[]>();
  private readonly volatility = new Map<string, number>();
  private readonly instrumentConfigs = new Map<string, InstrumentConfig>();

  private engineTimer: ReturnType<typeof setInterval> | null = null;
  private pubClient!: Redis;
  private subClient!: Redis;
  private economicEvents: EconomicEvent[] = [];

  private readonly instrumentList: string[] = Object.keys(INSTRUMENT_CATALOG);

  constructor(
    @InjectRepository(Candle)
    private readonly candleRepository: Repository<Candle>,
    private readonly configService: ConfigService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing SimulatedPriceEngine...');

    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPass = this.configService.get<string>('REDIS_PASSWORD', '');

    this.pubClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPass || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    this.subClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPass || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    // Initialize prices and volatility
    for (const [symbol, config] of Object.entries(INSTRUMENT_CATALOG)) {
      const spread = config.baseBid * config.spreadFraction;
      this.prices.set(symbol, {
        bid: config.baseBid,
        ask: config.baseBid + spread,
        timestamp: Date.now(),
      });
      this.volatility.set(symbol, config.volatility);
      this.instrumentConfigs.set(symbol, config);
    }

    // Seed initial candles
    for (const symbol of this.instrumentList) {
      for (const tf of TIMEFRAMES) {
        const key = this.candleKey(symbol, tf);
        this.candles.set(key, this.generateHistoricalCandles(symbol, tf));
      }
    }

    // Generate economic calendar
    this.economicEvents = this.generateEconomicCalendar();

    try {
      await this.pubClient.connect();
      await this.subClient.connect();
      this.logger.log('Connected to Redis for pub/sub');
    } catch (err) {
      this.logger.warn(`Redis not available — running without pub/sub: ${(err as Error).message}`);
    }

    this.startEngine();
    this.logger.log('SimulatedPriceEngine started — ticking every 500ms');
  }

  onModuleDestroy(): void {
    this.stopEngine();
    this.pubClient?.quit();
    this.subClient?.quit();
  }

  // ── Engine Control ─────────────────────────────────────────────────────

  private startEngine(): void {
    this.engineTimer = setInterval(() => this.tick(), 500);
  }

  private stopEngine(): void {
    if (this.engineTimer) {
      clearInterval(this.engineTimer);
      this.engineTimer = null;
    }
  }

  // ── Core Tick ──────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();

    for (const symbol of this.instrumentList) {
      const price = this.prices.get(symbol);
      if (!price) continue;

      const vol = this.volatility.get(symbol) ?? 0.0001;

      // Geometric Brownian motion with occasional spike
      const drift = (Math.random() - 0.5) * 0.02; // small mean-reversion
      const shock = this.boxMuller(0, 1) * vol;
      const spike = Math.random() < 0.002 ? (Math.random() - 0.5) * vol * 8 : 0; // rare spike

      const change = (drift + shock + spike) * price.bid;
      const newBid = Math.max(price.bid + change, price.bid * 0.90); // circuit breaker
      const spread = price.ask - price.bid;
      const newAsk = newBid + spread;

      this.prices.set(symbol, {
        bid: +newBid.toFixed(5),
        ask: +(newBid + spread).toFixed(5),
        timestamp: now,
      });

      // Update all timeframe candles
      for (const tf of TIMEFRAMES) {
        this.updateCandle(symbol, tf, newBid, newAsk, now);
      }

      // Publish to Redis pub/sub
      this.publishPriceUpdate(symbol, newBid, newAsk, spread, now);
    }
  }

  // ── Candle Logic ───────────────────────────────────────────────────────

  private updateCandle(
    symbol: string,
    tf: string,
    bid: number,
    ask: number,
    now: number,
  ): void {
    const key = this.candleKey(symbol, tf);
    const candles = this.candles.get(key) ?? [];
    const tfMs = TF_MS[tf] ?? 300_000;
    const mid = (bid + ask) / 2;

    // Get the aligned bucket timestamp
    const bucketTs = Math.floor(now / tfMs) * tfMs;

    let current = candles.length > 0 ? candles[candles.length - 1] : null;

    if (!current || current.timestamp < bucketTs) {
      // New candle
      const vol = Math.floor(Math.random() * 80) + 10;
      current = {
        instrument: symbol,
        timeframe: tf,
        timestamp: bucketTs,
        open: mid,
        high: mid,
        low: mid,
        close: mid,
        volume: vol,
      };
      candles.push(current);

      // Prune old candles
      if (candles.length > MAX_CANDLES_PER_KEY) {
        candles.splice(0, candles.length - MAX_CANDLES_PER_KEY);
      }

      this.candles.set(key, candles);

      // Publish previous candle close
      this.publishCandleUpdate(key, current);
    } else {
      // Update existing candle
      current.high = Math.max(current.high, mid);
      current.low = Math.min(current.low, mid);
      current.close = mid;
      current.volume += Math.floor(Math.random() * 3);
    }
  }

  // ── Historical Seed Candles ────────────────────────────────────────────

  private generateHistoricalCandles(symbol: string, tf: string): CandleTick[] {
    const price = this.prices.get(symbol);
    const basePrice = price?.bid ?? 1.0;
    const vol = this.volatility.get(symbol) ?? 0.0001;
    const tfMs = TF_MS[tf] ?? 300_000;
    const count = Math.min(MAX_CANDLES_PER_KEY, 500);
    const result: CandleTick[] = [];

    let prevClose = basePrice * (0.98 + Math.random() * 0.04); // vary starting price

    for (let i = count - 1; i >= 0; i--) {
      const ts = Date.now() - (i + 1) * tfMs;
      const change = (Math.random() - 0.5) * 2 * vol * prevClose;
      const open = prevClose;
      const close = open + change;
      const high = Math.max(open, close) * (1 + Math.random() * vol * 0.5);
      const low = Math.min(open, close) * (1 - Math.random() * vol * 0.5);

      result.push({
        instrument: symbol,
        timeframe: tf,
        timestamp: ts,
        open: +open.toFixed(5),
        high: +high.toFixed(5),
        low: +low.toFixed(5),
        close: +close.toFixed(5),
        volume: Math.floor(Math.random() * 100) + 10,
      });

      prevClose = close;
    }

    return result;
  }

  // ── Economic Calendar ──────────────────────────────────────────────────

  private generateEconomicCalendar(): EconomicEvent[] {
    const events: EconomicEvent[] = [];
    const now = new Date();

    // Generate events for today + next 7 days
    for (let day = 0; day < 7; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      // 3-8 events per day
      const eventsPerDay = 3 + Math.floor(Math.random() * 6);

      for (let e = 0; e < eventsPerDay; e++) {
        const template =
          ECONOMIC_EVENT_TEMPLATES[
            Math.floor(Math.random() * ECONOMIC_EVENT_TEMPLATES.length)
          ];

        const currency =
          template.currencies[
            Math.floor(Math.random() * template.currencies.length)
          ];

        // Random time during market hours (7:00-21:00 UTC)
        const hour = 7 + Math.floor(Math.random() * 14);
        const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
        date.setUTCHours(hour, minute, 0, 0);

        events.push({
          timestamp: date.toISOString(),
          currency,
          event: template.event,
          impact: template.impact,
          detail: template.detailFn(),
        });
      }
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return events;
  }

  // ── Redis Publishing ───────────────────────────────────────────────────

  private async publishPriceUpdate(
    instrument: string,
    bid: number,
    ask: number,
    spread: number,
    timestamp: number,
  ): Promise<void> {
    const payload = JSON.stringify({ instrument, bid, ask, spread, timestamp });
    try {
      await this.pubClient.publish(
        `market:${instrument}:price`,
        payload,
      );
    } catch {
      // Redis not available, silently ignore
    }
  }

  private async publishCandleUpdate(
    key: string,
    candle: CandleTick,
  ): Promise<void> {
    const payload = JSON.stringify(candle);
    try {
      await this.pubClient.publish(`market:${key}:candles`, payload);
    } catch {
      // Redis not available, silently ignore
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Get current price for a single instrument */
  getPrice(instrument: string): PriceTick | null {
    return this.prices.get(instrument) ?? null;
  }

  /** Get candles for an instrument + timeframe */
  getCandles(
    instrument: string,
    timeframe: string = '5m',
    limit: number = 100,
  ): CandleTick[] {
    const key = this.candleKey(instrument, timeframe);
    const candles = this.candles.get(key) ?? [];
    const sorted = [...candles].sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(0, limit);
  }

  /** Get all available instruments with metadata */
  getAvailableInstruments(): Array<{ symbol: string; type: string; name: string; pipPrecision: number; minSpread: number }> {
    return this.instrumentList.map((symbol) => {
      const config = this.instrumentConfigs.get(symbol)!;
      const price = this.prices.get(symbol);
      return {
        symbol,
        type: config.type,
        name: config.name,
        pipPrecision: config.pipPrecision,
        minSpread: Math.round(config.baseBid * config.spreadFraction * 100000) / 100000,
      };
    });
  }

  /** Get economic calendar events */
  getEconomicCalendar(): EconomicEvent[] {
    return this.economicEvents;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private candleKey(instrument: string, timeframe: string): string {
    return `${instrument}-${timeframe}`;
  }

  /** Box-Muller transform for normally-distributed random numbers */
  private boxMuller(mean: number, stdDev: number): number {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z * stdDev + mean;
  }
}
