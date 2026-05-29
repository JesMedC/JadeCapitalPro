import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/loading_indicator.dart';
import 'providers/dashboard_provider.dart';
import 'widgets/balance_card.dart';
import 'widgets/equity_chart.dart';
import 'widgets/new_trade_widget.dart';
import 'widgets/open_trades_list.dart';
import 'widgets/risk_bar.dart';
import 'widgets/stats_row.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Shell scaffold with bottom navigation bar
// ─────────────────────────────────────────────────────────────────────────────

/// Shell scaffold with bottom navigation bar.
class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;

    return Scaffold(
      body: child,
      bottomNavigationBar: _BottomNavBar(currentLocation: location),
    );
  }
}

/// Bottom navigation bar with 5 primary tabs + "More" overflow sheet.
///
/// The first 5 tabs (indices 0–4) navigate directly.
/// Index 5 ("More") opens a modal bottom sheet with the secondary tabs
/// (Market, Calendar, Backtest, Settings).
class _BottomNavBar extends StatelessWidget {
  const _BottomNavBar({required this.currentLocation});

  final String currentLocation;

  // Primary tabs — always visible (indices 0–4)
  static const _primaryTabs = <_NavTab>[
    _NavTab(route: '/dashboard',          icon: Icons.home_outlined,        activeIcon: Icons.home,        label: 'Home'),
    _NavTab(route: '/dashboard/trades',   icon: Icons.swap_horiz_outlined,  activeIcon: Icons.swap_horiz,  label: 'Trades'),
    _NavTab(route: '/dashboard/chart',    icon: Icons.show_chart_outlined,  activeIcon: Icons.show_chart,  label: 'Chart'),
    _NavTab(route: '/dashboard/scanner',  icon: Icons.radar_outlined,       activeIcon: Icons.radar,       label: 'Scanner'),
    _NavTab(route: '/dashboard/journal',  icon: Icons.menu_book_outlined,   activeIcon: Icons.menu_book,   label: 'Journal'),
  ];

  // Secondary tabs — shown inside the "More" sheet (no fixed bar index)
  static const _secondaryTabs = <_NavTab>[
    _NavTab(route: '/dashboard/market',    icon: Icons.star_outline,          activeIcon: Icons.star,        label: 'Market'),
    _NavTab(route: '/dashboard/calendar',  icon: Icons.event_note_outlined,   activeIcon: Icons.event_note,  label: 'Calendar'),
    _NavTab(route: '/dashboard/backtest',  icon: Icons.history_edu_outlined,  activeIcon: Icons.history_edu, label: 'Backtest'),
    _NavTab(route: '/dashboard/settings',  icon: Icons.settings_outlined,     activeIcon: Icons.settings,    label: 'Settings'),
  ];

  // Route-to-primary-index lookup (exact routes only; prefix matching handled in code)
  static const _primaryRouteIndex = <String, int>{
    '/dashboard':          0,
    '/dashboard/trades':   1,
    '/dashboard/chart':    2,
    '/dashboard/scanner':  3,
    '/dashboard/journal':  4,
  };

  /// Returns 0–4 for a primary route, 5 for any secondary route, 0 as fallback.
  int _calculateSelectedIndex() {
    // 1. Exact match first (handles root '/dashboard')
    if (_primaryRouteIndex.containsKey(currentLocation)) {
      return _primaryRouteIndex[currentLocation]!;
    }
    // 2. Prefix match for nested primary routes (e.g. /dashboard/trades/123)
    for (final entry in _primaryRouteIndex.entries) {
      if (entry.key != '/dashboard' && currentLocation.startsWith(entry.key)) {
        return entry.value;
      }
    }
    // 3. Any secondary route → index 5 ("More" highlighted)
    for (final tab in _secondaryTabs) {
      if (currentLocation.startsWith(tab.route)) return 5;
    }
    return 0; // fallback to Home
  }

