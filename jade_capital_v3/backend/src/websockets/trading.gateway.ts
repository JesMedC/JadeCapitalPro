import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsAuthMiddleware, AuthenticatedSocket } from './ws-auth.middleware';

export interface BacktestProgressPayload {
  /** UUID of the backtest session */
  sessionId: string;
  /** Candles processed so far (integer ≥ 0) */
  processed: number;
  /** Total actionable candles (sorted.length - 2, integer > 0) */
  total: number;
  /** Math.round(processed / total * 100), integer 0–100 */
  percent: number;
  status: 'running' | 'completed' | 'failed';
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  },
  namespace: '/ws',
})
export class TradingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TradingGateway.name);

  constructor(private readonly wsAuth: WsAuthMiddleware) {}

  handleConnection(client: Socket): void {
    this.wsAuth.use(client, (err?: Error) => {
      if (err) {
        client.emit('error', { message: err.message });
        client.disconnect();
        return;
      }

      const authClient = client as AuthenticatedSocket;
      const userId = authClient.user.sub;

      client.join('scanner:global');
      client.join(`user:${userId}:trades`);
      client.join(`user:${userId}:alerts`);
      client.join(`user:${userId}:backtest`);

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
      client.emit('connected', { message: 'Authenticated', userId });
    });
  }

  handleDisconnect(client: Socket): void {
    const authClient = client as AuthenticatedSocket;
    if (authClient.user) {
      this.logger.log(`Client disconnected: ${client.id} (user: ${authClient.user.sub})`);
    }
  }

  @SubscribeMessage('subscribe:candles')
  handleSubscribeCandles(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { instrument: string },
  ): void {
    const room = `market:${data.instrument}:candles`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
    client.emit('subscribed', { room });
  }

  @SubscribeMessage('unsubscribe:candles')
  handleUnsubscribeCandles(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { instrument: string },
  ): void {
    const room = `market:${data.instrument}:candles`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);
  }

  @SubscribeMessage('trade:update')
  handleTradeUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: Record<string, unknown>,
  ): void {
    const userId = client.user.sub;
    this.server.to(`user:${userId}:trades`).emit('trade:updated', data);
  }

  @SubscribeMessage('alert:notify')
  handleAlertNotify(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: Record<string, unknown>,
  ): void {
    const userId = client.user.sub;
    this.server.to(`user:${userId}:alerts`).emit('alert:triggered', data);
  }

  broadcastTrade(userId: string, data: Record<string, unknown>): void {
    this.server.to(`user:${userId}:trades`).emit('trade:updated', data);
  }

  broadcastAlert(userId: string, data: Record<string, unknown>): void {
    this.server.to(`user:${userId}:alerts`).emit('alert:triggered', data);
  }

  broadcastCandle(instrument: string, data: Record<string, unknown>): void {
    this.server.to(`market:${instrument}:candles`).emit('candle', data);
  }

  broadcastScanner(data: Record<string, unknown>): void {
    this.server.to('scanner:global').emit('scanner:updated', data);
  }

  broadcastBacktestProgress(userId: string, payload: BacktestProgressPayload): void {
    this.server.to(`user:${userId}:backtest`).emit('backtest:progress', payload);
  }
}
