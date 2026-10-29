import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { UNTITLED, fmtDate, type ApplyItem, type SermonNote } from '../sermonTypes';
import { Coin } from './ChallengeBits';
import { dueLabel, unlockLabel } from './challengeUtil';
import './lifeGalpi.css';

/**
 * 「이번 주 갈피 퀘스트」 — 말씀을 삶까지 세 걸음 + 완주.
 *   1 말씀에 꽂기(노트 +20) → 2 적용 하나 남기기(+3) → 3 삶에 꽂기(실천 +10) → 완주(+20)
 * 보상 숫자는 서버 적립 규칙 그대로(docs/Tech/sermon-challenge-api.md) — 화면은 진행을 보여 주기만 한다.
 * 모양은 「갈피 도장 줄」: 세 걸음을 도장 세 칸으로(좁은 화면은 세로), 다 한 칸은 날짜만 남긴다.
 * 다 한 일에 취소선은 긋지 않는다(지운 일처럼 읽힘). 적용 문장은 아래 인용에 한 번만.
 * 기획: https://claude.ai/artifact/Ht686snaDMJXmE83EVSBue · 다듬기: https://claude.ai/artifact/B3CyVN25hBS11oJXJ7Jbhd (A)
 */

export interface LifeGalpiApply {
  /** 최근 7일 설교의 적용 */
  week: ApplyItem[];
  /** 지난 설교에서 아직 안 한 적용 */
  older: ApplyItem[];
}

/** 걸음별 달란트 (서버 TalentAccrualService 와 같은 값) */
const RW = { note: 20, apply: 3, done: 10, complete: 20 } as const;
const TOTAL = RW.note + RW.apply + RW.done + RW.complete;
/** 적용 실천은 남긴 지 12시간이 지나야 서버가 인정한다 (SermonNoteFacts.APPLY_DONE_MIN_MS) */
const DONE_MIN_MS = 12 * 3600_000;
const APPLY_TEXT_MIN = 10;
const MAX_DONE = 5;
const MAX_NOTES = 3;
const STREAKS = [4, 12, 52] as const;
const STREAK_BONUS: Record<number, number> = { 4: 50, 12: 150, 52: 500 };

type StepState = 'done' | 'now' | 'next';

function src(n: SermonNote): string {
  return `${fmtDate(n.date)} · ${n.title || UNTITLED}`;
}

/** ms → 「10.30 (금)」 */
function dayOf(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
}

function memo(x: ApplyItem): string {
  return x.t.text || '(사진·영상 메모)';
}

