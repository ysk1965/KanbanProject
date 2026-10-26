import { useEffect, useLayoutEffect, useRef, type ComponentType, type SVGProps } from 'react';
import type { SermonTabKey } from './SermonList';
import { liftIcon, notchPath, playTabVerb, SPRING, VERB_DELAY } from './tabMotion';
import { prefersReducedMotion } from './microFx';

interface Tab {
  k: SermonTabKey;
  short: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface Props {
  tabs: Tab[];
  tab: SermonTabKey;
  badge: (k: SermonTabKey) => string | null;
  onGo: (k: SermonTabKey) => void;
}

const ORB = 52;
const ORB_TOP = -22;
const LIFT_SCALE = 1.18;

/**
 * 좁은 화면(설치 앱) 하단 바 — 「오목 자리」.
 * 바 윗선에 오목한 자리가 패여 탭 색 동그라미가 앉고, 누른 아이콘이 그대로 솟아 동그라미 위에 올라간다.
 * 자리·동그라미는 스프링으로 미끄러지고(빠를수록 살짝 납작해짐), 아이콘은 그 탭의 「한 동작」을 한 번 한다.
 */
export function SermonBottomNav({ tabs, tab, badge, onGo }: Props) {
  const navRef = useRef<HTMLElement>(null);
  const shapeRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const orbRef = useRef<HTMLSpanElement>(null);
  const s = useRef({ x: null as number | null, prev: -1, raf: 0, verb: 0 });
  const active = Math.max(
    0,
    tabs.findIndex((t) => t.k === tab),
  );

  const draw = (x: number, vel: number) => {
    const nav = navRef.current;
    if (!nav || !shapeRef.current || !pathRef.current || !orbRef.current) return;
    const w = nav.clientWidth;
    const h = nav.clientHeight;
    shapeRef.current.setAttribute('viewBox', `0 0 ${w} ${h}`);
    pathRef.current.setAttribute('d', notchPath(w, h, x));
    const q = Math.min(Math.abs(vel) / 1800, 0.45);
    orbRef.current.style.transform = `translateX(${x - ORB / 2}px) scale(${1 + q * 0.3}, ${1 - q * 0.18})`;
  };

  /** i 번째 아이콘이 동그라미 가운데까지 올라갈 거리 */
  const liftFor = (i: number) => {
    const nav = navRef.current;
    const wrap = nav?.querySelectorAll<HTMLElement>('.sn-bn-ic')[i];
    if (!nav || !wrap) return null;
    const dy =
      nav.getBoundingClientRect().top +
      ORB_TOP +
      ORB / 2 -
      wrap.getBoundingClientRect().top -
      wrap.offsetHeight / 2;
    return `translateY(${dy.toFixed(1)}px) scale(${LIFT_SCALE})`;
  };
  const liftEl = (i: number) =>
    navRef.current?.querySelectorAll<HTMLElement>('.sn-bn-lift')[i] ?? null;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const st = s.current;
    if (!nav || !nav.clientWidth) return;
    const to = ((active + 0.5) * nav.clientWidth) / tabs.length;
    const first = st.x === null || st.prev < 0;
    if (st.prev !== active) {
      if (st.prev >= 0) liftIcon(liftEl(st.prev), null, !first);
      liftIcon(liftEl(active), liftFor(active), !first);
      if (!first) {
        const k = tabs[active].k;
        const svg = liftEl(active)?.querySelector('svg');
        window.clearTimeout(st.verb);
        st.verb = window.setTimeout(() => playTabVerb(k, svg), VERB_DELAY);
      }
      st.prev = active;
    }
    cancelAnimationFrame(st.raf);
    const from = st.x ?? to;
    if (first || from === to || prefersReducedMotion()) {
      st.x = to;
      draw(to, 0);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / SPRING.ms);
      const [pos, vel] = SPRING.at(p);
      st.x = from + (to - from) * pos;
      draw(st.x, (to - from) * vel);
      if (p < 1) st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }, [active, tabs]);

  // 화면 폭이 바뀌면 움직이지 않고 제자리로
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const st = s.current;
    const ro = new ResizeObserver(() => {
      if (!nav.clientWidth || st.prev < 0) return;
      cancelAnimationFrame(st.raf);
      st.x = ((st.prev + 0.5) * nav.clientWidth) / tabs.length;
      draw(st.x, 0);
      liftIcon(liftEl(st.prev), liftFor(st.prev), false);
    });
    ro.observe(nav);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(st.raf);
      window.clearTimeout(st.verb);
    };
  }, [tabs.length]);

  return (
    <nav ref={navRef} className="sn-bnav" aria-label="갈피 탭">
      <svg ref={shapeRef} className="sn-bn-shape" preserveAspectRatio="none" aria-hidden>
        <path ref={pathRef} />
      </svg>
      <span ref={orbRef} className="sn-bn-orb" data-k={tab} aria-hidden />
      {tabs.map(({ k, short, label, Icon }) => {
        const b = badge(k);
        return (
          <button
            key={k}
            type="button"
            data-k={k}
            aria-label={label}
            aria-current={tab === k ? 'page' : undefined}
            onClick={() => onGo(k)}
          >
            <span className="sn-bn-ic">
              <span className="sn-bn-lift">
                <Icon aria-hidden />
              </span>
              {b && (
                <span className="sn-bnav-badge" data-k={k} aria-label={b}>
                  {k === 'challenge' ? b : ''}
                </span>
              )}
            </span>
            {short}
          </button>
        );
      })}
    </nav>
  );
}
