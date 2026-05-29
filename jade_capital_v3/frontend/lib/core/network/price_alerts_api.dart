import '../../features/alerts/models/price_alert.dart';
import 'api_client.dart';

/// API layer for price alerts (CRUD).
///
/// Injected with [ApiClient] — the shared singleton that carries the JWT
/// interceptor and auto-refresh logic. All calls automatically include the
/// `Authorization: Bearer <token>` header, so multi-user isolation is
/// enforced at the server level via the JWT `sub` claim.
///
/// Mirrors [GoalsApi] structure exactly — same pattern, same conventions.
/// The backend route prefix is `/alerts` (NestJS controller: `@Controller('alerts')`).
class PriceAlertsApi {
  const PriceAlertsApi(this._client);

  final ApiClient _client;

  /// Fetch all alerts for the authenticated user.
  Future<List<PriceAlert>> getAlerts() async {
    final res = await _client.get('/alerts');
    final list = res.data as List<dynamic>;
    return list
        .map((e) => PriceAlert.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single alert by [id].
  Future<PriceAlert> getAlertById(String id) async {
    final res = await _client.get('/alerts/$id');
    return PriceAlert.fromJson(res.data as Map<String, dynamic>);
  }

  /// Create a new price alert.
  ///
  /// [dto] must contain: `name`, `instrument`, `condition`, `targetPrice`.
  Future<PriceAlert> createAlert(Map<String, dynamic> dto) async {
    final res = await _client.post('/alerts', data: dto);
    return PriceAlert.fromJson(res.data as Map<String, dynamic>);
  }

  /// Partially update an existing alert [id] with [dto].
  ///
  /// Commonly used to toggle status (active ↔ disabled) or update fields.
  Future<PriceAlert> updateAlert(String id, Map<String, dynamic> dto) async {
    final res = await _client.patch('/alerts/$id', data: dto);
    return PriceAlert.fromJson(res.data as Map<String, dynamic>);
  }

  /// Delete alert [id].
  Future<void> deleteAlert(String id) async {
    await _client.delete('/alerts/$id');
  }
}
