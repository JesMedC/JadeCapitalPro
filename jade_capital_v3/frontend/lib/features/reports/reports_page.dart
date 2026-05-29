import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'providers/reports_provider.dart';

/// Reports page — lets the user select a date range and export a PDF report.
///
/// Route: `/dashboard/reports/:accountId`
///
/// Composition:
/// - [_PresetSelector]: segmented-button row (7d / 30d / 90d / Custom)
/// - [_CustomDatePicker]: visible only when preset == custom
/// - Export PDF button (disabled while downloading or invalid custom range)
/// - [LinearProgressIndicator] while downloading
/// - Inline error text on failure
class ReportsPage extends ConsumerWidget {
  const ReportsPage({super.key, required this.accountId});

  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(reportsProvider);
    final notifier = ref.read(reportsProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Export PDF Report'),
        elevation: 0,
      ),
      body: Column(
        children: [
          // Progress bar
          if (state.isDownloading)
            const LinearProgressIndicator()
          else
            const SizedBox(height: 4),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Section title
                  Text(
                    'Select Period',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 12),

                  // Preset selector
                  _PresetSelector(
                    selected: state.preset,
                    onChanged: (p) => notifier.setPreset(p),
                  ),

                  // Custom date range
                  if (state.preset == ReportPreset.custom) ...[
                    const SizedBox(height: 16),
                    _CustomDatePicker(
                      fromDate: state.customFrom,
                      toDate: state.customTo,
                      onFromPicked: (d) => notifier.setCustomFrom(d),
                      onToPicked: (d) => notifier.setCustomTo(d),
                    ),
                  ],

                  const SizedBox(height: 24),

                  // Export button
                  FilledButton.icon(
                    onPressed: state.isDownloadDisabled
                        ? null
                        : () => notifier.download(accountId),
                    icon: state.isDownloading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.picture_as_pdf_outlined),
                    label: Text(state.isDownloading ? 'Generating…' : 'Export PDF'),
                  ),

                  // Success message
                  if (state.downloadSuccess) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Icon(Icons.check_circle_outline, color: Colors.green),
                        const SizedBox(width: 8),
                        Text(
                          'Report downloaded successfully.',
                          style: TextStyle(color: Colors.green.shade700),
                        ),
                      ],
                    ),
                  ],

                  // Error message
                  if (state.errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.error_outline,
                            color: Theme.of(context).colorScheme.error),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            state.errorMessage!,
                            key: const Key('reports_error_text'),
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── _PresetSelector ───────────────────────────────────────────────────────────

class _PresetSelector extends StatelessWidget {
  const _PresetSelector({
    required this.selected,
    required this.onChanged,
  });

  final ReportPreset selected;
  final ValueChanged<ReportPreset> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<ReportPreset>(
      segments: ReportPreset.values
          .map(
            (p) => ButtonSegment<ReportPreset>(
              value: p,
              label: Text(p.label),
            ),
          )
          .toList(),
      selected: {selected},
      onSelectionChanged: (s) => onChanged(s.first),
      showSelectedIcon: false,
    );
  }
}

// ── _CustomDatePicker ─────────────────────────────────────────────────────────

class _CustomDatePicker extends StatelessWidget {
  const _CustomDatePicker({
    required this.fromDate,
    required this.toDate,
    required this.onFromPicked,
    required this.onToPicked,
  });

  final DateTime? fromDate;
  final DateTime? toDate;
  final ValueChanged<DateTime> onFromPicked;
  final ValueChanged<DateTime> onToPicked;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM dd, yyyy');
    final now = DateTime.now();
    final firstDate = DateTime(2020);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Date Range',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today_outlined, size: 16),
                label: Text(
                  fromDate != null ? fmt.format(fromDate!) : 'From date',
                ),
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: fromDate ?? now.subtract(const Duration(days: 30)),
                    firstDate: firstDate,
                    lastDate: now,
                  );
                  if (picked != null) onFromPicked(picked);
                },
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('→'),
            ),
            Expanded(
              child: OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today_outlined, size: 16),
                label: Text(
                  toDate != null ? fmt.format(toDate!) : 'To date',
                ),
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: toDate ?? now,
                    firstDate: fromDate ?? firstDate,
                    lastDate: now,
                  );
                  if (picked != null) onToPicked(picked);
                },
              ),
            ),
          ],
        ),

        // Validation warning
        if (fromDate != null && toDate != null && toDate!.isBefore(fromDate!))
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              '"To" date must be after "From" date.',
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 12,
              ),
            ),
          ),
      ],
    );
  }
}
