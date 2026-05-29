import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateBookmarkNotesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes!: string;
}
