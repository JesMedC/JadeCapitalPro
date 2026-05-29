import 'api_client.dart';

// ── Value objects ──

/// Account configuration fetched from GET /api/accounts/config.
///
/// Contains the list of tradeable instruments, payout options (integer
/// percents, e.g. 77 means 77%), expiry time options for binary trades, and
/// sensible defaults.
class AccountConfig {
  const AccountConfig({
    required this.instruments,
    required this.payoutOptions,
    required this.expiryOptions,
    this.payoutPctDefault = 77,
  });

  factory AccountConfig.fromJson(Map<String, dynamic> json) => AccountConfig(
        instruments: List<String>.from(json['instruments'] as List? ?? []),
        payoutOptions: (json['payout_options'] as List? ?? [])
            .map((e) => (double.tryParse(e.toString()) ?? 0).round())
            .toList(),
        expiryOptions:
            List<String>.from(json['expiry_options'] as List? ?? []),
        payoutPctDefault:
            (double.tryParse(json['payout_pct_default']?.toString() ?? '77') ??
                    77)
                .round(),
      );

  final List<String> instruments;
  final List<int> payoutOptions; // integer percents: [70, 75, 77, ...]
  final List<String> expiryOptions; // ["1m", "2m", ...]
  final int payoutPctDefault; // e.g. 77
}

// ── API layer ──

/// API layer for dashboard data: accounts, KPIs, equity curve, open trades.
class DashboardApi {
  const DashboardApi(this._client);

  final ApiClient _client;

  /// Fetch all accounts for the current user.
  Future<List<Map<String, dynamic>>> getAccounts() async {
    final res = await _client.get('/accounts');
    return List<Map<String, dynamic>>.from(res.data as List);
  }

  /// Create a new trading account.
  Future<Map<String, dynamic>> createAccount(Map<String, dynamic> data) async {
    final res = await _client.post('/accounts', data: data);
    return res.data as Map<String, dynamic>;
  }

  /// Fetch dashboard data for a specific account.
  Future<Map<String, dynamic>> getDashboard(String accountId) async {
    final res = await _client.get('/accounts/$accountId/dashboard');
    return res.data as Map<String, dynamic>;
  }

  /// Fetch goals progress for an account.
  Future<List<Map<String, dynamic>>> getGoals(String accountId) async {
    final res = await _client.get('/accounts/$accountId/goals');
    return List<Map<String, dynamic>>.from(res.data as List);
  }

  /// Fetch account configuration (instruments, payout options, expiry options).
  ///
  /// Calls GET /api/accounts/config — does NOT require an account ID.
  Future<AccountConfig> getAccountConfig() async {
    final res = await _client.get('/accounts/config');
    return AccountConfig.fromJson(res.data as Map<String, dynamic>);
  }

  /// Deposit funds into an account.
  Future<void> deposit(String accountId, double amount) async {
    await _client.post('/accounts/$accountId/deposit', data: {'amount': amount});
  }

  /// Withdraw funds from an account.
  Future<void> withdraw(String accountId, double amount) async {
    await _client.post('/accounts/$accountId/withdraw', data: {'amount': amount});
  }

  /// Fetch aggregate stats across ALL accounts owned by the current user.
  Future<Map<String, dynamic>> getAggregate() async {
    final res = await _client.get('/accounts/aggregate');
    return res.data as Map<String, dynamic>;
  }
}
