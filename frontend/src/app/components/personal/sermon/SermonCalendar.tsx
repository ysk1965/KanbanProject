import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Mic, Plus } from 'lucide-react';
import { audioDuration, todayString, weekOf, type SermonNote } from './sermonTypes';
import { useGalpiPrefs, useGalpiStickers } from './galpiPrefs';
import { applyCount } from './homeFmt';
import { bookChapter, displayTitle, serviceKeyOf, serviceKeys, stickerLabel } from './noteTidy';
import { Mascot } from './Mascot';
import { noteNav } from './noteNav';
import type { MascotId } from './sermonLook';
import './calendar.css';

/**
 * 설교 노트 「달력」 — 전체 노트 + 예배별 목록을 대신한다.
 * 한 줄 = 한 주(일~토), 들은 설교는 그날 칸에 둥근 스티커(「롬 5」 / ✦), 색 = 예배(내 예배표 순서),
 * 그 주 갈피는 분홍 리본 + 줄 위 테이프. 날짜를 누르면 오른쪽(폰은 아래) 하루 시트.
 * 달력을 좌우로 밀면 지난달·다음달.
 * 설치 앱 좁은 화면(shelfHost 가 있음): 거르기 칩은 보기 줄 위 선반으로, 새 기록은 줄의 ＋ 가 맡는다.
 */
interface Props {
  notes: SermonNote[];
  mascot: MascotId;
  onOpen: (id: string) => void;
  onNew: (date?: string) => void;
  /** 고른 날짜가 바뀔 때 — 보기 줄 ＋ 가 그 날짜로 새 기록을 만든다 */
  onSel?: (date: string) => void;
  /** 보기 줄 위 선반 자리. undefined = 선반 없음(칩은 본문 위) */
  shelfHost?: HTMLElement | null;
}

/** 이만큼 넘게 옆으로 밀면 달을 넘긴다(px) */
const SWIPE_MIN = 48;

const DOW = '일월화수목금토';
const MAX_IN_CELL = 3;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

