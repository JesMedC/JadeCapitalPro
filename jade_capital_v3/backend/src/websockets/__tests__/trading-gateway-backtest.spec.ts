/**
 * TradingGateway — backtest progress room + broadcastBacktestProgress unit tests
 *
 * Covers Sprint 15 tasks 6.1–6.5:
 *
 * AC-1: Every authenticated connection joins `user:{userId}:backtest`
 * AC-1 (regression): Existing rooms (scanner:global, user:{userId}:trades,
 *                    user:{userId}:alerts) must still be joined
 * AC-2: broadcastBacktestProgress emits to `user:{userId}:backtest` only
 * AC-3: Payload is forwarded unchanged
 */

import { TradingGateway, BacktestProgressPayload } from '../trading.gateway';
import { WsAuthMiddleware } from '../ws-auth.middleware';

// ── Minimal mocks (same pattern as trading-gateway-scanner.spec.ts) ──────────

function makeServerMock() {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  return { to: toFn, emit: emitFn, _toFn: toFn, _emitFn: emitFn };
}

function makeSocketMock(userId = 'user-42') {
  const joinFn = jest.fn();
  const emitFn = jest.fn();
  const socket = {
    id: 'socket-1',
    join: joinFn,
    emit: emitFn,
    disconnect: jest.fn(),
    connected: true,
    user: { sub: userId },
  } as unknown;
  return { socket, joinFn, emitFn };
}

function makeValidPayload(overrides: Partial<BacktestProgressPayload> = {}): BacktestProgressPayload {
  return {
    sessionId: 'sess-abc',
    processed: 10,
    total: 100,
    percent: 10,
    status: 'running',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TradingGateway — backtest progress', () => {
  let gateway: TradingGateway;
  let server: ReturnType<typeof makeServerMock>;

  beforeEach(() => {
    const wsAuth = {
      use: jest.fn((socket: unknown, next: (err?: Error) => void) => next()),
    } as unknown as WsAuthMiddleware;

    gateway = new TradingGateway(wsAuth);
    server = makeServerMock();
    // Inject mock server — @WebSocketServer() is just a property assignment at runtime
    (gateway as unknown as { server: unknown }).server = server;
  });

  // ── AC-1: handleConnection joins user:{userId}:backtest ────────────────────

  describe('handleConnection — backtest room', () => {
    it('joins user:{userId}:backtest room on authenticated connection (AC-1)', () => {
      const userId = 'abc123';
      const { socket, joinFn } = makeSocketMock(userId);
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      expect(joinFn).toHaveBeenCalledWith(`user:${userId}:backtest`);
    });

    it('joins user:{userId}:backtest with the correct dynamic userId', () => {
      const userId = 'xyz-999';
      const { socket, joinFn } = makeSocketMock(userId);
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      const calls = joinFn.mock.calls.map((c: string[]) => c[0]);
      expect(calls).toContain(`user:${userId}:backtest`);
    });
  });

  // ── AC-1 regression: existing rooms must still be joined ──────────────────

  describe('handleConnection — regression guard', () => {
    it('still joins scanner:global (no regression)', () => {
      const { socket, joinFn } = makeSocketMock('user-r');
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      expect(joinFn).toHaveBeenCalledWith('scanner:global');
    });

    it('still joins user:{userId}:trades (no regression)', () => {
      const userId = 'user-r';
      const { socket, joinFn } = makeSocketMock(userId);
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      expect(joinFn).toHaveBeenCalledWith(`user:${userId}:trades`);
    });

    it('still joins user:{userId}:alerts (no regression)', () => {
      const userId = 'user-r';
      const { socket, joinFn } = makeSocketMock(userId);
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      expect(joinFn).toHaveBeenCalledWith(`user:${userId}:alerts`);
    });
  });

  // ── AC-2 & AC-3: broadcastBacktestProgress ─────────────────────────────────

  describe('broadcastBacktestProgress', () => {
    it('emits to user:{userId}:backtest room (AC-2)', () => {
      const userId = 'abc123';
      const payload = makeValidPayload();
      gateway.broadcastBacktestProgress(userId, payload);

      expect(server._toFn).toHaveBeenCalledWith(`user:${userId}:backtest`);
    });

    it('emits event "backtest:progress" with exact payload (AC-2, AC-3)', () => {
      const userId = 'abc123';
      const payload = makeValidPayload({ processed: 50, percent: 50 });
      gateway.broadcastBacktestProgress(userId, payload);

      expect(server._emitFn).toHaveBeenCalledWith('backtest:progress', payload);
    });

    it('does NOT emit to any other room — called exactly once (AC-2 isolation)', () => {
      const userId = 'abc123';
      gateway.broadcastBacktestProgress(userId, makeValidPayload());

      expect(server._toFn).toHaveBeenCalledTimes(1);
      expect(server._emitFn).toHaveBeenCalledTimes(1);
    });

    it('forwards a "completed" payload unchanged (AC-3)', () => {
      const userId = 'u-1';
      const payload = makeValidPayload({ processed: 100, total: 100, percent: 100, status: 'completed' });
      gateway.broadcastBacktestProgress(userId, payload);

      expect(server._emitFn).toHaveBeenCalledWith('backtest:progress', payload);
    });

    it('forwards a "failed" sentinel payload unchanged (AC-3)', () => {
      const userId = 'u-2';
      const payload = makeValidPayload({ processed: 0, total: 1, percent: 100, status: 'failed' });
      gateway.broadcastBacktestProgress(userId, payload);

      expect(server._emitFn).toHaveBeenCalledWith('backtest:progress', payload);
    });
  });
});
