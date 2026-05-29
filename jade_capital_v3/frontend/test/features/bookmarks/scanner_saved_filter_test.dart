// Sprint 12 — Integration test: ScannerPage "★ Saved" filter chip.
//
// Covers (task 3.4, AC-8, AC-11):
//   (a) Seed 10 signals, 3 bookmarked — tap "★ Saved" — assert 3 remain visible
//   (b) Bookmarked signal NOT currently detected by scanner → invisible in
//       "Saved" filter without error (AC-11)
//   (c) "★ Saved" chip toggles back to show all signals
//   (d) "★ Saved" chip with no bookmarks shows empty saved state

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
  required String id,
  String instrument = 'EUR/USD',
  String timeframe = '1h',
  String pattern = 'Gartley',
  String direction = 'CALL',
}) =>
    ScannerResult(
      id: id,
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      entryPrice: 1.08765,
      confidence: 87.0,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

PatternBookmark _makeBookmark(ScannerResult r) => PatternBookmark(
      id: 'bm-${r.id}',
      userId: 'user-01',
      instrument: r.instrument,
      timeframe: r.timeframe,
      pattern: r.pattern,
      direction: r.direction,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

// ── Fakes ─────────────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

class _NeverBookmarksApi extends BookmarksApi {
  _NeverBookmarksApi() : super(_FakeApiClient());
  @override Future<List<PatternBookmark>> getBookmarks() async => [];
  @override Future<PatternBookmark> createBookmark({
    required String instrument, required String timeframe,
    required String pattern, required String direction, String? notes,
  }) async => throw UnimplementedError();
  @override Future<void> deleteBookmark(String id) async {}
}

/// BookmarksApi that seeds a fixed list of bookmarks — used by
/// [_FakeBookmarksNotifier] so _load() populates the correct state.
class _SeedBookmarksApi extends BookmarksApi {
  _SeedBookmarksApi(this._seed) : super(_FakeApiClient());
  final List<PatternBookmark> _seed;
  @override Future<List<PatternBookmark>> getBookmarks() async => List.of(_seed);
  @override Future<PatternBookmark> createBookmark({
    required String instrument, required String timeframe,
    required String pattern, required String direction, String? notes,
  }) async => throw UnimplementedError();
  @override Future<void> deleteBookmark(String id) async {}
}

class _FakeBookmarksNotifier extends BookmarksNotifier {
  _FakeBookmarksNotifier(BookmarksState s)
      : super(_SeedBookmarksApi(s.bookmarks));
}

class _FakeScannerNotifier
    extends StateNotifier<AsyncValue<List<ScannerResult>>>
    implements ScannerNotifier {
  _FakeScannerNotifier(
    AsyncValue<List<ScannerResult>> initial,
    List<ScannerResult> all,
  )   : _all = all,
        super(initial);

  final List<ScannerResult> _all;

  @override List<ScannerResult> get allResults => _all;
  @override Future<void> refresh() async {}
  @override void applyFilters(filter) {
    // Apply filter client-side (mirrors ScannerNotifier._applyFilter)
    state.whenData((_) {
      final r = _all.where((r) {
        if (filter.patternType != null && r.pattern != filter.patternType) return false;
        if (filter.instrument != null && r.instrument != filter.instrument) return false;
        if (filter.timeframe != null && r.timeframe != filter.timeframe) return false;
        return true;
      }).toList();
      state = AsyncValue.data(r);
    });
  }

  @override ScannerApi get _api => throw UnimplementedError();
  @override WsClient get _wsClient => throw UnimplementedError();
  @override StreamSubscription<Map<String, dynamic>> get _scannerSub =>
      throw UnimplementedError();
  @override List<ScannerResult> get _allResults => _all;
  @override set _allResults(List<ScannerResult> _) {}
  @override dynamic get _filter => throw UnimplementedError();
  @override set _filter(_) {}
  @override Future<void> _loadResults() async {}
  @override List<ScannerResult> _applyFilter(r, f) => r;
  @override void _onScannerPush(Map<String, dynamic> p) {}
  @override void _mergeResults(List<ScannerResult> i) {}
  @override void dispose() => super.dispose();
}

class _FakeWsClient extends WsClient {
  _FakeWsClient() : super.forTest();
  final _c = StreamController<Map<String, dynamic>>.broadcast();
  @override Stream<Map<String, dynamic>> get scannerStream => _c.stream;
  @override void dispose() { _c.close(); }
}

// ── Test helper ───────────────────────────────────────────────────────────────

Widget _buildPage(
  List<ScannerResult> results,
  BookmarksState bookmarksState,
) {
  final fakeScanner = _FakeScannerNotifier(
    AsyncValue.data(results),
    results,
  );
  final fakeBookmarks = _FakeBookmarksNotifier(bookmarksState);

  return ProviderScope(
    overrides: [
      scannerProvider.overrideWith((_) => fakeScanner),
      wsClientProvider.overrideWithValue(_FakeWsClient()),
      bookmarksProvider.overrideWith((_) => fakeBookmarks),
    ],
    child: const MaterialApp(home: ScannerPage()),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('ScannerPage "★ Saved" filter integration (task 3.4)', () {
    // (a) 10 signals, 3 bookmarked — tap "★ Saved" → 3 visible
    // Note: ListView only renders visible items, so we assert "at least 3"
    // when all are shown and "exactly 3" when savedOnly is active.
    testWidgets(
      'shows only 3 bookmarked signals when "★ Saved" chip is tapped (AC-8)',
      (tester) async {
        tester.view.physicalSize = const Size(800, 4000);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final allResults = List.generate(
          10,
          (i) => _makeResult(
            id: 'scan-$i',
            instrument: i < 3 ? 'EUR/USD' : 'GBP/USD',
            direction: i < 3 ? 'CALL' : 'PUT',
          ),
        );

        // Bookmark only the first 3
        final bookmarks =
            allResults.take(3).map(_makeBookmark).toList();
        final bmState = BookmarksState.from(bookmarks);

        await tester.pumpWidget(_buildPage(allResults, bmState));
        // Allow BookmarksNotifier._load() microtask to complete
        await tester.pumpAndSettle();

        // Before filter: all 10 visible (tall viewport renders all)
        expect(find.byType(PatternCard), findsNWidgets(10));

        // Tap the "★ Saved" chip
        await tester.tap(find.text('★ Saved'));
        await tester.pump();

        // After filter: only 3 remain
        expect(find.byType(PatternCard), findsNWidgets(3));
      },
    );

    // (b) Bookmarked signal not detected → invisible, no error (AC-11)
    testWidgets(
      'bookmarked signal not in scanner results is invisible — no error (AC-11)',
      (tester) async {
        final detectedResults = [
          _makeResult(id: 'scan-1', instrument: 'GBP/USD'),
        ];

        // Bookmark a signal that is NOT in detectedResults
        final orphanBookmark = _makeBookmark(
          _makeResult(id: 'orphan', instrument: 'EUR/USD'),
        );
        final bmState = BookmarksState.from([orphanBookmark]);

        await tester.pumpWidget(_buildPage(detectedResults, bmState));
        await tester.pumpAndSettle();

        // Tap saved filter — no error thrown, no crash
        await tester.tap(find.text('★ Saved'));
        await tester.pump();

        // No PatternCards visible (orphan not in results)
        expect(find.byType(PatternCard), findsNothing);

        // Empty saved state is shown
        expect(find.text('No saved patterns'), findsOneWidget);
      },
    );

    // (c) Tapping "★ Saved" again deactivates it and shows all results
    testWidgets(
      'tapping "★ Saved" again shows all results',
      (tester) async {
        tester.view.physicalSize = const Size(800, 2000);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final results = [
          _makeResult(id: 'scan-1'),
          _makeResult(id: 'scan-2', instrument: 'GBP/USD'),
        ];
        final bm = _makeBookmark(results.first);
        final bmState = BookmarksState.from([bm]);

        await tester.pumpWidget(_buildPage(results, bmState));
        await tester.pumpAndSettle();

        // Tap once to activate
        await tester.tap(find.text('★ Saved'));
        await tester.pump();
        expect(find.byType(PatternCard), findsNWidgets(1));

        // Tap again to deactivate
        await tester.tap(find.text('★ Saved'));
        await tester.pump();
        expect(find.byType(PatternCard), findsNWidgets(2));
      },
    );

    // (d) No bookmarks → "No saved patterns" text
    testWidgets(
      'shows "No saved patterns" empty state when no bookmarks and savedOnly active',
      (tester) async {
        final results = [
          _makeResult(id: 'scan-1'),
          _makeResult(id: 'scan-2', instrument: 'GBP/USD'),
        ];
        final bmState = BookmarksState.from([]);

        await tester.pumpWidget(_buildPage(results, bmState));
        await tester.pumpAndSettle();

        await tester.tap(find.text('★ Saved'));
        await tester.pump();

        expect(find.text('No saved patterns'), findsOneWidget);
        expect(find.byType(PatternCard), findsNothing);
      },
    );
  });
}
