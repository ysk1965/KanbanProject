import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Loader2,
  PenLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { BOOKS, OT_COUNT, PSALMS, chCount, encRef, refLong, refShort, type Ref } from './bibleRefs';
import { bookCounts, chKey, collectMarks, marksOn, nextMarked, type ReadMark } from './bibleMarks';
import {
  isWhole,
  overlaps,
  rangeText,
  segmentsFor,
  spanOn,
  takeFocus,
  useHighlights,
  type HlColor,
  type HlRange,
  type Highlight,
} from './bibleHighlights';
import { HighlightBubble } from './HighlightBubble';
import { ShareSheet } from './share/ShareSheet';
import { copyText } from './share/shareImage';
import type { LineQuote } from './share/shareModel';
import { newNote, UNTITLED, type SermonNote } from './sermonTypes';
import { useBible } from './useBible';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';
import './bibleHighlight.css';

/**
 * 성경 읽기 — 「그날의 손글씨」.
 * 평범하게 성경을 읽다가, 설교에서 들었던 구절을 만나면 물결 밑줄과 여백의 손글씨(그날 남긴 생각)로 알아본다.
 * 손글씨를 누르면 그 노트의 그 자리로 간다. 넓은 화면은 오른쪽 여백, 좁은 화면은 구절 바로 아래.
 * 읽던 장·손글씨 켬/끔은 기기에 기억한다.
 *
 * 「형광펜」(bibleHighlights): 절을 누르면 절 전체, 글자를 끌어 고르면 그 부분을 칠한다. 버블 = 색 4·밑줄·메모·카드·복사·지우기.
 * 설교 물결 밑줄은 text-decoration, 형광펜은 배경·inset 밑줄이라 한 구절에 둘 다 보인다.
 */

interface BibleReaderProps {
  notes: SermonNote[];
  onOpen: (id: string, aid?: string | null) => void;
  mascot?: MascotId;
}

const POS_KEY = 'sermon-bible-pos';
const HAND_KEY = 'sermon-bible-hand';
const HL_KEY = 'sermon-bible-hl';
const HAND_MAX = 46;

function loadPos(): { b: number; c: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (p && BOOKS[p.b] && p.c >= 1 && p.c <= chCount(p.b)) return { b: p.b, c: p.c };
  } catch {
    /* ignore */
  }
  return null;
}
function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

/** 고른 구절 + 버블 자리 (.sn-bible-page 기준) */
interface Pick {
  range: HlRange;
  /** 고치는 형광펜 (없으면 새로 칠한다) */
  target: string | null;
  x: number;
  y: number;
  memoFirst?: boolean;
}

