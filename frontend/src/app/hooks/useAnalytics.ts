/**
 * Firebase Analytics Hook
 * 이벤트 추적을 위한 커스텀 훅
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  logEvent,
  setUserId,
  setUserProperties,
  Analytics,
} from 'firebase/analytics';
import { analytics as firebaseAnalytics } from '../../lib/firebase';

// ============================================
// Analytics Event Types
// ============================================

// 인증 이벤트
type AuthEvents = {
  sign_up: { method: 'email' | 'google' };
  login: { method: 'email' | 'google' };
  logout: Record<string, never>;
};

// 보드 이벤트
type BoardEvents = {
  board_create: { board_id?: string };
  board_view: { board_id: string };
  board_share: { board_id: string; member_count: number };
  board_delete: { board_id: string };
  board_settings_open: { board_id: string };
};

// 카드/피처 이벤트
type CardEvents = {
  card_create: { board_id: string; block_name: string };
  card_view: { board_id: string; card_id: string };
  card_move: { board_id: string; from_block: string; to_block: string };
  card_delete: { board_id: string; card_id: string };
  card_edit: { board_id: string; card_id: string; field: string };
};

// 태스크 이벤트
type TaskEvents = {
  task_create: { board_id: string; feature_id: string };
  task_complete: { board_id: string; feature_id: string };
  task_move: { board_id: string; from_block: string; to_block: string };
  task_delete: { board_id: string; task_id: string };
};

// 협업 이벤트
type CollaborationEvents = {
  comment_add: { board_id: string; target_type: 'card' | 'board' };
  comment_delete: { board_id: string; comment_id: string };
  member_invite: { board_id: string; role: string };
  member_remove: { board_id: string };
  file_upload: { board_id: string; file_type: string; size_kb: number };
};

// 결제 이벤트
type PaymentEvents = {
  subscription_view: { board_id: string };
  payment_start: { board_id: string; plan_type: string };
  payment_complete: { board_id: string; plan_type: string; amount: number };
  payment_fail: { board_id: string; error_code: string };
};

// 일반 이벤트
type GeneralEvents = {
  page_view: { page_name: string; page_path: string };
  search: { search_term: string };
  error: { error_type: string; error_message: string };
  feature_use: { feature_name: string };
};

// 모든 이벤트 타입 통합
type AnalyticsEvents = AuthEvents &
  BoardEvents &
  CardEvents &
  TaskEvents &
  CollaborationEvents &
  PaymentEvents &
  GeneralEvents;

// 사용자 속성 타입
interface UserProperties {
  user_role?: 'owner' | 'admin' | 'member' | 'viewer';
  board_count?: number;
  plan_type?: 'free' | 'paid';
  signup_date?: string;
  theme?: 'dark' | 'light';
}

// ============================================
// Hook Implementation
// ============================================

interface UseAnalyticsReturn {
  trackEvent: <K extends keyof AnalyticsEvents>(
    eventName: K,
    params: AnalyticsEvents[K]
  ) => void;
  setUser: (userId: string | null) => void;
  setProperties: (properties: UserProperties) => void;
  trackPageView: (pageName: string, pagePath?: string) => void;
}

export const useAnalytics = (): UseAnalyticsReturn => {
  const location = useLocation();
  const analyticsRef = useRef<Analytics | null>(firebaseAnalytics);
  const lastPageRef = useRef<string>('');

  // Analytics 인스턴스 업데이트 (lazy initialization 대응)
  useEffect(() => {
    if (!analyticsRef.current && firebaseAnalytics) {
      analyticsRef.current = firebaseAnalytics;
    }
  }, []);

  // 자동 페이지뷰 추적
  useEffect(() => {
    const pagePath = location.pathname + location.search;

    // 같은 페이지 중복 추적 방지
    if (lastPageRef.current === pagePath) return;
    lastPageRef.current = pagePath;

    // 페이지 이름 추출 (경로에서)
    const pageName = getPageNameFromPath(location.pathname);

    if (analyticsRef.current) {
      logEvent(analyticsRef.current, 'page_view', {
        page_name: pageName,
        page_path: pagePath,
      });
    }
  }, [location]);

  // 이벤트 추적
  const trackEvent = useCallback(
    <K extends keyof AnalyticsEvents>(
      eventName: K,
      params: AnalyticsEvents[K]
    ): void => {
      if (!analyticsRef.current) {
        console.debug(`[Analytics] Event (not initialized): ${eventName}`, params);
        return;
      }

      try {
        logEvent(analyticsRef.current, eventName as string, params as Record<string, unknown>);
        console.debug(`[Analytics] Event: ${eventName}`, params);
      } catch (error) {
        console.error(`[Analytics] Failed to track event: ${eventName}`, error);
      }
    },
    []
  );

  // 사용자 ID 설정
  const setUser = useCallback((userId: string | null): void => {
    if (!analyticsRef.current) return;

    try {
      setUserId(analyticsRef.current, userId);
      console.debug(`[Analytics] User ID set: ${userId || 'cleared'}`);
    } catch (error) {
      console.error('[Analytics] Failed to set user ID:', error);
    }
  }, []);

  // 사용자 속성 설정
  const setProperties = useCallback((properties: UserProperties): void => {
    if (!analyticsRef.current) return;

    try {
      setUserProperties(analyticsRef.current, properties);
      console.debug('[Analytics] User properties set:', properties);
    } catch (error) {
      console.error('[Analytics] Failed to set user properties:', error);
    }
  }, []);

  // 수동 페이지뷰 추적 (SPA 내 가상 페이지 등)
  const trackPageView = useCallback(
    (pageName: string, pagePath?: string): void => {
      trackEvent('page_view', {
        page_name: pageName,
        page_path: pagePath || location.pathname,
      });
    },
    [trackEvent, location.pathname]
  );

  return {
    trackEvent,
    setUser,
    setProperties,
    trackPageView,
  };
};

// ============================================
// Utility Functions
// ============================================

/**
 * URL 경로에서 페이지 이름 추출
 */
function getPageNameFromPath(pathname: string): string {
  const routes: Record<string, string> = {
    '/': 'home',
    '/landing': 'landing',
    '/login': 'login',
    '/boards': 'board_list',
    '/settings': 'settings',
    '/admin': 'admin',
    '/terms': 'terms',
    '/privacy': 'privacy',
    '/forgot-password': 'forgot_password',
  };

  // 정확한 매칭
  if (routes[pathname]) {
    return routes[pathname];
  }

  // 동적 경로 매칭
  if (pathname.startsWith('/boards/')) {
    return 'board_detail';
  }
  if (pathname.startsWith('/invite/')) {
    return 'invite';
  }
  if (pathname.startsWith('/verify-email/')) {
    return 'verify_email';
  }
  if (pathname.startsWith('/reset-password/')) {
    return 'reset_password';
  }

  return 'unknown';
}

export default useAnalytics;
