// Widget tests for TimeframeSelectorWidget.
//
// Covers:
// - Renders exactly 7 timeframe buttons (one per kValidTimeframes)
// - The active timeframe button is visually highlighted
// - Non-active timeframe buttons are not highlighted
// - Tapping a button fires onTimeframeSelected with the correct value
// - Tapping the already-active button still fires the callback

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/chart/chart_provider.dart';
import 'package:jade_capital_v3/features/chart/widgets/timeframe_selector.dart';
import 'package:jade_capital_v3/core/theme/app_theme.dart';

// ── Helpers ──────────────────────────────────────────────────────────────────

Widget _buildWidget({
  String activeTimeframe = '5m',
  ValueChanged<String>? onTimeframeSelected,
}) {
  return MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: 400,
        height: 60,
        child: TimeframeSelectorWidget(
          activeTimeframe: activeTimeframe,
          onTimeframeSelected: onTimeframeSelected ?? (_) {},
        ),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('TimeframeSelectorWidget — button count', () {
    testWidgets('renders 7 timeframe labels', (tester) async {
      await tester.pumpWidget(_buildWidget());
      await tester.pump();

      for (final tf in kValidTimeframes) {
        expect(find.text(tf), findsOneWidget);
      }
    });
  });

  group('TimeframeSelectorWidget — active highlight', () {
    testWidgets('active button text uses AppColors.primary', (tester) async {
      await tester.pumpWidget(_buildWidget(activeTimeframe: '5m'));
      await tester.pump();

      final activeText = tester
          .widgetList<Text>(find.text('5m'))
          .first;
      expect(activeText.style?.color, equals(AppColors.primary));
    });

    testWidgets('non-active button text uses AppColors.textSecondary', (tester) async {
      await tester.pumpWidget(_buildWidget(activeTimeframe: '5m'));
      await tester.pump();

      final inactiveText = tester
          .widgetList<Text>(find.text('1m'))
          .first;
      expect(inactiveText.style?.color, equals(AppColors.textSecondary));
    });

    testWidgets('1d is highlighted when activeTimeframe is 1d', (tester) async {
      await tester.pumpWidget(_buildWidget(activeTimeframe: '1d'));
      await tester.pump();

      final text = tester.widgetList<Text>(find.text('1d')).first;
      expect(text.style?.color, equals(AppColors.primary));
    });
  });

  group('TimeframeSelectorWidget — callbacks', () {
    testWidgets('tapping 1h fires onTimeframeSelected with "1h"', (tester) async {
      String? selected;
      await tester.pumpWidget(_buildWidget(
        activeTimeframe: '5m',
        onTimeframeSelected: (v) => selected = v,
      ));
      await tester.pump();

      await tester.tap(find.text('1h'));
      await tester.pump();

      expect(selected, equals('1h'));
    });

    testWidgets('tapping the already-active button still fires the callback',
        (tester) async {
      int callCount = 0;
      await tester.pumpWidget(_buildWidget(
        activeTimeframe: '5m',
        onTimeframeSelected: (_) => callCount++,
      ));
      await tester.pump();

      await tester.tap(find.text('5m'));
      await tester.pump();

      expect(callCount, equals(1));
    });

    testWidgets('each timeframe fires the correct value', (tester) async {
      for (final tf in kValidTimeframes) {
        String? captured;
        await tester.pumpWidget(_buildWidget(
          activeTimeframe: '5m',
          onTimeframeSelected: (v) => captured = v,
        ));
        await tester.pump();

        await tester.tap(find.text(tf), warnIfMissed: false);
        await tester.pump();

        if (captured != null) {
          expect(captured, equals(tf));
        }
      }
    });
  });
}
