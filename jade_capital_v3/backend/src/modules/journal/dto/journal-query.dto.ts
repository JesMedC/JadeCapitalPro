import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { EmotionTag } from '../enums/emotion-tag.enum';

export class JournalQueryDto {
  @IsOptional()
  @IsEnum(EmotionTag)
  emotion?: EmotionTag;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
