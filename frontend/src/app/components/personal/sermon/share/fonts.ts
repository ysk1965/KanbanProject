/** 설교 노트 글꼴 — SermonTab 과 같은 id·주소라 두 번 붙지 않는다 */
const FONT_ID = 'sermon-hahmlet-font';
export const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Hahmlet:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700;800;900&family=Black+Han+Sans&family=Gaegu:wght@400;700&display=swap';

export function ensureSermonFonts() {
  if (document.getElementById(FONT_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_ID;
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

let cssCache: Promise<string | null> | null = null;

/** Google Fonts 의 @font-face 원문 (교차 출처 스타일시트는 cssRules 로 읽을 수 없어 직접 받는다) */
function sermonFontCss(): Promise<string | null> {
  if (!cssCache) {
    cssCache = fetch(FONT_HREF)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    void cssCache.then((t) => {
      if (!t) cssCache = null;
    });
  }
  return cssCache;
}

interface Face {
  family: string;
  weight: number;
  url: string;
  ranges: Array<[number, number]>;
  css: string;
}

export function parseFaces(css: string): Face[] {
  const out: Face[] = [];
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = m[1];
    const family = /font-family:\s*['"]?([^;'"]+)['"]?;/.exec(body)?.[1]?.trim();
    const url = /url\(([^)]+)\)/.exec(body)?.[1]?.replace(/['"]/g, '');
    if (!family || !url) continue;
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1] || 400);
    const ur = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
    const ranges: Array<[number, number]> = ur
      ? ur.split(',').map((p) => {
          const [a, b] = p.trim().replace(/^U\+/i, '').split('-');
          if (a.includes('?')) {
            return [parseInt(a.replace(/\?/g, '0'), 16), parseInt(a.replace(/\?/g, 'f'), 16)];
          }
          return [parseInt(a, 16), parseInt(b ?? a, 16)];
        })
      : [[0, 0x10ffff]];
    out.push({ family, weight, url, ranges, css: m[0] });
  }
  return out;
}

const dataCache = new Map<string, Promise<string | null>>();
function toDataUrl(url: string): Promise<string | null> {
  let p = dataCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (b) =>
          b &&
          new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(b);
          }),
      )
      .catch(() => null);
    dataCache.set(url, p);
  }
  return p;
}

/** 카드 안 글자를 (글꼴, 굵기)별로 모은다 */
function usedGlyphs(root: HTMLElement): Map<string, Set<number>> {
  const used = new Map<string, Set<number>>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    const text = n.nodeValue || '';
    if (!el || !text.trim()) continue;
    const cs = getComputedStyle(el);
    const family = cs.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    const key = `${family}|${Number(cs.fontWeight) || 400}`;
    let set = used.get(key);
    if (!set) used.set(key, (set = new Set()));
    for (const ch of text) set.add(ch.codePointAt(0) as number);
  }
  return used;
}

/**
 * 카드 이미지에 심을 @font-face — 카드에 실제로 쓰인 글자·굵기의 조각만 data URL 로.
 * (SVG 이미지 안에서는 원격 글꼴을 못 불러서 그대로 넘기면 대체 글꼴로 찍힌다)
 */
export async function embeddedFontCss(root: HTMLElement): Promise<string | null> {
  const css = await sermonFontCss();
  if (!css) return null;
  const faces = parseFaces(css);
  const pick: Face[] = [];
  usedGlyphs(root).forEach((chars, key) => {
    const [family, w] = key.split('|');
    const mine = faces.filter((f) => f.family === family);
    if (!mine.length) return;
    // 그 굵기가 없으면 가장 가까운 굵기 (브라우저가 고르는 것과 같게)
    const want = Number(w);
    const weight = mine.reduce(
      (best, f) => (Math.abs(f.weight - want) < Math.abs(best - want) ? f.weight : best),
      mine[0].weight,
    );
    const cps = [...chars];
    mine
      .filter((f) => f.weight === weight)
      .forEach((f) => {
        if (cps.some((c) => f.ranges.some(([a, b]) => c >= a && c <= b)) && !pick.includes(f)) {
          pick.push(f);
        }
      });
  });
  const parts = await Promise.all(
    pick.map(async (f) => {
      const data = await toDataUrl(f.url);
      return data ? f.css.replace(/url\([^)]+\)/, `url(${data})`) : '';
    }),
  );
  return parts.filter(Boolean).join('\n');
}
