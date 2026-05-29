// Sprint 12 — Unit tests for BookmarksNotifier + bookmarkKey().
//
// Covers (tasks 3.1):
//   (a) bookmarkKey() pure function — correct separator, correct order
//   (b) isBookmarked() — returns true/false from provider state
//   (c) Optimistic add + rollback on API error
//   (d) Optimistic remove + rollback on API error
//   (e) Successful toggle ON: sentinel replaced by server entry
//   (f) Successful toggle OFF: entry removed from state

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/bookmarks_api.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmark.dart';
import 'package:jade_capital_v3/features/bookmarks/bookmarks_provider.dart';

// ── Fake BookmarksApi ─────────────────────────────────────────────────────────

/// Controllable fake that lets tests inject initial data and force errors.
// ignore: must_be_immutable
class _FakeBookmarksApi extends BookmarksApi {
  _FakeBookmarksApi({
    List<PatternBookmark>? initial,
    bool createShouldFail = false,
    bool deleteShouldFail = false,
    bool updateShouldFail = false,
  })  : _initial = List.of(initial ?? []),
        _createShouldFail = createShouldFail,
        _deleteShouldFail = deleteShouldFail,
        _updateShouldFail = updateShouldFail,
        super(_FakeApiClient());

  final List<PatternBookmark> _initial;
  final bool _createShouldFail;
  final bool _deleteShouldFail;
  final bool _updateShouldFail;

  @override
  Future<List<PatternBookmark>> getBookmarks() async => List.of(_initial);

