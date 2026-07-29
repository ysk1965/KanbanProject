import type { Task } from "../../types";

// ────────────────────────────────────────────────────────────
// 보드 대시보드 파생 규칙
// 저장값이 아님 — completed / start_date / due_date + 오늘 날짜로 매 렌더 계산.
// checklistStatus.ts(체크리스트 열 파생)와 같은 방식이되, Task 단위로 계산한다.
// ────────────────────────────────────────────────────────────

// D-day 계산은 dateUtils.getDDay()를 쓴다 — 여기서 다시 만들지 않는다.

/**
 * 내 태스크 보드의 5개 열.
 * 앞 2개는 마감일 파생, 그다음은 진행 상태, 마지막은 "날짜가 아직 없는 것".
 */
export type TaskBucket =
  | "overdue"
  | "today"
  | "doing"
  | "upcoming"
  | "unscheduled";

export const TASK_BUCKETS: TaskBucket[] = [
  "overdue",
  "today",
  "doing",
  "upcoming",
  "unscheduled",
];

/**
 * 태스크가 속할 열을 파생한다. 완료된 태스크는 어느 열에도 담기지 않는다(null).
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
 *
 * 날짜 없는 태스크를 "예정"에 섞으면 계획해야 할 일이 계획된 일처럼 보인다.
 * 그래서 마지막 열로 따로 뺀다.
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
