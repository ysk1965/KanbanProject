import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { personalTaskAPI } from "../../utils/api";
import type { Feature, PersonalTask } from "../../types";
import { formatRelativeTime } from "../../utils/dateUtils";
import {
  BACKLOG_DRAG_TYPE,
  BACKLOG_DROP_EVENT,
  type BacklogDropDetail,
} from "../../utils/backlogDrag";
import { PromoteBacklogModal, type PromoteTarget } from "./PromoteBacklogModal";

/** 백로그 제목 최대 길이 — 백엔드 @Size(max = 200)과 같은 값 */
const TITLE_MAX = 200;
/** 이 길이부터 카운터를 노출한다 (평소엔 숨긴다) */
const COUNTER_FROM = 190;

type RailTab = "open" | "promoted";

/** 저장에 실패해 아직 서버에 없는 항목 — 카드로는 보이되 드래그·승격은 잠근다 */
interface PendingItem {
  localId: string;
  title: string;
  state: "sending" | "failed";
}

interface BacklogRailProps {
  boardId: string;
  /** 보드의 피처 목록 — 태스크 승격 시 붙일 곳을 고른다 */
  features: Feature[];
  /** 승격 후 보드 데이터를 다시 읽게 한다 */
  onPromoted?: () => void;
}

const draftKey = (boardId: string) => `bridge.backlog.draft.${boardId}`;
const collapseKey = (boardId: string) => `bridge.backlog.collapsed.${boardId}`;

/**
 * 백로그 레일 — 대시보드 맨 아래에 붙는 개인 TODO.
 *
 * 대시보드는 성숙도 순으로 쌓여 있다(타임블록·간트 = 확정 / 배치 레일 = 태스크는 됨).
 * 백로그는 그 아래 한 층, "아직 아무것도 아닌 일"을 담는다. 나만 보인다.
 *
 * 카드를 위로 끌어 놓는 자리가 곧 승격 대상이 된다. 드래그를 못 쓰는 환경을 위해
 * 카드마다 빠른 승격 버튼을 함께 둔다(배치 레일의 "오늘/내일"과 같은 패턴).
 */
