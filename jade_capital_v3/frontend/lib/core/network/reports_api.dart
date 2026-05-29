import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

import 'api_client.dart';

/// REST client for the reports endpoint (`/accounts/:id/report`).
///
/// Returns the raw PDF bytes so the caller can save them to disk and open
/// the file via the OS file handler. Mirrors the [BacktestApi] pattern:
/// injected with [ApiClient], no static state, purely functional.
///
/// The JWT in [ApiClient] is automatically attached to every request — no
/// authentication setup needed here.
class ReportsApi {
  const ReportsApi(this._client);

  final ApiClient _client;

  /// Download the PDF report for [accountId] and return the raw bytes.
  ///
  /// Pass exactly ONE of:
  /// - [preset]: `'7d'`, `'30d'`, or `'90d'` for relative presets.
  /// - [from] + [to]: explicit date range (both required together).
  ///
  /// Throws [ApiException] on:
  /// - `403`: account not owned by the caller.
  /// - `404`: no closed trades in the selected range.
  /// - `400`: invalid date range (e.g. `from > to`).
  /// - Other network/server errors.
  Future<Uint8List> downloadReport(
    String accountId, {
    String? preset,
    DateTime? from,
    DateTime? to,
  }) async {
    assert(
      preset != null || (from != null && to != null),
      'Provide either preset or both from and to.',
    );

    final params = <String, dynamic>{};
    if (preset != null) {
      params['preset'] = preset;
    } else {
      final fmt = DateFormat('yyyy-MM-dd');
      params['from'] = fmt.format(from!);
      params['to'] = fmt.format(to!);
    }

    try {
      final res = await _client.get<List<int>>(
        '/accounts/$accountId/report',
        queryParameters: params,
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
