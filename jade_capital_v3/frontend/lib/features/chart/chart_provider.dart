import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/chart_api.dart';
import '../../core/network/providers.dart';
import '../scanner/models/scanner_result.dart';

// ── Constants ────────────────────────────────────────────────────────────────

/// All valid instrument values for the chart selector.
const kValidInstruments = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'NZD/USD',
  'USD/CHF',
  'BTC/USD',
];

/// All valid timeframe values for the chart selector.
const kValidTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

// ── State model ──────────────────────────────────────────────────────────────

/// Immutable state for the chart preferences Riverpod notifier.
class ChartPreferencesState {
  const ChartPreferencesState({
    this.instrument = 'EUR/USD',
    this.timeframe = '5m',
    this.isLoading = false,
    this.errorMessage,
    this.activeOverlay,
    this.showOverlay = false,
  });

  /// Selected trading instrument in internal format (e.g. "EUR/USD").
  final String instrument;

  /// Selected timeframe in internal format (e.g. "5m").
  final String timeframe;

  /// True while the initial server fetch is in-flight.
  final bool isLoading;

  /// Non-null when an error occurred during the initial server fetch.
  /// Null when no error (or after a successful load).
  final String? errorMessage;

  /// The scanner result currently shown in the overlay panel.
  ///
  /// Session-scoped — never persisted to the server. Set via [ChartPreferencesNotifier.setOverlay].
  final ScannerResult? activeOverlay;

  /// Whether the overlay panel is currently expanded (visible).
  ///
  /// Session-scoped — never persisted to the server. Toggled via
  /// [ChartPreferencesNotifier.toggleOverlay].
  final bool showOverlay;

  ChartPreferencesState copyWith({
    String? instrument,
    String? timeframe,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    ScannerResult? activeOverlay,
    bool? showOverlay,
    bool clearOverlay = false,
  }) =>
      ChartPreferencesState(
        instrument: instrument ?? this.instrument,
        timeframe: timeframe ?? this.timeframe,
        isLoading: isLoading ?? this.isLoading,
        errorMessage:
            clearError ? null : (errorMessage ?? this.errorMessage),
        activeOverlay: clearOverlay ? null : (activeOverlay ?? this.activeOverlay),
        showOverlay: showOverlay ?? this.showOverlay,
      );
}

// ── StateNotifier ────────────────────────────────────────────────────────────

/// Manages the user's chart preferences (instrument + timeframe).
///
/// Matches the [TradesNotifier] / [DashboardNotifier] StateNotifier pattern
/// used throughout this project.
class ChartPreferencesNotifier
    extends StateNotifier<ChartPreferencesState> {
  ChartPreferencesNotifier({required ChartApi chartApi})
      : _chartApi = chartApi,
        super(const ChartPreferencesState(isLoading: true));

  final ChartApi _chartApi;

  /// Load preferences from the server.
  ///
  /// Called from [ChartPage.initState]. Falls back to defaults silently
  /// on any network or server error (spec AC-05).
  Future<void> loadFromServer() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final prefs = await _chartApi.getPreferences();
      state = state.copyWith(
        instrument: prefs.instrument,
        timeframe: prefs.timeframe,
        isLoading: false,
        clearError: true,
      );
    } catch (e) {
      debugPrint('[ChartPreferencesNotifier] loadFromServer error: $e');
      // Silent fallback to defaults — do NOT surface the error to the user.
      state = state.copyWith(isLoading: false, clearError: true);
    }
  }

  /// Update the selected instrument.
  ///
  /// State is updated immediately (optimistic). The API call is fire-and-forget;
  /// failures are logged but do not roll back the in-memory state.
  void setInstrument(String instrument) {
    if (state.instrument == instrument) return;
    state = state.copyWith(instrument: instrument);
    _persistAsync();
  }

  /// Update the selected timeframe.
  ///
  /// Same fire-and-forget pattern as [setInstrument].
  void setTimeframe(String timeframe) {
    if (state.timeframe == timeframe) return;
    state = state.copyWith(timeframe: timeframe);
    _persistAsync();
  }

  /// Set a scanner result as the active overlay.
  ///
  /// Atomic: updates both [ChartPreferencesState.activeOverlay] and
  /// [ChartPreferencesState.showOverlay] in a single state emission.
  /// Does NOT call [_persistAsync] — overlay is session-scoped only.
  void setOverlay(ScannerResult result) {
    state = state.copyWith(activeOverlay: result, showOverlay: true);
  }

  /// Clear the active overlay and hide the panel.
  ///
  /// Atomic: clears both [ChartPreferencesState.activeOverlay] and
  /// [ChartPreferencesState.showOverlay] in one emission.
  void clearOverlay() {
    state = state.copyWith(clearOverlay: true, showOverlay: false);
  }

  /// Toggle the overlay panel visibility.
  ///
  /// No-op when [ChartPreferencesState.activeOverlay] is null (nothing to show).
  void toggleOverlay() {
    if (state.activeOverlay == null) return;
    state = state.copyWith(showOverlay: !state.showOverlay);
  }

  /// Internal: persist current state to the server in the background.
  void _persistAsync() {
    _chartApi
        .updatePreferences(
          instrument: state.instrument,
          timeframe: state.timeframe,
        )
        .catchError((Object e) {
      debugPrint('[ChartPreferencesNotifier] persist error: $e');
    });
  }
}

// ── Provider declaration ─────────────────────────────────────────────────────

/// Riverpod provider for chart preferences.
///
/// Follows the [tradesProvider] / [dashboardProvider] declaration style.
final chartPreferencesProvider =
    StateNotifierProvider<ChartPreferencesNotifier, ChartPreferencesState>(
        (ref) {
  final api = ref.watch(apiClientProvider);
  return ChartPreferencesNotifier(chartApi: ChartApi(api));
});
