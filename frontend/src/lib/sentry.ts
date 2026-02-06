/**
 * Sentry Configuration & Initialization
 * Error tracking and performance monitoring
 */
import * as Sentry from '@sentry/react';

// Sentry configuration from environment variables
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_ENVIRONMENT = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development';
const SENTRY_RELEASE = import.meta.env.VITE_SENTRY_RELEASE || '0.0.1';

/**
 * Sentry 설정이 유효한지 확인
 */
export const isSentryConfigured = (): boolean => {
  return !!SENTRY_DSN;
};

/**
 * Sentry 초기화
 */
export const initializeSentry = (): void => {
  if (!isSentryConfigured()) {
    console.warn('[Sentry] DSN not configured. Error tracking disabled.');
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: SENTRY_RELEASE,

      // Performance Monitoring
      tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,

      // Session Replay (optional)
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // 민감 정보 필터링
      beforeSend(event) {
        // 개인정보가 포함될 수 있는 URL 파라미터 제거
        if (event.request?.query_string) {
          const params = new URLSearchParams(event.request.query_string);
          ['token', 'password', 'email'].forEach((key) => {
            if (params.has(key)) params.set(key, '[FILTERED]');
          });
          event.request.query_string = params.toString();
        }
        return event;
      },

      // 무시할 에러 패턴
      ignoreErrors: [
        // 브라우저 확장 관련 에러
        'ResizeObserver loop',
        'Non-Error exception captured',
        // 네트워크 에러 (일시적)
        'Network request failed',
        'Failed to fetch',
        'Load failed',
        // 취소된 요청
        'AbortError',
        'The operation was aborted',
      ],

      // 무시할 URL 패턴
      denyUrls: [
        // Chrome extensions
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        // Firefox extensions
        /^moz-extension:\/\//i,
      ],
    });

    console.log('[Sentry] Initialized successfully');
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
};

/**
 * Sentry에 사용자 정보 설정
 */
export const setSentryUser = (user: {
  id: string;
  email?: string;
  name?: string;
} | null): void => {
  if (!isSentryConfigured()) return;

  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
  } else {
    Sentry.setUser(null);
  }
};

/**
 * Sentry에 에러 캡처
 */
export const captureException = (
  error: Error,
  context?: Record<string, unknown>
): string | undefined => {
  if (!isSentryConfigured()) {
    console.error('[Sentry] Not configured, logging error:', error);
    return undefined;
  }

  return Sentry.captureException(error, {
    extra: context,
  });
};

/**
 * Sentry에 메시지 캡처
 */
export const captureMessage = (
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): string | undefined => {
  if (!isSentryConfigured()) {
    console.log(`[Sentry] Not configured, logging message: ${message}`);
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
};

/**
 * Sentry 태그 추가
 */
export const setTag = (key: string, value: string): void => {
  if (!isSentryConfigured()) return;
  Sentry.setTag(key, value);
};

/**
 * Sentry 컨텍스트 추가
 */
export const setContext = (name: string, context: Record<string, unknown>): void => {
  if (!isSentryConfigured()) return;
  Sentry.setContext(name, context);
};

/**
 * Breadcrumb 추가 (디버깅용 이벤트 기록)
 */
export const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb): void => {
  if (!isSentryConfigured()) return;
  Sentry.addBreadcrumb(breadcrumb);
};

// Export Sentry for direct access if needed
export { Sentry };
