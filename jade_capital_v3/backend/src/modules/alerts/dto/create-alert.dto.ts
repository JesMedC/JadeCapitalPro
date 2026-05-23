import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsEnum,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';
import { AlertCondition } from '../entities/alert.entity';
import { SUPPORTED_INSTRUMENTS } from '../alerts.constants';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(SUPPORTED_INSTRUMENTS as unknown as string[])
  instrument!: string;

  @IsEnum(AlertCondition)
  condition!: AlertCondition;

  @IsNumber()
  @Min(0.0001)
  targetPrice!: number;
}
