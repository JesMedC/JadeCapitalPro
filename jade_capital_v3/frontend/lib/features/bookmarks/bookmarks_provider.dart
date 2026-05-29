import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/bookmarks_api.dart';
import '../../core/network/providers.dart';
import 'bookmark.dart';

// ── State ─────────────────────────────────────────────────────────────────────

/// Internal state carried by [BookmarksNotifier].
///
/// Separates the list (for display / ID lookup) from the derived key set
/// (for O(1) membership tests) so that [isBookmarked] never iterates.
class BookmarksState {
  const BookmarksState({
    required this.bookmarks,
    required this.bookmarkedKeys,
  });

  /// All bookmarks belonging to the authenticated user.
  final List<PatternBookmark> bookmarks;

  /// Derived `Set<String>` of compound keys — recomputed on every write.
  ///
  /// Format: `instrument|timeframe|pattern|direction`
  final Set<String> bookmarkedKeys;

  // ── Empty sentinel ─────────────────────────────────────────────────────────

  static const empty = BookmarksState(
    bookmarks: [],
    bookmarkedKeys: {},
  );

  // ── Factory helpers ────────────────────────────────────────────────────────

  /// Build a [BookmarksState] from a list, computing the key set automatically.
  factory BookmarksState.from(List<PatternBookmark> bookmarks) {
    return BookmarksState(
      bookmarks: List.unmodifiable(bookmarks),
      bookmarkedKeys: {for (final b in bookmarks) b.compoundKey},
    );
  }
}

// ── Notifier ──────────────────────────────────────────────────────────────────

