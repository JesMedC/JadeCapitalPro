import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dashboard_api.dart';
import '../../../core/network/providers.dart';
import '../../../core/network/trades_api.dart';

// ── Models ──

class Account {
  final String id;
  final String name;
  final String marketType;
  final double balance;
  final String currency;
  final bool isDefault;
  final String? broker;
  final double initialBalance;

  const Account({
    required this.id,
    required this.name,
    required this.marketType,
    required this.balance,
    required this.currency,
    this.isDefault = false,
    this.broker,
    this.initialBalance = 0,
  });

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String,
        name: json['name'] as String,
        marketType: (json['marketType'] ?? json['market_type'] ?? 'binary') as String,
        balance: double.tryParse(json['balance'].toString()) ?? 0,
        currency: json['currency'] as String? ?? 'USD',
        isDefault: json['isDefault'] as bool? ?? false,
        broker: json['broker'] as String?,
        initialBalance:
            double.tryParse(json['initialBalance']?.toString() ?? json['initial_balance']?.toString() ?? '0') ?? 0,
      );
}

// ── ALL-accounts sentinel ──

/// A synthetic sentinel that represents the "ALL accounts" aggregate view.
/// Its id is the literal string 'all' — never a real UUID.
class AllAccountSentinel extends Account {
  const AllAccountSentinel({double balance = 0})
      : super(
          id: 'all',
          name: 'ALL',
          marketType: 'all',
          balance: balance,
          currency: 'USD',
          isDefault: false,
          broker: null,
          initialBalance: 0,
        );
}

/// The single shared sentinel instance (balance updated via copyWith-style).
Account buildAllSentinel({double balance = 0}) =>
    AllAccountSentinel(balance: balance);

/// Returns true when [account] is the ALL-accounts sentinel.
bool isAllSentinel(Account? account) => account?.id == 'all';

class EquityPoint {
  final DateTime date;
  final double cum;

  const EquityPoint({required this.date, required this.cum});

  // Backend returns: { date: "YYYY-MM-DD", cum: 0.0 }
  factory EquityPoint.fromJson(Map<String, dynamic> json) => EquityPoint(
        date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
        cum: double.tryParse(json['cum'].toString()) ?? 0,
      );
}

class OverallStats {
  final double winRate;
  final double profitFactor;
  final double avgWin;
  final double avgLoss;
  final int totalWins;
  final int totalLosses;
  final int totalClosed;

  const OverallStats({
    this.winRate = 0,
    this.profitFactor = 0,
    this.avgWin = 0,
    this.avgLoss = 0,
    this.totalWins = 0,
    this.totalLosses = 0,
    this.totalClosed = 0,
  });

  // Backend returns camelCase: win_rate, profit_factor, etc.
  factory OverallStats.fromJson(Map<String, dynamic> json) => OverallStats(
        winRate: double.tryParse(json['winRate']?.toString() ?? '0') ?? 0,
        profitFactor: double.tryParse(json['profitFactor']?.toString() ?? '0') ?? 0,
        avgWin: double.tryParse(json['avgWin']?.toString() ?? '0') ?? 0,
        avgLoss: double.tryParse(json['avgLoss']?.toString() ?? '0') ?? 0,
        totalWins: json['totalWins'] as int? ?? 0,
        totalLosses: json['totalLosses'] as int? ?? 0,
        totalClosed: json['totalClosed'] as int? ?? 0,
      );
}

class RiskStatus {
  final String overallLevel;
  final double dailyPnl;
  final double dailyLossPct;
  final double maxDailyLossPct;
  final int tradesToday;
  final int maxTradesSession;
  final String tradesLevel;
  final String lossLevel;
  final bool blocked;

  const RiskStatus({
    this.overallLevel = 'ok',
    this.dailyPnl = 0,
    this.dailyLossPct = 0,
    this.maxDailyLossPct = 5,
    this.tradesToday = 0,
    this.maxTradesSession = 20,
    this.tradesLevel = 'ok',
    this.lossLevel = 'ok',
    this.blocked = false,
  });

  factory RiskStatus.fromJson(Map<String, dynamic> json) => RiskStatus(
        overallLevel: json['overallLevel'] as String? ?? 'ok',
        dailyPnl: double.tryParse(json['dailyPnl']?.toString() ?? '0') ?? 0,
        dailyLossPct: double.tryParse(json['dailyLossPct']?.toString() ?? '0') ?? 0,
        maxDailyLossPct: double.tryParse(json['maxDailyLossPct']?.toString() ?? '5') ?? 5,
        tradesToday: json['tradesToday'] as int? ?? 0,
        maxTradesSession: json['maxTradesSession'] as int? ?? 20,
        tradesLevel: json['tradesLevel'] as String? ?? 'ok',
        lossLevel: json['lossLevel'] as String? ?? 'ok',
        blocked: json['blocked'] as bool? ?? false,
      );
}

