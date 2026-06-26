import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  Suspense,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  Clock,
  Loader2,
  Tag as TagIcon,
  Sparkles,
  Check,
  X,
  MessageSquare,
  Cloud,
  CloudUpload,
  CloudOff,
  Pencil,
  Eye,
  DoorOpen,
  Users,
  Info,
  ChevronRight,
  Minus,
  ListTree,
  Link2,
  Columns2,
  Columns3,
  FileDown,
  RotateCcw,
  Heart,
  Folder,
} from "lucide-react";

const ExcalidrawEditor = React.lazy(() => import("./ExcalidrawEditor"));
import { filterSuggestionItems, insertOrUpdateBlock } from "@blocknote/core";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  TableHandlesController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { NoteTagManager } from "./NoteTagManager";
import { NoteVersionHistory } from "./NoteVersionHistory";
import { NoteAIInlineSection } from "./NoteAIInlineSection";
import { NoteCommentSidebar } from "./NoteCommentSidebar";
import { CollabPresence } from "./CollabPresence";
import { useAuth } from "../../contexts/AuthContext";
import { noteSchema as schema } from "./blocks/schema";
import { formatDateTime } from "../../utils/dateUtils";
import { useTheme } from "../../contexts/ThemeContext";
import {
  fileAPI,
  noteAPI,
  memberAPI,
  orgNoteAPI,
  resolveFileUrl,
} from "../../utils/api";
import { blockNoteDictionary } from "../../utils/blocknoteLocale";
import {
  loadIntoEditor,
  serializeForSave,
  contentToHtml,
  contentToMarkdown,
  unwrapListItemParagraphs,
  stripEmptyParagraphs,
  collapseInterBlockWhitespace,
  plainTextListToHtml,
} from "../../utils/blocknoteContent";
import DOMPurify from "dompurify";
import type {
  NoteDetail,
  NoteTagInfo,
  NoteAISuggestionResponse,
  NoteTreeItem,
} from "../../utils/api";
import { NoteShareButton } from "./NoteShareButton";
import { NoteBottomComments } from "./NoteBottomComments";
import { IconButton } from "../ui/IconButton";
import type { CollaborationState } from "../../hooks/useCollaboration";

export interface BreadcrumbItem {
  id: string;
  title: string;
  type: "FOLDER" | "DOCUMENT" | "BOARD";
}

interface NoteEditorProps {
  boardId?: string;
  orgId?: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  loading: boolean;
  canEdit: boolean;
  onSave: (
    noteId: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    createVersion?: boolean,
  ) => void;
  onTagsChange: () => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  onCollabReset?: () => void;
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
  breadcrumbs?: BreadcrumbItem[];
  onBreadcrumbClick?: (noteId: string) => void;
}

export function NoteEditor({
  boardId,
  orgId,
  note,
  tags,
  loading,
  canEdit,
  onSave,
  onTagsChange,
  onNoteUpdate,
  onCollabReset,
  collaboration,
  currentUserName,
  currentUserColor,
  breadcrumbs,
  onBreadcrumbClick,
}: NoteEditorProps) {
  // Show brief loading while collaboration provider initializes
  if (
    loading ||
    (collaboration &&
      collaboration.status === "connecting" &&
      !collaboration.provider)
  ) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (note.type === "FOLDER") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
        <p className="text-sm">{/* Folder selected */}폴더가 선택되었습니다</p>
        <p className="text-xs mt-1 text-slate-600">
          문서를 선택하여 편집하세요
        </p>
      </div>
    );
  }

  if (note.type === "BOARD") {
    return (
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        }
      >
        <ExcalidrawEditor
          boardId={boardId}
          orgId={orgId}
          note={note}
          tags={tags}
          canEdit={canEdit}
          onSave={onSave}
          onTagsChange={onTagsChange}
          onNoteUpdate={onNoteUpdate}
          collaboration={collaboration}
          currentUserName={currentUserName}
          currentUserColor={currentUserColor}
        />
      </Suspense>
    );
  }

  // collaboration이 아직 준비 안 됐으면 스피너 — 협업이 항상 활성화돼야 정상 동작.
  if (!collaboration) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <CollabNoteEditor
      boardId={boardId}
      orgId={orgId}
      note={note}
      tags={tags}
      canEdit={canEdit}
      onSave={onSave}
      onTagsChange={onTagsChange}
      onNoteUpdate={onNoteUpdate}
      onCollabReset={onCollabReset}
      collaboration={collaboration}
      currentUserName={currentUserName}
      currentUserColor={currentUserColor}
      breadcrumbs={breadcrumbs}
      onBreadcrumbClick={onBreadcrumbClick}
    />
  );
}

/* ============================================================
 * Collaborative Editor (Yjs-powered)
 * ============================================================ */

interface CollabEditorProps {
  boardId?: string;
  orgId?: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (
    noteId: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    createVersion?: boolean,
  ) => void;
  onTagsChange: () => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  onCollabReset?: () => void;
  collaboration: CollaborationState;
  currentUserName: string;
  currentUserColor: string;
  breadcrumbs?: BreadcrumbItem[];
  onBreadcrumbClick?: (noteId: string) => void;
}

