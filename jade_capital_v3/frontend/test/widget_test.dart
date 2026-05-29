import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/main.dart';

void main() {
  testWidgets('App loads without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: JadeCapitalApp()),
    );

    // Verify the app renders without immediate errors.
    expect(find.byType(JadeCapitalApp), findsOneWidget);
  });
}
