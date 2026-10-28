import { useMemo, useState } from 'react';
import { BookOpen, Highlighter } from 'lucide-react';
import { refShort } from './bibleRefs';
import {
  compareHl,
  HL_COLORS,
  openInReader,
  rangeText,
  useHighlights,
  type Highlight,
  type HlColor,
} from './bibleHighlights';
import { useBible } from './useBible';
import { weekOf } from './sermonTypes';
import { BookStrip, bookTitle, GroupHead, groupByBook, useStoredView, ViewSeg } from './VerseIndex';
import './bibleHighlight.css';

/**
 * 성경 읽기 › 「내 형광펜」 — 칠한 구절 모아보기. 기본은 최근(주 단위), 성경 순서·색별로 바꿔 본다.
 * 위 66권 네모는 칠한 색으로 채우고, 누르면 그 책만. 카드를 누르면 읽기 화면의 그 절로 간다.
 */
interface HighlightListProps {
  onRead: () => void;
  /** 좁은 화면 66칸 한 줄 자리 (BookStrip host) */
  stripHost?: HTMLElement | null;
}

const VIEWS = [
  ['recent', '최근'],
  ['canon', '성경 순서'],
  ['color', '색별'],
] as const;
type HlView = (typeof VIEWS)[number][0];

const HL_FILL: Record<HlColor, string> = {
  yellow: 'var(--sn-hl-yellow)',
  green: 'var(--sn-hl-green)',
  blue: 'var(--sn-hl-blue)',
  pink: 'var(--sn-hl-pink)',
};
const UL_FILL = 'color-mix(in srgb, var(--sn-fg) 22%, transparent)';

const dayStr = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 이번 주 · 지난주 · 이번 달 · 그 전 */
function recentBucket(at: number, now: Date): number {
  const ds = dayStr(at);
  const thisWeek = weekOf(dayStr(now.getTime()));
  if (weekOf(ds) >= thisWeek) return 0;
  const last = new Date(now);
  last.setDate(now.getDate() - 7);
  if (weekOf(ds) >= weekOf(dayStr(last.getTime()))) return 1;
  if (ds.slice(0, 7) === dayStr(now.getTime()).slice(0, 7)) return 2;
  return 3;
}
const BUCKETS = ['이번 주', '지난주', '이번 달', '그 전'];

const mdOf = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
};

export function HighlightList({ onRead, stripHost }: HighlightListProps) {
  const store = useHighlights();
  const { bible } = useBible();
  const [view, setView] = useStoredView(
    'sermon-hl-view',
    VIEWS.map((v) => v[0]),
    'recent' as HlView,
  );
  const [book, setBook] = useState<number | null>(null);
  const all = store.all();

  const cells = useMemo(() => {
    const m = new Map<number, string[]>();
    all.forEach((h) => {
      if (!m.has(h.b)) m.set(h.b, []);
      m.get(h.b)!.push(h.color ? HL_FILL[h.color] : UL_FILL);
    });
    return m;
  }, [all]);

  if (!all.length) {
    return (
      <div className="sn-empty">
        <Highlighter className="w-6 h-6" style={{ color: 'var(--sn-accent)' }} aria-hidden />
        <h2>아직 칠한 구절이 없어요</h2>
        <div>
          성경 읽기에서 절을 누르거나 글자를 끌어 고르면
          <br />
          형광펜으로 칠하고 한 줄 메모를 남길 수 있어요.
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={onRead}>
          성경 읽으러 가기
        </button>
      </div>
    );
  }

  const sel = book != null && cells.has(book) ? book : null;
  const shown = all.filter((h) => sel == null || h.b === sel);
  const memoCount = all.filter((h) => h.memo.trim()).length;
  const textOf = (h: Highlight) => {
    const ch = bible?.[h.b]?.[h.c - 1] || [];
    return ch.length ? rangeText(h, (v) => ch[v - 1] || '') : '';
  };
  const card = (h: Highlight) => (
    <button
      key={h.id}
      type="button"
      className="sn-vx-card sn-vx-hlcard"
      data-vx-b={h.b}
      onClick={() => {
        openInReader(h.b, h.c, h.v1);
        onRead();
      }}
    >
      <span className="sn-vx-top">
        <span className="sn-vx-ref">
          {refShort({ b: h.b, c: h.c, v1: h.v1, v2: h.v2, whole: false })}
          {h.s || h.e != null ? ' 일부' : ''}
        </span>
        <span className="sn-vx-date">
          <i
            className="sn-vx-swatch"
            style={{ background: h.color ? HL_FILL[h.color] : UL_FILL }}
            aria-hidden
          />
          {mdOf(h.at)}
        </span>
      </span>
      <span className="sn-vx-verse">
        <span className="sn-hl" data-c={h.color || undefined} data-ul={h.ul || undefined}>
          {textOf(h) || '…'}
        </span>
      </span>
      {h.memo.trim() && <span className="sn-vx-hand">{h.memo}</span>}
      <span className="sn-vx-acts" aria-hidden>
        <span className="sn-vx-act">
          <BookOpen className="sn-icon" />
          성경에서 읽기
        </span>
      </span>
    </button>
  );

  let groups: Array<{ key: string; head: React.ReactNode; items: Highlight[] }>;
  if (view === 'recent') {
    const now = new Date();
    const byB = new Map<number, Highlight[]>();
    shown.forEach((h) => {
      const k = recentBucket(h.at, now);
      if (!byB.has(k)) byB.set(k, []);
      byB.get(k)!.push(h);
    });
    groups = [...byB.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, items]) => ({
        key: `r${k}`,
        head: <GroupHead title={BUCKETS[k]} count={items.length} />,
        items: items.sort((a, b) => b.at - a.at),
      }));
  } else if (view === 'canon') {
    groups = groupByBook([...shown].sort(compareHl), (h) => h.b).map(([b, items]) => ({
      key: `b${b}`,
      head: <GroupHead title={bookTitle(b)} count={items.length} />,
      items,
    }));
  } else {
    const keys: Array<HlColor | null> = [...HL_COLORS.map(([c]) => c), null];
    groups = keys
      .map((c) => ({ c, items: shown.filter((h) => h.color === c).sort(compareHl) }))
      .filter((g) => g.items.length)
      .map(({ c, items }) => ({
        key: `c${c}`,
        head: (
          <GroupHead
            lead={
              <i
                className="sn-vx-swatch sn-vx-swatch-lg"
                style={{ background: c ? HL_FILL[c] : UL_FILL }}
                aria-hidden
              />
            }
            title={c ? HL_COLORS.find(([k]) => k === c)![1] : '밑줄만'}
            count={items.length}
          />
        ),
        items,
      }));
  }

  return (
    <div className="sn-vx">
      <div className="sn-vx-head">
        <span className="sn-vx-sum">
          칠한 구절 <b>{all.length}</b>개
          {memoCount > 0 && (
            <>
              {' '}
              · 메모 <b>{memoCount}</b>개
            </>
          )}
        </span>
        <ViewSeg value={view} options={VIEWS} onChange={setView} />
      </div>
      <BookStrip cells={cells} sel={sel} onSel={setBook} host={stripHost} />
      <div className="sn-vx-groups">
        {groups.map((g) => (
          <section key={g.key} className="sn-vx-grp">
            {g.head}
            <div className="sn-vx-cards">{g.items.map(card)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