export function LifeGalpiCard({
  weekNote,
  doneNote,
  doneApply,
  weekHasApply,
  weekNoteCount,
  weekDoneCount,
  streakWeeks,
  anonymous,
  apply,
  onToggleApply,
  onOpenNote,
  onNew,
}: {
  /** 이번 주에 쓴 가장 최근 노트 (없으면 null) */
  weekNote: SermonNote | null;
  doneNote: boolean;
  doneApply: boolean;
  /** 이번 주 노트에 적용(10자 이상)이 하나라도 있는지 */
  weekHasApply: boolean;
  /** 이번 주 노트 수 · 이번 주에 실천한 적용 수 (보너스 퀘스트 진행) */
  weekNoteCount: number;
  weekDoneCount: number;
  /** 연속 기록 주 (지갑이 없으면 undefined) */
  streakWeeks?: number;
  anonymous: boolean;
  apply: LifeGalpiApply;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  onOpenNote: (noteId: string, aid?: string | null) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [just, setJust] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const weekLeft = apply.week.filter((x) => !x.t.done);
  const weekDone = apply.week.filter((x) => x.t.done);
  // 삶에 꽂을 적용 — 이번 주 것 먼저, 없으면 지난 설교에서 남은 것
  const target = weekLeft[0] ?? apply.older[0] ?? null;
  const doneItem = weekDone[0] ?? null;
  // 2걸음 칸에 날짜를 보일 적용 — 이번 주 노트에 남긴 것
  const leftItem = apply.week[0] ?? null;
  const listCount = apply.week.length + apply.older.length;

  // 잠긴 적용이 있으면 풀리는 시각에 다시 그린다
  const unlockAt = target && !anonymous ? (target.t.at || 0) + DONE_MIN_MS : 0;
  const locked = unlockAt > now;
  useEffect(() => {
    if (!locked) return;
    const id = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(unlockAt - now + 500, 3600_000),
    );
    return () => window.clearTimeout(id);
  }, [locked, unlockAt, now]);

  const s1 = doneNote;
  const s2 = weekHasApply || doneApply;
  const s3 = doneApply;
  const both = s1 && s3;
  const flags = [s1, s2, s3];
  const cur = flags.findIndex((f) => !f);
  const st = (i: number): StepState => (flags[i] ? 'done' : i === cur ? 'now' : 'next');
  const steps = flags.filter(Boolean).length;
  const earned =
    (s1 ? RW.note : 0) + (s2 ? RW.apply : 0) + (s3 ? RW.done : 0) + (both ? RW.complete : 0);

  const live = (x: ApplyItem) => {
    if (!x.t.done && !doneApply) setJust(true);
    onToggleApply(x.n.id, x.t.id);
  };
  const lockedItem = (x: ApplyItem) => !anonymous && !x.t.done && (x.t.at || 0) + DONE_MIN_MS > now;

  // ── 각 칸의 한 줄 설명 + (지금 걸음이면) 버튼 ──
  const step1: ReactNode = s1 ? (
    weekNote ? (
      <button type="button" className="sn-lgq-src" onClick={() => onOpenNote(weekNote.id)}>
        {src(weekNote)}
      </button>
    ) : (
      <span className="sn-lgq-src">이번 주 설교를 기록했어요</span>
    )
  ) : weekNote ? (
    <>
      <span className="sn-lgq-src">본문 100자, 생각 2개, 녹음 10분 중 하나를 채우면 꽂혀요</span>
      <span className="sn-lgq-act">
        <button
          type="button"
          className="sn-btn sn-primary sn-lgq-btn"
          onClick={() => onOpenNote(weekNote.id)}
        >
          노트 이어 쓰기
        </button>
      </span>
    </>
  ) : (
    <>
      <span className="sn-lgq-src">이번 주 설교 노트 1편</span>
      <span className="sn-lgq-act">
        <button type="button" className="sn-btn sn-primary sn-lgq-btn" onClick={onNew}>
          새 설교 기록
        </button>
      </span>
    </>
  );

  const step2: ReactNode = s2 ? (
    <span className="sn-lgq-src">
      {leftItem ? `${dayOf(leftItem.t.at) || fmtDate(leftItem.n.date)} 남김` : '적용을 남겼어요'}
    </span>
  ) : (
    <>
      <span className="sn-lgq-src">이번 주 노트에 「적용」을 {APPLY_TEXT_MIN}자 이상</span>
      {cur === 1 && (
        <span className="sn-lgq-act">
          <button
            type="button"
            className="sn-btn sn-primary sn-lgq-btn"
            onClick={() => (weekNote ? onOpenNote(weekNote.id) : onNew())}
          >
            노트에 적용 남기기
          </button>
        </span>
      )}
    </>
  );

  const step3: ReactNode = s3 ? (
    <span className="sn-lgq-src">
      {doneItem?.t.done_at ? `${dayOf(doneItem.t.done_at)} 살아 냄` : '이번 주 적용을 살아 냈어요'}
    </span>
  ) : cur === 2 && target ? (
    <>
      <span className="sn-lgq-src">
        {locked ? '남긴 지 12시간이 지나면 체크할 수 있어요' : '살아 냈으면 체크해요'}
      </span>
      <span className="sn-lgq-act">
        <button
          type="button"
          className="sn-btn sn-primary sn-lgq-btn"
          disabled={locked}
          onClick={() => live(target)}
        >
          {locked ? `살아 냈어요 · ${unlockLabel(unlockAt, now)}` : '살아 냈어요'}
        </button>
      </span>
    </>
  ) : (
    <span className="sn-lgq-src">남긴 적용을 살아 내고 체크해요</span>
  );

  const tiles: { key: string; title: string; rw: number; body: ReactNode }[] = [
    { key: 'word', title: '말씀에 꽂기', rw: RW.note, body: step1 },
    { key: 'apply', title: '적용 남기기', rw: RW.apply, body: step2 },
    { key: 'life', title: '삶에 꽂기', rw: RW.done, body: step3 },
  ];

  // 아래 인용 — 살아 낸 적용, 아니면 지금 살아 낼 적용 (적용 문장은 여기서 한 번만)
  const quote: { label: string; item: ApplyItem } | null =
    s3 && doneItem
      ? { label: '이번 주 살아 낸 적용', item: doneItem }
      : cur === 2 && target
        ? { label: '살아 낼 적용', item: target }
        : null;

  const nextStreak = STREAKS.find((n) => n > (streakWeeks ?? 0));

  return (
    <section
      className="sn-lg sn-lgq"
      aria-label="이번 주 갈피 퀘스트"
      data-both={both || undefined}
    >
      <div className="sn-lg-head">
        <h4>이번 주 갈피 퀘스트</h4>
        <span className="sn-lgq-due" data-done={both || undefined}>
          {both ? '완주' : dueLabel()}
        </span>
        <span className="sn-lgq-earn">
          {anonymous ? (
            '로그인하면 달란트로 쌓여요'
          ) : (
            <>
              <Coin size={16} />
              {earned} / {TOTAL}
            </>
          )}
        </span>
        {listCount > 0 && (
          <button
            type="button"
            className="sn-lg-more"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            적용 모두 보기
            <ChevronRight className="sn-icon" aria-hidden />
          </button>
        )}
      </div>

      {both ? (
        <div className="sn-lgq-banner">
          <span className="sn-lgq-seal" aria-hidden>
            완주
          </span>
          <span className="sn-lgq-banner-tx">
            <b>이번 주 갈피를 삶까지 꽂았어요</b>
            <small>완주 +{RW.complete}까지 받았어요. 다음 주 월요일에 새 퀘스트가 열려요.</small>
          </span>
          {!anonymous && <span className="sn-lgq-tot">+{earned}</span>}
        </div>
      ) : (
        <>
          <div
            className="sn-lgq-bar"
            role="progressbar"
            aria-label="퀘스트 진행"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={steps}
          >
            <i style={{ width: `${(steps / 3) * 100}%` }} />
          </div>
          <div className="sn-lgq-meta">
            <span>{steps} / 3 걸음</span>
            <span>세 걸음을 마치면 완주 +{RW.complete}</span>
          </div>
        </>
      )}

      <ol className="sn-lgq-stamps">
        {tiles.map((t, i) => (
          <li key={t.key} className="sn-lgq-tile" data-s={st(i)} data-k={t.key}>
            {flags[i] && <span className="sn-lgq-rib" aria-hidden />}
            <span className="sn-lgq-top">
              <span
                className="sn-lgq-ck"
                data-just={(i === 2 && s3 && just) || undefined}
                aria-label={flags[i] ? '완료' : `${i + 1}걸음`}
              >
                {flags[i] ? <Check aria-hidden /> : i + 1}
              </span>
              <b>{t.title}</b>
              <span className="sn-lgq-rw">
                <Coin size={14} />+{t.rw}
              </span>
            </span>
            <span className="sn-lgq-body">{t.body}</span>
          </li>
        ))}
      </ol>

      {quote && (
        <div className="sn-lgq-quote" data-done={s3 || undefined}>
          <small>{quote.label}</small>
          <span className="sn-lg-memo">{memo(quote.item)}</span>
        </div>
      )}

      {both && (
        <div className="sn-lgq-extras" aria-label="보너스 퀘스트">
          <span className="sn-lgq-extras-h">보너스 퀘스트</span>
          <div className="sn-lgq-bonus">
            <Bonus
              label="적용 더 살아 내기"
              rw={`+${RW.done}씩`}
              on={weekDoneCount}
              max={MAX_DONE}
              action={listCount > 0 ? { label: '적용 체크', go: () => setOpen(true) } : undefined}
            />
            <Bonus
              label="노트 더 쓰기"
              rw={`+${RW.note}씩`}
              on={weekNoteCount}
              max={MAX_NOTES}
              action={{ label: '새 기록', go: onNew }}
            />
            {!anonymous && streakWeeks != null && nextStreak && (
              <Bonus
                label={`${nextStreak}주 연속 기록`}
                rw={`+${STREAK_BONUS[nextStreak]}`}
                on={streakWeeks}
                max={nextStreak}
                note="다음 주에도"
              />
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="sn-lg-list">
          {apply.week.map((x) => (
            <ApplyLine
              key={`${x.n.id}|${x.t.id}`}
              x={x}
              locked={lockedItem(x)}
              onToggle={live}
              onOpen={onOpenNote}
            />
          ))}
          {apply.older.length > 0 && (
            <>
              <div className="sn-lg-list-h">지난 설교에서 아직 남은 적용</div>
              {apply.older.map((x) => (
                <ApplyLine
                  key={`${x.n.id}|${x.t.id}`}
                  x={x}
                  locked={lockedItem(x)}
                  onToggle={live}
                  onOpen={onOpenNote}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Bonus({
  label,
  rw,
  on,
  max,
  action,
  note,
}: {
  label: string;
  rw: string;
  on: number;
  max: number;
  action?: { label: string; go: () => void };
  note?: string;
}) {
  const n = Math.min(on, max);
  const full = n >= max;
  return (
    <div className="sn-lgq-bn" data-full={full || undefined}>
      <span className="sn-lgq-bn-h">
        <b>{label}</b>
        <span>{rw}</span>
      </span>
      <span
        className="sn-lgq-bn-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={n}
      >
        <i style={{ width: `${(n / max) * 100}%` }} />
      </span>
      <span className="sn-lgq-bn-f">
        <span>
          {n} / {max}
        </span>
        {full ? (
          <span className="sn-lgq-bn-full">다 채웠어요</span>
        ) : action ? (
          <button type="button" className="sn-lg-more" onClick={action.go}>
            {action.label}
            <ChevronRight className="sn-icon" aria-hidden />
          </button>
        ) : note ? (
          <span>{note}</span>
        ) : null}
      </span>
    </div>
  );
}

function ApplyLine({
  x,
  locked,
  onToggle,
  onOpen,
}: {
  x: ApplyItem;
  locked: boolean;
  onToggle: (x: ApplyItem) => void;
  onOpen: (noteId: string, aid?: string | null) => void;
}) {
  const at = unlockLabel((x.t.at || 0) + DONE_MIN_MS);
  return (
    <div className="sn-lg-line" data-done={!!x.t.done || undefined}>
      <button
        type="button"
        className="sn-lg-ck"
        aria-pressed={!!x.t.done}
        disabled={locked}
        aria-label={
          x.t.done ? '실천 표시 지우기' : locked ? `${at}부터 체크할 수 있어요` : '살아 냈어요'
        }
        onClick={() => onToggle(x)}
      />
      <span className="sn-lg-line-tx">
        <span className="sn-lg-memo">{memo(x)}</span>
        <span className="sn-lg-src">
          {src(x.n)}
          {locked && ` · ${at}부터 체크`}
        </span>
      </span>
      <button type="button" className="sn-btn sn-ghost" onClick={() => onOpen(x.n.id, x.t.aid)}>
        노트 보기
      </button>
    </div>
  );
}
