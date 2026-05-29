import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/price_tick.dart';

/// Card displaying live bid/ask/spread for a single instrument.
///
/// Plays a [ColorTween] flash animation (400 ms) on each new tick:
///   - bid increased  → green flash + upward arrow
///   - bid decreased  → red flash + downward arrow
///   - first tick     → no flash, downward arrow as neutral default
///
/// Uses [SingleTickerProviderStateMixin] for a single [AnimationController].
class InstrumentCard extends StatefulWidget {
  const InstrumentCard({
    super.key,
    required this.symbol,
    this.tick,
  });

  /// Instrument symbol, e.g. 'EUR/USD'.
  final String symbol;

  /// Latest price tick — null until the first tick arrives.
  final PriceTick? tick;

  @override
  State<InstrumentCard> createState() => _InstrumentCardState();
}

class _InstrumentCardState extends State<InstrumentCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late Animation<Color?> _colorAnimation;

  PriceTick? _previousTick;
  bool _isUp = false;
  Color _flashColor = Colors.transparent;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _resetColorAnimation();
  }

  void _resetColorAnimation() {
    _colorAnimation = ColorTween(
      begin: _flashColor,
      end: Colors.transparent,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
  }

  @override
  void didUpdateWidget(InstrumentCard oldWidget) {
    super.didUpdateWidget(oldWidget);

    final newTick = widget.tick;
    final oldTick = _previousTick;

    if (newTick == null) return;
    if (oldTick == null) {
      // First tick — record it but don't flash.
      _previousTick = newTick;
      return;
    }

    if (newTick.timestamp == oldTick.timestamp) return;

    // Determine direction and flash colour.
    if (newTick.bid > oldTick.bid) {
      _isUp = true;
      _flashColor = AppColors.accent.withValues(alpha: 0.30); // green
    } else if (newTick.bid < oldTick.bid) {
      _isUp = false;
      _flashColor = AppColors.danger.withValues(alpha: 0.30); // red
    }
    // bid unchanged → no new flash, keep current arrow direction

    _previousTick = newTick;

    // Restart the flash animation.
    _resetColorAnimation();
    _controller
      ..reset()
      ..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tick = widget.tick;

    return AnimatedBuilder(
      animation: _colorAnimation,
      builder: (context, child) {
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: _colorAnimation.value ?? AppColors.cardBackground,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: child,
        );
      },
      child: Row(
        children: [
          // Symbol
          Expanded(
            flex: 3,
            child: Text(
              widget.symbol,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ),

          // Bid / Ask / Spread
          Expanded(
            flex: 5,
            child: tick == null
                ? Text(
                    '—',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textMuted,
                    ),
                    textAlign: TextAlign.center,
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _PriceColumn(label: 'Bid', value: tick.bid),
                      _PriceColumn(label: 'Ask', value: tick.ask),
                      _PriceColumn(
                        label: 'Spread',
                        value: tick.spread,
                        color: AppColors.textMuted,
                      ),
                    ],
                  ),
          ),

          // Directional arrow
          SizedBox(
            width: 28,
            child: Icon(
              _isUp ? Icons.arrow_upward : Icons.arrow_downward,
              size: 18,
              color: tick == null
                  ? AppColors.textMuted
                  : (_isUp ? AppColors.accent : AppColors.danger),
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceColumn extends StatelessWidget {
  const _PriceColumn({
    required this.label,
    required this.value,
    this.color,
  });

  final String label;
  final double value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 10,
            color: AppColors.textMuted,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value.toStringAsFixed(5),
          style: GoogleFonts.jetBrainsMono(
            fontSize: 12,
            color: color ?? AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
