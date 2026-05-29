import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/theme/app_theme.dart';
import 'tradingview_chart_controller.dart';

// ── Mapping tables ───────────────────────────────────────────────────────────

/// Maps internal instrument format → TradingView symbol parameter.
///
/// Fallback: strips the '/' and uppercases (e.g. "XAU/USD" → "XAUUSD").
const _kSymbolMap = <String, String>{
  'EUR/USD': 'FX:EURUSD',
  'GBP/USD': 'FX:GBPUSD',
  'USD/JPY': 'FX:USDJPY',
  'AUD/USD': 'FX:AUDUSD',
  'USD/CAD': 'FX:USDCAD',
  'EUR/JPY': 'FX:EURJPY',
  'GBP/JPY': 'FX:GBPJPY',
  'NZD/USD': 'FX:NZDUSD',
  'USD/CHF': 'FX:USDCHF',
  'BTC/USD': 'BINANCE:BTCUSDT',
};

/// Maps internal timeframe format → TradingView interval parameter.
///
/// Fallback: 'D' (daily) — safe default for unknown values.
const _kIntervalMap = <String, String>{
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

/// Convert an internal instrument string (e.g. "EUR/USD") to a TradingView
/// symbol string (e.g. "FX:EURUSD"). Never throws.
String toTVSymbol(String instrument) =>
    _kSymbolMap[instrument] ?? instrument.replaceAll('/', '').toUpperCase();

/// Convert an internal timeframe string (e.g. "5m") to a TradingView interval
/// string (e.g. "5"). Never throws — returns 'D' for unknown values.
String toTVInterval(String timeframe) => _kIntervalMap[timeframe] ?? 'D';

// ── Widget ───────────────────────────────────────────────────────────────────

/// Mobile/desktop implementation using WebView.
class TradingViewPlatformWidget extends StatefulWidget {
  const TradingViewPlatformWidget({
    super.key,
    required this.symbol,
    this.controller,
    this.interval = '5',
  });

  /// Instrument in internal format (e.g. "EUR/USD").
  ///
  /// Converted to a TradingView symbol via [toTVSymbol] before loading.
  final String symbol;

  /// Optional external controller for programmatic reload / URL update.
  final TradingViewChartController? controller;

  /// Timeframe in internal format (e.g. "5m").
  ///
  /// Converted to a TradingView interval via [toTVInterval] before loading.
  final String interval;

  @override
  State<TradingViewPlatformWidget> createState() =>
      _TradingViewPlatformWidgetState();
}

class _TradingViewPlatformWidgetState
    extends State<TradingViewPlatformWidget> {
  late final WebViewController _webController;

  /// Whether the loading overlay is currently visible.
  bool _isOverlayVisible = false;

  /// Tracks whether the initial page load has completed.
  ///
  /// Used to suppress the overlay during the very first load (spec: overlay
  /// should appear only on subsequent user-triggered reloads, not on page init).
  bool _initialLoadDone = false;

  @override
  void initState() {
    super.initState();

    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.background)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) {
          // Only show overlay for user-triggered reloads, not the initial load.
          if (_initialLoadDone) {
            setState(() => _isOverlayVisible = true);
          }
        },
        onPageFinished: (_) {
          setState(() {
            _isOverlayVisible = false;
            _initialLoadDone = true;
          });
        },
      ))
      ..loadRequest(_buildUri(
        symbol: widget.symbol,
        interval: widget.interval,
      ));

    // Wire up controller callbacks.
    widget.controller?.reloadCallback = () {
      setState(() => _isOverlayVisible = true);
      _webController.reload();
    };

    widget.controller?.updateUrlCallback = (uri) {
      setState(() => _isOverlayVisible = true);
      _webController.loadRequest(uri);
    };
  }

  /// Builds the TradingView embed URI from an instrument + timeframe pair.
  Uri _buildUri({required String symbol, required String interval}) {
    return Uri.parse(
      'https://s.tradingview.com/widgetembed/?'
      'symbol=${Uri.encodeComponent(toTVSymbol(symbol))}'
      '&interval=${Uri.encodeComponent(toTVInterval(interval))}'
      '&theme=dark'
      '&style=1'
      '&hide_top_toolbar=false'
      '&hide_side_toolbar=false'
      '&studies=[]'
      '&locale=en',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _webController),

        // Loading overlay — semi-transparent, shown only during URL updates.
        if (_isOverlayVisible)
          AnimatedOpacity(
            opacity: _isOverlayVisible ? 0.7 : 0.0,
            duration: const Duration(milliseconds: 200),
            child: Container(
              color: AppColors.background,
              child: const Center(
                child: CircularProgressIndicator(
                  color: AppColors.primary,
                  strokeWidth: 2.5,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
