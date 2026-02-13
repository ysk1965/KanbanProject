import { useEffect, useCallback, useState } from 'react';
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
 * @param boardId 구독할 보드 ID
 * @param onEvent 이벤트 수신 콜백
 * @param enabled 구독 활성화 여부 (기본: true)
 */
export function useBoardWebSocket({
  boardId,
  onEvent,
  enabled = true,
}: UseBoardWebSocketOptions) {
  const { currentUser, isAuthenticated } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 조건 확인: boardId, 인증 상태, 활성화 여부
    if (!boardId || !isAuthenticated || !enabled) {
      return;
    }

    // WebSocket 연결 시작
    wsManager.connect();

    // 1. 보드 전체 이벤트 구독
    const boardSubscription = wsManager.subscribe(
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
          onEvent(event);
        } catch (error) {
          console.error('[useBoardWebSocket] Failed to parse board event:', error);
        }
      }
    );

    // 2. 개인 이벤트 구독 (알림 등)
    const userSubscription = currentUser
      ? wsManager.subscribe(
          `/topic/board/${boardId}/user/${currentUser.id}`,
          (message) => {
            try {
              const event: BoardWebSocketEvent = JSON.parse(message.body);
              // 개인 이벤트는 항상 처리 (알림, 권한 변경 등)
              onEvent(event);
            } catch (error) {
              console.error('[useBoardWebSocket] Failed to parse user event:', error);
            }
          }
        )
      : null;

    // 3. 연결 상태 리스너 등록
    const removeStatusListener = wsManager.onStatusChange(setConnectionStatus);

    // Cleanup: 컴포넌트 언마운트 시 구독 해제
    return () => {
      boardSubscription?.unsubscribe();
      userSubscription?.unsubscribe();
      removeStatusListener();
      wsManager.disconnect();
    };
  }, [boardId, isAuthenticated, currentUser?.id, enabled, onEvent]);

  return {
    connectionStatus,
    onlineUsers,
  };
}
