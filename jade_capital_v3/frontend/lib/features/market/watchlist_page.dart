import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'models/watchlist_state.dart';
import 'providers/watchlist_provider.dart';
import 'widgets/add_remove_instrument_sheet.dart';
import 'widgets/instrument_card.dart';

/// Market watchlist page — real-time price grid for subscribed instruments.
///
/// Renders the watchlist from [watchlistProvider] using [AsyncValue]-style
/// dispatch via [WatchlistState.status]. An FAB opens [AddRemoveInstrumentSheet]
/// to manage the instrument list.
class WatchlistPage extends ConsumerWidget {
  const WatchlistPage({super.key});

  void _openSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => const AddRemoveInstrumentSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final watchlist = ref.watch(watchlistProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Market'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            tooltip: 'Reload',
            onPressed: () => ref.read(watchlistProvider.notifier).reload(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openSheet(context),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.background,
        tooltip: 'Manage instruments',
        child: const Icon(Icons.playlist_add),
      ),
      body: _WatchlistBody(state: watchlist),
    );
  }
}

class _WatchlistBody extends ConsumerWidget {
  const _WatchlistBody({required this.state});

  final WatchlistState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (state.status) {
      case WatchlistLoadStatus.initial:
      case WatchlistLoadStatus.loading:
        return const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        );

      case WatchlistLoadStatus.error:
        return _ErrorView(
          message: state.error ?? 'Unknown error',
          onRetry: () => ref.read(watchlistProvider.notifier).reload(),
        );

      case WatchlistLoadStatus.loaded:
        if (state.instruments.isEmpty) {
          return const _EmptyState();
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
          itemCount: state.instruments.length,
          itemBuilder: (context, index) {
            final symbol = state.instruments[index];
            return InstrumentCard(
              symbol: symbol,
              tick: state.prices[symbol],
            );
          },
        );
    }
  }
}

// ── Empty state ──

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.star_outline, size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'Your watchlist is empty',
            style: GoogleFonts.inter(
              fontSize: 16,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to add instruments',
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

// ── Error view ──

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
            const SizedBox(height: 16),
            Text(
              'Failed to load watchlist',
              style: GoogleFonts.inter(
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
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.background,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
