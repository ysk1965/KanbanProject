import type { SVGProps } from 'react';
import { flagPath } from './tabMotion';

/**
 * 갈피 다섯 탭 아이콘. 24 격자·선 1.9 로 Lucide 와 같은 규칙을 따르되,
 * 작게·흐리게 봐도 서로 구분되도록 윤곽을 다르게 그렸다 (노트=연필, 성경=십자가 책, 나의 갈피=마스코트 얼굴).
 * 안쪽 class(sn-ti-*)는 tabMotion.ts 의 「한 동작」이 움직이는 부분이다.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ className, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`sn-ti${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function NoteTabIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="sn-ti-pen">
        <path className="sn-ti-f" d="M9.5 19.5L10.5 15.5L19 7A2.1 2.1 0 0 1 22 10L13.5 18.5Z" />
        <path d="M10.5 15.5L13.5 18.5" />
      </g>
      <path
        className="sn-ti-ink"
        pathLength={1}
        d="M2.5 20.2c1.2-1.3 2.3-1.3 3.4 0s2.3 1.1 3.6-.7"
      />
    </Svg>
  );
}

export function GroupsTabIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="sn-ti-pl">
        <circle className="sn-ti-f" cx="8" cy="7.5" r="3.2" />
        <path className="sn-ti-f" d="M2.5 20.5v-1a5.5 5.5 0 0 1 11 0v1z" />
      </g>
      <g className="sn-ti-pr">
        <circle className="sn-ti-f" cx="16.9" cy="8.9" r="2.7" />
        <path className="sn-ti-f" d="M15.4 20.5h6.1v-1.7a4.7 4.7 0 0 0-6.8-4.2" />
      </g>
    </Svg>
  );
}

export function BibleTabIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="sn-ti-bk">
        <path className="sn-ti-f" d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z" />
        <path d="M5 20a2 2 0 0 0 2 2h12v-4" />
        <g className="sn-ti-cross">
          <path d="M12 6.3v7.6" />
          <path d="M9.2 9.1h5.6" />
        </g>
      </g>
    </Svg>
  );
}

export function ChallengeTabIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path className="sn-ti-f" d="M2 21L9 10l3.2 5 2.3-3.4L22 21z" />
      <g className="sn-ti-pole">
        <path d="M9 10V2.8" />
        <path className="sn-ti-flag sn-ti-f" d={flagPath(0)} />
      </g>
    </Svg>
  );
}

export function MeTabIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <g className="sn-ti-mas">
        <path
          className="sn-ti-f"
          d="M6.5 2.5h11A1.5 1.5 0 0 1 19 4v17.5l-7-4-7 4V4a1.5 1.5 0 0 1 1.5-1.5z"
        />
        <g className="sn-ti-eyes">
          <circle className="sn-ti-dot" cx="9.6" cy="10" r="1.25" />
          <circle className="sn-ti-dot" cx="14.4" cy="10" r="1.25" />
        </g>
        <path d="M10.3 13.2q1.7 1.2 3.4 0" />
      </g>
    </Svg>
  );
}
