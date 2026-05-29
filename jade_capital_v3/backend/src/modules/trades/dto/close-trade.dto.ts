import { IsString, IsNumber, IsIn, Min } from 'class-validator';

export class CloseBinaryTradeDto {
  @IsString()
  @IsIn(['win', 'loss', 'be'])
  result!: string;
}

export class CloseForexTradeDto {
  @IsNumber()
  @Min(0)
  exitPrice!: number;
}
