import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'package:jade_capital_v3/features/market/models/watchlist_state.dart';
import 'package:jade_capital_v3/features/market/providers/watchlist_provider.dart';
import 'package:jade_capital_v3/features/market/widgets/add_remove_instrument_sheet.dart';

// ── Fake notifier ──────────────────────────────────────────────────────────

class _FakeNotifier extends WatchlistNotifier {
  _FakeNotifier(WatchlistState initialState)
      : super(_NoopApi(), _NoopWsClient()) {
    state = initialState;
  }

  @override
  Future<void> addInstrument(String instrument) async {
    // Track calls in tests via the state change
    final updated = [...state.instruments, instrument];
    state = state.copyWith(instruments: updated);
  }

  @override
  Future<void> removeInstrument(String instrument) async {
    if (state.instruments.length <= 1) return;
    final updated = state.instruments.where((i) => i != instrument).toList();
    state = state.copyWith(instruments: updated);
  }
}

class _NoopApi implements dynamic {
  @override
  dynamic noSuchMethod(Invocation i) async => [];
}

class _NoopWsClient implements dynamic {
  @override
  dynamic noSuchMethod(Invocation i) {}
}

// ── Helper ────────────────────────────────────────────────────────────────────

Widget _buildSheet(WatchlistState initialState) {
  return ProviderScope(
    overrides: [
      watchlistProvider.overrideWith(
        (ref) => _FakeNotifier(initialState),
      ),
    ],
    child: const MaterialApp(
      home: Scaffold(
        body: AddRemoveInstrumentSheet(),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  const allSymbols = kAllInstruments;

  group('AddRemoveInstrumentSheet', () {
    testWidgets('lists all 10 instruments', (tester) async {
      await tester.pumpWidget(_buildSheet(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'],
        ),
      ));
      await tester.pump();

      for (final symbol in allSymbols) {
        expect(find.text(symbol), findsOneWidget);
      }
    });

    testWidgets('selected instruments show check_circle icon', (tester) async {
      await tester.pumpWidget(_buildSheet(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD', 'GBP/USD'],
        ),
      ));
      await tester.pump();

      expect(find.byIcon(Icons.check_circle), findsNWidgets(2));
    });

    testWidgets('tapping unselected instrument calls addInstrument',
        (tester) async {
      await tester.pumpWidget(_buildSheet(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'],
        ),
      ));
      await tester.pump();

      // Tap 'GBP/USD' which is not selected
      await tester.tap(find.text('GBP/USD'));
      await tester.pump();

      // After add, GBP/USD should now show check_circle
      expect(find.byIcon(Icons.check_circle), findsNWidgets(2));
    });

    testWidgets('last instrument row shows cannot-remove indicator',
        (tester) async {
      await tester.pumpWidget(_buildSheet(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'], // only 1 → last item
        ),
      ));
      await tester.pump();

      expect(
        find.text('Cannot remove last instrument'),
        findsOneWidget,
      );
    });

    testWidgets('tapping last instrument does not call removeInstrument',
        (tester) async {
      await tester.pumpWidget(_buildSheet(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'],
        ),
      ));
      await tester.pump();

      // EUR/USD is selected and is the last item — tap should be no-op
      await tester.tap(find.text('EUR/USD'));
      await tester.pump();

      // Still only 1 instrument in state
      expect(find.byIcon(Icons.check_circle), findsNWidgets(1));
    });

    testWidgets('shows full-watchlist hint when 10 instruments selected',
        (tester) async {
      await tester.pumpWidget(_buildSheet(
        WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: List.of(kAllInstruments), // all 10
        ),
      ));
      await tester.pump();

      expect(
        find.textContaining('Watchlist is full'),
        findsOneWidget,
      );
    });
  });
}
