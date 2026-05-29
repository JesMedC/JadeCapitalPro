// Sprint 18 — Widget tests for _BottomNavBar index selection.
//
// Covers S14 gap AC-Nav-01 through AC-Nav-04:
//   AC-Nav-01: primary route '/dashboard' → currentIndex == 0
//   AC-Nav-02: primary route '/dashboard/trades' → currentIndex == 1
//   AC-Nav-03: secondary route '/dashboard/backtest' → currentIndex == 5
//   AC-Nav-04: unknown route '/unknown' → currentIndex == 0 (fallback)
//
// Strategy: pump DashboardPage via GoRouter so GoRouterState.of(context)
// resolves to the configured location. The BottomNavigationBar.currentIndex
// reflects the result of _calculateSelectedIndex().

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:jade_capital_v3/features/dashboard/dashboard_page.dart';

// ── Router helpers ────────────────────────────────────────────────────────────

/// Builds a [GoRouter] that navigates to [location] and renders
/// [DashboardPage] as the shell so [GoRouterState.matchedLocation]
/// is set to [location].
GoRouter _buildRouter(String location) {
  return GoRouter(
    initialLocation: location,
    routes: [
            ShellRoute(
              builder: (context, state, child) =>
                  DashboardPage(child: child),
              routes: [
                GoRoute(
                  path: '/dashboard',
                  builder: (context, state) => const SizedBox.shrink(),
                  routes: [
                    GoRoute(
                      path: 'trades',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'chart',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'scanner',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'journal',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'market',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'calendar',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'backtest',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'settings',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                    GoRoute(
                      path: 'unknown',
                      builder: (context, state) => const SizedBox.shrink(),
                    ),
                  ],
                ),
              ],
            ),
    ],
  );
}

Future<void> _pumpWithLocation(
  WidgetTester tester,
  String location,
) async {
  final router = _buildRouter(location);
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp.router(
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('_BottomNavBar — _calculateSelectedIndex()', () {
    // AC-Nav-01: '/dashboard' → index 0 (Home)
    testWidgets('AC-Nav-01: /dashboard → currentIndex == 0 (Home)',
        (tester) async {
      await _pumpWithLocation(tester, '/dashboard');

      final bar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(bar.currentIndex, equals(0));
    });

    // AC-Nav-02: '/dashboard/trades' → index 1 (Trades)
    testWidgets('AC-Nav-02: /dashboard/trades → currentIndex == 1 (Trades)',
        (tester) async {
      await _pumpWithLocation(tester, '/dashboard/trades');

      final bar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(bar.currentIndex, equals(1));
    });

    // AC-Nav-03: '/dashboard/backtest' → index 5 (More / secondary)
    testWidgets(
        'AC-Nav-03: /dashboard/backtest → currentIndex == 5 (secondary "More")',
        (tester) async {
      await _pumpWithLocation(tester, '/dashboard/backtest');

      final bar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(bar.currentIndex, equals(5));
    });

    // AC-Nav-04: '/dashboard/unknown' → index 0 (fallback to Home)
    testWidgets('AC-Nav-04: /dashboard/unknown → currentIndex == 0 (fallback Home)',
        (tester) async {
      await _pumpWithLocation(tester, '/dashboard/unknown');

      final bar = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      expect(bar.currentIndex, equals(0));
    });
  });
}
