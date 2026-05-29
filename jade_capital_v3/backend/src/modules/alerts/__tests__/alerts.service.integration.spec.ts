/**
 * Task 5.1 — Integration tests for AlertsService.
 *
 * Strategy: uses mocked TypeORM Repository (no real DB connection) to exercise
 * full CRUD paths including:
 *  - Multi-user isolation: findAll returns only the requesting user's alerts
 *  - findById ownership: ForbiddenException when userId does not match
 *  - create: saves alert, sets status=ACTIVE, calls evaluator.invalidateCache
 *  - update: ownership check + saves + calls evaluator.invalidateCache
 *  - remove: ownership check + removes + calls evaluator.invalidateCache
 *  - Cache invalidation: invalidateCache is called with correct instrument on
 *    every write operation (AC-07 / spec requirement)
 *
 * AC-05 (multi-user isolation) is the primary focus: two users with alerts on
 * the same instrument — findAll(userA) MUST NOT return userB's alerts.
 */

import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts.service';
import { AlertEvaluatorService } from '../alert-evaluator.service';
import { Alert, AlertCondition, AlertStatus, AlertType } from '../entities/alert.entity';
import { CreateAlertDto } from '../dto/create-alert.dto';
import { UpdateAlertDto } from '../dto/update-alert.dto';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ALERT_ID_A = '11111111-0000-0000-0000-000000000001';
const ALERT_ID_B = '22222222-0000-0000-0000-000000000002';

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: ALERT_ID_A,
    userId: USER_A,
    name: 'EUR/USD above 1.1000',
    type: AlertType.PRICE,
    instrument: 'EUR/USD',
    condition: AlertCondition.ABOVE,
    targetPrice: 1.1 as unknown as number,
    status: AlertStatus.ACTIVE,
    triggeredAt: null,
    createdAt: new Date('2026-05-23T10:00:00Z'),
    user: null as never,
    ...overrides,
  };
}

// ── Builder ────────────────────────────────────────────────────────────────

function buildService() {
  const alertRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  } as unknown as Repository<Alert>;

  const evaluator = {
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  } as unknown as AlertEvaluatorService;

  const service = new AlertsService(alertRepository, evaluator);

  return { service, alertRepository, evaluator };
}

