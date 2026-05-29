import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../models/economic_event.dart';

/// A single row in the economic calendar list.
///
/// Displays: impact color bar, local time, currency chip, event name, and
/// verbatim detail text. The detail string is rendered as-is — no parsing
/// or transformation is applied.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event});

  final EconomicEvent event;

  Color get _impactColor {
    switch (event.impact) {
      case ImpactLevel.high:
        return AppColors.danger; // #FF4757
      case ImpactLevel.medium:
        return AppColors.warning; // #FFB800
      case ImpactLevel.low:
        return AppColors.textMuted; // #64748B
    }
  }

  @override
  Widget build(BuildContext context) {
    final localTime = event.timestamp.toLocal();
    final timeLabel = DateFormat('HH:mm').format(localTime);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Impact color bar
          Container(
            width: 4,
            height: 48,
            decoration: BoxDecoration(
              color: _impactColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          // Time
          SizedBox(
            width: 40,
            child: Text(
              timeLabel,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Currency chip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              event.currency,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Event name + verbatim detail
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.event,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  event.detail,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
