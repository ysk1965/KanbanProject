import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, LogIn, Trophy } from 'lucide-react';
import type { SermonNote } from '../sermonTypes';
import { tierName } from './challengeApi';
import { Coin, SoonNote } from './ChallengeBits';
import { leftLabel, localWeekStart, num } from './challengeUtil';
import { useChallengeStore, type ChallengeStore } from './challengeStore';
import { sermonSource } from './wordPool';
import { BOOKS, refLong } from '../bibleRefs';
import { CoinDots, PilsaWindow, RainWindow } from './GameWindows';
import { LifeGalpiCard, type LifeGalpiApply } from './LifeGalpiCard';
import { nextChapter, pilsaDoneCount, usePilsa } from './pilsaStore';

/**
 * 챌린지 홈 — 지갑 · 이번 주 갈피 퀘스트 · (잠시 숨김: 말씀 산성비 · 이번 주 말씀 필사) · 내 리그.
 * (66권 줄 세우기는 홈에서 뺐다 — 보기는 ChallengeTab 에 남아 있음)
 * 서버가 없거나 로그인 전이면 지갑·리그 자리에 안내만 두고 게임은 연습 판으로 열린다.
 */

/**
 * 이 기기 노트로 이번 주 퀘스트를 어림한다 (월요일 시작) — 서버가 없을 때 판정 + 서버에 없는 걸음(적용 남기기)·보너스 진행
 */
function localComplete(notes: SermonNote[]): {
  note: boolean;
  apply_done: boolean;
  weekNote: SermonNote | null;
  weekHasApply: boolean;
  weekNoteCount: number;
  weekDoneCount: number;
} {
  const ws = localWeekStart();
  const wsYmd = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
  const inWeek = notes
    .filter((n) => (n.date || '') >= wsYmd)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const weekDoneCount = notes.reduce(
    (a, n) =>
      a +
      (n.thoughts || []).filter(
        (t) => t.tag === '적용' && t.done && (t.done_at || 0) >= ws.getTime(),
      ).length,
    0,
  );
  const weekHasApply = inWeek.some((n) =>
    (n.thoughts || []).some((t) => t.tag === '적용' && (t.text || '').trim().length >= 10),
  );
  return {
    note: inWeek.length > 0,
    apply_done: weekDoneCount > 0,
    weekNote: inWeek[0] ?? null,
    weekHasApply,
    weekNoteCount: inWeek.length,
    weekDoneCount,
  };
}

/** 지갑에서 마지막으로 본 잔액 — 늘어나면 동전 연출. 화면을 다시 열어도 같은 잔액에 또 터지지 않게 모듈에 둔다 */
let seenBalance: number | null = null;

function Wallet({
  store,
  anonymous,
  onLogin,
}: {
  store: ChallengeStore;
  anonymous: boolean;
  onLogin?: () => void;
}) {
  const bal = store.wallet?.balance;
  const [gain, setGain] = useState(0);
  useEffect(() => {
    if (bal == null) return;
    if (seenBalance != null && bal > seenBalance) setGain(bal - seenBalance);
    seenBalance = bal;
  }, [bal]);
  if (anonymous) {
    return (
      <SoonNote
        action={
          onLogin && (
            <button type="button" className="sn-btn sn-primary" onClick={onLogin}>
              <LogIn className="sn-icon" aria-hidden />
              로그인
            </button>
          )
        }
      >
        <b>로그인하면 달란트를 모아요.</b>
        <br />
        설교 기록·적용 실천·게임으로 달란트를 모으고, 우리 교회·모임 랭킹에 올라가요. 게임은 지금
        연습 판으로 해 볼 수 있어요.
      </SoonNote>
    );
  }
  const w = store.wallet;
  if (!w) {
    return store.unavailable ? (
      <SoonNote>
        <b>달란트와 랭킹은 아직 준비 중이에요.</b>
        <br />
        게임은 지금 연습 판으로 해 볼 수 있어요.
      </SoonNote>
    ) : (
      <div className="sn-ch-wallet" aria-busy="true">
        <div className="sn-ch-bal">
          <Coin size={28} />
          <b className="sn-mono">…</b>
        </div>
      </div>
    );
  }
  const cap = w.game_daily_cap ?? 30;
  const today = w.today_game_talents ?? 0;
  return (
    <div className="sn-ch-wallet">
      <div className="sn-ch-bal">
        <Coin size={28} play={gain > 0 ? 'gain' : undefined} />
        {gain > 0 && (
          <span className="sn-ch-plus" aria-hidden onAnimationEnd={() => setGain(0)}>
            +{num(gain)}
          </span>
        )}
        <b className="sn-mono">{num(w.balance)}</b>
        <span>달란트</span>
      </div>
      <div className="sn-ch-wstats" role="list">
        <div role="listitem">
          <b className="sn-mono">{num(w.week_talents)}</b>이번 주 랭킹 달란트
        </div>
        <div role="listitem">
          <b className="sn-mono">
            {today}/{cap}
          </b>
          오늘 게임 달란트
        </div>
        <div role="listitem">
          <b className="sn-mono">{w.streak_weeks ?? 0}주</b>연속 기록
        </div>
      </div>
      {store.unavailable && (
        <p className="sn-ch-faint">연결이 끊겨 마지막으로 받은 값을 보여 드려요.</p>
      )}
    </div>
  );
}

