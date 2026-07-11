import {
  useState,
  useCallback,
  useEffect,
  useRef,
  Suspense,
  lazy,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  Clock,
  Tag as TagIcon,
  Loader2,
  MessageSquare,
  ChevronDown,
  Grid3X3,
  Pencil,
  Eye,
  DoorOpen,
  Users,
} from "lucide-react";
import { NoteTagManager } from "./NoteTagManager";
import { NoteVersionHistory } from "./NoteVersionHistory";
import { NoteShareButton } from "./NoteShareButton";
import { CollabPresence } from "./CollabPresence";
import { NoteBottomComments } from "./NoteBottomComments";
import { IconButton } from "../ui/IconButton";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { formatDateTime } from "../../utils/dateUtils";
import type { NoteDetail, NoteTagInfo } from "../../utils/api";
import type { CollaborationState } from "../../hooks/useCollaboration";
import * as Y from "yjs";

// Excalidraw CSS
import "@excalidraw/excalidraw/index.css";

let CaptureUpdateActionRef: any = null;

const ExcalidrawLazy = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  CaptureUpdateActionRef = mod.CaptureUpdateAction;
  return { default: mod.Excalidraw };
});

const LANG_MAP: Record<string, string> = {
  ko: "ko-KR",
  ja: "ja-JP",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  vi: "vi-VN",
  es: "es-ES",
  "pt-BR": "pt-BR",
  hi: "hi-IN",
  th: "th-TH",
  en: "en",
};

interface ExcalidrawEditorProps {
  boardId?: string;
  orgId?: string;
  personal?: boolean;
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
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
}

