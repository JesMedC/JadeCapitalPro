import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TradesService } from './trades.service';
import { Trade } from './entities/trade.entity';
import { OpenTradeDto } from './dto/open-trade.dto';
import {
  CloseBinaryTradeDto,
  CloseForexTradeDto,
} from './dto/close-trade.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('trades')
@UseGuards(AuthGuard('jwt'))
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get(':accountId')
  async findByAccount(
    @Param('accountId') accountId: string,
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
  ): Promise<{ trades: Trade[]; kpis: { total: number; winRate: number; netPnl: number } }> {
    // Normalize status filter: frontend sends 'win'/'loss', backend uses 'won'/'lost'
    let normalizedStatus = status;
    if (status === 'win') normalizedStatus = 'won';
    else if (status === 'loss') normalizedStatus = 'lost';
    
    const trades = await this.tradesService.findByAccount(accountId, user.sub, normalizedStatus);

    const closedTrades = trades.filter(
      (t) => t.status === 'won' || t.status === 'lost' || t.status === 'be',
    );
    const wonTrades = closedTrades.filter((t) => t.status === 'won');
    const total = trades.length;
    const winRate = closedTrades.length > 0 ? wonTrades.length / closedTrades.length : 0;
    const netPnl = closedTrades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);

    return {
      trades,
      kpis: {
        total,
        winRate: Math.round(winRate * 10000) / 10000,
        netPnl: Math.round(netPnl * 100) / 100,
      },
    };
  }

  @Get('detail/:id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<Trade> {
    return this.tradesService.findById(id, user.sub);
  }

  @Post('manual/open')
  @HttpCode(HttpStatus.CREATED)
  async openTrade(
    @Body() dto: OpenTradeDto,
    @CurrentUser() user: UserPayload,
  ): Promise<Trade> {
    return this.tradesService.openTrade(user.sub, dto);
  }

  @Post('manual/binary/:id/close')
  async closeBinaryTrade(
    @Param('id') id: string,
    @Body() dto: CloseBinaryTradeDto,
    @CurrentUser() user: UserPayload,
  ): Promise<Trade> {
    return this.tradesService.closeBinaryTrade(id, user.sub, dto);
  }

  @Post('manual/forex/:id/close')
  async closeForexTrade(
    @Param('id') id: string,
    @Body() dto: CloseForexTradeDto,
    @CurrentUser() user: UserPayload,
  ): Promise<Trade> {
    return this.tradesService.closeForexTrade(id, user.sub, dto);
  }

  @Post('manual/:id/cancel')
  async cancelTrade(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<Trade> {
    return this.tradesService.cancelTrade(id, user.sub);
  }

  @Post('manual/:id/delete')
  async deleteTrade(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    return this.tradesService.deleteTrade(id, user.sub);
  }
}
