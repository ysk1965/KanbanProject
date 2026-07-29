import type { Task } from "../../types";

// ────────────────────────────────────────────────────────────
// 보드 대시보드 파생 규칙
// 저장값이 아님 — completed / start_date / due_date + 오늘 날짜로 매 렌더 계산.
// checklistStatus.ts(체크리스트 열 파생)와 같은 방식이되, Task 단위로 계산한다.
// ────────────────────────────────────────────────────────────

// D-day 계산은 dateUtils.getDDay()를 쓴다 — 여기서 다시 만들지 않는다.

/** 내 태스크 보드의 4개 열. 앞 2개는 마감일 파생, 뒤 2개는 진행 상태 파생. */
export type TaskBucket = "overdue" | "today" | "doing" | "upcoming";

export const TASK_BUCKETS: TaskBucket[] = [
  "overdue",
  "today",
  "doing",
  "upcoming",
];

/**
 * 태스크가 속할 열을 파생한다. 완료된 태스크는 어느 열에도 담기지 않는다(null).
 *
 * 우선순위: 지연 > 오늘 > 진행 중 > 예정
 * - overdue : 마감일이 오늘보다 이전
 * - today   : 마감일이 오늘
 * - doing   : 시작일이 오늘 이하 (아직 마감 전)
 * - upcoming: 그 외
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
  return "upcoming";
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
