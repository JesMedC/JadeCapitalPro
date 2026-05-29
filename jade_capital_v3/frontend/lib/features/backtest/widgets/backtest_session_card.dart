import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/backtest_session.dart';

/// List item card for a single [BacktestSession].
///
/// Displays name, status chip, instrument/timeframe config, and creation date.
/// The parent [BacktestPage] wraps this in a [Dismissible] for swipe-to-delete.
class BacktestSessionCard extends StatelessWidget {
  const BacktestSessionCard({
    super.key,
    required this.session,
    required this.onTap,
  });

  final BacktestSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            // ── Icon ──
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: _statusColor(session.status).withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _statusIcon(session.status),
                size: 20,
                color: _statusColor(session.status),
              ),
            ),
            const SizedBox(width: 12),

            // ── Info ──
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.name,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _configSummary(session),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _formatDate(session.createdAt),
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // ── Status chip ──
            _StatusChip(status: session.status),
          ],
        ),
      ),
    );
  }

  static String _configSummary(BacktestSession s) {
    final instrument = s.config['instrument'] as String? ?? '—';
    final timeframe = s.config['timeframe'] as String? ?? '—';
    final candles = s.config['lastNCandles']?.toString() ?? '—';
    return '$instrument · $timeframe · $candles bars';
  }

  static String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    return '${local.year}-${_pad(local.month)}-${_pad(local.day)} '
        '${_pad(local.hour)}:${_pad(local.minute)}';
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');

  static Color _statusColor(String status) {
    switch (status) {
      case 'completed':
        return AppColors.accent;
      case 'running':
        return AppColors.primary;
      case 'failed':
        return AppColors.danger;
      default: // pending
        return AppColors.warning;
    }
  }

  static IconData _statusIcon(String status) {
    switch (status) {
      case 'completed':
        return Icons.check_circle_outline;
      case 'running':
        return Icons.sync;
      case 'failed':
        return Icons.error_outline;
      default: // pending
        return Icons.hourglass_empty_outlined;
    }
  }
}

// ── Status chip ───────────────────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  Color get _color {
    switch (status) {
      case 'completed':
        return AppColors.accent;
      case 'running':
        return AppColors.primary;
      case 'failed':
        return AppColors.danger;
      default: // pending
        return AppColors.warning;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _color.withValues(alpha: 0.4)),
      ),
      child: Text(
        status.toUpperCase(),
        style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: _color,
        ),
      ),
    );
  }
}
