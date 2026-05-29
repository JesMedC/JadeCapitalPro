// Sprint 9 — Flutter widget tests for ScannerPage.
// Sprint 10A — updated to include wsClientProvider override (snackbar wiring).
// Sprint 12 — updated to include bookmarksProvider override (bookmark toggle wiring).
//
// Covers (task 4.8):
//   (a) Loading state → CircularProgressIndicator
//   (b) Data state (non-empty) → PatternCard widgets shown
//   (c) Empty state → 'No patterns detected yet' text, no PatternCard
//   (d) Error state → error text + retry button
//   (e) FAB refresh → notifier.refresh() called

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/bookmarks_api.dart';
import 'package:jade_capital_v3/core/network/providers.dart';
import 'package:jade_capital_v3/core/network/scanner_api.dart';
import 'package:jade_capital_v3/core/network/ws_client.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmark.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmarks_provider.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/features/scanner/providers/scanner_provider.dart';
import 'package:jade_capital_v3/features/scanner/scanner_page.dart';
import 'package:jade_capital_v3/features/scanner/widgets/pattern_card.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

ScannerResult _makeResult({
  String id = 'scan-0001',
  String pattern = 'Gartley',
  String direction = 'CALL',
}) =>
    ScannerResult(
      id: id,
      instrument: 'EUR/USD',
      timeframe: '1h',
      pattern: pattern,
      direction: direction,
      entryPrice: 1.08765,
      confidence: 87.0,
      createdAt: DateTime.parse('2026-05-23T10:00:00Z'),
    );

// ── Fake notifier ─────────────────────────────────────────────────────────────

/// Stub [ScannerNotifier] that starts with a pre-set [AsyncValue] state.
/// Tracks calls to [refresh] and [applyFilters] for assertion.
class _FakeScannerNotifier
    extends StateNotifier<AsyncValue<List<ScannerResult>>>
    implements ScannerNotifier {
  _FakeScannerNotifier(AsyncValue<List<ScannerResult>> initial,
      {List<ScannerResult>? all})
      : _allResultsOverride = all ?? [],
        super(initial);

  final List<ScannerResult> _allResultsOverride;
  int refreshCallCount = 0;

  @override
  List<ScannerResult> get allResults => _allResultsOverride;

  @override
  Future<void> refresh() async {
    refreshCallCount++;
  }

  @override
  void applyFilters(filter) {}

  // ScannerNotifier internals not needed in tests:
  @override
  ScannerApi get _api => throw UnimplementedError();

  @override
  WsClient get _wsClient => throw UnimplementedError();

  @override
  StreamSubscription<Map<String, dynamic>> get _scannerSub =>
      throw UnimplementedError();

  @override
  List<ScannerResult> get _allResults => _allResultsOverride;

  @override
  set _allResults(List<ScannerResult> _) {}

  @override
  dynamic get _filter => throw UnimplementedError();

  @override
  set _filter(_) {}

  @override
  Future<void> _loadResults() async {}

  @override
  List<ScannerResult> _applyFilter(results, filter) => results;

  @override
  void _onScannerPush(Map<String, dynamic> payload) {}

  @override
  void _mergeResults(List<ScannerResult> incoming) {}

  @override
  void dispose() => super.dispose();
}

// ── Fake API client (satisfies ApiClient constructor) ────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

class _FakeScannerApi extends ScannerApi {
  _FakeScannerApi() : super(_FakeApiClient());

  @override
  Future<List<ScannerResult>> getResults({
    String? instrument,
    String? pattern,
  }) async =>
      [];
}

/// Minimal WsClient stub for scanner_page_test (Sprint 10A).
/// Uses [WsClient.forTest()] to avoid flutter_secure_storage plugin dependency.
/// Returns a never-emitting stream so the snackbar never fires in Sprint 9 tests.
class _FakeWsClient extends WsClient {
  _FakeWsClient() : super.forTest();

  final _controller = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get scannerStream => _controller.stream;

  @override
  void dispose() {
    _controller.close();
  }
}

