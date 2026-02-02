import { useState, useEffect, useRef, useCallback } from 'react';
import { TaskComment, CommentAttachment, User } from '../types';
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
import { MessageSquare, Send, RefreshCw, Pencil, Trash2, X, Check, Loader2, Paperclip, Image as ImageIcon } from 'lucide-react';

// 담당자 색상 함수 (TaskDetailModal과 동일)
const ASSIGNEE_COLORS = [
  { bg: 'bg-indigo-500', text: 'text-indigo-300' },
  { bg: 'bg-purple-500', text: 'text-purple-300' },
  { bg: 'bg-teal-500', text: 'text-teal-300' },
  { bg: 'bg-rose-500', text: 'text-rose-300' },
  { bg: 'bg-amber-500', text: 'text-amber-300' },
  { bg: 'bg-emerald-500', text: 'text-emerald-300' },
];

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function getAssigneeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length];
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** @멘션 텍스트를 파싱하여 렌더링 */
function renderContent(content: string, boardMembers: BoardMember[]) {
  const memberNames = boardMembers.map(m => m.name);
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

/** 로컬 미리보기용 파일 타입 */
interface PendingFile {
  file: File;
  previewUrl: string;
  id: string;
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
  // 이미지 첨부
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // 이미지 라이트박스
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // 인라인 멘션: @입력 시 자동 드롭다운
  const [mentionQuery, setMentionQuery] = useState('');
  const [showInlineMention, setShowInlineMention] = useState(false);
  const [inlineMentionForEdit, setInlineMentionForEdit] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionJustSelected = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  // cleanup preview URLs
  useEffect(() => {
    return () => {
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
    };
  }, []);

  // ========== 파일 처리 ==========

  const validateAndAddFiles = (fileList: FileList | File[]) => {
    setFileError(null);
    const files = Array.from(fileList);
    const currentCount = pendingFiles.length;
    const newFiles: PendingFile[] = [];

    for (const file of files) {
      if (currentCount + newFiles.length >= MAX_FILES) {
        setFileError(`이미지는 최대 ${MAX_FILES}개까지 첨부할 수 있습니다.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError('jpg, png, gif, webp 파일만 첨부할 수 있습니다.');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError('파일 크기는 최대 5MB입니다.');
        continue;
      }
      newFiles.push({
        file,
        previewUrl: URL.createObjectURL(file),
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }

    if (newFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => {
      const removed = prev.find(pf => pf.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(pf => pf.id !== id);
    });
    setFileError(null);
  };

  // 파일 선택
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(e.target.files);
      e.target.value = ''; // reset so same file can be selected again
    }
  };

  // 드래그 앤 드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  // 클립보드 붙여넣기 (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      validateAndAddFiles(imageFiles);
    }
  };

  // ========== 멘션 ==========

  const detectMentionQuery = (text: string, cursorPos: number): string | null => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\S*)$/);
    return match ? match[1] : null;
  };

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
      setMentionIndex(0);
    } else {
      setShowInlineMention(false);
      setMentionQuery('');
      setMentionIndex(0);
    }
  };

  const insertMention = (member: BoardMember, isEdit: boolean) => {
    const ref = isEdit ? editTextareaRef.current : textareaRef.current;
    const text = isEdit ? editContent : newComment;
    const cursorPos = ref?.selectionStart ?? text.length;

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

    requestAnimationFrame(() => {
      if (ref) {
        const newPos = replaced.length;
        ref.selectionStart = newPos;
        ref.selectionEnd = newPos;
        ref.focus();
      }
    });
  };

  const filteredMembers = boardMembers.filter(m =>
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // ========== 댓글 CRUD ==========

  const handleSubmit = async () => {
    if ((!newComment.trim() && pendingFiles.length === 0) || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const files = pendingFiles.map(pf => pf.file);
      const response = await commentAPI.createComment(
        boardId,
        taskId,
        {
          content: newComment.trim() || ' ', // 이미지만 있어도 최소 content
          mentions: pendingMentions,
        },
        files.length > 0 ? files : undefined
      );
      setComments(prev => [...prev, response]);
      setNewComment('');
      setPendingMentions([]);
      // cleanup
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      setFileError(null);
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

  // ========== 키보드 ==========

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

  // ========== 렌더링 ==========

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

  /** 댓글 첨부 이미지 그리드 */
  const AttachmentGrid = ({ attachments }: { attachments: CommentAttachment[] }) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {attachments.map(att => (
          <button
            key={att.id}
            onClick={() => setLightboxUrl(att.url)}
            className="relative group/img rounded-md overflow-hidden border border-white/10 hover:border-white/20 transition-colors"
          >
            <img
              src={att.url}
              alt={att.file_name}
              className="h-20 w-auto max-w-[160px] object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bridge-accent/10 border-2 border-dashed border-bridge-accent rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-bridge-accent">
            <ImageIcon className="h-8 w-8" />
            <span className="text-sm font-medium">이미지를 여기에 드롭하세요</span>
          </div>
        </div>
      )}

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
                      <>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                          {renderContent(comment.content, boardMembers)}
                        </p>
                        {/* 첨부 이미지 */}
                        <AttachmentGrid attachments={comment.attachments || []} />
                      </>
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
        {/* 미리보기 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map(pf => (
              <div key={pf.id} className="relative group/preview">
                <img
                  src={pf.previewUrl}
                  alt={pf.file.name}
                  className="h-16 w-auto max-w-[120px] object-cover rounded-md border border-white/10"
                />
                <button
                  onClick={() => removePendingFile(pf.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white/80 px-1 rounded">
                  {formatFileSize(pf.file.size)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 에러 메시지 */}
        {fileError && (
          <p className="text-[10px] text-red-400 mb-1">{fileError}</p>
        )}

        <div className="relative">
          <InlineMentionDropdown isEdit={false} />
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={e => handleTextChange(e.target.value, false)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => setTimeout(() => setShowInlineMention(false), 150)}
            placeholder="댓글을 입력하세요... @로 멘션"
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg pl-3 pr-20 py-2.5 text-foreground placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent"
            rows={2}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {/* 파일 첨부 버튼 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pendingFiles.length >= MAX_FILES}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="이미지 첨부 (최대 5개)"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!newComment.trim() && pendingFiles.length === 0) || isSubmitting}
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
        <p className="text-[9px] text-slate-600 mt-1">이미지: 붙여넣기, 드래그, 또는 📎 클릭 (jpg/png/gif/webp, 5MB, 최대 5개)</p>
      </div>

      {/* 이미지 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="첨부 이미지"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

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
