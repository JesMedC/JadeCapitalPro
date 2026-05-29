// Sprint 9 — Flutter widget tests for PatternCard.
//
// Covers (task 4.7):
//   (a) CALL badge: green background, text 'CALL'
//   (b) PUT badge: red background, text 'PUT'
//   (c) onTap fires exactly once when card is tapped
//   (d) Prices display: entryPrice formatted to 5 decimal places

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/features/scanner/widgets/pattern_card.dart';
import 'package:jade_capital_v3/core/theme/app_theme.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

ScannerResult _makeResult({
  String id = 'scan-0001',
  String instrument = 'EUR/USD',
  String timeframe = '1h',
  String pattern = 'Gartley',
  String direction = 'CALL',
  double? entryPrice = 1.08765,
  double? stopLoss = 1.08000,
  double? takeProfit = 1.09400,
  double? confidence = 87.0,
}) =>
    ScannerResult(
      id: id,
      instrument: instrument,
      timeframe: timeframe,
      pattern: pattern,
      direction: direction,
      entryPrice: entryPrice,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      confidence: confidence,
      createdAt: DateTime.parse('2026-05-23T10:00:00Z'),
    );

/// Pump a [PatternCard] inside a minimal [MaterialApp].
Future<void> _pumpCard(
  WidgetTester tester,
  ScannerResult result, {
  VoidCallback? onTap,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: Scaffold(
        body: SizedBox(
          width: 400,
          child: PatternCard(
            result: result,
            onTap: onTap ?? () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('PatternCard widget (task 4.7)', () {
    // (a) CALL badge
    testWidgets('renders CALL text for direction CALL', (tester) async {
      await _pumpCard(tester, _makeResult(direction: 'CALL'));
      expect(find.text('CALL'), findsOneWidget);
    });

    testWidgets('CALL badge has green background (AppColors.accent)',
        (tester) async {
      await _pumpCard(tester, _makeResult(direction: 'CALL'));

      // Find all Container widgets with green (accent) decoration colour.
      final containers = tester.widgetList<Container>(find.byType(Container));
      final greenContainers = containers.where((c) {
        final decoration = c.decoration;
        if (decoration is BoxDecoration) {
          return decoration.color == AppColors.accent;
        }
        return false;
      });
      expect(greenContainers, isNotEmpty,
          reason: 'Expected a Container with green (accent) background for CALL badge');
    });

    // (b) PUT badge
    testWidgets('renders PUT text for direction PUT', (tester) async {
      await _pumpCard(tester, _makeResult(direction: 'PUT'));
      expect(find.text('PUT'), findsOneWidget);
    });

    testWidgets('PUT badge has red background (AppColors.danger)',
        (tester) async {
      await _pumpCard(tester, _makeResult(direction: 'PUT'));

      final containers = tester.widgetList<Container>(find.byType(Container));
      final redContainers = containers.where((c) {
        final decoration = c.decoration;
        if (decoration is BoxDecoration) {
          return decoration.color == AppColors.danger;
        }
        return false;
      });
      expect(redContainers, isNotEmpty,
          reason: 'Expected a Container with red (danger) background for PUT badge');
    });

    // (c) onTap fires exactly once
    testWidgets('onTap callback fires exactly once on tap', (tester) async {
      var tapCount = 0;
      await _pumpCard(
        tester,
        _makeResult(),
        onTap: () => tapCount++,
      );

      // Tap the InkWell inside the card.
      await tester.tap(find.byType(InkWell).first);
      await tester.pump();

      expect(tapCount, equals(1));
    });

    // (d) Entry price formatted to 5 decimal places
    testWidgets('displays entry price formatted to 5 dp', (tester) async {
      await _pumpCard(tester, _makeResult(entryPrice: 1.08765));
      // Expect "Entry: 1.08765" somewhere in the widget tree.
      expect(find.textContaining('1.08765'), findsWidgets);
    });

    testWidgets('displays dash for null entry price', (tester) async {
      await _pumpCard(tester, _makeResult(entryPrice: null));
      expect(find.textContaining('Entry: -'), findsOneWidget);
    });

    // ── Content assertions ────────────────────────────────────────────────────

    testWidgets('renders pattern name', (tester) async {
      await _pumpCard(tester, _makeResult(pattern: 'Butterfly'));
      expect(find.text('Butterfly'), findsOneWidget);
    });

    testWidgets('renders instrument name', (tester) async {
      await _pumpCard(tester, _makeResult(instrument: 'GBP/USD'));
      expect(find.text('GBP/USD'), findsOneWidget);
    });

    testWidgets('renders timeframe chip label', (tester) async {
      await _pumpCard(tester, _makeResult(timeframe: '4h'));
      expect(find.text('4h'), findsOneWidget);
    });

    testWidgets('renders confidence percentage text', (tester) async {
      await _pumpCard(tester, _makeResult(confidence: 87.0));
      expect(find.textContaining('87%'), findsOneWidget);
    });
  });
}
