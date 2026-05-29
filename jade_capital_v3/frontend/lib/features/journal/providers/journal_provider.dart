import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/journal_api.dart';
import '../../../core/network/providers.dart';
import '../models/journal_entry.dart';

/// Manages journal entries as an [AsyncValue<List<JournalEntry>>].
///
/// Unlike the older [TradesNotifier] (which uses a manual state class),
/// this provider adopts the cleaner Riverpod [AsyncValue] pattern for the
/// three UI states: loading, error, data.
///
/// Active filter and reload logic are encapsulated here so the UI only
/// calls [applyFilter], [createEntry], [updateEntry], [deleteEntry].
class JournalNotifier
    extends StateNotifier<AsyncValue<List<JournalEntry>>> {
  JournalNotifier(this._api) : super(const AsyncValue.loading()) {
    loadEntries();
  }

  final JournalApi _api;

  /// The currently active emotion filter (null = no filter = "All").
  EmotionTag? _activeEmotion;

  /// Reload entries using the stored [_activeEmotion].
  Future<void> loadEntries({EmotionTag? emotion}) async {
    state = const AsyncValue.loading();
    try {
      final entries =
          await _api.getEntries(emotion: emotion ?? _activeEmotion);
      state = AsyncValue.data(entries);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Set [emotion] as the active filter and reload.
  /// Pass null to clear the filter ("All").
  Future<void> applyFilter(EmotionTag? emotion) async {
    _activeEmotion = emotion;
    await loadEntries(emotion: emotion);
  }

  /// Create a new entry and refresh the list.
  Future<void> createEntry(Map<String, dynamic> data) async {
    await _api.createEntry(data);
    await loadEntries();
  }

  /// Update an existing entry and refresh the list.
  Future<void> updateEntry(String id, Map<String, dynamic> data) async {
    await _api.updateEntry(id, data);
    await loadEntries();
  }

  /// Delete an entry and refresh the list.
  Future<void> deleteEntry(String id) async {
    await _api.deleteEntry(id);
    await loadEntries();
  }
}

/// Global journal provider.
///
/// Reads [apiClientProvider] (shared JWT-aware singleton) and initialises
/// [JournalApi] + [JournalNotifier]. Auto-initialises when first watched
/// from [JournalPage].
final journalProvider = StateNotifierProvider<JournalNotifier,
    AsyncValue<List<JournalEntry>>>((ref) {
  final client = ref.watch(apiClientProvider);
  return JournalNotifier(JournalApi(client));
});
