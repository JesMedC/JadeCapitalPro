import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../providers/dashboard_provider.dart';

/// Risk status bar showing daily P&L, loss %, trades today.
class RiskBar extends StatelessWidget {
  const RiskBar({super.key, required this.risk});

  final RiskStatus risk;

  @override
  Widget build(BuildContext context) {
    final isPositive = risk.dailyPnl >= 0;
    final lossRatio =
        risk.maxDailyLossPct > 0 ? risk.dailyLossPct / risk.maxDailyLossPct : 0;
    final riskColor = lossRatio < 0.5
        ? AppColors.accent
        : lossRatio < 0.8
            ? AppColors.warning
            : AppColors.danger;

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
          Text(
            'Risk Status',
            style: GoogleFonts.orbitron(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),

          // Risk progress bar
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: lossRatio.clamp(0.0, 1.0).toDouble(),
                    minHeight: 6,
                    backgroundColor: AppColors.surfaceLight,
                    valueColor: AlwaysStoppedAnimation(riskColor),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                    '${risk.dailyLossPct.toStringAsFixed(1)}%',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: riskColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Max daily loss: ${risk.maxDailyLossPct.toStringAsFixed(1)}%',
            style: GoogleFonts.inter(
              fontSize: 10,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 16),

          // Stats row
          Row(
            children: [
              _RiskStat(
                label: 'Daily P&L',
                value:
                    '${isPositive ? '+' : ''}\$${risk.dailyPnl.toStringAsFixed(2)}',
                color: isPositive ? AppColors.accent : AppColors.danger,
              ),
              const SizedBox(width: 12),
              _RiskStat(
                label: 'P&L %',
                value:
                    '${risk.dailyLossPct >= 0 ? '+' : ''}${risk.dailyLossPct.toStringAsFixed(2)}%',
                color: risk.dailyLossPct >= 0 ? AppColors.accent : AppColors.danger,
              ),
              const SizedBox(width: 12),
              _RiskStat(
                label: 'Trades',
                value: '${risk.tradesToday}',
                color: AppColors.textPrimary,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RiskStat extends StatelessWidget {
  const _RiskStat({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 10,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