export function BacklogRail({ boardId, features, onPromoted }: BacklogRailProps) {
  const { t } = useTranslation();

  const [items, setItems] = useState<PersonalTask[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>("open");

  const [draft, setDraft] = useState("");
  // 줄바꿈이 섞인 붙여넣기 — 나눌지 한 번만 묻는다
  const [pastedLines, setPastedLines] = useState<string[] | null>(null);
  const [pastedRaw, setPastedRaw] = useState("");

  const [collapsed, setCollapsed] = useState(false);
  const [promoting, setPromoting] = useState<{
    item: PersonalTask;
    target: PromoteTarget;
    /** 간트 날짜 칸에 떨궜을 때 그 날짜 — 승격되는 태스크의 시작·마감이 된다 */
    presetDate?: string;
  } | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── 초기 상태 복구 (보드별) ── */
  useEffect(() => {
    try {
      setDraft(window.localStorage.getItem(draftKey(boardId)) ?? "");
      setCollapsed(window.localStorage.getItem(collapseKey(boardId)) === "1");
    } catch {
      // 프라이빗 모드 등에서 localStorage가 막혀도 기능 자체는 동작해야 한다
    }
  }, [boardId]);

  useEffect(() => {
    try {
      if (draft) window.localStorage.setItem(draftKey(boardId), draft);
      else window.localStorage.removeItem(draftKey(boardId));
    } catch {
      /* 무시 */
    }
  }, [draft, boardId]);

  /* ── 목록 ── */
  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await personalTaskAPI.getBacklog(boardId);
      setItems(list);
    } catch {
      setError(t("backlog.loadFailed", "백로그를 불러오지 못했습니다."));
    } finally {
      setIsLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openItems = useMemo(
    () => items.filter((i) => !i.promoted_type),
    [items],
  );
  const promotedItems = useMemo(
    () => items.filter((i) => !!i.promoted_type),
    [items],
  );
  const visible = tab === "open" ? openItems : promotedItems;

  /* ── 추가 ── */
  const persist = useCallback(
    async (localId: string, title: string) => {
      try {
        const created = await personalTaskAPI.create({
          title,
          // 백로그의 기본은 "우선순위 없음"이다. 서버 기본값(MEDIUM)을 바꾸면
          // 마이스페이스 기존 동작이 함께 바뀌므로 여기서 명시해 보낸다.
          priority: "NONE",
          board_id: boardId,
        });
        setPending((prev) => prev.filter((p) => p.localId !== localId));
        setItems((prev) => [created, ...prev]);
      } catch {
        // 적어둔 걸 날리는 게 최악의 실패다 — 카드를 지우지 않고 재시도할 수 있게 남긴다
        setPending((prev) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, state: "failed" } : p,
          ),
        );
      }
    },
    [boardId],
  );

  const addItems = useCallback(
    (titles: string[]) => {
      const fresh: PendingItem[] = titles
        .map((raw) => raw.trim().slice(0, TITLE_MAX))
        .filter(Boolean)
        .map((title, index) => ({
          localId: `local-${Date.now()}-${index}`,
          title,
          state: "sending" as const,
        }));
      if (!fresh.length) return;

      setPending((prev) => [...fresh, ...prev]);
      setTab("open");
      fresh.forEach((p) => void persist(p.localId, p.title));
    },
    [persist],
  );

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const value = draft.trim();
    if (!value) return;
    setDraft("");
    addItems([value]);
    // 포커스를 유지해 연속 캡처가 되게 한다 — 백로그의 주 사용 방식이다
    inputRef.current?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text") ?? "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return; // 한 줄이면 평소대로 붙여넣는다
    e.preventDefault();
    setPastedLines(lines);
    setPastedRaw(text.replace(/\s*\r?\n\s*/g, " ").trim().slice(0, TITLE_MAX));
  };

  /* ── 접기 / 진입점 ── */
  const applyCollapsed = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      try {
        window.localStorage.setItem(collapseKey(boardId), next ? "1" : "0");
      } catch {
        /* 무시 */
      }
    },
    [boardId],
  );

  const focusAdd = useCallback(() => {
    applyCollapsed(false);
    setTab("open");
    // 레일이 펼쳐진 뒤에 입력칸으로 간다
    window.requestAnimationFrame(() => {
      if (trackRef.current) trackRef.current.scrollLeft = 0;
      inputRef.current?.focus();
    });
  }, [applyCollapsed]);

  // b (한글 자판에서는 ㅠ) — 입력 컨텍스트가 아닐 때만. ⌘K는 마이스페이스가 이미 쓴다.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "b" && e.key !== "ㅠ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      focusAdd();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusAdd]);

  /* ── 간트 날짜 칸에 떨어졌을 때 ── */
  useEffect(() => {
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<BacklogDropDetail>).detail;
      if (!detail?.id) return;
      const item = items.find((i) => i.id === detail.id && !i.promoted_type);
      if (!item) return;
      // 놓은 자리가 날짜를 정했으니 피처만 고르면 된다
      setPromoting({ item, target: "TASK", presetDate: detail.date });
    };
    window.addEventListener(BACKLOG_DROP_EVENT, onDrop);
    return () => window.removeEventListener(BACKLOG_DROP_EVENT, onDrop);
  }, [items]);

  /* ── 승격 ── */
  const handlePromoted = useCallback(
    (updated: PersonalTask) => {
      setItems((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i)),
      );
      setPromoting(null);
      onPromoted?.();
    },
    [onPromoted],
  );

  const handleUnpromote = useCallback(async (item: PersonalTask) => {
    try {
      const updated = await personalTaskAPI.unpromote(item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      /* 되돌리기 실패는 목록 갱신으로 흡수된다 */
    }
  }, []);

  const handleDelete = useCallback(
    async (item: PersonalTask) => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      try {
        await personalTaskAPI.delete(item.id);
      } catch {
        void load(); // 낙관적으로 지웠으니 실패하면 서버 상태로 되돌린다
      }
    },
    [load],
  );

  const promotedLabel = (item: PersonalTask) => {
    const kind =
      item.promoted_type === "TASK"
        ? t("backlog.kindTask", "태스크")
        : item.promoted_type === "CHECKLIST_ITEM"
          ? t("backlog.kindChecklist", "체크리스트")
          : t("backlog.kindTimeblock", "타임블록");
    return item.promoted_label ? `${kind} · ${item.promoted_label}` : kind;
  };

  const cardBase =
    "flex-none w-[236px] snap-start bg-bridge-dark rounded-xl border p-2.5 flex flex-col gap-1 transition-colors";

  return (
    <section
      className="flex-none bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden"
      aria-label={t("backlog.title", "내 백로그")}
    >
      {/* Top Accent Line — 다른 레일과 구분되는 유일한 장식 */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      <div
        className="flex items-center gap-1 px-3 py-2"
        role="tablist"
        aria-label={t("backlog.tabsLabel", "백로그 목록")}
      >
        {(
          [
            {
              key: "open" as const,
              label: t("backlog.title", "내 백로그"),
              count: openItems.length + pending.length,
              dot: "bg-bridge-accent",
            },
            {
              key: "promoted" as const,
              label: t("backlog.promotedTab", "승격됨"),
              count: promotedItems.length,
              dot: "bg-bridge-secondary",
            },
          ] satisfies { key: RailTab; label: string; count: number; dot: string }[]
        ).map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`backlog-rail-tab-${item.key}`}
              aria-selected={active}
              aria-controls="backlog-rail-panel"
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                active
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${item.dot}`}
                aria-hidden="true"
              />
              {item.label}
              <span className="text-xs font-bold text-slate-500">
                {item.count}
              </span>
            </button>
          );
        })}

        <p className="ml-auto hidden md:block text-xs text-slate-600 truncate">
          {t(
            "backlog.hint",
            "b 로 적기 · 간트 날짜 칸에 끌어 놓으면 태스크로 승격 · 나만 보입니다",
          )}
        </p>

        {collapsed && (
          <button
            type="button"
            onClick={focusAdd}
            aria-label={t("backlog.addAria", "백로그 적기")}
            className="ml-auto md:ml-2 flex-none p-1 rounded-lg text-bridge-accent hover:bg-foreground/5 transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={() => applyCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t("backlog.expand", "백로그 레일 펼치기")
              : t("backlog.collapse", "백로그 레일 접기")
          }
          className={`flex-none p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors ${
            collapsed ? "" : "ml-auto md:ml-1"
          }`}
        >
          {collapsed ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        id="backlog-rail-panel"
        role="tabpanel"
        aria-labelledby={`backlog-rail-tab-${tab}`}
        hidden={collapsed}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2
              className="w-5 h-5 animate-spin text-bridge-accent"
              aria-label={t("common.loading", "불러오는 중")}
            />
          </div>
        ) : error ? (
          <p className="text-xs text-slate-500 text-center py-6">{error}</p>
        ) : (
          <div
            ref={trackRef}
            className="flex items-stretch gap-2 px-3 pb-3 overflow-x-auto custom-scrollbar snap-x"
          >
            {/* 입력 카드는 항상 맨 앞. 스냅 대상으로 잡아두지 않으면 마운트 시
                레일이 첫 카드로 스냅해 입력칸을 지나쳐 버린다. */}
            {tab === "open" && (
              <div className="flex-none w-[236px] snap-start rounded-xl border border-dashed border-foreground/10 p-2.5 flex flex-col justify-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  maxLength={TITLE_MAX}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setDraft(e.target.value)
                  }
                  onKeyDown={handleAddKeyDown}
                  onPaste={handlePaste}
                  onFocus={(e) =>
                    e.currentTarget.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    })
                  }
                  placeholder={t("backlog.placeholder", "떠오른 걸 한 줄로…")}
                  aria-label={t("backlog.addAria", "백로그 적기")}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-2.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-600">
                    {t("backlog.enterHint", "Enter 로 추가")}
                  </span>
                  {draft.length >= COUNTER_FROM && (
                    <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400">
                      {draft.length} / {TITLE_MAX}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 여러 줄 붙여넣기 확인 */}
            {tab === "open" && pastedLines && (
              <div className="flex-none w-[270px] snap-start rounded-xl border border-dashed border-bridge-accent bg-bridge-accent/[0.08] p-2.5 flex flex-col gap-2">
                <p className="text-xs font-bold text-foreground">
                  {t("backlog.pasteAsk", "{{count}}개 항목으로 나눌까요?", {
                    count: pastedLines.length,
                  })}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {pastedLines.slice(0, 3).join("  ·  ")}
                  {pastedLines.length > 3 ? "  ·  …" : ""}
                </p>
                <div className="flex items-center gap-1.5 mt-auto">
                  <button
                    type="button"
                    onClick={() => {
                      addItems(pastedLines);
                      setPastedLines(null);
                      setDraft("");
                      inputRef.current?.focus();
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
                  >
                    {t("backlog.pasteSplit", "{{count}}개로 추가", {
                      count: pastedLines.length,
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(pastedRaw);
                      setPastedLines(null);
                      inputRef.current?.focus();
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    {t("backlog.pasteOneLine", "한 줄로 붙이기")}
                  </button>
                </div>
              </div>
            )}

            {/* 저장 중 · 실패 카드 */}
            {tab === "open" &&
              pending.map((p) => (
                <div
                  key={p.localId}
                  className={`${cardBase} ${
                    p.state === "failed"
                      ? "border-rose-500/60 bg-rose-500/[0.06]"
                      : "border-foreground/[0.08] opacity-60"
                  }`}
                >
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                    {p.title}
                  </p>
                  {p.state === "sending" ? (
                    <p className="text-xs text-slate-500">
                      {t("backlog.saving", "저장 중…")}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500">
                        {t("backlog.savedLocally", "저장 안 됨 · 로컬에 보관됨")}
                      </p>
                      <div className="flex items-center gap-1 mt-auto">
                        <TriangleAlert
                          size={12}
                          className="text-rose-600 dark:text-rose-400 flex-none"
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPending((prev) =>
                              prev.map((x) =>
                                x.localId === p.localId
                                  ? { ...x, state: "sending" }
                                  : x,
                              ),
                            );
                            void persist(p.localId, p.title);
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          {t("backlog.retry", "재시도")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPending((prev) =>
                              prev.filter((x) => x.localId !== p.localId),
                            )
                          }
                          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("backlog.discard", "버리기")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

            {visible.length === 0 && pending.length === 0 && (
              <p className="text-xs text-slate-500 py-6 px-3 leading-relaxed">
                {tab === "open"
                  ? t("backlog.empty", "백로그가 비었습니다.")
                  : t(
                      "backlog.emptyPromoted",
                      "아직 승격시킨 항목이 없습니다. 카드를 위로 끌어올려 보세요.",
                    )}
              </p>
            )}

            {visible.map((item) => {
              const draggable = !item.promoted_type;
              return (
                <div
                  key={item.id}
                  draggable={draggable}
                  onDragStart={(e) => {
                    if (!draggable) return;
                    e.dataTransfer.setData(
                      BACKLOG_DRAG_TYPE,
                      JSON.stringify({ id: item.id, title: item.title }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`group ${cardBase} border-foreground/[0.08] hover:border-foreground/[0.12] ${
                    draggable ? "cursor-grab active:cursor-grabbing" : "opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {draggable && (
                      <GripVertical
                        size={12}
                        className="text-slate-600 mt-0.5 flex-none"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {/* 마일스톤 칩 자리 — 배치 레일 카드와 골격을 맞추고 칩만 다르게 한다 */}
                      <div className="flex items-center gap-1 mb-1 min-w-0">
                        <span className="flex items-center gap-1 min-w-0 text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                          <span
                            className="flex-none w-1.5 h-1.5 rounded-[1px] bg-bridge-accent"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {t("backlog.chip", "백로그")}
                          </span>
                        </span>
                        {item.promoted_type && (
                          <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full truncate bg-bridge-secondary/15 text-bridge-secondary">
                            → {promotedLabel(item)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-1">
                        {formatRelativeTime(item.created_at)} ·{" "}
                        {t("backlog.privateNote", "나만 보임")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mt-auto">
                    {item.promoted_type ? (
                      <button
                        type="button"
                        onClick={() => void handleUnpromote(item)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        <RotateCcw size={11} aria-hidden="true" />
                        {t("backlog.undo", "되돌리기")}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPromoting({ item, target: "TIMEBLOCK" })
                          }
                          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("backlog.kindTimeblock", "타임블록")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoting({ item, target: "TASK" })}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("backlog.kindTask", "태스크")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          aria-label={t("common.delete", "삭제")}
                          className="ml-auto px-2 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-rose-500 hover:bg-foreground/5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {promoting && (
        <PromoteBacklogModal
          boardId={boardId}
          item={promoting.item}
          target={promoting.target}
          presetDate={promoting.presetDate}
          features={features}
          onClose={() => setPromoting(null)}
          onPromoted={handlePromoted}
        />
      )}
    </section>
  );
}
