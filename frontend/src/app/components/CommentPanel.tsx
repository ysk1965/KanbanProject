import { useState, useEffect, useRef, useCallback } from 'react';
import { TaskComment, User } from '../types';
import { commentAPI } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { MessageSquare, Send, RefreshCw, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react';

// 담당자 색상 함수 (TaskDetailModal과 동일)
const ASSIGNEE_COLORS = [
  { bg: 'bg-indigo-500', text: 'text-indigo-300' },
  { bg: 'bg-purple-500', text: 'text-purple-300' },
  { bg: 'bg-teal-500', text: 'text-teal-300' },
  { bg: 'bg-rose-500', text: 'text-rose-300' },
  { bg: 'bg-amber-500', text: 'text-amber-300' },
  { bg: 'bg-emerald-500', text: 'text-emerald-300' },
];

function getAssigneeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length];
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/** @멘션 텍스트를 파싱하여 렌더링 */
function renderContent(content: string, boardMembers: BoardMember[]) {
  const memberNames = boardMembers.map(m => m.name);
  // @이름 패턴 매칭 (보드 멤버 이름만)
  const mentionPattern = memberNames.length > 0
    ? new RegExp(`(@(?:${memberNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))(?=\\s|$)`, 'g')
    : null;

  if (!mentionPattern) return content;

  const parts = content.split(mentionPattern);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1);
      if (memberNames.includes(name)) {
        const color = getAssigneeColor(name);
        return (
          <span key={i} className={`${color.text} font-medium`}>
            {part}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

interface CommentPanelProps {
  taskId: string;
  boardId: string;
  boardMembers: BoardMember[];
  currentUser: User | null;
}

export function CommentPanel({ taskId, boardId, boardMembers, currentUser }: CommentPanelProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);
  const [editMentions, setEditMentions] = useState<string[]>([]);
  // 인라인 멘션: @입력 시 자동 드롭다운
  const [mentionQuery, setMentionQuery] = useState('');
  const [showInlineMention, setShowInlineMention] = useState(false);
  const [inlineMentionForEdit, setInlineMentionForEdit] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionJustSelected = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await commentAPI.getComments(boardId, taskId);
      setComments(response.comments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [boardId, taskId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // 새 댓글 추가 후 스크롤 맨 아래로
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  /** textarea에서 커서 앞의 @쿼리를 찾아 반환 */
  const detectMentionQuery = (text: string, cursorPos: number): string | null => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\S*)$/);
    return match ? match[1] : null;
  };

  /** textarea onChange에서 @감지 */
  const handleTextChange = (text: string, isEdit: boolean) => {
    if (isEdit) {
      setEditContent(text);
    } else {
      setNewComment(text);
    }

    const ref = isEdit ? editTextareaRef.current : textareaRef.current;
    const cursorPos = ref?.selectionStart ?? text.length;
    const query = detectMentionQuery(text, cursorPos);

    if (query !== null) {
      setMentionQuery(query);
      setShowInlineMention(true);
      setInlineMentionForEdit(isEdit);
      setMentionIndex(0); // 쿼리 변경 시 선택 초기화
    } else {
      setShowInlineMention(false);
      setMentionQuery('');
      setMentionIndex(0);
    }
  };

  /** 멘션 선택 시 @쿼리를 @이름으로 교체 */
  const insertMention = (member: BoardMember, isEdit: boolean) => {
    const ref = isEdit ? editTextareaRef.current : textareaRef.current;
    const text = isEdit ? editContent : newComment;
    const cursorPos = ref?.selectionStart ?? text.length;

    // 커서 앞에서 @쿼리 부분을 찾아 교체
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const replaced = before.replace(/@\S*$/, `@${member.name} `);

    if (isEdit) {
      setEditContent(replaced + after);
      setEditMentions(prev => prev.includes(member.userId) ? prev : [...prev, member.userId]);
    } else {
      setNewComment(replaced + after);
      setPendingMentions(prev => prev.includes(member.userId) ? prev : [...prev, member.userId]);
    }

    setShowInlineMention(false);
    setMentionQuery('');
    mentionJustSelected.current = true;

    // 커서 위치 복원
    requestAnimationFrame(() => {
      if (ref) {
        const newPos = replaced.length;
        ref.selectionStart = newPos;
        ref.selectionEnd = newPos;
        ref.focus();
      }
    });
  };

  /** 필터된 멤버 목록 */
  const filteredMembers = boardMembers.filter(m =>
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await commentAPI.createComment(boardId, taskId, {
        content: newComment.trim(),
        mentions: pendingMentions,
      });
      setComments(prev => [...prev, response]);
      setNewComment('');
      setPendingMentions([]);
    } catch (error) {
      console.error('Failed to create comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      const response = await commentAPI.updateComment(boardId, taskId, commentId, {
        content: editContent.trim(),
        mentions: editMentions,
      });
      setComments(prev => prev.map(c => c.id === commentId ? response : c));
      setEditingId(null);
      setEditContent('');
      setEditMentions([]);
    } catch (error) {
      console.error('Failed to update comment:', error);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await commentAPI.deleteComment(boardId, taskId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    } finally {
      setDeleteTarget(null);
    }
  };

  /** 멘션 드롭다운이 열려있을 때 위/아래/엔터 처리 */
  const handleMentionNav = (e: React.KeyboardEvent<HTMLTextAreaElement>, isEdit: boolean): boolean => {
    if (!showInlineMention || filteredMembers.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(prev => (prev + 1) % filteredMembers.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredMembers[mentionIndex], isEdit);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowInlineMention(false);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 IME 조합 중이면 무시
    if (e.nativeEvent.isComposing) return;
    if (handleMentionNav(e, false)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionJustSelected.current) {
        e.preventDefault();
        mentionJustSelected.current = false;
        return;
      }
      e.preventDefault();
      handleSubmit();
    } else {
      mentionJustSelected.current = false;
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, commentId: string) => {
    // 한글 IME 조합 중이면 무시
    if (e.nativeEvent.isComposing) return;
    if (handleMentionNav(e, true)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionJustSelected.current) {
        e.preventDefault();
        mentionJustSelected.current = false;
        return;
      }
      e.preventDefault();
      handleUpdate(commentId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditContent('');
    } else {
      mentionJustSelected.current = false;
    }
  };

  /** 인라인 멘션 드롭다운 */
  const InlineMentionDropdown = ({ isEdit }: { isEdit: boolean }) => {
    if (!showInlineMention || inlineMentionForEdit !== isEdit || filteredMembers.length === 0) return null;
    return (
      <div className="absolute bottom-full left-0 mb-1 w-full bg-bridge-obsidian border border-white/10 rounded-lg shadow-lg z-50 py-1 max-h-40 overflow-y-auto kanban-scrollbar">
        {filteredMembers.map((member, idx) => {
          const color = getAssigneeColor(member.name);
          const isSelected = idx === mentionIndex;
          return (
            <button
              key={member.userId}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(member, isEdit);
              }}
              onMouseEnter={() => setMentionIndex(idx)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-slate-300 ${
                isSelected ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-[10px] font-bold text-white`}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              <span className={isSelected ? 'text-foreground' : ''}>{member.name}</span>
              {member.userId === currentUser?.id && (
                <span className="text-[10px] text-slate-500">(나)</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-foreground">댓글</span>
          {comments.length > 0 && (
            <span className="text-xs text-slate-500">{comments.length}</span>
          )}
          <button
            onClick={() => loadComments(false)}
            disabled={isRefreshing}
            className="p-0.5 text-slate-500 hover:text-foreground transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 댓글 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 kanban-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">아직 댓글이 없습니다</p>
            <p className="text-xs text-slate-600 mt-1">첫 댓글을 남겨보세요</p>
          </div>
        ) : (
          comments.map(comment => {
            const isAuthor = currentUser?.id === comment.author.id;
            const color = getAssigneeColor(comment.author.name);
            const isEdited = comment.created_at !== comment.updated_at;

            return (
              <div key={comment.id} className="group">
                <div className="flex gap-2.5">
                  {/* 아바타 */}
                  <div className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5`}>
                    {comment.author.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 이름 + 시간 */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground">
                        {comment.author.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatRelativeTime(comment.created_at)}
                        {isEdited && ' (수정됨)'}
                      </span>
                      {/* 수정/삭제 버튼 */}
                      {isAuthor && editingId !== comment.id && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          <button
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditContent(comment.content);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(comment.id)}
                            className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 내용 */}
                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <InlineMentionDropdown isEdit={true} />
                          <textarea
                            ref={editTextareaRef}
                            value={editContent}
                            onChange={e => handleTextChange(e.target.value, true)}
                            onKeyDown={e => handleEditKeyDown(e, comment.id)}
                            onBlur={() => setTimeout(() => setShowInlineMention(false), 150)}
                            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent"
                            rows={3}
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1" />
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditContent('');
                            }}
                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdate(comment.id)}
                            className="p-1 rounded hover:bg-bridge-accent/20 text-bridge-accent"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                        {renderContent(comment.content, boardMembers)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 입력 영역 */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="relative">
          <InlineMentionDropdown isEdit={false} />
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={e => handleTextChange(e.target.value, false)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowInlineMention(false), 150)}
            placeholder="댓글을 입력하세요... @로 멘션"
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-foreground placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent"
            rows={2}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
              className="p-1.5 rounded bg-bridge-accent hover:bg-bridge-accent/80 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">댓글을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              삭제된 댓글은 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
