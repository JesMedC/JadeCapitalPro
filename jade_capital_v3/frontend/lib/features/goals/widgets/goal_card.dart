import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/goal.dart';

/// Card displaying a trading goal with progress bar, status badge,
/// and days remaining.
///
/// Matches [JournalEntryCard] visual style: dark card container,
/// border, consistent typography.
class GoalCard extends StatelessWidget {
  const GoalCard({
    super.key,
    required this.goal,
    this.onTap,
  });

  final Goal goal;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final progress = (goal.progressPct / 100).clamp(0.0, 1.0);
    final progressColor = _progressColor(goal.progressPct, goal.isCompleted);

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
            // ── Row 1: Icon + Title + Completed badge ──
            Row(
              children: [
                _GoalTypeIcon(type: goal.goalType),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    goal.title,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (goal.isCompleted) ...[
                  const SizedBox(width: 8),
                   const _CompletedBadge(),
                ],
              ],
            ),

            const SizedBox(height: 10),

            // ── Progress bar ──
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 6,
                backgroundColor: AppColors.surfaceLight,
                valueColor: AlwaysStoppedAnimation<Color>(progressColor),
              ),
            ),

            const SizedBox(height: 8),

            // ── Row 2: Percentage + Value label ──
            Row(
              children: [
                Text(
                  '${goal.progressPct.toStringAsFixed(0)}%',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: progressColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _buildValueLabel(goal),
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 6),

            // ── Row 3: Period chip + Days remaining ──
            Row(
              children: [
                _PeriodBadge(period: goal.period),
                const Spacer(),
                _DaysRemainingLabel(daysRemaining: goal.daysRemaining),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Goal-type icon ──

class _GoalTypeIcon extends StatelessWidget {
  const _GoalTypeIcon({required this.type});

  final GoalType type;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = _iconForType(type);
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(icon, size: 16, color: color),
    );
  }

  static (IconData, Color) _iconForType(GoalType type) {
    switch (type) {
      case GoalType.pnl:
        return (Icons.attach_money_outlined, AppColors.accent);
      case GoalType.winrate:
        return (Icons.percent_outlined, AppColors.primary);
      case GoalType.trades:
        return (Icons.swap_horiz_outlined, AppColors.warning);
      case GoalType.streak:
        return (Icons.local_fire_department_outlined, const Color(0xFFFF6B35));
      case GoalType.drawdown:
        return (Icons.shield_outlined, AppColors.danger);
    }
  }
}

// ── Completed badge ──

class _CompletedBadge extends StatelessWidget {
  const _CompletedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle_outline,
              size: 10, color: AppColors.accent),
          const SizedBox(width: 4),
          Text(
            'Completed',
            style: GoogleFonts.inter(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: AppColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Period badge ──

class _PeriodBadge extends StatelessWidget {
  const _PeriodBadge({required this.period});

  final GoalPeriod period;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        period.label,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: AppColors.textMuted,
        ),
      ),
    );
  }
}

// ── Days remaining label ──

class _DaysRemainingLabel extends StatelessWidget {
  const _DaysRemainingLabel({required this.daysRemaining});

  final int daysRemaining;

  @override
  Widget build(BuildContext context) {
    final String label;
    final Color color;

    if (daysRemaining > 0) {
      label = '$daysRemaining day${daysRemaining == 1 ? '' : 's'} left';
      color = daysRemaining <= 3 ? AppColors.warning : AppColors.textMuted;
    } else if (daysRemaining == 0) {
      label = 'Ends today';
      color = AppColors.warning;
    } else {
      label = 'Expired';
      color = AppColors.danger;
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule_outlined, size: 11, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 11,
            color: color,
          ),
        ),
      ],
    );
  }
}

// ── Helpers ──

/// Build the current/target value label for a goal based on its type.
String _buildValueLabel(Goal goal) {
  final current = goal.currentValue;
  final target = goal.targetValue;

  switch (goal.goalType) {
    case GoalType.pnl:
      return '\$${current.toStringAsFixed(2)} / \$${target.toStringAsFixed(2)}';
    case GoalType.winrate:
      return '${current.toStringAsFixed(1)}% / ${target.toStringAsFixed(1)}%';
    case GoalType.trades:
      return '${current.toInt()} / ${target.toInt()} trades';
    case GoalType.streak:
      return '${current.toInt()} / ${target.toInt()} consecutive wins';
    case GoalType.drawdown:
      // Drawdown: lower is better (safe < limit).
      return '\$${current.toStringAsFixed(2)} used / \$${target.toStringAsFixed(2)} limit';
  }
}

/// Determine progress bar colour based on progress and completion state.
Color _progressColor(double progressPct, bool isCompleted) {
  if (isCompleted) return AppColors.accent;
  if (progressPct >= 80) return AppColors.accent;
  if (progressPct >= 50) return AppColors.primary;
  if (progressPct >= 25) return AppColors.warning;
  return AppColors.textMuted;
}
