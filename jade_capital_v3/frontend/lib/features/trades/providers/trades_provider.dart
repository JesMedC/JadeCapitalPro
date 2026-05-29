import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/providers.dart';
import '../../../core/network/trades_api.dart';
import '../../dashboard/providers/dashboard_provider.dart';

// ── Models ──

/// A single trade record.
class Trade {
  final String id;
  final String instrument;
  final String direction; // CALL/PUT or BUY/SELL
  final double investment;
  final double? payout;
  final double? profitLoss;
  final String status; // open, win, loss, be
  final String type; // binary, forex
  final double? entryPrice;
  final double? exitPrice;
  final DateTime createdAt;

  const Trade({
    required this.id,
    required this.instrument,
    required this.direction,
    required this.investment,
    this.payout,
    this.profitLoss,
    required this.status,
    required this.type,
    this.entryPrice,
    this.exitPrice,
    required this.createdAt,
  });

  factory Trade.fromJson(Map<String, dynamic> json) => Trade(
        id: json['id'] as String,
        instrument: json['instrument'] as String,
        direction: (json['direction'] as String).toUpperCase(),
        investment: double.tryParse(json['investment']?.toString() ?? '') ?? 0.0,
        payout: json['payout'] != null
            ? double.tryParse(json['payout'].toString())
            : null,
        profitLoss: json['profitLoss'] != null || json['profit_loss'] != null
            ? double.tryParse((json['profitLoss'] ?? json['profit_loss']).toString())
            : null,
        status: json['status'] as String? ?? 'open',
        type: json['type'] as String? ?? 'binary',
        entryPrice: json['entryPrice'] != null
            ? double.tryParse(json['entryPrice'].toString())
            : null,
        exitPrice: json['exitPrice'] != null
            ? double.tryParse(json['exitPrice'].toString())
            : null,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  bool get isWin => status == 'win';
  bool get isLoss => status == 'loss' || status == 'be';
  bool get isOpen => status == 'open';
}

/// KPI header for trades page.
class TradesKpis {
  final int total;
  final double winRate;
  final double netPnl;

  const TradesKpis({
    required this.total,
    required this.winRate,
    required this.netPnl,
  });
}

enum TradeTab { binary, forex }

enum TradeSort { date, pnl, investment }

enum SortDirection { asc, desc }

/// Full trades page state.
class TradesState {
  final List<Trade> trades;
  final TradeTab activeTab;
  final String statusFilter; // 'all', 'open', 'win', 'loss'
  final TradeSort sortBy;
  final SortDirection sortDir;
  final TradesKpis? kpis;
  final bool isLoading;
  final bool isRefreshing;
  final String? errorMessage;

  const TradesState({
    this.trades = const [],
    this.activeTab = TradeTab.binary,
    this.statusFilter = 'all',
    this.sortBy = TradeSort.date,
    this.sortDir = SortDirection.desc,
    this.kpis,
    this.isLoading = false,
    this.isRefreshing = false,
    this.errorMessage,
  });

  TradesState copyWith({
    List<Trade>? trades,
    TradeTab? activeTab,
    String? statusFilter,
    TradeSort? sortBy,
    SortDirection? sortDir,
    TradesKpis? kpis,
    bool? isLoading,
    bool? isRefreshing,
    String? errorMessage,
    bool clearError = false,
  }) =>
      TradesState(
        trades: trades ?? this.trades,
        activeTab: activeTab ?? this.activeTab,
        statusFilter: statusFilter ?? this.statusFilter,
        sortBy: sortBy ?? this.sortBy,
        sortDir: sortDir ?? this.sortDir,
        kpis: kpis ?? this.kpis,
        isLoading: isLoading ?? this.isLoading,
        isRefreshing: isRefreshing ?? this.isRefreshing,
        errorMessage:
            clearError ? null : (errorMessage ?? this.errorMessage),
      );
}

// ── StateNotifier ──

class TradesNotifier extends StateNotifier<TradesState> {
  TradesNotifier({
    required TradesApi tradesApi,
    String? accountId,
  })  : _tradesApi = tradesApi,
        _accountId = accountId ?? '',
        super(const TradesState(isLoading: true)) {
    if (_accountId.isNotEmpty) _loadTrades();
  }

