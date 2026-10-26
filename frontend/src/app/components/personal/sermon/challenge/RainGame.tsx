import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import type { SermonNote } from '../sermonTypes';
import { useBible } from '../useBible';
import { prefersReducedMotion } from '../microFx';
import {
  challengeAPI,
  challengeErrorMessage,
  type RainFinish,
  type RainRules,
} from './challengeApi';
import { Coin, PanelHead } from './ChallengeBits';
import { SnActionBar } from '../SnActionBar';
import { num } from './challengeUtil';
import { useChallengeStore } from './challengeStore';
import {
  RAIN_LEVEL_EVERY,
  RAIN_LIVES,
  RainScorer,
  rainTalents,
  type RainEvent,
  type RainWord,
} from './rainScore';
import { fixedSet, localWords, sermonSet, type RainSet, type RainSetKey } from './wordPool';

/**
 * 말씀 산성비 — 떨어지는 말씀 단어를 쳐서 없앤다 (기획 v2 프로토타입을 옮김).
 * 서버 판(POST runs → 단어 순서·종류) → 놀기(이벤트 기록) → POST finish → 결과.
 * 판을 못 열면(로그인 전·서버 없음) 같은 규칙의 연습 판으로 하고 finish 는 부르지 않는다.
 */

type Phase = 'pick' | 'loading' | 'play' | 'paused' | 'finishing' | 'result';

interface Live {
  w: RainWord;
  el: HTMLSpanElement;
  x: number;
  y: number;
  v: number;
}

interface Run {
  runId: string | null;
  words: RainWord[];
  rules: Required<RainRules>;
  label: string;
  next: number;
  live: Live[];
  scorer: RainScorer;
  events: RainEvent[];
  t: number;
  lastT: number;
  spawnIn: number;
  frozenUntil: number;
  lastNow: number;
}

interface Result {
  score: number;
  hits: number;
  level: number;
  practice: boolean;
  server?: RainFinish;
  error?: string;
}

const DEFAULT_RULES: Required<RainRules> = {
  lives: RAIN_LIVES,
  level_every: RAIN_LEVEL_EVERY,
  min_gap_ms: 150,
  max_duration_ms: 900_000,
};
const FREEZE_MS = 3000;

/** 이벤트 시각 — 같은 프레임에 두 개가 나와도 늘 증가하게 */
function stamp(r: Run): number {
  const t = Math.max(Math.round(r.t), r.lastT + 1);
  r.lastT = t;
  return t;
}

/** 다음 단어를 하늘 위에 띄운다 (속도는 단계에 따라) */
function spawn(r: Run, sky: HTMLDivElement) {
  if (r.next >= r.words.length) return;
  const w = r.words[r.next++];
  const el = document.createElement('span');
  el.className = 'sn-rw';
  if (w.kind) el.dataset.kind = w.kind;
  el.textContent = w.text;
  sky.appendChild(el);
  const x = Math.max(6, Math.random() * (sky.clientWidth - el.offsetWidth - 12));
  const v = (26 + r.scorer.level * 7) * (0.85 + Math.random() * 0.3);
  el.style.transform = `translate(${x}px,-30px)`;
  r.live.push({ w, el, x, y: -30, v });
}

