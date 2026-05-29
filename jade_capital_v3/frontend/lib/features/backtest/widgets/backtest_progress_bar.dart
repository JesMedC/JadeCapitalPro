import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';

/// Progress bar widget for a running backtest session.
///
/// Displays a [LinearProgressIndicator] driven by [percent] (0–100) with
/// a two-column header row: [processedLabel] on the left and the percentage
/// string on the right.
///
/// This widget is stateless — the parent ([_BacktestResultPageState]) owns
/// the [StreamSubscription] and calls [setState] to update [percent] and
/// [processedLabel] on each incoming `backtest:progress` WS event.
class BacktestProgressBar extends StatelessWidget {
  const BacktestProgressBar({
    super.key,
    required this.percent,
    required this.processedLabel,
  });

  /// Completion percentage, 0–100.
  final int percent;

  /// Human-readable progress label, e.g. `"42 / 98 candles"`.
  final String processedLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              processedLabel,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
            Text(
              '$percent%',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: percent / 100.0,
          backgroundColor: AppColors.border,
          valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
          borderRadius: BorderRadius.circular(4),
        ),
      ],
    );
  }
}
