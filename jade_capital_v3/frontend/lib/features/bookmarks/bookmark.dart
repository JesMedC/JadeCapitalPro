/// A per-user identity bookmark for a harmonic pattern signal.
///
/// Stores the 5-tuple identity of the signal (instrument, timeframe, pattern,
/// direction, optional notes) — NOT a snapshot of market data. The actual
/// price data lives in [ScannerResult]; the bookmark only points to it via
/// a compound key.
///
/// Direction values match [ScannerResult.direction]: `'CALL'` or `'PUT'`.
class PatternBookmark {
  const PatternBookmark({
    required this.id,
    required this.userId,
    required this.instrument,
    required this.timeframe,
    required this.pattern,
    required this.direction,
    this.notes,
    required this.createdAt,
  });

  final String id;
  final String userId;

  final String instrument;
  final String timeframe;
  final String pattern;

  /// Signal direction: `'CALL'` (bullish) or `'PUT'` (bearish).
  /// Must match the value in [ScannerResult.direction] for compound-key lookup.
  final String direction;

  /// Optional annotation entered by the user at creation time.
  final String? notes;

  final DateTime createdAt;

  // ── Compound key ──────────────────────────────────────────────────────────

  /// Canonical separator used in all compound key operations.
  ///
  /// NEVER change this value — existing serialised keys depend on it.
  static const String keySep = '|';

  /// Compound key: `instrument|timeframe|pattern|direction`.
  ///
  /// Matches [ScannerNotifier._mergeKey] exactly so the scanner and bookmarks
  /// features share the same identity namespace.
  String get compoundKey =>
      '$instrument$keySep$timeframe$keySep$pattern$keySep$direction';

  // ── Deserialisation ───────────────────────────────────────────────────────

  /// Deserialise from the NestJS `/bookmarks` API (camelCase keys).
  factory PatternBookmark.fromJson(Map<String, dynamic> json) {
    return PatternBookmark(
      id: json['id'] as String,
      userId: json['userId'] as String,
      instrument: json['instrument'] as String,
      timeframe: json['timeframe'] as String,
      pattern: json['pattern'] as String,
      direction: json['direction'] as String,
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  // ── Value equality ────────────────────────────────────────────────────────

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PatternBookmark && other.id == id);

  @override
  int get hashCode => id.hashCode;
}

/// Construct a compound key for a signal described by its individual fields.
///
/// Use this helper when you don't have a [PatternBookmark] instance but need
/// to check membership in the bookmarked key set (e.g. in [ScannerPage]).
String bookmarkKey({
  required String instrument,
  required String timeframe,
  required String pattern,
  required String direction,
}) =>
    '$instrument${PatternBookmark.keySep}$timeframe${PatternBookmark.keySep}$pattern${PatternBookmark.keySep}$direction';
