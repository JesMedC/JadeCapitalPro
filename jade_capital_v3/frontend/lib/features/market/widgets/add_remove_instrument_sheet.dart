import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/watchlist_provider.dart';

/// Full catalog of tradeable instruments — must match backend [VALID_INSTRUMENTS].
const List<String> kAllInstruments = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'NZD/USD',
  'USD/CHF',
  'BTC/USD',
];

/// Bottom sheet for managing the watchlist instrument selection.
///
/// Displays all [kAllInstruments] (10) as a scrollable list.
/// Each row shows a checkmark when the instrument is in the watchlist.
/// Rows are disabled (greyed out + no tap) when:
///   - The watchlist is at capacity (10 instruments) and the row is unselected.
///   - The instrument is the last one in the watchlist (min 1 enforced).
class AddRemoveInstrumentSheet extends ConsumerWidget {
  const AddRemoveInstrumentSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final watchlist = ref.watch(watchlistProvider);
    final selected = watchlist.instruments;
    final isFull = selected.length >= 10;
    final isLastItem = selected.length == 1;

    return Container(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 32),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                const Icon(Icons.star_outline, color: AppColors.primary, size: 22),
                const SizedBox(width: 10),
                Text(
                  'Manage Watchlist',
                  style: GoogleFonts.orbitron(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  color: AppColors.textSecondary,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          // Capacity hint
          if (isFull)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Text(
                'Watchlist is full (max 10). Remove an instrument to add another.',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.warning,
                ),
              ),
            )
          else
            const SizedBox(height: 4),

          const Divider(color: AppColors.border, height: 1),

          // Instrument list
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.55,
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: kAllInstruments.length,
              separatorBuilder: (_, __) =>
                  const Divider(color: AppColors.border, height: 1),
              itemBuilder: (context, index) {
                final symbol = kAllInstruments[index];
                final isSelected = selected.contains(symbol);
                final isLastSelected = isSelected && isLastItem;

                // Disable: full + unselected, OR last item
                final isDisabled =
                    (!isSelected && isFull) || isLastSelected;

                return _InstrumentTile(
                  symbol: symbol,
                  isSelected: isSelected,
                  isDisabled: isDisabled,
                  isLastSelected: isLastSelected,
                  onTap: isDisabled
                      ? null
                      : () async {
                          final notifier =
                              ref.read(watchlistProvider.notifier);
                          if (isSelected) {
                            await notifier.removeInstrument(symbol);
                          } else {
                            await notifier.addInstrument(symbol);
                          }
                        },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _InstrumentTile extends StatelessWidget {
  const _InstrumentTile({
    required this.symbol,
    required this.isSelected,
    required this.isDisabled,
    required this.isLastSelected,
    required this.onTap,
  });

  final String symbol;
  final bool isSelected;
  final bool isDisabled;
  final bool isLastSelected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final textColor = isDisabled ? AppColors.textMuted : AppColors.textPrimary;

    return ListTile(
      onTap: onTap,
      enabled: !isDisabled,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
      title: Text(
        symbol,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: textColor,
        ),
      ),
      subtitle: isLastSelected
          ? Text(
              'Cannot remove last instrument',
              style: GoogleFonts.inter(
                fontSize: 11,
                color: AppColors.warning,
              ),
            )
          : null,
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: AppColors.accent, size: 22)
          : Icon(
              Icons.radio_button_unchecked,
              color: isDisabled ? AppColors.textMuted : AppColors.textSecondary,
              size: 22,
            ),
    );
  }
}
