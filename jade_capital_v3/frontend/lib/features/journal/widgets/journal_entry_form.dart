import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/journal_entry.dart';
import '../providers/journal_provider.dart';
import 'emotion_filter_bar.dart';
import 'trade_multi_select.dart';

/// Bottom-sheet form for creating or editing a journal entry.
///
/// Pass [entry] to pre-populate for edit mode; omit (or null) for create.
///
/// State is entirely ephemeral — discarded when the sheet closes.
/// Uses [ConsumerStatefulWidget] so [ref] is available without parameter
/// threading (preferred Riverpod pattern for stateful bottom sheets).
class JournalEntryForm extends ConsumerStatefulWidget {
  const JournalEntryForm({super.key, this.entry});

  /// Existing entry for edit mode; null for create.
  final JournalEntry? entry;

  @override
  ConsumerState<JournalEntryForm> createState() => _JournalEntryFormState();
}

class _JournalEntryFormState extends ConsumerState<JournalEntryForm> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _contentCtrl;
  late final TextEditingController _tagInputCtrl;

  EmotionTag? _selectedEmotion;
  List<String> _selectedTradeIds = [];
  List<String> _tags = [];

  bool _isSubmitting = false;
  String? _errorMessage;
  bool _showTradePicker = false;

  bool get _isEdit => widget.entry != null;

  @override
  void initState() {
    super.initState();
    final e = widget.entry;
    _titleCtrl = TextEditingController(text: e?.title ?? '');
    _contentCtrl = TextEditingController(text: e?.content ?? '');
    _tagInputCtrl = TextEditingController();
    _selectedEmotion = e?.emotion;
    _selectedTradeIds = List<String>.from(e?.tradeIds ?? []);
    _tags = List<String>.from(e?.tags ?? []);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _contentCtrl.dispose();
    _tagInputCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final data = <String, dynamic>{
      'title': title,
      if (_contentCtrl.text.trim().isNotEmpty)
        'content': _contentCtrl.text.trim(),
      if (_selectedEmotion != null) 'emotion': _selectedEmotion!.name,
      if (_selectedTradeIds.isNotEmpty) 'tradeIds': _selectedTradeIds,
      if (_tags.isNotEmpty) 'tags': _tags,
    };

    try {
      final notifier = ref.read(journalProvider.notifier);
      if (_isEdit) {
        await notifier.updateEntry(widget.entry!.id, data);
      } else {
        await notifier.createEntry(data);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to save entry. Please try again.';
        _isSubmitting = false;
      });
    }
  }

  void _addTag(String value) {
    final tag = value.trim();
    if (tag.isEmpty || _tags.contains(tag)) return;
    setState(() {
      _tags.add(tag);
      _tagInputCtrl.clear();
    });
  }

  void _removeTag(String tag) {
    setState(() => _tags.remove(tag));
  }

  @override
  Widget build(BuildContext context) {
    final titleEmpty = _titleCtrl.text.trim().isEmpty;

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // ── Drag handle ──
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // ── Sheet header ──
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(
                  children: [
                    Text(
                      _isEdit ? 'Edit Entry' : 'New Entry',
                      style: GoogleFonts.orbitron(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      color: AppColors.textMuted,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),

              const Divider(height: 1, color: AppColors.divider),

              // ── Scrollable form body ──
              Expanded(
                child: ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  children: [
                    // Title
                    TextField(
                      controller: _titleCtrl,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Title *',
                        hintText: 'What happened in this session?',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                      ),
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}), // rebuild for disabled button
                    ),
                    const SizedBox(height: 16),

                    // Content
                    TextField(
                      controller: _contentCtrl,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Notes',
                        hintText: 'Describe your trading session...',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textMuted,
                        ),
                        alignLabelWithHint: true,
                      ),
                      maxLines: null,
                      minLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                    ),
                    const SizedBox(height: 20),

                    // Emotion picker
                    Text(
                      'How did you feel?',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _EmotionChipPicker(
                      selected: _selectedEmotion,
                      onChanged: (tag) =>
                          setState(() => _selectedEmotion = tag),
                    ),
                    const SizedBox(height: 20),

                    // Tags
                    Text(
                      'Tags',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _TagInput(
                      ctrl: _tagInputCtrl,
                      tags: _tags,
                      onAdd: _addTag,
                      onRemove: _removeTag,
                    ),
                    const SizedBox(height: 20),

                    // Trade link (collapsible)
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () =>
                          setState(() => _showTradePicker = !_showTradePicker),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Text(
                              'Link Trades',
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            if (_selectedTradeIds.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  '${_selectedTradeIds.length}',
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ),
                            ],
                            const Spacer(),
                            Icon(
                              _showTradePicker
                                  ? Icons.expand_less
                                  : Icons.expand_more,
                              color: AppColors.textMuted,
                              size: 20,
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_showTradePicker) ...[
                      const SizedBox(height: 8),
                      Container(
                        decoration: BoxDecoration(
                          color: AppColors.cardBackground,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.border),
                        ),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        child: TradeMultiSelect(
                          selectedIds: _selectedTradeIds,
                          onChanged: (ids) =>
                              setState(() => _selectedTradeIds = ids),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),

                    // Error message
                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.danger.withValues(alpha: 0.4)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline,
                                color: AppColors.danger, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  color: AppColors.danger,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Submit button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: (titleEmpty || _isSubmitting)
                            ? null
                            : _submit,
                        child: _isSubmitting
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation(
                                      AppColors.background),
                                ),
                              )
                            : Text(
                                _isEdit ? 'Save Changes' : 'Create Entry',
                                style: GoogleFonts.inter(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Emotion Chip Picker ──

/// Single-select, deselectable row of emotion chips for the form.
class _EmotionChipPicker extends StatelessWidget {
  const _EmotionChipPicker({
    required this.selected,
    required this.onChanged,
  });

  final EmotionTag? selected;
  final ValueChanged<EmotionTag?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: EmotionTag.values.map((tag) {
        final isSelected = selected == tag;
        final color = emotionColor(tag);
        return GestureDetector(
          onTap: () => onChanged(isSelected ? null : tag),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: isSelected
                  ? color
                  : color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: color.withValues(alpha: isSelected ? 1 : 0.4),
              ),
            ),
            child: Text(
              tag.label,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight:
                    isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? AppColors.background : color,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Tag Input ──

/// Text field + chip list for adding/removing freeform tags.
class _TagInput extends StatelessWidget {
  const _TagInput({
    required this.ctrl,
    required this.tags,
    required this.onAdd,
    required this.onRemove,
  });

  final TextEditingController ctrl;
  final List<String> tags;
  final ValueChanged<String> onAdd;
  final ValueChanged<String> onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Existing tags
        if (tags.isNotEmpty) ...[
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: tags.map((tag) {
              return Chip(
                label: Text(
                  tag,
                  style: GoogleFonts.inter(
                      fontSize: 11, color: AppColors.textPrimary),
                ),
                backgroundColor:
                    AppColors.primary.withValues(alpha: 0.12),
                side: const BorderSide(
                    color: AppColors.primary, width: 0.5),
                deleteIconColor: AppColors.textMuted,
                onDeleted: () => onRemove(tag),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 4),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
        ],
        // Tag input field
        TextField(
          controller: ctrl,
          style: GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textPrimary,
          ),
          decoration: InputDecoration(
            hintText: 'Add tag and press Enter',
            hintStyle:
                GoogleFonts.inter(fontSize: 13, color: AppColors.textMuted),
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 12, vertical: 10),
            suffixIcon: IconButton(
              icon: const Icon(Icons.add, size: 18),
              color: AppColors.primary,
              onPressed: () => onAdd(ctrl.text),
            ),
          ),
          textCapitalization: TextCapitalization.none,
          onSubmitted: onAdd,
        ),
      ],
    );
  }
}
