import { useEffect, useRef } from 'react';
import { wsManager } from '../utils/websocket';
import { useAuth } from '../contexts/AuthContext';
import { BoardWebSocketEvent, BoardEventType } from '../types';

/**
 * 스프린트 보드 투영(게이지·컬럼·담당자 그룹·좌측 트리)에 영향을 주는 이벤트 집합.
 * 이 중 하나가 도착하면 스프린트 보드를 재조회한다.
 *
 * - CHECKLIST_*  : 완료 토글/담당자·날짜 변경/생성·삭제·이동 → 게이지·카드·컬럼 반영
 * - SPRINT_UPDATED : 스프린트 네이티브 뮤테이션(담기/빼기/컬럼 이동·CRUD/on-off/라이프사이클)
 * - TASK_*       : 태스크 제목/이동/삭제 → 태스크 소그룹·컬럼 반영
 * - FEATURE_*    : 피쳐 제목/삭제 → 피쳐 그룹 반영
 * - MEMBER_UPDATED : 담당자 이름·색상 변경 → 구성원 컬럼/아바타 반영
 *
 * COMMENT_/NOTIFICATION_/PRESENCE_/MEETING_/NOTE_/SCHEDULE_ 등 스프린트 화면과
 * 무관한 이벤트는 재조회를 트리거하지 않는다.
 */
const SPRINT_RELEVANT_EVENTS: ReadonlySet<BoardEventType> = new Set<BoardEventType>([
  'CHECKLIST_TOGGLED',
  'CHECKLIST_UPDATED',
  'CHECKLIST_CREATED',
  'CHECKLIST_DELETED',
  'CHECKLIST_RESTORED',
  'CHECKLIST_MOVED',
  'SPRINT_UPDATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_DELETED',
  'TASK_RESTORED',
  'FEATURE_UPDATED',
  'FEATURE_DELETED',
  'FEATURE_RESTORED',
  'MEMBER_UPDATED',
]);

interface UseSprintRealtimeOptions {
  boardId: string | null;
  /** 관련 이벤트 수신 시 호출(디바운스됨) — 보통 스프린트 보드 무음 재조회 */
  onRelevantEvent: () => void;
  enabled?: boolean;
  /** 이벤트 폭주를 합치기 위한 디바운스(ms) */
  debounceMs?: number;
}

/**
 * 스프린트 보드 실시간 동기화 훅
 *
 * 배경: SprintBoard는 `sprintAPI.getSprintBoard`로 자체 상태를 그리는 별도 화면이라,
 * 블록 보드용 실시간 파이프라인(KanbanBoardPage 상태 갱신)의 바깥에 있었다.
 * 이 훅이 `/topic/board/{boardId}`를 직접 구독해, 스프린트 투영에 영향을 주는
 * 이벤트가 오면 디바운스된 재조회를 호출한다.
 *
 * useBoardWebSocket과의 차이 — **자기 자신의 이벤트를 필터링하지 않는다.**
 * 블록 보드는 낙관적 업데이트로 본인 변경을 이미 반영하지만, 스프린트 보드는
 * 낙관적 경로가 없다. 따라서 본인이 태스크 모달에서 완료/담당자를 바꾼 경우에도
 * 백엔드가 브로드캐스트한 이벤트를 여기서 받아 재조회로 뒤 화면에 반영해야 한다.
 *
 * 연결 수명: wsManager가 구독 수를 세어 자동 연결/종료하므로, 이 훅은
 * subscribe/unsubscribe만 담당한다(페이지의 useBoardWebSocket과 연결을 공유).
 */
export function useSprintRealtime({
  boardId,
  onRelevantEvent,
  enabled = true,
  debounceMs = 400,
}: UseSprintRealtimeOptions) {
  const { isAuthenticated } = useAuth();

  // ref로 콜백을 관리하여 콜백 변경 시 재구독을 피한다.
  const onEventRef = useRef(onRelevantEvent);
  onEventRef.current = onRelevantEvent;

  useEffect(() => {
    if (!boardId || !isAuthenticated || !enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onEventRef.current();
      }, debounceMs);
    };

    const sub = wsManager.subscribe(`/topic/board/${boardId}`, (message) => {
      try {
        const event: BoardWebSocketEvent = JSON.parse(message.body);
        // 본인 이벤트도 처리한다(위 주석 참고): 스프린트 보드는 낙관적 갱신이 없다.
        if (SPRINT_RELEVANT_EVENTS.has(event.type)) {
          scheduleReload();
        }
      } catch (error) {
        console.error('[useSprintRealtime] Failed to parse board event:', error);
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [boardId, isAuthenticated, enabled, debounceMs]);
}
