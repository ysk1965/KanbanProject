import React, { Component, ErrorInfo, ReactNode } from "react";
import i18n from "i18next";
import {
  AlertTriangle,
  RefreshCw,
  Home,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { captureException, setContext } from "../../lib/sentry";
import {
  classifyError,
  buildErrorReport,
  sendClientErrorReport,
  type ClassifiedError,
} from "../utils/errorReport";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * 값이 바뀌면(이미 에러 상태일 때) 자동으로 리셋한다.
   * 라우트 경로를 넘기면 경로 변경/뒤로가기 시 리로드 없이 복구된다.
   * 일반 렌더에는 영향이 없다(에러 상태에서만 동작).
   */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
  copied: boolean;
  showDetail: boolean;
}

// chunk 자동 리로드 루프 방지용 (같은 세션에서 10초 내 재발 시 리로드 안 함)
const CHUNK_RELOAD_KEY = "bridge:chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

/**
 * React Error Boundary 컴포넌트
 * 하위 컴포넌트에서 발생하는 에러를 캐치하여 앱 전체가 다운되는 것을 방지
 * - Sentry 연동으로 에러 자동 수집 (소스맵 업로드 시 minify 스택 복원)
 * - 에러 종류별 분류 + 맞춤 안내
 * - 원클릭 진단 리포트 복사
 * - ChunkLoadError(배포 직후 stale chunk)는 1회 자동 리로드
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
      copied: false,
      showDetail: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    const classified = classifyError(error);

    // 배포 직후 구버전 chunk 유실로 보이면 1회 자동 리로드 (루프 가드 포함)
    if (classified.autoReload && this.tryAutoReload()) {
      return;
    }

    // Sentry에 에러 컨텍스트 추가
    setContext("errorBoundary", {
      componentStack: errorInfo.componentStack,
      errorKind: classified.kind,
    });

    // Sentry에 에러 전송
    const eventId = captureException(error, {
      componentStack: errorInfo.componentStack,
      source: "ErrorBoundary",
      errorKind: classified.kind,
    });

    if (eventId) {
      this.setState({ eventId });
    } else {
      // Sentry 미설정/전송 실패 → 자체 백엔드로 폴백 전송 (중복 없음)
      sendClientErrorReport({
        error,
        componentStack: errorInfo.componentStack,
        eventId: null,
        kind: classified.kind,
      });
    }

    // 콘솔에 로깅 (프로덕션 포함)
    console.error("Error caught by boundary:", error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    // 이미 에러 상태인데 resetKeys가 바뀌면(경로 이동 등) 자동으로 복구 시도
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys;
    const next = this.props.resetKeys;
    if (!prev || !next) return;
    const changed =
      prev.length !== next.length ||
      prev.some((v, i) => !Object.is(v, next[i]));
    if (changed) {
      this.handleRetry();
    }
  }

  /** chunk 에러 자동 리로드 시도. 리로드하면 true, 쿨다운 내 재발이면 false. */
  private tryAutoReload(): boolean {
    try {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
      if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return true;
      }
    } catch {
      // sessionStorage 접근 불가(시크릿 모드 등) → 리로드하지 않고 일반 fallback 표시
    }
    return false;
  }

  handleRefresh = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = "/boards";
  };

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetail: false,
    });
  };

  handleCopyReport = async (): Promise<void> => {
    const report = buildErrorReport({
      error: this.state.error,
      componentStack: this.state.errorInfo?.componentStack,
      eventId: this.state.eventId,
      kind: classifyError(this.state.error).kind,
    });

    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // 클립보드 권한 없음 → 상세 패널을 펼쳐 수동 복사를 유도
      this.setState({ showDetail: true });
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 커스텀 fallback이 제공되면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const classified: ClassifiedError = classifyError(this.state.error);
      const title = i18n.t(classified.titleKey);
      const guide = i18n.t(classified.guideKey);
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-bridge-obsidian rounded-2xl border border-bridge-border p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-foreground mb-2">{title}</h1>
            <p className="text-slate-400 mb-4">{guide}</p>

            {/* 분류 배지 + Error ID */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              {this.state.error?.name && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                  {this.state.error.name}
                </span>
              )}
              {this.state.eventId && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent font-mono">
                  ID · {this.state.eventId.slice(0, 8)}
                </span>
              )}
            </div>

            {/* 진단 리포트 복사 */}
            <button
              onClick={this.handleCopyReport}
              className="w-full mb-5 px-4 py-2.5 rounded-xl border border-foreground/10 bg-foreground/[0.03]
                text-sm text-foreground hover:bg-foreground/[0.06] transition-colors
                flex items-center justify-center gap-2"
            >
              {this.state.copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  {i18n.t("error.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {i18n.t("error.copyReport")}
                </>
              )}
            </button>

            {/* [개발 모드 전용] 원본 에러 상세 — 프로덕션에서는 노출하지 않는다 */}
            {isDev && this.state.error && (
              <div className="mb-6 text-left">
                <button
                  onClick={() =>
                    this.setState((s) => ({ showDetail: !s.showDetail }))
                  }
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground transition-colors mb-2"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      this.state.showDetail ? "rotate-180" : ""
                    }`}
                  />
                  {i18n.t("error.showDetail")}
                </button>
                {this.state.showDetail && (
                  <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                    <p className="text-red-400 text-sm font-mono break-all">
                      {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="mt-2 text-xs text-slate-400 overflow-auto max-h-40">
                        {this.state.error.stack}
                      </pre>
                    )}
                    {this.state.errorInfo && (
                      <pre className="mt-2 text-xs text-slate-500 overflow-auto max-h-40">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
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
                {i18n.t("error.retry")}
              </button>

              <button
                onClick={this.handleRefresh}
                className="w-full px-4 py-3 bg-foreground/5 border border-bridge-border text-foreground rounded-xl
                  hover:bg-foreground/10 transition-colors"
              >
                {i18n.t("error.refresh")}
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full px-4 py-3 text-slate-400 hover:text-foreground transition-colors
                  flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                {i18n.t("error.goHome")}
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
