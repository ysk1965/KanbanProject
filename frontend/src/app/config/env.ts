/**
 * 빌드 타임 환경 변수(`import.meta.env.VITE_*`)에서 파생되는 서버 주소 상수.
 *
 * 다른 모듈을 import 하지 않는다 — serverHealth.ts 처럼 api.ts 가 의존하는 모듈도
 * 순환 참조 없이 여기서 주소를 가져올 수 있어야 한다.
 *
 * 쓸 수 있는 변수 목록과 설명은 `frontend/.env.example` 참고.
 */

/** 로컬 개발 기본값 (VITE_API_BASE_URL 미설정 시) */
const DEFAULT_API_BASE_URL = "http://localhost:8080/api/v1";
const DEFAULT_API_ORIGIN = "http://localhost:8080";

/**
 * REST API 베이스 URL — `/api/v1` 로 끝나고 뒤 슬래시는 없다.
 * 예: `https://api.bridgespots.com/api/v1`, 로컬은 `http://localhost:8080/api/v1`.
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

/**
 * 백엔드 origin(scheme + host[:port]) — 파일 상대 경로 해석, `/health` 조회,
 * MCP 연결 명령의 BRIDGE_API_URL 등 `/api/v1` 밖의 경로에 쓴다.
 * API_BASE_URL 이 상대 경로 등 절대 URL 이 아니면 로컬 기본값으로 떨어진다.
 */
export const API_ORIGIN: string = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
})();

/**
 * WebSocket 베이스 — API_BASE_URL 에서 `/api/v1` 을 떼고 `http(s)://` → `ws(s)://`.
 * (의도적으로 문자열 치환이다: 상대 경로 설정이면 "" 가 되어 같은 origin 을 가리킨다)
 */
export const WS_BASE_URL: string = API_BASE_URL.replace("/api/v1", "")
  .replace("https://", "wss://")
  .replace("http://", "ws://");

/** 보드 실시간 동기화 STOMP 엔드포인트 */
export const WS_URL = `${WS_BASE_URL}/ws`;

/** 노트 실시간 협업(Yjs) WebSocket 엔드포인트 */
export const collabWsUrl = (noteId: string): string =>
  `${WS_BASE_URL}/ws-collab/${noteId}`;

/**
 * S3 직접 URL 을 리라이트할 CloudFront 도메인(호스트만, scheme 없음).
 * 미설정이면 undefined — 리라이트를 하지 않는다.
 */
export const CLOUDFRONT_DOMAIN: string | undefined =
  import.meta.env.VITE_CLOUDFRONT_DOMAIN || undefined;
