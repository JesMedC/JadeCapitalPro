// Phase 9 — Flutter widget test for GoalCard.
//
// Covers (task 9.8):
//   - LinearProgressIndicator fills to ~50% when progressPct=50
//   - "Completed" badge is visible when isCompleted=true
//   - LinearProgressIndicator fills to 100% for drawdown goal at progressPct=100
//   - Icon, title, percentage text, and value label are rendered

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/goals/models/goal.dart';
import 'package:jade_capital_v3/features/goals/widgets/goal_card.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

Goal _makeGoal({
  String id = 'goal-0001',
  String userId = 'user-0001',
  String title = 'Monthly PnL Goal',
  GoalType goalType = GoalType.pnl,
  double targetValue = 500.0,
  double currentValue = 250.0,
  double progressPct = 50.0,
  bool isCompleted = false,
  bool isActive = true,
  GoalPeriod period = GoalPeriod.monthly,
  String? notes,
  String startDate = '2026-01-01',
  String endDate = '2026-12-31',
  DateTime? completedAt,
}) =>
    Goal(
      id: id,
      userId: userId,
      title: title,
      goalType: goalType,
      targetValue: targetValue,
      currentValue: currentValue,
      progressPct: progressPct,
      isCompleted: isCompleted,
      isActive: isActive,
      period: period,
      notes: notes,
      startDate: startDate,
      endDate: endDate,
      completedAt: completedAt,
      createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
      updatedAt: DateTime.parse('2026-01-01T00:00:00Z'),
    );

/// Wrap GoalCard in a minimal Material app for testing.
/// Uses a wide viewport so the card has room to render fully.
Widget _buildCard(Goal goal) {
  return MaterialApp(
    theme: ThemeData.dark(),
    home: Scaffold(
      body: SizedBox(
        width: 400,
        child: GoalCard(goal: goal),
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  group('GoalCard widget (task 9.8)', () {
    // ── Progress bar ──────────────────────────────────────────────────────────

    testWidgets('renders a LinearProgressIndicator', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 50)));
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('progress indicator value is ~0.5 when progressPct=50', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 50)));

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(0.5, 0.001));
    });

    testWidgets('progress indicator value is ~0.0 when progressPct=0', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 0)));

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(0.0, 0.001));
    });

    testWidgets('progress indicator value is 1.0 when progressPct=100', (tester) async {
      await tester.pumpWidget(
        _buildCard(_makeGoal(
          progressPct: 100,
          currentValue: 500,
          isCompleted: true,
        )),
      );

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(1.0, 0.001));
    });

    testWidgets('progress indicator is clamped to 1.0 even if progressPct > 100', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 110)));

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(1.0, 0.001));
    });

    // ── Drawdown goal ─────────────────────────────────────────────────────────

    testWidgets(
        'drawdown goal at progressPct=100 shows full progress bar (safe, no limit hit)',
        (tester) async {
      final drawdownGoal = _makeGoal(
        goalType: GoalType.drawdown,
        targetValue: 100.0,
        currentValue: 0.0, // 0 drawdown used → 100% safe
        progressPct: 100.0,
        title: 'Keep drawdown under \$100',
      );
      await tester.pumpWidget(_buildCard(drawdownGoal));

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(1.0, 0.001));
    });

    testWidgets('drawdown goal at progressPct=50 shows half-full bar', (tester) async {
      final drawdownGoal = _makeGoal(
        goalType: GoalType.drawdown,
        targetValue: 100.0,
        currentValue: 50.0, // half limit used
        progressPct: 50.0,
        title: 'Keep drawdown under \$100',
      );
      await tester.pumpWidget(_buildCard(drawdownGoal));

      final indicator =
          tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(indicator.value, closeTo(0.5, 0.001));
    });

    // ── Completed badge ───────────────────────────────────────────────────────

    testWidgets('"Completed" badge is NOT visible when isCompleted=false', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(isCompleted: false)));
      expect(find.text('Completed'), findsNothing);
    });

    testWidgets('"Completed" badge IS visible when isCompleted=true', (tester) async {
      await tester.pumpWidget(
        _buildCard(_makeGoal(
          isCompleted: true,
          progressPct: 100,
          completedAt: DateTime.parse('2026-05-01T10:00:00Z'),
        )),
      );
      expect(find.text('Completed'), findsOneWidget);
    });

    // ── Title and percentage ──────────────────────────────────────────────────

    testWidgets('renders the goal title', (tester) async {
      await tester.pumpWidget(
          _buildCard(_makeGoal(title: 'Reach 80% win rate this month')));
      expect(find.text('Reach 80% win rate this month'), findsOneWidget);
    });

    testWidgets('renders the percentage text with no decimal (toStringAsFixed(0))', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 50)));
      expect(find.text('50%'), findsOneWidget);
    });

    testWidgets('renders 0% when progressPct=0', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(progressPct: 0)));
      expect(find.text('0%'), findsOneWidget);
    });

    testWidgets('renders 100% when progressPct=100', (tester) async {
      await tester.pumpWidget(
          _buildCard(_makeGoal(progressPct: 100, isCompleted: true)));
      expect(find.text('100%'), findsOneWidget);
    });

    // ── Goal type icons ───────────────────────────────────────────────────────

    testWidgets('renders at least one Icon widget', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal()));
      expect(find.byType(Icon), findsWidgets);
    });

    // ── Value label ───────────────────────────────────────────────────────────

    testWidgets('renders a dollar-sign value label for PnL goals', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(
        goalType: GoalType.pnl,
        currentValue: 250.0,
        targetValue: 500.0,
      )));
      // Value label format: "$250.00 / $500.00"
      expect(find.textContaining('\$250.00'), findsWidgets);
    });

    testWidgets('renders a percentage value label for winrate goals', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(
        goalType: GoalType.winrate,
        currentValue: 60.0,
        targetValue: 80.0,
        progressPct: 75.0,
      )));
      // Value label: "60.0% / 80.0%"
      expect(find.textContaining('60.0%'), findsWidgets);
    });

    testWidgets('renders "used / limit" format for drawdown goals', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(
        goalType: GoalType.drawdown,
        currentValue: 30.0,
        targetValue: 100.0,
        progressPct: 70.0,
        title: 'Protect capital',
      )));
      // Value label: "$30.00 used / $100.00 limit"
      expect(find.textContaining('used'), findsOneWidget);
      expect(find.textContaining('limit'), findsOneWidget);
    });

    // ── Period badge ──────────────────────────────────────────────────────────

    testWidgets('renders the period label badge', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(period: GoalPeriod.weekly)));
      expect(find.text('Weekly'), findsOneWidget);
    });

    // ── Days remaining ────────────────────────────────────────────────────────

    testWidgets('renders "Expired" when endDate is in the past', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(
        endDate: '2020-01-01', // clearly in the past
      )));
      expect(find.text('Expired'), findsOneWidget);
    });

    testWidgets('renders days-left text when endDate is far in the future', (tester) async {
      await tester.pumpWidget(_buildCard(_makeGoal(
        endDate: '2099-12-31',
      )));
      // Should show something like "X days left" — not "Expired"
      expect(find.textContaining('days left'), findsOneWidget);
    });

    // ── Tap callback ──────────────────────────────────────────────────────────

    testWidgets('invokes onTap callback when the card is tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(MaterialApp(
        theme: ThemeData.dark(),
        home: Scaffold(
          body: SizedBox(
            width: 400,
            child: GoalCard(goal: _makeGoal(), onTap: () => tapped = true),
          ),
        ),
      ));

      await tester.tap(find.byType(GoalCard));
      await tester.pump();

      expect(tapped, isTrue);
    });
  });
}
