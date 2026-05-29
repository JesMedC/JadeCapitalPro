import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/dashboard_provider.dart';

/// Row of KPI cards: P&L Total, Win Rate, Wins, Losses, Profit Factor.
class StatsRow extends StatelessWidget {
  const StatsRow({super.key, required this.overall});

  final OverallStats overall;

  @override
  Widget build(BuildContext context) {
    final pnlTotal = overall.totalWins * overall.avgWin - overall.totalLosses * overall.avgLoss;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'P&L Total',
                value: _formatPnl(pnlTotal),
                isPositive: pnlTotal >= 0,
                icon: Icons.account_balance_wallet_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                label: 'Win Rate',
                value: '${(overall.winRate * 100).toStringAsFixed(0)}%',
                isPositive: overall.winRate >= 0.5,
                icon: Icons.emoji_events_outlined,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                label: 'Closed',
                value: '${overall.totalClosed}',
                isPositive: true,
                icon: Icons.history,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Wins',
                value: '${overall.totalWins}',
                isPositive: true,
                icon: Icons.check_circle_outline,
                valueColor: AppColors.accent,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                label: 'Losses',
                value: '${overall.totalLosses}',
                isPositive: false,
                icon: Icons.cancel_outlined,
                valueColor: AppColors.danger,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                label: 'Profit Factor',
                value: overall.profitFactor.toStringAsFixed(2),
                isPositive: overall.profitFactor >= 1,
                icon: Icons.trending_up_outlined,
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _formatPnl(double value) {
    final sign = value >= 0 ? '+' : '';
    final abs = value.abs();
    if (abs >= 1000) return '$sign\$${abs.toStringAsFixed(0)}';
    return '$sign\$${abs.toStringAsFixed(2)}';
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    this.isPositive = true,
    this.valueColor,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool isPositive;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final color = valueColor ?? (isPositive ? AppColors.accent : AppColors.danger);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.primary, size: 18),
          const SizedBox(height: 6),
          Text(
            value,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 10, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