export default function ExcalidrawEditor({
  boardId,
  orgId,
  personal,
  note,
  tags,
  canEdit,
  onSave,
  onTagsChange,
  onNoteUpdate,
  collaboration,
  currentUserName,
  currentUserColor,
}: ExcalidrawEditorProps) {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");

  // Reset to view whenever the note changes
  useEffect(() => {
    setMode("view");
  }, [note.id]);

  // Sync collab readOnly + awareness mode to the active mode
  useEffect(() => {
    if (!collaboration) return;
    collaboration.provider.setReadOnly(mode === "view");
    collaboration.provider.awareness.setLocalStateField("mode", mode);
  }, [mode, collaboration]);

  const editorPeers = collaboration
    ? collaboration.connectedUsers.filter((u) => u.mode === "edit")
    : [];

  // When a peer hits Save while we're in View mode, refetch the published
  // scene so the View user sees the new state. Edit users skip — they already
  // have it via Yjs.
  useEffect(() => {
    if (!collaboration) return;
    return collaboration.provider.onSnapshotUpdated(async () => {
      if (mode !== "view") return;
      try {
        const { noteService, orgNoteService, myNoteService } =
          await import("../../utils/services");
        const updated = personal
          ? await myNoteService.getDetail("me", note.id)
          : boardId
          ? await noteService.getDetail(boardId, note.id)
          : orgId
            ? await orgNoteService.getDetail(orgId, note.id)
            : null;
        if (!updated) return;
        onNoteUpdate?.(updated);
        setTitle(updated.title);
        if (updated.content?.trim() && excalidrawAPIRef.current) {
          try {
            const parsed = JSON.parse(updated.content);
            excalidrawAPIRef.current.updateScene({
              elements: parsed.elements || [],
              ...(CaptureUpdateActionRef
                ? { captureUpdate: CaptureUpdateActionRef.NEVER }
                : {}),
            });
          } catch {
            // ignore parse errors
          }
        }
      } catch (err) {
        console.error(
          "Failed to refetch board note after snapshot update:",
          err,
        );
      }
    });
  }, [collaboration, mode, note.id, boardId, orgId, personal, onNoteUpdate]);

  const excalidrawAPIRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const yMapRef = useRef<Y.Map<any> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const initializedRef = useRef(false);
  const isFixingResizeRef = useRef(false);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    ex: number;
    ey: number;
    tool: string;
    active: boolean;
  }>({ sx: 0, sy: 0, ex: 0, ey: 0, tool: "", active: false });

  const bgColor = isDark ? "#1e1e1e" : "#ffffff";
  const defaultStrokeColor = isDark ? "#e2e8f0" : "#1e1e1e";

  const initialDataRef = useRef<any>(null);
  if (!initialDataRef.current) {
    try {
      if (note.content?.trim()) {
        const parsed = JSON.parse(note.content);
        initialDataRef.current = {
          elements: parsed.elements || [],
          appState: {
            viewBackgroundColor: bgColor,
            currentItemStrokeColor:
              parsed.appState?.currentItemStrokeColor || defaultStrokeColor,
          },
          files: parsed.files || {},
        };
      }
    } catch {
      // empty
    }
  }

  useEffect(() => {
    setTitle(note.title);
    setHasChanges(false);
    initializedRef.current = false;
    initialDataRef.current = null;
    try {
      if (note.content?.trim()) {
        const parsed = JSON.parse(note.content);
        initialDataRef.current = {
          elements: parsed.elements || [],
          appState: {
            viewBackgroundColor: bgColor,
            currentItemStrokeColor:
              parsed.appState?.currentItemStrokeColor || defaultStrokeColor,
          },
          files: parsed.files || {},
        };
      }
    } catch {
      // ignore
    }
  }, [note.id]);

  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (!api) return;
    api.updateScene({
      appState: {
        viewBackgroundColor: bgColor,
        currentItemStrokeColor: defaultStrokeColor,
      },
      ...(CaptureUpdateActionRef
        ? { captureUpdate: CaptureUpdateActionRef.NEVER }
        : {}),
    });
  }, [isDark]);

  const handleTitleChange = (newTitle: string) => {
    if (mode !== "edit") return;
    setTitle(newTitle);
    setHasChanges(true);
  };

  // ---- Yjs collaboration ----
  // Only the Edit-mode user sees Yjs updates. View-mode users keep showing
  // the last published snapshot (notes.content) — see the view-sync effect below.
  useEffect(() => {
    if (!collaboration) {
      yMapRef.current = null;
      return;
    }
    const yMap = collaboration.doc.getMap("excalidraw-elements");
    yMapRef.current = yMap;

    const observer = () => {
      if (isLocalUpdateRef.current) return;
      if (!excalidrawAPIRef.current) return;
      if (mode !== "edit") return;
      isRemoteUpdateRef.current = true;
      const elements: any[] = [];
      yMap.forEach((value, _key) => {
        if (value) elements.push(value);
      });
      elements.sort((a, b) => (a.index || "").localeCompare(b.index || ""));
      excalidrawAPIRef.current.updateScene({
        elements,
        ...(CaptureUpdateActionRef
          ? { captureUpdate: CaptureUpdateActionRef.NEVER }
          : {}),
      });
      requestAnimationFrame(() => {
        isRemoteUpdateRef.current = false;
      });
    };

    yMap.observe(observer);
    if (yMap.size > 0 && excalidrawAPIRef.current && mode === "edit") {
      observer();
    }
    return () => {
      yMap.unobserve(observer);
    };
  }, [collaboration, note.id, mode]);

  // View-mode scene sync: whenever notes.content changes (or we enter view
  // mode), display the saved snapshot — NOT the live Yjs state.
  useEffect(() => {
    if (mode !== "view") return;
    if (!excalidrawAPIRef.current) return;
    let elements: any[] = [];
    if (note.content?.trim()) {
      try {
        const parsed = JSON.parse(note.content);
        elements = parsed.elements || [];
      } catch {
        elements = [];
      }
    }
    isRemoteUpdateRef.current = true;
    excalidrawAPIRef.current.updateScene({
      elements,
      ...(CaptureUpdateActionRef
        ? { captureUpdate: CaptureUpdateActionRef.NEVER }
        : {}),
    });
    requestAnimationFrame(() => {
      isRemoteUpdateRef.current = false;
    });
  }, [mode, note.content]);

  // Entering Edit mode: pull the current Yjs state onto the canvas so the user
  // sees whatever unsaved progress was left behind by a previous editor.
  useEffect(() => {
    if (mode !== "edit") return;
    const yMap = yMapRef.current;
    if (!yMap || !excalidrawAPIRef.current) return;
    if (yMap.size === 0) return;
    isRemoteUpdateRef.current = true;
    const elements: any[] = [];
    yMap.forEach((value) => {
      if (value) elements.push(value);
    });
    elements.sort((a, b) => (a.index || "").localeCompare(b.index || ""));
    excalidrawAPIRef.current.updateScene({
      elements,
      ...(CaptureUpdateActionRef
        ? { captureUpdate: CaptureUpdateActionRef.NEVER }
        : {}),
    });
    requestAnimationFrame(() => {
      isRemoteUpdateRef.current = false;
    });
  }, [mode]);

  const handleExcalidrawChange = useCallback(
    (elements: readonly any[], _appState: any) => {
      if (isRemoteUpdateRef.current || isFixingResizeRef.current) return;
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }
      if (mode !== "edit") return;

      setHasChanges(true);
      if (!collaboration || !yMapRef.current) return;
      isLocalUpdateRef.current = true;
      const yMap = yMapRef.current;
      collaboration.doc.transact(() => {
        const currentIds = new Set<string>();
        for (const element of elements) {
          currentIds.add(element.id);
          const existing = yMap.get(element.id);
          if (!existing || existing.version !== element.version) {
            yMap.set(element.id, { ...element });
          }
        }
        const keysToDelete: string[] = [];
        yMap.forEach((_value, key) => {
          if (!currentIds.has(key)) keysToDelete.push(key);
        });
        for (const key of keysToDelete) yMap.delete(key);
      });
      isLocalUpdateRef.current = false;
    },
    [collaboration, mode],
  );

  // Track pointer via Excalidraw's onPointerUpdate (canvas coords, not screen)
  const handlePointerUpdate = useCallback(
    (payload: any) => {
      if (collaboration) {
        collaboration.provider.awareness.setLocalStateField("pointer", {
          x: payload.pointer.x,
          y: payload.pointer.y,
          tool: payload.pointer.tool,
        });
      }
      const drag = dragRef.current;
      if (payload.button === "down") {
        if (!drag.active) {
          const api = excalidrawAPIRef.current;
          drag.tool = api?.getAppState()?.activeTool?.type || "";
          drag.sx = payload.pointer.x;
          drag.sy = payload.pointer.y;
          drag.active = true;
        }
        drag.ex = payload.pointer.x;
        drag.ey = payload.pointer.y;
      } else if (drag.active) {
        drag.active = false;
      }
    },
    [collaboration],
  );

  // Fix: prevent text-container shapes from auto-shrinking to 0×0 after creation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerUp = () => {
      const drag = dragRef.current;
      const SHAPES = ["rectangle", "ellipse", "diamond"];
      if (!SHAPES.includes(drag.tool)) {
        console.log("[ExFix] skip: tool=", drag.tool);
        return;
      }

      const w = Math.abs(drag.ex - drag.sx);
      const h = Math.abs(drag.ey - drag.sy);
      console.log(
        "[ExFix] pointerup tool:",
        drag.tool,
        "canvas size:",
        Math.round(w),
        "x",
        Math.round(h),
      );
      if (w < 10 || h < 10) return;

      const api = excalidrawAPIRef.current;
      if (!api) return;

      let attempts = 0;
      const tryFix = () => {
        if (++attempts > 30) return;
        const els = api.getSceneElements();
        let fixed = false;
        const textIds = new Set<string>();

        console.log(
          "[ExFix] attempt",
          attempts,
          "elements:",
          els
            .map(
              (e: any) =>
                `${e.type}(${Math.round(e.width)}x${Math.round(e.height)})`,
            )
            .join(", "),
        );

        const patched = els.map((el: any) => {
          if (SHAPES.includes(el.type) && el.width < 10 && el.height < 10) {
            fixed = true;
            console.log(
              "[ExFix] FIXING",
              el.id.slice(0, 8),
              "→",
              Math.round(w),
              "x",
              Math.round(h),
            );
            el.boundElements?.forEach((b: any) => {
              if (b.type === "text") textIds.add(b.id);
            });
            return {
              ...el,
              width: w,
              height: h,
              boundElements: [],
              autoResize: false,
            };
          }
          return el;
        });

        if (fixed) {
          const cleaned = patched.filter((el: any) => !textIds.has(el.id));
          isFixingResizeRef.current = true;
          api.updateScene({
            elements: cleaned,
            ...(CaptureUpdateActionRef
              ? { captureUpdate: CaptureUpdateActionRef.NEVER }
              : {}),
          });
          setTimeout(() => {
            isFixingResizeRef.current = false;
          }, 200);
        } else {
          setTimeout(tryFix, 50);
        }
      };
      setTimeout(tryFix, 50);
    };

    container.addEventListener("pointerup", onPointerUp, true);
    return () => container.removeEventListener("pointerup", onPointerUp, true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canEdit || mode !== "edit") return;
    setSaving(true);
    try {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const sceneElements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      const content = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "bridge-notes",
        elements: sceneElements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor },
        files: files || {},
      });
      await onSave(
        note.id,
        {
          title: title !== note.title ? title : undefined,
          content,
          tagIds: note.tags.map((t) => t.id),
        },
        true,
      );
      setHasChanges(false);
      if (collaboration) collaboration.provider.sendFullState();
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    mode,
    onSave,
    note.id,
    note.title,
    note.tags,
    title,
    collaboration,
  ]);

  const handleEnterEdit = useCallback(() => {
    if (!canEdit) return;
    setMode("edit");
  }, [canEdit]);

  const handleExitEdit = useCallback(() => {
    if (collaboration) collaboration.provider.sendFullState();
    setMode("view");
    setHasChanges(false);
  }, [collaboration]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        e.code === "KeyG" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        tag !== "INPUT" &&
        tag !== "TEXTAREA"
      ) {
        setGridEnabled((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Remap IME keys (e.g. Korean ㄱ→r) so Excalidraw built-in shortcuts work
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const CODE_TO_KEY: Record<string, string> = {
      KeyA: "a",
      KeyB: "b",
      KeyC: "c",
      KeyD: "d",
      KeyE: "e",
      KeyF: "f",
      KeyG: "g",
      KeyH: "h",
      KeyI: "i",
      KeyJ: "j",
      KeyK: "k",
      KeyL: "l",
      KeyM: "m",
      KeyN: "n",
      KeyO: "o",
      KeyP: "p",
      KeyQ: "q",
      KeyR: "r",
      KeyS: "s",
      KeyT: "t",
      KeyU: "u",
      KeyV: "v",
      KeyW: "w",
      KeyX: "x",
      KeyY: "y",
      KeyZ: "z",
    };
    const remap = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      const expected = CODE_TO_KEY[e.code];
      if (!expected) return;
      if (e.key === expected || e.key === expected.toUpperCase()) return;
      e.stopPropagation();
      e.preventDefault();
      target.dispatchEvent(
        new KeyboardEvent(e.type, {
          code: e.code,
          key: e.shiftKey ? expected.toUpperCase() : expected,
          keyCode: expected.toUpperCase().charCodeAt(0),
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    el.addEventListener("keydown", remap, true);
    el.addEventListener("keyup", remap, true);
    return () => {
      el.removeEventListener("keydown", remap, true);
      el.removeEventListener("keyup", remap, true);
    };
  }, []);

  const langCode = LANG_MAP[i18n.language] || "en";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header — normal flow, not absolute */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-foreground/[0.08] bg-bridge-obsidian flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="bg-transparent text-sm font-bold text-foreground focus:outline-none placeholder-slate-500 min-w-0 flex-1"
            placeholder={t("notes.titlePlaceholder", "제목을 입력하세요")}
            readOnly={mode !== "edit" || !canEdit}
          />
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {note.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  <TagIcon size={7} />
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap flex-shrink-0 hidden sm:flex">
            <Clock size={9} />
            {formatDateTime(note.updated_at)}
          </span>
          {mode === "view" && editorPeers.length > 0 && (
            <span className="text-xs flex items-center gap-1 text-emerald-500 flex-shrink-0">
              <Users size={9} />
              {t("notes.editorsCount", {
                count: editorPeers.length,
                defaultValue: "{{count}}명 편집 중",
              })}
            </span>
          )}
          {mode === "view" && editorPeers.length === 0 && (
            <span className="text-xs flex items-center gap-1 text-slate-500 flex-shrink-0 hidden sm:flex">
              <Eye size={9} />
              {t("notes.viewMode", "읽기 모드")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {collaboration && mode === "edit" && (
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
            personal={personal}
            note={note}
            canEdit={canEdit}
            onNoteUpdate={onNoteUpdate}
          />
          {mode === "edit" && (
            <NoteTagManager
              boardId={boardId}
              orgId={orgId}
              personal={personal}
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
              personal={personal}
              noteId={note.id}
              noteType={note.type}
              currentTitle={note.title}
              currentContent={note.content}
              versionCount={note.version_count}
              canEdit={canEdit}
              getLiveSnapshot={() => {
                // Serialize the live canvas (same shape as handleSave) so the
                // pre-restore snapshot keeps unpublished scene edits.
                const api = excalidrawAPIRef.current;
                if (!api) return { title, content: note.content || "" };
                return {
                  title,
                  content: JSON.stringify({
                    type: "excalidraw",
                    version: 2,
                    source: "bridge-notes",
                    elements: api.getSceneElements(),
                    appState: {
                      viewBackgroundColor: api.getAppState().viewBackgroundColor,
                    },
                    files: api.getFiles() || {},
                  }),
                };
              }}
              hasOtherEditors={editorPeers.length > 0}
              onRestore={async () => {
                let updated;
                if (personal) {
                  const { myNoteService } = await import("../../utils/services");
                  updated = await myNoteService.getDetail("me", note.id);
                } else if (boardId) {
                  const { noteService } = await import("../../utils/services");
                  updated = await noteService.getDetail(boardId, note.id);
                } else if (orgId) {
                  const { orgNoteService } = await import(
                    "../../utils/services"
                  );
                  updated = await orgNoteService.getDetail(orgId, note.id);
                }
                if (!updated) return;
                setTitle(updated.title);
                setHasChanges(false);
                onNoteUpdate?.(updated);
                if (updated.content?.trim() && excalidrawAPIRef.current) {
                  try {
                    const parsed = JSON.parse(updated.content);
                    excalidrawAPIRef.current.updateScene({
                      elements: parsed.elements || [],
                      ...(CaptureUpdateActionRef
                        ? { captureUpdate: CaptureUpdateActionRef.NEVER }
                        : {}),
                    });
                  } catch {
                    // ignore
                  }
                }
              }}
            />
          )}
          {mode === "edit" && (
            <button
              onClick={() => setGridEnabled((v) => !v)}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                gridEnabled
                  ? "text-bridge-accent bg-bridge-accent/10"
                  : "text-slate-500 hover:text-foreground hover:bg-foreground/5"
              }`}
              title={t("notes.grid", "그리드")}
            >
              <Grid3X3 size={14} />
            </button>
          )}
          {currentUser && (
            <button
              onClick={() => setShowComments(!showComments)}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                showComments
                  ? "text-bridge-accent bg-bridge-accent/10"
                  : "text-slate-500 hover:text-foreground hover:bg-foreground/5"
              }`}
              title={t("notes.comments", "댓글")}
            >
              <MessageSquare size={14} />
            </button>
          )}
          {canEdit && mode === "view" && (
            <button
              onClick={handleEnterEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20"
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                <span className="hidden lg:inline">
                  {t("notes.saveSnapshot", "저장")}
                </span>
              </button>
              <button
                onClick={handleExitEdit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10"
              >
                <DoorOpen size={12} />
                <span className="hidden lg:inline">
                  {t("notes.exitEdit", "편집 종료")}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Excalidraw Canvas — wrapper takes flex space, container fills it absolutely */}
      <div style={{ flex: "1 1 0%", minHeight: 0, position: "relative" }}>
        <div
          ref={containerRef}
          className="excalidraw-bridge-container"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full bg-bridge-obsidian">
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            }
          >
            <ExcalidrawLazy
              excalidrawAPI={(api: any) => {
                excalidrawAPIRef.current = api;
              }}
              initialData={
                initialDataRef.current || {
                  appState: {
                    viewBackgroundColor: bgColor,
                    currentItemStrokeColor: defaultStrokeColor,
                  },
                }
              }
              onChange={handleExcalidrawChange}
              onPointerUpdate={handlePointerUpdate}
              theme={isDark ? "dark" : "light"}
              viewModeEnabled={!canEdit || mode !== "edit"}
              isCollaborating={!!collaboration}
              langCode={langCode}
              autoFocus
              validateEmbeddable
              gridModeEnabled={gridEnabled}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  export: { saveFileToDisk: true },
                },
              }}
            />
          </Suspense>
        </div>
      </div>

      {/* Comments Panel */}
      {currentUser && showComments && (
        <div className="border-t border-foreground/[0.08] bg-bridge-obsidian flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/[0.08]">
            <span className="text-xs font-bold text-foreground">
              {t("notes.comments", "댓글")}
            </span>
            <IconButton
              onClick={() => setShowComments(false)}
              aria-label="댓글 닫기"
            >
              <ChevronDown />
            </IconButton>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            <NoteBottomComments
              boardId={boardId}
              orgId={orgId}
              personal={personal}
              noteId={note.id}
              currentUserId={currentUser.id}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