function CollabNoteEditor({
  boardId,
  orgId,
  note,
  tags,
  canEdit,
  onSave,
  onTagsChange,
  onNoteUpdate,
  onCollabReset,
  collaboration,
  currentUserName,
  currentUserColor,
  breadcrumbs,
  onBreadcrumbClick,
}: CollabEditorProps) {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const dictionary = useMemo(
    () => blockNoteDictionary(i18n.language),
    [i18n.language],
  );
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  // Bumped when the collab stack is force-rebuilt while EDIT stays mounted
  // (version restore) so BlockNoteView remounts cleanly with the new editor
  // instead of swapping editor instances on a live view.
  const [editorGen, setEditorGen] = useState(0);
  // Whether a discarded draft is archived and restorable (되돌리기). Only ever
  // true in VIEW mode with no live unpublished draft.
  const [hasDiscardedDraft, setHasDiscardedDraft] = useState(false);
  // Surgical gate: true only during the synchronous replaceBlocks() call that
  // hydrates the editor from the published snapshot. handleEditorChange uses
  // this to ignore the onChange that hydration fires, without freezing user
  // input for an arbitrary timer window the way the old isInitializedRef did.
  const hydratingRef = useRef(false);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror of `mode` for use inside long-lived callbacks (provider.onSynced)
  // that subscribe once and must not re-subscribe on every mode flip.
  const modeRef = useRef<"view" | "edit">(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Sync collab readOnly + awareness mode field whenever local mode changes.
  // View clients never broadcast doc updates, never auto-save, and surface
  // themselves to peers as readers rather than editors.
  useEffect(() => {
    if (!collaboration) return;
    collaboration.provider.setReadOnly(mode === "view");
    collaboration.provider.awareness.setLocalStateField("mode", mode);
  }, [mode, collaboration]);

  // Reset to view mode whenever the note changes
  useEffect(() => {
    setMode("view");
  }, [note.id]);

  // Refetch note detail when another editor publishes a snapshot, but only
  // when we're a View client. Edit clients already have the latest Yjs state.
  useEffect(() => {
    if (!collaboration) return;
    return collaboration.provider.onSnapshotUpdated(async () => {
      if (mode !== "view") return;
      try {
        const { noteService, orgNoteService } =
          await import("../../utils/services");
        const updated = boardId
          ? await noteService.getDetail(boardId, note.id)
          : orgId
            ? await orgNoteService.getDetail(orgId, note.id)
            : null;
        if (updated) {
          onNoteUpdate?.(updated);
          setTitle(updated.title);
        }
      } catch (err) {
        console.error("Failed to refetch note after snapshot update:", err);
      }
    });
  }, [collaboration, mode, note.id, boardId, orgId, onNoteUpdate]);

  // In VIEW mode, ask the server whether a restorable discarded draft exists so
  // we can offer 되돌리기. Only meaningful when there's no live unpublished draft.
  useEffect(() => {
    let cancelled = false;
    if (mode !== "view" || !canEdit || note.has_unpublished_draft) {
      setHasDiscardedDraft(false);
      return;
    }
    (async () => {
      try {
        const res = boardId
          ? await noteAPI.hasArchivedDraft(boardId, note.id)
          : orgId
            ? await orgNoteAPI.hasArchivedDraft(orgId, note.id)
            : null;
        if (!cancelled) setHasDiscardedDraft(!!res?.available);
      } catch {
        if (!cancelled) setHasDiscardedDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, canEdit, note.has_unpublished_draft, note.id, boardId, orgId]);

  const editorPeers = useMemo(
    () => collaboration.connectedUsers.filter((u) => u.mode === "edit"),
    [collaboration.connectedUsers],
  );

  const syncDisplay = useMemo(() => {
    if (mode === "view") return "view" as const;
    if (collaboration.status === "disconnected") return "offline" as const;
    if (collaboration.status === "connecting") return "connecting" as const;
    if (hasChanges) return "syncing" as const;
    return "saved" as const;
  }, [collaboration.status, hasChanges, mode]);

  // Comment state
  const [showComments, setShowComments] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [commentBlockIds, setCommentBlockIds] = useState<Set<string>>(
    new Set(),
  );
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{
    id: string;
    top: number;
  } | null>(null);
  const hoveredBlockIdRef = useRef<string | null>(null);
  const commentsPanelRef = useRef<HTMLDivElement>(null);

  // AI state
  const [aiData, setAiData] = useState<NoteAISuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiContentSnapshot, setAiContentSnapshot] = useState<string | null>(
    note.ai_content_snapshot,
  );

  // Create BlockNote editor with Yjs collaboration
  const editor = useCreateBlockNote(
    {
      schema,
      dictionary,
      trailingBlock: true,
      tabBehavior: "prefer-indent",
      animations: true,
      defaultStyles: true,
      resolveFileUrl: async (url: string) => resolveFileUrl(url),
      collaboration: {
        provider: collaboration.provider,
        fragment: collaboration.fragment,
        user: {
          name: currentUserName,
          color: currentUserColor,
        },
      },
      uploadFile: async (file: File) => {
        const result = await fileAPI.uploadNote(
          file,
          boardId ? { boardId } : { organizationId: orgId! },
        );
        return result.url;
      },
      tables: {
        cellBackgroundColor: true,
        cellTextColor: true,
        headers: true,
        splitCells: true,
      },
      // Narrow paste guard: only normalize <li><p>…</p></li> markup before
      // delegating to BlockNote's default pipeline. This fixes round-trip from
      // our static VIEW HTML *and* external sources (Notion/Word/Google Docs)
      // that emit the same pattern, which otherwise yields empty parent list
      // items with the text nested one level deeper. Plain text containing
      // list markers ("- ", "1. ") is converted to list HTML; all other MIME
      // types (text/markdown, Files) fall through to the default handler — no
      // inter-block whitespace tampering, so the blank-line regression that
      // motivated e5f4628 does not return.
      pasteHandler: ({
        event,
        editor: e,
        defaultPasteHandler,
      }: {
        event: ClipboardEvent;
        editor: any;
        defaultPasteHandler: () => boolean;
      }) => {
        const data = event.clipboardData;
        if (!data) return defaultPasteHandler();
        // VS Code, plain markdown, and Files MIMEs go straight to default.
        if (
          data.getData("vscode-editor-data") ||
          data.getData("text/markdown")
        ) {
          return defaultPasteHandler();
        }
        // Three-pass cleanup applied to both internal (blocknote/html, raw=true)
        // and external (text/html) HTML — both routes call tryParseHTMLToBlocks
        // under the hood, and both inherit the same parser quirks:
        //   1) unwrapListItemParagraphs — strips <li><p>…</p></li> down to
        //      <li>…</li> so BlockNote does not create an empty parent list
        //      item with a nested paragraph child (the '목록' placeholder bug).
        //   2) stripEmptyParagraphs — drops <p></p> / <p><br></p> /
        //      <p>&nbsp;</p> emitted by Word, Google Docs, Notion, and our own
        //      blocksToHTMLLossy, which otherwise materialize as blank blocks.
        //   3) collapseInterBlockWhitespace — eats the newlines / indentation
        //      BlockNote's own serializer puts BETWEEN block tags. Without
        //      this, internal note→note paste re-imports each block separated
        //      by a real empty paragraph block (the "every block becomes its
        //      own line" symptom).
        const cleanHtml = (raw: string): string =>
          collapseInterBlockWhitespace(
            stripEmptyParagraphs(unwrapListItemParagraphs(raw)),
          );

        const bnHtml = data.getData("blocknote/html");
        if (bnHtml) {
          const cleaned = cleanHtml(bnHtml);
          if (cleaned === bnHtml) return defaultPasteHandler();
          // raw=true preserves BlockNote's own structure markers.
          e.pasteHTML(cleaned, true);
          return true;
        }
        const html = data.getData("text/html");
        if (!html) {
          // Plain text only: lines starting with "- " / "* " / "1. " would all
          // become paragraph blocks with the marker as literal text. Convert
          // them to list HTML so they paste as real list item blocks.
          const listHtml = plainTextListToHtml(data.getData("text/plain"));
          if (listHtml) {
            e.pasteHTML(listHtml);
            return true;
          }
          return defaultPasteHandler();
        }
        const cleaned = cleanHtml(html);
        if (cleaned === html) return defaultPasteHandler();
        e.pasteHTML(cleaned);
        return true;
      },
    } as any,
    [collaboration.fragment],
  );

  // VIEW mode renders the published snapshot as static HTML rather than
  // mounting a second BlockNoteView. This:
  //   1) Preserves the snapshot-isolation invariant: viewers see only the last
  //      published `notes.content`, never live unpublished Yjs state from other
  //      Edit-mode peers.
  //   2) Avoids a full ProseMirror DOM tree + React subtree on every render —
  //      cheaper memory + faster initial paint on heavy notes.
  // The `viewConverter` editor is a throwaway used solely for JSON→HTML
  // serialization; it does not mount via BlockNoteView.
  const viewConverter = useCreateBlockNote({
    schema,
    resolveFileUrl: async (url: string) => resolveFileUrl(url),
  } as any);
  const [viewHtml, setViewHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const html = await contentToHtml(viewConverter as any, note.content);
      if (!cancelled) setViewHtml(html);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewConverter, note.content]);

  // Hydrate the Y.Doc from the published snapshot exactly once, when the
  // initial server sync completes AND the Yjs state is still empty. This
  // replaces an arbitrary 500ms setTimeout that raced with user typing: any
  // keystroke before the timer fired would be either lost (overwritten by the
  // late replaceBlocks) or block hydration (the empty check failed because the
  // doc now contained a stray character). The server now always emits
  // MSG_SYNC_FULL on connect (even with empty stored state), so provider's
  // onSynced fires reliably for every note.
  const initialContentLoaded = useRef(false);
  useEffect(() => {
    if (!editor || !collaboration) return;
    let cancelled = false;
    const unsubscribe = collaboration.provider.onSynced(async () => {
      if (cancelled || initialContentLoaded.current) return;
      const doc = editor.document;
      const isEmpty =
        doc.length === 1 &&
        doc[0].type === "paragraph" &&
        (!doc[0].content || doc[0].content.length === 0);
      if (!isEmpty || !note.content?.trim()) {
        initialContentLoaded.current = true;
        return;
      }
      // Skip hydration while in VIEW mode — BlockNoteView is not mounted, so
      // editor.replaceBlocks() dispatches a PM transaction without an
      // EditorView. y-prosemirror's sync plugin only translates PM
      // transactions into Y.Doc ops via its view-bound `update` callback, so
      // a view-less replaceBlocks leaves tiptap state populated but the Y.Doc
      // still empty. When the user later enters EDIT mode, the freshly-
      // mounted view runs `_forceRerender` which rebuilds PM from the empty
      // Y.Doc — wiping the hydrated content and showing a blank editor.
      // The edit-mode hydration effect below re-runs once the view is up.
      if (modeRef.current !== "edit") return;
      hydratingRef.current = true;
      try {
        const ok = await loadIntoEditor(editor, note.content);
        if (ok) initialContentLoaded.current = true;
        // Intentionally do NOT sendFullState here. Hydrating the Y.Doc from the
        // published snapshot is purely a local view of the current state —
        // persisting it would create a draft row whose content equals the
        // published snapshot, which then trips hasUnpublishedDraft and
        // resurrects the banner after a discard. The first real user edit
        // triggers sendFullState via the doc update debounce.
      } finally {
        hydratingRef.current = false;
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [editor, note.content, collaboration]);

  // Edit-mode hydration: re-run the empty-Y.Doc check once BlockNoteView has
  // actually mounted. Required for the "discard from VIEW → enter EDIT" path,
  // where the initial-content useEffect above skips itself (no view yet) and
  // would otherwise leave the editor blank. rAF defers to after React commits
  // the BlockNoteView so y-prosemirror's view callback has attached its
  // EditorView reference — only then does replaceBlocks() propagate to Y.Doc.
  useEffect(() => {
    if (mode !== "edit" || !editor || !note.content?.trim()) return;
    if (initialContentLoaded.current || hydratingRef.current) return;
    const raf = requestAnimationFrame(async () => {
      const doc = editor.document;
      const isEmpty =
        doc.length === 1 &&
        doc[0].type === "paragraph" &&
        (!doc[0].content || doc[0].content.length === 0);
      if (!isEmpty) {
        initialContentLoaded.current = true;
        return;
      }
      hydratingRef.current = true;
      try {
        const ok = await loadIntoEditor(editor, note.content);
        if (ok) initialContentLoaded.current = true;
      } finally {
        hydratingRef.current = false;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mode, editor, note.content]);

  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    };
  }, [note.id, mode]);

  // Sync title when note changes
  useEffect(() => {
    setTitle(note.title);
    setHasChanges(false);
    initialContentLoaded.current = false;
    hydratingRef.current = false;

    // Reset AI state
    setAiData(null);
    setAiLoading(false);
    setAiError(null);
    setAiVisible(false);
    setAiCollapsed(false);
    setAiContentSnapshot(note.ai_content_snapshot);
    if (note.ai_suggestions) {
      try {
        setAiData(JSON.parse(note.ai_suggestions));
      } catch {
        /* ignore */
      }
    }
  }, [note.id]);

  // Slash menu items - custom items use unique group names to avoid duplicate key warnings
  const slashMenuItems = useMemo(
    () => [
      ...getDefaultReactSlashMenuItems(editor),
      {
        title: "Callout",
        subtext: "Highlighted callout box",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "callout" as any }),
        aliases: ["callout", "panel", "info", "warning", "notice"],
        group: "Custom blocks",
        icon: <Info size={16} />,
      },
      {
        title: "Toggle List",
        subtext: "Collapsible toggle list",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "toggle" as any }),
        aliases: ["toggle", "collapsible", "dropdown", "accordion"],
        group: "Custom blocks",
        icon: <ChevronRight size={16} />,
      },
      {
        title: "Divider",
        subtext: "Horizontal divider line",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "divider" as any }),
        aliases: ["divider", "separator", "hr", "line"],
        group: "Custom blocks",
        icon: <Minus size={16} />,
      },
      {
        title: "Table of Contents",
        subtext: "Auto-generated from headings",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "tableOfContents" as any }),
        aliases: ["toc", "table of contents", "outline", "index"],
        group: "Custom blocks",
        icon: <ListTree size={16} />,
      },
      {
        title: "Embed",
        subtext: "YouTube, Vimeo, or any link",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "embed" as any }),
        aliases: [
          "embed",
          "youtube",
          "vimeo",
          "bookmark",
          "link card",
          "iframe",
        ],
        group: "Custom blocks",
        icon: <Link2 size={16} />,
      },
      {
        title: "2 Columns",
        subtext: "Side-by-side layout",
        onItemClick: () =>
          insertOrUpdateBlock(editor, {
            type: "columnLayout" as any,
            props: { columns: 2 },
            children: [
              { type: "column" as any, children: [{ type: "paragraph" }] },
              { type: "column" as any, children: [{ type: "paragraph" }] },
            ],
          }),
        aliases: [
          "columns",
          "2columns",
          "two columns",
          "layout",
          "side by side",
        ],
        group: "Advanced",
        icon: <Columns2 size={16} />,
      },
      {
        title: "3 Columns",
        subtext: "Three-column layout",
        onItemClick: () =>
          insertOrUpdateBlock(editor, {
            type: "columnLayout" as any,
            props: { columns: 3 },
            children: [
              { type: "column" as any, children: [{ type: "paragraph" }] },
              { type: "column" as any, children: [{ type: "paragraph" }] },
              { type: "column" as any, children: [{ type: "paragraph" }] },
            ],
          }),
        aliases: ["3columns", "three columns", "triple"],
        group: "Advanced",
        icon: <Columns3 size={16} />,
      },
    ],
    [editor],
  );

  // @mention: lazy-fetch members from whichever scope the note belongs to.
  // Normalised shape: { id, name, email, profile_image }.
  type MentionMember = {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  const membersCache = useRef<MentionMember[] | null>(null);
  const getMentionItems = useCallback(
    async (query: string) => {
      if (!membersCache.current) {
        try {
          if (boardId) {
            const data = await memberAPI.getMembers(boardId);
            membersCache.current = data.members.map((m) => ({
              id: m.user.id,
              name: m.user.name,
              email: m.user.email,
              profile_image: m.user.profile_image ?? null,
            }));
          } else if (orgId) {
            // Page large enough to cover typical org rosters; backend caps further.
            const { organizationAPI } = await import("../../utils/api");
            const page = await organizationAPI.getMembers(orgId, { size: 500 });
            membersCache.current = page.content.map((m) => ({
              id: m.user.id,
              name: m.user.name,
              email: m.user.email,
              profile_image: m.user.profile_image ?? null,
            }));
          } else {
            membersCache.current = [];
          }
        } catch {
          membersCache.current = [];
        }
      }
      const items = (membersCache.current || []).map((m) => ({
        title: m.name,
        onItemClick: () => {
          editor.insertInlineContent([
            { type: "mention" as any, props: { user: m.name } },
            " ",
          ]);
        },
        aliases: [m.email],
        group: "Members",
        icon: m.profile_image ? (
          <img
            src={m.profile_image}
            alt={m.name || "프로필"}
            className="bn-mention-avatar"
          />
        ) : (
          <span className="bn-mention-avatar-fallback">{m.name.charAt(0)}</span>
        ),
      }));
      return filterSuggestionItems(items, query);
    },
    [boardId, orgId, editor],
  );

  useEffect(() => {
    if (!hasChanges) return;
    const timer = setTimeout(() => setHasChanges(false), 2000);
    return () => clearTimeout(timer);
  }, [hasChanges]);

  const handleTitleChange = (newTitle: string) => {
    if (mode !== "edit") return;
    setTitle(newTitle);
    setHasChanges(true);

    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      if (newTitle.trim() && newTitle !== note.title) {
        onSave(note.id, { title: newTitle }, false);
      }
    }, 800);
  };

  const handleEditorChange = useCallback(() => {
    if (hydratingRef.current) return;
    if (mode !== "edit") return;
    setHasChanges(true);
  }, [mode]);

  // Save current state as a published snapshot: persist Yjs state + write
  // notes.content + create a NoteVersion row. This is what View users see.
  //
  // Storage format is BlockNote JSON (Block[]). JSON is lossless, round-trip
  // safe, and preserves custom-block props (Callout type, Embed url, etc.) that
  // blocksToHTMLLossy used to drop or corrupt on re-parse. The backend remains
  // format-agnostic — content is opaque to it (AI consumers detect JSON by
  // leading '[' and walk the block tree instead of stripping HTML).
  const getContentForSave = useCallback((): string => {
    return serializeForSave(editor);
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!canEdit || mode !== "edit") return;
    setSaving(true);
    try {
      collaboration.provider.sendFullState();
      const json = getContentForSave();
      await onSave(
        note.id,
        {
          title: title !== note.title ? title : undefined,
          content: json,
          tagIds: note.tags.map((t) => t.id),
        },
        true,
      );
      // Update VIEW mode's static HTML preview immediately so the snapshot
      // shows without waiting for the note.content prop useEffect.
      const html = await contentToHtml(viewConverter as any, json);
      setViewHtml(html);
      initialContentLoaded.current = true;
      setHasChanges(false);
      setMode("view");
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    mode,
    collaboration.provider,
    getContentForSave,
    onSave,
    note.id,
    note.title,
    title,
    note.tags,
    viewConverter,
  ]);

  const handleEnterEdit = useCallback(() => {
    if (!canEdit) return;
    setMode("edit");
  }, [canEdit]);

  // Copy current note as Markdown. EDIT mode sources from the live Yjs-bound
  // editor (includes unpublished changes); VIEW mode sources from the
  // published snapshot via the throwaway viewConverter editor.
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const handleCopyMarkdown = useCallback(async () => {
    try {
      let md: string;
      if (mode === "edit") {
        md = await editor.blocksToMarkdownLossy(editor.document);
      } else {
        md = await contentToMarkdown(viewConverter as any, note.content);
      }
      await navigator.clipboard.writeText(md);
      setMarkdownCopied(true);
      window.setTimeout(() => setMarkdownCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy markdown:", err);
    }
  }, [mode, editor, viewConverter, note.content]);

  // Leave edit mode without publishing. Yjs state remains on the server so the
  // next editor picks up where we left off; View users keep seeing the last
  // published snapshot until someone hits Save.
  const handleExitEdit = useCallback(() => {
    try {
      collaboration.provider.sendFullState();
    } catch (err) {
      console.error("Failed to persist draft on exit:", err);
    }
    if (titleSaveTimerRef.current) {
      clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    setMode("view");
    setHasChanges(false);
  }, [collaboration.provider]);

  // Discard the unpublished draft so EDIT mode reflects the published snapshot
  // again. Three things must happen for the discard to "stick":
  //   1) server-side note_collab_states row deleted (handled by backend)
  //   2) ws room's in-memory storedState cleared via NoteDraftDiscardedEvent
  //   3) THIS client's local Y.Doc reset — we do this by recreating the entire
  //      Y.Doc / provider / editor stack via onCollabReset. Mutating the
  //      existing Yjs-bound `editor` with replaceBlocks is unreliable here
  //      because in VIEW mode the editor's ProseMirror EditorView is either
  //      never mounted (no prior EDIT entry) or already destroyed (after an
  //      EDIT → VIEW transition), so dispatched transactions hit a dangling
  //      view and the y-prosemirror binding cannot translate them cleanly to
  //      Y.Doc ops, leaving Y.Doc + editor._state diverged. The next EDIT
  //      entry then renders an empty or inconsistent doc.
  //   After the reset, the fresh Y.Doc is empty and the initial-content
  //   useEffect (line ~508) re-hydrates the editor from note.content.
  // Other connected EDIT clients still hold their own Y.Doc copy; we surface a
  // warning so the user understands their writes will win.
  const handleDiscardDraft = useCallback(async () => {
    // BLOCK (not just warn) while others are actively editing: the draft is a
    // single shared row, so discarding it mid-edit destroys their work and the
    // outcome is non-deterministic (their next sync resurrects or forks it).
    const activeEditors = collaboration.connectedUsers.filter(
      (u) => u.mode === "edit",
    ).length;
    if (activeEditors > 0) {
      window.alert(
        t(
          "notes.unpublishedDraft.blockDiscardWithEditors",
          "다른 사용자가 편집 중이라 폐기할 수 없어요. 모두 편집을 마친 뒤 다시 시도해 주세요.",
        ),
      );
      return;
    }
    if (
      !window.confirm(
        t(
          "notes.unpublishedDraft.confirmDiscard",
          "이 노트의 미발행 수정 내용을 폐기할까요? 폐기해도 ‘되돌리기’로 복구할 수 있어요.",
        ),
      )
    )
      return;
    try {
      if (boardId) await noteAPI.discardDraft(boardId, note.id);
      else if (orgId) await orgNoteAPI.discardDraft(orgId, note.id);
      const { noteService, orgNoteService } =
        await import("../../utils/services");
      const updated = boardId
        ? await noteService.getDetail(boardId, note.id)
        : orgId
          ? await orgNoteService.getDetail(orgId, note.id)
          : null;
      if (updated) onNoteUpdate?.(updated);
      // A restorable archive now exists — surface 되돌리기 immediately.
      setHasDiscardedDraft(true);
      // Reset hydration refs so the initial-content useEffect re-runs against
      // the new editor instance. Without this, the early-return at the top of
      // that effect (initialContentLoaded.current === true from the previous
      // session) skips re-hydration and EDIT stays empty.
      initialContentLoaded.current = false;
      hydratingRef.current = false;
      // Force-rebuild Y.Doc + provider + editor. Must run AFTER onNoteUpdate so
      // the freshly-fetched note.content is available to the initial-content
      // useEffect when the new editor mounts.
      onCollabReset?.();
    } catch (err) {
      console.error("Failed to discard draft:", err);
    }
  }, [
    boardId,
    orgId,
    note.id,
    onNoteUpdate,
    onCollabReset,
    collaboration.connectedUsers,
    t,
  ]);

  // Restore a previously discarded draft (되돌리기). The server moves the
  // archived Yjs state back into the live collab row and reloads the room, so we
  // rebuild the local Y.Doc/provider; the next EDIT entry shows the restored draft.
  const handleRestoreDraft = useCallback(async () => {
    try {
      if (boardId) await noteAPI.restoreDraft(boardId, note.id);
      else if (orgId) await orgNoteAPI.restoreDraft(orgId, note.id);
      else return;
      const { noteService, orgNoteService } =
        await import("../../utils/services");
      const updated = boardId
        ? await noteService.getDetail(boardId, note.id)
        : orgId
          ? await orgNoteService.getDetail(orgId, note.id)
          : null;
      if (updated) onNoteUpdate?.(updated);
      setHasDiscardedDraft(false);
      initialContentLoaded.current = false;
      hydratingRef.current = false;
      onCollabReset?.();
    } catch (err) {
      console.error("Failed to restore draft:", err);
    }
  }, [boardId, orgId, note.id, onNoteUpdate, onCollabReset]);

  // Keyboard shortcut: Ctrl/Cmd+S (Edit mode only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Block hover detection for comment button
  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const blockEl = target.closest("[data-id]") as HTMLElement;
    if (!blockEl || !editorContainerRef.current) {
      if (hoveredBlockIdRef.current) {
        hoveredBlockIdRef.current = null;
        setHoveredBlock(null);
      }
      return;
    }
    const id = blockEl.getAttribute("data-id");
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
      commentsPanelRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // CSS for block comment indicators
  const blockIndicatorStyle = useMemo(() => {
    if (commentBlockIds.size === 0) return null;
    const selectors = Array.from(commentBlockIds)
      .map((id) => `[data-id="${id}"]`)
      .join(", ");
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
      const lang = navigator.language?.split("-")[0] || "ko";
      if (!boardId) return; // AI organize is board-specific
      const data = await noteAPI.aiOrganize(boardId, note.id, lang);
      setAiData(data);
      setAiContentSnapshot(note.content || "");
    } catch {
      setAiError(t("notes.aiError"));
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, isAIDimmed, boardId, note.id, note.content, t]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-foreground/5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
        <div className="flex-1 min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 mb-1 text-xs text-slate-500 overflow-x-auto">
              {breadcrumbs.map((bc, i) => (
                <span
                  key={bc.id}
                  className="flex items-center gap-1 flex-shrink-0"
                >
                  {i > 0 && (
                    <ChevronRight size={10} className="text-slate-600" />
                  )}
                  <button
                    onClick={() => onBreadcrumbClick?.(bc.id)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[120px]"
                    title={bc.title}
                  >
                    {bc.type === "FOLDER" && <Folder size={10} />}
                    <span className="truncate">{bc.title}</span>
                  </button>
                </span>
              ))}
            </nav>
          )}
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-transparent text-lg font-bold text-foreground focus:outline-none placeholder-slate-600"
            placeholder={t("notes.titlePlaceholder", "제목을 입력하세요")}
            readOnly={mode !== "edit" || !canEdit}
          />
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  <TagIcon size={8} />
                  {tag.name}
                </span>
              ))}
            </div>
            <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap">
              <Clock size={10} />
              {formatDateTime(note.updated_at)}
              {note.updated_by && ` · ${note.updated_by.name}`}
            </span>
            <span className="text-xs flex items-center gap-1 whitespace-nowrap">
              <span className="text-slate-600">·</span>
              {syncDisplay === "view" ? (
                editorPeers.length > 0 ? (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <Users size={10} />
                    {t("notes.editorsCount", {
                      count: editorPeers.length,
                      defaultValue: "{{count}}명 편집 중",
                    })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Eye size={10} />
                    {t("notes.viewMode", "읽기 모드")}
                  </span>
                )
              ) : syncDisplay === "syncing" ? (
                <span className="flex items-center gap-1 text-slate-400 animate-pulse">
                  <CloudUpload size={10} />
                  {t("notes.syncSaving", "저장 중...")}
                </span>
              ) : syncDisplay === "offline" ? (
                <span
                  className="flex items-center gap-1 text-amber-500"
                  title={t(
                    "notes.syncOfflineTooltip",
                    "연결이 끊어졌습니다. 자동으로 재연결됩니다.",
                  )}
                >
                  <CloudOff size={10} />
                  {t("notes.syncOffline", "오프라인")}
                </span>
              ) : syncDisplay === "connecting" ? (
                <span className="flex items-center gap-1 text-slate-400 animate-pulse">
                  <CloudUpload size={10} />
                  {t("notes.syncConnecting", "연결 중...")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-500">
                  <Cloud size={10} />
                  {t("notes.syncSaved", "자동 저장됨")}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {/* Collaboration presence — show only fellow editors (no viewers) */}
          {mode === "edit" && (
            <CollabPresence
              status={collaboration.status}
              connectedUsers={editorPeers}
              currentUserName={currentUserName}
              currentUserColor={currentUserColor}
            />
          )}

          <NoteShareButton
            boardId={boardId}
            orgId={orgId}
            note={note}
            canEdit={canEdit}
            onNoteUpdate={onNoteUpdate}
          />

          <button
            onClick={async () => {
              try {
                const svcMod = boardId
                  ? await import("../../utils/services").then(
                      (m) => m.noteService,
                    )
                  : await import("../../utils/services").then(
                      (m) => m.orgNoteService,
                    );
                const updated = await svcMod.toggleLike(
                  (boardId || orgId)!,
                  note.id,
                );
                onNoteUpdate?.(updated);
              } catch {
                // silently ignore — backend may not support yet
              }
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              note.liked
                ? "text-rose-500 bg-rose-500/10"
                : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
            }`}
            title={t("notes.like", "좋아요")}
          >
            <Heart size={14} fill={note.liked ? "currentColor" : "none"} />
            {(note.like_count ?? 0) > 0 && (
              <span className="hidden lg:inline">{note.like_count}</span>
            )}
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showComments
                ? "text-bridge-accent bg-bridge-accent/10"
                : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
            }`}
            title={t("notes.comment.title", "댓글")}
          >
            <MessageSquare size={14} />
            <span className="hidden lg:inline">
              {t("notes.comment.title", "댓글")}
            </span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors text-slate-400 hover:text-foreground hover:bg-foreground/5"
            title={t("notes.copyMarkdown", "Markdown으로 복사")}
          >
            {markdownCopied ? <Check size={14} /> : <FileDown size={14} />}
            <span className="hidden lg:inline">
              {markdownCopied
                ? t("notes.copied", "복사됨")
                : t("notes.copyMarkdownShort", "Markdown")}
            </span>
          </button>

          <div className="w-px h-5 bg-white/10 hidden sm:block" />

          {mode === "edit" && (
            <NoteTagManager
              boardId={boardId}
              orgId={orgId}
              noteId={note.id}
              noteTags={note.tags}
              allTags={tags}
              canEdit={canEdit}
              onSave={(tagIds) => onSave(note.id, { tagIds })}
              onTagsChange={onTagsChange}
            />
          )}
          {canEdit && mode === "edit" && (
            <NoteVersionHistory
              boardId={boardId}
              orgId={orgId}
              noteId={note.id}
              noteType={note.type}
              currentTitle={note.title}
              currentContent={note.content}
              versionCount={note.version_count}
              canEdit={canEdit}
              getLiveSnapshot={() => ({
                title,
                content: serializeForSave(editor),
              })}
              hasOtherEditors={editorPeers.length > 0}
              onBeforeRestore={() => {
                // Flip read-only BEFORE the restore request: the collab stack
                // is torn down right after, and CollabProvider.disconnect()
                // flushes the full (pre-restore) Y.Doc to the server unless
                // readOnly — which would resurrect the stale draft the backend
                // just discarded.
                collaboration.provider.setReadOnly(true);
              }}
              onRestoreFailed={() => {
                // Restore failed — re-enable syncing for the live edit session.
                collaboration.provider.setReadOnly(modeRef.current === "view");
              }}
              onRestore={async () => {
                // Refetch the restored note, then rebuild the Y.Doc/provider/
                // editor stack so the fresh empty doc rehydrates from the
                // restored note.content (mirrors handleDiscardDraft).
                const { noteService, orgNoteService } =
                  await import("../../utils/services");
                const updated = boardId
                  ? await noteService.getDetail(boardId, note.id)
                  : orgId
                    ? await orgNoteService.getDetail(orgId, note.id)
                    : null;
                if (!updated) return;
                setTitle(updated.title);
                setHasChanges(false);
                onNoteUpdate?.(updated);
                initialContentLoaded.current = false;
                hydratingRef.current = false;
                setEditorGen((g) => g + 1);
                onCollabReset?.();
              }}
              onVersionsChanged={async () => {
                if (boardId) {
                  const { noteService } = await import("../../utils/services");
                  const updated = await noteService.getDetail(boardId, note.id);
                  onNoteUpdate?.(updated);
                } else if (orgId) {
                  const { orgNoteService } = await import(
                    "../../utils/services"
                  );
                  const updated = await orgNoteService.getDetail(
                    orgId,
                    note.id,
                  );
                  onNoteUpdate?.(updated);
                }
              }}
            />
          )}
          {mode === "edit" && canEdit && boardId && note.content?.trim() && (
            <button
              onClick={handleAIOrganize}
              disabled={aiLoading}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                isAIDimmed()
                  ? "text-slate-500 bg-foreground/5 cursor-default"
                  : "text-bridge-secondary bg-bridge-secondary/10 hover:bg-bridge-secondary/20"
              }`}
            >
              {aiLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              <span className="hidden lg:inline">{t("notes.aiOrganize")}</span>
            </button>
          )}
          {canEdit && mode === "view" && (
            <button
              onClick={handleEnterEdit}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20"
              title={t("notes.enterEdit", "편집 모드 진입")}
            >
              <Pencil size={12} />
              <span className="hidden sm:inline">
                {t("notes.editButton", "편집")}
              </span>
            </button>
          )}
          {canEdit && mode === "edit" && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20 disabled:opacity-60"
                title={t("notes.saveSnapshot", "저장") + " (⌘S)"}
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                <span className="hidden sm:inline">
                  {t("notes.saveSnapshot", "저장")}
                </span>
              </button>
              <button
                onClick={handleExitEdit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10"
                title={t("notes.exitEdit", "편집 종료")}
              >
                <DoorOpen size={12} />
                <span className="hidden sm:inline">
                  {t("notes.exitEdit", "편집 종료")}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* BlockNote Editor + AI Section + Bottom Comments */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Block comment indicator CSS */}
        {blockIndicatorStyle && <style>{blockIndicatorStyle}</style>}

        {/* Unpublished draft banner — view mode + member can edit + server reports a fresher draft */}
        {mode === "view" && canEdit && note.has_unpublished_draft && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-bridge-accent/20 bg-bridge-accent/10 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <CloudUpload
                size={14}
                className="text-bridge-accent flex-shrink-0"
              />
              <span className="text-xs text-foreground truncate">
                {t(
                  "notes.unpublishedDraft.banner",
                  "미발행 수정이 있어요. 저장하지 않은 변경이 보존되어 있습니다.",
                )}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleEnterEdit}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
              >
                {t("notes.unpublishedDraft.continueEdit", "이어서 편집")}
              </button>
              <button
                onClick={handleDiscardDraft}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {t("notes.unpublishedDraft.discard", "폐기")}
              </button>
            </div>
          </div>
        )}

        {/* Restore discarded draft banner — view mode + member can edit + an archived discard exists */}
        {mode === "view" &&
          canEdit &&
          !note.has_unpublished_draft &&
          hasDiscardedDraft && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <RotateCcw size={14} className="text-amber-500 flex-shrink-0" />
                <span className="text-xs text-foreground truncate">
                  {t(
                    "notes.unpublishedDraft.discardedBanner",
                    "폐기된 미발행 초안이 있어요. 되돌릴 수 있습니다.",
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleRestoreDraft}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-amber-500 hover:bg-amber-500/90 transition-colors"
                >
                  {t("notes.unpublishedDraft.restore", "되돌리기")}
                </button>
              </div>
            </div>
          )}

        {/* Editor with block hover overlay */}
        <div
          ref={editorContainerRef}
          className="relative min-h-[60vh]"
          onMouseMove={handleEditorMouseMove}
          onMouseLeave={() => {
            hoveredBlockIdRef.current = null;
            setHoveredBlock(null);
          }}
        >
          {mode === "view" ? (
            <div
              key={`view-${note.id}-${note.updated_at}`}
              className={`bn-container bn-shadcn note-view-render ${isDark ? "dark" : "light"}`}
              data-color-scheme={isDark ? "dark" : "light"}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(viewHtml, {
                  ADD_TAGS: ["iframe", "details", "summary"],
                  ADD_ATTR: [
                    "data-block-type",
                    "data-callout-type",
                    "data-content-type",
                    "data-url",
                    "data-columns",
                    "data-id",
                    "allow",
                    "allowfullscreen",
                    "frameborder",
                    "open",
                    "target",
                    "rel",
                  ],
                }),
              }}
            />
          ) : (
            <BlockNoteView
              key={`edit-${note.id}-${editorGen}`}
              editor={editor}
              theme={isDark ? "dark" : "light"}
              editable={canEdit && mode === "edit"}
              onChange={handleEditorChange}
            >
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) =>
                  filterSuggestionItems(slashMenuItems, query)
                }
              />
              <SuggestionMenuController
                triggerCharacter="@"
                getItems={getMentionItems}
              />
              <TableHandlesController />
            </BlockNoteView>
          )}

          {/* Floating block comment button — Edit mode only */}
          {mode === "edit" && hoveredBlock && (
            <IconButton
              className="absolute right-2 z-10 bg-bridge-dark border border-foreground/10 hover:text-bridge-accent hover:border-bridge-accent/30 shadow-lg"
              style={{ top: hoveredBlock.top + 2 }}
              onClick={() => handleAddBlockComment(hoveredBlock.id)}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={t("notes.comment.addToBlock", "이 블록에 댓글 달기")}
            >
              <MessageSquare />
              {commentBlockIds.has(hoveredBlock.id) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-bridge-accent rounded-full border-2 border-bridge-dark" />
              )}
            </IconButton>
          )}
        </div>

        {/* AI Inline Section */}
        {aiVisible && (
          <div className="px-6 pb-6">
            {aiCollapsed && !aiLoading ? (
              <div className="mt-4 flex items-center justify-between bg-white/[0.02] rounded-xl border border-foreground/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-bridge-accent" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {t("notes.aiOrganizeTitle")}
                  </span>
                </div>
                <button
                  onClick={() => setAiCollapsed(false)}
                  className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
                >
                  {t("notes.aiExpand")}
                </button>
              </div>
            ) : (
              <NoteAIInlineSection
                boardId={boardId || ""}
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
              orgId={orgId}
              noteId={note.id}
              currentUserId={currentUser.id}
              canEdit={canEdit}
              onClose={() => {
                setShowComments(false);
                setActiveBlockId(null);
              }}
              activeBlockId={activeBlockId}
              onBlockIdsChange={setCommentBlockIds}
            />
          </div>
        )}

        {/* Bottom Confluence-style Comments Panel (always visible) */}
        {currentUser && (
          <NoteBottomComments
            boardId={boardId}
            orgId={orgId}
            noteId={note.id}
            currentUserId={currentUser.id}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
