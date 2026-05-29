import 'api_client.dart';

/// REST wrapper for the watchlist endpoints on MarketDataController.
///
/// Endpoints:
///   GET  /api/market-data/watchlist  → { instruments: string[] }
///   PUT  /api/market-data/watchlist  → { instruments: string[] }
///
/// Multi-user isolation is enforced at the network layer: the JWT in
/// [ApiClient] constrains every request to the authenticated user's data.
class WatchlistApi {
  const WatchlistApi(this._client);

  final ApiClient _client;

  /// Fetches the authenticated user's watchlist.
  ///
  /// Returns the list of instrument symbols (e.g. ['EUR/USD', 'GBP/USD']).
  /// Returns the server-side default if this is the first request for the user.
  Future<List<String>> getWatchlist() async {
    final res = await _client.get('/market-data/watchlist');
    final data = res.data as Map<String, dynamic>;
    final list = data['instruments'] as List<dynamic>;
    return list.cast<String>();
  }

  /// Replaces the authenticated user's watchlist with [instruments].
  ///
  /// The server validates the list (min 1, max 10, valid symbols).
  /// Throws [ApiException] on 400 or 401.
  Future<List<String>> updateWatchlist(List<String> instruments) async {
    final res = await _client.put(
      '/market-data/watchlist',
      data: {'instruments': instruments},
    );
    final data = res.data as Map<String, dynamic>;
    final list = data['instruments'] as List<dynamic>;
    return list.cast<String>();
  }
}
