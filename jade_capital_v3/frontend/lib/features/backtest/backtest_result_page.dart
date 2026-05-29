import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/network/providers.dart';
import '../../core/theme/app_theme.dart';
import 'models/backtest_session.dart';
import 'widgets/backtest_progress_bar.dart';
import 'widgets/equity_sparkline.dart';
import 'widgets/metrics_card.dart';
import 'widgets/trades_table.dart';

/// Result page for a single backtest session.
///
/// Accepts a [sessionId] path parameter and fetches the session directly from
/// the API. While the session is `pending` or `running`, the page polls every
/// 2 seconds using a [Timer.periodic] owned by this widget's state — cancelled
/// in [dispose] to avoid memory leaks.
///
/// Polling stops automatically once the session reaches a terminal state
/// (`completed` or `failed`).
///
/// Uses [ConsumerStatefulWidget] to own the polling timer while reading from
/// Riverpod providers.
class BacktestResultPage extends ConsumerStatefulWidget {
  const BacktestResultPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<BacktestResultPage> createState() => _BacktestResultPageState();
}

class _BacktestResultPageState extends ConsumerState<BacktestResultPage> {
  BacktestSession? _session;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  // ── WebSocket progress fields ──
  int _wsPercent = 0;
  String _wsProcessedLabel = '0 / ? candles';
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  static const _pollInterval = Duration(seconds: 2);

  @override
  void initState() {
    super.initState();
    _fetchSession();
    _subscribeProgress();
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  /// Subscribe to the WsClient backtest progress stream.
  ///
  /// Filters events to this session only. Updates [_wsPercent] and
  /// [_wsProcessedLabel] via [setState]. Does NOT cancel [_pollTimer] —
  /// HTTP poll remains the sole source of truth for terminal state.
  void _subscribeProgress() {
    final wsClient = ref.read(wsClientProvider);
    _wsSub = wsClient.backtestProgressStream.listen((data) {
      if (!mounted) return;
      final sessionId = data['sessionId'] as String?;
      if (sessionId != widget.sessionId) return; // ignore events for other sessions
      final pct = (data['percent'] as num?)?.toInt() ?? 0;
      final processed = (data['processed'] as num?)?.toInt() ?? 0;
      final total = (data['total'] as num?)?.toInt() ?? 0;
      setState(() {
        _wsPercent = pct;
        _wsProcessedLabel = '$processed / $total candles';
      });
      // NOTE: do NOT cancel _pollTimer here — HTTP poll is source of truth.
    });
  }

  Future<void> _fetchSession() async {
    try {
      final api = ref.read(backtestApiProvider);
      final session = await api.get(widget.sessionId);
      if (!mounted) return;

      setState(() {
        _session = session;
        _loading = false;
        _error = null;
      });

      if (!session.isTerminal) {
        _startPolling();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_pollInterval, (_) async {
      try {
        final api = ref.read(backtestApiProvider);
        final session = await api.get(widget.sessionId);
        if (!mounted) return;

        setState(() {
          _session = session;
          _error = null;
        });

        if (session.isTerminal) {
          _pollTimer?.cancel();
          _pollTimer = null;
        }
      } catch (_) {
        // Silent — keep polling; if error persists, user can go back
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _session?.name ?? 'Backtest Result',
          style: GoogleFonts.orbitron(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
          overflow: TextOverflow.ellipsis,
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    if (_error != null && _session == null) {
      return _ErrorBody(
        message: _error!,
        onRetry: () {
          setState(() => _loading = true);
          _fetchSession();
        },
      );
    }

    final session = _session!;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Status banner ──
          _StatusBanner(session: session),
          const SizedBox(height: 20),

          if (session.isCompleted) ...[
            _buildMetricsGrid(session),
            const SizedBox(height: 20),

            // ── Equity curve ──
            Text(
              'Equity Curve',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.cardBackground,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: EquitySparkline(points: session.equityCurve),
            ),
            const SizedBox(height: 20),

            // ── Trades table ──
            Text(
              'Trades (${session.totalTrades ?? 0})',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: AppColors.cardBackground,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: TradesTable(trades: session.trades),
              ),
            ),
          ] else if (session.isFailed) ...[
            _ErrorBanner(
              message: session.error ?? 'An unknown error occurred.',
            ),
          ] else ...[
            // pending / running — show WebSocket-driven progress bar
            BacktestProgressBar(
              percent: _wsPercent,
              processedLabel: _wsProcessedLabel,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMetricsGrid(BacktestSession session) {
    final pf = session.profitFactor ?? 0;
    final pfIsInfinity = pf == 9999;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: MetricsCard(
                label: 'Win Rate',
                value: session.winrate ?? 0,
                unit: '%',
                valueColor: _winrateColor(session.winrate ?? 0),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: MetricsCard(
                label: 'Profit Factor',
                value: pfIsInfinity ? 0 : pf,
                isInfinity: pfIsInfinity,
                valueColor: AppColors.accent,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: MetricsCard(
                label: 'Max Drawdown',
                value: session.maxDrawdown ?? 0,
                unit: 'pts',
                valueColor: AppColors.danger,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: MetricsCard(
                label: 'Total Trades',
                value: (session.totalTrades ?? 0).toDouble(),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: MetricsCard(
                label: 'Wins',
                value: (session.wins ?? 0).toDouble(),
                valueColor: AppColors.accent,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: MetricsCard(
                label: 'Losses',
                value: (session.losses ?? 0).toDouble(),
                valueColor: AppColors.danger,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Color _winrateColor(double winrate) {
    if (winrate >= 60) return AppColors.accent;
    if (winrate >= 45) return AppColors.warning;
    return AppColors.danger;
  }
}

// ── Status banner ─────────────────────────────────────────────────────────────

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.session});

  final BacktestSession session;

  @override
  Widget build(BuildContext context) {
    final color = _color(session.status);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(_icon(session.status), color: color, size: 18),
          const SizedBox(width: 10),
          Text(
            _label(session.status),
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          if (!session.isTerminal) ...[
            const SizedBox(width: 10),
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static Color _color(String status) {
    switch (status) {
      case 'completed':
        return AppColors.accent;
      case 'running':
        return AppColors.primary;
      case 'failed':
        return AppColors.danger;
      default:
        return AppColors.warning;
    }
  }

  static IconData _icon(String status) {
    switch (status) {
      case 'completed':
        return Icons.check_circle_outline;
      case 'running':
        return Icons.sync;
      case 'failed':
        return Icons.error_outline;
      default:
        return Icons.hourglass_empty_outlined;
    }
  }

  static String _label(String status) {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'running':
        return 'Running — processing candles...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending — waiting in queue...';
    }
  }
}

// ── Error banner ──────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline,
                  color: AppColors.danger, size: 18),
              const SizedBox(width: 8),
              Text(
                'Backtest Failed',
                style: GoogleFonts.orbitron(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.danger,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Error body (API load failure) ─────────────────────────────────────────────

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

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
            const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
            const SizedBox(height: 16),
            Text(
              'Failed to load backtest',
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
