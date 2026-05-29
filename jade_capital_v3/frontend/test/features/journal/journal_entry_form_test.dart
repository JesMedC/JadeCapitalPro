// Task 5.1 — Widget tests for JournalEntryForm.
//
// Covers:
// - Create mode: renders correct header, section labels, all 7 emotion chips
// - Submit button text: "Create Entry" vs "Save Changes"
// - Submit enabled/disabled based on title content
// - Emotion picker: tap selects / deselects without crash
// - create submission: notifier.createEntry called with correct title + emotion
// - Edit mode: pre-populates title and content from existing entry
// - Edit submission: notifier.updateEntry called with correct entry id
// - Inline error message shown when service throws

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:jade_capital_v3/features/journal/models/journal_entry.dart';
import 'package:jade_capital_v3/features/journal/providers/journal_provider.dart';
import 'package:jade_capital_v3/features/journal/widgets/journal_entry_form.dart';

// ── Mock JournalNotifier ─────────────────────────────────────────────────────

class _MockJournalNotifier
    extends StateNotifier<AsyncValue<List<JournalEntry>>>
    implements JournalNotifier {
  _MockJournalNotifier() : super(const AsyncValue.data([]));

  Map<String, dynamic>? lastCreatedData;
  Map<String, dynamic>? lastUpdatedData;
  String? lastUpdatedId;
  bool shouldThrow = false;

  @override
  Future<void> createEntry(Map<String, dynamic> data) async {
    if (shouldThrow) throw Exception('Network error');
    lastCreatedData = data;
  }

  @override
  Future<void> updateEntry(String id, Map<String, dynamic> data) async {
    if (shouldThrow) throw Exception('Network error');
    lastUpdatedId = id;
    lastUpdatedData = data;
  }

  @override
  Future<void> deleteEntry(String id) async {}
  @override
  Future<void> loadEntries({EmotionTag? emotion}) async {}
  @override
  Future<void> applyFilter(EmotionTag? emotion) async {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Sets the test window to 800×8000 so the [DraggableScrollableSheet] can
/// expand to its full size and all [ListView] children are built — including
/// the submit [ElevatedButton] at the bottom.
///
/// Call at the start of each test; registers teardowns automatically.
void _setLargeViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 8000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Renders [JournalEntryForm] under a [ProviderScope] with mocked notifier.
Widget _buildWidget({
  JournalEntry? entry,
  required _MockJournalNotifier notifier,
}) {
  return ProviderScope(
    overrides: [
      journalProvider.overrideWith((_) => notifier),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 800,
          height: 8000,
          child: JournalEntryForm(entry: entry),
        ),
      ),
    ),
  );
}

JournalEntry _makeEntry({
  String id = '11111111-0000-0000-0000-000000000001',
  String title = 'Existing entry',
  String? content = 'Some content',
  EmotionTag? emotion = EmotionTag.calm,
}) {
  return JournalEntry(
    id: id,
    title: title,
    content: content,
    emotion: emotion,
    tradeIds: null,
    tags: null,
    createdAt: DateTime.parse('2026-01-15T10:00:00Z'),
    updatedAt: DateTime.parse('2026-01-15T10:00:00Z'),
  );
}

/// Finds the single [ElevatedButton] in the form (submit button).
ElevatedButton _submitButton(WidgetTester tester) {
  return tester.widget<ElevatedButton>(find.byType(ElevatedButton));
}

// ── Tests ────────────────────────────────────────────────────────────────────

