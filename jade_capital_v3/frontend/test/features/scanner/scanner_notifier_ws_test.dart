// Sprint 10A — ScannerNotifier WebSocket merge tests
//
// Covers:
//   6.1 (AC-12, AC-18): WS push replaces existing slot, appends new, preserves untouched
//   6.2 (AC-13): active filter preserved after WS push
//   6.3 (AC-14): empty WS push does not clear state
//   6.4 (AC-15): WS push triggers no HTTP call
//   6.5 (AC-17): ScannerPage shows snackbar on count > 0
//   6.6 (AC-17): ScannerPage shows no snackbar on count == 0

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/providers.dart';
import 'package:jade_capital_v3/core/network/scanner_api.dart';
import 'package:jade_capital_v3/core/network/ws_client.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/features/scanner/providers/scanner_filter_state.dart';
import 'package:jade_capital_v3/features/scanner/providers/scanner_provider.dart';
import 'package:jade_capital_v3/features/scanner/scanner_page.dart';

// ── Fixture helpers ───────────────────────────────────────────────────────────

ScannerResult _makeResult({
  required String id,
  String instrument = 'EUR/USD',
  String timeframe = '1h',
  String pattern = 'Gartley',
  String direction = 'CALL',
  double entryPrice = 1.0850,
}) =>
    ScannerResult(
      id: id,
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      entryPrice: entryPrice,
      confidence: 88.0,
      createdAt: DateTime.parse('2026-05-23T10:00:00Z'),
    );

Map<String, dynamic> _resultToJson(ScannerResult r) => {
      'id': r.id,
      'instrument': r.instrument,
      'timeframe': r.timeframe,
      'pattern': r.pattern,
      'direction': r.direction,
      'entryPrice': r.entryPrice,
      'confidence': r.confidence,
      'createdAt': r.createdAt.toIso8601String(),
    };

// ── Fake WsClient ─────────────────────────────────────────────────────────────

/// Controllable WsClient stub backed by a real StreamController.
/// Uses [WsClient.forTest()] to avoid flutter_secure_storage plugin dependency.
class _ControllableWsClient extends WsClient {
  _ControllableWsClient() : super.forTest();

  final _scannerStreamController =
      StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get scannerStream =>
      _scannerStreamController.stream;

  void emitScanner(Map<String, dynamic> data) =>
      _scannerStreamController.add(data);

  @override
  void dispose() {
    _scannerStreamController.close();
  }
}

// ── Fake ScannerApi ───────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

class _StubScannerApi extends ScannerApi {
  _StubScannerApi(this._results) : super(_FakeApiClient());

  final List<ScannerResult> _results;
  int getResultsCallCount = 0;

