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

// Manual partial — @nestjs/mapped-types is not installed in this project.
// All fields from CreateGoalDto are repeated here as optional.
export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(['pnl', 'winrate', 'trades', 'streak', 'drawdown'])
  goalType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  targetValue?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', 'custom'])
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
