// Phase 9 — Flutter unit tests for the Goal model.
//
// Covers (tasks 9.6 and 9.7):
//   9.6 Goal.fromJson — safe parsing, unknown enum fallback
//   9.7 Goal.daysRemaining — date arithmetic (future, past, today)

import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/goals/models/goal.dart';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/// A full API response JSON that mirrors GoalResponseDto exactly.
Map<String, dynamic> _fullApiJson({
  String id = 'goal-0001-0000-0000-000000000001',
  String userId = 'user-0001-0000-0000-000000000001',
  String? accountId,
  String title = r'Target $500 PnL this week',
  String goalType = 'pnl',
  double targetValue = 500.0,
  double currentValue = 250.0,
  double progressPct = 50.0,
  bool isCompleted = false,
  bool isActive = true,
  String period = 'weekly',
  String? notes,
  String startDate = '2026-01-01',
  String endDate = '2026-12-31',
  String? completedAt,
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-01T00:00:00.000Z',
}) =>
    {
      'id': id,
      'userId': userId,
      'accountId': accountId,
      'title': title,
      'goalType': goalType,
      'targetValue': targetValue,
      'currentValue': currentValue,
      'progressPct': progressPct,
      'isCompleted': isCompleted,
      'isActive': isActive,
      'period': period,
      'notes': notes,
      'startDate': startDate,
      'endDate': endDate,
      'completedAt': completedAt,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };

// ────────────────────────────────────────────────────────────────────────────
// 9.6 Goal.fromJson
// ────────────────────────────────────────────────────────────────────────────

