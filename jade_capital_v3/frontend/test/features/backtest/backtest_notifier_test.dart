// Sprint 10B — Unit tests for BacktestNotifier.
//
// Covers:
//   (a) Initial load: state transitions from loading → data
//   (b) Initial load error: state transitions from loading → error
//   (c) refresh() reloads the list
//   (d) delete() removes item optimistically before API confirmation
//   (e) create() returns the new session and refreshes the list
//   (f) Multi-user: each notifier instance uses its own API (per-user scoping)

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/backtest_api.dart';
import 'package:jade_capital_v3/features/backtest/models/backtest_session.dart';
import 'package:jade_capital_v3/features/backtest/providers/backtest_provider.dart';

// ── Fake ApiClient ────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

// ── Stub BacktestApi ──────────────────────────────────────────────────────────

class _StubBacktestApi extends BacktestApi {
  _StubBacktestApi({
    List<BacktestSession>? sessions,
    bool listShouldThrow = false,
  })  : _sessions = sessions ?? [],
        _listShouldThrow = listShouldThrow,
        super(_FakeApiClient());

  List<BacktestSession> _sessions;
  final bool _listShouldThrow;
  int listCallCount = 0;
  String? lastDeletedId;
  Map<String, dynamic>? lastCreateConfig;

  @override
  Future<List<BacktestSession>> list() async {
    listCallCount++;
    if (_listShouldThrow) throw Exception('network error');
    return List.of(_sessions);
  }

  @override
  Future<BacktestSession> get(String id) async {
    return _sessions.firstWhere((s) => s.id == id);
  }

  @override
  Future<BacktestSession> create({
    required String name,
    required Map<String, dynamic> config,
  }) async {
    lastCreateConfig = config;
    final session = BacktestSession.fromJson({
      'id': 'sess-new-001',
      'name': name,
      'status': 'pending',
      'config': config,
      'results': null,
      'error': null,
      'createdAt': '2026-05-24T10:00:00.000Z',
    });
    _sessions = [..._sessions, session];
    return session;
  }

  @override
  Future<void> delete(String id) async {
    lastDeletedId = id;
    _sessions = _sessions.where((s) => s.id != id).toList();
  }
}

// ── Fixture ───────────────────────────────────────────────────────────────────

BacktestSession _makeSession({
  String id = 'sess-0001',
  String name = 'EUR/USD test',
  String status = 'completed',
}) =>
    BacktestSession.fromJson({
      'id': id,
      'name': name,
      'status': status,
      'config': {
        'instrument': 'EUR/USD',
        'timeframe': '15m',
        'strategy': 'candle-direction',
        'lastNCandles': 50,
      },
      'results': null,
      'error': null,
      'createdAt': '2026-05-24T10:00:00.000Z',
    });

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // (a) Initial load: loading → data
  test('(a) transitions from loading to data on initial load', () async {
    final s1 = _makeSession(id: 'sess-0001');
    final s2 = _makeSession(id: 'sess-0002', name: 'GBP/USD test');
    final api = _StubBacktestApi(sessions: [s1, s2]);
    final notifier = BacktestNotifier(api);

    // Immediately after construction state is loading
    expect(notifier.state, isA<AsyncLoading<List<BacktestSession>>>());

    // Wait for async _load to complete
    await Future<void>.delayed(Duration.zero);

    expect(notifier.state, isA<AsyncData<List<BacktestSession>>>());
    final data = (notifier.state as AsyncData<List<BacktestSession>>).value;
    expect(data.length, equals(2));
    expect(data[0].id, equals('sess-0001'));

    notifier.dispose();
  });

  // (b) Initial load error → error state
  test('(b) transitions to error state when list() throws', () async {
    final api = _StubBacktestApi(listShouldThrow: true);
    final notifier = BacktestNotifier(api);

    await Future<void>.delayed(Duration.zero);

    expect(notifier.state, isA<AsyncError<List<BacktestSession>>>());
    notifier.dispose();
  });

  // (c) refresh() reloads the list
  test('(c) refresh() reloads the session list from API', () async {
    final api = _StubBacktestApi(sessions: [_makeSession()]);
    final notifier = BacktestNotifier(api);

    await Future<void>.delayed(Duration.zero);
    final callsAfterLoad = api.listCallCount;
    expect(callsAfterLoad, equals(1));

    await notifier.refresh();

    expect(api.listCallCount, equals(2));
    notifier.dispose();
  });

  // (d) delete() removes item optimistically
  test('(d) delete() removes item optimistically before API call completes',
      () async {
    final s1 = _makeSession(id: 'sess-to-delete');
    final s2 = _makeSession(id: 'sess-keep');
    final api = _StubBacktestApi(sessions: [s1, s2]);
    final notifier = BacktestNotifier(api);

    await Future<void>.delayed(Duration.zero);

    // Verify initial data has both
    var data = (notifier.state as AsyncData<List<BacktestSession>>).value;
    expect(data.length, equals(2));

    // Start delete (don't await yet to check optimistic update)
    final deleteFuture = notifier.delete('sess-to-delete');

    // The optimistic update should already have fired synchronously
    data = (notifier.state as AsyncData<List<BacktestSession>>).value;
    expect(data.any((s) => s.id == 'sess-to-delete'), isFalse);
    expect(data.any((s) => s.id == 'sess-keep'), isTrue);

    await deleteFuture;
    expect(api.lastDeletedId, equals('sess-to-delete'));

    notifier.dispose();
  });

  // (e) create() returns new session and refreshes
  test('(e) create() returns new session and calls list() to refresh',
      () async {
    final api = _StubBacktestApi(sessions: [_makeSession()]);
    final notifier = BacktestNotifier(api);

    await Future<void>.delayed(Duration.zero);
    final callsAfterLoad = api.listCallCount;

    final config = {
      'instrument': 'GBP/USD',
      'timeframe': '1h',
      'strategy': 'candle-direction',
      'lastNCandles': 75,
    };

    final created = await notifier.create('New backtest', config);

    expect(created.id, equals('sess-new-001'));
    expect(created.name, equals('New backtest'));
    expect(created.status, equals('pending'));
    // list() should have been called again to refresh
    expect(api.listCallCount, greaterThan(callsAfterLoad));

    notifier.dispose();
  });

  // (f) Multi-user: two notifiers with different API instances
  test('(f) two notifier instances are independent (multi-user isolation)',
      () async {
    final apiA = _StubBacktestApi(
      sessions: [_makeSession(id: 'sess-a', name: 'User A backtest')],
    );
    final apiB = _StubBacktestApi(
      sessions: [_makeSession(id: 'sess-b', name: 'User B backtest')],
    );

    final notifierA = BacktestNotifier(apiA);
    final notifierB = BacktestNotifier(apiB);

    await Future<void>.delayed(Duration.zero);

    final dataA = (notifierA.state as AsyncData<List<BacktestSession>>).value;
    final dataB = (notifierB.state as AsyncData<List<BacktestSession>>).value;

    expect(dataA.any((s) => s.id == 'sess-a'), isTrue);
    expect(dataA.any((s) => s.id == 'sess-b'), isFalse);
    expect(dataB.any((s) => s.id == 'sess-b'), isTrue);
    expect(dataB.any((s) => s.id == 'sess-a'), isFalse);

    notifierA.dispose();
    notifierB.dispose();
  });
}
