import '../../features/journal/models/journal_entry.dart';
import 'api_client.dart';

/// API layer for journal entries (CRUD + filtering).
///
/// Injected with [ApiClient] — the shared singleton that carries the JWT
/// interceptor and auto-refresh logic. All calls automatically include the
/// `Authorization: Bearer <token>` header, so multi-user isolation is
/// enforced at the server level via the JWT `sub` claim.
class JournalApi {
  const JournalApi(this._client);

  final ApiClient _client;

  /// Fetch journal entries for the authenticated user.
  ///
  /// Optional [emotion], [startDate] (ISO-8601 date string), and [endDate]
  /// (ISO-8601 date string) are forwarded as query parameters.
  Future<List<JournalEntry>> getEntries({
    EmotionTag? emotion,
    String? startDate,
    String? endDate,
  }) async {
    final params = <String, dynamic>{};
    if (emotion != null) params['emotion'] = emotion.name;
    if (startDate != null) params['startDate'] = startDate;
    if (endDate != null) params['endDate'] = endDate;

    final res = await _client.get(
      '/journal',
      queryParameters: params.isNotEmpty ? params : null,
    );
    final list = res.data as List<dynamic>;
    return list
        .map((e) => JournalEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single journal entry by [id].
  Future<JournalEntry> getEntry(String id) async {
    final res = await _client.get('/journal/$id');
    return JournalEntry.fromJson(res.data as Map<String, dynamic>);
  }

  /// Create a new journal entry.
  ///
  /// [data] must contain at least `title`. Optional fields:
  /// `content`, `emotion`, `tradeIds`, `tags`.
  Future<JournalEntry> createEntry(Map<String, dynamic> data) async {
    final res = await _client.post('/journal', data: data);
    return JournalEntry.fromJson(res.data as Map<String, dynamic>);
  }

  /// Update an existing journal entry [id] with [data] (partial patch).
  Future<JournalEntry> updateEntry(
      String id, Map<String, dynamic> data) async {
    final res = await _client.patch('/journal/$id', data: data);
    return JournalEntry.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete the journal entry [id].
  Future<void> deleteEntry(String id) async {
    await _client.delete('/journal/$id');
  }
}
