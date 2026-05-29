import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../trades/providers/trades_provider.dart';

/// Multi-select widget that lets the user link trades to a journal entry.
///
/// Reads from [tradesProvider] (already initialised on dashboard load)
/// so no additional network call is needed. Calls [onChanged] with the
/// full list of selected trade IDs whenever the selection changes.
class TradeMultiSelect extends ConsumerWidget {
  const TradeMultiSelect({
    super.key,
    required this.selectedIds,
    required this.onChanged,
  });

  /// Currently selected trade IDs (from parent form state).
  final List<String> selectedIds;

  /// Called whenever the selection changes with the updated ID list.
  final ValueChanged<List<String>> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tradesState = ref.watch(tradesProvider);

    if (tradesState.isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: CircularProgressIndicator(),
        ),
      );
    }

    final trades = tradesState.trades;

    if (trades.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: Text(
            'No trades available for the selected account.',
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textMuted,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: trades.length,
      itemBuilder: (_, i) {
        final trade = trades[i];
        final isSelected = selectedIds.contains(trade.id);
        final dateStr =
            DateFormat('MMM dd, HH:mm').format(trade.createdAt.toLocal());
        final dirColor = trade.direction == 'CALL' || trade.direction == 'BUY'
            ? AppColors.accent
            : AppColors.danger;

        return CheckboxListTile(
          value: isSelected,
          onChanged: (checked) {
            final updated = List<String>.from(selectedIds);
            if (checked == true) {
              if (!updated.contains(trade.id)) updated.add(trade.id);
            } else {
              updated.remove(trade.id);
            }
            onChanged(updated);
          },
          dense: true,
          activeColor: AppColors.primary,
          checkColor: AppColors.background,
          side: const BorderSide(color: AppColors.border),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 0, vertical: 0),
          title: Row(
            children: [
              Text(
                trade.instrument,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: dirColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  trade.direction,
                  style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: dirColor,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                dateStr,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
