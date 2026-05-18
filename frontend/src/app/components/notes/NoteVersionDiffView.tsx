import { useMemo, useRef, useEffect, Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { Loader2 } from "lucide-react";
import htmldiff from "node-htmldiff";
import { useTheme } from "../../contexts/ThemeContext";
import { computeSceneDiff, DIFF_COLORS } from "../../utils/excalidrawDiff";

const ExcalidrawLazy = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return { default: mod.Excalidraw };
});

interface NoteVersionDiffViewProps {
  noteType: string;
  previousTitle: string;
  currentTitle: string;
  previousContent: string | null | undefined;
  currentContent: string | null | undefined;
}

export function NoteVersionDiffView({
  noteType,
  previousTitle,
  currentTitle,
  previousContent,
  currentContent,
}: NoteVersionDiffViewProps) {
  const { t } = useTranslation();

  const titleDiffHtml = useMemo(() => {
    if (previousTitle === currentTitle) return null;
    try {
      const prev = escapeHtml(previousTitle || "");
      const curr = escapeHtml(currentTitle || "");
      return DOMPurify.sanitize(htmldiff(prev, curr), {
        ADD_TAGS: ["ins", "del"],
        ADD_ATTR: ["data-diff-node", "data-operation-index"],
      });
    } catch {
      return null;
    }
  }, [previousTitle, currentTitle]);

  if (noteType === "BOARD") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {titleDiffHtml && (
          <div className="px-4 py-2 border-b border-foreground/5 text-xs text-slate-500">
            <span className="mr-2">
              {t("notes.diff.titleChanged", "제목 변경")}:
            </span>
            <span
              className="note-diff inline"
              dangerouslySetInnerHTML={{ __html: titleDiffHtml }}
            />
          </div>
        )}
        <BoardDiffCanvas
          previousContent={previousContent}
          currentContent={currentContent}
        />
      </div>
    );
  }

  // DOCUMENT (and any HTML-based type)
  return (
    <DocumentDiffBody
      titleDiffHtml={titleDiffHtml}
      previousContent={previousContent}
      currentContent={currentContent}
    />
  );
}

function DocumentDiffBody({
  titleDiffHtml,
  previousContent,
  currentContent,
}: {
  titleDiffHtml: string | null;
  previousContent: string | null | undefined;
  currentContent: string | null | undefined;
}) {
  const { t } = useTranslation();
  const html = useMemo(() => {
    const prev = previousContent || "";
    const curr = currentContent || "";
    try {
      const diffed = htmldiff(prev, curr);
      return DOMPurify.sanitize(diffed, {
        ADD_TAGS: ["ins", "del"],
        ADD_ATTR: ["data-diff-node", "data-operation-index"],
      });
    } catch {
      return DOMPurify.sanitize(curr);
    }
  }, [previousContent, currentContent]);

  const hasDiff =
    (previousContent || "") !== (currentContent || "") || !!titleDiffHtml;

  return (
    <div className="flex-1 overflow-y-auto p-4 note-diff">
      {titleDiffHtml && (
        <div className="mb-3 pb-2 border-b border-foreground/5 text-xs">
          <span className="text-slate-500 mr-2">
            {t("notes.diff.titleChanged", "제목 변경")}:
          </span>
          <span
            className="inline"
            dangerouslySetInnerHTML={{ __html: titleDiffHtml }}
          />
        </div>
      )}
      {hasDiff ? (
        <div
          className="prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="text-center text-slate-500 text-xs py-8">
          {t("notes.diff.noChanges", "변경 사항이 없습니다")}
        </div>
      )}
    </div>
  );
}

function BoardDiffCanvas({
  previousContent,
  currentContent,
}: {
  previousContent: string | null | undefined;
  currentContent: string | null | undefined;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const diff = useMemo(
    () => computeSceneDiff(previousContent, currentContent),
    [previousContent, currentContent],
  );

  const bgColor = isDark ? "#1e1e1e" : "#ffffff";

  const initialData = useMemo(
    () => ({
      elements: diff.elements,
      appState: {
        ...diff.appState,
        viewBackgroundColor: bgColor,
      },
      files: diff.files,
    }),
    [diff, bgColor],
  );

  // Excalidraw mounts a canvas; trigger resize observer once mounted.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event("resize"));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const noChanges =
    diff.stats.added === 0 &&
    diff.stats.removed === 0 &&
    diff.stats.modified === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-foreground/5 flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: DIFF_COLORS.added }}
          />
          <span className="text-slate-400">
            {t("notes.diff.added", "추가")}
          </span>
          <span className="text-foreground font-bold">{diff.stats.added}</span>
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: DIFF_COLORS.removed }}
          />
          <span className="text-slate-400">
            {t("notes.diff.removed", "삭제")}
          </span>
          <span className="text-foreground font-bold">
            {diff.stats.removed}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: DIFF_COLORS.modified }}
          />
          <span className="text-slate-400">
            {t("notes.diff.modified", "변경")}
          </span>
          <span className="text-foreground font-bold">
            {diff.stats.modified}
          </span>
        </span>
      </div>
      <div ref={containerRef} className="flex-1 relative">
        {noChanges ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
            {t("notes.diff.noChanges", "변경 사항이 없습니다")}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            }
          >
            <ExcalidrawLazy
              initialData={initialData}
              viewModeEnabled
              theme={isDark ? "dark" : "light"}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas: false,
                  export: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                  saveAsImage: false,
                },
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
