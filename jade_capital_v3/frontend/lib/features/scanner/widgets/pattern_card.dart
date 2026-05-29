import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../../../features/bookmarks/bookmark_toggle_button.dart';
import '../models/scanner_result.dart';

/// A compact card that summarises a single harmonic pattern signal.
///
/// Shows pattern name, timeframe chip, instrument, direction badge,
/// entry/SL/TP1 prices, a confidence pill, and a bookmark star button.
/// Tapping the card body invokes [onTap] — the caller is responsible for
/// showing the detail sheet.
///
/// Coupling rule: this widget does NOT import [bookmarksProvider] or any
/// store. It receives [isBookmarked] and [onToggleBookmark] as props from
/// [ScannerPage], keeping it testable in isolation.
class PatternCard extends StatelessWidget {
  const PatternCard({
    super.key,
    required this.result,
    required this.onTap,
    this.isBookmarked = false,
    this.onToggleBookmark,
    this.onViewOnChart,
  });

  final ScannerResult result;
  final VoidCallback onTap;

  /// Whether the signal is currently bookmarked by the authenticated user.
  final bool isBookmarked;

  /// Called when the user taps the bookmark star. Null hides the button.
  final VoidCallback? onToggleBookmark;

  /// Called when the user taps "View on Chart". Null hides the button.
  final VoidCallback? onViewOnChart;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      color: AppColors.cardBackground,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row 1: pattern name + timeframe chip + bookmark button
              Row(
                children: [
                  Expanded(
                    child: Text(
                      result.pattern,
                      style: GoogleFonts.orbitron(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  _TimeframeChip(timeframe: result.timeframe),
                  if (onToggleBookmark != null) ...[
                    const SizedBox(width: 4),
                    BookmarkToggleButton(
                      isBookmarked: isBookmarked,
                      onToggle: onToggleBookmark!,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),

              // Row 2: instrument + direction badge
              Row(
                children: [
                  Expanded(
                    child: Text(
                      result.instrument,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ),
                  _DirectionBadge(direction: result.direction),
                ],
              ),
              const SizedBox(height: 8),

              // Row 3: entry / SL / TP1 prices
              Wrap(
                spacing: 12,
                runSpacing: 2,
                children: [
                  _PriceLabel(
                    label: 'Entry',
                    value: result.entryPrice,
                  ),
                  _PriceLabel(
                    label: 'SL',
                    value: result.stopLoss,
                  ),
                  _PriceLabel(
                    label: 'TP1',
                    value: result.takeProfit,
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Row 4: confidence pill + view-on-chart CTA
              Row(
                children: [
                  _ConfidencePill(confidence: result.confidence),
                  if (onViewOnChart != null) ...[
                    const Spacer(),
                    Semantics(
                      label: 'View ${result.pattern} on chart',
                      child: IconButton(
                        icon: const Icon(
                          Icons.show_chart,
                          size: 18,
                          color: AppColors.primary,
                        ),
                        onPressed: onViewOnChart,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        tooltip: 'View on Chart',
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Private sub-widgets ───────────────────────────────────────────────────────

/// Green badge for CALL, red badge for PUT.
class _DirectionBadge extends StatelessWidget {
  const _DirectionBadge({required this.direction});

  final String direction;

  @override
  Widget build(BuildContext context) {
    final isCall = direction == 'CALL';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: isCall ? AppColors.accent : AppColors.danger,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        direction,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }
}

/// Standard chip displaying the timeframe string.
class _TimeframeChip extends StatelessWidget {
  const _TimeframeChip({required this.timeframe});

  final String timeframe;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(
        timeframe,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 11,
          color: AppColors.textSecondary,
        ),
      ),
      backgroundColor: AppColors.surfaceLight,
      side: const BorderSide(color: AppColors.border),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Confidence score displayed in a rounded pill.
class _ConfidencePill extends StatelessWidget {
  const _ConfidencePill({required this.confidence});

  final double? confidence;

  @override
  Widget build(BuildContext context) {
    final label = confidence != null
        ? '${confidence!.toStringAsFixed(0)}%'
        : '-%';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        'Confidence: $label',
        style: GoogleFonts.inter(
          fontSize: 11,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

/// Compact inline price display: "Entry: 1.08765".
class _PriceLabel extends StatelessWidget {
  const _PriceLabel({required this.label, required this.value});

  final String label;
  final double? value;

  @override
  Widget build(BuildContext context) {
    final formatted = value != null ? value!.toStringAsFixed(5) : '-';
    return Text(
      '$label: $formatted',
      style: GoogleFonts.jetBrainsMono(
        fontSize: 11,
        color: AppColors.textSecondary,
      ),
    );
  }
}
