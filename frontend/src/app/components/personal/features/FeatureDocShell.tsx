import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Printer, Trash2 } from "lucide-react";
import { personalFeatureAPI } from "../../../utils/services";
import { formatRelativeTime } from "../../../utils/dateUtils";
import type {
  PersonalFeature,
  PersonalFeatureDoc,
  PersonalFeatureTerm,
} from "./types";

/**
 * 기능 문서 공통 셸.
 * 기획서: docs/Design/myspace-features-timetable.html §03 ④, §07 Right
 *
 * 문서 로드 · 자동 저장(디바운스 800ms) · 제목 편집 · 복제 · 삭제 · PDF 버튼을 맡는다.
 * 기능(feature.Editor)은 자기 content 스키마만 안다.
 */

const SAVE_DEBOUNCE_MS = 800;
const NARROW_QUERY = "(max-width: 639px)";
const PRINT_WRAPPER_ID = "timetable-print";

interface FeatureDocShellProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feature: PersonalFeature<any>;
  docId: string;
  /**
   * 제목 변경 · 복제 뒤 왼쪽 목록을 새로 고치라는 신호.
   * 복제는 새 문서 id를, 제목 변경은 현재 id를 넘긴다.
   */
  onDocChanged: (selectedId: string) => void;
  /** 삭제 버튼 — 확인 모달과 실제 삭제는 PersonalFeatures가 맡는다 (구현 1벌 유지). */
  onRequestDelete: () => void;
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(NARROW_QUERY).matches
      : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return narrow;
}

