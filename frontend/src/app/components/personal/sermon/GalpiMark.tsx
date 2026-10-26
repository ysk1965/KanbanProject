/** 갈피 리본 표시 — 갈피 예배·이번 주 갈피·모임 갈피 수에 같은 모양으로 쓴다 (분홍 잉크 g2) */
export function GalpiMark({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`sn-gmark ${className}`}
      width={(size * 24) / 28}
      height={size}
      viewBox="0 0 24 28"
      aria-hidden
    >
      <path d="M3 3.5Q3 1 5.5 1h13Q21 1 21 3.5V26l-9-5.5L3 26z" fill="var(--sn-g2)" />
      <rect x="8.2" y="8" width="2" height="4" rx="1" fill="var(--sn-on-ink)" />
      <rect x="13.8" y="8" width="2" height="4" rx="1" fill="var(--sn-on-ink)" />
    </svg>
  );
}
