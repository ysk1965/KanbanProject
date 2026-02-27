import type { CSSProperties } from 'react';

export const INSIGHT_CHART_COLORS = [
  '#6366F1', '#2DD4BF', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#10B981', '#3B82F6',
];

export function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatMinutesToCompactHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.round(minutes / 6) / 10;
  return `${h.toLocaleString()}h`;
}

/**
 * Chart tooltip/grid styles that adapt to light/dark mode via CSS variables
 */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-bridge-obsidian)',
  border: '1px solid var(--color-bridge-border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-foreground)',
};

export const CHART_GRID_STROKE = 'var(--color-bridge-border)';
export const CHART_AXIS_FILL = 'var(--color-muted-foreground, #94a3b8)';

/**
 * Group board breakdown into top N + "Others" for mini bar charts.
 */
export function groupBreakdownTopN(
  breakdown: { board_id: string; board_name: string; work_minutes: number; percentage: number }[],
  topN = 3,
): { board_id: string; board_name: string; work_minutes: number; percentage: number }[] {
  if (breakdown.length <= topN) return breakdown;

  const sorted = [...breakdown].sort((a, b) => b.work_minutes - a.work_minutes);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);

  const othersMinutes = rest.reduce((sum, b) => sum + b.work_minutes, 0);
  const othersPercentage = rest.reduce((sum, b) => sum + b.percentage, 0);

  if (othersMinutes > 0) {
    top.push({
      board_id: '__others__',
      board_name: 'Others',
      work_minutes: othersMinutes,
      percentage: Math.round(othersPercentage * 10) / 10,
    });
  }

  return top;
}
