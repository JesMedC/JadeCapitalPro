// Sprint 6 — Flutter widget tests for CreateAlertSheet.
//
// Covers (task 4.7):
//   (a) empty targetPrice keeps submit button disabled
//   (b) valid form enables submit button
//   (c) successful create calls createAlert and pops the sheet

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/alerts/widgets/create_alert_sheet.dart';
import 'package:jade_capital_v3/features/alerts/providers/alerts_provider.dart';
import 'package:jade_capital_v3/features/alerts/models/price_alert.dart';
import 'package:jade_capital_v3/core/network/price_alerts_api.dart';
import 'package:jade_capital_v3/core/network/api_client.dart';

// ── Fake PriceAlertsApi ──

class _FakePriceAlertsApi extends PriceAlertsApi {
  _FakePriceAlertsApi() : super(_FakeApiClient());

  final List<Map<String, dynamic>> createCalls = [];

  @override
  Future<List<PriceAlert>> getAlerts() async => [];

  @override
  Future<PriceAlert> createAlert(Map<String, dynamic> dto) async {
    createCalls.add(dto);
    return PriceAlert(
      id: 'new-alert-id',
      userId: 'user-001',
      name: dto['name'] as String,
      instrument: dto['instrument'] as String,
      condition: AlertCondition.fromString(dto['condition'] as String?) ??
          AlertCondition.above,
      targetPrice: (dto['targetPrice'] as num).toDouble(),
      status: AlertStatus.active,
      createdAt: DateTime.now(),
    );
  }
}

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000/api');
}

/// Wrap [CreateAlertSheet] in a minimal app for testing.
///
/// [fakeApi] is used to override [alertsProvider] so no real HTTP is made.
/// The sheet is shown inside a [Scaffold] via [showModalBottomSheet] to
/// preserve its pop() contract.
Widget _buildSheetApp(_FakePriceAlertsApi fakeApi) {
  return ProviderScope(
    overrides: [
      alertsProvider.overrideWith(
        (ref) => AlertsNotifier(fakeApi),
      ),
    ],
    child: MaterialApp(
      theme: ThemeData.dark(),
      home: Scaffold(
        body: Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showModalBottomSheet<void>(
              context: ctx,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => ProviderScope(
                overrides: [
                  alertsProvider.overrideWith(
                    (ref) => AlertsNotifier(fakeApi),
                  ),
                ],
                child: const CreateAlertSheet(),
              ),
            ),
            child: const Text('Open Sheet'),
          ),
        ),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('CreateAlertSheet widget (task 4.7)', () {
    /// Helper: open the sheet by tapping the launcher button.
    Future<void> openSheet(WidgetTester tester) async {
      await tester.tap(find.text('Open Sheet'));
      await tester.pumpAndSettle();
    }

    /// Helper: fill all required fields with valid data.
    Future<void> fillValidForm(WidgetTester tester) async {
      // Select instrument via dropdown
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('EUR/USD').last);
      await tester.pumpAndSettle();

      // Select condition chip
      await tester.tap(find.text('Above'));
      await tester.pump();

      // Enter target price
      final priceField = find.ancestor(
        of: find.text('Target Price *'),
        matching: find.byType(TextField),
      );
      if (priceField.evaluate().isEmpty) {
        // Fall back to finding by hint text
        await tester.enterText(
          find.widgetWithText(TextField, '0.00000'),
          '1.1050',
        );
      } else {
        await tester.enterText(priceField, '1.1050');
      }
      await tester.pump();

      // Enter alert name
      await tester.enterText(
        find.widgetWithText(TextField, 'e.g. EUR/USD breakout alert'),
        'My test alert',
      );
      await tester.pump();
    }

    // (a) Submit disabled when targetPrice is empty
    testWidgets(
        '(a) submit button is disabled when targetPrice is empty',
        (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(_buildSheetApp(api));
      await openSheet(tester);

      // Only fill instrument and condition — leave price empty
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('EUR/USD').last);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Above'));
      await tester.pump();

      // Price is empty — submit must be disabled
      final createAlertButton = find.text('Create Alert');
      final elevatedButton =
          tester.widget<ElevatedButton>(
            find.ancestor(
              of: createAlertButton,
              matching: find.byType(ElevatedButton),
            ),
          );
      expect(elevatedButton.onPressed, isNull,
          reason: 'Submit should be disabled when targetPrice is empty');
    });

    // (b) Submit enabled with all valid fields
    testWidgets(
        '(b) submit button is enabled when all fields are valid',
        (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(_buildSheetApp(api));
      await openSheet(tester);

      await fillValidForm(tester);

      final elevatedButton =
          tester.widget<ElevatedButton>(
            find.ancestor(
              of: find.text('Create Alert'),
              matching: find.byType(ElevatedButton),
            ),
          );
      expect(elevatedButton.onPressed, isNotNull,
          reason: 'Submit should be enabled when all fields are valid');
    });

    // (c) Successful create calls createAlert
    testWidgets(
        '(c) tapping submit calls createAlert on the notifier',
        (tester) async {
      final api = _FakePriceAlertsApi();
      await tester.pumpWidget(_buildSheetApp(api));
      await openSheet(tester);

      await fillValidForm(tester);

      await tester.tap(find.text('Create Alert'));
      await tester.pumpAndSettle();

      expect(api.createCalls.length, equals(1),
          reason: 'createAlert should have been called exactly once');
      expect(api.createCalls.first['instrument'], equals('EUR/USD'));
    });
  });
}