  /// Active icon for the "More" item: shows the active secondary tab's icon,
  /// or falls back to the generic ellipsis.
  IconData _moreActiveIcon() {
    for (final tab in _secondaryTabs) {
      if (currentLocation.startsWith(tab.route)) return tab.activeIcon;
    }
    return Icons.more_horiz;
  }

  /// Inactive icon for the "More" item: shows the active secondary tab's
  /// outlined icon when a secondary route is current, else generic ellipsis.
  IconData _moreIcon() {
    for (final tab in _secondaryTabs) {
      if (currentLocation.startsWith(tab.route)) return tab.icon;
    }
    return Icons.more_horiz;
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _calculateSelectedIndex();

    // Build the 6 bar items: 5 primary + "More"
    final items = <BottomNavigationBarItem>[
      ..._primaryTabs.asMap().entries.map((entry) {
        final isActive = entry.key == selectedIndex;
        return BottomNavigationBarItem(
          icon: Icon(isActive ? entry.value.activeIcon : entry.value.icon),
          label: entry.value.label,
        );
      }),
      BottomNavigationBarItem(
        icon: Icon(selectedIndex == 5 ? _moreActiveIcon() : _moreIcon()),
        label: 'More',
      ),
    ];

    return BottomNavigationBar(
      currentIndex: selectedIndex,
      // Fixed type required to prevent label overflow on narrow screens.
      type: BottomNavigationBarType.fixed,
      onTap: (index) => _onTabTap(context, index),
      items: items,
    );
  }

  void _onTabTap(BuildContext context, int index) {
    if (index == 5) {
      showModalBottomSheet<void>(
        context: context,
        builder: (_) => _MoreTabSheet(
          currentLocation: currentLocation,
          tabs: _secondaryTabs,
        ),
      );
      return;
    }
    if (index >= 0 && index < _primaryTabs.length) {
      context.go(_primaryTabs[index].route);
    }
  }
}

/// Modal bottom sheet listing the secondary navigation tabs.
class _MoreTabSheet extends StatelessWidget {
  const _MoreTabSheet({
    required this.currentLocation,
    required this.tabs,
  });

