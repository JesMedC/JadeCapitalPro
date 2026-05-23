import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { AlertCondition, AlertStatus } from '../entities/alert.entity';

// Manual partial — @nestjs/mapped-types is not installed in this project.
// All updatable fields from CreateAlertDto are repeated here as optional.
export class UpdateAlertDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AlertCondition)
  condition?: AlertCondition;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  targetPrice?: number;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;
}
