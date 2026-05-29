import 'package:flutter/material.dart';

/// Stateless ★ / ☆ toggle button for bookmarking a pattern signal.
///
/// Renders a filled star (★) when [isBookmarked] is true and an outlined
/// star (☆) when false. Tapping calls [onToggle].
///
/// This widget has NO store coupling — it accepts [isBookmarked] and
/// [onToggle] as props so it remains testable in isolation without a
/// [ProviderScope]. The caller ([PatternCard] → [ScannerPage]) is
/// responsible for reading the provider state and wiring the toggle.
///
/// Visual spec:
///   - Filled star:   [Icons.star]         colour #FFB347 (warm amber/gold)
///   - Outlined star: [Icons.star_border]  colour AppColors.textMuted
///   - Size: 20 sp to fit inside the card header row
class BookmarkToggleButton extends StatelessWidget {
  const BookmarkToggleButton({
    super.key,
    required this.isBookmarked,
    required this.onToggle,
  });

  /// Whether the associated signal is currently bookmarked by the user.
  final bool isBookmarked;

  /// Called when the user taps the button. Caller is responsible for
  /// dispatching [BookmarksNotifier.toggle].
  final VoidCallback onToggle;

  // Bookmark star colour (warm amber/gold — distinct from green accent / red danger)
  static const Color _starColor = Color(0xFFFFB347);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: isBookmarked ? 'Remove bookmark' : 'Add bookmark',
      button: true,
      child: GestureDetector(
        onTap: onToggle,
        behavior: HitTestBehavior.opaque,
        child: Padding(
          // Larger hit area than the icon itself for comfortable tap
          padding: const EdgeInsets.all(4),
          child: Icon(
            isBookmarked ? Icons.star : Icons.star_border,
            size: 20,
            color: isBookmarked ? _starColor : const Color(0xFF64748B),
          ),
        ),
      ),
    );
  }
}