export function ChallengeHome({
  notes,
  userId,
  anonymous,
  onLogin,
  onPlay,
  onRanking,
  apply,
  onToggleApply,
  onOpenNote,
  onNew,
}: {
  notes: SermonNote[];
  userId: string;
  anonymous: boolean;
  onLogin?: () => void;
  onPlay: (game: 'rain' | 'pilsa') => void;
  onRanking: () => void;
  apply: LifeGalpiApply;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  onOpenNote: (noteId: string, aid?: string | null) => void;
  onNew: () => void;
}) {
  const store = useChallengeStore(userId);

  // 노트가 바뀌면(적용 체크·새 기록) 서버 적립이 끝날 즈음 지갑을 다시 받는다
  const sig = useMemo(
    () =>
      notes
        .map(
          (n) => `${n.id}:${n.updated_at || ''}:${(n.thoughts || []).filter((t) => t.done).length}`,
        )
        .join('|'),
    [notes],
  );
  useEffect(() => {
    if (anonymous) return;
    const id = window.setTimeout(() => void store.refreshWallet(), 3000);
    return () => window.clearTimeout(id);
  }, [sig, anonymous, store]);

  const src = useMemo(() => sermonSource(notes), [notes]);
  const wc = store.wallet?.week_complete;
  const local = useMemo(() => localComplete(notes), [notes]);
  const doneNote = wc ? !!wc.note : local.note;
  const doneApply = wc ? !!wc.apply_done : local.apply_done;
  const league = !anonymous ? store.league : null;
  const me = league?.entries?.find((e) => e.me);
  const rainBest = store.rainBest?.best;
  const pilsa = usePilsa(notes, userId, anonymous);
  const pilsaNext = nextChapter(pilsa.plan);
  const pilsaDone = pilsaDoneCount(pilsa.plan);

  return (
    <div className="sn-ch-home">
      <Wallet store={store} anonymous={anonymous} onLogin={onLogin} />

      <LifeGalpiCard
        weekNote={local.weekNote}
        doneNote={doneNote}
        doneApply={doneApply}
        weekHasApply={local.weekHasApply}
        weekNoteCount={local.weekNoteCount}
        weekDoneCount={local.weekDoneCount}
        streakWeeks={anonymous ? undefined : store.wallet?.streak_weeks}
        anonymous={anonymous}
        apply={apply}
        onToggleApply={onToggleApply}
        onOpenNote={onOpenNote}
        onNew={onNew}
      />

      {/* 산성비 · 필사 카드 — 잠시 숨김 (2026-10-29)
      <div className="sn-ch-games">
        <button
          type="button"
          className="sn-ch-game-card"
          data-game="rain"
          onClick={() => onPlay('rain')}
        >
          <RainWindow refs={src?.refs} />
          <b>오늘의 말씀 산성비</b>
          <span>
            {src
              ? `이번 주 설교 · ${refLong(src.refs[0])}`
              : '요한복음 15장 · 시편 23편 · 66권 이름'}
          </span>
          <span className="sn-gw-meta">
            {anonymous ? (
              '연습 판'
            ) : (
              <>
                {rainBest != null && (
                  <>
                    <span className="sn-gw-best">{num(rainBest)}</span>내 최고
                  </>
                )}
                {store.wallet && (
                  <CoinDots
                    got={store.wallet.today_game_talents ?? 0}
                    cap={store.wallet.game_daily_cap ?? 30}
                  />
                )}
                {rainBest == null && !store.wallet && '100점마다 1달란트'}
              </>
            )}
            <span className="sn-ch-go">
              시작 <ChevronRight className="sn-icon" aria-hidden />
            </span>
          </span>
        </button>
        <button
          type="button"
          className="sn-ch-game-card"
          data-game="pilsa"
          onClick={() => onPlay('pilsa')}
        >
          <PilsaWindow plan={pilsa.plan} />
          <b>이번 주 말씀 필사</b>
          <span>
            {pilsa.plan
              ? `${pilsa.plan.chapters[0]?.reason === 'common' ? '이번 주 함께 쓰는' : '설교에서 고른'} 일곱 장${pilsaDone ? ` · ${pilsaDone}장 썼어요` : ''}`
              : '이번 주 일곱 장을 고르는 중'}
          </span>
          <span className="sn-gw-meta">
            {pilsa.plan && (
              <>
                <span className="sn-gw-best">{pilsaDone} / 7</span>
                {pilsaNext
                  ? `오늘은 ${BOOKS[pilsaNext.b][1]} ${pilsaNext.c}`
                  : '일곱 장 다 꽂았어요'}
              </>
            )}
            {anonymous && ' · 연습'}
            <span className="sn-ch-go">
              {pilsaDone || pilsaNext?.done.length ? '이어 쓰기' : '시작'}{' '}
              <ChevronRight className="sn-icon" aria-hidden />
            </span>
          </span>
        </button>
      </div>
      */}

      {!anonymous && (
        <button type="button" className="sn-ch-league" onClick={onRanking}>
          <Trophy className="sn-icon" aria-hidden />
          {league ? (
            <span>
              <b>
                {tierName(league.tier, league.tier_name)} 리그
                {me ? ` · ${me.rank}등` : ''}
              </b>
              <small>
                {me?.zone === 'up'
                  ? '이대로면 다음 주에 올라가요'
                  : me?.zone === 'down'
                    ? '조금만 더 모으면 내려가지 않아요'
                    : '이번 주 달란트로 30명이 겨뤄요'}{' '}
                · {leftLabel(league.ends_at)}
              </small>
            </span>
          ) : (
            <span>
              <b>랭킹 보기</b>
              <small>
                {store.unavailable
                  ? '랭킹은 아직 준비 중이에요'
                  : '리그 · 전체 · 우리 교회 · 내 모임'}
              </small>
            </span>
          )}
          <ChevronRight className="sn-icon" aria-hidden />
        </button>
      )}
    </div>
  );
}
