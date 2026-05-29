import 'api_client.dart';
import '../../features/backtest/models/backtest_session.dart';

/// REST client for the backtest endpoints (`/backtest`).
///
/// Mirrors the [ScannerApi] / [PriceAlertsApi] pattern: injected with
/// [ApiClient], no static state, purely functional.
///
/// Backtests are **per-user**: the JWT in [ApiClient] constrains every request
/// to the authenticated user's sessions. The backend enforces ownership on
/// GET, DELETE, and result access.
class BacktestApi {
  const BacktestApi(this._client);

  final ApiClient _client;

  /// Fetch all backtest sessions for the authenticated user.
  Future<List<BacktestSession>> list() async {
    final res = await _client.get('/backtest');
    final raw = res.data as List<dynamic>;
    return raw
        .map((e) => BacktestSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single backtest session by [id].
  ///
  /// The backend enforces user ownership — returns 403 if the session belongs
  /// to a different user.
  Future<BacktestSession> get(String id) async {
    final res = await _client.get('/backtest/$id');
    return BacktestSession.fromJson(res.data as Map<String, dynamic>);
  }

  /// Submit a new backtest run.
  ///
  /// Returns the created session with `status = 'pending'`.
  /// The backend enqueues the job and returns immediately — the client polls
  /// via [get] until [BacktestSession.isTerminal] is true.
  Future<BacktestSession> create({
    required String name,
    required Map<String, dynamic> config,
  }) async {
    final res = await _client.post(
      '/backtest',
      data: {'name': name, 'config': config},
    );
    return BacktestSession.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete a backtest session by [id].
  ///
  /// Returns 204 No Content on success. Throws on 403/404.
  Future<void> delete(String id) async {
    await _client.delete('/backtest/$id');
  }
}
