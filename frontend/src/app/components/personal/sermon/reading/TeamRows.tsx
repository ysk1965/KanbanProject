import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { faceColor, initial } from '../group/groupStore';
import type { PlanDay, PlanDetail, PlanMember } from './readingApi';
import { chaptersLabel, dowOf, md } from './readingPlan';

/**
 * 모임 길의 「함께 걸은 길」 — 사람마다 한 줄, 최근 14일.
 * 안 읽은 칸은 빨간색 없이 빈칸(「아직」), 늦게 따라 읽은 날은 테두리 도장. 순위는 만들지 않는다.
 */
const SPAN = 14;
const STEP = 7;
const FOLD = 8;
const DOW = '일월화수목금토';

/** 오늘(없으면 지난 마지막 날)이 오른쪽 끝에 오는 창의 끝 day_no */
function anchorEnd(plan: PlanDetail, today: string): number {
  const last =
    plan.today_day_no ?? [...plan.days].reverse().find((d) => d.date <= today)?.day_no ?? 1;
  return Math.min(plan.days.length, Math.max(SPAN, last));
}

export function TeamRows({ plan, today }: { plan: PlanDetail; today: string }) {
  const members = plan.members || [];
  const [end, setEnd] = useState(() => anchorEnd(plan, today));
  const [showAll, setShowAll] = useState(false);

  const total = plan.days.length;
  const endNo = Math.min(total, Math.max(Math.min(SPAN, total), end));
  const cols = plan.days.slice(Math.max(0, endNo - SPAN), endNo);
  const pastCols = cols.filter((d) => d.date <= today);

  // 나를 맨 위, 나머지는 가입순
  const order = members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(!!b.m.me) - Number(!!a.m.me));
  const shown = showAll ? order : order.slice(0, FOLD);

  const cell = (d: PlanDay, i: number, m: PlanMember) => {
    const label = `${m.display_name} · ${md(d.date)} ${chaptersLabel(d.chapters)}`;
    if (d.date > today) return <i key={d.day_no} className="rp-tc" data-fut title={label} />;
    if (!d.readers?.includes(i))
      return <i key={d.day_no} className="rp-tc" title={`${label} · 아직`} />;
    const late = !!d.late?.includes(i);
    return (
      <i
        key={d.day_no}
        className="rp-tc"
        data-r={late ? 'late' : m.me ? 'me' : 'on'}
        title={`${label} · ${late ? '나중에 따라 읽음' : '읽음'}`}
      />
    );
  };

  return (
    <>
      <div className="rp-team-nav">
        <button
          type="button"
          aria-label="이전 7일"
          disabled={endNo <= Math.min(SPAN, total)}
          onClick={() => setEnd(Math.max(SPAN, endNo - STEP))}
        >
          <ChevronLeft className="sn-icon" aria-hidden />
        </button>
        <span>{cols.length > 0 && `${md(cols[0].date)} – ${md(cols[cols.length - 1].date)}`}</span>
        <button
          type="button"
          aria-label="다음 7일"
          disabled={endNo >= total}
          onClick={() => setEnd(Math.min(total, endNo + STEP))}
        >
          <ChevronRight className="sn-icon" aria-hidden />
        </button>
      </div>
      <div className="rp-team-scroll">
        <div
          className="rp-team"
          role="group"
          aria-label="사람마다 날마다 읽은 기록"
          style={{
            gridTemplateColumns: `minmax(92px, auto) repeat(${cols.length}, minmax(22px, 1fr)) auto`,
          }}
        >
          <span className="rp-tw" aria-hidden />
          {cols.map((d) => (
            <span
              key={d.day_no}
              className="rp-th"
              data-now={d.day_no === plan.today_day_no || undefined}
            >
              {d.day_no === plan.today_day_no ? '오늘' : DOW[dowOf(d.date)]}
              <small>{md(d.date)}</small>
            </span>
          ))}
          <span className="rp-th" aria-hidden />
          {shown.map(({ m, i }) => {
            const n = pastCols.filter((d) => d.readers?.includes(i)).length;
            return (
              <div key={m.user_id} className="rp-trow" data-me={m.me || undefined}>
                <span className="rp-tw">
                  <i className="rp-face" style={{ background: faceColor(m.user_id) }} aria-hidden>
                    {initial(m.display_name)}
                  </i>
                  <b>{m.display_name}</b>
                  {m.me && <small>나</small>}
                </span>
                {cols.map((d) => cell(d, i, m))}
                <span className="rp-tn">{pastCols.length ? `${n}/${pastCols.length}일` : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      {order.length > FOLD && (
        <button
          type="button"
          className="rp-link rp-team-more"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '접기' : `${order.length - FOLD}명 더 보기`}
        </button>
      )}
      <div className="rp-legend">
        <span>
          <i data-k="mine" />내 도장
        </span>
        <span>
          <i data-k="full" />
          그날 읽음
        </span>
        <span>
          <i data-k="late" />
          나중에 따라 읽음
        </span>
        <span>
          <i data-k="yet" />
          아직
        </span>
      </div>
    </>
  );
}
