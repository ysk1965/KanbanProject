import type { ReactNode } from 'react';
import './challenge.css';

/**
 * 달란트 동전 — 겨자씨 새싹. 16~18 작게(굵은 선) / 20~26 보통 / 28↑ 링·판어긋남.
 * play="gain": 뒤집히며 새싹이 돋고 반짝인다(적립 순간 한 번). 버튼·지갑에 올리면 잎이 흔들린다(css).
 */
export function Coin({ size = 20, play }: { size?: number; play?: 'gain' }) {
  const mini = size <= 18;
  const big = size >= 28;
  return (
    <svg
      className={play ? `sn-coin is-${play}` : 'sn-coin'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
    >
      {big && <circle className="sn-coin-mis" cx="13.1" cy="13.1" r="10" />}
      <circle className="sn-coin-face" cx="12" cy="12" r="10" strokeWidth={mini ? 1.8 : 1.4} />
      {big && <circle className="sn-coin-ring" cx="12" cy="12" r="7.3" />}
      <path className="sn-coin-stem" d="M12 17.2V11" strokeWidth={mini ? 2 : 1.6} />
      <g className="sn-coin-leaf">
        <path d="M12 12.6C9.3 12.6 7.6 11 7.6 8.4 10.3 8.4 12 10 12 12.6Z" />
        <path d="M12 11.2C12 8.4 13.9 6.7 16.6 6.7 16.6 9.5 14.7 11.2 12 11.2Z" />
      </g>
      {play === 'gain' && (
        <g className="sn-coin-spark">
          <circle cx="2.6" cy="5.2" r="1.3" />
          <circle cx="21.4" cy="3.6" r="1.1" />
          <circle cx="22.4" cy="18.2" r="1.3" />
        </g>
      )}
    </svg>
  );
}

/** 게임·랭킹 화면 머리 — 제목 + 오른쪽 (뒤로는 SnActionBar) */
export function PanelHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="sn-ch-head">
      <h2>{title}</h2>
      {right && <div className="sn-ch-head-r">{right}</div>}
    </div>
  );
}

/** 서버가 아직 없을 때·로그인 전 안내 한 칸 */
export function SoonNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sn-ch-soon" role="status">
      <div>{children}</div>
      {action}
    </div>
  );
}
