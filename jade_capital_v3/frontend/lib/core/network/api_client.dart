import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'api_config.dart';

/// Centralized API client wrapping [Dio] with JWT auth, auto-refresh,
/// and standardized error handling.
class ApiClient {
  ApiClient({
    String? baseUrl,
  }) : _dio = Dio(
         BaseOptions(
           baseUrl: baseUrl ?? ApiConfig.apiBaseUrl,
           connectTimeout: const Duration(seconds: 10),
           receiveTimeout: const Duration(seconds: 30),
           sendTimeout: const Duration(seconds: 10),
           headers: {
             'Content-Type': 'application/json',
             'Accept': 'application/json',
           },
         ),
       ) {
    _setupInterceptors();
  }

  final Dio _dio;

  /// Whether a token refresh is currently in-flight (dedup).
  bool _isRefreshing = false;

  // ── Static token storage — shared across ALL instances ──
  static String? _accessToken;
  static String? _refreshToken;

  /// Synchronous read of the current access token.
  ///
  /// Used by providers that cannot be async (e.g. [marketWsClientProvider]).
  /// The token is always in-memory after login — no I/O needed.
  static String? get currentAccessToken => _accessToken;

  /// The underlying Dio instance for direct access if needed.
  Dio get dio => _dio;

  // ── Public HTTP helpers ──

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) =>
      _dio.get<T>(path,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken);

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) =>
      _dio.post<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken);

  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) =>
      _dio.put<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken);

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) =>
      _dio.patch<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken);

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) =>
      _dio.delete<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken);

  // ── Public token management ──

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  Future<String?> getAccessToken() async => _accessToken;

  Future<String?> getRefreshToken() async => _refreshToken;

  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
  }

  // ── Interceptors ──

  void _setupInterceptors() {
    // 1) Attach access token to every outgoing request.
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // 2) On 401, attempt a single token refresh.
          if (error.response?.statusCode == 401) {
            // Don't try to refresh if the failed call *was* the refresh call.
            if (error.requestOptions.path == '/auth/refresh') {
              await clearTokens();
              return handler.next(error);
            }

            if (!_isRefreshing) {
              _isRefreshing = true;
              try {
                final newAccessToken = await performTokenRefresh();
                if (newAccessToken != null) {
                  // Retry the original request with the new token.
                  final opts = error.requestOptions;
                  opts.headers['Authorization'] = 'Bearer $newAccessToken';
                  final response = await _dio.fetch(opts);
                  _isRefreshing = false;
                  return handler.resolve(response);
                }
              } catch (e) {
                debugPrint('[ApiClient] Token refresh failed: $e');
                await clearTokens();
              }
              _isRefreshing = false;
            }
            // If refresh failed or was already in-flight, propagate.
            return handler.next(error);
          }

          // 3) Standardize error format for other errors.
          handler.next(error);
        },
      ),
    );

    // Log interceptor (debug only).
    if (kDebugMode) {
      _dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: true,
        error: true,
        logPrint: (obj) => debugPrint('[ApiClient] $obj'),
      ));
    }
  }

  /// Attempt to use the stored refresh token to get a new access token.
  /// Returns the new access token on success, null on failure.
  Future<String?> performTokenRefresh() async {
    final refreshToken = await getRefreshToken();
    if (refreshToken == null) return null;

    try {
      final response = await Dio(BaseOptions(
        baseUrl: _dio.options.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      )).post('/auth/refresh', data: {'refreshToken': refreshToken});

      final data = response.data as Map<String, dynamic>;
      final newAccess = data['accessToken'] as String?;
      final newRefresh = data['refreshToken'] as String?;

      if (newAccess != null && newRefresh != null) {
        await saveTokens(accessToken: newAccess, refreshToken: newRefresh);
        return newAccess;
      }
    } on DioException catch (e) {
      debugPrint('[ApiClient] Refresh request failed: ${e.message}');
    }

    return null;
  }
}

/// Standardized API error that callers can match on.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  final Map<String, dynamic>? errors; // field-level validation errors

  const ApiException({
    required this.statusCode,
    required this.message,
    this.errors,
  });

  factory ApiException.fromDioError(DioException error) {
    final statusCode = error.response?.statusCode ?? 0;
    final data = error.response?.data;
    String message;

    if (data is Map<String, dynamic>) {
      message = (data['message'] as String?) ??
          (data['error'] as String?) ??
          _statusMessage(statusCode);
    } else {
      message = _statusMessage(statusCode);
    }

    return ApiException(
      statusCode: statusCode,
      message: message,
      errors: data is Map<String, dynamic>
          ? (data['errors'] as Map<String, dynamic>?)
          : null,
    );
  }

  factory ApiException.unknown() =>
      const ApiException(statusCode: 0, message: 'An unknown error occurred');

  static String _statusMessage(int code) {
    switch (code) {
      case 400:
        return 'Bad request';
      case 401:
        return 'Unauthorized — please log in again';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Resource not found';
      case 409:
        return 'Conflict';
      case 422:
        return 'Validation error';
      case 429:
        return 'Too many requests — slow down';
      case 500:
        return 'Internal server error';
      default:
        return 'Unexpected error ($code)';
    }
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}