  final String currentLocation;
  final List<_NavTab> tabs;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.textMuted.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          ...tabs.map((tab) {
            final isActive = currentLocation.startsWith(tab.route);
            return ListTile(
              leading: Icon(
                isActive ? tab.activeIcon : tab.icon,
                color: isActive ? Theme.of(context).colorScheme.primary : null,
              ),
              title: Text(tab.label),
              selected: isActive,
              onTap: () {
                Navigator.pop(context);
                context.go(tab.route);
              },
            );
          }),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _NavTab {
  final String route;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _NavTab({
    required this.route,
    required this.icon,
    required this.activeIcon,
    required this.label,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Home Content
// ─────────────────────────────────────────────────────────────────────────────

class DashboardHomeContent extends ConsumerStatefulWidget {
  const DashboardHomeContent({super.key});

  @override
  ConsumerState<DashboardHomeContent> createState() => _DashboardHomeContentState();
}

class _DashboardHomeContentState extends ConsumerState<DashboardHomeContent> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(dashboardProvider);
    final user = ref.watch(currentUserProvider);
    final authNotifier = ref.read(authStateProvider.notifier);

    ref.listen<DashboardState>(dashboardProvider, (prev, next) {
      if (next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            action: SnackBarAction(
              label: 'DISMISS',
              textColor: Colors.white,
              onPressed: () => ref.read(dashboardProvider.notifier).clearError(),
            ),
          ),
        );
      }
    });

    if (state.isLoading && state.accounts.isEmpty) {
      return Scaffold(
        appBar: _buildAppBar(user?.username, authNotifier),
        body: const LoadingIndicator(label: 'Loading dashboard...'),
      );
    }

    return Scaffold(
      appBar: _buildAppBar(user?.username, authNotifier),
      // Hide trade/deposit FABs when the ALL-accounts aggregate view is active
      floatingActionButton: state.isAllMode
          ? null
          : Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                FloatingActionButton.small(
                  heroTag: 'depositWithdraw',
                  onPressed: () => _openDepositWithdrawSheet(context),
                  backgroundColor: AppColors.accent,
                  foregroundColor: AppColors.background,
                  child: const Icon(Icons.account_balance_wallet),
                  tooltip: 'Deposit / Withdraw',
                ),
                const SizedBox(height: 8),
                FloatingActionButton.extended(
                  heroTag: 'newTrade',
                  onPressed: () => _openNewTradeSheet(context),
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.background,
                  icon: const Icon(Icons.add),
                  label: const Text('New Trade'),
                  tooltip: 'Open a new trade',
                ),
              ],
            ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.read(dashboardProvider.notifier).refresh(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (state.accounts.isNotEmpty) ...[
              _AccountSelector(accounts: state.accounts, selected: state.selectedAccount, onChanged: (a) { if (a != null) ref.read(dashboardProvider.notifier).selectAccount(a); }),
              const SizedBox(height: 16),
            ],
            BalanceCard(accountName: state.selectedAccount?.name ?? 'Account', balance: state.balance, currency: state.currency, marketType: state.selectedAccount?.marketType ?? 'binary'),
            const SizedBox(height: 16),
            if (state.overall != null) ...[StatsRow(overall: state.overall!), const SizedBox(height: 16)],
            EquityChart(points: state.equityCurve),
            const SizedBox(height: 16),
            if (state.risk != null) ...[RiskBar(risk: state.risk!), const SizedBox(height: 16)],
            OpenTradesList(trades: state.openTrades, onCloseBinary: (id, result) => ref.read(dashboardProvider.notifier).closeBinary(id, result), onCloseForex: (id, price) => ref.read(dashboardProvider.notifier).closeForex(id, price)),
            const SizedBox(height: 16),
            if (state.goals.isNotEmpty) ...[_GoalsSection(goals: state.goals), const SizedBox(height: 16)],
            if (state.isRefreshing) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Center(child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary)))),
          ],
        ),
      ),
    );
  }

  void _openNewTradeSheet(BuildContext context) {
    showModalBottomSheet<void>(context: context, isScrollControlled: true, backgroundColor: Colors.transparent, enableDrag: true, builder: (_) => const NewTradeWidget());
  }

  void _openDepositWithdrawSheet(BuildContext context) {
    final state = ref.read(dashboardProvider);
    showModalBottomSheet<void>(context: context, isScrollControlled: true, backgroundColor: Colors.transparent, enableDrag: true, builder: (_) => _DepositWithdrawSheet(account: state.selectedAccount));
  }

  PreferredSizeWidget _buildAppBar(String? username, AuthNotifier authNotifier) {
    return AppBar(title: const Text('JadeCapital Pro'), actions: [IconButton(icon: const Icon(Icons.logout, size: 20), tooltip: 'Logout', onPressed: () => authNotifier.logout())]);
  }
}

// ── Account Selector ──
class _AccountSelector extends StatelessWidget {
  const _AccountSelector({required this.accounts, required this.selected, required this.onChanged});
  final List<Account> accounts;
  final Account? selected;
  final ValueChanged<Account?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: AppColors.cardBackground, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Account>(
          value: selected,
          isExpanded: true,
          icon: const Icon(Icons.expand_more, color: AppColors.textSecondary, size: 20),
          dropdownColor: AppColors.surface,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
          items: accounts.map((a) {
            final isAll = isAllSentinel(a);
            return DropdownMenuItem<Account>(
              value: a,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isAll
                        ? '◈  All Accounts'
                        : '${a.name}  (\$${a.balance.toStringAsFixed(0)})',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: isAll ? FontWeight.w600 : FontWeight.normal,
                      color: isAll ? AppColors.primary : AppColors.textPrimary,
                    ),
                  ),
                  // Show broker sub-label for real accounts with a broker set
                  if (!isAll && a.broker != null && a.broker!.isNotEmpty)
                    Text(
                      a.broker!,
                      style: GoogleFonts.inter(fontSize: 10, color: AppColors.textMuted),
                    ),
                ],
              ),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

// ── Goals Section ──
class _GoalsSection extends StatelessWidget {
  const _GoalsSection({required this.goals});
  final List<GoalProgress> goals;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.cardBackground, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Goals', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)), const SizedBox(height: 12), ...goals.map((g) => _GoalBar(goal: g))],
      ),
    );
  }
}