  @override
  Future<List<ScannerResult>> getResults({
    String? instrument,
    String? pattern,
  }) async {
    getResultsCallCount++;
    return _results;
  }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/// Build a [ScannerNotifier] with controlled api + ws, wait for initial load.
Future<({ScannerNotifier notifier, _ControllableWsClient ws, _StubScannerApi api})>
    buildNotifier(
  List<ScannerResult> initialResults,
) async {
  final ws = _ControllableWsClient();
  final api = _StubScannerApi(initialResults);
  final notifier = ScannerNotifier(api, ws);

  // Wait for _loadResults() to complete
  await Future<void>.delayed(Duration.zero);

  return (notifier: notifier, ws: ws, api: api);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // ── 6.1 (AC-12, AC-18): merge replaces by key, appends new, preserves untouched ─

  test(
    '6.1 WS push replaces existing slot, appends new, preserves untouched (AC-12, AC-18)',
    () async {
      final r1 = _makeResult(id: 'r-1', instrument: 'EUR/USD', pattern: 'Gartley', direction: 'CALL');
      final r2 = _makeResult(id: 'r-2', instrument: 'GBP/USD', pattern: 'Bat', direction: 'PUT');
      final ctx = await buildNotifier([r1, r2]);

      // r2_updated replaces r2 (same compound key), r3/r4 are new
      final r2Updated = _makeResult(id: 'r-2-updated', instrument: 'GBP/USD', pattern: 'Bat', direction: 'PUT', entryPrice: 1.2700);
      final r3 = _makeResult(id: 'r-3', instrument: 'USD/JPY', pattern: 'Crab', direction: 'CALL');
      final r4 = _makeResult(id: 'r-4', instrument: 'AUD/USD', pattern: 'Butterfly', direction: 'PUT');

      ctx.ws.emitScanner({
        'timestamp': '2026-05-23T10:15:00Z',
        'count': 3,
        'results': [
          _resultToJson(r2Updated),
          _resultToJson(r3),
          _resultToJson(r4),
        ],
      });

      await Future<void>.delayed(Duration.zero);

      final state = ctx.notifier.state;
      expect(state, isA<AsyncData<List<ScannerResult>>>());

      final results = (state as AsyncData<List<ScannerResult>>).value;

      // r1 preserved (not in push)
      expect(results.any((r) => r.id == 'r-1'), isTrue);
      // r2 replaced by r2_updated (same key, different id)
      expect(results.any((r) => r.id == 'r-2'), isFalse);
      expect(results.any((r) => r.id == 'r-2-updated'), isTrue);
      // r3 and r4 appended
      expect(results.any((r) => r.id == 'r-3'), isTrue);
      expect(results.any((r) => r.id == 'r-4'), isTrue);
      // Total: r1 + r2_updated + r3 + r4 = 4
      expect(results.length, equals(4));

      ctx.ws.dispose();
      ctx.notifier.dispose();
    },
  );

  // ── 6.2 (AC-13): active filter preserved after WS push ────────────────────

  test(
    '6.2 Active filter is preserved after WS push (AC-13)',
    () async {
      final r1 = _makeResult(id: 'r-1', pattern: 'Gartley', direction: 'CALL');
      final r2 = _makeResult(id: 'r-2', pattern: 'Bat', direction: 'PUT');
      final ctx = await buildNotifier([r1, r2]);

      // Set active filter: only show Gartley
      ctx.notifier.applyFilters(
        const ScannerFilterState(patternType: 'Gartley', instrument: null, timeframe: null),
      );

      // WS push: r3 is Gartley (matches filter), r4 is Bat (filtered out)
      final r3 = _makeResult(id: 'r-3', instrument: 'GBP/USD', pattern: 'Gartley', direction: 'CALL');
      final r4 = _makeResult(id: 'r-4', instrument: 'USD/JPY', pattern: 'Bat', direction: 'PUT');

      ctx.ws.emitScanner({
        'timestamp': '2026-05-23T10:15:00Z',
        'count': 2,
        'results': [_resultToJson(r3), _resultToJson(r4)],
      });

      await Future<void>.delayed(Duration.zero);

      final state = ctx.notifier.state;
      expect(state, isA<AsyncData<List<ScannerResult>>>());

      final results = (state as AsyncData<List<ScannerResult>>).value;

      // Only Gartley patterns should be visible
      for (final r in results) {
        expect(r.pattern, equals('Gartley'));
      }
      // r1 and r3 (both Gartley) are visible; r2 and r4 (Bat) are filtered
      expect(results.any((r) => r.id == 'r-1'), isTrue);
      expect(results.any((r) => r.id == 'r-3'), isTrue);
      expect(results.any((r) => r.id == 'r-2'), isFalse);
      expect(results.any((r) => r.id == 'r-4'), isFalse);

      ctx.ws.dispose();
      ctx.notifier.dispose();
    },
  );

  // ── 6.3 (AC-14): empty push does not clear state ──────────────────────────

  test(
    '6.3 Empty WS push does not clear state (AC-14)',
    () async {
      final r1 = _makeResult(id: 'r-1');
      final r2 = _makeResult(id: 'r-2', instrument: 'GBP/USD');
      final ctx = await buildNotifier([r1, r2]);

      // Verify initial state
      final initialState = ctx.notifier.state as AsyncData<List<ScannerResult>>;
      expect(initialState.value.length, equals(2));

      // Emit empty push
      ctx.ws.emitScanner({'timestamp': '2026-05-23T10:15:00Z', 'count': 0, 'results': []});

      await Future<void>.delayed(Duration.zero);

      // State must be unchanged
      final afterState = ctx.notifier.state as AsyncData<List<ScannerResult>>;
      expect(afterState.value.length, equals(2));
      expect(afterState.value.any((r) => r.id == 'r-1'), isTrue);
      expect(afterState.value.any((r) => r.id == 'r-2'), isTrue);

      ctx.ws.dispose();
      ctx.notifier.dispose();
    },
  );

  // ── 6.4 (AC-15): WS push does not trigger any REST call ──────────────────

  test(
    '6.4 WS push triggers no HTTP call to GET /scanner (AC-15)',
    () async {
      final r1 = _makeResult(id: 'r-1');
      final ctx = await buildNotifier([r1]);

      // Record initial call count (1 from _loadResults constructor)
      final callsAfterLoad = ctx.api.getResultsCallCount;
      expect(callsAfterLoad, equals(1));

      // Emit a WS push
      ctx.ws.emitScanner({
        'timestamp': '2026-05-23T10:15:00Z',
        'count': 1,
        'results': [_resultToJson(_makeResult(id: 'r-new'))],
      });

      await Future<void>.delayed(Duration.zero);

      // getResults must NOT have been called again
      expect(ctx.api.getResultsCallCount, equals(callsAfterLoad));

      ctx.ws.dispose();
      ctx.notifier.dispose();
    },
  );

  // ── 6.5 (AC-17): ScannerPage snackbar on count > 0 ───────────────────────

  testWidgets(
    '6.5 ScannerPage shows snackbar when count > 0 (AC-17)',
    (tester) async {
      final wsClient = _ControllableWsClient();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            wsClientProvider.overrideWithValue(wsClient),
            scannerProvider.overrideWith((ref) {
              final ws = ref.watch(wsClientProvider);
              return ScannerNotifier(
                _StubScannerApi([]),
                ws as WsClient,
              );
            }),
          ],
          child: const MaterialApp(home: ScannerPage()),
        ),
      );

      // Let initState + addPostFrameCallback settle
      await tester.pumpAndSettle();

      // Emit push with count > 0
      wsClient.emitScanner({
        'timestamp': '2026-05-23T10:15:00Z',
        'count': 5,
        'results': [],
      });

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('New patterns detected'), findsOneWidget);

      wsClient.dispose();
    },
  );

  // ── 6.6 (AC-17): No snackbar when count == 0 ─────────────────────────────

  testWidgets(
    '6.6 ScannerPage does NOT show snackbar when count == 0 (AC-17)',
    (tester) async {
      final wsClient = _ControllableWsClient();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            wsClientProvider.overrideWithValue(wsClient),
            scannerProvider.overrideWith((ref) {
              final ws = ref.watch(wsClientProvider);
              return ScannerNotifier(
                _StubScannerApi([]),
                ws as WsClient,
              );
            }),
          ],
          child: const MaterialApp(home: ScannerPage()),
        ),
      );

      await tester.pumpAndSettle();

      // Emit push with count == 0
      wsClient.emitScanner({
        'timestamp': '2026-05-23T10:15:00Z',
        'count': 0,
        'results': [],
      });

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // No snackbar
      expect(find.text('New patterns detected'), findsNothing);

      wsClient.dispose();
    },
  );
}
