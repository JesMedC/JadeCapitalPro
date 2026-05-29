import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';

/// Card displaying account balance with name, market type, and currency.
class BalanceCard extends StatelessWidget {
  const BalanceCard({
    super.key,
    required this.accountName,
    required this.balance,
    required this.currency,
    required this.marketType,
  });

  /// Human-readable account name.
  final String accountName;

  /// Current balance value.
  final double balance;

  /// Currency code (e.g. USD, EUR).
  final String currency;

  /// Market type: 'binary', 'forex', or 'both'.
  final String marketType;

  String get _formattedBalance {
    if (balance >= 1000) {
      return '\$${balance.toStringAsFixed(0)}';
    }
    return '\$${balance.toStringAsFixed(2)}';
  }

  IconData get _marketIcon {
    switch (marketType) {
      case 'forex':
        return Icons.show_chart;
      case 'both':
        return Icons.account_balance_wallet;
      case 'all':
        return Icons.auto_graph;
      default:
        return Icons.bar_chart;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPositive = balance >= 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.surface,
            AppColors.cardBackground,
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Account name + market type badge
          Row(
            children: [
              Icon(_marketIcon, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  accountName,
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  marketType.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Balance
          Text(
            _formattedBalance,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 34,
              fontWeight: FontWeight.w700,
              color: isPositive ? AppColors.accent : AppColors.danger,
            ),
          ),
          const SizedBox(height: 4),

          // Currency
          Row(
            children: [
              Text(
                currency,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textMuted,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                isPositive ? Icons.trending_up : Icons.trending_down,
                size: 14,
                color: isPositive ? AppColors.accent : AppColors.danger,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
