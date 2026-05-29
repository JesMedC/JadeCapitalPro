import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ScannerService } from './scanner.service';
import { ScannerResult } from './entities/scanner-result.entity';

@Controller('scanner')
@UseGuards(AuthGuard('jwt'))
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  /**
   * GET /scanner
   * Returns global scanner results (all users see the same set).
   * Optional query params: ?instrument=EUR/USD&pattern=Gartley
   */
  @Get()
  async getResults(
    @Query('instrument') instrument?: string,
    @Query('pattern') pattern?: string,
  ): Promise<ScannerResult[]> {
    return this.scannerService.getResults({ instrument, pattern });
  }
}
