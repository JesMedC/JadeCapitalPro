import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalQueryDto } from './dto/goal-query.dto';
import { GoalResponseDto } from './dto/goal-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('goals')
@UseGuards(AuthGuard('jwt'))
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query() filters: GoalQueryDto,
  ): Promise<GoalResponseDto[]> {
    return this.goalsService.findAll(user.sub, filters);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<GoalResponseDto> {
    return this.goalsService.findById(id, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGoalDto,
    @CurrentUser() user: UserPayload,
  ): Promise<GoalResponseDto> {
    return this.goalsService.create(user.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
    @CurrentUser() user: UserPayload,
  ): Promise<GoalResponseDto> {
    return this.goalsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    return this.goalsService.remove(id, user.sub);
  }
}
