/**
 * 노트 PDF 내보내기 — 새 창에 발행 스냅샷 HTML을 쓰고 브라우저 인쇄(PDF 저장)를 띄운다.
 *
 * 스타일은 styles/blocknote-dark.css의 `.note-view-render` 규칙 중 인쇄에 필요한
 * 핵심만 옮겨 왔다 (다크 변수 대신 흰 배경·검정 글자 고정). 본문 HTML은 호출 측이
 * DOMPurify로 정리해서 넘긴다.
 */

const PRINT_CSS = `
*{box-sizing:border-box}
@page{margin:18mm}
html,body{margin:0;padding:0;background:#fff}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR","Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;padding:24px}
.note-print{max-width:800px;margin:0 auto}
.note-print-title{font-size:2rem;font-weight:700;line-height:1.25;margin:0 0 .35rem;word-break:keep-all}
.note-print-meta{font-size:.85rem;color:#64748b;margin:0 0 1.5rem;padding-bottom:.75rem;border-bottom:1px solid #e2e8f0}
.note-view-render{line-height:1.7}
h1,h2,h3,h4{font-weight:700;line-height:1.3;break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}
h1{font-size:1.75rem;margin:1.5rem 0 .5rem}
h2{font-size:1.35rem;margin:1.25rem 0 .4rem}
h3{font-size:1.1rem;margin:1rem 0 .3rem}
p{margin:.25rem 0}
p:empty{min-height:1.7em}
ul{list-style:disc;padding-left:1.5rem;margin:.25rem 0}
ol{list-style:decimal;padding-left:1.5rem;margin:.25rem 0}
ul ul{list-style:circle}
ul ul ul{list-style:square}
li{margin:.1rem 0}
li>p{margin:0;display:inline}
.note-nested-children{padding-left:1.5rem}
ul[data-checked-list]{list-style:none;padding-left:1.25rem}
ul[data-checked-list]>li{position:relative}
ul[data-checked-list]>li::before{content:"\\2610";position:absolute;left:-1.25rem}
ul[data-checked-list]>li[data-checked="true"]::before{content:"\\2611";color:#22c55e}
ul[data-checked-list]>li[data-checked="true"]{text-decoration:line-through;opacity:.7}
blockquote{border-left:3px solid #cbd5e1;padding-left:.85rem;margin:.5rem 0;color:#475569}
hr{border:0;border-top:1px solid #e2e8f0;margin:1rem 0}
img{max-width:100%;height:auto;break-inside:avoid;page-break-inside:avoid}
figure{margin:.5rem 0}
figcaption{font-size:.8rem;color:#64748b;margin-top:.25rem}
table{border-collapse:collapse;width:100%;margin:.75rem 0}
th,td{border:1px solid #cbd5e1;padding:.4rem .6rem;text-align:left;vertical-align:top}
th{background:#f1f5f9;font-weight:700}
tr{break-inside:avoid;page-break-inside:avoid}
pre{white-space:pre-wrap;word-break:break-word;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:.75rem;font-size:.875rem;break-inside:avoid;page-break-inside:avoid}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:#f1f5f9;padding:.1em .3em;border-radius:3px}
pre code{background:none;padding:0}
a{color:#4f46e5;text-decoration:underline;word-break:break-all}
[data-callout-type]{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;border-left:3px solid #94a3b8;background:#f8fafc;margin:.5rem 0;break-inside:avoid;page-break-inside:avoid}
[data-callout-type] .bn-callout-icon{flex-shrink:0;font-size:1.1rem}
[data-callout-type="info"]{background:#eff6ff;border-left-color:#3b82f6}
[data-callout-type="warning"]{background:#fffbeb;border-left-color:#f59e0b}
[data-callout-type="success"]{background:#ecfdf5;border-left-color:#22c55e}
[data-callout-type="error"]{background:#fef2f2;border-left-color:#ef4444}
details{border:1px solid #e2e8f0;border-radius:6px;padding:.75rem;margin:.5rem 0;background:#f8fafc}
summary{font-weight:700;list-style:none;padding:.25rem 0}
summary::-webkit-details-marker{display:none}
details>*:not(summary){margin-top:.5rem;padding-left:1rem}
[data-block-type="divider"]{padding:.75rem 0}
[data-block-type="divider"] hr{border:0;height:2px;background:#e2e8f0}
[data-columns]{display:grid;gap:1rem;margin:.5rem 0}
[data-columns="2"]{grid-template-columns:1fr 1fr}
[data-columns="3"]{grid-template-columns:1fr 1fr 1fr}
[data-columns="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
[data-columns="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}
[data-block-type="embed"] iframe{display:none}
[data-block-type="embed"] a{display:inline-block;padding:6px 10px;background:#f1f5f9;border-radius:6px;text-decoration:none;color:#111827}
`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NotePrintOptions {
  title: string;
  /** 수정일 · 작성자 등 메타 한 줄 (이미 이스케이프된 HTML) */
  metaHtml: string;
  /** DOMPurify 정리가 끝난 본문 HTML */
  bodyHtml: string;
  lang?: string;
}

/**
 * 인쇄 창을 열어 문서를 쓰고 로드 뒤 print()를 부른다. 인쇄가 끝나면 창을 닫는다.
 * 팝업이 차단되면 false를 돌려준다 — 호출 측이 안내 토스트를 띄운다.
 */
export function openNotePrintWindow(options: NotePrintOptions): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;

  const safeTitle = escapeHtml(options.title || "");
  const html = [
    "<!doctype html>",
    `<html lang="${escapeHtml(options.lang || "ko")}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${safeTitle}</title>`,
    `<style>${PRINT_CSS}</style>`,
    "</head>",
    "<body>",
    '<article class="note-print">',
    `<h1 class="note-print-title">${safeTitle}</h1>`,
    `<p class="note-print-meta">${options.metaHtml}</p>`,
    `<div class="note-view-render">${options.bodyHtml}</div>`,
    "</article>",
    "</body></html>",
  ].join("");

  let printed = false;
  const triggerPrint = () => {
    if (printed || win.closed) return;
    printed = true;
    win.focus();
    win.print();
  };

  win.addEventListener("afterprint", () => win.close());
  // load는 이미지 등 하위 리소스까지 내려온 뒤 발화 — 그 뒤에 인쇄해야 그림이 빠지지 않는다.
  win.addEventListener("load", () => window.setTimeout(triggerPrint, 120));

  win.document.open();
  win.document.write(html);
  win.document.close();

  // load가 안 오는 브라우저(빈 about:blank 재사용 등) 대비 안전망
  window.setTimeout(triggerPrint, 1500);
  return true;
}