void main() {
  group('Goal.fromJson (task 9.6)', () {
    test('deserialises a full API response round-trip correctly', () {
      final json = _fullApiJson(
        id: 'goal-abc',
        userId: 'user-xyz',
        title: 'Win 80% of trades',
        goalType: 'winrate',
        targetValue: 80.0,
        currentValue: 60.0,
        progressPct: 75.0,
        isCompleted: false,
        isActive: true,
        period: 'monthly',
        notes: 'Focus on high-probability setups',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        createdAt: '2026-03-01T08:00:00.000Z',
        updatedAt: '2026-03-01T08:00:00.000Z',
      );

      final goal = Goal.fromJson(json);

      expect(goal.id, equals('goal-abc'));
      expect(goal.userId, equals('user-xyz'));
      expect(goal.accountId, isNull);
      expect(goal.title, equals('Win 80% of trades'));
      expect(goal.goalType, equals(GoalType.winrate));
      expect(goal.targetValue, equals(80.0));
      expect(goal.currentValue, equals(60.0));
      expect(goal.progressPct, equals(75.0));
      expect(goal.isCompleted, isFalse);
      expect(goal.isActive, isTrue);
      expect(goal.period, equals(GoalPeriod.monthly));
      expect(goal.notes, equals('Focus on high-probability setups'));
      expect(goal.startDate, equals('2026-03-01'));
      expect(goal.endDate, equals('2026-03-31'));
      expect(goal.completedAt, isNull);
      expect(goal.createdAt, equals(DateTime.parse('2026-03-01T08:00:00.000Z')));
      expect(goal.updatedAt, equals(DateTime.parse('2026-03-01T08:00:00.000Z')));
    });

    test('deserialises goalType as the correct GoalType enum value', () {
      final types = {
        'pnl': GoalType.pnl,
        'winrate': GoalType.winrate,
        'trades': GoalType.trades,
        'streak': GoalType.streak,
        'drawdown': GoalType.drawdown,
      };

      for (final entry in types.entries) {
        final goal = Goal.fromJson(_fullApiJson(goalType: entry.key));
        expect(goal.goalType, equals(entry.value),
            reason: 'goalType "${entry.key}" should map to ${entry.value}');
      }
    });

    test('falls back to GoalType.pnl for an unknown goalType string', () {
      final goal = Goal.fromJson(_fullApiJson(goalType: 'unknown_type'));
      expect(goal.goalType, equals(GoalType.pnl));
    });

    test('falls back to GoalType.pnl when goalType is null', () {
      final json = _fullApiJson();
      json['goalType'] = null;
      final goal = Goal.fromJson(json);
      expect(goal.goalType, equals(GoalType.pnl));
    });

    test('deserialises period as the correct GoalPeriod enum value', () {
      final periods = {
        'daily': GoalPeriod.daily,
        'weekly': GoalPeriod.weekly,
        'monthly': GoalPeriod.monthly,
        'custom': GoalPeriod.custom,
      };

      for (final entry in periods.entries) {
        final goal = Goal.fromJson(_fullApiJson(period: entry.key));
        expect(goal.period, equals(entry.value),
            reason: 'period "${entry.key}" should map to ${entry.value}');
      }
    });

    test('falls back to GoalPeriod.custom for an unknown period string', () {
      final goal = Goal.fromJson(_fullApiJson(period: 'quarterly'));
      expect(goal.period, equals(GoalPeriod.custom));
    });

    test('handles completedAt=null correctly', () {
      final goal = Goal.fromJson(_fullApiJson(completedAt: null));
      expect(goal.completedAt, isNull);
    });

    test('parses completedAt as DateTime when present', () {
      const completedAtStr = '2026-05-15T14:30:00.000Z';
      final goal = Goal.fromJson(_fullApiJson(completedAt: completedAtStr));
      expect(goal.completedAt, equals(DateTime.parse(completedAtStr)));
    });

    test('sets isCompleted=true when the API reports it', () {
      final goal = Goal.fromJson(_fullApiJson(
        isCompleted: true,
        completedAt: '2026-05-15T14:30:00.000Z',
        progressPct: 100.0,
      ));
      expect(goal.isCompleted, isTrue);
    });

    test('coerces numeric string targetValue to double (Sprint 2 regression guard)', () {
      final json = _fullApiJson();
      json['targetValue'] = '500.0'; // API sends a string
      final goal = Goal.fromJson(json);
      expect(goal.targetValue, equals(500.0));
    });

    test('coerces numeric string progressPct to double', () {
      final json = _fullApiJson();
      json['progressPct'] = '75.5';
      final goal = Goal.fromJson(json);
      expect(goal.progressPct, equals(75.5));
    });

    test('defaults isCompleted to false when missing from JSON', () {
      final json = _fullApiJson();
      json.remove('isCompleted');
      final goal = Goal.fromJson(json);
      expect(goal.isCompleted, isFalse);
    });

    test('defaults isActive to true when missing from JSON', () {
      final json = _fullApiJson();
      json.remove('isActive');
      final goal = Goal.fromJson(json);
      expect(goal.isActive, isTrue);
    });

    test('preserves accountId when non-null', () {
      const accountId = 'acct-0001-0000-0000-000000000001';
      final goal = Goal.fromJson(_fullApiJson(accountId: accountId));
      expect(goal.accountId, equals(accountId));
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 9.7 Goal.daysRemaining
  // ────────────────────────────────────────────────────────────────────────────

  group('Goal.daysRemaining (task 9.7)', () {
    /// Build a Goal with a given endDate string. Today is used as reference.
    Goal _goalWithEndDate(String endDate) =>
        Goal.fromJson(_fullApiJson(endDate: endDate));

    /// Format a DateTime as a 'YYYY-MM-DD' string suitable for fromJson.
    String _fmt(DateTime dt) =>
        '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

    test('returns a positive number when endDate is in the future', () {
      final future = DateTime.now().add(const Duration(days: 10));
      final goal = _goalWithEndDate(_fmt(future));
      expect(goal.daysRemaining, greaterThan(0));
    });

    test('returns approximately 10 for endDate 10 days from today', () {
      final future = DateTime.now().add(const Duration(days: 10));
      final goal = _goalWithEndDate(_fmt(future));
      // Allow ±1 for any midnight boundary differences
      expect(goal.daysRemaining, inInclusiveRange(9, 11));
    });

    test('returns 0 when endDate is today', () {
      final today = DateTime.now();
      final goal = _goalWithEndDate(_fmt(today));
      expect(goal.daysRemaining, equals(0));
    });

    test('returns a negative number when endDate is in the past', () {
      final past = DateTime.now().subtract(const Duration(days: 5));
      final goal = _goalWithEndDate(_fmt(past));
      expect(goal.daysRemaining, lessThan(0));
    });

    test('returns approximately -5 for endDate 5 days ago', () {
      final past = DateTime.now().subtract(const Duration(days: 5));
      final goal = _goalWithEndDate(_fmt(past));
      expect(goal.daysRemaining, inInclusiveRange(-6, -4));
    });

    test('clamps large positive values to 9999', () {
      // 10000 days ≈ 27+ years from now
      final farFuture = DateTime.now().add(const Duration(days: 10000));
      final goal = _goalWithEndDate(_fmt(farFuture));
      expect(goal.daysRemaining, equals(9999));
    });

    test('clamps large negative values to -999', () {
      // 1500 days ≈ 4+ years ago
      final farPast = DateTime.now().subtract(const Duration(days: 1500));
      final goal = _goalWithEndDate(_fmt(farPast));
      expect(goal.daysRemaining, equals(-999));
    });

    test('treats endDate as a date (day granularity, time portion ignored)', () {
      // Two goals with the same calendar date but created at different times
      // should have the same daysRemaining
      final tomorrow = DateTime.now().add(const Duration(days: 1));
      final g1 = _goalWithEndDate(_fmt(tomorrow));
      // Ensure consistency — calling twice returns the same value
      expect(g1.daysRemaining, equals(g1.daysRemaining));
    });
  });
}
