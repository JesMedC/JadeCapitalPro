/// Immutable value object representing a single price tick from the server.
///
/// Fields [bid], [ask], and [spread] are coerced from dynamic JSON values
/// using [_toDouble] — TypeORM may serialize decimal columns as strings
/// (lesson from Sprint 2). Using [double.tryParse] prevents parse crashes.
class PriceTick {
  const PriceTick({
    required this.instrument,
    required this.bid,
    required this.ask,
    required this.spread,
    required this.timestamp,
  });

  final String instrument;
  final double bid;
  final double ask;
  final double spread;

  /// Unix epoch milliseconds from the server.
  final int timestamp;

  factory PriceTick.fromJson(Map<String, dynamic> json) => PriceTick(
        instrument: json['instrument'] as String? ?? '',
        bid: _toDouble(json['bid']),
        ask: _toDouble(json['ask']),
        spread: _toDouble(json['spread']),
        timestamp: (json['timestamp'] as num?)?.toInt() ?? 0,
      );

  /// Safely coerce a dynamic JSON value to [double].
  ///
  /// Handles three cases: null → 0.0, [num] → [toDouble], [String] → [tryParse].
  static double _toDouble(dynamic v) {
    if (v == null) return 0.0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0.0;
  }

  @override
  String toString() =>
      'PriceTick($instrument bid=$bid ask=$ask spread=$spread ts=$timestamp)';
}
