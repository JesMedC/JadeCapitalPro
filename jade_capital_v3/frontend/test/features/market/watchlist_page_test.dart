import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/market/models/watchlist_state.dart';
import 'package:jade_capital_v3/features/market/providers/watchlist_provider.dart';
import 'package:jade_capital_v3/features/market/watchlist_page.dart';
import 'package:jade_capital_v3/features/market/widgets/instrument_card.dart';

// ── Fake WatchlistNotifier for testing ──────────────────────────────────────

class _FakeWatchlistNotifier extends WatchlistNotifier {
  _FakeWatchlistNotifier(WatchlistState initialState)
      : super(_NoopApi(), _NoopWsClient()) {
    state = initialState;
  }
}

// Minimal stubs — never actually called in widget tests.
class _NoopApi implements dynamic {
  @override
  dynamic noSuchMethod(Invocation i) async => [];
}

class _NoopWsClient implements dynamic {
  @override
  dynamic noSuchMethod(Invocation i) {}
}

// ── Helper ───────────────────────────────────────────────────────────────────

Widget _buildPage(WatchlistState state) {
  return ProviderScope(
    overrides: [
      watchlistProvider.overrideWith(
        (ref) => _FakeWatchlistNotifier(state),
      ),
    ],
    child: const MaterialApp(home: WatchlistPage()),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

void main() {
  group('WatchlistPage', () {
    testWidgets('shows CircularProgressIndicator when loading', (tester) async {
      await tester.pumpWidget(_buildPage(
        const WatchlistState(status: WatchlistLoadStatus.loading),
      ));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows error view when status is error', (tester) async {
      await tester.pumpWidget(_buildPage(
        const WatchlistState(
          status: WatchlistLoadStatus.error,
          error: 'Network failure',
        ),
      ));
      await tester.pump();

      expect(find.text('Failed to load watchlist'), findsOneWidget);
      expect(find.text('Network failure'), findsOneWidget);
    });

    testWidgets('renders N InstrumentCards for N instruments', (tester) async {
      const instruments = ['EUR/USD', 'GBP/USD', 'USD/JPY'];
      await tester.pumpWidget(_buildPage(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: instruments,
        ),
      ));
      await tester.pump();

      expect(find.byType(InstrumentCard), findsNWidgets(instruments.length));
    });

    testWidgets('FAB is visible when loaded', (tester) async {
      await tester.pumpWidget(_buildPage(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'],
        ),
      ));
      await tester.pump();

      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('FAB opens bottom sheet', (tester) async {
      await tester.pumpWidget(_buildPage(
        const WatchlistState(
          status: WatchlistLoadStatus.loaded,
          instruments: ['EUR/USD'],
        ),
      ));
      await tester.pump();

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // AddRemoveInstrumentSheet contains the header text 'Manage Watchlist'
      expect(find.text('Manage Watchlist'), findsOneWidget);
    });
  });
}
