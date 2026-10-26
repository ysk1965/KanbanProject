import { useEffect, useState, useSyncExternalStore } from 'react';
import { LogIn } from 'lucide-react';
import { useSermonGroups } from '../group/GroupContext';
import {
  challengeAPI,
  challengeErrorMessage,
  isUnavailable,
  tierName,
  type League,
  type RankBoard,
  type RankEntry,
  type Rankings,
  type RankScope,
} from './challengeApi';
import { Coin, SoonNote } from './ChallengeBits';
import { isKstMonday, leftLabel, num, rankName } from './challengeUtil';
import { useChallengeStore } from './challengeStore';
import { ChurchPicker } from './ChurchPicker';
import { NicknameSheet } from './NicknameSheet';
import { fmtMs } from './books';

/**
 * 랭킹 — 범위(리그 · 전체 · 우리 교회 · 내 모임) × 점수판(달란트 · 산성비 · 66권).
 * 리그는 이번 주 달란트로만 겨룬다. 처음 열 때 닉네임이 없으면 한 번 묻는다.
 */

type Scope = 'league' | RankScope;

const SCOPES: Array<{ k: Scope; label: string }> = [
  { k: 'league', label: '리그' },
  { k: 'global', label: '전체' },
  { k: 'church', label: '우리 교회' },
  { k: 'group', label: '내 모임' },
];
const BOARDS: Array<{ k: RankBoard; label: string }> = [
  { k: 'talent', label: '달란트' },
  { k: 'rain', label: '산성비' },
  { k: 'books', label: '66권' },
];

const noopSub = () => () => {};
const zero = () => 0;

function fmtValue(board: RankBoard, v: number | null | undefined): string {
  if (v == null) return '-';
  if (board === 'books') return fmtMs(v);
  return board === 'rain' ? `${num(v)}점` : num(v);
}

function gapLine(board: RankBoard, gap: number | null | undefined, rank?: number | null): string {
  if (gap == null || !rank || rank <= 1) return '';
  const target = `${rank - 1}등`;
  if (board === 'books') return `${fmtMs(gap)} 더 빠르면 ${target}이에요.`;
  if (board === 'rain') return `바로 위까지 ${num(gap)}점 — 산성비 한 판이면 ${target}도 가능해요.`;
  return `바로 위까지 ${num(gap)}달란트 — 오늘 게임이나 적용 실천으로 ${target}에 닿아요.`;
}

const ASK_KEY = 'sermon-challenge-nick-asked';

function Rows({ entries, board }: { entries: RankEntry[]; board: RankBoard }) {
  return (
    <ol className="sn-rank-rows">
      {entries.map((e) => (
        <li key={`${e.rank}-${e.name}`} data-me={!!e.me} data-zone={e.zone || undefined}>
          <span className="sn-rank-n sn-mono">{e.rank}</span>
          <span className="sn-rank-av" aria-hidden>
            {(e.name || '?').trim().slice(0, 1)}
          </span>
          <span className="sn-rank-name">
            {e.me ? `${e.name} (나)` : e.name}
            {e.dept && <small>{e.dept}</small>}
          </span>
          <em className="sn-mono">{fmtValue(board, e.value)}</em>
        </li>
      ))}
    </ol>
  );
}

