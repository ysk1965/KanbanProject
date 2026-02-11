import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Clock, Loader2, Tag as TagIcon, Sparkles } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { NoteEditorToolbar } from './NoteEditorToolbar';
import { NoteTagManager } from './NoteTagManager';
import { NoteVersionHistory } from './NoteVersionHistory';
import { NoteAIInlineSection } from './NoteAIInlineSection';
import { formatDateTime } from '../../utils/dateUtils';
import { fileAPI, noteAPI } from '../../utils/api';
import type { NoteDetail, NoteTagInfo, NoteAISuggestionResponse } from '../../utils/api';

const AUTO_SAVE_DELAY = 30_000; // 30 seconds

interface NoteEditorProps {
  boardId: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  loading: boolean;
  canEdit: boolean;
  onSave: (noteId: string, data: { title?: string; content?: string; tagIds?: string[] }, createVersion?: boolean) => void;
  onTagsChange: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function NoteEditor({ boardId, note, tags, loading, canEdit, onSave, onTagsChange, onDirtyChange }: NoteEditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const noteIdRef = useRef(note.id);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI state
  const [aiData, setAiData] = useState<NoteAISuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiContentSnapshot, setAiContentSnapshot] = useState<string | null>(note.aiContentSnapshot);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: t('notes.contentPlaceholder', '내용을 입력하세요...') }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: note.content || '',
    editable: canEdit,
    onUpdate: () => {
      setHasChanges(true);
      setAutoSaved(false);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[400px] px-6 py-4',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleClipboardImage(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Clipboard image upload handler
  const handleClipboardImage = useCallback(async (file: File) => {
    if (!editor) return;
    try {
      const result = await fileAPI.smartUpload(file);
      if (result.previewUrl) {
        editor.chain().focus().setImage({ src: result.previewUrl }).run();
      }
    } catch (err) {
      console.error('Clipboard image upload failed:', err);
    }
  }, [editor]);

  // Notify parent about dirty state
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  // Reset when note changes
  useEffect(() => {
    if (note.id !== noteIdRef.current) {
      noteIdRef.current = note.id;
      setTitle(note.title);
      setHasChanges(false);
      setAutoSaved(false);
      if (editor) {
        editor.commands.setContent(note.content || '');
      }
      // Reset AI state
      setAiData(null);
      setAiLoading(false);
      setAiError(null);
      setAiVisible(false);
      setAiCollapsed(false);
      setAiContentSnapshot(note.aiContentSnapshot);

      // Load saved AI suggestions if available
      if (note.aiSuggestions) {
        try {
          const parsed = JSON.parse(note.aiSuggestions);
          setAiData(parsed);
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [note.id, note.title, note.content, note.aiSuggestions, note.aiContentSnapshot, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
    setAutoSaved(false);
  };

  // Manual save (creates version)
  const handleSave = useCallback(async () => {
    if (!hasChanges || !canEdit || !editor) return;
    setSaving(true);
    try {
      const html = editor.getHTML();
      await onSave(note.id, {
        title: title !== note.title ? title : undefined,
        content: html,
        tagIds: note.tags.map(t => t.id),
      }, true);
      setHasChanges(false);
      setAutoSaved(false);
    } finally {
      setSaving(false);
    }
  }, [hasChanges, canEdit, editor, onSave, note.id, note.title, title, note.tags]);

  // Auto-save (no version creation)
  const handleAutoSave = useCallback(async () => {
    if (!hasChanges || !canEdit || !editor) return;
    try {
      const html = editor.getHTML();
      await onSave(note.id, {
        title: title !== note.title ? title : undefined,
        content: html,
        tagIds: note.tags.map(t => t.id),
      }, false);
      setHasChanges(false);
      setAutoSaved(true);
    } catch {
      // Silently fail auto-save
    }
  }, [hasChanges, canEdit, editor, onSave, note.id, note.title, title, note.tags]);

  // Auto-save timer: reset on every change
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (hasChanges && canEdit) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, AUTO_SAVE_DELAY);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasChanges, canEdit, handleAutoSave]);

  // AI: check if content has changed since last AI organize
  const isAIDimmed = useCallback(() => {
    if (!aiContentSnapshot || !aiData) return false;
    const currentContent = editor?.getHTML() || note.content || '';
    return currentContent === aiContentSnapshot;
  }, [aiContentSnapshot, aiData, editor, note.content]);

  // AI: handle organize
  const handleAIOrganize = useCallback(async () => {
    if (aiLoading) return;

    // Check if content changed since last AI organize
    if (isAIDimmed()) {
      // Just show existing suggestions
      setAiVisible(true);
      setAiCollapsed(false);
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiVisible(true);
    setAiCollapsed(false);
    try {
      const lang = navigator.language?.split('-')[0] || 'ko';
      const data = await noteAPI.aiOrganize(boardId, note.id, lang);
      setAiData(data);
      // Save snapshot of current content
      const currentContent = editor?.getHTML() || note.content || '';
      setAiContentSnapshot(currentContent);
    } catch {
      setAiError(t('notes.aiError'));
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, isAIDimmed, boardId, note.id, note.content, editor, t]);

  const handleAIClose = useCallback(() => {
    setAiCollapsed(true);
  }, []);

  const handleAIExpand = useCallback(() => {
    setAiCollapsed(false);
  }, []);

  // Keyboard shortcut: Ctrl+S to save (manual, with version)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (note.type === 'FOLDER') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <p className="text-sm">{t('notes.folderSelected', '폴더가 선택되었습니다')}</p>
        <p className="text-xs mt-1 text-slate-600">{t('notes.folderHint', '문서를 선택하여 편집하세요')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-transparent text-lg font-bold text-white focus:outline-none placeholder-slate-600"
            placeholder={t('notes.titlePlaceholder', '제목을 입력하세요')}
            readOnly={!canEdit}
          />
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  <TagIcon size={8} />
                  {tag.name}
                </span>
              ))}
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock size={10} />
              {formatDateTime(note.updatedAt)}
              {note.updatedBy && ` · ${note.updatedBy.name}`}
            </span>
            {autoSaved && (
              <span className="text-[10px] text-emerald-500/70">
                {t('notes.autoSaved', '자동 저장됨')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <NoteTagManager
            boardId={boardId}
            noteId={note.id}
            noteTags={note.tags}
            allTags={tags}
            canEdit={canEdit}
            onSave={(tagIds) => onSave(note.id, { tagIds })}
            onTagsChange={onTagsChange}
          />
          <NoteVersionHistory
            boardId={boardId}
            noteId={note.id}
            versionCount={note.versionCount}
            canEdit={canEdit}
            onRestore={async () => {
              // Reload note after restore
              const { noteService } = await import('../../utils/services');
              const updated = await noteService.getDetail(boardId, note.id);
              if (editor && updated.content) {
                editor.commands.setContent(updated.content);
              }
              setTitle(updated.title);
              setHasChanges(false);
              setAutoSaved(false);
            }}
          />
          {canEdit && (note.content?.trim()) && (
            <button
              onClick={handleAIOrganize}
              disabled={aiLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-1 disabled:opacity-50 ${
                isAIDimmed()
                  ? 'text-slate-500 bg-white/5 cursor-default'
                  : 'text-bridge-secondary bg-bridge-secondary/10 hover:bg-bridge-secondary/20'
              }`}
            >
              {aiLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {t('notes.aiOrganize')}
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ml-1 ${
                hasChanges
                  ? 'bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed'
              }`}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {t('common.save', '저장')}
              {hasChanges && <span className="text-[10px] opacity-70">⌘S</span>}
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      {canEdit && <NoteEditorToolbar editor={editor} />}

      {/* TipTap Editor Content + AI Section */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />

        {/* AI Inline Section */}
        {aiVisible && (
          <div className="px-6 pb-6">
            {aiCollapsed && !aiLoading ? (
              <div className="mt-4 flex items-center justify-between bg-white/[0.02] rounded-xl border border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-bridge-accent" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('notes.aiOrganizeTitle')}
                  </span>
                </div>
                <button
                  onClick={handleAIExpand}
                  className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
                >
                  {t('notes.aiExpand')}
                </button>
              </div>
            ) : (
              <NoteAIInlineSection
                boardId={boardId}
                noteId={note.id}
                loading={aiLoading}
                error={aiError}
                suggestions={aiData}
                onRetry={handleAIOrganize}
                onClose={handleAIClose}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
