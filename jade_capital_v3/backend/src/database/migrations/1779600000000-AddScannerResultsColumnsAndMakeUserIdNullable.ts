import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScannerResultsColumnsAndMakeUserIdNullable1779600000000
  implements MigrationInterface
{
  name = 'AddScannerResultsColumnsAndMakeUserIdNullable1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Dedup existing rows before adding unique index
    // Keep only the row with the smallest id for each (instrument, timeframe, pattern, direction-equivalent) group.
    // Since direction does not exist yet we treat all existing rows as having direction='CALL' for dedup purposes.
    await queryRunner.query(`
      DELETE FROM "scanner_results"
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM "scanner_results"
        GROUP BY instrument, timeframe, pattern
      )
    `);

    // Step 2: Back-fill userId to NULL before relaxing NOT NULL
    await queryRunner.query(`
      UPDATE "scanner_results" SET "user_id" = NULL
    `);

    // Step 3: Drop the FK constraint (if it exists)
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        DROP CONSTRAINT IF EXISTS "FK_scanner_results_user_id"
    `);

    // Step 4: Add direction column (NOT NULL with default so existing rows get 'CALL')
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ADD COLUMN IF NOT EXISTS "direction" VARCHAR(10) NOT NULL DEFAULT 'CALL'
    `);

    // Step 5: Add take_profit_2 column
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ADD COLUMN IF NOT EXISTS "take_profit_2" DECIMAL(14,6) NULL
    `);

    // Step 6: Make user_id nullable
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ALTER COLUMN "user_id" DROP NOT NULL
    `);

    // Step 7: Change user_id type from uuid to varchar(36)
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ALTER COLUMN "user_id" TYPE VARCHAR(36) USING "user_id"::varchar
    `);

    // Step 8: Add composite unique index for upsert deduplication
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_scanner_results_signal"
        ON "scanner_results" ("instrument", "timeframe", "pattern", "direction")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse in order

    // Step 8 reverse: drop unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_scanner_results_signal"
    `);

    // Step 7 reverse: restore uuid type (only safe if no non-uuid values exist)
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ALTER COLUMN "user_id" TYPE UUID USING "user_id"::uuid
    `);

    // Step 6 reverse: restore NOT NULL (requires no NULL rows — caller must ensure)
    await queryRunner.query(`
      UPDATE "scanner_results"
        SET "user_id" = (SELECT id FROM users LIMIT 1)
        WHERE "user_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        ALTER COLUMN "user_id" SET NOT NULL
    `);

    // Step 5 reverse: drop take_profit_2
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        DROP COLUMN IF EXISTS "take_profit_2"
    `);

    // Step 4 reverse: drop direction
    await queryRunner.query(`
      ALTER TABLE "scanner_results"
        DROP COLUMN IF EXISTS "direction"
    `);

    // Step 3 reverse: FK would need re-adding — omit (original was TypeORM-managed)
    // Step 2 reverse: cannot restore userId values (data was intentionally cleared)
    // Step 1 reverse: deduplicated rows are permanently removed
  }
}
