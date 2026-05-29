import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';

// ── Models ──

/// Immutable representation of the authenticated user.
class User {
  final String id;
  final String username;
  final String email;
  final String? avatarUrl;
  final DateTime createdAt;

  const User({
    required this.id,
    required this.username,
    required this.email,
    this.avatarUrl,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        username: json['username'] as String,
        email: json['email'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// Auth state representation consumed by the router and UI.
class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final User? user;
  final String? errorMessage;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.user,
    this.errorMessage,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    User? user,
    String? errorMessage,
    bool clearError = false,
  }) =>
      AuthState(
        isAuthenticated: isAuthenticated ?? this.isAuthenticated,
        isLoading: isLoading ?? this.isLoading,
        user: user ?? this.user,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );
}

// ── StateNotifier ──

/// Manages authentication lifecycle: login, register, logout, token refresh.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier({
    ApiClient? apiClient,
  })  : _api = apiClient ?? ApiClient(),
        super(const AuthState()) {
    _restoreSession();
  }

  final ApiClient _api;

  // ── Public methods ──

  /// Log in with email + password.
  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final response = await _api.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final data = response.data as Map<String, dynamic>;
      final accessToken = data['accessToken'] as String;
      final refreshToken = data['refreshToken'] as String;

      await _api.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );

      // Fetch user profile after getting tokens
      final meResponse = await _api.get('/auth/me');
      final meData = meResponse.data as Map<String, dynamic>;
      final user = User.fromJson(meData);

      // Save the user ID
      _userId = user.id;

      state = AuthState(
        isAuthenticated: true,
        isLoading: false,
        user: user,
      );
    } on ApiException catch (e) {
      state = AuthState(
        isAuthenticated: false,
        isLoading: false,
        errorMessage: e.message,
      );
    } catch (e) {
      state = AuthState(
        isAuthenticated: false,
        isLoading: false,
        errorMessage: 'Login failed. Please try again.',
      );
      debugPrint('[AuthNotifier] Login error: $e');
    }
  }

  /// Register a new account.
  Future<void> register({
    required String username,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final response = await _api.post('/auth/register', data: {
        'username': username,
        'email': email,
        'password': password,
      });

      final data = response.data as Map<String, dynamic>;
      final accessToken = data['accessToken'] as String;
      final refreshToken = data['refreshToken'] as String;

      await _api.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );

      // Fetch user profile after getting tokens
      final meResponse = await _api.get('/auth/me');
      final meData = meResponse.data as Map<String, dynamic>;
      final user = User.fromJson(meData);

      // Save the user ID
      _userId = user.id;

      state = AuthState(
        isAuthenticated: true,
        isLoading: false,
        user: user,
      );
    } on ApiException catch (e) {
      state = AuthState(
        isAuthenticated: false,
        isLoading: false,
        errorMessage: e.message,
      );
    } catch (e) {
      state = AuthState(
        isAuthenticated: false,
        isLoading: false,
        errorMessage: 'Registration failed. Please try again.',
      );
      debugPrint('[AuthNotifier] Register error: $e');
    }
  }

  /// Log out and clear stored credentials.
  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // Best-effort server notification; proceed with local cleanup.
    }

    await _api.clearTokens();
    _userId = null;

    state = const AuthState(isAuthenticated: false, isLoading: false);
  }

  /// Refresh the access token using the stored refresh token.
  Future<String?> refreshToken() async {
    try {
      final newAccess = await _api.performTokenRefresh();
      return newAccess;
    } catch (e) {
      debugPrint('[AuthNotifier] Token refresh failed: $e');
      await logout();
      return null;
    }
  }

  /// Clear any displayed error.
  void clearError() {
    state = state.copyWith(clearError: true);
  }

  // ── Private helpers ──

  Future<void> _restoreSession() async {
    state = state.copyWith(isLoading: true);

    try {
      final token = await _api.getAccessToken();
      if (token == null) {
        state = const AuthState(isAuthenticated: false);
        return;
      }

      // Validate the stored token by calling /auth/me.
      final response = await _api.get('/auth/me');
      final data = response.data as Map<String, dynamic>;
      final user = User.fromJson(data);

      state = AuthState(
        isAuthenticated: true,
        isLoading: false,
        user: user,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        // Stored token is expired/invalid — try refresh.
        final newToken = await refreshToken();
        if (newToken != null) {
          await _restoreSession(); // Retry with new token.
          return;
        }
      }
      // Couldn't recover — force logout.
      await _api.clearTokens();
      _userId = null;
      state = const AuthState(isAuthenticated: false);
    } catch (e) {
      debugPrint('[AuthNotifier] Session restore failed: $e');
      state = const AuthState(isAuthenticated: false);
    }
  }
}

// ── Riverpod providers ──

/// The main auth state notifier. Watch this for auth status.
final authStateProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

/// Convenience: true when the user is authenticated.
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isAuthenticated;
});

/// Convenience: the currently logged-in user (null if not authenticated).
final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).user;
});

  // ── In-memory storage ──
  String? _userId;

  /// Convenience: reads the current JWT access token.
final authTokenProvider = FutureProvider<String?>((ref) async {
  return ApiClient().getAccessToken();
});
