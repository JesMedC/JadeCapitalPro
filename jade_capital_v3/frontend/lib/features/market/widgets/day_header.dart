import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';

/// Sticky day separator for the economic calendar.
///
/// Renders a formatted date label (e.g. "Fri, May 23") in the Orbitron font
/// with [AppColors.primary] color, used as a [SliverPersistentHeader] child
/// to keep the current day pinned while scrolling.
class DayHeader extends StatelessWidget {
  const DayHeader({super.key, required this.date});

  /// Local-timezone calendar date. The time portion is ignored.
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final label = DateFormat('EEE, MMM d').format(date);
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        label,
        style: GoogleFonts.orbitron(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.primary,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