export function RankingView({
  userId,
  anonymous,
  onLogin,
}: {
  userId: string;
  anonymous: boolean;
  onLogin?: () => void;
}) {
  const store = useChallengeStore(userId);
  const gctx = useSermonGroups();
  useSyncExternalStore(gctx ? gctx.store.subscribe : noopSub, gctx ? gctx.store.snapshot : zero);
  const groups = gctx && !gctx.anonymous ? gctx.store.active() : [];

  const [scope, setScope] = useState<Scope>('league');
  const [board, setBoard] = useState<RankBoard>('talent');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [data, setData] = useState<Rankings | League | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'soon' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0);
  const [askNick, setAskNick] = useState(false);
  const [churchOpen, setChurchOpen] = useState(false);

  const gid = groupId && groups.some((g) => g.id === groupId) ? groupId : groups[0]?.id || null;

  // 닉네임이 없으면 처음 한 번 묻는다
  useEffect(() => {
    if (anonymous || !store.loaded || store.profile?.nickname) return;
    try {
      if (localStorage.getItem(`${ASK_KEY}:${userId}`)) return;
      localStorage.setItem(`${ASK_KEY}:${userId}`, '1');
    } catch {
      /* ignore */
    }
    setAskNick(true);
  }, [anonymous, store.loaded, store.profile?.nickname, userId]);

  useEffect(() => {
    if (anonymous) return;
    if (scope === 'group' && !gid) {
      setData(null);
      setState('ok');
      return;
    }
    let alive = true;
    setState('loading');
    const p: Promise<Rankings | League> =
      scope === 'league'
        ? challengeAPI.league()
        : challengeAPI.rankings(scope, board, scope === 'group' ? gid : null);
    p.then((r) => {
      if (!alive) return;
      setData(r || null);
      setState('ok');
    }).catch((e) => {
      if (!alive) return;
      setData(null);
      if (isUnavailable(e)) setState('soon');
      else {
        setErr(challengeErrorMessage(e));
        setState('error');
      }
    });
    return () => {
      alive = false;
    };
  }, [anonymous, scope, board, gid, nonce]);

  // 교회를 정하고 나면 다시 받는다
  const churchId = store.profile?.church?.id;
  useEffect(() => {
    if (scope === 'church') setNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId]);

  if (anonymous) {
    return (
      <div className="sn-rank">
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
          <b>로그인하면 랭킹에 올라가요.</b>
          <br />
          설교 기록과 게임으로 모은 달란트로 우리 교회·모임 사람들과 겨뤄요. 게임은 지금도 연습
          판으로 할 수 있어요.
        </SoonNote>
      </div>
    );
  }

  const prof = store.profile;
  const myName = prof?.anonymous ? prof.anon_name : rankName(prof?.nickname, prof?.tag);
  const league = scope === 'league' ? (data as League | null) : null;
  const ranks = scope !== 'league' ? (data as Rankings | null) : null;
  const boardNow: RankBoard = scope === 'league' ? 'talent' : board;
  const entries = (league?.entries || ranks?.entries || []).filter(Boolean);
  const meEntry = entries.find((e) => e.me);
  const myRank = ranks?.me?.rank ?? meEntry?.rank ?? null;
  const lr = league?.last_result;

  let body: React.ReactNode;
  if (state === 'loading') {
    body = <div className="sn-ch-faint sn-rank-wait">불러오는 중…</div>;
  } else if (state === 'soon') {
    body = (
      <SoonNote>
        <b>랭킹은 아직 준비 중이에요.</b>
        <br />곧 열려요. 그동안 게임은 연습 판으로 해 볼 수 있어요.
      </SoonNote>
    );
  } else if (state === 'error') {
    body = (
      <SoonNote
        action={
          <button type="button" className="sn-btn" onClick={() => setNonce((n) => n + 1)}>
            다시 불러오기
          </button>
        }
      >
        {err}
      </SoonNote>
    );
  } else if (scope === 'group' && !gid) {
    body = (
      <SoonNote>
        아직 참여한 모임이 없어요.
        <br />
        모임 탭에서 모임을 만들거나 초대 링크로 들어오면 모임 사람들과 겨룰 수 있어요.
      </SoonNote>
    );
  } else if (ranks?.locked === 'no_church') {
    body = (
      <SoonNote
        action={
          <button type="button" className="sn-btn sn-primary" onClick={() => setChurchOpen(true)}>
            소속 교회 정하기
          </button>
        }
      >
        <b>소속 교회를 정하면 우리 교회 랭킹이 열려요.</b>
        <br />
        같은 교회 갈피러끼리 이번 주 달란트를 겨뤄요.
      </SoonNote>
    );
  } else if (ranks?.locked === 'too_few') {
    body = (
      <SoonNote>
        <b>우리 교회 갈피러가 {ranks.members ?? 1}명이에요.</b>
        <br />
        5명이 되면 우리 교회 랭킹이 열려요. 교회 친구에게 갈피를 알려 주세요.
      </SoonNote>
    );
  } else if (!entries.length) {
    body = (
      <SoonNote>
        이번 주 기록이 아직 없어요.
        <br />
        설교 노트를 쓰거나 게임을 한 판 하면 순위에 올라가요.
      </SoonNote>
    );
  } else {
    const gap = gapLine(boardNow, ranks?.gap_to_next, myRank);
    body = (
      <>
        <Rows entries={entries} board={boardNow} />
        {ranks?.me && !meEntry && ranks.me.rank != null && (
          <ol className="sn-rank-rows sn-rank-me">
            <li data-me>
              <span className="sn-rank-n sn-mono">{ranks.me.rank}</span>
              <span className="sn-rank-av" aria-hidden>
                나
              </span>
              <span className="sn-rank-name">{myName || '나'}</span>
              <em className="sn-mono">{fmtValue(boardNow, ranks.me.value)}</em>
            </li>
          </ol>
        )}
        {gap && <p className="sn-rank-gap">{gap}</p>}
      </>
    );
  }

  return (
    <div className="sn-rank">
      <div className="sn-rank-top">
        <div className="sn-ch-seg" role="tablist" aria-label="랭킹 범위">
          {SCOPES.map((s) => (
            <button
              key={s.k}
              type="button"
              role="tab"
              aria-selected={scope === s.k}
              onClick={() => setScope(s.k)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope !== 'league' && (
          <div className="sn-ch-sets" role="radiogroup" aria-label="점수판">
            {BOARDS.map((b) => (
              <button
                key={b.k}
                type="button"
                role="radio"
                aria-checked={board === b.k}
                className="sn-chip"
                onClick={() => setBoard(b.k)}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
        {scope === 'group' && groups.length > 1 && (
          <div className="sn-ch-sets" role="radiogroup" aria-label="모임">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={gid === g.id}
                className="sn-chip"
                onClick={() => setGroupId(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {lr && isKstMonday() && (
        <div className="sn-rank-banner" data-moved={lr.moved}>
          지난주 {tierName(lr.tier_from)} 리그 {lr.rank}등 —{' '}
          {lr.moved === 'up'
            ? `${tierName(lr.tier_to)}(으)로 올라갔어요!`
            : lr.moved === 'down'
              ? `${tierName(lr.tier_to)}에서 다시 시작해요.`
              : `${tierName(lr.tier_to)}에 그대로 있어요.`}
        </div>
      )}

      <div className="sn-rank-meta">
        {scope === 'league' && league ? (
          <>
            <span className="sn-tier" data-tier={league.tier}>
              {tierName(league.tier, league.tier_name)} 리그
            </span>
            <span>
              위 {league.promote ?? 7}명 올라가요 · 아래 {league.demote ?? 5}명 내려가요
            </span>
          </>
        ) : scope === 'church' && prof?.church ? (
          <span>
            <b>{prof.church.name}</b>
            {prof.church.dept ? ` · ${prof.church.dept}` : ''}
          </span>
        ) : scope === 'group' && gid ? (
          <span>
            <b>{groups.find((g) => g.id === gid)?.name}</b> 멤버
          </span>
        ) : (
          <span>
            <b>전체</b> 상위 100명
          </span>
        )}
        <span className="sn-ch-faint">{leftLabel((league || ranks)?.ends_at)}</span>
      </div>

      {body}

      <div className="sn-rank-foot">
        <button type="button" className="sn-btn sn-ghost" onClick={() => setAskNick(true)}>
          <Coin size={16} />
          {myName ? `내 이름 ${myName}` : '랭킹 이름 정하기'}
        </button>
        <button type="button" className="sn-btn sn-ghost" onClick={() => setChurchOpen(true)}>
          {prof?.church ? `소속 ${prof.church.name}` : '소속 교회 정하기'}
        </button>
      </div>

      <NicknameSheet
        open={askNick}
        store={store}
        first={!prof?.nickname}
        onClose={() => setAskNick(false)}
      />
      <ChurchPicker open={churchOpen} store={store} onClose={() => setChurchOpen(false)} />
    </div>
  );
}
