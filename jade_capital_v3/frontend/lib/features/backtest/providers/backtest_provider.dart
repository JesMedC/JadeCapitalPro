import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/backtest_api.dart';
import '../../../core/network/providers.dart';
import '../models/backtest_session.dart';

/// Manages the backtest session list as an [AsyncValue<List<BacktestSession>>].
///
/// Follows the [AlertsNotifier] / [ScannerNotifier] pattern
/// (StateNotifier + AsyncValue) for codebase-wide consistency.
/// NOT the Riverpod 2.x [AsyncNotifier] — the Sprint 6–9 pattern is intentional.
///
/// Multi-user isolation is enforced at the network layer: the JWT in
/// [ApiClient] constrains every request to the authenticated user's sessions.
class BacktestNotifier
    extends StateNotifier<AsyncValue<List<BacktestSession>>> {
  BacktestNotifier(this._api) : super(const AsyncValue.loading()) {
    _load();
  }

  final BacktestApi _api;

  // ── Public API ─────────────────────────────────────────────────────────────

  /// Reload the session list from the server.
  Future<void> refresh() => _load();

  /// Submit a new backtest run and refresh the list.
  ///
  /// Returns the created [BacktestSession] (status = 'pending') so that the
  /// caller can navigate to the result page immediately.
  Future<BacktestSession> create(
    String name,
    Map<String, dynamic> config,
  ) async {
    final session = await _api.create(name: name, config: config);
    await _load(); // refresh list so the new pending session appears
    return session;
  }

  /// Delete session [id] with optimistic removal, then confirm server-side.
  ///
  /// The optimistic update ensures instant UI feedback without a full reload
  /// round-trip. If the API call fails, the list will be stale until the next
  /// [refresh] — acceptable for MVP.
  Future<void> delete(String id) async {
    // Optimistic removal
    state.whenData((list) {
      state = AsyncValue.data(list.where((s) => s.id != id).toList());
    });
    await _api.delete(id);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  Future<void> _load() async {
    state = const AsyncValue.loading();
    try {
      final sessions = await _api.list();
      state = AsyncValue.data(sessions);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

/// Global backtest provider.
///
/// Reads [backtestApiProvider] (shared JWT-aware singleton) and initialises
/// [BacktestApi] + [BacktestNotifier]. Auto-initialises when first watched
/// from [BacktestPage].
final backtestProvider = StateNotifierProvider<BacktestNotifier,
    AsyncValue<List<BacktestSession>>>(
  (ref) => BacktestNotifier(ref.watch(backtestApiProvider)),
);
