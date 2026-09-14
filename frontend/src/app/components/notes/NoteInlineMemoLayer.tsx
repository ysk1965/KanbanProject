import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { NoteCommentInput } from "./NoteCommentInput";
import { memberAPI, mentionGroupAPI } from "../../utils/api";
import type {
  MemberResponse,
  MentionGroupDetail,
  NoteCommentDetail,
  NoteCommentUpdateAnchorData,
} from "../../utils/api";
import {
  anchorFromRange,
  resolveAnchor,
  wrapRangeWithMarks,
  unwrapMarks,
  MEMO_MARK_CLASS,
} from "../../utils/noteAnchor";
import type { AnchorDraft } from "../../utils/noteAnchor";

const VIEW_SELECTOR = ".note-view-render";
const PENDING_ATTR = "data-pending";

/** Composer opened from outside the layer (BlockNote's formatting toolbar). */
export interface MemoComposerRequest {
  draft: AnchorDraft;
  /** viewport rect of the selected passage */
  rect: DOMRect;
  /** bump to re-open for a new selection */
  nonce: number;
}

interface NoteInlineMemoLayerProps {
  /** The `relative` wrapper around the view render (editorContainerRef). */
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * "view" — drag-select toolbar + DOM <mark> highlights.
   * "edit" — composer only: BlockNote's toolbar raises it and ProseMirror
   *          decorations draw the highlights (see noteMemoPm.ts).
   */
  mode: "view" | "edit";
  /** Inline memos are available at all (read mode renders, edit mode composes). */
  enabled: boolean;
  /** Changes whenever the view HTML is re-rendered → marks must be re-applied. */
  viewKey: string;
  threads: NoteCommentDetail[];
  canComment: boolean;
  boardId?: string;
  scopeId: string;
  activeCommentId: string | null;
  /** Bumped by the parent to scroll the active memo's highlight into view. */
  jumpNonce: number;
  onCreate: (
    draft: AnchorDraft,
    content: string,
    mentions: string[],
  ) => Promise<void>;
  onOpenThread: (commentId: string) => void;
  /** Re-anchoring result that differs from what the server holds. */
  onAnchorChanged: (
    commentId: string,
    update: NoteCommentUpdateAnchorData,
  ) => void;
  /** Edit mode: composer requested by the formatting toolbar. */
  request?: MemoComposerRequest | null;
  /** Edit mode: the composer closed (clear the provisional highlight). */
  onRequestClosed?: () => void;
}

interface Pos {
  top: number;
  left: number;
}

/**
 * Inline memo layer for the note's read mode: drag-select → floating toolbar
 * → popover composer → <mark> highlights that jump to the comment thread.
 *
 * Highlights are DOM-only (applied after render, never written into the note
 * content), so the stored HTML/JSON and the Yjs document stay untouched.
 */
