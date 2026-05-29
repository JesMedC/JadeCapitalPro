import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'backtest_api.dart';
import 'bookmarks_api.dart';
import 'calendar_api.dart';
import 'market_ws_client.dart';
import 'price_alerts_api.dart';
import 'reports_api.dart';
import 'scanner_api.dart';
import 'watchlist_api.dart';
import 'ws_client.dart';

/// Shared ApiClient singleton for the entire app.
///
/// All providers MUST use this single instance so that JWT tokens,
/// interceptors, and refresh logic are consistent across the app.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Shared PriceAlertsApi instance backed by the singleton [ApiClient].
///
/// Inject this via [ref.watch(priceAlertsApiProvider)] wherever the
/// alerts REST layer is needed (primarily in [AlertsNotifier]).
final priceAlertsApiProvider =
    Provider<PriceAlertsApi>((ref) => PriceAlertsApi(ref.watch(apiClientProvider)));

/// Shared WsClient singleton for the entire app.
///
/// The Socket.IO client connects to the NestJS backend and handles:
/// - `price:update` events (market data)
/// - `alert:triggered` events (price alerts)
/// - `trade:update` events (trade notifications)
///
/// Consumers call [wsClientProvider] to subscribe to these streams.
final wsClientProvider = Provider<WsClient>((ref) => WsClient());

/// Shared [MarketWsClient] singleton for the /ws/market namespace.
///
/// Reads the JWT access token from [ApiClient]'s static storage (same
/// approach as [WsClient._initSocket] which reads from FlutterSecureStorage).
/// Calls [MarketWsClient.connect()] immediately and registers [dispose]
/// on provider disposal so the socket is cleanly torn down on logout.
///
/// This is a singleton: navigating away from [WatchlistPage] does NOT
/// disconnect the socket — the spec requires live prices to survive tab switches.
final marketWsClientProvider = Provider<MarketWsClient>((ref) {
  // ApiClient._accessToken is static; reading via a fresh instance is safe.
  final token = ApiClient.currentAccessToken ?? '';
  final client = MarketWsClient(token: token);
  client.connect();
  ref.onDispose(client.dispose);
  return client;
});

/// Shared [WatchlistApi] backed by the singleton [ApiClient].
final watchlistApiProvider = Provider<WatchlistApi>(
  (ref) => WatchlistApi(ref.watch(apiClientProvider)),
);

/// Shared [CalendarApi] backed by the singleton [ApiClient].
final calendarApiProvider = Provider<CalendarApi>(
  (ref) => CalendarApi(ref.watch(apiClientProvider)),
);

/// Shared [ScannerApi] backed by the singleton [ApiClient].
///
/// Scanner results are global — no user-scoped state in this API layer.
/// [ScannerNotifier] holds the in-memory result list and handles client-side
/// filtering without additional API calls.
final scannerApiProvider = Provider<ScannerApi>(
  (ref) => ScannerApi(ref.watch(apiClientProvider)),
);

/// Shared [BacktestApi] backed by the singleton [ApiClient].
///
/// Backtests are per-user — every request is scoped to the authenticated user
/// via the JWT in [ApiClient]. [BacktestNotifier] manages the in-memory list
/// and dispatches list/create/delete operations through this provider.
final backtestApiProvider = Provider<BacktestApi>(
  (ref) => BacktestApi(ref.watch(apiClientProvider)),
);

/// Shared [BookmarksApi] backed by the singleton [ApiClient].
///
/// Bookmarks are per-user — every request is scoped to the authenticated user
/// via the JWT in [ApiClient]. [BookmarksNotifier] manages optimistic toggle
/// and compound-key membership lookups without additional API calls.
final bookmarksApiProvider = Provider<BookmarksApi>(
  (ref) => BookmarksApi(ref.watch(apiClientProvider)),
);

/// Shared [ReportsApi] backed by the singleton [ApiClient].
///
/// PDF report downloads are per-account — the JWT in [ApiClient] constrains
/// every request to the authenticated user's accounts. [ReportsNotifier]
/// manages download state and error handling without additional API calls.
final reportsApiProvider = Provider<ReportsApi>(
  (ref) => ReportsApi(ref.watch(apiClientProvider)),
);
