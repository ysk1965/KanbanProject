// 탭(페이지 로드) 단위 클라이언트 식별자.
// 모든 API 요청에 X-Client-Id 헤더로 실려 가고, 백엔드가 WebSocket 이벤트에
// client_id로 에코한다. WS 수신부는 "이 탭이 보낸 이벤트"만 스킵해
// 같은 사용자의 다른 탭/창/기기 변경은 실시간 반영되게 한다.
export const CLIENT_ID = crypto.randomUUID();
