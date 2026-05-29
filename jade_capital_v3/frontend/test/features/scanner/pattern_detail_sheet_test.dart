// Sprint 18 — Widget tests for PatternDetailSheet edit flow.
//
// Covers S14 gap:
//   AC-PDS-01: tap pencil icon → TextField becomes visible
//   AC-PDS-02: type text + tap Save → BookmarksNotifier.updateNotes called
//   AC-PDS-03: type text + tap Cancel → TextField gone, updateNotes NOT called

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/bookmarks_api.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmark.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmarks_provider.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/features/scanner/widgets/pattern_detail_sheet.dart';

// ── Fake API ──────────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

class _FakeBookmarksApi extends BookmarksApi {
  _FakeBookmarksApi({
    List<PatternBookmark>? initial,
    bool updateShouldFail = false,
  })  : _initial = List.of(initial ?? []),
        _updateShouldFail = updateShouldFail,
        super(_FakeApiClient());

  final List<PatternBookmark> _initial;
  final bool _updateShouldFail;

  // Tracks updateNotes calls for assertions
  String? lastUpdatedId;
  String? lastUpdatedNotes;

  @override
  Future<List<PatternBookmark>> getBookmarks() async => List.of(_initial);

  @override
  Future<PatternBookmark> createBookmark({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) async =>
      throw UnimplementedError();

  @override
  Future<void> deleteBookmark(String id) async =>
      throw UnimplementedError();

  @override
  Future<PatternBookmark> updateNotes(String id, String notes) async {
    if (_updateShouldFail) throw Exception('update failed');
    lastUpdatedId = id;
    lastUpdatedNotes = notes;
    final bm = _initial.firstWhere((b) => b.id == id);
    return PatternBookmark(
      id: bm.id,
      userId: bm.userId,
      instrument: bm.instrument,
      timeframe: bm.timeframe,
      pattern: bm.pattern,
      direction: bm.direction,
      notes: notes,
      createdAt: bm.createdAt,
    );
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const _bookmarkId = 'bm-detail-001';
const _userId = 'user-01';

PatternBookmark _makeBookmark({String? notes}) => PatternBookmark(
      id: _bookmarkId,
      userId: _userId,
      instrument: 'EUR/USD',
      timeframe: '1h',
      pattern: 'Gartley',
      direction: 'CALL',
      notes: notes,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

ScannerResult _makeScannerResult() => ScannerResult(
      id: 'scan-detail-001',
      instrument: 'EUR/USD',
      timeframe: '1h',
      pattern: 'Gartley',
      direction: 'CALL',
      entryPrice: 1.08765,
      stopLoss: 1.08000,
      takeProfit: 1.09400,
      metadata: null,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

// ── Pump helper ───────────────────────────────────────────────────────────────

Future<BookmarksNotifier> _pumpSheet(
  WidgetTester tester, {
  _FakeBookmarksApi? api,
  bool isBookmarked = true,
  String? notes,
}) async {
  final fakeApi = api ??
      _FakeBookmarksApi(
        initial: [_makeBookmark(notes: notes)],
      );
  final notifier = BookmarksNotifier(fakeApi);
  // Wait for initial load
  await Future<void>.microtask(() {});

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookmarksProvider.overrideWith((_) => notifier),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: PatternDetailSheet(
            result: _makeScannerResult(),
            notes: notes,
            isBookmarked: isBookmarked,
            bookmarkId: isBookmarked ? _bookmarkId : null,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return notifier;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('PatternDetailSheet — notes edit flow', () {
    // AC-PDS-01: tap pencil icon → TextField becomes visible
    testWidgets('AC-PDS-01: tapping pencil icon reveals TextField',
        (tester) async {
      await _pumpSheet(tester);

      // TextField should NOT be present initially
      expect(find.byType(TextField), findsNothing);

      // Tap the edit pencil icon
      await tester.tap(find.byIcon(Icons.edit));
      await tester.pump();

      // TextField should now be visible
      expect(find.byType(TextField), findsOneWidget);
    });

    // AC-PDS-02: type text + tap Save → updateNotes called
    testWidgets('AC-PDS-02: type text and tap Save → notifier.updateNotes called',
        (tester) async {
      final fakeApi = _FakeBookmarksApi(
        initial: [_makeBookmark(notes: null)],
      );
      final notifier = await _pumpSheet(tester, api: fakeApi);

      // Enter edit mode
      await tester.tap(find.byIcon(Icons.edit));
      await tester.pump();

      // Type into the TextField
      await tester.enterText(find.byType(TextField), 'My note');
      await tester.pump();

      // Ensure Save button is visible (bottom sheet may need scrolling)
      await tester.ensureVisible(find.text('Save'));
      await tester.pump();

      // Tap Save
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      // updateNotes should have been called via API
      expect(fakeApi.lastUpdatedNotes, equals('My note'));
      expect(fakeApi.lastUpdatedId, equals(_bookmarkId));

      // lastError should be null on success
      expect(notifier.lastError, isNull);

      // TextField should be gone after save
      expect(find.byType(TextField), findsNothing);
    });

    // AC-PDS-03: type text + tap Cancel → no updateNotes call, read-only restored
    testWidgets('AC-PDS-03: tap Cancel → TextField gone, updateNotes NOT called',
        (tester) async {
      final fakeApi = _FakeBookmarksApi(
        initial: [_makeBookmark(notes: null)],
      );
      await _pumpSheet(tester, api: fakeApi);

      // Enter edit mode
      await tester.tap(find.byIcon(Icons.edit));
      await tester.pump();

      // Type something
      await tester.enterText(find.byType(TextField), 'Unsaved note');
      await tester.pump();

      // Ensure Cancel button is visible (bottom sheet may need scrolling)
      await tester.ensureVisible(find.text('Cancel'));
      await tester.pump();

      // Tap Cancel
      await tester.tap(find.text('Cancel'));
      await tester.pump();

      // TextField should be gone
      expect(find.byType(TextField), findsNothing);

      // updateNotes should NOT have been called
      expect(fakeApi.lastUpdatedId, isNull);
      expect(fakeApi.lastUpdatedNotes, isNull);
    });
  });
}
