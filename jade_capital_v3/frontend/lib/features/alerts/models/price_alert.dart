/// Condition enumeration matching backend [AlertCondition] enum.
///
/// Values are lowercase strings as returned by the NestJS API.
enum AlertCondition {
  above,
  below,
  crossesAbove,
  crossesBelow;

  /// Human-readable label for UI display (e.g. "above 1.1500").
  String get label {
    switch (this) {
      case AlertCondition.above:
        return 'Above';
      case AlertCondition.below:
        return 'Below';
      case AlertCondition.crossesAbove:
        return 'Crosses Above';
      case AlertCondition.crossesBelow:
        return 'Crosses Below';
    }
  }

  /// The API value (snake_case, matching the backend enum).
  String get apiValue {
    switch (this) {
      case AlertCondition.above:
        return 'above';
      case AlertCondition.below:
        return 'below';
      case AlertCondition.crossesAbove:
        return 'crosses_above';
      case AlertCondition.crossesBelow:
        return 'crosses_below';
    }
  }

  /// Safe factory: returns null on unknown values.
  static AlertCondition? fromString(String? value) {
    switch (value) {
      case 'above':
        return AlertCondition.above;
      case 'below':
        return AlertCondition.below;
      case 'crosses_above':
        return AlertCondition.crossesAbove;
      case 'crosses_below':
        return AlertCondition.crossesBelow;
      default:
        return null;
    }
  }
}

/// Status enumeration matching backend [AlertStatus] enum.
///
/// Values are lowercase strings as returned by the NestJS API.
enum AlertStatus {
  active,
  triggered,
  disabled;

  /// Safe factory: defaults to [AlertStatus.active] on unknown values.
  static AlertStatus fromString(String? value) {
    switch (value) {
      case 'triggered':
        return AlertStatus.triggered;
      case 'disabled':
        return AlertStatus.disabled;
      default:
        return AlertStatus.active;
    }
  }

  /// The API value (matches backend enum lowercase).
  String get apiValue => name;
}

/// A single price alert with server-managed status fields.
///
/// Numeric fields use [double.tryParse] guards to protect against
/// the API returning numeric strings instead of native doubles —
/// TypeORM returns decimal columns as strings (lesson from Sprint 2).
class PriceAlert {
  const PriceAlert({
    required this.id,
    required this.userId,
    required this.name,
    required this.instrument,
    required this.condition,
    required this.targetPrice,
    required this.status,
    this.triggeredAt,
    required this.createdAt,
  });

  final String id;
  final String userId;
  final String name;
  final String instrument;
  final AlertCondition condition;
  final double targetPrice;
  final AlertStatus status;

  /// Non-null only when [status] == [AlertStatus.triggered].
  final DateTime? triggeredAt;
  final DateTime createdAt;

  /// Deserialise from the NestJS API JSON shape (camelCase).
  ///
  /// `targetPrice` arrives as a string from TypeORM (decimal column) —
  /// [double.tryParse] coercion handles both num and string variants
  /// per the Sprint 2 pattern.
  factory PriceAlert.fromJson(Map<String, dynamic> json) {
    // Sprint 2 pattern: coerce num-or-string → double safely.
    double toDouble(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    return PriceAlert(
      id: json['id'] as String,
      userId: json['userId'] as String,
      name: json['name'] as String? ?? '',
      instrument: json['instrument'] as String,
      condition: AlertCondition.fromString(json['condition'] as String?) ??
          AlertCondition.above,
      targetPrice: toDouble(json['targetPrice']),
      status: AlertStatus.fromString(json['status'] as String?),
      triggeredAt: json['triggeredAt'] != null
          ? DateTime.parse(json['triggeredAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  /// Serialise to a POST /alerts payload — excludes all server-managed fields.
  Map<String, dynamic> toCreateJson() => {
        'name': name,
        'instrument': instrument,
        'condition': condition.apiValue,
        'targetPrice': targetPrice,
      };

  /// Return a copy with updated fields.
  PriceAlert copyWith({
    String? id,
    String? userId,
    String? name,
    String? instrument,
    AlertCondition? condition,
    double? targetPrice,
    AlertStatus? status,
    DateTime? triggeredAt,
    DateTime? createdAt,
  }) =>
      PriceAlert(
        id: id ?? this.id,
        userId: userId ?? this.userId,
        name: name ?? this.name,
        instrument: instrument ?? this.instrument,
        condition: condition ?? this.condition,
        targetPrice: targetPrice ?? this.targetPrice,
        status: status ?? this.status,
        triggeredAt: triggeredAt ?? this.triggeredAt,
        createdAt: createdAt ?? this.createdAt,
      );
}
