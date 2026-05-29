import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Represents the user's persisted chart preferences (instrument + timeframe).
class ChartPreferences {
  const ChartPreferences({
    this.instrument = 'EUR/USD',
    this.timeframe = '5m',
  });

  factory ChartPreferences.fromJson(Map<String, dynamic> json) =>
      ChartPreferences(
        instrument: json['instrument'] as String? ?? 'EUR/USD',
        timeframe: json['timeframe'] as String? ?? '5m',
      );

  final String instrument;
  final String timeframe;

  Map<String, dynamic> toJson() => {
        'instrument': instrument,
        'timeframe': timeframe,
      };
}

/// API layer for chart preferences (GET / PUT /api/market-data/preferences).
class ChartApi {
  const ChartApi(this._client);

  final ApiClient _client;

  /// Fetch the authenticated user's chart preferences from the server.
  ///
  /// Returns default values if the server returns an error (silent fallback).
  Future<ChartPreferences> getPreferences() async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/market-data/preferences',
      );
      final data = res.data;
      if (data != null) return ChartPreferences.fromJson(data);
    } catch (e) {
      debugPrint('[ChartApi] getPreferences error: $e');
    }
    return const ChartPreferences();
  }

  /// Persist the authenticated user's chart preferences on the server.
  ///
  /// Fire-and-forget: errors are logged but not propagated.
  Future<void> updatePreferences({
    required String instrument,
    required String timeframe,
  }) async {
    try {
      await _client.put<void>(
        '/market-data/preferences',
        data: {'instrument': instrument, 'timeframe': timeframe},
      );
    } catch (e) {
      debugPrint('[ChartApi] updatePreferences error: $e');
    }
  }
}
