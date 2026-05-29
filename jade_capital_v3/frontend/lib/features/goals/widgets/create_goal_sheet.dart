import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../models/goal.dart';
import '../providers/goals_provider.dart';

/// Bottom-sheet form for creating a new trading goal.
///
/// All form state is ephemeral — discarded when the sheet closes.
/// Uses [ConsumerStatefulWidget] so [ref] is available without parameter
/// threading (mirrors [JournalEntryForm] pattern).
class CreateGoalSheet extends ConsumerStatefulWidget {
  const CreateGoalSheet({super.key});

  @override
  ConsumerState<CreateGoalSheet> createState() => _CreateGoalSheetState();
}

class _CreateGoalSheetState extends ConsumerState<CreateGoalSheet> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _targetCtrl;
  late final TextEditingController _notesCtrl;

  GoalType? _selectedType;
  GoalPeriod _selectedPeriod = GoalPeriod.custom;
  DateTime? _startDate;
  DateTime? _endDate;
  String? _accountId; // null = All Accounts
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController();
    _targetCtrl = TextEditingController();
    _notesCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _targetCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  // ── Validation ──

  bool get _isEndAfterStart {
    if (_startDate == null || _endDate == null) return true;
    return _endDate!.isAfter(_startDate!);
  }

  bool get _canSubmit {
    return _titleCtrl.text.trim().isNotEmpty &&
        _targetCtrl.text.trim().isNotEmpty &&
        _selectedType != null &&
        _startDate != null &&
        _endDate != null &&
        _isEndAfterStart &&
        !_isSubmitting;
  }

  // ── Date pickers ──

  Future<void> _pickStartDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: _datePickerTheme,
    );
    if (picked != null) {
      setState(() {
        _startDate = picked;
        // If end date is now before start date, clear it.
        if (_endDate != null && !_endDate!.isAfter(picked)) {
          _endDate = null;
        }
      });
    }
  }

  Future<void> _pickEndDate() async {
    final firstAllowedEnd =
        _startDate != null ? _startDate!.add(const Duration(days: 1)) : DateTime.now();

    final picked = await showDatePicker(
      context: context,
      initialDate: _endDate ?? firstAllowedEnd,
      firstDate: firstAllowedEnd,
      lastDate: DateTime(2030),
      builder: _datePickerTheme,
    );
    if (picked != null) setState(() => _endDate = picked);
  }

  // ── Submit ──

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    final targetRaw = _targetCtrl.text.trim();

    // Sprint 2 lesson: use double.tryParse, never direct cast.
    final targetValue = double.tryParse(targetRaw);
    if (targetValue == null || targetValue <= 0) {
      setState(() => _errorMessage = 'Please enter a valid target value.');
      return;
    }

    if (_selectedType == null ||
        _startDate == null ||
        _endDate == null ||
        !_isEndAfterStart) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final dateFormat = DateFormat('yyyy-MM-dd');
    final payload = <String, dynamic>{
      'title': title,
      'goalType': _selectedType!.name,
      'targetValue': targetValue,
      'startDate': dateFormat.format(_startDate!),
      'endDate': dateFormat.format(_endDate!),
      'period': _selectedPeriod.name,
      'isActive': true,
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
      if (_accountId != null) 'accountId': _accountId,
    };

    try {
      await ref.read(goalsProvider.notifier).createGoal(payload);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to create goal. Please try again.';
        _isSubmitting = false;
      });
    }
  }

  // ── Build ──

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
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
                      'New Goal',
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
                    // Title
                    TextField(
                      controller: _titleCtrl,
                      style: GoogleFonts.inter(
                          fontSize: 14, color: AppColors.textPrimary),
                      decoration: InputDecoration(
                        labelText: 'Title *',
                        hintText: 'e.g. Hit \$500 profit this week',
                        hintStyle: GoogleFonts.inter(
                            fontSize: 13, color: AppColors.textMuted),
                      ),
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 20),

                    // Goal type picker
                    const _SectionLabel(label: 'Goal Type *'),
                    const SizedBox(height: 10),
                    _GoalTypeChips(
                      selected: _selectedType,
                      onChanged: (type) =>
                          setState(() => _selectedType = type),
                    ),
                    const SizedBox(height: 20),

                    // Target value
                    TextField(
                      controller: _targetCtrl,
                      style: GoogleFonts.inter(
                          fontSize: 14, color: AppColors.textPrimary),
                      decoration: InputDecoration(
                        labelText: _targetLabel,
                        hintText: '0.00',
                        hintStyle: GoogleFonts.inter(
                            fontSize: 13, color: AppColors.textMuted),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 20),

                    // Period picker
                    const _SectionLabel(label: 'Period'),
                    const SizedBox(height: 10),
                    _PeriodChips(
                      selected: _selectedPeriod,
                      onChanged: (p) => setState(() => _selectedPeriod = p),
                    ),
                    const SizedBox(height: 20),

                    // Date range
                    const _SectionLabel(label: 'Date Range *'),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _DatePickerButton(
                            label: 'Start',
                            date: _startDate,
                            onTap: _pickStartDate,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _DatePickerButton(
                            label: 'End',
                            date: _endDate,
                            onTap: _pickEndDate,
                            hasError: !_isEndAfterStart,
                          ),
                        ),
                      ],
                    ),
                    if (!_isEndAfterStart) ...[
                      const SizedBox(height: 6),
                      Text(
                        'End date must be after start date.',
                        style: GoogleFonts.inter(
                            fontSize: 11, color: AppColors.danger),
                      ),
                    ],
                    const SizedBox(height: 20),

                    // Notes
                    TextField(
                      controller: _notesCtrl,
                      style: GoogleFonts.inter(
                          fontSize: 14, color: AppColors.textPrimary),
                      decoration: InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Optional — describe your strategy...',
                        hintStyle: GoogleFonts.inter(
                            fontSize: 13, color: AppColors.textMuted),
                        alignLabelWithHint: true,
                      ),
                      maxLines: null,
                      minLines: 3,
                      textCapitalization: TextCapitalization.sentences,
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
                                'Create Goal',
                                style: GoogleFonts.inter(
                                    fontWeight: FontWeight.w600),
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

  /// Label for the target value field — changes based on selected goal type.
  String get _targetLabel {
    if (_selectedType == null) return 'Target Value *';
    switch (_selectedType!) {
      case GoalType.pnl:
        return 'Target P&L (\$) *';
      case GoalType.winrate:
        return 'Target Win Rate (%) *';
      case GoalType.trades:
        return 'Target Trade Count *';
      case GoalType.streak:
        return 'Target Winning Streak *';
      case GoalType.drawdown:
        return 'Max Drawdown Limit (\$) *';
    }
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

// ── Goal type chips ──

class _GoalTypeChips extends StatelessWidget {
  const _GoalTypeChips({
    required this.selected,
    required this.onChanged,
  });

  final GoalType? selected;
  final ValueChanged<GoalType?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: GoalType.values.map((type) {
        final isSelected = selected == type;
        return GestureDetector(
          onTap: () => onChanged(isSelected ? null : type),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
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
              type.label,
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

// ── Period chips ──

class _PeriodChips extends StatelessWidget {
  const _PeriodChips({
    required this.selected,
    required this.onChanged,
  });

  final GoalPeriod selected;
  final ValueChanged<GoalPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: GoalPeriod.values.map((period) {
        final isSelected = selected == period;
        return GestureDetector(
          onTap: () => onChanged(period),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.surfaceLight
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isSelected ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Text(
              period.label,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight:
                    isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected
                    ? AppColors.primary
                    : AppColors.textSecondary,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Date picker button ──

class _DatePickerButton extends StatelessWidget {
  const _DatePickerButton({
    required this.label,
    required this.date,
    required this.onTap,
    this.hasError = false,
  });

  final String label;
  final DateTime? date;
  final VoidCallback onTap;
  final bool hasError;

  @override
  Widget build(BuildContext context) {
    final dateStr = date != null
        ? DateFormat('MMM dd, yyyy').format(date!)
        : 'Select date';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.inputBackground,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: hasError
                ? AppColors.danger
                : date != null
                    ? AppColors.inputFocusBorder.withValues(alpha: 0.6)
                    : AppColors.inputBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Text(
                    dateStr,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      color: date != null
                          ? AppColors.textPrimary
                          : AppColors.textMuted,
                    ),
                  ),
                ),
                const Icon(
                  Icons.calendar_today_outlined,
                  size: 14,
                  color: AppColors.textMuted,
                ),
              ],
            ),
          ],
        ),
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
      padding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                  fontSize: 12, color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Date picker theme overlay ──

Widget _datePickerTheme(BuildContext context, Widget? child) {
  return Theme(
    data: Theme.of(context).copyWith(
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        onPrimary: AppColors.background,
        surface: AppColors.surface,
        onSurface: AppColors.textPrimary,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
    ),
    child: child!,
  );
}
