// ── XABCD value objects ───────────────────────────────────────────────────────

/// Named record for the Potential Reversal Zone price range.
typedef PrzRange = ({double min, double max});

/// Typed, null-safe access to XABCD price and time data from [ScannerResult.metadata].
///
/// All [*Time] fields are nullable — rows persisted before Sprint 13 do not have
/// a `times` key in their metadata blob.
///
/// [prz] uses explicit `prz_min`/`prz_max` when available, falls back to
/// `d ± atr`, and returns `null` when neither is present.
class XabcdPoints {
  const XabcdPoints({
    required this.x,
    required this.a,
    required this.b,
    required this.c,
    required this.d,
    this.xTime,
    this.aTime,
    this.bTime,
    this.cTime,
    this.dTime,
    this.atr,
    this.przMin,
    this.przMax,
  });

  final double x;
  final double a;
  final double b;
  final double c;
  final double d;

  final int? xTime;
  final int? aTime;
  final int? bTime;
  final int? cTime;
  final int? dTime;

  final double? atr;
  final double? przMin;
  final double? przMax;

  /// Parse from a [ScannerResult.metadata] map.
  ///
  /// Returns `null` when [metadata] is absent or the `points` key is missing.
  static XabcdPoints? fromMetadata(Map<String, dynamic>? metadata) {
    if (metadata == null) return null;
    final points = metadata['points'] as Map<String, dynamic>?;
    if (points == null) return null;

    double? toDouble(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    int? toInt(dynamic v) {
      if (v == null) return null;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString());
    }

    final xP = toDouble(points['x']);
    final aP = toDouble(points['a']);
    final bP = toDouble(points['b']);
    final cP = toDouble(points['c']);
    final dP = toDouble(points['d']);

    if (xP == null || aP == null || bP == null || cP == null || dP == null) {
      return null;
    }

    final times = metadata['times'] as Map<String, dynamic>?;

    return XabcdPoints(
      x: xP,
      a: aP,
      b: bP,
      c: cP,
      d: dP,
      xTime: toInt(times?['x']),
      aTime: toInt(times?['a']),
      bTime: toInt(times?['b']),
      cTime: toInt(times?['c']),
      dTime: toInt(times?['d']),
      atr: toDouble(metadata['atr']),
      przMin: toDouble(metadata['prz_min']),
      przMax: toDouble(metadata['prz_max']),
    );
  }

  /// PRZ derivation: explicit metadata fields take priority; falls back to
  /// `d ± atr`; returns `null` when insufficient data is available.
  PrzRange? get prz {
    if (przMin != null && przMax != null) {
      return (min: przMin!, max: przMax!);
    }
    if (atr != null) {
      return (min: d - atr!, max: d + atr!);
    }
    return null;
  }
}

/// Extension on [ScannerResult] providing typed XABCD point access.
extension ScannerResultXabcd on ScannerResult {
  /// Returns a [XabcdPoints] parsed from [metadata], or `null` when the
  /// `points` key is absent or [metadata] is null.
  XabcdPoints? get points => XabcdPoints.fromMetadata(metadata);
}

// ── ScannerResult model ───────────────────────────────────────────────────────

/// A harmonic pattern detected by the background scanner.
///
/// Decimal fields arrive as strings from TypeORM (Sprint 2 pattern).
/// Use the inline [_toDouble] helper for safe coercion — the same technique
/// as [PriceAlert.fromJson] which handles both numeric strings and num types.
///
/// Scanner results are **global** — they are not scoped to a single user.
/// Every authenticated user reads the same set of results from the backend.
class ScannerResult {
  const ScannerResult({
    required this.id,
    required this.instrument,
    required this.timeframe,
    required this.pattern,
    required this.direction,
    this.entryPrice,
    this.stopLoss,
    this.takeProfit,
    this.takeProfit2,
    this.confidence,
    this.metadata,
    required this.createdAt,
  });

  final String id;
  final String instrument;
  final String timeframe;
  final String pattern;

  /// Signal direction: `'CALL'` (bullish) or `'PUT'` (bearish).
  final String direction;

  final double? entryPrice;
  final double? stopLoss;
  final double? takeProfit;
  final double? takeProfit2;

  /// Confidence score 0–100 (only patterns scoring >= 82 are persisted).
  final double? confidence;

  /// JSONB metadata blob from the backend.
  ///
  /// Keys may include:
  /// - `'confluences'`: List<String> — additional technical confluences.
  /// - `'ratios'`: Map — validated XABCD Fibonacci ratios (AB, BC, CD, XD).
  /// - `'points'`: Map — raw XABCD prices.
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  // ── Convenience getters ───────────────────────────────────────────────────

  /// True when [direction] is `'CALL'` (bullish pattern).
  bool get isCall => direction == 'CALL';

  /// Technical confluence annotations attached by the engine, or null.
  List<String>? get confluences =>
      (metadata?['confluences'] as List<dynamic>?)?.cast<String>();

  // ── Deserialisation ───────────────────────────────────────────────────────

  /// Deserialise from the NestJS API JSON shape (camelCase keys).
  ///
  /// TypeORM `decimal` columns arrive as numeric strings — the [_toDouble]
  /// helper handles both `num` and `String` variants (Sprint 2 convention).
  factory ScannerResult.fromJson(Map<String, dynamic> json) {
    // Sprint 2 pattern: coerce num-or-string → double safely (returns null for null).
    double? toDouble(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    return ScannerResult(
      id: json['id'] as String,
      instrument: json['instrument'] as String,
      timeframe: json['timeframe'] as String,
      pattern: json['pattern'] as String,
      direction: json['direction'] as String? ?? 'CALL',
      entryPrice: toDouble(json['entryPrice']),
      stopLoss: toDouble(json['stopLoss']),
      takeProfit: toDouble(json['takeProfit']),
      takeProfit2: toDouble(json['takeProfit2']),
      confidence: toDouble(json['confidence']),
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
