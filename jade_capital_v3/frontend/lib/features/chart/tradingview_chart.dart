import 'package:flutter/material.dart';

import 'tradingview_chart_controller.dart';
import 'tradingview_chart_native.dart'
    if (dart.library.html) 'tradingview_chart_web.dart';

/// Platform-aware TradingView chart widget.
///
/// On mobile/desktop: renders via WebView with real charts.
/// On web: shows a fallback message (WebView not available).
class TradingViewChart extends StatelessWidget {
  const TradingViewChart({
    super.key,
    required this.symbol,
    this.controller,
    this.interval = '5',
  });

  /// Instrument in internal format (e.g. "EUR/USD").
  final String symbol;

  /// Timeframe in internal format (e.g. "5m").
  ///
  /// Passed through to [TradingViewPlatformWidget] for both native loading
  /// and web-fallback display.
  final String interval;

  /// Optional external controller for programmatic reload (native only).
  final TradingViewChartController? controller;

  @override
  Widget build(BuildContext context) {
    return TradingViewPlatformWidget(
      symbol: symbol,
      controller: controller,
      interval: interval,
    );
  }
}
