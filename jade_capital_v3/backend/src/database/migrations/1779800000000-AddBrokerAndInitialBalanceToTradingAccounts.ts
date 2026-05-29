import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrokerAndInitialBalanceToTradingAccounts1779800000000
  implements MigrationInterface
{
  name = 'AddBrokerAndInitialBalanceToTradingAccounts1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: add broker column — nullable, no default
    await queryRunner.query(`
      ALTER TABLE "trading_accounts"
      ADD COLUMN IF NOT EXISTS "broker" VARCHAR(100) NULL
    `);

    // Step 2: add initial_balance — NOT NULL with DB-level default 0
    await queryRunner.query(`
      ALTER TABLE "trading_accounts"
      ADD COLUMN IF NOT EXISTS "initial_balance" DECIMAL(18, 2) NOT NULL DEFAULT 0
    `);

    // Step 3: backfill — set initial_balance = balance for all existing rows
    // Acceptable approximation; users can correct via PATCH /accounts/:id
    await queryRunner.query(`
      UPDATE "trading_accounts"
      SET "initial_balance" = "balance"
      WHERE "initial_balance" = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trading_accounts" DROP COLUMN IF EXISTS "initial_balance"
    `);

    await queryRunner.query(`
      ALTER TABLE "trading_accounts" DROP COLUMN IF EXISTS "broker"
    `);
  }
}
