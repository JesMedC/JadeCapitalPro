import { IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class GoalQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  activeOnly?: boolean;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;
}
