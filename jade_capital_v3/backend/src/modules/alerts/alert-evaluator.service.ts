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
import { Alert, AlertCondition, AlertStatus } from './entities/alert.entity';
import { TradingGateway } from '../../websockets/trading.gateway';

// ── Types ──────────────────────────────────────────────────────────────────

interface PriceTick {
  bid: number;
  ask: number;
  timestamp: number;
}

// ── AlertEvaluatorService ──────────────────────────────────────────────────

/**
 * AlertEvaluatorService — subscribes to Redis `market:*:price` channels
 * via ioredis psubscribe and evaluates all active alerts on each tick.
 *
 * Key state:
 *   _cache: Map<string, Alert[]>  — instrument → active alerts
 *   _prev:  Map<string, number>   — instrument → last tick bid price
 *                                   (required for crosses_above / crosses_below)
 *   _subClient: Redis             — dedicated subscriber connection
 *
 * Lifecycle (NestJS):
 *   onModuleInit()    — seed cache from DB, connect to Redis, psubscribe
 *   onModuleDestroy() — punsubscribe, quit Redis connection
 *
 * Cache invalidation:
 *   invalidateCache(instrument) — called by AlertsService after every write
 *   to keep the in-memory bucket consistent without a restart.
 *
 * Multi-user isolation: each Alert carries its own userId. broadcastAlert
 * is always called with alert.userId — no user data ever leaks across users.
 */
