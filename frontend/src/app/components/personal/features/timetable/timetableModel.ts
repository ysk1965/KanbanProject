import type {
  PersonalFeatureTerm,
  TimetableCell,
  TimetableCellColor,
  TimetableColumn,
  TimetableContent,
  TimetableDay,
  TimetableRow,
} from '../types';
import { getTodayDateString } from '../../../../utils/dateUtils';

/**
 * 시간표 content 순수 헬퍼.
 * 기획서 docs/Design/myspace-features-timetable.html 04절 시안 스크립트를 그대로 옮긴 것.
 * 모든 변경 함수는 새 content 객체를 돌려준다 (인자는 건드리지 않음).
 */

/* ───────────── 기본 문서 ───────────── */

export const DEFAULT_TIME_START = 13 * 60; // 13:00
export const DEFAULT_TIME_LENGTH = 30; // 30분
export const DEFAULT_ROW_COUNT = 3;
export const SUGGEST_LIMIT = 6;

export function defaultColumns(): TimetableColumn[] {
  return [
    { key: 'c1', label: '시간', width: 18, type: 'time', suggest: false },
    { key: 'c2', label: '장소', width: 16, type: 'text', suggest: true },
    { key: 'c3', label: '내용', width: null, type: 'text', suggest: false },
    { key: 'c4', label: '곡목', width: null, type: 'text', suggest: true },
    { key: 'c5', label: '비고', width: 18, type: 'text', suggest: true },
  ];
}

export function emptyRow(columns: TimetableColumn[]): TimetableRow {
  const row: TimetableRow = {};
  for (const c of columns) row[c.key] = { t: '' };
  return row;
}

export function createDefaultTimetable(): TimetableContent {
  const columns = defaultColumns();
  const rows: TimetableRow[] = [];
  for (let i = 0; i < DEFAULT_ROW_COUNT; i++) rows.push(emptyRow(columns));
  return {
    version_label: '',
    place_note: '',
    columns,
    days: [{ date: getTodayDateString(), rows }],
  };
}

/* ───────────── 읽기 헬퍼 ───────────── */

const EMPTY_CELL: Readonly<TimetableCell> = Object.freeze({ t: '' });

/** 셀 읽기 (없으면 빈 셀). 인자를 바꾸지 않는다. */
export function cellOf(row: TimetableRow | undefined, key: string): TimetableCell {
  return (row && row[key]) || EMPTY_CELL;
}

export function colOf(content: TimetableContent, key: string): TimetableColumn | undefined {
  return content.columns.find((c) => c.key === key);
}

export function timeColumn(content: TimetableContent): TimetableColumn | undefined {
  return content.columns.find((c) => c.type === 'time');
}

/** 대표 셀의 실제 행 수 (표 끝을 넘지 않도록 자른다). span 없으면 1 */
export function spanOf(day: TimetableDay, key: string, ri: number): number {
  const s = (cellOf(day.rows[ri], key).span || 0) | 0;
  if (s < 2) return 1;
  return Math.min(s, day.rows.length - ri);
}

/** cov[ri] = 그 행을 덮고 있는 대표 행 번호, 없으면 -1 */
export function covers(day: TimetableDay, key: string): number[] {
  const cov: number[] = [];
  const n = day.rows.length;
  let i = 0;
  while (i < n) {
    const s = spanOf(day, key, i);
    cov[i] = -1;
    for (let j = 1; j < s; j++) cov[i + j] = i;
    i += s;
  }
  return cov;
}

/** ri가 덮여 있으면 대표 행, 아니면 ri 자신 */
export function anchorOf(day: TimetableDay, key: string, ri: number): number {
  const cov = covers(day, key);
  return cov[ri] >= 0 ? cov[ri] : ri;
}

/** 기존 병합에 걸치면 그 병합 전체를 포함하도록 범위를 넓힌다 */
export function normRange(
  day: TimetableDay,
  key: string,
  r1: number,
  r2: number,
): { r1: number; r2: number } {
  const cov = covers(day, key);
  if (cov[r1] >= 0) r1 = cov[r1];
  const a2 = cov[r2] >= 0 ? cov[r2] : r2;
  r2 = Math.max(r2, a2 + spanOf(day, key, a2) - 1);
  return { r1, r2: Math.min(r2, day.rows.length - 1) };
}

