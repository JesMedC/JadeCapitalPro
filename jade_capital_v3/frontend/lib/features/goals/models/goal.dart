/// Goal type enumeration matching backend `goalType` field.
///
/// [fromString] returns null on unknown values — no throw.
enum GoalType {
  pnl,
  winrate,
  trades,
  streak,
  drawdown;

  /// Human-readable label for display in UI.
  String get label {
    switch (this) {
      case GoalType.pnl:
        return 'P&L';
      case GoalType.winrate:
        return 'Win Rate';
      case GoalType.trades:
        return 'Trades';
      case GoalType.streak:
        return 'Streak';
      case GoalType.drawdown:
        return 'Drawdown';
    }
  }

  /// Unit label for target value fields.
  String get unit {
    switch (this) {
      case GoalType.pnl:
        return '\$';
      case GoalType.winrate:
        return '%';
      case GoalType.trades:
        return 'trades';
      case GoalType.streak:
        return 'wins';
      case GoalType.drawdown:
        return '\$';
    }
  }

  /// Safe factory: returns null instead of throwing on unknown values.
  static GoalType? fromString(String? value) {
    if (value == null) return null;
    try {
      return GoalType.values.firstWhere((e) => e.name == value);
    } catch (_) {
      return null;
    }
  }
}

/// Goal period enumeration matching backend `period` field.
enum GoalPeriod {
  daily,
  weekly,
  monthly,
  custom;

  /// Human-readable label with capitalised first letter.
  String get label => name[0].toUpperCase() + name.substring(1);

  /// Safe factory: defaults to [GoalPeriod.custom] on unknown values.
  static GoalPeriod fromString(String? value) {
    if (value == null) return GoalPeriod.custom;
    try {
      return GoalPeriod.values.firstWhere((e) => e.name == value);
    } catch (_) {
      return GoalPeriod.custom;
    }
  }
}

/// A single trading goal with server-computed progress fields.
///
/// Numeric fields use [double.tryParse] guards to protect against
/// the API returning numeric strings instead of native doubles
/// (lesson from Sprint 2).
class Goal {
  const Goal({
    required this.id,
    required this.userId,
    this.accountId,
    required this.title,
    required this.goalType,
    required this.targetValue,
    required this.currentValue,
    required this.progressPct,
    required this.isCompleted,
    required this.isActive,
    required this.period,
    this.notes,
    required this.startDate,
    required this.endDate,
    this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Deserialise from the backend API JSON shape.
  ///
  /// `currentValue` and `progressPct` are server-computed — always present
  /// in API responses but excluded from [toCreateJson].
  factory Goal.fromJson(Map<String, dynamic> json) {
    // Helper: coerce num-or-string to double safely (Sprint 2 lesson).
    double toDouble(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    return Goal(
      id: json['id'] as String,
      userId: json['userId'] as String,
      accountId: json['accountId'] as String?,
      title: json['title'] as String,
      goalType:
          GoalType.fromString(json['goalType'] as String?) ?? GoalType.pnl,
      targetValue: toDouble(json['targetValue']),
      currentValue: toDouble(json['currentValue']),
      progressPct: toDouble(json['progressPct']),
      isCompleted: json['isCompleted'] as bool? ?? false,
      isActive: json['isActive'] as bool? ?? true,
      period: GoalPeriod.fromString(json['period'] as String?),
      notes: json['notes'] as String?,
      startDate: json['startDate'] as String,
      endDate: json['endDate'] as String,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  /// Serialise to a POST /goals payload — excludes all server-managed fields.
  Map<String, dynamic> toCreateJson() => {
        'title': title,
        'goalType': goalType.name,
        'targetValue': targetValue,
        'startDate': startDate,
        'endDate': endDate,
        'period': period.name,
        if (notes != null) 'notes': notes,
        if (accountId != null) 'accountId': accountId,
        'isActive': isActive,
      };

  /// Return a copy with updated fields.
  Goal copyWith({
    String? id,
    String? userId,
    String? accountId,
    String? title,
    GoalType? goalType,
    double? targetValue,
    double? currentValue,
    double? progressPct,
    bool? isCompleted,
    bool? isActive,
    GoalPeriod? period,
    String? notes,
    String? startDate,
    String? endDate,
    DateTime? completedAt,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) =>
      Goal(
        id: id ?? this.id,
        userId: userId ?? this.userId,
        accountId: accountId ?? this.accountId,
        title: title ?? this.title,
        goalType: goalType ?? this.goalType,
        targetValue: targetValue ?? this.targetValue,
        currentValue: currentValue ?? this.currentValue,
        progressPct: progressPct ?? this.progressPct,
        isCompleted: isCompleted ?? this.isCompleted,
        isActive: isActive ?? this.isActive,
        period: period ?? this.period,
        notes: notes ?? this.notes,
        startDate: startDate ?? this.startDate,
        endDate: endDate ?? this.endDate,
        completedAt: completedAt ?? this.completedAt,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  /// Days until the goal's end date (negative = past, 0 = today).
  ///
  /// Clamped to [-999, 9999] to prevent overflow in UI display.
  int get daysRemaining {
    final end = DateTime.parse(endDate);
    final today = DateTime.now();
    final diff = DateTime(end.year, end.month, end.day)
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
    return diff.clamp(-999, 9999);
  }

  // ── Fields ──

  final String id;
  final String userId;
  final String? accountId;
  final String title;
  final GoalType goalType;
  final double targetValue;

  /// Server-computed: current progress value in the goal's unit.
  final double currentValue;

  /// Server-computed: progress percentage [0–100].
  final double progressPct;

  final bool isCompleted;
  final bool isActive;
  final GoalPeriod period;
  final String? notes;
  final String startDate; // 'YYYY-MM-DD'
  final String endDate; // 'YYYY-MM-DD'
  final DateTime? completedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
}
