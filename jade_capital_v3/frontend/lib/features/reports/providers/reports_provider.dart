import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';
import 'package:intl/intl.dart';

import '../../../core/network/providers.dart';
import '../../../core/network/reports_api.dart';
import '../../../core/network/api_client.dart';

// ── State ─────────────────────────────────────────────────────────────────────

/// The active report preset selection.
enum ReportPreset { d7, d30, d90, custom }

extension ReportPresetApi on ReportPreset {
  /// Returns the query-param value expected by the API, or null for custom.
  String? get apiValue {
    switch (this) {
      case ReportPreset.d7:
        return '7d';
      case ReportPreset.d30:
        return '30d';
      case ReportPreset.d90:
        return '90d';
      case ReportPreset.custom:
        return null;
    }
  }

  /// Human-readable label shown in the preset selector.
  String get label {
    switch (this) {
      case ReportPreset.d7:
        return '7d';
      case ReportPreset.d30:
        return '30d';
      case ReportPreset.d90:
        return '90d';
      case ReportPreset.custom:
        return 'Custom';
    }
  }
}

class ReportsState {
  const ReportsState({
    this.preset = ReportPreset.d30,
    this.customFrom,
    this.customTo,
    this.isDownloading = false,
    this.errorMessage,
    this.downloadSuccess = false,
  });

  final ReportPreset preset;
  final DateTime? customFrom;
  final DateTime? customTo;
  final bool isDownloading;
  final String? errorMessage;
  final bool downloadSuccess;

  /// Returns true when the Download button should be disabled.
  bool get isDownloadDisabled {
    if (isDownloading) return true;
    if (preset == ReportPreset.custom) {
      if (customFrom == null || customTo == null) return true;
      if (customTo!.isBefore(customFrom!)) return true;
    }
    return false;
  }

  ReportsState copyWith({
    ReportPreset? preset,
    DateTime? customFrom,
    DateTime? customTo,
    bool clearCustomFrom = false,
    bool clearCustomTo = false,
    bool? isDownloading,
    String? errorMessage,
    bool clearError = false,
    bool? downloadSuccess,
  }) {
    return ReportsState(
      preset: preset ?? this.preset,
      customFrom: clearCustomFrom ? null : (customFrom ?? this.customFrom),
      customTo: clearCustomTo ? null : (customTo ?? this.customTo),
      isDownloading: isDownloading ?? this.isDownloading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      downloadSuccess: downloadSuccess ?? this.downloadSuccess,
    );
  }
}

// ── Notifier ──────────────────────────────────────────────────────────────────

/// Manages PDF report download state.
///
/// Follows the [AlertsNotifier] / [GoalsNotifier] StateNotifier pattern for
/// consistency with the rest of the codebase.
class ReportsNotifier extends StateNotifier<ReportsState> {
  ReportsNotifier(this._api) : super(const ReportsState());

  final ReportsApi _api;

  /// Update the selected preset. Clears custom dates if switching away from custom.
  void setPreset(ReportPreset preset) {
    if (preset != ReportPreset.custom) {
      state = state.copyWith(
        preset: preset,
        clearCustomFrom: true,
        clearCustomTo: true,
        clearError: true,
        downloadSuccess: false,
      );
    } else {
      state = state.copyWith(
        preset: preset,
        clearError: true,
        downloadSuccess: false,
      );
    }
  }

  /// Set the custom start date.
  void setCustomFrom(DateTime from) {
    state = state.copyWith(customFrom: from, clearError: true, downloadSuccess: false);
  }

  /// Set the custom end date.
  void setCustomTo(DateTime to) {
    state = state.copyWith(customTo: to, clearError: true, downloadSuccess: false);
  }

  /// Download the report for [accountId].
  ///
  /// Handles success (saves to disk + opens file) and error states per design:
  /// - `404` → "No trades found for the selected period"
  /// - Other errors → "Could not generate report. Please try again."
  Future<void> download(String accountId) async {
    if (state.isDownloadDisabled) return;

    state = state.copyWith(isDownloading: true, clearError: true, downloadSuccess: false);

    try {
      final bytes = await _api.downloadReport(
        accountId,
        preset: state.preset.apiValue,
        from: state.preset == ReportPreset.custom ? state.customFrom : null,
        to: state.preset == ReportPreset.custom ? state.customTo : null,
      );

      // Save to the app documents directory
      final dir = Platform.isAndroid
          ? await getExternalStorageDirectory() ?? await getApplicationDocumentsDirectory()
          : await getApplicationDocumentsDirectory();

      final fmt = DateFormat('yyyy-MM-dd');
      final now = DateTime.now();
      final suffix = state.preset == ReportPreset.custom
          ? '${fmt.format(state.customFrom!)}_${fmt.format(state.customTo!)}'
          : '${state.preset.apiValue}_${fmt.format(now)}';

      final file = File('${dir.path}/report_$suffix.pdf');
      await file.writeAsBytes(bytes);
      await OpenFilex.open(file.path);

      state = state.copyWith(isDownloading: false, downloadSuccess: true);
    } on ApiException catch (e) {
      final message = e.statusCode == 404
          ? 'No trades found for the selected period.'
          : 'Could not generate report. Please try again.';
      state = state.copyWith(isDownloading: false, errorMessage: message);
    } catch (_) {
      state = state.copyWith(
        isDownloading: false,
        errorMessage: 'Could not generate report. Please try again.',
      );
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

/// Global reports provider.
///
/// Reads [reportsApiProvider] (shared JWT-aware singleton) and initialises
/// [ReportsApi] + [ReportsNotifier]. Auto-initialises when first watched
/// from [ReportsPage].
final reportsProvider =
    StateNotifierProvider<ReportsNotifier, ReportsState>((ref) {
  final api = ref.watch(reportsApiProvider);
  return ReportsNotifier(api);
});
