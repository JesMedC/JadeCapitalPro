import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingGateway } from './trading.gateway';
import { WsAuthMiddleware } from './ws-auth.middleware';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TradingGateway, WsAuthMiddleware],
  exports: [TradingGateway, WsAuthMiddleware],
})
export class WebSocketsModule {}