export function NoteInlineMemoLayer({
  containerRef,
  mode,
  enabled,
  viewKey,
  threads,
  canComment,
  boardId,
  scopeId,
  activeCommentId,
  jumpNonce,
  onCreate,
  onOpenThread,
  onAnchorChanged,
  request,
  onRequestClosed,
}: NoteInlineMemoLayerProps) {
  const { t } = useTranslation();
  const isView = mode === "view";
  const [toolbarPos, setToolbarPos] = useState<Pos | null>(null);
  const [composerPos, setComposerPos] = useState<Pos | null>(null);
  const [draft, setDraft] = useState<AnchorDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [mentionGroups, setMentionGroups] = useState<MentionGroupDetail[]>([]);
  const membersLoaded = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const pendingRangeRef = useRef<Range | null>(null);
  const pendingMarksRef = useRef<HTMLElement[]>([]);
  // anchor updates already reported this session — avoid PUT storms on re-render
  const reportedRef = useRef<Set<string>>(new Set());

  const onRequestClosedRef = useRef(onRequestClosed);
  onRequestClosedRef.current = onRequestClosed;

  const getView = useCallback(
    () =>
      (containerRef.current?.querySelector(VIEW_SELECTOR) as HTMLElement | null) ??
      null,
    [containerRef],
  );

  const relPos = useCallback(
    (rect: DOMRect, below: boolean): Pos | null => {
      const host = containerRef.current;
      if (!host) return null;
      const base = host.getBoundingClientRect();
      const width = host.clientWidth;
      if (below) {
        const w = Math.min(360, width - 16);
        const left = Math.max(8, Math.min(rect.left - base.left, width - w - 8));
        return { top: rect.bottom - base.top + 8, left };
      }
      const cx = rect.left - base.left + rect.width / 2;
      return { top: rect.top - base.top - 8, left: Math.max(96, Math.min(cx, width - 96)) };
    },
    [containerRef],
  );

  const clearPending = useCallback(() => {
    const view = getView();
    if (view) {
      view
        .querySelectorAll<HTMLElement>(`mark.${MEMO_MARK_CLASS}[${PENDING_ATTR}]`)
        .forEach((m) => {
          const parent = m.parentNode;
          if (!parent) return;
          while (m.firstChild) parent.insertBefore(m.firstChild, m);
          parent.removeChild(m);
          parent.normalize();
        });
    }
    pendingMarksRef.current = [];
    pendingRangeRef.current = null;
  }, [getView]);

  const closeAll = useCallback(() => {
    setToolbarPos(null);
    setComposerPos(null);
    setDraft(null);
    clearPending();
    onRequestClosedRef.current?.();
  }, [clearPending]);

  // ── selection → toolbar (read mode only) ────────────────────────
  useEffect(() => {
    if (!enabled || !canComment || !isView) return;
    const check = () => {
      if (composerRef.current && composerPos) return; // composing: leave it
      const sel = window.getSelection();
      const view = getView();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !view) {
        setToolbarPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!view.contains(range.commonAncestorContainer)) {
        setToolbarPos(null);
        return;
      }
      const a = anchorFromRange(range);
      if (!a) {
        setToolbarPos(null);
        return;
      }
      pendingRangeRef.current = range.cloneRange();
      setDraft(a);
      setToolbarPos(relPos(range.getBoundingClientRect(), false));
    };
    const onUp = () => setTimeout(check, 0);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeAll();
        return;
      }
      if (e.shiftKey) setTimeout(check, 0);
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const tgt = e.target as Node;
      if (toolbarRef.current?.contains(tgt) || composerRef.current?.contains(tgt)) return;
      setToolbarPos(null);
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [enabled, canComment, isView, composerPos, getView, relPos, closeAll]);

  // ── composer raised by the edit-mode formatting toolbar ─────────
  const requestNonce = request?.nonce ?? 0;
  useEffect(() => {
    if (!requestNonce || !request || isView) return;
    setToolbarPos(null);
    setDraft(request.draft);
    setComposerPos(relPos(request.rect, true));
    ensureMembersRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestNonce, isView]);

  // Escape / outside click closes the edit-mode composer too
  useEffect(() => {
    if (isView || !composerPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isView, composerPos, closeAll]);

  // leaving view mode drops any in-progress memo
  useEffect(() => {
    if (!enabled) closeAll();
  }, [enabled, closeAll]);

  // ── marks for saved memos (read mode; edit mode uses decorations) ──
  useEffect(() => {
    const view = getView();
    if (!view) return;
    unwrapMarks(view);
    if (!enabled || !isView) return;
    for (const th of threads) {
      if (!th.anchor || th.parent_id) continue;
      const res = resolveAnchor(view, th.block_id, th.anchor);
      if (!res) {
        if (th.anchor_status !== "ORPHANED") {
          const key = `${th.id}:orphan`;
          if (!reportedRef.current.has(key)) {
            reportedRef.current.add(key);
            onAnchorChanged(th.id, { status: "ORPHANED" });
          }
        }
        continue;
      }
      wrapRangeWithMarks(res.range, {
        "data-comment-id": th.id,
        "data-resolved": th.is_resolved ? "true" : "false",
      });
      if (res.moved || th.anchor_status === "ORPHANED") {
        const key = `${th.id}:${res.blockId}:${res.start}:${res.end}`;
        if (!reportedRef.current.has(key)) {
          reportedRef.current.add(key);
          onAnchorChanged(th.id, {
            status: "ATTACHED",
            block_id: res.blockId,
            anchor: {
              text: th.anchor.text,
              prefix: th.anchor.prefix ?? "",
              suffix: th.anchor.suffix ?? "",
              start: res.start,
              end: res.end,
            },
          });
        }
      }
    }
    // re-apply pending mark if a composer is open (view re-rendered underneath)
    if (pendingRangeRef.current && composerPos) {
      try {
        pendingMarksRef.current = wrapRangeWithMarks(pendingRangeRef.current, {
          [PENDING_ATTR]: "true",
        });
      } catch {
        /* range detached by re-render — composer keeps the quote */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isView, viewKey, threads, getView]);

  // ── active highlight + jump ─────────────────────────────────────
  useEffect(() => {
    const view = getView();
    if (!view) return;
    view.querySelectorAll<HTMLElement>(`mark.${MEMO_MARK_CLASS}`).forEach((m) => {
      m.classList.toggle("is-active", !!activeCommentId && m.dataset.commentId === activeCommentId);
    });
  }, [activeCommentId, threads, viewKey, getView]);

  useEffect(() => {
    if (!jumpNonce || !activeCommentId || !isView) return;
    const view = getView();
    const mark = view?.querySelector<HTMLElement>(
      `mark.${MEMO_MARK_CLASS}[data-comment-id="${CSS.escape(activeCommentId)}"]`,
    );
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      mark.classList.add("is-flash");
      const timer = setTimeout(() => mark.classList.remove("is-flash"), 1400);
      return () => clearTimeout(timer);
    }
    toast.info(t("notes.inlineMemo.orphanToast", "원문 위치를 찾을 수 없어요. 본문이 바뀌었을 수 있습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpNonce]);

  // ── click on a highlight → open its thread ─────────────────────
  useEffect(() => {
    const view = getView();
    if (!view) return;
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement).closest?.(
        `mark.${MEMO_MARK_CLASS}`,
      ) as HTMLElement | null;
      if (!mark || mark.hasAttribute(PENDING_ATTR)) return;
      const id = mark.dataset.commentId;
      if (id) onOpenThread(id);
    };
    view.addEventListener("click", onClick);
    return () => view.removeEventListener("click", onClick);
  }, [viewKey, getView, onOpenThread]);

  // ── toolbar actions ────────────────────────────────────────────
  const ensureMembersRef = useRef<() => void>(() => {});

  const ensureMembers = useCallback(async () => {
    if (membersLoaded.current || !boardId) return;
    membersLoaded.current = true;
    try {
      const data = await memberAPI.getMembers(boardId);
      setMembers(data.members || []);
    } catch {
      /* mentions unavailable */
    }
    try {
      const groups = await mentionGroupAPI.getGroups(boardId);
      setMentionGroups(groups.groups || []);
    } catch {
      /* optional */
    }
  }, [boardId]);
  ensureMembersRef.current = ensureMembers;

  const openComposer = useCallback(() => {
    const range = pendingRangeRef.current;
    if (!range || !draft) return;
    setToolbarPos(null);
    clearPending();
    pendingRangeRef.current = range;
    try {
      pendingMarksRef.current = wrapRangeWithMarks(range, { [PENDING_ATTR]: "true" });
    } catch {
      pendingMarksRef.current = [];
    }
    window.getSelection()?.removeAllRanges();
    const rect =
      pendingMarksRef.current[pendingMarksRef.current.length - 1]?.getBoundingClientRect() ??
      range.getBoundingClientRect();
    setComposerPos(relPos(rect, true));
    ensureMembers();
  }, [draft, clearPending, relPos, ensureMembers]);

  const handleCopy = useCallback(async () => {
    const text = pendingRangeRef.current?.toString() ?? draft?.text ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error(t("notes.inlineMemo.copyFailed", "복사하지 못했습니다"));
    }
  }, [draft, t]);

  const handleSubmit = useCallback(
    async (content: string, mentions: string[]) => {
      if (!draft) return;
      await onCreate(draft, content, mentions);
      closeAll();
    },
    [draft, onCreate, closeAll],
  );

  if (!enabled) return null;

  return (
    <>
      {isView && toolbarPos && draft && !composerPos && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={t("notes.inlineMemo.toolbar", "선택한 문장")}
          className="absolute z-20 flex items-center gap-0.5 p-1 rounded-xl bg-bridge-obsidian border border-foreground/10 shadow-2xl -translate-x-1/2 -translate-y-full"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={openComposer}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            {t("notes.inlineMemo.add", "메모 남기기")}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? t("notes.copied", "복사됨") : t("common.copy", "복사")}
          </button>
        </div>
      )}

      {composerPos && draft && (
        <div
          ref={composerRef}
          role="dialog"
          aria-label={t("notes.inlineMemo.composer", "인라인 메모 작성")}
          className="absolute z-30 w-[360px] max-w-[calc(100%-16px)] rounded-2xl bg-bridge-obsidian border border-foreground/10 shadow-2xl overflow-hidden"
          style={{ top: composerPos.top, left: composerPos.left }}
        >
          <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
          <div className="flex items-start gap-2 px-4 pt-3">
            <blockquote className="flex-1 min-w-0 text-xs text-slate-400 border-l-2 border-bridge-accent pl-2.5 line-clamp-2 break-words">
              {draft.text}
            </blockquote>
            <button
              type="button"
              onClick={closeAll}
              className="p-1 -mr-1 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label={t("common.close", "닫기")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 pb-3 pt-2">
            <NoteCommentInput
              boardId={scopeId}
              members={members}
              mentionGroups={mentionGroups}
              autoFocus
              placeholder={t("notes.inlineMemo.placeholder", "이 문장에 대한 메모… @로 멘션")}
              onSubmit={handleSubmit}
              onCancel={closeAll}
            />
          </div>
        </div>
      )}
    </>
  );
}
