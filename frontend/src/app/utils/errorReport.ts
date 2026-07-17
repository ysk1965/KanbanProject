/**
 * 에러 분류 + 진단 리포트 생성 유틸
 *
 * ErrorBoundary가 잡은 에러를 종류별로 분류해 사용자·개발자 양쪽에 다른 안내를 주고,
 * 한 번에 복사 가능한 구조화된 진단 리포트를 만든다.
 */

// vite.config.ts의 define으로 주입되는 빌드 메타데이터
declare const __FE_COMMIT_HASH__: string;
declare const __FE_BUILD_TIME__: string;

export type ErrorKind = "chunk" | "code" | "network" | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  /** i18n 키 (제목) */
  titleKey: string;
  /** i18n 키 (안내 문구) */
  guideKey: string;
  /** 자동 1회 리로드 대상인지 (stale 배포로 인한 chunk 유실 등) */
  autoReload: boolean;
}

// 배포 직후 구버전 chunk 유실 → 보통 새로고침 1회로 해결
const CHUNK_PATTERNS = [
  /Loading chunk \S+ failed/i,
  /ChunkLoadError/i,
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

// 일시적 네트워크 문제
const NETWORK_PATTERNS = [
  /Failed to fetch/i,
  /NetworkError/i,
  /Network request failed/i,
  /Load failed/i,
];

// 코드 버그로 볼 수 있는 런타임 에러 타입
const CODE_ERROR_NAMES = new Set([
  "ReferenceError",
  "TypeError",
  "SyntaxError",
  "RangeError",
]);

/**
 * 에러를 종류별로 분류한다.
 */
export function classifyError(error: Error | null): ClassifiedError {
  const haystack = `${error?.name ?? ""} ${error?.message ?? ""}`;

  if (CHUNK_PATTERNS.some((re) => re.test(haystack))) {
    return {
      kind: "chunk",
      titleKey: "error.kind.chunk.title",
      guideKey: "error.kind.chunk.guide",
      autoReload: true,
    };
  }

  if (NETWORK_PATTERNS.some((re) => re.test(haystack))) {
    return {
      kind: "network",
      titleKey: "error.kind.network.title",
      guideKey: "error.kind.network.guide",
      autoReload: false,
    };
  }

  if (error && CODE_ERROR_NAMES.has(error.name)) {
    return {
      kind: "code",
      titleKey: "error.kind.code.title",
      guideKey: "error.kind.code.guide",
      autoReload: false,
    };
  }

  return {
    kind: "unknown",
    titleKey: "error.title",
    guideKey: "error.kind.unknown.guide",
    autoReload: false,
  };
}

export interface ErrorReportInput {
  error: Error | null;
  componentStack?: string | null;
  eventId?: string | null;
  kind: ErrorKind;
}

/**
 * 클립보드에 복사 가능한 구조화된 진단 리포트 텍스트를 만든다.
 * Slack/이슈에 그대로 붙이면 재현 조건을 되묻는 왕복이 사라진다.
 */
export function buildErrorReport(input: ErrorReportInput): string {
  const { error, componentStack, eventId, kind } = input;
  const release =
    typeof __FE_COMMIT_HASH__ !== "undefined" ? __FE_COMMIT_HASH__ : "dev";
  const buildTime =
    typeof __FE_BUILD_TIME__ !== "undefined" ? __FE_BUILD_TIME__ : "unknown";

  const lines: string[] = [
    "BRIDGE Error Report",
    `error   : ${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`,
    `kind    : ${kind}`,
    `id      : ${eventId ?? "(sentry off)"}`,
    `release : ${release}`,
    `built   : ${buildTime}`,
    `url     : ${window.location.href}`,
    // 진단용 UTC 타임스탬프 (표시용 아님 → dateUtils 대상 아님)
    `time    : ${new Date().toISOString()}`,
    `ua      : ${navigator.userAgent}`,
  ];

  if (error?.stack) {
    lines.push("", "stack:", error.stack);
  }
  if (componentStack) {
    lines.push("", "component stack:", componentStack.trim());
  }

  return lines.join("\n");
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

/**
 * Sentry가 없는 환경용 폴백: 자체 백엔드(POST /public/client-errors)로 에러를 전송한다.
 * fire-and-forget이며 실패는 무시한다. Sentry가 켜져 있으면 호출하지 않는다(중복 방지).
 */
export function sendClientErrorReport(input: ErrorReportInput): void {
  try {
    const release =
      typeof __FE_COMMIT_HASH__ !== "undefined" ? __FE_COMMIT_HASH__ : "dev";
    const body = JSON.stringify({
      message: `${input.error?.name ?? "Error"}: ${
        input.error?.message ?? ""
      }`.slice(0, 500),
      kind: input.kind,
      release,
      url: window.location.href.slice(0, 1000),
      user_agent: navigator.userAgent.slice(0, 500),
      stack: input.error?.stack?.slice(0, 8000),
      component_stack: input.componentStack?.slice(0, 8000),
    });
    // keepalive: 크래시/언로드 상황에서도 전송이 끊기지 않도록
    void fetch(`${API_BASE}/public/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 폴백 전송 실패는 무시 (진단 보조 채널일 뿐)
  }
}
