import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BacktestService } from './backtest.service';
import { BacktestSession } from './entities/backtest-session.entity';
import { CreateBacktestDto } from './dto/create-backtest.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('backtest')
@UseGuards(AuthGuard('jwt'))
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Get()
  async findAll(@CurrentUser() user: UserPayload): Promise<BacktestSession[]> {
    return this.backtestService.findAll(user.sub);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<BacktestSession> {
    return this.backtestService.findById(id, user.sub);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(
    @Body() dto: CreateBacktestDto,
    @CurrentUser() user: UserPayload,
  ): Promise<BacktestSession> {
    return this.backtestService.create(user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    return this.backtestService.delete(id, user.sub);
  }
}
