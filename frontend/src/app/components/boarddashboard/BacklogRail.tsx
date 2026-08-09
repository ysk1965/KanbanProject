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
  ChevronRight,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { checklistAPI, personalTaskAPI } from "../../utils/api";
import type { Feature, Milestone, PersonalTask } from "../../types";
import { formatRelativeTime } from "../../utils/dateUtils";
import {
  BACKLOG_DRAG_TYPE,
  BACKLOG_DROP_EVENT,
  type BacklogDropDetail,
} from "../../utils/backlogDrag";
import {
  endAxisDrag,
  requestAxisRefresh,
  setAxisDragData,
  useAxisDropZone,
  useAxisTransfer,
  type AxisItem,
  type AxisZone,
} from "../../utils/axisTransfer";
import { PromoteBacklogModal, type PromoteTarget } from "./PromoteBacklogModal";
import { BACKLOG_STALE_DAYS, daysSince } from "./dashboardUtils";
import {
  PanelBanner,
  PanelCount,
  PanelFooterHint,
  PanelShell,
} from "./DashboardCard";

/** 백로그 제목 최대 길이 — 백엔드 @Size(max = 200)과 같은 값 */
const TITLE_MAX = 200;
/** 이 길이부터 카운터를 노출한다 (평소엔 숨긴다) */
const COUNTER_FROM = 190;

/** 저장에 실패해 아직 서버에 없는 항목 — 카드로는 보이되 드래그·승격은 잠근다 */
interface PendingItem {
  localId: string;
  title: string;
  state: "sending" | "failed";
}

interface BacklogRailProps {
  boardId: string;
  /**
   * 보고 있는 대상의 userId.
   *   내 백로그   — 강등을 되돌릴 때 체크리스트 항목의 담당자로 되돌려 놓는다.
   *   남의 백로그 — 누구의 목록을 읽어 올지 정한다 (readOnly와 함께 온다).
   */
  userId?: string;
  /** 다른 멤버를 보는 중일 때 그 이름 — 제목이 「○○의 백로그」로 바뀐다 */
  scopeName?: string;
  /**
   * 읽기 전용 — 남의 백로그를 보는 중이다.
   * 적기·붙여넣기·b 단축키·드래그·승격·삭제·드롭이 모두 사라지고 목록만 남는다.
   */
  readOnly?: boolean;
  /** 보드의 피처 목록 — 태스크 승격 시 붙일 곳을 고른다 */
  features: Feature[];
  /** 보드의 마일스톤 — 승격 모달의 1차 필터 */
  milestones?: Milestone[];
  /** 보드에서 보고 있던 마일스톤 — 승격 모달의 기본 필터가 된다 */
  selectedMilestoneId?: string | null;
  /** 승격 후 보드 데이터를 다시 읽게 한다 */
  onPromoted?: () => void;
  /**
   * 접힘이 바뀌었을 때 — 열 크기와 손잡이를 들고 있는 건 부모다.
   * 접힘 자체는 여기가 소유한다(b 단축키·드래그 시작이 스스로 펼쳐야 하므로).
   */
  onCollapsedChange?: (collapsed: boolean) => void;
}

/** 이 열이 받아 주는 출발지 — 왼쪽 두 존에서 넘어오는 것만 */
const ACCEPTS: AxisZone[] = ["workload", "placement"];

/** 강등 안내를 띄워 두는 시간 (ms) — 되돌릴 수 있는 창 */
const DEMOTE_NOTICE_TTL = 9000;

/** 강등 직후 되돌리기용 스냅샷 — 지운 체크리스트 항목을 같은 태스크에 되살린다 */
interface DemoteNotice {
  /** 새로 만들어진 백로그 항목 — 되돌릴 때 지운다 */
  backlogId: string;
  source: AxisZone;
  item: AxisItem;
}

const draftKey = (boardId: string) => `bridge.backlog.draft.${boardId}`;
const collapseKey = (boardId: string) => `bridge.backlog.collapsed.${boardId}`;