export function SermonCalendar({ notes, mascot, onOpen, onNew, onSel, shelfHost }: Props) {
  const today = todayString();
  // 노트를 열었다 돌아오면 보던 달·고른 날 그대로
  const [month, setMonth] = useState(() => noteNav.cal?.month ?? today.slice(0, 7));
  const [sel, setSel] = useState(() => noteNav.cal?.sel ?? today);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [onlyAudio, setOnlyAudio] = useState(false);
  const [onlyThought, setOnlyThought] = useState(false);
  /** 넘긴 방향 — 새 달이 그쪽에서 밀려 들어온다 */
  const [slide, setSlide] = useState<-1 | 0 | 1>(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const docked = shelfHost !== undefined;

  useEffect(() => {
    onSel?.(sel);
    noteNav.cal = { month, sel };
  }, [sel, month, onSel]);

  const worship = useGalpiPrefs().worship;
  const galpi = useGalpiStickers(notes);
  const galpiIds = useMemo(() => new Set([...galpi.values()].map((n) => n.id)), [galpi]);
  const keys = useMemo(() => serviceKeys(notes, worship), [notes, worship]);
  const colorOf = useMemo(() => {
    const m = new Map(keys.map((k) => [k.key, k.color]));
    return (n: SermonNote) => m.get(serviceKeyOf(n, worship)) || 'var(--sn-surface-2)';
  }, [keys, worship]);

  const visible = useMemo(
    () =>
      notes.filter(
        (n) =>
          !hidden.has(serviceKeyOf(n, worship)) &&
          (!onlyAudio || audioDuration(n) > 0) &&
          (!onlyThought || (n.thoughts || []).length > 0),
      ),
    [notes, hidden, worship, onlyAudio, onlyThought],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, SermonNote[]>();
    visible.forEach((n) => {
      if (!n.date) return;
      m.set(n.date, [...(m.get(n.date) || []), n]);
    });
    // 갈피가 먼저, 그다음 기록 순서
    m.forEach((list) =>
      list.sort((a, b) => +galpiIds.has(b.id) - +galpiIds.has(a.id) || a.created_at - b.created_at),
    );
    return m;
  }, [visible, galpiIds]);

  const first = parse(`${month}-01`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks: string[][] = [];
  for (const d = new Date(start); d <= last || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push(ymd(d));
  }

  const inMonth = notes.filter((n) => n.date?.startsWith(month));
  const stat = {
    notes: inMonth.length,
    galpi: inMonth.filter((n) => galpiIds.has(n.id)).length,
    thoughts: inMonth.reduce((a, n) => a + (n.thoughts || []).length, 0),
  };

  const move = (dir: -1 | 1) => {
    const d = new Date(first.getFullYear(), first.getMonth() + dir, 1);
    const next = ymd(d).slice(0, 7);
    setSlide(dir);
    setMonth(next);
    // 넘긴 달에 오늘이 있으면 오늘, 아니면 1일을 고른다
    setSel(today.startsWith(next) ? today : `${next}-01`);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = touch.current;
    touch.current = null;
    if (!s0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s0.x;
    const dy = t.clientY - s0.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  };
  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const selNotes = byDay.get(sel) || [];
  const selDate = parse(sel);
  const [y, m] = month.split('-').map(Number);

  const filters = (
    <div className="sn-cal-filters" aria-label="거르기">
      {keys.length > 1 &&
        keys.map((k) => (
          <button
            key={k.key}
            type="button"
            aria-pressed={!hidden.has(k.key)}
            onClick={() => toggle(k.key)}
          >
            <i style={{ background: k.color }} aria-hidden />
            {k.label}
            <span className="sn-count">{k.count}</span>
          </button>
        ))}
      <button
        type="button"
        className="sn-cal-f2"
        aria-pressed={onlyAudio}
        onClick={() => setOnlyAudio((v) => !v)}
      >
        <Mic aria-hidden />
        녹음 있음
      </button>
      <button
        type="button"
        className="sn-cal-f2"
        aria-pressed={onlyThought}
        onClick={() => setOnlyThought((v) => !v)}
      >
        생각 있음
      </button>
    </div>
  );

  return (
    <div className="sn-cal">
      <div className="sn-cal-head">
        <div className="sn-cal-month" aria-live="polite">
          <b>{m}</b>
          <span>
            {y}년 {m}월
          </span>
        </div>
        <div className="sn-cal-nav">
          <button type="button" aria-label="이전 달" onClick={() => move(-1)}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" aria-label="다음 달" onClick={() => move(1)}>
            <ChevronRight aria-hidden />
          </button>
          {month !== today.slice(0, 7) && (
            <button
              type="button"
              className="sn-cal-today"
              onClick={() => {
                setSlide(month < today.slice(0, 7) ? 1 : -1);
                setMonth(today.slice(0, 7));
                setSel(today);
              }}
            >
              오늘
            </button>
          )}
        </div>
        <div className="sn-cal-stat">
          <span>
            <b>{stat.notes}</b>
            <span data-long>들은 설교</span>
            <span data-short>편</span>
          </span>
          <span>
            <b>{stat.galpi}</b>갈피
          </span>
          <span>
            <b>{stat.thoughts}</b>생각
          </span>
        </div>
      </div>

      {notes.length > 0 && (shelfHost ? createPortal(filters, shelfHost) : !docked && filters)}

      <div className="sn-cal-body">
        <div
          key={month}
          className="sn-cal-grid"
          role="grid"
          aria-label={`${y}년 ${m}월 달력`}
          data-slide={slide || undefined}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => (touch.current = null)}
        >
          <div className="sn-cal-dow" role="row">
            {[...DOW].map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((wk) => {
            const g = galpi.get(weekOf(wk[0]));
            const showTape = g && visible.includes(g);
            return (
              <div key={wk[0]} className="sn-cal-week" role="row">
                {showTape && (
                  <button type="button" className="sn-cal-tape" onClick={() => onOpen(g.id)}>
                    {[bookChapter(g), displayTitle(g).text].filter(Boolean).join(' · ')}
                  </button>
                )}
                {wk.map((d, i) => {
                  const list = byDay.get(d) || [];
                  const day = +d.slice(8);
                  return (
                    <button
                      key={d}
                      type="button"
                      role="gridcell"
                      className="sn-cal-day"
                      data-sun={i === 0 || undefined}
                      data-out={!d.startsWith(month) || undefined}
                      data-today={d === today || undefined}
                      aria-selected={d === sel}
                      aria-label={`${+d.slice(5, 7)}월 ${day}일 ${DOW[i]}요일, 설교 ${list.length}편`}
                      onClick={() => setSel(d)}
                      onDoubleClick={() => onNew(d)}
                    >
                      <span className="sn-cal-dn">
                        <span>{day}</span>
                      </span>
                      <span className="sn-cal-stks">
                        {list.slice(0, MAX_IN_CELL).map((n) => {
                          const t = displayTitle(n);
                          const gal = galpiIds.has(n.id);
                          return (
                            <span key={n.id} className="sn-cal-stk" data-galpi={gal || undefined}>
                              <span className="sn-cal-s" style={{ background: colorOf(n) }}>
                                {stickerLabel(n)}
                              </span>
                              {gal && <span className="sn-cal-rib" aria-label="갈피" />}
                              <span className="sn-cal-nm" data-auto={t.auto || undefined}>
                                {t.text}
                              </span>
                            </span>
                          );
                        })}
                        {list.length > MAX_IN_CELL && (
                          <span className="sn-cal-more">+{list.length - MAX_IN_CELL}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <aside className="sn-cal-sheet" aria-live="polite" aria-label="고른 날">
          <h3>
            {selDate.getMonth() + 1}.{selDate.getDate()}
            <small>
              {DOW[selDate.getDay()]}요일{selDate.getDay() === 0 ? ' · 주일' : ''}
              {selNotes.length ? ` · ${selNotes.length}편` : ''}
            </small>
          </h3>
          {!selNotes.length && (
            <div className="sn-cal-empty">
              <Mascot kind={mascot} size={56} state="think" />
              이날은 기록이 없어요
            </div>
          )}
          {selNotes.map((n) => {
            const t = displayTitle(n);
            const ap = applyCount(n);
            const qu = (n.thoughts || []).filter((x) => x.tag === '질문').length;
            const sec = audioDuration(n);
            return (
              <button key={n.id} type="button" className="sn-cal-card" onClick={() => onOpen(n.id)}>
                <span className="sn-cal-cs" style={{ background: colorOf(n) }}>
                  {stickerLabel(n)}
                </span>
                <span className="sn-cal-ci">
                  <b data-auto={t.auto || undefined}>{t.text}</b>
                  <span className="sn-cal-cm">
                    {[n.service, n.preacher].filter(Boolean).join(' · ')}
                  </span>
                  {(galpiIds.has(n.id) || ap > 0 || qu > 0 || sec > 0 || t.auto) && (
                    <span className="sn-cal-pills">
                      {galpiIds.has(n.id) && <span data-k="galpi">갈피</span>}
                      {ap > 0 && <span data-k="ap">적용 {ap}</span>}
                      {qu > 0 && <span data-k="qu">질문 {qu}</span>}
                      {sec > 0 && <span>녹음 {Math.max(1, Math.round(sec / 60))}분</span>}
                      {t.auto && <span data-k="auto">자동 이름</span>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {!docked && (
            <button type="button" className="sn-cal-new" onClick={() => onNew(sel)}>
              <Plus aria-hidden />이 날짜로 새 기록
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
