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

    let boardSubscription: { unsubscribe: () => void } | null = null;
    let userSubscription: { unsubscribe: () => void } | null = null;

    const subscribeToTopics = () => {
      // 이미 구독 중이면 스킵
      if (boardSubscription) return;

      // 1. 보드 전체 이벤트 구독
      boardSubscription = wsManager.subscribe(
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
      if (currentUser) {
        userSubscription = wsManager.subscribe(
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
        );
      }
    };

    // 연결 상태 리스너: connected 시 구독
    const removeStatusListener = wsManager.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'connected') {
        subscribeToTopics();
      }
    });

    // WebSocket 연결 시작 (이미 연결 중이면 내부에서 스킵)
    wsManager.connect();

    // 이미 연결된 상태라면 즉시 구독
    if (wsManager.getStatus() === 'connected') {
      subscribeToTopics();
    }

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
