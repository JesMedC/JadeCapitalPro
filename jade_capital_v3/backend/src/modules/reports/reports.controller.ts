import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('accounts/:id/report')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /accounts/:id/report?preset=30d
   * GET /accounts/:id/report?from=2026-01-01&to=2026-01-31
   *
   * Returns a binary PDF stream with proper content headers.
   * AC-1: 200 + application/pdf
   * AC-3: 401 when no JWT (enforced by AuthGuard)
   * AC-4: 403 when wrong owner (enforced by ReportsService)
   * AC-5: 404 { error: 'no_trades_in_range' } when no closed trades
   * AC-6: 400 when from > to
   */
  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getReport(
    @Param('id') accountId: string,
    @Query() dto: ReportQueryDto,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { fromDate, toDate } = this.reportsService.resolvePreset(
      dto.preset,
      dto.from,
      dto.to,
    );

    const buffer = await this.reportsService.generate(
      accountId,
      user.sub,
      fromDate,
      toDate,
    );

    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];
    const filename = `report_${fromStr}_${toStr}.pdf`;

    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      })
      .send(buffer);
  }
}
