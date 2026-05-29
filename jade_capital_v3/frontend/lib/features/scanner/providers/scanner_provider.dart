import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import '../../../core/network/scanner_api.dart';
import '../../../core/network/ws_client.dart';
import '../models/scanner_result.dart';
import 'scanner_filter_state.dart';

/// Manages the scanner result list as an [AsyncValue<List<ScannerResult>>].
///
/// Follows the [AlertsNotifier] / [GoalsNotifier] pattern
/// (StateNotifier + AsyncValue) for consistency across the codebase.
/// NOT the Riverpod 2.x [AsyncNotifier] pattern — consistency with the
/// established Sprint 6–8 pattern is intentional.
///
/// Client-side filtering: [ScannerNotifier] loads all results once into
/// [_allResults] and filters them in memory via [applyFilters] — no extra
/// API calls on filter change. The full unfiltered list is always preserved
/// for building filter chip options in [ScannerPage].
///
/// Scanner results are **global** — the same list is shown to every
/// authenticated user. No per-user scoping is applied here.
class ScannerNotifier
    extends StateNotifier<AsyncValue<List<ScannerResult>>> {
  ScannerNotifier(this._api, this._wsClient) : super(const AsyncValue.loading()) {
    _loadResults();
    _scannerSub = _wsClient.scannerStream.listen(_onScannerPush);
  }

  final ScannerApi _api;
  final WsClient _wsClient;

  /// Subscription to the WebSocket scanner:updated stream (AC-16).
  late final StreamSubscription<Map<String, dynamic>> _scannerSub;

  /// Unfiltered result set loaded from the backend on initialisation.
  /// Preserved to build filter chip options and reapply filters without
  /// additional API calls. Also used as base for in-memory WS merge (AC-12).
  List<ScannerResult> _allResults = [];

  /// Active filter state applied to [_allResults] to produce the current state.
  ScannerFilterState _filter = ScannerFilterState.empty;

  // ── Public API ────────────────────────────────────────────────────────────

  /// Unfiltered full list — exposed for [ScannerPage] to build filter chips.
  List<ScannerResult> get allResults => List.unmodifiable(_allResults);

  /// Reload results from the backend and reset the emitted state.
  ///
  /// Called on initial mount and when the user taps the refresh FAB.
  Future<void> refresh() => _loadResults();

  /// Apply [filter] in-memory against [_allResults] and emit a new data state.
  ///
  /// NO network call is made — filtering is instant and client-side only.
  /// The current [_filter] is updated so that a subsequent [refresh] will
  /// re-apply the same filter after reloading.
  void applyFilters(ScannerFilterState filter) {
    _filter = filter;
    // Only update state if data is already loaded; ignore if loading/error.
    state.whenData((_) {
      state = AsyncValue.data(_applyFilter(_allResults, filter));
    });
  }

  // ── WebSocket push handling ───────────────────────────────────────────────

  /// Called for every `scanner:updated` WS event from [WsClient.scannerStream].
  void _onScannerPush(Map<String, dynamic> payload) {
    final raw = payload['results'];
    if (raw is! List) return;
    final incoming = raw
        .whereType<Map<String, dynamic>>()
        .map(ScannerResult.fromJson)
        .toList();
    _mergeResults(incoming);
  }

  /// Merge [incoming] into [_allResults] by compound key, then re-apply filter.
  ///
  /// AC-14: empty push does not clear state.
  /// AC-12: existing slots are replaced; new slots are appended.
  /// AC-13: active filter is re-applied without resetting it.
  void _mergeResults(List<ScannerResult> incoming) {
    if (incoming.isEmpty) return; // AC-14: empty push ≠ clear

    // Build a map from the existing result set keyed by compound identity
    final map = <String, ScannerResult>{
      for (final r in _allResults) _mergeKey(r): r,
    };

    // Overlay — replace existing slot or insert new (AC-12)
    for (final r in incoming) {
      map[_mergeKey(r)] = r;
    }

    _allResults = map.values.toList();

    // Re-apply active filter without resetting it (AC-13)
    state.whenData((_) {
      state = AsyncValue.data(_applyFilter(_allResults, _filter));
    });
  }

  /// Compound key that matches the DB unique constraint:
  /// (instrument, timeframe, pattern, direction).
  static String _mergeKey(ScannerResult r) =>
      '${r.instrument}|${r.timeframe}|${r.pattern}|${r.direction}';

  @override
  void dispose() {
    _scannerSub.cancel(); // AC-16
    super.dispose();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  Future<void> _loadResults() async {
    state = const AsyncValue.loading();
    try {
      _allResults = await _api.getResults();
      state = AsyncValue.data(_applyFilter(_allResults, _filter));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Filter [results] by every active dimension in [filter].
  ///
  /// A null dimension means "no filter — include all values for that field".
  List<ScannerResult> _applyFilter(
    List<ScannerResult> results,
    ScannerFilterState filter,
  ) {
    if (filter.isEmpty) return results;
    return results.where((r) {
      if (filter.patternType != null && r.pattern != filter.patternType) {
        return false;
      }
      if (filter.instrument != null && r.instrument != filter.instrument) {
        return false;
      }
      if (filter.timeframe != null && r.timeframe != filter.timeframe) {
        return false;
      }
      return true;
    }).toList();
  }
}

/// Global scanner provider.
///
/// Reads [scannerApiProvider] (shared JWT-aware singleton) and initialises
/// [ScannerApi] + [ScannerNotifier]. Auto-initialises when first watched
/// from [ScannerPage].
final scannerProvider = StateNotifierProvider<ScannerNotifier,
    AsyncValue<List<ScannerResult>>>((ref) {
  final api = ref.watch(scannerApiProvider);
  final ws = ref.watch(wsClientProvider);
  return ScannerNotifier(api, ws);
});
