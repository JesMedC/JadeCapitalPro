import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../../bookmarks/bookmark.dart';
import '../../bookmarks/bookmarks_provider.dart';
import '../models/scanner_result.dart';

/// Draggable bottom sheet showing full detail for a harmonic pattern signal.
///
/// Presents: pattern name + direction badge, instrument + timeframe, entry
/// price, stop loss, take profit 1, optional take profit 2, optional
/// confluence annotations, optional XABCD ratio breakdown, and optional
/// bookmark notes.
///
/// When [isBookmarked] is true, the notes section shows an edit pencil button.
/// Tapping it switches the notes body to an inline [TextField] with Save and
/// Cancel actions. Saving dispatches [BookmarksNotifier.updateNotes] with
/// an optimistic update; cancelling restores the original text.
///
/// [notes] and [isBookmarked]/[bookmarkId] are injected by [ScannerPage] from
/// the [BookmarksNotifier] state — this widget does NOT read [bookmarksProvider]
/// directly at construction time (coupling rule preserved from the original
/// design), but DOES call the notifier via [ref.read] inside [_saveNotes].
///
/// Uses [DraggableScrollableSheet] so the user can expand it further to read
/// all metadata without dismissing the sheet.
class PatternDetailSheet extends ConsumerStatefulWidget {
  const PatternDetailSheet({
    super.key,
    required this.result,
    this.notes,
    this.isBookmarked = false,
    this.bookmarkId,
  });

  final ScannerResult result;

  /// Bookmark notes for this signal, if any.
  ///
  /// Displayed only when non-null and non-empty. Null-safe — if the signal
  /// is not bookmarked or the bookmark has no notes, this is null.
  final String? notes;

  /// Whether the signal is currently bookmarked by the user.
  ///
  /// Controls visibility of the pencil edit icon in the notes section.
  final bool isBookmarked;

  /// The bookmark ID — required when [isBookmarked] is true.
  ///
  /// Passed to [BookmarksNotifier.updateNotes] when the user saves edited notes.
  final String? bookmarkId;

  @override
  ConsumerState<PatternDetailSheet> createState() => _PatternDetailSheetState();
}

class _PatternDetailSheetState extends ConsumerState<PatternDetailSheet> {
  bool _editMode = false;
  late TextEditingController _notesController;
  String _originalNotes = '';

  // Sentinel used by _syncControllerFromState when the bookmark is not found.
  static final _notFound = PatternBookmark(
    id: '__not_found__',
    userId: '__not_found__',
    instrument: '',
    timeframe: '',
    pattern: '',
    direction: '',
    createdAt: DateTime.fromMillisecondsSinceEpoch(0),
  );

