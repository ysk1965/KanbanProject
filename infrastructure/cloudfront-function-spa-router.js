/**
 * CloudFront Function: SPA Router with Multi-Domain Branding
 *
 * 역할:
 * 1. Host 헤더 기반으로 도메인별 index.html 분기
 *    - bridgespots.com → /index-bridgespots.html
 *    - milkyway.pe.kr  → /index.html (기본)
 * 2. SPA 라우팅: 파일 확장자가 없는 경로 → index.html (fallback)
 *
 * 설정 방법:
 * - CloudFront > Functions > Create function
 * - 이 코드 붙여넣기
 * - Distribution의 Behavior에 viewer-request로 연결
 * - CloudFront의 Custom Error Response (403/404 → /index.html) 제거
 *   (이 함수가 SPA fallback을 대신 처리)
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value : '';

  // 파일 확장자가 있는 요청은 그대로 통과 (JS, CSS, 이미지 등)
  if (uri.match(/\.\w+$/)) {
    return request;
  }

  // SPA fallback: 파일 확장자 없는 경로 → 도메인별 index.html
  if (host.indexOf('bridgespots.com') !== -1) {
    request.uri = '/index-bridgespots.html';
  } else {
    request.uri = '/index.html';
  }

  return request;
}