class OpenTrade {
  final String id;
  final String instrument;
  final String direction;
  final double investment;
  final double? payoutPct;
  final double? entryPrice;
  final String type;
  final String status;
  final DateTime createdAt;

  const OpenTrade({
    required this.id,
    required this.instrument,
    required this.direction,
    required this.investment,
    this.payoutPct,
    this.entryPrice,
    required this.type,
    this.status = 'open',
    required this.createdAt,
  });

  factory OpenTrade.fromJson(Map<String, dynamic> json, {String tradeType = 'binary'}) => OpenTrade(
        id: json['id'] as String,
        instrument: json['instrument'] as String,
        direction: json['direction'] as String,
        investment: double.tryParse(json['amount']?.toString() ?? json['investment']?.toString() ?? '0') ?? 0,
        payoutPct: double.tryParse(json['payoutPct']?.toString() ?? json['payout_pct']?.toString() ?? ''),
        entryPrice: double.tryParse(json['entryPrice']?.toString() ?? json['entry_price']?.toString() ?? ''),
        type: json['type'] as String? ?? tradeType,
        status: json['status'] as String? ?? 'open',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}

class GoalProgress {
  final String id;
  final String title;
  final double currentValue;
  final double targetValue;
  final double progressPct;
  final bool isCompleted;
  final bool isActive;
  final int daysRemaining;

  const GoalProgress({
    required this.id,
    required this.title,
    this.currentValue = 0,
    this.targetValue = 0,
    this.progressPct = 0,
    this.isCompleted = false,
    this.isActive = true,
    this.daysRemaining = 0,
  });

  factory GoalProgress.fromJson(Map<String, dynamic> json) => GoalProgress(
        id: json['id'] as String,
        title: json['title'] as String? ?? json['name'] as String? ?? '',
        currentValue: double.tryParse(json['currentValue']?.toString() ?? json['current']?.toString() ?? '0') ?? 0,
        targetValue: double.tryParse(json['targetValue']?.toString() ?? json['target']?.toString() ?? '0') ?? 0,
        progressPct: double.tryParse(json['progressPct']?.toString() ?? '0') ?? 0,
        isCompleted: json['isCompleted'] as bool? ?? false,
        isActive: json['isActive'] as bool? ?? true,
        daysRemaining: json['daysRemaining'] as int? ?? 0,
      );
}

// ── Aggregate model ──

class AggregateData {
  final double totalBalance;
  final double combinedPnl;
  final double combinedWinRate;
  final List<EquityPoint> combinedEquityCurve;
  final OverallStats overall;
  final List<Account> accounts;

  const AggregateData({
    this.totalBalance = 0,
    this.combinedPnl = 0,
    this.combinedWinRate = 0,
    this.combinedEquityCurve = const [],
    required this.overall,
    this.accounts = const [],
  });

