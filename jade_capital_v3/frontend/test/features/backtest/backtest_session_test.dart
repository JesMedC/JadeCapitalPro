// Sprint 10B — Flutter unit tests for BacktestSession model.
//
// Covers:
//   (a) fromJson with all fields populated correctly
//   (b) fromJson with null results and null error
//   (c) status convenience getters: isTerminal, isCompleted, isFailed, isPending, isRunning
//   (d) profitFactor = 9999 is preserved (sentinel for Infinity)
//   (e) equityCurve list deserialization
//   (f) trades list deserialization
//   (g) winrate / maxDrawdown / totalTrades accessors return correct values

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/backtest/models/backtest_session.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

Map<String, dynamic> _completedSessionJson({
  double profitFactor = 1.23,
  List<double> equityCurve = const [0.00010, 0.00005, 0.00015],
}) =>
    {
      'id': 'sess-0001-0000-0000-000000000001',
      'name': 'EUR/USD 15m test',
      'status': 'completed',
      'config': {
        'instrument': 'EUR/USD',
        'timeframe': '15m',
        'strategy': 'candle-direction',
        'lastNCandles': 50,
      },
      'results': {
        'totalTrades': 10,
        'wins': 6,
        'losses': 4,
        'winrate': 60.0,
        'profitFactor': profitFactor,
        'maxDrawdown': 0.00012,
        'equityCurve': equityCurve,
        'trades': [
          {
            'index': 0,
            'direction': 'CALL',
            'entryCandle': 1,
            'result': 'win',
            'pnl': 0.00010,
          },
        ],
      },
      'error': null,
      'createdAt': '2026-05-24T10:00:00.000Z',
    };

Map<String, dynamic> _pendingSessionJson() => {
      'id': 'sess-0002-0000-0000-000000000001',
      'name': 'Pending run',
      'status': 'pending',
      'config': {
        'instrument': 'GBP/USD',
        'timeframe': '1h',
        'strategy': 'candle-direction',
        'lastNCandles': 100,
      },
      'results': null,
      'error': null,
      'createdAt': '2026-05-24T11:00:00.000Z',
    };

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('BacktestSession.fromJson', () {
    // (a) Full completed session
    test('deserialises a completed session with all fields', () {
      final session = BacktestSession.fromJson(_completedSessionJson());

      expect(session.id, equals('sess-0001-0000-0000-000000000001'));
      expect(session.name, equals('EUR/USD 15m test'));
      expect(session.status, equals('completed'));
      expect(session.config['instrument'], equals('EUR/USD'));
      expect(session.results, isNotNull);
      expect(session.error, isNull);
      expect(
        session.createdAt,
        equals(DateTime.parse('2026-05-24T10:00:00.000Z')),
      );
    });

    // (b) Null results and null error
    test('handles null results and null error', () {
      final session = BacktestSession.fromJson(_pendingSessionJson());

      expect(session.results, isNull);
      expect(session.error, isNull);
    });
  });

  // ── Status convenience getters ────────────────────────────────────────────

  group('status getters', () {
    test('isTerminal is true for completed', () {
      final session = BacktestSession.fromJson(_completedSessionJson());
      expect(session.isTerminal, isTrue);
    });

    test('isTerminal is true for failed', () {
      final json = _completedSessionJson()..['status'] = 'failed';
      final session = BacktestSession.fromJson(json);
      expect(session.isTerminal, isTrue);
    });

    test('isTerminal is false for pending', () {
      final session = BacktestSession.fromJson(_pendingSessionJson());
      expect(session.isTerminal, isFalse);
    });

    test('isTerminal is false for running', () {
      final json = _pendingSessionJson()..['status'] = 'running';
      final session = BacktestSession.fromJson(json);
      expect(session.isTerminal, isFalse);
    });

    test('isCompleted is true only for completed status', () {
      expect(
        BacktestSession.fromJson(_completedSessionJson()).isCompleted,
        isTrue,
      );
      expect(
        BacktestSession.fromJson(_pendingSessionJson()).isCompleted,
        isFalse,
      );
    });

    test('isPending is true for pending status', () {
      expect(BacktestSession.fromJson(_pendingSessionJson()).isPending, isTrue);
    });

    test('isRunning is true for running status', () {
      final json = _pendingSessionJson()..['status'] = 'running';
      expect(BacktestSession.fromJson(json).isRunning, isTrue);
    });
  });

  // ── profitFactor sentinel 9999 ────────────────────────────────────────────

  group('profitFactor', () {
    test('preserves profitFactor = 9999 (Infinity sentinel)', () {
      final session = BacktestSession.fromJson(
        _completedSessionJson(profitFactor: 9999),
      );
      expect(session.profitFactor, equals(9999.0));
    });

    test('returns normal profitFactor value', () {
      final session = BacktestSession.fromJson(
        _completedSessionJson(profitFactor: 1.75),
      );
      expect(session.profitFactor, closeTo(1.75, 0.001));
    });
  });

  // ── equityCurve ───────────────────────────────────────────────────────────

  group('equityCurve', () {
    test('returns list of doubles from results', () {
      final session = BacktestSession.fromJson(
        _completedSessionJson(equityCurve: [0.00010, -0.00005, 0.00015]),
      );
      expect(session.equityCurve.length, equals(3));
      expect(session.equityCurve[0], closeTo(0.00010, 0.0000001));
      expect(session.equityCurve[1], closeTo(-0.00005, 0.0000001));
    });

    test('returns empty list when results is null', () {
      final session = BacktestSession.fromJson(_pendingSessionJson());
      expect(session.equityCurve, isEmpty);
    });
  });

  // ── trades ────────────────────────────────────────────────────────────────

  group('trades', () {
    test('returns list of trade maps', () {
      final session = BacktestSession.fromJson(_completedSessionJson());
      expect(session.trades.length, equals(1));
      expect(session.trades[0]['direction'], equals('CALL'));
      expect(session.trades[0]['result'], equals('win'));
    });

    test('returns empty list when results is null', () {
      final session = BacktestSession.fromJson(_pendingSessionJson());
      expect(session.trades, isEmpty);
    });
  });

  // ── metrics accessors ─────────────────────────────────────────────────────

  group('metrics accessors', () {
    test('returns correct winrate, maxDrawdown, totalTrades, wins, losses', () {
      final session = BacktestSession.fromJson(_completedSessionJson());
      expect(session.winrate, closeTo(60.0, 0.001));
      expect(session.maxDrawdown, closeTo(0.00012, 0.0000001));
      expect(session.totalTrades, equals(10));
      expect(session.wins, equals(6));
      expect(session.losses, equals(4));
    });

    test('returns null for metrics when results is null', () {
      final session = BacktestSession.fromJson(_pendingSessionJson());
      expect(session.winrate, isNull);
      expect(session.profitFactor, isNull);
      expect(session.totalTrades, isNull);
    });
  });
}
