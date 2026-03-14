import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, X, Loader2, Filter, ChevronDown, ChevronUp, Hash } from 'lucide-react';
import { noteCommentService } from '../../utils/services';
import { memberAPI } from '../../utils/api';
import { wsManager } from '../../utils/websocket';
import type { BoardWebSocketEvent } from '../../types';
import { NoteCommentThread } from './NoteCommentThread';
import { NoteCommentInput } from './NoteCommentInput';
import type { NoteCommentDetail, NoteCommentListResponse, MemberResponse } from '../../utils/api';

interface NoteCommentSidebarProps {
  boardId: string;
  noteId: string;
  currentUserId: string;
  canEdit: boolean;
  onClose: () => void;
  activeBlockId?: string | null;
  onBlockIdsChange?: (blockIds: Set<string>) => void;
}

export function NoteCommentSidebar({
  boardId, noteId, currentUserId, canEdit, onClose, activeBlockId,
  onBlockIdsChange,
}: NoteCommentSidebarProps) {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<NoteCommentDetail[]>([]);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewComment, setShowNewComment] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [collapsed, setCollapsed] = useState(false);
  const newCommentRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    try {
      const data: NoteCommentListResponse = await noteCommentService.getComments(boardId, noteId);
      setThreads(data.threads);
    } catch (err) {
      console.error('Failed to load note comments:', err);
    } finally {
      setLoading(false);
    }
  }, [boardId, noteId]);

  const loadMembers = useCallback(async () => {
    try {
      const data = await memberAPI.getMembers(boardId);
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  }, [boardId]);

  useEffect(() => {
    loadComments();
    loadMembers();
  }, [loadComments, loadMembers]);

  // ========== WebSocket: real-time comment sync ==========

  const NOTE_COMMENT_EVENTS = ['NOTE_COMMENT_CREATED', 'NOTE_COMMENT_UPDATED', 'NOTE_COMMENT_DELETED', 'NOTE_COMMENT_RESOLVED', 'NOTE_COMMENT_REACTION_TOGGLED'];

  useEffect(() => {
    const sub = wsManager.subscribe(`/topic/board/${boardId}`, (message) => {
      try {
        const event: BoardWebSocketEvent = JSON.parse(message.body);
        if (!NOTE_COMMENT_EVENTS.includes(event.type)) return;
        if (event.user_id === currentUserId) return;
        const data = event.data as { note_id?: string };
        if (data?.note_id !== noteId) return;
        loadComments();
      } catch { /* ignore */ }
    });
    return () => sub.unsubscribe();
  }, [boardId, noteId, currentUserId, loadComments]);

  // Emit block IDs with comments to parent
  useEffect(() => {
    if (!onBlockIdsChange) return;
    const blockIds = new Set(
      threads.filter(t => t.block_id).map(t => t.block_id!)
    );
    onBlockIdsChange(blockIds);
  }, [threads, onBlockIdsChange]);

  // When activeBlockId changes, open the new comment form
  const prevActiveBlockIdRef = useRef(activeBlockId);
  useEffect(() => {
    if (activeBlockId && activeBlockId !== prevActiveBlockIdRef.current) {
      setShowNewComment(true);
      setCollapsed(false);
      setTimeout(() => {
        newCommentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    prevActiveBlockIdRef.current = activeBlockId;
  }, [activeBlockId]);

  const handleCreateComment = useCallback(async (content: string, mentions: string[]) => {
    await noteCommentService.createComment(boardId, noteId, {
      content,
      block_id: activeBlockId || undefined,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
    setShowNewComment(false);
    await loadComments();
  }, [boardId, noteId, activeBlockId, loadComments]);

  const handleReply = useCallback(async (parentId: string, content: string, mentions: string[]) => {
    await noteCommentService.createComment(boardId, noteId, {
      content,
      parent_id: parentId,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
    await loadComments();
  }, [boardId, noteId, loadComments]);

  const handleUpdate = useCallback(async (commentId: string, content: string, mentions: string[]) => {
    await noteCommentService.updateComment(boardId, noteId, commentId, {
      content,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
    await loadComments();
  }, [boardId, noteId, loadComments]);

  const handleDelete = useCallback(async (commentId: string) => {
    await noteCommentService.deleteComment(boardId, noteId, commentId);
    await loadComments();
  }, [boardId, noteId, loadComments]);

  const handleToggleResolved = useCallback(async (commentId: string) => {
    await noteCommentService.toggleResolved(boardId, noteId, commentId);
    await loadComments();
  }, [boardId, noteId, loadComments]);

  const filteredThreads = threads.filter(thread => {
    if (filter === 'open') return !thread.is_resolved;
    if (filter === 'resolved') return thread.is_resolved;
    return true;
  });

  // Group threads: block-specific first, then general
  const blockThreads = filteredThreads.filter(t => t.block_id);
  const generalThreads = filteredThreads.filter(t => !t.block_id);

  const openCount = threads.filter(t => !t.is_resolved).length;
  const resolvedCount = threads.filter(t => t.is_resolved).length;

  return (
    <div className="border-t border-foreground/10 bg-bridge-dark/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-bold text-foreground hover:text-bridge-accent transition-colors"
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {t('notes.comment.title', '댓글')}
          <span className="text-xs bg-bridge-accent/20 text-bridge-accent px-1.5 py-0.5 rounded-full font-bold">
            {openCount}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Filters */}
          {!collapsed && (
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-slate-500" />
              {[
                { key: 'all' as const, label: t('notes.comment.filterAll', '전체'), count: threads.length },
                { key: 'open' as const, label: t('notes.comment.filterOpen', '열림'), count: openCount },
                { key: 'resolved' as const, label: t('notes.comment.filterResolved', '해결'), count: resolvedCount },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                    filter === f.key
                      ? 'bg-bridge-accent/20 text-bridge-accent font-bold'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-foreground/5'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {/* New comment input */}
          {canEdit && (
            <div className="px-6 py-2 border-t border-foreground/5" ref={newCommentRef}>
              {showNewComment ? (
                <div>
                  {activeBlockId && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-500">
                      <Hash className="h-3 w-3" />
                      <span>{t('notes.comment.blockComment', '블록 댓글')}: {activeBlockId.substring(0, 8)}</span>
                    </div>
                  )}
                  <NoteCommentInput
                    boardId={boardId}
                    members={members}
                    autoFocus
                    onSubmit={handleCreateComment}
                    onCancel={() => setShowNewComment(false)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowNewComment(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-400
                    bg-white/[0.03] border border-foreground/5 rounded-xl
                    hover:text-foreground hover:bg-foreground/5 hover:border-foreground/10 transition-all"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  {t('notes.comment.new', '새 댓글 작성')}
                </button>
              )}
            </div>
          )}

          {/* Thread list */}
          <div className="max-h-80 overflow-y-auto px-6 py-3 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-bridge-accent" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquarePlus className="h-6 w-6 mx-auto text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">
                  {filter === 'all'
                    ? t('notes.comment.empty', '아직 댓글이 없습니다')
                    : t('notes.comment.emptyFilter', '해당 필터에 댓글이 없습니다')}
                </p>
              </div>
            ) : (
              <>
                {/* Block-specific comments */}
                {blockThreads.length > 0 && (
                  <div className="space-y-2">
                    {generalThreads.length > 0 && (
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {t('notes.comment.blockComments', '블록 댓글')}
                      </p>
                    )}
                    {blockThreads.map(thread => (
                      <NoteCommentThread
                        key={thread.id}
                        thread={thread}
                        boardId={boardId}
                        noteId={noteId}
                        members={members}
                        currentUserId={currentUserId}
                        canEdit={canEdit}
                        onReply={handleReply}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onToggleResolved={handleToggleResolved}
                      />
                    ))}
                  </div>
                )}

                {/* General comments */}
                {generalThreads.length > 0 && (
                  <div className="space-y-2">
                    {blockThreads.length > 0 && (
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">
                        {t('notes.comment.generalComments', '일반 댓글')}
                      </p>
                    )}
                    {generalThreads.map(thread => (
                      <NoteCommentThread
                        key={thread.id}
                        thread={thread}
                        boardId={boardId}
                        noteId={noteId}
                        members={members}
                        currentUserId={currentUserId}
                        canEdit={canEdit}
                        onReply={handleReply}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onToggleResolved={handleToggleResolved}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
