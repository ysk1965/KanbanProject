import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Clock, Loader2, Tag as TagIcon, Sparkles, Share2, Link2, Check, X, MessageSquare } from 'lucide-react';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlock } from '@blocknote/core';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems, TableHandlesController } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import { NoteTagManager } from './NoteTagManager';
import { NoteVersionHistory } from './NoteVersionHistory';
import { NoteAIInlineSection } from './NoteAIInlineSection';
import { NoteCommentSidebar } from './NoteCommentSidebar';
import { CollabPresence } from './CollabPresence';
import { useAuth } from '../../contexts/AuthContext';
import { Callout } from './blocks/Callout';
import { Toggle } from './blocks/Toggle';
import { Divider } from './blocks/Divider';
import { TableOfContents } from './blocks/TableOfContents';
import { Embed } from './blocks/Embed';
import { ColumnLayout, Column } from './blocks/ColumnLayout';
import { Mention } from './blocks/Mention';
import { formatDateTime } from '../../utils/dateUtils';
import { fileAPI, noteAPI, memberAPI } from '../../utils/api';
import type { NoteDetail, NoteTagInfo, NoteAISuggestionResponse, MemberResponse } from '../../utils/api';
import { NoteShareButton } from './NoteShareButton';
import { NoteBottomComments } from './NoteBottomComments';
import type { CollaborationState } from '../../hooks/useCollaboration';

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout,
    toggle: Toggle,
    divider: Divider,
    tableOfContents: TableOfContents,
    embed: Embed,
    columnLayout: ColumnLayout,
    column: Column,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
  },
});

interface NoteEditorProps {
  boardId: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  loading: boolean;
  canEdit: boolean;
  onSave: (noteId: string, data: { title?: string; content?: string; tagIds?: string[] }, createVersion?: boolean) => void;
  onTagsChange: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
}

export function NoteEditor({
  boardId, note, tags, loading, canEdit, onSave, onTagsChange, onDirtyChange, onNoteUpdate,
  collaboration, currentUserName, currentUserColor,
}: NoteEditorProps) {
  // Show brief loading while collaboration provider initializes
  if (loading || (collaboration && collaboration.status === 'connecting' && !collaboration.provider)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (note.type === 'FOLDER') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <p className="text-sm">{/* Folder selected */}폴더가 선택되었습니다</p>
        <p className="text-xs mt-1 text-slate-600">문서를 선택하여 편집하세요</p>
      </div>
    );
  }

  if (collaboration) {
    return (
      <CollabNoteEditor
        boardId={boardId}
        note={note}
        tags={tags}
        canEdit={canEdit}
        onSave={onSave}
        onTagsChange={onTagsChange}
        onDirtyChange={onDirtyChange}
        onNoteUpdate={onNoteUpdate}
        collaboration={collaboration}
        currentUserName={currentUserName}
        currentUserColor={currentUserColor}
      />
    );
  }

  // Fallback: non-collaborative mode (shouldn't normally happen)
  return (
    <FallbackNoteEditor
      boardId={boardId}
      note={note}
      tags={tags}
      canEdit={canEdit}
      onSave={onSave}
      onTagsChange={onTagsChange}
      onDirtyChange={onDirtyChange}
    />
  );
}

/* ============================================================
 * Collaborative Editor (Yjs-powered)
 * ============================================================ */

interface CollabEditorProps {
  boardId: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (noteId: string, data: { title?: string; content?: string; tagIds?: string[] }, createVersion?: boolean) => void;
  onTagsChange: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState;
  currentUserName: string;
  currentUserColor: string;
}

