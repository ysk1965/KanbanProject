import { useEffect, useMemo, type ReactNode } from 'react';
import { Check, ChevronRight, LogIn, Trophy } from 'lucide-react';
import type { SermonNote } from '../sermonTypes';
import { tierName } from './challengeApi';
import { Coin, SoonNote } from './ChallengeBits';
import { leftLabel, localWeekStart, num } from './challengeUtil';
import { useChallengeStore, type ChallengeStore } from './challengeStore';
import { STAGE_TALENTS, fmtMs } from './books';
import { sermonSource } from './wordPool';
import { refLong } from '../bibleRefs';

/**
 * 챌린지 홈 — 지갑 · 오늘의 말씀 산성비 · 66권 줄 세우기 · 이번 주 완주 · 내 리그 · 이번 주 적용.
 * 서버가 없거나 로그인 전이면 지갑·리그 자리에 안내만 두고 게임은 연습 판으로 열린다.
 */

/** 서버가 없을 때 이 기기 노트로 이번 주 완주를 어림한다 (월요일 시작) */
function localComplete(notes: SermonNote[]): { note: boolean; apply_done: boolean } {
  const ws = localWeekStart();
  const wsYmd = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
  const note = notes.some((n) => (n.date || '') >= wsYmd);
  const apply_done = notes.some((n) =>
    (n.thoughts || []).some((t) => t.tag === '적용' && t.done && (t.done_at || 0) >= ws.getTime()),
  );
  return { note, apply_done };
}

function Wallet({
  store,
  anonymous,
  onLogin,
}: {
  store: ChallengeStore;
  anonymous: boolean;
  onLogin?: () => void;
}) {
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
        <Coin size={28} />
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
  applySection,
}: {
  notes: SermonNote[];
  userId: string;
  anonymous: boolean;
  onLogin?: () => void;
  onPlay: (game: 'rain' | 'books') => void;
  onRanking: () => void;
  applySection?: ReactNode;
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
  const steps = (doneNote ? 1 : 0) + (doneApply ? 1 : 0);
  const league = !anonymous ? store.league : null;
  const me = league?.entries?.find((e) => e.me);
  const rainBest = store.rainBest?.best;
  const booksBest = store.booksBest?.best;
  const capLeft =
    store.wallet && !anonymous
      ? Math.max(0, (store.wallet.game_daily_cap ?? 30) - (store.wallet.today_game_talents ?? 0))
      : null;

  return (
    <div className="sn-ch-home">
      <Wallet store={store} anonymous={anonymous} onLogin={onLogin} />

      <div className="sn-ch-games">
        <button
          type="button"
          className="sn-ch-game-card"
          data-game="rain"
          onClick={() => onPlay('rain')}
        >
          <div className="sn-ch-vis" aria-hidden>
            <span style={{ left: '10%', top: 10 }}>사망이</span>
            <span data-kind="gold" style={{ left: '46%', top: 34 }}>
              은혜
            </span>
            <span data-kind="galpi" style={{ left: '24%', top: 52 }}>
              갈피
            </span>
          </div>
          <b>오늘의 말씀 산성비</b>
          <span>
            {src
              ? `이번 주 설교 · ${refLong(src.refs[0])}`
              : '요한복음 15장 · 시편 23편 · 66권 이름'}
          </span>
          <span className="sn-ch-faint">
            {anonymous
              ? '연습 판'
              : [
                  rainBest != null ? `내 최고 ${num(rainBest)}점` : '',
                  capLeft != null ? `오늘 받을 수 있는 달란트 ${capLeft}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '100점마다 1달란트'}
          </span>
          <span className="sn-ch-go">
            시작 <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        <button
          type="button"
          className="sn-ch-game-card"
          data-game="books"
          onClick={() => onPlay('books')}
        >
          <div className="sn-ch-vis sn-ch-vis-books" aria-hidden>
            <span>창세기</span>
            <span>출애굽기</span>
            <span>레위기</span>
          </div>
          <b>66권 줄 세우기</b>
          <span>모세오경 · 신약 · 구약 · 전체 66권</span>
          <span className="sn-ch-faint">
            {anonymous
              ? '연습 판'
              : booksBest != null
                ? `66권 내 최고 ${fmtMs(booksBest)}`
                : `전체 66권 완주 +${STAGE_TALENTS.all}`}
          </span>
          <span className="sn-ch-go">
            시작 <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
      </div>

      <section className="sn-ch-sec" aria-label="이번 주 완주">
        <div className="sn-sec-h">
          <h4>이번 주 완주</h4>
          <span>{steps === 2 ? '완주했어요 · +20' : `${2 - steps}개 남음 · 완주하면 +20`}</span>
        </div>
        <div className="sn-ch-complete">
          <div className="sn-ch-cbar" role="img" aria-label={`2개 중 ${steps}개`}>
            <i style={{ width: `${steps * 50}%` }} />
          </div>
          <ul>
            <li data-done={doneNote}>
              <Check className="sn-icon" aria-hidden />
              설교 노트 1편 기록
            </li>
            <li data-done={doneApply}>
              <Check className="sn-icon" aria-hidden />
              적용 1개 실천 체크
            </li>
          </ul>
        </div>
      </section>

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

      {applySection && <section className="sn-ch-sec sn-ch-apply">{applySection}</section>}
    </div>
  );
}
