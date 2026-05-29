import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/market/models/price_tick.dart';
import 'package:jade_capital_v3/features/market/widgets/instrument_card.dart';

// ── Helper ────────────────────────────────────────────────────────────────────

Widget _card({required String symbol, PriceTick? tick}) {
  return MaterialApp(
    home: Scaffold(
      body: InstrumentCard(symbol: symbol, tick: tick),
    ),
  );
}

PriceTick _tick({
  String instrument = 'EUR/USD',
  double bid = 1.08500,
  double ask = 1.08520,
  double spread = 0.00020,
  int timestamp = 1000,
}) =>
    PriceTick(
      instrument: instrument,
      bid: bid,
      ask: ask,
      spread: spread,
      timestamp: timestamp,
    );

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('InstrumentCard', () {
    testWidgets('displays symbol label', (tester) async {
      await tester.pumpWidget(_card(symbol: 'EUR/USD'));
      expect(find.text('EUR/USD'), findsOneWidget);
    });

    testWidgets('shows placeholder when tick is null', (tester) async {
      await tester.pumpWidget(_card(symbol: 'EUR/USD'));
      expect(find.text('—'), findsOneWidget);
    });

    testWidgets('displays bid formatted to 5 decimal places', (tester) async {
      await tester.pumpWidget(_card(
        symbol: 'EUR/USD',
        tick: _tick(bid: 1.08500),
      ));
      await tester.pump();
      expect(find.text('1.08500'), findsWidgets);
    });

    testWidgets('displays ask formatted to 5 decimal places', (tester) async {
      await tester.pumpWidget(_card(
        symbol: 'EUR/USD',
        tick: _tick(ask: 1.08520),
      ));
      await tester.pump();
      expect(find.text('1.08520'), findsWidgets);
    });

    testWidgets('shows arrow_upward icon after bid increases', (tester) async {
      final key = GlobalKey<State<InstrumentCard>>();

      // Initial tick
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: InstrumentCard(
            key: key,
            symbol: 'EUR/USD',
            tick: _tick(bid: 1.08500, timestamp: 1000),
          ),
        ),
      ));
      await tester.pump();

      // New tick with higher bid
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: InstrumentCard(
            key: key,
            symbol: 'EUR/USD',
            tick: _tick(bid: 1.08510, timestamp: 2000),
          ),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 401));

      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    });

    testWidgets('shows arrow_downward icon after bid decreases', (tester) async {
      final key = GlobalKey<State<InstrumentCard>>();

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: InstrumentCard(
            key: key,
            symbol: 'EUR/USD',
            tick: _tick(bid: 1.08500, timestamp: 1000),
          ),
        ),
      ));
      await tester.pump();

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: InstrumentCard(
            key: key,
            symbol: 'EUR/USD',
            tick: _tick(bid: 1.08490, timestamp: 2000),
          ),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 401));

      expect(find.byIcon(Icons.arrow_downward), findsOneWidget);
    });

    testWidgets('does not crash on first tick (no previous)', (tester) async {
      await tester.pumpWidget(_card(
        symbol: 'EUR/USD',
        tick: _tick(bid: 1.08500, timestamp: 1000),
      ));
      await tester.pump();
      // Should not throw
    });
  });
}