void main() {
  group('JournalEntryForm — create mode', () {
    testWidgets('renders "New Entry" header text', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(find.text('New Entry'), findsOneWidget);
    });

    testWidgets('renders the "Title *" label', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(find.text('Title *'), findsOneWidget);
    });

    testWidgets('renders the "Notes" label for content input', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(find.text('Notes'), findsOneWidget);
    });

    testWidgets('renders "How did you feel?" section label', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(find.text('How did you feel?'), findsOneWidget);
    });

    testWidgets('renders all 7 emotion tag labels', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      for (final tag in EmotionTag.values) {
        expect(find.text(tag.label), findsAtLeastNWidgets(1),
            reason: 'Expected chip label: ${tag.label}');
      }
    });

    testWidgets('submit button shows "Create Entry" text', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(find.text('Create Entry'), findsOneWidget);
    });

    testWidgets('submit button is disabled when title is empty', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      expect(_submitButton(tester).onPressed, isNull);
    });

    testWidgets('submit button is enabled after entering a title', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      await tester.enterText(
        find.widgetWithText(TextField, 'What happened in this session?'),
        'My session today',
      );
      await tester.pump();

      expect(_submitButton(tester).onPressed, isNotNull);
    });

    testWidgets('tapping an emotion chip selects it without crashing', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      await tester.tap(find.text(EmotionTag.calm.label).first);
      await tester.pump();

      // Chip still visible — no crash
      expect(find.text(EmotionTag.calm.label), findsAtLeastNWidgets(1));
    });

    testWidgets('submit calls createEntry with title and selected emotion', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      await tester.enterText(
        find.widgetWithText(TextField, 'What happened in this session?'),
        'My trade session',
      );
      await tester.pump();

      await tester.tap(find.text(EmotionTag.confident.label).first);
      await tester.pump();

      await tester.tap(find.byType(ElevatedButton), warnIfMissed: false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(notifier.lastCreatedData, isNotNull);
      expect(notifier.lastCreatedData!['title'], equals('My trade session'));
      expect(notifier.lastCreatedData!['emotion'], equals(EmotionTag.confident.name));
    });

    testWidgets('shows inline error message when createEntry throws', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier()..shouldThrow = true;
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      await tester.enterText(
        find.widgetWithText(TextField, 'What happened in this session?'),
        'Error session',
      );
      await tester.pump();

      await tester.tap(find.byType(ElevatedButton), warnIfMissed: false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Failed to save entry. Please try again.'), findsOneWidget);
    });
  });

  group('JournalEntryForm — edit mode', () {
    testWidgets('renders "Edit Entry" header in edit mode', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(entry: _makeEntry(), notifier: notifier));
      await tester.pump();

      expect(find.text('Edit Entry'), findsOneWidget);
    });

    testWidgets('pre-populates title from existing entry', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      final entry = _makeEntry(title: 'Existing entry title');
      await tester.pumpWidget(_buildWidget(entry: entry, notifier: notifier));
      await tester.pump();

      expect(find.text('Existing entry title'), findsOneWidget);
    });

    testWidgets('pre-populates content from existing entry', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      final entry = _makeEntry(content: 'Detailed notes here');
      await tester.pumpWidget(_buildWidget(entry: entry, notifier: notifier));
      await tester.pump();

      expect(find.text('Detailed notes here'), findsOneWidget);
    });

    testWidgets('submit button shows "Save Changes" text in edit mode', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(entry: _makeEntry(), notifier: notifier));
      await tester.pump();

      expect(find.text('Save Changes'), findsOneWidget);
    });

    testWidgets('submit button is enabled when title is pre-populated', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      final entry = _makeEntry(title: 'Pre-existing title');
      await tester.pumpWidget(_buildWidget(entry: entry, notifier: notifier));
      await tester.pump();

      expect(_submitButton(tester).onPressed, isNotNull);
    });

    testWidgets('submit calls updateEntry with the entry id', (tester) async {
      _setLargeViewport(tester);
      const entryId = 'test-entry-id-0000-000000000001';
      final notifier = _MockJournalNotifier();
      final entry = _makeEntry(id: entryId);
      await tester.pumpWidget(_buildWidget(entry: entry, notifier: notifier));
      await tester.pump();

      await tester.tap(find.byType(ElevatedButton), warnIfMissed: false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(notifier.lastUpdatedId, equals(entryId));
    });
  });

  group('JournalEntryForm — validation edge cases', () {
    testWidgets('submit transitions disabled → enabled after typing title', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      // Initially disabled
      expect(_submitButton(tester).onPressed, isNull,
          reason: 'Button must be disabled with empty title');

      // Enter a title
      await tester.enterText(
        find.widgetWithText(TextField, 'What happened in this session?'),
        'A valid title',
      );
      await tester.pump();

      // Now enabled
      expect(_submitButton(tester).onPressed, isNotNull,
          reason: 'Button must be enabled after title is filled');
    });

    testWidgets('tapping same emotion chip twice does not crash (toggle off)', (tester) async {
      _setLargeViewport(tester);
      final notifier = _MockJournalNotifier();
      await tester.pumpWidget(_buildWidget(notifier: notifier));
      await tester.pump();

      await tester.tap(find.text(EmotionTag.anxious.label).first);
      await tester.pump();
      await tester.tap(find.text(EmotionTag.anxious.label).first);
      await tester.pump();

      expect(find.text(EmotionTag.anxious.label), findsAtLeastNWidgets(1));
    });
  });
}
