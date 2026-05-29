import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import '../scanner/models/scanner_result.dart';
import 'chart_provider.dart';
import 'tradingview_chart.dart';
import 'tradingview_chart_controller.dart';
import 'tradingview_chart_native.dart' show toTVSymbol, toTVInterval;
import 'widgets/instrument_selector.dart';
import 'widgets/timeframe_selector.dart';
import 'widgets/xabcd_overlay_panel.dart';

// ── Constants ─────────────────────────────────────────────────────────────────

/// Height of the XABCD overlay panel when visible (companion info panel).
const double _kPanelHeight = 200.0;

// ── ChartPage ─────────────────────────────────────────────────────────────────

/// Full-screen TradingView chart page.
///
/// Renders a WebView on mobile/desktop; shows a fallback message on web.
/// Preferences (instrument + timeframe) are loaded from the server on init
/// and persisted back whenever the user changes them.
///
/// When [initialOverlay] is provided (navigated from scanner via GoRouter
/// `extra`), the page activates the XABCD companion panel and navigates the
/// TradingView embed to the overlay's instrument + timeframe.
class ChartPage extends ConsumerStatefulWidget {
  const ChartPage({super.key, this.symbol, this.initialOverlay});

  /// Optional initial instrument override (e.g. when navigating from another
  /// page). If null, the server-persisted preference is used instead.
  final String? symbol;

  /// Optional scanner result to display as an overlay panel.
  ///
  /// Set by GoRouter when navigating from [ScannerPage] via
  /// `context.go('/dashboard/chart', extra: result)`.
  final ScannerResult? initialOverlay;

  @override
  ConsumerState<ChartPage> createState() => _ChartPageState();
}

class _ChartPageState extends ConsumerState<ChartPage> {
  final _chartController = TradingViewChartController();

  /// Cached notifier reference — set inside addPostFrameCallback with a
  /// mounted guard. Used in dispose() to avoid calling ref.read() after
  /// provider disposal (Riverpod 2.x asserts in debug mode if ref is accessed
  /// after the widget is unmounted).
  ChartPreferencesNotifier? _prefsNotifier;

  @override
  void initState() {
    super.initState();
    // Kick off the server fetch after the first frame so the provider
    // is already mounted before we mutate it.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await ref.read(chartPreferencesProvider.notifier).loadFromServer();

      // Cache the notifier reference for safe use in dispose().
      if (!mounted) return;
      _prefsNotifier = ref.read(chartPreferencesProvider.notifier);

      // If a scanner result was passed via GoRouter extra, activate the overlay
      // and navigate the TradingView embed to the correct instrument + timeframe.
      final overlay = widget.initialOverlay;
      if (overlay != null && mounted) {
        _prefsNotifier!.setOverlay(overlay);
        _chartController.updateUrl(
          _buildUri(
            ChartPreferencesState(
              instrument: overlay.instrument,
              timeframe: overlay.timeframe,
            ),
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    // Clear the overlay when the page is removed from the widget tree so
    // returning to the chart page does not show stale overlay data
    // (satisfies SC-XOP-06c: back navigation clears overlay).
    // Uses cached notifier — safe to call after widget unmounts.
    _prefsNotifier?.clearOverlay();
    super.dispose();
  }

  /// Build the TradingView embed URI for the current state.
  Uri _buildUri(ChartPreferencesState state) {
    return Uri.parse(
      'https://s.tradingview.com/widgetembed/?'
      'symbol=${Uri.encodeComponent(toTVSymbol(state.instrument))}'
      '&interval=${Uri.encodeComponent(toTVInterval(state.timeframe))}'
      '&theme=dark'
      '&style=1'
      '&hide_top_toolbar=false'
      '&hide_side_toolbar=false'
      '&studies=[]'
      '&locale=en',
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chartPreferencesProvider);
    final notifier = ref.read(chartPreferencesProvider.notifier);

    // When preferences change after the initial load, push the new URL to the
    // WebView controller imperatively (avoids full widget rebuild / flash).
    ref.listen<ChartPreferencesState>(
      chartPreferencesProvider,
      (previous, next) {
        if (previous != null &&
            !next.isLoading &&
            (previous.instrument != next.instrument ||
                previous.timeframe != next.timeframe)) {
          _chartController.updateUrl(_buildUri(next));
        }
      },
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(
          state.instrument,
          style: GoogleFonts.orbitron(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          // ── Overlay toggle (only when an overlay is active) ──────────────
          if (state.activeOverlay != null)
            Semantics(
              label: state.showOverlay ? 'Hide pattern panel' : 'Show pattern panel',
              child: IconButton(
                icon: Icon(
                  state.showOverlay
                      ? Icons.keyboard_arrow_down
                      : Icons.keyboard_arrow_up,
                  color: AppColors.textSecondary,
                ),
                onPressed: notifier.toggleOverlay,
              ),
            ),
          // ── Refresh button ───────────────────────────────────────────────
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            onPressed: _chartController.reload,
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Instrument selector ──────────────────────────────────────────
          Container(
            color: AppColors.surface,
            child: InstrumentSelectorWidget(
              activeInstrument: state.instrument,
              onInstrumentSelected: notifier.setInstrument,
            ),
          ),

          // ── Timeframe selector ───────────────────────────────────────────
          Container(
            color: AppColors.surface,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                TimeframeSelectorWidget(
                  activeTimeframe: state.timeframe,
                  onTimeframeSelected: notifier.setTimeframe,
                ),
              ],
            ),
          ),

          const Divider(height: 1, color: AppColors.border),

          // ── Chart area ───────────────────────────────────────────────────
          Expanded(
            child: state.isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  )
                : TradingViewChart(
                    symbol: state.instrument,
                    interval: state.timeframe,
                    controller: _chartController,
                  ),
          ),

          // ── XABCD overlay panel (companion info panel below the chart) ───
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            height: (state.activeOverlay != null && state.showOverlay)
                ? _kPanelHeight
                : 0.0,
            child: state.activeOverlay != null
                ? SingleChildScrollView(
                    child: XabcdOverlayPanel(overlay: state.activeOverlay!),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}
