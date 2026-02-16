import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, MoreHorizontal, Trash2, Pencil, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { formatRelativeTime } from '../../utils/dateUtils';
import { NoteCommentInput } from './NoteCommentInput';
import type { NoteCommentDetail, MemberResponse } from '../../utils/api';

interface NoteCommentThreadProps {
  thread: NoteCommentDetail;
  boardId: string;
  noteId: string;
  members: MemberResponse[];
  currentUserId: string;
  canEdit: boolean;
  onReply: (parentId: string, content: string, mentions: string[]) => Promise<void>;
  onUpdate: (commentId: string, content: string, mentions: string[]) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onToggleResolved: (commentId: string) => Promise<void>;
}

export function NoteCommentThread({
  thread, boardId, noteId, members, currentUserId, canEdit,
  onReply, onUpdate, onDelete, onToggleResolved,
}: NoteCommentThreadProps) {
  const { t } = useTranslation();
  const [showReply, setShowReply] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(thread.is_resolved);

  const handleReply = useCallback(async (content: string, mentions: string[]) => {
    await onReply(thread.id, content, mentions);
    setShowReply(false);
  }, [thread.id, onReply]);

  const handleUpdate = useCallback(async (commentId: string, content: string, mentions: string[]) => {
    await onUpdate(commentId, content, mentions);
    setEditingId(null);
  }, [onUpdate]);

  const renderComment = (comment: NoteCommentDetail, isRoot: boolean) => (
    <div key={comment.id} className={`group ${!isRoot ? 'ml-6 border-l border-white/5 pl-3' : ''}`}>
      <div className="flex items-start gap-2 py-2">
        {/* Avatar */}
        {comment.author.profile_image ? (
          <img src={comment.author.profile_image} alt="" className="h-6 w-6 rounded-full flex-shrink-0 mt-0.5" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-bridge-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[10px] font-bold text-bridge-accent">
              {comment.author.name.charAt(0)}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">{comment.author.name}</span>
            <span className="text-[10px] text-slate-500">{formatRelativeTime(comment.created_at)}</span>

            {/* Actions menu */}
            {canEdit && (
              <div className="relative ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setMenuOpen(menuOpen === comment.id ? null : comment.id)}
                  className="p-0.5 text-slate-500 hover:text-white rounded transition-colors"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuOpen === comment.id && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-32
                    bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl overflow-hidden">
                    {comment.author.id === currentUserId && (
                      <button
                        onClick={() => { setEditingId(comment.id); setMenuOpen(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                      >
                        <Pencil className="h-3 w-3" /> {t('common.edit', '수정')}
                      </button>
                    )}
                    {(comment.author.id === currentUserId || !isRoot) && (
                      <button
                        onClick={() => { onDelete(comment.id); setMenuOpen(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-white/5"
                      >
                        <Trash2 className="h-3 w-3" /> {t('common.delete', '삭제')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content or edit form */}
          {editingId === comment.id ? (
            <div className="mt-1">
              <NoteCommentInput
                boardId={boardId}
                members={members}
                initialContent={comment.content}
                autoFocus
                onSubmit={(content, mentions) => handleUpdate(comment.id, content, mentions)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`rounded-xl border transition-all ${
      thread.is_resolved
        ? 'border-white/5 bg-white/[0.02] opacity-70'
        : 'border-white/10 bg-white/[0.03]'
    }`}>
      {/* Thread header */}
      <div className="flex items-center gap-2 px-3 pt-2">
        {/* Resolve toggle */}
        {canEdit && (
          <button
            onClick={() => onToggleResolved(thread.id)}
            className={`flex-shrink-0 transition-colors ${
              thread.is_resolved ? 'text-green-400 hover:text-green-300' : 'text-slate-500 hover:text-bridge-accent'
            }`}
            title={thread.is_resolved ? t('notes.comment.reopen', '다시 열기') : t('notes.comment.resolve', '해결')}
          >
            {thread.is_resolved ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
        )}

        {thread.block_id && (
          <span className="text-[10px] font-mono text-slate-600 truncate max-w-[100px]">
            #{thread.block_id.substring(0, 8)}
          </span>
        )}

        {thread.is_resolved && thread.resolved_by && (
          <span className="text-[10px] text-green-400/70 ml-auto">
            {thread.resolved_by.name}{t('notes.comment.resolvedBy', '님이 해결')}
          </span>
        )}

        {thread.replies.length > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-0.5 text-slate-500 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Root comment */}
      <div className="px-3">
        {renderComment(thread, true)}
      </div>

      {/* Replies */}
      {!collapsed && thread.replies.length > 0 && (
        <div className="px-3 pb-1">
          {thread.replies.map(reply => renderComment(reply, false))}
        </div>
      )}

      {/* Reply input */}
      {canEdit && !thread.is_resolved && (
        <div className="px-3 pb-2">
          {showReply ? (
            <NoteCommentInput
              boardId={boardId}
              members={members}
              autoFocus
              placeholder={t('notes.comment.replyPlaceholder', '답글 입력...')}
              onSubmit={handleReply}
              onCancel={() => setShowReply(false)}
            />
          ) : (
            <button
              onClick={() => setShowReply(true)}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-bridge-accent transition-colors py-1"
            >
              <MessageSquare className="h-3 w-3" />
              {t('notes.comment.reply', '답글')}
              {thread.replies.length > 0 && ` (${thread.replies.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
