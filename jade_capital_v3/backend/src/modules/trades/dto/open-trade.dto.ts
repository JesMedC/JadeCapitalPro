import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  IsUUID,
} from 'class-validator';

export class OpenTradeDto {
  @IsUUID('4')
  accountId!: string;

  @IsString()
  instrument!: string;

  @IsString()
  direction!: string; // CALL|PUT|BUY|SELL (case insensitive)

  @IsNumber()
  @Min(0.01)
  investment!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  payoutPct?: number;

  @IsOptional()
  @IsString()
  expiryTime?: string; // 1m, 2m, 3m, 5m, 10m, 15m, 30m, 1h

  @IsOptional()
  @IsNumber()
  @Min(0)
  entryPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  takeProfit?: number;
}
