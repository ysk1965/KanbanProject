"use strict";

/**
 * CloudFront Lambda@Edge (viewer-request) — 공유 링크 미리보기(OG 카드) 주입.
 *
 * 동작: 봇(Slack/Kakao/Facebook 등) User-Agent가 공개 공유 경로로 오면,
 *   백엔드 OG 엔드포인트(GET /api/v1/public/og-preview/{type}/{token})를 호출해
 *   per-resource og:* 태그가 담긴 얇은 HTML을 즉시 반환한다.
 *   그 외(사람/미매칭 경로)는 도메인별 index.html로 rewrite해 SPA를 띄운다.
 *
 * 왜 이 방식인가: CSR SPA는 같은 URL을 사람에겐 앱, 크롤러에겐 메타로 줘야 한다.
 *   CloudFront Functions는 외부 호출이 불가하므로 Lambda@Edge를 쓴다.
 *   Lambda@Edge는 환경변수를 지원하지 않아 API_BASE를 아래 상수로 둔다(환경별로 값 교체).
 *
 * ⚠️ 이 함수는 공유 경로 전용 cache behavior(/n/*, /shared/*, /invite/*, /org-invite/*)에
 *   viewer-request로 붙는다. default behavior의 SPA 라우팅 CloudFront Function(spa_router)은
 *   이 behavior에 붙지 않으므로(같은 이벤트에 CF Function+Lambda 동시 연결 불가),
 *   사람 요청의 index.html rewrite(SPA fallback)를 이 함수가 직접 수행한다(spaFallback).
 */

const https = require("https");

// ── 환경별 설정 (Lambda@Edge는 env var 미지원 → 배포 시 값 교체) ──────────────
// dev:  https://api-dev.milkyway.pe.kr   prod: https://api.milkyway.pe.kr (실제 백엔드 오리진)
const API_BASE = "https://api.milkyway.pe.kr";
const FETCH_TIMEOUT_MS = 1500;

// 도메인별 브랜딩 (이 배포는 milkyway.pe.kr + bridgespots.com을 함께 서빙)
const BRANDS = {
  milkyway: {
    name: "Milkyway",
    image: "https://milkyway.pe.kr/og-image-milkyway.png",
  },
  bridgespots: {
    name: "Bridgespots",
    image: "https://bridgespots.com/og-image-bridgespots.png",
  },
};

function brandFor(host) {
  return host && host.indexOf("bridgespots.com") !== -1
    ? BRANDS.bridgespots
    : BRANDS.milkyway;
}

// 링크 미리보기를 크롤링하는 봇 User-Agent (카카오톡·슬랙·라인 등 국내외 포함)
const BOT_UA =
  /(slackbot|facebookexternalhit|twitterbot|linkedinbot|kakaotalk|line-poker|telegrambot|discordbot|whatsapp|pinterest|googlebot|bingbot|embedly|redditbot|skypeuripreview|applebot|naver|yeti|daum)/i;

// 경로 → OG 종류 매핑 (더 구체적인 패턴을 먼저 둔다: gallery-upload > gallery, org-invite > invite)
const ROUTES = [
  { re: /^\/n\/([^/?#]+)/, type: "note" },
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
  const host = (headers["host"] && headers["host"][0].value) || "";

  // 봇이 아니면 SPA로 폴백 (이 behavior엔 spa_router가 없으므로 직접 rewrite)
  if (!BOT_UA.test(ua)) return spaFallback(request, host);

  const matched = matchRoute(request.uri);
  if (!matched) return spaFallback(request, host); // 공유 경로가 아니면 SPA

  try {
    const meta = await fetchMeta(matched.type, matched.token);
    return htmlResponse(meta, brandFor(host));
  } catch (e) {
    // 조회 실패 시에도 SPA가 뜨게 폴백(빈 화면 방지)
    return spaFallback(request, host);
  }
};

// 공유 경로 전용 behavior엔 SPA 라우팅 CloudFront Function(spa_router)이 없으므로,
// 사람/조회실패 요청을 도메인별 index.html로 직접 rewrite한다(spa_router와 동일 규칙).
function spaFallback(request, host) {
  // 확장자 있는 요청(정적 파일)은 그대로 통과
  if (/\.\w+$/.test(request.uri)) return request;
  request.uri =
    host.indexOf("bridgespots.com") !== -1
      ? "/index-bridgespots.html"
      : "/index.html";
  return request;
}

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

function htmlResponse(meta, brand) {
  const title = esc(meta.title || brand.name);
  const description = esc(meta.description || "");
  const image = esc(meta.image_url || brand.image);
  const url = esc(meta.canonical_url || "");
  const cardType = meta.image_url ? "summary_large_image" : "summary";

  const body =
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    `<title>${title} · ${brand.name}</title>` +
    `<meta name="description" content="${description}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="${brand.name}">` +
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
      "content-type": [
        { key: "Content-Type", value: "text/html; charset=utf-8" },
      ],
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
