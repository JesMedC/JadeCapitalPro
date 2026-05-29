import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/market_ws_client.dart';
import '../../../core/network/providers.dart';
import '../../../core/network/watchlist_api.dart';
import '../models/price_tick.dart';
import '../models/watchlist_state.dart';

/// Manages watchlist state: instrument list, live price map, and WS subscriptions.
///
/// Follows the [AlertsNotifier] / [GoalsNotifier] pattern:
///   [StateNotifier<WatchlistState>] — NOT the Riverpod 2.x [AsyncNotifier].
///
/// Lifecycle:
///   - Constructed by [watchlistProvider] → calls [_init()] immediately.
///   - [_init()] loads the instrument list via REST then subscribes all via WS.
///   - The WS subscription stays alive even when navigating away (singleton provider).
///   - Disposal cancels [_priceSub] only; [MarketWsClient] lifecycle is managed
///     separately by [marketWsClientProvider].
class WatchlistNotifier extends StateNotifier<WatchlistState> {
  WatchlistNotifier(this._api, this._wsClient) : super(const WatchlistState()) {
    _init();
  }

  final WatchlistApi _api;
  final MarketWsClient _wsClient;
  StreamSubscription<PriceTick>? _priceSub;

  // ── Initialisation ──

  Future<void> _init() async {
    state = state.copyWith(status: WatchlistLoadStatus.loading);
    try {
      final instruments = await _api.getWatchlist();
      state = state.copyWith(
        status: WatchlistLoadStatus.loaded,
        instruments: instruments,
      );
      _subscribeAll(instruments);
    } catch (e) {
      state = state.copyWith(
        status: WatchlistLoadStatus.error,
        error: e.toString(),
      );
    }
  }

  void _subscribeAll(List<String> instruments) {
    _priceSub?.cancel();
    for (final inst in instruments) {
      _wsClient.subscribePrice(inst);
    }
    _priceSub = _wsClient.priceUpdates.listen(_onPriceTick);
  }

  void _onPriceTick(PriceTick tick) {
    if (!state.instruments.contains(tick.instrument)) return;
    state = state.copyWith(
      prices: Map.from(state.prices)..[tick.instrument] = tick,
    );
  }

  // ── Public API ──

  /// Add [instrument] to the watchlist.
  ///
  /// No-op if already present or watchlist is at capacity (10).
  Future<void> addInstrument(String instrument) async {
    if (state.instruments.contains(instrument)) return;
    if (state.instruments.length >= 10) return;
    final updated = [...state.instruments, instrument];
    await _api.updateWatchlist(updated);
    _wsClient.subscribePrice(instrument);
    state = state.copyWith(instruments: updated);
  }

  /// Remove [instrument] from the watchlist.
  ///
  /// No-op if the watchlist has only 1 instrument (min 1 enforced).
  Future<void> removeInstrument(String instrument) async {
    if (state.instruments.length <= 1) return;
    final updated =
        state.instruments.where((i) => i != instrument).toList();
    await _api.updateWatchlist(updated);
    _wsClient.unsubscribePrice(instrument);
    final prices = Map<String, PriceTick>.from(state.prices)
      ..remove(instrument);
    state = state.copyWith(instruments: updated, prices: prices);
  }

  /// Force a full reload from the server.
  Future<void> reload() => _init();

  @override
  void dispose() {
    _priceSub?.cancel();
    super.dispose();
  }
}

/// Global watchlist provider.
///
/// Both [WatchlistApi] and [MarketWsClient] are singletons managed by their
/// own providers, so [WatchlistNotifier] references the same instances across
/// the app lifetime.
final watchlistProvider =
    StateNotifierProvider<WatchlistNotifier, WatchlistState>((ref) {
  final api = ref.watch(watchlistApiProvider);
  final ws = ref.watch(marketWsClientProvider);
  return WatchlistNotifier(api, ws);
});
