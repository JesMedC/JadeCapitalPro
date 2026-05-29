import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value == null) return null;
    const stripped = (value as string).trim();
    if (!stripped) return null;
    return stripped.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  })
  broker?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'initialBalance must be >= 0' })
  initialBalance?: number;
}
