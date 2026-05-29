// Widget tests for DayHeader.
//
// Covers task 7.14:
//   7.14 Renders formatted date "Fri, May 23" for DateTime(2026, 5, 23)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/market/widgets/day_header.dart';

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('DayHeader', () {
    // Task 7.14 — formatted date
    // May 23, 2026 is a Saturday
    testWidgets('renders "Sat, May 23" for DateTime(2026, 5, 23)', (tester) async {
      final date = DateTime(2026, 5, 23);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DayHeader(date: date),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Sat, May 23'), findsOneWidget);
    });

    // Extra — different date formats correctly
    // Jan 5, 2026 is a Monday
    testWidgets('renders "Mon, Jan 5" for DateTime(2026, 1, 5)', (tester) async {
      final date = DateTime(2026, 1, 5);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DayHeader(date: date),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Mon, Jan 5'), findsOneWidget);
    });
  });
}
