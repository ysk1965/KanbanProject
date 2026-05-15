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
  Share2,
  Link2,
  Check,
  X,
  MessageSquare,
  History,
  Cloud,
  CloudUpload,
  CloudOff,
  Pencil,
  Eye,
  DoorOpen,
  Users,
} from "lucide-react";

const ExcalidrawEditor = React.lazy(() => import("./ExcalidrawEditor"));
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
  insertOrUpdateBlock,
} from "@blocknote/core";
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
import { Callout } from "./blocks/Callout";
import { Toggle } from "./blocks/Toggle";
import { Divider } from "./blocks/Divider";
import { TableOfContents } from "./blocks/TableOfContents";
import { Embed } from "./blocks/Embed";
import { ColumnLayout, Column } from "./blocks/ColumnLayout";
import { Mention } from "./blocks/Mention";
import { formatDateTime } from "../../utils/dateUtils";
import { useTheme } from "../../contexts/ThemeContext";
import { fileAPI, noteAPI, memberAPI, orgNoteAPI } from "../../utils/api";
import type {
  NoteDetail,
  NoteTagInfo,
  NoteAISuggestionResponse,
  MemberResponse,
} from "../../utils/api";
import { NoteShareButton } from "./NoteShareButton";
import { NoteBottomComments } from "./NoteBottomComments";
import { IconButton } from "../ui/IconButton";
import type { CollaborationState } from "../../hooks/useCollaboration";

function cleanMarkdownForPlainText(md: string): string {
  return md
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{2,}/g, "\n");
}

// 클립보드 HTML에서 비어 있는 <p>(텍스트 없음 / <br>만 / 공백만)를 제거.
// 외부 앱에 paste 했을 때 BlockNote 노트의 잠재적 빈 문단이 빈 줄로 표시되는 현상 방지.
// blocknote/html(ProseMirror native)은 내부 round-trip 용이므로 손대지 않는다.
function stripEmptyParagraphsForExternalHTML(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("p").forEach((p) => {
    if (p.textContent?.trim()) return;
    const onlyBr = p.children.length === 1 && p.children[0].tagName === "BR";
    if (p.childNodes.length === 0 || onlyBr) {
      p.remove();
    }
  });
  return doc.body.innerHTML;
}

function handleEditorCopy(e: React.ClipboardEvent) {
  const plain = e.clipboardData.getData("text/plain");
  if (plain) {
    const cleaned = cleanMarkdownForPlainText(plain);
    if (cleaned !== plain) {
      e.clipboardData.setData("text/plain", cleaned);
    }
  }
  const html = e.clipboardData.getData("text/html");
  if (html) {
    const cleaned = stripEmptyParagraphsForExternalHTML(html);
    if (cleaned !== html) {
      e.clipboardData.setData("text/html", cleaned);
    }
  }
}

function hasNestedListHtml(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelectorAll("li > ul, li > ol").length > 0;
}

// blocksToHTMLLossy() wraps list item content in <p> tags: <li><p>text</p></li>.
// When tryParseHTMLToBlocks() parses this back, ProseMirror sees a block element
// (<p>) inside bulletListItem (which expects inline* content), causing it to split
// into an empty list item + separate paragraph — showing a "List" label in view mode.
// Fix: unwrap single <p> children inside <li> so content becomes direct inline text.
function unwrapListItemParagraphs(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("li > p").forEach((p) => {
    const li = p.parentElement!;
    while (p.firstChild) {
      li.insertBefore(p.firstChild, p);
    }
    p.remove();
  });
  return doc.body.innerHTML;
}