class _GoalBar extends StatelessWidget {
  const _GoalBar({required this.goal});
  final GoalProgress goal;

  Color get _barColor {
    if (goal.progressPct >= 80) return AppColors.accent;
    if (goal.progressPct >= 50) return AppColors.primary;
    return AppColors.warning;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(goal.title, style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary)), Text('${goal.currentValue.toStringAsFixed(0)} / ${goal.targetValue.toStringAsFixed(0)}', style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppColors.textMuted))]),
        const SizedBox(height: 4),
        ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: goal.progressPct / 100, minHeight: 6, backgroundColor: AppColors.surfaceLight, valueColor: AlwaysStoppedAnimation(_barColor))),
      ]),
    );
  }
}

// ── Deposit / Withdraw Sheet ──
class _DepositWithdrawSheet extends ConsumerStatefulWidget {
  const _DepositWithdrawSheet({required this.account});
  final Account? account;

  @override
  ConsumerState<_DepositWithdrawSheet> createState() => _DepositWithdrawSheetState();
}

class _DepositWithdrawSheetState extends ConsumerState<_DepositWithdrawSheet> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _amountController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final account = widget.account;
    if (account == null) return const Padding(padding: EdgeInsets.all(24), child: Text('No account selected'));

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [Icon(Icons.account_balance_wallet, color: AppColors.primary, size: 24), const SizedBox(width: 12), Text('Manage Funds', style: GoogleFonts.orbitron(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)), const Spacer(), IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.of(context).pop())]),
        const SizedBox(height: 16),
        Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.cardBackground, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.border)), child: Text('\${account.name} - \$${account.balance.toStringAsFixed(2)}', style: GoogleFonts.inter(fontSize: 12, color: AppColors.textMuted))),
        const SizedBox(height: 16),
        TabBar(controller: _tabController, labelColor: AppColors.primary, unselectedLabelColor: AppColors.textMuted, indicatorColor: AppColors.primary, tabs: const [Tab(text: 'Deposit'), Tab(text: 'Withdraw')]),
        const SizedBox(height: 20),
        TextField(controller: _amountController, keyboardType: const TextInputType.numberWithOptions(decimal: true), style: GoogleFonts.jetBrainsMono(fontSize: 24, color: AppColors.textPrimary), decoration: InputDecoration(labelText: 'Amount', labelStyle: GoogleFonts.inter(color: AppColors.textSecondary), prefixText: '\$ ', prefixStyle: GoogleFonts.jetBrainsMono(fontSize: 24, color: AppColors.primary), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary)))),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () => _handleSubmit(account), style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))), child: Consumer(builder: (context, ref, _) { final isDeposit = _tabController.index == 0; return Text(isDeposit ? 'DEPOSIT' : 'WITHDRAW', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.background)); }))),
        const SizedBox(height: 8),
      ]),
    );
  }

  void _handleSubmit(Account account) {
    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter a valid amount'), backgroundColor: AppColors.danger));
      return;
    }
    final isDeposit = _tabController.index == 0;
    final notifier = ref.read(dashboardProvider.notifier);
    if (isDeposit) {
      notifier.deposit(account.id, amount);
    } else {
      if (amount > account.balance) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Insufficient balance'), backgroundColor: AppColors.danger));
        return;
      }
      notifier.withdraw(account.id, amount);
    }
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${isDeposit ? 'Deposit' : 'Withdrawal'} successful'), backgroundColor: AppColors.accent));
  }
}
