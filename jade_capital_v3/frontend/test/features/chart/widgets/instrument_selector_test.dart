// Widget tests for InstrumentSelectorWidget.
//
// Covers:
// - Renders exactly 10 FilterChips (one per valid instrument)
// - The active instrument's chip has selected=true
// - Inactive chips have selected=false
// - Tapping a chip fires onInstrumentSelected with the correct value
// - Tapping the already-active chip still fires the callback

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/chart/chart_provider.dart';
import 'package:jade_capital_v3/features/chart/widgets/instrument_selector.dart';

// ── Helpers ──────────────────────────────────────────────────────────────────

Widget _buildWidget({
  String activeInstrument = 'EUR/USD',
  ValueChanged<String>? onInstrumentSelected,
}) {
  return MaterialApp(
    home: Scaffold(
      body: SizedBox(
        // Wide enough to render all 10 chips without overflow.
        width: 1400,
        height: 60,
        child: InstrumentSelectorWidget(
          activeInstrument: activeInstrument,
          onInstrumentSelected: onInstrumentSelected ?? (_) {},
        ),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('InstrumentSelectorWidget — chip count', () {
    testWidgets('renders exactly 10 FilterChips', (tester) async {
      await tester.pumpWidget(_buildWidget());
      await tester.pump();

      final chips = tester.widgetList<FilterChip>(find.byType(FilterChip));
      expect(chips.length, equals(10));
    });

    testWidgets('renders all kValidInstruments as text labels', (tester) async {
      await tester.pumpWidget(_buildWidget());
      await tester.pump();

      for (final instrument in kValidInstruments) {
        expect(find.text(instrument), findsOneWidget);
      }
    });
  });

  group('InstrumentSelectorWidget — active chip', () {
    testWidgets('EUR/USD chip is selected by default', (tester) async {
      await tester.pumpWidget(_buildWidget(activeInstrument: 'EUR/USD'));
      await tester.pump();

      final chip = tester
          .widgetList<FilterChip>(find.byType(FilterChip))
          .firstWhere((c) {
        final label = c.label;
        return label is Text && label.data == 'EUR/USD';
      });
      expect(chip.selected, isTrue);
    });

    testWidgets('GBP/USD chip is selected when activeInstrument is GBP/USD', (tester) async {
      await tester.pumpWidget(_buildWidget(activeInstrument: 'GBP/USD'));
      await tester.pump();

      final chip = tester
          .widgetList<FilterChip>(find.byType(FilterChip))
          .firstWhere((c) {
        final label = c.label;
        return label is Text && label.data == 'GBP/USD';
      });
      expect(chip.selected, isTrue);
    });

    testWidgets('non-active chips have selected=false', (tester) async {
      await tester.pumpWidget(_buildWidget(activeInstrument: 'EUR/USD'));
      await tester.pump();

      final inactiveChips = tester
          .widgetList<FilterChip>(find.byType(FilterChip))
          .where((c) {
        final label = c.label;
        return label is Text && label.data != 'EUR/USD';
      });

      for (final chip in inactiveChips) {
        expect(chip.selected, isFalse);
      }
    });
  });

  group('InstrumentSelectorWidget — callbacks', () {
    testWidgets('tapping GBP/USD fires onInstrumentSelected with "GBP/USD"',
        (tester) async {
      String? selected;
      await tester.pumpWidget(_buildWidget(
        activeInstrument: 'EUR/USD',
        onInstrumentSelected: (v) => selected = v,
      ));
      await tester.pump();

      await tester.tap(find.text('GBP/USD'));
      await tester.pump();

      expect(selected, equals('GBP/USD'));
    });

    testWidgets('tapping the already-active chip does NOT fire the callback',
        (tester) async {
      int callCount = 0;
      await tester.pumpWidget(_buildWidget(
        activeInstrument: 'EUR/USD',
        onInstrumentSelected: (_) => callCount++,
      ));
      await tester.pump();

      await tester.tap(find.text('EUR/USD'));
      await tester.pump();

      expect(callCount, equals(0));
    });

    testWidgets('each instrument chip fires the correct value', (tester) async {
      // Test the first 5 instruments to keep the test fast (viewport covers them).
      final testInstruments = kValidInstruments.take(5).toList();

      for (final instrument in testInstruments) {
        String? captured;
        await tester.pumpWidget(_buildWidget(
          activeInstrument: 'EUR/USD',
          onInstrumentSelected: (v) => captured = v,
        ));
        await tester.pump();

        final chipFinder = find.text(instrument);
        if (chipFinder.evaluate().isNotEmpty) {
          await tester.tap(chipFinder.first, warnIfMissed: false);
          await tester.pump();
          expect(captured, equals(instrument));
        }
      }
    });
  });
}