// 블록 레벨 닫는 태그와 다음 블록 여는 태그 사이의 whitespace/개행을 제거.
// BlockNote externalHTML(`<p>X</p>\n<p>Y</p>`)을 paste 할 때 ProseMirror DOMParser가
// 사이 공백을 빈 문단 블록으로 만드는 현상 방지. 인라인 태그 사이 공백은 건드리지 않음.
function collapseInterBlockWhitespace(html: string): string {
  return html.replace(
    /(<\/(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|thead|tbody)>)\s+(?=<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|thead|tbody)\b)/gi,
    "$1",
  );
}

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
  onDirtyChange?: (isDirty: boolean) => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
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
  onDirtyChange,
  onNoteUpdate,
  collaboration,
  currentUserName,
  currentUserColor,
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
          onDirtyChange={onDirtyChange}
          onNoteUpdate={onNoteUpdate}
          collaboration={collaboration}
          currentUserName={currentUserName}
          currentUserColor={currentUserColor}
        />
      </Suspense>
    );
  }

  if (collaboration) {
    return (
      <CollabNoteEditor
        boardId={boardId}
        orgId={orgId}
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
      orgId={orgId}
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
  onDirtyChange?: (isDirty: boolean) => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState;
  currentUserName: string;
  currentUserColor: string;
}

function CollabNoteEditor({
  boardId,
  orgId,
  note,
  tags,
  canEdit,
  onSave,
  onTagsChange,
  onDirtyChange,
  onNoteUpdate,
  collaboration,
  currentUserName,
  currentUserColor,
}: CollabEditorProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const isInitializedRef = useRef(false);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      pasteHandler: ({
        event,
        editor: e,
        defaultPasteHandler,
      }: {
        event: ClipboardEvent;
        editor: any;
        defaultPasteHandler: () => boolean;
      }) => {
        const bnHtml = event.clipboardData?.getData("blocknote/html");
        if (bnHtml) {
          e.pasteHTML(bnHtml, true);
          return true;
        }
        const html = event.clipboardData?.getData("text/html");
        if (html && hasNestedListHtml(html)) {
          e.pasteHTML(html);
          return true;
        }
        if (html) {
          e.pasteHTML(collapseInterBlockWhitespace(html));
          return true;
        }
        return defaultPasteHandler();
      },
    } as any,
    [collaboration.fragment],
  );

  // Separate BlockNote instance for VIEW mode. This editor is NOT bound to
  // Yjs, so live edits from other Edit-mode users never bleed into a
  // viewer's screen — they only see the last published snapshot (notes.content).
  // Switching back to Edit mode mounts the Yjs-bound `editor` above, which
  // still holds the live (possibly unsaved) state.
  const viewEditor = useCreateBlockNote({ schema } as any);

  useEffect(() => {
    if (!viewEditor) return;
    let cancelled = false;
    (async () => {
      try {
        if (!note.content?.trim()) {
          if (!cancelled) viewEditor.replaceBlocks(viewEditor.document, []);
          return;
        }
        const blocks = await viewEditor.tryParseHTMLToBlocks(
          unwrapListItemParagraphs(note.content),
        );
        if (!cancelled) viewEditor.replaceBlocks(viewEditor.document, blocks);
      } catch (err) {
        console.error("Failed to load snapshot content into view editor:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewEditor, note.content]);

  // When Yjs document is empty but note has HTML content (e.g. created via saveToNote),
  // initialize the editor from the HTML content
  const initialContentLoaded = useRef(false);
  useEffect(() => {
    if (!editor) return;

    // Mark editor as initialized after Yjs sync completes (delay to skip initial onChange events)
    const initTimer = setTimeout(() => {
      isInitializedRef.current = true;
    }, 800);

    if (!note.content?.trim() || initialContentLoaded.current) {
      return () => clearTimeout(initTimer);
    }

    // Wait a tick for the Yjs provider to sync initial state
    const timer = setTimeout(async () => {
      // Check if the Yjs fragment is still empty (no collab state from server)
      const doc = editor.document;
      const isEmpty =
        doc.length === 1 &&
        doc[0].type === "paragraph" &&
        (!doc[0].content || doc[0].content.length === 0);

      if (isEmpty && note.content?.trim()) {
        try {
          const blocks = await editor.tryParseHTMLToBlocks(
            unwrapListItemParagraphs(note.content),
          );
          editor.replaceBlocks(editor.document, blocks);
          initialContentLoaded.current = true;
          // Persist the Yjs state so next time it loads from collab
          collaboration.provider.sendFullState();
        } catch (err) {
          console.error(
            "Failed to load initial HTML content into collab editor:",
            err,
          );
        }
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      clearTimeout(initTimer);
    };
  }, [editor, note.content, collaboration.provider]);

  // Cleanup title save timer on unmount or note change
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    };
  }, [note.id]);

  // Sync title when note changes
  useEffect(() => {
    setTitle(note.title);
    setHasChanges(false);
    initialContentLoaded.current = false;
    isInitializedRef.current = false;

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
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"ℹ️"}</span>,
      },
      {
        title: "Toggle List",
        subtext: "Collapsible toggle list",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "toggle" as any }),
        aliases: ["toggle", "collapsible", "dropdown", "accordion"],
        group: "Custom blocks",
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"▶"}</span>,
      },
      {
        title: "Divider",
        subtext: "Horizontal divider line",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "divider" as any }),
        aliases: ["divider", "separator", "hr", "line"],
        group: "Custom blocks",
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"—"}</span>,
      },
      {
        title: "Table of Contents",
        subtext: "Auto-generated from headings",
        onItemClick: () =>
          insertOrUpdateBlock(editor, { type: "tableOfContents" as any }),
        aliases: ["toc", "table of contents", "outline", "index"],
        group: "Custom blocks",
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"📑"}</span>,
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
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"🔗"}</span>,
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
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"▥"}</span>,
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
        icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>{"▦"}</span>,
      },
    ],
    [editor],
  );

  // @mention: lazy-fetch board/org members
  const scopeId = boardId || orgId || "";
  const membersCache = useRef<MemberResponse[] | null>(null);
  const getMentionItems = useCallback(
    async (query: string) => {
      if (!membersCache.current) {
        try {
          if (boardId) {
            const data = await memberAPI.getMembers(boardId);
            membersCache.current = data.members;
          } else {
            // For org notes, members will be fetched differently if needed
            membersCache.current = [];
          }
        } catch {
          membersCache.current = [];
        }
      }
      const items = (membersCache.current || []).map((m) => ({
        title: m.user.name,
        onItemClick: () => {
          editor.insertInlineContent([
            { type: "mention" as any, props: { user: m.user.name } },
            " ",
          ]);
        },
        aliases: [m.user.email],
        group: "Members",
        icon: m.user.profile_image ? (
          <img
            src={m.user.profile_image}
            alt={m.user.name || "프로필"}
            className="bn-mention-avatar"
          />
        ) : (
          <span className="bn-mention-avatar-fallback">
            {m.user.name.charAt(0)}
          </span>
        ),
      }));
      return filterSuggestionItems(items, query);
    },
    [boardId, editor],
  );

  useEffect(() => {
    if (!hasChanges) return;
    const timer = setTimeout(() => setHasChanges(false), 2000);
    return () => clearTimeout(timer);
  }, [hasChanges]);

  useEffect(() => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

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
    if (!isInitializedRef.current) return;
    if (mode !== "edit") return;
    setHasChanges(true);
  }, [mode]);

  // Get HTML content from current editor state
  const getContentHTML = useCallback(async (): Promise<string> => {
    return await editor.blocksToHTMLLossy(editor.document);
  }, [editor]);

  // Save current state as a published snapshot: persist Yjs state + write
  // notes.content + create a NoteVersion row. This is what View users see.
  const handleSave = useCallback(async () => {
    if (!canEdit || mode !== "edit") return;
    setSaving(true);
    try {
      collaboration.provider.sendFullState();
      const html = await getContentHTML();
      await onSave(
        note.id,
        {
          title: title !== note.title ? title : undefined,
          content: html,
          tagIds: note.tags.map((t) => t.id),
        },
        true,
      );
      setHasChanges(false);
      setMode("view");
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    mode,
    collaboration.provider,
    getContentHTML,
    onSave,
    note.id,
    note.title,
    title,
    note.tags,
  ]);

  const handleEnterEdit = useCallback(() => {
    if (!canEdit) return;
    setMode("edit");
  }, [canEdit]);

  // Leave edit mode without publishing. Yjs state remains on the server so the
  // next editor picks up where we left off; View users keep seeing the last
  // published snapshot until someone hits Save.
  const handleExitEdit = useCallback(() => {
    collaboration.provider.sendFullState();
    setMode("view");
    setHasChanges(false);
  }, [collaboration.provider]);

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
          <NoteVersionHistory
            boardId={boardId}
            orgId={orgId}
            noteId={note.id}
            versionCount={note.version_count}
            canEdit={canEdit && mode === "edit"}
            onRestore={async () => {
              // After restoring, refetch and let the provider sync
              if (boardId) {
                const { noteService } = await import("../../utils/services");
                const updated = await noteService.getDetail(boardId, note.id);
                setTitle(updated.title);
                setHasChanges(false);
                onNoteUpdate?.(updated);
              } else if (orgId) {
                const { orgNoteService } = await import("../../utils/services");
                const updated = await orgNoteService.getDetail(orgId, note.id);
                setTitle(updated.title);
                setHasChanges(false);
                onNoteUpdate?.(updated);
              }
            }}
            onVersionsChanged={async () => {
              if (boardId) {
                const { noteService } = await import("../../utils/services");
                const updated = await noteService.getDetail(boardId, note.id);
                onNoteUpdate?.(updated);
              } else if (orgId) {
                const { orgNoteService } = await import("../../utils/services");
                const updated = await orgNoteService.getDetail(orgId, note.id);
                onNoteUpdate?.(updated);
              }
            }}
          />
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

        {/* Editor with block hover overlay */}
        <div
          ref={editorContainerRef}
          className="relative min-h-[60vh]"
          onMouseMove={handleEditorMouseMove}
          onMouseLeave={() => {
            hoveredBlockIdRef.current = null;
            setHoveredBlock(null);
          }}
          onCopy={handleEditorCopy}
        >
          {mode === "view" ? (
            <BlockNoteView
              editor={viewEditor}
              theme={isDark ? "dark" : "light"}
              editable={false}
            />
          ) : (
            <BlockNoteView
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

/* ============================================================
 * Fallback Editor (non-collaborative, original behavior)
 * ============================================================ */

interface FallbackEditorProps {
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
  onDirtyChange?: (isDirty: boolean) => void;
}

const AUTO_SAVE_DELAY = 30_000;

function FallbackNoteEditor({
  boardId,
  orgId,
  note,
  tags,
  canEdit,
  onSave,
  onTagsChange,
  onDirtyChange,
}: FallbackEditorProps) {
  const { t } = useTranslation();
  const { currentUser: fallbackCurrentUser } = useAuth();
  const { isDark } = useTheme();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const noteIdRef = useRef(note.id);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMode("view");
  }, [note.id]);

  const editor = useCreateBlockNote({
    schema,
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
    pasteHandler: ({
      event,
      editor: e,
      defaultPasteHandler,
    }: {
      event: ClipboardEvent;
      editor: any;
      defaultPasteHandler: () => boolean;
    }) => {
      const bnHtml = event.clipboardData?.getData("blocknote/html");
      if (bnHtml) {
        e.pasteHTML(bnHtml, true);
        return true;
      }
      const html = event.clipboardData?.getData("text/html");
      if (html && hasNestedListHtml(html)) {
        e.pasteHTML(html);
        return true;
      }
      if (html) {
        e.pasteHTML(collapseInterBlockWhitespace(html));
        return true;
      }
      return defaultPasteHandler();
    },
  } as any);

  // Read-only editor that mirrors the last-saved snapshot. Used while the user
  // is in View mode so unsaved edits in `editor` don't bleed into the display.
  const viewEditor = useCreateBlockNote({ schema } as any);

  useEffect(() => {
    if (!viewEditor) return;
    let cancelled = false;
    (async () => {
      try {
        if (!note.content?.trim()) {
          if (!cancelled) viewEditor.replaceBlocks(viewEditor.document, []);
          return;
        }
        const blocks = await viewEditor.tryParseHTMLToBlocks(
          unwrapListItemParagraphs(note.content),
        );
        if (!cancelled) viewEditor.replaceBlocks(viewEditor.document, blocks);
      } catch (err) {
        console.error(
          "Failed to load snapshot content into fallback view editor:",
          err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewEditor, note.content]);

  const slashMenuItems = useMemo(
    () => [...getDefaultReactSlashMenuItems(editor)],
    [editor],
  );

  const membersCache = useRef<MemberResponse[] | null>(null);
  const getMentionItems = useCallback(
    async (query: string) => {
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
            { type: "mention" as any, props: { user: m.user.name } },
            " ",
          ]);
        },
        aliases: [m.user.email],
        group: "Members",
        icon: m.user.profile_image ? (
          <img
            src={m.user.profile_image}
            alt={m.user.name || "프로필"}
            className="bn-mention-avatar"
          />
        ) : (
          <span className="bn-mention-avatar-fallback">
            {m.user.name.charAt(0)}
          </span>
        ),
      }));
      return filterSuggestionItems(items, query);
    },
    [boardId, editor],
  );

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
          const blocks = await editor.tryParseHTMLToBlocks(
            unwrapListItemParagraphs(note.content),
          );
          editor.replaceBlocks(editor.document, blocks);
        } catch (err) {
          console.error("Failed to load note content:", err);
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
        const blocks = await editor.tryParseHTMLToBlocks(
          unwrapListItemParagraphs(note.content!),
        );
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error("Failed to load initial content:", err);
      }
    };
    loadInitial();
  }, [editor, note.content]);

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const getContentHTML = useCallback(async (): Promise<string> => {
    return await editor.blocksToHTMLLossy(editor.document);
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      if (hasChanges) {
        const html = await getContentHTML();
        await onSave(
          note.id,
          {
            title: title !== note.title ? title : undefined,
            content: html,
            tagIds: note.tags.map((t) => t.id),
          },
          true,
        );
        setHasChanges(false);
        setAutoSaved(false);
      }
      setMode("view");
    } finally {
      setSaving(false);
    }
  }, [
    hasChanges,
    canEdit,
    getContentHTML,
    onSave,
    note.id,
    note.title,
    title,
    note.tags,
  ]);

  const handleAutoSave = useCallback(async () => {
    if (!hasChanges || !canEdit) return;
    try {
      const html = await getContentHTML();
      await onSave(
        note.id,
        {
          title: title !== note.title ? title : undefined,
          content: html,
          tagIds: note.tags.map((t) => t.id),
        },
        false,
      );
      setHasChanges(false);
      setAutoSaved(true);
    } catch {
      /* Silently fail */
    }
  }, [
    hasChanges,
    canEdit,
    getContentHTML,
    onSave,
    note.id,
    note.title,
    title,
    note.tags,
  ]);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (hasChanges && canEdit) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, AUTO_SAVE_DELAY);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [hasChanges, canEdit, handleAutoSave]);

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

  const handleExitEdit = useCallback(async () => {
    if (hasChanges) {
      await handleAutoSave();
    }
    setMode("view");
  }, [hasChanges, handleAutoSave]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 sm:px-6 py-3 border-b border-foreground/5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => {
              if (mode !== "edit") return;
              setTitle(e.target.value);
              setHasChanges(true);
              setAutoSaved(false);
            }}
            className="w-full bg-transparent text-lg font-bold text-foreground focus:outline-none placeholder-slate-600"
            placeholder={t("notes.titlePlaceholder", "제목을 입력하세요")}
            readOnly={mode !== "edit" || !canEdit}
          />
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap">
              <Clock size={10} />
              {formatDateTime(note.updated_at)}
              {note.updated_by && ` · ${note.updated_by.name}`}
            </span>
            {mode === "view" ? (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Eye size={10} />
                {t("notes.viewMode", "읽기 모드")}
              </span>
            ) : (
              autoSaved && (
                <span className="text-xs text-emerald-500/70">
                  {t("notes.autoSaved", "자동 저장됨")}
                </span>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
          <NoteVersionHistory
            boardId={boardId}
            orgId={orgId}
            noteId={note.id}
            versionCount={note.version_count}
            canEdit={canEdit && mode === "edit"}
            onRestore={async () => {
              let updated;
              if (boardId) {
                const { noteService } = await import("../../utils/services");
                updated = await noteService.getDetail(boardId, note.id);
              } else if (orgId) {
                const { orgNoteService } = await import("../../utils/services");
                updated = await orgNoteService.getDetail(orgId, note.id);
              }
              if (updated) {
                if (updated.content?.trim()) {
                  try {
                    const blocks = await editor.tryParseHTMLToBlocks(
                      unwrapListItemParagraphs(updated.content),
                    );
                    editor.replaceBlocks(editor.document, blocks);
                  } catch (err) {
                    console.error("Failed to restore content:", err);
                  }
                } else {
                  editor.replaceBlocks(editor.document, []);
                }
                setTitle(updated.title);
                setHasChanges(false);
                setAutoSaved(false);
                onNoteUpdate?.(updated);
              }
            }}
            onVersionsChanged={async () => {
              if (boardId) {
                const { noteService } = await import("../../utils/services");
                const updated = await noteService.getDetail(boardId, note.id);
                onNoteUpdate?.(updated);
              } else if (orgId) {
                const { orgNoteService } = await import("../../utils/services");
                const updated = await orgNoteService.getDetail(orgId, note.id);
                onNoteUpdate?.(updated);
              }
            }}
          />
          {canEdit && mode === "view" && (
            <button
              onClick={() => setMode("edit")}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ml-1 bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20"
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
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ml-1 bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20 disabled:opacity-60"
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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="min-h-[60vh]" onCopy={handleEditorCopy}>
          {mode === "view" ? (
            <BlockNoteView
              editor={viewEditor}
              theme={isDark ? "dark" : "light"}
              editable={false}
            />
          ) : (
            <BlockNoteView
              editor={editor}
              theme={isDark ? "dark" : "light"}
              editable={canEdit && mode === "edit"}
              onChange={() => {
                if (mode !== "edit") return;
                setHasChanges(true);
                setAutoSaved(false);
              }}
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
        </div>

        {/* Bottom Confluence-style Comments Panel */}
        {fallbackCurrentUser && (
          <NoteBottomComments
            boardId={boardId}
            orgId={orgId}
            noteId={note.id}
            currentUserId={fallbackCurrentUser.id}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
