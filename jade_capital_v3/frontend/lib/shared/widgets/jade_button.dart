import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Primary action button styled with the jade brand color.
///
/// Supports loading state (spinner), disabled look, and full-width mode.
class JadeButton extends StatelessWidget {
  const JadeButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.isFullWidth = true,
    this.variant = _Variant.primary,
    this.height = 50,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final _Variant variant;
  final double height;

  static const primary = _Variant.primary;
  static const outline = _Variant.outline;
  static const danger = _Variant.danger;

  @override
  Widget build(BuildContext context) {
    final isDisabled = onPressed == null || isLoading;

    return SizedBox(
      width: isFullWidth ? double.infinity : null,
      height: height,
      child: ElevatedButton(
        onPressed: isDisabled ? null : onPressed,
        style: _resolveStyle(context, isDisabled),
        child: _buildChild(context),
      ),
    );
  }

  ButtonStyle _resolveStyle(BuildContext context, bool isDisabled) {
    switch (variant) {
      case _Variant.primary:
        return ElevatedButton.styleFrom(
          backgroundColor: isDisabled
              ? AppColors.primary.withValues(alpha: 0.3)
              : AppColors.primary,
          foregroundColor: AppColors.background,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        );
      case _Variant.outline:
        return ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          foregroundColor: AppColors.primary,
          side: BorderSide(
            color: isDisabled
                ? AppColors.primary.withValues(alpha: 0.3)
                : AppColors.primary,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        );
      case _Variant.danger:
        return ElevatedButton.styleFrom(
          backgroundColor: isDisabled
              ? AppColors.danger.withValues(alpha: 0.3)
              : AppColors.danger,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        );
    }
  }

  Widget _buildChild(BuildContext context) {
    if (isLoading) {
      return const SizedBox(
        height: 22,
        width: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: AppColors.background,
        ),
      );
    }

    return Text(
      label,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: variant == _Variant.outline
                ? AppColors.primary
                : AppColors.background,
          ),
    );
  }
}

enum _Variant { primary, outline, danger }
