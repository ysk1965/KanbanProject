"use strict";

/**
 * CloudFront Lambda@Edge (viewer-request) — 공유 링크 미리보기(OG 카드) 주입.
 *
 * 동작: 봇(Slack/Kakao/Facebook 등) User-Agent가 공개 공유 경로로 오면,
 *   백엔드 OG 엔드포인트(GET /api/v1/public/og-preview/{type}/{token})를 호출해
 *   per-resource og:* 태그가 담긴 얇은 HTML을 즉시 반환한다.
 *   그 외(사람/미매칭 경로)는 요청을 그대로 흘려 SPA(index.html)로 보낸다.
 *
 * 왜 이 방식인가: CSR SPA는 같은 URL을 사람에겐 앱, 크롤러에겐 메타로 줘야 한다.
 *   CloudFront Functions는 외부 호출이 불가하므로 Lambda@Edge를 쓴다.
 *   Lambda@Edge는 환경변수를 지원하지 않아 API_BASE를 아래 상수로 둔다(환경별로 값 교체).
 */

const https = require("https");

// ── 환경별 설정 (Lambda@Edge는 env var 미지원 → 배포 시 값 교체) ──────────────
// dev:  https://api-dev.milkyway.pe.kr   prod: https://api.milkyway.pe.kr (실제 백엔드 오리진)
const API_BASE = "https://api.milkyway.pe.kr";
const SITE_NAME = "Milkyway";
const DEFAULT_IMAGE = "https://milkyway.pe.kr/og-image-milkyway.png";
const FETCH_TIMEOUT_MS = 1500;

// 링크 미리보기를 크롤링하는 봇 User-Agent (카카오톡·슬랙·라인 등 국내외 포함)
const BOT_UA = /(slackbot|facebookexternalhit|twitterbot|linkedinbot|kakaotalk|line-poker|telegrambot|discordbot|whatsapp|pinterest|googlebot|bingbot|embedly|redditbot|skypeuripreview|applebot|naver|yeti|daum)/i;

// 경로 → OG 종류 매핑 (더 구체적인 패턴을 먼저 둔다: gallery-upload > gallery, org-invite > invite)
const ROUTES = [
  { re: /^\/shared\/note\/([^/?#]+)/, type: "note" },
  { re: /^\/shared\/album\/([^/?#]+)/, type: "album" },
  { re: /^\/shared\/gallery-upload\/([^/?#]+)/, type: "gallery-upload" },
  { re: /^\/shared\/gallery\/([^/?#]+)/, type: "gallery" },
  { re: /^\/shared\/upload\/([^/?#]+)/, type: "upload" },
  { re: /^\/org-invite\/([^/?#]+)/, type: "org-invite" },
  { re: /^\/invite\/([^/?#]+)/, type: "invite" },
];

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers || {};
  const ua = (headers["user-agent"] && headers["user-agent"][0].value) || "";

  // 봇이 아니면 그대로 통과 → SPA(index.html)
  if (!BOT_UA.test(ua)) return request;

  const matched = matchRoute(request.uri);
  if (!matched) return request; // 공유 경로가 아니면 통과

  try {
    const meta = await fetchMeta(matched.type, matched.token);
    return htmlResponse(meta);
  } catch (e) {
    // 조회 실패 시에도 요청을 흘려 SPA가 뜨게 한다(빈 화면 방지)
    return request;
  }
};

function matchRoute(uri) {
  for (const route of ROUTES) {
    const m = route.re.exec(uri);
    if (m) return { type: route.type, token: decodeURIComponent(m[1]) };
  }
  return null;
}

function fetchMeta(type, token) {
  const url = `${API_BASE}/api/v1/public/og-preview/${type}/${encodeURIComponent(token)}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`upstream ${res.statusCode}`));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function htmlResponse(meta) {
  const title = esc(meta.title || SITE_NAME);
  const description = esc(meta.description || "");
  const image = esc(meta.image_url || DEFAULT_IMAGE);
  const url = esc(meta.canonical_url || "");
  const cardType = meta.image_url ? "summary_large_image" : "summary";

  const body =
    "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">" +
    `<title>${title} · ${SITE_NAME}</title>` +
    `<meta name="description" content="${description}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="${SITE_NAME}">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${description}">` +
    `<meta property="og:image" content="${image}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta name="twitter:card" content="${cardType}">` +
    `<meta name="twitter:title" content="${title}">` +
    `<meta name="twitter:description" content="${description}">` +
    `<meta name="twitter:image" content="${image}">` +
    `<link rel="canonical" href="${url}">` +
    // 사람이 이 응답에 도달한 예외 상황 대비 — 실제 앱으로 이동
    `<meta http-equiv="refresh" content="0;url=${url}">` +
    `</head><body><a href="${url}">${title}</a></body></html>`;

  return {
    status: "200",
    statusDescription: "OK",
    headers: {
      "content-type": [{ key: "Content-Type", value: "text/html; charset=utf-8" }],
      // 봇 응답은 짧게 캐시 (자원 갱신 반영)
      "cache-control": [{ key: "Cache-Control", value: "public, max-age=300" }],
    },
    body,
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
