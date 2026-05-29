// Widget tests for EventCard.
//
// Covers tasks 7.10–7.13:
//   7.10 High impact → color bar with AppColors.danger
//   7.11 Medium impact → color bar with AppColors.warning
//   7.12 Low impact → color bar with AppColors.textMuted
//   7.13 Detail rendered verbatim

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/theme/app_theme.dart';
import 'package:jade_capital_v3/features/market/models/economic_event.dart';
import 'package:jade_capital_v3/features/market/widgets/event_card.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

EconomicEvent _event({
  ImpactLevel impact = ImpactLevel.high,
  String detail = 'Actual: 178K vs Forecast: 200K',
}) =>
    EconomicEvent(
      timestamp: DateTime.parse('2026-05-23T14:30:00.000Z'),
      currency: 'USD',
      event: 'Non-Farm Payrolls',
      impact: impact,
      detail: detail,
    );

Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.darkTheme,
      home: Scaffold(body: child),
    );

// ── Helper: find a Container with a specific background color ─────────────────

/// Finds the impact color bar Container — it has a fixed width of 4, height of
/// 48, and a [BoxDecoration] with the expected color.
Finder _impactBar(Color expectedColor) {
  return find.byWidgetPredicate((widget) {
    if (widget is! Container) return false;
    final decoration = widget.decoration;
    if (decoration is! BoxDecoration) return false;
    return decoration.color == expectedColor;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('EventCard', () {
    // Task 7.10 — high impact → danger color
    testWidgets('renders danger color bar for high-impact event', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event(impact: ImpactLevel.high))));
      await tester.pump();

      expect(_impactBar(AppColors.danger), findsOneWidget);
    });

    // Task 7.11 — medium impact → warning color
    testWidgets('renders warning color bar for medium-impact event', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event(impact: ImpactLevel.medium))));
      await tester.pump();

      expect(_impactBar(AppColors.warning), findsOneWidget);
    });

    // Task 7.12 — low impact → textMuted color
    testWidgets('renders textMuted color bar for low-impact event', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event(impact: ImpactLevel.low))));
      await tester.pump();

      expect(_impactBar(AppColors.textMuted), findsOneWidget);
    });

    // Task 7.13 — detail rendered verbatim
    testWidgets('renders detail text verbatim — no transformation', (tester) async {
      const verbatimDetail = 'Actual: 178K vs Forecast: 200K';
      await tester.pumpWidget(
        _wrap(EventCard(event: _event(detail: verbatimDetail))),
      );
      await tester.pump();

      expect(find.text(verbatimDetail), findsOneWidget);
    });

    // Extra — event name is rendered
    testWidgets('renders event name', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event())));
      await tester.pump();

      expect(find.text('Non-Farm Payrolls'), findsOneWidget);
    });

    // Extra — currency chip is rendered
    testWidgets('renders currency chip', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event())));
      await tester.pump();

      expect(find.text('USD'), findsOneWidget);
    });

    // Extra — empty detail renders empty string (no null crash)
    testWidgets('renders without error when detail is empty', (tester) async {
      await tester.pumpWidget(_wrap(EventCard(event: _event(detail: ''))));
      await tester.pump();

      expect(find.byType(EventCard), findsOneWidget);
    });
  });
}
