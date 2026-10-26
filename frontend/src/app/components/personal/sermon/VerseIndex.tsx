import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, ChevronDown, NotebookPen } from 'lucide-react';
import { BOOKS, compareRef, OT_COUNT, refShort, type Ref } from './bibleRefs';
import { collectMarks, type ReadMark } from './bibleMarks';
import { openInReader } from './bibleHighlights';
import { useBible, verses } from './useBible';
import { fmtDate, mainRef, UNTITLED, type SermonNote } from './sermonTypes';
import './verseIndex.css';

/**
 * 성경 읽기 하위 목록 공통 뼈대 — 「설교에서 만난 구절」·「내 형광펜」이 같이 쓴다.
 * 위 66권 네모(어디에 모였는지) → 보기 전환 → 묶음 머리 + 명조 본문 카드 + 손글씨 생각.
 * 새로 저장하는 것은 없다. 보기 선택·네모 접기만 기기에 기억한다.
 */

/* ───────── 기기에 기억하는 보기 ───────── */

export function useStoredView<T extends string>(key: string, options: readonly T[], def: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s && options.includes(s) ? s : def;
    } catch {
      return def;
    }
  });
  const set = (n: T) => {
    setV(n);
    try {
      localStorage.setItem(key, n);
    } catch {
      /* ignore */
    }
  };
  return [v, set] as const;
}

/* ───────── 66권 네모 ───────── */

const FOLD_KEY = 'sermon-strip-fold';

