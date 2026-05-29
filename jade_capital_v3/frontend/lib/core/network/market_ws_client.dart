import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_config.dart';
import '../../features/market/models/price_tick.dart';

/// Socket.IO client for the /ws/market namespace.
///
/// Uses the correct event names that [MarketDataGateway] expects:
///   emit  → 'subscribe:price'    payload: { "instrument": "EUR/USD" }
///   emit  → 'unsubscribe'        payload: { "channel": "market:EUR/USD:price" }
///   on    ← 'priceUpdate'        payload: { instrument, bid, ask, spread, timestamp }
///
/// Do NOT modify [WsClient] — it serves the TradingGateway and has
/// different event conventions (join/leave, price:update vs subscribe:price/priceUpdate).
class MarketWsClient {
  MarketWsClient({String? serverUrl, String? token})
      : _serverUrl = serverUrl ?? ApiConfig.wsBaseUrl,
        _token = token ?? '';

  final String _serverUrl;
  final String _token;
  late io.Socket _socket;

  final _priceController = StreamController<PriceTick>.broadcast();

  /// Stream of live price ticks from the /ws/market namespace.
  Stream<PriceTick> get priceUpdates => _priceController.stream;

  final _connController = StreamController<bool>.broadcast();

  /// Stream of connection state changes (true = connected, false = disconnected).
  Stream<bool> get connectionStream => _connController.stream;

  bool get isConnected => _socket.connected;

  /// Connect to [_serverUrl]/ws/market with JWT auth.
  ///
  /// Idempotent — calling more than once before [disconnect] is a no-op.
  void connect() {
    _socket = io.io(
      '$_serverUrl/ws/market', // explicit namespace matches MarketDataGateway
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect() // we call connect() explicitly below
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .setReconnectionAttempts(20)
          .setAuth({'token': _token})
          .build(),
    );

    _socket.onConnect((_) {
      debugPrint('[MarketWsClient] Connected to /ws/market');
      _connController.add(true);
    });

    _socket.onDisconnect((_) {
      debugPrint('[MarketWsClient] Disconnected');
      _connController.add(false);
    });

    _socket.onConnectError((error) {
      debugPrint('[MarketWsClient] Connection error: $error');
      _connController.add(false);
    });

    // 'priceUpdate' matches MarketDataGateway.broadcastPrice() emit name
    _socket.on('priceUpdate', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      try {
        _priceController.add(PriceTick.fromJson(map));
      } catch (e) {
        debugPrint('[MarketWsClient] Parse error: $e | data: $map');
      }
    });

    _socket.connect();
  }

  /// Emits 'subscribe:price' — triggers MarketDataGateway.handleSubscribePrice().
  ///
  /// Payload field is 'instrument' (not 'symbol') — matches the gateway handler.
  void subscribePrice(String instrument) {
    _socket.emit('subscribe:price', {'instrument': instrument});
    debugPrint('[MarketWsClient] subscribePrice($instrument)');
  }

  /// Emits 'unsubscribe' — triggers MarketDataGateway.handleUnsubscribe().
  ///
  /// Payload uses 'channel' key: 'market:{instrument}:price'.
  void unsubscribePrice(String instrument) {
    final channel = 'market:$instrument:price';
    _socket.emit('unsubscribe', {'channel': channel});
    debugPrint('[MarketWsClient] unsubscribePrice($instrument) → channel: $channel');
  }

  /// Manually disconnect the socket.
  void disconnect() {
    _socket.disconnect();
  }

  /// Release all resources. Call via [ref.onDispose] in the provider.
  void dispose() {
    _socket.dispose();
    _priceController.close();
    _connController.close();
  }
}
