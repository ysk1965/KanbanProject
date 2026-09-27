import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarPlus, ChevronLeft, ChevronRight, Columns3, Plus, X } from 'lucide-react';
import type { FeatureEditorProps, PersonalFeatureTerm, TimetableCellColor, TimetableContent } from '../types';
import {
  addColumn,
  addDay,
  addRow,
  anchorOf,
  autoMerge,
  cellOf,
  colOf,
  collectDocTerms,
  countMerged,
  countRows,
  covers,
  createDefaultTimetable,
  defaultRange,
  fmtRange,
  formatDayLabel,
  isRangeInverted,
  mergeRange,
  moveColumn,
  normRange,
  normalizeTimeText,
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
  unionTerms,
  unmerge,
  type TimeRange,
} from './timetableModel';
import { TIMETABLE_COLOR_LABELS, TIMETABLE_COLOR_ORDER } from './colors';
import { TimeRangePicker } from './TimeRangePicker';
import { TermSuggestList } from './TermSuggestList';
import './timetable.css';

/**
 * 시간표 편집기. 기획서 docs/Design/myspace-features-timetable.html 04절 시안 B.
 *
 * 셀은 contentEditable 을 비제어로 둔다: 타이핑은 DOM 이 갖고, blur/commit 때 모델에 쓴다.
 * 모델이 바깥에서 바뀌면(추천 선택·병합·행 삭제 등) useLayoutEffect 가 포커스 없는 셀의 텍스트만 맞춘다.
 */

type Pos = { di: number; ri: number; key: string };
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

export function TimetableEditor({ doc, onChange, terms, onForgetTerm, readOnly }: FeatureEditorProps<TimetableContent>) {
  const { t } = useTranslation();
  const tt = useCallback(
    (key: string, def: string, opts?: Record<string, unknown>) => t(`personal.features.timetable_editor.${key}`, { defaultValue: def, ...opts }) as string,
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

  /** 동기적으로 이어 부를 수 있는 갱신. 바뀐 게 없으면 false */
  const update = useCallback(
    (fn: (c: TimetableContent) => TimetableContent): boolean => {
      const next = fn(contentRef.current);
      if (next === contentRef.current) return false;
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

  const [forgotten, setForgotten] = useState<Set<string>>(() => new Set());
  const forgottenRef = useRef(forgotten);
  forgottenRef.current = forgotten;

  const allTerms = useMemo(() => unionTerms(terms, collectDocTerms(content)), [terms, content]);
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
      const changed = update((cur) => setCellText(cur, p.di, p.ri, p.key, v));
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
      update((cur) => setCellText(cur, p.di, p.ri, p.key, txt));
      const el = findCellEl(p);
      if (el && el.textContent !== txt) {
        el.textContent = txt;
        if (el === document.activeElement) placeCaretEnd(el);
      }
      setTimePop((cur) => (cur && samePos(cur.pos, p) ? { ...cur, value: r, hint: undefined, hintStrong: false } : cur));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update],
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
        update((cur) => setCellText(cur, p.di, p.ri, p.key, txt));
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
    });
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
    toast(tt('term_forgotten', '「{{value}}」을 기억에서 지웠습니다', { value: it.value }));
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

  const onCellMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (!e.shiftKey) return;
    const el = e.currentTarget;
    const p = posOf(el);
    if (!p) return;
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
    setRange({ di: p.di, key: p.key, r1: Math.min(sel.ri, p.ri), r2: Math.max(sel.ri, p.ri) });
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
        setSugg((cur) => (cur && cur.items.length ? { ...cur, idx: (cur.idx + d + cur.items.length) % cur.items.length } : cur));
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
      pendingFocus.current = { cell: { di: p.di, ri: c.days[p.di].rows.length, key: c.columns[0].key } };
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
    pendingFocus.current = { cell: { di, ri: c.days[di].rows.length, key: c.columns[0].key } };
    update((cur) => addRow(cur, di));
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
    ? tt('hint_selected', '색을 바꾸거나 Shift+클릭으로 범위를 잡아 병합')
    : tt('hint_idle', '셀을 고른 뒤 색을 누르세요 · Shift+클릭으로 병합 범위');

  const stat = tt('stat', '{{days}}일 · {{rows}}행 · {{cols}}열 · 병합 {{merged}}곳', {
    days: content.days.length,
    rows: countRows(content),
    cols: content.columns.length,
    merged: countMerged(content),
  });

  /* ── 렌더 ── */
  const editable = !readOnly;

  return (
    <div ref={rootRef} className="tt-editor flex flex-col gap-3 p-3 md:p-4 h-full overflow-y-auto custom-scrollbar">
      {/* 상단 필드: 버전 표기 · 장소 메모 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>{tt('version_label', '버전 표기 (우상단)')}</span>
          {editable ? (
            <input
              className={INPUT_CLS}
              value={content.version_label}
              placeholder={tt('version_placeholder', '예: 2026. 9. 10. ver')}
              onChange={(e) => update((cur) => setHeader(cur, { version_label: e.target.value }))}
              autoComplete="off"
            />
          ) : (
            <span className="text-sm text-foreground min-h-[1.5rem]">{content.version_label || '—'}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>{tt('place_note', '장소 메모 (우상단)')}</span>
          {editable ? (
            <input
              className={INPUT_CLS}
              value={content.place_note}
              placeholder={tt('place_placeholder', '예: B1 아트스튜디오 / 대성전')}
              onChange={(e) => update((cur) => setHeader(cur, { place_note: e.target.value }))}
              autoComplete="off"
            />
          ) : (
            <span className="text-sm text-foreground min-h-[1.5rem]">{content.place_note || '—'}</span>
          )}
        </label>
      </div>

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
          <span className="ml-auto text-xs text-slate-500">{hintText}</span>
        </div>
      )}

      {/* 날짜 블록 */}
      {content.days.map((day, di) => {
        const covs: Record<string, number[]> = {};
        for (const c of content.columns) covs[c.key] = covers(day, c.key);
        const rangeHere = range && range.di === di ? range : null;
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
                    <tr key={ri}>
                      {content.columns.map((col) => {
                        if (covs[col.key][ri] >= 0) return null; // 병합에 덮인 셀은 그리지 않음
                        const cell = cellOf(row, col.key);
                        const n = spanOf(day, col.key, ri);
                        const end = ri + n - 1;
                        const inRange = !!rangeHere && rangeHere.key === col.key && end >= rangeHere.r1 && ri <= rangeHere.r2;
                        const warn = col.type === 'time' && isRangeInverted(cell.t);
                        const tdCls = [n > 1 ? 'tt-merged' : '', inRange ? 'tt-rng' : '', warn ? 'tt-warn' : '']
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <td
                            key={col.key}
                            rowSpan={n > 1 ? n : undefined}
                            className={tdCls || undefined}
                            title={warn ? tt('time_inverted', '종료가 시작보다 앞섭니다') : undefined}
                          >
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
                            />
                          </td>
                        );
                      })}
                      {editable && (
                        <td className="tt-rowctl">
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
