import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export enum MarketType {
  BINARY = 'binary',
  FOREX = 'forex',
}

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEnum(MarketType)
  marketType!: MarketType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value == null) return null;
    const stripped = (value as string).trim();
    if (!stripped) return null;
    // Title-case: capitalize first letter of each word
    return stripped.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  })
  broker?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'initialBalance must be >= 0' })
  initialBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