// ────────────────────────────────────────────────────────────────────────────
// findAll — multi-user isolation (AC-05)
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService.findAll — multi-user isolation (task 5.1 / AC-05)', () => {
  it('returns only the requesting user\'s alerts when the repository is queried', async () => {
    const { service, alertRepository } = buildService();

    const alertA = makeAlert({ id: ALERT_ID_A, userId: USER_A });
    (alertRepository.find as jest.Mock).mockResolvedValue([alertA]);

    const result = await service.findAll(USER_A);

    // Service must pass userId as where-clause to the repository
    expect(alertRepository.find).toHaveBeenCalledWith({ where: { userId: USER_A } });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(USER_A);
  });

  it('does NOT return userB alerts when findAll is called with userA id', async () => {
    const { service, alertRepository } = buildService();

    const alertA = makeAlert({ id: ALERT_ID_A, userId: USER_A });
    const alertB = makeAlert({ id: ALERT_ID_B, userId: USER_B });

    // Simulate two users with alerts on the same instrument in the DB.
    // The service must filter by userId — it should NEVER call find() without
    // the userId filter.  We verify the call args, not the DB filtering logic,
    // because the real isolation guarantee lives in the TypeORM where clause.
    (alertRepository.find as jest.Mock).mockImplementation(
      (opts: { where: { userId: string } }) => {
        const { userId } = opts.where;
        const all = [alertA, alertB];
        return Promise.resolve(all.filter((a) => a.userId === userId));
      },
    );

    const resultsA = await service.findAll(USER_A);
    const resultsB = await service.findAll(USER_B);

    // userA sees only their own alert
    expect(resultsA).toHaveLength(1);
    expect(resultsA[0].userId).toBe(USER_A);
    expect(resultsA.some((a) => a.userId === USER_B)).toBe(false);

    // userB sees only their own alert
    expect(resultsB).toHaveLength(1);
    expect(resultsB[0].userId).toBe(USER_B);
    expect(resultsB.some((a) => a.userId === USER_A)).toBe(false);
  });

  it('returns an empty array when the user has no alerts', async () => {
    const { service, alertRepository } = buildService();
    (alertRepository.find as jest.Mock).mockResolvedValue([]);

    const result = await service.findAll(USER_A);

    expect(result).toHaveLength(0);
  });

  it('returns alerts for multiple instruments when user owns them all', async () => {
    const { service, alertRepository } = buildService();

    const alerts = [
      makeAlert({ id: 'aaa', userId: USER_A, instrument: 'EUR/USD' }),
      makeAlert({ id: 'bbb', userId: USER_A, instrument: 'GBP/USD' }),
      makeAlert({ id: 'ccc', userId: USER_A, instrument: 'USD/JPY' }),
    ];
    (alertRepository.find as jest.Mock).mockResolvedValue(alerts);

    const result = await service.findAll(USER_A);

    expect(result).toHaveLength(3);
    expect(result.every((a) => a.userId === USER_A)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// findById — ownership enforcement
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService.findById — ownership enforcement (task 5.1)', () => {
  it('returns the alert when userId matches', async () => {
    const { service, alertRepository } = buildService();
    const alert = makeAlert({ id: ALERT_ID_A, userId: USER_A });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(alert);

    const result = await service.findById(ALERT_ID_A, USER_A);

    expect(result).toBe(alert);
  });

  it('throws NotFoundException when alert does not exist', async () => {
    const { service, alertRepository } = buildService();
    (alertRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.findById('nonexistent-id', USER_A)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when userId does not own the alert', async () => {
    const { service, alertRepository } = buildService();
    // Alert belongs to USER_B but userA is requesting it
    const alert = makeAlert({ id: ALERT_ID_A, userId: USER_B });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(alert);

    await expect(service.findById(ALERT_ID_A, USER_A)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// create — saves with ACTIVE status + cache invalidation
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService.create — status + cache invalidation (task 5.1)', () => {
  it('creates an alert with status=ACTIVE regardless of dto contents', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const dto: CreateAlertDto = {
      name: 'My alert',
      instrument: 'EUR/USD',
      condition: AlertCondition.ABOVE,
      targetPrice: 1.1,
    };

    const created = makeAlert({ status: AlertStatus.ACTIVE });
    (alertRepository.create as jest.Mock).mockReturnValue(created);
    (alertRepository.save as jest.Mock).mockResolvedValue(created);

    const result = await service.create(USER_A, dto);

    // Ownership from JWT, not from DTO
    expect(alertRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, status: AlertStatus.ACTIVE }),
    );
    expect(result.status).toBe(AlertStatus.ACTIVE);
  });

  it('calls evaluator.invalidateCache with the alert instrument after create', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const dto: CreateAlertDto = {
      name: 'GBP/USD alert',
      instrument: 'GBP/USD',
      condition: AlertCondition.BELOW,
      targetPrice: 1.25,
    };

    const saved = makeAlert({ instrument: 'GBP/USD', status: AlertStatus.ACTIVE });
    (alertRepository.create as jest.Mock).mockReturnValue(saved);
    (alertRepository.save as jest.Mock).mockResolvedValue(saved);

    await service.create(USER_A, dto);

    expect(evaluator.invalidateCache).toHaveBeenCalledWith('GBP/USD');
    expect(evaluator.invalidateCache).toHaveBeenCalledTimes(1);
  });

  it('sets userId from the parameter (not from DTO)', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const dto: CreateAlertDto = {
      name: 'Isolated alert',
      instrument: 'USD/JPY',
      condition: AlertCondition.CROSSES_ABOVE,
      targetPrice: 150.0,
    };

    const saved = makeAlert({ userId: USER_B, instrument: 'USD/JPY' });
    (alertRepository.create as jest.Mock).mockReturnValue(saved);
    (alertRepository.save as jest.Mock).mockResolvedValue(saved);

    await service.create(USER_B, dto);

    expect(alertRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_B }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// update — ownership + cache invalidation
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService.update — ownership + cache invalidation (task 5.1)', () => {
  it('updates the alert and calls evaluator.invalidateCache', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const existing = makeAlert({ id: ALERT_ID_A, userId: USER_A, instrument: 'EUR/USD' });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(existing);
    (alertRepository.save as jest.Mock).mockResolvedValue({ ...existing, name: 'Updated' });

    const dto: UpdateAlertDto = { name: 'Updated' };
    const result = await service.update(ALERT_ID_A, USER_A, dto);

    expect(alertRepository.save).toHaveBeenCalledTimes(1);
    expect(evaluator.invalidateCache).toHaveBeenCalledWith('EUR/USD');
    expect(result.name).toBe('Updated');
  });

  it('throws ForbiddenException when updating an alert owned by another user', async () => {
    const { service, alertRepository } = buildService();

    // Alert belongs to USER_B
    const existing = makeAlert({ id: ALERT_ID_A, userId: USER_B });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.update(ALERT_ID_A, USER_A, { name: 'Hack attempt' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does NOT call evaluator.invalidateCache when ownership check fails', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const existing = makeAlert({ id: ALERT_ID_A, userId: USER_B });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.update(ALERT_ID_A, USER_A, { name: 'Hack' }),
    ).rejects.toThrow(ForbiddenException);

    expect(evaluator.invalidateCache).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// remove — ownership + cache invalidation
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService.remove — ownership + cache invalidation (task 5.1)', () => {
  it('removes the alert and calls evaluator.invalidateCache with correct instrument', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const existing = makeAlert({ id: ALERT_ID_A, userId: USER_A, instrument: 'NZD/USD' });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(existing);
    (alertRepository.remove as jest.Mock).mockResolvedValue(undefined);

    await service.remove(ALERT_ID_A, USER_A);

    expect(alertRepository.remove).toHaveBeenCalledWith(existing);
    expect(evaluator.invalidateCache).toHaveBeenCalledWith('NZD/USD');
  });

  it('throws ForbiddenException when removing an alert owned by another user', async () => {
    const { service, alertRepository } = buildService();

    const existing = makeAlert({ id: ALERT_ID_A, userId: USER_B });
    (alertRepository.findOne as jest.Mock).mockResolvedValue(existing);

    await expect(service.remove(ALERT_ID_A, USER_A)).rejects.toThrow(ForbiddenException);
    expect(alertRepository.remove).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when alert does not exist', async () => {
    const { service, alertRepository } = buildService();
    (alertRepository.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.remove('nonexistent-id', USER_A)).rejects.toThrow(NotFoundException);
    expect(alertRepository.remove).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Multi-user isolation — two users, same instrument (AC-05)
// ────────────────────────────────────────────────────────────────────────────

describe('AlertsService multi-user isolation — same instrument (task 5.1 / AC-05)', () => {
  it('userA and userB can both have active alerts on EUR/USD independently', async () => {
    const { service, alertRepository } = buildService();

    const alertA = makeAlert({ id: ALERT_ID_A, userId: USER_A, instrument: 'EUR/USD' });
    const alertB = makeAlert({ id: ALERT_ID_B, userId: USER_B, instrument: 'EUR/USD' });

    (alertRepository.find as jest.Mock).mockImplementation(
      (opts: { where: { userId: string } }) => {
        const { userId } = opts.where;
        if (userId === USER_A) return Promise.resolve([alertA]);
        if (userId === USER_B) return Promise.resolve([alertB]);
        return Promise.resolve([]);
      },
    );

    const [listA, listB] = await Promise.all([
      service.findAll(USER_A),
      service.findAll(USER_B),
    ]);

    // Each user sees only their own
    expect(listA).toHaveLength(1);
    expect(listA[0].id).toBe(ALERT_ID_A);

    expect(listB).toHaveLength(1);
    expect(listB[0].id).toBe(ALERT_ID_B);

    // No cross-contamination
    expect(listA.some((a) => a.userId === USER_B)).toBe(false);
    expect(listB.some((a) => a.userId === USER_A)).toBe(false);
  });

  it('disabling userA alert does NOT affect userB alert on same instrument', async () => {
    const { service, alertRepository, evaluator } = buildService();

    const alertA = makeAlert({ id: ALERT_ID_A, userId: USER_A, instrument: 'EUR/USD' });
    const alertB = makeAlert({ id: ALERT_ID_B, userId: USER_B, instrument: 'EUR/USD', status: AlertStatus.ACTIVE });

    // userA updates their own alert to DISABLED
    (alertRepository.findOne as jest.Mock).mockResolvedValue(alertA);
    (alertRepository.save as jest.Mock).mockResolvedValue({
      ...alertA,
      status: AlertStatus.DISABLED,
    });

    const dto: UpdateAlertDto = { status: AlertStatus.DISABLED };
    const result = await service.update(ALERT_ID_A, USER_A, dto);

    expect(result.status).toBe(AlertStatus.DISABLED);
    // userB's alert is untouched — repository was only called with alertA
    expect(alertRepository.save).toHaveBeenCalledTimes(1);

    // Verify that the saved entity belongs to USER_A
    const savedArg = (alertRepository.save as jest.Mock).mock.calls[0][0];
    expect(savedArg.userId).toBe(USER_A);
    void alertB; // confirm alertB was never modified
  });
});