export function countMerged(content: TimetableContent): number {
  let n = 0;
  for (const day of content.days)
    for (const c of content.columns)
      for (const row of day.rows) if (((cellOf(row, c.key).span || 0) | 0) > 1) n++;
  return n;
}

export function countRows(content: TimetableContent): number {
  return content.days.reduce((n, d) => n + d.rows.length, 0);
}

/* ───────────── 복제 ───────────── */

function cloneRow(row: TimetableRow): TimetableRow {
  const out: TimetableRow = {};
  for (const k of Object.keys(row)) out[k] = { ...row[k] };
  return out;
}

function cloneDay(day: TimetableDay): TimetableDay {
  return { date: day.date, rows: day.rows.map(cloneRow) };
}

export function cloneContent(content: TimetableContent): TimetableContent {
  return {
    ...content,
    columns: content.columns.map((c) => ({ ...c })),
    days: content.days.map(cloneDay),
  };
}

/** 복제본에서 셀을 꺼내되 없으면 만들어 넣는다 (복제본 전용) */
function ensureCell(row: TimetableRow, key: string): TimetableCell {
  if (!row[key]) row[key] = { t: '' };
  return row[key];
}

/* ───────────── 셀 · 헤더 값 ───────────── */

export function setCell(
  content: TimetableContent,
  di: number,
  ri: number,
  key: string,
  patch: Partial<TimetableCell>,
): TimetableContent {
  const day = content.days[di];
  if (!day || !day.rows[ri]) return content;
  const next = cloneContent(content);
  const cell = ensureCell(next.days[di].rows[ri], key);
  if (patch.t !== undefined) cell.t = patch.t;
  if (patch.c !== undefined) {
    if (patch.c) cell.c = patch.c;
    else delete cell.c;
  }
  if ('span' in patch) {
    if (patch.span && patch.span >= 2) cell.span = patch.span;
    else delete cell.span;
  }
  return next;
}

export function setCellText(
  content: TimetableContent,
  di: number,
  ri: number,
  key: string,
  text: string,
): TimetableContent {
  if (cellOf(content.days[di]?.rows[ri], key).t === text) return content;
  return setCell(content, di, ri, key, { t: text });
}

export function setCellColor(
  content: TimetableContent,
  di: number,
  ri: number,
  key: string,
  color: TimetableCellColor,
): TimetableContent {
  if ((cellOf(content.days[di]?.rows[ri], key).c || '') === (color || '')) return content;
  return setCell(content, di, ri, key, { c: color });
}

export function setHeader(
  content: TimetableContent,
  patch: Partial<Pick<TimetableContent, 'version_label' | 'place_note'>>,
): TimetableContent {
  return { ...content, ...patch };
}

/* ───────────── 병합 ───────────── */

/**
 * 같은 열의 r1..r2 를 합친다. 맨 위 셀이 대표가 되고, 대표가 비어 있으면 범위 안 첫 값(색 포함)을 가져온다.
 * 나머지 셀의 값은 버리지 않고 숨긴다 (span만 지우면 돌아온다).
 */
export function mergeRange(
  content: TimetableContent,
  di: number,
  key: string,
  r1: number,
  r2: number,
): TimetableContent {
  const day = content.days[di];
  if (!day) return content;
  const nr = normRange(day, key, Math.min(r1, r2), Math.max(r1, r2));
  if (nr.r2 <= nr.r1) return content;
  const next = cloneContent(content);
  const rows = next.days[di].rows;
  const anchor = ensureCell(rows[nr.r1], key);
  if (!anchor.t) {
    for (let i = nr.r1 + 1; i <= nr.r2; i++) {
      const c = ensureCell(rows[i], key);
      if (c.t) {
        anchor.t = c.t;
        if (c.c) anchor.c = c.c;
        else delete anchor.c;
        break;
      }
    }
  }
  for (let j = nr.r1 + 1; j <= nr.r2; j++) delete ensureCell(rows[j], key).span;
  anchor.span = nr.r2 - nr.r1 + 1;
  return next;
}

