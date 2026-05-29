// Sprint 13 — Widget tests for XabcdOverlayPanel.
//
// Covers spec scenarios:
//   SC-XOP-01a: bullish fixture → X, A, B, C, D labels present; CALL badge green
//   SC-XOP-01b: bearish fixture → PUT badge red
//   SC-XOP-01c: points.prz == null → 'N/A' present, no exception
//   SC-XOP-01d: tap close button → clearOverlay called (showOverlay = false)
//   SC-XOP-03a: all four trade levels present → all prices rendered
//   SC-XOP-03b: TP2 absent → '—' appears in TP2 row
//   SC-XOP-04a: close IconButton semantics label contains "Dismiss"
//   SC-XOP-08a: disclaimer text present

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/chart_api.dart';
import 'package:jade_capital_v3/core/theme/app_theme.dart';
import 'package:jade_capital_v3/features/chart/chart_provider.dart';
import 'package:jade_capital_v3/features/chart/widgets/xabcd_overlay_panel.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';

// ── Fake ChartApi ─────────────────────────────────────────────────────────────

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000');
}

class _FakeChartApi extends ChartApi {
  _FakeChartApi() : super(_FakeApiClient());

  @override
  Future<ChartPreferences> getPreferences() async =>
      const ChartPreferences(instrument: 'EUR/USD', timeframe: '5m');

  @override
  Future<void> updatePreferences({
    required String instrument,
    required String timeframe,
  }) async {}
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/// Build a ScannerResult with full XABCD metadata (prices + times + ATR for PRZ fallback).
ScannerResult _makeBullishResult({
  bool includePrz = false,
  bool includeAtr = true,
  bool includeTimes = true,
  bool includeTP2 = true,
}) {
  return ScannerResult(
    id: 'scan-xop-001',
    instrument: 'EUR/USD',
    timeframe: '5m',
    pattern: 'Gartley',
    direction: 'CALL',
    entryPrice: 1.08765,
    stopLoss: 1.08000,
    takeProfit: 1.09400,
    takeProfit2: includeTP2 ? 1.10200 : null,
    confidence: 87.5,
    metadata: {
      'points': {
        'x': 1.0000,
        'a': 1.0500,
        'b': 1.0191,
        'c': 1.0350,
        'd': 1.0393,
      },
      if (includeTimes)
        'times': {
          'x': 1_700_000_000_000,
          'a': 1_700_000_003_000,
          'b': 1_700_000_006_000,
          'c': 1_700_000_009_000,
          'd': 1_700_000_012_000,
        },
      if (includeAtr) 'atr': 0.0020,
      if (includePrz) 'prz_min': 1.0350,
      if (includePrz) 'prz_max': 1.0430,
    },
    createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
  );
}

ScannerResult _makeBearishResult() {
  return ScannerResult(
    id: 'scan-xop-002',
    instrument: 'GBP/USD',
    timeframe: '1h',
    pattern: 'Bat',
    direction: 'PUT',
    entryPrice: 1.26670,
    stopLoss: 1.27400,
    takeProfit: 1.25800,
    confidence: 90.0,
    metadata: {
      'points': {
        'x': 1.2800,
        'a': 1.2400,
        'b': 1.2647,
        'c': 1.2510,
        'd': 1.2667,
      },
      'atr': 0.0015,
    },
    createdAt: DateTime.parse('2026-05-24T11:00:00Z'),
  );
}

// ── Pump helper ───────────────────────────────────────────────────────────────

/// Pump [XabcdOverlayPanel] inside a [ProviderScope] with a real
/// [ChartPreferencesNotifier] backed by a [_FakeChartApi].
Future<void> _pumpPanel(
  WidgetTester tester,
  ScannerResult overlay, {
  ChartPreferencesNotifier? notifier,
}) async {
  final fakeApi = _FakeChartApi();
  final overrideNotifier = notifier ??
      ChartPreferencesNotifier(chartApi: fakeApi)
        ..setOverlay(overlay); // set overlay so the panel has context

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        chartPreferencesProvider.overrideWith((_) => overrideNotifier),
      ],
      child: MaterialApp(
        theme: ThemeData.dark(),
        home: Scaffold(
          body: SizedBox(
            width: 400,
            height: 300,
            child: XabcdOverlayPanel(overlay: overlay),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('XabcdOverlayPanel widget tests', () {
    // SC-XOP-01a: bullish fixture → five point labels present
    testWidgets('SC-XOP-01a: renders X, A, B, C, D labels for bullish fixture',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      expect(find.text('X'), findsOneWidget);
      expect(find.text('A'), findsOneWidget);
      expect(find.text('B'), findsOneWidget);
      expect(find.text('C'), findsOneWidget);
      expect(find.text('D'), findsOneWidget);
    });

    testWidgets('SC-XOP-01a: CALL direction badge uses accent (green) color',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      // Find containers with accent color decoration
      final containers =
          tester.widgetList<Container>(find.byType(Container)).toList();
      final accentContainers = containers.where((c) {
        final decoration = c.decoration;
        if (decoration is BoxDecoration) {
          return decoration.color == AppColors.accent;
        }
        return false;
      }).toList();

      expect(accentContainers, isNotEmpty);
    });

    // SC-XOP-01b: bearish fixture → PUT badge uses danger (red) color
    testWidgets('SC-XOP-01b: PUT direction badge uses danger (red) color',
        (tester) async {
      await _pumpPanel(tester, _makeBearishResult());

      expect(find.text('PUT'), findsOneWidget);

      final containers =
          tester.widgetList<Container>(find.byType(Container)).toList();
      final dangerContainers = containers.where((c) {
        final decoration = c.decoration;
        if (decoration is BoxDecoration) {
          return decoration.color == AppColors.danger;
        }
        return false;
      }).toList();

      expect(dangerContainers, isNotEmpty);
    });

    // SC-XOP-01c: null PRZ → 'N/A' text, no exception
    testWidgets('SC-XOP-01c: PRZ N/A when points.prz is null', (tester) async {
      // Build result without ATR or explicit PRZ → prz == null
      final result = ScannerResult(
        id: 'scan-xop-003',
        instrument: 'EUR/USD',
        timeframe: '5m',
        pattern: 'Gartley',
        direction: 'CALL',
        entryPrice: 1.08765,
        metadata: {
          'points': {
            'x': 1.0000,
            'a': 1.0500,
            'b': 1.0191,
            'c': 1.0350,
            'd': 1.0393,
          },
          // no 'atr', no 'prz_min'/'prz_max' → prz == null
        },
        createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
      );

      await _pumpPanel(tester, result);
      expect(find.textContaining('N/A'), findsOneWidget);
    });

    // SC-XOP-01d: tap close button → clearOverlay called (showOverlay = false)
    testWidgets('SC-XOP-01d: tapping close button calls clearOverlay',
        (tester) async {
      final fakeApi = _FakeChartApi();
      final notifier = ChartPreferencesNotifier(chartApi: fakeApi);
      final overlay = _makeBullishResult();
      notifier.setOverlay(overlay);

      await _pumpPanel(tester, overlay, notifier: notifier);

      // Before tap: overlay is active
      expect(notifier.state.showOverlay, isTrue);

      // Tap the close (Icons.close) button
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();

      expect(notifier.state.showOverlay, isFalse);
      expect(notifier.state.activeOverlay, isNull);
    });

    // SC-XOP-03a: all four trade levels present → all prices rendered
    testWidgets('SC-XOP-03a: all four trade levels are rendered', (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      expect(find.text('Entry'), findsOneWidget);
      expect(find.text('SL'), findsOneWidget);
      expect(find.text('TP1'), findsOneWidget);
      expect(find.text('TP2'), findsOneWidget);
    });

    // SC-XOP-03b: TP2 absent → '—' appears exactly once in TP2 row
    testWidgets('SC-XOP-03b: TP2 null renders dash', (tester) async {
      await _pumpPanel(tester, _makeBullishResult(includeTP2: false));

      // '—' should appear once (for the missing TP2)
      expect(find.text('—'), findsOneWidget);
    });

    // SC-XOP-04a: close IconButton has semantics label containing "Dismiss"
    testWidgets('SC-XOP-04a: close button semantic label contains "Dismiss"',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      // Find Semantics nodes containing "Dismiss"
      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) => s.properties.label?.contains('Dismiss') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected at least one Semantics widget with "Dismiss" label');
    });

    // SC-XOP-08a: disclaimer text is present
    testWidgets('SC-XOP-08a: detection time disclaimer is displayed',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      expect(
        find.text('Prices at detection time — not live'),
        findsOneWidget,
      );
    });

