import { useId, useState, type CSSProperties } from 'react';
import type { MascotId } from './sermonLook';

/**
 * 설교 노트 마스코트. 얼굴은 눈 두 개뿐이고, 감정은 눈 모양과 몸짓으로만 낸다.
 * 상태: idle(둥실) · listen(설교 듣는 중) · done(적용 완료) · think(기다림) · sleep(다음 주일 대기)
 * 움직임 줄이기 설정이면 CSS 가 애니메이션을 모두 멈춘다 (sermon.css 「마스코트」).
 */
export type MascotState = 'idle' | 'listen' | 'done' | 'think' | 'sleep';

interface MascotProps {
  kind: MascotId;
  state?: MascotState;
  size?: number;
  className?: string;
  /** 장식용이면 생략 — 기본은 스크린리더에서 숨김 */
  label?: string;
}

interface Shape {
  fill: string;
  dot: string;
  ey: number;
  sh: number;
  bx: number;
  stroke?: boolean;
  d: string;
  hl: JSX.Element;
}

const SHAPES: Record<MascotId, Shape> = {
  galpi: {
    fill: 'var(--sn-g2)',
    dot: 'var(--sn-t2)',
    ey: 34,
    sh: 98,
    bx: 17,
    d: 'M30 6 h40 a8 8 0 0 1 8 8 v80 l-28 -15 l-28 15 v-80 a8 8 0 0 1 8 -8z',
    hl: <rect className="sn-m-hl" x="30" y="14" width="6" height="22" rx="3" />,
  },
  dong: {
    fill: 'var(--sn-g2)',
    dot: 'var(--sn-t2)',
    ey: 46,
    sh: 94,
    bx: 20,
    d: 'M50 14 a40 40 0 1 1 0 80 a40 40 0 1 1 0 -80z',
    hl: <ellipse className="sn-m-hl" cx="34" cy="34" rx="9" ry="6" transform="rotate(-30 34 34)" />,
  },
  bang: {
    fill: 'var(--sn-g1)',
    dot: 'var(--sn-t1)',
    ey: 56,
    sh: 102,
    bx: 20,
    d: 'M50 8 C62 26 88 42 88 62 A38 38 0 0 1 12 62 C12 42 38 26 50 8Z',
    hl: <ellipse className="sn-m-hl" cx="36" cy="48" rx="7" ry="5" transform="rotate(-35 36 48)" />,
  },
  banjjak: {
    fill: '#ffe27a',
    dot: '#c48a00',
    ey: 44,
    sh: 100,
    bx: 20,
    stroke: true,
    d: 'M50 4 C55 30 70 45 96 50 C70 55 55 70 50 96 C45 70 30 55 4 50 C30 45 45 30 50 4Z',
    hl: (
      <ellipse className="sn-m-hl" cx="42" cy="38" rx="5" ry="3.5" transform="rotate(-30 42 38)" />
    ),
  },
};

export function Mascot({ kind, state = 'idle', size = 64, className = '', label }: MascotProps) {
  const id = useId().replace(/:/g, '');
  const [jump, setJump] = useState(0);
  const s = SHAPES[kind] ?? SHAPES.galpi;
  const y = s.ey;
  const style = { '--m-sz': `${size}px` } as CSSProperties;

  return (
    <span
      className={`sn-m ${className}`}
      data-state={state}
      data-jump={jump ? (jump % 2 ? 'a' : 'b') : undefined}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onClick={() => setJump((j) => j + 1)}
    >
      <svg viewBox="-6 -14 112 124">
        <defs>
          <pattern id={`p${id}`} width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.4" fill={s.dot} />
          </pattern>
          <clipPath id={`c${id}`}>
            <path d={s.d} />
          </clipPath>
        </defs>
        <ellipse className="sn-m-shadow" cx="50" cy={s.sh} rx="26" ry="4" />
        <g className="sn-m-ring">
          <circle cx="50" cy="54" r="44" />
          <circle cx="50" cy="54" r="44" />
        </g>
        <g className="sn-m-body">
          <path
            d={s.d}
            fill={s.fill}
            {...(s.stroke
              ? { stroke: s.fill, strokeWidth: 8, strokeLinejoin: 'round' as const }
              : {})}
          />
          <g clipPath={`url(#c${id})`}>
            <rect x="40" y="-10" width="80" height="120" fill={`url(#p${id})`} opacity="0.28" />
          </g>
          {s.hl}
          <ellipse className="sn-m-blush" cx={50 - s.bx} cy={y + 16} rx="6" ry="3.5" />
          <ellipse className="sn-m-blush" cx={50 + s.bx} cy={y + 16} rx="6" ry="3.5" />
          <g className="sn-m-open">
            <rect className="sn-m-eye" x="36" y={y} width="8.5" height="16" rx="4.25" />
            <rect className="sn-m-eye" x="55.5" y={y} width="8.5" height="16" rx="4.25" />
          </g>
          <g className="sn-m-happy">
            <path d={`M35 ${y + 10} q5 -8 10 0`} />
            <path d={`M55 ${y + 10} q5 -8 10 0`} />
          </g>
          <g className="sn-m-shut">
            <path d={`M35 ${y + 9} q5 4 10 0`} />
            <path d={`M55 ${y + 9} q5 4 10 0`} />
          </g>
        </g>
        <g className="sn-m-fx">
          <path d="M10 10 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
          <path d="M88 6 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" />
          <path d="M92 62 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        </g>
        <g className="sn-m-zz">
          <text x="78" y="16" fontSize="16">
            z
          </text>
          <text x="88" y="2" fontSize="12">
            z
          </text>
        </g>
      </svg>
    </span>
  );
}