/** ri 가 속한 병합을 푼다. 대표의 span만 지우므로 숨겨 둔 값이 그대로 돌아온다. */
export function unmerge(
  content: TimetableContent,
  di: number,
  key: string,
  ri: number,
): TimetableContent {
  const day = content.days[di];
  if (!day) return content;
  const a = anchorOf(day, key, ri);
  if (spanOf(day, key, a) < 2) return content;
  const next = cloneContent(content);
  delete ensureCell(next.days[di].rows[a], key).span;
  return next;
}

/** 시간 열을 뺀 모든 열에서, 연속으로 같은 값(같은 색)인 셀을 한 번에 합친다. */
export function autoMerge(content: TimetableContent): { content: TimetableContent; merged: number } {
  const next = cloneContent(content);
  let merged = 0;
  next.days.forEach((day) => {
    next.columns.forEach((c) => {
      if (c.type === 'time') return;
      type Seg = { i: number; n: number; t: string; c: string };
      const segs: Seg[] = [];
      let i = 0;
      while (i < day.rows.length) {
        const cell = ensureCell(day.rows[i], c.key);
        const s = spanOf(day, c.key, i);
        segs.push({ i, n: s, t: normTerm(cell.t), c: cell.c || '' });
        i += s;
      }
      let g = 0;
      while (g < segs.length) {
        let h = g;
        while (segs[g].t && h + 1 < segs.length && segs[h + 1].t === segs[g].t && segs[h + 1].c === segs[g].c) h++;
        if (h > g) {
          let total = 0;
          for (let k = g; k <= h; k++) {
            total += segs[k].n;
            if (k > g) delete ensureCell(day.rows[segs[k].i], c.key).span;
          }
          ensureCell(day.rows[segs[g].i], c.key).span = total;
          merged++;
        }
        g = h + 1;
      }
    });
  });
  return { content: merged ? next : content, merged };
}

/* ───────────── 행 ───────────── */

export function addRow(content: TimetableContent, di: number): TimetableContent {
  if (!content.days[di]) return content;
  const next = cloneContent(content);
  next.days[di].rows.push(emptyRow(next.columns));
  return next;
}

/**
 * 행 삭제. 병합 범위 안의 행이면 span이 1 줄고, 대표 행이면 바로 아래 행이 대표(값·색 포함)를 이어받는다.
 * 마지막 한 행은 지우지 않는다.
 */
export function removeRow(content: TimetableContent, di: number, ri: number): TimetableContent {
  const src = content.days[di];
  if (!src || src.rows.length < 2 || !src.rows[ri]) return content;
  const next = cloneContent(content);
  const day = next.days[di];
  next.columns.forEach((c) => {
    const cov = covers(day, c.key);
    const a = cov[ri];
    if (a >= 0) {
      const ac = ensureCell(day.rows[a], c.key);
      const s = spanOf(day, c.key, a) - 1;
      if (s > 1) ac.span = s;
      else delete ac.span;
    } else {
      const cell = ensureCell(day.rows[ri], c.key);
      const s2 = spanOf(day, c.key, ri);
      if (s2 > 1 && ri + 1 < day.rows.length) {
        const nx = ensureCell(day.rows[ri + 1], c.key);
        nx.t = cell.t;
        if (cell.c) nx.c = cell.c;
        else delete nx.c;
        if (s2 - 1 > 1) nx.span = s2 - 1;
        else delete nx.span;
      }
    }
  });
  day.rows.splice(ri, 1);
  return next;
}

/* ───────────── 날짜 ───────────── */

export function addDay(content: TimetableContent): TimetableContent {
  const next = cloneContent(content);
  const last = next.days[next.days.length - 1];
  let date = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(last?.date || '');
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3] + 7);
    date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const rows: TimetableRow[] = [];
  for (let i = 0; i < DEFAULT_ROW_COUNT; i++) rows.push(emptyRow(next.columns));
  next.days.push({ date, rows });
  return next;
}

