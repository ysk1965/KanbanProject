import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { flushSync } from 'react-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Columns3, GripVertical, ImageDown, Loader2, Plus, Redo2, Undo2, X } from 'lucide-react';
import type { FeatureEditorProps, PersonalFeatureTerm, TimetableCellColor, TimetableContent } from '../types';
import {
  addColumn,
  addDay,
  addRow,
  anchorOf,
  autoMerge,
  cellOf,
  colOf,
  autoPlaceNote,
  collectDocTerms,
  countMerged,
  countRows,
  covers,
  createDefaultTimetable,
  defaultRange,
  fmtRange,
  fmtT,
  formatDayLabel,
  insertRowAfter,
  isRangeInverted,
  mergeRange,
  moveColumn,
  moveRow,
  normRange,
  normTerm,
  normalizeTimeText,
  overlapRows,
  parseClipboardGrid,
  pasteGrid,
  setTimeTextCascade,
  countChangedBelow,
  parseRange,
  rankSuggestions,
  removeColumn,
  removeDay,
  removeRow,
  setCellColor,
  setCellText,
  setColumnLabel,
  setDayDate,
  setHeader,
  spanOf,
  summarizeDayTimes,
  unionTerms,
  unmerge,
  type TimeRange,
} from './timetableModel';
import { TIMETABLE_COLOR_LABELS, TIMETABLE_COLOR_ORDER } from './colors';
import { TimeRangePicker } from './TimeRangePicker';
import { TermSuggestList } from './TermSuggestList';
import { TimetablePrintSheet } from './TimetablePrintSheet';
import './timetable.css';

const UNDO_LIMIT = 100;
/** 같은 셀에 대한 연속 변경(시간 피커의 select 등)은 이 시간 안이면 한 단계로 묶는다 */
const UNDO_COALESCE_MS = 800;
/** 이미지 복사용 오프스크린 종이 폭 (A4 가로 96dpi ≈ 1123px) */
const IMAGE_SHEET_WIDTH = 1123;

/**
 * 시간표 편집기. 기획서 docs/Design/myspace-features-timetable.html 04절 시안 B.
 *
 * 셀은 contentEditable 을 비제어로 둔다: 타이핑은 DOM 이 갖고, blur/commit 때 모델에 쓴다.
 * 모델이 바깥에서 바뀌면(추천 선택·병합·행 삭제 등) useLayoutEffect 가 포커스 없는 셀의 텍스트만 맞춘다.
 */

type Pos = { di: number; ri: number; key: string };
type RowDragState = { di: number; from: number; over: number; after: boolean };
type Range = { di: number; key: string; r1: number; r2: number };

interface TimePopState {
  pos: Pos;
  el: HTMLElement;
  value: TimeRange;
  hint?: string;
  hintStrong?: boolean;
}

interface SuggState {
  pos: Pos;
  el: HTMLElement;
  query: string;
  items: PersonalFeatureTerm[];
  idx: number;
}

const INPUT_CLS =
  'w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-sm text-foreground placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all';
const GHOST_BTN_CLS =
  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-slate-400';
const LABEL_CLS = 'text-xs font-bold uppercase tracking-widest text-slate-400';

const prevent = (e: { preventDefault: () => void }) => e.preventDefault();

function samePos(a: Pos | null, b: Pos | null): boolean {
  return !!a && !!b && a.di === b.di && a.ri === b.ri && a.key === b.key;
}

/** contentEditable 의 실제 텍스트 (NBSP → 공백, 끝 줄바꿈 제거) */
function readText(el: HTMLElement): string {
  return (el.innerText || '').replace(/ /g, ' ').replace(/\n+$/, '');
}

function placeCaretEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function selectAllIn(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(r);
}

function posOf(el: HTMLElement): Pos | null {
  const { di, ri, key } = el.dataset;
  if (di == null || ri == null || !key) return null;
  return { di: +di, ri: +ri, key };
}

/** 되돌리기 묶음 키 (같은 셀의 연속 변경) */
function cellKey(p: Pos): string {
  return `cell:${p.di}:${p.ri}:${p.key}`;
}

/** 열 이름 + 값이 기억된 용어와 정확히 같으면 그 색 (대소문자 무시) */
function colorOfTerm(terms: PersonalFeatureTerm[], field: string, value: string): TimetableCellColor | '' {
  const v = normTerm(value).toLowerCase();
  if (!v) return '';
  const hit = terms.find((x) => x.field === field && !!x.color && normTerm(x.value).toLowerCase() === v);
  return (hit?.color as TimetableCellColor) || '';
}

function isEditableEl(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && (el.classList.contains('tt-cell') || el.classList.contains('tt-th-label'));
}

