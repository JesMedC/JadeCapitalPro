import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/network/api_client.dart';
import '../../core/network/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/jade_button.dart';

// Provider para cargar/guardar configuración de trading
final tradingConfigProvider = FutureProvider<TradingConfig?>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    final response = await api.get('/accounts/config');
    if (response.statusCode == 200) {
      final data = response.data as Map<String, dynamic>;
      return TradingConfig.fromJson(data);
    }
  } catch (e) {
    debugPrint('Error loading trading config: $e');
  }
  return null;
});

class TradingConfig {
  final List<String> instruments;
  final List<int> payoutOptions;
  final double payoutPctDefault;
  final List<String> expiryOptions;

  TradingConfig({
    required this.instruments,
    required this.payoutOptions,
    required this.payoutPctDefault,
    required this.expiryOptions,
  });

  factory TradingConfig.fromJson(Map<String, dynamic> json) => TradingConfig(
        instruments: List<String>.from(json['instruments'] ?? []),
        payoutOptions: List<int>.from(json['payout_options'] ?? []),
        payoutPctDefault: (json['payout_pct_default'] ?? 0.77).toDouble(),
        expiryOptions: List<String>.from(json['expiry_options'] ?? []),
      );

  Map<String, dynamic> toJson() => {
        'instruments': instruments,
        'payout_options': payoutOptions,
        'payout_pct_default': payoutPctDefault,
        'expiry_options': expiryOptions,
      };
}

/// Settings page with theme toggle, account info, and logout.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Account section ──
          _SectionHeader(title: 'Account'),
          const SizedBox(height: 8),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.cardBackground,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                  child: Text(
                    (user?.username ?? '?')[0].toUpperCase(),
                    style: GoogleFonts.orbitron(
                      fontSize: 20,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.username ?? 'Unknown',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.email ?? '',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // ── Preferences ──
          _SectionHeader(title: 'Preferences'),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.cardBackground,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                _SettingsTile(
                  icon: Icons.dark_mode_outlined,
                  title: 'Dark Mode',
                  subtitle: 'Always enabled',
                  trailing: Switch(
                    value: true,
                    onChanged: (_) {},
                    activeThumbColor: AppColors.primary,
                  ),
                ),
                _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.notifications_outlined,
                  title: 'Push Notifications',
                  subtitle: 'Trade alerts and signals',
                  trailing: Switch(
                    value: true,
                    onChanged: (_) {},
                    activeThumbColor: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // ── About ──
          _SectionHeader(title: 'About'),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.cardBackground,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: const Column(
              children: [
                _SettingsTile(
                  icon: Icons.info_outline,
                  title: 'Version',
                  subtitle: '1.0.0+1',
                ),
                _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.description_outlined,
                  title: 'Terms of Service',
                ),
                _SettingsDivider(),
                _SettingsTile(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Privacy Policy',
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          // ── Logout ──
          JadeButton(
            label: 'Log Out',
            variant: JadeButton.danger,
            onPressed: () async {
              await ref.read(authStateProvider.notifier).logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Reusable settings widgets ──

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: GoogleFonts.orbitron(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: AppColors.textSecondary, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

class _SettingsDivider extends StatelessWidget {
  const _SettingsDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(
      color: AppColors.divider,
      height: 1,
      indent: 48,
    );
  }
}