/** 칸 색 — 한 색이면 그대로, 여러 색이면 대각선으로 나눠 칠한다 */
function fill(colors: string[]): string {
  const u = [...new Set(colors)];
  if (u.length === 1) return u[0];
  const step = 100 / u.length;
  return `linear-gradient(135deg, ${u.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

interface BookStripProps {
  /** 권 번호 → 그 권 항목들의 색 (항목 수만큼) */
  cells: Map<number, string[]>;
  sel: number | null;
  onSel: (b: number | null) => void;
}

export function BookStrip({ cells, sel, onSel }: BookStripProps) {
  const [folded, setFolded] = useStoredView(FOLD_KEY, ['0', '1'] as const, '0');
  const total = [...cells.values()].reduce((a, l) => a + l.length, 0);
  const ot = [...cells.keys()].filter((b) => b < OT_COUNT).length;
  const nt = cells.size - ot;

  const cell = (b: number) => {
    const cs = cells.get(b);
    const abbr = BOOKS[b][1];
    if (!cs) {
      return (
        <span key={b} className="sn-vx-cell" aria-hidden>
          {abbr}
        </span>
      );
    }
    return (
      <button
        key={b}
        type="button"
        className="sn-vx-cell"
        data-on
        data-dim={(sel != null && sel !== b) || undefined}
        aria-pressed={sel === b}
        aria-label={`${BOOKS[b][0]} ${cs.length}개`}
        title={`${BOOKS[b][0]} ${cs.length}개`}
        style={{ '--fill': fill(cs) } as CSSProperties}
        onClick={() => onSel(sel === b ? null : b)}
      >
        {abbr}
      </button>
    );
  };

  return (
    <div className="sn-vx-strip">
      <div className="sn-vx-cap">
        <span>
          구약 <b>{ot}</b>권 · 신약 <b>{nt}</b>권에 {total}개
        </span>
        {sel != null ? (
          <button type="button" className="sn-vx-link" onClick={() => onSel(null)}>
            <b>{BOOKS[sel][0]}</b>만 보는 중 · 전체 보기
          </button>
        ) : (
          <button
            type="button"
            className="sn-vx-link"
            aria-expanded={folded === '0'}
            onClick={() => setFolded(folded === '0' ? '1' : '0')}
          >
            {folded === '0' ? '접기' : '66권 펼치기'}
            <ChevronDown className="sn-icon" data-up={folded === '0' || undefined} aria-hidden />
          </button>
        )}
      </div>
      {(folded === '0' || sel != null) && (
        <>
          <div className="sn-vx-tes">
            <span className="sn-vx-tes-lb">구약</span>
            <div className="sn-vx-grid">{Array.from({ length: OT_COUNT }, (_, i) => cell(i))}</div>
          </div>
          <div className="sn-vx-tes">
            <span className="sn-vx-tes-lb">신약</span>
            <div className="sn-vx-grid">
              {Array.from({ length: BOOKS.length - OT_COUNT }, (_, i) => cell(i + OT_COUNT))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── 머리 · 보기 전환 ───────── */

export function ViewSeg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sn-vx-seg" role="group" aria-label="보기">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function GroupHead({
  title,
  count,
  lead,
}: {
  title: ReactNode;
  count: number;
  lead?: ReactNode;
}) {
  return (
    <div className="sn-vx-ghead">
      {lead}
      <span className="sn-vx-gtitle">{title}</span>
      <span className="sn-vx-cnt">{count}</span>
    </div>
  );
}

/** 성경 순서로 권별 묶음 */
export function groupByBook<T>(items: T[], bookOf: (x: T) => number): Array<[number, T[]]> {
  const m = new Map<number, T[]>();
  items.forEach((x) => {
    const b = bookOf(x);
    if (!m.has(b)) m.set(b, []);
    m.get(b)!.push(x);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export const bookTitle = (b: number) => BOOKS[b][0];

/* ───────── 설교에서 만난 구절 ───────── */

/** 설교 색 — 노트마다 고정 색이 없어 최근 설교 순서대로 잉크를 돌려 쓴다 */
const SERMON_COLORS = ['blue', 'red', 'green', 'purple', 'orange'] as const;
const sermonColor = (i: number) => `var(--sn-c-${SERMON_COLORS[i % SERMON_COLORS.length]})`;

const refText = (r: Ref): string => {
  const vs = verses(r);
  if (!vs) return '';
  return vs
    .slice(0, r.whole ? 3 : 12)
    .map(([, t]) => t)
    .join(' ');
};

const VERSE_VIEWS = [
  ['sermon', '설교별'],
  ['canon', '성경 순서'],
] as const;
type VerseView = (typeof VERSE_VIEWS)[number][0];

interface SermonVersesProps {
  /** 검색·예배 거르기를 거친 노트 */
  notes: SermonNote[];
  onOpen: (id: string, aid?: string | null) => void;
  onRead: () => void;
}

export function SermonVerses({ notes, onOpen, onRead }: SermonVersesProps) {
  useBible();
  const [view, setView] = useStoredView(
    'sermon-verse-view',
    VERSE_VIEWS.map((v) => v[0]),
    'sermon' as VerseView,
  );
  const [book, setBook] = useState<number | null>(null);

  const { marks, sermons, colorOf } = useMemo(() => {
    const all: ReadMark[] = [];
    collectMarks(notes).forEach((l) => all.push(...l));
    const ids = new Set(all.map((m) => m.note.id));
    const ss = notes
      .filter((n) => ids.has(n.id))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updated_at - a.updated_at);
    const col = new Map(ss.map((n, i) => [n.id, sermonColor(i)]));
    return { marks: all, sermons: ss, colorOf: (id: string) => col.get(id) || sermonColor(0) };
  }, [notes]);

  const cells = useMemo(() => {
    const m = new Map<number, string[]>();
    marks.forEach((x) => {
      if (!m.has(x.ref.b)) m.set(x.ref.b, []);
      m.get(x.ref.b)!.push(`color-mix(in srgb, ${colorOf(x.note.id)} 28%, var(--sn-surface))`);
    });
    return m;
  }, [marks, colorOf]);

  if (!marks.length) return <div className="sn-empty">노트에 넣은 구절이 아직 없어요.</div>;

  const sel = book != null && cells.has(book) ? book : null;
  const shown = marks.filter((m) => sel == null || m.ref.b === sel);
  const read = (r: Ref) => {
    openInReader(r.b, r.c, r.v1);
    onRead();
  };
  const card = (m: ReadMark, inSermon: boolean) => (
    <VerseCard
      key={`${m.note.id}|${refShort(m.ref)}`}
      m={m}
      color={colorOf(m.note.id)}
      wide={inSermon && m.kind === 'main'}
      from={!inSermon}
      onRead={() => read(m.ref)}
      onOpen={() => onOpen(m.note.id, m.aid)}
    />
  );

  return (
    <div className="sn-vx">
      <div className="sn-vx-head">
        <span className="sn-vx-sum">
          설교 <b>{sermons.length}</b>편에서 만난 구절 <b>{marks.length}</b>개
        </span>
        <ViewSeg value={view} options={VERSE_VIEWS} onChange={setView} />
      </div>
      <BookStrip cells={cells} sel={sel} onSel={setBook} />
      <div className="sn-vx-groups">
        {view === 'sermon'
          ? sermons.map((n) => {
              const its = shown.filter((m) => m.note.id === n.id);
              if (!its.length) return null;
              its.sort(
                (a, b) =>
                  (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1) ||
                  compareRef(a.ref, b.ref),
              );
              const r = mainRef(n);
              return (
                <section
                  key={n.id}
                  className="sn-vx-grp"
                  style={{ '--sc': colorOf(n.id) } as CSSProperties}
                >
                  <button type="button" className="sn-vx-sermon" onClick={() => onOpen(n.id)}>
                    <span className="sn-vx-sticker" aria-hidden>
                      {r ? `${BOOKS[r.b][1]} ${r.c}` : '말씀'}
                    </span>
                    <span className="sn-vx-meta">
                      <b>{n.title || UNTITLED}</b>
                      <span>
                        {[fmtDate(n.date), n.service].filter(Boolean).join(' · ')} · 구절{' '}
                        {its.length}개
                      </span>
                    </span>
                  </button>
                  <div className="sn-vx-cards">{its.map((m) => card(m, true))}</div>
                </section>
              );
            })
          : groupByBook(
              [...shown].sort(
                (a, b) =>
                  compareRef(a.ref, b.ref) || (b.note.date || '').localeCompare(a.note.date || ''),
              ),
              (m) => m.ref.b,
            ).map(([b, its]) => (
              <section key={b} className="sn-vx-grp">
                <GroupHead title={bookTitle(b)} count={its.length} />
                <div className="sn-vx-cards">{its.map((m) => card(m, false))}</div>
              </section>
            ))}
      </div>
    </div>
  );
}

function VerseCard({
  m,
  color,
  wide,
  from,
  onRead,
  onOpen,
}: {
  m: ReadMark;
  color: string;
  wide: boolean;
  from: boolean;
  onRead: () => void;
  onOpen: () => void;
}) {
  const text = refText(m.ref);
  const thoughts = m.thoughts.slice(0, 2);
  return (
    <article
      className="sn-vx-card"
      data-wide={wide || undefined}
      style={{ '--sc': color } as CSSProperties}
    >
      <div className="sn-vx-top">
        <span className="sn-vx-ref">{refShort(m.ref)}</span>
        {m.kind === 'main' && <span className="sn-vx-tag">주제 말씀</span>}
      </div>
      {from && (
        <span className="sn-vx-from">
          <i aria-hidden />
          <em>{m.note.title || UNTITLED}</em>
          <span>{fmtDate(m.note.date)}</span>
        </span>
      )}
      <p className="sn-vx-verse">{text || '…'}</p>
      {thoughts.map((t) => (
        <p key={t.id} className="sn-vx-hand">
          {t.text}
        </p>
      ))}
      <div className="sn-vx-acts">
        <button type="button" className="sn-vx-act" onClick={onRead}>
          <BookOpen className="sn-icon" aria-hidden />
          성경에서 읽기
        </button>
        <button type="button" className="sn-vx-act" onClick={onOpen}>
          <NotebookPen className="sn-icon" aria-hidden />
          {m.aid ? '노트 그 자리' : '노트 열기'}
        </button>
      </div>
    </article>
  );
}
