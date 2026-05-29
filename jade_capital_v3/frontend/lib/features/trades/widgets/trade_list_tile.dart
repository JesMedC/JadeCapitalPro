import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/trades_provider.dart';

/// A single trade row in the history list.
class TradeListTile extends StatelessWidget {
  const TradeListTile({
    super.key,
    required this.trade,
    this.onCloseBinary,
    this.onCloseForex,
    this.onDeleteTrade,
  });

  final Trade trade;
  final void Function(String tradeId, String result)? onCloseBinary;
  final void Function(String tradeId, double exitPrice)? onCloseForex;
  final void Function(String tradeId)? onDeleteTrade;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor;
    final dateStr = DateFormat('MMM dd, HH:mm').format(trade.createdAt);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          // Status indicator bar
          Container(
            width: 4,
            height: 56,
            decoration: BoxDecoration(
              color: statusColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 14),

          // Trade info
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
                    const SizedBox(width: 8),
                    _DirectionBadge(direction: trade.direction),
                    const Spacer(),
                    if (!trade.isOpen)
                      Text(
                        _pnlText,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: trade.isWin
                              ? AppColors.accent
                              : AppColors.danger,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _MetaChip('Invest', '\$${trade.investment.toStringAsFixed(0)}'),
                    const SizedBox(width: 10),
                    if (trade.payout != null)
                      _MetaChip('Payout', '\$${trade.payout!.toStringAsFixed(0)}'),
                    if (trade.entryPrice != null)
                      _MetaChip('Entry', trade.entryPrice!.toStringAsFixed(5)),
                    if (trade.exitPrice != null) ...[
                      const SizedBox(width: 10),
                      _MetaChip('Exit', trade.exitPrice!.toStringAsFixed(5)),
                    ],
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
              ],
            ),
          ),

          // Close button for open trades
          if (trade.isOpen) ...[
            const SizedBox(width: 8),
            if (trade.type == 'binary')
              _BinaryCloseActions(
                tradeId: trade.id,
                onClose: onCloseBinary,
              )
            else
              _ForexCloseAction(
                tradeId: trade.id,
                onClose: onCloseForex,
              ),
          ],
        ],
      ),
    );
  }

  String get _pnlText {
    if (trade.profitLoss == null) return '--';
    final value = trade.profitLoss!;
    final sign = value >= 0 ? '+' : '';
    return '$sign\$${value.toStringAsFixed(2)}';
  }

  Color get _statusColor {
    switch (trade.status) {
      case 'win':
        return AppColors.accent;
      case 'loss':
        return AppColors.danger;
      case 'be':
        return AppColors.warning;
      default:
        return AppColors.primary;
    }
  }
}

class _DirectionBadge extends StatelessWidget {
  const _DirectionBadge({required this.direction});

  final String direction;

  @override
  Widget build(BuildContext context) {
    final color = direction == 'CALL' || direction == 'BUY'
        ? AppColors.accent
        : AppColors.danger;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        direction,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
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

class _BinaryCloseActions extends StatelessWidget {
  const _BinaryCloseActions({required this.tradeId, this.onClose, this.onDelete});

  final String tradeId;
  final void Function(String tradeId, String result)? onClose;
  final void Function(String tradeId)? onDelete;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _MiniButton(
          label: 'WIN',
          color: AppColors.accent,
          onTap: () => onClose?.call(tradeId, 'win'),
        ),
        const SizedBox(height: 3),
        _MiniButton(
          label: 'LOSS',
          color: AppColors.danger,
          onTap: () => onClose?.call(tradeId, 'loss'),
        ),
        const SizedBox(height: 3),
        _MiniButton(
          label: 'BE',
          color: AppColors.warning,
          onTap: () => onClose?.call(tradeId, 'be'),
        ),
        const SizedBox(height: 3),
        _MiniIcon(
          icon: Icons.delete_outline,
          color: AppColors.textMuted,
          onTap: () => onDelete?.call(tradeId),
        ),
      ],
    );
  }
}

class _ForexCloseAction extends StatelessWidget {
  const _ForexCloseAction({required this.tradeId, this.onClose, this.onDelete});

  final String tradeId;
  final void Function(String tradeId, double exitPrice)? onClose;
  final void Function(String tradeId)? onDelete;

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
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancel',
                style: GoogleFonts.inter(color: AppColors.textMuted)),
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
            ),
            child: Text('Close',
                style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    color: AppColors.background)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _MiniButton(
          label: 'X',
          color: AppColors.danger,
          onTap: () => _showExitDialog(context),
        ),
        const SizedBox(height: 3),
        _MiniIcon(
          icon: Icons.delete_outline,
          color: AppColors.textMuted,
          onTap: () => onDelete?.call(tradeId),
        ),
      ],
    );
  }
}

class _MiniButton extends StatelessWidget {
  const _MiniButton({
    required this.label,
    required this.color,
    this.onTap,
  });

  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ),
    );
  }
}

class _MiniIcon extends StatelessWidget {
  const _MiniIcon({
    required this.icon,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Icon(
          icon,
          size: 14,
          color: color,
        ),
      ),
    );
  }
}
