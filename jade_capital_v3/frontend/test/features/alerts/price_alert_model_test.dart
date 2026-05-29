// Sprint 6 — Flutter unit tests for the PriceAlert model.
//
// Covers (task 3.7):
//   (a) fromJson with targetPrice as string → correct double
//   (b) fromJson with targetPrice as num → correct double
//   (c) null triggeredAt → null
//   (d) ISO createdAt → valid DateTime
//   (e) condition enum round-trip
//   (f) status enum round-trip

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/alerts/models/price_alert.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/// Minimal valid API response JSON matching the NestJS Alert entity shape.
Map<String, dynamic> _alertJson({
  String id = 'alert-0001-0000-0000-000000000001',
  String userId = 'user-0001-0000-0000-000000000001',
  String name = 'EUR/USD above 1.1000',
  String instrument = 'EUR/USD',
  String condition = 'above',
  dynamic targetPrice = 1.1000,
  String status = 'active',
  String? triggeredAt,
  String createdAt = '2026-05-23T10:00:00.000Z',
}) =>
    {
      'id': id,
      'userId': userId,
      'name': name,
      'instrument': instrument,
      'condition': condition,
      'targetPrice': targetPrice,
      'status': status,
      'triggeredAt': triggeredAt,
      'createdAt': createdAt,
    };

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('PriceAlert.fromJson', () {
    // (a) targetPrice arrives as a string (TypeORM decimal column behaviour)
    test('coerces targetPrice from String to double', () {
      final json = _alertJson(targetPrice: '1.10500000');
      final alert = PriceAlert.fromJson(json);
      expect(alert.targetPrice, closeTo(1.105, 0.00001));
    });

    // (b) targetPrice arrives as a num (double) — normal case
    test('handles targetPrice as num (double)', () {
      final json = _alertJson(targetPrice: 1.1000);
      final alert = PriceAlert.fromJson(json);
      expect(alert.targetPrice, closeTo(1.1, 0.00001));
    });

    // (b) targetPrice arrives as an int (e.g. BTC/USD at 50000)
    test('handles targetPrice as int', () {
      final json = _alertJson(targetPrice: 50000);
      final alert = PriceAlert.fromJson(json);
      expect(alert.targetPrice, equals(50000.0));
    });

    // (c) null triggeredAt → null
    test('triggeredAt is null when absent from JSON', () {
      final json = _alertJson(triggeredAt: null);
      final alert = PriceAlert.fromJson(json);
      expect(alert.triggeredAt, isNull);
    });

    // triggeredAt present → parsed DateTime
    test('triggeredAt is parsed as DateTime when present', () {
      const triggeredStr = '2026-05-23T14:30:00.000Z';
      final json = _alertJson(
        status: 'triggered',
        triggeredAt: triggeredStr,
      );
      final alert = PriceAlert.fromJson(json);
      expect(alert.triggeredAt, equals(DateTime.parse(triggeredStr)));
    });

    // (d) ISO createdAt → valid DateTime
    test('createdAt is parsed as DateTime', () {
      const createdStr = '2026-05-23T10:00:00.000Z';
      final json = _alertJson(createdAt: createdStr);
      final alert = PriceAlert.fromJson(json);
      expect(alert.createdAt, equals(DateTime.parse(createdStr)));
    });

    // Full valid round-trip
    test('deserialises a full valid JSON correctly', () {
      final json = _alertJson(
        id: 'alert-abc',
        userId: 'user-xyz',
        name: 'BTC above 60000',
        instrument: 'BTC/USD',
        condition: 'crosses_above',
        targetPrice: '60000.000000',
        status: 'active',
      );
      final alert = PriceAlert.fromJson(json);

      expect(alert.id, equals('alert-abc'));
      expect(alert.userId, equals('user-xyz'));
      expect(alert.name, equals('BTC above 60000'));
      expect(alert.instrument, equals('BTC/USD'));
      expect(alert.condition, equals(AlertCondition.crossesAbove));
      expect(alert.targetPrice, closeTo(60000.0, 0.0001));
      expect(alert.status, equals(AlertStatus.active));
      expect(alert.triggeredAt, isNull);
    });
  });

  // ── Condition enum ────────────────────────────────────────────────────────

  group('AlertCondition', () {
    test('fromString maps all four condition values', () {
      expect(AlertCondition.fromString('above'), equals(AlertCondition.above));
      expect(AlertCondition.fromString('below'), equals(AlertCondition.below));
      expect(AlertCondition.fromString('crosses_above'),
          equals(AlertCondition.crossesAbove));
      expect(AlertCondition.fromString('crosses_below'),
          equals(AlertCondition.crossesBelow));
    });

    test('fromString returns null for unknown value', () {
      expect(AlertCondition.fromString('crosses'), isNull);
      expect(AlertCondition.fromString(null), isNull);
    });

    test('apiValue returns snake_case string', () {
      expect(AlertCondition.above.apiValue, equals('above'));
      expect(AlertCondition.crossesAbove.apiValue, equals('crosses_above'));
      expect(AlertCondition.crossesBelow.apiValue, equals('crosses_below'));
    });

    test('label is human-readable', () {
      expect(AlertCondition.crossesAbove.label, equals('Crosses Above'));
      expect(AlertCondition.above.label, equals('Above'));
    });
  });

  // ── Status enum ───────────────────────────────────────────────────────────

  group('AlertStatus', () {
    test('fromString maps all three status values', () {
      expect(AlertStatus.fromString('active'), equals(AlertStatus.active));
      expect(AlertStatus.fromString('triggered'), equals(AlertStatus.triggered));
      expect(AlertStatus.fromString('disabled'), equals(AlertStatus.disabled));
    });

    test('fromString defaults to active for unknown value', () {
      expect(AlertStatus.fromString('unknown'), equals(AlertStatus.active));
      expect(AlertStatus.fromString(null), equals(AlertStatus.active));
    });
  });

  // ── toCreateJson ──────────────────────────────────────────────────────────

  group('PriceAlert.toCreateJson', () {
    test('includes required fields only', () {
      final alert = PriceAlert(
        id: 'a1',
        userId: 'u1',
        name: 'EUR/USD above 1.1',
        instrument: 'EUR/USD',
        condition: AlertCondition.above,
        targetPrice: 1.1,
        status: AlertStatus.active,
        createdAt: DateTime.now(),
      );

      final json = alert.toCreateJson();

      expect(json['name'], equals('EUR/USD above 1.1'));
      expect(json['instrument'], equals('EUR/USD'));
      expect(json['condition'], equals('above'));
      expect(json['targetPrice'], equals(1.1));
      // Server-managed fields must NOT be present
      expect(json.containsKey('id'), isFalse);
      expect(json.containsKey('userId'), isFalse);
      expect(json.containsKey('status'), isFalse);
    });
  });

  // ── copyWith ──────────────────────────────────────────────────────────────

  group('PriceAlert.copyWith', () {
    test('copyWith preserves unchanged fields', () {
      final original = PriceAlert(
        id: 'a1',
        userId: 'u1',
        name: 'Test',
        instrument: 'EUR/USD',
        condition: AlertCondition.above,
        targetPrice: 1.1,
        status: AlertStatus.active,
        createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
      );

      final copy = original.copyWith(status: AlertStatus.triggered);

      expect(copy.id, equals('a1'));
      expect(copy.name, equals('Test'));
      expect(copy.status, equals(AlertStatus.triggered));
      // Original is unchanged
      expect(original.status, equals(AlertStatus.active));
    });
  });
}
