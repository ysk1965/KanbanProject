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
} from "lucide-react";
import { NoteTagManager } from "./NoteTagManager";
import { NoteVersionHistory } from "./NoteVersionHistory";
import { NoteShareButton } from "./NoteShareButton";
import { CollabPresence } from "./CollabPresence";
import { NoteBottomComments } from "./NoteBottomComments";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { formatDateTime } from "../../utils/dateUtils";
import type { NoteDetail, NoteTagInfo } from "../../utils/api";
import type { CollaborationState } from "../../hooks/useCollaboration";
import * as Y from "yjs";

let CaptureUpdateActionRef: any = null;

const ExcalidrawLazy = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  CaptureUpdateActionRef = mod.CaptureUpdateAction;
  return { default: mod.Excalidraw };
});

interface ExcalidrawEditorProps {
  boardId: string;
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
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
}

export default function ExcalidrawEditor({
  boardId,
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
}: ExcalidrawEditorProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [title, setTitle] = useState(note.title);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Excalidraw API ref
  const excalidrawAPIRef = useRef<any>(null);

  // Yjs sync refs
  const yMapRef = useRef<Y.Map<any> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const initializedRef = useRef(false);

  // Parse initial data from note content
  const initialDataRef = useRef<any>(null);
  if (!initialDataRef.current) {
    try {
      if (note.content?.trim()) {
        const parsed = JSON.parse(note.content);
        initialDataRef.current = {
          elements: parsed.elements || [],
          appState: {
            viewBackgroundColor:
              parsed.appState?.viewBackgroundColor ||
              (isDark ? "#151B28" : "#efe6d8"),
          },
          files: parsed.files || {},
        };
      }
    } catch {
      // Invalid JSON, start with empty canvas
    }
  }

  // Sync title when note changes
  useEffect(() => {
    setTitle(note.title);
    setHasChanges(false);
    initializedRef.current = false;
    initialDataRef.current = null;

    // Re-parse content for new note
    try {
      if (note.content?.trim()) {
        const parsed = JSON.parse(note.content);
        initialDataRef.current = {
          elements: parsed.elements || [],
          appState: {
            viewBackgroundColor:
              parsed.appState?.viewBackgroundColor ||
              (isDark ? "#151B28" : "#efe6d8"),
          },
          files: parsed.files || {},
        };
      }
    } catch {
      // ignore
    }
  }, [note.id]);

  // Notify parent about dirty state
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  // ---- Yjs collaboration setup ----
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

      isRemoteUpdateRef.current = true;

      // Reconstruct elements from Y.Map
      const elements: any[] = [];
      yMap.forEach((value, _key) => {
        if (value) {
          elements.push(value);
        }
      });

      // Sort elements by their order (if present)
      elements.sort(
        (a, b) => (a.index || "").localeCompare(b.index || ""),
      );

      // Update scene with remote elements (non-undoable)
      excalidrawAPIRef.current.updateScene({
        elements,
        ...(CaptureUpdateActionRef
          ? { captureUpdate: CaptureUpdateActionRef.NEVER }
          : {}),
      });

      // Clear flag after a tick
      requestAnimationFrame(() => {
        isRemoteUpdateRef.current = false;
      });
    };

    yMap.observe(observer);

    // If Y.Map already has data, apply it to Excalidraw
    if (yMap.size > 0 && excalidrawAPIRef.current) {
      observer();
    }

    return () => {
      yMap.unobserve(observer);
    };
  }, [collaboration, note.id]);

  // ---- Excalidraw onChange → Yjs sync ----
  const handleExcalidrawChange = useCallback(
    (elements: readonly any[], _appState: any) => {
      if (isRemoteUpdateRef.current) return;

      // Mark as initialized after first onChange (to skip initial load)
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }

      setHasChanges(true);

      // Sync to Yjs if collaboration is active
      if (!collaboration || !yMapRef.current) return;

      isLocalUpdateRef.current = true;
      const yMap = yMapRef.current;

      collaboration.doc.transact(() => {
        // Track which element IDs are present
        const currentIds = new Set<string>();

        for (const element of elements) {
          currentIds.add(element.id);
          const existing = yMap.get(element.id);

          // Only update if version changed or element is new
          if (!existing || existing.version !== element.version) {
            yMap.set(element.id, { ...element });
          }
        }

        // Remove deleted elements (not in current elements)
        const keysToDelete: string[] = [];
        yMap.forEach((_value, key) => {
          if (!currentIds.has(key)) {
            keysToDelete.push(key);
          }
        });
        for (const key of keysToDelete) {
          yMap.delete(key);
        }
      });

      isLocalUpdateRef.current = false;
    },
    [collaboration],
  );

  // ---- Pointer update for collaboration awareness ----
  const handlePointerUpdate = useCallback(
    (payload: any) => {
      if (!collaboration) return;
      collaboration.provider.awareness.setLocalStateField("pointer", {
        x: payload.pointer.x,
        y: payload.pointer.y,
        tool: payload.pointer.tool,
      });
    },
    [collaboration],
  );

  // ---- Save handler ----
  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      const sceneElements = api.getSceneElements();
      const appState = api.getAppState();

      const content = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "bridge-notes",
        elements: sceneElements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
        },
        files: {},
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

      // Persist Yjs state if collaboration is active
      if (collaboration) {
        collaboration.provider.sendFullState();
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit, onSave, note.id, note.title, note.tags, title, collaboration]);

  // Keyboard shortcut: Ctrl/Cmd+S
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header - matches NoteEditor pattern */}
      <div className="px-4 sm:px-6 py-3 border-b border-foreground/5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-transparent text-lg font-bold text-foreground focus:outline-none placeholder-slate-600"
            placeholder={t("notes.titlePlaceholder", "제목을 입력하세요")}
            readOnly={!canEdit}
          />
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
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
            <span className="text-[10px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
              <Clock size={10} />
              {formatDateTime(note.updated_at)}
              {note.updated_by && ` · ${note.updated_by.name}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {/* Collaboration presence */}
          {collaboration && (
            <CollabPresence
              status={collaboration.status}
              connectedUsers={collaboration.connectedUsers}
              currentUserName={currentUserName}
              currentUserColor={currentUserColor}
            />
          )}

          <NoteShareButton
            boardId={boardId}
            note={note}
            canEdit={canEdit}
            onNoteUpdate={onNoteUpdate}
          />

          <div className="w-px h-5 bg-white/10 hidden sm:block" />

          <NoteTagManager
            boardId={boardId}
            noteId={note.id}
            noteTags={note.tags}
            allTags={tags}
            canEdit={canEdit}
            onSave={(tagIds) => onSave(note.id, { tagIds })}
            onTagsChange={onTagsChange}
          />
          <NoteVersionHistory
            boardId={boardId}
            noteId={note.id}
            versionCount={note.version_count}
            canEdit={canEdit}
            onRestore={async () => {
              const { noteService } = await import("../../utils/services");
              const updated = await noteService.getDetail(boardId, note.id);
              setTitle(updated.title);
              setHasChanges(false);
              // Reload the Excalidraw scene from restored content
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
            }}
          />
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                hasChanges
                  ? "bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20"
                  : "bg-foreground/5 text-slate-500 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              <span className="hidden lg:inline">
                {t("common.save", "저장")}
              </span>
              {hasChanges && (
                <span className="text-[10px] opacity-70 hidden lg:inline">
                  ⌘S
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Excalidraw Canvas */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="min-h-[60vh] h-[calc(100vh-200px)] bg-bridge-obsidian rounded-2xl border border-foreground/5 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            }
          >
            <ExcalidrawLazy
              excalidrawAPI={(api: any) => {
                excalidrawAPIRef.current = api;
              }}
              initialData={initialDataRef.current || undefined}
              onChange={handleExcalidrawChange}
              onPointerUpdate={collaboration ? handlePointerUpdate : undefined}
              theme={isDark ? "dark" : "light"}
              viewModeEnabled={!canEdit}
              isCollaborating={!!collaboration}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  export: { saveFileToDisk: true },
                },
              }}
            />
          </Suspense>
        </div>

        {/* Bottom Comments Panel */}
        {currentUser && (
          <NoteBottomComments
            boardId={boardId}
            noteId={note.id}
            currentUserId={currentUser.id}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
