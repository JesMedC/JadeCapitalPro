import '../../features/goals/models/goal.dart';
import 'api_client.dart';

/// API layer for trading goals (CRUD + filtering).
///
/// Injected with [ApiClient] — the shared singleton that carries the JWT
/// interceptor and auto-refresh logic. All calls automatically include the
/// `Authorization: Bearer <token>` header, so multi-user isolation is
/// enforced at the server level via the JWT `sub` claim.
///
/// Mirrors [JournalApi] structure exactly — same pattern, same conventions.
class GoalsApi {
  const GoalsApi(this._client);

  final ApiClient _client;

  /// Fetch goals for the authenticated user.
  ///
  /// [activeOnly] = true → returns only active goals (isActive = true).
  /// [accountId] = UUID → filters by trading account.
  /// Both params are optional; omitting them returns all goals.
  Future<List<Goal>> getGoals({bool? activeOnly, String? accountId}) async {
    final params = <String, dynamic>{};
    if (activeOnly != null) params['activeOnly'] = activeOnly.toString();
    if (accountId != null) params['accountId'] = accountId;

    final res = await _client.get(
      '/goals',
      queryParameters: params.isNotEmpty ? params : null,
    );
    final list = res.data as List<dynamic>;
    return list
        .map((e) => Goal.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single goal by [id].
  Future<Goal> getGoalById(String id) async {
    final res = await _client.get('/goals/$id');
    return Goal.fromJson(res.data as Map<String, dynamic>);
  }

  /// Create a new goal.
  ///
  /// [payload] must contain at least: `title`, `goalType`, `targetValue`,
  /// `startDate`, `endDate`. Optional: `period`, `notes`, `accountId`,
  /// `isActive`.
  Future<Goal> createGoal(Map<String, dynamic> payload) async {
    final res = await _client.post('/goals', data: payload);
    return Goal.fromJson(res.data as Map<String, dynamic>);
  }

  /// Update an existing goal [id] with [payload] (partial patch).
  Future<Goal> updateGoal(String id, Map<String, dynamic> payload) async {
    final res = await _client.patch('/goals/$id', data: payload);
    return Goal.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete goal [id].
  Future<void> deleteGoal(String id) async {
    await _client.delete('/goals/$id');
  }
}
