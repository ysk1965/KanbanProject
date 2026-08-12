import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEscClose } from "../../hooks/useEscClose";
import {
  MessageSquare,
  Send,
  Loader2,
  Pencil,
  Trash2,
  X,
  Check,
  SmilePlus,
} from "lucide-react";
import {
  noteCommentService,
  orgNoteCommentService,
  myNoteCommentService,
} from "../../utils/services";
import {
  memberAPI,
  mentionGroupAPI,
  MentionGroupDetail,
} from "../../utils/api";
import { wsManager } from "../../utils/websocket";
import { CLIENT_ID } from "../../utils/clientId";
import type { BoardWebSocketEvent } from "../../types";
import { formatRelativeTime } from "../../utils/dateUtils";
import { getAssigneeClasses, getInitials } from "../../utils/assigneeColor";
import type {
  NoteCommentDetail,
  NoteCommentListResponse,
  MemberResponse,
  CommentReactionResponse,
} from "../../utils/api";
import { Users } from "lucide-react";

// ========== Constants ==========

const REACTION_EMOJIS = [
  "\uD83D\uDC4D",
  "\u2764\uFE0F",
  "\uD83D\uDE04",
  "\uD83C\uDF89",
  "\uD83E\uDD14",
  "\uD83D\uDC40",
  "\uD83D\uDC4F",
  "\uD83D\uDD25",
  "\u2705",
  "\uD83D\uDE4F",
  "\uD83D\uDCAF",
  "\uD83D\uDE22",
];

// ========== Types ==========

interface NoteBottomCommentsProps {
  boardId?: string;
  orgId?: string;
  personal?: boolean;
  noteId: string;
  currentUserId: string;
  canEdit: boolean;
}

// ========== Utilities ==========

function cleanMarkdownArtifacts(text: string): string {
  return text
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1");
}