  @override
  Future<PatternBookmark> createBookmark({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) async {
    if (_createShouldFail) throw Exception('create failed');
    return PatternBookmark(
      id: 'server-id-01',
      userId: 'user-01',
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      notes: notes,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );
  }

  @override
  Future<void> deleteBookmark(String id) async {
    if (_deleteShouldFail) throw Exception('delete failed');
  }

  @override
  Future<PatternBookmark> updateNotes(String id, String notes) async {
    if (_updateShouldFail) throw Exception('update failed');
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

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

PatternBookmark _makeBookmark({
  String id = 'bm-0001',
  String instrument = 'EUR/USD',
  String timeframe = '1h',
  String pattern = 'Gartley',
  String direction = 'CALL',
  String? notes,
}) =>
    PatternBookmark(
      id: id,
      userId: 'user-01',
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      notes: notes,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

// ── Helper: build notifier and wait for initial load ──────────────────────────

Future<BookmarksNotifier> _buildNotifier({
  List<PatternBookmark>? initial,
  bool createShouldFail = false,
  bool deleteShouldFail = false,
  bool updateShouldFail = false,
}) async {
  final api = _FakeBookmarksApi(
    initial: initial,
    createShouldFail: createShouldFail,
    deleteShouldFail: deleteShouldFail,
    updateShouldFail: updateShouldFail,
  );
  final notifier = BookmarksNotifier(api);
  // Allow the async _load() to complete
  await Future<void>.microtask(() {});
  return notifier;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // ── (a) bookmarkKey() pure function ───────────────────────────────────────

  group('bookmarkKey() pure function', () {
    test('joins fields with pipe separator in correct order', () {
      final key = bookmarkKey(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );
      expect(key, equals('EUR/USD|1h|Gartley|CALL'));
    });

    test('uses PatternBookmark.keySep constant', () {
      expect(PatternBookmark.keySep, equals('|'));
    });

    test('PUT direction is correctly included', () {
      final key = bookmarkKey(
        instrument: 'GBP/USD',
        timeframe: '4h',
        pattern: 'Butterfly',
        direction: 'PUT',
      );
      expect(key, equals('GBP/USD|4h|Butterfly|PUT'));
    });

    test('PatternBookmark.compoundKey matches bookmarkKey()', () {
      final bm = _makeBookmark(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );
      final standalone = bookmarkKey(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );
      expect(bm.compoundKey, equals(standalone));
    });
  });

  // ── (b) isBookmarked() ────────────────────────────────────────────────────

  group('isBookmarked()', () {
    test('returns true when signal is in bookmarked keys', () async {
      final bm = _makeBookmark();
      final notifier = await _buildNotifier(initial: [bm]);

      expect(
        notifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isTrue,
      );
    });

    test('returns false when signal is not in bookmarked keys', () async {
      final notifier = await _buildNotifier(initial: []);

      expect(
        notifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isFalse,
      );
    });

    test('returns false when state is loading', () async {
      final api = _FakeBookmarksApi();
      final notifier = BookmarksNotifier(api);
      // Do NOT await — state is still AsyncValue.loading()

      expect(
        notifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isFalse,
      );

      // Clean up
      await Future<void>.microtask(() {});
    });
  });

  // ── (c) Optimistic add + rollback on API error ─────────────────────────────

  group('toggle() optimistic add + rollback', () {
    test('optimistically adds key before API resolves', () async {
      // Use a delayed completer to pause the API so we can inspect mid-toggle.
      final completer = Completer<PatternBookmark>();
      late BookmarksNotifier capturedNotifier;

      final api = _ControllableApi(createCompleter: completer);
      capturedNotifier = BookmarksNotifier(api);
      await Future<void>.microtask(() {});

      // State must be loaded and empty
      expect(capturedNotifier.state.valueOrNull?.bookmarks, isEmpty);

      // Start toggle without awaiting
      // ignore: unawaited_futures
      capturedNotifier.toggle(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );

      // Yield to allow the optimistic update microtask
      await Future<void>.microtask(() {});

      // Optimistic sentinel should already be in the key set
      expect(
        capturedNotifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isTrue,
        reason: 'Expected optimistic bookmark before API responds',
      );

      // Complete the API call
      completer.complete(_makeBookmark());
      await Future<void>.delayed(Duration.zero);
    });

    test('rolls back on API error (create fails)', () async {
      final notifier = await _buildNotifier(
        initial: [],
        createShouldFail: true,
      );

      await notifier.toggle(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );

      // After rollback: key should be gone
      expect(
        notifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isFalse,
        reason: 'Expected rollback after createBookmark failure',
      );

      // lastError should be set
      expect(notifier.lastError, isNotNull);
    });

    test('replaces sentinel with server entry on success', () async {
      final notifier = await _buildNotifier(initial: []);

      await notifier.toggle(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );

      final bookmarks = notifier.state.valueOrNull!.bookmarks;
      expect(bookmarks, hasLength(1));
      expect(bookmarks.first.id, equals('server-id-01'));
      expect(notifier.lastError, isNull);
    });
  });

  // ── (d) Optimistic remove + rollback on API error ─────────────────────────

  group('toggle() optimistic remove + rollback', () {
    test('optimistically removes key before API resolves', () async {
      final bm = _makeBookmark();
      final completer = Completer<void>();

      final api = _ControllableApi(deleteCompleter: completer, initial: [bm]);
      final notifier = BookmarksNotifier(api);
      await Future<void>.microtask(() {});

      expect(notifier.isBookmarked(
        instrument: 'EUR/USD', timeframe: '1h',
        pattern: 'Gartley', direction: 'CALL',
      ), isTrue);

      // Start remove without awaiting
      // ignore: unawaited_futures
      notifier.toggle(
        instrument: 'EUR/USD', timeframe: '1h',
        pattern: 'Gartley', direction: 'CALL',
      );
      await Future<void>.microtask(() {});

      // Optimistic: key removed immediately
      expect(notifier.isBookmarked(
        instrument: 'EUR/USD', timeframe: '1h',
        pattern: 'Gartley', direction: 'CALL',
      ), isFalse, reason: 'Expected optimistic removal before API responds');

      // Complete delete
      completer.complete();
      await Future<void>.delayed(Duration.zero);
    });

    test('rolls back on API error (delete fails)', () async {
      final bm = _makeBookmark();
      final notifier = await _buildNotifier(
        initial: [bm],
        deleteShouldFail: true,
      );

      await notifier.toggle(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );

      // After rollback: key should be restored
      expect(
        notifier.isBookmarked(
          instrument: 'EUR/USD',
          timeframe: '1h',
          pattern: 'Gartley',
          direction: 'CALL',
        ),
        isTrue,
        reason: 'Expected rollback after deleteBookmark failure',
      );
      expect(notifier.lastError, isNotNull);
    });

    test('successfully removes entry on successful delete', () async {
      final bm = _makeBookmark();
      final notifier = await _buildNotifier(initial: [bm]);

      await notifier.toggle(
        instrument: 'EUR/USD',
        timeframe: '1h',
        pattern: 'Gartley',
        direction: 'CALL',
      );

      final bookmarks = notifier.state.valueOrNull!.bookmarks;
      expect(bookmarks, isEmpty);
      expect(notifier.lastError, isNull);
    });
  });

  // ── updateNotes() ─────────────────────────────────────────────────────────

  group('updateNotes()', () {
    test('optimistic update — notes field set immediately before API resolves',
        () async {
      final bm = _makeBookmark(id: 'bm-0001', notes: null);
      final notifier = await _buildNotifier(initial: [bm]);

      // Do NOT await — inspect state before API resolves
      // ignore: unawaited_futures
      notifier.updateNotes('bm-0001', 'First note');

      // Yield to allow the optimistic state update microtask
      await Future<void>.microtask(() {});

      expect(
        notifier.state.valueOrNull!.bookmarks.first.notes,
        equals('First note'),
      );
    });

    test('rollback on error — original notes restored after API failure',
        () async {
      final bm = _makeBookmark(id: 'bm-0001', notes: null);
      final notifier = await _buildNotifier(
        initial: [bm],
        updateShouldFail: true,
      );

      await notifier.updateNotes('bm-0001', 'Bad note');

      // State should be rolled back to original (null notes)
      expect(
        notifier.state.valueOrNull!.bookmarks.first.notes,
        isNull,
      );
      expect(notifier.lastError, isNotNull);
    });

    test('lastError is null on success and notes are persisted', () async {
      final bm = _makeBookmark(id: 'bm-0001', notes: null);
      final notifier = await _buildNotifier(initial: [bm]);

      await notifier.updateNotes('bm-0001', 'Valid note');

      expect(notifier.lastError, isNull);
      expect(
        notifier.state.valueOrNull!.bookmarks.first.notes,
        equals('Valid note'),
      );
    });
  });

  // ── (e) BookmarksState.from() derives key set correctly ──────────────────

  group('BookmarksState.from()', () {
    test('builds bookmarkedKeys Set from bookmarks list', () {
      final bm1 = _makeBookmark(id: '1', instrument: 'EUR/USD', direction: 'CALL');
      final bm2 = _makeBookmark(id: '2', instrument: 'GBP/USD', direction: 'PUT');
      final state = BookmarksState.from([bm1, bm2]);

      expect(state.bookmarkedKeys, hasLength(2));
      expect(state.bookmarkedKeys, contains('EUR/USD|1h|Gartley|CALL'));
      expect(state.bookmarkedKeys, contains('GBP/USD|1h|Gartley|PUT'));
    });

    test('empty list produces empty key set', () {
      final state = BookmarksState.from([]);
      expect(state.bookmarks, isEmpty);
      expect(state.bookmarkedKeys, isEmpty);
    });
  });
}

// ── Controllable fake for timing tests ───────────────────────────────────────

class _ControllableApi extends BookmarksApi {
  _ControllableApi({
    this.createCompleter,
    this.deleteCompleter,
    List<PatternBookmark>? initial,
  })  : _initial = initial ?? [],
        super(_FakeApiClient());

  final Completer<PatternBookmark>? createCompleter;
  final Completer<void>? deleteCompleter;
  final List<PatternBookmark> _initial;

  @override
  Future<List<PatternBookmark>> getBookmarks() async => List.of(_initial);

  @override
  Future<PatternBookmark> createBookmark({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) {
    return createCompleter!.future;
  }

  @override
  Future<void> deleteBookmark(String id) {
    return deleteCompleter!.future;
  }
}