/**
 * 백로그 — 대시보드 오른쪽 끝 열. 보드에서 적어 두는 개인 TODO다.
 *
 * 대시보드는 성숙도 순이다(타임블록·간트 = 확정 / 배치 대기 = 태스크는 됨).
 * 백로그는 그 앞 한 층, "아직 아무것도 아닌 일"을 담는다.
 *
 * 세로 스택의 맨 아래 칸이었다가 옆 열로 나왔다 — 카드 셋이 한 열에 쌓여 있으면
 * 간트 레인이 늘어난 날 가운데(배치 대기)가 0행으로 눌려 사라졌다.
 * 열이 되면서 카드는 위에서 아래로 흐르고(xl 이상), 폭은 손잡이가 정한다.
 *
 * 카드를 왼쪽 두 존으로 끌어 놓는 자리가 곧 승격 대상이 된다. 드래그를 못 쓰는
 * 환경을 위해 카드마다 빠른 승격 버튼을 함께 둔다(배치 대기의 "오늘/내일"과 같은 패턴).
 *
 * 보이는 범위 — 이 보드의 백로그는 보드 멤버가 서로 읽을 수 있다(스코프 행에서 사람을
 * 바꾸면 그 사람의 목록이 읽기 전용으로 열린다). 마이스페이스의 개인 할 일은
 * board_id가 없어 여기 목록에 아예 들어오지 않는다.
 */
