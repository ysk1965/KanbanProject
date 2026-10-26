import { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import { prefersReducedMotion } from '../microFx';
import { challengeAPI, challengeErrorMessage, type BooksFinish } from './challengeApi';
import { Coin, PanelHead } from './ChallengeBits';
import { SnActionBar } from '../SnActionBar';
import { num } from './challengeUtil';
import { useChallengeStore } from './challengeStore';
import {
  STAGE_TALENTS,
  STAGES,
  bookName,
  fmtMs,
  nextExpected,
  sameSet,
  shuffle,
  stageBooks,
  stageOf,
  type BooksStage,
} from './books';

/**
 * 66권 줄 세우기 — 섞인 책 카드를 성경 순서대로 눌러 칸에 놓는다.
 * 틀린 카드는 흔들리기만 하고 (벌점 없음) 손놀림 수만 센다. 랭킹 점수는 걸린 시간.
 * 판을 못 열면(로그인 전·서버 없음) 같은 규칙의 연습 판.
 */

type Phase = 'pick' | 'loading' | 'play' | 'finishing' | 'result';

interface Result {
  ms: number;
  moves: number;
  practice: boolean;
  server?: BooksFinish;
  error?: string;
}

export function BooksGame({
  userId,
  anonymous,
  onBack,
  onLogin,
}: {
  userId: string;
  anonymous: boolean;
  onBack: () => void;
  onLogin?: () => void;
}) {
  const store = useChallengeStore(userId);
  const [stage, setStage] = useState<BooksStage>('pentateuch');
  const [phase, setPhase] = useState<Phase>('pick');
  const [cards, setCards] = useState<number[]>([]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [shakeKey, setShakeKey] = useState<{ b: number; n: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const runId = useRef<string | null>(null);
  const t0 = useRef(0);
  const placedRow = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const total = stageBooks(stage).length;

  // 홈 카드에서 열면 (목록이 내려가 있어도) 게임 머리부터 보이게
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  // 시계 — 0.1초마다
  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  // 놓은 칸 줄은 늘 끝이 보이게
  useEffect(() => {
    const el = placedRow.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [placed.length]);

  const start = async () => {
    setPhase('loading');
    let deck: number[] | null = null;
    runId.current = null;
    if (!anonymous) {
      try {
        const res = await challengeAPI.startBooks(stage);
        if (res?.run_id && sameSet(stage, res.cards)) {
          deck = res.cards;
          runId.current = res.run_id;
        }
      } catch {
        /* 서버 없음 → 연습 판 */
      }
    }
    setCards(deck || shuffle(stageBooks(stage)));
    setPlaced([]);
    setMoves(0);
    setElapsed(0);
    setResult(null);
    t0.current = performance.now();
    setPhase('play');
  };

  const finish = useCallback(
    async (order: number[], mv: number) => {
      const ms = Math.round(performance.now() - t0.current);
      setElapsed(ms);
      const base: Result = { ms, moves: mv, practice: !runId.current };
      if (!runId.current) {
        setResult(base);
        setPhase('result');
        return;
      }
      setPhase('finishing');
      try {
        const res = await challengeAPI.finishBooks(runId.current, {
          order,
          duration_ms: ms,
          moves: mv,
        });
        setResult({ ...base, ms: res?.time_ms ?? ms, server: res });
        if (res?.is_best && stage === 'all') store.setBest('books', res.best_ms ?? res.time_ms);
        void store.refreshWallet();
      } catch (e) {
        setResult({
          ...base,
          error: challengeErrorMessage(e, '기록을 올리지 못했어요. 시간은 이 화면에만 남아요.'),
        });
      }
      setPhase('result');
    },
    [stage, store],
  );

  const tap = (b: number) => {
    if (phase !== 'play') return;
    const mv = moves + 1;
    setMoves(mv);
    if (b !== nextExpected(stage, placed.length)) {
      if (!prefersReducedMotion()) setShakeKey((k) => ({ b, n: (k?.n || 0) + 1 }));
      return;
    }
    const next = [...placed, b];
    setPlaced(next);
    if (next.length === total) void finish(next, mv);
  };

  const s = result?.server;
  const st = stageOf(stage);
  const left = cards.filter((b) => !placed.includes(b));
  const allBest = store.booksBest?.best;

  return (
    <div className="sn-ch-game" ref={rootRef}>
      <SnActionBar backLabel="챌린지" onBack={onBack} />
      <PanelHead
        title="66권 줄 세우기"
        right={
          phase === 'play' || phase === 'finishing' ? (
            <span className="sn-ch-clock sn-mono" aria-label="걸린 시간">
              {fmtMs(elapsed)}
            </span>
          ) : undefined
        }
      />
      {phase === 'pick' || phase === 'loading' ? (
        <div className="sn-books-pick">
          <p>섞인 성경 책 카드를 순서대로 눌러 칸에 놓으세요. 틀린 카드는 흔들리기만 해요.</p>
          <div className="sn-ch-sets" role="radiogroup" aria-label="단계">
            {STAGES.map((x) => (
              <button
                key={x.k}
                type="button"
                role="radio"
                aria-checked={x.k === stage}
                className="sn-chip"
                onClick={() => setStage(x.k)}
              >
                {x.label} <span className="sn-ch-faint">{x.to - x.from + 1}권</span>
              </button>
            ))}
          </div>
          <p className="sn-ch-hint">
            {anonymous
              ? '연습 판 · 로그인하면 달란트와 랭킹에 올라가요'
              : `완주하면 달란트 +${STAGE_TALENTS[stage]} (하루 게임 달란트 30 안에서)`}
            {!anonymous && allBest != null ? ` · 전체 66권 내 최고 ${fmtMs(allBest)}` : ''}
          </p>
          <div>
            <button
              type="button"
              className="sn-btn sn-primary"
              onClick={start}
              disabled={phase === 'loading'}
            >
              {phase === 'loading' ? '여는 중…' : `${st.label} 시작`}
            </button>
          </div>
        </div>
      ) : phase === 'result' && result ? (
        <div className="sn-books-result" role="status">
          <h3>{fmtMs(result.ms)}</h3>
          {result.practice ? (
            <>
              <p>
                연습 판 · 로그인하면 달란트와 랭킹
                <br />
                {st.label} · 손놀림 {result.moves}번
              </p>
              {anonymous && onLogin && (
                <button type="button" className="sn-btn" onClick={onLogin}>
                  <LogIn className="sn-icon" aria-hidden />
                  로그인
                </button>
              )}
            </>
          ) : (
            <>
              <p className="sn-ch-talent">
                <Coin size={18} /> 달란트 +{s?.talents ?? 0}
                {s?.talents_capped ? ' · 오늘 게임 달란트를 다 채웠어요' : ''}
              </p>
              <p>
                {st.label} · 손놀림 {result.moves}번
                {s?.is_best
                  ? ' · 내 최고 기록!'
                  : s?.best_ms != null
                    ? ` · 최고 ${fmtMs(s.best_ms)}`
                    : ''}
              </p>
              {s?.valid === false && (
                <p className="sn-ch-warn">이번 판은 기록으로 인정되지 않았어요.</p>
              )}
              {result.error && <p className="sn-ch-warn">{result.error}</p>}
              {s?.ranks && stage === 'all' && (
                <div className="sn-ch-ranks">
                  <div>
                    <b>{s.ranks.global != null ? `${num(s.ranks.global)}위` : '-'}</b>전체
                  </div>
                  <div>
                    <b>{s.ranks.church != null ? `${num(s.ranks.church)}위` : '-'}</b>우리 교회
                  </div>
                  <div>
                    <b>{s.ranks.league != null ? `${num(s.ranks.league)}위` : '-'}</b>리그
                  </div>
                </div>
              )}
            </>
          )}
          <div className="sn-ch-acts">
            <button type="button" className="sn-btn" onClick={() => setPhase('pick')}>
              다른 단계
            </button>
            <button type="button" className="sn-btn sn-primary" onClick={start}>
              다시 하기
            </button>
          </div>
        </div>
      ) : (
        <div className="sn-books-play">
          <div className="sn-books-bar">
            <span>
              {st.label} <b className="sn-mono">{placed.length}</b>/{total}
            </span>
            <span className="sn-ch-faint">손놀림 {moves}</span>
          </div>
          <div className="sn-books-placed" ref={placedRow} aria-label="놓은 책">
            {placed.length ? (
              placed.map((b) => (
                <span key={b} className="sn-books-slot">
                  {bookName(b)}
                </span>
              ))
            ) : (
              <span className="sn-ch-faint">첫 번째 책부터 눌러 보세요</span>
            )}
          </div>
          <div className="sn-books-grid" aria-label="남은 책 카드">
            {left.map((b) => (
              <button
                key={b}
                type="button"
                className="sn-books-card"
                data-shake={shakeKey?.b === b ? shakeKey.n % 2 : undefined}
                onClick={() => tap(b)}
                disabled={phase !== 'play'}
              >
                {bookName(b)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
