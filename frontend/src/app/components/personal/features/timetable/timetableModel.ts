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
export function normRange(day: TimetableDay, key: string, r1: number, r2: number): { r1: number; r2: number } {
  const cov = covers(day, key);
  if (cov[r1] >= 0) r1 = cov[r1];
  const a2 = cov[r2] >= 0 ? cov[r2] : r2;
  r2 = Math.max(r2, a2 + spanOf(day, key, a2) - 1);
  return { r1, r2: Math.min(r2, day.rows.length - 1) };
}

export function countMerged(content: TimetableContent): number {
  let n = 0;
  for (const day of content.days)
    for (const c of content.columns) for (const row of day.rows) if (((cellOf(row, c.key).span || 0) | 0) > 1) n++;
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

export function setCell(content: TimetableContent, di: number, ri: number, key: string, patch: Partial<TimetableCell>): TimetableContent {
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

export function setCellText(content: TimetableContent, di: number, ri: number, key: string, text: string): TimetableContent {
  if (cellOf(content.days[di]?.rows[ri], key).t === text) return content;
  return setCell(content, di, ri, key, { t: text });
}

export function setCellColor(content: TimetableContent, di: number, ri: number, key: string, color: TimetableCellColor): TimetableContent {
  if ((cellOf(content.days[di]?.rows[ri], key).c || '') === (color || '')) return content;
  return setCell(content, di, ri, key, { c: color });
}


/* ───────────── 장소 ───────────── */

const PLACE_LABEL_RE = /^(장소|place|venue|location)$/i;

/** 「장소」 열. 라벨로 찾고, 없으면 기본 문서의 두 번째 열(c2)이 텍스트 열이면 그것 */
export function placeColumn(content: TimetableContent): TimetableColumn | undefined {
  const byLabel = content.columns.find((c) => c.type !== 'time' && PLACE_LABEL_RE.test((c.label || '').trim()));
  if (byLabel) return byLabel;
  const c2 = content.columns.find((c) => c.key === 'c2');
  return c2 && c2.type !== 'time' ? c2 : undefined;
}

/** 표에 기입된 장소들 (중복 제거, 등장 순서). 병합으로 숨은 셀도 값이 있으면 포함 */
export function collectPlaces(content: TimetableContent): string[] {
  const col = placeColumn(content);
  if (!col) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const day of content.days) {
    for (const row of day.rows) {
      const t = (cellOf(row, col.key).t || '').trim();
      if (!t) continue;
      const k = normTerm(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** 표의 장소들을 우상단 한 줄로 */
export function autoPlaceNote(content: TimetableContent): string {
  return collectPlaces(content).join(' / ');
}

/** 우상단에 실제로 보일 장소 줄: 직접 적은 값이 있으면 그것, 없으면 표에서 모은 값 */
export function effectivePlaceNote(content: TimetableContent): string {
  return autoPlaceNote(content); // 우상단 장소는 표의 장소 열에서만 모은다 (직접 입력 없음)
}

/* ───────────── 병합 ───────────── */

/**
 * 같은 열의 r1..r2 를 합친다. 맨 위 셀이 대표가 되고, 대표가 비어 있으면 범위 안 첫 값(색 포함)을 가져온다.
 * 나머지 셀의 값은 버리지 않고 숨긴다 (span만 지우면 돌아온다).
 */
export function mergeRange(content: TimetableContent, di: number, key: string, r1: number, r2: number): TimetableContent {
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
export function unmerge(content: TimetableContent, di: number, key: string, ri: number): TimetableContent {
  const day = content.days[di];
  if (!day) return content;
  const a = anchorOf(day, key, ri);
  if (spanOf(day, key, a) < 2) return content;
  const next = cloneContent(content);
  delete ensureCell(next.days[di].rows[a], key).span;
  return next;
}

/** 시간 열을 뺀 모든 열에서, 연속으로 같은 값(같은 색)인 셀을 한 번에 합친다. */
export function autoMerge(content: TimetableContent): {
  content: TimetableContent;
  merged: number;
} {
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

/**
 * 시간 셀을 쓰고, 그 행의 종료 시각이 바뀌었으면 같은 날짜의 아래 행들을 따라 옮긴다.
 * 겹치는 시간은 없다는 전제로, 다음 행의 시작은 이전 행의 종료에 맞춘다.
 * - 원래 있던 간격(쉬는 시간)은 그대로 유지하고, 겹쳐 있던 행만 끝시각에 딱 붙인다.
 * - 각 행의 길이는 유지된다. 시간이 없는 행·병합에 덮인 행은 건너뛴다.
 * - 옮긴 뒤에도 아래 행을 따로 고칠 수 있다 (고치면 그 아래가 다시 따라온다).
 */
export function setTimeTextCascade(content: TimetableContent, di: number, ri: number, key: string, text: string): TimetableContent {
  const day = content.days[di];
  if (!day) return content;
  const before = parseRange(cellOf(day.rows[ri], key).t);
  const next = setCellText(content, di, ri, key, text);
  const after = parseRange(text);
  const col = content.columns.find((c) => c.key === key);
  if (!before || !after || before.e === after.e || col?.type !== 'time') return next;
  const out = next === content ? cloneContent(content) : next;
  cascadeBelowInPlace(out.days[di], key, ri + 1, before.e, after.e);
  return out;
}

/**
 * (복제본 전용) fromRow 부터 아래 시간 행들을 「이전 행 종료가 prevOldEnd → prevNewEnd 로 바뀌었다」고 보고 따라 옮긴다.
 * 간격 유지·겹침은 붙임·길이 유지. 시간이 없는 행·병합에 덮인 행은 건너뛴다. 바뀐 행 수를 돌려준다.
 */
function cascadeBelowInPlace(day: TimetableDay, key: string, fromRow: number, prevOldEnd: number, prevNewEnd: number): number {
  const cov = covers(day, key);
  let changed = 0;
  for (let i = fromRow; i < day.rows.length; i++) {
    if (cov[i] >= 0) continue;
    const cell = ensureCell(day.rows[i], key);
    const r = parseRange(cell.t);
    if (!r) continue;
    let gap = r.s - prevOldEnd;
    if (gap < 0) gap = 0;
    let dur = r.e - r.s;
    if (dur < 0) dur += 1440;
    const ns = prevNewEnd + gap;
    const ne = ns + dur;
    const txt = fmtRange({ s: ns, e: ne });
    if (cell.t !== txt) {
      cell.t = txt;
      changed++;
    }
    prevOldEnd = r.e;
    prevNewEnd = ne;
  }
  return changed;
}

/**
 * ri 아래에 빈 행을 끼워 넣는다.
 * - 시간 열이 있고 ri 행의 시간이 읽히면(병합에 가려지지 않은 대표 행) 새 행은 「시작 = ri 종료, 길이 = ri 길이」로 채우고,
 *   그 아래 행들은 setTimeTextCascade 와 같은 규칙으로 따라 옮긴다.
 * - ri 가 어떤 열의 세로 병합 안에 있고 그 병합이 ri 아래로 이어지면 span 이 1 늘어 병합이 유지된다.
 */
export function insertRowAfter(content: TimetableContent, di: number, ri: number): TimetableContent {
  const src = content.days[di];
  if (!src || !src.rows[ri]) return content;
  const next = cloneContent(content);
  const day = next.days[di];
  let timeInsideSpan = false;
  for (const c of next.columns) {
    const cov = covers(day, c.key);
    const a = cov[ri] >= 0 ? cov[ri] : ri;
    const s = spanOf(day, c.key, a);
    if (s > 1 && ri < a + s - 1) {
      ensureCell(day.rows[a], c.key).span = s + 1;
      if (c.type === 'time') timeInsideSpan = true;
    }
  }
  day.rows.splice(ri + 1, 0, emptyRow(next.columns));
  const tcol = timeColumn(next);
  if (tcol && !timeInsideSpan) {
    const pr = parseRange(cellOf(day.rows[ri], tcol.key).t);
    if (pr) {
      let len = pr.e - pr.s;
      if (len < 0) len += 1440;
      if (len === 0) len = DEFAULT_TIME_LENGTH;
      const r: TimeRange = { s: pr.e, e: pr.e + len };
      ensureCell(day.rows[ri + 1], tcol.key).t = fmtRange(r);
      cascadeBelowInPlace(day, tcol.key, ri + 2, pr.e, r.e);
    }
  }
  return next;
}

/**
 * 행 순서 바꾸기: from 행의 「시간 열이 아닌」 셀들을 to 자리로 옮긴다. 시간 칸은 고정이고 내용만 움직인다.
 * 시간 열이 아닌 열의 세로 병합이 from 을 포함하거나 이동으로 쪼개지면 아무것도 하지 않는다 (같은 객체 반환).
 */
export function moveRow(content: TimetableContent, di: number, from: number, to: number): TimetableContent {
  const day = content.days[di];
  if (!day) return content;
  const n = day.rows.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return content;
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (i !== from) order.push(i);
  order.splice(to, 0, from);
  const posOf: number[] = [];
  order.forEach((orig, idx) => {
    posOf[orig] = idx;
  });
  for (const c of content.columns) {
    if (c.type === 'time') continue;
    let i = 0;
    while (i < n) {
      const s = spanOf(day, c.key, i);
      for (let j = 1; j < s; j++) if (posOf[i + j] !== posOf[i] + j) return content;
      i += s;
    }
  }
  const next = cloneContent(content);
  const rows = next.days[di].rows;
  const srcRows = rows.map(cloneRow);
  for (let idx = 0; idx < n; idx++) {
    const row = rows[idx];
    for (const c of next.columns) {
      if (c.type === 'time') continue;
      const cell = srcRows[order[idx]][c.key];
      if (cell) row[c.key] = { ...cell };
      else delete row[c.key];
    }
  }
  return next;
}

/* ───────────── 클립보드 격자 붙여넣기 ───────────── */

/**
 * 스프레드시트에서 복사한 텍스트(탭 구분)를 2차원 배열로. 탭이 없으면 격자가 아니므로 null (셀은 원래 여러 줄이 된다).
 * 엑셀식 따옴표 셀("a\nb" 는 한 셀, "" 는 ") 을 처리한다.
 */
export function parseClipboardGrid(text: string | null | undefined): string[][] | null {
  if (!text || text.indexOf('\t') < 0) return null;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '"' && cell === '') {
      i++;
      let closed = false;
      while (i < n) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        cell += ch;
        i++;
      }
      if (!closed) break;
      continue;
    }
    const ch = text[i];
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      i++;
    } else if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      cell += ch;
      i++;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // 엑셀은 끝에 줄바꿈을 붙이므로 마지막 빈 행은 버린다
  while (rows.length > 1 && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows.length ? rows : null;
}

/**
 * 격자를 (di, ri, key) 부터 오른쪽·아래로 채운다. 열은 key 부터 순서대로, 행은 모자라면 끝에 붙인다.
 * 병합에 덮인 칸은 건너뛰고(대표 행에서 대표 칸에 쓴다), 시간 열 값은 normalizeTimeText 를 거친다.
 */
export function pasteGrid(content: TimetableContent, di: number, ri: number, key: string, grid: string[][]): TimetableContent {
  const src = content.days[di];
  const ci = content.columns.findIndex((c) => c.key === key);
  if (!src || !src.rows[ri] || ci < 0 || !grid.length) return content;
  const next = cloneContent(content);
  const day = next.days[di];
  const need = ri + grid.length;
  while (day.rows.length < need) day.rows.push(emptyRow(next.columns));
  const covs: Record<string, number[]> = {};
  for (const c of next.columns) covs[c.key] = covers(day, c.key);
  let changed = day.rows.length !== src.rows.length;
  grid.forEach((gr, r) => {
    const row = day.rows[ri + r];
    gr.forEach((raw, c) => {
      const col = next.columns[ci + c];
      if (!col) return;
      if (covs[col.key][ri + r] >= 0) return;
      const v = col.type === 'time' ? normalizeTimeText(raw) : raw;
      const cell = ensureCell(row, col.key);
      if (cell.t !== v) {
        cell.t = v;
        changed = true;
      }
    });
  });
  return changed ? next : content;
}

/* ───────────── 하루 시간 요약 · 겹침 ───────────── */

export interface DayTimeSummary {
  /** 첫 행 시작 (분) */
  start: number;
  /** 마지막 행 종료 (분, 하루 단위 값) */
  end: number;
  /** 시작 → 종료 (자정 넘김이면 1440 더함) */
  total: number;
  /** 연속 행 사이 양의 간격 합 */
  breaks: number;
}

/** 시간이 읽히는 행(병합에 덮인 행 제외)의 구간 목록 [행 번호, 구간] */
function dayRanges(day: TimetableDay, key: string): { ri: number; r: TimeRange }[] {
  const cov = covers(day, key);
  const out: { ri: number; r: TimeRange }[] = [];
  day.rows.forEach((row, ri) => {
    if (cov[ri] >= 0) return;
    const r = parseRange(cellOf(row, key).t);
    if (r) out.push({ ri, r });
  });
  return out;
}

export function summarizeDayTimes(content: TimetableContent, di: number): DayTimeSummary | null {
  const day = content.days[di];
  const tcol = timeColumn(content);
  if (!day || !tcol) return null;
  const list = dayRanges(day, tcol.key);
  if (!list.length) return null;
  const start = list[0].r.s;
  const end = list[list.length - 1].r.e;
  let total = end - start;
  if (total < 0) total += 1440;
  let breaks = 0;
  for (let i = 1; i < list.length; i++) {
    const gap = list[i].r.s - list[i - 1].r.e;
    if (gap > 0) breaks += gap;
  }
  return { start, end, total, breaks };
}

/**
 * 위 행과 시간이 겹치는 행 번호들. 시간이 읽히는 행끼리 순서대로 비교해 next.s < prev.e 이면 next 를 표시한다.
 * prev 가 자정 넘김 구간(e <= s)이면 비교하지 않는다.
 */
export function overlapRows(content: TimetableContent, di: number): Set<number> {
  const out = new Set<number>();
  const day = content.days[di];
  const tcol = timeColumn(content);
  if (!day || !tcol) return out;
  const list = dayRanges(day, tcol.key);
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1].r;
    const cur = list[i].r;
    if (prev.e > prev.s && cur.s < prev.e) out.add(list[i].ri);
  }
  return out;
}

/** 두 content 사이에서 같은 날짜·시간 열의 ri 아래 행 중 값이 바뀐 행 수 (연쇄 안내용) */
export function countChangedBelow(a: TimetableContent, b: TimetableContent, di: number, ri: number, key: string): number {
  const ra = a.days[di]?.rows ?? [];
  const rb = b.days[di]?.rows ?? [];
  let n = 0;
  for (let i = ri + 1; i < Math.min(ra.length, rb.length); i++) {
    if (cellOf(ra[i], key).t !== cellOf(rb[i], key).t) n++;
  }
  return n;
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
  for (const t of server)
    map.set(`${t.field}\u0000${normTerm(t.value)}`, {
      ...t,
      value: normTerm(t.value),
    });
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
export function rankSuggestions(terms: PersonalFeatureTerm[], field: string, query: string, limit = SUGGEST_LIMIT): PersonalFeatureTerm[] {
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
      a.rank - b.rank || (b.t.use_count || 0) - (a.t.use_count || 0) || (b.t.last_used_at || '').localeCompare(a.t.last_used_at || ''),
  );
  return out.slice(0, limit).map((o) => o.t);
}