export function BacklogRail({
  boardId,
  userId,
  scopeName,
  readOnly = false,
  features,
  milestones,
  selectedMilestoneId,
  onPromoted,
  onCollapsedChange,
}: BacklogRailProps) {
  const { t } = useTranslation();

  const [items, setItems] = useState<PersonalTask[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  // 줄바꿈이 섞인 붙여넣기 — 나눌지 한 번만 묻는다
  const [pastedLines, setPastedLines] = useState<string[] | null>(null);
  const [pastedRaw, setPastedRaw] = useState("");

  // 접기는 폭 조절과 다른 일이다 — 손잡이가 "얼마나 볼까"라면 이건 "지금은 안 본다"다.
  // 접으면 열이 세로 제목 한 줄만 남기고 손잡이도 사라진다(잡을 칸이 없으므로).
  const [collapsed, setCollapsed] = useState(false);
  const [promoting, setPromoting] = useState<{
    item: PersonalTask;
    target: PromoteTarget;
    /** 간트 날짜 칸에 떨궜을 때 그 날짜 — 승격되는 태스크의 시작·마감이 된다 */
    presetDate?: string;
  } | null>(null);

  // 위 두 존에서 내려온 항목 — 강등 결과와 되돌리기용 스냅샷
  const [demoted, setDemoted] = useState<DemoteNotice | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const demoteTimerRef = useRef<number | null>(null);

  const {
    active: rawDropActive,
    over: rawDropOver,
    zoneProps,
  } = useAxisDropZone({ zone: "backlog", accepts: ACCEPTS });

  // 남의 백로그는 받는 곳이 아니다 — 틴트도 힌트도 뜨지 않는다
  const dropActive = !readOnly && rawDropActive;
  const dropOver = !readOnly && rawDropOver;

  /* ── 초기 상태 복구 (보드별) ── */
  useEffect(() => {
    try {
      setDraft(window.localStorage.getItem(draftKey(boardId)) ?? "");
      setCollapsed(window.localStorage.getItem(collapseKey(boardId)) === "1");
    } catch {
      // 프라이빗 모드 등에서 localStorage가 막혀도 기능 자체는 동작해야 한다
    }
  }, [boardId]);

  // 부모가 카드 높이와 손잡이를 들고 있다 — 저장값 복구까지 포함해 여기 한 곳에서 알린다
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

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
    // 남의 목록은 대상이 정해진 뒤에만 읽는다 — userId 없이 부르면 내 목록이 온다
    if (readOnly && !userId) return;
    try {
      setError(null);
      const list = await personalTaskAPI.getBacklog(
        boardId,
        readOnly ? userId : undefined,
      );
      setItems(list);
    } catch {
      setError(t("backlog.loadFailed", "백로그를 불러오지 못했습니다."));
    } finally {
      setIsLoading(false);
    }
  }, [boardId, readOnly, userId, t]);

  // 보는 대상이 바뀌면 남의 목록이 잠깐 남아 보이지 않게 비우고 다시 읽는다
  useEffect(() => {
    setItems([]);
    setIsLoading(true);
    void load();
  }, [load]);

  /**
   * 오래된 것부터 앞에 둔다 — 방치가 목록 순서로 드러난다.
   * 백로그를 다시 열게 만드는 건 개수가 아니라 "가장 오래된 게 맨 앞에 있다"는 사실이다.
   *
   * 승격된 항목은 애초에 오지 않는다 — 서버가 승격과 동시에 목록에서 닫는다.
   */
  const openItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      ),
    [items],
  );

  /** 가장 오래된 항목의 방치 일수 — 헤더에 띄우는 압력 신호 */
  const oldestDays = useMemo(
    () => (openItems.length > 0 ? daysSince(openItems[0].created_at) : null),
    [openItems],
  );

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
      fresh.forEach((p) => void persist(p.localId, p.title));
    },
    [persist],
  );

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // 한글 IME 조합 중 Enter는 조합 확정용이다 — 막지 않으면 확정 전 값과
    // 확정 후 남은 글자로 카드가 두 장 만들어진다
    if (e.nativeEvent.isComposing || e.repeat) return;
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
    setPastedRaw(
      text
        .replace(/\s*\r?\n\s*/g, " ")
        .trim()
        .slice(0, TITLE_MAX),
    );
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
    // 열이 펼쳐진 뒤에 입력칸으로 간다 — 입력칸은 트랙 맨 앞이라 양쪽 축을 되감는다
    // (xl 이상에서는 세로로, 그 미만에서는 가로로 흐른다)
    window.requestAnimationFrame(() => {
      if (trackRef.current) {
        trackRef.current.scrollLeft = 0;
        trackRef.current.scrollTop = 0;
      }
      inputRef.current?.focus();
    });
  }, [applyCollapsed]);

  // b (한글 자판에서는 ㅠ) — 입력 컨텍스트가 아닐 때만. ⌘K는 마이스페이스가 이미 쓴다.
  useEffect(() => {
    if (readOnly) return; // 남의 백로그에는 적을 칸이 없다
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
  }, [focusAdd, readOnly]);

  /* ── 간트 날짜 칸에 떨어졌을 때 ── */
  useEffect(() => {
    if (readOnly) return;
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<BacklogDropDetail>).detail;
      if (!detail?.id) return;
      const item = items.find((i) => i.id === detail.id);
      if (!item) return;
      // 놓은 자리가 날짜를 정했으니 붙일 곳만 고르면 된다.
      // 간트 바는 체크리스트 항목이므로 CHECKLIST_ITEM으로 승격해야 그 날짜에 바가 생긴다.
      setPromoting({ item, target: "CHECKLIST_ITEM", presetDate: detail.date });
    };
    window.addEventListener(BACKLOG_DROP_EVENT, onDrop);
    return () => window.removeEventListener(BACKLOG_DROP_EVENT, onDrop);
  }, [items, readOnly]);

  /* ── 승격 ── */
  /**
   * 승격된 항목은 목록에서 사라진다 — 타임블록·태스크·체크리스트로 실체가 옮겨갔고,
   * 백로그에 남은 카드는 같은 일을 두 번 보여줄 뿐이다.
   * (되돌리려면 만들어진 쪽을 백로그로 다시 끌어 내리면 된다 — 강등 경로가 그대로 있다)
   */
  const handlePromoted = useCallback(
    (promotedItem: PersonalTask) => {
      setItems((prev) => prev.filter((i) => i.id !== promotedItem.id));
      setPromoting(null);
      onPromoted?.();
      // 승격 결과(체크리스트 항목)가 위 두 존에 나타나야 한다
      requestAxisRefresh();
    },
    [onPromoted],
  );

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

  /* ── 위 존에서 내려온 항목 (강등) ── */

  const showDemoted = useCallback((next: DemoteNotice) => {
    setDemoted(next);
    if (demoteTimerRef.current) window.clearTimeout(demoteTimerRef.current);
    demoteTimerRef.current = window.setTimeout(
      () => setDemoted(null),
      DEMOTE_NOTICE_TTL,
    );
  }, []);

  useEffect(
    () => () => {
      if (demoteTimerRef.current) window.clearTimeout(demoteTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!transferError) return;
    const timer = window.setTimeout(
      () => setTransferError(null),
      DEMOTE_NOTICE_TTL,
    );
    return () => window.clearTimeout(timer);
  }, [transferError]);

  // 받을 수 있는 드래그가 시작되면 펼친다 — 접혀 있으면 떨굴 자리가 없다.
  // 저장된 접힘 값은 건드리지 않아 드래그가 끝나도 사용자의 선택이 남는다.
  useEffect(() => {
    if (dropActive) setCollapsed(false);
  }, [dropActive]);

  /**
   * 체크리스트 항목을 백로그로 내린다.
   *
   * 백로그(개인 메모)와 체크리스트(팀 보드 데이터)는 타입이 다르므로 이동이 아니라
   * 「새로 적고 원본을 지우기」다. 순서가 중요하다 — 백로그에 먼저 자리를 만들고
   * 그게 성공했을 때만 원본을 지운다. 반대로 하면 실패 시 적어둔 게 사라진다.
   */
  const demote = useCallback(
    async (source: AxisZone, item: AxisItem) => {
      if (!item.task_id) return;
      setTransferError(null);

      let created: PersonalTask;
      try {
        created = await personalTaskAPI.create({
          title: item.title.trim().slice(0, TITLE_MAX),
          priority: "NONE",
          board_id: boardId,
        });
      } catch {
        setTransferError(
          t("backlog.demoteFailed", "백로그로 내리지 못했습니다."),
        );
        return;
      }

      try {
        await checklistAPI.deleteItem(boardId, item.task_id, item.id);
      } catch {
        // 원본이 남았는데 백로그에도 생기면 같은 일이 두 곳에 존재한다 — 되돌린다
        await personalTaskAPI.delete(created.id).catch(() => {});
        setTransferError(
          t("backlog.demoteFailed", "백로그로 내리지 못했습니다."),
        );
        return;
      }

      setItems((prev) => [created, ...prev]);
      showDemoted({ backlogId: created.id, source, item });
      // 간트·배치 레일에서 원본이 빠진 걸 반영시킨다
      requestAxisRefresh();
    },
    [boardId, showDemoted, t],
  );

  /** 강등 되돌리기 — 지운 체크리스트 항목을 같은 태스크에 되살리고 백로그 쪽을 지운다 */
  const handleUndoDemote = useCallback(async () => {
    const snapshot = demoted;
    if (!snapshot?.item.task_id) return;
    setDemoted(null);

    try {
      await checklistAPI.addItem(boardId, snapshot.item.task_id, {
        title: snapshot.item.title,
        assignee_id: snapshot.item.assignee_id ?? userId ?? null,
        // 워크로드에서 내려온 항목만 날짜를 갖는다 — 있을 때만 되돌린다
        ...(snapshot.item.start_date
          ? { start_date: snapshot.item.start_date }
          : {}),
        ...(snapshot.item.due_date ? { due_date: snapshot.item.due_date } : {}),
      });
      await personalTaskAPI.delete(snapshot.backlogId).catch(() => {});
      setItems((prev) => prev.filter((i) => i.id !== snapshot.backlogId));
      requestAxisRefresh();
    } catch {
      setTransferError(t("backlog.undoFailed", "되돌리지 못했습니다."));
      void load();
    }
  }, [boardId, demoted, userId, load, t]);

  useAxisTransfer((detail) => {
    if (readOnly) return; // 남의 백로그는 오가는 곳이 아니다
    // 이 열로 내려온 것 — 내가 목록을 갖고 있으므로 여기서 처리한다
    if (detail.to === "backlog" && detail.from !== "backlog") {
      void demote(detail.from, detail.item);
      return;
    }
    // 백로그 → 미배치. 날짜 없이 태스크에만 붙이면 되므로 붙일 곳만 고른다.
    // (간트 바·배치 카드는 체크리스트 항목이라 CHECKLIST_ITEM으로 승격해야 그 줄에 나타난다)
    if (detail.from === "backlog" && detail.to === "placement") {
      const target = items.find((i) => i.id === detail.item.id);
      if (target) setPromoting({ item: target, target: "CHECKLIST_ITEM" });
    }
  });

  /**
   * 2단 압축 카드 — 제목 한 덩이 + 아래 한 줄이 전부다.
   *
   * 백로그 항목이 가진 정보는 사실상 제목 하나인데 카드는 배지·제목·메타·액션까지
   * 네 단을 쌓고 있었다. 「백로그」 배지는 레일 헤더가 이미 말하고 보이는 범위도
   * 헤더 부제에 있어, 카드에서 반복되던 만큼이 곧 두께였다.
   *
   * 배지는 왼쪽 2px 색 레일이 대신한다 — 방치 상태까지 이 레일 하나가 겸한다.
   *
   * 폭 — xl 이상에서는 열을 꽉 채운다(위에서 아래로 흐르는 목록이다).
   * 그 미만에서는 카드가 한 줄로 눕고 옆으로 넘치므로 208px 고정 폭을 유지한다.
   */
  const cardBase =
    "group flex-none w-[208px] xl:w-full snap-start bg-bridge-dark rounded-xl border pt-2 pb-1.5 pl-2 pr-2.5 flex items-start gap-2 transition-colors";

  const openCount = openItems.length + pending.length;

  const title = scopeName
    ? t("backlog.titleOf", "{{name}}의 백로그", { name: scopeName })
    : t("backlog.title", "내 백로그");

  /* 승격 모달은 접힘과 무관하게 살아 있어야 한다 — 접힌 사이에 열려 있을 수 있다 */
  const promoteModal = promoting ? (
    <PromoteBacklogModal
      boardId={boardId}
      item={promoting.item}
      target={promoting.target}
      presetDate={promoting.presetDate}
      features={features}
      milestones={milestones}
      selectedMilestoneId={selectedMilestoneId}
      userId={userId}
      onClose={() => setPromoting(null)}
      onPromoted={handlePromoted}
    />
  ) : null;

  /*
    접힌 열 — 카드 대신 세로로 세운 제목 한 줄만 남긴다.
    같은 버튼이 두 방향을 겸한다: xl 이상에서는 글자가 세로로 흐르고(writing-mode),
    한 줄로 접힌 화면에서는 원래대로 가로 막대가 된다.
  */
  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={() => applyCollapsed(false)}
          aria-expanded={false}
          aria-label={t("backlog.expand", "백로그 열 펼치기")}
          className="w-full h-full flex items-center justify-center gap-2
            bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
            hover:border-foreground/[0.12] text-slate-400 hover:text-foreground
            transition-colors xl:[writing-mode:vertical-rl]"
        >
          <span
            className="flex-none w-1.5 h-1.5 rounded-full bg-slate-500"
            aria-hidden="true"
          />
          <span className="text-xs font-bold">{title}</span>
          {openCount > 0 && <PanelCount value={openCount} />}
        </button>
        {promoteModal}
      </>
    );
  }

  return (
    <PanelShell
      dot="slate"
      title={title}
      /* 부제는 읽기 전용 안내만 — 평상시엔 제목만으로 충분하다 */
      subtitle={
        readOnly ? t("backlog.hintReadOnly", "읽기 전용") : undefined
      }
      /* 목록이 하나뿐이라 탭이 없다 — 제목 옆은 개수 하나로 끝난다 */
      tabs={openCount > 0 ? <PanelCount value={openCount} /> : undefined}
      headerExtra={
        /* 방치 신호 — 다시 열게 만드는 건 개수가 아니라 이 숫자다 */
        oldestDays !== null && oldestDays >= BACKLOG_STALE_DAYS ? (
          <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {t("backlog.oldestDays", "가장 오래된 것 {{count}}일", {
              count: oldestDays,
            })}
          </span>
        ) : undefined
      }
      headerTrailing={
        <button
          type="button"
          onClick={() => applyCollapsed(true)}
          aria-expanded
          aria-label={t("backlog.collapse", "백로그 열 접기")}
          className="flex-none p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          {/* 열은 오른쪽으로 접힌다 — 화살표가 접히는 방향을 가리킨다 */}
          <ChevronRight
            size={14}
            aria-hidden="true"
            className="hidden xl:block"
          />
          <ChevronDown size={14} aria-hidden="true" className="xl:hidden" />
        </button>
      }
      banner={
        demoted || transferError ? (
          <PanelBanner tone={transferError ? "error" : "info"}>
            {transferError ? (
              <p className="text-xs">{transferError}</p>
            ) : (
              <>
                <p className="text-xs truncate">
                  {/* 잃은 것을 그대로 쓴다 — 워크로드에서 왔을 때만 일정이 사라진다 */}
                  {demoted!.source === "workload"
                    ? t("backlog.demotedNotice", {
                        title: demoted!.item.title,
                        defaultValue:
                          "「{{title}}」 백로그로 내렸습니다 · 일정과 담당이 해제됩니다",
                      })
                    : t("backlog.demotedNoticeUnplaced", {
                        title: demoted!.item.title,
                        defaultValue:
                          "「{{title}}」 백로그로 내렸습니다 · 태스크에서 빠집니다",
                      })}
                </p>
                <button
                  type="button"
                  onClick={() => void handleUndoDemote()}
                  className="ml-auto flex-none flex items-center gap-1 text-xs font-bold text-bridge-accent hover:underline"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  {t("backlog.undo", "되돌리기")}
                </button>
              </>
            )}
          </PanelBanner>
        ) : undefined
      }
      /* 무엇이 일어날지는 놓는 순간에만 말한다 — 평소엔 카드 한 줄을 더 보여 준다 */
      footer={
        dropActive ? (
          <PanelFooterHint emphasized>
            {t(
              "backlog.dropHint",
              "여기에 놓으면 일정·담당을 해제하고 백로그 메모로 내려갑니다",
            )}
          </PanelFooterHint>
        ) : undefined
      }
      padded={false}
      bodyClassName="flex flex-col"
      /* 남의 백로그는 드롭 존이 아니다 — 리스너를 아예 걸지 않는다 */
      sectionProps={readOnly ? undefined : zoneProps}
      className="h-full"
      /*
        상시 틴트를 걷어낸다 — 인디고는 드래그 상태 전용이다.
        같은 색을 정체성과 상태가 나눠 쓰면 지금 무엇이 걸린 건지 읽히지 않는다.
      */
      overlayClassName={
        dropOver
          ? "bg-bridge-accent/[0.12] ring-2 ring-inset ring-bridge-accent"
          : dropActive
            ? "bg-bridge-accent/[0.05] ring-1 ring-inset ring-bridge-accent/40"
            : undefined
      }
    >
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <Loader2
              className="w-5 h-5 animate-spin text-bridge-accent"
              aria-label={t("common.loading", "불러오는 중")}
            />
          </div>
        ) : error ? (
          <p className="text-xs text-slate-500 text-center py-6">{error}</p>
        ) : (
          /*
            xl 이상 — 열이므로 위에서 아래로 한 줄씩 흐르고, 넘치면 세로로 스크롤한다.
            xl 미만 — 열이 한 줄로 눕는다. 이때는 세로로 채우고 넘치면 다음 칸으로
            넘긴 뒤 가로로 스크롤한다(원래 트랙 그대로).
          */
          <div
            ref={trackRef}
            className="flex-1 min-h-0 flex flex-col flex-wrap content-start gap-2 px-3.5 pt-2.5 pb-3
              overflow-x-auto overflow-y-hidden custom-scrollbar snap-x
              xl:flex-nowrap xl:overflow-x-hidden xl:overflow-y-auto"
          >
            {/* 입력 카드는 항상 맨 앞. 스냅 대상으로 잡아두지 않으면 마운트 시
                레일이 첫 카드로 스냅해 입력칸을 지나쳐 버린다. */}
            {!readOnly && (
              // 카드가 2단으로 얇아진 만큼 입력칸도 한 줄로 눕힌다 —
              // 여기가 두꺼우면 트랙 높이가 입력칸에 끌려간다
              <div className="flex-none w-[208px] xl:w-full snap-start rounded-xl border border-dashed border-foreground/10 flex items-center gap-1.5 px-2.5 focus-within:ring-2 focus-within:ring-bridge-accent/50 transition-all">
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
                  className="flex-1 min-w-0 bg-transparent py-2.5 text-xs text-foreground placeholder-slate-500 focus:outline-none"
                />
                {draft.length >= COUNTER_FROM ? (
                  <span className="flex-none text-xs font-bold text-amber-600 dark:text-amber-400">
                    {draft.length} / {TITLE_MAX}
                  </span>
                ) : (
                  <span
                    className="flex-none text-xs text-slate-600"
                    title={t("backlog.enterHint", "Enter 로 추가")}
                    aria-hidden="true"
                  >
                    ↵
                  </span>
                )}
              </div>
            )}

            {/* 여러 줄 붙여넣기 확인 */}
            {pastedLines && (
              <div className="flex-none w-[270px] xl:w-full snap-start rounded-xl border border-dashed border-bridge-accent bg-bridge-accent/[0.08] p-2.5 flex flex-col gap-2">
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
            {pending.map((p) => (
              <div
                key={p.localId}
                className={`${cardBase} ${
                  p.state === "failed"
                    ? "border-rose-500/60 bg-rose-500/[0.06]"
                    : "border-foreground/[0.08] opacity-60"
                }`}
              >
                <span
                  className={`flex-none w-[2px] self-stretch rounded-full ${
                    p.state === "failed" ? "bg-rose-500" : "bg-slate-600"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                    {p.title}
                  </p>
                  {p.state === "sending" ? (
                    <p className="flex items-center min-h-[22px] text-xs text-slate-500">
                      {t("backlog.saving", "저장 중…")}
                    </p>
                  ) : (
                    // 실패는 숨기지 않는다 — 호버로 접는 건 성공한 카드의 액션뿐이다
                    <div className="flex items-center gap-1 min-h-[22px] -ml-1">
                      {/* 두 줄에 문장을 놓을 자리가 없다 — 「적어둔 건 남아 있다」는
                            이 아이콘의 툴팁과 보조기기용 문장으로 옮긴다 */}
                      <span
                        className="ml-1 flex-none"
                        title={t(
                          "backlog.savedLocally",
                          "저장 안 됨 · 로컬에 보관됨",
                        )}
                      >
                        <TriangleAlert
                          size={12}
                          className="text-rose-600 dark:text-rose-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {t(
                            "backlog.savedLocally",
                            "저장 안 됨 · 로컬에 보관됨",
                          )}
                        </span>
                      </span>
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
                        className="px-1.5 py-1 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
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
                        className="px-1.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        {t("backlog.discard", "버리기")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {openItems.length === 0 && pending.length === 0 && (
              <p className="flex-none w-[208px] xl:w-full text-xs text-slate-500 py-4 leading-relaxed">
                {t("backlog.empty", "백로그가 비었습니다.")}
              </p>
            )}

            {openItems.map((item, index) => {
              const draggable = !readOnly;
              const age = daysSince(item.created_at);
              // 방치는 읽기 전용에서도 보여야 한다 — 드래그 가능 여부와 별개다.
              // 오래된 순으로 정렬돼 있으므로 방치 1등은 언제나 첫 카드다
              const stale = age !== null && age >= BACKLOG_STALE_DAYS;
              const isOldest = stale && index === 0;
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
                    // 배치 레일은 축 페이로드를, 간트는 위의 기존 키를 읽는다
                    setAxisDragData(e.dataTransfer, "backlog", {
                      id: item.id,
                      title: item.title,
                    });
                  }}
                  onDragEnd={endAxisDrag}
                  className={`${cardBase} border-foreground/[0.08] hover:border-foreground/[0.12] ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  {/* 배지를 대신하는 색 레일 — 방치(호박) · 평상(인디고)을
                      한 자리에서 말한다. 카드마다 「백로그」를 다시 적지 않는다. */}
                  <span
                    className={`flex-none w-[2px] self-stretch rounded-full ${
                      stale ? "bg-amber-500" : "bg-bridge-accent"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                      {item.title}
                    </p>

                    {/* 나이 한 줄. 액션은 그 위에 겹쳐 두고 호버·포커스 때만 띄운다 —
                        208px 안에 둘을 나란히 넣으면 양쪽 다 잘린다.
                        (display:none이 아니라 opacity라서 Tab 순서에는 그대로 남는다) */}
                    <div className="relative flex items-center min-h-[22px]">
                      <div className="flex items-center gap-1 min-w-0">
                        {stale ? (
                          <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            {isOldest
                              ? t(
                                  "backlog.staleOldest",
                                  "{{count}}일 · 가장 오래됨",
                                  { count: age as number },
                                )
                              : t("backlog.staleDays", "{{count}}일", {
                                  count: age as number,
                                })}
                          </span>
                        ) : (
                          <span className="truncate text-xs text-slate-500">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        )}
                      </div>

                      {/* 남의 백로그에는 손댈 것이 없다 — 액션 묶음을 아예 그리지 않는다 */}
                      <div
                        hidden={readOnly}
                        className={`absolute inset-y-0 right-0 items-center gap-0.5 bg-bridge-dark rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
                          readOnly ? "hidden" : "flex"
                        }`}
                      >
                        <span
                          className="pointer-events-none absolute right-full top-0 h-full w-6 bg-gradient-to-l from-bridge-dark to-transparent"
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPromoting({ item, target: "TIMEBLOCK" })
                          }
                          className="px-1.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("backlog.kindTimeblock", "타임블록")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoting({ item, target: "TASK" })}
                          className="px-1.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("backlog.kindTask", "태스크")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          aria-label={t("common.delete", "삭제")}
                          className="px-1.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-rose-500 hover:bg-foreground/5 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {promoteModal}
    </PanelShell>
  );
}
