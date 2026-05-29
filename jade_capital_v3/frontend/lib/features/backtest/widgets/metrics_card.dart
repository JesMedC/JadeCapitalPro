import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';

/// Reusable metric display card for the backtest result page.
///
/// Renders a single named metric with a formatted numeric value and optional
/// unit label. Matches the visual language of the existing dashboard cards.
///
/// `profitFactor` sentinel: pass [isInfinity] = true when the raw value is
/// `9999` (the backend's JSON-safe sentinel for Infinity) and this widget
/// will display `"∞"` instead of the numeric value.
class MetricsCard extends StatelessWidget {
  const MetricsCard({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    this.valueColor,
    this.isInfinity = false,
  });

  final String label;

  /// Numeric value to display. Ignored when [isInfinity] is true.
  final double value;

  /// Optional unit suffix, e.g. `'%'` or `'pts'`.
  final String? unit;

  /// Override the value text color (defaults to [AppColors.primary]).
  final Color? valueColor;

  /// When true, displays `"∞"` instead of the formatted [value].
  /// Use this when `profitFactor == 9999` (Infinity sentinel).
  final bool isInfinity;

  @override
  Widget build(BuildContext context) {
    final displayValue = isInfinity ? '∞' : _format(value);
    final effectiveColor = valueColor ?? AppColors.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                displayValue,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: effectiveColor,
                ),
              ),
              if (unit != null && !isInfinity) ...[
                const SizedBox(width: 3),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    unit!,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// Format [v] to at most 2 decimal places, stripping trailing zeros.
  static String _format(double v) {
    if (v == v.truncateToDouble()) return v.truncate().toString();
    return v.toStringAsFixed(2);
  }
}
