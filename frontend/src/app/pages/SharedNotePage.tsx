import React, { useState, useEffect, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import {
  FileText,
  Clock,
  Tag as TagIcon,
  AlertCircle,
  ArrowLeft,
  Loader2,
  FileDown,
  Check,
} from "lucide-react";

import "@excalidraw/excalidraw/index.css";

const ExcalidrawLazy = React.lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return { default: mod.Excalidraw };
});
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { publicNoteAPI, resolveFileUrl } from "../utils/api";
import type { SharedNote } from "../utils/api";
import { formatDateTime } from "../utils/dateUtils";
import { noteSchema as schema } from "../components/notes/blocks/schema";
import { contentToHtml, contentToMarkdown } from "../utils/blocknoteContent";

function useSystemTheme() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDark;
}

export function SharedNotePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useTranslation();
  const isDark = useSystemTheme();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [markdownCopied, setMarkdownCopied] = useState(false);

  // Apply theme class to html element for CSS variables (bridge-dark, bridge-obsidian, etc.)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
    return () => {
      root.classList.remove("light", "dark");
    };
  }, [isDark]);

  // Throwaway converter editor — used solely to normalize stored content
  // (JSON or legacy HTML) into HTML for static rendering. No BlockNoteView,
  // no editing surface, so the page payload is much smaller than a full
  // BlockNote mount.
  const converter = useCreateBlockNote({
    schema,
    resolveFileUrl: async (url: string) => resolveFileUrl(url),
  } as any);

  useEffect(() => {
    if (!shareToken) return;

    const loadNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await publicNoteAPI.getSharedNote(shareToken);
        setNote(data);
      } catch (err: any) {
        setError(
          err?.message || t("notes.shareNotFound", "문서를 찾을 수 없습니다"),
        );
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [shareToken, t]);

  // Convert content to HTML when note arrives (skip BOARD type - it uses Excalidraw, not BlockNote)
  useEffect(() => {
    if (!note?.content?.trim() || note.type === "BOARD") {
      setRenderedHtml("");
      return;
    }
    let cancelled = false;
    (async () => {
      const html = await contentToHtml(converter as any, note.content);
      if (!cancelled) setRenderedHtml(html);
    })();
    return () => {
      cancelled = true;
    };
  }, [note, converter]);

  const handleCopyMarkdown = async () => {
    if (!note?.content) return;
    try {
      const md = await contentToMarkdown(converter as any, note.content);
      await navigator.clipboard.writeText(md);
      setMarkdownCopied(true);
      window.setTimeout(() => setMarkdownCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy markdown:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent mx-auto mb-4" />
          <p className="text-slate-400 text-sm">
            {t("app.loading", "로딩 중...")}
          </p>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t("notes.shareNotAvailable", "문서를 볼 수 없습니다")}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {t(
              "notes.shareNotAvailableDesc",
              "이 공유 링크는 만료되었거나 문서가 삭제되었습니다.",
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            <ArrowLeft size={14} />
            {t("notes.shareGoHome", "홈으로 이동")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Top bar */}
      <header className="border-b border-foreground/5 bg-bridge-obsidian">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <img src="/BridgeSpotsIcon.png" alt="BRIDGE" className="h-6 w-6" />
            <span className="text-sm font-bold text-foreground">BRIDGE</span>
          </Link>
          <div className="flex items-center gap-3">
            {note.type !== "BOARD" && (
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                title={t("notes.copyMarkdown", "Markdown으로 복사")}
              >
                {markdownCopied ? <Check size={12} /> : <FileDown size={12} />}
                <span className="hidden sm:inline">
                  {markdownCopied
                    ? t("notes.copied", "복사됨")
                    : t("notes.copyMarkdownShort", "Markdown")}
                </span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-slate-500">
              <FileText size={12} />
              {t("notes.shareReadOnly", "READ ONLY")}
            </div>
          </div>
        </div>
      </header>

      {/* Note content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground mb-3">
          {note.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center flex-wrap gap-3 mb-6">
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
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
          )}
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={10} />
            {formatDateTime(note.updated_at)}
            {note.author_name && ` · ${note.author_name}`}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-foreground/5 mb-6" />

        {/* Content viewer */}
        {note.type === "BOARD" ? (
          <Suspense
            fallback={
              <div
                className="flex items-center justify-center min-h-[60vh]"
                role="status"
                aria-label="로딩 중"
              >
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            }
          >
            <div className="w-full min-h-[60vh] h-[75vh] excalidraw-bridge-container">
              <ExcalidrawLazy
                initialData={(() => {
                  try {
                    const parsed = JSON.parse(note.content || "{}");
                    return {
                      elements: parsed.elements || [],
                      appState: {
                        viewBackgroundColor:
                          parsed.appState?.viewBackgroundColor ||
                          (isDark ? "#151B28" : "#efe6d8"),
                      },
                      files: parsed.files || {},
                    };
                  } catch {
                    return {};
                  }
                })()}
                viewModeEnabled={true}
                theme={isDark ? "dark" : "light"}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    export: { saveFileToDisk: false },
                  },
                }}
              />
            </div>
          </Suspense>
        ) : (
          <div
            className={`shared-note-viewer bn-container bn-shadcn ${isDark ? "dark" : "light"}`}
            data-color-scheme={isDark ? "dark" : "light"}
            style={
              {
                "--bn-colors-editor-background": "transparent",
              } as React.CSSProperties
            }
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(renderedHtml, {
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
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/5 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="text-xs tracking-[0.3em] uppercase text-slate-600">
            Shared via BRIDGE
          </span>
          <a
            href="https://bridgespots.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-bridge-accent transition-colors"
          >
            bridgespots.com
          </a>
        </div>
      </footer>
    </div>
  );
}
