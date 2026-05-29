import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/dashboard_provider.dart';

/// List of open trades (binary + forex) with close buttons.
class OpenTradesList extends StatelessWidget {
  const OpenTradesList({
    super.key,
    required this.trades,
    this.onCloseBinary,
    this.onCloseForex,
    this.semanticLabel = 'Open trades',
  });

  final List<OpenTrade> trades;
  final void Function(String tradeId, String result)? onCloseBinary;
  final void Function(String tradeId, double exitPrice)? onCloseForex;

  /// Screen-reader accessible label for the entire list.
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Open Trades',
                style: GoogleFonts.orbitron(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${trades.length}',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (trades.isEmpty)
            _EmptyPlaceholder()
          else
            Semantics(
              label: semanticLabel,
              child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: trades.length,
                separatorBuilder: (_, __) =>
                    Divider(height: 1, color: AppColors.border.withValues(alpha: 0.5)),
                itemBuilder: (context, index) {
                  return _OpenTradeTile(
                    trade: trades[index],
                    onCloseBinary: onCloseBinary,
                    onCloseForex: onCloseForex,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.check_circle_outline,
                size: 32, color: AppColors.textMuted),
            const SizedBox(height: 8),
            Text(
              'No open trades',
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenTradeTile extends StatelessWidget {
  const _OpenTradeTile({
    required this.trade,
    this.onCloseBinary,
    this.onCloseForex,
  });

  final OpenTrade trade;
  final void Function(String tradeId, String result)? onCloseBinary;
  final void Function(String tradeId, double exitPrice)? onCloseForex;

  bool get isBinary => trade.type == 'binary';

  @override
  Widget build(BuildContext context) {
    final dirColor = trade.direction == 'CALL' || trade.direction == 'BUY'
        ? AppColors.accent
        : AppColors.danger;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          // Direction indicator
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: dirColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(
              child: Text(
                trade.direction == 'CALL' || trade.direction == 'BUY'
                    ? '↑'
                    : '↓',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: dirColor,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Instrument + details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      trade.instrument,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: dirColor.withValues(alpha: 0.15),
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
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _detailChip(
                      'Invest',
                      '\$${trade.investment.toStringAsFixed(0)}',
                    ),
                    const SizedBox(width: 8),
                    if (isBinary && trade.payoutPct != null)
                      _detailChip(
                        'Payout',
                        '${trade.payoutPct!.toInt()}%',
                      ),
                    if (!isBinary && trade.entryPrice != null)
                      _detailChip(
                        'Entry',
                        trade.entryPrice!.toStringAsFixed(5),
                      ),
                    const SizedBox(width: 8),
                    _detailChip(
                      'Type',
                      isBinary ? 'Binary' : 'Forex',
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Close buttons
          if (isBinary)
            _BinaryCloseButtons(
              tradeId: trade.id,
              onClose: onCloseBinary,
            )
          else
            _ForexCloseButton(
              tradeId: trade.id,
              onClose: onCloseForex,
            ),
        ],
      ),
    );
  }

  Widget _detailChip(String label, String value) {
    return RichText(
      text: TextSpan(
        children: [
          TextSpan(
            text: '$label ',
            style: GoogleFonts.inter(
              fontSize: 10,
              color: AppColors.textMuted,
            ),
          ),
          TextSpan(
            text: value,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _BinaryCloseButtons extends StatelessWidget {
  const _BinaryCloseButtons({required this.tradeId, this.onClose});

  final String tradeId;
  final void Function(String tradeId, String result)? onClose;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _SmallActionButton(
          label: 'WIN',
          color: AppColors.accent,
          onPressed: () => onClose?.call(tradeId, 'win'),
        ),
        const SizedBox(width: 4),
        _SmallActionButton(
          label: 'LOSS',
          color: AppColors.danger,
          onPressed: () => onClose?.call(tradeId, 'loss'),
        ),
        const SizedBox(width: 4),
        _SmallActionButton(
          label: 'BE',
          color: AppColors.warning,
          onPressed: () => onClose?.call(tradeId, 'be'),
        ),
      ],
    );
  }
}

class _ForexCloseButton extends StatelessWidget {
  const _ForexCloseButton({required this.tradeId, this.onClose});

  final String tradeId;
  final void Function(String tradeId, double exitPrice)? onClose;

  void _showExitDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        title: Text(
          'Close Forex Trade',
          style: GoogleFonts.orbitron(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: GoogleFonts.jetBrainsMono(color: AppColors.textPrimary),
          decoration: InputDecoration(
            labelText: 'Exit Price',
            labelStyle: GoogleFonts.inter(color: AppColors.textSecondary),
            hintText: '0.00000',
            hintStyle: GoogleFonts.jetBrainsMono(color: AppColors.textMuted),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(color: AppColors.textMuted),
            ),
          ),
          ElevatedButton(
            onPressed: () {
              final price = double.tryParse(controller.text);
              if (price != null && price > 0) {
                Navigator.of(ctx).pop();
                onClose?.call(tradeId, price);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              'Close',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                color: AppColors.background,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _SmallActionButton(
      label: 'X',
      color: AppColors.danger,
      onPressed: () => _showExitDialog(context),
    );
  }
}

class _SmallActionButton extends StatelessWidget {
  const _SmallActionButton({
    required this.label,
    required this.color,
    this.onPressed,
  });

  final String label;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(4),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ),
      ),
    );
  }
}
