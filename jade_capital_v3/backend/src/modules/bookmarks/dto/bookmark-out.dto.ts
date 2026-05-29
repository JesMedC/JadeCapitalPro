import { Expose } from 'class-transformer';

/** Response shape for bookmark endpoints — serialized via class-transformer. */
export class BookmarkOutDto {
  @Expose()
  id!: string;

  @Expose()
  userId!: string;

  @Expose()
  instrument!: string;

  @Expose()
  timeframe!: string;

  @Expose()
  pattern!: string;

  @Expose()
  direction!: string;

  @Expose()
  notes!: string | null;

  @Expose()
  createdAt!: Date;
}