/// Stub [BookmarksNotifier] (Sprint 12) — starts with an empty loaded state
/// so ScannerPage does not fire a real Dio request in widget tests.
///
/// Extends [BookmarksNotifier] directly with a dummy [BookmarksApi] that
/// never makes network calls, so Dio timers are never created.
class _FakeBookmarksNotifier extends BookmarksNotifier {
  _FakeBookmarksNotifier({BookmarksState? initialState})
      : super(_NeverBookmarksApi()) {
    // Override the loading state set by the parent constructor immediately.
    if (initialState != null) {
      state = AsyncValue.data(initialState);
    } else {
      state = const AsyncValue.data(BookmarksState.empty);
    }
  }
}

/// [BookmarksApi] stub that never touches the network.
class _NeverBookmarksApi extends BookmarksApi {
  _NeverBookmarksApi() : super(_FakeApiClient());

  @override
  Future<List<PatternBookmark>> getBookmarks() async => [];

  @override
  Future<PatternBookmark> createBookmark({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) async =>
      throw UnimplementedError('_NeverBookmarksApi.createBookmark');

  @override
  Future<void> deleteBookmark(String id) async {}
}

// ── Test helper ───────────────────────────────────────────────────────────────

Widget _buildPage(
  AsyncValue<List<ScannerResult>> state, {
  List<ScannerResult>? allResults,
  BookmarksState? bookmarksState,
}) {
  final fakeNotifier = _FakeScannerNotifier(state, all: allResults);
  final fakeBookmarks = _FakeBookmarksNotifier(initialState: bookmarksState);
  return ProviderScope(
    overrides: [
      scannerProvider.overrideWith((_) => fakeNotifier),
      // Sprint 10A: override wsClientProvider so ScannerPage.initState doesn't crash
      wsClientProvider.overrideWithValue(_FakeWsClient()),
      // Sprint 12: override bookmarksProvider so no real Dio request fires
      bookmarksProvider.overrideWith((_) => fakeBookmarks),
    ],
    child: const MaterialApp(
      home: ScannerPage(),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('ScannerPage widget (task 4.8)', () {
    // (a) Loading state
    testWidgets('shows CircularProgressIndicator during loading',
        (tester) async {
      await tester.pumpWidget(
        _buildPage(const AsyncValue.loading()),
      );
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    // (b) Data state — non-empty
    testWidgets('shows PatternCard for each result', (tester) async {
      final results = [
        _makeResult(id: 'scan-1', pattern: 'Gartley'),
        _makeResult(id: 'scan-2', pattern: 'Bat'),
      ];
      await tester.pumpWidget(
        _buildPage(
          AsyncValue.data(results),
          allResults: results,
        ),
      );
      await tester.pump();
      expect(find.byType(PatternCard), findsNWidgets(2));
    });

    // (c) Empty state
    testWidgets('shows empty state text when result list is empty',
        (tester) async {
      await tester.pumpWidget(
        _buildPage(const AsyncValue.data([]), allResults: []),
      );
      await tester.pump();
      expect(find.text('No patterns detected yet'), findsOneWidget);
      expect(find.byType(PatternCard), findsNothing);
    });

    // (d) Error state
    testWidgets('shows error message and retry button on error', (tester) async {
      await tester.pumpWidget(
        _buildPage(
          AsyncValue.error(Exception('Network error'), StackTrace.empty),
        ),
      );
      await tester.pump();
      expect(find.textContaining('Network error'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    // (e) FAB refresh
    testWidgets('tapping FAB calls refresh on the notifier', (tester) async {
      final results = [_makeResult()];
      final fakeNotifier =
          _FakeScannerNotifier(AsyncValue.data(results), all: results);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            scannerProvider.overrideWith((_) => fakeNotifier),
            wsClientProvider.overrideWithValue(_FakeWsClient()),
            bookmarksProvider.overrideWith((_) => _FakeBookmarksNotifier()),
          ],
          child: const MaterialApp(home: ScannerPage()),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pump();

      expect(fakeNotifier.refreshCallCount, equals(1));
    });

    // ── AppBar ────────────────────────────────────────────────────────────────

    testWidgets('renders AppBar with title "Scanner"', (tester) async {
      await tester.pumpWidget(
        _buildPage(const AsyncValue.data([]), allResults: []),
      );
      await tester.pump();
      expect(find.text('Scanner'), findsOneWidget);
    });
  });
}
