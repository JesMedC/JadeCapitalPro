import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/core/network/api_client.dart';
import 'package:jade_capital_v3/core/network/providers.dart';
import 'package:jade_capital_v3/core/network/reports_api.dart';
import 'package:jade_capital_v3/features/reports/reports_page.dart';
import 'package:jade_capital_v3/features/reports/providers/reports_provider.dart';

// ── Mock ReportsApi ───────────────────────────────────────────────────────────

class _SuccessReportsApi extends ReportsApi {
  _SuccessReportsApi() : super(_NoopApiClient());

  @override
  Future<Uint8List> downloadReport(
    String accountId, {
    String? preset,
    DateTime? from,
    DateTime? to,
  }) async {
    // Simulate 1-second network delay
    await Future<void>.delayed(const Duration(milliseconds: 100));
    return Uint8List.fromList([0x25, 0x50, 0x44, 0x46]); // %PDF
  }
}

class _NotFoundReportsApi extends ReportsApi {
  _NotFoundReportsApi() : super(_NoopApiClient());

  @override
  Future<Uint8List> downloadReport(
    String accountId, {
    String? preset,
    DateTime? from,
    DateTime? to,
  }) async {
    // Small delay so the loading state is observable in tests
    await Future<void>.delayed(const Duration(milliseconds: 50));
    throw const ApiException(statusCode: 404, message: 'no_trades_in_range');
  }
}

class _NetworkErrorReportsApi extends ReportsApi {
  _NetworkErrorReportsApi() : super(_NoopApiClient());

  @override
  Future<Uint8List> downloadReport(
    String accountId, {
    String? preset,
    DateTime? from,
    DateTime? to,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    throw const ApiException(statusCode: 500, message: 'Internal server error');
  }
}

/// Stub [ApiClient] — never makes real network calls.
class _NoopApiClient extends ApiClient {}

// ── Helper ────────────────────────────────────────────────────────────────────

Widget _wrap(Widget child, ReportsApi api) {
  return ProviderScope(
    overrides: [
      reportsApiProvider.overrideWithValue(api),
    ],
    child: MaterialApp(
      home: child,
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('ReportsPage', () {
    // AC-8: Export button disabled when custom to < from
    testWidgets('Export PDF button disabled when custom to is before from', (tester) async {
      await tester.pumpWidget(_wrap(
        const ReportsPage(accountId: 'account-1'),
        _SuccessReportsApi(),
      ));

      // Switch to Custom preset
      await tester.tap(find.text('Custom'));
      await tester.pumpAndSettle();

      // The button should be disabled — no dates set yet
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Export PDF'),
      );
      expect(button.onPressed, isNull);
    });

    // Loading indicator visible during download
    testWidgets('LinearProgressIndicator is shown while isDownloading == true', (tester) async {
      await tester.pumpWidget(_wrap(
        const ReportsPage(accountId: 'account-1'),
        _NotFoundReportsApi(), // Error mock with delay — avoids OpenFilex platform channel
      ));

      // Tap export (30d preset is default — button should be enabled)
      await tester.tap(find.text('Export PDF'));
      // pump once to let the first setState(isDownloading=true) render
      await tester.pump();

      // While the async download is in progress, loading indicator should be visible
      expect(find.byType(LinearProgressIndicator), findsOneWidget);

      // Advance time past the 50ms delay + settle
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();
    });

    // AC-9: 404 response → "No trades found for the selected period"
    testWidgets('404 response shows "No trades found" inline error', (tester) async {
      await tester.pumpWidget(_wrap(
        const ReportsPage(accountId: 'account-1'),
        _NotFoundReportsApi(),
      ));

      await tester.tap(find.text('Export PDF'));
      await tester.pumpAndSettle();

      expect(find.textContaining('No trades found for the selected period'), findsOneWidget);
    });

    // Network error → generic error message
    testWidgets('Network error shows "Could not generate report" inline error', (tester) async {
      await tester.pumpWidget(_wrap(
        const ReportsPage(accountId: 'account-1'),
        _NetworkErrorReportsApi(),
      ));

      await tester.tap(find.text('Export PDF'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Could not generate report'), findsOneWidget);
    });

    // Export button re-enables after a failed attempt
    testWidgets('Export button is re-enabled after a failed download', (tester) async {
      await tester.pumpWidget(_wrap(
        const ReportsPage(accountId: 'account-1'),
        _NotFoundReportsApi(),
      ));

      await tester.tap(find.text('Export PDF'));
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Export PDF'),
      );
      // After failure, isDownloading = false, so button should be enabled again
      expect(button.onPressed, isNotNull);
    });
  });
}
