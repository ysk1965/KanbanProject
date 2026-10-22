/**
 * 서식 설정 — 기획서 §7.
 * 강조·제목·목록·본문 네 항목. 값은 .sermon-app 의 CSS 변수로 들어가 미리보기와 열린 노트에 즉시 반영된다.
 * 저장은 이 기기(localStorage). 기기 간 공유는 후속 과제.
 */

export type StyleColorKey = 'fg' | 'accent' | 'blue' | 'orange' | 'red' | 'purple';
export type HighlightKey = 'none' | 'yellow' | 'green' | 'blue' | 'pink';

export interface SermonStyle {
  bold: { underline: boolean; highlight: HighlightKey; weight: number; color: StyleColorKey };
  head: {
    size: 's' | 'm' | 'l' | 'xl';
    weight: number;
    font: 'serif' | 'sans';
    color: StyleColorKey;
    underline: boolean;
  };
  list: {
    marker: 'disc' | 'dash' | 'arrow' | 'check' | 'number';
    color: StyleColorKey;
    gap: number;
  };
  body: { font: 'sans' | 'serif'; size: number; lh: number; color: StyleColorKey };
}

export type StyleGroup = keyof SermonStyle;

export const STYLE_COLORS: Record<StyleColorKey, [string, string]> = {
  fg: ['기본', 'var(--sn-fg)'],
  accent: ['가름끈', 'var(--sn-accent)'],
  blue: ['파랑', 'var(--sn-c-blue)'],
  orange: ['주황', 'var(--sn-c-orange)'],
  red: ['빨강', 'var(--sn-c-red)'],
  purple: ['보라', 'var(--sn-c-purple)'],
};

export const STYLE_HIGHLIGHTS: Record<HighlightKey, [string, string | null]> = {
  none: ['없음', null],
  yellow: ['노랑', 'var(--sn-hl-yellow)'],
  green: ['연두', 'var(--sn-hl-green)'],
  blue: ['하늘', 'var(--sn-hl-blue)'],
  pink: ['분홍', 'var(--sn-hl-pink)'],
};

export const STYLE_DEFAULT: SermonStyle = {
  bold: { underline: true, highlight: 'none', weight: 700, color: 'fg' },
  head: { size: 'm', weight: 700, font: 'serif', color: 'fg', underline: false },
  list: { marker: 'disc', color: 'accent', gap: 4 },
  body: { font: 'sans', size: 16, lh: 1.8, color: 'fg' },
};

export interface StyleOption {
  k: string;
  l: string;
  /** [값, 라벨] 선택지 */
  o?: Array<[string | number | boolean, string]>;
  /** 색 견본 선택 */
  sw?: boolean;
  /** 형광펜 선택 */
  hl?: boolean;
}

export const STYLE_UI: Record<StyleGroup, { name: string; items: StyleOption[] }> = {
  bold: {
    name: '강조',
    items: [
      {
        k: 'underline',
        l: '밑줄',
        o: [
          [true, '밑줄'],
          [false, '없음'],
        ],
      },
      { k: 'highlight', l: '형광펜', hl: true },
      {
        k: 'weight',
        l: '두께',
        o: [
          [500, '보통'],
          [600, '약간 굵게'],
          [700, '굵게'],
          [800, '아주 굵게'],
        ],
      },
      { k: 'color', l: '글자 색', sw: true },
    ],
  },
  head: {
    name: '제목',
    items: [
      {
        k: 'size',
        l: '크기',
        o: [
          ['s', '작게'],
          ['m', '보통'],
          ['l', '크게'],
          ['xl', '아주 크게'],
        ],
      },
      {
        k: 'weight',
        l: '두께',
        o: [
          [500, '보통'],
          [600, '약간 굵게'],
          [700, '굵게'],
          [800, '아주 굵게'],
        ],
      },
      {
        k: 'font',
        l: '글꼴',
        o: [
          ['serif', '명조'],
          ['sans', '고딕'],
        ],
      },
      {
        k: 'underline',
        l: '밑줄',
        o: [
          [false, '없음'],
          [true, '밑줄'],
        ],
      },
      { k: 'color', l: '글자 색', sw: true },
    ],
  },
  list: {
    name: '목록',
    items: [
      {
        k: 'marker',
        l: '글머리표',
        o: [
          ['disc', '•'],
          ['dash', '–'],
          ['arrow', '→'],
          ['check', '✓'],
          ['number', '1.'],
        ],
      },
      { k: 'color', l: '글머리표 색', sw: true },
      {
        k: 'gap',
        l: '항목 간격',
        o: [
          [0, '좁게'],
          [4, '보통'],
          [10, '넓게'],
        ],
      },
    ],
  },
  body: {
    name: '본문',
    items: [
      {
        k: 'font',
        l: '글꼴',
        o: [
          ['sans', '고딕'],
          ['serif', '명조'],
        ],
      },
      {
        k: 'size',
        l: '글자 크기',
        o: [
          [14, '14'],
          [15, '15'],
          [16, '16'],
          [17, '17'],
          [18, '18'],
          [20, '20'],
        ],
      },
      {
        k: 'lh',
        l: '줄 간격',
        o: [
          [1.6, '촘촘'],
          [1.8, '보통'],
          [2.1, '넓게'],
        ],
      },
      { k: 'color', l: '글자 색', sw: true },
    ],
  },
};

