import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, PenLine } from 'lucide-react';
import { BOOKS, OT_COUNT, PSALMS, chCount, refShort } from './bibleRefs';
import { bookCounts, chKey, collectMarks, marksOn, nextMarked, type ReadMark } from './bibleMarks';
import { UNTITLED, type SermonNote } from './sermonTypes';
import { useBible } from './useBible';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';

/**
 * 성경 읽기 — 「그날의 손글씨」.
 * 평범하게 성경을 읽다가, 설교에서 들었던 구절을 만나면 물결 밑줄과 여백의 손글씨(그날 남긴 생각)로 알아본다.
 * 손글씨를 누르면 그 노트의 그 자리로 간다. 넓은 화면은 오른쪽 여백, 좁은 화면은 구절 바로 아래.
 * 읽던 장·손글씨 켬/끔은 기기에 기억한다.
 */

interface BibleReaderProps {
  notes: SermonNote[];
  onOpen: (id: string, aid?: string | null) => void;
  mascot?: MascotId;
}

const POS_KEY = 'sermon-bible-pos';
const HAND_KEY = 'sermon-bible-hand';
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
function loadHand(): boolean {
  try {
    return localStorage.getItem(HAND_KEY) !== '0';
  } catch {
    return true;
  }
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
  const [hand, setHand] = useState(loadHand);
  const [picker, setPicker] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /** 사용자가 장을 옮겼을 때만 장 머리로 올린다 (처음 열 때·노트가 늦게 도착할 때는 그대로) */
  const jumped = useRef(false);

  useEffect(() => {
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
    setPos({ b, c: Math.min(Math.max(1, c), chCount(b)) });
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
  const whole = (list || []).filter((m) => m.ref.whole);
  const text = bible?.[pos.b]?.[pos.c - 1] || [];
  const bookName = BOOKS[pos.b][0];

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
    <div className="sn-bible" data-hand={hand}>
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
          return (
            <button
              key={c}
              type="button"
              role="listitem"
              aria-current={c === pos.c}
              data-has={has}
              aria-label={`${c}${chName(pos.b)}${has ? ', 손글씨 있음' : ''}`}
              onClick={() => go(pos.b, c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      <article className="sn-bible-page" aria-label={`${bookName} ${pos.c}${chName(pos.b)}`}>
        <div className="sn-bible-head" ref={headRef}>
          <h2 className="sn-bible-title">
            {bookName} <em>{pos.c}</em>
          </h2>
          <span className="sn-label">
            {text.length ? `${text.length}절` : ''}
            {list?.length
              ? ` · 설교 ${new Set(list.map((m) => m.note.id)).size}편이 지나간 장`
              : ''}
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
          <div className="sn-bible-text">
            {text.map((t, i) => {
              const v = i + 1;
              const on = marksOn(list, v);
              const starts = on.filter((m) => m.ref.v1 === v);
              const kind = on.some((m) => m.kind === 'main')
                ? 'main'
                : on.length
                  ? 'quote'
                  : undefined;
              return (
                <div key={v} className="sn-bv-row">
                  <p className="sn-bv" data-mark={kind}>
                    <span className="sn-bv-n">{v}</span>
                    <span className="sn-bv-t">{t}</span>
                  </p>
                  {hand && starts.length > 0 && (
                    <div className="sn-bv-hands">
                      {starts.map((m) => (
                        <Hand key={`${m.note.id}|${m.ref.v1}-${m.ref.v2}`} m={m} onOpen={onOpen} />
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
        {!marks.size && (
          <p className="sn-bible-hint">
            설교 노트에 넣은 구절은 여기 성경에 손글씨로 남아요. 본문 구절이나 설교 중 구절을 넣어
            보세요.
          </p>
        )}
      </article>
    </div>
  );
}
