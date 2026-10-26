import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from '../bibleRefs';
import { useBible, verses } from '../useBible';
import { poolFromRefs } from './wordPool';
import { nextChapter, type PilsaPlan, type PilsaReason } from './pilsaStore';
import './gameWindow.css';

/**
 * 챌린지 홈 게임 카드의 「살아 있는 창」 — 카드 위가 그 게임의 작은 화면이 된다.
 * 장식이라 aria-hidden. 화면에 보일 때만 움직이고(data-play), 모션 줄이기면 멈춘 한 장면.
 * 멈춰 있어도 낱말·책이 흩어진 상태로 보이도록 음수 delay 로 시작 위치를 나눈다.
 */

function usePlayWhenVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPlay(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, play] as const;
}

const FALLBACK_WORDS = ['포도나무', '가지', '열매', '사랑', '거하라', '목자'];
const LANES = [6, 48, 26, 66, 38, 12];

/** 이번 주 설교 구절에서 2~4자 낱말 몇 개를 고른다 (성경 데이터 전이면 대체 낱말) */
function previewWords(refs: Ref[] | undefined): string[] {
  const pool = refs?.length ? poolFromRefs(refs) : [];
  const short = pool.filter((w) => w.length >= 2 && w.length <= 4);
  const pick = (short.length >= 4 ? short : pool).slice(0, 4);
  return pick.length >= 3 ? pick : FALLBACK_WORDS.slice(0, 4);
}

export function RainWindow({ refs }: { refs?: Ref[] }) {
  const [ref, play] = usePlayWhenVisible<HTMLDivElement>();
  const words = useMemo(() => {
    const base = previewWords(refs);
    // 금빛 「은혜」·분홍 「갈피」는 게임 안 특수 낱말 색 그대로
    return [base[0], '은혜', base[1], '갈피', base[2], base[3]].filter(Boolean) as string[];
  }, [refs]);
  return (
    <div ref={ref} className="sn-gw sn-gw-rain" data-play={play || undefined} aria-hidden>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="sn-gw-word"
          data-kind={w === '은혜' ? 'gold' : w === '갈피' ? 'galpi' : undefined}
          style={{
            left: `${LANES[i % LANES.length]}%`,
            animationDelay: `-${(i * 1.17).toFixed(2)}s`,
          }}
        >
          {w}
        </span>
      ))}
      <div className="sn-gw-ground">
        <span className="sn-gw-town" />
        <span className="sn-gw-input">낱말 입력…</span>
      </div>
    </div>
  );
}

const PILSA_FALLBACK =
  '우리가 아직 연약할 때에 기약대로 그리스도께서 경건치 않은 자를 위하여 죽으셨도다';
const RIB_KIND: Record<PilsaReason, string> = {
  main: 'main',
  cited: 'cited',
  near: 'near',
  next: 'next',
  common: 'cited',
};

/**
 * 필사 창 — 펼친 노트에 오늘 쓸 절이 한 글자씩 써지고, 위에 이번 주 가름끈 일곱 개가 매달려 있다.
 * 다 쓴 장은 물든 색, 오늘 쓸 장은 노란 끈이 살랑거린다.
 */
export function PilsaWindow({ plan }: { plan: PilsaPlan | null }) {
  const [ref, play] = usePlayWhenVisible<HTMLDivElement>();
  useBible(); // 본문이 들어오면 다시 그린다
  const next = nextChapter(plan);
  const verseNo = next ? (next.done.length ? Math.max(...next.done) + 1 : 1) : 1;
  const text =
    (next && verses({ b: next.b, c: next.c, v1: verseNo, v2: verseNo, whole: false })?.[0]?.[1]) ||
    PILSA_FALLBACK;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!play || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setN((x) => (x >= text.length + 10 ? 0 : x + 1)), 150);
    return () => window.clearInterval(id);
  }, [play, text]);
  const shownN = play ? Math.min(n, text.length) : Math.min(18, text.length);
  const chapters = plan?.chapters ?? [];
  return (
    <div ref={ref} className="sn-gw sn-gw-pilsa" data-play={play || undefined} aria-hidden>
      <div className="sn-gw-hang">
        {Array.from({ length: 7 }, (_, i) => {
          const ch = chapters[i];
          const full = ch && ch.done.length >= ch.verses;
          const now = ch && next && ch.b === next.b && ch.c === next.c;
          return (
            <span
              key={i}
              className="sn-gw-rb"
              data-k={ch ? RIB_KIND[ch.reason] : undefined}
              data-s={full ? 'on' : now ? 'now' : undefined}
            />
          );
        })}
      </div>
      <div className="sn-gw-spread">
        <div className="sn-gw-pg">
          <b>{verseNo}</b> <span className="sn-gw-ink">{text.slice(0, shownN)}</span>
          <i className="sn-gw-caret" />
          {text.slice(shownN)}
        </div>
      </div>
    </div>
  );
}

/** 오늘 받을 수 있는 게임 달란트를 동전 6칸으로 (받은 만큼 찬다) */
export function CoinDots({ got, cap }: { got: number; cap: number }) {
  const filled = cap > 0 ? Math.round((Math.min(got, cap) / cap) * 6) : 0;
  return (
    <span className="sn-gw-coins" role="img" aria-label={`오늘 게임 달란트 ${got}/${cap}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} data-on={i < filled || undefined} />
      ))}
    </span>
  );
}
