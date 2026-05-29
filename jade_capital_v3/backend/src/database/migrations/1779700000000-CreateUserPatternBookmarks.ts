import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserPatternBookmarks1779700000000 implements MigrationInterface {
  name = 'CreateUserPatternBookmarks1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_pattern_bookmarks" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID         NOT NULL,
        "instrument"  VARCHAR(20)  NOT NULL,
        "timeframe"   VARCHAR(10)  NOT NULL,
        "pattern"     VARCHAR(50)  NOT NULL,
        "direction"   VARCHAR(10)  NOT NULL,
        "notes"       VARCHAR(500) NULL,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_pattern_bookmarks" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_pattern_bookmarks_user_id"
          FOREIGN KEY ("user_id")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_user_pattern_bookmarks_user_id"
        ON "user_pattern_bookmarks" ("user_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_pattern_bookmarks_compound"
        ON "user_pattern_bookmarks" ("user_id", "instrument", "timeframe", "pattern", "direction")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_user_pattern_bookmarks_compound"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "ix_user_pattern_bookmarks_user_id"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_pattern_bookmarks"
    `);
  }
}
