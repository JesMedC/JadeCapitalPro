import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/network/dashboard_api.dart';
import '../../../core/network/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/jade_button.dart';
import '../providers/dashboard_provider.dart';

// ── Trade mode enum ──

enum _TradeMode { binary, forex }

// ─────────────────────────────────────────────────────────────────────────────
// NewTradeWidget — modal bottom sheet for opening a new trade
// ─────────────────────────────────────────────────────────────────────────────

/// Bottom sheet widget for opening a new binary or forex trade.
///
/// Config is loaded on widget init from GET /api/accounts/config via
/// [DashboardApi.getAccountConfig]. Form submission delegates to
/// [DashboardNotifier.openTrade].
///
/// Usage:
/// ```dart
/// showModalBottomSheet(
///   context: context,
///   isScrollControlled: true,
///   backgroundColor: Colors.transparent,
///   builder: (_) => const NewTradeWidget(),
/// );
/// ```
class NewTradeWidget extends ConsumerStatefulWidget {
  const NewTradeWidget({super.key});

  @override
  ConsumerState<NewTradeWidget> createState() => _NewTradeWidgetState();
}

class _NewTradeWidgetState extends ConsumerState<NewTradeWidget> {
  // ── Form mode ──
  _TradeMode _mode = _TradeMode.binary;

  // ── Direction ──
  String _direction = 'CALL'; // CALL/PUT for binary, BUY/SELL for forex

  // ── Instrument ──
  String? _selectedInstrument;

  // ── Text controllers ──
  final _investmentCtrl = TextEditingController();
  final _entryPriceCtrl = TextEditingController();
  final _slCtrl = TextEditingController();
  final _tpCtrl = TextEditingController();

  // ── Binary-only selections ──
  int _selectedPayoutPct = 77;
  String _selectedExpiry = '5m';

  // ── Config state ──
  AccountConfig? _config;
  bool _isLoadingConfig = false;
  String? _configError;

  // ── Submit state ──
  bool _isSubmitting = false;
  String? _submitError;

  // ── Form key ──
  final _formKey = GlobalKey<FormState>();

