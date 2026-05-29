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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { UpdateBookmarkNotesDto } from './dto/update-bookmark-notes.dto';
import { PatternBookmark } from './entities/pattern-bookmark.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('bookmarks')
@UseGuards(AuthGuard('jwt'))
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Get()
  async findAll(@CurrentUser() user: UserPayload): Promise<PatternBookmark[]> {
    return this.bookmarksService.findAll(user.sub);
  }

  /**
   * Idempotent POST — returns 201 on create, 200 when bookmark already exists.
   */
  @Post()
  async create(
    @Body() dto: CreateBookmarkDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { bookmark, created } = await this.bookmarksService.upsert(user.sub, dto);
    res
      .status(created ? HttpStatus.CREATED : HttpStatus.OK)
      .json(bookmark);
  }

  @Patch(':id/notes')
  @HttpCode(HttpStatus.OK)
  async updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateBookmarkNotesDto,
    @CurrentUser() user: UserPayload,
  ): Promise<PatternBookmark> {
    return this.bookmarksService.updateNotes(id, user.sub, dto.notes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<{ status: string }> {
    await this.bookmarksService.remove(id, user.sub);
    return { status: 'deleted' };
  }
}
