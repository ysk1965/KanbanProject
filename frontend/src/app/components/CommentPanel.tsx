import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { TaskComment, CommentAttachment, CommentReaction, User, BoardCustomEmoji } from '../types';
import { commentAPI, fileAPI, customEmojiAPI, resolveFileUrl } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import { getAssigneeClasses, getInitials } from '../utils/assigneeColor';
import { formatDate } from '../utils/dateUtils';
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
import { MessageSquare, Send, RefreshCw, Pencil, Trash2, X, Check, Loader2, Paperclip, Play, ChevronLeft, ChevronRight, SmilePlus, Plus, ImageIcon } from 'lucide-react';
import { VideoThumbnail } from './VideoThumbnail';

const VideoLightbox = lazy(() => import('./VideoLightbox').then(m => ({ default: m.VideoLightbox })));

// ========== 상수 & 유틸 ==========

const MAX_FILES = 5;
const MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024;      // 5MB
const MAX_FILE_SIZE_VIDEO = 50 * 1024 * 1024;      // 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

const isVideoType = (type: string) => type?.startsWith('video/');
const isVideoAttachment = (att: CommentAttachment) => att.content_type?.startsWith('video/');

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return formatDate(dateStr, 'M월 d일');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '🤔', '👀', '👏', '🔥'];

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

function renderTextWithLinks(text: string, keyPrefix: string) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer"
          className="text-bridge-accent hover:text-bridge-accent/80 underline underline-offset-2 break-all">
          {part}
        </a>
      );
    }
    return part;
  });
}

function renderContent(content: string, boardMembers: BoardMember[]) {
  const memberNames = boardMembers.map(m => m.name);
  const mentionPattern = memberNames.length > 0
    ? new RegExp(`(@(?:${memberNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))(?=\\s|$)`, 'g')
    : null;
  if (!mentionPattern) return renderTextWithLinks(content, 'root');
  const parts = content.split(mentionPattern);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1);
      const member = boardMembers.find(m => m.name === name);
      if (member) {
        const color = getAssigneeClasses(name, member.assigneeColor);
        return <span key={i} className={`${color.text} font-medium`}>{part}</span>;
      }
    }
    return <span key={i}>{renderTextWithLinks(part, `p${i}`)}</span>;
  });
}

// ========== 타입 ==========

interface PendingFile {
  file: File;
  previewUrl: string;
  id: string;
  tempKey?: string;     // 서버 업로드 완료 후 세팅
  uploading?: boolean;
  error?: string;
}

interface CommentPanelProps {
  taskId: string;
  boardId: string;
  boardMembers: BoardMember[];
  currentUser: User | null;
  canEdit?: boolean;
  isAdminOrOwner?: boolean;
}

// ========== 컴포넌트 ==========

