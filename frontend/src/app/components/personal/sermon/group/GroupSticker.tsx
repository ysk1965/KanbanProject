import type { CSSProperties, ReactNode } from 'react';

/** 모임마다 고정된 스티커 색 (1=g1 면, 2=g2 면, 3=g3 면) — id 로 정한다 */
export function stickerTone(id: string): 1 | 2 | 3 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 3) + 1) as 1 | 2 | 3;
}

/** 모임 스티커 기울기 — 모임마다 다르게, 같은 모임은 늘 같게 */
export function stickerTilt(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0;
  return (h % 11) - 5;
}

/**
 * 모임 스티커 — 모임 만들기에서 받은 둥근 톱니 스티커. 목록·모임 머리·사이드바가 크기만 바꿔 쓴다.
 * size 가 작으면(<120) 종류·부제는 생략한다.
 */
export function GroupSticker({
  name,
  kind,
  sub,
  size = 200,
  tone = 1,
  tilt = -4,
  className = '',
  children,
  ...rest
}: {
  name: string;
  kind?: string;
  sub?: string;
  size?: number;
  tone?: 1 | 2 | 3;
  tilt?: number;
  className?: string;
  children?: ReactNode;
  'data-bump'?: number;
  'data-drop'?: boolean;
}) {
  const small = size < 120;
  const style = { '--sg-stk': `${size}px`, '--sg-tilt': `${tilt}deg` } as CSSProperties;
  return (
    <div
      className={`sg-stk ${className}`}
      data-tone={tone}
      data-small={small || undefined}
      style={style}
      {...rest}
    >
      <span className="sg-die" aria-hidden />
      <span className="sg-stk-face" aria-hidden />
      <div className="sg-stk-in">
        {!small && kind && <span className="sg-stk-kind">{kind}</span>}
        <span className="sg-stk-name" data-ph={!name || undefined}>
          {name || '모임 이름'}
        </span>
        {!small && sub && <span className="sg-stk-sub">{sub}</span>}
      </div>
      {children}
    </div>
  );
}
