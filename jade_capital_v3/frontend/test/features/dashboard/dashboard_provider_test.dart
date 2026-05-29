// Sprint 18 — Tests for DashboardNotifier + DashboardHomeContent FAB gating.
//
// Covers S16 gap:
//   AC-DP-01: selectAccount(AllAccountSentinel) → isAllMode == true
//   AC-DP-02: selectAccount(realAccount) → loads data, isLoading == false
//   AC-DP-03: isAllMode getter — false for real account, true for sentinel
//   AC-DP-04 (widget): FABs absent when isAllMode == true

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/auth/auth_provider.dart';
import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/dashboard_api.dart';
import 'package:jade_capital_v3/core/network/trades_api.dart';
import 'package:jade_capital_v3/features/dashboard/dashboard_page.dart';
import 'package:jade_capital_v3/features/dashboard/providers/dashboard_provider.dart';

// ── Fake ApiClient ─────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

// ── Fake DashboardApi ─────────────────────────────────────────────────────────

class _FakeDashboardApi extends DashboardApi {
  _FakeDashboardApi({
    List<Map<String, dynamic>>? accounts,
    bool shouldFailAggregate = false,
  })  : _accounts = accounts ?? const [],
        _shouldFailAggregate = shouldFailAggregate,
        super(_FakeApiClient());

  final List<Map<String, dynamic>> _accounts;
  final bool _shouldFailAggregate;

  @override
  Future<List<Map<String, dynamic>>> getAccounts() async => List.of(_accounts);

  @override
  Future<Map<String, dynamic>> getDashboard(String accountId) async {
    final account = _accounts.firstWhere(
      (a) => a['id'] == accountId,
      orElse: () => _accounts.isNotEmpty ? _accounts.first : {'id': accountId, 'name': 'Test', 'balance': 0},
    );
    return {
      'account': account,
      'overall': {
        'winRate': 0,
        'profitFactor': 1,
        'avgWin': 0,
        'avgLoss': 0,
        'totalWins': 0,
        'totalLosses': 0,
        'totalClosed': 0,
      },
      'equityCurve': <Map<String, dynamic>>[],
      'risk': {
        'overallLevel': 'low',
        'dailyPnl': 0,
        'dailyLossPct': 0,
        'maxDailyLossPct': 5,
        'tradesToday': 0,
        'maxTradesSession': 20,
        'tradesLevel': 'low',
        'lossLevel': 'low',
        'blocked': false,
      },
      'openTrades': {'binary': <Map<String, dynamic>>[], 'forex': <Map<String, dynamic>>[]},
      'goals': <Map<String, dynamic>>[],
    };
  }

  @override
  Future<Map<String, dynamic>> getAggregate() async {
    if (_shouldFailAggregate) throw Exception('aggregate failed');
    final totalBalance = _accounts.fold<double>(
      0,
      (s, a) => s + (double.tryParse(a['balance']?.toString() ?? '0') ?? 0),
    );
    return {
      'totalBalance': totalBalance,
      'combinedPnl': 0,
      'combinedWinRate': 0,
      'combinedEquityCurve': <Map<String, dynamic>>[],
      'overall': {
        'winRate': 0,
        'profitFactor': 1,
        'avgWin': 0,
        'avgLoss': 0,
        'totalWins': 0,
        'totalLosses': 0,
        'totalClosed': 0,
      },
      'accounts': _accounts,
    };
  }
}

// ── Fake TradesApi ────────────────────────────────────────────────────────────

class _FakeTradesApi extends TradesApi {
  _FakeTradesApi() : super(_FakeApiClient());

  @override
  Future<Map<String, dynamic>> openTrade(Map<String, dynamic> data) async =>
      throw UnimplementedError();

  @override
  Future<void> closeBinary(String id, String result) async =>
      throw UnimplementedError();

  @override
  Future<void> closeForex(String id, double exitPrice) async =>
      throw UnimplementedError();
}

// ── Account fixtures ──────────────────────────────────────────────────────────

Map<String, dynamic> _makeAccountJson({
  String id = 'acct-001',
  String name = 'Test Account',
  double balance = 1000,
}) =>
    {
      'id': id,
      'name': name,
      'marketType': 'forex',
      'balance': balance,
      'currency': 'USD',
      'isDefault': false,
      'broker': null,
      'initialBalance': balance,
    };

// ── Helpers ───────────────────────────────────────────────────────────────────

