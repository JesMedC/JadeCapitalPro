// Sprint 10B — Widget tests for BacktestResultPage.
// Sprint 15  — Extended with WS progress stream tests.
//
// Covers:
//   (a) Shows CircularProgressIndicator while loading
//   (b) Renders metrics cards when status = 'completed'
//   (c) Shows polling indicator (CircularProgressIndicator + "Processing...")
//       when status = 'running' or 'pending'  [REMOVED — replaced by (g)]
//   (d) Shows error banner with message when status = 'failed'
//   (e) profitFactor = 9999 is displayed as '∞' (not '9999')
//   (f) Status banner renders correct label per status
//   (g) BacktestProgressBar shown (not spinner) for running session [Sprint 15]
//   (h) BacktestProgressBar updates to 45% on WS event              [Sprint 15]
//   (i) Poll timer NOT cancelled when WS terminal event received     [Sprint 15]

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/backtest_api.dart';
import 'package:jade_capital_v3/core/network/providers.dart';
import 'package:jade_capital_v3/core/network/ws_client.dart';
import 'package:jade_capital_v3/features/backtest/backtest_result_page.dart';
import 'package:jade_capital_v3/features/backtest/models/backtest_session.dart';
import 'package:jade_capital_v3/features/backtest/widgets/backtest_progress_bar.dart';

// ── Fake ApiClient ────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

// ── Fake BacktestApi ──────────────────────────────────────────────────────────

class _FakeBacktestApi extends BacktestApi {
  _FakeBacktestApi(this._session) : super(_FakeApiClient());

  final BacktestSession _session;

  @override
  Future<BacktestSession> get(String id) async => _session;

  @override
  Future<List<BacktestSession>> list() async => [];

  @override
  Future<BacktestSession> create({
    required String name,
    required Map<String, dynamic> config,
  }) async =>
      throw UnimplementedError();

  @override
  Future<void> delete(String id) async {}
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

BacktestSession _makeSession({
  required String status,
  double profitFactor = 1.5,
  String? error,
}) =>
    BacktestSession.fromJson({
      'id': 'sess-test-001',
      'name': 'EUR/USD result test',
      'status': status,
      'config': {
        'instrument': 'EUR/USD',
        'timeframe': '15m',
        'strategy': 'candle-direction',
        'lastNCandles': 50,
      },
      'results': status == 'completed'
          ? {
              'totalTrades': 10,
              'wins': 6,
              'losses': 4,
              'winrate': 60.0,
              'profitFactor': profitFactor,
              'maxDrawdown': 0.00012,
              'equityCurve': [0.00010, 0.00005, 0.00015],
              'trades': [],
            }
          : null,
      'error': error,
      'createdAt': '2026-05-24T10:00:00.000Z',
    });

// ── Fake WsClient for Sprint 15 WS tests ─────────────────────────────────────

/// A test-only WsClient that exposes a [StreamController] so tests can inject
/// `backtest:progress` events directly without a real Socket.IO connection.
class _FakeWsClient extends WsClient {
  _FakeWsClient() : super.forTest();

  final _progressCtrl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get backtestProgressStream => _progressCtrl.stream;

  /// Inject a progress event into the stream.
  void addProgressEvent(Map<String, dynamic> event) {
    _progressCtrl.add(event);
  }

