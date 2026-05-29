/// A backtest run session belonging to the authenticated user.
///
/// `config` and `results` arrive as JSONB blobs from TypeORM — typed as
/// [Map<String, dynamic>] to avoid a full DTO hierarchy while preserving
/// flexibility for future metrics fields.
///
/// Decimal fields inside `results` may arrive as num or String from TypeORM —
/// use the inline [_toDouble] helper for safe coercion (Sprint 2 convention).
///
/// `profitFactor` is serialised as `9999` on the backend when the value is
/// mathematically Infinity (no losing trades). Display it as `"∞"` in the UI.
class BacktestSession {
  const BacktestSession({
    required this.id,
    required this.name,
    required this.status,
    required this.config,
    required this.createdAt,
    this.results,
    this.error,
  });

  final String id;
  final String name;

  /// Status string: `'pending'` | `'running'` | `'completed'` | `'failed'`.
  final String status;

  /// JSONB config blob: instrument, timeframe, strategy, lastNCandles.
  final Map<String, dynamic> config;

  /// JSONB results blob — null until the processor completes.
  final Map<String, dynamic>? results;

  /// Error message set when `status == 'failed'`.
  final String? error;

  final DateTime createdAt;

  // ── Convenience getters ──────────────────────────────────────────────────

  /// True when no more state transitions will happen for this session.
  bool get isTerminal => status == 'completed' || status == 'failed';

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isPending => status == 'pending';
  bool get isRunning => status == 'running';

  // ── Results convenience accessors ────────────────────────────────────────

  double? get winrate => _toDouble(results?['winrate']);
  double? get profitFactor => _toDouble(results?['profitFactor']);
  double? get maxDrawdown => _toDouble(results?['maxDrawdown']);
  int? get totalTrades => _toInt(results?['totalTrades']);
  int? get wins => _toInt(results?['wins']);
  int? get losses => _toInt(results?['losses']);

  List<double> get equityCurve {
    final raw = results?['equityCurve'];
    if (raw is! List) return [];
    return raw.map((v) => _toDouble(v) ?? 0.0).toList();
  }

  List<Map<String, dynamic>> get trades {
    final raw = results?['trades'];
    if (raw is! List) return [];
    return raw.whereType<Map<String, dynamic>>().toList();
  }

  // ── Deserialisation ──────────────────────────────────────────────────────

  factory BacktestSession.fromJson(Map<String, dynamic> json) {
    return BacktestSession(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      config: json['config'] as Map<String, dynamic>? ?? {},
      results: json['results'] as Map<String, dynamic>?,
      error: json['error'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  static int? _toInt(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString());
  }
}