@Injectable()
export class AlertEvaluatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  /** instrument → active (non-triggered) alerts for that instrument */
  private readonly _cache = new Map<string, Alert[]>();

  /** instrument → last tick bid price (for crossover detection) */
  private readonly _prev = new Map<string, number>();

  /** Dedicated Redis subscriber client (ioredis — same pattern as MarketDataGateway) */
  private _subClient!: Redis;

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    private readonly tradingGateway: TradingGateway,
    private readonly configService: ConfigService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.logger.log('AlertEvaluatorService initializing...');

    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPass = this.configService.get<string>('REDIS_PASSWORD', '');

    this._subClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPass || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    try {
      await this._subClient.connect();
      this.logger.log('AlertEvaluatorService connected to Redis');
    } catch (err) {
      this.logger.warn(
        `Redis not available for alert evaluator — running without price evaluation: ${(err as Error).message}`,
      );
      return;
    }

    // Seed cache from DB before subscribing so no tick is missed
    await this._seedCache();

    // Register pmessage handler before psubscribing
    this._subClient.on('pmessage', (pattern: string, channel: string, message: string) => {
      void this._handlePmessage(pattern, channel, message);
    });

    // Subscribe to all price channels in one call
    await this._subClient.psubscribe('market:*:price');
    this.logger.log('AlertEvaluatorService subscribed to market:*:price');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('AlertEvaluatorService shutting down...');
    try {
      await this._subClient.punsubscribe();
      await this._subClient.quit();
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }

  // ── Cache invalidation (public API) ────────────────────────────────────

  /**
   * Reload active alerts for `instrument` from DB and replace the cache bucket.
   * Called by AlertsService after every create/update/remove operation.
   */
  async invalidateCache(instrument: string): Promise<void> {
    const alerts = await this.alertRepository.find({
      where: { instrument, status: AlertStatus.ACTIVE },
    });
    this._cache.set(instrument, alerts);
    this.logger.debug(
      `Cache invalidated for ${instrument}: ${alerts.length} active alert(s)`,
    );
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /** Seed the in-memory cache with all currently active alerts from DB. */
  private async _seedCache(): Promise<void> {
    const alerts = await this.alertRepository.find({
      where: { status: AlertStatus.ACTIVE },
    });

    this._cache.clear();
    for (const alert of alerts) {
      const bucket = this._cache.get(alert.instrument) ?? [];
      bucket.push(alert);
      this._cache.set(alert.instrument, bucket);
    }

    this.logger.log(
      `Alert cache seeded: ${alerts.length} active alert(s) across ${this._cache.size} instrument(s)`,
    );
  }

  /** Handle a single pmessage event from Redis. */
  private async _handlePmessage(
    _pattern: string,
    channel: string,
    message: string,
  ): Promise<void> {
    // Channel format: market:{instrument}:price
    // e.g. "market:EUR/USD:price"
    const match = /^market:(.+):price$/.exec(channel);
    if (!match) return;

    const instrument = match[1];

    let tick: PriceTick;
    try {
      tick = JSON.parse(message) as PriceTick;
    } catch {
      this.logger.warn(`AlertEvaluator: failed to parse price message on ${channel}`);
      return;
    }

    if (typeof tick.bid !== 'number') return;

    await this._evaluateTick(instrument, tick.bid);
  }

  /**
   * Evaluate all active alerts for `instrument` against `currentPrice`.
   * Updates _prev after all alerts have been processed so crossover logic is
   * consistent within a single tick.
   */
  private async _evaluateTick(instrument: string, currentPrice: number): Promise<void> {
    const bucket = this._cache.get(instrument);
    if (!bucket || bucket.length === 0) return;

    const prev = this._prev.get(instrument);

    // Iterate over a snapshot so removal inside _fireAlert does not skip items
    const snapshot = [...bucket];
    for (const alert of snapshot) {
      if (this._matches(alert, currentPrice, prev)) {
        await this._fireAlert(alert, currentPrice);
      }
    }

    this._prev.set(instrument, currentPrice);
  }

  /**
   * Pure function — no I/O.
   * Returns true when the alert's condition is satisfied given the current
   * and previous prices.
   *
   * Multi-user isolation: each alert carries userId from DB — this function
   * only evaluates the alert's own condition; no cross-user data is read.
   */
  private _matches(
    alert: Alert,
    current: number,
    prev: number | undefined,
  ): boolean {
    const t = Number(alert.targetPrice);

    switch (alert.condition) {
      case AlertCondition.ABOVE:
        return current >= t;

      case AlertCondition.BELOW:
        return current <= t;

      case AlertCondition.CROSSES_ABOVE:
        // Requires a previous tick to determine crossing direction
        return prev !== undefined && prev < t && current >= t;

      case AlertCondition.CROSSES_BELOW:
        return prev !== undefined && prev > t && current <= t;

      default:
        return false;
    }
  }

  /**
   * Fire a triggered alert:
   * 1. Remove from cache immediately (one-shot — never fires twice)
   * 2. Persist triggered state to DB (best-effort)
   * 3. Deliver via WebSocket to the owning user
   */
  private async _fireAlert(alert: Alert, currentPrice: number): Promise<void> {
    // 1. Remove from cache immediately so re-evaluation won't fire again
    const bucket = this._cache.get(alert.instrument);
    if (bucket) {
      const idx = bucket.indexOf(alert);
      if (idx !== -1) {
        bucket.splice(idx, 1);
      }
    }

    const now = new Date();

    // 2. Persist to DB — best-effort; log on failure but don't crash the evaluator
    try {
      await this.alertRepository.save({
        ...alert,
        status: AlertStatus.TRIGGERED,
        triggeredAt: now,
      });
    } catch (err) {
      this.logger.error(
        `AlertEvaluator: DB persist error for alert ${alert.id}: ${(err as Error).message}`,
      );
    }

    // 3. Deliver via WebSocket — user:{userId}:alerts room (TradingGateway)
    const payload: Record<string, unknown> = {
      type: 'alert:triggered',
      alertId: alert.id,
      instrument: alert.instrument,
      condition: alert.condition,
      targetPrice: Number(alert.targetPrice),
      currentPrice,
      triggeredAt: now.toISOString(),
    };

    this.tradingGateway.broadcastAlert(alert.userId, payload);

    this.logger.log(
      `Alert triggered: id=${alert.id} user=${alert.userId} instrument=${alert.instrument} condition=${alert.condition} price=${currentPrice}`,
    );
  }
}