/** 선택 끝점 → 몇 절 몇 번째 글자. 절 본문(.sn-bv-t) 밖이면 앞/뒤로 붙인다 */
function pointAt(node: Node, offset: number): { v: number; off: number; len: number } | null {
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
  const row = el?.closest<HTMLElement>('[data-v]');
  const t = row?.querySelector<HTMLElement>('.sn-bv-t');
  if (!row || !t) return null;
  const v = Number(row.dataset.v);
  const len = (t.textContent || '').length;
  if (!t.contains(node)) {
    const after = !!(t.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { v, off: after ? len : 0, len };
  }
  const r = document.createRange();
  r.selectNodeContents(t);
  r.setEnd(node, offset);
  return { v, off: r.toString().length, len };
}

function sameRange(a: HlRange, b: HlRange): boolean {
  return a.v1 === b.v1 && a.v2 === b.v2 && (a.s ?? 0) === (b.s ?? 0) && (a.e ?? -1) === (b.e ?? -1);
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** '2026-10-25' → '10.25' */
function md(ds: string | null | undefined): string {
  const [, m, d] = (ds || '').split('-').map(Number);
  return m && d ? `${m}.${d}` : '';
}
function latestMainChapter(notes: SermonNote[]): { b: number; c: number } | null {
  const r = [...notes]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((n) => n.refs?.[0])
    .find(Boolean);
  const [b, c] = (r || '').split(':').map(Number);
  return BOOKS[b] && c ? { b, c } : null;
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const chName = (b: number) => (b === PSALMS ? '편' : '장');

function Hand({ m, onOpen }: { m: ReadMark; onOpen: BibleReaderProps['onOpen'] }) {
  const title = m.note.title || UNTITLED;
  const t = m.thoughts[0];
  return (
    <button
      type="button"
      className="sn-hand"
      data-kind={m.kind}
      onClick={() => onOpen(m.note.id, m.aid)}
      aria-label={`${md(m.note.date)} 설교 「${title}」 ${refShort(m.ref)} — 노트 열기`}
    >
      <span className="sn-hand-line">
        <span className="sn-hand-date">{md(m.note.date) || '날짜 없음'}</span>
        {t ? clip(t.text.replace(/\s+/g, ' '), HAND_MAX) : clip(title, HAND_MAX)}
        {m.thoughts.length > 1 && <span className="sn-hand-more"> 외 {m.thoughts.length - 1}</span>}
      </span>
      <span className="sn-hand-src">
        {m.kind === 'main' ? '설교 본문' : '설교 중'} · {t ? clip(title, 14) : refShort(m.ref)}
      </span>
    </button>
  );
}

export function BibleReader({ notes, onOpen, mascot = 'galpi' }: BibleReaderProps) {
  const { bible, failed } = useBible();
  const marks = useMemo(() => collectMarks(notes), [notes]);
  const counts = useMemo(() => bookCounts(marks), [marks]);

  // 처음 여는 사람은 가장 최근 설교의 본문 장에서 시작한다 (노트가 늦게 도착해도 한 번은 따라간다)
  const hadPos = useRef(!!loadPos());
  const [pos, setPos] = useState<{ b: number; c: number }>(
    () => loadPos() || latestMainChapter(notes) || { b: 0, c: 1 },
  );
  useEffect(() => {
    if (hadPos.current) return;
    const p = latestMainChapter(notes);
    if (!p) return;
    hadPos.current = true;
    setPos(p);
  }, [notes]);
  const [hand, setHand] = useState(() => loadFlag(HAND_KEY));
  const [showHl, setShowHl] = useState(() => loadFlag(HL_KEY));
  const [picker, setPicker] = useState(false);
  // 장을 넘긴 방향 — 종이가 그쪽에서 넘어온다 (첫 화면은 움직이지 않음)
  const [turn, setTurn] = useState<'fwd' | 'back' | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const hlStore = useHighlights();
  const [pick, setPick] = useState<Pick | null>(null);
  const [card, setCard] = useState<{ note: SermonNote; quote: LineQuote } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** 사용자가 장을 옮겼을 때만 장 머리로 올린다 (처음 열 때·노트가 늦게 도착할 때는 그대로) */
  const jumped = useRef(false);

  useEffect(() => {
    setPick(null);
    save(POS_KEY, JSON.stringify(pos));
    const strip = stripRef.current;
    const cur = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (strip && cur) strip.scrollLeft = cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2;
    if (jumped.current) {
      jumped.current = false;
      headRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [pos]);

  const go = (b: number, c: number) => {
    hadPos.current = true;
    jumped.current = true;
    setPicker(false);
    const nc = Math.min(Math.max(1, c), chCount(b));
    if (b !== pos.b || nc !== pos.c)
      setTurn(b > pos.b || (b === pos.b && nc > pos.c) ? 'fwd' : 'back');
    setPos({ b, c: nc });
  };
  const prev =
    pos.c > 1
      ? { b: pos.b, c: pos.c - 1 }
      : pos.b > 0
        ? { b: pos.b - 1, c: chCount(pos.b - 1) }
        : null;
  const next =
    pos.c < chCount(pos.b)
      ? { b: pos.b, c: pos.c + 1 }
      : pos.b < BOOKS.length - 1
        ? { b: pos.b + 1, c: 1 }
        : null;
  const nextMark = nextMarked(marks, pos.b, pos.c);

  const list = marks.get(chKey(pos.b, pos.c));
  const hls = showHl ? hlStore.inChapter(pos.b, pos.c) : [];
  const hlChapters = showHl ? hlStore.chaptersOf(pos.b) : new Set<number>();
  const whole = (list || []).filter((m) => m.ref.whole);
  const text = useMemo(() => bible?.[pos.b]?.[pos.c - 1] || [], [bible, pos.b, pos.c]);
  const bookName = BOOKS[pos.b][0];

  const lenOf = useCallback((v: number) => (text[v - 1] || '').length, [text]);
  const verseText = useCallback((v: number) => text[v - 1] || '', [text]);

  // 모아보기에서 건너온 절 — 그 자리로 내리고 잠깐 반짝인다
  useEffect(() => {
    if (!bible) return;
    const f = takeFocus();
    if (!f || f.b !== pos.b || f.c !== pos.c) return;
    const row = textRef.current?.querySelector<HTMLElement>(`[data-v="${f.v}"]`);
    row?.scrollIntoView({ block: 'center' });
    setFlash(f.v);
    const t = window.setTimeout(() => setFlash(null), 1900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bible]);

  /** 화면 좌표 사각형 → 버블 자리 (아래쪽) */
  const anchorFor = (rect: DOMRect | null): { x: number; y: number } => {
    const page = pageRef.current;
    if (!page || !rect) return { x: 0, y: 0 };
    const pr = page.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - pr.left, y: rect.bottom - pr.top + 10 };
  };

  const topOn = (v: number): Highlight | null => {
    const on = hls.filter((h) => spanOn(h, v, lenOf(v)));
    return on.sort((a, b) => b.at - a.at)[0] || null;
  };

  /** 절을 눌렀다 — 칠한 게 있으면 그걸 고치고, 없으면 절 전체 */
  const tapVerse = (v: number, el: HTMLElement) => {
    if (!showHl || !text.length) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && textRef.current?.contains(sel.anchorNode)) return;
    if (pick && !pick.target && pick.range.v1 === v && pick.range.v2 === v) {
      setPick(null);
      return;
    }
    const top = topOn(v);
    const range: HlRange = top
      ? { b: top.b, c: top.c, v1: top.v1, v2: top.v2, s: top.s, e: top.e }
      : { b: pos.b, c: pos.c, v1: v, v2: v, s: null, e: null };
    setPick({ range, target: top?.id || null, ...anchorFor(el.getBoundingClientRect()) });
  };

  // 글자를 끌어 고르면 — 그 범위로 버블 (폰은 길게 눌러 고른 뒤)
  const measureSelection = useCallback(() => {
    const sel = window.getSelection();
    const root = textRef.current;
    if (!showHl || !sel || !sel.rangeCount || sel.isCollapsed || !root) return;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.commonAncestorContainer)) return;
    const a = pointAt(r.startContainer, r.startOffset);
    const z = pointAt(r.endContainer, r.endOffset);
    if (!a || !z) return;
    let { v: v1, off: s } = a;
    let { v: v2, off: e } = z;
    if (s >= a.len && v1 < v2) {
      v1 += 1;
      s = 0;
    }
    if (e === 0 && v2 > v1) {
      v2 -= 1;
      e = lenOf(v2);
    }
    if (v2 < v1 || (v1 === v2 && e <= s)) return;
    const range: HlRange = {
      b: pos.b,
      c: pos.c,
      v1,
      v2,
      s: s > 0 ? s : null,
      e: e >= lenOf(v2) ? null : e,
    };
    const same = hls.find((h) => sameRange(h, range));
    const rects = r.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    setPick({ range, target: same?.id || null, ...anchorFor(last) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHl, pos.b, pos.c, lenOf, hls.length, hlStore.snapshot()]);

  useEffect(() => {
    let t = 0;
    const later = () => {
      window.clearTimeout(t);
      t = window.setTimeout(measureSelection, 280);
    };
    const up = () => window.setTimeout(measureSelection, 0);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    document.addEventListener('mouseup', up);
    if (coarse) document.addEventListener('selectionchange', later);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('selectionchange', later);
    };
  }, [measureSelection]);

  // 바깥을 누르거나 Esc — 닫기
  useEffect(() => {
    if (!pick) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.sn-hlb') || t.closest('.sn-bv-t') || t.closest('.sn-hand-mine')) return;
      setPick(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPick(null);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [pick]);

  const target = pick?.target ? hlStore.get(pick.target) || null : null;
  const overlapping = pick
    ? hls.filter((h) => h.id === pick.target || overlaps(h, pick.range, lenOf))
    : [];
  const pickRef: Ref | null = pick
    ? { b: pick.range.b, c: pick.range.c, v1: pick.range.v1, v2: pick.range.v2, whole: false }
    : null;

  const done = (h: Highlight | null) => {
    window.getSelection()?.removeAllRanges();
    setPick((p) =>
      p ? (h ? { ...p, target: h.id, range: p.range, memoFirst: false } : null) : null,
    );
  };
  const applyColor = (c: HlColor) => {
    if (!pick) return;
    if (target) done(hlStore.update(target.id, { color: target.color === c ? null : c }));
    else done(hlStore.add(pick.range, { color: c }));
  };
  const applyUnderline = () => {
    if (!pick) return;
    if (target) done(hlStore.update(target.id, { ul: !target.ul }));
    else done(hlStore.add(pick.range, { ul: true }));
  };
  const applyMemo = (memo: string) => {
    if (!pick) return;
    if (target) done(hlStore.update(target.id, { memo }));
    else if (memo) done(hlStore.add(pick.range, { color: 'yellow', memo }));
  };
  const clearPick = () => {
    overlapping.forEach((h) => hlStore.remove(h.id));
    window.getSelection()?.removeAllRanges();
    setPick(null);
  };
  const pickText = pick ? rangeText(pick.range, verseText) : '';
  const pickLabel = pickRef
    ? `${refShort(pickRef)}${pick && !isWhole(pick.range, lenOf) ? ' 일부' : ''}`
    : '';
  const copyPick = async () => {
    if (!pickRef) return;
    const ok = await copyText(`${pickText} (${refShort(pickRef)})`);
    if (ok) toast.success('구절을 복사했어요');
    else toast.error('복사하지 못했어요. 글자를 직접 골라 복사해 주세요');
  };
  const cardPick = () => {
    if (!pickRef || !pickText) return;
    const note: SermonNote = {
      ...newNote(undefined),
      title: refLong(pickRef),
      preacher: '',
      service: '성경 읽기',
      refs: [encRef(pickRef)],
    };
    setCard({
      note,
      quote: { src: 'verse', segs: [{ t: pickText, m: true }], ref: encRef(pickRef) },
    });
    setPick(null);
  };
  const openMemo = (h: Highlight, el: HTMLElement) => {
    setPick({
      range: { b: h.b, c: h.c, v1: h.v1, v2: h.v2, s: h.s, e: h.e },
      target: h.id,
      memoFirst: true,
      ...anchorFor(el.getBoundingClientRect()),
    });
  };

  const toggleHl = () => {
    setPick(null);
    setShowHl((h) => {
      save(HL_KEY, h ? '0' : '1');
      return !h;
    });
  };

  const toggleHand = () => {
    setHand((h) => {
      save(HAND_KEY, h ? '0' : '1');
      return !h;
    });
  };

  const pickBook = (b: number) => {
    const firstMarked = [...marks.keys()]
      .map((k) => k.split(':').map(Number))
      .filter(([kb]) => kb === b)
      .sort((x, y) => x[1] - y[1])[0];
    go(b, firstMarked ? firstMarked[1] : 1);
  };

  const bookGrid = (from: number, to: number) => (
    <div className="sn-bpick-grid">
      {BOOKS.slice(from, to).map((bk, i) => {
        const b = from + i;
        const n = counts.get(b) || 0;
        return (
          <button
            key={b}
            type="button"
            className="sn-bpick-book"
            aria-current={b === pos.b}
            data-has={n > 0}
            onClick={() => pickBook(b)}
          >
            <b>{bk[0]}</b>
            <span>{n ? `손글씨 ${n}` : `${bk[2]}${chName(b)}`}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="sn-bible" data-hand={hand} data-hl={showHl}>
      <div className="sn-bible-bar">
        <button
          type="button"
          className="sn-bible-book"
          aria-expanded={picker}
          onClick={() => setPicker((p) => !p)}
        >
          {bookName}
          <ChevronDown className="sn-icon" aria-hidden />
        </button>
        <span className="sn-sp" />
        <button
          type="button"
          className="sn-chip sn-bible-handtog"
          aria-pressed={hand}
          onClick={toggleHand}
          title="설교 노트의 생각을 여백에 손글씨로 보여요"
        >
          <PenLine className="sn-icon" aria-hidden />
          손글씨
        </button>
        <button
          type="button"
          className="sn-chip sn-bible-handtog"
          aria-pressed={showHl}
          onClick={toggleHl}
          title="내가 칠한 형광펜을 보여요. 절을 누르거나 글자를 끌어 고르면 칠할 수 있어요"
        >
          <Highlighter className="sn-icon" aria-hidden />
          형광펜
        </button>
        <span className="sn-label sn-hide-sm">개역한글</span>
      </div>

      {picker && (
        <div className="sn-bpick">
          <div className="sn-label">구약</div>
          {bookGrid(0, OT_COUNT)}
          <div className="sn-label">신약</div>
          {bookGrid(OT_COUNT, BOOKS.length)}
        </div>
      )}

      <div className="sn-bible-strip" ref={stripRef} role="list" aria-label={`${bookName} 장`}>
        {Array.from({ length: chCount(pos.b) }, (_, i) => {
          const c = i + 1;
          const has = marks.has(chKey(pos.b, c));
          const hl = hlChapters.has(c);
          return (
            <button
              key={c}
              type="button"
              role="listitem"
              aria-current={c === pos.c}
              data-has={has}
              data-hl={hl}
              aria-label={`${c}${chName(pos.b)}${has ? ', 손글씨 있음' : ''}${hl ? ', 형광펜 있음' : ''}`}
              onClick={() => go(pos.b, c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      <article
        key={turn ? `${pos.b}-${pos.c}` : undefined}
        ref={pageRef}
        className="sn-bible-page"
        data-turn={turn || undefined}
        aria-label={`${bookName} ${pos.c}${chName(pos.b)}`}
      >
        <div className="sn-bible-head" ref={headRef}>
          <h2 className="sn-bible-title">
            {bookName} <em>{pos.c}</em>
          </h2>
          <span className="sn-label">
            {text.length ? `${text.length}절` : ''}
            {list?.length
              ? ` · 설교 ${new Set(list.map((m) => m.note.id)).size}편이 지나간 장`
              : ''}
            {hls.length ? ` · 내 형광펜 ${hls.length}` : ''}
          </span>
        </div>
        {hand && whole.length > 0 && (
          <div className="sn-bv-hands sn-bible-whole">
            {whole.map((m) => (
              <Hand key={`${m.note.id}|w`} m={m} onOpen={onOpen} />
            ))}
          </div>
        )}

        {!bible ? (
          failed ? (
            <div className="sn-empty">
              성경 본문을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.
            </div>
          ) : (
            <div className="sn-bible-loading" role="status" aria-label="불러오는 중">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
            </div>
          )
        ) : (
          <div className="sn-bible-text" ref={textRef}>
            {text.map((t, i) => {
              const v = i + 1;
              const on = marksOn(list, v);
              const starts = on.filter((m) => m.ref.v1 === v);
              const kind = on.some((m) => m.kind === 'main')
                ? 'main'
                : on.length
                  ? 'quote'
                  : undefined;
              const segs = hls.length ? segmentsFor(hls, v, t.length) : null;
              const memos = hls.filter((h) => h.v2 === v && h.memo.trim());
              const picked =
                !!pick &&
                !pick.target &&
                v >= pick.range.v1 &&
                v <= pick.range.v2 &&
                isWhole(pick.range, lenOf);
              return (
                <div
                  key={v}
                  className="sn-bv-row"
                  data-v={v}
                  data-pick={picked || undefined}
                  data-flash={flash === v || undefined}
                >
                  <p className="sn-bv" data-mark={kind}>
                    <span className="sn-bv-n">{v}</span>
                    <span className="sn-bv-t" onClick={(e) => tapVerse(v, e.currentTarget)}>
                      {segs
                        ? segs.map((g) =>
                            g.top || g.ul ? (
                              <span
                                key={g.from}
                                className="sn-hl"
                                data-c={g.top?.color || undefined}
                                data-ul={g.ul || undefined}
                                data-memo={!!g.top?.memo || undefined}
                                data-sel={
                                  (!!pick?.target && g.top?.id === pick.target) || undefined
                                }
                              >
                                {t.slice(g.from, g.to)}
                              </span>
                            ) : (
                              t.slice(g.from, g.to)
                            ),
                          )
                        : t}
                    </span>
                  </p>
                  {((hand && starts.length > 0) || memos.length > 0) && (
                    <div className="sn-bv-hands">
                      {hand &&
                        starts.map((m) => (
                          <Hand
                            key={`${m.note.id}|${m.ref.v1}-${m.ref.v2}`}
                            m={m}
                            onOpen={onOpen}
                          />
                        ))}
                      {memos.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className="sn-hand sn-hand-mine"
                          onClick={(e) => openMemo(h, e.currentTarget)}
                          aria-label={`내 메모: ${h.memo} — 고치기`}
                        >
                          <span className="sn-hand-line">
                            <span
                              className="sn-hand-dot"
                              data-c={h.color || undefined}
                              aria-hidden
                            />
                            {clip(h.memo, HAND_MAX)}
                          </span>
                          <span className="sn-hand-src">
                            내 형광펜 ·{' '}
                            {refShort({ b: h.b, c: h.c, v1: h.v1, v2: h.v2, whole: false })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <nav className="sn-bible-foot" aria-label="장 이동">
          <button
            type="button"
            className="sn-btn sn-ghost"
            disabled={!prev}
            onClick={() => prev && go(prev.b, prev.c)}
          >
            <ChevronLeft className="sn-icon" aria-hidden />
            {prev ? `${BOOKS[prev.b][1]} ${prev.c}` : '처음'}
          </button>
          {nextMark ? (
            <button
              type="button"
              className="sn-chip sn-bible-nextmark"
              onClick={() => go(nextMark.b, nextMark.c)}
            >
              <Mascot kind={mascot} size={20} />
              다음 손글씨 {BOOKS[nextMark.b][1]} {nextMark.c}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="sn-btn sn-primary"
            disabled={!next}
            onClick={() => next && go(next.b, next.c)}
          >
            {next ? `${BOOKS[next.b][1]} ${next.c}` : '끝'}
            <ChevronRight className="sn-icon" aria-hidden />
          </button>
        </nav>
        {pick && (
          <HighlightBubble
            x={pick.x}
            y={pick.y}
            color={target?.color ?? null}
            ul={!!target?.ul}
            memo={target?.memo || ''}
            canClear={overlapping.length > 0}
            memoFirst={pick.memoFirst}
            label={`${pickLabel}|${pick.target || ''}`}
            onColor={applyColor}
            onUnderline={applyUnderline}
            onMemo={applyMemo}
            onCard={cardPick}
            onCopy={() => void copyPick()}
            onClear={clearPick}
            onClose={() => setPick(null)}
          />
        )}
        {!marks.size && (
          <p className="sn-bible-hint">
            설교 노트에 넣은 구절은 여기 성경에 손글씨로 남아요. 본문 구절이나 설교 중 구절을 넣어
            보세요.
          </p>
        )}
      </article>
      <ShareSheet
        open={!!card}
        note={card?.note || null}
        mascot={mascot}
        initialQuote={card?.quote || null}
        onClose={() => setCard(null)}
      />
    </div>
  );
}