  factory AggregateData.fromJson(Map<String, dynamic> json) {
    final curveRaw = json['combinedEquityCurve'] as List? ?? [];
    final accountsRaw = json['accounts'] as List? ?? [];
    final overallJson = json['overall'] as Map<String, dynamic>?;
    return AggregateData(
      totalBalance: double.tryParse(json['totalBalance']?.toString() ?? '0') ?? 0,
      combinedPnl: double.tryParse(json['combinedPnl']?.toString() ?? '0') ?? 0,
      combinedWinRate: double.tryParse(json['combinedWinRate']?.toString() ?? '0') ?? 0,
      combinedEquityCurve: curveRaw
          .map((e) => EquityPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      overall: overallJson != null ? OverallStats.fromJson(overallJson) : const OverallStats(),
      accounts: accountsRaw
          .map((e) => Account.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

// ── Dashboard State ──

class DashboardState {
  final List<Account> accounts;
  final Account? selectedAccount;
  final OverallStats? overall;
  final List<EquityPoint> equityCurve;
  final RiskStatus? risk;
  final List<OpenTrade> openTrades;
  final List<GoalProgress> goals;
  final bool isLoading;
  final bool isRefreshing;
  final String? errorMessage;

  const DashboardState({
    this.accounts = const [],
    this.selectedAccount,
    this.overall,
    this.equityCurve = const [],
    this.risk,
    this.openTrades = const [],
    this.goals = const [],
    this.isLoading = false,
    this.isRefreshing = false,
    this.errorMessage,
  });

  double get balance => selectedAccount?.balance ?? 0;
  String get currency => selectedAccount?.currency ?? 'USD';

  /// True when the ALL-accounts aggregate view is active.
  bool get isAllMode => isAllSentinel(selectedAccount);

  DashboardState copyWith({
    List<Account>? accounts,
    Account? selectedAccount,
    OverallStats? overall,
    List<EquityPoint>? equityCurve,
    RiskStatus? risk,
    List<OpenTrade>? openTrades,
    List<GoalProgress>? goals,
    bool? isLoading,
    bool? isRefreshing,
    String? errorMessage,
    bool clearError = false,
    bool clearSelectedAccount = false,
  }) =>
      DashboardState(
        accounts: accounts ?? this.accounts,
        selectedAccount: clearSelectedAccount ? null : (selectedAccount ?? this.selectedAccount),
        overall: overall ?? this.overall,
        equityCurve: equityCurve ?? this.equityCurve,
        risk: risk ?? this.risk,
        openTrades: openTrades ?? this.openTrades,
        goals: goals ?? this.goals,
        isLoading: isLoading ?? this.isLoading,
        isRefreshing: isRefreshing ?? this.isRefreshing,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );
}

// ── StateNotifier ──

class DashboardNotifier extends StateNotifier<DashboardState> {
  DashboardNotifier({
    required DashboardApi dashboardApi,
    required TradesApi tradesApi,
  })  : _dashboardApi = dashboardApi,
        _tradesApi = tradesApi,
        super(const DashboardState(isLoading: true)) {
    _init();
  }

  final DashboardApi _dashboardApi;
  final TradesApi _tradesApi;
  Timer? _refreshTimer;

  Future<void> _init() async {
    try {
      final accountsRaw = await _dashboardApi.getAccounts();
      final realAccounts = accountsRaw
          .map((e) => Account.fromJson(e))
          .toList();

      // Prepend the ALL sentinel so it appears first in the selector
      final accounts = <Account>[
        buildAllSentinel(),
        ...realAccounts,
      ];

      state = state.copyWith(
        accounts: accounts,
        // Start on the first REAL account (index 1), not the sentinel
        selectedAccount: realAccounts.isNotEmpty ? realAccounts.first : null,
      );

      if (realAccounts.isNotEmpty) {
        await _loadDashboard(realAccounts.first.id);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      debugPrint('[DashboardNotifier] Init error: $e');
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to load accounts',
      );
    }
  }

  Future<void> selectAccount(Account account) async {
    if (account.id == state.selectedAccount?.id) return;

    // Branch on ALL sentinel
    if (isAllSentinel(account)) {
      _refreshTimer?.cancel();
      state = state.copyWith(
        selectedAccount: account,
        isLoading: true,
        openTrades: [],
        goals: [],
      );
      await _loadAggregate();
      return;
    }

    state = state.copyWith(selectedAccount: account, isLoading: true);
    await _loadDashboard(account.id);
  }

  Future<void> _loadAggregate() async {
    try {
      final raw = await _dashboardApi.getAggregate();
      final data = AggregateData.fromJson(raw);

      state = state.copyWith(
        selectedAccount: buildAllSentinel(balance: data.totalBalance),
        overall: data.overall,
        equityCurve: data.combinedEquityCurve,
        risk: null,
        openTrades: [],
        goals: [],
        isLoading: false,
        isRefreshing: false,
        clearError: true,
      );
      // No auto-refresh for aggregate view — user re-clicks the tab to refresh
    } catch (e) {
      debugPrint('[DashboardNotifier] Aggregate error: $e');
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: 'Failed to load aggregate data',
      );
    }
  }

  Future<void> _loadDashboard(String accountId) async {
    try {
      final raw = await _dashboardApi.getDashboard(accountId);
      final data = raw as Map<String, dynamic>;

      // Parse account (and update balance)
      final accountJson = data['account'] as Map<String, dynamic>?;
      Account? updatedAccount = state.selectedAccount;
      if (accountJson != null) {
        updatedAccount = Account.fromJson(accountJson);
        final updatedAccounts = state.accounts.map((a) {
          // Preserve the ALL sentinel; update the matching real account
          if (isAllSentinel(a)) return a;
          return a.id == updatedAccount!.id ? updatedAccount : a;
        }).toList();
        state = state.copyWith(accounts: updatedAccounts);
      }

      // Parse overall stats
      final overallJson = data['overall'] as Map<String, dynamic>?;
      final overall = overallJson != null ? OverallStats.fromJson(overallJson) : null;

      // Parse equity curve: backend returns [{ date, cum }]
      final equityRaw = data['equityCurve'] as List? ?? [];
      final equityCurve = equityRaw
          .map((e) => EquityPoint.fromJson(e as Map<String, dynamic>))
          .toList();

      // Parse risk
      final riskJson = data['risk'] as Map<String, dynamic>?;
      final risk = riskJson != null ? RiskStatus.fromJson(riskJson) : null;

      // Parse open trades: backend returns { binary: [...], forex: [...] }
      final openTradesMap = data['openTrades'] as Map<String, dynamic>? ?? {};
      final binaryTrades = (openTradesMap['binary'] as List? ?? [])
          .map((e) => OpenTrade.fromJson(e as Map<String, dynamic>, tradeType: 'binary'))
          .toList();
      final forexTrades = (openTradesMap['forex'] as List? ?? [])
          .map((e) => OpenTrade.fromJson(e as Map<String, dynamic>, tradeType: 'forex'))
          .toList();
      final openTrades = [...binaryTrades, ...forexTrades];

      // Parse goals
      final goalsRaw = data['goals'] as List? ?? [];
      final goals = goalsRaw
          .map((e) => GoalProgress.fromJson(e as Map<String, dynamic>))
          .toList();

      state = state.copyWith(
        selectedAccount: updatedAccount,
        overall: overall,
        equityCurve: equityCurve,
        risk: risk,
        openTrades: openTrades,
        goals: goals.where((g) => g.isActive).toList(),
        isLoading: false,
        isRefreshing: false,
        clearError: true,
      );

      _startAutoRefresh(accountId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Load error: $e');
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: 'Failed to load dashboard: $e',
      );
    }
  }

  Future<void> refresh() async {
    final account = state.selectedAccount;
    if (account == null) return;
    state = state.copyWith(isRefreshing: true);
    if (isAllSentinel(account)) {
      await _loadAggregate();
    } else {
      await _loadDashboard(account.id);
    }
  }

  void _startAutoRefresh(String accountId) {
    _refreshTimer?.cancel();
    // Guard: do not start auto-refresh when ALL sentinel is active
    if (accountId == 'all') return;
    _refreshTimer = Timer.periodic(const Duration(seconds: 8), (_) async {
      if (mounted) {
        // Re-check in case user switched to ALL tab during the interval
        final current = state.selectedAccount;
        if (current != null && !isAllSentinel(current)) {
          await _loadDashboard(current.id);
        }
      }
    });
  }

  Future<void> openTrade({
    required String accountId,
    required String instrument,
    required String direction,
    required double investment,
    double payoutPct = 0.77,
    String expiryTime = '5m',
    double? entryPrice,
    double? stopLoss,
    double? takeProfit,
    required String marketType,
  }) async {
    try {
      final body = <String, dynamic>{
        'accountId': accountId,
        'instrument': instrument,
        'direction': direction,
        'investment': investment,
      };
      if (marketType == 'binary') {
        body['payoutPct'] = payoutPct;
        body['expiryTime'] = expiryTime;
      } else {
        body['entryPrice'] = entryPrice ?? 0;
        if (stopLoss != null) body['stopLoss'] = stopLoss;
        if (takeProfit != null) body['takeProfit'] = takeProfit;
      }
      await _tradesApi.openTrade(body);
      await _loadDashboard(accountId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Open trade error: $e');
      state = state.copyWith(errorMessage: 'Failed to open trade: $e');
    }
  }

  Future<void> closeBinary(String tradeId, String result) async {
    try {
      await _tradesApi.closeBinary(tradeId, result);
      state = state.copyWith(
        openTrades: state.openTrades.where((t) => t.id != tradeId).toList(),
      );
      // Refresh account balance
      final accId = state.selectedAccount?.id;
      if (accId != null) await _loadDashboard(accId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Close binary error: $e');
      state = state.copyWith(errorMessage: 'Failed to close trade');
    }
  }

  Future<void> closeForex(String tradeId, double exitPrice) async {
    try {
      await _tradesApi.closeForex(tradeId, exitPrice);
      state = state.copyWith(
        openTrades: state.openTrades.where((t) => t.id != tradeId).toList(),
      );
      final accId = state.selectedAccount?.id;
      if (accId != null) await _loadDashboard(accId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Close forex error: $e');
      state = state.copyWith(errorMessage: 'Failed to close trade');
    }
  }

  Future<void> deposit(String accountId, double amount) async {
    try {
      await _dashboardApi.deposit(accountId, amount);
      await _loadDashboard(accountId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Deposit error: $e');
      state = state.copyWith(errorMessage: 'Failed to deposit');
    }
  }

  Future<void> withdraw(String accountId, double amount) async {
    try {
      await _dashboardApi.withdraw(accountId, amount);
      await _loadDashboard(accountId);
    } catch (e) {
      debugPrint('[DashboardNotifier] Withdraw error: $e');
      state = state.copyWith(errorMessage: 'Failed to withdraw');
    }
  }

  void clearError() => state = state.copyWith(clearError: true);

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }
}

// ── Provider ──

final dashboardProvider =
    StateNotifierProvider<DashboardNotifier, DashboardState>((ref) {
  final api = ref.watch(apiClientProvider);
  return DashboardNotifier(
    dashboardApi: DashboardApi(api),
    tradesApi: TradesApi(api),
  );
});
