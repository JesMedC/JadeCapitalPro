import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../../scanner/models/scanner_result.dart';
import '../chart_provider.dart';

/// Companion info panel that renders below the TradingView chart inside
/// [ChartPage] when a scanner result is set as the active overlay.
///
/// Displays: pattern name, direction badge, detection-time disclaimer,
/// XABCD price levels (X/A/B/C/D), PRZ zone, and trade levels
/// (Entry, SL, TP1, TP2).
///
/// Layout: [Column] member below the chart [Expanded] widget, height
/// controlled by [AnimatedContainer] in [ChartPage]. The panel itself
/// does not manage its own visibility.
class XabcdOverlayPanel extends ConsumerWidget {
  const XabcdOverlayPanel({super.key, required this.overlay});

  final ScannerResult overlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(chartPreferencesProvider.notifier);
    final points = overlay.points;
    final prz = points?.prz;

    return Container(
      color: AppColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header: pattern name + direction badge + close button ────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    overlay.pattern,
                    style: GoogleFonts.orbitron(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _DirectionBadge(direction: overlay.direction),
                const Spacer(),
                Semantics(
                  label: 'Dismiss pattern panel',
                  child: IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: notifier.clearOverlay,
                    color: AppColors.textMuted,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Detection time disclaimer ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Prices at detection time — not live',
              style: GoogleFonts.inter(
                fontSize: 11,
                color: AppColors.textMuted,
              ),
            ),
          ),

          const Divider(height: 8, thickness: 1, color: AppColors.border),

          // ── XABCD price levels ───────────────────────────────────────────
          if (points != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _PointLabel(label: 'X', price: points.x),
                  _PointLabel(label: 'A', price: points.a),
                  _PointLabel(label: 'B', price: points.b),
                  _PointLabel(label: 'C', price: points.c),
                  _PointLabel(label: 'D', price: points.d),
                ],
              ),
            ),

          // ── PRZ row ──────────────────────────────────────────────────────
          _PrzRow(prz: prz),

          // ── Trade levels ─────────────────────────────────────────────────
          _TradeLevelRow(label: 'Entry', price: overlay.entryPrice),
          _TradeLevelRow(label: 'SL', price: overlay.stopLoss),
          _TradeLevelRow(label: 'TP1', price: overlay.takeProfit),
          _TradeLevelRow(label: 'TP2', price: overlay.takeProfit2),
        ],
      ),
    );
  }
}

// ── Private sub-widgets ───────────────────────────────────────────────────────

/// Direction badge — CALL (jade green) or PUT (coral red).
///
/// Uses the same color logic as [PatternCard._DirectionBadge] for visual
/// consistency across the app.
class _DirectionBadge extends StatelessWidget {
  const _DirectionBadge({required this.direction});

  final String direction;

  @override
  Widget build(BuildContext context) {
    final isCall = direction == 'CALL';
    return Semantics(
      label: '${direction.toLowerCase()} signal',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: isCall ? AppColors.accent : AppColors.danger,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          direction,
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

/// Labeled price column for a single XABCD pivot point.
class _PointLabel extends StatelessWidget {
  const _PointLabel({required this.label, required this.price});

  final String label;
  final double price;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label price: ${price.toStringAsFixed(5)}',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 10,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            price.toStringAsFixed(5),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

/// PRZ (Potential Reversal Zone) row — shows min–max or "N/A".
class _PrzRow extends StatelessWidget {
  const _PrzRow({required this.prz});

  final ({double min, double max})? prz;

  @override
  Widget build(BuildContext context) {
    final label = prz != null
        ? 'PRZ: ${prz!.min.toStringAsFixed(5)} – ${prz!.max.toStringAsFixed(5)}'
        : 'PRZ: N/A';

    return Semantics(
      label: label,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
        child: Text(
          label,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

/// Single trade level row (Entry, SL, TP1, TP2).
///
/// Renders `'—'` when [price] is null.
class _TradeLevelRow extends StatelessWidget {
  const _TradeLevelRow({required this.label, required this.price});

  final String label;
  final double? price;

  @override
  Widget build(BuildContext context) {
    final formatted = price != null ? price!.toStringAsFixed(5) : '—';
    return Semantics(
      label: '$label: $formatted',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        child: Row(
          children: [
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                color: AppColors.textMuted,
              ),
            ),
            const Spacer(),
            Text(
              formatted,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
