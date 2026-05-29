import { IsOptional, IsIn, IsDateString, ValidateIf } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  preset?: '7d' | '30d' | '90d';

  @ValidateIf((o) => !o.preset)
  @IsDateString()
  from?: string; // YYYY-MM-DD, required when preset absent

  @ValidateIf((o) => !o.preset)
  @IsDateString()
  to?: string; // YYYY-MM-DD, required when preset absent
}
