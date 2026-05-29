import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_theme.dart';
import 'models/economic_event.dart';
import 'providers/calendar_provider.dart';
import 'widgets/day_header.dart';
import 'widgets/event_card.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SliverPersistentHeader delegate for DayHeader
// ─────────────────────────────────────────────────────────────────────────────

class _DayHeaderDelegate extends SliverPersistentHeaderDelegate {
  const _DayHeaderDelegate({required this.date});

  final DateTime date;

  @override
  double get minExtent => 36;

  @override
  double get maxExtent => 36;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return DayHeader(date: date);
  }

  @override
  bool shouldRebuild(_DayHeaderDelegate oldDelegate) =>
      date != oldDelegate.date;
}

// ─────────────────────────────────────────────────────────────────────────────
// CalendarPage
// ─────────────────────────────────────────────────────────────────────────────

/// Economic calendar page — shows upcoming and past macro events grouped by day.
///
/// - Filter bar with currency and impact chips (client-side, no HTTP on tap).
/// - Pull-to-refresh triggers [CalendarNotifier.reload].
/// - 24-hour auto-refresh is handled by [CalendarNotifier] itself.
/// - Loading state → skeleton placeholders.
/// - Error state → error message + Retry button.
/// - Empty filtered result → "No events match" message.
class CalendarPage extends ConsumerStatefulWidget {
  const CalendarPage({super.key});

  @override
  ConsumerState<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends ConsumerState<CalendarPage> {
  static const _currencies = ['USD', 'EUR', 'GBP', 'JPY'];
  static const _impacts = ['high', 'medium', 'low'];

  @override
  Widget build(BuildContext context) {
    final asyncCalendar = ref.watch(calendarProvider);
    final selectedCurrencies = ref.watch(calendarCurrencyFilterProvider);
    final selectedImpacts = ref.watch(calendarImpactFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Calendar'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Reload',
            onPressed: () =>
                ref.read(calendarProvider.notifier).reload(),
          ),
        ],
      ),
      body: Column(
        children: [
          _FilterBar(
            currencies: _currencies,
            impacts: _impacts,
            selectedCurrencies: selectedCurrencies,
            selectedImpacts: selectedImpacts,
            onCurrencyToggle: (currency) {
              final current =
                  ref.read(calendarCurrencyFilterProvider);
              final updated = Set<String>.from(current);
              if (updated.contains(currency)) {
                updated.remove(currency);
              } else {
                updated.add(currency);
              }
              ref.read(calendarCurrencyFilterProvider.notifier).state =
                  updated;
            },
            onImpactToggle: (impact) {
              final current =
                  ref.read(calendarImpactFilterProvider);
              final updated = Set<String>.from(current);
              if (updated.contains(impact)) {
                updated.remove(impact);
              } else {
                updated.add(impact);
              }
              ref.read(calendarImpactFilterProvider.notifier).state =
                  updated;
            },
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () =>
                  ref.read(calendarProvider.notifier).reload(),
              child: asyncCalendar.when(
                loading: () => const _CalendarSkeleton(),
                error: (e, _) => _CalendarError(
                  message: e.toString(),
                  onRetry: () =>
                      ref.read(calendarProvider.notifier).reload(),
                ),
                data: (events) {
                  // Client-side filtering
                  final filtered = events.where((e) {
                    final currencyMatch = selectedCurrencies.isEmpty ||
                        selectedCurrencies.contains(e.currency);
                    final impactMatch = selectedImpacts.isEmpty ||
                        selectedImpacts.contains(e.impact.name);
                    return currencyMatch && impactMatch;
                  }).toList();

                  // Group by local calendar date
                  final grouped = <DateTime, List<EconomicEvent>>{};
                  for (final e in filtered) {
                    final local = e.timestamp.toLocal();
                    final day =
                        DateTime(local.year, local.month, local.day);
                    grouped.putIfAbsent(day, () => []).add(e);
                  }

                  final sortedDays = grouped.keys.toList()..sort();

                  if (sortedDays.isEmpty) {
                    return Center(
                      child: Text(
                        'No events match the selected filters',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.textMuted,
                        ),
                      ),
                    );
                  }

                  return CustomScrollView(
                    slivers: [
                      for (final day in sortedDays) ...[
                        SliverPersistentHeader(
                          pinned: true,
                          delegate: _DayHeaderDelegate(date: day),
                        ),
                        SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (ctx, i) => EventCard(
                              event: grouped[day]![i],
                            ),
                            childCount: grouped[day]!.length,
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter bar
// ─────────────────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.currencies,
    required this.impacts,
    required this.selectedCurrencies,
    required this.selectedImpacts,
    required this.onCurrencyToggle,
    required this.onImpactToggle,
  });

  final List<String> currencies;
  final List<String> impacts;
  final Set<String> selectedCurrencies;
  final Set<String> selectedImpacts;
  final void Function(String) onCurrencyToggle;
  final void Function(String) onImpactToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: currency chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: currencies.map((c) {
                final selected = selectedCurrencies.contains(c);
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(c),
                    selected: selected,
                    onSelected: (_) => onCurrencyToggle(c),
                    selectedColor:
                        AppColors.primary.withValues(alpha: 0.2),
                    checkmarkColor: AppColors.primary,
                    labelStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: selected
                          ? AppColors.primary
                          : AppColors.textSecondary,
                    ),
                    side: BorderSide(
                      color: selected
                          ? AppColors.primary
                          : AppColors.border,
                    ),
                    backgroundColor: AppColors.cardBackground,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 4, vertical: 0),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 6),
          // Row 2: impact chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: impacts.map((imp) {
                final selected = selectedImpacts.contains(imp);
                final impactColor = imp == 'high'
                    ? AppColors.danger
                    : imp == 'medium'
                        ? AppColors.warning
                        : AppColors.textMuted;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(imp),
                    selected: selected,
                    onSelected: (_) => onImpactToggle(imp),
                    selectedColor: impactColor.withValues(alpha: 0.2),
                    checkmarkColor: impactColor,
                    labelStyle: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: selected
                          ? impactColor
                          : AppColors.textSecondary,
                    ),
                    side: BorderSide(
                      color: selected ? impactColor : AppColors.border,
                    ),
                    backgroundColor: AppColors.cardBackground,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 4, vertical: 0),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

class _CalendarSkeleton extends StatelessWidget {
  const _CalendarSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: 7,
      itemBuilder: (context, index) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _SkeletonRow(wide: index % 3 == 0),
        );
      },
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.wide});

  final bool wide;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 68,
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          // Impact bar placeholder
          Container(
            width: 4,
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Content placeholder
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Container(
                    height: 12,
                    width: wide ? 180 : 140,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  Container(
                    height: 10,
                    width: wide ? 120 : 90,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error widget
// ─────────────────────────────────────────────────────────────────────────────

class _CalendarError extends StatelessWidget {
  const _CalendarError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: AppColors.danger,
            ),
            const SizedBox(height: 16),
            Text(
              'Failed to load calendar',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
