import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { Alert } from './entities/alert.entity';
import { AuthModule } from '../auth/auth.module';

// WebSocketsModule is @Global() — TradingGateway is available without explicit import.
// MarketDataModule publishes to Redis market:*:price channels; the evaluator
// subscribes to those channels via its own ioredis client (same pattern as
// MarketDataGateway). No direct import of MarketDataModule is required.

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert]),
    ConfigModule,
    AuthModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEvaluatorService],
  exports: [AlertsService, AlertEvaluatorService],
})
export class AlertsModule {}
