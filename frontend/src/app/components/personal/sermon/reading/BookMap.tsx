import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { BOOKS, PSALMS } from '../bibleRefs';
import type { PlanDay, PlanDetail } from './readingApi';
import { chKey, parseCh } from './readingPlan';
import './bookMap.css';

/**
 * 「함께 걸은 길」 책 지도 — 날짜 대신 성경 책으로 그린다.
 * 묶음(모세오경…계시록)마다 한 줄, 책 칸 길이는 실제 장 수 비율, 색 진하기는 그 장이 든 날을 다 읽은 사람 비율.
 * 장마다 따로 세지 않는다(서버는 날 단위 done_count 만 준다). 책을 누르면 아래에 장 칸이 펼쳐진다.
 */
const SECTIONS: ReadonlyArray<readonly [string, number, number]> = [
  ['모세오경', 0, 4],
  ['역사서', 5, 16],
  ['시가서', 17, 21],
  ['대선지서', 22, 26],
  ['소선지서', 27, 38],
  ['복음서·행전', 39, 43],
  ['서신서', 44, 64],
  ['계시록', 65, 65],
];

const n = (b: number) => BOOKS[b][2];
const unit = (b: number) => (b === PSALMS ? '편' : '장');
const fill = (r: number) =>
  r <= 0
    ? 'var(--bm-track)'
    : r >= 1
      ? 'var(--sn-g1)'
      : `color-mix(in srgb, var(--sn-g1) ${Math.round(r * 100)}%, var(--bm-track))`;

interface Props {
  plan: PlanDetail;
  today: string;
  onRead: (chapter: string) => void;
}