/// Manages per-user bookmarks as an [AsyncValue<BookmarksState>].
///
/// Follows the [AlertsNotifier] pattern (StateNotifier + AsyncValue) for
/// consistency across the codebase. NOT the Riverpod 2.x [AsyncNotifier]
/// pattern — consistency with the established Sprint 6–8 pattern is
/// intentional.
///
/// Optimistic toggle: state is mutated locally before the API call.
/// On failure, the pre-toggle snapshot is restored and [lastError] is set
/// so callers can show a snackbar.
///
/// Coupling rule: this notifier reads [BookmarksApi] only — it does NOT
/// import [ScannerNotifier] or any scanner state. The connection between
/// bookmarks and scanner results is made in [ScannerPage] by passing
/// [isBookmarked] and [onToggleBookmark] as props to [PatternCard].
class BookmarksNotifier
    extends StateNotifier<AsyncValue<BookmarksState>> {
  BookmarksNotifier(this._api) : super(const AsyncValue.loading()) {
    _load();
  }

  final BookmarksApi _api;

  /// Last error from an optimistic toggle, if any.
  ///
  /// Set by [toggle] on API failure so [ScannerPage] can show a snackbar.
  /// Cleared on the next successful [toggle] or [reload].
  Exception? lastError;

  // ── Public API ────────────────────────────────────────────────────────────

  /// True when the signal identified by the compound key is bookmarked.
  ///
  /// Performs an O(1) Set lookup — no network call, no list iteration.
  bool isBookmarked({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
  }) {
    final key = bookmarkKey(
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
    );
    return state.valueOrNull?.bookmarkedKeys.contains(key) ?? false;
  }

  /// Reload bookmarks from the server.
  ///
  /// Called automatically on initialisation; also callable by the UI for
  /// manual refresh.
  Future<void> reload() => _load();

  /// Optimistically toggle the bookmark for a signal.
  ///
  /// - If currently bookmarked: removes optimistically, then DELETE /bookmarks/:id.
  /// - If not bookmarked: adds optimistically with a sentinel id (-1), then
  ///   POST /bookmarks and replaces sentinel with the server-returned id.
  ///
  /// On API failure, the state is reverted to the pre-toggle snapshot and
  /// [lastError] is set.
  Future<void> toggle({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) async {
    final current = state.valueOrNull;
    if (current == null) return; // not loaded yet — ignore tap

    final key = bookmarkKey(
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
    );
    final existing = current.bookmarks.firstWhere(
      (b) => b.compoundKey == key,
      orElse: () => _notFound,
    );

    if (existing.id != _notFound.id) {
      // ── REMOVE (optimistic) ───────────────────────────────────────────────
      final snapshot = current;
      final optimistic = BookmarksState.from(
        current.bookmarks.where((b) => b.id != existing.id).toList(),
      );
      state = AsyncValue.data(optimistic);

      try {
        await _api.deleteBookmark(existing.id);
        lastError = null;
      } catch (e) {
        state = AsyncValue.data(snapshot); // rollback
        lastError = e is Exception ? e : Exception(e.toString());
      }
    } else {
      // ── ADD (optimistic) ─────────────────────────────────────────────────
      final optimistic = _buildOptimistic(
        current: current,
        instrument: instrument,
        timeframe: timeframe,
        pattern: pattern,
        direction: direction,
        notes: notes,
      );
      final snapshot = current;
      state = AsyncValue.data(optimistic);

      try {
        final saved = await _api.createBookmark(
          instrument: instrument,
          timeframe: timeframe,
          pattern: pattern,
          direction: direction,
          notes: notes,
        );
        // Replace sentinel entry with real server entry (has real id + userId)
        final confirmed = BookmarksState.from([
          ...snapshot.bookmarks,
          saved,
        ]);
        state = AsyncValue.data(confirmed);
        lastError = null;
      } catch (e) {
        state = AsyncValue.data(snapshot); // rollback
        lastError = e is Exception ? e : Exception(e.toString());
      }
    }
  }

  /// Optimistically update the notes for an existing bookmark.
  ///
  /// Applies the change locally before the API call so the UI feels instant.
  /// On failure, reverts state to the pre-update snapshot and sets [lastError].
  ///
  /// Mirrors the [toggle] optimistic pattern exactly.
  Future<void> updateNotes(String id, String notes) async {
    final current = state.valueOrNull;
    if (current == null) return;

    final idx = current.bookmarks.indexWhere((b) => b.id == id);
    if (idx == -1) return; // bookmark not found — ignore

    final original = current.bookmarks[idx];
    final updated = PatternBookmark(
      id: original.id,
      userId: original.userId,
      instrument: original.instrument,
      timeframe: original.timeframe,
      pattern: original.pattern,
      direction: original.direction,
      notes: notes,
      createdAt: original.createdAt,
    );
    final optimisticList = [...current.bookmarks];
    optimisticList[idx] = updated;
    final snapshot = current;
    state = AsyncValue.data(BookmarksState.from(optimisticList));

    try {
      await _api.updateNotes(id, notes);
      lastError = null;
    } catch (e) {
      state = AsyncValue.data(snapshot); // rollback
      lastError = e is Exception ? e : Exception(e.toString());
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  Future<void> _load() async {
    state = const AsyncValue.loading();
    try {
      final bookmarks = await _api.getBookmarks();
      state = AsyncValue.data(BookmarksState.from(bookmarks));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Build an optimistic state with a sentinel bookmark appended.
  ///
  /// The sentinel uses id `'__optimistic__'` and userId `'__optimistic__'`
  /// so it can be replaced on API success without affecting real entries.
  BookmarksState _buildOptimistic({
    required BookmarksState current,
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) {
    final sentinel = PatternBookmark(
      id: '__optimistic__',
      userId: '__optimistic__',
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      notes: notes,
      createdAt: DateTime.now(),
    );
    return BookmarksState.from([...current.bookmarks, sentinel]);
  }

  /// Sentinel returned by [List.firstWhere] when no match is found.
  ///
  /// Using a stable constant avoids creating a new object on every call.
  static final _notFound = PatternBookmark(
    id: '__not_found__',
    userId: '__not_found__',
    instrument: '',
    timeframe: '',
    pattern: '',
    direction: '',
    createdAt: DateTime.fromMillisecondsSinceEpoch(0),
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

/// Global bookmarks provider — per-user, auto-initialises on first watch.
///
/// Inject [bookmarksApiProvider] (shared JWT-aware singleton) and return a
/// [BookmarksNotifier] instance. Any widget that watches this provider will
/// rebuild on every bookmark toggle.
final bookmarksProvider = StateNotifierProvider<BookmarksNotifier,
    AsyncValue<BookmarksState>>((ref) {
  final api = ref.watch(bookmarksApiProvider);
  return BookmarksNotifier(api);
});
