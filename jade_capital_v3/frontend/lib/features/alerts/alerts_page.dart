import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/providers.dart';
import '../../core/theme/app_theme.dart';
import 'models/price_alert.dart';
import 'providers/alerts_provider.dart';
import 'widgets/alert_card.dart';
import 'widgets/create_alert_sheet.dart';

/// Price alerts page — full CRUD UI with live WebSocket trigger notifications.
///
/// Converted from [StatelessWidget] placeholder to [ConsumerStatefulWidget].
/// [alertsProvider] auto-initialises when this page is first visited.
/// [_AlertTriggeredListener] is embedded in the widget tree and handles
/// real-time `alert:triggered` events from the NestJS WebSocket server.
class AlertsPage extends ConsumerStatefulWidget {
  const AlertsPage({super.key});

  @override
  ConsumerState<AlertsPage> createState() => _AlertsPageState();
}

class _AlertsPageState extends ConsumerState<AlertsPage> {
  void _openCreateSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => const CreateAlertSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncAlerts = ref.watch(alertsProvider);

    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(
            title: const Text('Alerts'),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh_outlined, size: 20),
                tooltip: 'Refresh',
                onPressed: () =>
                    ref.read(alertsProvider.notifier).loadAlerts(),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: _openCreateSheet,
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.background,
            tooltip: 'New alert',
            child: const Icon(Icons.add),
          ),
          body: asyncAlerts.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            ),
            error: (error, _) => _ErrorState(
              message: error.toString(),
              onRetry: () =>
                  ref.read(alertsProvider.notifier).loadAlerts(),
            ),
            data: (alerts) => alerts.isEmpty
                ? const _EmptyAlertsState()
                : _AlertsList(alerts: alerts),
          ),
        ),
        // Embedded WS listener — must be in the tree so it has [BuildContext]
        // for [ScaffoldMessenger].
        const _AlertTriggeredListener(),
      ],
    );
  }
}

// ── Alerts list view ──

class _AlertsList extends StatelessWidget {
  const _AlertsList({required this.alerts});

  final List<PriceAlert> alerts;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 80),
      itemCount: alerts.length,
      itemBuilder: (_, i) => AlertCard(alert: alerts[i]),
    );
  }
}

// ── Empty state ──

class _EmptyAlertsState extends StatelessWidget {
  const _EmptyAlertsState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.notifications_active_outlined,
              size: 64, color: AppColors.textMuted),
          const SizedBox(height: 16),
          Text(
            'No Alerts Yet',
            style: GoogleFonts.orbitron(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to configure your first price alert.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Error state ──

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: AppColors.danger),
            const SizedBox(height: 16),
            Text(
              'Failed to load alerts',
              style: GoogleFonts.orbitron(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Alert triggered listener ──

/// Private [ConsumerStatefulWidget] that:
/// 1. Subscribes to [WsClient.alertStream] on init.
/// 2. On each `alert:triggered` event:
///    - Calls [AlertsNotifier.markTriggered] for an optimistic UI update.
///    - Shows a [SnackBar] banner with instrument + condition info.
///    - Plays `assets/sounds/alert.mp3` via [AudioPlayer] (silent fail).
/// 3. Cancels the stream subscription on dispose.
///
/// Placed inside [AlertsPage.build] tree so it is alive exactly when the
/// page is visible and shares the same [ScaffoldMessenger] context.
class _AlertTriggeredListener extends ConsumerStatefulWidget {
  const _AlertTriggeredListener();

  @override
  ConsumerState<_AlertTriggeredListener> createState() =>
      _AlertTriggeredListenerState();
}

class _AlertTriggeredListenerState
    extends ConsumerState<_AlertTriggeredListener> {
  StreamSubscription<Map<String, dynamic>>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Pure side-effect widget — renders nothing.
    return const SizedBox.shrink();
  }

  void _subscribe() {
    final wsClient = ref.read(wsClientProvider);
    _subscription = wsClient.alertStream.listen(_onAlertTriggered);
  }

  Future<void> _onAlertTriggered(Map<String, dynamic> event) async {
    // Validate event type before processing.
    if (event['type'] != 'alert:triggered') return;

    final alertId = event['alertId']?.toString();
    final instrument = event['instrument'] as String? ?? '';
    final condition = event['condition'] as String? ?? '';

    // 1. Optimistic state update — no reload needed.
    if (alertId != null) {
      ref.read(alertsProvider.notifier).markTriggered(alertId);
    }

    // 2. Show SnackBar banner.
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.warning,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          duration: const Duration(seconds: 5),
          content: Row(
            children: [
              const Icon(Icons.notifications_active,
                  color: Colors.black87, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Alert Triggered!',
                      style: GoogleFonts.orbitron(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      '$instrument — ${_humanCondition(condition)}',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: Colors.black87,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    // 3. Play audio (silent fail — handles web no-user-gesture restriction).
    try {
      await AudioPlayer().play(AssetSource('sounds/alert.mp3'));
    } catch (_) {
      // Silent fail: audio permission denied, file missing, or web restriction.
    }
  }

  /// Convert backend snake_case condition string to a human-readable label.
  static String _humanCondition(String condition) {
    switch (condition) {
      case 'above':
        return 'Price above target';
      case 'below':
        return 'Price below target';
      case 'crosses_above':
        return 'Price crossed above target';
      case 'crosses_below':
        return 'Price crossed below target';
      default:
        return 'Target reached';
    }
  }
}
