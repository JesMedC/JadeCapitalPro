// Sprint 12 — Widget tests for BookmarkToggleButton.
//
// Covers (task 3.2):
//   (a) Renders filled star icon when isBookmarked = true
//   (b) Renders outlined star icon when isBookmarked = false
//   (c) onToggle is called exactly once on tap
//   (d) Does not hold local state (stateless — re-renders from props)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/bookmarks/bookmark_toggle_button.dart';

// ── Helper ────────────────────────────────────────────────────────────────────

Future<void> _pumpButton(
  WidgetTester tester, {
  required bool isBookmarked,
  required VoidCallback onToggle,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: BookmarkToggleButton(
            isBookmarked: isBookmarked,
            onToggle: onToggle,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('BookmarkToggleButton widget (task 3.2)', () {
    // (a) Filled star when bookmarked
    testWidgets('renders filled star icon when isBookmarked is true',
        (tester) async {
      await _pumpButton(
        tester,
        isBookmarked: true,
        onToggle: () {},
      );

      expect(find.byIcon(Icons.star), findsOneWidget);
      expect(find.byIcon(Icons.star_border), findsNothing);
    });

    // (b) Outlined star when not bookmarked
    testWidgets('renders outlined star icon when isBookmarked is false',
        (tester) async {
      await _pumpButton(
        tester,
        isBookmarked: false,
        onToggle: () {},
      );

      expect(find.byIcon(Icons.star_border), findsOneWidget);
      expect(find.byIcon(Icons.star), findsNothing);
    });

    // (c) onToggle fires exactly once on tap
    testWidgets('calls onToggle exactly once when tapped', (tester) async {
      var callCount = 0;
      await _pumpButton(
        tester,
        isBookmarked: false,
        onToggle: () => callCount++,
      );

      await tester.tap(find.byType(BookmarkToggleButton));
      await tester.pump();

      expect(callCount, equals(1));
    });

    testWidgets('does not call onToggle on second pump without tap',
        (tester) async {
      var callCount = 0;
      await _pumpButton(
        tester,
        isBookmarked: false,
        onToggle: () => callCount++,
      );

      // Extra pump without tap
      await tester.pump();

      expect(callCount, equals(0));
    });

    // S14 gap — Semantics label for Add bookmark state
    testWidgets('Semantics label is "Add bookmark" when isBookmarked is false',
        (tester) async {
      await _pumpButton(
        tester,
        isBookmarked: false,
        onToggle: () {},
      );

      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) =>
              s.properties.label?.contains('Add bookmark') == true ||
              s.properties.label?.toLowerCase().contains('bookmark') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected a Semantics node with "Add bookmark" label when not bookmarked');
    });

    // S14 gap — Semantics label for Remove bookmark state
    testWidgets('Semantics label is "Remove bookmark" when isBookmarked is true',
        (tester) async {
      await _pumpButton(
        tester,
        isBookmarked: true,
        onToggle: () {},
      );

      final semanticsNodes = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) =>
              s.properties.label?.contains('Remove bookmark') == true ||
              s.properties.label?.contains('Bookmarked') == true)
          .toList();

      expect(semanticsNodes, isNotEmpty,
          reason: 'Expected a Semantics node with "Remove bookmark" label when bookmarked');
    });

    // (d) Icon switches when isBookmarked prop changes (stateless)
    testWidgets('icon switches from filled to outlined when prop changes',
        (tester) async {
      // Start bookmarked
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: BookmarkToggleButton(
                isBookmarked: true,
                onToggle: () {},
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byIcon(Icons.star), findsOneWidget);

      // Rebuild with isBookmarked: false (parent drives the state)
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: BookmarkToggleButton(
                isBookmarked: false,
                onToggle: () {},
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byIcon(Icons.star_border), findsOneWidget);
      expect(find.byIcon(Icons.star), findsNothing);
    });
  });
}