    // S14 gap — SC-XOP-A1: CALL direction badge Semantics label contains 'call' or 'CALL'
    testWidgets('SC-XOP-A1: CALL direction badge has Semantics label with call signal',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) =>
              s.properties.label?.toLowerCase().contains('call') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected Semantics label containing "call" for CALL direction');
    });

    // S14 gap — SC-XOP-A2: PUT direction badge Semantics label contains 'put' or 'PUT'
    testWidgets('SC-XOP-A2: PUT direction badge has Semantics label with put signal',
        (tester) async {
      await _pumpPanel(tester, _makeBearishResult());

      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) =>
              s.properties.label?.toLowerCase().contains('put') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected Semantics label containing "put" for PUT direction');
    });

    // S14 gap — SC-XOP-A3: entryPrice-containing Semantics label present
    testWidgets('SC-XOP-A3: entry price value appears in at least one Semantics label',
        (tester) async {
      await _pumpPanel(tester, _makeBullishResult());

      // entryPrice = 1.08765 → formatted as "1.08765"
      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) =>
              s.properties.label?.contains('1.08765') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected at least one Semantics label containing the entry price "1.08765"');
    });

    // Pattern name is displayed
    testWidgets('renders pattern name in header', (tester) async {
      await _pumpPanel(tester, _makeBullishResult());
      expect(find.text('Gartley'), findsOneWidget);
    });

    // Points row is absent when metadata has no points key
    testWidgets('points row absent when metadata has no points key',
        (tester) async {
      final result = ScannerResult(
        id: 'scan-xop-004',
        instrument: 'EUR/USD',
        timeframe: '5m',
        pattern: 'Gartley',
        direction: 'CALL',
        entryPrice: 1.08765,
        metadata: null, // no metadata → points == null
        createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
      );

      await _pumpPanel(tester, result);

      // X/A/B/C/D labels should NOT be present when points is null
      expect(find.text('X'), findsNothing);
    });
  });
}
