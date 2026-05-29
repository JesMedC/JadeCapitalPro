// Unit tests for EconomicEvent.fromJson.
//
// Covers tasks 7.1–7.4:
//   7.1 Happy path — all five fields parsed correctly
//   7.2 Unknown impact value → defaults to ImpactLevel.low (no throw)
//   7.3 Medium impact value → ImpactLevel.medium
//   7.4 Missing detail field → defaults to ''

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/market/models/economic_event.dart';

// ── Fixtures ─────────────────────────────────────────────────────────────────

Map<String, dynamic> _json({
  String timestamp = '2026-05-23T14:30:00.000Z',
  String currency = 'USD',
  String event = 'Non-Farm Payrolls',
  String? impact = 'high',
  String? detail = 'Actual: 178K vs Forecast: 200K',
}) =>
    {
      'timestamp': timestamp,
      'currency': currency,
      'event': event,
      if (impact != null) 'impact': impact,
      if (detail != null) 'detail': detail,
    };

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('EconomicEvent.fromJson', () {
    // Task 7.1 — happy path
    test('parses all five fields correctly for a high-impact event', () {
      final e = EconomicEvent.fromJson(_json());

      expect(e.timestamp, equals(DateTime.parse('2026-05-23T14:30:00.000Z')));
      expect(e.currency, equals('USD'));
      expect(e.event, equals('Non-Farm Payrolls'));
      expect(e.impact, equals(ImpactLevel.high));
      expect(e.detail, equals('Actual: 178K vs Forecast: 200K'));
    });

    // Task 7.2 — unknown impact value
    test('defaults impact to ImpactLevel.low for unrecognized string — no throw',
        () {
      final e = EconomicEvent.fromJson(_json(impact: 'critical'));
      expect(e.impact, equals(ImpactLevel.low));
    });

    // Task 7.3 — medium impact
    test('parses impact "medium" as ImpactLevel.medium', () {
      final e = EconomicEvent.fromJson(_json(impact: 'medium'));
      expect(e.impact, equals(ImpactLevel.medium));
    });

    // Task 7.4 — missing detail key defaults to ''
    test('defaults detail to empty string when key is absent from JSON', () {
      final json = _json();
      json.remove('detail');
      final e = EconomicEvent.fromJson(json);
      expect(e.detail, equals(''));
    });

    // Extra: null detail also defaults to ''
    test('defaults detail to empty string when value is null', () {
      final json = _json();
      json['detail'] = null;
      final e = EconomicEvent.fromJson(json);
      expect(e.detail, equals(''));
    });

    // Extra: 'low' impact parsed correctly
    test('parses impact "low" as ImpactLevel.low', () {
      final e = EconomicEvent.fromJson(_json(impact: 'low'));
      expect(e.impact, equals(ImpactLevel.low));
    });

    // Extra: null impact defaults to ImpactLevel.low
    test('defaults impact to ImpactLevel.low when impact is null', () {
      final json = _json();
      json['impact'] = null;
      final e = EconomicEvent.fromJson(json);
      expect(e.impact, equals(ImpactLevel.low));
    });

    // Extra: timestamp parsed to UTC
    test('parses timestamp as UTC DateTime', () {
      const ts = '2026-01-15T09:00:00.000Z';
      final e = EconomicEvent.fromJson(_json(timestamp: ts));
      expect(e.timestamp, equals(DateTime.parse(ts)));
      expect(e.timestamp.isUtc, isTrue);
    });
  });
}
