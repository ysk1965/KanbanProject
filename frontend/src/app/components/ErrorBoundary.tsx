import React, { Component, ErrorInfo, ReactNode } from 'react';
import i18n from 'i18next';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureException, setContext } from '../../lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

/**
 * React Error Boundary 컴포넌트
 * 하위 컴포넌트에서 발생하는 에러를 캐치하여 앱 전체가 다운되는 것을 방지
 * Sentry 연동으로 에러 자동 수집
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Sentry에 에러 컨텍스트 추가
    setContext('errorBoundary', {
      componentStack: errorInfo.componentStack,
    });

    // Sentry에 에러 전송
    const eventId = captureException(error, {
      componentStack: errorInfo.componentStack,
      source: 'ErrorBoundary',
    });

    if (eventId) {
      this.setState({ eventId });
    }

    // 콘솔에도 로깅 (개발 환경에서 디버깅용)
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
  }

  handleRefresh = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/boards';
  };

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 커스텀 fallback이 제공되면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 에러 UI
      return (
        <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-bridge-obsidian rounded-2xl border border-white/20 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-white mb-2">
              {i18n.t('error.title')}
            </h1>
            <p className="text-slate-400 mb-6">
              {i18n.t('error.description')}
            </p>

            {/* Sentry Event ID 표시 (프로덕션에서 지원 문의 시 사용) */}
            {this.state.eventId && (
              <p className="text-xs text-slate-500 mb-4">
                Error ID: {this.state.eventId}
              </p>
            )}

            {/* 개발 환경에서만 에러 상세 정보 표시 */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-red-500/10 rounded-xl border border-red-500/20 text-left">
                <p className="text-red-400 text-sm font-mono break-all">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="mt-2 text-xs text-slate-400 overflow-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full px-4 py-3 bg-bridge-accent text-white rounded-xl font-medium
                  hover:bg-bridge-accent/90 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {i18n.t('error.retry')}
              </button>

              <button
                onClick={this.handleRefresh}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 text-white rounded-xl
                  hover:bg-white/10 transition-colors"
              >
                {i18n.t('error.refresh')}
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full px-4 py-3 text-slate-400 hover:text-white transition-colors
                  flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                {i18n.t('error.goHome')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