  final TradesApi _tradesApi;
  String _accountId;

  void setAccountId(String id) {
    _accountId = id;
    _loadTrades();
  }

  Future<void> _loadTrades() async {
    if (_accountId.isEmpty) {
      state = state.copyWith(isLoading: false, errorMessage: 'No account selected');
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final data = await _tradesApi.getTrades(
        _accountId,
        status: state.statusFilter,
        type: state.activeTab == TradeTab.binary ? 'binary' : 'forex',
        sortBy: _sortByParam,
        sortDir: state.sortDir == SortDirection.desc ? 'desc' : 'asc',
      );

      final tradesRaw = data['trades'] as List;
      final trades = tradesRaw
          .map((e) => Trade.fromJson(e as Map<String, dynamic>))
          .toList();

      final kpisRaw = data['kpis'] as Map<String, dynamic>?;
      final kpis = kpisRaw != null
          ? TradesKpis(
              total: (kpisRaw['total'] as num?)?.toInt() ?? trades.length,
              winRate:
                  (kpisRaw['winRate'] ?? kpisRaw['win_rate'] as num?)
                      ?.toDouble() ??
                  0,
              netPnl:
                  (kpisRaw['netPnl'] ?? kpisRaw['net_pnl'] as num?)
                      ?.toDouble() ??
                  0,
            )
          : null;

      state = state.copyWith(
        trades: trades,
        kpis: kpis,
        isLoading: false,
        isRefreshing: false,
      );
    } on DioException catch (e) {
      debugPrint('[TradesNotifier] Load error: $e');
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: 'Failed to load trades',
      );
    } catch (e) {
      debugPrint('[TradesNotifier] Load error: $e');
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: 'Something went wrong',
      );
    }
  }

  String get _sortByParam {
    switch (state.sortBy) {
      case TradeSort.date:
        return 'createdAt';
      case TradeSort.pnl:
        return 'profitLoss';
      case TradeSort.investment:
        return 'investment';
    }
  }

  void setTab(TradeTab tab) {
    if (tab == state.activeTab) return;
    state = state.copyWith(activeTab: tab);
    _loadTrades();
  }

  void setStatusFilter(String filter) {
    state = state.copyWith(statusFilter: filter);
    _loadTrades();
  }

  void setSort(TradeSort sort) {
    final newDir = state.sortBy == sort && state.sortDir == SortDirection.desc
        ? SortDirection.asc
        : SortDirection.desc;
    state = state.copyWith(sortBy: sort, sortDir: newDir);
    _loadTrades();
  }

  Future<void> refresh() async {
    state = state.copyWith(isRefreshing: true);
    await _loadTrades();
  }

  /// Close a binary trade.
  Future<void> closeBinary(String tradeId, String result) async {
    try {
      await _tradesApi.closeBinary(tradeId, result);
      await _loadTrades();
    } on DioException catch (e) {
      debugPrint('[TradesNotifier] Close binary error: $e');
    }
  }

  /// Close a forex trade with exit price.
  Future<void> closeForex(String tradeId, double exitPrice) async {
    try {
      await _tradesApi.closeForex(tradeId, exitPrice);
      await _loadTrades();
    } on DioException catch (e) {
      debugPrint('[TradesNotifier] Close forex error: $e');
    }
  }

  /// Delete a trade (reverse operation).
  Future<void> deleteTrade(String tradeId) async {
    try {
      await _tradesApi.deleteTrade(tradeId);
      await _loadTrades();
    } on DioException catch (e) {
      debugPrint('[TradesNotifier] Delete trade error: $e');
      state = state.copyWith(errorMessage: 'Failed to delete trade');
    }
  }

  void clearError() => state = state.copyWith(clearError: true);
}

// ── Providers ──

final tradesProvider =
    StateNotifierProvider<TradesNotifier, TradesState>((ref) {
  final api = ref.watch(apiClientProvider);
  final accountId = ref.watch(dashboardProvider.select((s) => s.selectedAccount?.id));
  return TradesNotifier(tradesApi: TradesApi(api), accountId: accountId);
});
