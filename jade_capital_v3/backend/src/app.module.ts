import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TradesModule } from './modules/trades/trades.module';
import { JournalModule } from './modules/journal/journal.module';
import { GoalsModule } from './modules/goals/goals.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { ScannerModule } from './modules/scanner/scanner.module';
import { BacktestModule } from './modules/backtest/backtest.module';
import { AgentModule } from './modules/agent/agent.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { WebSocketsModule } from './websockets/web-sockets.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthController } from './health.controller';

import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import entities from './database/entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'jade'),
        password: config.get<string>('DB_PASSWORD', 'jade123'),
        database: config.get<string>('DB_DATABASE', 'jade_capital'),
        entities,
        synchronize: false,
        namingStrategy: new SnakeNamingStrategy(), // TimescaleDB hypertables are incompatible with auto-sync
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD', ''),
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    ScheduleModule.forRoot(),

    AuthModule,
    UsersModule,
    AccountsModule,
    TradesModule,
    JournalModule,
    GoalsModule,
    AlertsModule,
    MarketDataModule,
    ScannerModule,
    BacktestModule,
    AgentModule,
    TransactionsModule,
    BookmarksModule,
    WebSocketsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
