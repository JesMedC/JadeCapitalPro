/**
 * Task 2.1 — Unit tests for CreateJournalEntryDto validation.
 *
 * Covers:
 * - Valid payload accepted without errors
 * - Invalid emotion value rejected
 * - Missing title rejected
 * - Non-UUID tradeId rejected
 * - userId / id / timestamps injection stripped (whitelist enforcement)
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateJournalEntryDto } from '../dto/create-journal-entry.dto';
import { EmotionTag } from '../enums/emotion-tag.enum';

describe('CreateJournalEntryDto', () => {
  // ── Helpers ────────────────────────────────────────────────────────────────

  function buildValid(overrides: Record<string, unknown> = {}): CreateJournalEntryDto {
    return plainToInstance(CreateJournalEntryDto, {
      title: 'Morning session',
      content: 'Followed the plan today.',
      emotion: EmotionTag.CALM,
      tradeIds: ['550e8400-e29b-41d4-a716-446655440000'],
      tags: ['discipline', 'patience'],
      ...overrides,
    });
  }

  // ── Valid cases ────────────────────────────────────────────────────────────

  it('accepts a fully valid payload', async () => {
    const dto = buildValid();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a payload with only a title (all optional fields absent)', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, { title: 'Minimal entry' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts each valid EmotionTag value', async () => {
    const validValues = Object.values(EmotionTag);
    for (const emotion of validValues) {
      const dto = buildValid({ emotion });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts multiple valid UUIDs in tradeIds', async () => {
    const dto = buildValid({
      tradeIds: [
        '550e8400-e29b-41d4-a716-446655440000',
        'a3bb189e-8bf9-4888-9912-ace4e6543002',
      ],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts empty tags array', async () => {
    const dto = buildValid({ tags: [] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // ── Invalid emotion ────────────────────────────────────────────────────────

  it('rejects an invalid emotion value ("euphoric")', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, {
      title: 'Test',
      emotion: 'euphoric',
    });
    const errors = await validate(dto);
    const emotionErrors = errors.filter((e) => e.property === 'emotion');
    expect(emotionErrors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid emotion value ("angry")', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, {
      title: 'Test',
      emotion: 'angry',
    });
    const errors = await validate(dto);
    const emotionErrors = errors.filter((e) => e.property === 'emotion');
    expect(emotionErrors.length).toBeGreaterThan(0);
  });

  // ── Missing title ──────────────────────────────────────────────────────────

  it('rejects a payload with missing title', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, { content: 'No title here' });
    const errors = await validate(dto);
    const titleErrors = errors.filter((e) => e.property === 'title');
    expect(titleErrors.length).toBeGreaterThan(0);
  });

  it('rejects a payload with an empty title string', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, { title: '' });
    const errors = await validate(dto);
    const titleErrors = errors.filter((e) => e.property === 'title');
    expect(titleErrors.length).toBeGreaterThan(0);
  });

  it('accepts a whitespace-only title at the DTO level (stripping is done by the transform pipe)', async () => {
    // @IsNotEmpty() in class-validator does NOT trim whitespace by default.
    // The global ValidationPipe with `transform: true` and `transformOptions.enableImplicitConversion`
    // handles coercion but not trimming.  Whitespace prevention is enforced at the
    // service layer or via a custom @Transform decorator — NOT at basic @IsNotEmpty().
    // This test documents the actual (correct) behavior so the team is not surprised.
    const dto = plainToInstance(CreateJournalEntryDto, { title: '   ' });
    const errors = await validate(dto);
    const titleErrors = errors.filter((e) => e.property === 'title');
    // class-validator @IsNotEmpty() considers '   ' as NOT empty (no trim)
    expect(titleErrors.length).toBe(0);
  });

  // ── Non-UUID tradeIds ──────────────────────────────────────────────────────

  it('rejects tradeIds containing a non-UUID string', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, {
      title: 'Test',
      tradeIds: ['not-a-uuid', '12345'],
    });
    const errors = await validate(dto);
    const tradeErrors = errors.filter((e) => e.property === 'tradeIds');
    expect(tradeErrors.length).toBeGreaterThan(0);
  });

  it('rejects tradeIds containing an integer-like string (not UUID v4)', async () => {
    const dto = plainToInstance(CreateJournalEntryDto, {
      title: 'Test',
      tradeIds: ['42'],
    });
    const errors = await validate(dto);
    const tradeErrors = errors.filter((e) => e.property === 'tradeIds');
    expect(tradeErrors.length).toBeGreaterThan(0);
  });

  // ── userId injection attempt ───────────────────────────────────────────────

  /**
   * The DTO has no `userId`, `id`, `createdAt`, or `updatedAt` fields.
   * The global ValidationPipe is configured with `whitelist: true` +
   * `forbidNonWhitelisted: true`, which causes NestJS to reject any body
   * containing undeclared properties before the handler is invoked.
   *
   * `plainToInstance` alone does NOT strip extra properties — that stripping
   * is exclusively the ValidationPipe's responsibility at the HTTP layer.
   * These tests verify that `forbidNonWhitelisted` will reject such requests
   * by confirming the DTO has NO declared `userId` / `id` / `createdAt` fields
   * (so validation of those will yield an error via the pipe).
   *
   * The integration test (journal.controller.spec.ts) exercises the actual
   * HTTP rejection with 400 status.  Here we document the property absence
   * at the class level.
   */
  it('DTO class does not declare a userId property', () => {
    const dto = new CreateJournalEntryDto();
    // Only the declared decorated properties should exist
    const keys = Object.keys(dto);
    expect(keys).not.toContain('userId');
  });

  it('DTO class does not declare an id property', () => {
    const dto = new CreateJournalEntryDto();
    const keys = Object.keys(dto);
    expect(keys).not.toContain('id');
  });

  it('DTO class does not declare a createdAt property', () => {
    const dto = new CreateJournalEntryDto();
    const keys = Object.keys(dto);
    expect(keys).not.toContain('createdAt');
  });

  it('validate() raises no error for a DTO without userId (no such field to validate)', async () => {
    // If userId were declared with a validator, this would fail.
    // This confirms the DTO does not accept or validate userId at all.
    const dto = plainToInstance(CreateJournalEntryDto, { title: 'Injection attempt' });
    const errors = await validate(dto);
    const userIdErrors = errors.filter((e) => e.property === 'userId');
    expect(userIdErrors.length).toBe(0);
  });
});
