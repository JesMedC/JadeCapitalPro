/// Immutable filter state for the scanner page.
///
/// All string fields default to null — a null value means "no filter applied"
/// for that dimension. [savedOnly] defaults to false.
///
/// Client-side filtering is performed by [ScannerNotifier] (for pattern /
/// instrument / timeframe) and by [ScannerPage] (for [savedOnly], which
/// requires the bookmarked key set). [ScannerNotifier] does NOT import
/// [BookmarksNotifier] — the key set is injected by [ScannerPage].
class ScannerFilterState {
  const ScannerFilterState({
    this.patternType,
    this.instrument,
    this.timeframe,
    this.savedOnly = false,
  });

  /// Selected pattern type (e.g. 'Gartley', 'Bat'). Null = all patterns.
  final String? patternType;

  /// Selected instrument (e.g. 'EUR/USD'). Null = all instruments.
  final String? instrument;

  /// Selected timeframe (e.g. '1h'). Null = all timeframes.
  final String? timeframe;

  /// When true, only signals bookmarked by the current user are shown.
  ///
  /// The actual bookmark key set is NOT stored here — it is injected by
  /// [ScannerPage] at render time. This field records user intent only.
  final bool savedOnly;

  // ── Sentinel ──────────────────────────────────────────────────────────────

  /// No-filter sentinel — all dimensions cleared, savedOnly false.
  static const empty = ScannerFilterState();

  // ── Convenience ──────────────────────────────────────────────────────────

  /// True when no filter dimension is active (including [savedOnly]).
  bool get isEmpty =>
      patternType == null &&
      instrument == null &&
      timeframe == null &&
      !savedOnly;

  // ── Immutable update ──────────────────────────────────────────────────────

  /// Return a copy with selectively overridden fields.
  ///
  /// Pass `null` explicitly to a named string parameter to clear it.
  /// Omit a parameter to preserve the current value.
  ScannerFilterState copyWith({
    Object? patternType = _sentinel,
    Object? instrument = _sentinel,
    Object? timeframe = _sentinel,
    bool? savedOnly,
  }) =>
      ScannerFilterState(
        patternType: patternType == _sentinel
            ? this.patternType
            : patternType as String?,
        instrument: instrument == _sentinel
            ? this.instrument
            : instrument as String?,
        timeframe: timeframe == _sentinel
            ? this.timeframe
            : timeframe as String?,
        savedOnly: savedOnly ?? this.savedOnly,
      );
}

// Private sentinel so `copyWith(patternType: null)` clears the field
// while `copyWith()` preserves it.
const _sentinel = Object();
