import 'price_tick.dart';

/// Load status for the watchlist feature.
enum WatchlistLoadStatus { initial, loading, loaded, error }

/// Immutable value object holding all watchlist state.
///
/// Combines the instrument list and live price map in a single state object
/// so that [WatchlistPage] and [AddRemoveInstrumentSheet] never disagree
/// about the current list size.
class WatchlistState {
  const WatchlistState({
    this.status = WatchlistLoadStatus.initial,
    this.instruments = const [],
    this.prices = const {},
    this.error,
  });

  final WatchlistLoadStatus status;

  /// Ordered list of watched instrument symbols, e.g. ['EUR/USD', 'GBP/USD'].
  final List<String> instruments;

  /// Latest [PriceTick] keyed by instrument symbol.
  ///
  /// A key is absent until the first tick arrives for that instrument.
  final Map<String, PriceTick> prices;

  /// Error message when [status] is [WatchlistLoadStatus.error].
  final String? error;

  bool get isLoading => status == WatchlistLoadStatus.loading;
  bool get isLoaded => status == WatchlistLoadStatus.loaded;
  bool get hasError => status == WatchlistLoadStatus.error;

  WatchlistState copyWith({
    WatchlistLoadStatus? status,
    List<String>? instruments,
    Map<String, PriceTick>? prices,
    String? error,
  }) =>
      WatchlistState(
        status: status ?? this.status,
        instruments: instruments ?? this.instruments,
        prices: prices ?? this.prices,
        error: error,
      );
}
