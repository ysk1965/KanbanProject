import { faceColor, initial } from './groupStore';

/** 멤버 얼굴 묶음 — 최대 max 명, 넘치면 +n. galpi 면 오른쪽 위에 작은 분홍 리본 */
export function Faces({
  people,
  max = 3,
  size = 22,
  className = '',
}: {
  people: Array<{ user_id: string; display_name: string; off?: boolean; galpi?: boolean }>;
  max?: number;
  size?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className={`sg-faces ${className}`} style={{ ['--f' as string]: `${size}px` }}>
      {shown.map((p) => (
        <i
          key={p.user_id}
          data-off={p.off || undefined}
          data-galpi={p.galpi || undefined}
          style={p.off ? undefined : { background: faceColor(p.user_id) }}
          title={p.galpi ? `${p.display_name} · 이 설교에 갈피` : p.display_name}
        >
          {initial(p.display_name)}
        </i>
      ))}
      {more > 0 && <i className="sg-more">+{more}</i>}
    </span>
  );
}
