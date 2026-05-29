import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmotionAndTradeIdsToJournalEntries1779484757482
  implements MigrationInterface
{
  name = 'AddEmotionAndTradeIdsToJournalEntries1779484757482';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make content nullable (was NOT NULL before Sprint 3)
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "content" DROP NOT NULL`,
    );

    // Add emotion column
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "emotion" varchar(50) NULL`,
    );

    // Add trade_ids column (PostgreSQL native uuid array)
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "trade_ids" uuid[] NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN IF EXISTS "trade_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN IF EXISTS "emotion"`,
    );
    // Restore content NOT NULL constraint (requires no existing NULLs in prod)
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "content" SET NOT NULL`,
    );
  }
}
