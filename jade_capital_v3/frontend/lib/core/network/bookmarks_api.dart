import '../../features/bookmarks/bookmark.dart';
import 'api_client.dart';

/// REST client for the per-user bookmarks endpoint (`/bookmarks`).
///
/// Mirrors [PriceAlertsApi] exactly — injected with [ApiClient], no static
/// state, purely functional. All requests are automatically scoped to the
/// authenticated user via the JWT in [ApiClient]'s interceptor.
///
/// The backend route prefix is `/bookmarks`
/// (NestJS controller: `@Controller('bookmarks')`).
class BookmarksApi {
  const BookmarksApi(this._client);

  final ApiClient _client;

  /// Fetch all bookmarks for the authenticated user.
  ///
  /// Returns an empty list when the user has no bookmarks — never throws 404.
  Future<List<PatternBookmark>> getBookmarks() async {
    final res = await _client.get('/bookmarks');
    final list = res.data as List<dynamic>;
    return list
        .map((e) => PatternBookmark.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Create a bookmark for the given signal identity.
  ///
  /// The backend enforces idempotency — a duplicate POST returns HTTP 200
  /// with the existing bookmark rather than 409. The returned object always
  /// has a valid server-assigned [id].
  Future<PatternBookmark> createBookmark({
    required String instrument,
    required String timeframe,
    required String pattern,
    required String direction,
    String? notes,
  }) async {
    final res = await _client.post('/bookmarks', data: {
      'instrument': instrument,
      'timeframe': timeframe,
      'pattern': pattern,
      'direction': direction,
      if (notes != null) 'notes': notes,
    });
    return PatternBookmark.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete the bookmark identified by [id].
  ///
  /// Throws [ApiException] with status 403 if the caller does not own the
  /// bookmark, or 404 if the bookmark no longer exists.
  Future<void> deleteBookmark(String id) async {
    await _client.delete('/bookmarks/$id');
  }

  /// Update the notes for an existing bookmark.
  ///
  /// Sends PATCH /bookmarks/:id/notes with {notes: notes}.
  /// Returns the updated bookmark entity on success.
  ///
  /// Throws [ApiException] on non-2xx response:
  ///   - 400: notes is empty or exceeds 500 characters
  ///   - 403: caller does not own the bookmark
  ///   - 404: bookmark does not exist
  Future<PatternBookmark> updateNotes(String id, String notes) async {
    final res = await _client.patch('/bookmarks/$id/notes', data: {'notes': notes});
    return PatternBookmark.fromJson(res.data as Map<String, dynamic>);
  }
}
