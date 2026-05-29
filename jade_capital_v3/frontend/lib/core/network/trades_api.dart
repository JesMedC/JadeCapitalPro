import 'api_client.dart';

/// API layer for trade history and manual trade management.
class TradesApi {
  const TradesApi(this._client);

  final ApiClient _client;

  /// Fetch trade history for an account.
  Future<Map<String, dynamic>> getTrades(
    String accountId, {
    String? status,
    String? type,
    String? sortBy,
    String? sortDir,
  }) async {
    final params = <String, dynamic>{};
    if (status != null && status != 'all') params['status'] = status;
    if (type != null) params['type'] = type;
    if (sortBy != null) params['sortBy'] = sortBy;
    if (sortDir != null) params['sortDir'] = sortDir;

    final res = await _client.get(
      '/trades/$accountId',
      queryParameters: params.isNotEmpty ? params : null,
    );
    return res.data as Map<String, dynamic>;
  }

  /// Open a manual trade.
  Future<Map<String, dynamic>> openTrade(Map<String, dynamic> data) async {
    final res = await _client.post('/trades/manual/open', data: data);
    return res.data as Map<String, dynamic>;
  }

  /// Close a binary trade with result (WIN / LOSS / BE).
  Future<void> closeBinary(String id, String result) async {
    await _client.post(
      '/trades/manual/binary/$id/close',
      data: {'result': result},
    );
  }

  /// Close a forex trade with exit price.
  Future<void> closeForex(String id, double exitPrice) async {
    await _client.post(
      '/trades/manual/forex/$id/close',
      data: {'exitPrice': exitPrice},
    );
  }

  /// Delete a trade (reverse operation).
  Future<void> deleteTrade(String id) async {
    await _client.delete('/trades/manual/$id/delete');
  }
}
