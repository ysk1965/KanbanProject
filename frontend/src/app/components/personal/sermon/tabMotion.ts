import { prefersReducedMotion } from './microFx';
import type { SermonTabKey } from './SermonList';

/**
 * 하단 바(오목 자리)와 탭 아이콘의 움직임.
 * 동그라미 이동·아이콘 솟기·아이콘 동작이 모두 스프링 하나(강성 800, 감쇠 38)를 쓴다.
 * 약 0.39초에 멈추고 5% 지나쳤다 돌아오며, 동작까지 합쳐 0.45초 안에 끝난다.
 */
export const SPRING = (() => {
  const k = 800;
  const c = 38;
  const dt = 1 / 600;
  let x = 0;
  let v = 0;
  let t = 0;
  const pts: Array<[number, number]> = [[0, 0]];
  while (t < 2) {
    v += (k * (1 - x) - c * v) * dt;
    x += v * dt;
    t += dt;
    pts.push([x, v]);
    if (t > 0.1 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
  }
  /** p(0~1) 시점의 [위치, 속도(초당)] */
  const at = (p: number) =>
    pts[Math.min(pts.length - 1, Math.max(0, Math.round(p * (pts.length - 1))))];
  const stops = Array.from({ length: 37 }, (_, i) => at(i / 36)[0].toFixed(4)).join(', ');
  const easing =
    typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')
      ? `linear(${stops})`
      : 'cubic-bezier(0.3, 1.3, 0.5, 1)';
  return { ms: t * 1000, at, easing };
})();

/** 깃발 윤곽 — 물결이 a 만 바꿔 다시 그린다 (a=0 이 기본 모양) */
export const flagPath = (a: number) =>
  `M9 2.8Q11.8 ${2.8 + a} 14.6 2.8L13 4.7L14.6 6.6Q11.8 ${6.6 + a} 9 6.6Z`;

const OUT = 'cubic-bezier(0.25, 0.8, 0.3, 1)';
/** 누른 뒤 아이콘 동작이 시작되기까지 — 솟는 도중에 겹쳐 시작한다 */
export const VERB_DELAY = 110;

function run(
  el: Element | null | undefined,
  kf: Keyframe[],
  ms: number,
  opt: KeyframeAnimationOptions = {},
) {
  if (!el || typeof el.animate !== 'function') return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(kf, { duration: ms, easing: SPRING.easing, ...opt });
}

const flagRaf = new WeakMap<Element, number>();
function wave(flag: Element | null) {
  if (!flag) return;
  cancelAnimationFrame(flagRaf.get(flag) ?? 0);
  const start = performance.now();
  const f = (now: number) => {
    const p = Math.min(1, (now - start) / 420);
    flag.setAttribute('d', flagPath(Math.sin(p * Math.PI * 2.4) * 1.5 * (1 - p)));
    if (p < 1) flagRaf.set(flag, requestAnimationFrame(f));
  };
  flagRaf.set(flag, requestAnimationFrame(f));
}

/** 탭마다 그 탭이 하는 일을 한 번 해 보인다 (300ms 안팎, 윤곽 단위) */
const VERBS: Record<SermonTabKey, (s: SVGSVGElement) => void> = {
  note(s) {
    const o = { easing: OUT };
    run(
      s.querySelector('.sn-ti-pen'),
      [{ transform: 'translate(-7px, .7px) rotate(-6deg)' }, { transform: 'none' }],
      300,
      o,
    );
    run(s.querySelector('.sn-ti-ink'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], 300, o);
  },
  groups(s) {
    const o = { easing: 'ease-in-out' };
    run(
      s.querySelector('.sn-ti-pl'),
      [{ transform: 'none' }, { transform: 'rotate(11deg)', offset: 0.4 }, { transform: 'none' }],
      320,
      o,
    );
    run(
      s.querySelector('.sn-ti-pr'),
      [{ transform: 'none' }, { transform: 'rotate(-11deg)', offset: 0.4 }, { transform: 'none' }],
      320,
      { ...o, delay: 30 },
    );
  },
  bible(s) {
    run(
      s.querySelector('.sn-ti-bk'),
      [{ transform: 'scaleX(.2) rotate(-8deg)' }, { transform: 'none' }],
      SPRING.ms,
    );
    run(
      s.querySelector('.sn-ti-cross'),
      [{ transform: 'scale(0)' }, { transform: 'none' }],
      SPRING.ms,
      { delay: 90, fill: 'backwards' },
    );
  },
  challenge(s) {
    run(
      s.querySelector('.sn-ti-pole'),
      [{ transform: 'translateY(5px) scaleY(.5)' }, { transform: 'none' }],
      SPRING.ms,
    );
    wave(s.querySelector('.sn-ti-flag'));
  },
  me(s) {
    run(
      s.querySelector('.sn-ti-mas'),
      [
        { transform: 'none' },
        { transform: 'scale(1.12, .86)', offset: 0.18 },
        { transform: 'translateY(-3.5px) scale(.92, 1.1)', offset: 0.48 },
        { transform: 'scale(1.06, .94)', offset: 0.78 },
        { transform: 'none' },
      ],
      340,
      { easing: 'ease-out' },
    );
    run(
      s.querySelector('.sn-ti-eyes'),
      [{ transform: 'none' }, { transform: 'scaleY(.1)', offset: 0.5 }, { transform: 'none' }],
      140,
      { delay: 270, easing: 'ease-in-out' },
    );
  },
};

export function playTabVerb(k: SermonTabKey, svg: SVGSVGElement | null | undefined) {
  if (!svg || prefersReducedMotion()) return;
  VERBS[k](svg);
}

/** 아이콘을 동그라미 자리로 올리거나(up) 제자리로 내린다. 움직이는 중이면 그 자리에서 이어 간다 */
export function liftIcon(el: HTMLElement | null, up: string | null, animate: boolean) {
  if (!el) return;
  const from = getComputedStyle(el).transform;
  el.getAnimations().forEach((a) => a.cancel());
  const to = up ?? 'none';
  el.style.transform = to;
  if (!animate || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ transform: from === 'none' ? 'none' : from }, { transform: to }], {
    duration: up ? SPRING.ms : 260,
    easing: up ? SPRING.easing : OUT,
  });
}

/**
 * 바 윗선에 판 오목 자리 — 동그라미(가운데 cy, 반지름 r)를 같은 두께로 감싸는 원호 홈.
 * 윗선과 만나는 모서리는 f 만큼 둥글린다. cx = 자리 가운데, h = 바 높이.
 */
export function notchPath(w: number, h: number, cx: number, cy: number, r: number, f = 10) {
  const yy = Math.min(f, cy + r - 2);
  const dx = Math.sqrt(Math.max(0, r * r - cy * cy));
  const ex = Math.sqrt(Math.max(0, r * r - (yy - cy) ** 2));
  const large = yy < cy ? 1 : 0;
  const n = (v: number) => v.toFixed(2);
  return `M0 0 H${n(cx - dx - f)} Q${n(cx - dx)} 0 ${n(cx - ex)} ${n(yy)} A${r} ${r} 0 ${large} 0 ${n(cx + ex)} ${n(yy)} Q${n(cx + dx)} 0 ${n(cx + dx + f)} 0 H${w} V${h} H0 Z`;
}
