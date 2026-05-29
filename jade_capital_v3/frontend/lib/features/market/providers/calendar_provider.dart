import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import '../models/economic_event.dart';
import '../../../core/network/calendar_api.dart';

/// Manages the economic calendar list as [AsyncValue<List<EconomicEvent>>].
///
/// Follows the [AlertsNotifier] pattern: [StateNotifier] + [AsyncValue] for
/// consistency across the codebase. Auto-loads on construction and refreshes
/// every 24 hours via a periodic [Timer]. Calendar data is global (not
/// per-user), so no user-specific filtering at the state layer.
///
/// Multi-user note: the JWT in [ApiClient] is still attached to every request;
/// the backend endpoint simply ignores auth for this public market data.
class CalendarNotifier extends StateNotifier<AsyncValue<List<EconomicEvent>>> {
  CalendarNotifier(this._api) : super(const AsyncValue.loading()) {
    _load();
    _timer = Timer.periodic(const Duration(hours: 24), (_) => _load());
  }

  final CalendarApi _api;
  late final Timer _timer;

  /// Load (or reload) the calendar from the backend.
  ///
  /// Sets [state] to [AsyncValue.loading] while in-flight, then transitions
  /// to [AsyncValue.data] on success or [AsyncValue.error] on failure.
  Future<void> _load() async {
    state = const AsyncValue.loading();
    try {
      final events = await _api.fetchCalendar();
      state = AsyncValue.data(events);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Public reload — called by pull-to-refresh and the Retry button.
  ///
  /// Delegates to [_load] so the caller does not need to know the internal
  /// loading/error state transitions.
  Future<void> reload() => _load();

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }
}

/// Global calendar data provider.
///
/// Reads [calendarApiProvider] (shared JWT-aware singleton) and initialises
/// [CalendarApi] + [CalendarNotifier]. Auto-initialises when first watched
/// from [CalendarPage].
final calendarProvider = StateNotifierProvider<CalendarNotifier,
    AsyncValue<List<EconomicEvent>>>((ref) {
  return CalendarNotifier(ref.watch(calendarApiProvider));
});

/// Ephemeral UI filter state — currencies selected (empty set = all currencies shown).
///
/// Populated by [FilterChip] taps in [CalendarPage].
/// Empty set semantics: no filter active → show all events.
final calendarCurrencyFilterProvider = StateProvider<Set<String>>((ref) => {});

/// Ephemeral UI filter state — impact levels selected (empty set = all levels shown).
///
/// Values are impact level names: `'high'`, `'medium'`, `'low'`.
/// Empty set semantics: no filter active → show all events.
final calendarImpactFilterProvider = StateProvider<Set<String>>((ref) => {});
