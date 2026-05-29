import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/price_alert.dart';
import '../providers/alerts_provider.dart';

/// The list of supported trading instruments.
///
/// Must stay in sync with `SUPPORTED_INSTRUMENTS` in `alerts.constants.ts`.
const List<String> kSupportedInstruments = [
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

/// Bottom-sheet form for creating a new price alert.
///
/// All form state is ephemeral — discarded when the sheet closes.
/// Uses [ConsumerStatefulWidget] so [ref] is available without parameter
/// threading (mirrors [CreateGoalSheet] pattern exactly).
class CreateAlertSheet extends ConsumerStatefulWidget {
  const CreateAlertSheet({super.key});

  @override
  ConsumerState<CreateAlertSheet> createState() => _CreateAlertSheetState();
}

class _CreateAlertSheetState extends ConsumerState<CreateAlertSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _priceCtrl;

  String? _selectedInstrument;
  AlertCondition? _selectedCondition;
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _priceCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  // ── Validation ──

  double? get _parsedPrice =>
      double.tryParse(_priceCtrl.text.trim());

  bool get _canSubmit {
    return _nameCtrl.text.trim().isNotEmpty &&
        _selectedInstrument != null &&
        _selectedCondition != null &&
        _parsedPrice != null &&
        _parsedPrice! > 0 &&
        !_isSubmitting;
  }

  // ── Submit ──

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    final priceRaw = _priceCtrl.text.trim();

    // Sprint 2 lesson: use double.tryParse, never direct cast.
    final targetPrice = double.tryParse(priceRaw);
    if (targetPrice == null || targetPrice <= 0) {
      setState(() => _errorMessage = 'Please enter a valid target price.');
      return;
    }

    if (_selectedInstrument == null || _selectedCondition == null) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final payload = <String, dynamic>{
      'name': name,
      'instrument': _selectedInstrument!,
      'condition': _selectedCondition!.apiValue,
      'targetPrice': targetPrice,
    };

    try {
      await ref.read(alertsProvider.notifier).createAlert(payload);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to create alert. Please try again.';
        _isSubmitting = false;
      });
    }
  }

  // ── Build ──

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // ── Drag handle ──
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // ── Sheet header ──
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(
                  children: [
                    Text(
                      'New Alert',
                      style: GoogleFonts.orbitron(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      color: AppColors.textMuted,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),

              const Divider(height: 1, color: AppColors.divider),

              // ── Scrollable form body ──
              Expanded(
                child: ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  children: [
                    // Instrument dropdown
                    const _SectionLabel(label: 'Instrument *'),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedInstrument,
                      hint: Text(
                        'Select instrument',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                      ),
                      dropdownColor: AppColors.surface,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                      decoration: const InputDecoration(
                        contentPadding: EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                      ),
                      items: kSupportedInstruments
                          .map(
                            (instr) => DropdownMenuItem(
                              value: instr,
                              child: Text(instr),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _selectedInstrument = value),
                    ),
                    const SizedBox(height: 20),

                    // Condition chips
                    const _SectionLabel(label: 'Condition *'),
                    const SizedBox(height: 10),
                    _ConditionChips(
                      selected: _selectedCondition,
                      onChanged: (c) =>
                          setState(() => _selectedCondition = c),
                    ),
                    const SizedBox(height: 20),

                    // Target price
                    TextField(
                      controller: _priceCtrl,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Target Price *',
                        hintText: '0.00000',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 20),

                    // Alert name
                    TextField(
                      controller: _nameCtrl,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Alert Name *',
                        hintText: 'e.g. EUR/USD breakout alert',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                      ),
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 24),

                    // Error banner
                    if (_errorMessage != null) ...[
                      _ErrorBanner(message: _errorMessage!),
                      const SizedBox(height: 16),
                    ],

                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _canSubmit ? _submit : null,
                        child: _isSubmitting
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation(
                                      AppColors.background),
                                ),
                              )
                            : Text(
                                'Create Alert',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
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

// ── Condition chips ──

class _ConditionChips extends StatelessWidget {
  const _ConditionChips({
    required this.selected,
    required this.onChanged,
  });

  final AlertCondition? selected;
  final ValueChanged<AlertCondition?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: AlertCondition.values.map((condition) {
        final isSelected = selected == condition;
        return GestureDetector(
          onTap: () => onChanged(isSelected ? null : condition),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.primary
                  : AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.primary
                    .withValues(alpha: isSelected ? 1.0 : 0.35),
              ),
            ),
            child: Text(
              condition.label,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight:
                    isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected
                    ? AppColors.background
                    : AppColors.primary,
              ),
            ),
          ),
        );
      }).toList(),
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
          const Icon(Icons.error_outline,
              color: AppColors.danger, size: 16),
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