  // ── Fallback data used when config fails to load ──
  static const _fallbackInstruments = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'USD/CHF',
    'AUD/USD',
  ];
  // All payouts from 75% to 90% inclusive
  static const _fallbackPayouts = [
    75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90
  ];
  static const _fallbackExpiry = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h'];

  // ── Computed helpers ──

  List<String> get _instruments =>
      _config?.instruments.isNotEmpty == true
          ? _config!.instruments
          : _fallbackInstruments;

  // Always use ALL payouts from 75% to 90% (ignore backend config)
  List<int> get _payouts => List.generate(16, (i) => 75 + i); // 75,76,77,...,90

  // Always use ALL expiries (ignore backend config)
  List<String> get _expiries => ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h'];

  // ── Lifecycle ──

  @override
  void initState() {
    super.initState();
    _loadConfigAndSuggestInvestment();
  }

  @override
  void dispose() {
    _investmentCtrl.dispose();
    _entryPriceCtrl.dispose();
    _slCtrl.dispose();
    _tpCtrl.dispose();
    super.dispose();
  }

  // ── Config loading & investment suggestion ──

  Future<void> _loadConfigAndSuggestInvestment() async {
    setState(() {
      _isLoadingConfig = true;
      _configError = null;
    });

    try {
      final api = ref.read(apiClientProvider);
      final dashboardState = ref.read(dashboardProvider);
      
      // Load config
      final config = await DashboardApi(api).getAccountConfig();
      
      // Get account balance for 1% suggestion
      final account = dashboardState.selectedAccount;
      final balance = account?.balance ?? 0.0;
      final onePctSuggestion = (balance * 0.01).clamp(1.0, balance);
      
      if (!mounted) return;
      setState(() {
        _config = config;
        _isLoadingConfig = false;
        // Apply defaults from config
        _selectedPayoutPct = config.payoutPctDefault;
        // Pre-fill investment with 1% of balance
        _investmentCtrl.text = onePctSuggestion.toStringAsFixed(2);
        if (config.instruments.isNotEmpty) {
          _selectedInstrument = config.instruments.first;
        }
        if (config.expiryOptions.isNotEmpty) {
          _selectedExpiry = config.expiryOptions.contains('5m')
              ? '5m'
              : config.expiryOptions.first;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _configError = 'Could not load config. Using defaults.';
        _isLoadingConfig = false;
        // Pre-select fallback defaults
        _selectedInstrument ??= _fallbackInstruments.first;
        // Still suggest 1% even if config fails
        final dashboardState = ref.read(dashboardProvider);
        final balance = dashboardState.selectedAccount?.balance ?? 0.0;
        final onePctSuggestion = (balance * 0.01).clamp(1.0, balance);
        _investmentCtrl.text = onePctSuggestion.toStringAsFixed(2);
      });
    }
  }

  // ── Submission ──

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final dashboardState = ref.read(dashboardProvider);
    final accountId = dashboardState.selectedAccount?.id;
    if (accountId == null) {
      setState(() => _submitError = 'No account selected');
      return;
    }

    final investment = double.tryParse(_investmentCtrl.text.trim());
    if (investment == null || investment <= 0) {
      setState(() => _submitError = 'Enter a valid investment amount');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _submitError = null;
    });

    try {
      if (_mode == _TradeMode.binary) {
        await ref.read(dashboardProvider.notifier).openTrade(
              accountId: accountId,
              instrument: _selectedInstrument!,
              direction: _direction, // CALL or PUT
              investment: investment,
              payoutPct: _selectedPayoutPct / 100, // Convert 77 to 0.77
              expiryTime: _selectedExpiry,
              marketType: 'binary',
            );
      } else {
        final entryPrice =
            double.tryParse(_entryPriceCtrl.text.trim()) ?? 0.0;
        final stopLoss = double.tryParse(_slCtrl.text.trim());
        final takeProfit = double.tryParse(_tpCtrl.text.trim());

        await ref.read(dashboardProvider.notifier).openTrade(
              accountId: accountId,
              instrument: _selectedInstrument!,
              direction: _direction, // BUY or SELL
              investment: investment,
              entryPrice: entryPrice,
              stopLoss: stopLoss,
              takeProfit: takeProfit,
              marketType: 'forex',
            );
      }

      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _submitError = 'Failed to open trade. Try again.';
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // ── Drag handle ──
              _DragHandle(),

              // ── Header ──
              _SheetHeader(
                onClose: () => Navigator.of(context).pop(),
              ),

              // ── Body ──
              Expanded(
                child: _isLoadingConfig
                    ? const _ConfigLoadingView()
                    : SingleChildScrollView(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Config error banner
                              if (_configError != null) ...[
                                _ErrorBanner(message: _configError!),
                                const SizedBox(height: 12),
                              ],

                              // ── Mode toggle ──
                              const _SectionLabel(label: 'Trade Type'),
                              const SizedBox(height: 8),
                              _ModeToggle(
                                selected: _mode,
                                onChanged: _onModeChanged,
                              ),
                              const SizedBox(height: 20),

                              // ── Instrument picker ──
                              const _SectionLabel(label: 'Instrument'),
                              const SizedBox(height: 8),
                              _InstrumentPicker(
                                instruments: _instruments,
                                selected: _selectedInstrument,
                                onChanged: (v) =>
                                    setState(() => _selectedInstrument = v),
                              ),
                              const SizedBox(height: 20),

                              // ── Direction toggle ──
                              _SectionLabel(
                                label: _mode == _TradeMode.binary
                                    ? 'Direction'
                                    : 'Side',
                              ),
                              const SizedBox(height: 8),
                              _DirectionToggle(
                                mode: _mode,
                                selected: _direction,
                                onChanged: (v) =>
                                    setState(() => _direction = v),
                              ),
                              const SizedBox(height: 20),

                              // ── Investment ──
                              _InvestmentField(
                                controller: _investmentCtrl,
                                balance: ref.watch(dashboardProvider).selectedAccount?.balance ?? 0.0,
                              ),
                              const SizedBox(height: 20),

                              // ── Binary-only fields ──
                              if (_mode == _TradeMode.binary) ...[
                                const _SectionLabel(label: 'Payout (%)'),
                                const SizedBox(height: 8),
                                _PayoutSelector(
                                  payouts: _payouts,
                                  selected: _selectedPayoutPct,
                                  onChanged: (v) =>
                                      setState(() => _selectedPayoutPct = v),
                                ),
                                const SizedBox(height: 20),
                                const _SectionLabel(label: 'Expiry'),
                                const SizedBox(height: 8),
                                _ExpiryPicker(
                                  expiries: _expiries,
                                  selected: _selectedExpiry,
                                  onChanged: (v) =>
                                      setState(() => _selectedExpiry = v),
                                ),
                                const SizedBox(height: 20),
                              ],

                              // ── Forex-only fields ──
                              if (_mode == _TradeMode.forex) ...[
                                const _SectionLabel(
                                    label: 'Entry Price (optional)'),
                                const SizedBox(height: 8),
                                _AmountField(
                                  controller: _entryPriceCtrl,
                                  hint: '1.0850',
                                ),
                                const SizedBox(height: 20),
                                const _SectionLabel(
                                    label: 'Stop Loss (optional)'),
                                const SizedBox(height: 8),
                                _AmountField(
                                  controller: _slCtrl,
                                  hint: '1.0800',
                                ),
                                const SizedBox(height: 20),
                                const _SectionLabel(
                                    label: 'Take Profit (optional)'),
                                const SizedBox(height: 8),
                                _AmountField(
                                  controller: _tpCtrl,
                                  hint: '1.0900',
                                ),
                                const SizedBox(height: 20),
                              ],

                              // ── Submit error ──
                              if (_submitError != null) ...[
                                _ErrorBanner(message: _submitError!),
                                const SizedBox(height: 12),
                              ],

                              // ── Submit button ──
                              JadeButton(
                                label: _isSubmitting
                                    ? 'Opening...'
                                    : 'Open Trade',
                                isLoading: _isSubmitting,
                                onPressed: _isSubmitting ||
                                        _selectedInstrument == null
                                    ? null
                                    : _submit,
                              ),
                            ],
                          ),
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ── Event handlers ──

  void _onModeChanged(_TradeMode mode) {
    setState(() {
      _mode = mode;
      // Reset direction to sensible default for the new mode
      _direction = mode == _TradeMode.binary ? 'CALL' : 'BUY';
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _DragHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 10),
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: AppColors.textMuted,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 8, 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'New Trade',
            style: GoogleFonts.orbitron(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, color: AppColors.textMuted),
            onPressed: onClose,
            tooltip: 'Cancel',
          ),
        ],
      ),
    );
  }
}

