import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { GroupDaySlots, NoteGroupFaces } from './group/GroupWeekBits';
import { MyDaySlots } from './WorshipHomeBits';
import { applyCount, bookName, chapterUnit, dayLabel } from './homeFmt';
import { isGalpi, mainRef, UNTITLED, type SermonNote } from './sermonTypes';

/**
 * 홈 아래 「들은 예배」 — 고른 주(일~토)의 노트를 날짜 순으로 카드 한 장씩. 기본은 이번 주.
 * 개인 노트 = g1, 모임 노트 = g3, 갈피 노트는 리본. 「적용 N」을 누르면 위 「한 주 동안」에서 그 노트 항목이 표시된다(이번 주만).
 * 아직 안 쓴 예배 자리(모임 GroupDaySlots · 내 예배표 MyDaySlots)는 그날 카드 뒤에 점선 칸으로 끼운다 — 지난 날은 「놓친 예배」.
 * 주 이동: 헤더 ‹ › · 최근 8주 막대 · 카드 줄 양 끝 칸 · 헤더 좌우 스와이프. 높이는 어느 주든 헤더 한 줄 + 카드 한 줄.
 * 위 「한 주 동안」은 이번 주에 그대로 둔다.
 */
interface WeekServicesProps {
  /** 전체 노트 — 고른 주의 노트는 여기서 거른다 */
  notes: SermonNote[];
  /** 이번 주 일요일 yyyy-MM-dd */
  thisWeek: string;
  galpi: Map<string, SermonNote>;
  isGroupNote: (n: SermonNote) => boolean;
  highlight: string | null;
  onHighlight: (noteId: string | null) => void;
  onOpen: (id: string) => void;
  /** date 를 주면 그 날짜로 새 노트 (지난 주에 기록) */
  onNew: (date?: string) => void;
}

const SPARK_WEEKS = 8;
const SWIPE_PX = 40;

function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function sundayOf(ds: string): string {
  const [y, m, d] = ds.split('-').map(Number);
  return addDays(ds, -new Date(y, m - 1, d).getDay());
}

