import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import 'tradingview_chart_controller.dart';

/// Web fallback — TradingView WebView is not available on Flutter web.
///
/// Accepts the same constructor signature as the native widget so that
/// [TradingViewChart] can pass through [symbol] and [interval] without
/// platform-conditional code. No WebView, no URL loading — display only.
class TradingViewPlatformWidget extends StatelessWidget {
  const TradingViewPlatformWidget({
    super.key,
    required this.symbol,
    this.controller,
    this.interval = '5',
  });

  /// Instrument in internal format (e.g. "EUR/USD") — for display only.
  final String symbol;

  /// Timeframe in internal format (e.g. "5m") — for display only.
  final String interval;

  /// Controller is accepted but ignored on web (no WebView to control).
  final TradingViewChartController? controller;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.background,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.show_chart, size: 64, color: AppColors.primary),
            const SizedBox(height: 16),
            Text(
              symbol,
              style: GoogleFonts.orbitron(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              interval,
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'TradingView charting is available on\nmobile and desktop apps.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
