import 'package:flutter/foundation.dart';

/// Runtime endpoints for JadeCapital clients.
///
/// In production web builds the app is served behind nginx on the same origin
/// as the API, so defaults are relative to the current browser origin. Local
/// desktop/mobile development keeps using localhost.
class ApiConfig {
  static const String _apiBaseUrlDefine = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const String _wsBaseUrlDefine = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: '',
  );

  static String get apiBaseUrl {
    if (_apiBaseUrlDefine.isNotEmpty) return _apiBaseUrlDefine;
    if (kIsWeb) return '${Uri.base.origin}/api';
    return 'http://localhost:3000/api';
  }

  static String get wsBaseUrl {
    if (_wsBaseUrlDefine.isNotEmpty) return _wsBaseUrlDefine;
    if (kIsWeb) return Uri.base.origin;
    return 'http://localhost:3000';
  }
}
