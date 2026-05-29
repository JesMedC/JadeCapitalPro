import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { TradingAccount } from './entities/trading-account.entity';
import { AccountAccess } from './entities/account-access.entity';
import { Trade } from '../trades/entities/trade.entity';
import { Goal } from '../goals/entities/goal.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradingAccount, AccountAccess, Trade, Goal]),
    AuthModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