function renderContentWithMentions(
  content: string,
  members: MemberResponse[],
  mentionGroups: MentionGroupDetail[] = [],
) {
  const cleaned = cleanMarkdownArtifacts(content);
  const memberNames = members.map((m) => m.user.name);
  const groupNames = mentionGroups.map((g) => g.name);
  const allNames = [...memberNames, ...groupNames];
  if (allNames.length === 0) return cleaned;

  const mentionPattern = new RegExp(
    `(@(?:${allNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))(?=\\s|$)`,
    "g",
  );
  const parts = cleaned.split(mentionPattern);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1);
      const member = members.find((m) => m.user.name === name);
      if (member) {
        const color = getAssigneeClasses(name);
        return (
          <span key={i} className={`${color.text} font-medium`}>
            {part}
          </span>
        );
      }
      const group = mentionGroups.find((g) => g.name === name);
      if (group) {
        return (
          <span key={i} className="text-bridge-secondary font-medium">
            {part}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

// ========== Component ==========

export function NoteBottomComments({
  boardId,
  orgId,
  personal,
  noteId,
  currentUserId,
  canEdit,
}: NoteBottomCommentsProps) {
  const svc = personal
    ? myNoteCommentService
    : orgId
      ? orgNoteCommentService
      : noteCommentService;
  const scopeId = personal ? "me" : boardId || orgId || "";
  // 개인 노트는 단일 사용자이므로 백엔드가 발행하지 않는 per-note 토픽 (구독 무해).
  const wsTopic = personal
    ? `/topic/note/${noteId}`
    : orgId
      ? `/topic/org/${orgId}`
      : `/topic/board/${boardId}`;
  // State
  const [comments, setComments] = useState<NoteCommentDetail[]>([]);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [mentionGroups, setMentionGroups] = useState<MentionGroupDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // New comment
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMentions, setEditMentions] = useState<string[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editShowMentions, setEditShowMentions] = useState(false);
  const [editMentionQuery, setEditMentionQuery] = useState("");
  const [editMentionIndex, setEditMentionIndex] = useState(0);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Emoji
  const [emojiPickerCommentId, setEmojiPickerCommentId] = useState<
    string | null
  >(null);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  useEscClose(!!deleteTarget, () => setDeleteTarget(null));

  // ========== Data loading ==========

  const loadComments = useCallback(async () => {
    try {
      const data: NoteCommentListResponse = await svc.getComments(
        scopeId,
        noteId,
      );
      // Flatten: only general (non-block) root comments, no replies (flat model)
      // For bottom panel, show all root comments (block_id === null, parent_id === null)
      const flat = data.threads.filter((t) => !t.block_id && !t.parent_id);
      setComments(flat);
    } catch (err) {
      console.error("Failed to load note comments:", err);
    } finally {
      setLoading(false);
    }
  }, [scopeId, noteId, svc]);

  const loadMembers = useCallback(async () => {
    if (!boardId) return; // org context: members not loaded via board API
    try {
      const data = await memberAPI.getMembers(boardId);
      setMembers(data.members || []);
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    setComments([]);
    loadComments();
    loadMembers();
  }, [loadComments, loadMembers]);

  // Load mention groups
  useEffect(() => {
    if (!boardId) return;
    mentionGroupAPI
      .getGroups(boardId)
      .then((res) => setMentionGroups(res.groups))
      .catch(() => {});
  }, [boardId]);

  // ========== WebSocket: real-time comment sync ==========

  const NOTE_COMMENT_EVENTS = [
    "NOTE_COMMENT_CREATED",
    "NOTE_COMMENT_UPDATED",
    "NOTE_COMMENT_DELETED",
    "NOTE_COMMENT_RESOLVED",
    "NOTE_COMMENT_REACTION_TOGGLED",
  ];

  useEffect(() => {
    const sub = wsManager.subscribe(wsTopic, (message) => {
      try {
        const event: BoardWebSocketEvent = JSON.parse(message.body);
        if (!NOTE_COMMENT_EVENTS.includes(event.type)) return;
        // 이 탭에서 보낸 이벤트만 스킵 — 같은 사용자의 다른 탭 변경은 반영
        if (event.client_id && event.client_id === CLIENT_ID) return;
        const data = event.data as { note_id?: string };
        if (data?.note_id !== noteId) return;
        loadComments();
      } catch {
        /* ignore */
      }
    });
    return () => sub.unsubscribe();
  }, [wsTopic, noteId, loadComments]);

  // ========== Emoji picker outside click ==========

  useEffect(() => {
    if (!emojiPickerCommentId) return;
    const handleClick = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node) &&
        emojiTriggerRef.current &&
        !emojiTriggerRef.current.contains(e.target as Node)
      ) {
        setEmojiPickerCommentId(null);
        setEmojiPickerPos(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [emojiPickerCommentId]);

  // ========== Mention helpers ==========

  const detectMentionQuery = (
    text: string,
    cursorPos: number,
  ): string | null => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/@(\S*)$/);
    return match ? match[1] : null;
  };

  const currentQuery = (
    editingId ? editMentionQuery : mentionQuery
  ).toLowerCase();

  const filteredMembers = members.filter((m) =>
    m.user.name.toLowerCase().includes(currentQuery),
  );

  const filteredGroups = mentionGroups.filter((g) =>
    g.name.toLowerCase().includes(currentQuery),
  );

  const handleNewContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const val = e.target.value;
    setNewContent(val);
    const cursorPos = e.target.selectionStart;
    const query = detectMentionQuery(val, cursorPos);
    if (query !== null) {
      setMentionQuery(query);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const handleEditContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const val = e.target.value;
    setEditContent(val);
    const cursorPos = e.target.selectionStart;
    const query = detectMentionQuery(val, cursorPos);
    if (query !== null) {
      setEditMentionQuery(query);
      setEditShowMentions(true);
      setEditMentionIndex(0);
    } else {
      setEditShowMentions(false);
    }
  };

  const insertMention = (member: MemberResponse, isEdit: boolean) => {
    const ref = isEdit ? editTextareaRef.current : textareaRef.current;
    const text = isEdit ? editContent : newContent;
    const cursorPos = ref?.selectionStart ?? text.length;
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const replaced = before.replace(/@\S*$/, `@${member.user.name} `);

    if (isEdit) {
      setEditContent(replaced + after);
      if (!editMentions.includes(member.user.id)) {
        setEditMentions((prev) => [...prev, member.user.id]);
      }
      setEditShowMentions(false);
    } else {
      setNewContent(replaced + after);
      if (!selectedMentions.includes(member.user.id)) {
        setSelectedMentions((prev) => [...prev, member.user.id]);
      }
      setShowMentions(false);
    }

    requestAnimationFrame(() => {
      if (ref) {
        const newPos = replaced.length;
        ref.selectionStart = newPos;
        ref.selectionEnd = newPos;
        ref.focus();
      }
    });
  };

  const insertGroupMention = (group: MentionGroupDetail, isEdit: boolean) => {
    const ref = isEdit ? editTextareaRef.current : textareaRef.current;
    const text = isEdit ? editContent : newContent;
    const cursorPos = ref?.selectionStart ?? text.length;
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const replaced = before.replace(/@\S*$/, `@${group.name} `);

    const memberIds = group.members.map((m) => m.user_id);
    if (isEdit) {
      setEditContent(replaced + after);
      setEditMentions((prev) => [...new Set([...prev, ...memberIds])]);
      setEditShowMentions(false);
    } else {
      setNewContent(replaced + after);
      setSelectedMentions((prev) => [...new Set([...prev, ...memberIds])]);
      setShowMentions(false);
    }

    requestAnimationFrame(() => {
      if (ref) {
        const newPos = replaced.length;
        ref.selectionStart = newPos;
        ref.selectionEnd = newPos;
        ref.focus();
      }
    });
  };

  // ========== CRUD ==========

  const handleSubmit = useCallback(async () => {
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await svc.createComment(scopeId, noteId, {
        content: newContent.trim(),
        block_id: null,
        parent_id: null,
        mentions: selectedMentions.length > 0 ? selectedMentions : undefined,
      });
      setNewContent("");
      setSelectedMentions([]);
      await loadComments();
    } catch (err) {
      console.error("Failed to create comment:", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    scopeId,
    noteId,
    newContent,
    selectedMentions,
    submitting,
    loadComments,
    svc,
  ]);

  const startEditing = (comment: NoteCommentDetail) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditMentions(comment.mentions || []);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
    setEditMentions([]);
  };

  const handleUpdate = useCallback(
    async (commentId: string) => {
      if (!editContent.trim() || editSubmitting) return;
      setEditSubmitting(true);
      try {
        await svc.updateComment(scopeId, noteId, commentId, {
          content: editContent.trim(),
          mentions: editMentions.length > 0 ? editMentions : undefined,
        });
        setEditingId(null);
        setEditContent("");
        setEditMentions([]);
        await loadComments();
      } catch (err) {
        console.error("Failed to update comment:", err);
      } finally {
        setEditSubmitting(false);
      }
    },
    [
      scopeId,
      noteId,
      editContent,
      editMentions,
      editSubmitting,
      loadComments,
      svc,
    ],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        await svc.deleteComment(scopeId, noteId, commentId);
        setDeleteTarget(null);
        await loadComments();
      } catch (err) {
        console.error("Failed to delete comment:", err);
      }
    },
    [scopeId, noteId, loadComments, svc],
  );

  // ========== Reactions ==========

  const handleToggleReaction = useCallback(
    async (commentId: string, emoji: string) => {
      try {
        const response = await svc.toggleReaction(
          scopeId,
          noteId,
          commentId,
          emoji,
        );
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, reactions: response.reactions } : c,
          ),
        );
      } catch (err) {
        console.error("Failed to toggle reaction:", err);
      }
      setEmojiPickerCommentId(null);
      setEmojiPickerPos(null);
    },
    [scopeId, noteId, svc],
  );

  const openEmojiPicker = (commentId: string, buttonEl: HTMLButtonElement) => {
    if (emojiPickerCommentId === commentId) {
      setEmojiPickerCommentId(null);
      setEmojiPickerPos(null);
      return;
    }
    const rect = buttonEl.getBoundingClientRect();
    const pickerWidth = 210;
    const pickerHeight = 180;
    let left = rect.right - pickerWidth;
    let top = rect.bottom + 4;
    if (left < 8) left = 8;
    if (top + pickerHeight > window.innerHeight - 8) {
      top = rect.top - pickerHeight - 4;
    }
    setEmojiPickerPos({ top, left });
    setEmojiPickerCommentId(commentId);
    emojiTriggerRef.current = buttonEl;
  };

  // ========== Keyboard ==========

  const totalFilteredCount = filteredGroups.length + filteredMembers.length;

  const handleMentionNav = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    isEdit: boolean,
  ): boolean => {
    const isActive = isEdit ? editShowMentions : showMentions;
    if (!isActive || totalFilteredCount === 0) return false;
    const idx = isEdit ? editMentionIndex : mentionIndex;
    const setIdx = isEdit ? setEditMentionIndex : setMentionIndex;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((idx + 1) % totalFilteredCount);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((idx - 1 + totalFilteredCount) % totalFilteredCount);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (idx < filteredGroups.length) {
        insertGroupMention(filteredGroups[idx], isEdit);
      } else {
        insertMention(filteredMembers[idx - filteredGroups.length], isEdit);
      }
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (isEdit) setEditShowMentions(false);
      else setShowMentions(false);
      return true;
    }
    return false;
  };

  const handleNewKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (handleMentionNav(e, false)) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    commentId: string,
  ) => {
    if (e.nativeEvent.isComposing) return;
    if (handleMentionNav(e, true)) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleUpdate(commentId);
    }
    if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // ========== Sub-components ==========

  const MentionDropdown = ({ isEdit }: { isEdit: boolean }) => {
    const isActive = isEdit ? editShowMentions : showMentions;
    if (!isActive || totalFilteredCount === 0) return null;
    const idx = isEdit ? editMentionIndex : mentionIndex;
    const setIdx = isEdit ? setEditMentionIndex : setMentionIndex;
    let itemIdx = 0;
    return (
      <div className="absolute bottom-full left-0 mb-1 w-full bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-xl z-50 py-1 max-h-48 overflow-y-auto custom-scrollbar">
        {/* Groups */}
        {filteredGroups.map((group) => {
          const currentIdx = itemIdx++;
          return (
            <button
              key={`g-${group.id}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertGroupMention(group, isEdit);
              }}
              onMouseEnter={() => setIdx(currentIdx)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-muted-foreground ${currentIdx === idx ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
            >
              <div className="w-5 h-5 rounded-full bg-bridge-secondary/20 flex items-center justify-center">
                <Users className="w-3 h-3 text-bridge-secondary" />
              </div>
              <span className={currentIdx === idx ? "text-foreground" : ""}>
                {group.name}
              </span>
              <span className="text-xs text-slate-500 ml-auto">
                {group.members.length}명
              </span>
            </button>
          );
        })}
        {filteredGroups.length > 0 && filteredMembers.length > 0 && (
          <div className="border-t border-foreground/[0.08] my-1" />
        )}
        {/* Members */}
        {filteredMembers.map((member) => {
          const currentIdx = itemIdx++;
          return (
            <button
              key={member.user.id}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(member, isEdit);
              }}
              onMouseEnter={() => setIdx(currentIdx)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-muted-foreground ${currentIdx === idx ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
            >
              {member.user.profile_image ? (
                <img
                  src={member.user.profile_image}
                  alt={member.user.name || "프로필"}
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xs font-bold text-bridge-accent">
                  {member.user.name.charAt(0)}
                </div>
              )}
              <span>{member.user.name}</span>
              {member.user.id === currentUserId && (
                <span className="text-xs text-slate-500">(me)</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const EmojiPickerPortal = ({ commentId }: { commentId: string }) => {
    if (emojiPickerCommentId !== commentId || !emojiPickerPos) return null;
    return createPortal(
      <div
        ref={emojiPickerRef}
        style={{
          position: "fixed",
          top: emojiPickerPos.top,
          left: emojiPickerPos.left,
          zIndex: 9999,
        }}
        className="bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-xl p-2 min-w-[200px] pointer-events-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-4 gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleToggleReaction(commentId, emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-foreground/10 transition-all hover:scale-110 text-base"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );
  };

  const ReactionBar = ({ comment }: { comment: NoteCommentDetail }) => {
    const reactions = comment.reactions || [];
    if (reactions.length === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {reactions.map((reaction: CommentReactionResponse) => {
          const isMyReaction = reaction.users.some(
            (u) => u.id === currentUserId,
          );
          const tooltipNames = reaction.users
            .map((u) => (u.id === currentUserId ? "You" : u.name))
            .join(", ");

          return (
            <button
              key={reaction.emoji}
              onClick={() =>
                canEdit && handleToggleReaction(comment.id, reaction.emoji)
              }
              disabled={!canEdit}
              className={`group/reaction relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all
                ${
                  isMyReaction
                    ? "bg-bridge-accent/20 border border-bridge-accent/50 text-bridge-accent hover:bg-bridge-accent/30"
                    : "bg-foreground/5 border border-foreground/10 text-slate-400 hover:bg-foreground/10 hover:text-muted-foreground"
                }
                ${!canEdit ? "cursor-default" : "cursor-pointer"}
              `}
              title={tooltipNames}
            >
              {reaction.is_custom && reaction.image_url ? (
                <img
                  src={reaction.image_url}
                  alt={reaction.emoji}
                  className="w-4 h-4 object-contain"
                />
              ) : (
                <span className="text-xs">{reaction.emoji}</span>
              )}
              <span className="text-xs font-medium">{reaction.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // ========== Main Render ==========

  return (
    <div className="border-t border-foreground/10 bg-bridge-dark/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-3">
        <MessageSquare className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-bold text-foreground">댓글</span>
        {comments.length > 0 && (
          <span className="text-xs bg-bridge-accent/20 text-bridge-accent px-1.5 py-0.5 rounded-full font-bold">
            {comments.length}
          </span>
        )}
      </div>

      {/* Comment list */}
      <div className="px-6 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-bridge-accent" />
          </div>
        ) : comments.length === 0 && !canEdit ? (
          <div className="text-center py-6">
            <MessageSquare className="h-6 w-6 mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-500">아직 댓글이 없습니다</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {comments.map((comment) => {
              const isAuthor = currentUserId === comment.author.id;
              const isEditing = editingId === comment.id;
              const isEdited = comment.created_at !== comment.updated_at;
              const authorColor = getAssigneeClasses(comment.author.name);

              return (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="group py-3 border-b border-foreground/5 last:border-b-0"
                >
                  <div className="flex gap-2.5">
                    {/* Avatar */}
                    {comment.author.profile_image ? (
                      <img
                        src={comment.author.profile_image}
                        alt={comment.author.name || "프로필"}
                        className="h-7 w-7 rounded-full flex-shrink-0 mt-0.5"
                      />
                    ) : (
                      <div
                        className={`h-7 w-7 rounded-full ${authorColor.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        <span className="text-xs font-bold text-white">
                          {getInitials(comment.author.name)}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Author line */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-foreground">
                          {comment.author.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatRelativeTime(comment.created_at)}
                          {isEdited && " (수정됨)"}
                        </span>

                        {/* Actions */}
                        {canEdit && !isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                            <button
                              onClick={(e) =>
                                openEmojiPicker(comment.id, e.currentTarget)
                              }
                              className="p-1 rounded hover:bg-foreground/10 text-slate-500 hover:text-muted-foreground transition-colors"
                            >
                              <SmilePlus className="h-3 w-3" />
                            </button>
                            <EmojiPickerPortal commentId={comment.id} />

                            {isAuthor && (
                              <button
                                onClick={() => startEditing(comment)}
                                className="p-1 rounded hover:bg-foreground/10 text-slate-500 hover:text-muted-foreground transition-colors"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                            {isAuthor && (
                              <button
                                onClick={() => setDeleteTarget(comment.id)}
                                className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Content or Edit */}
                      {isEditing ? (
                        <div className="mt-1 space-y-2">
                          <div className="relative">
                            <MentionDropdown isEdit={true} />
                            <textarea
                              ref={editTextareaRef}
                              value={editContent}
                              onChange={handleEditContentChange}
                              onKeyDown={(e) =>
                                handleEditKeyDown(e, comment.id)
                              }
                              onBlur={() =>
                                setTimeout(
                                  () => setEditShowMentions(false),
                                  150,
                                )
                              }
                              className="w-full text-xs bg-foreground/5 border border-foreground/10 rounded-xl px-3 py-2 text-foreground placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 transition-all"
                              rows={3}
                              autoFocus
                            />
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={cancelEditing}
                              className="p-1 rounded hover:bg-foreground/10 text-slate-400 hover:text-muted-foreground transition-colors"
                              aria-label="닫기"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleUpdate(comment.id)}
                              disabled={editSubmitting || !editContent.trim()}
                              className="p-1 rounded hover:bg-bridge-accent/20 text-bridge-accent disabled:opacity-50 transition-colors"
                              aria-label="확인"
                            >
                              {editSubmitting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {renderContentWithMentions(
                              comment.content,
                              members,
                              mentionGroups,
                            )}
                          </p>
                          <ReactionBar comment={comment} />
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* New comment input */}
      {canEdit && (
        <div className="px-6 pb-4 pt-1 keyboard-sticky-bottom">
          <div className="relative">
            <MentionDropdown isEdit={false} />
            <textarea
              ref={textareaRef}
              value={newContent}
              onChange={handleNewContentChange}
              onKeyDown={handleNewKeyDown}
              onBlur={() => setTimeout(() => setShowMentions(false), 150)}
              placeholder="댓글을 입력하세요... (@로 멘션, Cmd+Enter로 전송)"
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-3 pr-12 text-sm text-foreground
                placeholder-slate-600 resize-none
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                transition-all"
              rows={2}
            />
            <div className="absolute right-2 bottom-2">
              <button
                onClick={handleSubmit}
                disabled={!newContent.trim() || submitting}
                className="p-1.5 rounded-lg bg-bridge-accent hover:bg-bridge-accent/80 text-white
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-bridge-obsidian rounded-2xl border border-foreground/10 p-6 shadow-2xl max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-foreground mb-2">
              댓글 삭제
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              이 댓글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-400 bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-all"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
