import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/scanner_filter_state.dart';

/// Horizontally scrollable row of filter chips for the scanner page.
///
/// Renders three groups of chips: pattern types, instruments, and timeframes.
/// Each chip is a toggle — tapping a selected chip clears that dimension;
/// tapping an unselected chip sets it. The special 'All' chip resets every
/// dimension to null.
///
/// No state is held here — [ScannerFilterState] is fully external, managed
/// by [ScannerNotifier] and passed in via [filter] + [onFilterChanged].
class ScannerFilterChips extends StatelessWidget {
  const ScannerFilterChips({
    super.key,
    required this.filter,
    required this.allPatterns,
    required this.allInstruments,
    required this.allTimeframes,
    required this.onFilterChanged,
  });

  final ScannerFilterState filter;

  /// All distinct pattern names in the current result set (e.g. ['Gartley', 'Bat']).
  final List<String> allPatterns;

  /// All distinct instrument strings in the current result set (e.g. ['EUR/USD']).
  final List<String> allInstruments;

  /// All distinct timeframe strings in the current result set (e.g. ['1h', '4h']).
  final List<String> allTimeframes;

  final ValueChanged<ScannerFilterState> onFilterChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          // 'All' chip — resets every dimension
          _buildChip(
            label: 'All',
            selected: filter.isEmpty,
            onSelected: (_) => onFilterChanged(ScannerFilterState.empty),
          ),

          // '★ Saved' chip — additive filter: shows only bookmarked signals.
          // Uses a leading star icon to reinforce the bookmarks concept.
          const SizedBox(width: 6),
          _buildChip(
            label: '★ Saved',
            selected: filter.savedOnly,
            onSelected: (selected) => onFilterChanged(
              filter.copyWith(savedOnly: selected),
            ),
          ),

          if (allPatterns.isNotEmpty) ...[
            const _GroupDivider(),
            ...allPatterns.map(
              (pt) => _buildChip(
                label: pt,
                selected: filter.patternType == pt,
                onSelected: (selected) => onFilterChanged(
                  selected
                      ? filter.copyWith(patternType: pt)
                      : filter.copyWith(patternType: null),
                ),
              ),
            ),
          ],

          if (allInstruments.isNotEmpty) ...[
            const _GroupDivider(),
            ...allInstruments.map(
              (inst) => _buildChip(
                label: inst,
                selected: filter.instrument == inst,
                onSelected: (selected) => onFilterChanged(
                  selected
                      ? filter.copyWith(instrument: inst)
                      : filter.copyWith(instrument: null),
                ),
              ),
            ),
          ],

          if (allTimeframes.isNotEmpty) ...[
            const _GroupDivider(),
            ...allTimeframes.map(
              (tf) => _buildChip(
                label: tf,
                selected: filter.timeframe == tf,
                onSelected: (selected) => onFilterChanged(
                  selected
                      ? filter.copyWith(timeframe: tf)
                      : filter.copyWith(timeframe: null),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChip({
    required String label,
    required bool selected,
    required ValueChanged<bool> onSelected,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: FilterChip(
        label: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            color: selected ? AppColors.background : AppColors.textSecondary,
          ),
        ),
        selected: selected,
        onSelected: onSelected,
        selectedColor: AppColors.primary,
        backgroundColor: AppColors.surfaceLight,
        side: BorderSide(
          color: selected ? AppColors.primary : AppColors.border,
        ),
        checkmarkColor: AppColors.background,
        showCheckmark: false,
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

/// Thin vertical divider between chip groups.
class _GroupDivider extends StatelessWidget {
  const _GroupDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 24,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: AppColors.border,
    );
  }
}
