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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JournalService } from './journal.service';
import { JournalEntry } from './entities/journal-entry.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalQueryDto } from './dto/journal-query.dto';

@Controller('journal')
@UseGuards(AuthGuard('jwt'))
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query() filters: JournalQueryDto,
  ): Promise<JournalEntry[]> {
    return this.journalService.findAll(user.sub, filters);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<JournalEntry> {
    return this.journalService.findById(id, user.sub);
  }

  @Post()
  async create(
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser() user: UserPayload,
  ): Promise<JournalEntry> {
    return this.journalService.create(user.sub, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
    @CurrentUser() user: UserPayload,
  ): Promise<JournalEntry> {
    return this.journalService.update(id, user.sub, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<void> {
    return this.journalService.remove(id, user.sub);
  }
}
