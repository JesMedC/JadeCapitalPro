import {
  IsString,
  IsIn,
  IsNumber,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGoalDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(['pnl', 'winrate', 'trades', 'streak', 'drawdown'])
  goalType!: string;

  @IsNumber()
  @Min(0.01)
  targetValue!: number;

  @IsDateString()
  startDate!: string; // 'YYYY-MM-DD'

  @IsDateString()
  endDate!: string; // 'YYYY-MM-DD'

  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', 'custom'])
  period?: string; // defaults to 'custom' via entity

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // defaults to true via entity
}
