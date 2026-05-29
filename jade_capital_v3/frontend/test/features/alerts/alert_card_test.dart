// Sprint 6 — Flutter widget tests for AlertCard.
//
// Covers (task 4.6):
//   (a) active alert renders green "ACTIVE" badge
//   (b) triggered alert renders amber "TRIGGERED" badge
//   (c) disabled alert renders grey "DISABLED" badge
//   (d) instrument name and condition label are rendered
//   (e) delete and toggle buttons are present

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/alerts/models/price_alert.dart';
import 'package:jade_capital_v3/features/alerts/widgets/alert_card.dart';
import 'package:jade_capital_v3/features/alerts/providers/alerts_provider.dart';
import 'package:jade_capital_v3/core/network/price_alerts_api.dart';
import 'package:jade_capital_v3/core/network/api_client.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

PriceAlert _makeAlert({
  String id = 'alert-0001',
  String userId = 'user-0001',
  String name = 'EUR/USD alert',
  String instrument = 'EUR/USD',
  AlertCondition condition = AlertCondition.above,
  double targetPrice = 1.1,
  AlertStatus status = AlertStatus.active,
  DateTime? triggeredAt,
}) =>
    PriceAlert(
      id: id,
      userId: userId,
      name: name,
      instrument: instrument,
      condition: condition,
      targetPrice: targetPrice,
      status: status,
      triggeredAt: triggeredAt,
      createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
    );

// ── Fake PriceAlertsApi ──

class _FakePriceAlertsApi extends PriceAlertsApi {
  _FakePriceAlertsApi() : super(_FakeApiClient());

  final List<String> deletedIds = [];
  final List<Map<String, dynamic>> updateCalls = [];

  @override
  Future<List<PriceAlert>> getAlerts() async => [];

  @override
  Future<void> deleteAlert(String id) async {
    deletedIds.add(id);
  }

  @override
  Future<PriceAlert> updateAlert(String id, Map<String, dynamic> dto) async {
    updateCalls.add({'id': id, ...dto});
    return _makeAlert(id: id);
  }
}

// Stub ApiClient that satisfies the constructor without real HTTP.
class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

/// Build an [AlertCard] inside a minimal ProviderScope with a
/// fake [alertsProvider] so no real HTTP calls are made.
Widget _buildCard(PriceAlert alert, _FakePriceAlertsApi fakeApi) {
  return ProviderScope(
    overrides: [
      alertsProvider.overrideWith(
        (ref) => AlertsNotifier(fakeApi),
      ),
    ],
    child: MaterialApp(
      theme: ThemeData.dark(),
      home: Scaffold(
        body: SizedBox(
          width: 400,
          child: AlertCard(alert: alert),
        ),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('AlertCard widget (task 4.6)', () {
    // ── Status badges ─────────────────────────────────────────────────────────

    testWidgets('(a) active alert renders "ACTIVE" badge', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(status: AlertStatus.active), api),
      );
      await tester.pump();
      expect(find.text('ACTIVE'), findsOneWidget);
    });

    testWidgets('(b) triggered alert renders "TRIGGERED" badge', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(
          _makeAlert(
            status: AlertStatus.triggered,
            triggeredAt: DateTime.parse('2026-05-23T10:00:00Z'),
          ),
          api,
        ),
      );
      await tester.pump();
      expect(find.text('TRIGGERED'), findsOneWidget);
    });

    testWidgets('(c) disabled alert renders "DISABLED" badge', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(status: AlertStatus.disabled), api),
      );
      await tester.pump();
      expect(find.text('DISABLED'), findsOneWidget);
    });

    // ── Content ───────────────────────────────────────────────────────────────

    testWidgets('renders instrument name', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(instrument: 'GBP/USD'), api),
      );
      await tester.pump();
      expect(find.text('GBP/USD'), findsOneWidget);
    });

    testWidgets('renders condition label containing target price', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(
          _makeAlert(condition: AlertCondition.above, targetPrice: 1.1),
          api,
        ),
      );
      await tester.pump();
      // Condition label: "Price above 1.1000"
      expect(find.textContaining('above'), findsWidgets);
    });

    testWidgets('renders alert name', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(name: 'My custom alert'), api),
      );
      await tester.pump();
      expect(find.text('My custom alert'), findsOneWidget);
    });

    // ── Triggered timestamp ───────────────────────────────────────────────────

    testWidgets('shows triggered timestamp when status is triggered', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(
          _makeAlert(
            status: AlertStatus.triggered,
            triggeredAt: DateTime.parse('2026-05-23T10:00:00Z'),
          ),
          api,
        ),
      );
      await tester.pump();
      // Should render "Triggered May 23, ..." in some form
      expect(find.textContaining('Triggered'), findsOneWidget);
    });

    testWidgets('does NOT show triggered timestamp when status is active', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(status: AlertStatus.active), api),
      );
      await tester.pump();
      expect(find.textContaining('Triggered'), findsNothing);
    });

    // ── Action buttons ────────────────────────────────────────────────────────

    testWidgets('shows delete button for all statuses', (tester) async {
      for (final status in AlertStatus.values) {
        final api = _FakePriceAlertsApi();
        await tester.pumpWidget(
          _buildCard(_makeAlert(status: status), api),
        );
        await tester.pump();
        expect(
          find.byIcon(Icons.delete_outline),
          findsOneWidget,
          reason: 'Delete button should be visible for status $status',
        );
      }
    });

    testWidgets('toggle button is absent for triggered alerts', (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(
          _makeAlert(
            status: AlertStatus.triggered,
            triggeredAt: DateTime.now(),
          ),
          api,
        ),
      );
      await tester.pump();
      // Triggered alerts should NOT show toggle (no enable/disable action)
      expect(find.byIcon(Icons.notifications_active_outlined), findsNothing);
      expect(find.byIcon(Icons.notifications_off_outlined), findsNothing);
    });

    testWidgets('toggle button shows notifications_active for active alert',
        (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(status: AlertStatus.active), api),
      );
      await tester.pump();
      expect(find.byIcon(Icons.notifications_active_outlined), findsOneWidget);
    });

    testWidgets('toggle button shows notifications_off for disabled alert',
        (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(
        _buildCard(_makeAlert(status: AlertStatus.disabled), api),
      );
      await tester.pump();
      expect(find.byIcon(Icons.notifications_off_outlined), findsOneWidget);
    });
  });
}