  @override
  void dispose() {
    _progressCtrl.close();
    super.dispose();
  }
}

// ── Helper: pump result page with mocked API ──────────────────────────────────

Future<void> pumpResultPage(
  WidgetTester tester,
  BacktestSession session, {
  WsClient? wsClient,
}) async {
  GoogleFonts.config.allowRuntimeFetching = false;

  final fakeApi = _FakeBacktestApi(session);
  final fakeWs = wsClient ?? _FakeWsClient();

  final router = GoRouter(
    initialLocation: '/backtest/sess-test-001',
    routes: [
      GoRoute(
        path: '/backtest',
        builder: (_, __) => const Scaffold(body: Text('List')),
      ),
      GoRoute(
        path: '/backtest/:id',
        builder: (context, state) => BacktestResultPage(
          sessionId: state.pathParameters['id']!,
        ),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        backtestApiProvider.overrideWithValue(fakeApi),
        wsClientProvider.overrideWithValue(fakeWs),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // (a) Shows loading indicator initially
  testWidgets('(a) shows CircularProgressIndicator while loading',
      (tester) async {
    final session = _makeSession(status: 'completed');
    await pumpResultPage(tester, session);

    // Before async fetch completes, the loading indicator should show
    expect(find.byType(CircularProgressIndicator), findsAtLeastNWidgets(1));
  });

  // (b) Metrics cards rendered for completed session
  testWidgets('(b) renders metrics cards when status = completed',
      (tester) async {
    final session = _makeSession(status: 'completed');
    await pumpResultPage(tester, session);

    // Wait for the async fetch to complete
    await tester.pumpAndSettle(const Duration(seconds: 1));

    // Metric labels should appear
    expect(find.text('Win Rate'), findsOneWidget);
    expect(find.text('Profit Factor'), findsOneWidget);
    expect(find.text('Max Drawdown'), findsOneWidget);
    expect(find.text('Total Trades'), findsOneWidget);
  });

  // (c) BacktestProgressBar shown (not spinner text) for pending/running
  // Note: we use pump() + explicit delay instead of pumpAndSettle() because
  // BacktestResultPage starts a Timer.periodic that prevents settling.
  testWidgets('(c) shows BacktestProgressBar when status = running',
      (tester) async {
    final session = _makeSession(status: 'running');
    await pumpResultPage(tester, session);
    // Pump through the initial async fetch
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Progress bar should be shown; old "Processing..." text should be gone
    expect(find.byType(BacktestProgressBar), findsOneWidget);
    expect(find.text('Processing...'), findsNothing);
  });

  testWidgets('(c) shows BacktestProgressBar when status = pending',
      (tester) async {
    final session = _makeSession(status: 'pending');
    await pumpResultPage(tester, session);
    // Pump through the initial async fetch
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(BacktestProgressBar), findsOneWidget);
    expect(find.text('Processing...'), findsNothing);
  });

  // (d) Error banner for failed session
  testWidgets('(d) shows error banner when status = failed', (tester) async {
    final session = _makeSession(
      status: 'failed',
      error: 'market data unavailable',
    );
    await pumpResultPage(tester, session);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Backtest Failed'), findsOneWidget);
    expect(find.text('market data unavailable'), findsOneWidget);
  });

  // (e) profitFactor = 9999 displayed as ∞
  testWidgets('(e) displays ∞ when profitFactor = 9999', (tester) async {
    final session = _makeSession(status: 'completed', profitFactor: 9999);
    await pumpResultPage(tester, session);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('∞'), findsOneWidget);
  });

  // (f) Status banner text per status
  testWidgets('(f) status banner shows "Completed" for completed',
      (tester) async {
    final session = _makeSession(status: 'completed');
    await pumpResultPage(tester, session);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Completed'), findsOneWidget);
  });

  testWidgets('(f) status banner shows "Failed" for failed status',
      (tester) async {
    final session = _makeSession(status: 'failed', error: 'error msg');
    await pumpResultPage(tester, session);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(find.text('Failed'), findsOneWidget);
  });

  // ── Sprint 15: WS progress stream tests ──────────────────────────────────

  // (g) BacktestProgressBar shown (not spinner) for running session
  testWidgets('(g) BacktestProgressBar shown (not _PollingIndicator) for running session',
      (tester) async {
    final fakeWs = _FakeWsClient();
    final session = _makeSession(status: 'running');
    await pumpResultPage(tester, session, wsClient: fakeWs);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(BacktestProgressBar), findsOneWidget);
    // Old Processing... text should be absent
    expect(find.text('Processing…'), findsNothing);
  });

  // (h) BacktestProgressBar updates to 45% on WS event
  testWidgets('(h) BacktestProgressBar updates to 45% on WS event',
      (tester) async {
    final fakeWs = _FakeWsClient();
    final session = _makeSession(status: 'running');
    await pumpResultPage(tester, session, wsClient: fakeWs);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Inject a progress event for this session
    fakeWs.addProgressEvent({
      'sessionId': 'sess-test-001',
      'percent': 45,
      'processed': 45,
      'total': 100,
      'status': 'running',
    });

    // Let the stream event propagate and setState trigger a rebuild
    await tester.pump();
    await tester.pump();

    expect(find.text('45%'), findsOneWidget);
    expect(find.text('45 / 100 candles'), findsOneWidget);
  });

  // (i) Poll timer NOT cancelled when WS terminal event received
  testWidgets('(i) poll timer NOT cancelled when WS terminal event (status:completed) received',
      (tester) async {
    // The page's _pollTimer remains active until HTTP returns terminal state.
    // We verify indirectly: inject a WS 'completed' event, then check the
    // BacktestProgressBar still shows (page not torn down) and we haven't
    // transitioned to the completed metrics view (HTTP still returns 'running').
    final fakeWs = _FakeWsClient();
    final session = _makeSession(status: 'running');
    await pumpResultPage(tester, session, wsClient: fakeWs);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Inject terminal WS event
    fakeWs.addProgressEvent({
      'sessionId': 'sess-test-001',
      'percent': 100,
      'processed': 100,
      'total': 100,
      'status': 'completed',
    });

    await tester.pump();
    await tester.pump();

    // The HTTP mock still returns 'running' — the progress bar should persist
    // and the completed metrics view should NOT appear yet.
    // This verifies that the WS event alone did not cancel the timer/nav.
    expect(find.byType(BacktestProgressBar), findsOneWidget);
    expect(find.text('Win Rate'), findsNothing); // completed metrics not shown
  });
}
