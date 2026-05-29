import 'api_client.dart';
import '../../features/scanner/models/scanner_result.dart';

/// REST client for the global scanner endpoint (`GET /scanner`).
///
/// Mirrors [PriceAlertsApi] exactly — injected with [ApiClient], no static
/// state, purely functional. Scanner results are **global**: the backend
/// returns the same set to every authenticated user (no user-scoped filtering).
///
/// Optional [instrument] and [pattern] query parameters are supported for
/// server-side pre-filtering, but [ScannerNotifier] prefers loading all
/// results once and filtering client-side for instant UI response.
class ScannerApi {
  const ScannerApi(this._client);

  final ApiClient _client;

  /// Fetch all global scanner results.
  ///
  /// Passes [instrument] and [pattern] as optional query parameters when
  /// provided. Omitting both fetches the full result set (the preferred
  /// usage for client-side filtering).
  Future<List<ScannerResult>> getResults({
    String? instrument,
    String? pattern,
  }) async {
    final queryParams = <String, String>{
      if (instrument != null) 'instrument': instrument,
      if (pattern != null) 'pattern': pattern,
    };

    final res = await _client.get(
      '/scanner',
      queryParameters: queryParams.isEmpty ? null : queryParams,
    );

    final list = res.data as List<dynamic>;
    return list
        .map((e) => ScannerResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
