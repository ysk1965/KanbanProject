import { useMemo } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface CompletionParticlesProps {
  active: boolean;
  count?: number;
  variant?: 'bar' | 'chip';
}

const COLORS = ['#22c55e', '#4ade80', '#86efac', '#ffffff', '#2dd4bf', '#34d399'];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function CompletionParticles({ active, count = 16, variant = 'bar' }: CompletionParticlesProps) {
  const reduced = useReducedMotion();
  const particles = useMemo(() => {
    if (!active) return [];

    const isChip = variant === 'chip';
    const particleCount = isChip ? Math.min(count, 10) : count;

    return Array.from({ length: particleCount }, (_, i) => {
      // 360도 방사형 — 위쪽에 약간 가중치
      const angle = rand(0, 360);
      const distance = isChip ? rand(12, 30) : rand(18, 55);
      const rad = (angle * Math.PI) / 180;
      const px = Math.cos(rad) * distance;
      const py = Math.sin(rad) * distance * (angle > 180 && angle < 360 ? 0.7 : 1); // 위로 더 멀리
      const size = rand(2, isChip ? 4 : 5.5);
      // 첫 웨이브(0~0.05s)와 둘째 웨이브(0.08~0.2s)로 나눠서 "팍" 느낌
      const delay = i < particleCount * 0.6 ? rand(0, 0.05) : rand(0.08, 0.2);
      const duration = rand(0.4, 0.75);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];

      return { id: i, px, py, size, delay, duration, color };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, count, variant]);

  if (reduced || !active || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-visible pointer-events-none z-10">
      {/* 중심 플래시 — 터지는 순간 빛 */}
      <div
        className="completion-flash"
        style={{
          left: '100%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {/* 방사형 파티클 */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="completion-particle"
          style={{
            '--px': `${p.px}px`,
            '--py': `${p.py}px`,
            '--size': `${p.size}px`,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
            '--x': '100%',
            '--y': '50%',
            '--particle-color': p.color,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
