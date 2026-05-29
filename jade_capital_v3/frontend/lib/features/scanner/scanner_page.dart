import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/providers.dart';
import '../../core/theme/app_theme.dart';
import '../bookmarks/bookmark.dart';
import '../bookmarks/bookmarks_provider.dart';
import 'models/scanner_result.dart';
import 'providers/scanner_filter_state.dart';
import 'providers/scanner_provider.dart';
import 'widgets/pattern_card.dart';
import 'widgets/pattern_detail_sheet.dart';
import 'widgets/scanner_filter_chips.dart';

/// Main scanner page — shows global harmonic pattern signals.
///
/// Uses [ConsumerStatefulWidget] so that the active filter state can be
/// tracked locally alongside the [scannerProvider] async state. This
/// mirrors [AlertsPage] (also [ConsumerStatefulWidget]).
///
/// Pattern: watch [scannerProvider] for data; on filter change, call
/// [ScannerNotifier.applyFilters] AND update local [_activeFilter] so
/// the filter chips reflect the current selection.
class ScannerPage extends ConsumerStatefulWidget {
  const ScannerPage({super.key});

  @override
  ConsumerState<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends ConsumerState<ScannerPage> {
  ScannerFilterState _activeFilter = ScannerFilterState.empty;

  /// Subscription to WsClient.scannerStream for snackbar count notifications.
  /// Separate from [ScannerNotifier]'s subscription — avoids coupling to notifier internals.
  StreamSubscription<Map<String, dynamic>>? _wsCountSub;

  @override
  void initState() {
    super.initState();
    // Use addPostFrameCallback so ref.read is safe (context is mounted) (AC-17)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ws = ref.read(wsClientProvider);
      _wsCountSub = ws.scannerStream.listen((data) {
        final count = data['count'];
        if (count is int && count > 0 && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('New patterns detected'),
              duration: Duration(seconds: 3),
            ),
          );
        }
      });
    });
  }

  @override
  void dispose() {
    _wsCountSub?.cancel();
    super.dispose();
  }

  void _onFilterChanged(ScannerFilterState filter) {
    setState(() => _activeFilter = filter);
    ref.read(scannerProvider.notifier).applyFilters(filter);
  }

  void _openDetailSheet(ScannerResult result) {
    // Look up the bookmark for this result (if any) to derive isBookmarked,
    // bookmarkId, and notes for the detail sheet.
    final bookmarksState = ref.read(bookmarksProvider).valueOrNull;
    final key = bookmarkKey(
      instrument: result.instrument,
      timeframe: result.timeframe,
      pattern: result.pattern,
      direction: result.direction,
    );
    final bookmark = bookmarksState?.bookmarks.firstWhere(
      (b) => b.compoundKey == key,
      orElse: () => PatternBookmark(
        id: '',
        userId: '',
        instrument: '',
        timeframe: '',
        pattern: '',
        direction: '',
        createdAt: DateTime.fromMillisecondsSinceEpoch(0),
      ),
    );
    final isBookmarked = bookmark != null && bookmark.id.isNotEmpty;
    final notes = isBookmarked ? bookmark.notes : null;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => PatternDetailSheet(
        result: result,
        notes: notes,
        isBookmarked: isBookmarked,
        bookmarkId: isBookmarked ? bookmark.id : null,
      ),
    );
  }

  void _toggleBookmark(ScannerResult result) {
    ref.read(bookmarksProvider.notifier).toggle(
      instrument: result.instrument,
      timeframe: result.timeframe,
      pattern: result.pattern,
      direction: result.direction,
    );
  }

  /// Navigate to the chart page with [result] set as the active overlay.
  void _viewOnChart(ScannerResult result) {
    context.go('/dashboard/chart', extra: result);
  }

  @override
  Widget build(BuildContext context) {
    final asyncResults = ref.watch(scannerProvider);
    final notifier = ref.read(scannerProvider.notifier);

    // Watch bookmarks state — rebuilds PatternCards whenever bookmarks change.
    final asyncBookmarks = ref.watch(bookmarksProvider);
    final bookmarkedKeys = asyncBookmarks.valueOrNull?.bookmarkedKeys ?? {};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            tooltip: 'Refresh',
            onPressed: notifier.refresh,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: notifier.refresh,
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.background,
        tooltip: 'Refresh scanner',
        child: const Icon(Icons.refresh),
      ),
      body: asyncResults.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (error, _) => _ErrorState(
          message: error.toString(),
          onRetry: notifier.refresh,
        ),
        data: (results) {
          // Build filter chip options from the full unfiltered list.
          final allResults = notifier.allResults;
          final allPatterns = allResults
              .map((r) => r.pattern)
              .toSet()
              .toList()
            ..sort();
          final allInstruments = allResults
              .map((r) => r.instrument)
              .toSet()
              .toList()
            ..sort();
          final allTimeframes = allResults
              .map((r) => r.timeframe)
              .toSet()
              .toList()
            ..sort();

          // Client-side savedOnly filter — applied after ScannerNotifier's
          // instrument/timeframe/pattern filters. Coupling rule: the key set
          // is read here and passed to PatternCard as a prop, NOT inside the
          // notifier or PatternCard itself.
          final displayResults = _activeFilter.savedOnly
              ? results.where((r) {
                  final key = bookmarkKey(
                    instrument: r.instrument,
                    timeframe: r.timeframe,
                    pattern: r.pattern,
                    direction: r.direction,
                  );
                  return bookmarkedKeys.contains(key);
                }).toList()
              : results;

          return Column(
            children: [
              ScannerFilterChips(
                filter: _activeFilter,
                allPatterns: allPatterns,
                allInstruments: allInstruments,
                allTimeframes: allTimeframes,
                onFilterChanged: _onFilterChanged,
              ),
              Expanded(
                child: displayResults.isEmpty
                    ? _activeFilter.savedOnly
                        ? const _EmptySavedState()
                        : const _EmptyState()
                    : _PatternList(
                        results: displayResults,
                        bookmarkedKeys: bookmarkedKeys,
                        onTap: _openDetailSheet,
                        onToggleBookmark: _toggleBookmark,
                        onViewOnChart: _viewOnChart,
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Pattern list ──────────────────────────────────────────────────────────────

class _PatternList extends StatelessWidget {
  const _PatternList({
    required this.results,
    required this.bookmarkedKeys,
    required this.onTap,
    required this.onToggleBookmark,
    this.onViewOnChart,
  });

  final List<ScannerResult> results;

  /// Compound-key set from [BookmarksNotifier] — used for O(1) star rendering.
  final Set<String> bookmarkedKeys;

  final ValueChanged<ScannerResult> onTap;
  final ValueChanged<ScannerResult> onToggleBookmark;

  /// Called when the user taps "View on Chart" inside a [PatternCard].
  final ValueChanged<ScannerResult>? onViewOnChart;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 4, bottom: 80),
      itemCount: results.length,
      itemBuilder: (_, i) {
        final result = results[i];
        final key = bookmarkKey(
          instrument: result.instrument,
          timeframe: result.timeframe,
          pattern: result.pattern,
          direction: result.direction,
        );
        return PatternCard(
          result: result,
          isBookmarked: bookmarkedKeys.contains(key),
          onTap: () => onTap(result),
          onToggleBookmark: () => onToggleBookmark(result),
          onViewOnChart: onViewOnChart != null ? () => onViewOnChart!(result) : null,
        );
      },
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.radar, size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'No patterns detected yet',
            style: GoogleFonts.orbitron(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'The scanner runs every 15 minutes.\nCheck back soon.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

/// Empty state shown when the "★ Saved" filter is active but the user has
/// not bookmarked any of the currently detected signals.
class _EmptySavedState extends StatelessWidget {
  const _EmptySavedState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star_border, size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'No saved patterns',
            style: GoogleFonts.orbitron(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap the ★ on any pattern card to save it here.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Error state ───────────────────────────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
            const SizedBox(height: 16),
            Text(
              'Failed to load scanner results',
              style: GoogleFonts.orbitron(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
