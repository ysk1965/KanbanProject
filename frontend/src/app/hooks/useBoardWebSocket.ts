import { useEffect, useRef, useState } from 'react';
import { wsManager, ConnectionStatus } from '../utils/websocket';
import { useAuth } from '../contexts/AuthContext';
import { BoardWebSocketEvent } from '../types';

interface UseBoardWebSocketOptions {
  boardId: string | null;
  onEvent: (event: BoardWebSocketEvent) => void;
  enabled?: boolean;
}

/**
 * 보드별 WebSocket 구독 훅
 *
 * 기능:
 * - 보드 전체 이벤트 구독: /topic/board/{boardId}
 * - 개인 이벤트 구독: /topic/board/{boardId}/user/{userId}
 * - 자기 자신의 이벤트 필터링 (낙관적 업데이트로 이미 반영됨)
 * - 연결 상태 추적
 * - 온라인 사용자 목록 (추후 확장 가능)
 *
 * 연결 수명 관리:
 * - subscribe()가 자동으로 연결을 시작/유지
 * - cleanup에서 unsubscribe만 호출 (disconnect 하지 않음)
 * - 모든 구독이 해제되면 WebSocketManager가 자동으로 연결 종료
 * - 재연결 시 구독이 자동으로 복원됨
 */
export function useBoardWebSocket({
  boardId,
  onEvent,
  enabled = true,
}: UseBoardWebSocketOptions) {
  const { currentUser, isAuthenticated } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // ref로 콜백을 관리하여 불필요한 재구독 방지
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    // 조건 확인: boardId, 인증 상태, 활성화 여부
    if (!boardId || !isAuthenticated || !enabled) {
      return;
    }

    // 연결 상태 리스너 (UI 표시용)
    const removeStatusListener = wsManager.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    // 1. 보드 전체 이벤트 구독 (subscribe가 자동으로 연결 시작)
    const boardSub = wsManager.subscribe(
      `/topic/board/${boardId}`,
      (message) => {
        try {
          const event: BoardWebSocketEvent = JSON.parse(message.body);

          // 자기 자신의 이벤트는 스킵 (낙관적 업데이트로 이미 반영됨)
          if (event.user_id === currentUser?.id) {
            return;
          }

          // 프레즌스 이벤트 처리 (온라인 사용자 관리)
          if (event.type === 'PRESENCE_JOINED') {
            setOnlineUsers((prev) => new Set(prev).add(event.user_id));
          } else if (event.type === 'PRESENCE_LEFT') {
            setOnlineUsers((prev) => {
              const next = new Set(prev);
              next.delete(event.user_id);
              return next;
            });
          }

          // 이벤트 콜백 호출
          onEventRef.current(event);
        } catch (error) {
          console.error('[useBoardWebSocket] Failed to parse board event:', error);
        }
      }
    );

    // 2. 개인 이벤트 구독 (알림 등)
    let userSub: { unsubscribe: () => void } | undefined;
    if (currentUser) {
      userSub = wsManager.subscribe(
        `/topic/board/${boardId}/user/${currentUser.id}`,
        (message) => {
          try {
            const event: BoardWebSocketEvent = JSON.parse(message.body);
            // 개인 이벤트는 항상 처리 (알림, 권한 변경 등)
            onEventRef.current(event);
          } catch (error) {
            console.error('[useBoardWebSocket] Failed to parse user event:', error);
          }
        }
      );
    }

    // Cleanup: 구독만 해제 (연결 종료는 WebSocketManager가 자동 관리)
    return () => {
      boardSub.unsubscribe();
      userSub?.unsubscribe();
      removeStatusListener();
    };
  }, [boardId, isAuthenticated, currentUser?.id, enabled]);

  return {
    connectionStatus,
    onlineUsers,
  };
}
