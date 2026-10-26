import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { BOOKS, refLong } from './bibleRefs';
import { Mascot } from './Mascot';
import { SnOverlay, afterSheetClose } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';
import { useFirstSeen } from './microFx';
import type { MascotId } from './sermonLook';
import { fmtDate, mainRef, todayString, UNTITLED, weekOf, type SermonNote } from './sermonTypes';
import './profile/profile.css';
import './stickerBook.css';

/**
 * 「모은 설교 스티커」 = 한 해 스티커북. 기획: https://claude.ai/artifact/REGmPD31DUyUfiQX62axSL (B안)
 *  - 그해 주일마다 한 칸. 그 주의 갈피 노트(galpiByWeek)가 스티커로 붙는다 — 주중 노트는 칸을 따로 갖지 않는다
 *  - 스티커를 누르면 노트로 바로 가지 않고 뒷면 시트(요약 + 그 주의 다른 설교)를 연다. 이동은 시트의 「노트 열기」로만
 *  - 지난 빈 주일은 점선, 이번(다음) 주일 자리는 캐릭터가 기다린다. 한 달을 다 채우면 「완성」
 */

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 그해 일요일들을 달별로 */
function sundaysByMonth(year: number): string[][] {
  const out: string[][] = Array.from({ length: 12 }, () => []);
  const d = new Date(year, 0, 1);
  d.setDate(1 + ((7 - d.getDay()) % 7));
  while (d.getFullYear() === year) {
    out[d.getMonth()].push(ymd(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** 이번 주(비었으면 지난주)부터 거꾸로 갈피 스티커가 이어진 주 수 */
function stickerStreak(galpi: Map<string, SermonNote>, thisWeek: string): number {
  const d = new Date(`${thisWeek}T00:00:00`);
  if (!galpi.has(thisWeek)) d.setDate(d.getDate() - 7);
  let n = 0;
  while (galpi.has(ymd(d))) {
    n += 1;
    d.setDate(d.getDate() - 7);
  }
  return n;
}

/** 스티커 그림 글자: 항상 책 이름 + 장 (칸이 작아 약어 「롬 5」) */
function stickerLabel(n: SermonNote): string {
  const r = mainRef(n);
  return r ? `${BOOKS[r.b][1]} ${r.c}` : '설교';
}

const ROT = [-6, 4, -2, 5, -4, 3, -3, 6];
const INK: Array<[string, string]> = [
  ['var(--sn-g2)', 'var(--sn-g1)'],
  ['var(--sn-g1)', 'var(--sn-g2)'],
];

function Sticker({
  note,
  seq,
  big,
  fresh,
}: {
  note: SermonNote;
  seq: number;
  big?: boolean;
  fresh?: boolean;
}) {
  const [a, b] = INK[seq % 2];
  const r = mainRef(note);
  return (
    <span
      className="snb-stk"
      data-big={big || undefined}
      data-new={fresh || undefined}
      style={{ '--r': `${ROT[seq % ROT.length]}deg`, '--a': a, '--b': b } as React.CSSProperties}
    >
      <span className="snb-die" />
      <span className="snb-face">
        {big && <span className="snb-svc">{note.service || '설교'}</span>}
        <span className="snb-bk">{big && r ? `${BOOKS[r.b][0]} ${r.c}` : stickerLabel(note)}</span>
      </span>
      {note.bookmarked_at ? <span className="snb-pin" aria-hidden /> : null}
    </span>
  );
}

export function StickerBook({
  notes,
  galpi,
  mascot,
  onOpen,
}: {
  notes: SermonNote[];
  galpi: Map<string, SermonNote>;
  mascot: MascotId;
  onOpen: (id: string) => void;
}) {
  const today = todayString();
  const thisWeek = weekOf(today);
  const thisYear = +today.slice(0, 4);

  // 넘겨 볼 수 있는 해: 갈피가 있는 해 ~ 올해
  const years = useMemo(() => {
    const ys = new Set<number>([thisYear]);
    galpi.forEach((_, w) => ys.add(+w.slice(0, 4)));
    return [...ys].sort((x, y) => x - y);
  }, [galpi, thisYear]);
  const [year, setYear] = useState(thisYear);
  const yi = years.indexOf(year);

  const months = useMemo(() => sundaysByMonth(year), [year]);
  const all = months.flat();
  const filled = all.filter((w) => galpi.has(w)).length;
  const streak = useMemo(() => stickerStreak(galpi, thisWeek), [galpi, thisWeek]);
  // 캐릭터가 기다리는 자리: 이번 주일이 비었으면 이번 주일, 붙었으면 다음 주일
  const waiting = useMemo(() => {
    const d = new Date(`${thisWeek}T00:00:00`);
    if (galpi.has(thisWeek)) d.setDate(d.getDate() + 7);
    return ymd(d);
  }, [galpi, thisWeek]);

  // 스티커 순번(색·기울기)은 날짜 순으로 고정 — 해를 넘겨도 같은 스티커는 같은 모양
  const seqOf = useMemo(() => {
    const m = new Map<string, number>();
    [...galpi.keys()].sort().forEach((w, i) => m.set(w, i));
    return m;
  }, [galpi]);
  const fresh = useFirstSeen(
    'sn-seen-galpi-stickers',
    [...galpi.values()].map((n) => n.id),
  );

  const [peek, setPeek] = useState<string | null>(null);
  const peekNote = peek ? galpi.get(peek) : undefined;
  const others = useMemo(
    () =>
      peek && peekNote
        ? notes
            .filter((n) => n.id !== peekNote.id && weekOf(n.date) === peek)
            .sort((x, y) => (x.date || '').localeCompare(y.date || ''))
        : [],
    [notes, peek, peekNote],
  );
  const closePeek = () => setPeek(null);
  const open = (id: string) => {
    closePeek();
    afterSheetClose(() => onOpen(id));
  };

  return (
    <div className="snb-book">
      <div className="snb-head">
        <div className="snb-num">
          {filled}
          <small> / {all.length}</small>
        </div>
        <div className="snb-prog">
          <span className="snb-cap">
            {year}년 주일 갈피 스티커
            {years.length > 1 && (
              <span className="snb-yr">
                <button
                  type="button"
                  aria-label="이전 해"
                  disabled={yi <= 0}
                  onClick={() => setYear(years[yi - 1])}
                >
                  <ChevronLeft className="sn-icon" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="다음 해"
                  disabled={yi >= years.length - 1}
                  onClick={() => setYear(years[yi + 1])}
                >
                  <ChevronRight className="sn-icon" aria-hidden />
                </button>
              </span>
            )}
          </span>
          <span className="snb-bar">
            <i style={{ width: `${all.length ? (filled / all.length) * 100 : 0}%` }} />
          </span>
        </div>
        {year === thisYear && streak > 1 && <span className="snb-streak">{streak}주 연속</span>}
      </div>

      <div className="snb-months">
        {months.map((sundays, m) => {
          const got = sundays.filter((w) => galpi.has(w)).length;
          const done = got === sundays.length;
          const future = sundays[0] > thisWeek && !got;
          return (
            <div
              key={m}
              className="snb-mo"
              data-done={done || undefined}
              data-future={future || undefined}
            >
              <b className="snb-mo-n">{m + 1}월</b>
              <div className="snb-row">
                {sundays.map((w) => {
                  const n = galpi.get(w);
                  const day = +w.slice(8);
                  if (n) {
                    return (
                      <button
                        key={w}
                        type="button"
                        className="snb-cell"
                        onClick={() => setPeek(w)}
                        aria-label={`${m + 1}월 ${day}일 주일 갈피: ${n.title || UNTITLED}`}
                      >
                        <Sticker note={n} seq={seqOf.get(w) ?? 0} fresh={fresh.has(n.id)} />
                      </button>
                    );
                  }
                  if (w === waiting && year === thisYear) {
                    return (
                      <span
                        key={w}
                        className="snb-cell snb-slot"
                        data-wait
                        title={`${m + 1}.${day} 기다리는 중`}
                      >
                        <Mascot kind={mascot} size={30} state="sleep" />
                      </span>
                    );
                  }
                  return (
                    <span
                      key={w}
                      className="snb-cell snb-slot"
                      data-future={w > thisWeek || undefined}
                      aria-label={w > thisWeek ? undefined : `${m + 1}월 ${day}일 비어 있음`}
                    >
                      <i>{day}</i>
                    </span>
                  );
                })}
              </div>
              <span className="snb-mo-c">{done ? '완성' : `${got}/${sundays.length}`}</span>
            </div>
          );
        })}
      </div>

      <SnOverlay
        open={!!peekNote}
        onClose={closePeek}
        className="snp-sheet snb-sheet"
        aria-labelledby="snb-peek-title"
      >
        {peekNote && peek && (
          <>
            <div className="snp-sbody">
              <div className="snb-peek-h">
                <Sticker note={peekNote} seq={seqOf.get(peek) ?? 0} big />
                <div className="snb-peek-meta">
                  <span>
                    {fmtDate(peekNote.date)}
                    {peekNote.service ? ` · ${peekNote.service}` : ''}
                  </span>
                  {peekNote.preacher && <span>{peekNote.preacher}</span>}
                  {mainRef(peekNote) && <span>{refLong(mainRef(peekNote)!)}</span>}
                </div>
              </div>
              <h2 id="snb-peek-title" className="snb-peek-t">
                {peekNote.title || UNTITLED}
              </h2>
              {peekNote.thoughts?.find((t) => t.text.trim()) && (
                <p className="snb-peek-q">
                  “{peekNote.thoughts.find((t) => t.text.trim())!.text.trim()}”
                </p>
              )}
              {others.length > 0 && (
                <div className="snb-others">
                  <span className="snp-label">이 주에 들은 다른 설교</span>
                  {others.map((n) => (
                    <button key={n.id} type="button" onClick={() => open(n.id)}>
                      <b>{n.title || UNTITLED}</b>
                      <span>
                        {fmtDate(n.date)}
                        {n.service ? ` · ${n.service}` : ''}
                      </span>
                      <ChevronRight className="sn-icon" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SnSheetBar onClose={closePeek}>
              <button type="button" className="sn-btn sn-primary" onClick={() => open(peekNote.id)}>
                노트 열기
                <ArrowRight className="sn-icon" aria-hidden />
              </button>
            </SnSheetBar>
          </>
        )}
      </SnOverlay>
    </div>
  );
}
