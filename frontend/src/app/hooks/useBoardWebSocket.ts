import { useEffect, useRef, useState } from "react";
import { wsManager, ConnectionStatus } from "../utils/websocket";
import { useAuth } from "../contexts/AuthContext";
import { CLIENT_ID } from "../utils/clientId";
import { BoardWebSocketEvent } from "../types";

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
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
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

          // 프레즌스는 사용자 단위로 자기 자신을 스킵 — 내 다른 탭 접속을
          // 온라인 목록에 띄우지 않는다 (기존 동작 유지)
          if (
            event.type === "PRESENCE_JOINED" ||
            event.type === "PRESENCE_LEFT"
          ) {
            if (event.user_id === currentUser?.id) {
              return;
            }
            if (event.type === "PRESENCE_JOINED") {
              setOnlineUsers((prev) => new Set(prev).add(event.user_id));
            } else {
              setOnlineUsers((prev) => {
                const next = new Set(prev);
                next.delete(event.user_id);
                return next;
              });
            }
            onEventRef.current(event);
            return;
          }

          // 이 탭에서 보낸 이벤트만 스킵 (낙관적 업데이트로 이미 반영됨).
          // 같은 사용자여도 다른 탭/창/뷰의 변경은 반영해야 하므로
          // user_id가 아니라 client_id(탭 단위)로 거른다.
          if (event.client_id && event.client_id === CLIENT_ID) {
            return;
          }

          // 이벤트 콜백 호출
          onEventRef.current(event);
        } catch (error) {
          console.error(
            "[useBoardWebSocket] Failed to parse board event:",
            error,
          );
        }
      },
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
            console.error(
              "[useBoardWebSocket] Failed to parse user event:",
              error,
            );
          }
        },
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