DashboardNotifier _buildNotifier({
  List<Map<String, dynamic>> accounts = const [],
  bool shouldFailAggregate = false,
}) {
  return DashboardNotifier(
    dashboardApi: _FakeDashboardApi(
      accounts: accounts,
      shouldFailAggregate: shouldFailAggregate,
    ),
    tradesApi: _FakeTradesApi(),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('DashboardNotifier', () {
    // AC-DP-01: selectAccount(AllAccountSentinel) → isAllMode == true
    test('AC-DP-01: selectAccount(AllAccountSentinel) sets isAllMode = true',
        () async {
      final accounts = [_makeAccountJson()];
      final notifier = _buildNotifier(accounts: accounts);

      // Wait for _init() to complete
      await Future<void>.delayed(const Duration(milliseconds: 50));

      // Select the ALL sentinel
      await notifier.selectAccount(AllAccountSentinel());

      expect(notifier.state.isAllMode, isTrue);
      expect(notifier.state.selectedAccount?.id, equals('all'));
    });

    // AC-DP-02: selectAccount(realAccount) → isLoading == false after load
    test('AC-DP-02: selectAccount(realAccount) loads data and sets isLoading = false',
        () async {
      final accounts = [
        _makeAccountJson(id: 'acct-001'),
        _makeAccountJson(id: 'acct-002', name: 'Second Account'),
      ];
      final notifier = _buildNotifier(accounts: accounts);

      // Wait for initial load
      await Future<void>.delayed(const Duration(milliseconds: 50));

      // Explicitly select second account
      final secondAccount = Account.fromJson(accounts[1]);
      await notifier.selectAccount(secondAccount);

      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.selectedAccount?.id, equals('acct-002'));
    });

    // AC-DP-03: isAllMode getter correctness
    test('AC-DP-03: isAllMode is false for real account, true for sentinel', () async {
      final notifier = _buildNotifier(accounts: [_makeAccountJson()]);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      // Initial state: real account → not all mode
      expect(notifier.state.isAllMode, isFalse);

      // Select ALL sentinel
      await notifier.selectAccount(AllAccountSentinel());
      expect(notifier.state.isAllMode, isTrue);

      // Select real account again
      final realAccount = Account.fromJson(_makeAccountJson());
      await notifier.selectAccount(realAccount);
      expect(notifier.state.isAllMode, isFalse);
    });
  });

  // AC-DP-04: FABs absent when isAllMode = true
  group('DashboardHomeContent FAB gating', () {
    // Shared auth override — provides a stub authenticated user so that
    // DashboardHomeContent._buildAppBar() and currentUserProvider don't throw.
    final _fakeUser = User(
      id: 'user-test',
      username: 'trader',
      email: 'trader@jade.test',
      createdAt: DateTime.utc(2026, 1, 1),
    );

    List<Override> _authOverrides(User fakeUser) => [
          // Override currentUserProvider so _buildAppBar receives a user
          currentUserProvider.overrideWithValue(fakeUser),
        ];

    testWidgets('AC-DP-04: FloatingActionButtons absent when isAllMode = true',
        (tester) async {
      // Build a notifier pre-set to ALL mode
      final fakeNotifier = _buildNotifier(accounts: [_makeAccountJson()]);
      // Wait for init
      await Future<void>.delayed(const Duration(milliseconds: 50));
      // Force ALL mode by selecting the sentinel directly
      fakeNotifier.state = fakeNotifier.state.copyWith(
        selectedAccount: AllAccountSentinel(),
        isLoading: false,
        accounts: [AllAccountSentinel(), Account.fromJson(_makeAccountJson())],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dashboardProvider.overrideWith((_) => fakeNotifier),
            ..._authOverrides(_fakeUser),
          ],
          child: const MaterialApp(
            home: DashboardHomeContent(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      // When isAllMode == true, no FloatingActionButton should be present
      final fabFinder = find.byWidgetPredicate(
        (w) => w is FloatingActionButton,
      );
      expect(fabFinder, findsNothing);
    });

    testWidgets('AC-DP-04b: FloatingActionButtons present when real account selected',
        (tester) async {
      final fakeNotifier = _buildNotifier(accounts: [_makeAccountJson()]);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      // Ensure a real account is selected
      final accounts = [AllAccountSentinel(), Account.fromJson(_makeAccountJson())];
      fakeNotifier.state = fakeNotifier.state.copyWith(
        selectedAccount: accounts[1],
        isLoading: false,
        accounts: accounts,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dashboardProvider.overrideWith((_) => fakeNotifier),
            ..._authOverrides(_fakeUser),
          ],
          child: const MaterialApp(
            home: DashboardHomeContent(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      // When real account selected (not all mode), FABs should be present
      expect(
        find.byWidgetPredicate((w) => w is FloatingActionButton),
        findsWidgets,
      );
    });
  });
}