function CollabNoteEditor({
  boardId, note, tags, canEdit, onSave, onTagsChange, onDirtyChange, onNoteUpdate,
  collaboration, currentUserName, currentUserColor,
}: CollabEditorProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Comment state
  const [showComments, setShowComments] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [commentBlockIds, setCommentBlockIds] = useState<Set<string>>(new Set());
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{ id: string; top: number } | null>(null);
  const hoveredBlockIdRef = useRef<string | null>(null);
  const commentsPanelRef = useRef<HTMLDivElement>(null);

  // AI state
  const [aiData, setAiData] = useState<NoteAISuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiContentSnapshot, setAiContentSnapshot] = useState<string | null>(note.ai_content_snapshot);

  // Create BlockNote editor with Yjs collaboration
  const editor = useCreateBlockNote({
    schema,
    collaboration: {
      provider: collaboration.provider,
      fragment: collaboration.fragment,
      user: {
        name: currentUserName,
        color: currentUserColor,
      },
    },
    uploadFile: async (file: File) => {
      const result = await fileAPI.smartUpload(file);
      return result.previewUrl || '';
    },
    tables: {
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
      splitCells: true,
    },
  } as any, [collaboration.fragment]);

  // Sync title when note changes
  useEffect(() => {
    setTitle(note.title);
    setHasChanges(false);

    // Reset AI state
    setAiData(null);
    setAiLoading(false);
    setAiError(null);
    setAiVisible(false);
    setAiCollapsed(false);
    setAiContentSnapshot(note.ai_content_snapshot);
    if (note.ai_suggestions) {
      try { setAiData(JSON.parse(note.ai_suggestions)); } catch { /* ignore */ }
    }
  }, [note.id]);

  // Slash menu items
  const slashMenuItems = useMemo(() => [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: 'Callout',
      subtext: 'Highlighted callout box',
      onItemClick: () => insertOrUpdateBlock(editor, { type: 'callout' as any }),
      aliases: ['callout', 'panel', 'info', 'warning', 'notice'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'ℹ️'}</span>,
    },
    {
      title: 'Toggle List',
      subtext: 'Collapsible toggle list',
      onItemClick: () => insertOrUpdateBlock(editor, { type: 'toggle' as any }),
      aliases: ['toggle', 'collapsible', 'dropdown', 'accordion'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'▶'}</span>,
    },
    {
      title: 'Divider',
      subtext: 'Horizontal divider line',
      onItemClick: () => insertOrUpdateBlock(editor, { type: 'divider' as any }),
      aliases: ['divider', 'separator', 'hr', 'line'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'—'}</span>,
    },
    {
      title: 'Table of Contents',
      subtext: 'Auto-generated from headings',
      onItemClick: () => insertOrUpdateBlock(editor, { type: 'tableOfContents' as any }),
      aliases: ['toc', 'table of contents', 'outline', 'index'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'📑'}</span>,
    },
    {
      title: 'Embed',
      subtext: 'YouTube, Vimeo, or any link',
      onItemClick: () => insertOrUpdateBlock(editor, { type: 'embed' as any }),
      aliases: ['embed', 'youtube', 'vimeo', 'bookmark', 'link card', 'iframe'],
      group: 'Media',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'🔗'}</span>,
    },
    {
      title: '2 Columns',
      subtext: 'Side-by-side layout',
      onItemClick: () => insertOrUpdateBlock(editor, {
        type: 'columnLayout' as any,
        props: { columns: 2 },
        children: [
          { type: 'column' as any, children: [{ type: 'paragraph' }] },
          { type: 'column' as any, children: [{ type: 'paragraph' }] },
        ],
      }),
      aliases: ['columns', '2columns', 'two columns', 'layout', 'side by side'],
      group: 'Advanced',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'▥'}</span>,
    },
    {
      title: '3 Columns',
      subtext: 'Three-column layout',
      onItemClick: () => insertOrUpdateBlock(editor, {
        type: 'columnLayout' as any,
        props: { columns: 3 },
        children: [
          { type: 'column' as any, children: [{ type: 'paragraph' }] },
          { type: 'column' as any, children: [{ type: 'paragraph' }] },
          { type: 'column' as any, children: [{ type: 'paragraph' }] },
        ],
      }),
      aliases: ['3columns', 'three columns', 'triple'],
      group: 'Advanced',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'▦'}</span>,
    },
    {
      title: 'Table',
      subtext: 'Insert a table',
      onItemClick: () => {
        insertOrUpdateBlock(editor, { type: 'table' as any });
      },
      aliases: ['table', 'grid', '표', '테이블'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'📊'}</span>,
    },
  ], [editor]);

  // @mention: lazy-fetch board members
  const membersCache = useRef<MemberResponse[] | null>(null);
  const getMentionItems = useCallback(async (query: string) => {
    if (!membersCache.current) {
      try {
        const data = await memberAPI.getMembers(boardId);
        membersCache.current = data.members;
      } catch {
        membersCache.current = [];
      }
    }
    const items = (membersCache.current || []).map((m) => ({
      title: m.user.name,
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'mention' as any, props: { user: m.user.name } },
          ' ',
        ]);
      },
      aliases: [m.user.email],
      group: 'Members',
      icon: m.user.profile_image
        ? <img src={m.user.profile_image} alt="" className="bn-mention-avatar" />
        : <span className="bn-mention-avatar-fallback">{m.user.name.charAt(0)}</span>,
    }));
    return filterSuggestionItems(items, query);
  }, [boardId, editor]);

  // Notify parent about dirty state
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleEditorChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Get HTML content from current editor state
  const getContentHTML = useCallback(async (): Promise<string> => {
    return await editor.blocksToHTMLLossy(editor.document);
  }, [editor]);

  // Manual save: persist Yjs state + create HTML version snapshot
  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      // 1. Persist Yjs binary state via WebSocket
      collaboration.provider.sendFullState();
      // 2. Create HTML version snapshot via REST API
      const html = await getContentHTML();
      await onSave(note.id, {
        title: title !== note.title ? title : undefined,
        content: html,
        tagIds: note.tags.map(t => t.id),
      }, true);
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  }, [canEdit, collaboration.provider, getContentHTML, onSave, note.id, note.title, title, note.tags]);

  // Keyboard shortcut: Ctrl/Cmd+S
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

  // Block hover detection for comment button
  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const blockEl = target.closest('[data-id]') as HTMLElement;
    if (!blockEl || !editorContainerRef.current) {
      if (hoveredBlockIdRef.current) {
        hoveredBlockIdRef.current = null;
        setHoveredBlock(null);
      }
      return;
    }
    const id = blockEl.getAttribute('data-id');
    if (!id || id === hoveredBlockIdRef.current) return;
    hoveredBlockIdRef.current = id;
    const containerRect = editorContainerRef.current.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    setHoveredBlock({ id, top: blockRect.top - containerRect.top });
  }, []);

  const handleAddBlockComment = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    setShowComments(true);
    setTimeout(() => {
      commentsPanelRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // CSS for block comment indicators
  const blockIndicatorStyle = useMemo(() => {
    if (commentBlockIds.size === 0) return null;
    const selectors = Array.from(commentBlockIds)
      .map(id => `[data-id="${id}"]`)
      .join(', ');
    return `${selectors} { border-left: 3px solid rgba(99, 102, 241, 0.4) !important; padding-left: 8px; }`;
  }, [commentBlockIds]);

  // AI: check if content has changed since last AI organize
  const isAIDimmed = useCallback(() => {
    if (!aiContentSnapshot || !aiData) return false;
    return aiContentSnapshot === note.content;
  }, [aiContentSnapshot, aiData, note.content]);

  const handleAIOrganize = useCallback(async () => {
    if (aiLoading) return;
    if (isAIDimmed()) {
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
      setAiContentSnapshot(note.content || '');
    } catch {
      setAiError(t('notes.aiError'));
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, isAIDimmed, boardId, note.id, note.content, t]);

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
              {formatDateTime(note.updated_at)}
              {note.updated_by && ` · ${note.updated_by.name}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Collaboration presence */}
          <CollabPresence
            status={collaboration.status}
            connectedUsers={collaboration.connectedUsers}
            currentUserName={currentUserName}
            currentUserColor={currentUserColor}
          />

          <NoteShareButton
            boardId={boardId}
            note={note}
            canEdit={canEdit}
            onNoteUpdate={onNoteUpdate}
          />

          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showComments
                ? 'text-bridge-accent bg-bridge-accent/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title={t('notes.comment.title', '댓글')}
          >
            <MessageSquare size={14} />
            <span className="hidden sm:inline">{t('notes.comment.title', '댓글')}</span>
          </button>

          <div className="w-px h-5 bg-white/10" />

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
            versionCount={note.version_count}
            canEdit={canEdit}
            onRestore={async () => {
              // After restoring, refetch and let the provider sync
              const { noteService } = await import('../../utils/services');
              const updated = await noteService.getDetail(boardId, note.id);
              setTitle(updated.title);
              setHasChanges(false);
            }}
          />
          {canEdit && (note.content?.trim()) && (
            <div className="flex items-center gap-2 ml-1">
              <button
                onClick={handleAIOrganize}
                disabled={aiLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
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
            </div>
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

      {/* BlockNote Editor + AI Section + Bottom Comments */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Block comment indicator CSS */}
        {blockIndicatorStyle && <style>{blockIndicatorStyle}</style>}

        {/* Editor with block hover overlay */}
        <div
          ref={editorContainerRef}
          className="relative min-h-[60vh] bg-bridge-obsidian rounded-2xl border border-white/5"
          onMouseMove={handleEditorMouseMove}
          onMouseLeave={() => {
            hoveredBlockIdRef.current = null;
            setHoveredBlock(null);
          }}
        >
          <BlockNoteView
            editor={editor}
            theme="dark"
            editable={canEdit}
            onChange={handleEditorChange}
          >
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
            />
            <SuggestionMenuController
              triggerCharacter="@"
              getItems={getMentionItems}
            />
            <TableHandlesController />
          </BlockNoteView>

          {/* Floating block comment button */}
          {hoveredBlock && (
            <button
              className="absolute right-2 z-10 p-1.5 rounded-lg bg-bridge-dark border border-white/10 text-slate-500 hover:text-bridge-accent hover:border-bridge-accent/30 transition-all shadow-lg"
              style={{ top: hoveredBlock.top + 2 }}
              onClick={() => handleAddBlockComment(hoveredBlock.id)}
              onMouseDown={(e) => e.preventDefault()}
              title={t('notes.comment.addToBlock', '이 블록에 댓글 달기')}
            >
              <MessageSquare size={14} />
              {commentBlockIds.has(hoveredBlock.id) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-bridge-accent rounded-full border-2 border-bridge-dark" />
              )}
            </button>
          )}
        </div>

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
                  onClick={() => setAiCollapsed(false)}
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
                onClose={() => setAiCollapsed(true)}
              />
            )}
          </div>
        )}

        {/* Block/Thread Comments Panel (toggled) */}
        {showComments && currentUser && (
          <div ref={commentsPanelRef}>
            <NoteCommentSidebar
              boardId={boardId}
              noteId={note.id}
              currentUserId={currentUser.id}
              canEdit={canEdit}
              onClose={() => { setShowComments(false); setActiveBlockId(null); }}
              activeBlockId={activeBlockId}
              onBlockIdsChange={setCommentBlockIds}
            />
          </div>
        )}

        {/* Bottom Confluence-style Comments Panel (always visible) */}
        {currentUser && (
          <NoteBottomComments
            boardId={boardId}
            noteId={note.id}
            currentUserId={currentUser.id}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Fallback Editor (non-collaborative, original behavior)
 * ============================================================ */

interface FallbackEditorProps {
  boardId: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (noteId: string, data: { title?: string; content?: string; tagIds?: string[] }, createVersion?: boolean) => void;
  onTagsChange: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

const AUTO_SAVE_DELAY = 30_000;

function FallbackNoteEditor({ boardId, note, tags, canEdit, onSave, onTagsChange, onDirtyChange }: FallbackEditorProps) {
  const { t } = useTranslation();
  const { currentUser: fallbackCurrentUser } = useAuth();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const noteIdRef = useRef(note.id);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote({
    schema,
    uploadFile: async (file: File) => {
      const result = await fileAPI.smartUpload(file);
      return result.previewUrl || '';
    },
    tables: {
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
      splitCells: true,
    },
  } as any);

  const slashMenuItems = useMemo(() => [
    ...getDefaultReactSlashMenuItems(editor),
    // Same slash menu items as above (abbreviated for fallback)
    {
      title: 'Table',
      subtext: 'Insert a table',
      onItemClick: () => {
        insertOrUpdateBlock(editor, { type: 'table' as any });
      },
      aliases: ['table', 'grid', '표', '테이블'],
      group: 'Basic blocks',
      icon: <span style={{ fontSize: '14px', lineHeight: 1 }}>{'📊'}</span>,
    },
  ], [editor]);

  const membersCache = useRef<MemberResponse[] | null>(null);
  const getMentionItems = useCallback(async (query: string) => {
    if (!membersCache.current) {
      try {
        const data = await memberAPI.getMembers(boardId);
        membersCache.current = data.members;
      } catch { membersCache.current = []; }
    }
    const items = (membersCache.current || []).map((m) => ({
      title: m.user.name,
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'mention' as any, props: { user: m.user.name } },
          ' ',
        ]);
      },
      aliases: [m.user.email],
      group: 'Members',
      icon: m.user.profile_image
        ? <img src={m.user.profile_image} alt="" className="bn-mention-avatar" />
        : <span className="bn-mention-avatar-fallback">{m.user.name.charAt(0)}</span>,
    }));
    return filterSuggestionItems(items, query);
  }, [boardId, editor]);

  useEffect(() => {
    if (note.id !== noteIdRef.current) {
      noteIdRef.current = note.id;
      setTitle(note.title);
      setHasChanges(false);
      setAutoSaved(false);
      const loadContent = async () => {
        if (!note.content?.trim()) {
          editor.replaceBlocks(editor.document, []);
          return;
        }
        try {
          const blocks = await editor.tryParseHTMLToBlocks(note.content);
          editor.replaceBlocks(editor.document, blocks);
        } catch (err) {
          console.error('Failed to load note content:', err);
        }
      };
      loadContent();
    }
  }, [note.id, note.title, note.content, editor]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    if (!note.content?.trim()) return;
    const loadInitial = async () => {
      try {
        const blocks = await editor.tryParseHTMLToBlocks(note.content!);
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error('Failed to load initial content:', err);
      }
    };
    loadInitial();
  }, [editor, note.content]);

  useEffect(() => { onDirtyChange?.(hasChanges); }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const getContentHTML = useCallback(async (): Promise<string> => {
    return await editor.blocksToHTMLLossy(editor.document);
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!hasChanges || !canEdit) return;
    setSaving(true);
    try {
      const html = await getContentHTML();
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
  }, [hasChanges, canEdit, getContentHTML, onSave, note.id, note.title, title, note.tags]);

  const handleAutoSave = useCallback(async () => {
    if (!hasChanges || !canEdit) return;
    try {
      const html = await getContentHTML();
      await onSave(note.id, {
        title: title !== note.title ? title : undefined,
        content: html,
        tagIds: note.tags.map(t => t.id),
      }, false);
      setHasChanges(false);
      setAutoSaved(true);
    } catch { /* Silently fail */ }
  }, [hasChanges, canEdit, getContentHTML, onSave, note.id, note.title, title, note.tags]);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (hasChanges && canEdit) {
      autoSaveTimerRef.current = setTimeout(() => { handleAutoSave(); }, AUTO_SAVE_DELAY);
    }
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [hasChanges, canEdit, handleAutoSave]);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setHasChanges(true); setAutoSaved(false); }}
            className="w-full bg-transparent text-lg font-bold text-white focus:outline-none placeholder-slate-600"
            placeholder={t('notes.titlePlaceholder', '제목을 입력하세요')}
            readOnly={!canEdit}
          />
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock size={10} />
              {formatDateTime(note.updated_at)}
              {note.updated_by && ` · ${note.updated_by.name}`}
            </span>
            {autoSaved && (
              <span className="text-[10px] text-emerald-500/70">{t('notes.autoSaved', '자동 저장됨')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NoteTagManager boardId={boardId} noteId={note.id} noteTags={note.tags} allTags={tags} canEdit={canEdit} onSave={(tagIds) => onSave(note.id, { tagIds })} onTagsChange={onTagsChange} />
          <NoteVersionHistory boardId={boardId} noteId={note.id} versionCount={note.version_count} canEdit={canEdit} onRestore={async () => {
            const { noteService } = await import('../../utils/services');
            const updated = await noteService.getDetail(boardId, note.id);
            if (updated.content?.trim()) {
              try {
                const blocks = await editor.tryParseHTMLToBlocks(updated.content);
                editor.replaceBlocks(editor.document, blocks);
              } catch (err) { console.error('Failed to restore content:', err); }
            } else {
              editor.replaceBlocks(editor.document, []);
            }
            setTitle(updated.title);
            setHasChanges(false);
            setAutoSaved(false);
          }} />
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
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="min-h-[60vh] bg-bridge-obsidian rounded-2xl border border-white/5">
          <BlockNoteView editor={editor} theme="dark" editable={canEdit} onChange={() => { setHasChanges(true); setAutoSaved(false); }}>
            <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashMenuItems, query)} />
            <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
            <TableHandlesController />
          </BlockNoteView>
        </div>

        {/* Bottom Confluence-style Comments Panel */}
        {fallbackCurrentUser && (
          <NoteBottomComments
            boardId={boardId}
            noteId={note.id}
            currentUserId={fallbackCurrentUser.id}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
