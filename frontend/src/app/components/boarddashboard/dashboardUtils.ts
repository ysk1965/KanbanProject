import type { Task } from "../../types";
import { getTodayDateString, toDateInputValue } from "../../utils/dateUtils";

/**
 * 워크로드(간트) 카드 높이.
 *
 * 대시보드는 보고 있는 대상 1명만 간트에 넘기므로 담당자 행이 늘 하나다.
 * 그런데 ScheduleResourceView는 부모가 준 높이를 채우는 구조라(root가 flex-1)
 * 높이를 안 주면 내용 높이로 접히지 않고 0으로 무너진다 —
 * 그래서 "한 줄이 들어가는 높이"를 여기서 정해 준다.
 *
 * 근거(ScheduleResourceView 상수 기준):
 *   카드 헤더 45 + 타임라인 헤더 48 + 마일스톤 밴드 48 + 이벤트 밴드 48
 *   + 직무 그룹 줄 36 + 담당자 행 116(바 3레인 = 3*(32+4)+8).
 *
 * 담당자 행은 겹치는 바 수만큼 늘어나므로 한 줄(80)로 잡으면 바로 잘린다 —
 * 흔한 3레인까지는 스크롤 없이 보이게 잡는다. 그 이상은 간트가 자체 스크롤한다.
 * 나머지 세로 공간은 전부 아래 큐가 가져간다(늘 자리가 모자란 쪽이 큐다).
 */
export const WORKLOAD_CARD_HEIGHT = 344;

/**
 * ISO 시각(UTC)에서 오늘까지 지난 날짜 수. 오늘 만든 것은 0, 값이 없으면 null.
 *
 * 백로그 카드의 "방치 일수"에 쓴다 — 백로그를 다시 열게 만드는 건 개수가 아니라 이 숫자다.
 * 시각이 아니라 로컬 날짜끼리 빼므로 자정을 넘기면 1일이 된다.
 */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = toDateInputValue(iso);
  if (!then) return null;
  const from = new Date(`${then}T00:00:00`).getTime();
  const to = new Date(`${getTodayDateString()}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const diff = Math.round((to - from) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

/** 이 일수를 넘기면 방치로 본다 — 한 주가 통째로 지나간 시점 */
export const BACKLOG_STALE_DAYS = 7;

// ────────────────────────────────────────────────────────────
// 보드 대시보드 파생 규칙
// 저장값이 아님 — completed / start_date / due_date + 오늘 날짜로 매 렌더 계산.
// checklistStatus.ts(체크리스트 열 파생)와 같은 방식이되, Task 단위로 계산한다.
// ────────────────────────────────────────────────────────────

// D-day 계산은 dateUtils.getDDay()를 쓴다 — 여기서 다시 만들지 않는다.

/**
 * 태스크의 진행 상태 구분. KPI(지연 건수)와 필터에서 쓴다.
 * 앞 2개는 마감일 파생, 그다음은 진행 상태, 마지막은 "날짜가 아직 없는 것".
 */
export type TaskBucket =
  "overdue" | "today" | "doing" | "upcoming" | "unscheduled";

/**
 * 태스크가 속할 구간을 파생한다. 완료된 태스크는 어디에도 담기지 않는다(null).
 *
 * 우선순위: 지연 > 오늘 > 진행 중 > 예정 > 일정 미정
 * - overdue    : 마감일이 오늘보다 이전
 * - today      : 마감일이 오늘
 * - doing      : 시작일이 지났거나, 체크리스트를 일부 처리한 상태
 * - upcoming   : 시작일이나 마감일이 잡혀 있고 아직 착수 전
 * - unscheduled: 시작일·마감일이 둘 다 없음 — 언제 할지 아직 안 정한 것
 *
 * 날짜를 안 채우는 팀도 있어서 시작일만으로는 "진행 중"이 늘 비어 버린다.
 * 체크리스트가 일부라도 완료됐으면 착수한 것으로 본다.
 */
export function resolveTaskBucket(
  task: Task,
  today: string,
): TaskBucket | null {
  if (task.completed) return null;
  if (task.due_date) {
    if (task.due_date < today) return "overdue";
    if (task.due_date === today) return "today";
  }
  if (task.start_date && task.start_date <= today) return "doing";
  if ((task.checklist_completed ?? 0) > 0) return "doing";
  if (task.start_date || task.due_date) return "upcoming";
  return "unscheduled";
}

/** 로그인 사용자가 담당(체크리스트 담당자)으로 걸린 태스크인지. */
export function isAssignedTo(task: Task, userId: string | undefined): boolean {
  if (!userId) return false;
  return (task.assignees ?? []).some((a) => a.id === userId);
}

/** "HH:mm:ss" | "HH:mm" → 자정 기준 분. 파싱 실패 시 null. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** "HH:mm:ss" → "HH:mm" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

/** 분 → "6.5h" 형태의 짧은 표기 */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}
