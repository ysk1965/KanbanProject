import { Task } from "../types";

/**
 * 피처(서브태스크 리스트) 내 태스크 표시 순서 비교자.
 * feature_position 기준, 동률이면 position → created_at → id 순으로 안정 정렬.
 * (feature_position 백필 전 데이터는 position 값이 복사되어 있어 동률이 발생할 수 있다)
 */
export function compareFeatureOrder(a: Task, b: Task): number {
  const fa = a.feature_position ?? a.position;
  const fb = b.feature_position ?? b.position;
  if (fa !== fb) return fa - fb;
  if (a.position !== b.position) return a.position - b.position;
  if (a.created_at && b.created_at && a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 피처 내 표시 순서로 정렬한 새 배열 반환 */
export function sortByFeatureOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(compareFeatureOrder);
}
