import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'models/backtest_session.dart';
import 'providers/backtest_provider.dart';
import 'widgets/backtest_session_card.dart';

/// Backtest list page — shows all backtest sessions for the authenticated user.
///
/// Uses [ConsumerWidget] — no local state required; all state lives in
/// [backtestProvider]. The FAB pushes the form page modally.
///
/// Follows the [AlertsPage] / [ScannerPage] structural pattern.
class BacktestPage extends ConsumerWidget {
  const BacktestPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncSessions = ref.watch(backtestProvider);
    final notifier = ref.read(backtestProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Backtest'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            tooltip: 'Refresh',
            onPressed: notifier.refresh,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/dashboard/backtest/form'),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.background,
        tooltip: 'New backtest',
        child: const Icon(Icons.add),
      ),
      body: asyncSessions.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (error, _) => _ErrorState(
          message: error.toString(),
          onRetry: notifier.refresh,
        ),
        data: (sessions) => sessions.isEmpty
            ? const _EmptyState()
            : _SessionList(
                sessions: sessions,
                onTap: (s) => context.push('/dashboard/backtest/${s.id}'),
                onDelete: (s) => _confirmDelete(context, ref, s),
              ),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    BacktestSession session,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(
          'Delete Backtest',
          style: GoogleFonts.orbitron(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        content: Text(
          'Delete "${session.name}"? This cannot be undone.',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textSecondary,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              'Delete',
              style: GoogleFonts.inter(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(backtestProvider.notifier).delete(session.id);
    }
  }
}

// ── Session list ──────────────────────────────────────────────────────────────

class _SessionList extends StatelessWidget {
  const _SessionList({
    required this.sessions,
    required this.onTap,
    required this.onDelete,
  });

  final List<BacktestSession> sessions;
  final ValueChanged<BacktestSession> onTap;
  final ValueChanged<BacktestSession> onDelete;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 80),
      itemCount: sessions.length,
      itemBuilder: (_, i) {
        final session = sessions[i];
        return Dismissible(
          key: ValueKey(session.id),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppColors.danger.withValues(alpha: 0.4),
              ),
            ),
            child: const Icon(Icons.delete_outline, color: AppColors.danger),
          ),
          confirmDismiss: (_) async {
            onDelete(session);
            return false; // the notifier handles actual removal
          },
          child: BacktestSessionCard(
            session: session,
            onTap: () => onTap(session),
          ),
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
          const Icon(
            Icons.history_edu_outlined,
            size: 64,
            color: AppColors.textMuted,
          ),
          const SizedBox(height: 16),
          Text(
            'No Backtests Yet',
            style: GoogleFonts.orbitron(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to run your first strategy backtest.',
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
            const Icon(
              Icons.error_outline,
              size: 48,
              color: AppColors.danger,
            ),
            const SizedBox(height: 16),
            Text(
              'Failed to load backtests',
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
