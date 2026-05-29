import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'providers/goals_provider.dart';
import 'models/goal.dart';
import 'widgets/create_goal_sheet.dart';
import 'widgets/goal_card.dart';

/// Trading goals page — full CRUD UI with Active / All tab filtering.
///
/// Converted from [StatelessWidget] placeholder to [ConsumerStatefulWidget].
/// Tab state is local (ephemeral UI concern, not domain state).
/// [goalsProvider] auto-initialises when this page is first visited.
class GoalsPage extends ConsumerStatefulWidget {
  const GoalsPage({super.key});

  @override
  ConsumerState<GoalsPage> createState() => _GoalsPageState();
}

class _GoalsPageState extends ConsumerState<GoalsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  /// 0 = Active goals, 1 = All goals.
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(_onTabChanged);
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    final newIndex = _tabController.index;
    if (newIndex == _tabIndex) return;

    setState(() => _tabIndex = newIndex);
    // Reload with updated activeOnly filter.
    ref
        .read(goalsProvider.notifier)
        .loadGoals(activeOnly: newIndex == 0);
  }

  void _openCreateSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => const CreateGoalSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncGoals = ref.watch(goalsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Goals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            tooltip: 'Refresh',
            onPressed: () =>
                ref.read(goalsProvider.notifier).loadGoals(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelStyle: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
          unselectedLabelStyle: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w400,
          ),
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textMuted,
          indicatorColor: AppColors.primary,
          indicatorWeight: 2,
          tabs: const [
            Tab(text: 'Active'),
            Tab(text: 'All'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreateSheet,
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.background,
        tooltip: 'New goal',
        child: const Icon(Icons.add),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Tab 0: Active goals
          _GoalsList(
            asyncGoals: asyncGoals,
            onRetry: () =>
                ref.read(goalsProvider.notifier).loadGoals(activeOnly: true),
          ),
          // Tab 1: All goals
          _GoalsList(
            asyncGoals: asyncGoals,
            onRetry: () =>
                ref.read(goalsProvider.notifier).loadGoals(activeOnly: false),
          ),
        ],
      ),
    );
  }
}

// ── Goals list (shared between tabs) ──

class _GoalsList extends StatelessWidget {
  const _GoalsList({
    required this.asyncGoals,
    required this.onRetry,
  });

  final AsyncValue<List<Goal>> asyncGoals;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return asyncGoals.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
      error: (error, _) => _ErrorState(
        message: error.toString(),
        onRetry: onRetry,
      ),
      data: (goals) => goals.isEmpty
          ? const _EmptyState()
          : _GoalListView(goals: goals),
    );
  }
}

// ── Goals list view ──

class _GoalListView extends StatelessWidget {
  const _GoalListView({required this.goals});

  final List<Goal> goals;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 80),
      itemCount: goals.length,
      itemBuilder: (_, i) => GoalCard(goal: goals[i]),
    );
  }
}

// ── Empty state ──

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.flag_outlined,
              size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'No goals yet',
            style: GoogleFonts.orbitron(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to create your first goal.',
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

// ── Error state ──

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
              'Failed to load goals',
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
