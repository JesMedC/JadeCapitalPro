import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/goals_api.dart';
import '../../../core/network/providers.dart';
import '../models/goal.dart';

/// Manages the goals list as an [AsyncValue<List<Goal>>].
///
/// Matches the [JournalNotifier] pattern (StateNotifier + AsyncValue) for
/// consistency across the codebase. NOT the Riverpod 2.x [AsyncNotifier]
/// pattern — consistency with the established journal pattern is intentional.
///
/// The [_activeOnly] flag mirrors the current tab selection (Active/All)
/// and is preserved across reloads so the list filter is stable.
class GoalsNotifier extends StateNotifier<AsyncValue<List<Goal>>> {
  GoalsNotifier(this._api) : super(const AsyncValue.loading()) {
    loadGoals();
  }

  final GoalsApi _api;

  /// Mirrors the Active tab default (true = show only active goals).
  bool _activeOnly = true;

  /// Reload goals with an optional filter override.
  ///
  /// If [activeOnly] is omitted, the previously stored value is reused
  /// (so refreshes after create/update/delete preserve the active filter).
  Future<void> loadGoals({bool? activeOnly}) async {
    final filter = activeOnly ?? _activeOnly;
    _activeOnly = filter;
    state = const AsyncValue.loading();
    try {
      final goals = await _api.getGoals(activeOnly: filter ? true : null);
      state = AsyncValue.data(goals);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Create a new goal and refresh the list.
  Future<void> createGoal(Map<String, dynamic> data) async {
    await _api.createGoal(data);
    await loadGoals();
  }

  /// Update an existing goal and refresh the list.
  Future<void> updateGoal(String id, Map<String, dynamic> data) async {
    await _api.updateGoal(id, data);
    await loadGoals();
  }

  /// Delete a goal and refresh the list.
  Future<void> deleteGoal(String id) async {
    await _api.deleteGoal(id);
    await loadGoals();
  }
}

/// Global goals provider.
///
/// Reads [apiClientProvider] (shared JWT-aware singleton) and initialises
/// [GoalsApi] + [GoalsNotifier]. Auto-initialises when first watched from
/// [GoalsPage].
final goalsProvider =
    StateNotifierProvider<GoalsNotifier, AsyncValue<List<Goal>>>((ref) {
  final client = ref.watch(apiClientProvider);
  return GoalsNotifier(GoalsApi(client));
});
