import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/price_alerts_api.dart';
import '../../../core/network/providers.dart';
import '../models/price_alert.dart';

/// Manages the alerts list as an [AsyncValue<List<PriceAlert>>].
///
/// Follows the [GoalsNotifier] pattern (StateNotifier + AsyncValue) for
/// consistency across the codebase. NOT the Riverpod 2.x [AsyncNotifier]
/// pattern — consistency with the established pattern is intentional.
///
/// Multi-user isolation is enforced at the network layer: the JWT in
/// [ApiClient] constrains every request to the authenticated user's data.
class AlertsNotifier extends StateNotifier<AsyncValue<List<PriceAlert>>> {
  AlertsNotifier(this._api) : super(const AsyncValue.loading()) {
    loadAlerts();
  }

  final PriceAlertsApi _api;

  /// Reload alerts from the server.
  Future<void> loadAlerts() async {
    state = const AsyncValue.loading();
    try {
      final alerts = await _api.getAlerts();
      state = AsyncValue.data(alerts);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// Create a new alert and refresh the list.
  Future<void> createAlert(Map<String, dynamic> dto) async {
    await _api.createAlert(dto);
    await loadAlerts();
  }

  /// Update an existing alert [id] with [dto] and refresh the list.
  Future<void> updateAlert(String id, Map<String, dynamic> dto) async {
    await _api.updateAlert(id, dto);
    await loadAlerts();
  }

  /// Delete alert [id] and refresh the list.
  Future<void> deleteAlert(String id) async {
    await _api.deleteAlert(id);
    await loadAlerts();
  }

  /// Optimistically update a specific alert's status to [AlertStatus.triggered]
  /// in-memory when a `alert:triggered` WebSocket event arrives.
  ///
  /// This avoids a full reload round-trip while keeping the UI responsive.
  /// A subsequent [loadAlerts] call can be triggered if a full sync is needed.
  void markTriggered(String alertId) {
    state.whenData((alerts) {
      state = AsyncValue.data(
        alerts.map((a) {
          if (a.id == alertId) {
            return a.copyWith(
              status: AlertStatus.triggered,
              triggeredAt: DateTime.now(),
            );
          }
          return a;
        }).toList(),
      );
    });
  }
}

/// Global alerts provider.
///
/// Reads [priceAlertsApiProvider] (shared JWT-aware singleton) and initialises
/// [PriceAlertsApi] + [AlertsNotifier]. Auto-initialises when first watched
/// from [AlertsPage].
final alertsProvider =
    StateNotifierProvider<AlertsNotifier, AsyncValue<List<PriceAlert>>>((ref) {
  final api = ref.watch(priceAlertsApiProvider);
  return AlertsNotifier(api);
});
