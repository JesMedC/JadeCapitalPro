// Tests for toTVSymbol() and toTVInterval() mapping functions.
//
// Covers:
// - All 10 instruments map to the correct TradingView symbol
// - All 7 timeframes map to the correct TradingView interval
// - Unknown instrument falls back to stripped-and-uppercased form
// - Unknown timeframe falls back to 'D'

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/chart/tradingview_chart_native.dart';

void main() {
  // ── toTVSymbol ─────────────────────────────────────────────────────────────

  group('toTVSymbol — known instruments', () {
    test('EUR/USD → FX:EURUSD', () {
      expect(toTVSymbol('EUR/USD'), equals('FX:EURUSD'));
    });

    test('GBP/USD → FX:GBPUSD', () {
      expect(toTVSymbol('GBP/USD'), equals('FX:GBPUSD'));
    });

    test('USD/JPY → FX:USDJPY', () {
      expect(toTVSymbol('USD/JPY'), equals('FX:USDJPY'));
    });

    test('AUD/USD → FX:AUDUSD', () {
      expect(toTVSymbol('AUD/USD'), equals('FX:AUDUSD'));
    });

    test('USD/CAD → FX:USDCAD', () {
      expect(toTVSymbol('USD/CAD'), equals('FX:USDCAD'));
    });

    test('EUR/JPY → FX:EURJPY', () {
      expect(toTVSymbol('EUR/JPY'), equals('FX:EURJPY'));
    });

    test('GBP/JPY → FX:GBPJPY', () {
      expect(toTVSymbol('GBP/JPY'), equals('FX:GBPJPY'));
    });

    test('NZD/USD → FX:NZDUSD', () {
      expect(toTVSymbol('NZD/USD'), equals('FX:NZDUSD'));
    });

    test('USD/CHF → FX:USDCHF', () {
      expect(toTVSymbol('USD/CHF'), equals('FX:USDCHF'));
    });

    test('BTC/USD → BINANCE:BTCUSDT', () {
      expect(toTVSymbol('BTC/USD'), equals('BINANCE:BTCUSDT'));
    });
  });

  group('toTVSymbol — fallback', () {
    test('unknown instrument strips slash and uppercases', () {
      expect(toTVSymbol('XAU/USD'), equals('XAUUSD'));
    });

    test('instrument without slash returns uppercased string', () {
      expect(toTVSymbol('EURUSD'), equals('EURUSD'));
    });
  });

  // ── toTVInterval ───────────────────────────────────────────────────────────

  group('toTVInterval — known timeframes', () {
    test('1m → 1', () {
      expect(toTVInterval('1m'), equals('1'));
    });

    test('5m → 5', () {
      expect(toTVInterval('5m'), equals('5'));
    });

    test('15m → 15', () {
      expect(toTVInterval('15m'), equals('15'));
    });

    test('30m → 30', () {
      expect(toTVInterval('30m'), equals('30'));
    });

    test('1h → 60', () {
      expect(toTVInterval('1h'), equals('60'));
    });

    test('4h → 240', () {
      expect(toTVInterval('4h'), equals('240'));
    });

    test('1d → D', () {
      expect(toTVInterval('1d'), equals('D'));
    });
  });

  group('toTVInterval — fallback', () {
    test('unknown timeframe returns D', () {
      expect(toTVInterval('unknown'), equals('D'));
    });

    test('empty string returns D', () {
      expect(toTVInterval(''), equals('D'));
    });

    test('2h returns D (not in map)', () {
      expect(toTVInterval('2h'), equals('D'));
    });
  });
}