export function FeatureDocShell({
  feature,
  docId,
  onDocChanged,
  onRequestDelete,
}: FeatureDocShellProps) {
  const { t } = useTranslation();
  const isNarrow = useIsNarrow();

  const [doc, setDoc] = useState<PersonalFeatureDoc | null>(null);
  const [terms, setTerms] = useState<PersonalFeatureTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  // 제목 인라인 편집
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // 「n분 전 저장됨」 갱신용 틱
  const [, setTick] = useState(0);

  // 디바운스 저장 — 최신 content와 타이머는 ref로 들고 있다가 언마운트/문서 전환 시 flush
  const pendingContentRef = useRef<unknown | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const docIdRef = useRef(docId);
  docIdRef.current = docId;
  const featureKeyRef = useRef(feature.key);
  featureKeyRef.current = feature.key;

  const refreshTerms = useCallback(async () => {
    try {
      setTerms(await personalFeatureAPI.listTerms(featureKeyRef.current));
    } catch (e) {
      console.error("Failed to load feature terms:", e);
    }
  }, []);

  /** 보류 중인 content를 즉시 PATCH. 다른 문서로 넘어간 뒤에도 원래 id로 저장되도록 인자를 고정한다. */
  const flushSave = useCallback(
    async (featureKey: string, id: string, content: unknown) => {
      setSaving(true);
      try {
        const saved = await personalFeatureAPI.updateDoc(featureKey, id, {
          content,
        });
        if (docIdRef.current === id) {
          setLastSavedAt(saved.updated_at);
          setDoc((prev) =>
            prev && prev.id === id
              ? { ...prev, updated_at: saved.updated_at }
              : prev,
          );
          void refreshTerms();
        }
      } catch (e) {
        console.error("Failed to save feature doc:", e);
      } finally {
        setSaving(false);
      }
    },
    [refreshTerms],
  );

  const flushPending = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const content = pendingContentRef.current;
    if (content === null) return;
    pendingContentRef.current = null;
    void flushSave(featureKeyRef.current, docIdRef.current, content);
  }, [flushSave]);

  const handleChange = useCallback(
    (content: unknown) => {
      pendingContentRef.current = content;
      setDoc((prev) => (prev ? { ...prev, content } : prev));
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        flushPending();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushPending],
  );

  const handleForgetTerm = useCallback(
    async (field: string, value: string) => {
      try {
        await personalFeatureAPI.forgetTerm(featureKeyRef.current, field, value);
        setTerms((prev) =>
          prev.filter((x) => !(x.field === field && x.value === value)),
        );
      } catch (e) {
        console.error("Failed to forget term:", e);
      }
    },
    [],
  );

  // 문서 + 추천 용어 로드. docId가 바뀌면 이전 문서의 보류 저장을 먼저 flush.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDoc(null);
    setEditingTitle(false);
    (async () => {
      try {
        const [d, ts] = await Promise.all([
          personalFeatureAPI.getDoc(feature.key, docId),
          personalFeatureAPI.listTerms(feature.key),
        ]);
        if (cancelled) return;
        setDoc(d);
        setTerms(ts);
        setLastSavedAt(d.updated_at);
      } catch (e) {
        console.error("Failed to load feature doc:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // 문서 전환·언마운트 시 보류 저장 flush (id는 ref로 고정되기 전 값이 필요하므로 여기서 직접)
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const content = pendingContentRef.current;
      if (content !== null) {
        pendingContentRef.current = null;
        void flushSave(feature.key, docId, content);
      }
    };
  }, [feature.key, docId, flushSave]);

  // 상대 시각 갱신
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ─── 제목 ───
  const startEditTitle = useCallback(() => {
    if (!doc) return;
    setTitleDraft(doc.title);
    setEditingTitle(true);
  }, [doc]);

  const commitTitle = useCallback(async () => {
    if (!doc) return;
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === doc.title) return;
    const id = doc.id;
    setDoc((prev) => (prev ? { ...prev, title: next } : prev));
    try {
      const saved = await personalFeatureAPI.updateDoc(feature.key, id, {
        title: next,
      });
      setLastSavedAt(saved.updated_at);
      onDocChanged(id);
    } catch (e) {
      console.error("Failed to rename feature doc:", e);
    }
  }, [doc, titleDraft, feature.key, onDocChanged]);

  // ─── 복제 ───
  const handleDuplicate = useCallback(async () => {
    if (!doc || duplicating) return;
    flushPending();
    setDuplicating(true);
    try {
      const copy = await personalFeatureAPI.duplicateDoc(feature.key, doc.id);
      onDocChanged(copy.id);
    } catch (e) {
      console.error("Failed to duplicate feature doc:", e);
    } finally {
      setDuplicating(false);
    }
  }, [doc, duplicating, feature.key, flushPending, onDocChanged]);

  // ─── PDF (window.print) ───
  const handlePrint = useCallback(() => {
    if (!doc) return;
    flushPending();
    const original = document.title;
    document.title = doc.title || t("personal.features.untitled");
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }, [doc, flushPending, t]);

  if (loading || !doc) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const Editor = feature.Editor;
  const PrintSheet = feature.PrintSheet;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              aria-label={t("personal.features.untitled")}
              className="flex-1 min-w-0 max-w-md bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-2.5 text-sm font-bold text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            />
          ) : (
            <button
              type="button"
              onClick={startEditTitle}
              title={doc.title}
              className="min-w-0 truncate text-sm md:text-base font-bold text-foreground hover:bg-foreground/5 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors text-left"
            >
              {doc.title || t("personal.features.untitled")}
            </button>
          )}
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {saving
              ? t("personal.features.saving")
              : lastSavedAt
                ? `${t("personal.features.saved_ago")} · ${formatRelativeTime(lastSavedAt)}`
                : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={duplicating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            {duplicating ? (
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {t("personal.features.duplicate")}
          </button>
          {PrintSheet && (
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
            >
              <Printer className="w-4 h-4" />
              {t("personal.features.export_pdf")}
            </button>
          )}
          <button
            type="button"
            onClick={onRequestDelete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t("personal.features.delete")}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 print:hidden">
        <Editor
          doc={doc}
          terms={terms}
          onChange={handleChange}
          onForgetTerm={handleForgetTerm}
          readOnly={isNarrow}
        />
      </div>

      {/* Print sheet — 인쇄 CSS는 기능 쪽(PrintSheet)이 가져온다. 여기서는 id 래퍼만 제공.
          body 바로 아래에 포털로 두는 이유: 앱의 스크롤/overflow 컨테이너 안에 있으면 긴 표가 한 페이지로 잘리거나
          숨긴 화면이 자리를 차지해 빈 페이지가 딸려 나온다. body 직계 형제만 숨기면 종이가 페이지를 자연스럽게 넘긴다. */}
      {PrintSheet &&
        createPortal(
          <div id={PRINT_WRAPPER_ID} className="hidden print:block">
            <PrintSheet doc={doc} />
          </div>,
          document.body,
        )}
    </div>
  );
}
