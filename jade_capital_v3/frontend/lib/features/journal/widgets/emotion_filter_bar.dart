import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/journal_entry.dart';
import '../providers/journal_provider.dart';

/// Maps each [EmotionTag] to its design-token colour.
Color emotionColor(EmotionTag tag) => switch (tag) {
      EmotionTag.happy => const Color(0xFF00E5A0), // accent green
      EmotionTag.frustrated => const Color(0xFFFF4757), // danger red
      EmotionTag.confident => const Color(0xFF00D4FF), // primary cyan
      EmotionTag.anxious => const Color(0xFFFFB800), // warning amber
      EmotionTag.calm => const Color(0xFF6C63FF), // indigo
      EmotionTag.greedy => const Color(0xFFFF6B35), // orange
      EmotionTag.fearful => const Color(0xFF94A3B8), // muted slate
    };

/// Horizontally-scrollable row of filter chips: "All" + one per emotion.
///
/// Calls [journalProvider.notifier].applyFilter on selection.
/// Optional [onSelect] fires after the provider call — use it to sync
/// companion UI state (e.g. a [StateProvider] for selected chip tracking).
class EmotionFilterBar extends ConsumerWidget {
  const EmotionFilterBar({
    super.key,
    required this.activeEmotion,
    this.onSelect,
  });

  /// Currently active filter (null = "All" selected).
  final EmotionTag? activeEmotion;

  /// Optional callback fired after [journalProvider.notifier.applyFilter].
  final ValueChanged<EmotionTag?>? onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void select(EmotionTag? tag) {
      ref.read(journalProvider.notifier).applyFilter(tag);
      onSelect?.call(tag);
    }

    return SizedBox(
      height: 44,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            // "All" chip
            _EmotionChip(
              label: 'All',
              color: AppColors.primary,
              isSelected: activeEmotion == null,
              onSelected: (_) => select(null),
            ),
            const SizedBox(width: 8),
            // One chip per emotion
            ...EmotionTag.values.map((tag) {
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _EmotionChip(
                  label: tag.label,
                  color: emotionColor(tag),
                  isSelected: activeEmotion == tag,
                  onSelected: (_) => select(tag),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _EmotionChip extends StatelessWidget {
  const _EmotionChip({
    required this.label,
    required this.color,
    required this.isSelected,
    required this.onSelected,
  });

  final String label;
  final Color color;
  final bool isSelected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          color: isSelected ? AppColors.background : color,
        ),
      ),
      selected: isSelected,
      onSelected: onSelected,
      backgroundColor: color.withValues(alpha: 0.15),
      selectedColor: color,
      checkmarkColor: AppColors.background,
      showCheckmark: false,
      side: BorderSide(color: color.withValues(alpha: 0.4)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );
  }
}