export function removeDay(content: TimetableContent, di: number): TimetableContent {
  if (content.days.length < 2 || !content.days[di]) return content;
  const next = cloneContent(content);
  next.days.splice(di, 1);
  return next;
}

export function setDayDate(content: TimetableContent, di: number, date: string): TimetableContent {
  if (!content.days[di] || content.days[di].date === date) return content;
  const next = cloneContent(content);
  next.days[di].date = date;
  return next;
}

const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-09-12" → "9.12 (토)". 형식이 아니면 fallback */
export function formatDayLabel(iso: string, fallback = '날짜 없음', weekNames: string[] = WEEK_KO): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return fallback;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${+m[2]}.${+m[3]} (${weekNames[d.getDay()]})`;
}

/* ───────────── 열 ───────────── */

export function nextColumnKey(columns: TimetableColumn[]): string {
  let max = 0;
  for (const c of columns) {
    const m = /^c(\d+)$/.exec(c.key);
    if (m) max = Math.max(max, +m[1]);
  }
  return `c${max + 1}`;
}

export function addColumn(content: TimetableContent, label = '새 열'): TimetableContent {
  const next = cloneContent(content);
  const key = nextColumnKey(next.columns);
  next.columns.push({ key, label, width: null, type: 'text', suggest: true });
  for (const day of next.days) for (const row of day.rows) row[key] = { t: '' };
  return next;
}

/** 열 삭제. 마지막 한 열은 지우지 않는다. 셀 데이터도 함께 지운다. */
export function removeColumn(content: TimetableContent, key: string): TimetableContent {
  if (content.columns.length < 2 || !colOf(content, key)) return content;
  const next = cloneContent(content);
  next.columns = next.columns.filter((c) => c.key !== key);
  for (const day of next.days) for (const row of day.rows) delete row[key];
  return next;
}

/** 열을 dir(-1 | 1) 방향으로 한 칸 옮긴다 */
export function moveColumn(content: TimetableContent, key: string, dir: -1 | 1): TimetableContent {
  const idx = content.columns.findIndex((c) => c.key === key);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= content.columns.length) return content;
  const next = cloneContent(content);
  const tmp = next.columns[idx];
  next.columns[idx] = next.columns[to];
  next.columns[to] = tmp;
  return next;
}

export function setColumnLabel(content: TimetableContent, key: string, label: string): TimetableContent {
  const col = colOf(content, key);
  const v = label.trim() || '열';
  if (!col || col.label === v) return content;
  const next = cloneContent(content);
  next.columns = next.columns.map((c) => (c.key === key ? { ...c, label: v } : c));
  return next;
}

/* ───────────── 시간 구간 (5분 단위) ───────────── */

export interface TimeRange {
  /** 자정 기준 분. 0..1439 */
  s: number;
  /** 종료. 자정 넘김이면 s 보다 작을 수 있다 */
  e: number;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 분 → "HH:MM" (하루 단위로 접는다) */
export function fmtT(m: number): string {
  m = ((m % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function round5(m: number): number {
  return Math.round(m / 5) * 5;
}

/** "13:00-14:30", "1300~1430", "13:00 – 14:30" 등을 파싱. 분은 5분 단위 반올림 */
export function parseRange(s: string | null | undefined): TimeRange | null {
  const m = /(\d{1,2})\s*:?\s*(\d{2})\s*[–\-~]\s*(\d{1,2})\s*:?\s*(\d{2})/.exec(s || '');
  if (!m) return null;
  return { s: round5(+m[1] * 60 + +m[2]), e: round5(+m[3] * 60 + +m[4]) };
}

/** "13:00 – 14:30" (en dash) */
export function fmtRange(r: TimeRange): string {
  return `${fmtT(r.s)} – ${fmtT(r.e)}`;
}

/** 저장용 정규화: 파싱되면 표준 표기, 아니면 trim 한 원문 */
export function normalizeTimeText(text: string): string {
  const r = parseRange(text);
  return r ? fmtRange(r) : text.trim();
}

/** 종료가 시작보다 앞서거나 같은가 (경고선 표시용) */
export function isRangeInverted(text: string): boolean {
  const r = parseRange(text);
  return !!r && r.e <= r.s;
}

/** 시작 = 이전 행 종료, 길이 = 이전 행 길이. 앞 행에 시간이 없으면 13:00 – 13:30 */
export function defaultRange(content: TimetableContent, di: number, ri: number): TimeRange {
  const day = content.days[di];
  const tcol = timeColumn(content);
  if (day && tcol) {
    for (let i = ri - 1; i >= 0; i--) {
      const pr = parseRange(cellOf(day.rows[i], tcol.key).t);
      if (pr) {
        let len = pr.e - pr.s;
        if (len <= 0) len = DEFAULT_TIME_LENGTH;
        return { s: pr.e, e: pr.e + len };
      }
    }
  }
  return { s: DEFAULT_TIME_START, e: DEFAULT_TIME_START + DEFAULT_TIME_LENGTH };
}

/* ───────────── 이전 입력 추천 ───────────── */

export function normTerm(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .replace(/[ \t]+/g, ' ');
}

/** 현재 문서 안의 값들을 추천 용어로 만든다 (첫 저장 전에도 문서 안 값이 떠야 하므로) */
export function collectDocTerms(content: TimetableContent, lastUsedAt = ''): PersonalFeatureTerm[] {
  const map = new Map<string, PersonalFeatureTerm>();
  for (const col of content.columns) {
    if (!col.suggest) continue;
    for (const day of content.days) {
      for (const row of day.rows) {
        const cell = row[col.key];
        const v = normTerm(cell?.t);
        if (!v) continue;
        const k = `${col.label}\u0000${v}`;
        const cur = map.get(k);
        if (cur) {
          cur.use_count++;
          if (cell?.c) cur.color = cell.c;
        } else {
          map.set(k, {
            field: col.label,
            value: v,
            color: cell?.c || null,
            use_count: 1,
            last_used_at: lastUsedAt,
          });
        }
      }
    }
  }
  return Array.from(map.values());
}

/** 서버 용어 + 문서 안 값 합집합 (같은 field/value 는 서버 값이 우선, 색은 문서 값이 있으면 채운다) */
export function unionTerms(server: PersonalFeatureTerm[], docTerms: PersonalFeatureTerm[]): PersonalFeatureTerm[] {
  const map = new Map<string, PersonalFeatureTerm>();
  for (const t of server) map.set(`${t.field}\u0000${normTerm(t.value)}`, { ...t, value: normTerm(t.value) });
  for (const t of docTerms) {
    const k = `${t.field}\u0000${t.value}`;
    const cur = map.get(k);
    if (cur) {
      if (!cur.color && t.color) cur.color = t.color;
    } else map.set(k, { ...t });
  }
  return Array.from(map.values());
}

/**
 * 추천 정렬: 앞글자 일치(0) → 포함 일치(1). 빈 입력이면 전부(2).
 * 같은 등급 안에서는 use_count ↓, last_used_at ↓. 입력과 똑같은 값은 뺀다. 최대 limit 개.
 */
export function rankSuggestions(
  terms: PersonalFeatureTerm[],
  field: string,
  query: string,
  limit = SUGGEST_LIMIT,
): PersonalFeatureTerm[] {
  const q = normTerm(query).toLowerCase();
  const out: { t: PersonalFeatureTerm; rank: number }[] = [];
  for (const t of terms) {
    if (t.field !== field) continue;
    const lv = normTerm(t.value).toLowerCase();
    if (!lv) continue;
    if (q && lv === q) continue;
    let rank: number;
    if (!q) rank = 2;
    else if (lv.indexOf(q) === 0) rank = 0;
    else if (lv.indexOf(q) >= 0) rank = 1;
    else continue;
    out.push({ t, rank });
  }
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.t.use_count || 0) - (a.t.use_count || 0) ||
      (b.t.last_used_at || '').localeCompare(a.t.last_used_at || ''),
  );
  return out.slice(0, limit).map((o) => o.t);
}