export function BookMap({ plan, today, onRead }: Props) {
  const isGroup = !!plan.group_id;
  const members = Math.max(1, plan.member_count || 1);

  const m = useMemo(() => {
    const dayOf = new Map<string, PlanDay>();
    const order: string[] = [];
    const mine = new Set<string>();
    plan.days.forEach((d) => {
      d.chapters.forEach((k) => {
        if (!dayOf.has(k)) order.push(k);
        dayOf.set(k, d);
      });
      (d.my_chapters || []).forEach((k) => mine.add(k));
    });
    const todayDay = plan.days.find((d) => d.day_no === plan.today_day_no);
    const todayKeys = new Set(todayDay?.chapters || []);
    /** 지난 날·오늘의 장만 칠한다. 아직 안 온 장은 null */
    const ratio = (k: string): number | null => {
      const d = dayOf.get(k);
      if (!d || d.date > today) return null;
      return Math.min(1, d.done_count / members);
    };
    // 모임 길에서 내가 멈춘 곳 — 지난 날 중 내가 안 읽은 첫 장 (오늘이면 표시 안 함)
    let behind: string | null = null;
    if (isGroup) {
      for (const d of plan.days) {
        if (d.date >= today) break;
        const k = d.chapters.find((c) => !mine.has(c));
        if (k) {
          behind = k;
          break;
        }
      }
    }
    // 지금 걷는 곳 — 오늘 장, 쉬는 날이면 지난 마지막 날
    const here = todayDay ?? [...plan.days].reverse().find((d) => d.date <= today) ?? plan.days[0];
    const books = new Set(order.map((k) => parseCh(k)?.b ?? -1));
    // 길에 든 책만 묶음별로 — 신약 90일이면 신약 줄만, 마가복음 16일이면 한 칸이 꽉 찬다
    const sections = SECTIONS.map(([name, b1, b2]) => {
      const bs: number[] = [];
      for (let b = b1; b <= b2; b++) if (books.has(b)) bs.push(b);
      return { name, books: bs, len: bs.reduce((t, b) => t + n(b), 0) };
    }).filter((s) => s.books.length > 0);
    return { dayOf, order, mine, todayDay, todayKeys, ratio, behind, here, books, sections };
  }, [plan, today, members, isGroup]);

  const herePos = m.here ? parseCh(m.here.chapters[0]) : null;
  const [sel, setSel] = useState<number | null>(herePos?.b ?? null);
  const selBook = sel !== null && m.books.has(sel) ? sel : (herePos?.b ?? null);
  const maxRow = Math.max(1, ...m.sections.map((s) => s.len));

  // 다음 이정표 — 지금 묶음의 마지막 장까지 (다 왔으면 다음 묶음)
  const mile = useMemo(() => {
    if (!m.todayDay) return null;
    const last = m.todayDay.chapters[m.todayDay.chapters.length - 1];
    const lastAt = m.order.indexOf(last);
    const secOf = (k: string) => {
      const b = parseCh(k)?.b ?? 0;
      return SECTIONS.findIndex((s) => b >= s[1] && b <= s[2]);
    };
    for (let s = secOf(last); s < SECTIONS.length; s++) {
      let endAt = -1;
      m.order.forEach((k, i) => {
        if (secOf(k) === s) endAt = i;
      });
      if (endAt > lastAt) {
        const endDay = m.dayOf.get(m.order[endAt]);
        return {
          name: SECTIONS[s][0],
          chapters: endAt - lastAt,
          days: (endDay?.day_no ?? 0) - m.todayDay.day_no,
        };
      }
    }
    return null;
  }, [m]);

  // 칸이 이름보다 좁으면 이름을 숨긴다 (눌러서 아래에서 본다)
  const rowsRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    const fit = () =>
      el.querySelectorAll<HTMLElement>('.bm-seg').forEach((seg) => {
        seg.removeAttribute('data-hide');
        const lab = seg.querySelector<HTMLElement>('.bm-lab');
        if (lab && lab.scrollWidth > seg.clientWidth + 1) seg.setAttribute('data-hide', '');
      });
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [m, maxRow]);

  if (!m.order.length) return null;

  const firstTodayKey = m.todayDay?.chapters[0];

  const seg = (b: number) => {
    const total = n(b);
    const stops: Array<{ col: string; a: number; z: number }> = [];
    let full = true;
    for (let c = 1; c <= total; c++) {
      const r = m.ratio(chKey(b, c));
      if (r !== 1) full = false;
      const col = fill(r ?? 0);
      const a = ((c - 1) / total) * 100;
      const z = (c / total) * 100;
      const prev = stops[stops.length - 1];
      if (prev && prev.col === col) prev.z = z;
      else stops.push({ col, a, z });
    }
    const bg =
      stops.length === 1
        ? stops[0].col
        : `linear-gradient(90deg, ${stops.map((s) => `${s.col} ${s.a.toFixed(2)}% ${s.z.toFixed(2)}%`).join(', ')})`;
    const todayIn = [...m.todayKeys].map(parseCh).filter((p) => p?.b === b) as Array<{
      b: number;
      c: number;
    }>;
    const behindP = m.behind ? parseCh(m.behind) : null;
    return (
      <button
        key={b}
        type="button"
        className="bm-seg"
        data-full={full || undefined}
        aria-pressed={selBook === b}
        aria-label={`${BOOKS[b][0]} ${total}${unit(b)}`}
        style={{ width: `calc(${(total / maxRow) * 100}% - 2px)` }}
        onClick={() => setSel(b)}
      >
        <span className="bm-fill" style={{ background: bg }} />
        {todayIn.length > 0 && (
          <span
            className="bm-ring"
            style={{
              left: `calc(${((Math.min(...todayIn.map((p) => p.c)) - 1) / total) * 100}% - 3px)`,
              width: `calc(${(todayIn.length / total) * 100}% + 6px)`,
            }}
          >
            {firstTodayKey && parseCh(firstTodayKey)?.b === b && (
              <span className="bm-tag">오늘</span>
            )}
          </span>
        )}
        {behindP?.b === b && (
          <span className="bm-me" style={{ left: `${((behindP.c - 0.5) / total) * 100}%` }}>
            <i />
            <span>
              나 · {BOOKS[b][1]} {behindP.c}
            </span>
          </span>
        )}
        <span className="bm-lab">{BOOKS[b][1]}</span>
      </button>
    );
  };

  const detail = () => {
    if (selBook === null) return null;
    const b = selBook;
    const total = n(b);
    let full = 0;
    let part = 0;
    let go: string | null = null;
    let firstInPlan: string | null = null;
    const cells: JSX.Element[] = [];
    for (let c = 1; c <= total; c++) {
      const k = chKey(b, c);
      const r = m.ratio(k);
      const inPlan = m.dayOf.has(k);
      if (r !== null && r >= 1) full++;
      else if (r !== null && r > 0) part++;
      if (inPlan && !firstInPlan) firstInPlan = k;
      if (inPlan && !go && r !== null && !m.mine.has(k)) go = k;
      const d = m.dayOf.get(k);
      cells.push(
        <button
          key={c}
          type="button"
          className="bm-cell"
          data-out={!inPlan || undefined}
          data-future={(inPlan && r === null) || undefined}
          data-ink={(r !== null && r >= 0.6) || undefined}
          data-today={m.todayKeys.has(k) || undefined}
          data-mine={(isGroup && m.mine.has(k)) || undefined}
          style={r !== null ? { background: fill(r) } : undefined}
          title={`${BOOKS[b][0]} ${c}${unit(b)}${d ? ` · ${d.day_no}일째` : ''}${isGroup && r !== null && d ? ` · ${d.done_count}/${members}명` : ''}`}
          onClick={() => onRead(k)}
        >
          {c}
        </button>,
      );
    }
    const target = go ?? firstInPlan ?? chKey(b, 1);
    const tc = parseCh(target)?.c ?? 1;
    return (
      <div className="bm-book">
        <div className="bm-book-head">
          <div>
            <b>{BOOKS[b][0]}</b>
            <span>
              {isGroup
                ? `모두 읽은 ${unit(b)} ${full} · 일부 ${part} · 아직 ${total - full - part}`
                : `읽은 ${unit(b)} ${full} · 아직 ${total - full}`}
            </span>
          </div>
          <button type="button" className="bm-go" onClick={() => onRead(target)}>
            {BOOKS[b][1]} {tc}
            {unit(b)} 읽기
            <ChevronRight className="sn-icon" aria-hidden />
          </button>
        </div>
        <div className="bm-cells">{cells}</div>
        {full === total && (
          <p className="bm-hand">
            {isGroup ? '다 같이 끝까지 읽은 책이에요' : '끝까지 읽은 책이에요'}
          </p>
        )}
      </div>
    );
  };

  const hereLast = m.here?.chapters[m.here.chapters.length - 1];
  const posInPlan = hereLast ? m.order.indexOf(hereLast) + 1 : 0;

  return (
    <div className="bm">
      {herePos && (
        <div className="bm-now">
          <div className="bm-where">
            <small>지금 걷는 곳</small>
            <strong>
              {BOOKS[herePos.b][0]} {herePos.c}
              <span>
                {posInPlan.toLocaleString()} / {m.order.length.toLocaleString()}장
              </span>
            </strong>
          </div>
          {mile && (
            <div className="bm-mile">
              다음 이정표 <b>{mile.name} 끝</b>까지 {mile.chapters}장
              {mile.days > 0 ? ` · ${mile.days}일` : ''}
            </div>
          )}
        </div>
      )}
      <ol className="bm-rows" ref={rowsRef} aria-label="책마다 읽은 정도">
        {m.sections.map((s) => (
          <li
            key={s.name}
            className="bm-row"
            data-today={
              [...m.todayKeys].some((k) => s.books.includes(parseCh(k)?.b ?? -1)) || undefined
            }
          >
            <div className="bm-name">
              <b>{s.name}</b>
              <span>{s.len}장</span>
            </div>
            <div className="bm-bar">{s.books.map(seg)}</div>
          </li>
        ))}
      </ol>
      <div className="bm-legend">
        <div>
          <span>아무도 안 읽음</span>
          <i className="bm-ramp" />
          <span>{isGroup ? '모두 읽음' : '읽음'}</span>
        </div>
        <div>
          {m.todayDay && (
            <span className="bm-key">
              <i />
              오늘
            </span>
          )}
          {isGroup && (
            <span className="bm-key">
              <i data-k="me" />
              내가 멈춘 곳
            </span>
          )}
        </div>
      </div>
      {detail()}
    </div>
  );
}
