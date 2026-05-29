import 'dart:math';

/// Emotion tags for journal entries.
///
/// Seven fixed values matching the backend `EmotionTag` enum.
/// [fromString] returns null on unknown values — no throw.
enum EmotionTag {
  happy,
  frustrated,
  confident,
  anxious,
  calm,
  greedy,
  fearful;

  /// Human-readable label with capitalised first letter.
  String get label => name[0].toUpperCase() + name.substring(1);

  /// Safe factory: returns null instead of throwing on unknown values.
  static EmotionTag? fromString(String? value) {
    if (value == null) return null;
    try {
      return EmotionTag.values.firstWhere((e) => e.name == value);
    } catch (_) {
      return null;
    }
  }
}

/// A single journal entry.
///
/// Numeric fields use [double.tryParse] to guard against the API returning
/// numeric strings instead of native doubles (lesson from Sprint 2).
class JournalEntry {
  const JournalEntry({
    required this.id,
    required this.title,
    this.content,
    this.emotion,
    this.tradeIds,
    this.tags,
    required this.createdAt,
    required this.updatedAt,
  });

  factory JournalEntry.fromJson(Map<String, dynamic> json) => JournalEntry(
        id: json['id'] as String,
        title: json['title'] as String,
        content: json['content'] as String?,
        emotion: EmotionTag.fromString(json['emotion'] as String?),
        tradeIds: (json['tradeIds'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
        tags: (json['tags'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );

  final String id;
  final String title;
  final String? content;
  final EmotionTag? emotion;
  final List<String>? tradeIds;
  final List<String>? tags;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        if (content != null) 'content': content,
        if (emotion != null) 'emotion': emotion!.name,
        if (tradeIds != null) 'tradeIds': tradeIds,
        if (tags != null) 'tags': tags,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  /// Short content preview capped at [maxLength] characters.
  String? contentPreview({int maxLength = 100}) {
    if (content == null || content!.isEmpty) return null;
    final len = min(maxLength, content!.length);
    final preview = content!.substring(0, len);
    return content!.length > maxLength ? '$preview...' : preview;
  }
}
