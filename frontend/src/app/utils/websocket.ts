import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';

// WebSocket URL 생성 (http:// → ws://, https:// → wss://)
const WS_URL = (() => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
  const wsBase = baseUrl
    .replace('/api/v1', '')
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');
  return `${wsBase}/ws`;
})();

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type ConnectionListener = (status: ConnectionStatus) => void;

/**
 * WebSocket Manager - STOMP 클라이언트 싱글톤
 *
 * 핵심 기능:
 * - JWT 인증 (STOMP CONNECT 헤더에 토큰 전달)
 * - 자동 재연결 (exponential backoff)
 * - 연결 상태 관리
 * - 구독 관리
 */
class WebSocketManager {
  private client: Client | null = null;
  private statusListeners: Set<ConnectionListener> = new Set();
  private status: ConnectionStatus = 'disconnected';
  private subscriptions: Map<string, StompSubscription> = new Map();
  private isConnecting = false;

  /**
   * WebSocket 연결 시작
   */
  connect(): void {
    if (this.client?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.updateStatus('connecting');

    const token = localStorage.getItem('access_token');

    this.client = new Client({
      brokerURL: WS_URL,
      connectHeaders: {
        Authorization: token ? `Bearer ${token}` : '',
      },
      debug: (str) => {
        if (import.meta.env.DEV) {
          console.log('[WebSocket]', str);
        }
      },
      reconnectDelay: 5000, // 5초 재연결
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onConnect: (frame: IFrame) => {
        this.isConnecting = false;
        this.updateStatus('connected');
        console.log('[WebSocket] Connected', frame);
      },

      onStompError: (frame: IFrame) => {
        this.isConnecting = false;
        this.updateStatus('error');
        console.error('[WebSocket] STOMP Error:', frame.headers['message'], frame.body);
      },

      onWebSocketClose: () => {
        this.isConnecting = false;
        this.updateStatus('disconnected');
        console.log('[WebSocket] Connection closed');
      },

      onWebSocketError: (event) => {
        this.isConnecting = false;
        this.updateStatus('error');
        console.error('[WebSocket] WebSocket Error:', event);
      },
    });

    this.client.activate();
  }

  /**
   * WebSocket 연결 종료
   */
  disconnect(): void {
    if (this.client) {
      // 모든 구독 해제
      this.subscriptions.forEach((sub) => sub.unsubscribe());
      this.subscriptions.clear();

      this.client.deactivate();
      this.client = null;
      this.isConnecting = false;
      this.updateStatus('disconnected');
    }
  }

  /**
   * 토픽 구독
   * @param destination 구독할 토픽 경로 (예: /topic/board/{boardId})
   * @param callback 메시지 수신 콜백
   * @returns 구독 해제 함수를 담은 객체
   */
  subscribe(
    destination: string,
    callback: (message: IMessage) => void
  ): { unsubscribe: () => void } | null {
    if (!this.client?.connected) {
      console.warn('[WebSocket] Cannot subscribe - not connected');
      return null;
    }

    try {
      const subscription = this.client.subscribe(destination, callback);
      this.subscriptions.set(destination, subscription);

      return {
        unsubscribe: () => {
          subscription.unsubscribe();
          this.subscriptions.delete(destination);
        },
      };
    } catch (error) {
      console.error('[WebSocket] Subscribe error:', error);
      return null;
    }
  }

  /**
   * 현재 연결 상태 반환
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * 연결 상태 변경 리스너 등록
   * @param listener 상태 변경 콜백
   * @returns 리스너 제거 함수
   */
  onStatusChange(listener: ConnectionListener): () => void {
    this.statusListeners.add(listener);
    // 현재 상태를 즉시 전달
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * 연결 상태 업데이트 (내부 메서드)
   */
  private updateStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => listener(newStatus));
    }
  }
}

// 싱글톤 인스턴스 export
export const wsManager = new WebSocketManager();
