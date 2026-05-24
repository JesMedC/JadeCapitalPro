import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ScannerService } from './scanner.service';
import { MarketDataService } from '../market-data/market-data.service';
import { TradingGateway } from '../../websockets/trading.gateway';
import { ScannerResult } from './entities/scanner-result.entity';
import { TIMEFRAME_CONFIG } from './harmonic-engine';

const SCANNER_INSTRUMENTS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'NZD/USD',
  'USD/CHF',
  'BTC/USD',
];

// Active timeframes for scanner (7 TFs)
const SCANNER_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

@Injectable()
export class ScannerScheduler {
  private readonly logger = new Logger(ScannerScheduler.name);

  constructor(
    private readonly scannerService: ScannerService,
    private readonly marketData: MarketDataService,
    private readonly config: ConfigService,
    private readonly tradingGateway: TradingGateway,
  ) {}

  @Cron('*/15 * * * *')
  async handleCron(): Promise<void> {
    const enabled = this.config.get<string>('SCANNER_ENABLED', 'false');
    if (enabled !== 'true') return;

    this.logger.log('ScannerScheduler: starting scan cycle');
    const allResults: ScannerResult[] = [];

    for (const instrument of SCANNER_INSTRUMENTS) {
      for (const timeframe of SCANNER_TIMEFRAMES) {
        try {
          const candles = this.marketData.getCandles(instrument, timeframe, TIMEFRAME_CONFIG[timeframe].minCandles);
          const saved = await this.scannerService.runScan(candles, instrument, timeframe);
          allResults.push(...saved);
        } catch (err) {
          this.logger.error(
            `ScannerScheduler: error ${instrument}[${timeframe}]: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    this.logger.log(`ScannerScheduler: cycle complete — ${allResults.length} patterns upserted`);

    // Single batch broadcast — fires once per cycle, after all upserts (AC-4, AC-5)
    this.tradingGateway.broadcastScanner({
      timestamp: new Date().toISOString(),
      count: allResults.length,
      results: allResults,
    });
  }
}
