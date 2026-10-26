import type { ReactNode } from 'react';
import './challenge.css';

/** 달란트 동전 */
export function Coin({ size = 20 }: { size?: number }) {
  return (
    <span
      className="sn-coin"
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.55)) }}
    >
      달
    </span>
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
