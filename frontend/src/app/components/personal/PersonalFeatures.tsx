import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { personalFeatureAPI } from "../../utils/services";
import { MotionModal } from "../ui/MotionModal";
import { EmptyState } from "../ui/EmptyState";
import {
  PERSONAL_FEATURES,
  FEATURE_SCHEMA_VER,
  getFeature,
} from "./features/registry";
import { FeatureDocShell } from "./features/FeatureDocShell";
import type { PersonalFeature, PersonalFeatureDocSummary } from "./features/types";

/**
 * 마이 스페이스 「기능」 탭.
 * 기획서: docs/Design/myspace-features-timetable.html §02 · §03
 *
 * 스토리지 탭의 2단 레이아웃(왼쪽 목록 + 오른쪽 작업 영역)을 그대로 빌린다.
 * 왼쪽 1단 = 기능(레지스트리), 2단 = 그 기능의 문서. 오른쪽 = FeatureDocShell.
 * 딥링크: ?tab=features&feature=<key>&doc=<id>
 */

const PARAM_TAB = "tab";
const PARAM_FEATURE = "feature";
const PARAM_DOC = "doc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFeature = PersonalFeature<any>;

const READY_FEATURES = PERSONAL_FEATURES.filter((f) => f.status === "ready");

function resolveFeature(key: string | null): AnyFeature {
  const found = key ? getFeature(key) : undefined;
  if (found && found.status === "ready") return found;
  return READY_FEATURES[0] ?? PERSONAL_FEATURES[0];
}

