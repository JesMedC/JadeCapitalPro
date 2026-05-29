import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoalsColumns1779545163029 implements MigrationInterface {
  name = 'AddGoalsColumns1779545163029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goals"
        ADD COLUMN IF NOT EXISTS "period" VARCHAR(20) NOT NULL DEFAULT 'custom',
        ADD COLUMN IF NOT EXISTS "notes" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goals" DROP COLUMN IF EXISTS "completed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" DROP COLUMN IF EXISTS "notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" DROP COLUMN IF EXISTS "period"`,
    );
  }
}
