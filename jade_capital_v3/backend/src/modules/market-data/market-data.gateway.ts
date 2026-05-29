import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { verify } from 'jsonwebtoken';

// ── Authenticated Socket ──────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  user?: { sub: string; email: string; username: string; roles: string[] };
}

// ── Gateway ──────────────────────────────────────────────────────────────

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: '/ws/market',
})
export class MarketDataGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MarketDataGateway.name);
  private subClient!: Redis;
  private redisChannels = new Set<string>();
  private connectedClients = new Map<string, Set<string>>(); // clientId → subscribed channels

  constructor(private readonly configService: ConfigService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  afterInit(): void {
    this.logger.log('MarketDataGateway initialized on /ws/market');

    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPass = this.configService.get<string>('REDIS_PASSWORD', '');

    this.subClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPass || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    this.subClient.connect().catch(() => {
      this.logger.warn('Redis not available for market gateway sub');
    });

    // Listen for Redis messages and forward to socket.io
    this.subClient.on('message', (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        // Determine event type from channel name
        if (channel.includes(':price')) {
          this.server.to(channel).emit('priceUpdate', data);
        } else if (channel.includes(':candles')) {
          this.server.to(channel).emit('candleUpdate', data);
        }
      } catch {
        // Ignore parse errors
      }
    });
  }

  handleConnection(client: Socket): void {
    const authClient = client as AuthenticatedSocket;
    this.connectedClients.set(client.id, new Set());

    // Try JWT auth but allow unauthenticated connections (market data is public)
    const token = client.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const secret = this.configService.get<string>('JWT_SECRET', 'change-me-in-production');
        const payload = verify(token, secret) as {
          sub: string;
          email: string;
          username: string;
          roles: string[];
        };
        authClient.user = payload;
        this.logger.log(`Client ${client.id} authenticated as ${payload.email}`);
      } catch {
        this.logger.debug(`Client ${client.id} connected with invalid token — proceeding as anonymous`);
      }
    }

    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Connected to market data stream' });
  }

  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Subscription Handlers ──────────────────────────────────────────────

  /**
   * Subscribe to real-time price updates for an instrument.
   * Channel: market:{instrument}:price
   */
  @SubscribeMessage('subscribe:price')
  handleSubscribePrice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instrument: string },
  ): void {
    const channel = `market:${data.instrument}:price`;
    client.join(channel);
    this.trackSubscription(client.id, channel);

    // Subscribe Redis side if first time
    this.subscribeRedisChannel(channel);

    this.logger.log(`Client ${client.id} subscribed to ${channel}`);
    client.emit('subscribed', { channel, type: 'price' });
  }

  /**
   * Subscribe to candle updates for an instrument + timeframe.
   * Channel: market:{instrument}:{tf}:candles
   */
  @SubscribeMessage('subscribe:candles')
  handleSubscribeCandles(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instrument: string; timeframe: string },
  ): void {
    const channel = `market:${data.instrument}-${data.timeframe}:candles`;
    client.join(channel);
    this.trackSubscription(client.id, channel);

    this.subscribeRedisChannel(channel);

    this.logger.log(`Client ${client.id} subscribed to ${channel}`);
    client.emit('subscribed', { channel, type: 'candles' });
  }

  /**
   * Subscribe to all prices (useful for watchlist views).
   */
  @SubscribeMessage('subscribe:prices')
  handleSubscribeAllPrices(
    @ConnectedSocket() client: Socket,
  ): void {
    const room = 'market:all:prices';
    client.join(room);
    this.trackSubscription(client.id, room);
    this.logger.log(`Client ${client.id} subscribed to all prices`);
    client.emit('subscribed', { channel: room, type: 'prices' });
  }

  /**
   * Unsubscribe from a specific channel.
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channel: string },
  ): void {
    client.leave(data.channel);
    const channels = this.connectedClients.get(client.id);
    channels?.delete(data.channel);
    this.logger.log(`Client ${client.id} unsubscribed from ${data.channel}`);
  }

  // ── Public Broadcast Methods ───────────────────────────────────────────

  /** Broadcast a price update to all clients subscribed to that instrument. */
  broadcastPrice(channel: string, data: Record<string, unknown>): void {
    this.server.to(channel).emit('priceUpdate', data);
  }

  /** Broadcast a candle update to all clients subscribed to that instrument+tf. */
  broadcastCandle(channel: string, data: Record<string, unknown>): void {
    this.server.to(channel).emit('candleUpdate', data);
  }

  /** Broadcast an economic event to all connected clients. */
  broadcastEconomicEvent(data: Record<string, unknown>): void {
    this.server.emit('economicEvent', data);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private trackSubscription(clientId: string, channel: string): void {
    const channels = this.connectedClients.get(clientId);
    if (channels) {
      channels.add(channel);
    }
  }

  private subscribeRedisChannel(channel: string): void {
    if (this.redisChannels.has(channel)) return;
    this.redisChannels.add(channel);

    this.subClient.subscribe(channel).catch(() => {
      this.logger.warn(`Failed to subscribe to Redis channel: ${channel}`);
    });
  }
}
