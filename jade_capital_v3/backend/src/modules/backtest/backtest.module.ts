import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { BacktestProcessor } from './backtest.processor';
import { BacktestSession } from './entities/backtest-session.entity';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { WebSocketsModule } from '../../websockets/web-sockets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BacktestSession]),
    BullModule.registerQueue({ name: 'backtest' }),
    AuthModule,
    // MarketDataModule exports MarketDataService used by BacktestProcessor.
    // MarketDataModule does NOT import BacktestModule — no circular dependency.
    MarketDataModule,
    // Belt-and-suspenders: explicit import ensures TradingGateway remains injectable
    // even if @Global() is ever removed from WebSocketsModule.
    WebSocketsModule,
  ],
  controllers: [BacktestController],
  providers: [BacktestService, BacktestProcessor],
  exports: [BacktestService],
})
export class BacktestModule {}