  @override
  void initState() {
    super.initState();
    _originalNotes = widget.notes ?? '';
    _notesController = TextEditingController(text: _originalNotes);
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _saveNotes() async {
    final notifier = ref.read(bookmarksProvider.notifier);
    await notifier.updateNotes(widget.bookmarkId!, _notesController.text);
    if (!mounted) return;
    if (notifier.lastError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to save notes: ${notifier.lastError}'),
          backgroundColor: AppColors.danger,
        ),
      );
      // State already reverted by notifier — sync controller text
      _syncControllerFromState();
    } else {
      setState(() {
        _editMode = false;
        _originalNotes = _notesController.text;
      });
    }
  }

  void _cancelEdit() {
    setState(() {
      _editMode = false;
      _notesController.text = _originalNotes;
    });
  }

  void _syncControllerFromState() {
    final bookmark = ref.read(bookmarksProvider).valueOrNull?.bookmarks
        .firstWhere(
          (b) => b.id == widget.bookmarkId,
          orElse: () => _notFound,
        );
    _notesController.text = bookmark?.notes ?? '';
    setState(() => _editMode = false);
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              // Handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.textMuted.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Pattern name + direction badge
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.result.pattern,
                      style: GoogleFonts.orbitron(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  _DirectionBadge(direction: widget.result.direction),
                ],
              ),
              const SizedBox(height: 6),

              // Instrument + timeframe
              Row(
                children: [
                  Text(
                    widget.result.instrument,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    widget.result.timeframe,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(color: AppColors.divider),
              const SizedBox(height: 8),

              // Price rows
              _PriceRow(label: 'Entry', price: widget.result.entryPrice),
              _PriceRow(label: 'Stop Loss', price: widget.result.stopLoss),
              _PriceRow(label: 'Take Profit 1', price: widget.result.takeProfit),
              if (widget.result.takeProfit2 != null)
                _PriceRow(label: 'Take Profit 2', price: widget.result.takeProfit2),

              // Confidence
              if (widget.result.confidence != null) ...[
                const SizedBox(height: 4),
                _PriceRow(
                  label: 'Confidence',
                  priceText:
                      '${widget.result.confidence!.toStringAsFixed(1)}%',
                ),
              ],

              // Confluences
              if (widget.result.confluences?.isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Text(
                  'Confluences',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                ...widget.result.confluences!.map(
                  (c) => Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Row(
                      children: [
                        const Icon(Icons.fiber_manual_record,
                            size: 6, color: AppColors.primary),
                        const SizedBox(width: 6),
                        Text(
                          c,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],

              // Notes section — editable when bookmarked
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                    'Notes',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const Spacer(),
                  if (widget.isBookmarked)
                    _editMode
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              TextButton(
                                onPressed: _cancelEdit,
                                child: const Text('Cancel'),
                              ),
                              const SizedBox(width: 4),
                              ElevatedButton(
                                onPressed: _saveNotes,
                                child: const Text('Save'),
                              ),
                            ],
                          )
                        : IconButton(
                            icon: const Icon(Icons.edit, size: 18),
                            tooltip: 'Edit notes',
                            onPressed: () => setState(() => _editMode = true),
                          ),
                ],
              ),
              const SizedBox(height: 4),
              _editMode
                  ? TextField(
                      controller: _notesController,
                      maxLength: 500,
                      maxLines: 4,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Add notes...',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                      ),
                    )
                  : Text(
                      _notesController.text.isNotEmpty
                          ? _notesController.text
                          : '—',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),

              // XABCD ratio breakdown
              if (widget.result.metadata?['ratios'] != null) ...[
                const SizedBox(height: 12),
                _RatiosSection(
                  ratios: widget.result.metadata!['ratios'] as Map,
                ),
              ],

              // "View on Chart" CTA
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.show_chart),
                  label: const Text('View on Chart'),
                  onPressed: () {
                    Navigator.of(context).pop();
                    context.go('/dashboard/chart', extra: widget.result);
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Private sub-widgets ───────────────────────────────────────────────────────

/// Direction badge identical to PatternCard's badge for visual consistency.
class _DirectionBadge extends StatelessWidget {
  const _DirectionBadge({required this.direction});

  final String direction;

  @override
  Widget build(BuildContext context) {
    final isCall = direction == 'CALL';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: isCall ? AppColors.accent : AppColors.danger,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        direction,
        style: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }
}

/// Label + price row with 5 decimal places formatting.
class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, this.price, this.priceText});

  final String label;
  final double? price;

  /// Pre-formatted text — used when the value is not a raw price (e.g. confidence %).
  final String? priceText;

  @override
  Widget build(BuildContext context) {
    final text = priceText ?? (price != null ? price!.toStringAsFixed(5) : '-');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textSecondary,
            ),
          ),
          const Spacer(),
          Text(
            text,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

/// XABCD Fibonacci ratio breakdown section.
class _RatiosSection extends StatelessWidget {
  const _RatiosSection({required this.ratios});

  final Map ratios;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ratios',
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        ...['AB', 'BC', 'CD', 'XD'].map((key) {
          final value = ratios[key];
          final formatted = value is num
              ? value.toStringAsFixed(3)
              : (value?.toString() ?? '-');
          return Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Row(
              children: [
                Text(
                  key,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
                const Spacer(),
                Text(
                  formatted,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
