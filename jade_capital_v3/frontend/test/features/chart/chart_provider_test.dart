// Sprint 13 — Unit tests for ChartPreferencesNotifier overlay state methods.
//
// Covers spec scenarios:
//   SC-COS-01a: default state → activeOverlay == null, showOverlay == false
//   SC-COS-02a: setOverlay(result) → both fields updated, single emission
//   SC-COS-02b: setOverlay(resultB) when resultA already active → activeOverlay == resultB
//   SC-COS-03a: clearOverlay() → activeOverlay == null, showOverlay == false
//   SC-COS-04a: toggleOverlay() when showOverlay == true → becomes false
//   SC-COS-04b: toggleOverlay() when showOverlay == false and overlay present → becomes true
//   SC-COS-04c: toggleOverlay() when activeOverlay == null → no emission, showOverlay stays false

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/chart/chart_provider.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/core/network/chart_api.dart';
import 'package:jade_capital_v3/core/network/api_client.dart';

// ── Fake ChartApi ─────────────────────────────────────────────────────────────

/// Minimal fake ChartApi that tracks how many times updatePreferences is called.
class _FakeChartApi extends ChartApi {
  _FakeChartApi() : super(_FakeApiClient());

  int updateCallCount = 0;

  @override
  Future<ChartPreferences> getPreferences() async =>
      const ChartPreferences(instrument: 'EUR/USD', timeframe: '5m');

  @override
  Future<void> updatePreferences({
    required String instrument,
    required String timeframe,
  }) async {
    updateCallCount++;
  }
}

/// Minimal ApiClient stub to satisfy ChartApi's super constructor.
class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super(baseUrl: 'http://localhost:3000');
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

ScannerResult _makeResult({String id = 'scan-001', String pattern = 'Gartley'}) =>
    ScannerResult(
      id: id,
      instrument: 'EUR/USD',
      timeframe: '5m',
      pattern: pattern,
      direction: 'CALL',
      entryPrice: 1.08765,
      createdAt: DateTime.parse('2026-05-24T10:00:00.000Z'),
    );

// ── Helper ────────────────────────────────────────────────────────────────────

ChartPreferencesNotifier _buildNotifier([_FakeChartApi? api]) {
  return ChartPreferencesNotifier(chartApi: api ?? _FakeChartApi());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('ChartPreferencesNotifier overlay state', () {
    // SC-COS-01a: default state
    test('SC-COS-01a: default state has null activeOverlay and false showOverlay', () {
      final notifier = _buildNotifier();
      expect(notifier.state.activeOverlay, isNull);
      expect(notifier.state.showOverlay, isFalse);
    });

    // SC-COS-02a: setOverlay sets both fields in one emission
    test('SC-COS-02a: setOverlay sets activeOverlay and showOverlay = true', () {
      final notifier = _buildNotifier();
      final result = _makeResult();

      final emissions = <ChartPreferencesState>[];
      notifier.addListener((s) => emissions.add(s), fireImmediately: false);

      notifier.setOverlay(result);

      expect(notifier.state.activeOverlay, equals(result));
      expect(notifier.state.showOverlay, isTrue);
      // Exactly one state emission from setOverlay
      expect(emissions.length, equals(1));
    });

    // SC-COS-02b: setOverlay replaces a previous overlay
    test('SC-COS-02b: setOverlay with resultB replaces resultA; showOverlay stays true', () {
      final notifier = _buildNotifier();
      final resultA = _makeResult(id: 'scan-001', pattern: 'Gartley');
      final resultB = _makeResult(id: 'scan-002', pattern: 'Bat');

      notifier.setOverlay(resultA);
      notifier.setOverlay(resultB);

      expect(notifier.state.activeOverlay, equals(resultB));
      expect(notifier.state.showOverlay, isTrue);
    });

    // SC-COS-03a: clearOverlay resets both fields
    test('SC-COS-03a: clearOverlay sets activeOverlay = null and showOverlay = false', () {
      final notifier = _buildNotifier();
      notifier.setOverlay(_makeResult());
      expect(notifier.state.activeOverlay, isNotNull); // sanity

      notifier.clearOverlay();

      expect(notifier.state.activeOverlay, isNull);
      expect(notifier.state.showOverlay, isFalse);
    });

    // SC-COS-04a: toggleOverlay when visible hides the panel
    test('SC-COS-04a: toggleOverlay when showOverlay == true → becomes false', () {
      final notifier = _buildNotifier();
      notifier.setOverlay(_makeResult()); // showOverlay = true

      notifier.toggleOverlay();

      expect(notifier.state.showOverlay, isFalse);
      expect(notifier.state.activeOverlay, isNotNull); // overlay stays set
    });

    // SC-COS-04b: toggleOverlay when hidden re-shows the panel
    test('SC-COS-04b: toggleOverlay when showOverlay == false and overlay set → becomes true', () {
      final notifier = _buildNotifier();
      notifier.setOverlay(_makeResult());
      notifier.toggleOverlay(); // hide (showOverlay = false)

      notifier.toggleOverlay(); // show again

      expect(notifier.state.showOverlay, isTrue);
    });

    // SC-COS-04c: toggleOverlay with no active overlay is a no-op
    test('SC-COS-04c: toggleOverlay when activeOverlay == null → no emission', () {
      final notifier = _buildNotifier();

      final emissions = <ChartPreferencesState>[];
      notifier.addListener((s) => emissions.add(s), fireImmediately: false);

      notifier.toggleOverlay(); // no-op

      expect(emissions, isEmpty);
      expect(notifier.state.showOverlay, isFalse);
      expect(notifier.state.activeOverlay, isNull);
    });

    // Overlay operations must NOT call _persistAsync (server persistence)
    test('setOverlay does NOT call updatePreferences (overlay is session-scoped)', () {
      final fakeApi = _FakeChartApi();
      final notifier = _buildNotifier(fakeApi);

      notifier.setOverlay(_makeResult());

      expect(fakeApi.updateCallCount, equals(0));
    });

    test('clearOverlay does NOT call updatePreferences', () {
      final fakeApi = _FakeChartApi();
      final notifier = _buildNotifier(fakeApi);

      notifier.setOverlay(_makeResult());
      notifier.clearOverlay();

      expect(fakeApi.updateCallCount, equals(0));
    });

    test('toggleOverlay does NOT call updatePreferences', () {
      final fakeApi = _FakeChartApi();
      final notifier = _buildNotifier(fakeApi);

      notifier.setOverlay(_makeResult());
      notifier.toggleOverlay();

      expect(fakeApi.updateCallCount, equals(0));
    });
  });

  group('ChartPreferencesState copyWith', () {
    test('clearOverlay=true nullifies activeOverlay regardless of new value', () {
      const initial = ChartPreferencesState(
        activeOverlay: null,
        showOverlay: true,
      );
      // Build a state with an overlay first
      final withOverlay = initial.copyWith(
        activeOverlay: _makeResult(),
        showOverlay: true,
      );
      expect(withOverlay.activeOverlay, isNotNull);

      final cleared = withOverlay.copyWith(clearOverlay: true, showOverlay: false);
      expect(cleared.activeOverlay, isNull);
      expect(cleared.showOverlay, isFalse);
    });

    test('copyWith without clearOverlay preserves existing activeOverlay', () {
      final result = _makeResult();
      final state = ChartPreferencesState(
        activeOverlay: result,
        showOverlay: true,
      );

      final next = state.copyWith(instrument: 'GBP/USD');
      expect(next.activeOverlay, equals(result));
      expect(next.showOverlay, isTrue);
    });
  });
}
