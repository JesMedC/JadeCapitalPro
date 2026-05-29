// Sprint 15 — Widget tests for BacktestProgressBar.
//
// Covers:
//   (a) Renders LinearProgressIndicator with value 0.0 at 0%
//   (b) Renders processedLabel and percent% text at 43%
//   (c) Renders LinearProgressIndicator with value 1.0 at 100%

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:jade_capital_v3/features/backtest/widgets/backtest_progress_bar.dart';

// ── Helper ────────────────────────────────────────────────────────────────────

Future<void> pumpBar(
  WidgetTester tester,
  int percent,
  String processedLabel,
) async {
  // GoogleFonts makes network calls in tests unless disabled.
  GoogleFonts.config.allowRuntimeFetching = false;

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: BacktestProgressBar(
            percent: percent,
            processedLabel: processedLabel,
          ),
        ),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // (a) 0%
  testWidgets('(a) renders LinearProgressIndicator with value 0.0 at 0%',
      (tester) async {
    await pumpBar(tester, 0, '0 / 100 candles');

    final indicator = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(indicator.value, 0.0);
  });

  testWidgets('(a) renders processedLabel text at 0%', (tester) async {
    await pumpBar(tester, 0, '0 / 100 candles');
    expect(find.text('0 / 100 candles'), findsOneWidget);
    expect(find.text('0%'), findsOneWidget);
  });

  // (b) 43%
  testWidgets('(b) renders processedLabel and percent% text at 43%',
      (tester) async {
    await pumpBar(tester, 43, '42 / 98 candles');

    expect(find.text('42 / 98 candles'), findsOneWidget);
    expect(find.text('43%'), findsOneWidget);
  });

  testWidgets('(b) LinearProgressIndicator value ≈ 0.43 at 43%',
      (tester) async {
    await pumpBar(tester, 43, '42 / 98 candles');

    final indicator = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(indicator.value, closeTo(0.43, 0.001));
  });

  // (c) 100%
  testWidgets('(c) renders LinearProgressIndicator with value 1.0 at 100%',
      (tester) async {
    await pumpBar(tester, 100, '100 / 100 candles');

    final indicator = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(indicator.value, 1.0);
  });

  testWidgets('(c) renders "100%" text at 100%', (tester) async {
    await pumpBar(tester, 100, '100 / 100 candles');
    expect(find.text('100%'), findsOneWidget);
  });
}