const LS_KEY = 'sermon-style-v1';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 기본값 위에 저장값을 얹는다 (모르는 키는 버림) */
export function mergeStyle(src: Partial<SermonStyle> | null | undefined): SermonStyle {
  const o = clone(STYLE_DEFAULT) as unknown as Record<string, Record<string, unknown>>;
  const s = (src || {}) as unknown as Record<string, Record<string, unknown> | undefined>;
  for (const g in o) {
    const sg = s[g];
    if (!sg) continue;
    for (const k in o[g]) if (sg[k] !== undefined) o[g][k] = sg[k];
  }
  return o as unknown as SermonStyle;
}

export function loadStyle(): SermonStyle {
  try {
    const c = localStorage.getItem(LS_KEY);
    return mergeStyle(c ? (JSON.parse(c) as Partial<SermonStyle>) : null);
  } catch {
    return clone(STYLE_DEFAULT);
  }
}

export function persistStyle(s: SermonStyle) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 공간 없음 — 세션 동안만 유지 */
  }
}

/** CSS 변수로 적용. root 는 .sermon-app 요소 */
export function applyStyle(root: HTMLElement | null, s: SermonStyle) {
  if (!root) return;
  const r = root.style;
  const F = { serif: 'var(--sn-f-display)', sans: 'var(--sn-f-ui)' };
  const C = (k: StyleColorKey) => (STYLE_COLORS[k] || STYLE_COLORS.fg)[1];
  const { bold: b, head: h, list: l, body: t } = s;
  r.setProperty('--sn-b-weight', String(b.weight));
  r.setProperty('--sn-b-color', b.color === 'fg' ? 'inherit' : C(b.color));
  r.setProperty('--sn-b-ul', b.underline ? 'underline' : 'none');
  r.setProperty('--sn-b-ulc', b.color === 'fg' ? 'var(--sn-accent)' : C(b.color));
  const hl = STYLE_HIGHLIGHTS[b.highlight]?.[1];
  r.setProperty('--sn-b-bg', hl ? `linear-gradient(transparent 50%, ${hl} 50%)` : 'none');
  r.setProperty('--sn-h-size', { s: '17px', m: '20px', l: '24px', xl: '28px' }[h.size] || '20px');
  r.setProperty('--sn-h-weight', String(h.weight));
  r.setProperty('--sn-h-font', F[h.font]);
  r.setProperty('--sn-h-color', C(h.color));
  r.setProperty('--sn-h-ul', h.underline ? 'underline' : 'none');
  r.setProperty(
    '--sn-l-type',
    { disc: 'disc', dash: '"–  "', arrow: '"→  "', check: '"✓  "', number: 'decimal' }[l.marker] ||
      'disc',
  );
  r.setProperty('--sn-l-color', C(l.color));
  r.setProperty('--sn-l-gap', `${l.gap}px`);
  r.setProperty('--sn-t-font', F[t.font]);
  r.setProperty('--sn-t-size', `${t.size}px`);
  r.setProperty('--sn-t-lh', String(t.lh));
  r.setProperty('--sn-t-color', C(t.color));
}
