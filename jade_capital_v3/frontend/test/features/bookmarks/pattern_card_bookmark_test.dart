// Sprint 12 — PatternCard bookmark integration tests.
//
// Covers (task 3.3):
//   (a) PatternCard renders BookmarkToggleButton when onToggleBookmark is provided
//   (b) PatternCard renders filled star when isBookmarked = true
//   (c) PatternCard renders outlined star when isBookmarked = false
//   (d) BookmarkToggleButton absent when onToggleBookmark is null (default)
//   (e) Tapping star calls onToggleBookmark (not onTap)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/bookmarks/bookmark_toggle_button.dart';
import 'package:jade_capital_v3/features/scanner/models/scanner_result.dart';
import 'package:jade_capital_v3/features/scanner/widgets/pattern_card.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

ScannerResult _makeResult() => ScannerResult(
      id: 'scan-0001',
      instrument: 'EUR/USD',
      timeframe: '1h',
      pattern: 'Gartley',
      direction: 'CALL',
      entryPrice: 1.08765,
      confidence: 87.0,
      createdAt: DateTime.parse('2026-05-24T10:00:00Z'),
    );

// ── Helper ────────────────────────────────────────────────────────────────────

Future<void> _pumpCard(
  WidgetTester tester, {
  bool? isBookmarked,
  VoidCallback? onToggleBookmark,
  VoidCallback? onTap,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          child: PatternCard(
            result: _makeResult(),
            onTap: onTap ?? () {},
            isBookmarked: isBookmarked ?? false,
            onToggleBookmark: onToggleBookmark,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('PatternCard bookmark integration (task 3.3)', () {
    // (a) BookmarkToggleButton present when onToggleBookmark provided
    testWidgets('renders BookmarkToggleButton when onToggleBookmark provided',
        (tester) async {
      await _pumpCard(tester, onToggleBookmark: () {});
      expect(find.byType(BookmarkToggleButton), findsOneWidget);
    });

    // (b) Filled star when bookmarked
    testWidgets('shows filled star icon when isBookmarked is true',
        (tester) async {
      await _pumpCard(
        tester,
        isBookmarked: true,
        onToggleBookmark: () {},
      );
      expect(find.byIcon(Icons.star), findsOneWidget);
    });

    // (c) Outlined star when not bookmarked
    testWidgets('shows outlined star icon when isBookmarked is false',
        (tester) async {
      await _pumpCard(
        tester,
        isBookmarked: false,
        onToggleBookmark: () {},
      );
      expect(find.byIcon(Icons.star_border), findsOneWidget);
    });

    // (d) No BookmarkToggleButton when onToggleBookmark is null
    testWidgets('no BookmarkToggleButton when onToggleBookmark is null',
        (tester) async {
      await _pumpCard(tester, onToggleBookmark: null);
      expect(find.byType(BookmarkToggleButton), findsNothing);
    });

    // (e) Tapping star triggers onToggleBookmark, not onTap
    testWidgets(
        'tapping star calls onToggleBookmark and not onTap', (tester) async {
      var tapCount = 0;
      var toggleCount = 0;

      await _pumpCard(
        tester,
        onTap: () => tapCount++,
        onToggleBookmark: () => toggleCount++,
        isBookmarked: false,
      );

      await tester.tap(find.byType(BookmarkToggleButton));
      await tester.pump();

      expect(toggleCount, equals(1));
      // Card tap count should be 0 — the star tap must NOT bubble to onTap
      // (GestureDetector wraps the star, so it absorbs the event)
      expect(tapCount, equals(0));
    });
  });
}
