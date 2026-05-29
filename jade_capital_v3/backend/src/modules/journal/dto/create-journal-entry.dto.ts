import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';
import { EmotionTag } from '../enums/emotion-tag.enum';

export class CreateJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(EmotionTag)
  emotion?: EmotionTag;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tradeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  tags?: string[];
}
