import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccountsService, AggregateResponse, DashboardResponse } from './accounts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';
import { TradingAccount } from './entities/trading-account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('config')
  getConfig() {
    return {
      instruments: ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','EUR/JPY','GBP/JPY','NZD/USD','USD/CHF','EUR/GBP','GBP/AUD'],
      payout_pct_default: 77,
      payout_options: [70, 75, 77, 80, 83, 85, 87, 90],
      investment_pct_default: 0.01,
      expiry_options: ['1m','2m','3m','5m','10m','15m','30m','1h'],
    };
  }

  @Get('aggregate')
  async getAggregate(
    @CurrentUser() user: UserPayload,
  ): Promise<AggregateResponse> {
    return this.accountsService.getAggregate(user.sub);
  }

  @Get()
  async findAll(@CurrentUser() user: UserPayload): Promise<TradingAccount[]> {
    return this.accountsService.findAll(user.sub);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<TradingAccount> {
    return this.accountsService.findById(id, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: UserPayload,
  ): Promise<TradingAccount> {
    return this.accountsService.create(user.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: UserPayload,
  ): Promise<TradingAccount> {
    return this.accountsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    return this.accountsService.remove(id, user.sub);
  }

  @Get(':id/dashboard')
  async getDashboard(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<DashboardResponse> {
    return this.accountsService.getDashboard(id, user.sub);
  }

  @Post(':id/deposit')
  async deposit(
    @Param('id') id: string,
    @Body() body: { amount: number },
    @CurrentUser() user: UserPayload,
  ): Promise<TradingAccount> {
    return this.accountsService.deposit(id, user.sub, body.amount);
  }

  @Post(':id/withdraw')
  async withdraw(
    @Param('id') id: string,
    @Body() body: { amount: number },
    @CurrentUser() user: UserPayload,
  ): Promise<TradingAccount> {
    return this.accountsService.withdraw(id, user.sub, body.amount);
  }
}
