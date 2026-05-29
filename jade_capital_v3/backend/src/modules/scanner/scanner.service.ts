import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScannerResult } from './entities/scanner-result.entity';
import { runHarmonicEngine } from './harmonic-engine';
import type { CandleTick } from './harmonic-engine';

export interface GetResultsFilter {
  instrument?: string;
  pattern?: string;
}

@Injectable()
export class ScannerService {
  constructor(
    @InjectRepository(ScannerResult)
    private readonly repo: Repository<ScannerResult>,
  ) {}

  async getResults(filter: GetResultsFilter = {}): Promise<ScannerResult[]> {
    const where: Record<string, unknown> = {};
    if (filter.instrument) where.instrument = filter.instrument;
    if (filter.pattern) where.pattern = filter.pattern;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async runScan(
    candles: CandleTick[],
    instrument: string,
    timeframe: string,
  ): Promise<ScannerResult[]> {
    const candidates = runHarmonicEngine(candles, instrument, timeframe);

    if (candidates.length === 0) return [];

    const saved: ScannerResult[] = [];

    for (const c of candidates) {
      // Check if a row for this signal already exists
      const existing = await this.repo.findOne({
        where: {
          instrument: c.instrument,
          timeframe: c.timeframe,
          pattern: c.patternName,
          direction: c.direction,
        },
      });

      const row = existing ?? this.repo.create();
      row.userId = null;
      row.scannerType = 'harmonic';
      row.instrument = c.instrument;
      row.timeframe = c.timeframe;
      row.pattern = c.patternName;
      row.direction = c.direction;
      row.entryPrice = c.entryPrice;
      row.stopLoss = c.stopLoss;
      row.takeProfit = c.takeProfit1;
      row.takeProfit2 = c.takeProfit2;
      row.confidence = c.score;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row.metadata = c.metadata as any;

      const result = await this.repo.save(row);
      saved.push(result);
    }

    return saved;
  }
}
