import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { MarketDataGateway } from './market-data.gateway';
import { Candle } from './entities/candle.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UserSettingsService } from './services/user-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Candle, UserSettings]),
    ConfigModule,
  ],
  controllers: [MarketDataController],
  providers: [MarketDataService, MarketDataGateway, UserSettingsService],
  exports: [MarketDataService, MarketDataGateway, UserSettingsService],
})
export class MarketDataModule {}
