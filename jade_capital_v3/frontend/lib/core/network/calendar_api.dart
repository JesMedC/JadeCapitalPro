import '../../features/market/models/economic_event.dart';
import 'api_client.dart';

/// API layer for the economic calendar.
///
/// Injected with [ApiClient] — the shared singleton that carries the JWT
/// interceptor and auto-refresh logic. All calls automatically include the
/// `Authorization: Bearer <token>` header.
///
/// Error handling: relies on [ApiClient]'s Dio error propagation.
/// Non-2xx responses throw [DioException] which propagates to the caller
/// ([CalendarNotifier._load]) so it can set [AsyncValue.error].
class CalendarApi {
  const CalendarApi(this._client);

  final ApiClient _client;

  /// Fetch the full economic calendar from the backend.
  ///
  /// Returns a [Future<List<EconomicEvent>>] parsed from the backend
  /// `GET /market-data/economic-calendar` endpoint.
  Future<List<EconomicEvent>> fetchCalendar() async {
    final res = await _client.get('/market-data/economic-calendar');
    final list = res.data as List<dynamic>;
    return list
        .cast<Map<String, dynamic>>()
        .map(EconomicEvent.fromJson)
        .toList();
  }
}
