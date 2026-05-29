import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';

/// Scrollable trades table for the backtest result page.
///
/// Columns: #, Direction, Result, P&L (pts).
///
/// P&L values use [AppColors.accent] for wins and [AppColors.danger] for
/// losses, matching the trades page convention.
///
/// Renders an empty-state message when [trades] is empty.
class TradesTable extends StatelessWidget {
  const TradesTable({
    super.key,
    required this.trades,
  });

  /// List of trade maps from [BacktestSession.trades].
  /// Each map is expected to have keys: `index`, `direction`, `result`, `pnl`.
  final List<Map<String, dynamic>> trades;

  @override
  Widget build(BuildContext context) {
    if (trades.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: Text(
            'No trades generated',
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textMuted,
            ),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowColor: WidgetStateProperty.all(AppColors.surfaceLight),
        dataRowColor: WidgetStateProperty.resolveWith((states) {
          return AppColors.cardBackground;
        }),
        columnSpacing: 20,
        headingTextStyle: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.textSecondary,
        ),
        dataTextStyle: GoogleFonts.jetBrainsMono(
          fontSize: 12,
          color: AppColors.textPrimary,
        ),
        columns: const [
          DataColumn(label: Text('#')),
          DataColumn(label: Text('DIR')),
          DataColumn(label: Text('RESULT')),
          DataColumn(label: Text('P&L (pts)')),
        ],
        rows: trades.map((trade) {
          final index = trade['index'] as int? ?? 0;
          final direction = trade['direction'] as String? ?? '—';
          final result = trade['result'] as String? ?? '—';
          final pnl = _toDouble(trade['pnl']) ?? 0.0;
          final isWin = result == 'win';

          return DataRow(
            cells: [
              DataCell(Text('${index + 1}')),
              DataCell(_DirectionChip(direction: direction)),
              DataCell(
                Text(
                  result.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isWin ? AppColors.accent : AppColors.danger,
                  ),
                ),
              ),
              DataCell(
                Text(
                  _formatPnl(pnl),
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    color: pnl >= 0 ? AppColors.accent : AppColors.danger,
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  static String _formatPnl(double pnl) {
    final sign = pnl >= 0 ? '+' : '';
    return '$sign${pnl.toStringAsFixed(5)}';
  }
}

// ── Direction chip ────────────────────────────────────────────────────────────

class _DirectionChip extends StatelessWidget {
  const _DirectionChip({required this.direction});

  final String direction;

  @override
  Widget build(BuildContext context) {
    final isCall = direction == 'CALL';
    final color = isCall ? AppColors.accent : AppColors.danger;
    final icon = isCall ? Icons.arrow_upward : Icons.arrow_downward;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 3),
        Text(
          direction,
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }
}
