/**
 * 백로그 카드 드래그 계약.
 *
 * 상수를 컴포넌트가 아니라 여기에 두는 이유: 드롭을 받는 쪽(간트·타임블록)은
 * 백로그 레일과 무관한 컴포넌트라, 서로를 import하지 않고 이 파일만 공유한다.
 */

/** dataTransfer MIME — PLACEMENT_DRAG_TYPE(배치 레일)과 같은 방식이다 */
export const BACKLOG_DRAG_TYPE = "application/personal-backlog";

/**
 * 드롭 지점이 백로그 레일에게 "이 항목을 이 날짜로 승격시켜라"고 알리는 이벤트.
 *
 * 콜백 prop을 세 컴포넌트에 관통시키는 대신 CustomEvent를 쓴다 —
 * 드롭을 받는 뷰(ScheduleResourceView)는 일정 탭에서도 쓰이고 그쪽엔 백로그가 없다.
 * 듣는 쪽이 없으면 아무 일도 일어나지 않는 게 맞다.
 */
export const BACKLOG_DROP_EVENT = "bridge:backlog-drop";

export interface BacklogDragPayload {
  id: string;
  title: string;
}

export interface BacklogDropDetail {
  id: string;
  /** 놓인 날짜 (yyyy-MM-dd) — 승격되는 태스크의 시작·마감이 된다 */
  date: string;
}
