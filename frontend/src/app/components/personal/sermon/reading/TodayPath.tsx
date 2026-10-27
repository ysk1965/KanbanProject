import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { BOOKS } from '../bibleRefs';
import { todayString } from '../sermonTypes';
import type { MinePlan } from './readingApi';
import { planOwnerName, planToday, sortForToday, useMyPlans } from './readingStore';
import { chaptersLabel, parseCh } from './readingPlan';
import { PlanOverlay } from './ReadingPaths';
import { PlanSheet } from './PlanSheet';
import './todayPath.css';

/**
 * 성경 읽기 「오늘 읽을 곳」 — 내 길마다 오늘 읽을 장.
 * 넓은 화면(레일) = 카드(mode="rail"), 그 밖 = 본문 위 띠(mode="strip").
 * 카드 · 시트는 길마다 책 스티커 + 장 번호 도장, 다 읽은 날은 스티커가 모이고 「다 읽음」 도장.
 * 띠는 안 읽은 길 하나(좁은 화면) · 둘(중간 화면)만 보이고 나머지는 「외 N」, 누르면 바닥 시트에 카드와 같은 목록.
 * 좁은 화면에서 아래로 스크롤하면 띠가 위에 붙은 작은 알약(●○○)으로 접히고, 위로 올리면 다시 펼친다.
 */

/** 오늘 띠에 칩으로 보일 밀린 장 수 */
const LATE_CHIPS = 2;
const SOLO_MAX = 3;
/** 오늘 장이 이보다 많으면 점 대신 「1/7」 */
const DOTS_MAX = 6;

const short = (k: string) => {
  const p = parseCh(k);
  return p ? `${BOOKS[p.b][1]} ${p.c}` : k;
};

const mdLabel = (ds: string) => {
  const [, m, d] = ds.split('-').map(Number);
  return m && d ? `${m}월 ${d}일` : '';
};

interface Props {
  mode: 'rail' | 'strip';
  /** 지금 읽는 장 'b:c' */
  here: string;
  /** 좁은 화면 — 띠 하나 + 스크롤하면 접힘 */
  narrow?: boolean;
  onGo: (b: number, c: number) => void;
}