export function RainGame({
  notes,
  userId,
  anonymous,
  onBack,
  onLogin,
}: {
  notes: SermonNote[];
  userId: string;
  anonymous: boolean;
  onBack: () => void;
  onLogin?: () => void;
}) {
  const { bible } = useBible();
  const store = useChallengeStore(userId);
  const sets = useMemo<RainSet[]>(() => {
    const s = sermonSet(notes);
    const fixed = (['john15', 'ps23', 'books'] as const).map(fixedSet);
    return s ? [s, ...fixed] : fixed;
    // bible: 본문이 늦게 오면 단어를 다시 뽑는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, bible]);
  // null = 기본(이번 주 설교가 있으면 그것) — 본문이 늦게 와도 기본을 따라간다
  const [setKey, setSetKey] = useState<RainSetKey | null>(null);
  const current = sets.find((s) => s.key === setKey) || sets[0];

  const [phase, setPhase] = useState<Phase>('pick');
  const [hud, setHud] = useState({ score: 0, level: 1, combo: 0, lives: RAIN_LIVES });
  const [frozen, setFrozen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [practice, setPractice] = useState(false);
  const skyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<Run | null>(null);
  const rafRef = useRef(0);

  const syncHud = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    setHud({
      score: r.scorer.score,
      level: r.scorer.level,
      combo: r.scorer.combo,
      lives: r.scorer.livesLeft,
    });
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const finish = useCallback(async () => {
    stopLoop();
    const r = runRef.current;
    if (!r) return;
    const base: Result = {
      score: r.scorer.score,
      hits: r.scorer.hits,
      level: r.scorer.level,
      practice: !r.runId,
    };
    if (!r.runId) {
      setResult(base);
      setPhase('result');
      return;
    }
    setPhase('finishing');
    try {
      const res = await challengeAPI.finishRain(r.runId, {
        duration_ms: Math.max(Math.round(r.t), r.lastT),
        events: r.events,
      });
      setResult({ ...base, score: res?.score ?? base.score, server: res });
      if (res?.is_best) store.setBest('rain', res.best ?? res.score);
      void store.refreshWallet();
    } catch (e) {
      setResult({
        ...base,
        error: challengeErrorMessage(e, '기록을 올리지 못했어요. 점수는 이 화면에만 남아요.'),
      });
    }
    setPhase('result');
  }, [store, stopLoop]);

  const tick = useCallback(
    (now: number) => {
      const r = runRef.current;
      const sky = skyRef.current;
      if (!r || !sky) return;
      const dt = Math.min(50, now - r.lastNow);
      r.lastNow = now;
      r.t += dt;
      const ground = sky.clientHeight - 22;
      const interval = Math.max(750, 2100 - r.scorer.level * 150);
      r.spawnIn -= dt;
      if (r.spawnIn <= 0) {
        spawn(r, sky);
        r.spawnIn = interval;
      }
      const isFrozen = r.t < r.frozenUntil;
      setFrozen((f) => (f === isFrozen ? f : isFrozen));
      let changed = false;
      for (let i = r.live.length - 1; i >= 0; i--) {
        const l = r.live[i];
        if (!isFrozen) l.y += (l.v * dt) / 1000;
        l.el.style.transform = `translate(${l.x}px,${l.y}px)`;
        if (l.y + l.el.offsetHeight >= ground) {
          l.el.remove();
          r.live.splice(i, 1);
          r.events.push({ type: 'drop', i: l.w.i, t: stamp(r) });
          r.scorer.drop(l.w);
          changed = true;
          if (r.scorer.over) break;
        }
      }
      if (changed) syncHud();
      const outOfWords = r.next >= r.words.length && !r.live.length;
      if (r.scorer.over || outOfWords || r.t >= r.rules.max_duration_ms) {
        void finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [finish, syncHud],
  );

  const begin = useCallback(
    (
      words: RainWord[],
      runId: string | null,
      rules: RainRules | null | undefined,
      label: string,
    ) => {
      skyRef.current?.querySelectorAll('.sn-rw').forEach((e) => e.remove());
      const rr = { ...DEFAULT_RULES, ...(rules || {}) } as Required<RainRules>;
      runRef.current = {
        runId,
        words,
        rules: rr,
        label,
        next: 0,
        live: [],
        scorer: new RainScorer(rr.lives, rr.level_every),
        events: [],
        t: 0,
        lastT: 0,
        spawnIn: 0,
        frozenUntil: 0,
        lastNow: performance.now(),
      };
      setPractice(!runId);
      setResult(null);
      syncHud();
      setPhase('play');
      window.setTimeout(() => {
        rootRef.current?.scrollIntoView?.({ block: 'start' });
        inputRef.current?.focus({ preventScroll: true });
      }, 30);
    },
    [syncHud],
  );

  const start = async () => {
    const set = current;
    setPhase('loading');
    if (!anonymous) {
      try {
        const res = await challengeAPI.startRain({
          set: set.key,
          label: set.label,
          pool: set.pool,
        });
        const words: RainWord[] = (res?.words || [])
          .filter((w) => w && typeof w.text === 'string')
          .map((w) => ({ i: w.i, text: w.text, kind: w.kind || '' }));
        if (res?.run_id && words.length) {
          begin(words, res.run_id, res.rules, set.label);
          return;
        }
      } catch {
        /* 서버 없음 → 연습 판 */
      }
    }
    begin(localWords(set.pool), null, null, set.label);
  };

  // 홈 카드에서 열면 (목록이 내려가 있어도) 게임 머리부터 보이게
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  // 놀이 중에만 프레임을 돌린다
  useEffect(() => {
    if (phase !== 'play') return;
    const r = runRef.current;
    if (r) r.lastNow = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [phase, tick, stopLoop]);

  // 다른 탭·앱으로 가면 멈춘다 (멈춘 동안 단어는 가려 둔다)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && runRef.current && rafRef.current) {
        stopLoop();
        setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopLoop]);

  // 폰 키보드가 올라오면 하늘 높이를 줄여 입력 칸이 보이게
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    const on = () => root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    on();
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);

  useEffect(() => stopLoop, [stopLoop]);

  const shake = () => {
    const el = inputRef.current;
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('sn-miss');
    void el.offsetWidth;
    el.classList.add('sn-miss');
  };

  const submit = () => {
    const r = runRef.current;
    const el = inputRef.current;
    if (!r || !el || phase !== 'play' || !rafRef.current) return;
    const v = el.value.trim();
    el.value = '';
    if (!v) return;
    let best = -1;
    let by = -Infinity;
    r.live.forEach((l, i) => {
      if (l.w.text === v && l.y > by) {
        by = l.y;
        best = i;
      }
    });
    if (best < 0) {
      r.events.push({ type: 'miss', t: stamp(r) });
      r.scorer.miss();
      shake();
      syncHud();
      return;
    }
    const [l] = r.live.splice(best, 1);
    r.events.push({ type: 'hit', i: l.w.i, t: stamp(r) });
    r.scorer.hit(l.w);
    if (l.w.kind === 'galpi') r.frozenUntil = r.t + FREEZE_MS;
    if (prefersReducedMotion()) l.el.remove();
    else {
      l.el.style.setProperty('--t', `translate(${l.x}px,${l.y}px)`);
      l.el.classList.add('sn-hit');
      window.setTimeout(() => l.el.remove(), 260);
    }
    syncHud();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // 한글 조합 중 Enter — 조합이 끝난 뒤에 친다
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      window.setTimeout(submit, 0);
      return;
    }
    e.preventDefault();
    submit();
  };

  const resume = () => {
    setPhase('play');
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  const quit = () => {
    stopLoop();
    runRef.current = null;
    onBack();
  };

  const s = result?.server;
  const talents = s?.talents ?? (result && !result.practice ? rainTalents(result.score) : 0);
  const best = store.rainBest?.best;

  return (
    <div className="sn-ch-game" ref={rootRef}>
      <SnActionBar backLabel="챌린지" onBack={quit} />
      <PanelHead
        title="말씀 산성비"
        right={
          practice && phase !== 'pick' ? <span className="sn-ch-pill">연습 판</span> : undefined
        }
      />
      <div className="sn-rain">
        <div className="sn-rain-hud" aria-live="off">
          <span>
            점수 <b className="sn-mono">{num(hud.score)}</b>
          </span>
          <span>
            단계 <b className="sn-mono">{hud.level}</b>
          </span>
          <span>
            연속 <b className="sn-mono">{hud.combo}</b>
          </span>
          <span className="sn-rain-lives" role="img" aria-label={`남은 갈피 ${hud.lives}개`}>
            {Array.from({ length: runRef.current?.rules.lives ?? RAIN_LIVES }, (_, i) => (
              <i key={i} data-off={i >= hud.lives} />
            ))}
          </span>
        </div>
        <div
          className="sn-rain-sky"
          ref={skyRef}
          data-frozen={frozen}
          data-hide={phase === 'paused'}
        >
          <div className="sn-rain-ground" aria-hidden />
          {phase === 'pick' || phase === 'loading' ? (
            <div className="sn-rain-ov">
              <div className="sn-rain-card">
                <h3>말씀 산성비</h3>
                <p>
                  단어가 바닥에 닿기 전에 쳐서 없애세요. 금빛 단어는 점수 3배, 분홍 「갈피」는 3초
                  동안 모든 단어를 멈춰요.
                </p>
                <div className="sn-ch-sets" role="radiogroup" aria-label="떨어지는 말씀">
                  {sets.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      role="radio"
                      aria-checked={x.key === current.key}
                      className="sn-chip"
                      onClick={() => setSetKey(x.key)}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
                {anonymous && (
                  <p className="sn-ch-hint">연습 판 · 로그인하면 달란트와 랭킹에 올라가요</p>
                )}
                {best != null && !anonymous && <p className="sn-ch-hint">내 최고 {num(best)}점</p>}
                <button
                  type="button"
                  className="sn-btn sn-primary"
                  onClick={start}
                  disabled={phase === 'loading'}
                >
                  {phase === 'loading' ? '여는 중…' : '시작'}
                </button>
              </div>
            </div>
          ) : phase === 'paused' ? (
            <div className="sn-rain-ov">
              <div className="sn-rain-card">
                <h3>잠깐 멈췄어요</h3>
                <p>다른 화면에 다녀오는 동안 멈춰 두었어요.</p>
                <button type="button" className="sn-btn sn-primary" onClick={resume}>
                  이어 하기
                </button>
              </div>
            </div>
          ) : phase === 'finishing' ? (
            <div className="sn-rain-ov">
              <div className="sn-rain-card">
                <h3>{num(hud.score)}점</h3>
                <p>기록을 올리는 중이에요…</p>
              </div>
            </div>
          ) : phase === 'result' && result ? (
            <div className="sn-rain-ov">
              <div className="sn-rain-card" role="status">
                <h3>{num(result.score)}점</h3>
                {result.practice ? (
                  <>
                    <p>
                      연습 판 · 로그인하면 달란트와 랭킹
                      <br />
                      단계 {result.level} · 맞힌 단어 {result.hits}
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
                      <Coin size={18} /> 달란트 +{talents}
                      {s?.talents_capped ? ' · 오늘 게임 달란트를 다 채웠어요' : ''}
                    </p>
                    <p>
                      단계 {result.level} · 맞힌 단어 {result.hits}
                      {s?.is_best
                        ? ' · 내 최고 기록!'
                        : s?.best != null
                          ? ` · 최고 ${num(s.best)}점`
                          : ''}
                    </p>
                    {s?.valid === false && (
                      <p className="sn-ch-warn">입력이 너무 빨라 이번 판은 랭킹에서 빠졌어요.</p>
                    )}
                    {result.error && <p className="sn-ch-warn">{result.error}</p>}
                    {s?.ranks && (
                      <div className="sn-ch-ranks">
                        <div>
                          <b>{s.ranks.global != null ? `${num(s.ranks.global)}위` : '-'}</b>전체
                        </div>
                        <div>
                          <b>{s.ranks.church != null ? `${num(s.ranks.church)}위` : '-'}</b>우리
                          교회
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
                    다른 말씀
                  </button>
                  <button type="button" className="sn-btn sn-primary" onClick={start}>
                    다시 하기
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <form
          className="sn-rain-type"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="sn-rain-in" className="sn-sr">
            단어 입력
          </label>
          <input
            id="sn-rain-in"
            ref={inputRef}
            type="text"
            placeholder={
              phase === 'play' ? '여기에 단어를 치고 Enter' : '시작을 누르면 칠 수 있어요'
            }
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={phase !== 'play'}
            onKeyDown={onKeyDown}
            onFocus={() => inputRef.current?.scrollIntoView({ block: 'nearest' })}
          />
          <button
            type="submit"
            className="sn-btn sn-primary"
            disabled={phase !== 'play'}
            // 버튼을 눌러도 입력 칸 포커스(폰 키보드)를 잃지 않게
            onMouseDown={(e) => e.preventDefault()}
          >
            치기
          </button>
        </form>
      </div>
      <p className="sn-ch-hint">{current.label} · 100점마다 1달란트, 게임 달란트는 하루 30까지</p>
    </div>
  );
}
