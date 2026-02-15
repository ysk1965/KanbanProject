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

/** 구독 레지스트리 엔트리 */
interface SubscriptionEntry {
  destination: string;
  callback: (message: IMessage) => void;
  stompSub: StompSubscription | null;
}

/** 재연결 백오프 설정 */
const RECONNECT = {
  BASE_DELAY: 1000,   // 첫 재시도: 1초
  MAX_DELAY: 30000,   // 최대 대기: 30초
  JITTER_MAX: 1000,   // 랜덤 지터: 0~1초
} as const;

/**
 * WebSocket Manager - STOMP 클라이언트 싱글톤 (구독 중심 연결 수명 관리)
 *
 * 핵심 설계:
 * - 구독이 1개라도 있으면 연결 유지, 0개면 자동 종료
 * - 훅에서는 subscribe/unsubscribe만 호출 (connect/disconnect 직접 호출 불필요)
 * - 재연결 시 beforeConnect에서 최신 JWT 토큰 주입
 * - 재연결 성공 시 모든 등록된 구독 자동 복원
 * - Exponential backoff + jitter로 재연결 (thundering herd 방지)
 * - Heartbeat 10초 (서버와 정렬)
 */
class WebSocketManager {
  private client: Client | null = null;
  private statusListeners: Set<ConnectionListener> = new Set();
  private status: ConnectionStatus = 'disconnected';
  private subscriptions: Map<string, SubscriptionEntry> = new Map();
  private isConnecting = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subIdCounter = 0;
  private reconnectAttempt = 0;

  /**
   * Exponential backoff + jitter 계산
   */
  private getReconnectDelay(): number {
    const exponential = Math.min(
      RECONNECT.BASE_DELAY * Math.pow(2, this.reconnectAttempt),
      RECONNECT.MAX_DELAY
    );
    const jitter = Math.random() * RECONNECT.JITTER_MAX;
    return exponential + jitter;
  }

  /**
   * 내부 연결 시작 - subscribe()에 의해 자동 호출
   */
  private connect(): void {
    if (this.client?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.reconnectAttempt = 0;
    this.updateStatus('connecting');

    this.client = new Client({
      brokerURL: WS_URL,
      connectHeaders: {},
      debug: (str) => {
        if (import.meta.env.DEV) {
          console.log('[WebSocket]', str);
        }
      },
      reconnectDelay: RECONNECT.BASE_DELAY,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      // 매 연결/재연결 직전에 최신 JWT 토큰 주입
      beforeConnect: () => {
        const token = localStorage.getItem('access_token');
        if (this.client) {
          this.client.connectHeaders = {
            Authorization: token ? `Bearer ${token}` : '',
          };
        }
      },

      onConnect: () => {
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        // 성공 시 reconnectDelay를 기본값으로 리셋
        if (this.client) {
          this.client.reconnectDelay = RECONNECT.BASE_DELAY;
        }
        this.updateStatus('connected');
        console.log('[WebSocket] Connected');
        // 모든 등록된 구독 자동 복원
        this.resubscribeAll();
      },

      onStompError: (frame: IFrame) => {
        this.isConnecting = false;
        this.updateStatus('error');
        console.error('[WebSocket] STOMP Error:', frame.headers['message'], frame.body);
      },

      onWebSocketClose: () => {
        this.isConnecting = false;
        // STOMP 구독 참조 무효화 (레지스트리는 유지 → 재연결 시 복원)
        this.subscriptions.forEach((entry) => {
          entry.stompSub = null;
        });
        // Exponential backoff: 다음 재연결 지연 시간 설정
        this.reconnectAttempt++;
        if (this.client) {
          this.client.reconnectDelay = this.getReconnectDelay();
        }
        this.updateStatus('disconnected');
        console.log(
          `[WebSocket] Connection closed (next retry in ${this.client?.reconnectDelay ?? 0}ms, attempt #${this.reconnectAttempt})`
        );
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
   * 내부 연결 종료 - 구독 0개일 때 자동 호출
   */
  private disconnect(): void {
    if (this.client) {
      this.subscriptions.forEach((entry) => {
        entry.stompSub?.unsubscribe();
        entry.stompSub = null;
      });

      this.client.deactivate();
      this.client = null;
      this.isConnecting = false;
      this.reconnectAttempt = 0;
      this.updateStatus('disconnected');
    }
  }

  /**
   * 연결 성공 후 모든 등록된 구독 복원 (재연결 시 자동 호출)
   */
  private resubscribeAll(): void {
    if (!this.client?.connected) return;

    this.subscriptions.forEach((entry) => {
      try {
        entry.stompSub = this.client!.subscribe(entry.destination, entry.callback);
      } catch (error) {
        console.error(`[WebSocket] Resubscribe failed for ${entry.destination}:`, error);
      }
    });
  }

  /**
   * 활성 구독이 없으면 지연 후 연결 종료
   */
  private scheduleDisconnectIfEmpty(): void {
    if (this.subscriptions.size === 0) {
      this.disconnectTimer = setTimeout(() => {
        if (this.subscriptions.size === 0) {
          this.disconnect();
        }
      }, 2000);
    }
  }

  /**
   * 토픽 구독
   *
   * - 연결되지 않은 경우 자동 연결 시작
   * - 연결 중이면 레지스트리에 등록 후 연결 완료 시 자동 구독
   * - 재연결 시 자동 재구독
   *
   * @param destination 구독할 토픽 경로 (예: /topic/board/{boardId})
   * @param callback 메시지 수신 콜백
   * @returns 구독 해제 함수를 담은 객체 (항상 non-null)
   */
  subscribe(
    destination: string,
    callback: (message: IMessage) => void
  ): { unsubscribe: () => void } {
    const id = `sub-${++this.subIdCounter}`;

    // disconnect 타이머 취소 (새 구독이 들어왔으므로)
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    const entry: SubscriptionEntry = {
      destination,
      callback,
      stompSub: null,
    };

    this.subscriptions.set(id, entry);

    // 이미 연결되어 있으면 즉시 STOMP 구독
    if (this.client?.connected) {
      try {
        entry.stompSub = this.client.subscribe(destination, callback);
      } catch (error) {
        console.error('[WebSocket] Subscribe error:', error);
      }
    }

    // 연결이 없으면 자동 연결 (onConnect에서 resubscribeAll로 구독 복원)
    if (!this.client?.connected && !this.isConnecting) {
      this.connect();
    }

    return {
      unsubscribe: () => {
        entry.stompSub?.unsubscribe();
        entry.stompSub = null;
        this.subscriptions.delete(id);
        this.scheduleDisconnectIfEmpty();
      },
    };
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

  /**
   * 강제 연결 종료 (로그아웃 등 명시적 종료 시)
   */
  forceDisconnect(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.subscriptions.clear();
    this.disconnect();
  }
}

// 싱글톤 인스턴스 export
export const wsManager = new WebSocketManager();