export function TodayPath({ mode, here, narrow = false, onGo }: Props) {
  const plans = useMyPlans();
  const [openId, setOpenId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [sheet, setSheet] = useState(false);

  const go = (k: string) => {
    const p = parseCh(k);
    if (!p) return;
    setSheet(false);
    onGo(p.b, p.c);
  };

  const overlays = (
    <>
      <SnOverlay
        open={sheet}
        onClose={() => setSheet(false)}
        className="sn-dialog sg-dialog rp-sheet"
        aria-label="오늘 읽을 곳"
      >
        <div className="rp-sheet-body">
          {plans && (
            <TodayList
              plans={plans}
              here={here}
              onRead={go}
              onOpen={(id) => {
                setSheet(false);
                setOpenId(id);
              }}
              onCreate={() => {
                setSheet(false);
                setCreate(true);
              }}
            />
          )}
        </div>
        <SnSheetBar onClose={() => setSheet(false)} />
      </SnOverlay>
      <PlanOverlay
        id={openId}
        onClose={() => setOpenId(null)}
        onRead={(k) => {
          setOpenId(null);
          go(k);
        }}
      />
      <PlanSheet
        open={create}
        onClose={() => setCreate(false)}
        onCreated={(p) => {
          setCreate(false);
          setOpenId(p.id);
        }}
      />
    </>
  );

  if (!plans) return null;

  if (mode === 'rail') {
    return (
      <section className="sn-brail-card tp-card" aria-label="오늘 읽을 곳">
        <TodayList
          plans={plans}
          here={here}
          onRead={go}
          onOpen={setOpenId}
          onCreate={() => setCreate(true)}
        />
        {overlays}
      </section>
    );
  }

  return (
    <TodayStrip
      plans={plans}
      here={here}
      narrow={narrow}
      onRead={go}
      onSheet={() => setSheet(true)}
      onCreate={() => setCreate(true)}
    >
      {overlays}
    </TodayStrip>
  );
}

/* ---------- 카드 · 시트 목록 ---------- */

function TodayList({
  plans,
  here,
  onRead,
  onOpen,
  onCreate,
}: {
  plans: MinePlan[];
  here: string;
  onRead: (k: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const today = todayString();
  const sorted = sortForToday(plans);
  const solo = plans.filter((p) => !p.group_id).length;
  const anyToday = plans.some((p) => planToday(p, today).chapters.length);
  const allDone = anyToday && plans.every((p) => planToday(p, today).left === 0);

  return (
    <div className="tp-list">
      <div className="tp-head">
        <b>오늘 읽을 곳</b>
        <small>{mdLabel(today)}</small>
      </div>
      {allDone ? (
        <DoneBoard plans={sorted} today={today} onOpen={onOpen} />
      ) : (
        sorted.map((p) => {
          const late = planToday(p, today).late.length;
          return (
            <div key={p.id} className="tp-plan">
              <button type="button" className="tp-plan-t" onClick={() => onOpen(p.id)}>
                <span>
                  <b data-group={!!p.group_id || undefined}>{planOwnerName(p)}</b> {p.title}
                </span>
                <small>
                  {late > 0 && <em className="tp-late">밀린 {late}장</em>}
                  {p.today_day_no ? `${p.today_day_no}일째` : `${p.my_done_days}/${p.total_days}일`}
                  <ChevronRight className="sn-icon" aria-hidden />
                </small>
              </button>
              <BookRows plan={p} here={here} today={today} onRead={onRead} />
            </div>
          );
        })
      )}
      {solo < SOLO_MAX && (
        <button type="button" className="tp-add" onClick={onCreate}>
          <Plus className="sn-icon" aria-hidden />
          {plans.length ? '나의 길 만들기' : '혼자 통독 시작'}
        </button>
      )}
    </div>
  );
}

/** 책 스티커 색 — 이웃한 책끼리 겹치지 않게 잉크 셋을 돌려쓴다 */
const tone = (b: number) => b % 3;

type Stamp = { k: string; c: number; st: 'late' | 'done' | 'todo' };

/** 길 하나 — 책마다 둥근 스티커 + 장 번호 도장 (밀린 장 주황 · 읽음 채움 · 남음 점선 · 지금 장 테두리) */
function BookRows({
  plan,
  here,
  today,
  onRead,
}: {
  plan: MinePlan;
  here: string;
  today: string;
  onRead: (k: string) => void;
}) {
  const t = planToday(plan, today);
  const seen = new Set<string>();
  const rows: Array<{ b: number; stamps: Stamp[] }> = [];
  const push = (k: string, st: Stamp['st']) => {
    const p = parseCh(k);
    if (!p || seen.has(k)) return;
    seen.add(k);
    const last = rows[rows.length - 1];
    const s = { k, c: p.c, st };
    if (last && last.b === p.b) last.stamps.push(s);
    else rows.push({ b: p.b, stamps: [s] });
  };
  t.late.forEach((d) => push(d.chapter, 'late'));
  t.chapters.forEach((c) => push(c.chapter, c.done ? 'done' : 'todo'));

  if (!rows.length) {
    return (
      <p className="tp-rest">
        {plan.start_date > today ? `${mdLabel(plan.start_date)} 시작` : '오늘은 읽을 곳이 없어요'}
      </p>
    );
  }
  return (
    <div className="tp-books">
      {rows.map((r, i) => (
        <div key={`${r.b}:${i}`} className="tp-book" data-tone={tone(r.b)}>
          <span className="tp-sticker" aria-hidden>
            {BOOKS[r.b][1]}
          </span>
          <div className="tp-book-body">
            <span className="tp-book-name">{BOOKS[r.b][0]}</span>
            <div className="tp-stamps">
              {r.stamps.map((s) => (
                <button
                  key={s.k}
                  type="button"
                  className="tp-stamp"
                  data-st={s.st}
                  aria-current={s.k === here || undefined}
                  aria-label={`${BOOKS[r.b][0]} ${s.c}${s.st === 'done' ? ' 읽음' : s.st === 'late' ? ' 밀림' : ''}`}
                  onClick={() => onRead(s.k)}
                >
                  {s.c}
                  {s.st === 'done' && (
                    <i className="tp-stamp-ok" aria-hidden>
                      <Check className="sn-icon" />
                    </i>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 오늘 분량을 다 읽은 날 — 읽은 책 스티커가 겹쳐 모이고 「다 읽음」 도장, 아래 길마다 한 줄 */
function DoneBoard({
  plans,
  today,
  onOpen,
}: {
  plans: MinePlan[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const books: number[] = [];
  let total = 0;
  plans.forEach((p) =>
    planToday(p, today).chapters.forEach((c) => {
      total += 1;
      const b = parseCh(c.chapter)?.b;
      if (b != null && !books.includes(b)) books.push(b);
    }),
  );
  return (
    <>
      <div className="tp-done">
        <span className="tp-done-stack" aria-hidden>
          {books.slice(0, 4).map((b, i) => (
            <span key={b} className="tp-sticker" data-tone={tone(b)} style={{ zIndex: 4 - i }}>
              {BOOKS[b][1]}
            </span>
          ))}
        </span>
        <span className="tp-done-msg">오늘 {total}장, 다 붙였어요</span>
        <span className="tp-done-seal" aria-hidden>
          다 읽음
        </span>
      </div>
      {plans.map((p) => {
        const ch = planToday(p, today).chapters;
        return (
          <button key={p.id} type="button" className="tp-done-row" onClick={() => onOpen(p.id)}>
            <b data-group={!!p.group_id || undefined}>{planOwnerName(p)}</b>
            <span>{ch.length ? chaptersLabel(ch.map((c) => c.chapter)) : '오늘은 쉬는 날'}</span>
            {ch.length > 0 && (
              <small>
                {ch.length} / {ch.length}
              </small>
            )}
          </button>
        );
      })}
    </>
  );
}

/** 길 하나의 장 칩 — 밀린 장(주황) · 오늘 장(다 읽음 ✓ / 지금 장 채움 / 남음) */
function Chips({
  plan,
  here,
  today,
  onRead,
  lateMax,
}: {
  plan: MinePlan;
  here: string;
  today: string;
  onRead: (k: string) => void;
  lateMax: number;
}) {
  const t = planToday(plan, today);
  const lateShown = t.late.slice(0, lateMax);
  const lateMore = t.late.length - lateShown.length;
  if (!t.late.length && !t.chapters.length) {
    return (
      <p className="tp-rest">
        {plan.start_date > today ? `${mdLabel(plan.start_date)} 시작` : '오늘은 읽을 곳이 없어요'}
      </p>
    );
  }
  return (
    <div className="tp-chips">
      {lateShown.map((d) => (
        <button
          key={`l${d.day_no}:${d.chapter}`}
          type="button"
          className="tp-chip"
          data-late
          aria-current={d.chapter === here || undefined}
          onClick={() => onRead(d.chapter)}
        >
          {short(d.chapter)}
        </button>
      ))}
      {lateMore > 0 && (
        <span className="tp-chip" data-late data-more>
          +{lateMore}
        </span>
      )}
      {t.chapters.map((c) => (
        <button
          key={`t${c.chapter}`}
          type="button"
          className="tp-chip"
          data-done={c.done || undefined}
          aria-current={c.chapter === here || undefined}
          aria-label={c.done ? `${short(c.chapter)} 읽음` : undefined}
          onClick={() => onRead(c.chapter)}
        >
          {c.done && <Check className="sn-icon" aria-hidden />}
          {short(c.chapter)}
        </button>
      ))}
    </div>
  );
}

/* ---------- 본문 위 띠 ---------- */

function TodayStrip({
  plans,
  here,
  narrow,
  onRead,
  onSheet,
  onCreate,
  children,
}: {
  plans: MinePlan[];
  here: string;
  narrow: boolean;
  onRead: (k: string) => void;
  onSheet: () => void;
  onCreate: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tucked, setTucked] = useState(false);

  // 좁은 화면 — 아래로 스크롤하면 접고, 위로 올리면 펼친다 (어느 요소가 스크롤하든 잡는다)
  useEffect(() => {
    setTucked(false);
    if (!narrow) return;
    const last = new WeakMap<object, number>();
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : (e.target as Element | null);
      const me = ref.current;
      if (!el || !me || !el.contains(me)) return;
      const y = el.scrollTop;
      const prev = last.get(el) ?? y;
      last.set(el, y);
      if (y < 48) setTucked(false);
      else if (y - prev > 6) setTucked(true);
      else if (prev - y > 6) setTucked(false);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [narrow]);

  // 장을 옮기면 펼친 채로
  useEffect(() => setTucked(false), [here]);

  const today = todayString();
  const sorted = sortForToday(plans);
  const open = sorted.filter((p) => planToday(p, today).left > 0);

  if (!plans.length) {
    return (
      <div className="tp-strip-row">
        <button type="button" className="tp-start" onClick={onCreate}>
          <Plus className="sn-icon" aria-hidden />
          혼자 통독 시작
        </button>
        {children}
      </div>
    );
  }

  // 안 읽은 길이 없다 — 오늘 장이 있던 날이면 다 읽은 띠, 아니면(쉬는 날) 띠 없음
  if (!open.length) {
    const hadToday = plans.some((p) => planToday(p, today).chapters.length);
    if (!hadToday) return <>{children}</>;
    const first = sorted[0];
    return (
      <div className="tp-strip-row">
        <button type="button" className="tp-strip" data-done onClick={onSheet}>
          <Check className="sn-icon" aria-hidden />
          <span className="tp-strip-msg">오늘 읽을 곳을 다 읽었어요</span>
          <span className="tp-strip-more">
            {planOwnerName(first)}
            {first.today_day_no ? ` ${first.today_day_no}일째` : ''}
            <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        {children}
      </div>
    );
  }

  const shown = open.slice(0, narrow ? 1 : 2);
  const rest = open.length - shown.length;
  const main = shown[0];
  const mt = planToday(main, today);
  const nextK =
    mt.late[0]?.chapter || mt.chapters.find((c) => !c.done)?.chapter || main.due?.[0]?.chapter;

  return (
    <div
      ref={ref}
      className="tp-strip-row"
      data-narrow={narrow || undefined}
      data-tucked={tucked || undefined}
    >
      {shown.map((p, i) => {
        const t = planToday(p, today);
        const late = t.late.length;
        return (
          <div key={p.id} className="tp-strip" data-late={late > 0 || undefined}>
            <span className="tp-rib" aria-hidden />
            <button type="button" className="tp-strip-name" onClick={onSheet}>
              <b data-group={!!p.group_id || undefined}>{planOwnerName(p)}</b>
              {!narrow && <span className="tp-strip-title">{p.title}</span>}
              <span className="tp-strip-msg">{late ? `밀린 ${late}장` : '오늘'}</span>
            </button>
            <Chips plan={p} here={here} today={today} onRead={onRead} lateMax={LATE_CHIPS} />
            {i === shown.length - 1 && (
              <button
                type="button"
                className="tp-strip-more"
                onClick={onSheet}
                aria-label={rest ? `다른 길 ${rest}개 더 보기` : '오늘 읽을 곳 모두 보기'}
              >
                {rest > 0 && <em>외 {rest}</em>}
                <ChevronRight className="sn-icon" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
      {narrow && (
        <button
          type="button"
          className="tp-pill"
          onClick={onSheet}
          aria-label="오늘 읽을 곳 보기"
          tabIndex={tucked ? 0 : -1}
        >
          <span className="tp-rib" aria-hidden />
          {nextK && <b>{short(nextK)}</b>}
          {mt.chapters.length > 0 && mt.chapters.length <= DOTS_MAX ? (
            <span
              className="tp-dots"
              aria-label={`오늘 ${mt.chapters.filter((c) => c.done).length}/${mt.chapters.length}`}
            >
              {mt.chapters.map((c) => (
                <i
                  key={c.chapter}
                  data-done={c.done || undefined}
                  data-here={c.chapter === here || undefined}
                />
              ))}
            </span>
          ) : (
            <small>
              {mt.late.length
                ? `밀린 ${mt.late.length}장`
                : `${mt.chapters.filter((c) => c.done).length}/${mt.chapters.length}`}
            </small>
          )}
        </button>
      )}
      {children}
    </div>
  );
}
