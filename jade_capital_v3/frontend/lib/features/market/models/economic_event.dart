/// Impact level for an economic calendar event.
enum ImpactLevel { high, medium, low }

/// Represents a single economic calendar event returned by the backend.
///
/// All fields are immutable. The [fromJson] factory parses the backend JSON
/// shape: `{ timestamp, currency, event, impact, detail }`.
class EconomicEvent {
  const EconomicEvent({
    required this.timestamp,
    required this.currency,
    required this.event,
    required this.impact,
    required this.detail,
  });

  /// Parse an [EconomicEvent] from a backend JSON map.
  ///
  /// - `timestamp` must be an ISO-8601 string parseable by [DateTime.parse].
  /// - Unrecognized `impact` strings default to [ImpactLevel.low] (no throw).
  /// - Missing `detail` field defaults to `''`.
  factory EconomicEvent.fromJson(Map<String, dynamic> json) {
    ImpactLevel parseImpact(String? raw) {
      switch (raw) {
        case 'high':
          return ImpactLevel.high;
        case 'medium':
          return ImpactLevel.medium;
        default:
          return ImpactLevel.low;
      }
    }

    return EconomicEvent(
      timestamp: DateTime.parse(json['timestamp'] as String),
      currency: json['currency'] as String,
      event: json['event'] as String,
      impact: parseImpact(json['impact'] as String?),
      detail: (json['detail'] as String?) ?? '',
    );
  }

  /// UTC timestamp of the economic release.
  final DateTime timestamp;

  /// Currency pair affected, e.g. "USD", "EUR".
  final String currency;

  /// Human-readable event name, e.g. "Non-Farm Payrolls".
  final String event;

  /// Impact level: high, medium, or low.
  final ImpactLevel impact;

  /// Verbatim detail string from the backend, e.g. "Actual: 178K vs Forecast: 200K".
  /// Defaults to empty string when the backend omits this field.
  final String detail;
}
