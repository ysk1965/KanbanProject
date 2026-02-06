/**
 * Analytics Context
 * Firebase Analytics 이벤트 추적을 위한 전역 Context
 */
import { createContext, useContext, useCallback, ReactNode } from 'react';
import { addBreadcrumb } from '../../lib/sentry';

// ============================================
// Event Parameter Types
// ============================================

export interface AnalyticsEventParams {
  // Auth events
  sign_up: { method: 'email' | 'google' };
  login: { method: 'email' | 'google' };
  logout: Record<string, never>;

  // Board events
  board_create: { board_id?: string };
  board_view: { board_id: string };
  board_share: { board_id: string; member_count: number };
  board_delete: { board_id: string };

  // Card events
  card_create: { board_id: string; block_name: string };
  card_view: { board_id: string; card_id: string };
  card_move: { board_id: string; from_block: string; to_block: string };
  card_delete: { board_id: string; card_id: string };

  // Task events
  task_create: { board_id: string; feature_id: string };
  task_complete: { board_id: string; feature_id: string };
  task_move: { board_id: string; from_block: string; to_block: string };

  // Collaboration events
  comment_add: { board_id: string; target_type: 'card' | 'board' };
  member_invite: { board_id: string; role: string };
  file_upload: { board_id: string; file_type: string; size_kb: number };

  // Payment events
  subscription_view: { board_id: string };
  payment_start: { board_id: string; plan_type: string };
  payment_complete: { board_id: string; plan_type: string; amount: number };
  payment_fail: { board_id: string; error_code: string };

  // Feature usage events
  feature_use: { feature_name: string; board_id?: string };
  search: { search_term: string; board_id?: string };

  // Error events
  error: { error_type: string; error_message: string };
}

// ============================================
// Context Definition
// ============================================

interface AnalyticsContextType {
  track: <K extends keyof AnalyticsEventParams>(
    eventName: K,
    params: AnalyticsEventParams[K]
  ) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

// ============================================
// Provider Component
// ============================================

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const track = useCallback(
    <K extends keyof AnalyticsEventParams>(
      eventName: K,
      params: AnalyticsEventParams[K]
    ): void => {
      // Firebase Analytics로 이벤트 전송 (동적 import로 광고 차단기 대응)
      import('firebase/analytics')
        .then(({ logEvent }) => {
          return import('../../lib/firebase').then(({ analytics }) => {
            if (analytics) {
              logEvent(analytics, eventName as string, params as Record<string, unknown>);
            }
          });
        })
        .catch(() => {
          console.debug(`[Analytics] Firebase unavailable for: ${eventName}`);
        });

      // Sentry breadcrumb으로도 기록 (디버깅용)
      addBreadcrumb({
        category: 'analytics',
        message: eventName,
        data: params as Record<string, unknown>,
        level: 'info',
      });

      // 개발 환경에서 로그 출력
      if (import.meta.env.DEV) {
        console.debug(`[Analytics] ${eventName}`, params);
      }
    },
    []
  );

  return (
    <AnalyticsContext.Provider value={{ track }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useAnalyticsContext(): AnalyticsContextType {
  const context = useContext(AnalyticsContext);
  if (!context) {
    // Analytics가 설정되지 않아도 앱이 작동하도록 fallback 제공
    return {
      track: (eventName, params) => {
        if (import.meta.env.DEV) {
          console.debug(`[Analytics] (no provider) ${eventName}`, params);
        }
      },
    };
  }
  return context;
}

// ============================================
// Utility: Direct tracking function (for use outside React)
// ============================================

export function trackEvent<K extends keyof AnalyticsEventParams>(
  eventName: K,
  params: AnalyticsEventParams[K]
): void {
  import('firebase/analytics')
    .then(({ logEvent }) => {
      return import('../../lib/firebase').then(({ analytics }) => {
        if (analytics) {
          logEvent(analytics, eventName as string, params as Record<string, unknown>);
        }
      });
    })
    .catch(() => {
      console.debug(`[Analytics] Firebase unavailable for: ${eventName}`);
    });

  addBreadcrumb({
    category: 'analytics',
    message: eventName,
    data: params as Record<string, unknown>,
    level: 'info',
  });
}