export function CommentPanel({ taskId, boardId, boardMembers, currentUser, canEdit = true, isAdminOrOwner = false }: CommentPanelProps) {
  const { t } = useTranslation();
  // 댓글 목록
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 새 댓글 입력
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 수정 모드
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editMentions, setEditMentions] = useState<string[]>([]);
  const [editKeepAttachmentIds, setEditKeepAttachmentIds] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<PendingFile[]>([]);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // 이모지 리액션
  const [emojiPickerCommentId, setEmojiPickerCommentId] = useState<string | null>(null);

  // 커스텀 이모지
  const [customEmojis, setCustomEmojis] = useState<BoardCustomEmoji[]>([]);
  const [customEmojisLoaded, setCustomEmojisLoaded] = useState(false);
  const [emojiUploadName, setEmojiUploadName] = useState('');
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);
  const [showEmojiUpload, setShowEmojiUpload] = useState(false);
  const emojiFileInputRef = useRef<HTMLInputElement>(null);

  // 삭제 / 라이트박스
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{
    items: { url: string; type: 'image' | 'video' }[];
    index: number;
  } | null>(null);

  // 멘션 드롭다운
  const [mentionQuery, setMentionQuery] = useState('');
  const [showInlineMention, setShowInlineMention] = useState(false);
  const [inlineMentionForEdit, setInlineMentionForEdit] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionJustSelected = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // ========== 댓글 로드 ==========

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

  useEffect(() => { loadComments(); }, [loadComments]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [comments.length]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
      editNewFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
    };
  }, []);

  // 이모지 피커 외부 클릭 시 닫기
  useEffect(() => {
    if (!emojiPickerCommentId) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerCommentId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [emojiPickerCommentId]);

  // ========== 이모지 리액션 ==========

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    try {
      const response = await commentAPI.toggleReaction(boardId, taskId, commentId, emoji);
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, reactions: response.reactions } : c
      ));
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
    setEmojiPickerCommentId(null);
  };

  // ========== 커스텀 이모지 관리 ==========

  const loadCustomEmojis = useCallback(async () => {
    if (customEmojisLoaded) return;
    try {
      const res = await customEmojiAPI.getEmojis(boardId);
      setCustomEmojis(res.emojis.map(e => ({
        id: e.id,
        name: e.name,
        image_url: e.image_url,
        content_type: e.content_type,
      })));
      setCustomEmojisLoaded(true);
    } catch (err) {
      console.error('Failed to load custom emojis:', err);
    }
  }, [boardId, customEmojisLoaded]);

  // 피커 열릴 때 커스텀 이모지 로드
  useEffect(() => {
    if (emojiPickerCommentId) {
      loadCustomEmojis();
    }
  }, [emojiPickerCommentId, loadCustomEmojis]);

  const handleUploadCustomEmoji = async (file: File) => {
    if (!emojiUploadName.trim()) return;
    setIsUploadingEmoji(true);
    try {
      const res = await customEmojiAPI.uploadEmoji(boardId, emojiUploadName.trim(), file);
      setCustomEmojis(prev => [...prev, {
        id: res.id,
        name: res.name,
        image_url: res.image_url,
        content_type: res.content_type,
      }]);
      setEmojiUploadName('');
      setShowEmojiUpload(false);
    } catch (err) {
      console.error('Failed to upload custom emoji:', err);
    } finally {
      setIsUploadingEmoji(false);
    }
  };

  const handleDeleteCustomEmoji = async (emojiId: string) => {
    try {
      await customEmojiAPI.deleteEmoji(boardId, emojiId);
      setCustomEmojis(prev => prev.filter(e => e.id !== emojiId));
      // 리액션 목록에서도 해당 이모지 제거
      setComments(prev => prev.map(c => ({
        ...c,
        reactions: c.reactions.filter(r => r.emoji !== `custom:${emojiId}`),
      })));
    } catch (err) {
      console.error('Failed to delete custom emoji:', err);
    }
  };

  // ========== 파일 업로드 (백그라운드) ==========

  const uploadFileToServer = async (pf: PendingFile, setter: React.Dispatch<React.SetStateAction<PendingFile[]>>) => {
    setter(prev => prev.map(f => f.id === pf.id ? { ...f, uploading: true } : f));
    try {
      const result = await fileAPI.smartUpload(pf.file);
      setter(prev => prev.map(f => f.id === pf.id
        ? { ...f, uploading: false, tempKey: result.tempKey }
        : f
      ));
    } catch (err) {
      console.error('Upload failed:', err);
      setter(prev => prev.map(f => f.id === pf.id
        ? { ...f, uploading: false, error: 'upload_failed' }
        : f
      ));
    }
  };

  const validateAndAddFiles = (
    fileList: FileList | File[],
    currentFiles: PendingFile[],
    setter: React.Dispatch<React.SetStateAction<PendingFile[]>>,
    existingCount = 0
  ) => {
    setFileError(null);
    const files = Array.from(fileList);
    const totalCurrent = currentFiles.length + existingCount;
    const newFiles: PendingFile[] = [];

    for (const file of files) {
      if (totalCurrent + newFiles.length >= MAX_FILES) {
        setFileError('comment.maxFilesError');
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError('comment.fileTypeError');
        continue;
      }
      const maxSize = isVideoType(file.type) ? MAX_FILE_SIZE_VIDEO : MAX_FILE_SIZE_IMAGE;
      if (file.size > maxSize) {
        setFileError(isVideoType(file.type) ? 'comment.videoFileSizeError' : 'comment.fileSizeError');
        continue;
      }
      newFiles.push({
        file,
        previewUrl: URL.createObjectURL(file),
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }

    if (newFiles.length > 0) {
      setter(prev => [...prev, ...newFiles]);
      // 즉시 업로드 시작
      newFiles.forEach(pf => uploadFileToServer(pf, setter));
    }
  };

  const removePendingFile = (id: string, setter: React.Dispatch<React.SetStateAction<PendingFile[]>>) => {
    setter(prev => {
      const removed = prev.find(pf => pf.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(pf => pf.id !== id);
    });
    setFileError(null);
  };

  // ========== 이벤트 핸들러 ==========

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    if (!e.target.files) return;
    if (isEdit) {
      validateAndAddFiles(e.target.files, editNewFiles, setEditNewFiles, editKeepAttachmentIds.length);
    } else {
      validateAndAddFiles(e.target.files, pendingFiles, setPendingFiles);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      if (editingId) {
        validateAndAddFiles(e.dataTransfer.files, editNewFiles, setEditNewFiles, editKeepAttachmentIds.length);
      } else {
        validateAndAddFiles(e.dataTransfer.files, pendingFiles, setPendingFiles);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent, isEdit: boolean) => {
    const mediaFiles: File[] = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
        const file = item.getAsFile();
        if (file) mediaFiles.push(file);
      }
    }
    if (mediaFiles.length > 0) {
      e.preventDefault();
      if (isEdit) {
        validateAndAddFiles(mediaFiles, editNewFiles, setEditNewFiles, editKeepAttachmentIds.length);
      } else {
        validateAndAddFiles(mediaFiles, pendingFiles, setPendingFiles);
      }
    }
  };

  // ========== 멘션 ==========

  const detectMentionQuery = (text: string, cursorPos: number): string | null => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\S*)$/);
    return match ? match[1] : null;
  };

  const handleTextChange = (text: string, isEdit: boolean) => {
    if (isEdit) setEditContent(text);
    else setNewComment(text);

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

  // ========== CRUD ==========

  const handleSubmit = async () => {
    const hasText = newComment.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if ((!hasText && !hasFiles) || isSubmitting) return;

    // 모든 파일이 업로드 완료될 때까지 대기
    const uploading = pendingFiles.some(pf => pf.uploading);
    if (uploading) {
      setFileError('comment.uploadInProgress');
      return;
    }
    const hasError = pendingFiles.some(pf => pf.error);
    if (hasError) {
      setFileError('comment.uploadFailedRetry');
      return;
    }

    setIsSubmitting(true);
    try {
      const fileKeys = pendingFiles.map(pf => pf.tempKey!).filter(Boolean);
      const response = await commentAPI.createComment(boardId, taskId, {
        content: newComment.trim() || '',
        mentions: pendingMentions,
        fileKeys: fileKeys.length > 0 ? fileKeys : undefined,
      });
      setComments(prev => [...prev, response]);
      setNewComment('');
      setPendingMentions([]);
      pendingFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      setFileError(null);
    } catch (error) {
      console.error('Failed to create comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (comment: TaskComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditMentions(comment.mentions || []);
    setEditKeepAttachmentIds((comment.attachments || []).map(a => a.id));
    setEditNewFiles([]);
    setFileError(null);
  };

  const cancelEditing = () => {
    editNewFiles.forEach(pf => URL.revokeObjectURL(pf.previewUrl));
    setEditingId(null);
    setEditContent('');
    setEditMentions([]);
    setEditKeepAttachmentIds([]);
    setEditNewFiles([]);
    setFileError(null);
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return;

    const uploading = editNewFiles.some(pf => pf.uploading);
    if (uploading) {
      setFileError('comment.uploadInProgress');
      return;
    }

    setIsEditSubmitting(true);
    try {
      const newFileKeys = editNewFiles.map(pf => pf.tempKey!).filter(Boolean);
      const response = await commentAPI.updateComment(boardId, taskId, commentId, {
        content: editContent.trim(),
        mentions: editMentions,
        keepAttachmentIds: editKeepAttachmentIds,
        newFileKeys: newFileKeys.length > 0 ? newFileKeys : undefined,
      });
      setComments(prev => prev.map(c => c.id === commentId ? response : c));
      cancelEditing();
    } catch (error) {
      console.error('Failed to update comment:', error);
    } finally {
      setIsEditSubmitting(false);
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
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => (prev + 1) % filteredMembers.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMembers[mentionIndex], isEdit); return true; }
    if (e.key === 'Escape') { e.preventDefault(); setShowInlineMention(false); return true; }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (handleMentionNav(e, false)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionJustSelected.current) { e.preventDefault(); mentionJustSelected.current = false; return; }
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
      if (mentionJustSelected.current) { e.preventDefault(); mentionJustSelected.current = false; return; }
      e.preventDefault();
      handleUpdate(commentId);
    } else if (e.key === 'Escape') {
      cancelEditing();
    } else {
      mentionJustSelected.current = false;
    }
  };

  // ========== 서브 컴포넌트 ==========

  const InlineMentionDropdown = ({ isEdit }: { isEdit: boolean }) => {
    if (!showInlineMention || inlineMentionForEdit !== isEdit || filteredMembers.length === 0) return null;
    return (
      <div className="absolute bottom-full left-0 mb-1 w-full bg-bridge-obsidian border border-white/20 rounded-lg shadow-lg z-50 py-1 max-h-40 overflow-y-auto kanban-scrollbar">
        {filteredMembers.map((member, idx) => {
          const color = getAssigneeClasses(member.name, member.assigneeColor);
          return (
            <button key={member.userId}
              onMouseDown={e => { e.preventDefault(); insertMention(member, isEdit); }}
              onMouseEnter={() => setMentionIndex(idx)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-slate-300 ${idx === mentionIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <div className={`w-5 h-5 rounded-full ${color.bg} flex items-center justify-center text-[10px] font-bold text-white whitespace-nowrap overflow-hidden`}>
                {getInitials(member.name)}
              </div>
              <span className={idx === mentionIndex ? 'text-foreground' : ''}>{member.name}</span>
              {member.userId === currentUser?.id && <span className="text-[10px] text-slate-400">(나)</span>}
            </button>
          );
        })}
      </div>
    );
  };

  /** 댓글 첨부 미디어 그리드 (이미지 썸네일 + 영상 썸네일) */
  const AttachmentGrid = ({ attachments }: { attachments: CommentAttachment[] }) => {
    if (!attachments || attachments.length === 0) return null;
    const mediaItems = attachments.map(att => ({
      url: resolveFileUrl(att.url),
      type: (isVideoAttachment(att) ? 'video' : 'image') as 'image' | 'video'
    }));
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {attachments.map((att, idx) => {
          const isVideo = isVideoAttachment(att);
          return (
            <button key={att.id}
              onClick={() => setLightboxMedia({ items: mediaItems, index: idx })}
              className="relative group/img rounded-md overflow-hidden border border-white/20 hover:border-white/20 transition-colors">
              {isVideo ? (
                <VideoThumbnail
                  videoUrl={resolveFileUrl(att.url)}
                  serverThumbnailUrl={att.thumbnail_url ? resolveFileUrl(att.thumbnail_url) : null}
                  className="h-20 w-[120px] max-w-[160px] object-cover"
                  alt={att.file_name}
                />
              ) : att.thumbnail_url ? (
                <img src={resolveFileUrl(att.thumbnail_url)} alt={att.file_name}
                  className="h-20 w-auto max-w-[160px] object-cover" loading="lazy" />
              ) : (
                <img src={resolveFileUrl(att.url)} alt={att.file_name}
                  className="h-20 w-auto max-w-[160px] object-cover" loading="lazy" />
              )}
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white ml-0.5" />
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors" />
            </button>
          );
        })}
      </div>
    );
  };

  /** 파일 미리보기 리스트 (새 댓글 or 수정 모드) */
  const FilePreviewList = ({
    files, existingAttachments, keepIds, onRemoveFile, onRemoveExisting
  }: {
    files: PendingFile[];
    existingAttachments?: CommentAttachment[];
    keepIds?: string[];
    onRemoveFile: (id: string) => void;
    onRemoveExisting?: (attId: string) => void;
  }) => {
    const keptExisting = existingAttachments?.filter(a => keepIds?.includes(a.id)) || [];
    if (keptExisting.length === 0 && files.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 mb-2">
        {/* 기존 첨부파일 (수정 모드) */}
        {keptExisting.map(att => (
          <div key={att.id} className="relative group/preview">
            {isVideoAttachment(att) ? (
              <div className="relative h-16 w-[90px]">
                <VideoThumbnail
                  videoUrl={resolveFileUrl(att.url)}
                  serverThumbnailUrl={att.thumbnail_url ? resolveFileUrl(att.thumbnail_url) : null}
                  className="h-16 w-[90px] object-cover rounded-md border border-white/20"
                  alt={att.file_name}
                />
                <Play className="absolute bottom-1 left-1 h-3 w-3 text-white drop-shadow" />
              </div>
            ) : (
              <img src={resolveFileUrl(att.thumbnail_url || att.url)} alt={att.file_name}
                className="h-16 w-auto max-w-[120px] object-cover rounded-md border border-white/20" />
            )}
            {onRemoveExisting && (
              <button onClick={() => onRemoveExisting(att.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
        {/* 새 파일 */}
        {files.map(pf => (
          <div key={pf.id} className="relative group/preview">
            {isVideoType(pf.file.type) ? (
              <video src={pf.previewUrl} muted preload="metadata"
                className={`h-16 w-[90px] object-cover rounded-md border ${pf.error ? 'border-red-500/50' : 'border-white/20'}`} />
            ) : (
              <img src={pf.previewUrl} alt={pf.file.name}
                className={`h-16 w-auto max-w-[120px] object-cover rounded-md border ${pf.error ? 'border-red-500/50' : 'border-white/20'}`} />
            )}
            {pf.uploading && (
              <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
            {pf.error && (
              <div className="absolute inset-0 bg-red-500/20 rounded-md flex items-center justify-center">
                <span className="text-[8px] text-red-300 font-medium">{t('comment.failed')}</span>
              </div>
            )}
            {isVideoType(pf.file.type) && !pf.uploading && !pf.error && (
              <Play className="absolute bottom-1 left-1 h-3 w-3 text-white drop-shadow" />
            )}
            <button onClick={() => onRemoveFile(pf.id)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
              <X className="h-2.5 w-2.5" />
            </button>
            <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white/80 px-1 rounded">
              {formatFileSize(pf.file.size)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  /** 이모지 피커 팝업 */
  const EmojiPicker = ({ commentId }: { commentId: string }) => {
    if (emojiPickerCommentId !== commentId) return null;
    return (
      <div ref={emojiPickerRef}
        className="absolute right-0 top-full mt-1 z-50 bg-bridge-obsidian border border-white/20 rounded-xl shadow-xl p-2 min-w-[200px]">
        {/* 기본 이모지 */}
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-1">{t('comment.customEmoji.default', '기본')}</div>
        <div className="grid grid-cols-4 gap-1">
          {REACTION_EMOJIS.map(emoji => (
            <button key={emoji}
              onClick={() => handleToggleReaction(commentId, emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all hover:scale-110 text-base">
              {emoji}
            </button>
          ))}
        </div>

        {/* 커스텀 이모지 */}
        {(customEmojis.length > 0 || isAdminOrOwner) && (
          <>
            <div className="border-t border-white/10 my-1.5" />
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-1">{t('comment.customEmoji.title', '커스텀')}</div>
            <div className="grid grid-cols-4 gap-1">
              {customEmojis.map(ce => (
                <div key={ce.id} className="relative group/ce">
                  <button
                    onClick={() => handleToggleReaction(commentId, `custom:${ce.id}`)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all hover:scale-110"
                    title={ce.name}>
                    <img src={resolveFileUrl(ce.image_url)} alt={ce.name} className="w-5 h-5 object-contain" />
                  </button>
                  {isAdminOrOwner && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomEmoji(ce.id); }}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white items-center justify-center text-[8px] leading-none hidden group-hover/ce:flex"
                      title={t('comment.customEmoji.deleteConfirm', '삭제')}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {isAdminOrOwner && (
                <button
                  onClick={() => setShowEmojiUpload(prev => !prev)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all text-slate-400 hover:text-slate-300 border border-dashed border-white/10"
                  title={t('comment.customEmoji.add', '이모지 추가')}>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 업로드 UI */}
            {showEmojiUpload && isAdminOrOwner && (
              <div className="mt-2 p-2 bg-white/5 rounded-lg space-y-2">
                <input
                  type="text"
                  value={emojiUploadName}
                  onChange={e => setEmojiUploadName(e.target.value)}
                  placeholder={t('comment.customEmoji.namePlaceholder', '이모지 이름')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                  maxLength={50}
                />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => emojiFileInputRef.current?.click()}
                    disabled={!emojiUploadName.trim() || isUploadingEmoji}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-bridge-accent/20 text-bridge-accent hover:bg-bridge-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {isUploadingEmoji ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    {t('comment.customEmoji.selectFile', '파일 선택')}
                  </button>
                  <button
                    onClick={() => { setShowEmojiUpload(false); setEmojiUploadName(''); }}
                    className="px-2 py-1 text-[10px] font-medium rounded-lg text-slate-400 hover:text-slate-300 hover:bg-white/5 transition-all">
                    {t('common.cancel', '취소')}
                  </button>
                </div>
                <p className="text-[9px] text-slate-500">{t('comment.customEmoji.maxSize', 'PNG, GIF, WebP · 128KB 이하')}</p>
                <input
                  ref={emojiFileInputRef}
                  type="file"
                  accept="image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCustomEmoji(file);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /** 리액션 뱃지 바 */
  const ReactionBar = ({ comment }: { comment: TaskComment }) => {
    const reactions = comment.reactions || [];
    if (reactions.length === 0 && !canEdit) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {reactions.map(reaction => {
          const isMyReaction = reaction.users.some(u => u.id === currentUser?.id);
          const tooltipNames = reaction.users.map(u =>
            u.id === currentUser?.id ? t('comment.reaction.you') : u.name
          ).join(', ');

          return (
            <button key={reaction.emoji}
              onClick={() => canEdit && handleToggleReaction(comment.id, reaction.emoji)}
              disabled={!canEdit}
              className={`group/reaction relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all
                ${isMyReaction
                  ? 'bg-bridge-accent/20 border border-bridge-accent/50 text-bridge-accent hover:bg-bridge-accent/30'
                  : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-300'
                }
                ${!canEdit ? 'cursor-default' : 'cursor-pointer'}
              `}
              title={tooltipNames}>
              {reaction.is_custom && reaction.image_url ? (
                <img src={resolveFileUrl(reaction.image_url)} alt={reaction.emoji} className="w-4 h-4 object-contain" />
              ) : (
                <span className="text-[11px]">{reaction.emoji}</span>
              )}
              <span className="text-[10px] font-medium">{reaction.count}</span>
            </button>
          );
        })}
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setEmojiPickerCommentId(prev => prev === comment.id ? null : comment.id)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-all"
              title={t('comment.reaction.addReaction')}>
              <SmilePlus className="h-3 w-3" />
            </button>
            <EmojiPicker commentId={comment.id} />
          </div>
        )}
      </div>
    );
  };

  // ========== 메인 렌더 ==========

  const currentComment = editingId ? comments.find(c => c.id === editingId) : null;

  return (
    <div className="flex flex-col h-full" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* 드래그 오버레이 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bridge-accent/10 border-2 border-dashed border-bridge-accent rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-bridge-accent">
            <Paperclip className="h-8 w-8" />
            <span className="text-sm font-medium">{t('comment.dropFileHere')}</span>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center px-4 py-3 border-b border-white/20">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-foreground">{t('comment.title')}</span>
          {comments.length > 0 && <span className="text-xs text-slate-400">{comments.length}</span>}
          <button onClick={() => loadComments(false)} disabled={isRefreshing}
            className="p-0.5 text-slate-400 hover:text-foreground transition-colors disabled:opacity-50" title={t('comment.refresh')}>
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
            <MessageSquare className="h-8 w-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-400">{t('comment.noComments')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('comment.beFirstComment')}</p>
          </div>
        ) : (
          comments.map(comment => {
            const isAuthor = currentUser?.id === comment.author.id;
            const authorMember = boardMembers.find(m => m.userId === comment.author.id);
            const color = getAssigneeClasses(comment.author.name, authorMember?.assigneeColor);
            const isEdited = comment.created_at !== comment.updated_at;
            const isBeingEdited = editingId === comment.id;

            return (
              <div key={comment.id} className="group">
                <div className="flex gap-2.5">
                  <div className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5`}>
                    {getInitials(comment.author.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground">{comment.author.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {formatRelativeTime(comment.created_at)}
                        {isEdited && ` (${t('comment.edited')})`}
                      </span>
                      {canEdit && (isAuthor || isAdminOrOwner) && !isBeingEdited && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          {isAuthor && (
                            <button onClick={() => startEditing(comment)}
                              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-300">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={() => setDeleteTarget(comment.id)}
                            className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isBeingEdited ? (
                      <div className="space-y-2">
                        {/* 수정: 기존 첨부파일 + 새 파일 미리보기 */}
                        <FilePreviewList
                          files={editNewFiles}
                          existingAttachments={comment.attachments}
                          keepIds={editKeepAttachmentIds}
                          onRemoveFile={(id) => removePendingFile(id, setEditNewFiles)}
                          onRemoveExisting={(attId) => setEditKeepAttachmentIds(prev => prev.filter(id => id !== attId))}
                        />
                        {fileError && <p className="text-[10px] text-red-400">{t(fileError)}</p>}

                        <div className="relative">
                          <InlineMentionDropdown isEdit={true} />
                          <textarea ref={editTextareaRef} value={editContent}
                            onChange={e => handleTextChange(e.target.value, true)}
                            onKeyDown={e => handleEditKeyDown(e, comment.id)}
                            onPaste={e => handlePaste(e, true)}
                            onBlur={() => setTimeout(() => setShowInlineMention(false), 150)}
                            className="w-full text-xs bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-foreground placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent"
                            rows={3} autoFocus />
                        </div>
                        <div className="flex items-center gap-1">
                          <input ref={editFileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                            multiple className="hidden" onChange={e => handleFileSelect(e, true)} />
                          <button onClick={() => editFileInputRef.current?.click()}
                            disabled={editKeepAttachmentIds.length + editNewFiles.length >= MAX_FILES}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-30 transition-colors" title={t('comment.addFile')}>
                            <Paperclip className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex-1" />
                          <button onClick={cancelEditing}
                            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-300">
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleUpdate(comment.id)} disabled={isEditSubmitting}
                            className="p-1 rounded hover:bg-bridge-accent/20 text-bridge-accent disabled:opacity-50">
                            {isEditSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {comment.content && comment.content.trim() && (
                          <p className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                            {renderContent(comment.content, boardMembers)}
                          </p>
                        )}
                        <AttachmentGrid attachments={comment.attachments || []} />
                        <ReactionBar comment={comment} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 입력 영역 - Viewer는 댓글 작성 불가 */}
      {canEdit ? (
        <div className="px-4 py-3 border-t border-white/20">
          <FilePreviewList files={pendingFiles}
            onRemoveFile={(id) => removePendingFile(id, setPendingFiles)} />

          {fileError && !editingId && <p className="text-[10px] text-red-400 mb-1">{t(fileError)}</p>}

          <div className="relative">
            <InlineMentionDropdown isEdit={false} />
            <textarea ref={textareaRef} value={newComment}
              onChange={e => handleTextChange(e.target.value, false)}
              onKeyDown={handleKeyDown}
              onPaste={e => handlePaste(e, false)}
              onBlur={() => setTimeout(() => setShowInlineMention(false), 150)}
              placeholder={t('comment.inputPlaceholder')}
              className="w-full text-xs bg-white/5 border border-white/20 rounded-lg pl-3 pr-20 py-2.5 text-foreground placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent"
              rows={2} />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                multiple className="hidden" onChange={e => handleFileSelect(e, false)} />
              <button onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES}
                className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={t('comment.attachFile')}>
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleSubmit}
                disabled={(!newComment.trim() && pendingFiles.length === 0) || isSubmitting || pendingFiles.some(f => f.uploading)}
                className="p-1.5 rounded bg-bridge-accent hover:bg-bridge-accent/80 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">{t('comment.fileHelp')}</p>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-white/20">
          <p className="text-xs text-slate-400 text-center">{t('comment.viewerReadOnly')}</p>
        </div>
      )}

      {/* 미디어 라이트박스 - Portal로 body에 렌더링 (모달 transform 영향 회피) */}
      {lightboxMedia && createPortal(
        (() => {
          const current = lightboxMedia.items[lightboxMedia.index];
          const hasPrev = lightboxMedia.index > 0;
          const hasNext = lightboxMedia.index < lightboxMedia.items.length - 1;
          const goPrev = () => hasPrev && setLightboxMedia({ ...lightboxMedia, index: lightboxMedia.index - 1 });
          const goNext = () => hasNext && setLightboxMedia({ ...lightboxMedia, index: lightboxMedia.index + 1 });

          return current.type === 'video' ? (
            <Suspense fallback={
              <div data-lightbox-overlay className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            }>
              <VideoLightbox url={current.url} onClose={() => setLightboxMedia(null)} />
            </Suspense>
          ) : (
            <div data-lightbox-overlay className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setLightboxMedia(null); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { e.stopPropagation(); goPrev(); }
                else if (e.key === 'ArrowRight') { e.stopPropagation(); goNext(); }
                else if (e.key === 'Escape') { e.stopPropagation(); setLightboxMedia(null); }
              }}
              tabIndex={0}
              ref={(el) => el?.focus()}>
              <button onClick={(e) => { e.stopPropagation(); setLightboxMedia(null); }}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10">
                <X className="h-5 w-5" />
              </button>
              {hasPrev && (
                <button onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10">
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {hasNext && (
                <button onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10">
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
              <img src={current.url} alt={t('comment.attachedFile')}
                className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
                onClick={e => e.stopPropagation()} />
              {lightboxMedia.items.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs z-10">
                  {lightboxMedia.index + 1} / {lightboxMedia.items.length}
                </div>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{t('comment.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">{t('comment.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)} className="bg-white/5 border-white/20 text-foreground hover:bg-white/10">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)} className="bg-red-500 hover:bg-red-600 text-white">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
