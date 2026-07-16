import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  Clock,
  Calendar,
  Circle,
  CornerUpLeft,
  ArrowRight,
  Flag,
  ChevronLeft,
  Eye,
  EyeOff,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  Layers,
  Users,
  UserCheck,
  Diamond,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { sprintAPI, checklistAPI, taskAPI, jiraAPI } from "../utils/api";
import type { JiraStatus, JiraMeta, JiraBlockStatusEntry } from "../utils/api";
import type {
  SprintBoard as SprintBoardData,
  SprintColumn,
  SprintInfo,
  SprintItemCard,
} from "../types";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { useSprintRealtime } from "../hooks/useSprintRealtime";
import {
  formatDate,
  formatRelativeTime,
  parseUTCDate,
  getTodayDateString,
  getDDay,
} from "../utils/dateUtils";
import { MotionModal } from "./ui/MotionModal";
import { SprintMemberGanttModal } from "./SprintMemberGanttModal";

interface SprintBoardProps {
  boardId: string;
  milestones: { id: string; title: string }[];
  canEdit: boolean;
  isAdminOrOwner: boolean;
  /** 지정 시 이 마일스톤으로 고정(칸반 탭 연동). 미지정이면 자체 드롭다운으로 선택 */
  milestoneId?: string;
  /** 좌측 트리에서 체크리스트 행 클릭 → 태스크 모달(+ 해당 항목 하이라이트) */
  onOpenChecklistItem?: (taskId: string, checklistItemId?: string) => void;
  /** 좌측 트리 피쳐 카드 헤더의 "열기" 버튼 → 피쳐 상세 모달 */
  onOpenFeature?: (featureId: string) => void;
  /** 담당자 필터(칸반 탭 필터바 연동). 이름 배열(+ '__no_members__'). 빈 배열이면 전체 */
  memberFilter?: string[];
  /** 구성원 컬럼 정렬 기준 — 보드 멤버 관리(직군 관리) 순서의 userId 배열. 미지정 시 카드 수 내림차순 */
  memberOrder?: string[];
}

/** Feature ▸ Task ▸ 체크리스트 소스 트리 노드 */
interface TreeTask {
  taskId: string;
  taskTitle: string;
  items: SprintItemCard[];
}
interface TreeFeature {
  featureId: string;
  featureTitle: string;
  featureColor: string | null;
  featureCreatedAt: string | null; // Feature 생성 순서 정렬 키
  tasks: TreeTask[];
  total: number;
  taken: number;
  completed: number;
}

const DRAG_ITEM = "application/bridge-sprint-item";
const DRAG_SOURCE = "application/bridge-sprint-source";
/** 좌측 트리 "담긴 항목 보임 필터" 상태 저장 키(새로고침해도 유지) */
const SPRINT_TREE_SHOW_TAKEN_KEY = "bridge:sprint-tree:show-taken";
/** 보드 그룹 기준(Feature ↔ 구성원) 선택 저장 키(새로고침해도 유지) */
const SPRINT_VIEW_KEY = "bridge:sprint-view";
/** 좌측 업무 리스트 패널 접힘 상태 저장 키(새로고침해도 유지) */
const SPRINT_TREE_COLLAPSED_KEY = "bridge:sprint-tree:collapsed";
/** 좌측 업무 리스트 패널 폭(px) 저장 키(새로고침해도 유지) */
const SPRINT_TREE_WIDTH_KEY = "bridge:sprint-tree:width";
/** 패널 폭 제한(px) */
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 480;
const PANEL_DEFAULT_WIDTH = 300;

/** apiClient는 ApiError 객체({code,message})를 throw하므로 message를 우선 추출 */
function errMessage(e: unknown, fallback: string): string {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message?: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return e instanceof Error ? e.message : fallback;
}

/**
 * 태스크 소그룹 색상 — 태스크 ID 해시 기반 고정 팔레트.
 * 피쳐 색(feature_color)과 독립적으로, 같은 피쳐 안의 여러 태스크를 시각적으로 분리한다.
 * 미분류(__none__)는 중립 회색.
 */
const TASK_COLORS = [
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#8b5cf6",
  "#f43f5e",
];
function taskColorHex(taskId: string): string {
  if (!taskId || taskId === "__none__") return "#64748b";
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TASK_COLORS[Math.abs(hash) % TASK_COLORS.length];
}

/** D-day 긴급도 → 배지 색상. 지남/오늘=빨강, 임박(D-3이내)=앰버, 그 외=여유(틸). */
const DDAY_BADGE: Record<string, string> = {
  overdue: "bg-rose-500/15 text-rose-500",
  today: "bg-rose-500/15 text-rose-500",
  soon: "bg-amber-500/15 text-amber-500",
  normal: "bg-bridge-secondary/15 text-bridge-secondary",
  none: "",
};

