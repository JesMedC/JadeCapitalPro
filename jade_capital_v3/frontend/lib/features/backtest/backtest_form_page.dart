import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'providers/backtest_provider.dart';

/// Valid instruments — must stay in sync with `VALID_INSTRUMENTS` in the backend DTO.
const List<String> _kInstruments = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'EUR/JPY',
  'GBP/JPY',
  'NZD/USD',
  'USD/CHF',
  'BTC/USD',
];

/// Valid timeframes — must stay in sync with `VALID_TIMEFRAMES` in the backend DTO.
const List<String> _kTimeframes = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
];

/// Valid strategies — must stay in sync with `VALID_STRATEGIES` in the backend DTO.
const List<String> _kStrategies = ['candle-direction'];

/// Form page for submitting a new backtest run.
///
/// Displayed as a **modal full-screen route** (pushed via `context.push`)
/// rather than a bottom sheet, as specified in the design.
///
/// On successful submission, navigates to the result page at
/// `/dashboard/backtest/:id` so the user can track the processing status.
class BacktestFormPage extends ConsumerStatefulWidget {
  const BacktestFormPage({super.key});

  @override
  ConsumerState<BacktestFormPage> createState() => _BacktestFormPageState();
}

class _BacktestFormPageState extends ConsumerState<BacktestFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();

  String? _instrument = _kInstruments.first;
  String? _timeframe = _kTimeframes[2]; // default: 15m
  String? _strategy = _kStrategies.first;
  double _lastNCandles = 100;

  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  bool get _canSubmit {
    return _nameCtrl.text.trim().isNotEmpty &&
        _instrument != null &&
        _timeframe != null &&
        _strategy != null &&
        !_isSubmitting;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_canSubmit) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final session = await ref.read(backtestProvider.notifier).create(
        _nameCtrl.text.trim(),
        {
          'instrument': _instrument!,
          'timeframe': _timeframe!,
          'strategy': _strategy!,
          'lastNCandles': _lastNCandles.round(),
        },
      );

      if (mounted) {
        // Pop the form modal and push the result page
        context.pop();
        unawaited(context.push('/dashboard/backtest/${session.id}'));
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to submit backtest. Please try again.';
        _isSubmitting = false;
      });
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'New Backtest',
          style: GoogleFonts.orbitron(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
          children: [
            // ── Name ──
            _SectionLabel(label: 'Name *'),
            const SizedBox(height: 10),
            TextFormField(
              controller: _nameCtrl,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                hintText: 'e.g. EUR/USD 15m momentum test',
              ),
              textCapitalization: TextCapitalization.sentences,
              maxLength: 100,
              onChanged: (_) => setState(() {}),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // ── Instrument ──
            _SectionLabel(label: 'Instrument *'),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _instrument,
              dropdownColor: AppColors.surface,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              items: _kInstruments
                  .map(
                    (instr) => DropdownMenuItem(
                      value: instr,
                      child: Text(instr),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _instrument = v),
            ),
            const SizedBox(height: 20),

            // ── Timeframe ──
            _SectionLabel(label: 'Timeframe *'),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _timeframe,
              dropdownColor: AppColors.surface,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              items: _kTimeframes
                  .map(
                    (tf) => DropdownMenuItem(
                      value: tf,
                      child: Text(tf),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _timeframe = v),
            ),
            const SizedBox(height: 20),

            // ── Strategy ──
            _SectionLabel(label: 'Strategy *'),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _strategy,
              dropdownColor: AppColors.surface,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              items: _kStrategies
                  .map(
                    (s) => DropdownMenuItem(
                      value: s,
                      child: Text(s),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _strategy = v),
            ),
            const SizedBox(height: 24),

            // ── Last N candles ──
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _SectionLabel(label: 'Candles to Analyse'),
                Text(
                  '${_lastNCandles.round()}',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
            Slider(
              value: _lastNCandles,
              min: 10,
              max: 250,
              divisions: 48, // steps of ~5
              activeColor: AppColors.primary,
              inactiveColor: AppColors.border,
              onChanged: (v) => setState(() => _lastNCandles = v),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '10',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
                Text(
                  '250',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // ── Error banner ──
            if (_errorMessage != null) ...[
              _ErrorBanner(message: _errorMessage!),
              const SizedBox(height: 16),
            ],

            // ── Submit ──
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _canSubmit ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation(AppColors.background),
                        ),
                      )
                    : Text(
                        'Run Backtest',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.background,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Section label ──

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textSecondary,
      ),
    );
  }
}

// ── Error banner ──

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