export function TimetableEditor({ doc, onChange, terms, onForgetTerm, readOnly }: FeatureEditorProps<TimetableContent>) {
  const { t } = useTranslation();
  const tt = useCallback(
    (key: string, def: string, opts?: Record<string, unknown>) =>
      t(`personal.features.timetable_editor.${key}`, {
        defaultValue: def,
        ...opts,
      }) as string,
    [t],
  );
  const weekNames = useMemo(() => tt('weekdays', '일,월,화,수,목,금,토').split(','), [tt]);

  /* ── 모델 (셸이 debounce 저장) ── */
  const [content, setContentState] = useState<TimetableContent>(() => doc.content ?? createDefaultTimetable());
  const contentRef = useRef(content);
  const lastEmitted = useRef<TimetableContent | null>(null);

  useEffect(() => {
    const incoming = doc.content;
    if (!incoming) return;
    if (incoming === lastEmitted.current || incoming === contentRef.current) return;
    contentRef.current = incoming;
    setContentState(incoming);
  }, [doc.content, doc.id]);

  /* ── 되돌리기 스택 (문서 단위 스냅샷) ── */
  const undoStack = useRef<TimetableContent[]>([]);
  const redoStack = useRef<TimetableContent[]>([]);
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: undoStack.current.length, redo: redoStack.current.length });

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastPush.current = null;
    setHist({ undo: 0, redo: 0 });
  }, [doc.id]);

  /**
   * 동기적으로 이어 부를 수 있는 갱신. 바뀐 게 없으면 false.
   * coalesceKey 가 같은 연속 변경(같은 셀 타이핑·시간 피커)은 UNDO_COALESCE_MS 안이면 한 되돌리기 단계로 묶는다.
   */
  const update = useCallback(
    (fn: (c: TimetableContent) => TimetableContent, coalesceKey?: string): boolean => {
      const prev = contentRef.current;
      const next = fn(prev);
      if (next === prev) return false;
      const now = Date.now();
      const lp = lastPush.current;
      const coalesce = !!coalesceKey && !!lp && lp.key === coalesceKey && now - lp.at < UNDO_COALESCE_MS;
      if (!coalesce) {
        undoStack.current.push(prev);
        if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      }
      redoStack.current = [];
      lastPush.current = coalesceKey ? { key: coalesceKey, at: now } : null;
      syncHist();
      contentRef.current = next;
      lastEmitted.current = next;
      setContentState(next);
      onChange(next);
      return true;
    },
    [onChange],
  );

  /* ── 편집 상태 ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const selectedRef = useRef<Pos | null>(null);
  const rangeRef = useRef<Range | null>(null);
  selectedRef.current = selected;
  rangeRef.current = range;
  const shiftPending = useRef(false);
  const pendingFocus = useRef<{ cell?: Pos; thKey?: string } | null>(null);

  const [timePop, setTimePop] = useState<TimePopState | null>(null);
  const [sugg, setSugg] = useState<SuggState | null>(null);
  const timePopRef = useRef<TimePopState | null>(null);
  const suggRef = useRef<SuggState | null>(null);
  timePopRef.current = timePop;
  suggRef.current = sugg;

  const [rowDrag, setRowDrag] = useState<RowDragState | null>(null);
  const rowDragRef = useRef<RowDragState | null>(null);
  const [copyingImage, setCopyingImage] = useState(false);
  const shotRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      rootRef.current?.classList.remove('tt-row-dragging');
    },
    [],
  );

  const [forgotten, setForgotten] = useState<Set<string>>(() => new Set());
  const forgottenRef = useRef(forgotten);
  forgottenRef.current = forgotten;

  const allTerms = useMemo(() => unionTerms(terms, collectDocTerms(content)), [terms, content]);
  const autoPlace = useMemo(() => autoPlaceNote(content), [content]);
  const manualPlace = (content.place_note || '').trim();
  const placeOverridden = manualPlace !== '' && manualPlace !== autoPlace;
  const shownPlace = manualPlace || autoPlace;
  const allTermsRef = useRef(allTerms);
  allTermsRef.current = allTerms;

  /* ── DOM ↔ 모델 동기화 (포커스 없는 셀만) + 렌더 후 포커스 ── */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const c = contentRef.current;
    const active = document.activeElement;
    root.querySelectorAll<HTMLElement>('.tt-cell').forEach((el) => {
      if (el === active) return;
      const p = posOf(el);
      if (!p) return;
      const cell = cellOf(c.days[p.di]?.rows[p.ri], p.key);
      if (el.textContent !== cell.t) el.textContent = cell.t;
    });
    root.querySelectorAll<HTMLElement>('.tt-th-label').forEach((el) => {
      if (el === active) return;
      const col = colOf(c, el.dataset.key || '');
      if (col && el.textContent !== col.label) el.textContent = col.label;
    });
    const pf = pendingFocus.current;
    if (pf) {
      pendingFocus.current = null;
      if (pf.cell) {
        const el = findCellEl(pf.cell);
        if (el) {
          el.focus();
          placeCaretEnd(el);
        }
      } else if (pf.thKey) {
        const el = root.querySelector<HTMLElement>(`.tt-th-label[data-key="${pf.thKey}"]`);
        if (el) {
          el.focus();
          selectAllIn(el);
        }
      }
    }
  });

  const findCellEl = (p: Pos): HTMLElement | null =>
    rootRef.current?.querySelector<HTMLElement>(`.tt-cell[data-di="${p.di}"][data-ri="${p.ri}"][data-key="${p.key}"]`) ?? null;

  /* ── 커밋 ── */
  const commitCell = useCallback(
    (el: HTMLElement): boolean => {
      const p = posOf(el);
      if (!p) return false;
      const c = contentRef.current;
      if (!c.days[p.di]?.rows[p.ri]) return false;
      const col = colOf(c, p.key);
      let v = readText(el);
      if (col?.type === 'time') v = normalizeTimeText(v);
      const ck = cellKey(p);
      const changed =
        col?.type === 'time'
          ? update((cur) => setTimeTextCascade(cur, p.di, p.ri, p.key, v), ck)
          : update((cur) => {
              const n = setCellText(cur, p.di, p.ri, p.key, v);
              // 비고 색 규칙: 값이 바뀌어 커밋될 때 색이 없고, 기억된 용어와 정확히 같으면 그 색을 따라간다
              if (n === cur || !col?.suggest || cellOf(n.days[p.di]?.rows[p.ri], p.key).c) return n;
              const color = colorOfTerm(allTermsRef.current, col.label, v);
              return color ? setCellColor(n, p.di, p.ri, p.key, color) : n;
            }, ck);
      if (el.textContent !== v && el !== document.activeElement) el.textContent = v;
      return changed;
    },
    [update],
  );

  const commitLabel = useCallback(
    (el: HTMLElement): boolean => {
      const key = el.dataset.key;
      if (!key) return false;
      return update((cur) => setColumnLabel(cur, key, readText(el)));
    },
    [update],
  );

  /** 포커스 중인 셀·머리글 값을 먼저 모델에 쓴다 (버튼 동작 직전) */
  const commitActive = useCallback((): boolean => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !rootRef.current?.contains(a)) return false;
    if (a.classList.contains('tt-cell')) return commitCell(a);
    if (a.classList.contains('tt-th-label')) return commitLabel(a);
    return false;
  }, [commitCell, commitLabel]);

  const blurActive = () => {
    const a = document.activeElement as HTMLElement | null;
    if (a && rootRef.current?.contains(a)) a.blur();
  };

  const closePops = useCallback(() => {
    if (timePopRef.current) setTimePop(null);
    if (suggRef.current) setSugg(null);
  }, []);

  /* ── 시간 피커 ── */
  const writeTime = useCallback(
    (p: Pos, r: TimeRange) => {
      const txt = fmtRange(r);
      const prevContent = contentRef.current;
      update((cur) => setTimeTextCascade(cur, p.di, p.ri, p.key, txt), cellKey(p));
      const moved = countChangedBelow(prevContent, contentRef.current, p.di, p.ri, p.key);
      const el = findCellEl(p);
      if (el && el.textContent !== txt) {
        el.textContent = txt;
        if (el === document.activeElement) placeCaretEnd(el);
      }
      const hint =
        moved > 0
          ? tt('time_cascaded', '아래 {{count}}행의 시간을 따라 옮겼습니다', {
              count: moved,
            })
          : undefined;
      setTimePop((cur) => (cur && samePos(cur.pos, p) ? { ...cur, value: r, hint, hintStrong: moved > 0 } : cur));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, tt],
  );

  const openTimePop = (el: HTMLElement, p: Pos) => {
    const c = contentRef.current;
    const cell = cellOf(c.days[p.di]?.rows[p.ri], p.key);
    let r = parseRange(cell.t);
    let hint: string | undefined;
    let hintStrong = false;
    if (!r) {
      r = defaultRange(c, p.di, p.ri);
      if (!cell.t.trim()) {
        const txt = fmtRange(r);
        update((cur) => setCellText(cur, p.di, p.ri, p.key, txt), cellKey(p));
        el.textContent = txt;
        placeCaretEnd(el);
        hint = tt('time_hint_filled', '이전 행 종료 시각에서 이어서 채웠습니다');
        hintStrong = true;
      }
    }
    setTimePop({ pos: p, el, value: r, hint, hintStrong });
  };

  /* ── 추천 목록 ── */
  const openSugg = (el: HTMLElement, p: Pos) => {
    const c = contentRef.current;
    const col = colOf(c, p.key);
    if (!col || !col.suggest) {
      if (suggRef.current) setSugg(null);
      return;
    }
    const q = readText(el).trim();
    const fg = forgottenRef.current;
    const items = rankSuggestions(
      allTermsRef.current.filter((x) => !fg.has(`${x.field}\u0000${x.value}`)),
      col.label,
      q,
    );
    if (!items.length) {
      if (suggRef.current) setSugg(null);
      return;
    }
    setSugg({ pos: p, el, query: q, items, idx: -1 });
  };

  const suggPick = (i: number) => {
    const s = suggRef.current;
    const it = s?.items[i];
    if (!s || !it) return;
    const p = s.pos;
    update((cur) => {
      let n = setCellText(cur, p.di, p.ri, p.key, it.value);
      const cell = cellOf(n.days[p.di]?.rows[p.ri], p.key);
      if (!cell.c && it.color) n = setCellColor(n, p.di, p.ri, p.key, it.color as TimetableCellColor);
      return n;
    }, cellKey(p));
    const el = findCellEl(p) || s.el;
    if (el) {
      el.textContent = it.value;
      el.focus();
      placeCaretEnd(el);
    }
    setSugg(null);
  };

  const suggForget = (i: number) => {
    const s = suggRef.current;
    const it = s?.items[i];
    if (!s || !it) return;
    onForgetTerm(it.field, it.value);
    const next = new Set(forgottenRef.current);
    next.add(`${it.field}\u0000${it.value}`);
    forgottenRef.current = next;
    setForgotten(next);
    toast(
      tt('term_forgotten', '「{{value}}」을 기억에서 지웠습니다', {
        value: it.value,
      }),
    );
    const el = findCellEl(s.pos) || s.el;
    if (el && el === document.activeElement) openSugg(el, s.pos);
    else setSugg(null);
  };

  /* ── 팝오버 바깥 클릭 · 포커스 이동 · 스크롤 → 닫기 ── */
  useEffect(() => {
    if (!timePop && !sugg) return;
    const isPop = (n: EventTarget | null) => n instanceof Element && !!n.closest('.tt-pop');
    // 셀로 가는 포커스·클릭은 onCellFocus 가 어느 팝오버를 열지 정하므로 여기서는 건드리지 않는다
    const isCell = (n: EventTarget | null) => n instanceof Element && !!n.closest('.tt-cell');
    const onFocusIn = (e: FocusEvent) => {
      const tg = e.target;
      if (isPop(tg) || isCell(tg)) return;
      setTimePop(null);
      setSugg(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const tg = e.target;
      if (isPop(tg) || isCell(tg)) return;
      setTimePop(null);
      setSugg(null);
    };
    const onScroll = (e: Event) => {
      if (isPop(e.target)) return;
      setTimePop(null);
      setSugg(null);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [!!timePop, !!sugg]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 셀 이벤트 ── */
  const onCellFocus = (e: React.FocusEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
    setSelected(p);
    if (!shiftPending.current) setRange(null);
    shiftPending.current = false;
    const col = colOf(contentRef.current, p.key);
    if (col?.type === 'time') {
      if (suggRef.current) setSugg(null);
      openTimePop(el, p);
    } else {
      if (timePopRef.current) setTimePop(null);
      openSugg(el, p);
    }
  };

  const onCellBlur = (e: React.FocusEvent<HTMLElement>) => {
    commitCell(e.currentTarget);
  };

  /** 탭 구분(스프레드시트) 텍스트면 여러 셀에 나눠 넣는다. 그 밖의 텍스트는 보통 붙여넣기 */
  const onCellPaste = (e: React.ClipboardEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
    const grid = parseClipboardGrid(e.clipboardData.getData('text/plain'));
    if (!grid) return;
    e.preventDefault();
    closePops();
    update((cur) => pasteGrid(cur, p.di, p.ri, p.key, grid));
    const v = cellOf(contentRef.current.days[p.di]?.rows[p.ri], p.key).t;
    if (el.textContent !== v) el.textContent = v;
    placeCaretEnd(el);
    const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
    toast(
      tt('pasted_grid', '{{rows}}×{{cols}} 셀을 붙여 넣었습니다', {
        rows: grid.length,
        cols,
      }),
    );
  };

  const onCellInput = (e: React.FormEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
    const col = colOf(contentRef.current, p.key);
    if (col?.type === 'time') {
      const r = parseRange(readText(el));
      if (r && timePopRef.current) setTimePop((cur) => (cur ? { ...cur, value: r, hint: undefined, hintStrong: false } : cur));
    } else if (col?.suggest) {
      openSugg(el, p);
    }
  };

  /** 드래그로 같은 열의 범위를 잡는다. 같은 셀 안에서만 움직이면 보통의 글자 선택이다. */
  const startDragSelect = (startEl: HTMLElement, start: Pos) => {
    const root = rootRef.current;
    if (!root) return;
    let dragging = false;
    const onMove = (ev: MouseEvent) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const cellEl = under instanceof Element ? under.closest<HTMLElement>('.tt-cell') : null;
      const p = cellEl ? posOf(cellEl) : null;
      if (!p || p.di !== start.di || p.key !== start.key) return;
      if (!dragging) {
        if (p.ri === start.ri) return; // 아직 같은 셀 → 글자 선택 유지
        dragging = true;
        root.classList.add('tt-dragging');
        closePops();
        setSelected(start);
      }
      window.getSelection()?.removeAllRanges();
      setRange({
        di: start.di,
        key: start.key,
        r1: Math.min(start.ri, p.ri),
        r2: Math.max(start.ri, p.ri),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragging) return;
      root.classList.remove('tt-dragging');
      if (document.activeElement === startEl) placeCaretEnd(startEl);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onCellMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
    if (!e.shiftKey) {
      if (e.button === 0) startDragSelect(el, p);
      return;
    }
    e.preventDefault();
    const sel = selectedRef.current;
    if (!sel || sel.di !== p.di) {
      setSelected(p);
      setRange(null);
      shiftPending.current = true;
      el.focus();
      return;
    }
    if (sel.key !== p.key) {
      toast(tt('merge_same_column_only', '병합은 같은 열 안에서만 됩니다'));
      return;
    }
    closePops();
    setRange({
      di: p.di,
      key: p.key,
      r1: Math.min(sel.ri, p.ri),
      r2: Math.max(sel.ri, p.ri),
    });
  };

  const focusSibling = (el: HTMLElement, dir: 1 | -1): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const cells = Array.from(root.querySelectorAll<HTMLElement>('.tt-cell[contenteditable="true"]'));
    const i = cells.indexOf(el);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cells.length) return false;
    cells[j].focus();
    placeCaretEnd(cells[j]);
    return true;
  };

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
    const s = suggRef.current;
    if (s) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSugg((cur) =>
          cur && cur.items.length
            ? {
                ...cur,
                idx: (cur.idx + d + cur.items.length) % cur.items.length,
              }
            : cur,
        );
        return;
      }
      if (e.key === 'Enter' && s.idx >= 0) {
        e.preventDefault();
        suggPick(s.idx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSugg(null);
        return;
      }
    }
    if (timePopRef.current) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTimePop(null);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
        setTimePop(null);
        return;
      }
    }
    const sel = selectedRef.current;
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && sel) {
      e.preventDefault();
      closePops();
      const day = contentRef.current.days[sel.di];
      if (!day) return;
      const cur = rangeRef.current;
      const r = cur && cur.key === sel.key ? { r1: cur.r1, r2: cur.r2 } : { r1: sel.ri, r2: sel.ri };
      if (e.key === 'ArrowDown') {
        if (r.r2 < day.rows.length - 1) r.r2 = r.r2 + spanOf(day, sel.key, r.r2);
      } else if (r.r1 > 0) {
        const cov = covers(day, sel.key);
        const up = r.r1 - 1;
        r.r1 = cov[up] >= 0 ? cov[up] : up;
      }
      r.r2 = Math.min(r.r2, day.rows.length - 1);
      setRange({ di: sel.di, key: sel.key, r1: r.r1, r2: r.r2 });
      return;
    }
    if (e.key === 'Escape' && rangeRef.current) {
      e.preventDefault();
      setRange(null);
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      doInsertRowAfter(p.di, p.ri);
      return;
    }
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (focusSibling(el, -1)) e.preventDefault();
        return;
      }
      if (focusSibling(el, 1)) {
        e.preventDefault();
        return;
      }
      // 마지막 셀에서 Tab → 행 추가
      e.preventDefault();
      commitCell(el);
      closePops();
      const c = contentRef.current;
      pendingFocus.current = {
        cell: { di: p.di, ri: c.days[p.di].rows.length, key: c.columns[0].key },
      };
      update((cur) => addRow(cur, p.di));
    }
  };

  /* ── 툴바 동작 ── */
  const applyColor = (color: TimetableCellColor) => {
    const sel = selectedRef.current;
    if (!sel) {
      toast(tt('pick_cell_first', '먼저 색을 줄 셀을 누르세요'));
      return;
    }
    commitActive();
    update((cur) => setCellColor(cur, sel.di, sel.ri, sel.key, color));
    closePops();
    setRange(null);
    const el = findCellEl(sel);
    if (el && el !== document.activeElement) {
      el.focus();
      placeCaretEnd(el);
    }
  };

  const doMerge = () => {
    const r = rangeRef.current;
    if (!r) return;
    commitActive();
    const day = contentRef.current.days[r.di];
    if (!day) return;
    const nr = normRange(day, r.key, r.r1, r.r2);
    if (nr.r2 <= nr.r1) return;
    closePops();
    blurActive();
    pendingFocus.current = { cell: { di: r.di, ri: nr.r1, key: r.key } };
    update((cur) => mergeRange(cur, r.di, r.key, nr.r1, nr.r2));
    setSelected({ di: r.di, ri: nr.r1, key: r.key });
    setRange(null);
    toast(tt('merged_rows', '{{count}}행을 합쳤습니다. 「병합 해제」로 되돌릴 수 있습니다', { count: nr.r2 - nr.r1 + 1 }));
  };

  const doUnmerge = () => {
    const sel = selectedRef.current;
    if (!sel) return;
    commitActive();
    const day = contentRef.current.days[sel.di];
    if (!day) return;
    const a = anchorOf(day, sel.key, sel.ri);
    if (spanOf(day, sel.key, a) < 2) return;
    closePops();
    blurActive();
    pendingFocus.current = { cell: { di: sel.di, ri: a, key: sel.key } };
    update((cur) => unmerge(cur, sel.di, sel.key, a));
    setSelected({ di: sel.di, ri: a, key: sel.key });
    setRange(null);
    toast(tt('unmerged', '병합을 풀었습니다. 숨겨 둔 값이 그대로 돌아옵니다'));
  };

  const doAutoMerge = () => {
    commitActive();
    closePops();
    blurActive();
    const { content: next, merged } = autoMerge(contentRef.current);
    if (merged) update(() => next);
    setRange(null);
    toast(
      merged
        ? tt('auto_merged', '{{count}}곳을 합쳤습니다. 각각 「병합 해제」로 되돌릴 수 있습니다', { count: merged })
        : tt('auto_merge_none', '연속으로 같은 값인 셀이 없습니다'),
    );
  };

  const doAddColumn = () => {
    commitActive();
    closePops();
    let key = '';
    update((cur) => {
      const n = addColumn(cur, tt('new_column', '새 열'));
      key = n.columns[n.columns.length - 1].key;
      return n;
    });
    if (key) pendingFocus.current = { thKey: key };
  };

  const doAddDay = () => {
    commitActive();
    closePops();
    update(addDay);
    window.setTimeout(() => {
      rootRef.current?.querySelector('.tt-day:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };

  const doAddRow = (di: number) => {
    commitActive();
    closePops();
    const c = contentRef.current;
    pendingFocus.current = {
      cell: { di, ri: c.days[di].rows.length, key: c.columns[0].key },
    };
    update((cur) => addRow(cur, di));
  };

  /** ri 아래에 행을 끼워 넣고 새 행의 첫 보이는 셀에 커서를 둔다 */
  const doInsertRowAfter = (di: number, ri: number) => {
    commitActive();
    closePops();
    blurActive();
    if (!update((cur) => insertRowAfter(cur, di, ri))) return;
    const c = contentRef.current;
    const day = c.days[di];
    const nr = ri + 1;
    const first = c.columns.find((col) => covers(day, col.key)[nr] < 0) ?? c.columns[0];
    pendingFocus.current = { cell: { di, ri: nr, key: first.key } };
    setSelected({ di, ri: nr, key: first.key });
    setRange(null);
  };

  /* ── 행 드래그 (손잡이 → 내용만 옮긴다, 시간 칸은 고정) ── */
  const startRowDrag = (e: React.MouseEvent<HTMLElement>, di: number, from: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    commitActive();
    closePops();
    blurActive();
    setRange(null);
    const st: RowDragState = { di, from, over: -1, after: false };
    rowDragRef.current = st;
    setRowDrag(st);
    root.classList.add('tt-row-dragging');
    const onMove = (ev: MouseEvent) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tr = under instanceof Element ? under.closest<HTMLElement>('tr[data-ri]') : null;
      if (!tr || +(tr.dataset.di ?? -1) !== di) return;
      const ri = +(tr.dataset.ri ?? -1);
      const rect = tr.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      const cur = rowDragRef.current;
      if (!cur || (cur.over === ri && cur.after === after)) return;
      const nx = { ...cur, over: ri, after };
      rowDragRef.current = nx;
      setRowDrag(nx);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      root.classList.remove('tt-row-dragging');
      const cur = rowDragRef.current;
      rowDragRef.current = null;
      setRowDrag(null);
      if (!cur || cur.over < 0) return;
      let to = cur.after ? cur.over + 1 : cur.over;
      if (to > cur.from) to -= 1;
      if (to === cur.from) return;
      if (!update((c) => moveRow(c, cur.di, cur.from, to))) {
        toast(tt('move_row_merged', '병합된 행은 먼저 병합을 풀어 주세요'));
        return;
      }
      setSelected(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /* ── 되돌리기 · 다시 실행 ── */
  /** 스냅샷 적용. 호출 전에 포커스 셀은 커밋·blur 되어 있어야 한다 (blur 의 커밋이 스택을 건드리지 않도록) */
  const applySnapshot = (snap: TimetableContent) => {
    lastPush.current = null;
    contentRef.current = snap;
    lastEmitted.current = snap;
    setContentState(snap);
    onChange(snap);
    setSelected(null);
    setRange(null);
    syncHist();
  };

  const doUndo = (): boolean => {
    commitActive();
    blurActive();
    closePops();
    const prev = undoStack.current.pop();
    if (!prev) return false;
    redoStack.current.push(contentRef.current);
    applySnapshot(prev);
    return true;
  };

  const doRedo = (): boolean => {
    commitActive();
    blurActive();
    closePops();
    const nx = redoStack.current.pop();
    if (!nx) return false;
    undoStack.current.push(contentRef.current);
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    applySnapshot(nx);
    return true;
  };

  /** 포커스된 셀·머리글에 아직 커밋되지 않은 타이핑이 있으면 브라우저의 되돌리기에 맡긴다 */
  const hasUncommittedTyping = (): boolean => {
    const a = document.activeElement;
    if (!isEditableEl(a) || !rootRef.current?.contains(a)) return false;
    const c = contentRef.current;
    if (a.classList.contains('tt-th-label')) {
      const col = colOf(c, a.dataset.key || '');
      return !!col && readText(a) !== col.label;
    }
    const p = posOf(a);
    if (!p) return false;
    return readText(a) !== cellOf(c.days[p.di]?.rows[p.ri], p.key).t;
  };

  const onRootKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const isUndo = k === 'z' && !e.shiftKey;
    const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey);
    if (!isUndo && !isRedo) return;
    if (hasUncommittedTyping()) return;
    e.preventDefault();
    if (isUndo) doUndo();
    else doRedo();
  };

  /* ── 이미지로 복사 ── */
  /** 오프스크린 종이(PDF 와 같은 TimetablePrintSheet)를 그려 PNG Blob 으로. (Safari 는 ClipboardItem 에 Promise 를 넘겨야 하므로 동기적으로 시작한다)
   *  html2canvas 는 Tailwind v4 의 oklch() 색(body 배경 · 전역 border-color)을 못 읽고 throw 하므로,
   *  브라우저가 직접 그린 DOM 을 SVG foreignObject 로 옮겨 찍는 modern-screenshot 을 쓴다 (셀 세로 정렬·뱃지 등이 종이와 동일). */
  const renderSheetPng = async (): Promise<Blob> => {
    flushSync(() => setCopyingImage(true));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const el = shotRef.current;
    if (!el) throw new Error('sheet not mounted');
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
    const { domToBlob } = await import('modern-screenshot');
    const blob = await domToBlob(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      type: 'image/png',
      // 복제본에는 원본에서 잰 픽셀 폭·높이(inline-size/block-size)가 고정값으로 박힌다.
      // 브라우저 배율(75% 등)이 걸린 페이지에서는 잰 글자 폭과 캡처 렌더링의 글자 폭이 어긋나
      // 제목·장소 알약·요약이 상자 밖으로 꺾여 나가므로, 고정 크기를 걷어내고 CSS 대로 다시 흐르게 한다.
      // (표 폭 100% 는 computed width 가 복사되지 않아 여기서 다시 준다)
      onCloneEachNode: (cloned) => {
        if (!(cloned instanceof HTMLElement) || cloned.hasAttribute('data-shot-root')) return;
        const tag = cloned.tagName;
        cloned.style.removeProperty('height');
        cloned.style.removeProperty('block-size');
        if (tag === 'COL' || tag === 'TH' || tag === 'TD') return; // 열 폭(col width %)은 원본 배분을 그대로 쓴다
        cloned.style.removeProperty('width');
        cloned.style.removeProperty('inline-size');
        if (tag === 'TABLE') cloned.style.width = '100%';
      },
    });
    if (!blob) throw new Error('toBlob failed');
    return blob;
  };

  const doCopyImage = () => {
    if (copyingImage) return;
    commitActive();
    closePops();
    const blobPromise = renderSheetPng();
    const fileName = `${(doc.title || 'timetable').replace(/[\\/:*?"<>|]+/g, '_')}.png`;
    const download = async () => {
      const blob = await blobPromise;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(tt('copy_image_saved', '클립보드를 쓸 수 없어 파일로 저장했습니다'));
    };
    const run = async () => {
      try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
            toast(tt('copy_image_done', '이미지를 클립보드에 복사했습니다'));
            return;
          } catch {
            /* 클립보드 거부 → 파일 저장으로 */
          }
        }
        await download();
      } catch (err) {
        console.error('timetable image export failed:', err);
        toast.error(tt('copy_image_failed', '이미지를 만들지 못했습니다'));
      } finally {
        setCopyingImage(false);
      }
    };
    void run();
  };

  const structural = (fn: (c: TimetableContent) => TimetableContent) => {
    commitActive();
    closePops();
    blurActive();
    update(fn);
    setSelected(null);
    setRange(null);
  };

  /* ── 파생 값 ── */
  const selectedColor: TimetableCellColor = selected ? cellOf(content.days[selected.di]?.rows[selected.ri], selected.key).c || '' : '';
  const canMerge = !!range && range.r2 > range.r1;
  const canUnmerge = (() => {
    if (!selected) return false;
    const day = content.days[selected.di];
    if (!day || !day.rows[selected.ri]) return false;
    return spanOf(day, selected.key, anchorOf(day, selected.key, selected.ri)) > 1;
  })();
  const suggCol = sugg ? colOf(content, sugg.pos.key) : undefined;

  const hintText = selected
    ? tt('hint_selected', '색을 바꾸거나 드래그·Shift+클릭으로 범위를 잡아 병합')
    : tt('hint_idle', '셀을 고른 뒤 색을 누르세요 · 드래그 또는 Shift+클릭으로 병합 범위');

  const stat = tt('stat', '{{days}}일 · {{rows}}행 · {{cols}}열 · 병합 {{merged}}곳', {
    days: content.days.length,
    rows: countRows(content),
    cols: content.columns.length,
    merged: countMerged(content),
  });

  /** 분 → "7시간 20분" (i18n) */
  const fmtDur = (min: number): string => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0 && m > 0) return tt('sum_hours_minutes', '{{h}}시간 {{m}}분', { h, m });
    if (h > 0) return tt('sum_hours', '{{h}}시간', { h });
    return tt('sum_minutes', '{{m}}분', { m });
  };

  const daySummary = (di: number): string | null => {
    const s = summarizeDayTimes(content, di);
    if (!s) return null;
    let out = `${fmtT(s.start)}–${fmtT(s.end)} · ${fmtDur(s.total)}`;
    if (s.breaks > 0) out += ` · ${tt('sum_breaks', '쉬는 시간 {{d}}', { d: fmtDur(s.breaks) })}`;
    return out;
  };

  /* ── 렌더 ── */
  const editable = !readOnly;

  return (
    <div
      ref={rootRef}
      className="tt-editor flex flex-col gap-3 p-3 md:p-4 h-full overflow-y-auto custom-scrollbar"
      onKeyDown={editable ? onRootKeyDown : undefined}
    >
      {/* 상단 필드: 장소 (표의 장소 열에서 자동으로 채워지고, 직접 고쳐 쓸 수 있다) */}
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className={LABEL_CLS}>{tt('place_note', '장소 (우상단)')}</span>
          <span className="text-xs text-slate-500">
            {placeOverridden ? tt('place_manual', '직접 입력') : tt('place_auto', '표의 장소 열에서 자동으로')}
          </span>
          {editable && placeOverridden && (
            <button
              type="button"
              className="text-xs text-bridge-accent hover:underline"
              onClick={() => update((cur) => setHeader(cur, { place_note: '' }))}
            >
              {tt('place_reset', '자동으로 되돌리기')}
            </button>
          )}
        </span>
        {editable ? (
          <input
            className={INPUT_CLS}
            value={shownPlace}
            placeholder={tt('place_placeholder', '표의 장소 열을 채우면 여기에 모입니다 · 직접 적어도 됩니다')}
            onChange={(e) => {
              const v = e.target.value;
              // 자동값과 같으면 비워 두어 표를 따라가게 한다 (지우면 자동으로 돌아온다)
              update((cur) => setHeader(cur, { place_note: v.trim() === autoPlaceNote(cur) ? '' : v }));
            }}
            autoComplete="off"
          />
        ) : (
          <span className="text-sm text-foreground min-h-[1.5rem]">{shownPlace || '—'}</span>
        )}
      </label>

      {/* 툴바 */}
      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 rounded-xl border border-foreground/[0.08] bg-bridge-obsidian">
          <span className={`${LABEL_CLS} mr-1`}>{tt('cell_color', '셀 색')}</span>
          <button
            type="button"
            className={`tt-chip tt-chip-none${selectedColor === '' ? ' tt-chip-sel' : ''}`}
            aria-label={tt('color_default', '기본색')}
            title={tt('color_default', '기본색')}
            onMouseDown={prevent}
            onClick={() => applyColor('')}
          />
          {TIMETABLE_COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className={`tt-chip${selectedColor === c ? ' tt-chip-sel' : ''}`}
              style={{ '--c': `var(--tt-${c})` } as CSSProperties}
              aria-label={TIMETABLE_COLOR_LABELS[c]}
              title={TIMETABLE_COLOR_LABELS[c]}
              onMouseDown={prevent}
              onClick={() => applyColor(c)}
            />
          ))}
          <span className="w-px h-4 bg-foreground/10 mx-1" aria-hidden="true" />
          <button type="button" className={GHOST_BTN_CLS} disabled={!canMerge} onMouseDown={prevent} onClick={doMerge}>
            ⊟ {tt('merge', '셀 병합')}
          </button>
          <button type="button" className={GHOST_BTN_CLS} disabled={!canUnmerge} onMouseDown={prevent} onClick={doUnmerge}>
            {tt('unmerge', '병합 해제')}
          </button>
          <button
            type="button"
            className={GHOST_BTN_CLS}
            title={tt('auto_merge_title', '같은 열에서 연속으로 같은 값(같은 색)인 셀을 한 번에 병합')}
            onMouseDown={prevent}
            onClick={doAutoMerge}
          >
            {tt('auto_merge', '같은 값 자동 병합')}
          </button>
          <span className="w-px h-4 bg-foreground/10 mx-1" aria-hidden="true" />
          <button type="button" className={GHOST_BTN_CLS} onMouseDown={prevent} onClick={doAddColumn}>
            <Columns3 className="w-3.5 h-3.5" /> {tt('add_column', '열 추가')}
          </button>
          <button type="button" className={GHOST_BTN_CLS} onMouseDown={prevent} onClick={doAddDay}>
            <CalendarPlus className="w-3.5 h-3.5" /> {tt('add_day', '날짜 추가')}
          </button>
          <span className="w-px h-4 bg-foreground/10 mx-1" aria-hidden="true" />
          <button
            type="button"
            className={GHOST_BTN_CLS}
            disabled={hist.undo === 0}
            aria-label={tt('undo', '되돌리기')}
            title={`${tt('undo', '되돌리기')} (Ctrl/⌘+Z)`}
            onMouseDown={prevent}
            onClick={() => doUndo()}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={GHOST_BTN_CLS}
            disabled={hist.redo === 0}
            aria-label={tt('redo', '다시 실행')}
            title={`${tt('redo', '다시 실행')} (Ctrl/⌘+Shift+Z)`}
            onMouseDown={prevent}
            onClick={() => doRedo()}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={GHOST_BTN_CLS}
            disabled={copyingImage}
            title={tt('copy_image', '이미지로 복사')}
            onMouseDown={prevent}
            onClick={doCopyImage}
          >
            {copyingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin text-bridge-accent" /> : <ImageDown className="w-3.5 h-3.5" />}{' '}
            {tt('copy_image', '이미지로 복사')}
          </button>
          <span className="ml-auto text-xs text-slate-500">{hintText}</span>
        </div>
      )}

      {/* 날짜 블록 */}
      {content.days.map((day, di) => {
        const covs: Record<string, number[]> = {};
        for (const c of content.columns) covs[c.key] = covers(day, c.key);
        const rangeHere = range && range.di === di ? range : null;
        const overlaps = overlapRows(content, di);
        const summary = daySummary(di);
        const dragHere = rowDrag && rowDrag.di === di ? rowDrag : null;
        return (
          <section key={di} className="tt-day rounded-2xl border border-foreground/[0.08] overflow-hidden">
            <header className="flex items-center gap-2.5 px-3 py-2 bg-bridge-obsidian border-b border-foreground/[0.08]">
              <span className="text-xs md:text-sm font-bold text-foreground">
                {formatDayLabel(day.date, tt('no_date', '날짜 없음'), weekNames)}
              </span>
              {editable ? (
                <input
                  type="date"
                  value={day.date}
                  aria-label={tt('date', '날짜')}
                  onChange={(e) => update((cur) => setDayDate(cur, di, e.target.value))}
                  className="bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              ) : null}
              {summary && <span className="text-xs text-slate-500 truncate">{summary}</span>}
              <span className="flex-1" />
              {editable && (
                <button
                  type="button"
                  className={`${GHOST_BTN_CLS} hover:text-rose-500`}
                  disabled={content.days.length < 2}
                  title={tt('delete_day_title', '날짜 블록 삭제')}
                  onMouseDown={prevent}
                  onClick={() => structural((cur) => removeDay(cur, di))}
                >
                  <X className="w-3.5 h-3.5" /> {tt('delete_day', '날짜 삭제')}
                </button>
              )}
            </header>

            <div className="tt-wrap">
              <table className="tt-table">
                <thead>
                  <tr>
                    {content.columns.map((col, ci) => (
                      <th key={col.key} style={col.width ? { width: `${col.width}%` } : undefined}>
                        {editable && (
                          <span className="tt-th-ctl tt-th-move">
                            <button
                              type="button"
                              className="tt-mini"
                              tabIndex={-1}
                              disabled={ci === 0}
                              aria-label={tt('move_left', '열 왼쪽으로')}
                              title={tt('move_left', '열 왼쪽으로')}
                              onMouseDown={prevent}
                              onClick={() => structural((cur) => moveColumn(cur, col.key, -1))}
                            >
                              <ChevronLeft className="w-3 h-3 inline" />
                            </button>
                            <button
                              type="button"
                              className="tt-mini"
                              tabIndex={-1}
                              disabled={ci === content.columns.length - 1}
                              aria-label={tt('move_right', '열 오른쪽으로')}
                              title={tt('move_right', '열 오른쪽으로')}
                              onMouseDown={prevent}
                              onClick={() => structural((cur) => moveColumn(cur, col.key, 1))}
                            >
                              <ChevronRight className="w-3 h-3 inline" />
                            </button>
                          </span>
                        )}
                        <div
                          className="tt-th-label text-xs md:text-sm font-bold text-foreground"
                          data-key={col.key}
                          contentEditable={editable}
                          suppressContentEditableWarning
                          spellCheck={false}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) => {
                            const el = e.currentTarget;
                            commitLabel(el);
                            const c = colOf(contentRef.current, col.key);
                            if (c && el.textContent !== c.label) el.textContent = c.label;
                          }}
                        />
                        {editable && content.columns.length > 1 && (
                          <span className="tt-th-ctl tt-th-del">
                            <button
                              type="button"
                              className="tt-mini tt-mini-danger"
                              tabIndex={-1}
                              aria-label={tt('delete_column', '열 삭제')}
                              title={tt('delete_column', '열 삭제')}
                              onMouseDown={prevent}
                              onClick={() => {
                                structural((cur) => removeColumn(cur, col.key));
                                toast(tt('column_deleted', '열을 지웠습니다'));
                              }}
                            >
                              <X className="w-3 h-3 inline" />
                            </button>
                          </span>
                        )}
                      </th>
                    ))}
                    {editable && <th className="tt-rowctl" />}
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      data-di={di}
                      data-ri={ri}
                      className={
                        dragHere && dragHere.over === ri
                          ? dragHere.after
                            ? 'tt-drop-after'
                            : 'tt-drop-before'
                          : dragHere && dragHere.from === ri
                            ? 'tt-drag-src'
                            : undefined
                      }
                    >
                      {content.columns.map((col) => {
                        if (covs[col.key][ri] >= 0) return null; // 병합에 덮인 셀은 그리지 않음
                        const cell = cellOf(row, col.key);
                        const n = spanOf(day, col.key, ri);
                        const end = ri + n - 1;
                        const inRange = !!rangeHere && rangeHere.key === col.key && end >= rangeHere.r1 && ri <= rangeHere.r2;
                        const warn = col.type === 'time' && isRangeInverted(cell.t);
                        const overlap = col.type === 'time' && !warn && overlaps.has(ri);
                        const tdCls = [
                          n > 1 ? 'tt-merged' : '',
                          inRange ? 'tt-rng' : '',
                          warn ? 'tt-warn' : '',
                          overlap ? 'tt-overlap' : '',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        const tdTitle = warn
                          ? tt('time_inverted', '종료가 시작보다 앞섭니다')
                          : overlap
                            ? tt('time_overlap', '위 행과 시간이 겹칩니다')
                            : undefined;
                        return (
                          <td key={col.key} rowSpan={n > 1 ? n : undefined} className={tdCls || undefined} title={tdTitle}>
                            <div
                              className={`tt-cell text-xs md:text-sm${cell.c ? ` c-${cell.c}` : ''}${col.type === 'time' ? ' tt-cell-time' : ''}`}
                              data-di={di}
                              data-ri={ri}
                              data-key={col.key}
                              data-ph={editable ? col.label : ''}
                              data-sel={samePos(selected, { di, ri, key: col.key }) ? '1' : undefined}
                              contentEditable={editable}
                              suppressContentEditableWarning
                              spellCheck={false}
                              onFocus={editable ? onCellFocus : undefined}
                              onBlur={editable ? onCellBlur : undefined}
                              onInput={editable ? onCellInput : undefined}
                              onKeyDown={editable ? onCellKeyDown : undefined}
                              onMouseDown={editable ? onCellMouseDown : undefined}
                              onPaste={editable ? onCellPaste : undefined}
                            />
                          </td>
                        );
                      })}
                      {editable && (
                        <td className="tt-rowctl">
                          <span className="tt-rowctl-btns">
                            <button
                              type="button"
                              className="tt-mini tt-grip"
                              tabIndex={-1}
                              aria-label={tt('drag_row', '행 끌어서 옮기기')}
                              title={tt('drag_row', '행 끌어서 옮기기')}
                              onMouseDown={(e) => startRowDrag(e, di, ri)}
                            >
                              <GripVertical className="w-3 h-3 inline" />
                            </button>
                            <button
                              type="button"
                              className="tt-mini"
                              tabIndex={-1}
                              aria-label={tt('insert_row_below', '아래에 행 추가')}
                              title={`${tt('insert_row_below', '아래에 행 추가')} (Alt+Enter)`}
                              onMouseDown={prevent}
                              onClick={() => doInsertRowAfter(di, ri)}
                            >
                              <Plus className="w-3 h-3 inline" />
                            </button>
                            <button
                              type="button"
                              className="tt-mini tt-mini-danger"
                              tabIndex={-1}
                              disabled={day.rows.length < 2}
                              aria-label={tt('delete_row', '행 삭제')}
                              title={tt('delete_row', '행 삭제')}
                              onMouseDown={prevent}
                              onClick={() => structural((cur) => removeRow(cur, di, ri))}
                            >
                              <X className="w-3 h-3 inline" />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editable && (
              <footer className="flex items-center gap-2 px-3 py-2 bg-bridge-obsidian border-t border-foreground/[0.08]">
                <button type="button" className={GHOST_BTN_CLS} onMouseDown={prevent} onClick={() => doAddRow(di)}>
                  <Plus className="w-3.5 h-3.5" /> {tt('add_row', '행 추가')}
                </button>
              </footer>
            )}
          </section>
        );
      })}

      <div className="flex items-center justify-end">
        <span className="text-xs text-slate-500">{stat}</span>
      </div>

      {/* 이미지로 복사용 오프스크린 종이 — PDF 와 같은 TimetablePrintSheet (찍는 동안만 마운트) */}
      {copyingImage && (
        <div
          ref={shotRef}
          data-shot-root=""
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: -10000,
            top: 0,
            width: IMAGE_SHEET_WIDTH,
            padding: 40,
            background: '#ffffff',
          }}
        >
          <TimetablePrintSheet doc={{ ...doc, content }} />
        </div>
      )}

      {/* 팝오버 */}
      {editable && timePop && (
        <TimeRangePicker
          anchorEl={timePop.el}
          value={timePop.value}
          hint={timePop.hint}
          hintStrong={timePop.hintStrong}
          onChange={(r) => writeTime(timePop.pos, r)}
          onClose={() => setTimePop(null)}
        />
      )}
      {editable && sugg && suggCol && (
        <TermSuggestList
          anchorEl={sugg.el}
          fieldLabel={suggCol.label}
          query={sugg.query}
          items={sugg.items}
          highlightIndex={sugg.idx}
          onPick={suggPick}
          onForget={suggForget}
        />
      )}
    </div>
  );
}

export default TimetableEditor;
