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
  CheckCircle2,
  Clock,
  Calendar,
  Ban,
  Circle,
  Flag,
  ChevronLeft,
  Eye,
  ExternalLink,
  Layers,
  Filter,
  Users,
  Diamond,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Minus,
  X,
  LayoutGrid,
  Settings2,
  Inbox,
  UserPlus,
  Split,
  SendHorizontal,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { sprintAPI, checklistAPI, taskAPI, jiraAPI } from "../utils/api";
import {
  resolveBoardFeatures,
  type BoardFeatures,
} from "../hooks/useBoardFeatures";
import type { JiraStatus, JiraMeta, JiraBlockStatusEntry } from "../utils/api";
import type {
  SprintBoard as SprintBoardData,
  SprintColumn,
  SprintInfo,
  SprintItemCard,
  SprintChecklistLine,
  SprintJiraTask,
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
import {
  jiraIssueUrl,
  jiraIssueTypeMark,
  jiraPriorityMark,
} from "../utils/jira";
import { MotionModal } from "./ui/MotionModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SprintSegmentBar } from "./SprintSegmentBar";
import { SprintSplitModal } from "./SprintSplitModal";
import { SprintMemberGanttModal } from "./SprintMemberGanttModal";
import { MilestoneConsoleModal } from "./MilestoneConsoleModal";
import { JiraOnboardingGuide } from "./JiraOnboardingGuide";
import { JiraScopeModal } from "./JiraScopeModal";
import { JiraSettingsPanel } from "./JiraSettingsPanel";
import { JiraSyncIndicator } from "./JiraSyncIndicator";
import { JiraAutofixDock } from "./JiraAutofixDock";
import type { FilterOptions } from "./FilterModal";

interface SprintBoardProps {
  boardId: string;
  /**
   * start_date/end_date는 분할(스프린트 나누기)의 전체 범위다 — 마일스톤 기간이 곧
   * 스프린트들의 합이라, 없으면 나눌 대상이 없어 분할 모달이 안내만 띄운다.
   */
  milestones: {
    id: string;
    title: string;
    progress_percentage?: number;
    start_date?: string;
    end_date?: string;
  }[];
  canEdit: boolean;
  isAdminOrOwner: boolean;
  /** 지정 시 이 마일스톤으로 고정(칸반 탭 연동). 미지정이면 자체 드롭다운으로 선택 */
  milestoneId?: string;
  /** 좌측 트리에서 체크리스트 행 클릭 → 태스크 모달(+ 해당 항목 하이라이트) */
  onOpenChecklistItem?: (taskId: string, checklistItemId?: string) => void;
  /** 좌측 트리 피쳐 카드 헤더의 "열기" 버튼 → 피쳐 상세 모달 */
  onOpenFeature?: (featureId: string) => void;
  /** 좌측 업무 리스트 헤더 "+" → 새 피쳐 생성(제목만). 반환된 피쳐는 곧바로 상세 모달로 이어진다. */
  onCreateFeature?: (data: { title: string }) => Promise<{ id: string } | null>;
  /** 칸반 탭 필터바 전체(담당자·피쳐·라벨·상태·검색). 스프린트/JIRA 화면 공용 적용 */
  filterOptions?: FilterOptions;
  /**
   * JIRA 화면으로 렌더한다. 스프린트 안의 그룹 기준(Feature/구성원)이 아니라
   * "스프린트 | 블록 보드 | JIRA" 형제 화면 선택의 결과 — 부모(KanbanView)가 켠다.
   * 스코프(보드 전체)·컬럼 축(진행 단계)·드롭 결과(외부 시스템 쓰기)가 스프린트와 달라
   * 그룹 기준 토글에 섞이지 않는다.
   */
  jiraView?: boolean;
  /** 새로 유입된 JIRA 이슈 수 — 부모의 JIRA 화면 버튼 뱃지용(집계 근거가 이 컴포넌트에만 있다) */
  onJiraFreshChange?: (fresh: number) => void;
  /** 라벨 필터 판정용 — feature_id → 태그 id 배열. SprintItemCard/JiraTask에 태그가 없어 부모가 주입 */
  featureTagsMap?: Record<string, string[]>;
  /** 라벨 필터 판정용 — task_id → 태그 id 배열. */
  taskTagsMap?: Record<string, string[]>;
  /** 구성원 컬럼 정렬 기준 — 보드 멤버 관리(직군 관리) 순서의 userId 배열. 미지정 시 카드 수 내림차순 */
  memberOrder?: string[];
  /**
   * userId → 멤버 지정 색(board_members.assignee_color). 미지정 멤버는 null.
   * 없으면 이름 해시 폴백이라 같은 사람이 칸반/모달과 다른 색으로 보인다 — 반드시 주입할 것.
   */
  memberColorMap?: Record<string, string | null>;
  /**
   * 보드 화면 복잡도 — 레벨(시간 묶음 깊이)과 직교 옵션.
   * 미지정이면 전부 켜진 것으로 본다(useBoardFeatures의 폴백과 같은 이유).
   * 설계: docs/Design/level-model.html
   */
  features?: BoardFeatures;
  /**
   * 구성원 전환이 꺼져 있을 때 그 자리에 세울 유령 슬롯.
   * 유령 목록 계산(동시 2개 제한)이 페이지에 있어 노드를 통째로 주입받는다 —
   * 이 컴포넌트가 유령 정책을 알 필요는 없다.
   */
  memberGhost?: React.ReactNode;
  /**
   * 리뷰 컬럼이 꺼져 있을 때 그 자리에 세울 유령 컬럼.
   * 컬럼 줄은 `overflow-x-auto`가 y축까지 잘라내 팝오버가 못 뜨므로 인라인 변형을 받는다.
   */
  reviewGhost?: React.ReactNode;
}

/**
 * Feature ▸ Task 소스 트리 노드. 담기 단위는 <b>태스크</b>다 — 태스크 행마다 낱개로
 * 담고 빼며, 피쳐는 태스크를 묶어 보여주는 그룹일 뿐이다. 태스크가 0개인 피쳐도
 * 노드가 된다(태스크를 추가해야 담을 수 있다 — 보드 컬럼은 담긴 태스크가 있어야 선다).
 */
interface TreeFeature {
  featureId: string;
  featureTitle: string;
  featureColor: string | null;
  featureCreatedAt: string | null; // Feature 생성 순서 정렬 키
  tasks: SprintItemCard[]; // 카드 1건 = 태스크 1건
  total: number; // 태스크 수
  taken: number; // 스프린트에 담긴 태스크 수
  completed: number; // Done 컬럼에 도달한 태스크 수
  unitDone: number; // 완료 체크리스트 줄 수(게이지 분자)
  unitTotal: number; // 전체 체크리스트 줄 수(게이지 분모)
  inSprint: boolean; // 담긴 태스크가 1개 이상인가 (taken > 0)
}

/**
 * 진척 단위 = 체크리스트 한 줄. 스프린트의 모든 게이지·%는 "태스크 몇 개 끝냈나"가 아니라
 * "그 안의 체크리스트가 몇 줄 끝났나"로 잰다 — 태스크 단위로 세면 28줄짜리와 1줄짜리가
 * 같은 무게가 되어 실제 진척이 게이지에 드러나지 않는다.
 *  · 체크리스트가 없는 태스크는 1줄로 환산한다(태스크 자체가 하나의 할 일).
 *  · Done(END) 도달 태스크는 남은 줄과 무관하게 전부 완료로 센다 — 그래야 100%에 닿는다.
 *  · lines를 넘기면 그 줄만 센다(구성원 컬럼처럼 "내 몫"만 재는 스코프용).
 */
function progressUnits(
  it: SprintItemCard,
  isDone: boolean,
  lines?: SprintChecklistLine[],
): { done: number; total: number } {
  const scoped = lines ?? it.checklist_items;
  const total = scoped ? scoped.length : (it.checklist_total ?? 0);
  if (total <= 0) return { done: isDone ? 1 : 0, total: 1 };
  if (isDone) return { done: total, total };
  const done = scoped
    ? scoped.filter((l) => l.completed).length
    : Math.min(it.checklist_done ?? 0, total);
  return { done, total };
}

/**
 * "지금 보고 있는 버킷에 담겼는가" — 담김 집계·행 액션·컬럼 편입이 모두 이 판정 하나를 본다.
 * 스프린트는 종료되는 대상이 아니라 태스크를 담는 그릇이라, 담김 여부는 귀속 버킷 id
 * 하나로 끝난다(미배정이면 sprint_id가 null). 컬럼에는 전 버킷의 카드가 함께 내려오므로
 * "어느 버킷을 보고 있나"를 빼면 남의 스프린트 카드까지 담김으로 세게 된다.
 */
function takenInSprint(it: SprintItemCard, sprintId: string | null): boolean {
  return !!sprintId && (it.sprint_id ?? null) === sprintId;
}

/**
 * 체크리스트 줄의 귀속 판정 — 구성원 컬럼 라우팅(keysOf)과 같은 규칙.
 * 외주 줄은 관리 담당(manager)의 몫으로 센다. __none__은 담당이 아무도 없는 줄.
 * 진척 집계·카드 스코프·보임 필터가 모두 이 함수 하나를 보게 해 규칙이 갈라지지 않게 한다.
 */
function lineOwnedBy(line: SprintChecklistLine, memberId: string): boolean {
  return memberId === "__none__"
    ? !line.assignee && !line.contractor?.manager_user_id
    : line.assignee?.id === memberId ||
        line.contractor?.manager_user_id === memberId;
}

/**
 * 구성원 뷰 카드 완료 판정 — "그 사람 몫이 전부 끝났나".
 * 같은 태스크가 여러 컬럼에 서므로 완료 여부도 컬럼 주인마다 다르다.
 * 판정 근거를 컬럼 진척(progressUnits)과 같은 스코프로 맞춰, 헤더 숫자와 필터 결과가 어긋나지 않게 한다.
 */
function memberCardDone(
  it: SprintItemCard,
  isDone: boolean,
  memberId: string,
): boolean {
  const my = (it.checklist_items ?? []).filter((l) => lineOwnedBy(l, memberId));
  const u = progressUnits(it, isDone, my.length > 0 ? my : undefined);
  return u.total > 0 && u.done >= u.total;
}

const DRAG_ITEM = "application/bridge-sprint-item";
const DRAG_SOURCE = "application/bridge-sprint-source";
/** 보드 그룹 기준(Feature ↔ 구성원) 선택 저장 키(새로고침해도 유지) */
const SPRINT_VIEW_KEY = "bridge:sprint-view";
/** 구성원 뷰 "보임"(완료 항목 노출) 선택 저장 키(새로고침해도 유지) */
const SPRINT_DONE_VIS_KEY = "bridge:sprint-done-visibility";
/** 좌측 업무 리스트 패널 접힘 상태 저장 키(새로고침해도 유지) */
const SPRINT_TREE_COLLAPSED_KEY = "bridge:sprint-tree:collapsed";
/** 좌측 업무 리스트 패널 폭(px) 저장 키(새로고침해도 유지) */
const SPRINT_TREE_WIDTH_KEY = "bridge:sprint-tree:width";
/** 하단 미분류 레일 접힘 상태 저장 키. 기본값은 접힘 — 평소엔 보드 세로 공간을 돌려준다. */
const SPRINT_UNCAT_COLLAPSED_KEY = "bridge:sprint-uncategorized:collapsed";
/** 우측 도크(In Review·Done) 컬럼별 펼침 상태 저장 키. 기본값은 접힘(레일). */
const SPRINT_DOCK_EXPANDED_KEY = "bridge:sprint-dock:expanded";
/** 드래그 중 접힌 도크 레일 위에 이만큼 머물면 자동으로 펼친다(ms). */
const DOCK_HOVER_EXPAND_MS = 300;
/** 업무 리스트 범위("active"/"all") 저장 키(새로고침해도 유지). */
const SPRINT_LIST_SCOPE_KEY = "bridge:sprint-list-scope";

/**
 * JIRA 흐름 게이지 세그먼트 색 — 단계가 뒤로 갈수록 액센트가 진해지고,
 * 마지막 단계(=완료)만 보조색 단색으로 세워 "끝난 몫"이 색 하나로 읽히게 한다.
 * QA 성격 컬럼은 앰버, 상태 미상(기타)은 슬레이트로 흐름 밖임을 드러낸다.
 */
function jiraFlowSegColor(
  col: { key: string; tone: string },
  index: number,
  lastKey?: string,
): string {
  if (lastKey && col.key === lastKey) return "var(--bridge-secondary)";
  if (col.key === "__unmapped__" || col.tone === "muted")
    return "rgba(148, 163, 184, 0.45)";
  if (col.tone === "review") return "#f59e0b";
  const alpha = Math.min(0.28 + index * 0.15, 0.72);
  return `rgba(99, 102, 241, ${alpha})`;
}

/**
 * 미분류 사유 — 스프린트에 담겼는데 분류 정보가 빈 카드를 하단 레일로 모으는 기준.
 *  · assignee: 담당자·외주 관리담당이 아무도 없음 → 구성원 컬럼 어디에도 서지 못한다(레일이 유일한 노출처).
 *  · feature:  피쳐 미지정 → 컬럼엔 서지만 "무엇에 속한 일인지"가 비어 있다(레일은 보조 트레이).
 * "미담김"(백로그)은 좌측 업무 리스트가 이미 맡고 있어 여기 포함하지 않는다.
 */
type UncatCause = "assignee" | "feature";
interface UncatCard {
  it: SprintItemCard;
  causes: UncatCause[];
}
/**
 * 구성원 뷰 "보임" 필터 — 완료는 카드(그 사람 몫이 전부 끝남)와 줄(체크된 항목) 두 층위에 있고,
 * 하나의 선택이 양쪽에 함께 걸린다.
 *  · all  = 전부 표시(이전 동작)
 *  · open = 진행중만 — 컬럼을 여는 이유가 "지금 뭐 남았지"라 기본값이다
 *  · done = 완료만 — 회고·보고 때 "이번 스프린트에 뭘 끝냈나"를 보는 모드
 * 진척 숫자(카드 게이지·컬럼 헤더 분모)는 이 선택과 무관하게 언제나 전체 기준을 유지한다.
 */
type DoneVisibility = "all" | "open" | "done";
const DONE_VIS_OPTIONS: { key: DoneVisibility; label: string; hint: string }[] =
  [
    { key: "all", label: "전체", hint: "완료·진행중 모두 표시" },
    {
      key: "open",
      label: "진행중",
      hint: "완료된 카드와 체크된 줄을 숨깁니다",
    },
    { key: "done", label: "완료", hint: "완료된 카드와 체크된 줄만 표시" },
  ];

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

/** D-day 긴급도 → 배지 색상. 지남/오늘=빨강, 임박(D-3이내)=앰버, 그 외=여유(틸). */
const DDAY_BADGE: Record<string, string> = {
  overdue: "bg-rose-500/15 text-rose-500",
  today: "bg-rose-500/15 text-rose-500",
  soon: "bg-amber-500/15 text-amber-500",
  normal: "bg-bridge-secondary/15 text-bridge-secondary",
  none: "",
};

// 스프린트 카드 긴급도 tier — 지연(0) → 진행 중(1) → 예정(2) → 완료·기간 미설정(3).
// renderCard의 상태 파생(overdue/inProgress/upcoming)과 동일 규칙을 정렬용으로 재사용한다.
function sprintCardTier(it: SprintItemCard, isDone: boolean): number {
  if (isDone) return 3;
  const dday = it.due_date ? getDDay(it.due_date) : null;
  if (dday?.urgency === "overdue") return 0; // 지연 — 종료일이 오늘보다 이전
  const startDday = it.start_date ? getDDay(it.start_date) : null;
  if (startDday && startDday.diff > 0) return 2; // 예정 — 아직 시작 전
  if (startDday || dday) return 1; // 진행 중 — 기간 안(시작 지남·마감 안 지남)
  return 3; // 날짜 정보 없음 → 맨 아래
}

// 같은 tier 안 2차 정렬 키 — 마감일(없으면 시작일)이 빠를수록 위로.
// getDDay(...).diff: 지연은 음수(더 지날수록 작음=위) · 예정은 양수(가까울수록 작음=위).
function sprintCardUrgencyKey(it: SprintItemCard): number {
  if (it.due_date) return getDDay(it.due_date).diff;
  if (it.start_date) return getDDay(it.start_date).diff;
  return Number.POSITIVE_INFINITY; // 날짜 없는 카드는 tier 내 맨 뒤
}

export function SprintBoard({
  boardId,
  milestones,
  canEdit,
  isAdminOrOwner,
  milestoneId: controlledMilestoneId,
  onOpenChecklistItem,
  onOpenFeature,
  onCreateFeature,
  filterOptions,
  jiraView = false,
  onJiraFreshChange,
  featureTagsMap = {},
  taskTagsMap = {},
  memberOrder,
  memberColorMap,
  features: boardFeatures,
  memberGhost,
  reviewGhost,
}: SprintBoardProps) {
  // 미지정 폴백 = 전부 켬. 값을 모를 때 화면이 줄어드는 쪽이 더 나쁘다.
  const uiFeatures = boardFeatures ?? resolveBoardFeatures(null);
  /** 담당자 아바타 색 — 지정 색(assignee_color) 우선, 없으면 이름 해시 폴백. */
  const assigneeHex = (assignee: { id?: string; name: string }) =>
    getAssigneeHex(
      assignee.name,
      assignee.id ? memberColorMap?.[assignee.id] : undefined,
    );
  const controlled = !!controlledMilestoneId;
  const [internalMid, setInternalMid] = useState<string>(
    controlledMilestoneId ?? milestones[0]?.id ?? "",
  );
  const milestoneId = controlledMilestoneId ?? internalMid;
  const milestone = milestones.find((m) => m.id === milestoneId) ?? null;
  const [board, setBoard] = useState<SprintBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 업무 리스트: 피쳐 카드의 태스크 목록 펼침 집합. 기본은 접힘 —
  // 담기 단위가 태스크라 펼치면 행마다 담기/빼기가 붙는다.
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(
    new Set(),
  );
  // 인라인 태스크 생성 입력값 — 키는 "list:{featureId}"(업무 리스트, 백로그로 생성) /
  // "col:{featureId}"(피쳐 컬럼, 생성 즉시 담김). 피쳐마다 입력이 따로 살아 연속 입력이 된다.
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>(
    {},
  );
  // 지금 생성 요청이 나가 있는 입력 키(스피너 표시용). null이면 없음.
  const [creatingTaskKey, setCreatingTaskKey] = useState<string | null>(null);
  // 입력이 열려 있는 추가 행 키 — 평소엔 고스트 행("＋ 태스크 추가")만 두고,
  // 클릭한 자리 하나만 입력으로 펼친다(카드마다 입력 박스가 상주하면 세로 소음이다).
  const [activeAddKey, setActiveAddKey] = useState<string | null>(null);
  // 업무 리스트 범위 — "active": 미배정 + 선택한 스프린트(기본), "all": 다른 스프린트에
  // 담긴 태스크까지. 다른 버킷의 일은 평소엔 소음이고, 옮겨 담을 때만 궁금하다.
  const [listScope, setListScope] = useState<"active" | "all">(() => {
    try {
      return localStorage.getItem(SPRINT_LIST_SCOPE_KEY) === "all"
        ? "all"
        : "active";
    } catch {
      return "active";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_LIST_SCOPE_KEY, listScope);
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [listScope]);
  // 업무 리스트: 피쳐 카드 안 "완료 태스크" 펼침 집합. 남은 일이 리스트의 주인공이라
  // 완료 행은 기본 접히고, "완료 N개 보기"로만 드러난다.
  const [expandedDoneTasks, setExpandedDoneTasks] = useState<Set<string>>(
    new Set(),
  );
  // 카드 안 체크리스트 펼침 집합. 키는 "스코프:카드id" —
  // 구성원 뷰는 같은 태스크가 여러 컬럼에 서기 때문에 컬럼 주인별로 따로 기억한다.
  // (태스크 모달로 나가지 않고 카드 자리에서 전체 항목을 보고 체크하기 위한 상태)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  // 업무 리스트 헤더 "+" → 인라인 새 피쳐 입력. 제목만 받고 생성 후 상세 모달로 이어 작성한다.
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [creatingFeature, setCreatingFeature] = useState(false);
  // Feature 필터 — 상단 요약 스트립 칩 선택 집합. 비어 있으면 전체 표시.
  // Feature는 스프린트 상위 개념이라 타임라인 위에 두고, 선택 시 아래 보드 컬럼(Feature/구성원/JIRA)을 좁힌다.
  const [featureFilter, setFeatureFilter] = useState<Set<string>>(new Set());
  // 스프린트(마일스톤) 전환 시 필터 초기화 — 다른 스프린트로 넘어가며 빈 보드가 되는 혼란 방지.
  useEffect(() => {
    setFeatureFilter(new Set());
  }, [milestoneId]);
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

  // 지금 보고 있는 버킷. 기본값은 오늘이 속한 스프린트(current_sprint)지만, 사용자가
  // 고른 뒤엔 보드를 재조회해도 그 선택을 유지한다 — 담기 한 번에 화면이 튀면 안 된다.
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  // 분할 조정 모달 (관리자 전용)
  const [splitOpen, setSplitOpen] = useState(false);

  // ── 하단 미분류 레일 ──
  // 접힘 상태는 localStorage에서 복원(기본 = 접힘). 접혀 있어도 헤더에 사유별 건수를 남겨
  // "접힘 = 문제 없음"으로 오해되지 않게 한다.
  const [uncatCollapsed, setUncatCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SPRINT_UNCAT_COLLAPSED_KEY) !== "false";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_UNCAT_COLLAPSED_KEY, String(uncatCollapsed));
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [uncatCollapsed]);
  const [uncatFilter, setUncatFilter] = useState<"all" | UncatCause>("all");
  // 피쳐 지정 드롭다운을 연 레일 카드 id(null이면 닫힘)
  const [featurePickerFor, setFeaturePickerFor] = useState<string | null>(null);
  // 레일에서 시작된 드래그 — 구성원 컬럼 드롭을 "컬럼 이동"이 아니라 "담당 배정"으로 갈라내는 표식.
  // 렌더에 관여하지 않아(하이라이트는 draggingSource가 담당) state 대신 ref로 둔다.
  const uncatDragRef = useRef<SprintItemCard | null>(null);

  // ── 우측 도크 (In Review·Done 고정 컬럼) ──
  // MIDDLE·END 컬럼은 가로 스크롤 컨테이너 밖 우측 도크에 상주한다 — Feature 컬럼이
  // 아무리 많아도 화면 밖으로 밀려나지 않는다. 평소엔 좁은 레일로 접혀 있고(수량·분포는
  // 레일만으로도 읽힌다), 클릭 또는 드래그 호버로 펼친다. 컬럼 id별 펼침 상태를 저장.
  const [dockExpanded, setDockExpanded] = useState<Record<string, boolean>>(
    () => {
      try {
        const parsed = JSON.parse(
          localStorage.getItem(SPRINT_DOCK_EXPANDED_KEY) ?? "null",
        ) as unknown;
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, boolean>)
          : {};
      } catch {
        return {};
      }
    },
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        SPRINT_DOCK_EXPANDED_KEY,
        JSON.stringify(dockExpanded),
      );
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [dockExpanded]);
  // 드래그 중 접힌 레일 위에 머물면 자동 펼침 — 타이머는 렌더와 무관해 ref로 둔다.
  const dockHoverTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const clearDockHoverTimer = (colId: string) => {
    const t = dockHoverTimer.current[colId];
    if (t) {
      clearTimeout(t);
      delete dockHoverTimer.current[colId];
    }
  };
  useEffect(
    () => () => {
      for (const t of Object.values(dockHoverTimer.current)) clearTimeout(t);
    },
    [],
  );

  // 구성원 간트 모달 — 구성원 컬럼 헤더 클릭 시 해당 구성원 id. null이면 닫힘.
  const [ganttMemberId, setGanttMemberId] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);

  // 진행 컬럼 그룹 기준: Feature별 컬럼(기본) ↔ 담당자별 컬럼.
  // In Review·Done 고정 컬럼(우측 도크)은 Feature 뷰에서만 보인다 — 구성원 뷰는
  // "지금 누가 뭘 하나"에 집중하는 화면이라 숨긴다. 카드/데이터는 두 뷰에서 변하지 않고,
  // 구성원 뷰에서도 카드 액션(리뷰/완료)으로 해당 컬럼에 보낼 수 있다.
  // (순수 클라이언트 표시 전환 — 서버/드래그 상태는 두 뷰가 동일하게 공유)
  // JIRA는 여기 들어오지 않는다 — 화면 자체가 바뀌는 물건이라 부모의 화면 선택(jiraView)이 정한다.
  const [groupPref, setGroupPref] = useState<"feature" | "member">(() => {
    try {
      // 레거시: 예전엔 "jira"도 이 키에 저장됐다. 화면 선택으로 옮겨갔으니 Feature로 되돌린다.
      return localStorage.getItem(SPRINT_VIEW_KEY) === "member"
        ? "member"
        : "feature";
    } catch {
      return "feature";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_VIEW_KEY, groupPref);
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [groupPref]);
  // 아래 렌더/집계는 모두 이 값을 읽는다 — JIRA 화면이면 그룹 기준을 덮어쓴다.
  // 구성원 옵션이 꺼져 있으면 저장된 선택(localStorage)이 member여도 feature로 되돌린다 —
  // 전환 버튼이 없는데 구성원 컬럼에 갇히면 빠져나올 길이 없다.
  const groupBy: "feature" | "member" | "jira" = jiraView
    ? "jira"
    : groupPref === "member" && !uiFeatures.has("members")
      ? "feature"
      : groupPref;

  // 구성원 뷰 보임 필터. 기본은 "진행중" — 이 뷰를 여는 이유가 "이 사람 지금 뭐 남았지"라서다.
  // 숨긴 만큼은 컬럼 하단에 건수로 고지해, 카드가 조용히 사라진 것처럼 보이지 않게 한다.
  const [doneVis, setDoneVis] = useState<DoneVisibility>(() => {
    try {
      const saved = localStorage.getItem(SPRINT_DONE_VIS_KEY);
      if (saved === "all" || saved === "done") return saved;
      return "open";
    } catch {
      return "open";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_DONE_VIS_KEY, doneVis);
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [doneVis]);
  // 보임 필터 드롭다운 열림 상태 — 항목 선택 즉시 닫기 위해 제어형으로 쓴다.
  const [doneVisOpen, setDoneVisOpen] = useState(false);
  // 원라인 바의 ⋯ 메뉴 — 분할 조정·미완료 보내기·JIRA 연결 등 저빈도 액션을 담는다
  const [moreOpen, setMoreOpen] = useState(false);

  // ── JIRA 뷰: 연동 상태(탭 노출 판정) + 메타(상태명) ──
  // status는 block_status_map(블록→JIRA상태) 제공, meta는 상태 id→name 제공.
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [jiraMeta, setJiraMeta] = useState<JiraMeta | null>(null);
  const [jiraMetaLoading, setJiraMetaLoading] = useState(false);
  // 스프린트 보드에서 JIRA 연결/해제/미러보드 선택을 직접 하는 관리 모달 (설정 패널 재사용)
  const [showJiraModal, setShowJiraModal] = useState(false);
  // 마일스톤 JIRA 스코프(JQL) 설정 모달 — 이 마일스톤의 JIRA 뷰가 비출 범위를 정한다
  const [showScopeModal, setShowScopeModal] = useState(false);
  const jiraConnected = !!jiraStatus?.connected;
  const jiraMirrorReady = !!jiraStatus?.mirror_ready;
  // pre-block: 드래그 중인 카드에서 전환 가능한 JIRA 상태 id 집합(null=아직 로딩/미확인 → 낙관적 허용)
  const [jiraDragTaskId, setJiraDragTaskId] = useState<string | null>(null);
  const [jiraDragAllowed, setJiraDragAllowed] = useState<Set<string> | null>(
    null,
  );
  // silentReload는 아래에서 정의되므로 ref로 우회 참조한다(확인 처리 후 무음 재조회용).
  const silentReloadRef = useRef<(() => Promise<void>) | null>(null);

  // ── JIRA 신규 이슈 판정 ──────────────────────────
  // 기준선 = board_members.jira_last_seen_at(서버). 이보다 나중에 보드에 링크된 이슈가 "신규"다.
  // 기준으로 jira_issue_links.created_at(= linked_at)을 쓰는 이유: JIRA 원본 생성일이 아니라
  // "우리 보드에 들어온 시각"이 사용자 체감과 맞기 때문. (last_imported_at은 재동기화마다,
  // jira_updated_at은 코멘트에도 갱신돼 둘 다 신규 판정엔 부적합)
  const serverJiraSeenAt = board?.jira_last_seen_at ?? null;
  // JIRA 탭에 머무는 동안엔 기준선을 얼려둔다 — 진입 즉시 서버 값을 따라가면 NEW 표시가
  // 눈앞에서 사라져 "뭐가 새 거였는지" 확인할 수 없다. 탭을 벗어날 때 markSeen으로 민다.
  const [jiraSeenBaseline, setJiraSeenBaseline] = useState<string | null>(null);
  useEffect(() => {
    // 탭 밖일 때만 서버 값을 추종. 단 최초 1회는 탭과 무관하게 채운다(저장된 탭이 jira인 경우).
    if (groupBy !== "jira" || jiraSeenBaseline === null) {
      setJiraSeenBaseline(serverJiraSeenAt);
    }
  }, [groupBy, serverJiraSeenAt, jiraSeenBaseline]);

  // 기준선이 없으면(멤버십 없음 등 판정 불가) 신규 0건으로 둔다 — 전체가 신규로 뜨는 것보다 안전.
  const isNewJiraLink = useCallback(
    (linkedAt: string | null | undefined) => {
      if (!jiraSeenBaseline || !linkedAt) return false;
      const base = parseUTCDate(jiraSeenBaseline);
      const at = parseUTCDate(linkedAt);
      return !!base && !!at && at.getTime() > base.getTime();
    },
    [jiraSeenBaseline],
  );

  // 화면 버튼 뱃지 집계 — jiraColumns는 groupBy==='jira'일 때만 계산되므로 별도로 보드 전체를 센다.
  const jiraBadge = useMemo(() => {
    // 연동이 끊긴(JIRA 삭제) 카드는 연동 건수에서 제외 — 카드 자체는 목록에 그대로 보인다.
    const list = (board?.jira_tasks ?? []).filter((t) => !t.jira_deleted);
    let fresh = 0;
    for (const t of list) {
      if (isNewJiraLink(t.linked_at)) fresh++;
    }
    return { total: list.length, fresh };
  }, [board, isNewJiraLink]);

  // 뱃지가 붙는 버튼은 이제 부모(화면 선택 줄)에 있다 — 집계 결과만 올려 보낸다.
  useEffect(() => {
    onJiraFreshChange?.(jiraConnected ? jiraBadge.fresh : 0);
  }, [jiraBadge.fresh, jiraConnected, onJiraFreshChange]);

  // JIRA 탭을 벗어나면 확인 처리 → 서버 기준선을 민 뒤 무음 재조회로 뱃지를 즉시 정리한다.
  const wasOnJiraRef = useRef(false);
  useEffect(() => {
    const onJira = groupBy === "jira" && jiraConnected;
    if (wasOnJiraRef.current && !onJira) {
      jiraAPI
        .markSeen(boardId)
        .then(() => silentReloadRef.current?.())
        .catch(() => {
          /* 확인 처리 실패는 조용히 무시 — 다음 이탈 때 다시 시도된다 */
        });
    }
    wasOnJiraRef.current = onJira;
  }, [groupBy, jiraConnected, boardId]);

  // 보드/마일스톤 이탈(언마운트) 시에도 확인 처리. 이 경우 재조회는 불필요.
  useEffect(
    () => () => {
      if (wasOnJiraRef.current) {
        wasOnJiraRef.current = false;
        jiraAPI.markSeen(boardId).catch(() => {});
      }
    },
    [boardId],
  );

  // 블록↔JIRA 상태 매핑이 하나라도 있는지 — 빈 상태 분기 기준은 "카드 유무"가 아니라 "매핑 유무".
  // 매핑이 됐으면 카드가 0건이어도 JIRA 상태 그대로 컬럼 골격을 보여준다.
  const hasBlockMapping = useMemo(() => {
    const map = jiraStatus?.block_status_map;
    if (!map) return false;
    return Object.entries(map).some(
      ([blockId, entry]) => blockId !== "__rejected" && !!entry.jira_status_id,
    );
  }, [jiraStatus]);

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

  // JIRA 화면 진입 시 메타(상태·블록명) 로드 (최초 1회)
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

  // (연동이 끊긴 채 JIRA 화면이 열려 있는 경우의 폴백은 화면 선택을 쥔 부모가 처리한다)

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
  useEffect(() => {
    silentReloadRef.current = silentReload;
  }, [silentReload]);

  // 실시간 동기화 — 체크리스트 완료/담당자 변경(모달 포함)·태스크·피쳐 이벤트가
  // 도착하면 디바운스 후 스프린트 보드를 재조회한다. 본인 변경도 반영된다(훅 주석 참고).
  useSprintRealtime({ boardId, onRelevantEvent: silentReload });

  useEffect(() => {
    if (!controlled && !internalMid && milestones[0]?.id) {
      setInternalMid(milestones[0].id);
    }
  }, [controlled, milestones, internalMid]);

  // 선택 버킷 동기화 — 보드가 바뀔 때마다 "고른 스프린트가 아직 있나"만 확인하고,
  // 사라졌을 때(분할 조정·마일스톤 전환)만 현재 스프린트로 되돌린다.
  useEffect(() => {
    const list = board?.sprints ?? [];
    setSelectedSprintId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev;
      return board?.current_sprint?.id ?? list[0]?.id ?? null;
    });
  }, [board]);

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

  // 관리 모달에서 연결/해제/미러보드 선택 후 스프린트의 JIRA 상태·메타·보드를 최신화.
  // 연결 상태만 바뀌면(onJiraStatusChange) 상태만, 모달을 닫을 땐 메타+보드까지 풀 리프레시.
  const refreshJiraState = useCallback(
    (full: boolean) => {
      jiraAPI
        .getStatus(boardId)
        .then((s) => {
          setJiraStatus(s);
          if (!s?.connected) setJiraMeta(null);
          else if (full) {
            jiraAPI
              .getMeta(boardId)
              .then(setJiraMeta)
              .catch(() => {});
          }
        })
        .catch(() => {});
      if (full) {
        void run(async () => sprintAPI.getSprintBoard(boardId, milestoneId));
      }
    },
    [boardId, milestoneId, run],
  );

  // JiraSettingsPanel에 넘기는 콜백은 아이덴티티가 고정돼야 한다.
  // 인라인 화살표를 넘기면 패널의 상태 재조회 이펙트가 매 리렌더마다 다시 돌아
  // getStatus → setJiraStatus → 리렌더 무한루프가 된다.
  const handleJiraStatusChange = useCallback(
    () => refreshJiraState(false),
    [refreshJiraState],
  );

  // ── 통합 필터(칸반 탭 필터바) — 담당자·피쳐·라벨·상태·검색을 스프린트 뷰 전반에 적용 ──
  // 항목(SprintItemCard) 단위 매칭 함수: Feature/구성원 뷰·백로그·게이지·트리·미리보기 공용.
  // SprintItemCard에는 태그가 없어 부모가 준 featureTagsMap/taskTagsMap로 라벨을 판정한다.
  const itemMatchesFilter = useMemo(() => {
    const fo = filterOptions;
    const kw = fo?.keyword?.trim().toLowerCase() ?? "";
    const members = fo?.members ?? [];
    const memberWantsNone = members.includes("__no_members__");
    const memberNames = new Set(members.filter((m) => m !== "__no_members__"));
    const featSel = new Set(fo?.features ?? []);
    const tagSel = new Set(fo?.tags ?? []);
    const statusSel = fo?.cardStatus ?? [];
    const endColIds = new Set(
      (board?.columns ?? []).filter((c) => c.kind === "END").map((c) => c.id),
    );
    return (it: SprintItemCard): boolean => {
      if (kw) {
        const hay =
          `${it.title} ${it.task_title ?? ""} ${it.feature_title ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (members.length > 0) {
        // 외주 카드는 관리 담당(manager) 이름으로 매칭 — 컬럼 라우팅과 일관.
        const name = it.assignee?.name ?? it.contractor?.manager_name;
        const ok = name ? memberNames.has(name) : memberWantsNone;
        if (!ok) return false;
      }
      if (featSel.size > 0 && !featSel.has(it.feature_id ?? "__none__"))
        return false;
      if (tagSel.size > 0) {
        const fTags = it.feature_id ? featureTagsMap[it.feature_id] : undefined;
        const tTags = it.task_id ? taskTagsMap[it.task_id] : undefined;
        const hit =
          (fTags?.some((t) => tagSel.has(t)) ?? false) ||
          (tTags?.some((t) => tagSel.has(t)) ?? false);
        if (!hit) return false;
      }
      if (statusSel.length > 0) {
        const isDone =
          it.completed ||
          (!!it.sprint_column_id && endColIds.has(it.sprint_column_id));
        const ok =
          (statusSel.includes("completed") && isDone) ||
          (statusSel.includes("incomplete") && !isDone);
        if (!ok) return false;
      }
      return true;
    };
  }, [filterOptions, featureTagsMap, taskTagsMap, board]);

  const hasActiveFilter = useMemo(() => {
    const fo = filterOptions;
    if (!fo) return false;
    return (
      !!fo.keyword?.trim() ||
      fo.members.length > 0 ||
      fo.features.length > 0 ||
      fo.tags.length > 0 ||
      fo.cardStatus.length > 0
    );
  }, [filterOptions]);

  /** 지금 보고 있는 버킷. 선택이 아직 없으면 오늘이 속한 스프린트로 읽는다. */
  const selectedSprint = useMemo<SprintInfo | null>(() => {
    const list = board?.sprints ?? [];
    return (
      list.find((s) => s.id === selectedSprintId) ??
      board?.current_sprint ??
      list[0] ??
      null
    );
  }, [board, selectedSprintId]);
  /** 담김 판정의 기준 버킷 — 이게 없으면 담기 자체가 성립하지 않는다. */
  const scopeSprintId = selectedSprint?.id ?? null;

  // 보드 스코프 — 컬럼에는 전 스프린트의 카드가 함께 내려오므로 선택한 버킷만 남긴다.
  // 컬럼/좌측 트리/게이지가 모두 여기서 파생되어 스프린트 선택과 필터를 동시에 반영한다.
  const filteredBoard = useMemo<SprintBoardData | null>(() => {
    if (!board) return null;
    const inScope = (it: SprintItemCard) =>
      takenInSprint(it, scopeSprintId) &&
      (!hasActiveFilter || itemMatchesFilter(it));
    const filteredColumns = board.columns.map((c) => ({
      ...c,
      items: c.items.filter(inScope),
    }));
    // 게이지 재계산: 담긴 항목(sprint_column_id)의 체크리스트 줄 기준(progressUnits)
    const endColIds = new Set(
      board.columns.filter((c) => c.kind === "END").map((c) => c.id),
    );
    let done = 0;
    let total = 0;
    for (const c of filteredColumns) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue;
        const u = progressUnits(
          it,
          it.completed || endColIds.has(it.sprint_column_id),
        );
        done += u.done;
        total += u.total;
      }
    }
    return {
      ...board,
      backlog: hasActiveFilter
        ? board.backlog.filter(itemMatchesFilter)
        : board.backlog,
      columns: filteredColumns,
      gauge: {
        done,
        total,
        percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      },
    };
  }, [board, hasActiveFilter, itemMatchesFilter, scopeSprintId]);

  // JIRA 뷰(Task 단위) 필터 매칭 — 카드가 체크리스트가 아니라 Task(=JIRA 이슈)라 별도 판정.
  // 담당자는 태스크 담당자 중 하나라도 걸리면 통과, 상태는 체크리스트 전체 완료(done>=total) 기준.
  const taskMatchesFilter = useMemo(() => {
    const fo = filterOptions;
    const kw = fo?.keyword?.trim().toLowerCase() ?? "";
    const members = fo?.members ?? [];
    const memberWantsNone = members.includes("__no_members__");
    const memberNames = new Set(members.filter((m) => m !== "__no_members__"));
    const featSel = new Set(fo?.features ?? []);
    const tagSel = new Set(fo?.tags ?? []);
    const statusSel = fo?.cardStatus ?? [];
    return (jt: SprintJiraTask): boolean => {
      if (kw) {
        const hay = `${jt.task_title ?? ""} ${jt.jira_issue_key}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (members.length > 0) {
        const asg = jt.assignees ?? [];
        const ok =
          asg.length === 0
            ? memberWantsNone
            : asg.some((a) => memberNames.has(a.name));
        if (!ok) return false;
      }
      if (featSel.size > 0 && !featSel.has(jt.feature_id ?? "__none__"))
        return false;
      if (tagSel.size > 0) {
        const fTags = jt.feature_id ? featureTagsMap[jt.feature_id] : undefined;
        const tTags = jt.task_id ? taskTagsMap[jt.task_id] : undefined;
        const hit =
          (fTags?.some((t) => tagSel.has(t)) ?? false) ||
          (tTags?.some((t) => tagSel.has(t)) ?? false);
        if (!hit) return false;
      }
      if (statusSel.length > 0) {
        const isDone = jt.total > 0 && jt.done >= jt.total;
        const ok =
          (statusSel.includes("completed") && isDone) ||
          (statusSel.includes("incomplete") && !isDone);
        if (!ok) return false;
      }
      return true;
    };
  }, [filterOptions, featureTagsMap, taskTagsMap]);

  const takenHere = useCallback(
    (it: SprintItemCard) => takenInSprint(it, scopeSprintId),
    [scopeSprintId],
  );
  const columns = useMemo(
    () =>
      (filteredBoard?.columns ?? [])
        .slice()
        .sort((a, b) => a.position - b.position),
    [filteredBoard],
  );

  // 소스 트리: backlog + 모든 컬럼 카드를 합쳐 Feature ▸ Task로 재구성 (카드 1건 = 태스크 1건)
  const tree = useMemo<TreeFeature[]>(() => {
    if (!filteredBoard) return [];
    // 업무 리스트는 보드와 달리 마일스톤 전체가 스코프다 — 다른 버킷에 담긴 태스크도
    // 여기 서야 "옮겨 담기"가 가능하다(보이지 않는 태스크는 옮길 수도 없다).
    // 선택 버킷만 볼지는 리스트 범위(listScope) 토글이 정한다.
    const all: SprintItemCard[] = [
      ...filteredBoard.backlog,
      ...(board?.columns ?? [])
        .flatMap((c) => c.items)
        .filter((it) => !hasActiveFilter || itemMatchesFilter(it)),
    ];
    const endColIds = new Set(
      filteredBoard.columns.filter((c) => c.kind === "END").map((c) => c.id),
    );
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
          unitDone: 0,
          unitTotal: 0,
          inSprint: false,
        };
        featMap.set(fid, feat);
      }
      const isDone =
        it.completed ||
        (!!it.sprint_column_id && endColIds.has(it.sprint_column_id));
      feat.tasks.push(it);
      feat.total += 1;
      if (takenHere(it)) feat.taken += 1;
      if (it.completed) feat.completed += 1;
      // 피쳐 게이지도 체크리스트 줄 기준 — 백로그 포함 그 피쳐의 전체 할 일이 분모다.
      const u = progressUnits(it, isDone);
      feat.unitDone += u.done;
      feat.unitTotal += u.total;
    }
    // 이 마일스톤에 태스크가 없는 피쳐도 노드로 세운다 — 담기 후보(board_features)는
    // 필터가 꺼져 있을 때만(필터 중 빈 피쳐는 소음이다). 여기서 첫 태스크를 만들어야
    // 담을 수 있으므로, 리스트에서 빠지면 진입점이 사라진다.
    // 완료 상태의 빈 피쳐는 담을 일이 없으므로 후보에서 뺀다.
    if (!hasActiveFilter) {
      for (const f of board?.board_features ?? []) {
        if (featMap.has(f.id) || f.status === "COMPLETED") continue;
        featMap.set(f.id, {
          featureId: f.id,
          featureTitle: f.title,
          featureColor: f.color ?? null,
          featureCreatedAt: f.created_at ?? null,
          tasks: [],
          total: 0,
          taken: 0,
          completed: 0,
          unitDone: 0,
          unitTotal: 0,
          inSprint: false,
        });
      }
    }
    // 담김 판정 — 담기 단위가 태스크라 "담긴 태스크가 있는가"가 전부다.
    for (const feat of featMap.values()) {
      feat.inSprint = feat.taken > 0;
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
  }, [filteredBoard, board, hasActiveFilter, itemMatchesFilter, takenHere]);

  // 좌측 리스트 섹션 — 담긴 태스크가 있는 피쳐는 "이번 스프린트", 없으면 "백로그"로 나뉜다.
  // 부분 담김 피쳐는 이번 스프린트 섹션에 서되, 안 담긴 행에 담기 버튼이 남는다.
  // 섹션 안 정렬: 진행 중 피쳐 → 완료(100%) 피쳐 → 빈 피쳐(태스크 0).
  // 남은 일이 주인공이라 완료·빈 카드는 뒤로 물러난다(같은 급 안에선 생성 순서 유지).
  const splitBySection = useCallback((feats: TreeFeature[]) => {
    const rankOf = (f: TreeFeature) =>
      f.total === 0 ? 2 : f.completed === f.total ? 1 : 0;
    return feats
      .map((feat, idx) => ({ feat, idx }))
      .sort((a, b) => {
        const ra = rankOf(a.feat);
        const rb = rankOf(b.feat);
        if (ra !== rb) return ra - rb;
        return a.idx - b.idx;
      })
      .map(({ feat }) => feat);
  }, []);
  const inSprintTree = useMemo(
    () => splitBySection(tree.filter((f) => f.inSprint)),
    [tree, splitBySection],
  );
  const backlogTree = useMemo(
    () => splitBySection(tree.filter((f) => !f.inSprint)),
    [tree, splitBySection],
  );

  const toggleFeature = (fid: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };
  // 피쳐 카드 안 완료 태스크 접기/펼치기.
  const toggleDoneTasks = (fid: string) => {
    setExpandedDoneTasks((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };
  // 카드 체크리스트 펼치기/접기.
  const toggleCardExpand = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 새 피쳐 생성: 제목만으로 만들고(색상은 서버에서 랜덤 자동), 곧바로 상세 모달을 연다.
  // 신규 피쳐는 체크리스트가 0개라 이 패널(체크리스트 항목 기반)엔 나타나지 않으므로,
  // 상세 모달로 이어 태스크/체크리스트를 채우도록 유도한다.
  const submitNewFeature = async () => {
    const title = newFeatureTitle.trim();
    if (!title || creatingFeature || !onCreateFeature) return;
    setCreatingFeature(true);
    try {
      const created = await onCreateFeature({ title });
      setNewFeatureTitle("");
      setAddingFeature(false);
      if (created?.id) onOpenFeature?.(created.id);
    } catch (e) {
      toast.error(errMessage(e, "피쳐 생성에 실패했어요"));
    } finally {
      setCreatingFeature(false);
    }
  };

  // 담긴 항목의 소속 컬럼 조회(칩 표시용)
  const columnById = useMemo(() => {
    const m = new Map<string, SprintColumn>();
    for (const c of columns) m.set(c.id, c);
    return m;
  }, [columns]);

  // 스프린트 카드 정렬 — 지연·진행 중을 위로, 예정·미설정을 아래로(tier), tier 안은 마감 임박 순.
  // Feature 뷰 소그룹·구성원 뷰 컬럼에 공통 적용. 동일 tier·키는 원래 순서를 유지(안정 정렬).
  const sprintUrgencyCmp = useCallback(
    (a: SprintItemCard, b: SprintItemCard) => {
      const doneA =
        a.completed ||
        (a.sprint_column_id
          ? columnById.get(a.sprint_column_id)?.kind === "END"
          : false);
      const doneB =
        b.completed ||
        (b.sprint_column_id
          ? columnById.get(b.sprint_column_id)?.kind === "END"
          : false);
      const ta = sprintCardTier(a, doneA);
      const tb = sprintCardTier(b, doneB);
      if (ta !== tb) return ta - tb;
      return sprintCardUrgencyKey(a) - sprintCardUrgencyKey(b);
    },
    [columnById],
  );

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

  // 우측 도크에 상주하는 고정 컬럼(In Review·Done). 리뷰 옵션이 꺼진 채 비어 있는
  // MIDDLE은 스크롤 영역의 유령 컬럼(reviewGhost)이 자리를 맡으므로 도크에서 뺀다.
  const dockColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.kind === "END" ||
          (c.kind === "MIDDLE" &&
            (uiFeatures.has("review") || c.items.length > 0)),
      ),
    [columns, uiFeatures],
  );

  // 스프린트에 담긴 각 Feature = 하나의 컬럼. 카드는 태스크 1건이라 소그룹 없이 바로 나열된다.
  // 컬럼 존재 조건: START(Sprint) 단계에 남은 태스크가 1개 이상 →
  //   In Review·Done으로 옮겨간 태스크는 각자의 컬럼에서 보이므로 여기서 빠진다.
  const featureColumns = useMemo(() => {
    if (!startColumn) return [];
    const result: {
      featureId: string;
      featureTitle: string;
      featureColor: string | null;
      items: SprintItemCard[]; // START 단계에 남은 태스크 카드
      doneTotal: number; // 담긴 태스크의 완료 체크리스트 줄 수
      total: number; // 담긴 태스크의 전체 체크리스트 줄 수
    }[] = [];
    for (const feat of tree) {
      const taken = feat.tasks.filter(takenHere);
      if (taken.length === 0) continue;

      // 컬럼 헤더 진척도 체크리스트 줄 기준(progressUnits)
      let doneTotal = 0;
      let unitTotal = 0;
      for (const it of taken) {
        const kind = it.sprint_column_id
          ? columnById.get(it.sprint_column_id)?.kind
          : undefined;
        const u = progressUnits(it, it.completed || kind === "END");
        doneTotal += u.done;
        unitTotal += u.total;
      }
      const startItems = taken
        .filter((it) => it.sprint_column_id === startColumn.id)
        .sort(sprintUrgencyCmp);
      // START에 남은 게 없으면(전부 리뷰·Done으로 이동) Feature 컬럼 숨김
      if (startItems.length === 0) continue;
      result.push({
        featureId: feat.featureId,
        featureTitle: feat.featureTitle,
        featureColor: feat.featureColor,
        items: startItems,
        doneTotal,
        total: unitTotal,
      });
    }
    return result;
  }, [tree, startColumn, columnById, sprintUrgencyCmp, takenHere]);

  // Feature 요약 스트립 데이터 — 스프린트에 "담긴" 항목(sprint_column_id) 기준 Feature별 완료/전체/지연.
  // 스트립은 항상 전체 Feature를 보여줘야 하므로 featureFilter와 무관하게 tree(멤버 필터만 반영)에서 집계한다.
  // N/M은 featureColumns 헤더와 같은 스프린트 스코프라 컬럼 숫자와 일관된다.
  const featureSummaries = useMemo(() => {
    return tree
      .map((feat) => {
        let total = 0;
        let done = 0;
        let overdue = 0;
        for (const it of feat.tasks) {
          if (!takenHere(it)) continue; // 선택한 버킷에 담긴 태스크만
          const kind = columnById.get(it.sprint_column_id!)?.kind;
          const isDone = it.completed || kind === "END";
          const u = progressUnits(it, isDone); // 진척은 체크리스트 줄 기준
          total += u.total;
          done += u.done;
          // 지연은 "몇 건 밀렸나"라 태스크 단위 그대로 센다.
          if (
            !isDone &&
            it.due_date &&
            getDDay(it.due_date)?.urgency === "overdue"
          )
            overdue += 1;
        }
        return {
          featureId: feat.featureId,
          featureTitle: feat.featureTitle,
          featureColor: feat.featureColor,
          done,
          total,
          overdue,
        };
      })
      .filter((f) => f.total > 0);
  }, [tree, columnById, takenHere]);

  const toggleFeatureFilter = (fid: string) =>
    setFeatureFilter((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  const clearFeatureFilter = () => setFeatureFilter(new Set());

  // 구성원 기준 컬럼 — 위 featureColumns와 같은 소스(START 단계 카드)를 담당자로 재그룹핑.
  // Feature 뷰가 Feature를 컬럼으로 세우고 담당자를 카드 뱃지로 내렸다면, 여기선 그 반대다.
  // 진척(완료/전체)은 담당자가 담은 전체 항목(모든 컬럼) 기준으로 집계한다.
  interface MemberColumn {
    memberId: string; // assignee.id (미배정은 컬럼이 아니라 하단 미분류 레일로 간다)
    memberName: string;
    items: SprintItemCard[]; // START 단계에 남은 카드 중 보임 필터를 통과한 것
    hiddenByVis: number; // 보임 필터가 감춘 카드 수(컬럼 하단 고지용)
    doneTotal: number; // 담당자 몫 체크리스트 중 완료 줄 수
    total: number; // 담당자 몫 체크리스트 전체 줄 수
  }
  const memberColumns = useMemo<MemberColumn[]>(() => {
    if (!startColumn) return [];
    // 컬럼 라우팅 키/이름 — 내부 담당자는 그 담당자, 외주는 "관리 담당(manager)"의 컬럼으로 귀속시킨다.
    // 관리자 미지정 외주(manager_user_id 없음)는 __none__으로 폴백한다 —
    // 이 키는 컬럼이 되지 못하고 하단 미분류 레일("담당 없음")로 모인다.
    //
    // 카드가 태스크라 담당자가 여럿일 수 있다(체크리스트 담당자 합집합). 이때 카드는 관련된
    // 모든 구성원 컬럼에 나타난다 — 한 사람의 컬럼만 보면 그가 맡은 일이 빠지기 때문이다.
    const keysOf = (it: SprintItemCard): { id: string; name: string }[] => {
      const out: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      for (const a of it.assignees ?? (it.assignee ? [it.assignee] : [])) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push({ id: a.id, name: a.name });
      }
      for (const c of it.contractors ??
        (it.contractor ? [it.contractor] : [])) {
        const id = c.manager_user_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: c.manager_name ?? "미배정" });
      }
      return out.length > 0 ? out : [{ id: "__none__", name: "미배정" }];
    };
    // 담긴 태스크 전체를 담당자별 진척으로 집계
    const stat = new Map<
      string,
      { name: string; done: number; total: number }
    >();
    for (const c of columns) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue;
        if (
          featureFilter.size > 0 &&
          !featureFilter.has(it.feature_id ?? "__none__")
        )
          continue;
        const kind = columnById.get(it.sprint_column_id)?.kind;
        const isDone = it.completed || kind === "END";
        const lines = it.checklist_items ?? [];
        for (const k of keysOf(it)) {
          let s = stat.get(k.id);
          if (!s) {
            s = { name: k.name, done: 0, total: 0 };
            stat.set(k.id, s);
          }
          // 진척은 체크리스트 줄 기준. 카드가 여러 컬럼에 서므로 "그 사람 몫 줄"만 센다
          // (renderCard의 memberScope와 같은 귀속 규칙 — 외주는 관리 담당의 몫).
          const myLines = lines.filter((l) => lineOwnedBy(l, k.id));
          // 담당 줄이 없으면(줄 담당 미지정·체크리스트 없음) 태스크 1건을 그 사람 몫으로 환산
          const u = progressUnits(
            it,
            isDone,
            myLines.length > 0 ? myLines : undefined,
          );
          s.total += u.total;
          s.done += u.done;
        }
      }
    }
    // 컬럼에 노출할 카드는 START 단계 태스크뿐(순서 유지)
    const startByMember = new Map<string, SprintItemCard[]>();
    for (const it of startColumn.items) {
      if (
        featureFilter.size > 0 &&
        !featureFilter.has(it.feature_id ?? "__none__")
      )
        continue;
      for (const k of keysOf(it)) {
        const arr = startByMember.get(k.id);
        if (arr) arr.push(it);
        else startByMember.set(k.id, [it]);
      }
    }
    // START 카드가 있는 담당자만 컬럼화.
    // 미배정(__none__)은 컬럼으로 세우지 않는다 — 하단 미분류 레일이 전담한다.
    // 컬럼과 레일 양쪽에 같은 카드가 서면 중복 노출이고, 대부분의 보드에서 늘 비어 있는
    // 컬럼이 가로 폭만 차지했다.
    // 정렬 기준: memberOrder(보드 멤버 관리 순서)가 있으면 그 순서, 없으면 카드 수 내림차순.
    // memberOrder에 없는 담당자는 뒤로, 그 사이는 카드 수 내림차순으로 안정화한다.
    const orderIndex = new Map<string, number>();
    (memberOrder ?? []).forEach((uid, i) => orderIndex.set(uid, i));
    const rank = (id: string) => orderIndex.get(id) ?? Number.MAX_SAFE_INTEGER;
    const ids = Array.from(startByMember.keys())
      .filter((id) => id !== "__none__")
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return (
          (startByMember.get(b)?.length ?? 0) -
          (startByMember.get(a)?.length ?? 0)
        );
      });
    return ids.map((id) => {
      const all = (startByMember.get(id) ?? []).slice().sort(sprintUrgencyCmp);
      // 보임 필터는 "노출할 카드"만 좁힌다 — 컬럼 존재 여부(ids)와 진척(stat)은
      // 필터 이전 집합에서 이미 정해졌으므로, 전부 완료인 사람도 컬럼은 그대로 남는다.
      const items =
        doneVis === "all"
          ? all
          : all.filter((it) => {
              const kind = it.sprint_column_id
                ? columnById.get(it.sprint_column_id)?.kind
                : undefined;
              const done = memberCardDone(
                it,
                it.completed || kind === "END",
                id,
              );
              return doneVis === "done" ? done : !done;
            });
      return {
        memberId: id,
        memberName: stat.get(id)?.name ?? id,
        items,
        hiddenByVis: all.length - items.length,
        doneTotal: stat.get(id)?.done ?? 0,
        total: stat.get(id)?.total ?? 0,
      };
    });
  }, [
    startColumn,
    columns,
    columnById,
    memberOrder,
    featureFilter,
    sprintUrgencyCmp,
    doneVis,
  ]);

  // ── 미분류 레일 데이터 ──
  // 스프린트에 "담긴" 카드 중 분류 정보가 빈 것만 모은다. 완료(END·completed) 카드는
  // 더 손볼 게 없어 제외 — 레일은 지금 해결해야 할 것만 담는다.
  // 사유는 합집합이라 한 카드에 칩이 둘 붙을 수 있다.
  const uncategorized = useMemo<UncatCard[]>(() => {
    const out: UncatCard[] = [];
    const seen = new Set<string>();
    for (const c of columns) {
      if (c.kind === "END") continue;
      for (const it of c.items) {
        if (!it.sprint_column_id || it.completed) continue;
        if (
          featureFilter.size > 0 &&
          !featureFilter.has(it.feature_id ?? "__none__")
        )
          continue;
        if (seen.has(it.id)) continue;
        // 담당 판정은 구성원 컬럼 라우팅(keysOf)과 같은 규칙이어야 한다 —
        // 그래야 "컬럼에 못 서는 카드 = 레일에 있는 카드"가 정확히 일치한다.
        const hasAssignee =
          (it.assignees ?? (it.assignee ? [it.assignee] : [])).length > 0 ||
          (it.contractors ?? (it.contractor ? [it.contractor] : [])).some(
            (c2) => !!c2.manager_user_id,
          );
        const causes: UncatCause[] = [];
        if (!hasAssignee) causes.push("assignee");
        if (!it.feature_id) causes.push("feature");
        if (causes.length === 0) continue;
        seen.add(it.id);
        out.push({ it, causes });
      }
    }
    // 담당 없음이 먼저 — 이 카드들은 레일 말고는 보이는 곳이 없어 방치되면 그대로 누락된다.
    return out.sort((a, b) => {
      const ka = a.causes.includes("assignee") ? 0 : 1;
      const kb = b.causes.includes("assignee") ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return sprintUrgencyCmp(a.it, b.it);
    });
  }, [columns, featureFilter, sprintUrgencyCmp]);

  const uncatCounts = useMemo(
    () => ({
      all: uncategorized.length,
      assignee: uncategorized.filter((u) => u.causes.includes("assignee"))
        .length,
      feature: uncategorized.filter((u) => u.causes.includes("feature")).length,
    }),
    [uncategorized],
  );

  // 고른 사유가 0건이 되면(마지막 한 건을 해소했을 때 등) 칩이 사라지므로 전체로 되돌린다 —
  // 그대로 두면 "해당 항목 없음"만 남아 레일이 빈 것처럼 보인다.
  useEffect(() => {
    if (uncatFilter !== "all" && uncatCounts[uncatFilter] === 0)
      setUncatFilter("all");
  }, [uncatFilter, uncatCounts]);

  const uncatVisible = useMemo(
    () =>
      uncatFilter === "all"
        ? uncategorized
        : uncategorized.filter((u) => u.causes.includes(uncatFilter)),
    [uncategorized, uncatFilter],
  );

  // 피쳐 지정 모달이 겨냥한 레일 카드(닫혀 있으면 null)
  const featurePickerTarget = useMemo(
    () =>
      featurePickerFor
        ? (uncategorized.find((u) => u.it.id === featurePickerFor)?.it ?? null)
        : null,
    [featurePickerFor, uncategorized],
  );

  // 피쳐 지정 선택지 — 실제 피쳐만(미지정 묶음 "__none__" 제외).
  const featureChoices = useMemo(
    () =>
      tree
        .filter((f) => f.featureId !== "__none__")
        .map((f) => ({
          id: f.featureId,
          title: f.featureTitle,
          color: f.featureColor,
        })),
    [tree],
  );

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
    blockId: string | null; // 태스크의 현재 BRIDGE 블록 id (미러 배치용)
    assignees: { id: string; name: string }[];
    done: number; // 스프린트에 담긴 체크리스트 중 완료 수
    total: number; // 스프린트에 담긴 체크리스트 수
    isNew: boolean; // 마지막 확인 이후 링크된 이슈 — 카드 NEW 표시용
    isDeleted: boolean; // JIRA에서 원본 이슈가 삭제됨 — 연동 해제 표시(드래그 불가)
    issueType: string | null; // JIRA 이슈 타입 이름 (표식 해석은 utils/jira)
    priority: string | null; // JIRA 우선순위 이름 (표식 해석은 utils/jira)
    jiraUpdatedAt: string | null; // JIRA에서 마지막으로 움직인 시각
  }
  interface JiraColumnDef {
    statusId: string; // 대표 JIRA 상태 id ("__unmapped__" = 상태 미상 leftover)
    statusIds: string[]; // 이 컬럼에 묶인 JIRA 상태 id 전체 (pre-block 판정용)
    label: string; // 컬럼 이름 (JIRA 보드 컬럼명)
    draggable: boolean; // 드롭 가능한 컬럼이면 true
    targetBlockId: string | null; // 드롭 시 이동할 블록
    tone: "push" | "review" | "verified" | "muted"; // 컬럼 액센트
    cards: JiraTaskCard[];
  }
  const jiraColumns = useMemo<JiraColumnDef[]>(() => {
    if (groupBy !== "jira" || !jiraConnected || !jiraMeta) return [];
    const isMirror =
      !!jiraStatus?.mirror_ready || jiraStatus?.sync_mode === "MIRROR";
    if (!isMirror && !jiraStatus?.block_status_map) return [];

    // 카드 집계용 인덱스: 블록→상태(현재 상태 해석용)
    const statusByBlock = new Map<string, string>();
    const entryByStatus = new Map<string, JiraBlockStatusEntry>();
    if (isMirror) {
      for (const b of jiraMeta.blocks ?? []) {
        if (b.jira_status_id) statusByBlock.set(b.id, b.jira_status_id);
      }
    } else {
      const map = jiraStatus!.block_status_map as Record<
        string,
        JiraBlockStatusEntry
      >;
      for (const [blockId, entry] of Object.entries(map)) {
        if (blockId === "__rejected" || !entry.jira_status_id) continue;
        statusByBlock.set(blockId, entry.jira_status_id);
        entryByStatus.set(entry.jira_status_id, entry);
      }
    }

    // 1) 보드 전체 JIRA 연동 Task를 태스크 카드로 변환.
    //    JIRA 뷰는 스프린트 스코프가 아니라 "보드 스코프" — 스프린트에 담기지 않은 이슈도
    //    JIRA 보드처럼 그대로 비춘다(재동기화로 import된 카드가 바로 보이도록). done/total은
    //    스프린트 담김 수가 아니라 그 Task의 체크리스트 전체 진행도(백엔드 집계).
    // 필터바(담당자·피쳐·라벨·상태·검색)는 아이템이 아니라 Task 단위로 적용.
    const taskMap = new Map<string, JiraTaskCard>();
    for (const jt of board?.jira_tasks ?? []) {
      if (!jt.jira_issue_key || !jt.task_id) continue;
      if (
        featureFilter.size > 0 &&
        !featureFilter.has(jt.feature_id ?? "__none__")
      )
        continue;
      if (!taskMatchesFilter(jt)) continue;
      const resolved =
        (jt.block_id ? statusByBlock.get(jt.block_id) : undefined) ??
        jt.jira_status_id ??
        null;
      taskMap.set(jt.task_id, {
        taskId: jt.task_id,
        taskTitle: jt.task_title ?? "Task",
        jiraKey: jt.jira_issue_key,
        qaState: jt.qa_state ?? null,
        statusId: resolved,
        blockId: jt.block_id ?? null,
        assignees: (jt.assignees ?? []).map((a) => ({
          id: a.id,
          name: a.name,
        })),
        done: jt.done,
        total: jt.total,
        isNew: isNewJiraLink(jt.linked_at),
        isDeleted: !!jt.jira_deleted,
        issueType: jt.jira_issue_type ?? null,
        priority: jt.jira_priority ?? null,
        jiraUpdatedAt: jt.jira_updated_at ?? null,
      });
    }

    let cols: JiraColumnDef[];
    let placeCard: (card: JiraTaskCard) => JiraColumnDef | undefined;

    if (isMirror) {
      // 2a) 미러: 컬럼 = 미러 블록(=JIRA 보드 컬럼), position 순. 카드 배치는 block_id로.
      const mirrorBlocks = (jiraMeta.blocks ?? []).filter(
        (b) => !!b.jira_status_id,
      );
      cols = mirrorBlocks
        .map((b) => ({
          statusId: b.jira_status_id as string,
          statusIds:
            b.jira_status_ids && b.jira_status_ids.length > 0
              ? b.jira_status_ids
              : [b.jira_status_id as string],
          label: b.name,
          draggable: true,
          targetBlockId: b.id,
          tone: "push" as const,
        }))
        .map((c) => ({ ...c, cards: [] as JiraTaskCard[] }));
      const colByBlock = new Map(cols.map((c) => [c.targetBlockId, c]));
      placeCard = (card) =>
        card.blockId ? colByBlock.get(card.blockId) : undefined;
    } else {
      // 2b) 매뉴얼(레거시): 컬럼 = JIRA 상태, push→검토중→검증완료 순. 배치는 statusId로.
      const targetBlockByStatus = new Map<string, string>();
      const map = jiraStatus!.block_status_map as Record<
        string,
        JiraBlockStatusEntry
      >;
      for (const [blockId, entry] of Object.entries(map)) {
        if (blockId === "__rejected" || !entry.jira_status_id) continue;
        if (entry.dir !== "pull")
          targetBlockByStatus.set(entry.jira_status_id, blockId);
      }
      const rankOf = (statusId: string) => {
        const e = entryByStatus.get(statusId);
        if (!e) return 3;
        if (e.dir === "pull") return e.qa === "VERIFIED" ? 2 : 1;
        return 0;
      };
      const toneOf = (statusId: string): JiraColumnDef["tone"] => {
        const e = entryByStatus.get(statusId);
        if (!e) return "muted";
        if (e.dir === "pull")
          return e.qa === "VERIFIED" ? "verified" : "review";
        return "push";
      };
      const ordered = (jiraMeta.statuses ?? [])
        .slice()
        .sort((a, b) => rankOf(a.id) - rankOf(b.id));
      cols = ordered.map((s) => ({
        statusId: s.id,
        statusIds: [s.id],
        label: s.name,
        draggable: targetBlockByStatus.has(s.id),
        targetBlockId: targetBlockByStatus.get(s.id) ?? null,
        tone: toneOf(s.id),
        cards: [],
      }));
      const colByStatus = new Map(cols.map((c) => [c.statusId, c]));
      placeCard = (card) =>
        card.statusId ? colByStatus.get(card.statusId) : undefined;
    }

    // 3) 태스크 배치. 매칭 안 되는 카드는 leftover 컬럼(무음 누락 방지)
    const leftover: JiraTaskCard[] = [];
    for (const card of taskMap.values()) {
      const col = placeCard(card);
      if (col) col.cards.push(card);
      else leftover.push(card);
    }
    if (leftover.length) {
      cols.push({
        statusId: "__unmapped__",
        statusIds: [],
        label: "기타",
        draggable: false,
        targetBlockId: null,
        tone: "muted",
        cards: leftover,
      });
    }
    return cols;
  }, [
    groupBy,
    jiraConnected,
    jiraStatus,
    jiraMeta,
    board,
    featureFilter,
    taskMatchesFilter,
    isNewJiraLink,
  ]);

  // 반려 건수 — 컬럼(상태)이 아니라 QA 플래그라 흐름 게이지 세그먼트에 섞이지 않는다.
  // 별도 칩으로만 세운다. 연동이 끊긴(JIRA 삭제) 카드는 제외.
  const jiraRejected = useMemo(
    () =>
      jiraColumns
        .flatMap((c) => c.cards)
        .filter((c) => !c.isDeleted && c.qaState === "REJECTED").length,
    [jiraColumns],
  );

  // JIRA 흐름 게이지(보드 바닥 스트립) — 컬럼(=JIRA 상태) 분포와 "마지막 단계" 도달률.
  // 헤더 게이지가 스프린트 진척(체크리스트 줄)이라 "JIRA 이슈가 어디까지 갔나"는 여기서만 읽힌다.
  // jiraColumns가 이미 필터바·Feature 칩을 적용한 결과라 컬럼 헤더 숫자와 항상 일치한다.
  const jiraFlow = useMemo(() => {
    const cols = jiraColumns.map((c) => ({
      key: c.statusId,
      label: c.label,
      tone: c.tone,
      // 연동이 끊긴(JIRA 삭제) 카드는 제외 — 끝나지 않는 게이지 방지(jiraStats와 같은 규칙)
      count: c.cards.filter((k) => !k.isDeleted).length,
    }));
    const total = cols.reduce((s, c) => s + c.count, 0);
    // 마지막 단계 = leftover("기타")를 뺀 마지막 컬럼.
    //  · 미러: 미러 블록 position 순 → 배열 끝이 JIRA 보드의 종료 컬럼
    //  · 매뉴얼: rankOf 정렬로 검증완료(VERIFIED)가 맨 뒤
    const real = cols.filter((c) => c.key !== "__unmapped__");
    const last = real.length > 0 ? real[real.length - 1] : null;
    return {
      cols,
      total,
      last,
      pct: total > 0 && last ? Math.round((last.count / total) * 100) : 0,
    };
  }, [jiraColumns]);

  // JIRA 태스크 카드 드래그 시작 — 태스크 단위 이동임을 별도 소스로 구분.
  // pre-block: 드래그 시작과 동시에 이 카드의 전환 가능 상태를 조회해 유효 컬럼만 활성화.
  const onDragStartJiraTask = (e: React.DragEvent, card: JiraTaskCard) => {
    if (!canEdit) return;
    e.dataTransfer.setData(DRAG_ITEM, card.taskId);
    e.dataTransfer.setData(DRAG_SOURCE, "jira-task");
    e.dataTransfer.effectAllowed = "move";
    setDraggingSource("sprint");
    setJiraDragTaskId(card.taskId);
    setJiraDragAllowed(null);
    jiraAPI
      .getTaskTransitions(boardId, card.taskId)
      .then((r) => {
        const allow = new Set(r.allowed_status_ids || []);
        if (r.current_status_id) allow.add(r.current_status_id);
        if (card.statusId) allow.add(card.statusId); // 현재 컬럼(제자리)은 항상 허용
        setJiraDragAllowed(allow);
      })
      .catch(() => setJiraDragAllowed(null));
  };
  const onDragEndJiraTask = () => {
    setJiraDragTaskId(null);
    setJiraDragAllowed(null);
  };
  // 이 카드가 이 컬럼으로 드롭 가능한지 (pre-block). 컬럼에 묶인 상태 중 하나라도 허용 전환이면 OK.
  // allowed 미로딩(null)이면 낙관적 허용.
  const isJiraDropAllowed = (col: JiraColumnDef) =>
    jiraDragAllowed == null ||
    col.statusIds.some((s) => jiraDragAllowed.has(s));
  // 컬럼 드롭 → 태스크 블록 이동 → 백엔드 이벤트로 JIRA 전이 자동 발동
  const onDropJiraColumn = async (e: React.DragEvent, col: JiraColumnDef) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!canEdit) return;
    const taskId = e.dataTransfer.getData(DRAG_ITEM);
    const source = e.dataTransfer.getData(DRAG_SOURCE);
    onDragEndJiraTask();
    if (!taskId || source !== "jira-task") return;
    // 미러 컬럼이 아니거나 드롭 타깃 없으면 무시
    if (!col.draggable || !col.targetBlockId) return;
    const targetBlockId = col.targetBlockId;
    const card = jiraColumns
      .flatMap((c) => c.cards)
      .find((c) => c.taskId === taskId);
    if (card?.blockId === col.targetBlockId) return; // 이미 그 컬럼
    // pre-block: JIRA가 허용하지 않는 전환이면 차단 + 안내
    if (!isJiraDropAllowed(col)) {
      toast.error("JIRA에서 허용되지 않는 이동입니다.");
      return;
    }
    await run(async () => {
      await taskAPI.moveTask(boardId, taskId, {
        target_block_id: targetBlockId,
        position: 0,
      });
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };

  // 카드 안쪽 체크리스트 한 줄 토글 — 카드 진척(3/5)만 바뀌고 컬럼은 움직이지 않는다.
  const toggleChecklistLine = (taskId: string | null, lineId: string) => {
    if (!canEdit || !taskId) return;
    void run(async () => {
      await checklistAPI.toggleItem(boardId, taskId, lineId);
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };
  // 카드/행 클릭 → 태스크 모달
  const openItem = (it: SprintItemCard) => {
    if (it.task_id) onOpenChecklistItem?.(it.task_id);
  };
  const openTask = (taskId: string) => {
    if (taskId !== "__none__") onOpenChecklistItem?.(taskId);
  };
  // 담기 — 단위는 태스크. 대상 버킷은 "지금 보고 있는 스프린트"다. 이미 다른 버킷에
  // 담긴 태스크에도 그대로 쓰여 옮겨 담기가 된다(서버가 귀속을 갈아끼운다).
  const addTaskToSprint = (taskId: string | null | undefined) => {
    if (!canEdit || !scopeSprintId || !taskId || taskId === "__none__") return;
    void run(() => sprintAPI.addTask(boardId, scopeSprintId, taskId));
  };
  // 빼기 — 그 태스크만 미배정(백로그)으로 되돌린다.
  const removeTaskFromSprint = (taskId: string | null | undefined) => {
    if (!canEdit || !scopeSprintId || !taskId || taskId === "__none__") return;
    void run(() => sprintAPI.removeTask(boardId, scopeSprintId, taskId));
  };
  // 인라인 태스크 생성 — 두 갈래가 결과만 다르다.
  //  · 업무 리스트(intoSprint=false): 백로그로 생성, 담을지는 별도 선택.
  //  · 피쳐 컬럼(intoSprint=true): 생성 즉시 addTask로 이어 그 컬럼(START)에 담긴다.
  // 성공 후 입력값만 비우고 포커스는 그대로 둬 연속 입력이 된다.
  const submitNewTask = async (
    featureId: string,
    key: string,
    intoSprint: boolean,
  ) => {
    const title = (newTaskTitles[key] ?? "").trim();
    if (!title || !canEdit || featureId === "__none__") return;
    if (intoSprint && !scopeSprintId) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setCreatingTaskKey(key);
    setError(null);
    try {
      const created = await taskAPI.createTask(boardId, featureId, {
        title,
        milestone_id: milestoneId,
      });
      if (intoSprint && scopeSprintId && created?.id) {
        setBoard(await sprintAPI.addTask(boardId, scopeSprintId, created.id));
      } else {
        setBoard(await sprintAPI.getSprintBoard(boardId, milestoneId));
      }
      setNewTaskTitles((prev) => ({ ...prev, [key]: "" }));
    } catch (e) {
      toast.error(errMessage(e, "태스크 생성에 실패했어요"));
    } finally {
      busyRef.current = false;
      setCreatingTaskKey(null);
    }
  };
  // 카드 호버 액션(리뷰·완료) — 드래그 없이 원클릭으로 목표 컬럼(In Review/Done)에 이동.
  const moveItemToColumn = (it: SprintItemCard, col: SprintColumn | null) => {
    if (!canEdit || !scopeSprintId || !col || it.sprint_column_id === col.id)
      return;
    void run(() => sprintAPI.moveToColumn(boardId, it.id, col.id));
  };

  // ── 미분류 해소 액션 ──
  // 담당 지정: v7.0부터 담당자는 태스크가 아니라 체크리스트 줄에 붙는다(taskAPI에 assignee_id 없음).
  // 따라서 "이 카드를 이 사람에게" = 담당이 비어 있는 줄 전부를 그 사람으로 채우는 것이다.
  // 이미 누군가 잡고 있는 줄은 건드리지 않는다 — 드롭 한 번이 남의 담당을 덮어쓰면 안 된다.
  const assignUncategorizedTo = async (
    it: SprintItemCard,
    memberId: string,
    memberName: string,
  ) => {
    const taskId = it.task_id ?? it.id;
    if (!canEdit || !taskId || taskId === "__none__") return;
    const targets = (it.checklist_items ?? []).filter(
      (l) => !l.assignee && !l.contractor,
    );
    if (targets.length === 0) {
      // 체크리스트가 없는 태스크는 담당을 붙일 자리가 없다 — 상세로 보내 항목부터 만들게 한다.
      toast.info(
        "담당을 붙일 체크리스트가 없어요. 상세에서 항목을 먼저 추가해 주세요.",
      );
      onOpenChecklistItem?.(taskId);
      return;
    }
    // run()은 중복 호출·실패를 삼켜서 성공 토스트와 어긋난다. 결과를 알아야 하므로 직접 돌린다.
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      for (const line of targets) {
        await checklistAPI.patchItem(boardId, taskId, line.id, {
          assignee_id: memberId,
        });
      }
      setBoard(await sprintAPI.getSprintBoard(boardId, milestoneId));
      toast.success(
        `${memberName} 담당으로 지정했어요 · 항목 ${targets.length}개`,
      );
    } catch (e) {
      toast.error(errMessage(e, "담당 지정에 실패했어요"));
    } finally {
      busyRef.current = false;
    }
  };

  // 피쳐 지정: 태스크를 통째로 다른 피쳐로 옮긴다(체크리스트는 태스크를 따라간다).
  const setCardFeature = (it: SprintItemCard, featureId: string) => {
    const taskId = it.task_id ?? it.id;
    setFeaturePickerFor(null);
    if (!canEdit || !taskId || taskId === "__none__") return;
    void run(async () => {
      await taskAPI.moveTaskToFeature(boardId, taskId, {
        target_feature_id: featureId,
      });
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
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
    uncatDragRef.current = null;
  };

  // 카드 → 업무 리스트 드롭은 더 이상 빼기가 아니다.
  // 빼기는 Task 헤더의 "빼기" 버튼(원클릭)이 유일한 주체 — 카드 드래그는 컬럼(상태)
  // 이동 전용이다. 좌측 패널은 비-드롭 대상이므로 여기선 상태만 정리한다.
  const onDropList = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverList(false);
  };

  const onDropColumn = async (e: React.DragEvent, col: SprintColumn) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!canEdit || !scopeSprintId) return;
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

  // ==================== 버킷 액션 ====================
  const gauge = filteredBoard?.gauge; // 표시용(담당자 필터 반영) — 체크리스트 줄 기준
  // 스프린트별 미완료(END 미도달) 태스크 수. 세그먼트의 "미완료 N" 칩과 "다음으로 보내기"의
  // 근거라 필터와 무관하게 원본 보드에서 센다 — 필터로 0처럼 보이면 안 되는 숫자다.
  const unfinishedBySprint = useMemo(() => {
    const endColIds = new Set(
      (board?.columns ?? []).filter((c) => c.kind === "END").map((c) => c.id),
    );
    const counts: Record<string, number> = {};
    for (const c of board?.columns ?? []) {
      for (const it of c.items) {
        if (!it.sprint_id || !it.sprint_column_id) continue;
        if (it.completed || endColIds.has(it.sprint_column_id)) continue;
        counts[it.sprint_id] = (counts[it.sprint_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [board]);
  const remainingTasks = scopeSprintId
    ? (unfinishedBySprint[scopeSprintId] ?? 0)
    : 0;

  /** 선택한 버킷 바로 다음 시퀀스의 버킷 — 미완료를 보낼 대상 */
  const nextSprint = useMemo<SprintInfo | null>(() => {
    if (!selectedSprint) return null;
    return (
      (board?.sprints ?? []).find(
        (s) => s.sequence_no === selectedSprint.sequence_no + 1,
      ) ?? null
    );
  }, [board, selectedSprint]);

  // 이월은 더 이상 자동이 아니다 — 지난 버킷의 미완료를 관리자가 한 번에 다음으로 민다.
  // (개별 태스크는 언제든 담기/빼기로 옮길 수 있어, 이건 정리용 일괄 액션이다.)
  const canPushUnfinished =
    isAdminOrOwner &&
    selectedSprint?.state === "PAST" &&
    remainingTasks > 0 &&
    !!nextSprint;

  const pushUnfinished = () => {
    if (!selectedSprint || !nextSprint) return;
    const moved = remainingTasks;
    const targetName = nextSprint.name;
    void run(async () => {
      const next = await sprintAPI.pushUnfinished(boardId, selectedSprint.id);
      toast.success(`미완료 ${moved}개를 ${targetName}(으)로 보냈어요`);
      return next;
    });
  };

  /** 분할 조정 확정 — 개수·경계·태스크 배분을 한 번에 적용하고 모달을 닫는다 */
  const submitSplit = async (payload: {
    count: number;
    boundaries: string[];
    task_distribution: "keep" | "unassign" | "by_date";
  }) => {
    await run(() => sprintAPI.splitSprints(boardId, milestoneId, payload));
    setSplitOpen(false);
  };

  // 진행 현황 4구간 분류 (KanbanBlock 진행 현황과 동일 규약).
  // 대상: 담긴 항목(sprint_column_id != null)만 — 게이지 %와 정확히 일치.
  //  · 오늘 완료: 완료 && completed_at/done_date >= 로컬 자정
  //  · 기존 완료: 완료 && 그 이전
  //  · 진행 중  : 미완료 && (MIDDLE 컬럼에 있음 || 기간이 오늘과 겹침)
  //  · 미완료   : 나머지 (START 대기 등)
  //
  // 목록·개수(buckets/counts)는 태스크 단위지만, %와 막대 길이는 체크리스트 줄 단위다.
  // 미완료 태스크 안에서 이미 끝낸 줄은 "기존 완료" 구간에 합산된다 — 태스크가 Done에
  // 닿지 않았다고 해서 그 안에서 진행한 20줄이 게이지에서 사라지면 안 되기 때문이다.
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
    // 체크리스트 줄 단위 구간(막대·%의 실제 소스)
    let uToday = 0; // 오늘 완료한 태스크의 줄
    let uEarlier = 0; // 그 이전 완료 태스크의 줄 + 미완료 태스크에서 이미 끝낸 줄
    let uProg = 0; // 진행 중 태스크의 남은 줄
    let uNot = 0; // 미착수 태스크의 남은 줄

    for (const c of cols) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue; // 담긴 항목만 게이지 스코프
        const isDone = it.completed || endColIds.has(it.sprint_column_id);
        const u = progressUnits(it, isDone);
        if (isDone) {
          if ((it.completed_at || it.done_date) && doneTs(it) >= startToday) {
            todayDone.push(it);
            uToday += u.total;
          } else {
            earlierDone.push(it);
            uEarlier += u.total;
          }
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
          uEarlier += u.done; // 미완료 태스크라도 끝낸 줄은 완료분
          if (inMidCol || dateActive) {
            inProgress.push(it);
            uProg += u.total - u.done;
          } else {
            notStarted.push(it);
            uNot += u.total - u.done;
          }
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
    const total = uToday + uEarlier + uProg + uNot; // 체크리스트 줄 총량
    const done = uToday + uEarlier;
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
      segEarlier: (uEarlier / denom) * 100,
      segToday: (uToday / denom) * 100,
      segProg: (uProg / denom) * 100,
    };
  }, [filteredBoard]);

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
  // memberScope가 있으면 구성원 뷰 카드 — 체크리스트를 그 컬럼 주인 몫으로 좁혀 보여준다.
  const renderCard = (
    it: SprintItemCard,
    readOnly = false,
    memberScope?: { id: string; name: string },
  ) => {
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
    // 예정 = 시작일이 아직 안 옴 → 기간 칩을 마감이 아니라 시작 D-day로 바꾼다.
    // "진행 중"은 기간 칩·스트라이프와 겹치는 기본 상태라 별도 배지를 두지 않는다.
    const upcoming =
      !isDoneItem && !overdue && !!startDday && startDday.diff > 0;
    // ── 기간의 출처 ─────────────────────────────────────────────────
    // 목표 모델에서 태스크는 자기 날짜를 소유하지 않는다 — 담긴 주기의 기간을 물려받는다.
    // 지금은 플래그가 없으니 "주기 기간과 같은가"로 추정한다.
    // (PR4에서 tasks.date_override가 생기면 이 추정을 그 플래그로 교체한다.)
    const day10 = (v?: string | null) => (v ? v.substring(0, 10) : null);
    const sprintFrom = day10(selectedSprint?.start_date);
    const sprintTo = day10(selectedSprint?.end_date);
    const committed = !!it.sprint_column_id;
    const sprintPeriod =
      committed && sprintFrom && sprintTo
        ? `${formatDate(sprintFrom, "M/d")} ~ ${formatDate(sprintTo, "M/d")}`
        : null;
    const hasOwnDates = !!it.start_date || !!it.due_date;
    // 레벨 1에는 상속해줄 주기가 없다 — 기간 개념 자체가 화면에 없으므로 표식도 없다.
    const dateSource: "sprint" | "override" | null =
      isDoneItem || !sprintPeriod || !uiFeatures.showTaskPeriod
        ? null
        : !hasOwnDates ||
            (day10(it.start_date) === sprintFrom &&
              day10(it.due_date) === sprintTo)
          ? "sprint"
          : "override";
    // 리뷰 = 첫 MIDDLE(기본 "In Review")로 이동. 이미 그 컬럼이거나 완료면 숨김.
    // 리뷰 옵션이 꺼져 있으면 새로 리뷰로 보낼 수 없다(이미 거기 있는 카드는 그대로 남는다).
    const showReview =
      canEdit &&
      !readOnly &&
      uiFeatures.has("review") &&
      !!firstMiddleColumn &&
      !isDoneItem &&
      it.sprint_column_id !== firstMiddleColumn.id;
    // 완료 = END(Done)로 이동. 이미 완료면 숨김.
    const showDone = canEdit && !readOnly && !!endColumn && !isDoneItem;
    // 상세 = Task 모달 열기. 미리보기 제외.
    const showDetail = !readOnly && !!it.task_id;
    // 빼기 = 이 태스크만 백로그로 복귀. 담기 단위가 태스크라 카드에서 바로 뺄 수 있다.
    const showRemove =
      canEdit && !readOnly && !!scopeSprintId && !!it.sprint_column_id;
    const showActions = showRemove || showReview || showDone || showDetail;
    // 카드 안쪽 체크리스트 — 담긴 뒤 항목이 추가돼도 여기 그대로 반영된다.
    const lines = it.checklist_items ?? [];
    // 구성원 뷰: 컬럼 주인 몫만 남긴다. 같은 태스크가 여러 컬럼에 서므로
    // 컬럼마다 보이는 줄이 달라야 "여기서 내가 할 일"이 바로 읽힌다.
    // 외주 줄은 관리 담당(manager)의 컬럼으로 귀속 — 컬럼 라우팅(keysOf) 규칙과 같다.
    const myLines = memberScope
      ? lines.filter((l) => lineOwnedBy(l, memberScope.id))
      : lines;
    // 스코프 결과가 비면(줄 담당 정보가 없는 옛 데이터 등) 전체로 폴백해 빈 카드가 되지 않게 한다.
    const scoped = !!memberScope && myLines.length > 0;
    // 펼침 키 — 구성원 뷰는 컬럼 주인별로, Feature 뷰는 카드별로 기억한다.
    const cardKey = `${memberScope?.id ?? "feat"}:${it.id}`;
    const expanded = expandedCards.has(cardKey);
    // 진척의 분모: 구성원 뷰는 "내 몫", Feature 뷰는 태스크 전체(서버 롤업).
    const baseLines = scoped ? myLines : lines;
    const cTotal = scoped
      ? myLines.length
      : (it.checklist_total ?? lines.length);
    const cDone = scoped
      ? myLines.filter((l) => l.completed).length
      : (it.checklist_done ?? 0);
    // 함께 미는 사람들 — 이 태스크의 줄 담당자 중 컬럼 주인이 아닌 사람.
    // 태스크에 담당자가 없는 설계라 카드 하나가 여러 컬럼에 서는데, 그 사실을
    // 숫자("담당 외 21개")가 아니라 얼굴로 말하게 한다. 실제 항목은 상세(↗)에서 본다.
    const coOwners = scoped
      ? (() => {
          const seen = new Map<string, { id: string; name: string }>();
          for (const l of lines) {
            if (lineOwnedBy(l, memberScope!.id)) continue;
            const a = l.assignee;
            if (a && !seen.has(a.id))
              seen.set(a.id, { id: a.id, name: a.name });
            const cm = l.contractor?.manager_user_id;
            if (cm && !seen.has(cm))
              seen.set(cm, {
                id: cm,
                name:
                  l.contractor?.manager_name ?? l.contractor?.name ?? "외주",
              });
          }
          return Array.from(seen.values());
        })()
      : [];
    // 세그먼트 게이지 — 칸 수를 항목 수(최대 12)에 맞춰 비율과 규모를 한 번에 읽게 한다.
    // 7칸짜리와 24칸짜리가 칸 굵기로 구분되고, 반올림으로 "24/25가 100%처럼" 보이는 것도 막는다.
    const segTotal = Math.min(cTotal, 12);
    let segDone = cTotal > 0 ? Math.round((cDone / cTotal) * segTotal) : 0;
    if (cDone < cTotal) segDone = Math.min(segDone, segTotal - 1);
    if (cDone > 0) segDone = Math.max(segDone, 1);
    // 보임 필터(구성원 뷰 전용) — 그리는 줄에만 건다.
    // 위에서 계산한 cTotal·cDone·게이지는 필터 이전 배열 기준이라 그대로 둔다:
    // 숨겼다고 분모가 줄면 진척률이 거짓말이 된다.
    const visibleOf = (arr: SprintChecklistLine[]) =>
      memberScope && doneVis !== "all"
        ? arr.filter((l) => (doneVis === "done" ? l.completed : !l.completed))
        : arr;
    const visibleBase = visibleOf(baseLines);
    // 미리보기 2줄 — "남은 것 하나 + 끝낸 것 하나"가 진행 상태를 가장 정확히 요약한다.
    // 한쪽만 있으면 그 종류로 채우고, 노출 순서는 원본 순서를 유지한다.
    // (보임 필터가 걸린 뒤 목록 위에서 골라야 진행중 모드에서 미리보기가 비지 않는다.)
    const previewLines = (() => {
      const picked: typeof visibleBase = [];
      const firstOpen = visibleBase.find((l) => !l.completed);
      const firstDone = visibleBase.find((l) => l.completed);
      if (firstOpen) picked.push(firstOpen);
      if (firstDone) picked.push(firstDone);
      for (const l of visibleBase) {
        if (picked.length >= 2) break;
        if (!picked.includes(l)) picked.push(l);
      }
      return picked.sort(
        (a, b) => visibleBase.indexOf(a) - visibleBase.indexOf(b),
      );
    })();
    // 실제로 그릴 줄 — 접힘이면 미리보기 2줄, 펼침이면 이 카드 스코프 전체
    // (구성원 뷰는 내 몫만. 남의 몫은 카드가 아니라 상세에서 본다).
    const shownLines = expanded ? visibleBase : previewLines;
    // 펼치기 건수는 "필터를 통과한 것" 기준 — 눌렀는데 그만큼 안 나오면 안 된다.
    const hiddenCount = visibleBase.length - previewLines.length;
    // 줄 담당 아이콘은 "누구 것인지 섞여 있을 때"만 의미가 있다.
    const showLineOwner = expanded && !scoped;
    return (
      <div
        key={it.id}
        draggable={canEdit && !readOnly}
        onDragStart={(e) => !readOnly && onDragStartItem(e, it, "sprint")}
        onDragEnd={onDragEndItem}
        // 좌측 3px 스트라이프 — 평시엔 피처 색(컬럼을 훑으면 피처 분포가 보인다),
        // 지연이면 로즈로 덮어써 배경 워시와 함께 "위험한 카드"를 먼저 눈에 걸리게 한다.
        style={{
          borderLeftWidth: 3,
          borderLeftColor: overdue
            ? "#f43f5e"
            : (it.feature_color ?? "#6366F1"),
        }}
        className={`group relative rounded-xl border border-sprint-border p-2.5 space-y-2 shadow-[0_2px_6px_-2px_rgba(0,0,0,0.45)] transition-colors ${
          overdue ? "bg-rose-500/[0.07]" : "bg-sprint-card"
        } ${
          readOnly
            ? "cursor-default"
            : `hover:border-sprint-border-hover cursor-grab ${
                overdue
                  ? "hover:bg-rose-500/[0.12]"
                  : "hover:bg-sprint-card-hover"
              }`
        }`}
      >
        {/* 호버 액션 — 리뷰/완료 원클릭 이동 + 상세 열기. 호버 시 힌트와 교체 노출. */}
        {showActions && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {showRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTaskFromSprint(it.task_id ?? it.id);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                aria-label="스프린트에서 빼기"
                title="스프린트에서 빼기 — 백로그로 돌아가요"
              >
                <Minus className="w-3 h-3" />
                빼기
              </button>
            )}
            {showReview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  moveItemToColumn(it, firstMiddleColumn);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-500 hover:bg-amber-500 hover:text-amber-950 transition-colors"
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
                className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-bold bg-bridge-secondary/15 text-bridge-secondary hover:bg-bridge-secondary hover:text-teal-950 transition-colors"
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
        {/* 메타 줄 — 좌측은 "무슨 일"(피처·외주), 우측은 "언제·누가"(기간·담당).
            읽는 방향이 카드마다 고정돼 시선이 지그재그로 돌지 않는다.
            상태 칩(지연/진행 중/예정)은 좌측 스트라이프·기간 칩과 중복이라 걷어냈다.
            우측 그룹은 호버 시 액션 버튼에 자리를 내준다. */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0 truncate max-w-[104px]"
            style={{
              background: `${it.feature_color ?? "#6366F1"}26`,
              color: it.feature_color ?? "#93c5fd",
            }}
            title={it.feature_title ?? "기타"}
          >
            {it.feature_title ?? "기타"}
          </span>
          {/* 외주 표식은 우측 담당 칩(외주사명·앰버)만으로 충분해 라벨 옆 배지는 두지 않는다. */}
          <div
            className={`ml-auto flex items-center gap-1.5 shrink-0 text-xs text-slate-500 ${
              showActions ? "group-hover:opacity-0 transition-opacity" : ""
            }`}
          >
            {/* 이월 배지 — 이번이 몇 번째 스프린트인지. */}
            {(it.carry_over_count ?? 0) > 0 && (
              <span
                className="font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
                title={`${(it.carry_over_count ?? 0) + 1}번째 스프린트째 진행 중`}
              >
                이월 {it.carry_over_count}
              </span>
            )}
            {/* 주기에서 물려받은 기간 — 담겼는데 자기 날짜가 없는 카드는 지금까지 기간이
                아예 안 보였다. 날짜를 입력한 적 없어도 일정이 있다는 걸 여기서 보여준다. */}
            {dateSource === "sprint" && !upcoming && !dday && sprintPeriod && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold tabular-nums bg-bridge-secondary/15 text-bridge-secondary"
                title={`${selectedSprint?.name ?? "이 스프린트"}에서 상속 · ${sprintPeriod}`}
              >
                <Calendar className="w-3 h-3" />
                {sprintPeriod}
              </span>
            )}
            {/* 직접 지정 — 주기와 다른 기간을 들고 있는 예외. 이 표식이 붙은 카드는
                주기가 바뀌어도 날짜가 따라가지 않는다. */}
            {dateSource === "override" && sprintPeriod && (
              <span
                className="inline-grid place-items-center w-[18px] h-[18px] rounded-md bg-amber-500/15 text-amber-500 shrink-0"
                title={`기간 직접 지정 · ${selectedSprint?.name ?? "이 스프린트"}은 ${sprintPeriod}`}
                aria-label="기간 직접 지정"
              >
                <Pencil className="w-3 h-3" />
              </span>
            )}
            {/* 기간 칩 — 시작 전이면 시작 D-day, 아니면 마감 D-day.
                지연은 스트라이프·배경 워시로도 신호하지만 D+n 텍스트를 함께 남겨
                색 하나에만 의존하지 않게 한다. */}
            {upcoming ? (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold tabular-nums bg-foreground/[0.06] text-slate-400"
                title={`${formatDate(it.start_date, "M/d")} 시작`}
              >
                <Calendar className="w-3 h-3" />
                {startDday!.text}
              </span>
            ) : dday ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold tabular-nums ${DDAY_BADGE[dday.urgency]}`}
                title={formatDate(it.due_date)}
              >
                <Calendar className="w-3 h-3" />
                {dday.text}
              </span>
            ) : it.due_date && !it.completed ? (
              <span className="tabular-nums">{formatDate(it.due_date)}</span>
            ) : null}
            {it.completed ? (
              <span className="inline-flex items-center gap-0.5 text-bridge-secondary font-bold">
                <Check className="w-3 h-3" /> 완료
              </span>
            ) : it.assignee ? (
              // 담당 모노그램 — 읽는 텍스트가 아니라 색으로 구분하는 그래픽이라 9px 유지.
              <span
                className="w-[18px] h-[18px] rounded-full grid place-items-center text-[9px] font-bold text-white"
                style={{ background: assigneeHex(it.assignee) }}
                title={it.assignee.name}
              >
                {getInitials(it.assignee.name)}
              </span>
            ) : it.contractor ? (
              // 외주 담당 칩 — 미배정처럼 비어 보이지 않게 외주사명을 앰버 칩으로 노출.
              <span
                className="inline-flex items-center gap-1 min-w-0"
                title={`외주 · ${it.contractor.name}`}
              >
                <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-[9px] font-bold shrink-0 bg-amber-500 text-amber-950">
                  {getInitials(it.contractor.name)}
                </span>
                <span className="truncate max-w-[64px] text-amber-500 font-bold">
                  {it.contractor.name}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={`text-xs font-medium leading-snug ${
            it.completed ? "line-through text-slate-500" : "text-foreground"
          }`}
        >
          {it.title}
        </div>

        {/* 체크리스트 롤업 — 카드가 태스크라 여기가 "안에 뭐가 남았는지"를 보여주는 자리다.
            태스크가 담긴 뒤 항목이 추가돼도 담기 조작 없이 이 집계에 그대로 반영된다. */}
        {cTotal > 0 && (
          <div className="pt-2 border-t border-foreground/[0.08] space-y-1.5">
            {/* 세그먼트 게이지 — "체크리스트" 라벨은 게이지·개수만으로 뜻이 통해 걷어냈다. */}
            <div className="flex items-center gap-2">
              <span className="flex-1 flex gap-[2px]" aria-hidden="true">
                {Array.from({ length: segTotal }, (_, i) => (
                  <span
                    key={i}
                    className={`flex-1 h-1 rounded-[2px] ${
                      i < segDone ? "bg-bridge-secondary" : "bg-foreground/10"
                    }`}
                  />
                ))}
              </span>
              {/* 숫자는 하나만 — 구성원 뷰면 "내 몫", Feature 뷰면 태스크 전체.
                  태스크 전체 수를 병기하던 "· 전체 N/M"은 걷어냈다:
                  한 카드가 네 개의 숫자를 말하면 어느 게 내 것인지부터 배워야 한다. */}
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {scoped && (
                  <span className="mr-1 font-medium text-slate-500">내 몫</span>
                )}
                <span className="font-bold text-slate-400">{cDone}</span>/
                {cTotal}
              </span>
            </div>
            <ul className="space-y-1">
              {shownLines.map((line) => (
                <li
                  key={line.id}
                  className={`flex items-start gap-1.5 ${
                    scoped && !lineOwnedBy(line, memberScope!.id)
                      ? "opacity-60"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    disabled={readOnly || !canEdit || !it.task_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChecklistLine(it.task_id, line.id);
                    }}
                    aria-label={line.completed ? "완료 해제" : "완료 표시"}
                    className={`mt-[2px] w-[13px] h-[13px] rounded shrink-0 border grid place-items-center transition-colors ${
                      line.completed
                        ? "bg-bridge-secondary border-bridge-secondary"
                        : "border-slate-600 hover:border-bridge-secondary"
                    } ${
                      readOnly || !canEdit ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    {line.completed && (
                      <Check
                        className="w-2.5 h-2.5 text-bridge-dark"
                        strokeWidth={4}
                      />
                    )}
                  </button>
                  {/* 완료 항목도 "무엇을 끝냈는지"라는 정보다 — 후퇴시키되 읽히는 선까지만. */}
                  <span
                    className={`flex-1 min-w-0 text-xs leading-snug ${
                      line.completed
                        ? "line-through decoration-1 text-slate-500"
                        : "text-slate-400"
                    }`}
                    title={line.title}
                  >
                    {line.title}
                  </span>
                  {/* 줄 담당 모노그램 — 원 밖으로 이름이 흐르지 않게 한 줄 고정(nowrap)하고 넘치면 자른다. */}
                  {showLineOwner && (line.assignee || line.contractor) && (
                    <span
                      className="shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center overflow-hidden text-[9px] font-bold leading-none tracking-[-0.03em] whitespace-nowrap"
                      style={
                        line.assignee
                          ? {
                              background: assigneeHex(line.assignee),
                              color: "#fff",
                            }
                          : { background: "#f59e0b", color: "#451a03" }
                      }
                      title={
                        line.assignee
                          ? line.assignee.name
                          : `외주 · ${line.contractor!.name}`
                      }
                    >
                      {getInitials(
                        line.assignee?.name ?? line.contractor!.name,
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {/* 펼치기 — 태스크 모달로 나가지 않고 카드 자리에서 전체 항목을 보고 체크한다.
                상세는 호버 액션(↗)에 그대로 남아 있다. */}
            {(hiddenCount > 0 || expanded || coOwners.length > 0) && (
              <div className="flex items-center gap-2.5 flex-wrap">
                {(hiddenCount > 0 || expanded) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardExpand(cardKey);
                    }}
                    aria-expanded={expanded}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-bridge-accent focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded transition-colors"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform motion-reduce:transition-none ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                    {expanded ? "접기" : `남은 ${hiddenCount}개 펼치기`}
                  </button>
                )}
                {/* 함께 미는 사람 — 이 카드가 다른 컬럼에도 서 있다는 사실을 얼굴로 알린다.
                    건수를 세지 않는 이유: 남의 몫 개수는 이 컬럼에서 할 일이 아니다. */}
                {coOwners.length > 0 && (
                  <span
                    className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500"
                    title={`함께 진행 · ${coOwners.map((o) => o.name).join(", ")}`}
                  >
                    함께 {coOwners.length}명
                    <span className="flex">
                      {coOwners.slice(0, 3).map((o, i) => (
                        <span
                          key={o.id}
                          className="w-[18px] h-[18px] rounded-full grid place-items-center text-[9px] font-bold text-white ring-2 ring-sprint-card"
                          style={{
                            backgroundColor: assigneeHex(o),
                            marginLeft: i === 0 ? 0 : -6,
                          }}
                          aria-hidden="true"
                        >
                          {getInitials(o.name)}
                        </span>
                      ))}
                      {coOwners.length > 3 && (
                        <span
                          className="w-[18px] h-[18px] rounded-full grid place-items-center text-[9px] font-bold text-slate-300 bg-foreground/20 ring-2 ring-sprint-card"
                          style={{ marginLeft: -6 }}
                          aria-hidden="true"
                        >
                          +{coOwners.length - 3}
                        </span>
                      )}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Feature 단위 컬럼 (기존 "Sprint" 컬럼을 Feature별로 쪼갠 것).
  // 카드가 태스크 1건이라 소그룹 없이 평면 나열한다.
  // 보드 안 카드를 여기로 드롭하면 START 컬럼으로 이동한다(보드 내부 이동만 허용).
  // 스테이지 컬럼(START·MIDDLE·END 공통) 안쪽 — 상단 색 레일 + 헤더(이름/편집) + 카드 스택.
  // 바깥 껍데기(드롭 존 div)는 호출부가 소유한다: 스크롤 영역 컬럼은 고정 폭,
  // 도크 컬럼은 접힘/펼침 폭 전환이 있어 같은 안쪽을 다른 껍데기에 끼운다.
  const renderStageColumnInner = (
    col: SprintColumn,
    onCollapse?: () => void,
  ) => {
    const accent = columnAccent(col);
    const isAnchor = col.kind !== "MIDDLE";
    return (
      <>
        {/* 컬럼 상단 상태 색 레일 */}
        <div className="h-[3px] shrink-0" style={{ background: accent }} />
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
          {col.kind === "MIDDLE" && isAdminOrOwner && editingCol !== col.id && (
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
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5 shrink-0"
              aria-label={`${col.name} 접기`}
              title="접기"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 카드 스택 — 도크(In Review·Done)는 피쳐별 소그룹으로 묶는다.
            여러 피쳐가 담기면 카드가 뒤섞여 "어느 피쳐의 일인지"부터 찾게 되기 때문.
            START(담기 안내 폴백)는 컬럼 자체가 피쳐 축이 아니라 평면 나열을 유지한다. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {col.items.length === 0 && (
            <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
              {col.kind === "START"
                ? "왼쪽 업무 리스트에서 태스크를 담아 시작하세요"
                : "비어 있음"}
            </div>
          )}
          {col.kind === "START"
            ? col.items.map((it) => renderCard(it))
            : (() => {
                const groups = new Map<
                  string,
                  {
                    title: string;
                    color: string | null;
                    items: SprintItemCard[];
                  }
                >();
                for (const it of col.items) {
                  const fid = it.feature_id ?? "__none__";
                  let g = groups.get(fid);
                  if (!g) {
                    g = {
                      title: it.feature_title ?? "기타",
                      color: it.feature_color ?? null,
                      items: [],
                    };
                    groups.set(fid, g);
                  }
                  g.items.push(it);
                }
                return Array.from(groups.entries()).map(([fid, g]) => (
                  <div key={fid} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 pt-0.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: g.color ?? "#6366F1" }}
                      />
                      <span
                        className="text-[11px] font-bold text-slate-400 truncate flex-1 min-w-0"
                        title={g.title}
                      >
                        {g.title}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                        {g.items.length}
                      </span>
                    </div>
                    {g.items.map((it) => renderCard(it))}
                  </div>
                ));
              })()}
        </div>
      </>
    );
  };

  // 도크 컬럼 펼침/접힘 토글 — 지난 스프린트의 컬럼 id가 저장소에 쌓이지 않게
  // 현재 도크 컬럼 몫만 남기고 정리한다.
  const toggleDock = (colId: string) => {
    setDockExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev, [colId]: !prev[colId] };
      const valid = new Set(dockColumns.map((c) => c.id));
      for (const k of Object.keys(next)) if (!valid.has(k)) delete next[k];
      return next;
    });
  };

  // 우측 도크 컬럼(In Review·Done) — 접힘(52px 레일) ↔ 펼침(기존 컬럼 UI) 전환.
  // 접힌 레일도 그대로 드롭 존이고, 드래그 중 잠시 머물면 자동으로 펼쳐진다.
  const renderDockColumn = (col: SprintColumn) => {
    const accent = columnAccent(col);
    const expanded = !!dockExpanded[col.id];
    const isOver = dragOverCol === col.id;
    // END 레일 훈장 — 오늘 완료 수(진행 현황 모달의 "오늘 완료" 기준과 동일: 로컬 자정 이후).
    const todayCnt =
      col.kind === "END"
        ? (() => {
            const now = new Date();
            const startToday = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            ).getTime();
            return col.items.filter((it) => {
              const ts =
                parseUTCDate(it.completed_at ?? it.done_date)?.getTime() ?? 0;
              return ts >= startToday;
            }).length;
          })()
        : 0;
    const MAX_MINI = 12;
    return (
      <div
        key={col.id}
        onDragOver={(e) => {
          if (canEdit && draggingSource === "sprint") {
            e.preventDefault();
            setDragOverCol(col.id);
            // 접힌 레일 위에 머물면 자동 펼침 — 원하는 위치를 보며 놓을 수 있게.
            if (!expanded && !dockHoverTimer.current[col.id]) {
              dockHoverTimer.current[col.id] = setTimeout(() => {
                delete dockHoverTimer.current[col.id];
                setDockExpanded((prev) => ({ ...prev, [col.id]: true }));
              }, DOCK_HOVER_EXPAND_MS);
            }
          }
        }}
        onDragLeave={() => {
          clearDockHoverTimer(col.id);
          setDragOverCol((c) => (c === col.id ? null : c));
        }}
        onDrop={(e) => {
          clearDockHoverTimer(col.id);
          void onDropColumn(e, col);
        }}
        style={isOver ? { borderColor: accent } : undefined}
        className={`shrink-0 flex flex-col rounded-2xl border bg-sprint-col overflow-hidden border-sprint-border transition-[width,border-color] duration-300 ${
          expanded ? "w-[260px]" : "w-[52px]"
        }`}
      >
        {expanded ? (
          renderStageColumnInner(col, () => toggleDock(col.id))
        ) : (
          <>
            <div className="h-[3px] shrink-0" style={{ background: accent }} />
            <button
              type="button"
              onClick={() => toggleDock(col.id)}
              aria-label={`${col.name} 펼치기 (${col.items.length}건)`}
              title={`${col.name} · ${col.items.length}건 — 클릭해서 펼치기`}
              className="flex-1 min-h-0 w-full flex flex-col items-center gap-2.5 pt-2.5 pb-3 hover:bg-foreground/[0.04] transition-colors"
            >
              <span
                className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: `${accent}26`, color: accent }}
              >
                {col.items.length}
              </span>
              <span
                className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase shrink-0"
                style={{ writingMode: "vertical-rl" }}
              >
                {col.name}
              </span>
              {/* 카드 1건 = 미니 바 1개(좌측 색 = 피처 색) — 접힌 채로도 규모·분포가 보인다 */}
              <span className="flex-1 min-h-0 w-full flex flex-col items-center gap-1 overflow-hidden pt-1">
                {col.items.slice(0, MAX_MINI).map((it) => (
                  <span
                    key={it.id}
                    className="w-[24px] h-[6px] rounded-[3px] bg-foreground/10 shrink-0"
                    style={{
                      borderLeft: `3px solid ${it.feature_color ?? "#6366F1"}`,
                    }}
                  />
                ))}
                {col.items.length > MAX_MINI && (
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">
                    +{col.items.length - MAX_MINI}
                  </span>
                )}
              </span>
              {todayCnt > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0"
                  title={`오늘 완료 ${todayCnt}건`}
                >
                  +{todayCnt}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    );
  };

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
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-sprint-col overflow-hidden transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-sprint-border"
        }`}
      >
        {/* 컬럼 상단 Feature 색 레일 — 가로 스크롤 중에도 어느 Feature인지 즉시 식별 */}
        <div className="h-[3px] shrink-0" style={{ background: accent }} />
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
            {onOpenFeature && fc.featureId !== "__none__" && (
              <button
                type="button"
                onClick={() => onOpenFeature(fc.featureId)}
                title="피쳐 열기"
                aria-label="피쳐 열기"
                className="shrink-0 w-5 h-5 grid place-items-center rounded-md text-slate-500 hover:text-bridge-accent hover:bg-bridge-accent/[0.12] focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="mt-2 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 태스크 카드 스택 — 카드 1건이 태스크 1건이라 소그룹 없이 평면 나열한다. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5 min-h-[120px]">
          {fc.items.map((it) => renderCard(it))}
        </div>
        {/* 인라인 태스크 생성(갈래 ②) — 여기서 만들면 생성 즉시 이 컬럼(START)에 담긴다.
            업무 리스트 생성(백로그행)과 결과가 다르므로 placeholder로 차이를 명시한다.
            평소엔 고스트 행, 클릭 시에만 입력으로 펼친다(업무 리스트와 동일 패턴). */}
        {canEdit && !!scopeSprintId && fc.featureId !== "__none__" && (
          <div className="shrink-0 p-2 pt-0">
            {(() => {
              const key = `col:${fc.featureId}`;
              const busy = creatingTaskKey === key;
              return activeAddKey === key ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-bridge-accent/50 bg-bridge-accent/[0.05]">
                  <Plus className="w-3.5 h-3.5 text-bridge-accent shrink-0" />
                  <input
                    autoFocus
                    value={newTaskTitles[key] ?? ""}
                    onChange={(e) =>
                      setNewTaskTitles((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitNewTask(fc.featureId, key, true);
                      } else if (e.key === "Escape") {
                        setNewTaskTitles((prev) => ({ ...prev, [key]: "" }));
                        setActiveAddKey(null);
                      }
                    }}
                    onBlur={() => {
                      if (!(newTaskTitles[key] ?? "").trim())
                        setActiveAddKey((k) => (k === key ? null : k));
                    }}
                    placeholder="태스크 추가 — 즉시 담김"
                    aria-label={`${fc.featureTitle}에 태스크 추가 (즉시 담김)`}
                    className="flex-1 min-w-0 bg-transparent outline-none text-xs font-medium text-foreground placeholder-slate-500"
                  />
                  {busy && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-bridge-accent shrink-0" />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveAddKey(key)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-bridge-accent hover:bg-bridge-accent/[0.06] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  태스크 추가
                </button>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // 구성원 단위 컬럼 — Feature 컬럼과 대칭. 컬럼=담당자, 카드의 Feature 태그는 renderCard가 표시.
  // Task 소그룹 없이 담당자의 START 카드를 평면 나열한다. 드롭 = START로 이동(보드 내부 이동만).
  const renderMemberColumn = (mc: MemberColumn) => {
    const key = `mem-${mc.memberId}`;
    const accent = assigneeHex({ id: mc.memberId, name: mc.memberName });
    const pct = mc.total > 0 ? Math.round((mc.doneTotal / mc.total) * 100) : 0;
    // 레일에서 끌어온 카드는 컬럼 이동이 아니라 "이 사람 담당으로" 배정한다.
    // (카드는 이미 스프린트에 담겨 있으므로 소속 컬럼은 그대로 둔다.)
    const onDropMember = (e: React.DragEvent) => {
      const fromRail = uncatDragRef.current;
      if (fromRail) {
        e.preventDefault();
        setDragOverCol(null);
        uncatDragRef.current = null;
        void assignUncategorizedTo(fromRail, mc.memberId, mc.memberName);
        return;
      }
      if (startColumn) void onDropColumn(e, startColumn);
    };
    // 지연 건수 — 담당자 컬럼에서 실제로 궁금한 건 퍼센트가 아니라 "막힌 게 몇 개냐"다.
    const overdueCount = mc.items.filter((it) => {
      const kind = it.sprint_column_id
        ? columnById.get(it.sprint_column_id)?.kind
        : undefined;
      if (it.completed || kind === "END") return false;
      return !!it.due_date && getDDay(it.due_date).urgency === "overdue";
    }).length;
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
        onDrop={onDropMember}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-sprint-col overflow-hidden transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-sprint-border"
        }`}
      >
        {/* 컬럼 상단 담당자 색 레일 */}
        <div className="h-[3px] shrink-0" style={{ background: accent }} />
        {/* 담당자 컬럼 헤더 — "담당" 라벨은 컬럼 자체가 담당자라 중복이라 걷어내고,
            그 자리를 지연 건수에 내줬다. 진척은 헤더 경계선과 겹치는 2px 언더바로.
            아이콘 클릭 시 개인 간트 모달 오픈 */}
        <div className="relative px-3 py-2.5 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold shrink-0 text-white"
              style={{ background: accent }}
            >
              {getInitials(mc.memberName)}
            </span>
            <span
              className="text-xs font-bold text-foreground truncate flex-1"
              title={mc.memberName}
            >
              {mc.memberName}
            </span>
            {overdueCount > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-rose-500/15 text-rose-600 dark:text-rose-400 tabular-nums"
                title={`마감이 지난 태스크 ${overdueCount}건`}
              >
                지연 {overdueCount}
              </span>
            )}
            <span className="text-xs text-slate-500 tabular-nums shrink-0">
              <span className="font-bold text-foreground">{mc.doneTotal}</span>/
              {mc.total}
            </span>
            <button
              type="button"
              onClick={() => setGanttMemberId(mc.memberId)}
              title={`${mc.memberName} 간트 · 업무 배치`}
              aria-label={`${mc.memberName} 간트 열기`}
              className="shrink-0 w-5 h-5 grid place-items-center rounded-md text-slate-500 hover:text-bridge-accent hover:bg-bridge-accent/[0.12] focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="absolute left-0 right-0 -bottom-px h-[2px] bg-foreground/10">
            <div
              className="h-full transition-all motion-reduce:transition-none"
              style={{ width: `${pct}%`, background: accent }}
            />
          </div>
        </div>

        {/* 카드 스택 (평면) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {mc.items.length === 0 ? (
            // 보임 필터로 비었을 때는 "비어 있음"이 아니다 — 남은 게 없다는 것 자체가 읽을 값이라
            // 컬럼을 지우지 않고 상태로 보여준다.
            mc.hiddenByVis > 0 ? (
              <div className="h-full min-h-[80px] grid place-content-center justify-items-center gap-1 text-center px-2">
                {doneVis === "open" ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-bridge-secondary" />
                    <span className="text-xs font-bold text-bridge-secondary">
                      전부 완료
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      진행 중인 항목 없음 · 완료 {mc.hiddenByVis}건
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-600 tabular-nums">
                    완료된 항목 없음 · 진행중 {mc.hiddenByVis}건
                  </span>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[80px] grid place-items-center text-xs text-slate-600">
                비어 있음
              </div>
            )
          ) : (
            mc.items.map((it) =>
              renderCard(it, false, {
                id: mc.memberId,
                name: mc.memberName,
              }),
            )
          )}
        </div>
        {/* 숨김 고지 — 조용한 누락은 "카드가 없어졌다"는 문의가 된다.
            눌러서 바로 전체 보기로 풀 수 있게 버튼으로 둔다. */}
        {mc.items.length > 0 && mc.hiddenByVis > 0 && (
          <button
            type="button"
            onClick={() => setDoneVis("all")}
            title="보임 필터를 해제하고 전체를 봅니다"
            className="shrink-0 px-3 py-1.5 border-t border-foreground/[0.06] text-xs text-slate-600 hover:text-bridge-secondary hover:bg-foreground/[0.03] focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors tabular-nums text-left"
          >
            {doneVis === "open" ? "완료" : "진행중"} {mc.hiddenByVis}건 숨김
          </button>
        )}
      </div>
    );
  };

  // ── 하단 미분류 레일 (구성원 뷰 전용) ──
  // 담당 없음 카드는 어떤 구성원 컬럼에도 서지 못해 여기가 유일한 노출처다.
  // 피쳐 없음 카드는 담당자 컬럼에도 서 있지만, "분류가 덜 된 것"을 한곳에서 처리하도록 함께 모은다.
  const renderUncatCard = (u: UncatCard) => {
    const it = u.it;
    const needAssignee = u.causes.includes("assignee");
    const needFeature = u.causes.includes("feature");
    const doneLines = it.checklist_done ?? 0;
    const totalLines = it.checklist_total ?? it.checklist_items?.length ?? 0;
    const asg = it.assignees ?? (it.assignee ? [it.assignee] : []);
    return (
      <div
        key={it.id}
        draggable={canEdit}
        onDragStart={(e) => {
          if (!canEdit) return;
          uncatDragRef.current = it;
          onDragStartItem(e, it, "sprint");
        }}
        onDragEnd={onDragEndItem}
        onClick={() => openItem(it)}
        // 점선 테두리 — 컬럼 카드(실선)와 구분되는 "아직 자리를 못 잡음" 신호.
        className={`relative w-[200px] shrink-0 rounded-xl border border-dashed border-foreground/20 bg-sprint-card p-2.5 space-y-2 hover:border-bridge-accent/50 transition-colors ${
          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        }`}
      >
        {/* 사유 칩 — 이 카드가 왜 레일에 있는지를 카드 스스로 설명한다(두 사유면 둘 다). */}
        <div className="flex items-center gap-1 flex-wrap">
          {needAssignee && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400">
              담당 없음
            </span>
          )}
          {needFeature && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              피쳐 없음
            </span>
          )}
          {it.feature_id && (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-md truncate max-w-[88px]"
              style={{
                background: `${it.feature_color ?? "#6366F1"}26`,
                color: it.feature_color ?? "#93c5fd",
              }}
              title={it.feature_title ?? ""}
            >
              {it.feature_title}
            </span>
          )}
        </div>

        <div className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {it.title}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 tabular-nums shrink-0">
            <span className="font-bold text-foreground">{doneLines}</span>/
            {totalLines}
          </span>
          {/* 담당 아바타 — 있으면 이 카드가 구성원 컬럼에도 함께 서 있다는 뜻이다. */}
          {asg.length > 0 && (
            <div className="ml-auto flex items-center -space-x-1 shrink-0">
              {asg.slice(0, 3).map((a) => (
                <span
                  key={a.id}
                  className="w-4 h-4 rounded-full grid place-items-center text-xs font-bold text-white ring-1 ring-sprint-card"
                  style={{ background: assigneeHex(a) }}
                  title={a.name}
                >
                  {getInitials(a.name).slice(0, 1)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 사유별 해소 버튼 — 드래그 없이 한 번에 끝낼 수 있는 경로 */}
        {canEdit && (
          <div className="flex items-center gap-1">
            {needAssignee && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // 담당자는 체크리스트 줄 단위라 상세에서 지정한다(드롭이 일괄 배정 경로).
                  if (it.task_id) onOpenChecklistItem?.(it.task_id);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-foreground/[0.06] text-slate-400 hover:bg-bridge-accent hover:text-white transition-colors"
              >
                <UserPlus className="w-3 h-3" />
                담당 지정
              </button>
            )}
            {needFeature && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFeaturePickerFor(it.id);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-foreground/[0.06] text-slate-400 hover:bg-bridge-accent hover:text-white transition-colors"
              >
                <Layers className="w-3 h-3" />
                피쳐 지정
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderUncategorizedRail = () => {
    const total = uncatCounts.all;
    // 0건이면 카드 영역 없이 한 줄로 줄여 세로 공간을 보드에 돌려준다.
    if (total === 0) {
      return (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-foreground/[0.08] bg-sprint-col">
          <Check className="w-3.5 h-3.5 text-bridge-secondary shrink-0" />
          <span className="text-xs font-bold text-bridge-secondary shrink-0">
            미분류 없음
          </span>
          <span className="text-xs text-slate-600 truncate">
            담긴 카드의 담당·피쳐가 모두 채워졌습니다
          </span>
        </div>
      );
    }
    const filterChip = (key: "all" | UncatCause, label: string, n: number) => (
      <button
        key={key}
        type="button"
        onClick={() => setUncatFilter(key)}
        aria-pressed={uncatFilter === key}
        className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
          uncatFilter === key
            ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent"
            : "bg-foreground/[0.04] border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/[0.08]"
        }`}
      >
        {label} {n}
      </button>
    );
    return (
      <div className="shrink-0 border-t border-foreground/[0.08] bg-sprint-col">
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => {
              setUncatCollapsed((v) => !v);
              setFeaturePickerFor(null); // 접을 때 열려 있던 피쳐 드롭다운도 함께 닫는다
            }}
            aria-expanded={!uncatCollapsed}
            aria-label={
              uncatCollapsed ? "미분류 레일 펼치기" : "미분류 레일 접기"
            }
            className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-foreground hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
          >
            {uncatCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <Inbox className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-foreground shrink-0">
            미분류
          </span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 tabular-nums shrink-0">
            {total}
          </span>
          {uncatCollapsed ? (
            // 접혀도 사유별 건수는 남긴다 — 접힘이 "문제 없음"으로 읽히면 안 된다.
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              {uncatCounts.assignee > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 shrink-0">
                  담당 없음 {uncatCounts.assignee}
                </span>
              )}
              {uncatCounts.feature > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  피쳐 없음 {uncatCounts.feature}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 min-w-0 overflow-x-auto custom-scrollbar">
                {filterChip("all", "전체", uncatCounts.all)}
                {uncatCounts.assignee > 0 &&
                  filterChip("assignee", "담당 없음", uncatCounts.assignee)}
                {uncatCounts.feature > 0 &&
                  filterChip("feature", "피쳐 없음", uncatCounts.feature)}
              </div>
              {canEdit && (
                <span className="ml-auto shrink-0 text-xs text-slate-600 hidden lg:block">
                  카드를 구성원 컬럼으로 끌어다 놓으면 담당이 지정됩니다
                </span>
              )}
            </>
          )}
        </div>
        {!uncatCollapsed && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto custom-scrollbar">
            {uncatVisible.length === 0 ? (
              <div className="py-4 text-xs text-slate-600">해당 항목 없음</div>
            ) : (
              uncatVisible.map((u) => renderUncatCard(u))
            )}
          </div>
        )}
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
    // JIRA 원본이 사라진 카드는 전이시킬 이슈가 없으므로 드래그를 막는다.
    const canDrag = canEdit && draggable && !card.isDeleted;
    const typeMark = jiraIssueTypeMark(card.issueType);
    const priorityMark = jiraPriorityMark(card.priority);
    // 원본이 삭제된 이슈로는 나갈 곳이 없다 — 404로 보내지 않는다.
    const issueUrl = card.isDeleted
      ? null
      : jiraIssueUrl(jiraStatus?.base_url, card.jiraKey);
    // 체크리스트가 하나라도 있으면 게이지를 세운다 — 1개짜리도 0/1(미착수)과 1/1(완료)은
    // 다른 상태다. 체크리스트가 아예 없는 카드만 그 자리를 JIRA 갱신 시각이 받는다.
    const showProgress = card.total > 0;
    return (
      <div
        key={card.taskId}
        draggable={canDrag}
        onDragStart={(e) => canDrag && onDragStartJiraTask(e, card)}
        onDragEnd={(e) => {
          onDragEndItem(e);
          onDragEndJiraTask();
        }}
        onClick={() => openTask(card.taskId)}
        className={`group rounded-xl border border-sprint-border bg-sprint-card p-2.5 shadow-[0_2px_6px_-2px_rgba(0,0,0,0.45)] transition-colors hover:border-sprint-border-hover hover:bg-sprint-card-hover ${
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          {/* 이슈 타입·우선순위 — 색만이 아니라 모양으로도 구분되게 아이콘을 쓴다 */}
          {typeMark && (
            <span
              className="shrink-0 leading-none"
              role="img"
              aria-label={`이슈 타입 ${typeMark.label}`}
              title={typeMark.label}
            >
              <typeMark.icon
                className="w-3 h-3"
                style={{ color: typeMark.color }}
              />
            </span>
          )}
          {priorityMark && (
            <span
              className="shrink-0 leading-none -ml-0.5"
              role="img"
              aria-label={`우선순위 ${priorityMark.label}`}
              title={priorityMark.label}
            >
              <priorityMark.icon
                className="w-3 h-3"
                style={{ color: priorityMark.color }}
              />
            </span>
          )}
          {/* 이슈키 = JIRA 원문으로 나가는 문. 카드 본체 클릭(BRIDGE 모달)과 겹치지 않게 전파를 끊는다.
              draggable=false가 없으면 카드를 끌 때 브라우저의 링크 드래그가 먼저 잡아챈다. */}
          {issueUrl ? (
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              title={`JIRA에서 ${card.jiraKey} 열기`}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              style={{ background: "rgba(38,132,255,0.16)", color: "#7fb0ff" }}
            >
              <Diamond className="w-2.5 h-2.5" />
              {card.jiraKey}
              <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                card.isDeleted ? "line-through opacity-60" : ""
              }`}
              style={
                card.isDeleted
                  ? { background: "rgba(148,163,184,0.16)", color: "#94a3b8" }
                  : { background: "rgba(38,132,255,0.16)", color: "#7fb0ff" }
              }
            >
              <Diamond className="w-2.5 h-2.5" />
              {card.jiraKey}
            </span>
          )}
          {/* JIRA에서 원본 이슈가 삭제됨 — 연동만 끊고 카드는 보존한다 */}
          {card.isDeleted && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500 shrink-0"
              title="JIRA에서 원본 이슈가 삭제되어 연동이 끊겼습니다. 이 카드는 BRIDGE에만 남아 있으며 직접 삭제할 수 있습니다."
            >
              JIRA 삭제됨
            </span>
          )}
          {/* 마지막 확인 이후 들어온 이슈 — 탭을 벗어날 때까지 유지된다 */}
          {card.isNew && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0"
              title="마지막 확인 이후 새로 들어온 이슈"
            >
              NEW
            </span>
          )}
          {card.qaState && renderQaBadge(card.qaState)}
        </div>
        <div className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {card.taskTitle}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {showProgress ? (
            <>
              <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                {card.done}/{card.total}
              </span>
            </>
          ) : (
            /* "JIRA"를 앞에 붙이는 이유 — 이 시각은 BRIDGE에서 만진 시각이 아니라
               이슈가 JIRA에서 마지막으로 움직인 시각이다. 두 축이 섞이면 아무도 못 믿는다. */
            <span className="flex-1 text-[10px] text-slate-500 truncate">
              {card.jiraUpdatedAt
                ? `JIRA ${formatRelativeTime(card.jiraUpdatedAt)}`
                : ""}
            </span>
          )}
          {card.assignees.length > 0 && (
            <div className="flex -space-x-1 shrink-0">
              {card.assignees.slice(0, 3).map((a) => (
                <span
                  key={a.id}
                  className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold ring-1 ring-sprint-card"
                  style={{ background: assigneeHex(a), color: "#fff" }}
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
    // pre-block: JIRA 드래그 중이고 이 컬럼이 허용 전환이 아니면 비활성(회색+드롭 차단)
    const dragActive = jiraDragTaskId != null && draggingSource === "sprint";
    const dropAllowed = isPush && isJiraDropAllowed(col);
    const dimmed = dragActive && !dropAllowed;
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
          if (canEdit && dropAllowed && draggingSource === "sprint") {
            e.preventDefault();
            setDragOverCol(key);
          }
        }}
        onDragLeave={() => setDragOverCol((c) => (c === key ? null : c))}
        onDrop={(e) => onDropJiraColumn(e, col)}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-sprint-col overflow-hidden transition-all ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-sprint-border"
        } ${dimmed ? "opacity-40" : ""}`}
      >
        {/* 컬럼 상단 JIRA 상태 색 레일 */}
        <div className="h-[3px] shrink-0" style={{ background: accent }} />
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

        {/* Feature 요약 스트립 — 숨김(피쳐 필터 UI 제거). featureFilter 상태는 유지되나 UI 미노출. */}
        {false && featureSummaries.length > 0 && (
          <div className="mb-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2 pl-0.5">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                Feature{" "}
                <span className="text-bridge-accent">
                  {featureSummaries.length}
                </span>
              </span>
              <span className="hidden sm:inline text-xs text-slate-600">
                칩 클릭 = 피쳐 열기 · 깔때기 = 필터
              </span>
              {featureFilter.size > 0 && (
                <button
                  type="button"
                  onClick={clearFeatureFilter}
                  className="ml-auto text-xs font-bold text-bridge-accent hover:bg-bridge-accent/10 px-2 py-0.5 rounded-md transition-colors"
                >
                  필터 해제 ({featureFilter.size})
                </button>
              )}
            </div>
            <div className="flex items-stretch gap-2 overflow-x-auto custom-scrollbar pb-1">
              {featureSummaries.map((f) => {
                const accent = f.featureColor ?? "#6366F1";
                const selected = featureFilter.has(f.featureId);
                const dimmed = featureFilter.size > 0 && !selected;
                const pct =
                  f.total > 0 ? Math.round((f.done / f.total) * 100) : 0;
                // 주 동작 = 피쳐 상세 모달 열기. 모달 대상이 없는 "기타"(__none__)나
                // onOpenFeature 미제공 시엔 본체 클릭을 필터 토글로 폴백한다.
                const canOpen = !!onOpenFeature && f.featureId !== "__none__";
                return (
                  <div
                    key={f.featureId}
                    className={`group/chip relative shrink-0 w-[136px] rounded-lg border transition-all ${
                      selected
                        ? "border-transparent"
                        : "bg-foreground/[0.03] border-foreground/[0.08] hover:border-foreground/[0.16]"
                    } ${dimmed ? "opacity-40 hover:opacity-75" : ""}`}
                    style={
                      selected
                        ? {
                            boxShadow: `inset 0 0 0 1.5px ${accent}`,
                            background: `${accent}1f`,
                          }
                        : undefined
                    }
                  >
                    {/* 본체 — 클릭 시 피쳐 상세 모달(주 동작) */}
                    <button
                      type="button"
                      onClick={() =>
                        canOpen
                          ? onOpenFeature!(f.featureId)
                          : toggleFeatureFilter(f.featureId)
                      }
                      title={
                        canOpen
                          ? `${f.featureTitle} 열기${f.overdue > 0 ? ` · 지연 ${f.overdue}건` : ""}`
                          : f.featureTitle
                      }
                      aria-label={
                        canOpen
                          ? `${f.featureTitle} 피쳐 열기`
                          : `${f.featureTitle} 필터`
                      }
                      className="w-full text-left px-2.5 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                    >
                      <div
                        className={`flex items-center gap-1.5 mb-1.5 ${canOpen ? "pr-5" : ""}`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: accent }}
                        />
                        <span className="text-xs font-bold text-foreground truncate flex-1">
                          {f.featureTitle}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-slate-400 shrink-0">
                          {f.overdue > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-rose-500/20 shrink-0" />
                          )}
                          {f.done}/{f.total}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: accent }}
                        />
                      </div>
                    </button>

                    {/* 필터 토글 — 우상단 깔때기. 평소 숨김, 호버·활성 시 노출. 본체(모달)와 독립 */}
                    {canOpen && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatureFilter(f.featureId);
                        }}
                        aria-pressed={selected}
                        title={
                          selected ? "이 피쳐 필터 해제" : "이 피쳐만 보기"
                        }
                        aria-label={
                          selected
                            ? `${f.featureTitle} 필터 해제`
                            : `${f.featureTitle}만 보기`
                        }
                        className={`absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-md transition-opacity focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                          selected
                            ? "opacity-100"
                            : "text-slate-400 opacity-0 group-hover/chip:opacity-100 hover:bg-foreground/10"
                        }`}
                        style={
                          selected
                            ? { color: accent, background: `${accent}2e` }
                            : undefined
                        }
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* JIRA 화면은 스코프가 보드 전체라 스프린트 타임라인·진척을 세우지 않는다 —
            모수가 다른 진행률 두 개(스프린트 체크리스트 vs JIRA 이슈)가 한 화면에 겹치면
            어느 쪽도 못 믿는다. 대신 이 화면이 무엇을 세고 있는지 밝히는 머리말만 둔다. */}
        {groupBy === "jira" ? (
          <div className="flex items-center gap-3 flex-wrap rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground whitespace-nowrap">
              <Diamond className="w-3.5 h-3.5 text-bridge-accent" />
              JIRA 보드
            </span>
            <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
              {board?.jira_scope
                ? `연동 ${jiraBadge.total}건 · 이 마일스톤 스코프만 봅니다`
                : `연동 ${jiraBadge.total}건 · 스프린트와 무관하게 보드 전체를 봅니다`}
            </span>
            {board?.jira_scope && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0 max-w-[280px] truncate"
                title={`JQL: ${board.jira_scope.jql}`}
              >
                {board.jira_scope.jql}
              </span>
            )}
            {jiraBadge.fresh > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent tabular-nums shrink-0"
                title="마지막으로 확인한 뒤 새로 링크된 이슈"
              >
                신규 {jiraBadge.fresh}
              </span>
            )}
            <span className="flex-1" />
            {jiraStatus && (
              <JiraSyncIndicator
                boardId={boardId}
                status={jiraStatus}
                onStatusRefetch={setJiraStatus}
              />
            )}
            {isAdminOrOwner && (
              <button
                type="button"
                onClick={() => setShowScopeModal(true)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  board?.jira_scope
                    ? "text-bridge-secondary hover:bg-bridge-secondary/10"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/10"
                }`}
                title="이 마일스톤의 JIRA 뷰 범위(JQL)를 설정"
              >
                <Filter className="w-3 h-3" />
                {board?.jira_scope ? "스코프 편집" : "마일스톤 스코프"}
              </button>
            )}
            {isAdminOrOwner && (
              <button
                type="button"
                onClick={() => setShowJiraModal(true)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-colors shrink-0"
                title="JIRA 연동 관리 (미러 보드·해제)"
                aria-label="JIRA 연동 관리"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : !uiFeatures.showSprint ? (
          /* 레벨 1 — 시간 묶음이 없다. 주기 이름·기간·종료 버튼·지난 주기 이력이 전부 빠지고
             "지금 얼마나 됐나" 한 줄만 남는다. 데이터(스프린트 행)는 그대로 있고 화면에서만 감춘다. */
          <div className="flex items-center gap-3 flex-wrap rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-2.5">
            <span className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap">
              전체 진행
            </span>
            <span className="text-lg font-bold tabular-nums text-bridge-secondary">
              {board?.gauge?.percentage ?? 0}%
            </span>
            <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
              할 일 {board?.gauge?.done ?? 0} / {board?.gauge?.total ?? 0}
            </span>
            <span className="flex-1 min-w-[80px] h-1.5 rounded-full bg-foreground/10 overflow-hidden">
              <span
                className="block h-full rounded-full bg-bridge-secondary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${board?.gauge?.percentage ?? 0}%` }}
              />
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {/* 원라인 세그먼트 바 — 좌측은 마일스톤 라벨+미니 트랙, 우측은 선택 버킷 수치·뷰 토글·⋯ 메뉴 */}
            {(board?.sprints ?? []).length > 0 ? (
              <SprintSegmentBar
                milestoneTitle={milestone?.title ?? "마일스톤"}
                milestoneStart={milestone?.start_date ?? null}
                milestoneEnd={milestone?.end_date ?? null}
                sprints={board?.sprints ?? []}
                selectedSprintId={scopeSprintId}
                unfinishedBySprint={unfinishedBySprint}
                onSelect={setSelectedSprintId}
              />
            ) : (
              <div className="flex-1 flex items-center gap-3 rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.03] px-4 py-3">
                <Flag className="w-4 h-4 text-bridge-secondary shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-foreground whitespace-nowrap">
                    아직 스프린트가 없습니다
                  </span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    마일스톤 기간을 몇 개로 나눌지 정하면 버킷이 생깁니다
                  </span>
                </div>
                <span className="flex-1" />
                {isAdminOrOwner && (
                  <button
                    onClick={() => setSplitOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors whitespace-nowrap shrink-0"
                    title="마일스톤 기간을 스프린트로 나눕니다"
                  >
                    <Split className="w-3.5 h-3.5" />
                    스프린트 나누기
                  </button>
                )}
              </div>
            )}

            {/* 선택 버킷 수치 — 클릭하면 진행 현황 모달. 이름·기간·상태는 tooltip과 넓은 화면 보조 텍스트로 압축 */}
            {selectedSprint && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setProgressTab(
                      sprintProgress.nToday > 0 ? "todayDone" : "inProgress",
                    );
                    setProgressOpen(true);
                  }}
                  aria-haspopup="dialog"
                  aria-label="진행 현황 보기"
                  title={`${selectedSprint.name}${
                    selectedSprint.start_date
                      ? ` · ${formatDate(selectedSprint.start_date)} ~ ${
                          selectedSprint.end_date
                            ? formatDate(selectedSprint.end_date)
                            : "진행"
                        }`
                      : ""
                  } · 진행 현황 자세히 보기`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-foreground/5 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <span className="hidden md:inline text-xs font-bold text-foreground whitespace-nowrap">
                    {selectedSprint.name}
                  </span>
                  {/* 스프린트 진척은 탭과 무관하게 한 잣대(체크리스트 줄)로 잰다.
                      JIRA 이슈가 어디까지 갔는지는 층위가 달라 보드 바닥 스트립(jiraFlow)이 전담. */}
                  <span className="text-base font-bold text-foreground tabular-nums leading-none">
                    {gauge?.percentage ?? selectedSprint.progress_percentage}
                    <span className="text-xs text-slate-400">%</span>
                  </span>
                  <span className="text-xs font-medium text-slate-400 tabular-nums whitespace-nowrap">
                    {gauge?.done ?? selectedSprint.done} /{" "}
                    {gauge?.total ?? selectedSprint.total}
                  </span>
                  {sprintProgress.nToday > 0 && (
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0 tabular-nums"
                      title={`오늘 Done에 도달한 태스크 ${sprintProgress.nToday}건`}
                    >
                      ▲ {sprintProgress.nToday}
                    </span>
                  )}
                </button>
                {selectedSprint.state === "CURRENT" &&
                  selectedSprint.end_date &&
                  (() => {
                    const d = getDDay(selectedSprint.end_date);
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums shrink-0 ${
                          DDAY_BADGE[d.urgency] ||
                          "bg-bridge-secondary/15 text-bridge-secondary"
                        }`}
                        title={`이 스프린트 종료 ${formatDate(selectedSprint.end_date)}`}
                      >
                        <Clock className="w-3 h-3" />
                        {d.text}
                      </span>
                    );
                  })()}

                {/* 보임 필터 — 구성원 뷰 전용. 그룹 기준(Feature↔구성원)보다 앞에 둔다:
                      "무엇을 볼까"를 먼저 고르고 "어떻게 자를까"를 뒤에 고르는 순서가
                      왼→오 읽기와 맞는다. */}
                {groupBy === "member" && (
                  <Popover open={doneVisOpen} onOpenChange={setDoneVisOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="완료 항목 보임 필터"
                        title={
                          DONE_VIS_OPTIONS.find((o) => o.key === doneVis)?.hint
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                          doneVis === "all"
                            ? "bg-foreground/[0.06] border-foreground/10 text-slate-400 hover:text-foreground"
                            : "bg-bridge-secondary/15 border-bridge-secondary/40 text-bridge-secondary"
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        {DONE_VIS_OPTIONS.find((o) => o.key === doneVis)?.label}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-44 p-1 bg-bridge-obsidian border-foreground/10"
                    >
                      {DONE_VIS_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          aria-pressed={doneVis === opt.key}
                          onClick={() => {
                            setDoneVis(opt.key);
                            setDoneVisOpen(false);
                          }}
                          title={opt.hint}
                          className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-left transition-colors ${
                            doneVis === opt.key
                              ? "bg-bridge-secondary/15 text-bridge-secondary"
                              : "text-slate-400 hover:bg-foreground/5 hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          {doneVis === opt.key && (
                            <Check className="w-3.5 h-3.5 ml-auto shrink-0" />
                          )}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Feature ↔ 구성원 전환 — 둘 다 "이 버킷에 담긴 것"을 소유 축으로
                      자르는, 서로 교환 가능한 절단면이다. JIRA는 스코프도 축도 달라
                      여기가 아니라 화면 선택 줄(스프린트 | 블록 보드 | JIRA)에 있다. */}
                {!uiFeatures.has("members") && memberGhost}
                {groupBy !== "jira" && uiFeatures.has("members") && (
                  <div
                    className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/[0.06] border border-foreground/10 shrink-0"
                    role="tablist"
                    aria-label="보드 그룹 기준"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={groupBy === "feature"}
                      onClick={() => setGroupPref("feature")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
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
                      onClick={() => setGroupPref("member")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                        groupBy === "member"
                          ? "bg-bridge-accent text-white"
                          : "text-slate-400 hover:text-foreground"
                      }`}
                      title="구성원(담당자) 단위로 컬럼 보기"
                    >
                      <Users className="w-3 h-3" />
                      구성원
                    </button>
                  </div>
                )}

                {/* ⋯ 메뉴 — 저빈도 액션(미완료 보내기·분할 조정·JIRA 연결)과 스프린트 요약 */}
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="스프린트 메뉴"
                      title="스프린트 메뉴"
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                        canPushUnfinished && nextSprint
                          ? "text-amber-600 dark:text-amber-400 bg-amber-500/15 hover:bg-amber-500/25"
                          : "text-slate-400 hover:text-foreground hover:bg-foreground/10"
                      }`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-64 p-1 bg-bridge-obsidian border-foreground/10"
                  >
                    <div className="px-2.5 py-2 text-xs text-slate-500 tabular-nums border-b border-foreground/[0.08] mb-1">
                      {remainingTasks > 0
                        ? `이 스프린트 남은 태스크 ${remainingTasks}개`
                        : "이 스프린트 전부 완료"}
                    </div>
                    {/* 이월의 새 모습 — 지난 버킷의 미완료를 다음 버킷으로 한 번에 민다 */}
                    {canPushUnfinished && nextSprint && (
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          pushUnfinished();
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-left text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title={`END에 닿지 못한 태스크 ${remainingTasks}개를 ${nextSprint.name}(으)로 옮기고 이월 횟수를 1 올립니다`}
                      >
                        <SendHorizontal className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          미완료 {remainingTasks}개 → {nextSprint.name}
                        </span>
                      </button>
                    )}
                    {isAdminOrOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          setSplitOpen(true);
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-left text-foreground hover:bg-foreground/5 transition-colors"
                        title="스프린트 개수와 기간 경계를 조정합니다"
                      >
                        <Split className="w-3.5 h-3.5 shrink-0" />
                        분할 조정
                      </button>
                    )}
                    {/* JIRA 최초 연결 — 미연동 보드엔 JIRA 화면 버튼 자체가 없어
                        보드 안에 진입점이 남지 않는다. 그래서 "아직 없을 때"의 CTA만 여기 둔다. */}
                    {isAdminOrOwner && !jiraConnected && (
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          setShowJiraModal(true);
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-left text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
                        title="이 스프린트 보드에 JIRA를 연결합니다"
                      >
                        <Diamond className="w-3.5 h-3.5 shrink-0" />
                        JIRA 연결
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>

      {/* 스플릿: 좌 소스 트리 / 우 스프린트 보드 (미리보기 중엔 트리 숨김 → 스냅샷 풀폭) */}
      {/* JIRA 뷰: 컬럼=JIRA 상태·카드=JIRA에서 유입 → 좌측 업무 리스트(체크리스트 담기)는 의미 없어 숨김 */}
      <div className="flex-1 min-h-0 flex">
        {/* 좌: 소스 트리 — Feature 섹션 ▸ Task 라벨 ▸ 체크리스트 행(클릭 진입 + 인라인 완료) */}
        {groupBy !== "jira" && (
          <aside
            style={panelCollapsed ? undefined : { width: panelWidth }}
            onDragOver={(e) => {
              // 카드 드래그로는 빼기가 안 된다(빼기 = Task 헤더 버튼). 좌측 패널은
              // 비-드롭 대상 — preventDefault로 dragover는 받되 dropEffect="none"으로
              // not-allowed 커서를 켜고, 호버 오버레이로 "여기선 못 뺀다"를 알린다.
              if (canEdit && draggingSource === "sprint") {
                e.preventDefault();
                e.dataTransfer.dropEffect = "none";
                setDragOverList(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragOverList(false);
            }}
            onDrop={onDropList}
            className={`shrink-0 border-r border-sprint-border flex flex-col bg-sprint-rail relative shadow-[inset_-8px_0_12px_-10px_rgba(0,0,0,0.6)] ${
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
            {/* 비-드롭 차단 오버레이 — 카드를 좌측 위로 가져온 순간(dragOverList)에만
                차분히 dim + not-allowed. 빼기는 카드 드래그가 아니라 Task 헤더 버튼임을 안내. */}
            {!panelCollapsed && draggingSource === "sprint" && dragOverList && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-bridge-dark/55 backdrop-blur-[1px] px-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="w-10 h-10 rounded-full grid place-items-center bg-foreground/[0.06] border border-foreground/15 text-slate-400">
                    <Ban className="w-5 h-5" />
                  </span>
                  <p className="text-xs font-bold text-slate-300">
                    여기로는 뺄 수 없어요
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    빼기는 카드·태스크 행의{" "}
                    <span className="text-rose-400 font-bold">빼기</span>{" "}
                    버튼으로
                  </p>
                </div>
              </div>
            )}
            {!panelCollapsed && (
              <div className="px-4 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 truncate flex-1">
                  {uiFeatures.showBacklog ? "업무 리스트" : "묶음 목록"}
                </span>
                {/* 리스트 범위 — 진행(미배치+이번 스프린트) / 전체(지난 스프린트 완료 포함).
                    지난 스프린트 완료는 동결 이력이라 기본은 "진행"으로 눌러둔다. */}
                {uiFeatures.showBacklog && (
                  <div
                    role="group"
                    aria-label="업무 리스트 범위"
                    className="shrink-0 flex items-center rounded-lg border border-foreground/10 bg-foreground/[0.03] p-0.5"
                  >
                    {(
                      [
                        { key: "active", label: "진행" },
                        { key: "all", label: "전체" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setListScope(opt.key)}
                        aria-pressed={listScope === opt.key}
                        title={
                          opt.key === "active"
                            ? "미배치 + 이번 스프린트만 보기"
                            : "지난 스프린트에서 완료된 태스크까지 보기"
                        }
                        className={`px-2 py-0.5 rounded-md text-xs font-bold transition-colors ${
                          listScope === opt.key
                            ? "bg-bridge-accent/20 text-bridge-accent"
                            : "text-slate-500 hover:text-slate-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* 마일스톤 관리 콘솔 열기 */}
                {milestoneId && (
                  <button
                    type="button"
                    onClick={() => setConsoleOpen(true)}
                    title="마일스톤 관리 콘솔"
                    aria-label="마일스톤 관리 콘솔 열기"
                    className="shrink-0 inline-grid place-items-center w-7 h-7 rounded-lg border border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-bridge-accent hover:border-bridge-accent/40 transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                )}
                {/* 새 피쳐 추가 — 인라인 입력 토글 */}
                {canEdit && onCreateFeature && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingFeature(true);
                      setNewFeatureTitle("");
                    }}
                    title="새 피쳐 추가"
                    aria-label="새 피쳐 추가"
                    className="shrink-0 inline-grid place-items-center w-7 h-7 rounded-lg border border-bridge-accent/35 bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent hover:text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
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
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
                {/* 새 피쳐 인라인 입력 — 제목만 받고 Enter 생성 · Esc 취소 */}
                {addingFeature && (
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-bridge-accent/50 bg-bridge-accent/[0.06] shadow-[0_0_0_3px_rgba(99,102,241,0.12)]">
                    <span className="w-2 h-2 rounded-sm shrink-0 bg-bridge-accent" />
                    <input
                      autoFocus
                      value={newFeatureTitle}
                      disabled={creatingFeature}
                      onChange={(e) => setNewFeatureTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitNewFeature();
                        } else if (e.key === "Escape") {
                          setAddingFeature(false);
                          setNewFeatureTitle("");
                        }
                      }}
                      onBlur={() => {
                        if (!newFeatureTitle.trim() && !creatingFeature)
                          setAddingFeature(false);
                      }}
                      placeholder="새 피쳐 이름…"
                      aria-label="새 피쳐 이름"
                      className="flex-1 min-w-0 bg-transparent outline-none text-xs font-medium text-foreground placeholder-slate-500"
                    />
                    {creatingFeature ? (
                      <Loader2 className="w-4 h-4 animate-spin text-bridge-accent shrink-0" />
                    ) : (
                      <>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          Enter
                        </span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={submitNewFeature}
                          disabled={!newFeatureTitle.trim()}
                          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-bridge-accent text-white disabled:opacity-40 hover:bg-bridge-accent/90 transition-all"
                        >
                          추가
                        </button>
                      </>
                    )}
                  </div>
                )}
                {tree.length === 0 && !addingFeature && (
                  <p className="text-xs text-slate-500 text-center py-8">
                    항목이 없습니다.
                  </p>
                )}
                {(() => {
                  // 담기 단위 = 태스크. 피쳐 카드는 그룹이고, 펼치면 태스크 행마다
                  // 담기/빼기가 붙는다. 리스트는 "이번 스프린트 / 백로그" 두 섹션으로 나뉜다.
                  // 카드의 발화 순서: 이름 → 진행(한 번만) → 예외(있을 때만).
                  // 진행률은 바 + 분수 한 쌍으로만 말하고, 피쳐 색은 레일·바에만 칠한다 —
                  // amber(임박)·rose(지연) 상태색이 신호로 살아남게 하기 위한 색 채널 분리.
                  const renderFeatureCard = (feat: TreeFeature) => {
                    const isEmpty = feat.total === 0;
                    const isComplete =
                      feat.total > 0 && feat.completed === feat.total;
                    // 빈 피쳐(내용 없음)·완료 피쳐(볼 일 없음)는 톤 다운 — 남은 일이 주인공
                    const dimmed = isEmpty || isComplete;
                    // 리스트 범위: "진행"이면 다른 버킷에 담긴 태스크를 걷어내고 미배정 +
                    // 보고 있는 버킷만 남긴다. 분수·게이지는 범위와 무관하게 전체 기준 —
                    // 숨겼다고 진척이 줄면 거짓말이 된다.
                    const bodyTasks =
                      listScope === "all"
                        ? feat.tasks
                        : feat.tasks.filter(
                            (t) => !t.sprint_id || takenHere(t),
                          );
                    const bodyOpen =
                      !isEmpty && expandedFeatures.has(feat.featureId);
                    // 게이지는 체크리스트 줄 기준(태스크 개수가 아니라 그 안의 할 일)
                    const pct =
                      feat.unitTotal > 0
                        ? Math.round((feat.unitDone / feat.unitTotal) * 100)
                        : 0;
                    const featColor = feat.featureColor ?? "#6366F1";
                    // 레일은 피쳐 색 채널 — 단 완료는 상태색(에메랄드)이 이긴다.
                    const railColor = isEmpty
                      ? "#94a3b8"
                      : isComplete
                        ? "#34d399"
                        : featColor;
                    // 예외 집계 — 접힌 채로도 "어디부터 봐야 하는지"가 보이게.
                    // 지연(마감 지남·오늘) / 임박(D-3 이내) / 이월(스프린트 넘김)만 센다.
                    let lateCount = 0;
                    let soonCount = 0;
                    let carryCount = 0;
                    for (const t of bodyTasks) {
                      if (t.completed) continue;
                      if ((t.carry_over_count ?? 0) > 0) carryCount += 1;
                      if (t.due_date) {
                        const u = getDDay(t.due_date).urgency;
                        if (u === "overdue" || u === "today") lateCount += 1;
                        else if (u === "soon") soonCount += 1;
                      }
                    }
                    const hasExceptions =
                      lateCount + soonCount + carryCount > 0;
                    // 담당 노출은 두지 않는다 — "누가"는 보드 카드·태스크 모달이 맡고,
                    // 리스트는 "무엇이 얼마나 남았고 담겼나"에만 집중한다.
                    // 부분 담김 — 접힌 채로도 "덜 담긴 피쳐"가 보이게 예외 줄에 세운다.
                    const partialTaken =
                      feat.inSprint && feat.taken < feat.total;
                    // 액션 비대칭: 담기(자주)는 태스크 행에 상시, 빼기(드묾)는 행 호버에만.
                    const showTakeControls =
                      canEdit && !!scopeSprintId && uiFeatures.showBacklog;
                    // 인라인 태스크 생성(갈래 ①) — 여기서 만들면 백로그로 생성된다.
                    // "기타"(피쳐 미지정)는 생성할 피쳐가 없어 입력을 두지 않는다.
                    const canAddTask = canEdit && feat.featureId !== "__none__";
                    const addKey = `list:${feat.featureId}`;
                    const addBusy = creatingTaskKey === addKey;
                    // 고스트 추가 행 — 평소엔 한 줄 텍스트만, 클릭한 자리 하나만 입력으로 펼친다.
                    // 상시 입력 박스는 카드마다 세로 40px을 상주로 먹는 소음이었다.
                    const renderAddTaskInput = () =>
                      activeAddKey === addKey ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-bridge-accent/50 bg-bridge-accent/[0.05]"
                        >
                          <Plus className="w-3.5 h-3.5 text-bridge-accent shrink-0" />
                          <input
                            autoFocus
                            value={newTaskTitles[addKey] ?? ""}
                            onChange={(e) =>
                              setNewTaskTitles((prev) => ({
                                ...prev,
                                [addKey]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void submitNewTask(
                                  feat.featureId,
                                  addKey,
                                  false,
                                );
                              } else if (e.key === "Escape") {
                                setNewTaskTitles((prev) => ({
                                  ...prev,
                                  [addKey]: "",
                                }));
                                setActiveAddKey(null);
                              }
                            }}
                            onBlur={() => {
                              if (!(newTaskTitles[addKey] ?? "").trim())
                                setActiveAddKey((k) =>
                                  k === addKey ? null : k,
                                );
                            }}
                            placeholder="태스크 추가 — 백로그로"
                            aria-label={`${feat.featureTitle}에 태스크 추가 (백로그로 생성)`}
                            className="flex-1 min-w-0 bg-transparent outline-none text-xs font-medium text-foreground placeholder-slate-500"
                          />
                          {addBusy && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-bridge-accent shrink-0" />
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAddKey(addKey);
                          }}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-bridge-accent hover:bg-bridge-accent/[0.06] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          태스크 추가
                        </button>
                      );
                    return (
                      <Fragment key={feat.featureId}>
                        {/* 그룹 카드 — 피쳐가 카드고 태스크가 내용물이다.
                            overflow-hidden을 주면 안쪽 sticky 헤더가 죽으므로
                            라운드는 헤더(rounded-t)와 마지막 자식(rounded-b)이 각자 처리한다.
                            카드 본문 클릭 = 펼침(리스트에서 가장 흔한 의도) — 셰브런이 키보드 경로,
                            상세(↗)·빼기는 호버에만 드러나는 보조 경로다. */}
                        <div
                          onClick={() => {
                            if (!isEmpty) toggleFeature(feat.featureId);
                          }}
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: railColor,
                          }}
                          className={`group/card relative rounded-2xl border border-foreground/10 bg-bridge-obsidian shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)] transition-opacity ${
                            dimmed ? "opacity-70 hover:opacity-100" : ""
                          } ${isEmpty ? "" : "cursor-pointer"}`}
                        >
                          {/* 헤더 — 1줄(이름·상태·분수·%) + 하단 2px 언더바.
                              진행바가 제 줄을 갖던 구조를 언더바로 눌러 카드 높이를 절반으로.
                              예외 줄(지연·임박·이월·담김)은 있을 때만 생긴다 —
                              줄 수 자체가 신호(두꺼운 카드 = 봐야 할 카드). */}
                          <div
                            className={`sticky top-0 z-10 overflow-hidden px-3 py-2 bg-bridge-obsidian rounded-t-[14px] ${
                              bodyOpen ? "" : "rounded-b-[14px]"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-sm font-bold truncate flex-1 min-w-0 ${
                                  dimmed ? "text-slate-400" : "text-foreground"
                                }`}
                                title={feat.featureTitle}
                              >
                                {feat.featureTitle}
                              </span>
                              {/* 상세 열기 — 호버에만 드러나는 보조 경로 */}
                              {onOpenFeature && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenFeature(feat.featureId);
                                  }}
                                  title="피쳐 상세 열기"
                                  aria-label={`${feat.featureTitle} 피쳐 상세 열기`}
                                  className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-slate-400 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-foreground/[0.08] transition-opacity"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                              {/* 상태 배지: 완료(✓) / 빈 피쳐(태스크 0). 담김은 배지가 아니라 섹션이 말한다. */}
                              {isComplete && (
                                <span
                                  title="피쳐 완료"
                                  className="inline-grid place-items-center w-[18px] h-[18px] rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0"
                                >
                                  <Check
                                    className="w-2.5 h-2.5"
                                    strokeWidth={3}
                                  />
                                </span>
                              )}
                              {isEmpty && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                                  태스크 0
                                </span>
                              )}
                              {/* 진행 분수 + % — 우측 정렬 tabular 숫자가 리스트의 스캔 축이 된다 */}
                              {!isEmpty && (
                                <span
                                  className="shrink-0 text-xs tabular-nums text-slate-400"
                                  title={`체크리스트 ${feat.unitDone}/${feat.unitTotal} 완료 · 태스크 ${feat.completed}/${feat.total} 완료`}
                                >
                                  <span className="font-bold text-foreground">
                                    {feat.unitDone}
                                  </span>
                                  /{feat.unitTotal}
                                </span>
                              )}
                              {!isEmpty && (
                                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                                  {pct}%
                                </span>
                              )}
                              {/* 펼치기/접기 — 키보드 접근 경로. 빈 피쳐는 펼칠 내용이 없어 숨긴다. */}
                              {!isEmpty && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFeature(feat.featureId);
                                  }}
                                  aria-expanded={bodyOpen}
                                  aria-label={`${feat.featureTitle} ${bodyOpen ? "접기" : "펼치기"}`}
                                  title={bodyOpen ? "접기" : "펼치기"}
                                  className="relative shrink-0 w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:bg-foreground/[0.08] hover:text-foreground transition-colors after:absolute after:-inset-1.5 after:content-['']"
                                >
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${
                                      bodyOpen ? "" : "-rotate-90"
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                            {/* 예외 줄 — 지연·임박·이월 + 부분 담김. 해당 없으면 줄 자체가 없다. */}
                            {!bodyOpen &&
                              !isEmpty &&
                              (hasExceptions ||
                                (showTakeControls && partialTaken)) && (
                                <div className="flex items-center gap-1 flex-wrap pt-1 pb-0.5">
                                  {lateCount > 0 && (
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-500">
                                      지연 {lateCount}
                                    </span>
                                  )}
                                  {soonCount > 0 && (
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                      임박 {soonCount}
                                    </span>
                                  )}
                                  {carryCount > 0 && (
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                      이월 {carryCount}
                                    </span>
                                  )}
                                  {showTakeControls && partialTaken && (
                                    <span
                                      className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent tabular-nums"
                                      title={`태스크 ${feat.taken}/${feat.total} 담김 — 펼치면 남은 태스크를 담을 수 있어요`}
                                    >
                                      담김 {feat.taken}/{feat.total}
                                    </span>
                                  )}
                                </div>
                              )}
                            {/* 진행 언더바 — 헤더 하단 2px. 바가 제 줄을 갖지 않게 한다. */}
                            {!isEmpty && (
                              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground/[0.07]">
                                <span
                                  className="block h-full transition-all motion-reduce:transition-none"
                                  style={{
                                    width: `${pct}%`,
                                    background: railColor,
                                  }}
                                />
                              </span>
                            )}
                          </div>

                          {/* 빈 피쳐 — 펼칠 목록이 없어 헤더 바로 아래에 첫 태스크 입력을 둔다.
                              여기서 만들어야 담기(태스크 단위)가 비로소 가능해진다. */}
                          {isEmpty && canAddTask && (
                            <div className="px-2 pb-2">
                              {renderAddTaskInput()}
                            </div>
                          )}

                          {bodyOpen &&
                            (() => {
                              // 남은 일이 주인공 — 완료 행은 접어서 "완료 N개 보기"로만 드러난다.
                              const remainingTasks = bodyTasks.filter(
                                (t) => !t.completed,
                              );
                              const doneTasks = bodyTasks.filter(
                                (t) => t.completed,
                              );
                              const showDone = expandedDoneTasks.has(
                                feat.featureId,
                              );
                              const renderTaskRow = (it: SprintItemCard) => {
                                const tid = it.task_id ?? it.id;
                                const hasTask =
                                  tid !== "__none__" && !!onOpenChecklistItem;
                                // 3-상태: 미배정 / 보고 있는 버킷에 담김 / 다른 버킷에 담김.
                                // 마지막 상태는 읽기 전용 이력이 아니라 "여기로 옮겨 담을 수
                                // 있는" 태스크다 — 담기 버튼이 그대로 살아 있다.
                                const taken = takenHere(it);
                                const elsewhere = !!it.sprint_id && !taken;
                                const otherSprint = elsewhere
                                  ? (board?.sprints ?? []).find(
                                      (s) => s.id === it.sprint_id,
                                    )
                                  : undefined;
                                const col =
                                  taken && it.sprint_column_id
                                    ? columnById.get(it.sprint_column_id)
                                    : undefined;
                                const cTotal = it.checklist_total ?? 0;
                                const cDone = it.checklist_done ?? 0;
                                const dday =
                                  !it.completed && it.due_date
                                    ? getDDay(it.due_date)
                                    : null;
                                const overdue = dday?.urgency === "overdue";
                                // 뱃지는 가장 급한 것 하나만: D-day > 이월 > 예외 컬럼.
                                const showDday =
                                  !!dday && dday.urgency !== "normal";
                                const showCarry =
                                  !showDday &&
                                  !it.completed &&
                                  (it.carry_over_count ?? 0) > 0;
                                // 컬럼 칩은 예외 단계(In Review·Done 등)에만 — 담김의 기본
                                // 단계(Sprint/START)까지 칩을 달면 담긴 행마다 같은 칩이
                                // 도배되어 신호가 죽는다(담김은 스트라이프·틴트가 말한다).
                                const showCol =
                                  !showDday &&
                                  !showCarry &&
                                  taken &&
                                  !!col &&
                                  col.kind !== "START";
                                // 좌측 2px은 피쳐 색이 아니라 "상태" — 피쳐 색은 그룹 카드가 독점한다.
                                const stateColor = overdue
                                  ? "#f43f5e"
                                  : taken
                                    ? "#2dd4bf"
                                    : "transparent";
                                const rowPct =
                                  cTotal > 0
                                    ? Math.round((cDone / cTotal) * 100)
                                    : 0;
                                return (
                                  <div
                                    key={it.id}
                                    role={hasTask ? "button" : undefined}
                                    tabIndex={hasTask ? 0 : undefined}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (hasTask) openItem(it);
                                    }}
                                    onKeyDown={(e) => {
                                      if (
                                        hasTask &&
                                        (e.key === "Enter" || e.key === " ")
                                      ) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openItem(it);
                                      }
                                    }}
                                    title={it.title}
                                    style={{
                                      borderLeftWidth: 2,
                                      borderLeftColor: stateColor,
                                    }}
                                    className={`group relative overflow-hidden rounded-lg px-2.5 py-1.5 transition-colors ${
                                      overdue
                                        ? "bg-rose-500/[0.07] hover:bg-rose-500/[0.12]"
                                        : taken
                                          ? "bg-bridge-secondary/[0.05] hover:bg-bridge-secondary/[0.1]"
                                          : "bg-foreground/[0.03] hover:bg-foreground/[0.08]"
                                    } ${it.completed || elsewhere ? "opacity-60" : ""} ${
                                      hasTask ? "cursor-pointer" : ""
                                    }`}
                                  >
                                    {/* 한 줄 구성: 제목 → 뱃지(최대 1) → 분수 → 담기/빼기.
                                        진행바는 행 하단 언더바로 내려보내 행 높이를 절반으로. */}
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`flex-1 min-w-0 text-xs font-medium leading-snug truncate ${
                                          it.completed
                                            ? "line-through text-slate-500"
                                            : "text-foreground"
                                        }`}
                                      >
                                        {it.title}
                                      </span>
                                      {showDday && dday && (
                                        <span
                                          className={`shrink-0 px-1.5 py-0.5 rounded-md text-xs font-bold tabular-nums ${DDAY_BADGE[dday.urgency]}`}
                                          title={formatDate(it.due_date)}
                                        >
                                          {dday.text}
                                        </span>
                                      )}
                                      {showCarry && (
                                        <span
                                          className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                          title={`${(it.carry_over_count ?? 0) + 1}번째 스프린트째 진행 중`}
                                        >
                                          이월 {it.carry_over_count}
                                        </span>
                                      )}
                                      {showCol && col && (
                                        <span
                                          className="shrink-0 inline-flex items-center text-xs font-bold rounded-full px-1.5 py-0.5 max-w-[72px]"
                                          style={{
                                            background: `${columnAccent(col)}26`,
                                            color: columnAccent(col),
                                          }}
                                          title={`담김 · ${col.name}`}
                                        >
                                          <span className="truncate">
                                            {col.name}
                                          </span>
                                        </span>
                                      )}
                                      {/* 다른 버킷에 담김 — 어느 스프린트가 데려갔는지만 밝힌다.
                                          칩을 눌러 그 스프린트로 화면을 옮길 수 있다. */}
                                      {elsewhere && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (it.sprint_id)
                                              setSelectedSprintId(it.sprint_id);
                                          }}
                                          className={`shrink-0 inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums transition-colors ${
                                            otherSprint?.state === "PAST"
                                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                              : "bg-foreground/[0.06] text-slate-400 hover:text-foreground"
                                          }`}
                                          title={`${otherSprint?.name ?? "다른 스프린트"}에 담겨 있어요 · 눌러서 이동`}
                                        >
                                          S{it.sprint_seq ?? "?"}
                                        </button>
                                      )}
                                      {/* 분수 — 담긴 행은 호버 시 빼기 버튼과 교체된다(폭이 좁아 겹치지 않게) */}
                                      {cTotal > 0 && !it.completed && (
                                        <span
                                          className={`shrink-0 text-xs tabular-nums text-slate-500 ${
                                            showTakeControls && taken
                                              ? "group-hover:hidden"
                                              : ""
                                          }`}
                                          title={`체크리스트 ${cDone}/${cTotal}`}
                                        >
                                          <span className="font-bold text-slate-400">
                                            {cDone}
                                          </span>
                                          /{cTotal}
                                        </span>
                                      )}
                                      {/* 담기/빼기 — 담기 단위가 태스크라 행이 주체다.
                                          담기(자주)는 상시, 빼기(드묾)는 행 호버에만. */}
                                      {showTakeControls &&
                                        !taken &&
                                        !it.completed && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              addTaskToSprint(tid);
                                            }}
                                            title={
                                              elsewhere
                                                ? `${selectedSprint?.name ?? "이 스프린트"}로 옮겨 담기`
                                                : `${selectedSprint?.name ?? "스프린트"}에 담기`
                                            }
                                            aria-label={`${it.title} ${selectedSprint?.name ?? "스프린트"}에 담기`}
                                            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent hover:text-white transition-colors"
                                          >
                                            <Plus
                                              className="w-3 h-3"
                                              strokeWidth={2.5}
                                            />
                                            담기
                                          </button>
                                        )}
                                      {showTakeControls && taken && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeTaskFromSprint(tid);
                                          }}
                                          title="스프린트에서 빼기 — 백로그로 돌아가요"
                                          aria-label={`${it.title} 스프린트에서 빼기`}
                                          className="shrink-0 hidden group-hover:inline-flex focus-visible:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold text-rose-500 border border-rose-500/30 hover:bg-rose-500/15 transition-colors"
                                        >
                                          <Minus
                                            className="w-3 h-3"
                                            strokeWidth={2.5}
                                          />
                                          빼기
                                        </button>
                                      )}
                                    </div>
                                    {/* 진행 언더바 — 행 하단 1.5px. 완료 행은 게이지가 무의미해 생략 */}
                                    {cTotal > 0 && !it.completed && (
                                      <span className="absolute inset-x-0 bottom-0 h-[1.5px] bg-foreground/[0.06]">
                                        <span
                                          className={`block h-full transition-all motion-reduce:transition-none ${
                                            taken
                                              ? "bg-bridge-secondary/70"
                                              : "bg-slate-500/50"
                                          }`}
                                          style={{ width: `${rowPct}%` }}
                                        />
                                      </span>
                                    )}
                                  </div>
                                );
                              };
                              return (
                                <div className="bg-bridge-dark p-2 space-y-1 rounded-b-[14px] shadow-[inset_0_1px_3px_-1px_rgba(0,0,0,0.4)]">
                                  {remainingTasks.map(renderTaskRow)}
                                  {doneTasks.length > 0 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleDoneTasks(feat.featureId);
                                        }}
                                        aria-expanded={showDone}
                                        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-400 hover:bg-foreground/[0.04] transition-colors"
                                      >
                                        <Check
                                          className="w-3 h-3 text-emerald-600 dark:text-emerald-400"
                                          strokeWidth={3}
                                        />
                                        완료 {doneTasks.length}개{" "}
                                        {showDone ? "접기" : "보기"}
                                        <ChevronDown
                                          className={`w-3 h-3 transition-transform motion-reduce:transition-none ${
                                            showDone ? "rotate-180" : ""
                                          }`}
                                        />
                                      </button>
                                      {showDone && doneTasks.map(renderTaskRow)}
                                    </>
                                  )}
                                  {/* 인라인 태스크 생성(갈래 ①) — 백로그로 생성된다.
                                      즉시 담고 싶으면 보드 피쳐 컬럼의 입력(갈래 ②)을 쓴다. */}
                                  {canAddTask && renderAddTaskInput()}
                                </div>
                              );
                            })()}
                        </div>
                      </Fragment>
                    );
                  };
                  // 레벨 게이팅: 담기 개념이 없는 화면(묶음 목록)은 섹션 없이 평면 나열
                  if (!uiFeatures.showBacklog) {
                    return tree.map((feat) => renderFeatureCard(feat));
                  }
                  const renderSection = (
                    label: string,
                    feats: TreeFeature[],
                  ) =>
                    feats.length === 0 ? null : (
                      <Fragment key={label}>
                        <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
                          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
                            {label} · {feats.length}
                          </span>
                          <span className="flex-1 h-px bg-foreground/[0.06]" />
                        </div>
                        {feats.map((feat) => renderFeatureCard(feat))}
                      </Fragment>
                    );
                  return (
                    <>
                      {renderSection("이번 스프린트", inSprintTree)}
                      {renderSection("백로그", backlogTree)}
                    </>
                  );
                })()}
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

        {/* 우: 동적 컬럼 보드 (미리보기 중엔 읽기 전용 스냅샷)
            + 하단 미분류 레일. 컬럼 스트립이 세로를 채우고 레일은 바닥에 붙는다. */}
        {/* 바닥 고정 도크(JiraAutofixDock)가 JIRA 뷰 보드 위에 떠 있어 그 높이만큼 여백을 비워 둔다 —
            게이지가 위로 올라가면서 여백을 책임질 자리도 보드 컨테이너로 옮겼다. */}
        <div
          className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-sprint-bg ${
            groupBy === "jira" && jiraConnected ? "pb-[102px] md:pb-[38px]" : ""
          }`}
        >
          {/* JIRA 흐름 게이지 — 이 화면의 유일한 진행률이다("연동 이슈가 마지막 단계까지
              얼마나 갔나"). 보드 바로 위에 두어 컬럼 분포와 눈이 이어지고, 바닥 고정 도크와도
              겹치지 않는다. 스프린트 스코프가 아니라 활성 스프린트 유무는 따지지 않는다. */}
          {groupBy === "jira" &&
            (jiraMirrorReady || hasBlockMapping) &&
            jiraFlow.total > 0 && (
              <div className="shrink-0 border-b border-foreground/[0.08] bg-bridge-obsidian px-3 md:px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">
                  JIRA
                </span>
                <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
                  {jiraFlow.pct}
                  <span className="text-xs text-slate-400">%</span>
                </span>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">
                  {jiraFlow.last?.label ?? "완료"} {jiraFlow.last?.count ?? 0} /
                  전체 {jiraFlow.total}건
                </span>
                {/* 컬럼별 세그먼트 — 앞 단계는 액센트 투명도 스텝, 마지막 단계만 단색으로 끝난 몫을 세운다 */}
                <div className="flex-1 min-w-[120px] h-[6px] rounded-full bg-foreground/10 overflow-hidden flex">
                  {jiraFlow.cols.map((c, i) => {
                    if (c.count === 0) return null;
                    return (
                      <div
                        key={c.key}
                        title={`${c.label} ${c.count}건`}
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${(c.count / jiraFlow.total) * 100}%`,
                          background: jiraFlowSegColor(
                            c,
                            i,
                            jiraFlow.last?.key,
                          ),
                        }}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {jiraFlow.cols.map((c, i) => {
                    if (c.count === 0) return null;
                    const isLast = c.key === jiraFlow.last?.key;
                    return (
                      <span
                        key={c.key}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                          isLast
                            ? "bg-bridge-secondary/15 text-bridge-secondary"
                            : c.tone === "review"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-foreground/[0.06] text-slate-400"
                        }`}
                      >
                        <span
                          className="w-[7px] h-[7px] rounded-sm shrink-0"
                          style={{
                            background: jiraFlowSegColor(
                              c,
                              i,
                              jiraFlow.last?.key,
                            ),
                          }}
                        />
                        {c.label} {c.count}
                      </span>
                    );
                  })}
                  {jiraRejected > 0 && (
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 tabular-nums"
                      title="JIRA에서 반려된 이슈"
                    >
                      반려 {jiraRejected}
                    </span>
                  )}
                </div>
              </div>
            )}
          {/* 좌: 가로 스크롤 컬럼 스트립 / 우: In Review·Done 고정 도크(스프린트 화면 전용).
              도크는 스크롤 컨테이너 밖 flex 형제라 Feature 컬럼 수와 무관하게 항상 보인다. */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* JIRA 화면은 스프린트 스코프가 아니다 — 선택한 버킷이 비어 있어도
                연동 이슈는 그대로 보여야 하므로 버킷 검사보다 앞에 둔다. */}
            {groupBy === "jira" ? (
              jiraMetaLoading && !jiraMeta ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
                </div>
              ) : !(jiraMirrorReady || hasBlockMapping) ? (
                // 미러 미준비(레거시 매핑도 없음) → 온보딩 가이드로 셋업 안내
                <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
                  <JiraOnboardingGuide
                    boardId={boardId}
                    status={jiraStatus}
                    onOpenSettings={() => setShowJiraModal(true)}
                    onReady={() => refreshJiraState(true)}
                  />
                </div>
              ) : (
                <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
                  <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
                    {jiraColumns.map((col) => renderJiraColumn(col))}
                  </div>
                </div>
              )
            ) : !selectedSprint ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full">
                <Flag className="w-8 h-8 text-bridge-secondary/60" />
                <p className="text-sm font-bold text-foreground">
                  이 마일스톤에는 스프린트가 없습니다
                </p>
                <p className="text-xs text-slate-500">
                  마일스톤 기간을 나누면 태스크를 담을 버킷이 생겨요
                </p>
                {isAdminOrOwner && (
                  <button
                    onClick={() => setSplitOpen(true)}
                    className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
                    title="마일스톤 기간을 스프린트로 나눕니다"
                  >
                    <Split className="w-3.5 h-3.5" />
                    스프린트 나누기
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
                  <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
                    {columns.map((col) => {
                      // 리뷰 옵션이 꺼지면 MIDDLE 컬럼을 내린다 — 단, **비어 있을 때만**.
                      // 카드가 남아 있는데 컬럼을 숨기면 그 카드가 화면에서 사라진다.
                      // 옵션을 끄는 건 "새로 리뷰로 보내지 않겠다"이지 "있던 걸 버리겠다"가 아니다.
                      if (
                        col.kind === "MIDDLE" &&
                        !uiFeatures.has("review") &&
                        col.items.length === 0
                      ) {
                        // 내린 자리에 유령을 세운다 — 첫 번째 MIDDLE에만.
                        // 중간 컬럼이 여럿이면 같은 제안이 여러 칸 반복된다.
                        return col.id === firstMiddleColumn?.id ? (
                          <Fragment key={col.id}>{reviewGhost}</Fragment>
                        ) : null;
                      }
                      // In Review·Done(MIDDLE·END)은 우측 도크(dockColumns)가 맡는다 —
                      // 스크롤 스트립에서 그리면 Feature 컬럼에 밀려 화면 밖으로 사라진다.
                      if (col.kind !== "START") return null;
                      // START("Sprint") 컬럼은 그룹 기준에 따라 Feature/담당자 단위 컬럼들로 확장.
                      // 담기 단위가 태스크라 컬럼은 "담긴 태스크가 있는 피쳐"에만 선다 —
                      // 빈 피쳐는 좌측 업무 리스트에서 첫 태스크를 만들어 담아야 등장한다.
                      const grouped =
                        groupBy === "member" ? memberColumns : featureColumns;
                      if (grouped.length > 0) {
                        return (
                          <Fragment key={col.id}>
                            {groupBy === "member"
                              ? memberColumns.map((mc) =>
                                  renderMemberColumn(mc),
                                )
                              : featureColumns
                                  .filter(
                                    (fc) =>
                                      featureFilter.size === 0 ||
                                      featureFilter.has(fc.featureId),
                                  )
                                  .map((fc) => renderFeatureColumn(fc))}
                          </Fragment>
                        );
                      }
                      // 활성 카드가 없으면(전부 In Review/Done·미담김) START 컬럼 자체를 노출(담기 안내)
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
                          className={`w-[260px] shrink-0 flex flex-col rounded-2xl border bg-sprint-col overflow-hidden transition-colors ${
                            dragOverCol === col.id
                              ? "border-bridge-accent/60"
                              : "border-sprint-border"
                          }`}
                        >
                          {renderStageColumnInner(col)}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* 우측 도크 — In Review·Done(접힘/펼침은 renderDockColumn).
                    구성원 뷰에선 숨긴다 — "지금 누가 뭘 하나"에 집중하는 화면이라서다.
                    카드를 리뷰/완료로 보내는 건 카드 액션 버튼(showReview/showDone)이 대신한다. */}
                {groupBy !== "member" && dockColumns.length > 0 && (
                  <div className="shrink-0 flex gap-2 py-3 md:py-4 pr-3 md:pr-4">
                    {dockColumns.map((col) => renderDockColumn(col))}
                  </div>
                )}
              </>
            )}
          </div>
          {/* 미분류 레일 — 구성원 뷰 전용. 미리보기(읽기 전용 스냅샷)에선 숨긴다. */}
          {!!scopeSprintId && groupBy === "member" && renderUncategorizedRail()}
        </div>
      </div>

      {/* 피쳐 지정 모달 — 미분류 레일의 "피쳐 없음" 카드에 피쳐를 붙인다.
          레일이 overflow 컨테이너라 인라인 드롭다운은 잘린다. 모달이 유일하게 안전한 표면. */}
      <MotionModal
        open={!!featurePickerFor}
        onClose={() => setFeaturePickerFor(null)}
        accentColor
        aria-labelledby="uncat-feature-title"
        className="w-full sm:max-w-sm"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
            <Layers className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h4
              id="uncat-feature-title"
              className="text-sm font-bold text-foreground"
            >
              어떤 피쳐에 속하나요?
            </h4>
            <p className="text-xs text-slate-500 truncate">
              {featurePickerTarget?.title}
            </p>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          {featureChoices.length === 0 ? (
            <p className="text-sm text-slate-400">
              선택할 피쳐가 없어요. 좌측 업무 리스트에서 피쳐를 먼저 만들어
              주세요.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto custom-scrollbar space-y-1">
              {featureChoices.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    featurePickerTarget &&
                    setCardFeature(featurePickerTarget, f.id)
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left border border-transparent hover:border-foreground/10 hover:bg-foreground/5 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: f.color ?? "#6366F1" }}
                  />
                  <span className="text-sm text-foreground truncate">
                    {f.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc 닫기</span>
          <button
            onClick={() => setFeaturePickerFor(null)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
          >
            취소
          </button>
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
          {selectedSprint && (
            <span className="text-xs text-slate-500 truncate min-w-0">
              · {selectedSprint.name}
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
              체크리스트 {sprintProgress.done} / {sprintProgress.total}
            </span>
            {sprintProgress.nToday > 0 && (
              <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary tabular-nums">
                ▲ {sprintProgress.nToday}
              </span>
            )}
          </div>
          {/* 4색 스택 바: 기존완료 / 오늘완료 / 진행중 / 미완료(트랙).
              길이는 체크리스트 줄 비율, 아래 범례·탭의 숫자는 태스크 건수다. */}
          <div
            className="h-2 bg-slate-600 rounded-full overflow-hidden relative"
            title="막대 길이는 체크리스트 줄 기준, 아래 숫자는 태스크 건수"
          >
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
                                  backgroundColor: assigneeHex(it.assignee),
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

      {/* 스프린트 나누기 — 개수·기간 경계·태스크 배분을 한 화면에서 정한다(관리자) */}
      <SprintSplitModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        milestoneStart={milestone?.start_date ?? null}
        milestoneEnd={milestone?.end_date ?? null}
        currentCount={board?.sprints?.length ?? 0}
        currentBoundaries={(board?.sprints ?? [])
          .slice()
          .sort((a, b) => a.sequence_no - b.sequence_no)
          .slice(1)
          .map((s) => s.start_date)}
        onSubmit={(payload) => void submitSplit(payload)}
      />

      {/* 구성원 개인 간트 · 업무 배치 모달 — 체크리스트 start/due를 간트로 편집(즉시 저장) */}
      <SprintMemberGanttModal
        open={!!ganttMemberId}
        onClose={() => setGanttMemberId(null)}
        boardId={boardId}
        canEdit={canEdit}
        member={retainedGantt?.member ?? null}
        memberColor={
          retainedGantt?.member
            ? memberColorMap?.[retainedGantt.member.id]
            : null
        }
        items={retainedGantt?.items ?? []}
        sprintName={selectedSprint?.name ?? null}
        sprintStart={selectedSprint?.start_date ?? null}
        sprintEnd={selectedSprint?.end_date ?? null}
        onOpenChecklistItem={onOpenChecklistItem}
        onSaved={silentReload}
      />
      {milestoneId && (
        <MilestoneConsoleModal
          open={consoleOpen}
          onClose={() => {
            setConsoleOpen(false);
            silentReload();
          }}
          boardId={boardId}
          milestoneId={milestoneId}
          milestoneTitle={milestones.find((m) => m.id === milestoneId)?.title}
          milestones={milestones}
          canEdit={canEdit}
          onOpenChecklistItem={onOpenChecklistItem}
        />
      )}

      {/* 마일스톤 JIRA 스코프 설정 — 이 마일스톤의 JIRA 뷰가 비출 범위(JQL)를 정한다.
          저장/해제 후 보드 풀 리프레시로 jira_tasks·머리말이 스코프 기준으로 바뀐다. */}
      <JiraScopeModal
        open={showScopeModal}
        onClose={() => setShowScopeModal(false)}
        boardId={boardId}
        milestoneId={milestoneId}
        milestoneTitle={milestones.find((m) => m.id === milestoneId)?.title}
        scope={board?.jira_scope ?? null}
        projectKey={jiraStatus?.project_key}
        onSaved={() => refreshJiraState(true)}
      />

      {/* JIRA 연동 관리 모달 — 알림 드롭다운의 설정 패널을 스프린트에서 그대로 재사용.
          연결·미러 대상 보드 선택·미러 시작·해제까지 한 곳에서. (같은 boardId라 드롭다운과 자동 동기화) */}
      <MotionModal
        open={showJiraModal}
        onClose={() => {
          setShowJiraModal(false);
          // 연결/해제/미러보드 선택 결과를 스프린트에 반영 (상태·메타·보드 풀 리프레시)
          refreshJiraState(true);
        }}
        accentColor
        aria-labelledby="sprint-jira-title"
        className="w-full sm:max-w-md"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
            <Diamond className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h4
              id="sprint-jira-title"
              className="text-sm font-bold text-foreground"
            >
              JIRA 연동
            </h4>
            <p className="text-xs text-slate-500 truncate">
              이 스프린트 보드에 맞는 JIRA 보드를 연결하세요
            </p>
          </div>
        </div>
        <div className="px-4 pb-5 pt-4">
          <JiraSettingsPanel
            boardId={boardId}
            onJiraStatusChange={handleJiraStatusChange}
          />
        </div>
      </MotionModal>

      {/* 자동수정 하단 도크 — 보드를 보면서 후보를 고를 수 있어야 해서 여기 둔다.
          단 그 "보드"는 JIRA 화면이다. 후보도 결과(PR)도 전부 JIRA 이슈 단위라
          스프린트 화면 바닥을 상시 차지할 이유가 없다(여백 보정도 JIRA 때만 걸려 있다). */}
      <JiraAutofixDock
        boardId={boardId}
        enabled={jiraConnected && groupBy === "jira"}
        onOpenTask={openTask}
      />
    </div>
  );
}