export function PersonalFeatures() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [featureKey, setFeatureKey] = useState<string>(
    () => resolveFeature(searchParams.get(PARAM_FEATURE)).key,
  );
  const [selectedDocId, setSelectedDocId] = useState<string | null>(
    () => searchParams.get(PARAM_DOC),
  );
  /** 기능별 문서 목록. 아직 안 불러온 기능은 키가 없다 (배지 숨김). */
  const [docsByFeature, setDocsByFeature] = useState<
    Record<string, PersonalFeatureDocSummary[]>
  >({});
  const [listLoading, setListLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const feature = useMemo(() => resolveFeature(featureKey), [featureKey]);
  const docs = docsByFeature[feature.key];
  const selectedDocIdRef = useRef(selectedDocId);
  selectedDocIdRef.current = selectedDocId;

  const loadDocs = useCallback(async (key: string) => {
    try {
      const list = await personalFeatureAPI.listDocs(key);
      setDocsByFeature((prev) => ({ ...prev, [key]: list }));
      return list;
    } catch (e) {
      console.error("Failed to load feature docs:", e);
      return null;
    }
  }, []);

  // 최초 로드: 준비된 기능 전부의 목록(배지 수 표시용). 선택 문서가 목록에 없으면 첫 문서로.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      const results = await Promise.all(
        READY_FEATURES.map(async (f) => [f.key, await loadDocs(f.key)] as const),
      );
      if (cancelled) return;
      const current = results.find(([k]) => k === feature.key)?.[1] ?? [];
      const wanted = selectedDocIdRef.current;
      if (!wanted || !current.some((d) => d.id === wanted)) {
        setSelectedDocId(current[0]?.id ?? null);
      }
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 동기화 (탭 상태는 페이지가 갖지 않으므로 tab=features 도 같이 적는다)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set(PARAM_TAB, "features");
    next.set(PARAM_FEATURE, feature.key);
    if (selectedDocId) next.set(PARAM_DOC, selectedDocId);
    else next.delete(PARAM_DOC);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.key, selectedDocId]);

  // ─── 기능 선택 ───
  const selectFeature = useCallback(
    async (f: AnyFeature) => {
      if (f.status === "soon") {
        toast.info(t("personal.features.soon_toast"));
        return;
      }
      if (f.key === feature.key) return;
      setFeatureKey(f.key);
      const list = docsByFeature[f.key] ?? (await loadDocs(f.key)) ?? [];
      setSelectedDocId(list[0]?.id ?? null);
    },
    [feature.key, docsByFeature, loadDocs, t],
  );

  // ─── 새 문서 ───
  const createDoc = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await personalFeatureAPI.createDoc(feature.key, {
        title: t(feature.defaultTitleKey),
        content: feature.createDefault(),
        schema_ver: FEATURE_SCHEMA_VER[feature.key] ?? 1,
      });
      await loadDocs(feature.key);
      setSelectedDocId(created.id);
    } catch (e) {
      console.error("Failed to create feature doc:", e);
      toast.error(t("common.error", "오류가 발생했습니다"));
    } finally {
      setCreating(false);
    }
  }, [creating, feature, loadDocs, t]);

  // ─── 삭제 (확인 모달은 여기 한 곳) ───
  const confirmDelete = useCallback(async () => {
    if (!selectedDocId || deleting) return;
    setDeleting(true);
    const id = selectedDocId;
    try {
      await personalFeatureAPI.deleteDoc(feature.key, id);
      const list = (await loadDocs(feature.key)) ?? [];
      const remaining = list.filter((d) => d.id !== id);
      setSelectedDocId(remaining[0]?.id ?? null);
      setConfirmDeleteOpen(false);
    } catch (e) {
      console.error("Failed to delete feature doc:", e);
      toast.error(t("common.error", "오류가 발생했습니다"));
    } finally {
      setDeleting(false);
    }
  }, [selectedDocId, deleting, feature.key, loadDocs, t]);

  // 셸에서 제목 변경 · 복제 뒤 호출 — 목록 새로 고침 + 선택 이동
  const handleDocChanged = useCallback(
    async (id: string) => {
      await loadDocs(feature.key);
      setSelectedDocId(id);
    },
    [feature.key, loadDocs],
  );

  const selectedDoc = docs?.find((d) => d.id === selectedDocId) ?? null;
  const newDocLabel = t(feature.newDocLabelKey);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 md:p-5">
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
        {/* Sidebar */}
        <aside className="w-full md:w-56 flex-none flex flex-col gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createDoc}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {newDocLabel}
            </button>
            <button
              type="button"
              aria-label={t("personal.features.delete")}
              disabled={!selectedDoc}
              onClick={() => setConfirmDeleteOpen(true)}
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* 기능 › 문서 목록 */}
          <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian p-2 overflow-y-auto custom-scrollbar max-h-[40vh] md:max-h-none md:flex-1">
            {PERSONAL_FEATURES.map((f) => {
              const isSoon = f.status === "soon";
              const isActive = f.key === feature.key;
              const list = docsByFeature[f.key];
              const Icon = f.icon;
              return (
                <div key={f.key}>
                  <button
                    type="button"
                    onClick={() => selectFeature(f)}
                    aria-disabled={isSoon}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
                      isSoon
                        ? "text-slate-500 opacity-60 cursor-default"
                        : isActive
                          ? "text-foreground font-bold bg-foreground/5"
                          : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-none" />
                    <span className="flex-1 min-w-0 text-left truncate">
                      {t(f.labelKey)}
                    </span>
                    {isSoon ? (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/5 text-slate-500">
                        {t("personal.features.soon")}
                      </span>
                    ) : list ? (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                        {list.length}
                      </span>
                    ) : null}
                  </button>

                  {isActive && !isSoon && (
                    <div className="flex flex-col">
                      {listLoading && !list ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
                        </div>
                      ) : (
                        list?.map((d) => {
                          const isSelected = d.id === selectedDocId;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setSelectedDocId(d.id)}
                              title={d.title}
                              className={`w-full flex items-center gap-1.5 pl-8 pr-2 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                isSelected
                                  ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                              }`}
                            >
                              <ChevronRight
                                className={`w-3 h-3 flex-none ${isSelected ? "opacity-100" : "opacity-0"}`}
                              />
                              <span className="min-w-0 truncate">
                                {d.title || t("personal.features.untitled")}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          {listLoading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : selectedDoc ? (
            <FeatureDocShell
              key={`${feature.key}:${selectedDoc.id}`}
              feature={feature}
              docId={selectedDoc.id}
              onDocChanged={handleDocChanged}
              onRequestDelete={() => setConfirmDeleteOpen(true)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian">
              <EmptyState
                icon={feature.icon}
                title={t("personal.features.empty_title")}
                description={t("personal.features.empty_desc")}
                action={{ label: `+ ${newDocLabel}`, onClick: createDoc }}
              />
            </div>
          )}
        </section>
      </div>

      {/* 삭제 확인 */}
      <MotionModal
        open={confirmDeleteOpen}
        onClose={() => !deleting && setConfirmDeleteOpen(false)}
        accentColor
        aria-labelledby="feature-doc-delete-title"
        className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center">
            <Trash2 className="w-4 h-4" />
          </div>
          <h2
            id="feature-doc-delete-title"
            className="text-sm font-bold text-foreground"
          >
            {t("personal.features.delete_confirm_title")}
          </h2>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-foreground truncate">
            {selectedDoc?.title || t("personal.features.untitled")}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t("personal.features.delete_confirm_desc")}
          </p>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {t("common.cancel", "취소")}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-500 hover:bg-rose-500/90 transition-colors disabled:opacity-50"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("personal.features.delete")}
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
