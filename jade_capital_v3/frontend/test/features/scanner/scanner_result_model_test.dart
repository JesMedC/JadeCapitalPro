// Sprint 9 — Flutter unit tests for the ScannerResult model.
//
// Covers (task 3.6):
//   (a) fromJson with all decimal fields as strings → correct double values
//   (b) fromJson with null for optional fields → no exception
//   (c) fromJson with decimal fields as num → correct coercion
//   (d) isCall getter: 'CALL' → true, 'PUT' → false
//   (e) confluences getter: populated metadata / null metadata
//   (f) Full round-trip: complete JSON payload, every field asserted

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/// Full valid API response JSON matching the NestJS ScannerResult entity shape.
Map<String, dynamic> _resultJson({
  String id = 'scan-0001-0000-0000-000000000001',
  String instrument = 'EUR/USD',
  String timeframe = '1h',
  String pattern = 'Gartley',
  String direction = 'CALL',
  dynamic entryPrice = '1.087650',
  dynamic stopLoss = '1.080000',
  dynamic takeProfit = '1.094000',
  dynamic takeProfit2 = '1.102000',
  dynamic confidence = '87.5',
  Map<String, dynamic>? metadata,
  String createdAt = '2026-05-23T10:00:00.000Z',
}) =>
    {
      'id': id,
      'instrument': instrument,
      'timeframe': timeframe,
      'pattern': pattern,
      'direction': direction,
      'entryPrice': entryPrice,
      'stopLoss': stopLoss,
      'takeProfit': takeProfit,
      'takeProfit2': takeProfit2,
      'confidence': confidence,
      'metadata': metadata,
      'createdAt': createdAt,
    };

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('ScannerResult.fromJson', () {
    // (a) All decimal fields as strings (TypeORM decimal column behaviour)
    test('coerces all decimal fields from String to double', () {
      final json = _resultJson(
        entryPrice: '1.087650',
        stopLoss: '1.080000',
        takeProfit: '1.094000',
        takeProfit2: '1.102000',
        confidence: '87.5',
      );
      final result = ScannerResult.fromJson(json);

      expect(result.entryPrice, closeTo(1.08765, 0.000001));
      expect(result.stopLoss, closeTo(1.08, 0.000001));
      expect(result.takeProfit, closeTo(1.094, 0.000001));
      expect(result.takeProfit2, closeTo(1.102, 0.000001));
      expect(result.confidence, closeTo(87.5, 0.001));
    });

    // (b) Null for optional fields → no exception, fields are null
    test('handles null optional fields without throwing', () {
      final json = _resultJson(
        stopLoss: null,
        takeProfit: null,
        takeProfit2: null,
        confidence: null,
        metadata: null,
      );
      final result = ScannerResult.fromJson(json);

      expect(result.stopLoss, isNull);
      expect(result.takeProfit, isNull);
      expect(result.takeProfit2, isNull);
      expect(result.confidence, isNull);
      expect(result.metadata, isNull);
    });

    // (c) Decimal fields as num (not string) — must coerce without exception
    test('handles decimal fields as num (double)', () {
      final json = _resultJson(
        entryPrice: 1.0876500,
        stopLoss: 1.08,
        takeProfit: 1.094,
        takeProfit2: 1.102,
        confidence: 87.5,
      );
      final result = ScannerResult.fromJson(json);

      expect(result.entryPrice, closeTo(1.08765, 0.000001));
      expect(result.confidence, closeTo(87.5, 0.001));
    });

    // (c) Decimal fields as int (e.g., BTC/USD at 50000)
    test('handles entryPrice as int', () {
      final json = _resultJson(
        instrument: 'BTC/USD',
        entryPrice: 68000,
        stopLoss: 65000,
        takeProfit: 72000,
      );
      final result = ScannerResult.fromJson(json);

      expect(result.entryPrice, equals(68000.0));
      expect(result.stopLoss, equals(65000.0));
    });

    // (d) isCall getter
    test('isCall returns true for direction CALL', () {
      final result = ScannerResult.fromJson(_resultJson(direction: 'CALL'));
      expect(result.isCall, isTrue);
    });

    test('isCall returns false for direction PUT', () {
      final result = ScannerResult.fromJson(_resultJson(direction: 'PUT'));
      expect(result.isCall, isFalse);
    });

    // (e) confluences getter
    test('confluences returns list when metadata contains confluences key', () {
      final json = _resultJson(
        metadata: {
          'confluences': ['RSI oversold', 'Support level'],
          'ratios': {'AB': 0.618, 'BC': 0.500, 'CD': 1.272, 'XD': 0.786},
        },
      );
      final result = ScannerResult.fromJson(json);

      expect(result.confluences, isNotNull);
      expect(result.confluences, equals(['RSI oversold', 'Support level']));
    });

    test('confluences returns null when metadata is null', () {
      final json = _resultJson(metadata: null);
      final result = ScannerResult.fromJson(json);
      expect(result.confluences, isNull);
    });

    test('confluences returns null when metadata has no confluences key', () {
      final json = _resultJson(
        metadata: {'ratios': <String, dynamic>{}},
      );
      final result = ScannerResult.fromJson(json);
      expect(result.confluences, isNull);
    });

    // (f) Full round-trip: all fields asserted
    test('deserialises a complete valid JSON correctly', () {
      final json = _resultJson(
        id: 'scan-abc-123',
        instrument: 'GBP/USD',
        timeframe: '4h',
        pattern: 'Bat',
        direction: 'PUT',
        entryPrice: '1.266700',
        stopLoss: '1.274000',
        takeProfit: '1.258000',
        takeProfit2: '1.248000',
        confidence: '92.3',
        metadata: {
          'confluences': ['Resistance zone'],
          'ratios': {'AB': 0.382, 'BC': 0.786, 'CD': 2.618, 'XD': 0.886},
          'points': {'x': 1.24, 'a': 1.30, 'b': 1.28, 'c': 1.296, 'd': 1.267},
        },
        createdAt: '2026-05-23T15:30:00.000Z',
      );

      final result = ScannerResult.fromJson(json);

      expect(result.id, equals('scan-abc-123'));
      expect(result.instrument, equals('GBP/USD'));
      expect(result.timeframe, equals('4h'));
      expect(result.pattern, equals('Bat'));
      expect(result.direction, equals('PUT'));
      expect(result.isCall, isFalse);
      expect(result.entryPrice, closeTo(1.2667, 0.000001));
      expect(result.stopLoss, closeTo(1.274, 0.000001));
      expect(result.takeProfit, closeTo(1.258, 0.000001));
      expect(result.takeProfit2, closeTo(1.248, 0.000001));
      expect(result.confidence, closeTo(92.3, 0.001));
      expect(result.metadata, isNotNull);
      expect(result.confluences, equals(['Resistance zone']));
      expect(result.createdAt, equals(DateTime.parse('2026-05-23T15:30:00.000Z')));
    });

    // Edge case: missing direction → defaults to 'CALL'
    test('defaults direction to CALL when absent from JSON', () {
      final json = <String, dynamic>{
        'id': 'scan-001',
        'instrument': 'EUR/USD',
        'timeframe': '1h',
        'pattern': 'Gartley',
        // direction key is absent
        'entryPrice': '1.08765',
        'createdAt': '2026-05-23T10:00:00.000Z',
      };
      final result = ScannerResult.fromJson(json);
      expect(result.direction, equals('CALL'));
      expect(result.isCall, isTrue);
    });
  });

  // ── Sprint 13: XabcdPoints ────────────────────────────────────────────────

  /// Fixture metadata with all five prices and all five time keys.
  Map<String, dynamic> _xabcdMetadata({
    bool includeTimes = true,
    bool includePrz = false,
    bool includeAtr = false,
  }) =>
      {
        'points': {
          'x': 1.0000,
          'a': 1.0500,
          'b': 1.0191,
          'c': 1.0350,
          'd': 1.0393,
        },
        if (includeTimes)
          'times': {
            'x': 1_700_000_000_000,
            'a': 1_700_000_003_000,
            'b': 1_700_000_006_000,
            'c': 1_700_000_009_000,
            'd': 1_700_000_012_000,
          },
        if (includePrz) 'prz_min': 1.0350,
        if (includePrz) 'prz_max': 1.0430,
        if (includeAtr) 'atr': 0.0020,
      };

  group('XabcdPoints', () {
    // SC-SRM-01a: valid metadata → all five price doubles parse correctly
    test('SC-SRM-01a: parses all five XABCD prices from valid metadata', () {
      final points = XabcdPoints.fromMetadata(_xabcdMetadata());
      expect(points, isNotNull);
      expect(points!.x, closeTo(1.0000, 0.000001));
      expect(points.a, closeTo(1.0500, 0.000001));
      expect(points.b, closeTo(1.0191, 0.000001));
      expect(points.c, closeTo(1.0350, 0.000001));
      expect(points.d, closeTo(1.0393, 0.000001));
    });

    // SC-SRM-01b: missing `times` key → all *Time fields are null, no exception
    test('SC-SRM-01b: missing times key → all *Time fields are null, no exception', () {
      final points = XabcdPoints.fromMetadata(_xabcdMetadata(includeTimes: false));
      expect(points, isNotNull);
      expect(points!.xTime, isNull);
      expect(points.aTime, isNull);
      expect(points.bTime, isNull);
      expect(points.cTime, isNull);
      expect(points.dTime, isNull);
    });

    // SC-SRM-01c: metadata is null → points accessor returns null, no exception
    test('SC-SRM-01c: null metadata → fromMetadata returns null without throwing', () {
      expect(() => XabcdPoints.fromMetadata(null), returnsNormally);
      expect(XabcdPoints.fromMetadata(null), isNull);
    });

    test('SC-SRM-01c: extension .points on ScannerResult with null metadata returns null', () {
      final result = ScannerResult.fromJson(_resultJson(metadata: null));
      expect(result.points, isNull);
    });

    // SC-SRM-02a: explicit prz_min / prz_max → prz uses them
    test('SC-SRM-02a: explicit prz_min/prz_max → prz.min and prz.max match', () {
      final points = XabcdPoints.fromMetadata(_xabcdMetadata(includePrz: true));
      expect(points!.prz, isNotNull);
      expect(points.prz!.min, closeTo(1.0350, 0.000001));
      expect(points.prz!.max, closeTo(1.0430, 0.000001));
    });

    // SC-SRM-02b: no explicit PRZ but atr present → d ± atr fallback
    test('SC-SRM-02b: atr fallback → prz.min = d - atr, prz.max = d + atr', () {
      // d = 1.0870, atr = 0.0020 → min = 1.0850, max = 1.0890
      final metadata = <String, dynamic>{
        'points': {
          'x': 1.0500,
          'a': 1.1000,
          'b': 1.0680,
          'c': 1.0950,
          'd': 1.0870,
        },
        'atr': 0.0020,
      };
      final points = XabcdPoints.fromMetadata(metadata);
      expect(points!.prz, isNotNull);
      expect(points.prz!.min, closeTo(1.0850, 0.000001));
      expect(points.prz!.max, closeTo(1.0890, 0.000001));
    });

    // SC-SRM-02c: no explicit PRZ and no ATR → prz is null, no exception
    test('SC-SRM-02c: no prz_min/prz_max and no atr → prz is null, no exception', () {
      final points = XabcdPoints.fromMetadata(_xabcdMetadata());
      expect(() => points!.prz, returnsNormally);
      expect(points!.prz, isNull);
    });

    // times present → all five time fields are parsed as ints
    test('times present → all five *Time fields are non-null positive ints', () {
      final points = XabcdPoints.fromMetadata(_xabcdMetadata(includeTimes: true));
      expect(points!.xTime, isNotNull);
      expect(points.xTime! > 1_000_000_000_000, isTrue);
      expect(points.aTime, isNotNull);
      expect(points.bTime, isNotNull);
      expect(points.cTime, isNotNull);
      expect(points.dTime, isNotNull);
    });

    // missing points key → returns null
    test('metadata without points key → fromMetadata returns null', () {
      final metadata = <String, dynamic>{'ratios': <String, dynamic>{}};
      expect(XabcdPoints.fromMetadata(metadata), isNull);
    });

    // partial points key (missing 'd') → returns null
    test('metadata with incomplete points (missing d) → returns null', () {
      final metadata = <String, dynamic>{
        'points': {'x': 1.0, 'a': 1.05, 'b': 1.02, 'c': 1.04},
      };
      expect(XabcdPoints.fromMetadata(metadata), isNull);
    });
  });
}
