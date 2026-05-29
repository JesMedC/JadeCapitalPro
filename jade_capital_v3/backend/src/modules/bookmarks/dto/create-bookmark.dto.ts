import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  instrument!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  timeframe!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  pattern!: string;

  /** Direction as emitted by the scanner — no server-side enum enforcement in v1. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  direction!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
