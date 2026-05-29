import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../models/journal_entry.dart';
import 'emotion_filter_bar.dart';

/// Card that renders a single journal entry in the list.
///
/// Mirrors [TradeListTile] structure: dark card container, title + date,
/// emotion chip, and a content preview as plain [Text] (no flutter_markdown).
class JournalEntryCard extends StatelessWidget {
  const JournalEntryCard({
    super.key,
    required this.entry,
    this.onTap,
  });

  final JournalEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dateStr =
        DateFormat('MMM dd, yyyy').format(entry.createdAt.toLocal());
    final preview = entry.contentPreview();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Row 1: Title + emotion chip ──
            Row(
              children: [
                Expanded(
                  child: Text(
                    entry.title,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (entry.emotion != null) ...[
                  const SizedBox(width: 8),
                  _EmotionBadge(emotion: entry.emotion!),
                ],
              ],
            ),

            // ── Row 2: Content preview ──
            if (preview != null) ...[
              const SizedBox(height: 6),
              Text(
                preview,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                softWrap: true,
              ),
            ],

            // ── Row 3: Date + trade count ──
            const SizedBox(height: 8),
            Row(
              children: [
                 const Icon(Icons.calendar_today_outlined,
                    size: 11, color: AppColors.textMuted),
                const SizedBox(width: 4),
                Text(
                  dateStr,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
                if (entry.tradeIds != null &&
                    entry.tradeIds!.isNotEmpty) ...[
                  const SizedBox(width: 12),
                  const Icon(Icons.link, size: 11, color: AppColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    '${entry.tradeIds!.length} trade${entry.tradeIds!.length == 1 ? '' : 's'}',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Small colour-coded emotion badge.
class _EmotionBadge extends StatelessWidget {
  const _EmotionBadge({required this.emotion});

  final EmotionTag emotion;

  @override
  Widget build(BuildContext context) {
    final color = emotionColor(emotion);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        emotion.label,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
