/**
 * TradingGateway — scanner:global room + broadcastScanner unit tests
 *
 * Covers Sprint 10A tasks 1.4 (broadcastScanner emits correct event)
 * and 1.5 (handleConnection joins scanner:global room).
 *
 * AC-1: Every authenticated connection joins 'scanner:global'
 * AC-2: broadcastScanner emits to 'scanner:global' with event 'scanner:updated'
 * AC-3: Payload is forwarded unchanged
 */

import { TradingGateway } from '../trading.gateway';
import { WsAuthMiddleware } from '../ws-auth.middleware';

// ── Minimal mocks ──────────────────────────────────────────────────────────────

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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TradingGateway — scanner:global', () => {
  let gateway: TradingGateway;
  let server: ReturnType<typeof makeServerMock>;

  beforeEach(() => {
    const wsAuth = {
      use: jest.fn((socket: unknown, next: (err?: Error) => void) => next()),
    } as unknown as WsAuthMiddleware;

    gateway = new TradingGateway(wsAuth);
    server = makeServerMock();
    // Inject mock server — @WebSocketServer() is just a property assignment
    (gateway as unknown as { server: unknown }).server = server;
  });

  // ── AC-1: handleConnection joins scanner:global ────────────────────────────

  describe('handleConnection', () => {
    it('joins scanner:global on every authenticated connection (AC-1)', () => {
      const { socket, joinFn } = makeSocketMock('user-1');
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      expect(joinFn).toHaveBeenCalledWith('scanner:global');
    });

    it('joins scanner:global before user-scoped rooms', () => {
      const { socket, joinFn } = makeSocketMock('user-2');
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      const calls = joinFn.mock.calls.map((c: string[]) => c[0]);
      const scannerIdx = calls.indexOf('scanner:global');
      expect(scannerIdx).toBeGreaterThanOrEqual(0);
    });

    it('still joins user-scoped trade and alert rooms (regression)', () => {
      const userId = 'user-3';
      const { socket, joinFn } = makeSocketMock(userId);
      gateway.handleConnection(socket as Parameters<typeof gateway.handleConnection>[0]);

      const calls = joinFn.mock.calls.map((c: string[]) => c[0]);
      expect(calls).toContain(`user:${userId}:trades`);
      expect(calls).toContain(`user:${userId}:alerts`);
    });
  });

  // ── AC-2 & AC-3: broadcastScanner ──────────────────────────────────────────

  describe('broadcastScanner', () => {
    it('calls server.to("scanner:global") (AC-2)', () => {
      const payload = { timestamp: '2026-05-23T00:00:00.000Z', count: 3, results: [] };
      gateway.broadcastScanner(payload);

      expect(server._toFn).toHaveBeenCalledWith('scanner:global');
    });

    it('emits event "scanner:updated" (AC-2)', () => {
      const payload = { timestamp: '2026-05-23T00:00:00.000Z', count: 3, results: [] };
      gateway.broadcastScanner(payload);

      expect(server._emitFn).toHaveBeenCalledWith('scanner:updated', payload);
    });

    it('forwards the payload unchanged (AC-3)', () => {
      const payload = {
        timestamp: '2026-05-23T12:00:00.000Z',
        count: 5,
        results: [{ id: 'r1', instrument: 'EUR/USD', pattern: 'Gartley' }],
      };
      gateway.broadcastScanner(payload);

      expect(server._emitFn).toHaveBeenCalledTimes(1);
      expect(server._emitFn).toHaveBeenCalledWith('scanner:updated', payload);
    });

    it('is called exactly once and emits exactly once per invocation', () => {
      const payload = { timestamp: 'ts', count: 0, results: [] };
      gateway.broadcastScanner(payload);

      expect(server._toFn).toHaveBeenCalledTimes(1);
      expect(server._emitFn).toHaveBeenCalledTimes(1);
    });
  });
});
