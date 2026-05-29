import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import '../../shared/widgets/loading_indicator.dart';
import 'providers/trades_provider.dart';
import 'widgets/trade_list_tile.dart';

/// Full trade history page with tabs, filters, sort, and KPIs.
class TradesPage extends ConsumerStatefulWidget {
  const TradesPage({super.key});

  @override
  ConsumerState<TradesPage> createState() => _TradesPageState();
}

class _TradesPageState extends ConsumerState<TradesPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        final tab =
            _tabController.index == 0 ? TradeTab.binary : TradeTab.forex;
        ref.read(tradesProvider.notifier).setTab(tab);
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tradesProvider);
    final notifier = ref.read(tradesProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trades'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textMuted,
          indicatorColor: AppColors.primary,
          labelStyle: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          tabs: const [
            Tab(text: 'Binary'),
            Tab(text: 'Forex'),
          ],
        ),
      ),
      body: Column(
        children: [
          // ── KPI header strip ──
          if (state.kpis != null) _KpiHeader(kpis: state.kpis!),

          // ── Filter + Sort row ──
          _FilterSortRow(
            activeFilter: state.statusFilter,
            sortBy: state.sortBy,
            sortDir: state.sortDir,
            onFilterChanged: (f) => notifier.setStatusFilter(f),
            onSortChanged: (s) => notifier.setSort(s),
          ),

          // ── Trade list ──
          Expanded(
            child: _TradeListContent(
              state: state,
              notifier: notifier,
            ),
          ),
        ],
      ),
    );
  }
}

// ── KPI Header Strip ──

class _KpiHeader extends StatelessWidget {
  const _KpiHeader({required this.kpis});

  final TradesKpis kpis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: AppColors.surface,
      child: Row(
        children: [
          _KpiItem(
            label: 'Total',
            value: '${kpis.total}',
            color: AppColors.textPrimary,
          ),
          _KpiDivider(),
          _KpiItem(
            label: 'Win Rate',
            value: '${kpis.winRate.toStringAsFixed(1)}%',
            color: kpis.winRate >= 50 ? AppColors.accent : AppColors.danger,
          ),
          _KpiDivider(),
          _KpiItem(
            label: 'Net P&L',
            value:
                '${kpis.netPnl >= 0 ? '+' : ''}\$${kpis.netPnl.toStringAsFixed(2)}',
            color: kpis.netPnl >= 0 ? AppColors.accent : AppColors.danger,
          ),
        ],
      ),
    );
  }
}

class _KpiItem extends StatelessWidget {
  const _KpiItem({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 11,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 32,
      width: 1,
      color: AppColors.border,
    );
  }
}

// ── Filter + Sort Row ──

class _FilterSortRow extends StatelessWidget {
  const _FilterSortRow({
    required this.activeFilter,
    required this.sortBy,
    required this.sortDir,
    required this.onFilterChanged,
    required this.onSortChanged,
  });

  final String activeFilter;
  final TradeSort sortBy;
  final SortDirection sortDir;
  final ValueChanged<String> onFilterChanged;
  final ValueChanged<TradeSort> onSortChanged;

  static const _filters = ['all', 'open', 'win', 'loss'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.surface,
      child: Row(
        children: [
          // Filter chips
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _filters.map((f) {
                  final isActive = activeFilter == f;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => onFilterChanged(f),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: isActive
                              ? AppColors.primary.withValues(alpha: 0.15)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: isActive
                                ? AppColors.primary
                                : AppColors.border,
                          ),
                        ),
                        child: Text(
                          f.toUpperCase(),
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: isActive
                                ? AppColors.primary
                                : AppColors.textMuted,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Sort buttons
          const SizedBox(width: 4),
          _SortButton(
            label: 'Date',
            isActive: sortBy == TradeSort.date,
            ascending: sortDir == SortDirection.asc,
            onTap: () => onSortChanged(TradeSort.date),
          ),
          const SizedBox(width: 2),
          _SortButton(
            label: 'P&L',
            isActive: sortBy == TradeSort.pnl,
            ascending: sortDir == SortDirection.asc,
            onTap: () => onSortChanged(TradeSort.pnl),
          ),
          const SizedBox(width: 2),
          _SortButton(
            label: 'Inv',
            isActive: sortBy == TradeSort.investment,
            ascending: sortDir == SortDirection.asc,
            onTap: () => onSortChanged(TradeSort.investment),
          ),
        ],
      ),
    );
  }
}

class _SortButton extends StatelessWidget {
  const _SortButton({
    required this.label,
    required this.isActive,
    required this.ascending,
    required this.onTap,
  });

  final String label;
  final bool isActive;
  final bool ascending;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primary.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: isActive ? AppColors.primary : AppColors.textMuted,
              ),
            ),
            if (isActive)
              Icon(
                ascending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 12,
                color: AppColors.primary,
              ),
          ],
        ),
      ),
    );
  }
}

// ── Trade List Content ──

class _TradeListContent extends StatelessWidget {
  const _TradeListContent({
    required this.state,
    required this.notifier,
  });

  final TradesState state;
  final TradesNotifier notifier;

  @override
  Widget build(BuildContext context) {
    // Loading
    if (state.isLoading) {
      return const LoadingIndicator(label: 'Loading trades...');
    }

    // Error
    if (state.errorMessage != null && state.trades.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: AppColors.danger),
            const SizedBox(height: 12),
            Text(
              state.errorMessage!,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => notifier.refresh(),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    // Empty
    if (state.trades.isEmpty) {
      return RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => notifier.refresh(),
        child: ListView(
          children: [
            const SizedBox(height: 80),
            Center(
              child: Column(
                children: [
                  Icon(Icons.swap_horiz,
                      size: 48, color: AppColors.textMuted),
                  const SizedBox(height: 12),
                  Text(
                    'No trades found',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Trade list with pull-to-refresh
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => notifier.refresh(),
      child: ListView.builder(
        padding: const EdgeInsets.only(top: 4, bottom: 24),
        itemCount: state.trades.length,
        itemBuilder: (context, index) {
          return TradeListTile(
            trade: state.trades[index],
            onCloseBinary: (id, result) =>
                notifier.closeBinary(id, result),
            onCloseForex: (id, price) =>
                notifier.closeForex(id, price),
            onDeleteTrade: (id) => notifier.deleteTrade(id),
          );
        },
      ),
    );
  }
}