class _ConfigLoadingView extends StatelessWidget {
  const _ConfigLoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: AppColors.primary),
          SizedBox(height: 16),
          Text(
            'Loading trade config...',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: AppColors.textSecondary,
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.1),
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
                fontSize: 13,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Mode Toggle: Binary / Forex ──

class _ModeToggle extends StatelessWidget {
  const _ModeToggle({
    required this.selected,
    required this.onChanged,
  });

  final _TradeMode selected;
  final ValueChanged<_TradeMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _ModeChip(
            label: 'Binary',
            isSelected: selected == _TradeMode.binary,
            onTap: () => onChanged(_TradeMode.binary),
          ),
          _ModeChip(
            label: 'Forex',
            isSelected: selected == _TradeMode.forex,
            onTap: () => onChanged(_TradeMode.forex),
          ),
        ],
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color:
                isSelected ? AppColors.primary.withValues(alpha: 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            border: isSelected
                ? Border.all(color: AppColors.primary.withValues(alpha: 0.6))
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight:
                  isSelected ? FontWeight.w600 : FontWeight.w400,
              color: isSelected ? AppColors.primary : AppColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Instrument Picker ──

class _InstrumentPicker extends StatelessWidget {
  const _InstrumentPicker({
    required this.instruments,
    required this.selected,
    required this.onChanged,
  });

  final List<String> instruments;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: selected,
          isExpanded: true,
          icon: const Icon(Icons.expand_more,
              color: AppColors.textSecondary, size: 20),
          dropdownColor: AppColors.surface,
          style: GoogleFonts.inter(fontSize: 15, color: AppColors.textPrimary),
          hint: Text(
            'Select instrument',
            style: GoogleFonts.inter(
                fontSize: 14, color: AppColors.textMuted),
          ),
          items: instruments.map((instrument) {
            return DropdownMenuItem<String>(
              value: instrument,
              child: Text(instrument),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

// ── Direction Toggle ──

class _DirectionToggle extends StatelessWidget {
  const _DirectionToggle({
    required this.mode,
    required this.selected,
    required this.onChanged,
  });

  final _TradeMode mode;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final options = mode == _TradeMode.binary
        ? [('CALL', AppColors.accent), ('PUT', AppColors.danger)]
        : [('BUY', AppColors.accent), ('SELL', AppColors.danger)];

    return Row(
      children: options.map((opt) {
        final label = opt.$1;
        final color = opt.$2;
        final isSelected = selected == label;

        return Expanded(
          child: GestureDetector(
            onTap: () => onChanged(label),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: isSelected
                    ? color.withValues(alpha: 0.18)
                    : AppColors.cardBackground,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isSelected
                      ? color
                      : AppColors.border,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight:
                      isSelected ? FontWeight.w700 : FontWeight.w400,
                  color: isSelected ? color : AppColors.textSecondary,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Amount / Price text field ──

class _AmountField extends StatelessWidget {
  const _AmountField({
    required this.controller,
    required this.hint,
  });

  final TextEditingController controller;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      style: GoogleFonts.jetBrainsMono(
        fontSize: 15,
        color: AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle:
            GoogleFonts.jetBrainsMono(fontSize: 14, color: AppColors.textMuted),
      ),
    );
  }
}

// ── Investment Field with 1% suggestion ──

class _InvestmentField extends StatelessWidget {
  const _InvestmentField({
    required this.controller,
    required this.balance,
  });

  final TextEditingController controller;
  final double balance;

  String _suggest1Pct() => (balance * 0.01).floor().toDouble().clamp(1.0, balance).toStringAsFixed(2);
  String _suggest2Pct() => (balance * 0.02).floor().toDouble().clamp(1.0, balance).toStringAsFixed(2);
  String _suggest5Pct() => (balance * 0.05).floor().toDouble().clamp(1.0, balance).toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const _SectionLabel(label: 'Investment Amount'),
            Text(
              'Balance: \$${balance.toStringAsFixed(2)}',
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: controller,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 15,
                  color: AppColors.textPrimary,
                ),
                decoration: InputDecoration(
                  hintText: _suggest1Pct(),
                  hintStyle: GoogleFonts.jetBrainsMono(
                    fontSize: 14,
                    color: AppColors.textMuted,
                  ),
                  prefixText: '\$ ',
                  prefixStyle: GoogleFonts.jetBrainsMono(
                    fontSize: 14,
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _QuickPctButton(
              label: '1%',
              balance: balance,
              onTap: () => controller.text = _suggest1Pct(),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            _QuickPctButton(
              label: '2%',
              balance: balance,
              onTap: () => controller.text = _suggest2Pct(),
              isSecondary: true,
            ),
            const SizedBox(width: 6),
            _QuickPctButton(
              label: '5%',
              balance: balance,
              onTap: () => controller.text = _suggest5Pct(),
              isSecondary: true,
            ),
          ],
        ),
      ],
    );
  }
}

class _QuickPctButton extends StatelessWidget {
  const _QuickPctButton({
    required this.label,
    required this.balance,
    required this.onTap,
    this.isSecondary = false,
  });

  final String label;
  final double balance;
  final VoidCallback onTap;
  final bool isSecondary;

  @override
  Widget build(BuildContext context) {
    final value = (balance * double.parse(label.replaceAll('%', '')) / 100)
        .floor()
        .toDouble()
        .clamp(1.0, balance);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isSecondary
              ? AppColors.cardBackground
              : AppColors.primary.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSecondary ? AppColors.border : AppColors.primary,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isSecondary ? AppColors.textSecondary : AppColors.primary,
              ),
            ),
            Text(
              '\$${value.toStringAsFixed(0)}',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                color: isSecondary ? AppColors.textMuted : AppColors.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Payout Selector ──

class _PayoutSelector extends StatelessWidget {
  const _PayoutSelector({
    required this.payouts,
    required this.selected,
    required this.onChanged,
  });

  final List<int> payouts;
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: payouts.map((pct) {
        final isSelected = pct == selected;
        return GestureDetector(
          onTap: () => onChanged(pct),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.primary.withValues(alpha: 0.15)
                  : AppColors.cardBackground,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Text(
              '$pct%',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 13,
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

// ── Expiry Picker ──

class _ExpiryPicker extends StatelessWidget {
  const _ExpiryPicker({
    required this.expiries,
    required this.selected,
    required this.onChanged,
  });

  final List<String> expiries;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: expiries.map((expiry) {
        final isSelected = expiry == selected;
        return GestureDetector(
          onTap: () => onChanged(expiry),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.primary.withValues(alpha: 0.15)
                  : AppColors.cardBackground,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Text(
              expiry,
              style: GoogleFonts.inter(
                fontSize: 13,
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
