import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart' show authStateProvider;
import '../../features/auth/login_page.dart';
import '../../features/auth/register_page.dart';
import '../../features/dashboard/dashboard_page.dart'
    show DashboardPage, DashboardHomeContent;
import '../../features/trades/trades_page.dart';
import '../../features/chart/chart_page.dart';
import '../../features/scanner/models/scanner_result.dart';
import '../../features/journal/journal_page.dart';
import '../../features/goals/goals_page.dart';
import '../../features/alerts/alerts_page.dart';
import '../../features/market/calendar_page.dart';
import '../../features/market/watchlist_page.dart';
import '../../features/backtest/backtest_form_page.dart';
import '../../features/backtest/backtest_page.dart';
import '../../features/backtest/backtest_result_page.dart';
import '../../features/scanner/scanner_page.dart';
import '../../features/settings/settings_page.dart';
import '../../features/reports/reports_page.dart';

/// Provider that builds the GoRouter instance, reactive to auth state changes.
final routerProvider = Provider<GoRouter>((ref) {
  final isAuthenticated = ref.watch(
    authStateProvider.select((state) => state.isAuthenticated),
  );

  return GoRouter(
    initialLocation: '/dashboard',
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final isLoginRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';
      final isLoggedIn = isAuthenticated;

      // Not authenticated and not already on an auth page → redirect to login
      if (!isLoggedIn && !isLoginRoute) return '/login';

      // Authenticated but on an auth page → redirect to dashboard
      if (isLoggedIn && isLoginRoute) return '/dashboard';

      // Allow the navigation
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => DashboardPage(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: _DashboardHome(),
            ),
          ),
          GoRoute(
            path: '/dashboard/trades',
            name: 'trades',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: TradesPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/chart',
            name: 'chart',
            pageBuilder: (context, state) => NoTransitionPage(
              child: ChartPage(
                symbol: state.uri.queryParameters['symbol'],
                initialOverlay: state.extra as ScannerResult?,
              ),
            ),
          ),
          GoRoute(
            path: '/dashboard/journal',
            name: 'journal',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: JournalPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/goals',
            name: 'goals',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: GoalsPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/alerts',
            name: 'alerts',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: AlertsPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/settings',
            name: 'settings',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SettingsPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/market',
            name: 'market',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: WatchlistPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/calendar',
            name: 'calendar',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: CalendarPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/scanner',
            name: 'scanner',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ScannerPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/backtest',
            name: 'backtest',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: BacktestPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/backtest/form',
            name: 'backtestForm',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: BacktestFormPage(),
            ),
          ),
          GoRoute(
            path: '/dashboard/backtest/:id',
            name: 'backtestResult',
            pageBuilder: (context, state) => NoTransitionPage(
              child: BacktestResultPage(
                sessionId: state.pathParameters['id']!,
              ),
            ),
          ),
          GoRoute(
            path: '/dashboard/accounts/:accountId/reports',
            name: 'reports',
            pageBuilder: (context, state) => NoTransitionPage(
              child: ReportsPage(
                accountId: state.pathParameters['accountId']!,
              ),
            ),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Page Not Found')),
      body: Center(
        child: Text(
          '404 — ${state.error?.toString() ?? 'Unknown route'}',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ),
    ),
  );
});

/// Dashboard home content rendered at /dashboard.
class _DashboardHome extends ConsumerWidget {
  const _DashboardHome();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const DashboardHomeContent();
  }
}
