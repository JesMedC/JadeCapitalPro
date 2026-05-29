import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';
import '../chart_provider.dart';

/// Compact row of [TextButton]s for selecting a chart timeframe.
///
/// Renders all [kValidTimeframes] as labelled buttons. The active one is
/// highlighted with the [AppColors.primary] colour and an underline indicator.
/// Tapping a button fires [onTimeframeSelected] with the chosen value.
class TimeframeSelectorWidget extends StatelessWidget {
  const TimeframeSelectorWidget({
    super.key,
    required this.activeTimeframe,
    required this.onTimeframeSelected,
  });

  /// The currently active timeframe in internal format (e.g. "5m").
  final String activeTimeframe;

  /// Callback fired when the user selects a different timeframe.
  final ValueChanged<String> onTimeframeSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: kValidTimeframes.map((tf) {
          final isActive = tf == activeTimeframe;
          return _TimeframeButton(
            label: tf,
            isActive: isActive,
            onTap: () => onTimeframeSelected(tf),
          );
        }).toList(),
      ),
    );
  }
}

class _TimeframeButton extends StatelessWidget {
  const _TimeframeButton({
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final String label;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primary.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: isActive
              ? Border.all(color: AppColors.primary, width: 1)
              : Border.all(color: Colors.transparent),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
            color: isActive ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
