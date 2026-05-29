import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../models/price_alert.dart';
import '../providers/alerts_provider.dart';

/// Card displaying a price alert with status badge, condition label,
/// and action buttons (toggle active/disabled + delete).
///
/// Matches the [GoalCard] visual style: dark card container, border,
/// consistent typography.
class AlertCard extends ConsumerWidget {
  const AlertCard({
    super.key,
    required this.alert,
  });

  final PriceAlert alert;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
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
          // ── Row 1: Instrument + Status badge ──
          Row(
            children: [
              _InstrumentIcon(instrument: alert.instrument),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      alert.instrument,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      alert.name,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _StatusBadge(status: alert.status),
            ],
          ),

          const SizedBox(height: 10),

          // ── Row 2: Condition label ──
          Row(
            children: [
              const Icon(
                Icons.swap_vert_outlined,
                size: 14,
                color: AppColors.textMuted,
              ),
              const SizedBox(width: 6),
              Text(
                _conditionLabel(alert.condition, alert.targetPrice),
                style: GoogleFonts.inter(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),

          // ── Triggered timestamp (shown when triggered) ──
          if (alert.status == AlertStatus.triggered &&
              alert.triggeredAt != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.check_circle_outline,
                  size: 13,
                  color: AppColors.warning,
                ),
                const SizedBox(width: 6),
                Text(
                  'Triggered ${DateFormat('MMM dd, HH:mm').format(alert.triggeredAt!.toLocal())}',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.warning,
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: 8),

          // ── Row 3: Action buttons ──
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              // Toggle active/disabled (only for non-triggered alerts)
              if (alert.status != AlertStatus.triggered)
                _ToggleButton(alert: alert, ref: ref),
              // Delete button (always visible)
              _DeleteButton(alertId: alert.id, ref: ref),
            ],
          ),
        ],
      ),
    );
  }

  /// Build a human-readable condition label, e.g. "above 1.1500".
  static String _conditionLabel(AlertCondition condition, double targetPrice) {
    final priceStr = targetPrice >= 1000
        ? targetPrice.toStringAsFixed(2)
        : targetPrice.toStringAsFixed(4);
    switch (condition) {
      case AlertCondition.above:
        return 'Price above $priceStr';
      case AlertCondition.below:
        return 'Price below $priceStr';
      case AlertCondition.crossesAbove:
        return 'Price crosses above $priceStr';
      case AlertCondition.crossesBelow:
        return 'Price crosses below $priceStr';
    }
  }
}

// ── Instrument icon ──

class _InstrumentIcon extends StatelessWidget {
  const _InstrumentIcon({required this.instrument});

  final String instrument;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
      ),
      child: const Icon(
        Icons.trending_up_outlined,
        size: 18,
        color: AppColors.primary,
      ),
    );
  }
}

// ── Status badge ──

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final AlertStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, bgColor, textColor, borderColor) = _styleFor(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: textColor,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  static (String, Color, Color, Color) _styleFor(AlertStatus status) {
    switch (status) {
      case AlertStatus.active:
        return (
          'ACTIVE',
          AppColors.accent.withValues(alpha: 0.12),
          AppColors.accent,
          AppColors.accent.withValues(alpha: 0.4),
        );
      case AlertStatus.triggered:
        return (
          'TRIGGERED',
          AppColors.warning.withValues(alpha: 0.12),
          AppColors.warning,
          AppColors.warning.withValues(alpha: 0.4),
        );
      case AlertStatus.disabled:
        return (
          'DISABLED',
          AppColors.textMuted.withValues(alpha: 0.1),
          AppColors.textMuted,
          AppColors.textMuted.withValues(alpha: 0.3),
        );
    }
  }
}

// ── Toggle button (active ↔ disabled) ──

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({required this.alert, required this.ref});

  final PriceAlert alert;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final isActive = alert.status == AlertStatus.active;

    return IconButton(
      iconSize: 20,
      visualDensity: VisualDensity.compact,
      tooltip: isActive ? 'Disable alert' : 'Enable alert',
      onPressed: () {
        final newStatus =
            isActive ? AlertStatus.disabled : AlertStatus.active;
        ref.read(alertsProvider.notifier).updateAlert(
          alert.id,
          {'status': newStatus.apiValue},
        );
      },
      icon: Icon(
        isActive
            ? Icons.notifications_active_outlined
            : Icons.notifications_off_outlined,
        color: isActive ? AppColors.primary : AppColors.textMuted,
      ),
    );
  }
}

// ── Delete button ──

class _DeleteButton extends StatelessWidget {
  const _DeleteButton({required this.alertId, required this.ref});

  final String alertId;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      iconSize: 20,
      visualDensity: VisualDensity.compact,
      tooltip: 'Delete alert',
      onPressed: () => _confirmDelete(context),
      icon: const Icon(
        Icons.delete_outline,
        color: AppColors.danger,
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        title: Text(
          'Delete Alert',
          style: GoogleFonts.orbitron(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        content: Text(
          'Are you sure you want to delete this alert?',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textSecondary,
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
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(alertsProvider.notifier).deleteAlert(alertId);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
