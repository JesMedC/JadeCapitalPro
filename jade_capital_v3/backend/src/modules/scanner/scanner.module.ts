import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';
import { ScannerScheduler } from './scanner-scheduler.service';
import { ScannerResult } from './entities/scanner-result.entity';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';

// Note: ScheduleModule.forRoot() is registered at AppModule level (Sprint 9 task 1.2).
// Do NOT add it here — double-registration causes issues.

@Module({
  imports: [
    TypeOrmModule.forFeature([ScannerResult]),
    AuthModule,
    MarketDataModule,
  ],
  controllers: [ScannerController],
  providers: [ScannerService, ScannerScheduler],
  exports: [ScannerService],
})
export class ScannerModule {}