export function SprintBoard({
  boardId,
  milestones,
  canEdit,
  isAdminOrOwner,
  milestoneId: controlledMilestoneId,
  onOpenChecklistItem,
  onOpenFeature,
  memberFilter,
  memberOrder,
}: SprintBoardProps) {
  const controlled = !!controlledMilestoneId;
  const [internalMid, setInternalMid] = useState<string>(
    controlledMilestoneId ?? milestones[0]?.id ?? "",
  );
  const milestoneId = controlledMilestoneId ?? internalMid;
  const [board, setBoard] = useState<SprintBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<string>>(
    new Set(),
  );
  // 보드: Feature 컬럼 안 Task 소그룹 접기 상태 (key = `${featureId}:${taskId}`)
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  // 드래그 중 드롭 존 안내용 — 카드→리스트(빼기) / 리스트→보드(담기) 방향을 구분한다.
  const [dragOverList, setDragOverList] = useState(false);
  const [draggingSource, setDraggingSource] = useState<
    "backlog" | "sprint" | null
  >(null);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState("");
  const busyRef = useRef(false);

  // 진행 현황 모달 (게이지 클릭 → 오늘 완료/진행 중/기존 완료/미완료 상세)
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTab, setProgressTab] = useState<
    "todayDone" | "inProgress" | "earlierDone" | "notStarted"
  >("todayDone");

  // 과거 스프린트 미리보기 — 클릭 시 읽기 전용 스냅샷 열람(백엔드 무변경).
  // 재활성화는 배너의 명시적 버튼 → 확인 모달로만 진입한다.
  const [previewSprintId, setPreviewSprintId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<SprintItemCard[] | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  // 재활성화 확인 모달 대상 스프린트(null이면 닫힘)
  const [reactivateTarget, setReactivateTarget] = useState<SprintInfo | null>(
    null,
  );

  // 구성원 간트 모달 — 구성원 컬럼 헤더 클릭 시 해당 구성원 id. null이면 닫힘.
  const [ganttMemberId, setGanttMemberId] = useState<string | null>(null);

  // 좌측 트리 "보임 필터": 스프린트에 담긴(Sprint·Done 배지) 체크리스트 항목 숨김 토글.
  // 초기값은 localStorage에서 복원(기본 = 보임), 변경 시 저장하여 새로고침해도 유지.
  const [showTakenInTree, setShowTakenInTree] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SPRINT_TREE_SHOW_TAKEN_KEY) !== "false";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_TREE_SHOW_TAKEN_KEY, String(showTakenInTree));
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [showTakenInTree]);

  // 진행 컬럼 그룹 기준: Feature별 컬럼(기본) ↔ 담당자별 컬럼.
  // In Review·Done 고정 컬럼은 두 뷰에서 그대로 공유되고, 카드/데이터는 변하지 않는다.
  // (순수 클라이언트 표시 전환 — 서버/드래그 상태는 두 뷰가 동일하게 공유)
  const [groupBy, setGroupBy] = useState<"feature" | "member" | "jira">(() => {
    try {
      const saved = localStorage.getItem(SPRINT_VIEW_KEY);
      if (saved === "member" || saved === "jira") return saved;
      return "feature";
    } catch {
      return "feature";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_VIEW_KEY, groupBy);
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [groupBy]);

  // ── JIRA 뷰: 연동 상태(탭 노출 판정) + 메타(상태명) ──
  // status는 block_status_map(블록→JIRA상태) 제공, meta는 상태 id→name 제공.
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [jiraMeta, setJiraMeta] = useState<JiraMeta | null>(null);
  const [jiraMetaLoading, setJiraMetaLoading] = useState(false);
  const jiraConnected = !!jiraStatus?.connected;

  // 연동 여부만 먼저 확인해 JIRA 탭 노출 결정 (마운트 시 1회, viewer+ 접근)
  useEffect(() => {
    let alive = true;
    jiraAPI
      .getStatus(boardId)
      .then((s) => {
        if (alive) setJiraStatus(s);
      })
      .catch(() => {
        /* 미연동/권한없음 → JIRA 탭 숨김 */
      });
    return () => {
      alive = false;
    };
  }, [boardId]);

  // JIRA 탭 진입 시 메타(상태·블록명) 로드 (최초 1회)
  useEffect(() => {
    if (groupBy !== "jira" || !jiraConnected || jiraMeta || jiraMetaLoading)
      return;
    setJiraMetaLoading(true);
    jiraAPI
      .getMeta(boardId)
      .then((m) => setJiraMeta(m))
      .catch(() => {
        /* 메타 로드 실패 시 컬럼 라벨은 상태 id 폴백 */
      })
      .finally(() => setJiraMetaLoading(false));
  }, [groupBy, jiraConnected, jiraMeta, jiraMetaLoading, boardId]);

  // JIRA 탭이 저장돼 있었는데 연동이 끊긴 경우 Feature로 폴백
  useEffect(() => {
    if (groupBy === "jira" && jiraStatus && !jiraConnected) {
      setGroupBy("feature");
    }
  }, [groupBy, jiraStatus, jiraConnected]);

  // 좌측 업무 리스트 패널: 접힘 여부 + 폭(px). 둘 다 localStorage에서 복원해 새로고침 유지.
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SPRINT_TREE_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem(SPRINT_TREE_WIDTH_KEY));
      if (Number.isFinite(raw) && raw > 0) {
        return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, raw));
      }
    } catch {
      /* 무시 */
    }
    return PANEL_DEFAULT_WIDTH;
  });
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_TREE_COLLAPSED_KEY, String(panelCollapsed));
    } catch {
      /* 무시 */
    }
  }, [panelCollapsed]);
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_TREE_WIDTH_KEY, String(panelWidth));
    } catch {
      /* 무시 */
    }
  }, [panelWidth]);

  // 경계 드래그 리사이즈: mousedown 시 window 리스너 부착(드롭존과 충돌 없도록 pointer 기반 분리).
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, startW + (ev.clientX - startX)),
      );
      setPanelWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const load = useCallback(async () => {
    if (!milestoneId) {
      setLoading(false);
      setBoard(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await sprintAPI.getSprintBoard(boardId, milestoneId);
      setBoard(data);
    } catch (e: unknown) {
      setError(errMessage(e, "스프린트를 불러오지 못했습니다"));
    } finally {
      setLoading(false);
    }
  }, [boardId, milestoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 무음 재조회 — 실시간 이벤트 수신 시 스피너/깜빡임 없이 최신 보드로 교체한다.
  // (load는 loading=true로 전체 스켈레톤을 띄우므로 실시간 갱신엔 부적합)
  const silentReload = useCallback(async () => {
    if (!milestoneId) return;
    try {
      const data = await sprintAPI.getSprintBoard(boardId, milestoneId);
      setBoard(data);
    } catch {
      /* 무음 재조회 실패는 조용히 무시(다음 이벤트/수동 조작 시 복구) */
    }
  }, [boardId, milestoneId]);

  // 실시간 동기화 — 체크리스트 완료/담당자 변경(모달 포함)·태스크·피쳐 이벤트가
  // 도착하면 디바운스 후 스프린트 보드를 재조회한다. 본인 변경도 반영된다(훅 주석 참고).
  useSprintRealtime({ boardId, onRelevantEvent: silentReload });

  useEffect(() => {
    if (!controlled && !internalMid && milestones[0]?.id) {
      setInternalMid(milestones[0].id);
    }
  }, [controlled, milestones, internalMid]);

  // 마일스톤 전환 시 미리보기 상태 초기화(다른 마일스톤의 스프린트를 이어보지 않도록)
  useEffect(() => {
    setPreviewSprintId(null);
    setPreviewItems(null);
    setReactivateTarget(null);
  }, [milestoneId]);

  // 미리보기 대상 스프린트의 담긴 카드 조회(읽기 전용). 백엔드 상태는 변경하지 않는다.
  useEffect(() => {
    if (!previewSprintId) {
      setPreviewItems(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewItems(null);
    sprintAPI
      .getSprintItems(boardId, previewSprintId)
      .then((items) => {
        if (!cancelled) setPreviewItems(items);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(errMessage(e, "스프린트를 불러오지 못했습니다"));
          setPreviewSprintId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, previewSprintId]);

  // 뮤테이션 헬퍼 — 반환된 최신 보드로 즉시 교체
  const run = useCallback(async (fn: () => Promise<SprintBoardData>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      const data = await fn();
      setBoard(data);
    } catch (e: unknown) {
      setError(errMessage(e, "작업에 실패했습니다"));
    } finally {
      busyRef.current = false;
    }
  }, []);

  // 담당자 필터 — 칸반 탭 필터바(filterOptions.members)와 동일 규칙으로 카드 걸러내기.
  // 컬럼/백로그/좌측 트리 및 게이지가 모두 filteredBoard에서 파생되어 필터를 반영한다.
  const filteredBoard = useMemo<SprintBoardData | null>(() => {
    if (!board) return null;
    const members = memberFilter ?? [];
    if (members.length === 0) return board;
    const hasNoAssignee = members.includes("__no_members__");
    const names = new Set(members.filter((m) => m !== "__no_members__"));
    const matches = (it: SprintItemCard) => {
      // 외주 카드는 관리 담당(manager)의 이름으로 필터 — 컬럼 라우팅과 일관.
      const name = it.assignee?.name ?? it.contractor?.manager_name;
      if (!name) return hasNoAssignee;
      return names.has(name);
    };
    const filteredColumns = board.columns.map((c) => ({
      ...c,
      items: c.items.filter(matches),
    }));
    // 게이지 재계산: 담긴 항목(sprint_column_id) 중 완료/Done 컬럼 도달분
    const endColIds = new Set(
      board.columns.filter((c) => c.kind === "END").map((c) => c.id),
    );
    let done = 0;
    let total = 0;
    for (const c of filteredColumns) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue;
        total += 1;
        if (it.completed || endColIds.has(it.sprint_column_id)) done += 1;
      }
    }
    return {
      ...board,
      backlog: board.backlog.filter(matches),
      columns: filteredColumns,
      gauge: {
        done,
        total,
        percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      },
    };
  }, [board, memberFilter]);

  const activeSprint = filteredBoard?.active_sprint ?? null;
  const columns = useMemo(
    () =>
      (filteredBoard?.columns ?? [])
        .slice()
        .sort((a, b) => a.position - b.position),
    [filteredBoard],
  );

  // 소스 트리: backlog + 모든 컬럼 아이템을 합쳐 Feature ▸ Task ▸ 체크리스트로 재구성
  const tree = useMemo<TreeFeature[]>(() => {
    if (!filteredBoard) return [];
    const all: SprintItemCard[] = [
      ...filteredBoard.backlog,
      ...filteredBoard.columns.flatMap((c) => c.items),
    ];
    const featMap = new Map<string, TreeFeature>();
    for (const it of all) {
      const fid = it.feature_id ?? "__none__";
      let feat = featMap.get(fid);
      if (!feat) {
        feat = {
          featureId: fid,
          featureTitle: it.feature_title ?? "기타",
          featureColor: it.feature_color ?? null,
          featureCreatedAt: it.feature_created_at ?? null,
          tasks: [],
          total: 0,
          taken: 0,
          completed: 0,
        };
        featMap.set(fid, feat);
      }
      const tid = it.task_id ?? "__none__";
      let task = feat.tasks.find((t) => t.taskId === tid);
      if (!task) {
        task = { taskId: tid, taskTitle: it.task_title ?? "기타", items: [] };
        feat.tasks.push(task);
      }
      task.items.push(it);
      feat.total += 1;
      if (it.sprint_column_id) feat.taken += 1;
      if (it.completed) feat.completed += 1;
    }
    // Feature 생성 순서(created_at 오름차순)로 컬럼/트리 정렬.
    // 생성일 동률이거나 없으면 안정 정렬로 첫 등장 순서를 유지하고, "기타"(피쳐 없음)는 항상 맨 뒤로.
    return Array.from(featMap.values())
      .map((feat, idx) => ({ feat, idx }))
      .sort((a, b) => {
        const aNone = a.feat.featureId === "__none__";
        const bNone = b.feat.featureId === "__none__";
        if (aNone !== bNone) return aNone ? 1 : -1;
        const ac = a.feat.featureCreatedAt;
        const bc = b.feat.featureCreatedAt;
        if (ac && bc && ac !== bc) return ac < bc ? -1 : 1;
        if (ac && !bc) return -1;
        if (!ac && bc) return 1;
        return a.idx - b.idx; // 안정 정렬 폴백(첫 등장 순서)
      })
      .map(({ feat }) => feat);
  }, [filteredBoard]);

  // 보임 필터 적용 후 트리에 표시할 항목이 하나라도 남는지(빈 상태 안내용)
  // "정리된" = 스프린트 컬럼에 담겼거나(sprint_column_id) 완료 처리된(completed) 항목.
  // 스프린트에 담지 않고 좌측 트리에서 바로 완료 체크한 경우도 숨김 대상에 포함.
  const treeHasVisible = useMemo(() => {
    if (showTakenInTree) return tree.length > 0;
    return tree.some((f) =>
      f.tasks.some((t) =>
        t.items.some((it) => !it.sprint_column_id && !it.completed),
      ),
    );
  }, [tree, showTakenInTree]);

  const toggleFeature = (fid: string) => {
    setCollapsedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };
  const toggleTask = (key: string) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 담긴 항목의 소속 컬럼 조회(칩 표시용)
  const columnById = useMemo(() => {
    const m = new Map<string, SprintColumn>();
    for (const c of columns) m.set(c.id, c);
    return m;
  }, [columns]);
  const columnAccent = (c: SprintColumn) =>
    c.kind === "START"
      ? "#6366F1"
      : c.kind === "END"
        ? "#34d399"
        : (c.color ?? "#f59e0b");

  // START("Sprint") 컬럼 — Task 단위 컬럼으로 쪼개기 위한 앵커
  const startColumn = useMemo(
    () => columns.find((c) => c.kind === "START") ?? null,
    [columns],
  );
  // 카드 호버 액션의 이동 타겟.
  //  - "완료" → END(Done): 고정 앵커라 항상 확실히 식별된다.
  //  - "리뷰" → 첫 MIDDLE(기본 "In Review"): 이름을 바꿔도 위치 기준으로 동작 유지.
  //    (columns는 position 정렬이므로 find가 첫 MIDDLE을 집는다.)
  const endColumn = useMemo(
    () => columns.find((c) => c.kind === "END") ?? null,
    [columns],
  );
  const firstMiddleColumn = useMemo(
    () => columns.find((c) => c.kind === "MIDDLE") ?? null,
    [columns],
  );

  // 스프린트에 담긴 각 Feature = 하나의 컬럼. 컬럼 안은 Task 소그룹으로 나뉜다.
  // 존재 조건(컬럼·소그룹 공통): "아직 Done이 아닌 담긴 항목"이 1개 이상 →
  //   In Review로 옮겨도 유지되고, 전부 Done에 도달하면(= Done 컬럼에 모임) 사라진다.
  // 소그룹 안 카드로 표시되는 건 START(Sprint) 단계에 남은 항목뿐. 순서는 좌측 트리와 일치.
  interface TaskGroup {
    taskId: string;
    taskTitle: string;
    items: SprintItemCard[]; // START 단계에 남은 카드
    doneTotal: number; // 담긴 항목 중 완료 수
    total: number; // 담긴 항목 전체 수
  }
  const featureColumns = useMemo(() => {
    if (!startColumn) return [];
    const result: {
      featureId: string;
      featureTitle: string;
      featureColor: string | null;
      tasks: TaskGroup[];
      doneTotal: number;
      total: number;
    }[] = [];
    for (const feat of tree) {
      const taskGroups: TaskGroup[] = [];
      let fDone = 0;
      let fTotal = 0;
      for (const task of feat.tasks) {
        const taken = task.items.filter((it) => it.sprint_column_id);
        if (taken.length === 0) continue;

        let doneTotal = 0;
        let notInDoneColumn = 0;
        for (const it of taken) {
          const kind = it.sprint_column_id
            ? columnById.get(it.sprint_column_id)?.kind
            : undefined;
          if (it.completed || kind === "END") doneTotal += 1;
          if (kind !== "END") notInDoneColumn += 1;
        }
        // Feature 진척도에는 완료된 Task도 포함
        fDone += doneTotal;
        fTotal += taken.length;
        // 전부 Done인 Task 소그룹은 숨김(Done 컬럼에 모임)
        if (notInDoneColumn === 0) continue;

        const startItems = taken.filter(
          (it) => it.sprint_column_id === startColumn.id,
        );
        taskGroups.push({
          taskId: task.taskId,
          taskTitle: task.taskTitle,
          items: startItems,
          doneTotal,
          total: taken.length,
        });
      }
      // 활성 Task 소그룹이 없으면(전부 Done/미담김) Feature 컬럼 숨김
      if (taskGroups.length === 0) continue;
      result.push({
        featureId: feat.featureId,
        featureTitle: feat.featureTitle,
        featureColor: feat.featureColor,
        tasks: taskGroups,
        doneTotal: fDone,
        total: fTotal,
      });
    }
    return result;
  }, [tree, startColumn, columnById]);

  // 구성원 기준 컬럼 — 위 featureColumns와 같은 소스(START 단계 카드)를 담당자로 재그룹핑.
  // Feature 뷰가 Feature를 컬럼으로 세우고 담당자를 카드 뱃지로 내렸다면, 여기선 그 반대다.
  // 진척(완료/전체)은 담당자가 담은 전체 항목(모든 컬럼) 기준으로 집계한다.
  interface MemberColumn {
    memberId: string; // assignee.id | "__none__"(미배정)
    memberName: string;
    items: SprintItemCard[]; // START 단계에 남은 카드(컬럼에 노출)
    doneTotal: number; // 담당자가 담은 항목 중 완료/Done 수
    total: number; // 담당자가 담은 전체 항목 수
  }
  const memberColumns = useMemo<MemberColumn[]>(() => {
    if (!startColumn) return [];
    // 컬럼 라우팅 키/이름 — 내부 담당자는 그 담당자, 외주는 "관리 담당(manager)"의 컬럼으로 귀속시킨다.
    // 관리자 미지정 외주(manager_user_id 없음)는 미배정으로 폴백해 진짜 미배정과 섞이되 배지로 구분된다.
    const keyOf = (it: SprintItemCard) =>
      it.assignee?.id ?? it.contractor?.manager_user_id ?? "__none__";
    const nameOf = (it: SprintItemCard) =>
      it.assignee?.name ?? it.contractor?.manager_name ?? "미배정";
    // 담긴 항목 전체를 담당자별 진척으로 집계
    const stat = new Map<
      string,
      { name: string; done: number; total: number }
    >();
    for (const c of columns) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue;
        const id = keyOf(it);
        let s = stat.get(id);
        if (!s) {
          s = { name: nameOf(it), done: 0, total: 0 };
          stat.set(id, s);
        }
        s.total += 1;
        const kind = columnById.get(it.sprint_column_id)?.kind;
        if (it.completed || kind === "END") s.done += 1;
      }
    }
    // 컬럼에 노출할 카드는 START 단계 항목뿐(순서 유지)
    const startByMember = new Map<string, SprintItemCard[]>();
    for (const it of startColumn.items) {
      const id = keyOf(it);
      const arr = startByMember.get(id);
      if (arr) arr.push(it);
      else startByMember.set(id, [it]);
    }
    // START 카드가 있는 담당자만 컬럼화 · 미배정은 맨 뒤로
    // 정렬 기준: memberOrder(보드 멤버 관리 순서)가 있으면 그 순서, 없으면 카드 수 내림차순.
    // memberOrder에 없는 담당자는 뒤로, 그 사이는 카드 수 내림차순으로 안정화한다.
    const orderIndex = new Map<string, number>();
    (memberOrder ?? []).forEach((uid, i) => orderIndex.set(uid, i));
    const rank = (id: string) => orderIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
    const ids = Array.from(startByMember.keys()).sort((a, b) => {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (
        (startByMember.get(b)?.length ?? 0) -
        (startByMember.get(a)?.length ?? 0)
      );
    });
    return ids.map((id) => ({
      memberId: id,
      memberName: stat.get(id)?.name ?? (id === "__none__" ? "미배정" : id),
      items: startByMember.get(id) ?? [],
      doneTotal: stat.get(id)?.done ?? 0,
      total: stat.get(id)?.total ?? 0,
    }));
  }, [startColumn, columns, columnById, memberOrder]);

  // 구성원 간트 모달 데이터 — 선택 구성원의 스프린트 항목(모든 컬럼)을 모은다.
  // 배치/미배치는 모달이 start_date·due_date로 판정한다.
  const ganttData = useMemo(() => {
    if (!ganttMemberId || ganttMemberId === "__none__") return null;
    const mc = memberColumns.find((m) => m.memberId === ganttMemberId);
    const its = columns
      .flatMap((c) => c.items)
      .filter((it) => (it.assignee?.id ?? "__none__") === ganttMemberId);
    return {
      member: { id: ganttMemberId, name: mc?.memberName ?? "" },
      items: its,
    };
  }, [ganttMemberId, memberColumns, columns]);

  // 닫힘 애니메이션 동안 마지막 데이터 유지(모달 콘텐츠 깜빡임 방지)
  const [retainedGantt, setRetainedGantt] = useState<typeof ganttData>(null);
  useEffect(() => {
    if (ganttData) setRetainedGantt(ganttData);
  }, [ganttData]);

  // ==================== JIRA 뷰 (컬럼 = JIRA 상태) ====================
  // Feature/구성원 뷰가 스프린트 자체 워크플로(진행중/In Review/Done)를 컬럼으로 세운다면,
  // JIRA 뷰는 그와 무관하게 "부모 Task의 칸반 블록(=JIRA 상태 매핑)"으로 태스크를 재그룹핑한다.
  // 카드 단위도 체크리스트가 아니라 Task(= JIRA 이슈 1건)다. push 컬럼으로 드래그하면
  // taskAPI.moveTask → 블록 변경 → 백엔드 TaskBlockChangedEvent → JIRA 전이가 자동 발동한다.
  interface JiraTaskCard {
    taskId: string;
    taskTitle: string;
    jiraKey: string;
    qaState: "REVIEW" | "VERIFIED" | "REJECTED" | null;
    statusId: string | null; // 해석된 현재 JIRA 상태 id
    assignees: { id: string; name: string }[];
    done: number; // 스프린트에 담긴 체크리스트 중 완료 수
    total: number; // 스프린트에 담긴 체크리스트 수
  }
  interface JiraColumnDef {
    statusId: string; // JIRA 상태 id ("__unmapped__" = 상태 미상 leftover)
    label: string; // JIRA 상태명
    draggable: boolean; // 이 상태로 push 가능한 블록이 있으면 true
    targetBlockId: string | null; // draggable일 때 드롭 시 이동할 블록
    tone: "push" | "review" | "verified" | "muted"; // 컬럼 액센트
    cards: JiraTaskCard[];
  }
  const jiraColumns = useMemo<JiraColumnDef[]>(() => {
    if (
      groupBy !== "jira" ||
      !jiraConnected ||
      !jiraStatus?.block_status_map ||
      !jiraMeta
    )
      return [];
    const map = jiraStatus.block_status_map as Record<
      string,
      JiraBlockStatusEntry
    >;

    // 매핑 인덱스: 블록→상태(배치용), 상태→push블록(드롭 타깃), 상태→엔트리(색상/드래그 판정)
    const statusByBlock = new Map<string, string>();
    const pushBlockByStatus = new Map<string, string>();
    const entryByStatus = new Map<string, JiraBlockStatusEntry>();
    for (const [blockId, entry] of Object.entries(map)) {
      if (blockId === "__rejected" || !entry.jira_status_id) continue;
      statusByBlock.set(blockId, entry.jira_status_id);
      entryByStatus.set(entry.jira_status_id, entry);
      if (entry.dir !== "pull")
        pushBlockByStatus.set(entry.jira_status_id, blockId);
    }

    // 1) 스프린트 전체 아이템 → JIRA 연동 Task만 태스크 단위로 집계(중복 제거)
    //    현재 JIRA 상태 = 매핑된 블록 상태(push 후 최신) ?? 마지막 pull 상태
    const taskMap = new Map<string, JiraTaskCard>();
    for (const c of columns) {
      for (const it of c.items) {
        if (!it.jira_issue_key || !it.task_id) continue;
        let card = taskMap.get(it.task_id);
        if (!card) {
          const resolved =
            (it.block_id ? statusByBlock.get(it.block_id) : undefined) ??
            it.jira_status_id ??
            null;
          card = {
            taskId: it.task_id,
            taskTitle: it.task_title ?? "Task",
            jiraKey: it.jira_issue_key,
            qaState: it.qa_state ?? null,
            statusId: resolved,
            assignees: [],
            done: 0,
            total: 0,
          };
          taskMap.set(it.task_id, card);
        }
        card.total += 1;
        const kind = it.sprint_column_id
          ? columnById.get(it.sprint_column_id)?.kind
          : undefined;
        if (it.completed || kind === "END") card.done += 1;
        if (
          it.assignee &&
          !card.assignees.some((a) => a.id === it.assignee!.id)
        ) {
          card.assignees.push({ id: it.assignee.id, name: it.assignee.name });
        }
      }
    }

    // 2) 컬럼 = JIRA 상태 전체 미러링. 매핑된 상태를 앞으로(push→검토중→검증완료), 나머지는 meta 순서.
    const rankOf = (statusId: string) => {
      const e = entryByStatus.get(statusId);
      if (!e) return 3;
      if (e.dir === "pull") return e.qa === "VERIFIED" ? 2 : 1;
      return 0;
    };
    const toneOf = (statusId: string): JiraColumnDef["tone"] => {
      const e = entryByStatus.get(statusId);
      if (!e) return "muted";
      if (e.dir === "pull") return e.qa === "VERIFIED" ? "verified" : "review";
      return "push";
    };
    const ordered = (jiraMeta.statuses ?? [])
      .slice()
      .sort((a, b) => rankOf(a.id) - rankOf(b.id));

    const cols: JiraColumnDef[] = ordered.map((s) => ({
      statusId: s.id,
      label: s.name,
      draggable: pushBlockByStatus.has(s.id),
      targetBlockId: pushBlockByStatus.get(s.id) ?? null,
      tone: toneOf(s.id),
      cards: [],
    }));
    const colByStatus = new Map(cols.map((c) => [c.statusId, c]));

    // 3) 태스크 배치. 상태 미상/메타에 없는 상태는 leftover 컬럼(무음 누락 방지)
    const leftover: JiraTaskCard[] = [];
    for (const card of taskMap.values()) {
      const col = card.statusId ? colByStatus.get(card.statusId) : undefined;
      if (col) col.cards.push(card);
      else leftover.push(card);
    }
    if (leftover.length) {
      cols.push({
        statusId: "__unmapped__",
        label: "기타",
        draggable: false,
        targetBlockId: null,
        tone: "muted",
        cards: leftover,
      });
    }
    return cols;
  }, [groupBy, jiraConnected, jiraStatus, jiraMeta, columns, columnById]);

  // JIRA 게이지/헤더용 집계 — 검증완료 + 검토중 2색 세그먼트
  const jiraStats = useMemo(() => {
    const all = jiraColumns.flatMap((c) => c.cards);
    return {
      linked: all.length,
      verified: all.filter((c) => c.qaState === "VERIFIED").length,
      review: all.filter((c) => c.qaState === "REVIEW").length,
      rejected: all.filter((c) => c.qaState === "REJECTED").length,
    };
  }, [jiraColumns]);

  // JIRA 태스크 카드 드래그 시작 — 태스크 단위 이동임을 별도 소스로 구분
  const onDragStartJiraTask = (e: React.DragEvent, card: JiraTaskCard) => {
    if (!canEdit) return;
    e.dataTransfer.setData(DRAG_ITEM, card.taskId);
    e.dataTransfer.setData(DRAG_SOURCE, "jira-task");
    e.dataTransfer.effectAllowed = "move";
    setDraggingSource("sprint");
  };
  // push 가능 상태 컬럼 드롭 → 태스크 블록 이동 → 백엔드 이벤트로 JIRA 전이 자동 발동
  const onDropJiraColumn = async (e: React.DragEvent, col: JiraColumnDef) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!canEdit) return;
    const taskId = e.dataTransfer.getData(DRAG_ITEM);
    const source = e.dataTransfer.getData(DRAG_SOURCE);
    if (!taskId || source !== "jira-task") return;
    // 읽기전용 상태(매핑 없음·QA 소유)는 드롭 무시
    if (!col.draggable || !col.targetBlockId) return;
    const targetBlockId = col.targetBlockId;
    // 이미 그 상태면 무시
    const card = jiraColumns
      .flatMap((c) => c.cards)
      .find((c) => c.taskId === taskId);
    if (card?.statusId === col.statusId) return;
    await run(async () => {
      await taskAPI.moveTask(boardId, taskId, {
        target_block_id: targetBlockId,
        position: 0,
      });
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };

  // 좌측 행: 체크박스 → 완료 토글(체크리스트 API 재사용 후 보드 갱신)
  const toggleDone = (it: SprintItemCard) => {
    if (!canEdit || !it.task_id) return;
    void run(async () => {
      await checklistAPI.toggleItem(boardId, it.task_id!, it.id);
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };
  // 본문 클릭 → 태스크 모달 + 해당 체크리스트 하이라이트
  const openItem = (it: SprintItemCard) => {
    if (it.task_id) onOpenChecklistItem?.(it.task_id, it.id);
  };
  const openTask = (taskId: string) => {
    if (taskId !== "__none__") onOpenChecklistItem?.(taskId);
  };
  // 원클릭 담기 — 드래그 없이 버튼 한 번으로 스프린트(START)에 담는다.
  // 항목은 자신의 Feature/Task 컬럼으로 자동 배치된다.
  const addToSprint = (it: SprintItemCard) => {
    if (!canEdit || !activeSprint || it.sprint_column_id) return;
    void run(async () => {
      await sprintAPI.addItem(boardId, activeSprint.id, it.id);
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };
  // 카드 호버 액션(리뷰·완료) — 드래그 없이 원클릭으로 목표 컬럼(In Review/Done)에 이동.
  const moveItemToColumn = (it: SprintItemCard, col: SprintColumn | null) => {
    if (!canEdit || !activeSprint || !col || it.sprint_column_id === col.id)
      return;
    void run(() => sprintAPI.moveToColumn(boardId, it.id, col.id));
  };

  // ==================== 드래그 앤 드롭 ====================
  const onDragStartItem = (
    e: React.DragEvent,
    item: SprintItemCard,
    source: "backlog" | "sprint",
  ) => {
    if (!canEdit) return;
    e.dataTransfer.setData(DRAG_ITEM, item.id);
    e.dataTransfer.setData(DRAG_SOURCE, source);
    e.dataTransfer.effectAllowed = "move";
    setDraggingSource(source);
  };
  const onDragEndItem = () => {
    setDraggingSource(null);
    setDragOverList(false);
    setDragOverCol(null);
  };

  // 카드 → 업무 리스트 드롭 = 스프린트에서 빼기.
  // 빠진 항목은 sprint_column_id가 비워져 트리의 원래 Feature/Task 자리로 자동 복귀한다.
  const onDropList = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverList(false);
    if (!canEdit || !activeSprint) return;
    const itemId = e.dataTransfer.getData(DRAG_ITEM);
    const source = e.dataTransfer.getData(DRAG_SOURCE);
    // 리스트에서 온 항목(backlog)은 이미 리스트에 있으므로 무시
    if (!itemId || source !== "sprint") return;
    await run(() => sprintAPI.removeItem(boardId, activeSprint.id, itemId));
  };

  const onDropColumn = async (e: React.DragEvent, col: SprintColumn) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!canEdit || !activeSprint) return;
    const itemId = e.dataTransfer.getData(DRAG_ITEM);
    const source = e.dataTransfer.getData(DRAG_SOURCE);
    // 리스트→보드 담기 드래그는 제거됨(호버 버튼으로 대체). 보드 안 컬럼 이동만 허용.
    if (!itemId || source !== "sprint") return;
    await run(() => sprintAPI.moveToColumn(boardId, itemId, col.id));
  };

  // ==================== 컬럼 CRUD ====================
  const submitRename = (col: SprintColumn) => {
    const name = editColName.trim();
    setEditingCol(null);
    if (!name || name === col.name) return;
    void run(() => sprintAPI.updateColumn(boardId, col.id, { name }));
  };
  const removeColumn = (col: SprintColumn) => {
    if (
      !window.confirm(
        `"${col.name}" 컬럼을 삭제할까요? 담긴 카드는 앞 컬럼으로 이동합니다.`,
      )
    )
      return;
    void run(() => sprintAPI.deleteColumn(boardId, col.id));
  };
  const moveColumn = (col: SprintColumn, dir: -1 | 1) => {
    const middles = columns.filter((c) => c.kind === "MIDDLE");
    const idx = middles.findIndex((c) => c.id === col.id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= middles.length) return;
    const reordered = middles.slice();
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    void run(() =>
      sprintAPI.reorderColumns(
        boardId,
        milestoneId,
        reordered.map((c) => c.id),
      ),
    );
  };

  // ==================== 라이프사이클 ====================
  const closeSprint = () => {
    if (!activeSprint) return;
    if (
      !window.confirm(
        `${activeSprint.name}을(를) 종료하고 다음 스프린트를 시작할까요?`,
      )
    )
      return;
    void run(() => sprintAPI.closeSprint(boardId, activeSprint.id));
  };

  const gauge = filteredBoard?.gauge; // 표시용(담당자 필터 반영)
  // 스프린트 종료는 전체 진척 기준(필터로 100%처럼 보여도 조기 종료 방지)
  const fullGauge = board?.gauge;
  const canClose =
    isAdminOrOwner &&
    !!fullGauge &&
    fullGauge.total > 0 &&
    fullGauge.percentage === 100;

  // 진행 현황 4구간 분류 (KanbanBlock 진행 현황과 동일 규약).
  // 대상: 담긴 항목(sprint_column_id != null)만 — 게이지 %와 정확히 일치.
  //  · 오늘 완료: 완료 && completed_at/done_date >= 로컬 자정
  //  · 기존 완료: 완료 && 그 이전
  //  · 진행 중  : 미완료 && (MIDDLE 컬럼에 있음 || 기간이 오늘과 겹침)
  //  · 미완료   : 나머지 (START 대기 등)
  const sprintProgress = useMemo(() => {
    const cols = filteredBoard?.columns ?? [];
    const endColIds = new Set(
      cols.filter((c) => c.kind === "END").map((c) => c.id),
    );
    const midColIds = new Set(
      cols.filter((c) => c.kind === "MIDDLE").map((c) => c.id),
    );
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const todayStr = getTodayDateString();
    const doneTs = (it: SprintItemCard) =>
      parseUTCDate(it.completed_at ?? it.done_date)?.getTime() ?? 0;

    const todayDone: SprintItemCard[] = [];
    const earlierDone: SprintItemCard[] = [];
    const inProgress: SprintItemCard[] = [];
    const notStarted: SprintItemCard[] = [];

    for (const c of cols) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue; // 담긴 항목만 게이지 스코프
        const isDone = it.completed || endColIds.has(it.sprint_column_id);
        if (isDone) {
          if ((it.completed_at || it.done_date) && doneTs(it) >= startToday)
            todayDone.push(it);
          else earlierDone.push(it);
        } else {
          const inMidCol = it.sprint_column_id
            ? midColIds.has(it.sprint_column_id)
            : false;
          const s = it.start_date;
          const d = it.due_date;
          const hasDate = !!(s || d);
          const afterStart = !s || s <= todayStr;
          const beforeDue = !d || todayStr <= d;
          const dateActive = hasDate && afterStart && beforeDue;
          if (inMidCol || dateActive) inProgress.push(it);
          else notStarted.push(it);
        }
      }
    }

    todayDone.sort((a, b) => doneTs(b) - doneTs(a));
    earlierDone.sort((a, b) => doneTs(b) - doneTs(a));
    const byDue = (a: SprintItemCard, b: SprintItemCard) =>
      (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99");
    inProgress.sort(byDue);
    notStarted.sort(byDue);

    const nToday = todayDone.length;
    const nEarlier = earlierDone.length;
    const nProg = inProgress.length;
    const nNot = notStarted.length;
    const total = nToday + nEarlier + nProg + nNot;
    const done = nToday + nEarlier;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const denom = total || 1;
    return {
      buckets: { todayDone, inProgress, earlierDone, notStarted },
      counts: {
        todayDone: nToday,
        inProgress: nProg,
        earlierDone: nEarlier,
        notStarted: nNot,
      },
      nToday,
      nEarlier,
      nProg,
      nNot,
      total,
      done,
      pct,
      segEarlier: (nEarlier / denom) * 100,
      segToday: (nToday / denom) * 100,
      segProg: (nProg / denom) * 100,
    };
  }, [filteredBoard]);

  // 재활성화 상태: 현재 활성 스프린트가 최신(max seq)이 아니면 과거 스프린트를 재활성화한 상태.
  // 이때 최신 스프린트는 뒤로 보관(parked)되어 있고, "재활성화 취소"로만 복귀 가능.
  const maxSeq = (board?.sprints ?? []).reduce(
    (m, s) => Math.max(m, s.sequence_no),
    0,
  );
  const inReactivation = !!activeSprint && activeSprint.sequence_no < maxSeq;

  const cancelReactivation = () => {
    if (!activeSprint) return;
    if (!window.confirm("재활성화를 취소하고 최신 스프린트로 되돌릴까요?"))
      return;
    void run(() => sprintAPI.cancelReactivation(boardId, activeSprint.id));
  };

  // ==================== 미리보기(읽기 전용 스냅샷) ====================
  // 미리보기 카드를 마일스톤 컬럼(Sprint/In Review/Done)에 최종 위치대로 배치.
  // 컬럼 정의는 마일스톤 소속이라 스프린트 간 공유 → 활성 보드의 columns를 그대로 재사용.
  const previewColumns = useMemo(() => {
    if (!previewSprintId || !previewItems) return null;
    const members = memberFilter ?? [];
    const hasNoAssignee = members.includes("__no_members__");
    const names = new Set(members.filter((m) => m !== "__no_members__"));
    const matches = (it: SprintItemCard) => {
      if (members.length === 0) return true;
      const name = it.assignee?.name ?? it.contractor?.manager_name;
      return name ? names.has(name) : hasNoAssignee;
    };
    const items = previewItems.filter(
      (it) => it.sprint_column_id && matches(it),
    );
    return columns.map((col) => ({
      ...col,
      items: items
        .filter((it) => it.sprint_column_id === col.id)
        .sort((a, b) => a.position - b.position),
    }));
  }, [previewSprintId, previewItems, columns, memberFilter]);

  const openReactivateModal = (target: SprintInfo) => {
    setReactivateTarget(target);
  };
  const confirmReactivate = () => {
    if (!reactivateTarget) return;
    const id = reactivateTarget.id;
    setReactivateTarget(null);
    setPreviewSprintId(null);
    void run(() => sprintAPI.reactivateSprint(boardId, id));
  };

  // ==================== 렌더 ====================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }
  if (!milestoneId || milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
        <Flag className="w-8 h-8 opacity-40" />
        <p className="text-sm">
          마일스톤을 먼저 만들면 스프린트가 자동으로 시작됩니다.
        </p>
      </div>
    );
  }

  // 스프린트 카드 (Task 컬럼 · In Review · Done 공통). readOnly 시 드래그·액션 비활성(미리보기).
  const renderCard = (it: SprintItemCard, readOnly = false) => {
    const curCol = it.sprint_column_id
      ? columnById.get(it.sprint_column_id)
      : undefined;
    const isDoneItem = it.completed || curCol?.kind === "END";
    // 마감 D-day — 완료된 카드는 긴급도 표시 안 함(완료 배지로 대체).
    const dday = !isDoneItem && it.due_date ? getDDay(it.due_date) : null;
    const overdue = dday?.urgency === "overdue";
    // 시작 D-day(양수 diff = 아직 시작 전). start_date/due_date/completed만으로 진행 상태 파생.
    const startDday =
      !isDoneItem && it.start_date ? getDDay(it.start_date) : null;
    // 예정 = 시작일이 아직 안 옴. 진행 중 = 기간 안(시작 지남·마감 안 지남), 날짜 정보가 있을 때만 배지.
    const upcoming =
      !isDoneItem && !overdue && !!startDday && startDday.diff > 0;
    const inProgress =
      !isDoneItem && !overdue && !upcoming && (!!startDday || !!dday);
    // 마감 임박(D-3 이내·D-Day)이면 진행 중 배지를 앰버로 승격.
    const soon = dday?.urgency === "soon" || dday?.urgency === "today";
    const liveBadge = soon
      ? "bg-amber-500/15 text-amber-500"
      : "bg-bridge-secondary/15 text-bridge-secondary";
    const liveDot = soon ? "bg-amber-500" : "bg-bridge-secondary";
    // 리뷰 = 첫 MIDDLE(기본 "In Review")로 이동. 이미 그 컬럼이거나 완료면 숨김.
    const showReview =
      canEdit &&
      !readOnly &&
      !!firstMiddleColumn &&
      !isDoneItem &&
      it.sprint_column_id !== firstMiddleColumn.id;
    // 완료 = END(Done)로 이동. 이미 완료면 숨김.
    const showDone = canEdit && !readOnly && !!endColumn && !isDoneItem;
    // 상세 = Task 모달 열기(+ 해당 체크리스트 하이라이트). 미리보기 제외.
    const showDetail = !readOnly && !!it.task_id;
    const showActions = showReview || showDone || showDetail;
    return (
      <div
        key={it.id}
        draggable={canEdit && !readOnly}
        onDragStart={(e) => !readOnly && onDragStartItem(e, it, "sprint")}
        onDragEnd={onDragEndItem}
        style={
          overdue
            ? { borderLeftColor: "#f43f5e", borderLeftWidth: 3 }
            : undefined
        }
        className={`group relative rounded-xl border border-foreground/[0.08] bg-bridge-dark p-2.5 space-y-2 shadow-[0_2px_5px_rgba(0,0,0,0.25)] transition-colors ${
          readOnly ? "cursor-default" : "hover:border-bridge-border cursor-grab"
        }`}
      >
        {/* 호버 액션 — 리뷰/완료 원클릭 이동 + 상세 열기. 호버 시 힌트와 교체 노출. */}
        {showActions && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {showReview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  moveItemToColumn(it, firstMiddleColumn);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-500 hover:bg-amber-500 hover:text-amber-950 transition-colors"
                aria-label="In Review로 이동"
              >
                <Eye className="w-3 h-3" />
                리뷰
              </button>
            )}
            {showDone && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  moveItemToColumn(it, endColumn);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-bold bg-bridge-secondary/15 text-bridge-secondary hover:bg-bridge-secondary hover:text-teal-950 transition-colors"
                aria-label="완료(Done)로 이동"
              >
                <Check className="w-3 h-3" />
                완료
              </button>
            )}
            {showDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openItem(it);
                }}
                className="inline-grid place-items-center w-[26px] h-[26px] rounded-lg bg-foreground/[0.08] text-slate-400 hover:bg-bridge-accent hover:text-white transition-colors"
                aria-label="상세 보기"
                title="상세 보기"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{
              background: `${it.feature_color ?? "#6366F1"}22`,
              color: it.feature_color ?? "#93c5fd",
            }}
          >
            {it.feature_title ?? "기타"}
          </span>
          {/* 외주 표식 — 담당 주체가 외부임을 라벨 옆에서 알린다(앰버 전용 컬러, 상태 뱃지와 구분). */}
          {it.contractor && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-amber-500/15 text-amber-500 border border-amber-500/30"
              title={
                it.contractor.manager_name
                  ? `외주 · 관리 ${it.contractor.manager_name}`
                  : "외주"
              }
            >
              <UserCheck className="w-2.5 h-2.5" />
              외주
            </span>
          )}
          {/* 빼기 = 왼쪽 업무 리스트로 드래그. 호버 시 액션 버튼에 자리를 내준다. */}
          {canEdit && !readOnly && (
            <span
              className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-600 opacity-100 group-hover:opacity-0 transition-opacity shrink-0"
              aria-hidden="true"
            >
              <CornerUpLeft className="w-3 h-3" />
              리스트로 끌기
            </span>
          )}
        </div>
        <div
          className={`text-xs font-medium leading-snug ${
            it.completed ? "line-through text-slate-500" : "text-foreground"
          }`}
        >
          {it.title}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {/* 진행 상태 칩 — 기간 안(진행 중) / 시작 전(예정). 완료·지남 카드엔 표시 안 함. */}
          {inProgress && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${liveBadge}`}
            >
              <span className="relative inline-flex w-1.5 h-1.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${liveDot}`}
                />
                <span
                  className={`relative inline-flex rounded-full w-1.5 h-1.5 ${liveDot}`}
                />
              </span>
              진행 중
            </span>
          )}
          {upcoming && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 bg-foreground/[0.06] text-slate-400">
              <Clock className="w-2.5 h-2.5" />
              예정
            </span>
          )}
          {it.task_title && <span className="truncate">{it.task_title}</span>}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {upcoming ? (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums bg-foreground/[0.06] text-slate-400"
                title={formatDate(it.start_date)}
              >
                <Calendar className="w-2.5 h-2.5" />
                {formatDate(it.start_date, "M/d")} 시작 · {startDday!.text}
              </span>
            ) : dday ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${DDAY_BADGE[dday.urgency]}`}
                title={formatDate(it.due_date)}
              >
                <Calendar className="w-2.5 h-2.5" />
                {overdue ? `${dday.text} 지연` : dday.text}
              </span>
            ) : it.due_date && !it.completed ? (
              <span className="tabular-nums">{formatDate(it.due_date)}</span>
            ) : null}
            {it.completed ? (
              <span className="inline-flex items-center gap-0.5 text-bridge-secondary font-bold">
                <Check className="w-3 h-3" /> 완료
              </span>
            ) : it.assignee ? (
              <span
                className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold text-white"
                style={{ background: getAssigneeHex(it.assignee.name) }}
              >
                {getInitials(it.assignee.name)}
              </span>
            ) : it.contractor ? (
              // 외주 담당 칩 — 미배정처럼 비어 보이지 않게 외주사명을 앰버 칩으로 노출.
              <span
                className="inline-flex items-center gap-1 min-w-0"
                title={`외주 · ${it.contractor.name}`}
              >
                <span className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0 bg-amber-500 text-amber-950">
                  {getInitials(it.contractor.name)}
                </span>
                <span className="truncate max-w-[72px] text-amber-500 font-bold">
                  {it.contractor.name}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // Feature 단위 컬럼 (기존 "Sprint" 컬럼을 Feature별로 쪼갠 것).
  // 컬럼 안은 Task 소그룹으로 나뉘고, 소그룹은 접기/펼치기 가능.
  // 보드 안 카드를 여기로 드롭하면 START 컬럼으로 이동한다(보드 내부 이동만 허용).
  const renderFeatureColumn = (fc: (typeof featureColumns)[number]) => {
    const accent = fc.featureColor ?? "#6366F1";
    const key = `feat-${fc.featureId}`;
    const pct = fc.total > 0 ? Math.round((fc.doneTotal / fc.total) * 100) : 0;
    return (
      <div
        key={key}
        onDragOver={(e) => {
          if (canEdit && draggingSource === "sprint") {
            e.preventDefault();
            setDragOverCol(key);
          }
        }}
        onDragLeave={() => setDragOverCol((c) => (c === key ? null : c))}
        onDrop={(e) => {
          if (startColumn) void onDropColumn(e, startColumn);
        }}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-foreground/[0.08]"
        }`}
      >
        {/* Feature 컬럼 헤더 + 진척 바 */}
        <div className="px-3 pt-2.5 pb-2 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: accent }}
            />
            <span
              className="text-xs font-bold text-foreground truncate flex-1"
              title={fc.featureTitle}
            >
              {fc.featureTitle}
            </span>
            <span className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0">
              FEATURE
            </span>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
              {fc.doneTotal}/{fc.total}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Task 소그룹 스택 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {fc.tasks.map((task) => {
            const tkey = `${fc.featureId}:${task.taskId}`;
            const collapsed = collapsedTasks.has(tkey);
            const clickable =
              task.taskId !== "__none__" && !!onOpenChecklistItem;
            // 태스크 고유 색 + 진행률 — 같은 피쳐 안 태스크 묶음을 시각적으로 분리.
            const tColor = taskColorHex(task.taskId);
            const tPct =
              task.total > 0
                ? Math.round((task.doneTotal / task.total) * 100)
                : 0;
            return (
              // Task 소그룹 = 색 스파인 프레임 + 헤더 (카드를 담는 하나의 묶음).
              // 좌측 3px 스파인 + 은은한 틴트로 "한 태스크"라는 소속감을 부여.
              // 카드는 개별 draggable 유지, 프레임은 소속감만 부여.
              <div
                key={task.taskId}
                className="rounded-xl border border-foreground/[0.08] overflow-hidden"
                style={{
                  borderLeft: `3px solid ${tColor}`,
                  background: `${tColor}0d`,
                }}
              >
                {/* Task 소그룹 헤더 바 (클릭 = 접기/펼치기, 호버 시 열기) */}
                <div
                  className={`group/task flex items-center gap-1.5 px-2 py-1.5 ${
                    collapsed ? "" : "border-b border-foreground/[0.06]"
                  }`}
                  style={{ background: `${tColor}14` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(tkey)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    aria-label={collapsed ? "펼치기" : "접기"}
                  >
                    {collapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span
                      className="w-1.5 h-1.5 rounded-sm shrink-0"
                      style={{ background: tColor }}
                    />
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide text-slate-300 truncate"
                      title={task.taskTitle}
                    >
                      {task.taskTitle}
                    </span>
                  </button>
                  {clickable && (
                    <button
                      type="button"
                      onClick={() => openTask(task.taskId)}
                      className="text-[10px] font-bold text-bridge-accent opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0"
                      title="태스크 열기"
                    >
                      열기 ↗
                    </button>
                  )}
                  {/* 태스크별 진행률 미니바 — 밀린 태스크를 스캔 한 번에 파악 */}
                  <span className="w-8 h-1 rounded-full bg-foreground/10 overflow-hidden shrink-0">
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{ width: `${tPct}%`, background: tColor }}
                    />
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                    {task.doneTotal}/{task.total}
                  </span>
                </div>

                {/* 카드 (펼침 시) — 프레임 안쪽 살짝 리세스, 카드는 떠 있는 개별 요소 */}
                {!collapsed && (
                  <div className="p-2 space-y-1.5 bg-black/[0.12]">
                    {task.items.length === 0 ? (
                      <div className="py-2 px-1 text-[10px] text-slate-600">
                        In Review로 이동됨 · 끌어와 되돌리기
                      </div>
                    ) : (
                      task.items.map((it) => renderCard(it))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 구성원 단위 컬럼 — Feature 컬럼과 대칭. 컬럼=담당자, 카드의 Feature 태그는 renderCard가 표시.
  // Task 소그룹 없이 담당자의 START 카드를 평면 나열한다. 드롭 = START로 이동(보드 내부 이동만).
  const renderMemberColumn = (mc: MemberColumn) => {
    const key = `mem-${mc.memberId}`;
    const isNone = mc.memberId === "__none__";
    const accent = isNone ? "#64748b" : getAssigneeHex(mc.memberName);
    const pct = mc.total > 0 ? Math.round((mc.doneTotal / mc.total) * 100) : 0;
    return (
      <div
        key={key}
        onDragOver={(e) => {
          if (canEdit && draggingSource === "sprint") {
            e.preventDefault();
            setDragOverCol(key);
          }
        }}
        onDragLeave={() => setDragOverCol((c) => (c === key ? null : c))}
        onDrop={(e) => {
          if (startColumn) void onDropColumn(e, startColumn);
        }}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-foreground/[0.08]"
        }`}
      >
        {/* 담당자 컬럼 헤더 + 진척 바 — 클릭 시 개인 간트 모달 오픈(미배정 제외) */}
        <div
          role={isNone ? undefined : "button"}
          tabIndex={isNone ? undefined : 0}
          aria-label={isNone ? undefined : `${mc.memberName} 간트 열기`}
          title={isNone ? undefined : `${mc.memberName} 간트 · 업무 배치`}
          onClick={isNone ? undefined : () => setGanttMemberId(mc.memberId)}
          onKeyDown={
            isNone
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setGanttMemberId(mc.memberId);
                  }
                }
          }
          className={`group px-3 pt-2.5 pb-2 border-b border-foreground/[0.06] ${
            isNone
              ? ""
              : "cursor-pointer hover:bg-foreground/[0.03] focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded-t-2xl transition-colors"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold shrink-0"
              style={{
                background: isNone ? "rgba(148,163,184,0.15)" : accent,
                color: isNone ? "#94a3b8" : "#fff",
              }}
            >
              {isNone ? "·" : getInitials(mc.memberName)}
            </span>
            <span
              className="text-xs font-bold text-foreground truncate flex-1"
              title={mc.memberName}
            >
              {mc.memberName}
            </span>
            {!isNone && (
              <Calendar className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
            <span className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0">
              담당
            </span>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
              {mc.doneTotal}/{mc.total}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        </div>

        {/* 카드 스택 (평면) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {mc.items.length === 0 ? (
            <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
              비어 있음
            </div>
          ) : (
            mc.items.map((it) => renderCard(it))
          )}
        </div>
      </div>
    );
  };

  // ── JIRA 뷰 렌더 (컬럼=JIRA 상태, 카드=Task) ──
  const renderQaBadge = (qa: "REVIEW" | "VERIFIED" | "REJECTED") => {
    const cfg =
      qa === "VERIFIED"
        ? {
            label: "검증완료",
            cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          }
        : qa === "REJECTED"
          ? {
              label: "반려",
              cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            }
          : {
              label: "검토중",
              cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            };
    return (
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${cfg.cls}`}
      >
        {cfg.label}
      </span>
    );
  };

  const renderJiraTaskCard = (card: JiraTaskCard, draggable: boolean) => {
    const pct = card.total > 0 ? Math.round((card.done / card.total) * 100) : 0;
    const canDrag = canEdit && draggable;
    return (
      <div
        key={card.taskId}
        draggable={canDrag}
        onDragStart={(e) => canDrag && onDragStartJiraTask(e, card)}
        onDragEnd={onDragEndItem}
        onClick={() => openTask(card.taskId)}
        className={`group rounded-xl border border-foreground/[0.08] bg-bridge-dark p-2.5 transition-colors hover:border-foreground/[0.14] ${
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
            style={{ background: "rgba(38,132,255,0.16)", color: "#7fb0ff" }}
          >
            <Diamond className="w-2.5 h-2.5" />
            {card.jiraKey}
          </span>
          {card.qaState && renderQaBadge(card.qaState)}
        </div>
        <div className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {card.taskTitle}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
            {card.done}/{card.total}
          </span>
          {card.assignees.length > 0 && (
            <div className="flex -space-x-1 shrink-0">
              {card.assignees.slice(0, 3).map((a) => (
                <span
                  key={a.id}
                  className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold ring-1 ring-bridge-dark"
                  style={{ background: getAssigneeHex(a.name), color: "#fff" }}
                  title={a.name}
                >
                  {getInitials(a.name)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderJiraColumn = (col: JiraColumnDef) => {
    const key = `jira-${col.statusId}`;
    const isPush = col.draggable;
    const accent =
      col.tone === "push"
        ? "#6366F1"
        : col.tone === "review"
          ? "#f59e0b"
          : col.tone === "verified"
            ? "#34d399"
            : "#64748b";
    return (
      <div
        key={key}
        onDragOver={(e) => {
          if (canEdit && isPush && draggingSource === "sprint") {
            e.preventDefault();
            setDragOverCol(key);
          }
        }}
        onDragLeave={() => setDragOverCol((c) => (c === key ? null : c))}
        onDrop={(e) => onDropJiraColumn(e, col)}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-foreground/[0.08]"
        }`}
      >
        <div className="px-3 pt-2.5 pb-2 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ background: accent }}
            />
            <span
              className="text-xs font-bold text-foreground truncate flex-1"
              title={col.label}
            >
              {col.label}
            </span>
            {!isPush && (
              <span
                className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0"
                title="QA 소유 상태 · 여기로는 옮길 수 없어요"
              >
                읽기전용
              </span>
            )}
            <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
              {col.cards.length}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {col.cards.length === 0 ? (
            <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
              비어 있음
            </div>
          ) : (
            col.cards.map((card) => renderJiraTaskCard(card, isPush))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="shrink-0 px-4 md:px-6 py-3 border-b border-foreground/[0.08] bg-bridge-obsidian">
        {/* 마일스톤 드롭다운 (칸반 탭 연동 시 숨김) */}
        {!controlled && (
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <div className="relative">
              <select
                value={internalMid}
                onChange={(e) => setInternalMid(e.target.value)}
                className="appearance-none bg-foreground/[0.04] border border-foreground/10 rounded-lg py-1.5 pl-3 pr-8 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 cursor-pointer"
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}

        {/* 스프린트 타임라인 — 과거는 압축 세그먼트, 진행중·미리보기는 확장(게이지·액션 내장) */}
        <div className="flex items-stretch gap-2">
          {(board?.sprints ?? []).map((s) => {
            const isActive = s.status === "ACTIVE";
            const isPreviewing = s.id === previewSprintId;
            // 확장: (진행중 && 미리보기 아님) 또는 (이 스프린트를 미리보기 중)
            const expandedActive = isActive && !previewSprintId;
            const expanded = expandedActive || isPreviewing;
            // 클릭: 과거 → 미리보기 진입 / 축소된 진행중(미리보기 중) → 복귀
            const handleClick = isActive
              ? previewSprintId
                ? () => setPreviewSprintId(null)
                : undefined
              : isPreviewing
                ? undefined
                : () => setPreviewSprintId(s.id);
            // 진행중 확장은 담당자필터 반영 gauge, 그 외는 스프린트 자체 값
            const pct =
              expandedActive && gauge
                ? gauge.percentage
                : s.progress_percentage;
            const doneN =
              expandedActive && gauge ? gauge.done : s.completed_count;
            const totalN =
              expandedActive && gauge ? gauge.total : s.total_count;
            const remaining = Math.max(
              0,
              (fullGauge?.total ?? 0) - (fullGauge?.done ?? 0),
            );

            return (
              <div
                key={s.id}
                onClick={handleClick}
                className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-[flex-basis,background-color,border-color] duration-300 ${
                  expanded ? "grow basis-[480px]" : "grow-0 basis-[132px]"
                } ${
                  isPreviewing
                    ? "border-dashed border-bridge-secondary/40 bg-gradient-to-br from-bridge-secondary/[0.12] to-transparent cursor-default"
                    : expandedActive
                      ? "border-bridge-accent/35 bg-gradient-to-br from-bridge-accent/[0.13] via-bridge-secondary/[0.04] to-transparent cursor-default"
                      : "border-foreground/[0.08] bg-foreground/[0.04] hover:bg-foreground/[0.08] " +
                        (handleClick ? "cursor-pointer" : "cursor-default")
                }`}
                title={
                  isPreviewing
                    ? "미리보기 중 · 읽기 전용"
                    : isActive
                      ? previewSprintId
                        ? "클릭해서 진행중으로 돌아가기"
                        : "진행 중"
                      : "클릭해서 미리보기 (읽기 전용)"
                }
              >
                {/* 라벨 행 — 축소 세그먼트 상단. 확장(진행중·미리보기)은 각자 2행 레이아웃에 이름·배지를 통합 */}
                {!expanded && (
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-bold tracking-tight whitespace-nowrap ${
                        expanded
                          ? "text-sm text-foreground"
                          : "text-[13px] text-slate-300"
                      }`}
                    >
                      {s.name}
                    </span>
                    {isPreviewing ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-bridge-secondary whitespace-nowrap">
                        <Eye className="w-3 h-3" /> 미리보기
                      </span>
                    ) : isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-bridge-secondary whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary animate-pulse" />
                        진행중
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-bridge-secondary whitespace-nowrap">
                        <Check className="w-3 h-3" /> 완료
                      </span>
                    )}
                  </div>
                )}

                {/* 진척 막대 — 축소 세그먼트용 단색. 확장(진행중·미리보기)은 각자 Row 2로 이동 */}
                {!expanded && (
                  <div className="h-[5px] rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-bridge-secondary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {/* 축소 상태: 퍼센트 요약 */}
                {!expanded && (
                  <div className="text-[11px] font-bold text-bridge-secondary tabular-nums">
                    {pct}%
                  </div>
                )}

                {/* 진행중 확장: 투톤 2행 컴팩트 레이아웃 */}
                {expandedActive && (
                  <div className="flex flex-col gap-2">
                    {/* Row 1 — 이름 · 진행중 · 게이지 · 메타 · 오늘완료 · D-day */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap">
                        {s.name}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-bridge-secondary whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary animate-pulse" />
                        진행중
                      </span>
                      <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                        {groupBy === "jira"
                          ? jiraStats.linked > 0
                            ? Math.round(
                                (jiraStats.verified / jiraStats.linked) * 100,
                              )
                            : 0
                          : pct}
                        <span className="text-sm text-slate-400">%</span>
                      </span>
                      <span className="text-xs font-medium text-slate-400 tabular-nums">
                        {groupBy === "jira" ? (
                          <>
                            검증 {jiraStats.verified} · 검토중{" "}
                            {jiraStats.review} / 연동 {jiraStats.linked}건
                            {jiraStats.rejected > 0 && (
                              <span className="text-rose-400">
                                {" "}
                                · 반려 {jiraStats.rejected}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {doneN} / {totalN} 항목
                          </>
                        )}
                      </span>
                      {sprintProgress.nToday > 0 && (
                        <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0 tabular-nums">
                          ▲ {sprintProgress.nToday}
                        </span>
                      )}
                      <span className="flex-1" />
                      {s.end_date &&
                        (() => {
                          const d = getDDay(s.end_date);
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                                DDAY_BADGE[d.urgency] ||
                                "bg-bridge-secondary/15 text-bridge-secondary"
                              }`}
                              title={`종료 예정 ${formatDate(s.end_date)}`}
                            >
                              <Clock className="w-3 h-3" />
                              종료 {d.text}
                            </span>
                          );
                        })()}
                    </div>

                    {/* Row 2 — 진척바(클릭:진행현황) · 그룹 토글 · 종료 */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProgressTab(
                            sprintProgress.nToday > 0
                              ? "todayDone"
                              : "inProgress",
                          );
                          setProgressOpen(true);
                        }}
                        aria-haspopup="dialog"
                        aria-label="진행 현황 보기"
                        title="진행 현황 자세히 보기"
                        className="group/bar flex-1 min-w-[80px] flex items-center -mx-0.5 px-0.5 py-1 rounded"
                      >
                        <div className="flex-1 h-[5px] rounded-full bg-slate-600 overflow-hidden relative">
                          {groupBy === "jira" ? (
                            (() => {
                              const vPct =
                                jiraStats.linked > 0
                                  ? (jiraStats.verified / jiraStats.linked) *
                                    100
                                  : 0;
                              const rPct =
                                jiraStats.linked > 0
                                  ? (jiraStats.review / jiraStats.linked) * 100
                                  : 0;
                              return (
                                <>
                                  {/* 검증완료 */}
                                  <div
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all duration-500"
                                    style={{ width: `${vPct}%` }}
                                  />
                                  {/* 검토중(QA 대기) */}
                                  {rPct > 0 && (
                                    <div
                                      className="absolute top-0 h-full bg-amber-500 transition-all duration-500"
                                      style={{
                                        left: `${vPct}%`,
                                        width: `${rPct}%`,
                                      }}
                                    />
                                  )}
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <div
                                className="absolute left-0 top-0 h-full bg-bridge-accent transition-all duration-500"
                                style={{
                                  width: `${sprintProgress.segEarlier}%`,
                                }}
                              />
                              {sprintProgress.segToday > 0 && (
                                <div
                                  className="absolute top-0 h-full bg-bridge-secondary transition-all duration-500"
                                  style={{
                                    left: `${sprintProgress.segEarlier}%`,
                                    width: `${sprintProgress.segToday}%`,
                                    boxShadow:
                                      "0 0 8px var(--bridge-secondary)",
                                  }}
                                />
                              )}
                              {sprintProgress.segProg > 0 && (
                                <div
                                  className="absolute top-0 h-full bg-amber-500 transition-all duration-500"
                                  style={{
                                    left: `${sprintProgress.segEarlier + sprintProgress.segToday}%`,
                                    width: `${sprintProgress.segProg}%`,
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </button>

                      {/* Feature ↔ 구성원 전환 */}
                      <div
                        className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/[0.06] border border-foreground/10 shrink-0"
                        role="tablist"
                        aria-label="보드 그룹 기준"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={groupBy === "feature"}
                          onClick={() => setGroupBy("feature")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                            groupBy === "feature"
                              ? "bg-bridge-accent text-white"
                              : "text-slate-400 hover:text-foreground"
                          }`}
                          title="Feature 단위로 컬럼 보기"
                        >
                          <Layers className="w-3 h-3" />
                          Feature
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={groupBy === "member"}
                          onClick={() => setGroupBy("member")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                            groupBy === "member"
                              ? "bg-bridge-accent text-white"
                              : "text-slate-400 hover:text-foreground"
                          }`}
                          title="구성원(담당자) 단위로 컬럼 보기"
                        >
                          <Users className="w-3 h-3" />
                          구성원
                        </button>
                        {jiraConnected && (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={groupBy === "jira"}
                            onClick={() => setGroupBy("jira")}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                              groupBy === "jira"
                                ? "bg-bridge-accent text-white"
                                : "text-slate-400 hover:text-foreground"
                            }`}
                            title="JIRA 상태 단위로 컬럼 보기 (연동 항목만)"
                          >
                            <Diamond className="w-3 h-3" />
                            JIRA
                          </button>
                        )}
                      </div>

                      {isAdminOrOwner && (
                        <>
                          <span className="hidden text-[11px] text-slate-500 tabular-nums whitespace-nowrap lg:inline">
                            {canClose ? "종료 가능" : `남은 ${remaining}개`}
                          </span>
                          {inReactivation && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelReactivation();
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-bridge-secondary bg-bridge-secondary/15 hover:bg-bridge-secondary/25 transition-colors whitespace-nowrap shrink-0"
                              title="재활성화를 취소하고 최신 스프린트로 되돌립니다"
                            >
                              재활성화 취소
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeSprint();
                            }}
                            disabled={!canClose}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                              canClose
                                ? "bg-bridge-accent text-white hover:bg-bridge-accent/90"
                                : "bg-foreground/[0.05] text-slate-500 cursor-not-allowed"
                            }`}
                            title={
                              canClose
                                ? "스프린트 종료"
                                : "모든 카드가 Done이어야 종료할 수 있습니다"
                            }
                          >
                            {inReactivation ? "재동결" : "스프린트 종료"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 미리보기 확장: 종료 시점 스냅샷 — 진행중 확장과 동일한 2행 구조·높이 */}
                {isPreviewing && (
                  <div className="flex flex-col gap-2">
                    {/* Row 1 — 이름 · 미리보기 · 퍼센트 · 카운트 · 기간 · (우) 읽기전용 힌트 */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap">
                        {s.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-bridge-secondary whitespace-nowrap">
                        <Eye className="w-3 h-3" /> 미리보기
                      </span>
                      <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
                        {pct}
                        <span className="text-sm text-slate-400">%</span>
                      </span>
                      <span className="text-xs font-medium text-slate-400 tabular-nums">
                        {doneN} / {totalN} 항목
                      </span>
                      {s.start_date && (
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {formatDate(s.start_date)} ~{" "}
                          {s.end_date ? formatDate(s.end_date) : "진행"}
                        </span>
                      )}
                      <span className="flex-1" />
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-bridge-secondary whitespace-nowrap"
                        title="읽기 전용으로 열람 중입니다. 편집하려면 재활성화하세요."
                      >
                        <Eye className="w-3 h-3 shrink-0" /> 읽기 전용 스냅샷
                      </span>
                    </div>

                    {/* Row 2 — 진척바(스냅샷) · 재활성화 · 진행중으로 돌아가기 */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[80px] h-[5px] rounded-full bg-foreground/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-bridge-secondary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isAdminOrOwner &&
                        (inReactivation ? (
                          <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                            재활성화 취소 후 이용 가능
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReactivateModal(s);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-bridge-secondary bg-bridge-secondary/15 hover:bg-bridge-secondary/25 transition-colors whitespace-nowrap shrink-0"
                            title="이 스프린트를 다시 진행중으로 되살립니다"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            재활성화
                          </button>
                        ))}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewSprintId(null);
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors whitespace-nowrap shrink-0"
                      >
                        진행중으로 돌아가기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>

      {/* 스플릿: 좌 소스 트리 / 우 스프린트 보드 (미리보기 중엔 트리 숨김 → 스냅샷 풀폭) */}
      <div className="flex-1 min-h-0 flex">
        {/* 좌: 소스 트리 — Feature 섹션 ▸ Task 라벨 ▸ 체크리스트 행(클릭 진입 + 인라인 완료) */}
        {!previewSprintId && (
          <aside
            style={panelCollapsed ? undefined : { width: panelWidth }}
            onDragOver={(e) => {
              // 스프린트 카드를 끌고 온 경우에만 드롭 허용(빼기)
              if (canEdit && draggingSource === "sprint") {
                e.preventDefault();
                setDragOverList(true);
                // 접힌 상태에서 카드를 끌어오면 되돌릴 곳이 안 보이므로 자동 펼침
                if (panelCollapsed) setPanelCollapsed(false);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragOverList(false);
            }}
            onDrop={onDropList}
            className={`shrink-0 border-r border-foreground/[0.08] flex flex-col bg-bridge-dark relative ${
              panelCollapsed ? "w-[46px]" : ""
            } ${resizing ? "" : "transition-[width] duration-200"}`}
          >
            {/* 접힘 레일 — 아이콘 하나만. 클릭 시 펼침 */}
            {panelCollapsed && (
              <div className="flex-1 flex flex-col items-center pt-2.5">
                <button
                  type="button"
                  onClick={() => setPanelCollapsed(false)}
                  title="업무 리스트 펼치기"
                  aria-label="업무 리스트 펼치기"
                  className="inline-grid place-items-center w-[30px] h-[30px] rounded-lg border border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-white hover:bg-bridge-accent hover:border-bridge-accent transition-colors"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* 카드→리스트 드롭 존 오버레이 (스프린트 카드 드래그 중에만) */}
            {!panelCollapsed && draggingSource === "sprint" && (
              <div
                className={`pointer-events-none absolute inset-2 z-20 rounded-2xl border-[1.5px] border-dashed flex items-start justify-center transition-colors ${
                  dragOverList
                    ? "border-bridge-accent bg-bridge-accent/10"
                    : "border-bridge-accent/50 bg-bridge-accent/[0.04]"
                }`}
              >
                <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-bridge-accent bg-bridge-obsidian/90 border border-bridge-accent/40 rounded-full px-3 py-1.5 shadow-lg">
                  <CornerUpLeft className="w-3.5 h-3.5" />
                  업무 리스트로 되돌리기 · 원래 자리로
                </span>
              </div>
            )}
            {!panelCollapsed && (
              <div className="px-4 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 truncate flex-1">
                  업무 리스트
                </span>
                {/* 보임 필터 — 정리된(완료·담김) 항목 숨기기/보이기 (상태 유지) */}
                <button
                  type="button"
                  onClick={() => setShowTakenInTree((v) => !v)}
                  aria-pressed={!showTakenInTree}
                  title={
                    showTakenInTree
                      ? "정리된(완료·담김) 항목 숨기기"
                      : "정리된(완료·담김) 항목 보이기"
                  }
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    showTakenInTree
                      ? "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30"
                      : "bg-foreground/[0.03] text-slate-400 border-foreground/10 hover:border-foreground/20"
                  }`}
                >
                  {showTakenInTree ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  {showTakenInTree ? "정리된 항목" : "정리된 항목 숨김"}
                </button>
                {/* 패널 접기 */}
                <button
                  type="button"
                  onClick={() => setPanelCollapsed(true)}
                  title="업무 리스트 접기"
                  aria-label="업무 리스트 접기"
                  className="shrink-0 inline-grid place-items-center w-7 h-7 rounded-lg border border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-foreground hover:border-foreground/20 transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            )}
            {!panelCollapsed && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {tree.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-8">
                    항목이 없습니다.
                  </p>
                )}
                {tree.length > 0 && !treeHasVisible && (
                  <p className="text-xs text-slate-500 text-center py-8 leading-relaxed">
                    정리된 항목만 있어 모두 숨겨졌어요.
                    <br />
                    <button
                      type="button"
                      onClick={() => setShowTakenInTree(true)}
                      className="mt-1 text-bridge-accent font-bold hover:underline"
                    >
                      정리된 항목 보이기
                    </button>
                  </p>
                )}
                {tree.map((feat) => {
                  // 보임 필터: 정리된 항목 숨김 시, 표시할 항목이 남은 Task만 유지
                  // (담김·완료 모두 숨김 — 스프린트 미담김이라도 완료 처리된 항목 포함)
                  const visibleTasks = feat.tasks
                    .map((task) => ({
                      task,
                      items: showTakenInTree
                        ? task.items
                        : task.items.filter(
                            (it) => !it.sprint_column_id && !it.completed,
                          ),
                    }))
                    .filter((t) => t.items.length > 0);
                  // 표시할 항목이 하나도 없으면 Feature 섹션 자체를 숨김
                  if (visibleTasks.length === 0) return null;
                  const collapsed = collapsedFeatures.has(feat.featureId);
                  const pct =
                    feat.total > 0
                      ? Math.round((feat.completed / feat.total) * 100)
                      : 0;
                  const featColor = feat.featureColor ?? "#6366F1";
                  return (
                    <div
                      key={feat.featureId}
                      className="rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] bg-bridge-obsidian overflow-hidden transition-colors"
                      style={{ borderLeftWidth: 3, borderLeftColor: featColor }}
                    >
                      {/* Feature 카드: 좌측 컬러 레일 · 헤더(토글 + 열기) · 헤더 게이지 · 본문 */}
                      {/* 헤더: 좌측 토글 버튼 + 우측 피쳐 열기 버튼 (버튼 중첩 방지 위해 분리) */}
                      <div className="flex items-stretch">
                        <button
                          onClick={() => toggleFeature(feat.featureId)}
                          className="flex-1 min-w-0 flex items-center gap-2 pl-2 pr-1.5 py-2 text-left hover:bg-foreground/[0.03] transition-colors"
                        >
                          {collapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <span
                            className="text-xs font-bold text-foreground truncate flex-1"
                            title={feat.featureTitle}
                          >
                            {feat.featureTitle}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums shrink-0">
                            {feat.completed}/{feat.total}
                          </span>
                          <span
                            className="text-xs font-bold tabular-nums shrink-0"
                            style={{ color: featColor }}
                          >
                            {pct}%
                          </span>
                        </button>
                        {onOpenFeature && (
                          <button
                            type="button"
                            onClick={() => onOpenFeature(feat.featureId)}
                            title="피쳐 열기"
                            aria-label="피쳐 열기"
                            className="shrink-0 w-9 grid place-items-center text-slate-500 border-l border-foreground/[0.06] hover:text-bridge-accent hover:bg-bridge-accent/[0.08] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 헤더 게이지: 진척을 헤더 바로 아래 인라인으로 표시 */}
                      <div className="px-2.5 pt-0.5 pb-2">
                        <div
                          className="h-1.5 rounded-full overflow-hidden bg-foreground/[0.06]"
                          title={`완료 ${feat.completed}/${feat.total} · 담김 ${feat.taken}/${feat.total} · ${pct}%`}
                        >
                          <div
                            className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                            style={{ width: `${pct}%`, background: featColor }}
                          />
                        </div>
                      </div>

                      {!collapsed && (
                        <div className="space-y-2 px-2 pb-2">
                          {visibleTasks.map(({ task, items }) => {
                            const hasTask =
                              task.taskId !== "__none__" &&
                              !!onOpenChecklistItem;
                            // Task 색 스파인 프레임: 체크리스트를 "한 태스크"로 묶는다
                            // (우측 스프린트 보드의 Task 소그룹과 동일 시각 언어).
                            const tkey = `${feat.featureId}:${task.taskId}`;
                            const tCollapsed = collapsedTasks.has(tkey);
                            const tColor = taskColorHex(task.taskId);
                            // 진행률은 담김/보임 필터와 무관하게 태스크 전체 기준.
                            const tDone = task.items.filter(
                              (i) => i.completed,
                            ).length;
                            const tTotal = task.items.length;
                            const tPct =
                              tTotal > 0
                                ? Math.round((tDone / tTotal) * 100)
                                : 0;
                            return (
                              <div
                                key={task.taskId}
                                className="rounded-xl border border-foreground/[0.08] overflow-hidden"
                                style={{
                                  borderLeft: `3px solid ${tColor}`,
                                  background: `${tColor}0d`,
                                }}
                              >
                                {/* Task 헤더 — 접기/펼치기 · 진행률 · 태스크 열기 */}
                                <div
                                  className={`group/task flex items-center gap-1.5 px-2 py-1.5 ${
                                    tCollapsed
                                      ? ""
                                      : "border-b border-foreground/[0.06]"
                                  }`}
                                  style={{ background: `${tColor}14` }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleTask(tkey)}
                                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                                    aria-label={tCollapsed ? "펼치기" : "접기"}
                                    title={task.taskTitle}
                                  >
                                    {tCollapsed ? (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    )}
                                    <span
                                      className="w-1.5 h-1.5 rounded-sm shrink-0"
                                      style={{ background: tColor }}
                                    />
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-300 truncate">
                                      {task.taskTitle}
                                    </span>
                                  </button>
                                  {hasTask && (
                                    <button
                                      type="button"
                                      onClick={() => openTask(task.taskId)}
                                      className="text-[10px] font-bold text-bridge-accent opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0"
                                      title="태스크 열기"
                                    >
                                      열기 ↗
                                    </button>
                                  )}
                                  <span className="w-8 h-1 rounded-full bg-foreground/10 overflow-hidden shrink-0">
                                    <span
                                      className="block h-full rounded-full transition-all motion-reduce:transition-none"
                                      style={{
                                        width: `${tPct}%`,
                                        background: tColor,
                                      }}
                                    />
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                                    {tDone}/{tTotal}
                                  </span>
                                </div>

                                {/* 체크리스트 카드 (펼침 시) */}
                                {!tCollapsed && (
                                  <div className="p-1.5 space-y-1 bg-black/[0.12]">
                                    {items.map((it) => {
                                      const taken = !!it.sprint_column_id;
                                      const col = it.sprint_column_id
                                        ? columnById.get(it.sprint_column_id)
                                        : undefined;
                                      // 담기 가능 조건(미담김 · 편집권한). 리스트→보드 드래그는
                                      // 제거되고, 담기는 호버 버튼(원클릭)으로만 수행한다.
                                      const canAdd = canEdit && !taken;
                                      const clickable =
                                        !!it.task_id && !!onOpenChecklistItem;
                                      // 원클릭 담기 버튼 노출 조건(미담김 · 편집권한 · 활성 스프린트)
                                      const showAddBtn =
                                        canAdd && !!activeSprint;
                                      return (
                                        <div
                                          key={it.id}
                                          className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${
                                            taken
                                              ? "bg-bridge-secondary/[0.06] border-bridge-secondary/20 hover:border-bridge-secondary/40"
                                              : "bg-bridge-dark border-foreground/[0.08] hover:border-bridge-border"
                                          }`}
                                        >
                                          {/* B. 체크박스 — 완료 토글 */}
                                          <button
                                            type="button"
                                            onClick={() => toggleDone(it)}
                                            disabled={!canEdit || !it.task_id}
                                            aria-label={
                                              it.completed
                                                ? "완료 해제"
                                                : "완료 표시"
                                            }
                                            className={`w-4 h-4 rounded-[5px] shrink-0 border grid place-items-center transition-colors ${
                                              it.completed
                                                ? "bg-bridge-secondary border-bridge-secondary"
                                                : "border-slate-500 hover:border-bridge-secondary"
                                            } ${
                                              canEdit && it.task_id
                                                ? "cursor-pointer"
                                                : "cursor-default"
                                            }`}
                                          >
                                            {it.completed && (
                                              <Check
                                                className="w-2.5 h-2.5 text-bridge-dark"
                                                strokeWidth={3.5}
                                              />
                                            )}
                                          </button>

                                          {/* C. 본문 — 클릭 진입 */}
                                          <button
                                            type="button"
                                            onClick={() => openItem(it)}
                                            disabled={!clickable}
                                            className={`flex-1 min-w-0 text-left ${
                                              clickable
                                                ? "cursor-pointer"
                                                : "cursor-default"
                                            }`}
                                            title={it.title}
                                          >
                                            <span
                                              className={`block text-xs truncate ${
                                                it.completed
                                                  ? "line-through text-slate-500"
                                                  : "text-foreground"
                                              }`}
                                            >
                                              {it.title}
                                            </span>
                                          </button>

                                          {/* D. 메타 — 담긴 컬럼 칩 · 담당자 · 진입 힌트 */}
                                          <span className="flex items-center gap-1 shrink-0">
                                            {taken && col && (
                                              <span
                                                className="inline-flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 max-w-[76px]"
                                                style={{
                                                  background: `${columnAccent(col)}26`,
                                                  color: columnAccent(col),
                                                }}
                                                title={`담김 · ${col.name}`}
                                              >
                                                <span
                                                  className="w-1 h-1 rounded-full shrink-0"
                                                  style={{
                                                    background:
                                                      columnAccent(col),
                                                  }}
                                                />
                                                <span className="truncate">
                                                  {col.name}
                                                </span>
                                              </span>
                                            )}
                                            {it.assignee && (
                                              <span
                                                className={`w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0 ${
                                                  showAddBtn
                                                    ? "transition-opacity group-hover:opacity-0"
                                                    : ""
                                                }`}
                                                style={{
                                                  background: getAssigneeHex(
                                                    it.assignee.name,
                                                  ),
                                                }}
                                                title={it.assignee.name}
                                              >
                                                {getInitials(it.assignee.name)}
                                              </span>
                                            )}
                                            {clickable && !showAddBtn && (
                                              <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                          </span>

                                          {/* E. 원클릭 담기 (오버레이) — 레이아웃 폭을 점유하지 않고 제목 위로 겹침 */}
                                          {showAddBtn && (
                                            <>
                                              {/* 제목 우측 끝을 행 배경색으로 페이드 → 버튼 뒤로 자연스럽게 사라짐 */}
                                              <span
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-y-0 right-0 w-24 rounded-r-lg bg-gradient-to-l from-bridge-dark from-45% to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => addToSprint(it)}
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-0.5 text-[10px] font-bold rounded-full pl-1 pr-1.5 py-0.5 bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30 opacity-0 group-hover:opacity-100 hover:bg-bridge-accent hover:text-white transition-all"
                                                title="스프린트에 담기"
                                                aria-label="스프린트에 담기"
                                              >
                                                <ArrowRight className="w-3 h-3" />
                                                스프린트
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 리사이즈 핸들 — 경계 드래그로 폭 조절(240~480px). 접힘 상태에선 숨김. */}
            {!panelCollapsed && (
              <div
                onMouseDown={handleResizeStart}
                title="드래그해서 폭 조절"
                className={`group absolute top-0 right-0 h-full w-[7px] translate-x-1/2 cursor-col-resize z-30 ${
                  canEdit && draggingSource ? "pointer-events-none" : ""
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-[3px] w-px transition-colors ${
                    resizing
                      ? "bg-bridge-accent w-[2px] left-[2px]"
                      : "bg-transparent group-hover:bg-bridge-accent"
                  }`}
                />
              </div>
            )}
          </aside>
        )}

        {/* 우: 동적 컬럼 보드 (미리보기 중엔 읽기 전용 스냅샷) */}
        <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
          {previewColumns ? (
            <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
              {previewColumns.map((col) => {
                const accent =
                  col.kind === "START"
                    ? "#6366F1"
                    : col.kind === "END"
                      ? "#34d399"
                      : (col.color ?? "#f59e0b");
                return (
                  <div
                    key={col.id}
                    className="w-[260px] shrink-0 flex flex-col rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian"
                  >
                    <div className="px-3 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      <span className="text-xs font-bold text-foreground truncate flex-1">
                        {col.name}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
                        {col.items.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
                      {col.items.length === 0 ? (
                        <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
                          비어 있음
                        </div>
                      ) : (
                        col.items.map((it) => renderCard(it, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : previewLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : !activeSprint ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              진행 중인 스프린트가 없습니다.
            </div>
          ) : groupBy === "jira" ? (
            jiraMetaLoading && !jiraMeta ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            ) : jiraColumns.every((c) => c.cards.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                <Diamond className="w-8 h-8 text-slate-600" />
                <p className="text-sm text-slate-400 font-medium">
                  이 스프린트에 JIRA 연동 항목이 없습니다.
                </p>
                <p className="text-xs text-slate-600 max-w-xs">
                  JIRA 이슈를 가져오거나 태스크를 연결하면 여기에 상태별로
                  나타납니다.
                </p>
              </div>
            ) : (
              <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
                {jiraColumns.map((col) => renderJiraColumn(col))}
              </div>
            )
          ) : (
            <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
              {columns.map((col) => {
                // START("Sprint") 컬럼은 그룹 기준에 따라 Feature/담당자 단위 컬럼들로 확장.
                // In Review / Done 등 나머지 컬럼은 두 뷰에서 그대로 유지(공유).
                if (col.kind === "START") {
                  const grouped =
                    groupBy === "member" ? memberColumns : featureColumns;
                  if (grouped.length > 0) {
                    return (
                      <Fragment key={col.id}>
                        {groupBy === "member"
                          ? memberColumns.map((mc) => renderMemberColumn(mc))
                          : featureColumns.map((fc) => renderFeatureColumn(fc))}
                      </Fragment>
                    );
                  }
                  // 활성 카드가 없으면(전부 In Review/Done·미담김) START 컬럼 자체를 노출(담기 안내)
                }
                const isAnchor = col.kind !== "MIDDLE";
                const accent =
                  col.kind === "START"
                    ? "#6366F1"
                    : col.kind === "END"
                      ? "#34d399"
                      : (col.color ?? "#f59e0b");
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => {
                      if (canEdit && draggingSource === "sprint") {
                        e.preventDefault();
                        setDragOverCol(col.id);
                      }
                    }}
                    onDragLeave={() =>
                      setDragOverCol((c) => (c === col.id ? null : c))
                    }
                    onDrop={(e) => onDropColumn(e, col)}
                    className={`w-[260px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
                      dragOverCol === col.id
                        ? "border-bridge-accent/60"
                        : "border-foreground/[0.08]"
                    }`}
                  >
                    {/* 컬럼 헤더 */}
                    <div className="px-3 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      {editingCol === col.id ? (
                        <input
                          autoFocus
                          value={editColName}
                          onChange={(e) => setEditColName(e.target.value)}
                          onBlur={() => submitRename(col)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename(col);
                            if (e.key === "Escape") setEditingCol(null);
                          }}
                          className="flex-1 min-w-0 bg-foreground/[0.05] border border-foreground/10 rounded px-2 py-0.5 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                        />
                      ) : (
                        <span className="text-xs font-bold text-foreground truncate flex-1">
                          {col.name}
                        </span>
                      )}
                      {isAnchor && (
                        <span className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0">
                          고정
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
                        {col.items.length}
                      </span>
                      {/* MIDDLE 컬럼 편집 (관리자) */}
                      {col.kind === "MIDDLE" &&
                        isAdminOrOwner &&
                        editingCol !== col.id && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveColumn(col, -1)}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="왼쪽으로"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => moveColumn(col, 1)}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="오른쪽으로"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCol(col.id);
                                setEditColName(col.name);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="이름 변경"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeColumn(col)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-foreground/5"
                              aria-label="삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                    </div>

                    {/* 카드 스택 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
                      {col.items.length === 0 && (
                        <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
                          {col.kind === "START"
                            ? "← 왼쪽에서 끌어다 담기"
                            : "비어 있음"}
                        </div>
                      )}
                      {col.items.map((it) => renderCard(it))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 재활성화 확인 모달 — 파괴적 액션(진행중 스프린트 park) 영향 고지 */}
      <MotionModal
        open={!!reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        accentColor
        aria-labelledby="reactivate-title"
        className="w-full sm:max-w-md"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
            <RotateCcw className="w-4 h-4" />
          </span>
          <h4
            id="reactivate-title"
            className="text-sm font-bold text-foreground"
          >
            {reactivateTarget?.name}을(를) 재활성화할까요?
          </h4>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            이 스프린트를 다시{" "}
            <span className="font-bold text-foreground">진행중</span>으로
            되살립니다. 종료했던 항목을 이어서 작업할 수 있어요.
          </p>
          {activeSprint && activeSprint.id !== reactivateTarget?.id && (
            <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                현재 진행중인{" "}
                <span className="font-bold">{activeSprint.name}</span>은(는)
                뒤로 보관됩니다. 언제든 &lsquo;재활성화 취소&rsquo;로 되돌릴 수
                있어요.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc 닫기</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReactivateTarget(null)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
            >
              그냥 볼게요
            </button>
            <button
              onClick={confirmReactivate}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
            >
              재활성화
            </button>
          </div>
        </div>
      </MotionModal>

      {/* 진행 현황 모달 — 오늘 완료 / 진행 중 / 기존 완료 / 미완료 (KanbanBlock 진행 현황과 동일 규약) */}
      <MotionModal
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        accentColor
        aria-label="진행 현황"
        className="sm:max-w-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <Check className="w-4 h-4 text-bridge-secondary shrink-0" />
          <h3 className="text-sm font-bold text-foreground truncate">
            진행 현황
          </h3>
          {activeSprint && (
            <span className="text-xs text-slate-500 truncate min-w-0">
              · {activeSprint.name}
            </span>
          )}
          <button
            type="button"
            onClick={() => setProgressOpen(false)}
            aria-label="닫기"
            className="ml-auto text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress summary */}
        <div className="px-5 py-4 border-b border-foreground/[0.08]">
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-2xl font-bold text-foreground tracking-tight tabular-nums">
              {sprintProgress.pct}%
            </span>
            <span className="text-sm text-slate-400 tabular-nums">
              {sprintProgress.done} / {sprintProgress.total}
            </span>
            {sprintProgress.nToday > 0 && (
              <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary tabular-nums">
                ▲ {sprintProgress.nToday}
              </span>
            )}
          </div>
          {/* 4색 스택 바: 기존완료 / 오늘완료 / 진행중 / 미완료(트랙) */}
          <div className="h-2 bg-slate-600 rounded-full overflow-hidden relative">
            <div
              className="absolute left-0 top-0 h-full bg-bridge-accent"
              style={{ width: `${sprintProgress.segEarlier}%` }}
            />
            <div
              className="absolute top-0 h-full bg-bridge-secondary"
              style={{
                left: `${sprintProgress.segEarlier}%`,
                width: `${sprintProgress.segToday}%`,
              }}
            />
            <div
              className="absolute top-0 h-full bg-amber-500"
              style={{
                left: `${sprintProgress.segEarlier + sprintProgress.segToday}%`,
                width: `${sprintProgress.segProg}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-x-3.5 gap-y-1.5 mt-2.5 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span className="w-2 h-2 rounded-sm bg-bridge-secondary" />
              오늘 완료 {sprintProgress.nToday}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span className="w-2 h-2 rounded-sm bg-amber-500" />
              진행 중 {sprintProgress.nProg}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span className="w-2 h-2 rounded-sm bg-bridge-accent" />
              기존 완료 {sprintProgress.nEarlier}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span className="w-2 h-2 rounded-sm bg-slate-600" />
              미완료 {sprintProgress.nNot}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {(
              [
                ["todayDone", "오늘 완료"],
                ["inProgress", "진행 중"],
                ["earlierDone", "기존 완료"],
                ["notStarted", "미완료"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setProgressTab(tab)}
                className={`text-xs px-3 py-1 rounded-full transition-colors tabular-nums ${
                  progressTab === tab
                    ? "bg-bridge-secondary/15 text-bridge-secondary font-bold"
                    : "text-slate-500 hover:text-slate-300 bg-foreground/[0.03]"
                }`}
              >
                {label} {sprintProgress.counts[tab]}
              </button>
            ))}
          </div>

          {sprintProgress.buckets[progressTab].length === 0 ? (
            <div className="text-sm text-slate-500 py-12 text-center">
              항목이 없어요
            </div>
          ) : (
            <div className="space-y-1 max-h-[60dvh] overflow-y-auto custom-scrollbar">
              {sprintProgress.buckets[progressTab].slice(0, 100).map((it) => {
                const isDone =
                  progressTab === "todayDone" || progressTab === "earlierDone";
                const isProg = progressTab === "inProgress";
                const rightLabel = isDone
                  ? formatRelativeTime(it.completed_at ?? it.done_date)
                  : it.due_date
                    ? `~ ${it.due_date}`
                    : it.start_date
                      ? `${it.start_date} ~`
                      : "";
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      if (it.task_id) onOpenChecklistItem?.(it.task_id, it.id);
                      setProgressOpen(false);
                    }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl bg-foreground/[0.03] hover:bg-foreground/[0.06] border border-foreground/[0.06] transition-colors text-left"
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        isDone
                          ? "bg-emerald-500/15"
                          : isProg
                            ? "bg-amber-500/15"
                            : "bg-slate-500/15"
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : isProg ? (
                        <Clock className="w-3 h-3 text-amber-500" />
                      ) : (
                        <Circle className="w-3 h-3 text-slate-400" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground font-medium break-words">
                        {it.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        {it.task_title && (
                          <span className="text-xs text-slate-500 truncate">
                            {it.task_title}
                          </span>
                        )}
                        {it.assignee && (
                          <>
                            <span className="text-xs text-slate-600 shrink-0">
                              ·
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold leading-none text-white flex-shrink-0 border border-foreground/[0.08] whitespace-nowrap overflow-hidden"
                                style={{
                                  backgroundColor: getAssigneeHex(
                                    it.assignee.name,
                                  ),
                                }}
                                title={it.assignee.name}
                              >
                                {getInitials(it.assignee.name)}
                              </span>
                              <span className="text-xs text-slate-400">
                                {it.assignee.name}
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0 mt-0.5">
                      {rightLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </MotionModal>

      {/* 구성원 개인 간트 · 업무 배치 모달 — 체크리스트 start/due를 간트로 편집(즉시 저장) */}
      <SprintMemberGanttModal
        open={!!ganttMemberId}
        onClose={() => setGanttMemberId(null)}
        boardId={boardId}
        canEdit={canEdit}
        member={retainedGantt?.member ?? null}
        items={retainedGantt?.items ?? []}
        sprintName={activeSprint?.name ?? null}
        sprintStart={activeSprint?.start_date ?? null}
        sprintEnd={activeSprint?.end_date ?? null}
        onOpenChecklistItem={onOpenChecklistItem}
        onSaved={silentReload}
      />
    </div>
  );
}
