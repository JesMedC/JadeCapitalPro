import 'package:flutter/material.dart';

/// Controller for programmatic actions on the TradingView chart widget.
///
/// Used to trigger reload/refresh and URL updates on the native WebView
/// implementation. All callbacks are no-ops on web (fallback).
class TradingViewChartController {
  // Made non-private so platform implementations can wire the callbacks.
  VoidCallback? reloadCallback;

  /// Called by the native widget when [updateUrl] is invoked.
  ///
  /// The native [TradingViewPlatformWidget] wires this up in [initState].
  /// On web the callback is never set, so [updateUrl] is silently a no-op.
  void Function(Uri)? updateUrlCallback;

  /// Reload the chart WebView. No-op on web.
  void reload() => reloadCallback?.call();

  /// Load a new URL in the chart WebView without rebuilding the widget tree.
  ///
  /// Triggers the loading overlay in the native widget. No-op on web.
  void updateUrl(Uri uri) => updateUrlCallback?.call(uri);
}
