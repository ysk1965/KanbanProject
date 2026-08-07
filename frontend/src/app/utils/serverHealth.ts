/**
 * 서버 가용성 신호 허브.
 *
 * BE 배포·장애로 API가 끊기면 화면이 목업 데이터로 채워져 "가짜 보드"가 실데이터인
 * 척 보이던 문제가 있었다. 실패 신호를 이 모듈 한 곳에 모아
 * - services.ts 는 목업 폴백을 건너뛰고
 * - App 의 서버 가드는 점검 페이지를 띄우도록
 * 한다.
 *
 * 단발 실패로 전체 화면을 덮지 않도록, 신호는 "의심된다"는 뜻이고 실제 판정은
 * 구독자가 공개 엔드포인트(/system/status)를 한 번 더 찔러 확인한 뒤 내린다.
 */

// api.ts 를 import 하면 순환 참조가 되므로 base URL 은 여기서 직접 읽는다.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

/** 서버가 응답하지 않는 것으로 의심될 때 발행되는 이벤트 */
export const SERVER_UNAVAILABLE_EVENT = "server-unavailable";

/**
 * "서버가 죽었다"고 볼 수 있는 에러인지 판별.
 * - fetch 자체 실패(TypeError): 연결 거부 · DNS 실패 · CORS 차단
 * - 502/503/504: ALB 가 살아있는 인스턴스를 못 찾은 상태(배포 중 전형적인 응답)
 * 4xx 는 서버가 멀쩡히 응답한 것이므로 여기 포함하지 않는다.
 */
export const isServerDownError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  const status = (error as { status?: number } | null | undefined)?.status;
  return status === 502 || status === 503 || status === 504;
};

// 장애 중에는 모든 요청이 동시에 실패하므로 신호를 쓰로틀링한다.
const SIGNAL_THROTTLE_MS = 3000;
let lastSignalAt = 0;

/** 서버 응답 없음 신호 발행 (쓰로틀됨) */
export const reportServerUnreachable = (endpoint?: string): void => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastSignalAt < SIGNAL_THROTTLE_MS) return;
  lastSignalAt = now;
  window.dispatchEvent(
    new CustomEvent(SERVER_UNAVAILABLE_EVENT, { detail: { endpoint } }),
  );
};

/** 응답이 왔다 = 서버 생존. 쓰로틀을 풀어 다음 장애를 즉시 알린다 */
export const reportServerReachable = (): void => {
  lastSignalAt = 0;
};

/**
 * 공개 엔드포인트(/system/status)로 서버 생존 + 점검 상태를 직접 확인.
 *
 * - 인증 헤더를 붙이지 않아 토큰 갱신·강제 로그아웃 경로를 건드리지 않는다.
 * - 타임아웃이 있어 응답 없는 서버에서 로딩 스피너가 영원히 도는 일이 없다.
 * - 실패하면 throw → 호출부가 "서버 다운"으로 판정한다.
 */
export const fetchServerStatus = async <T>(
  timeoutMs: number = 8000,
): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("offline");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/system/status`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};
