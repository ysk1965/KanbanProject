import type { ChecklistItem } from "../types";

// ────────────────────────────────────────────────────────────
// 체크리스트 상태(열) 파생 규칙
// 저장값이 아님 — completed / start_date / 오늘 날짜 조합으로 매 렌더 계산.
// MiniKanbanView, TaskDetailModal(보드 모드) 공용.
// ────────────────────────────────────────────────────────────
export type ChecklistColumn = "todo" | "doing" | "done";

/** 항목의 현재 열을 파생한다. */
export function resolveChecklistColumn(
  item: ChecklistItem,
  today: string,
): ChecklistColumn {
  if (item.completed) return "done";
  // 시작일이 오늘 이하이면 진행 중 (지난 마감이어도 미완료면 DOING 유지)
  if (item.start_date && item.start_date <= today) return "doing";
  return "todo";
}

/** DOING 내 마감일 초과(지연) 여부. */
export function isChecklistOverdue(
  item: ChecklistItem,
  today: string,
): boolean {
  return !item.completed && item.due_date != null && item.due_date < today;
}