/** '2026-10-04' → '10.4' */
function md(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}.${d}`;
}

function weeksAgo(ws: string, thisWeek: string): number {
  const [y1, m1, d1] = thisWeek.split('-').map(Number);
  const [y2, m2, d2] = ws.split('-').map(Number);
  return Math.round(
    (new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime()) / (7 * 864e5),
  );
}

function weekName(ws: string, thisWeek: string): string {
  const k = weeksAgo(ws, thisWeek);
  return k === 0 ? '이번 주' : k === 1 ? '지난주' : `${md(ws)} 주`;
}

export function WeekServices({
  notes,
  thisWeek,
  galpi,
  isGroupNote,
  highlight,
  onHighlight,
  onOpen,
  onNew,
}: WeekServicesProps) {
  const [ws, setWs] = useState(thisWeek);
  const [dir, setDir] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const swipeX = useRef<number | null>(null);

  // 주별 노트 (날짜 · 만든 순)
  const byWeek = useMemo(() => {
    const m = new Map<string, SermonNote[]>();
    for (const n of notes) {
      if (!n.date || n.date > addDays(thisWeek, 6)) continue;
      const k = sundayOf(n.date);
      m.set(k, [...(m.get(k) || []), n]);
    }
    m.forEach((list) =>
      list.sort((a, b) => a.date.localeCompare(b.date) || a.created_at - b.created_at),
    );
    return m;
  }, [notes, thisWeek]);
  const oldest = useMemo(() => {
    const ks = [...byWeek.keys()].sort();
    return ks[0] && ks[0] < thisWeek ? ks[0] : thisWeek;
  }, [byWeek, thisWeek]);
  const spark = useMemo(() => {
    const ws8 = Array.from({ length: SPARK_WEEKS }, (_, i) =>
      addDays(thisWeek, -7 * (SPARK_WEEKS - 1 - i)),
    ).filter((w) => w >= oldest);
    const max = Math.max(1, ...ws8.map((w) => byWeek.get(w)?.length || 0));
    return ws8.map((w) => ({ w, c: byWeek.get(w)?.length || 0, max }));
  }, [byWeek, thisWeek, oldest]);

  const isThis = ws === thisWeek;
  const weekNotes = byWeek.get(ws) || [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  const prevW = addDays(ws, -7);
  const nextW = addDays(ws, 7);
  const count = (w: string) => byWeek.get(w)?.length || 0;

  // 「지난주」 칸은 비켜 두고 그 주 첫 칸부터 보이게
  useLayoutEffect(() => {
    const g = gridRef.current;
    const first = g?.querySelector<HTMLElement>('.sn-ws-peek')
      ?.nextElementSibling as HTMLElement | null;
    if (g) g.scrollLeft = first && ws > oldest ? first.offsetLeft - 6 : 0;
  }, [ws, oldest]);

  const go = (w: string) => {
    if (w < oldest || w > thisWeek || w === ws) return;
    setDir(w > ws ? 1 : -1);
    setWs(w);
  };

  const title = isThis ? (
    <>
      <em>이번 주</em> 들은 예배
    </>
  ) : weeksAgo(ws, thisWeek) === 1 ? (
    <>
      <em>지난주</em> 들은 예배
    </>
  ) : (
    <>
      <em>{md(ws)} 주</em>에 들은 예배
    </>
  );

  return (
    <section className="sn-ws" aria-label="들은 예배">
      <div
        className="sn-sec-h sn-ws-h"
        onPointerDown={(e) => {
          swipeX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipeX.current == null) return;
          const dx = e.clientX - swipeX.current;
          swipeX.current = null;
          if (Math.abs(dx) > SWIPE_PX) go(addDays(ws, dx > 0 ? -7 : 7));
        }}
      >
        <h4>{title}</h4>
        <div className="sn-ws-nav">
          <button
            type="button"
            aria-label="지난주"
            disabled={ws <= oldest}
            onClick={() => go(prevW)}
          >
            <ChevronLeft className="sn-icon" style={{ width: 16, height: 16 }} />
          </button>
          <span>
            {md(ws)} – {md(addDays(ws, 6))}
          </span>
          <button type="button" aria-label="다음 주" disabled={isThis} onClick={() => go(nextW)}>
            <ChevronRight className="sn-icon" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {spark.length > 1 && (
          <div className="sn-ws-spark" role="group" aria-label={`최근 ${SPARK_WEEKS}주`}>
            {spark.map(({ w, c, max }) => {
              const tip = `${weekName(w, thisWeek)} · ${c}편`;
              return (
                <button
                  key={w}
                  type="button"
                  data-tip={tip}
                  aria-label={tip}
                  aria-current={w === ws || undefined}
                  onClick={() => go(w)}
                >
                  <i style={{ height: 3 + Math.round((c / max) * 19) }} />
                </button>
              );
            })}
          </div>
        )}
        {!isThis && (
          <button type="button" className="sn-ws-today" onClick={() => go(thisWeek)}>
            이번 주로
          </button>
        )}
        <span className="sn-ws-cnt">
          {weekNotes.length ? `${weekNotes.length}편` : '아직 없어요'}
        </span>
      </div>
      <div className="sn-ws-grid" ref={gridRef} data-dir={dir || undefined} key={ws}>
        {ws > oldest && (
          <button type="button" className="sn-ws-card sn-ws-peek" onClick={() => go(prevW)}>
            <ChevronLeft className="sn-icon" style={{ width: 18, height: 18 }} />
            <strong>지난주</strong>
            <small>
              {md(prevW)} 주 · {count(prevW)}편
            </small>
          </button>
        )}
        {days.map((ds) => {
          const dayNotes = weekNotes.filter((n) => n.date === ds);
          return [
            ...dayNotes.map((n) => {
              const r = mainRef(n);
              const ap = applyCount(n);
              const grp = isGroupNote(n);
              return (
                <article
                  key={n.id}
                  className="sn-ws-card"
                  data-grp={grp || undefined}
                  data-hl={(isThis && highlight === n.id) || undefined}
                >
                  <button
                    type="button"
                    className="sn-ws-open"
                    onClick={() => onOpen(n.id)}
                    aria-label={`${n.title || UNTITLED} 노트 열기`}
                  />
                  {isGalpi(n, galpi) && <span className="sn-ws-rib" role="img" aria-label="갈피" />}
                  <div className="sn-ws-band" aria-hidden>
                    <b>
                      {r ? bookName(r) : '✦'}
                      {r && (
                        <small>
                          {r.c}
                          {chapterUnit(r)}
                        </small>
                      )}
                    </b>
                    <span>{dayLabel(n.date)}</span>
                  </div>
                  <div className="sn-ws-bd">
                    <span className="sn-ws-kind">
                      <i />
                      {n.service || '예배'}
                      {grp && ' · 모임'}
                    </span>
                    <span className="sn-ws-t">{n.title || UNTITLED}</span>
                    {(n.preacher || null) && <span className="sn-ws-who">{n.preacher}</span>}
                    <div className="sn-ws-meta">
                      <span>생각 {(n.thoughts || []).length}</span>
                      {ap ? (
                        isThis ? (
                          <button
                            type="button"
                            className="sn-ws-ap"
                            aria-pressed={highlight === n.id}
                            onClick={() => onHighlight(highlight === n.id ? null : n.id)}
                          >
                            적용 {ap}
                          </button>
                        ) : (
                          <span className="sn-ws-ap">적용 {ap}</span>
                        )
                      ) : null}
                      <NoteGroupFaces note={n} />
                    </div>
                  </div>
                </article>
              );
            }),
            <GroupDaySlots key={`g${ds}`} date={ds} notes={dayNotes} card />,
            <MyDaySlots key={`m${ds}`} date={ds} weekStart={ws} notes={dayNotes} card />,
          ];
        })}
        <button
          type="button"
          className="sn-ws-card sn-ws-new"
          onClick={() => (isThis ? onNew() : onNew(ws))}
        >
          <Plus className="sn-icon" style={{ width: 22, height: 22 }} />
          {isThis ? '예배 기록' : `${md(ws)} 주에 기록`}
        </button>
        {!isThis && (
          <button type="button" className="sn-ws-card sn-ws-peek" onClick={() => go(nextW)}>
            <ChevronRight className="sn-icon" style={{ width: 18, height: 18 }} />
            <strong>{nextW === thisWeek ? '이번 주' : '다음 주'}</strong>
            <small>
              {md(nextW)} 주 · {count(nextW)}편
            </small>
          </button>
        )}
      </div>
    </section>
  );
}
