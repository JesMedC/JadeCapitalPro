import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';
import '../chart_provider.dart';

/// Horizontal scrollable row of [FilterChip]s for selecting a trading instrument.
///
/// Displays all [kValidInstruments]. The currently active instrument is
/// highlighted with the [AppColors.primary] fill. Tapping a chip fires
/// [onInstrumentSelected] with the chosen value.
class InstrumentSelectorWidget extends StatelessWidget {
  const InstrumentSelectorWidget({
    super.key,
    required this.activeInstrument,
    required this.onInstrumentSelected,
  });

  /// The currently active instrument in internal format (e.g. "EUR/USD").
  final String activeInstrument;

  /// Callback fired when the user selects a different instrument.
  final ValueChanged<String> onInstrumentSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: kValidInstruments.map((instrument) {
            final isActive = instrument == activeInstrument;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(
                  instrument,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight:
                        isActive ? FontWeight.w600 : FontWeight.w400,
                    color: isActive
                        ? AppColors.background
                        : AppColors.textSecondary,
                  ),
                ),
                selected: isActive,
                onSelected: (_) {
                  if (!isActive) onInstrumentSelected(instrument);
                },
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.surfaceLight,
                checkmarkColor: AppColors.background,
                showCheckmark: false,
                side: BorderSide(
                  color: isActive ? AppColors.primary : AppColors.border,
                  width: 1,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
