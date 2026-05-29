import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'models/journal_entry.dart';
import 'providers/journal_provider.dart';
import 'widgets/emotion_filter_bar.dart';
import 'widgets/journal_entry_card.dart';
import 'widgets/journal_entry_form.dart';

/// Trading journal page — full CRUD UI with emotion filter and date support.
///
/// Converted from [StatelessWidget] placeholder to [ConsumerWidget].
/// [journalProvider] auto-initialises when this page is first visited.
class JournalPage extends ConsumerWidget {
  const JournalPage({super.key});

  void _openForm(BuildContext context, {JournalEntry? entry}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => JournalEntryForm(entry: entry),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncEntries = ref.watch(journalProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trading Journal'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            tooltip: 'Refresh',
            onPressed: () =>
                ref.read(journalProvider.notifier).loadEntries(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openForm(context),
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.background,
        tooltip: 'New journal entry',
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          // ── Emotion filter bar (always visible) ──
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: _ActiveEmotionFilterBar(),
          ),

          const Divider(height: 1, color: AppColors.divider),

          // ── Async body ──
          Expanded(
            child: asyncEntries.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              ),
              error: (error, _) => _ErrorState(
                message: error.toString(),
                onRetry: () =>
                    ref.read(journalProvider.notifier).loadEntries(),
              ),
              data: (entries) => entries.isEmpty
                  ? const _EmptyState()
                  : _EntryList(
                      entries: entries,
                      onEdit: (entry) => _openForm(context, entry: entry),
                      onDelete: (entry) =>
                          ref.read(journalProvider.notifier).deleteEntry(entry.id),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Companion provider for the active emotion chip selection ──

/// Mirrors [JournalNotifier._activeEmotion] in UI-observable state so the
/// filter chips show the correct selected visual without exposing the notifier's
/// private field.
final _activeEmotionProvider = StateProvider<EmotionTag?>((ref) => null);

// ── Active Emotion Filter Bar ──

/// Wraps [EmotionFilterBar] and keeps [_activeEmotionProvider] in sync so
/// the selected chip reflects the current filter after rebuilds.
class _ActiveEmotionFilterBar extends ConsumerWidget {
  const _ActiveEmotionFilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeEmotion = ref.watch(_activeEmotionProvider);
    return EmotionFilterBar(
      activeEmotion: activeEmotion,
      onSelect: (tag) =>
          ref.read(_activeEmotionProvider.notifier).state = tag,
    );
  }
}

// ── Entry List ──

class _EntryList extends StatelessWidget {
  const _EntryList({
    required this.entries,
    required this.onEdit,
    required this.onDelete,
  });

  final List<JournalEntry> entries;
  final ValueChanged<JournalEntry> onEdit;
  final ValueChanged<JournalEntry> onDelete;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 80),
      itemCount: entries.length,
      itemBuilder: (_, i) {
        final entry = entries[i];
        return Dismissible(
          key: ValueKey(entry.id),
          direction: DismissDirection.endToStart,
          confirmDismiss: (_) async {
            return await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: AppColors.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: const BorderSide(color: AppColors.border),
                    ),
                    title: Text(
                      'Delete Entry',
                      style: GoogleFonts.orbitron(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    content: Text(
                      'Delete "${entry.title}"? This cannot be undone.',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(false),
                        child: Text('Cancel',
                            style:
                                GoogleFonts.inter(color: AppColors.textMuted)),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.danger),
                        onPressed: () => Navigator.of(ctx).pop(true),
                        child: Text(
                          'Delete',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ) ??
                false;
          },
          onDismissed: (_) => onDelete(entry),
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.delete_outline,
                color: AppColors.danger, size: 24),
          ),
          child: JournalEntryCard(
            entry: entry,
            onTap: () => onEdit(entry),
          ),
        );
      },
    );
  }
}

// ── Empty State ──

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.menu_book_outlined,
              size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'No entries yet',
            style: GoogleFonts.orbitron(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to log your first journal entry.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Error State ──

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
            const Icon(Icons.error_outline,
                size: 48, color: AppColors.danger),
            const SizedBox(height: 16),
            Text(
              'Failed to load entries',
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
