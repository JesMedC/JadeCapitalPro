import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// WebSocket client wrapping Socket.IO with auth, auto-reconnect,
/// and typed event streams for price updates, alerts, and trade updates.
class WsClient {
  WsClient({
    String? serverUrl,
    FlutterSecureStorage? secureStorage,
  })  : _serverUrl = serverUrl ?? 'http://localhost:3000',
        _secureStorage =
            secureStorage ?? const FlutterSecureStorage() {
    _initSocket();
  }

  /// Test-only constructor — skips socket initialisation.
  ///
  /// Use this in unit/widget tests to avoid plugin dependencies.
  /// Override [scannerStream] (and other streams) to inject test data.
  @visibleForTesting
  WsClient.forTest()
      : _serverUrl = '',
        _secureStorage = const FlutterSecureStorage();

  final String _serverUrl;
  final FlutterSecureStorage _secureStorage;
  late io.Socket _socket;

  // ── Public event streams (broadcast) ──

  final _priceController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get priceStream => _priceController.stream;

  final _alertController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get alertStream => _alertController.stream;

  final _tradeUpdateController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get tradeUpdateStream =>
      _tradeUpdateController.stream;

  final _scannerController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get scannerStream => _scannerController.stream;

  final _backtestProgressController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Live stream of `backtest:progress` Socket.IO events.
  ///
  /// Emits payloads of shape:
  /// `{ sessionId, processed, total, percent, status }`.
  /// Multiple listeners are safe (broadcast stream).
  Stream<Map<String, dynamic>> get backtestProgressStream =>
      _backtestProgressController.stream;

  final _connectionController = StreamController<bool>.broadcast();
  Stream<bool> get connectionStream => _connectionController.stream;

  // ── Public state ──

  bool get isConnected => _socket.connected;

  // ── Initialisation ──

  Future<void> _initSocket() async {
    final token = await _secureStorage.read(key: 'jwt_access_token');

    _socket = io.io(
      _serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .setReconnectionAttempts(20) // ~30 s total
          .setAuth({'token': token ?? ''})
          .build(),
    );

    _socket.onConnect((_) {
      debugPrint('[WsClient] Connected to ${_socket.id}');
      _connectionController.add(true);
    });

    _socket.onDisconnect((reason) {
      debugPrint('[WsClient] Disconnected: $reason');
      _connectionController.add(false);
    });

    _socket.onConnectError((error) {
      debugPrint('[WsClient] Connection error: $error');
      _connectionController.add(false);
    });

    _socket.onError((error) {
      debugPrint('[WsClient] Socket error: $error');
    });

    // ── Application events ──
    _socket.on('price:update', (data) {
      if (data is Map<String, dynamic>) {
        _priceController.add(data);
      }
    });

    _socket.on('alert:triggered', (data) {
      if (data is Map<String, dynamic>) {
        _alertController.add(data);
      }
    });

    _socket.on('trade:update', (data) {
      if (data is Map<String, dynamic>) {
        _tradeUpdateController.add(data);
      }
    });

    // Scanner global broadcast (AC-8)
    _socket.on('scanner:updated', (data) {
      if (data is Map<String, dynamic>) {
        _scannerController.add(data);
      }
    });

    // Backtest progress push (Sprint 15)
    _socket.on('backtest:progress', (data) {
      if (data is Map<String, dynamic>) {
        _backtestProgressController.add(data);
      }
      // Non-map data silently ignored — malformed events never crash the stream
    });
  }

  // ── Room management ──

  /// Subscribe the current user to their personal event rooms.
  ///
  /// Call this after login with the authenticated user's ID.
  void subscribeUserRooms(String userId) {
    _socket.emit('join', [
      'user:$userId:trades',
      'user:$userId:alerts',
    ]);
    // Defense-in-depth: server auto-joins on handleConnection; this is a fallback (AC-9)
    _socket.emit('join', 'scanner:global');
    debugPrint('[WsClient] Subscribed to user rooms for $userId');
  }

  /// Subscribe to a market instrument price room.
  void subscribeMarket(String instrument) {
    _socket.emit('join', ['market:$instrument:price']);
    debugPrint('[WsClient] Subscribed to market $instrument');
  }

  /// Unsubscribe from a market instrument price room.
  void unsubscribeMarket(String instrument) {
    _socket.emit('leave', ['market:$instrument:price']);
    debugPrint('[WsClient] Unsubscribed from market $instrument');
  }

  // ── Lifecycle ──

  /// Manually connect (if not already connected).
  void connect() {
    if (!_socket.connected) {
      _socket.connect();
    }
  }

  /// Disconnect and tear down all subscriptions.
  void disconnect() {
    _socket.disconnect();
  }

  /// Release all resources. Call when the app is shutting down.
  void dispose() {
    _socket.dispose();
    _priceController.close();
    _alertController.close();
    _tradeUpdateController.close();
    _scannerController.close();
    _backtestProgressController.close();
    _connectionController.close();
  }
}
