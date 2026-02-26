import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Treemap,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { OrgBoardResourceResponse } from '../../../../types';
import { INSIGHT_CHART_COLORS, formatMinutesToHours, CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_AXIS_FILL } from './insightsUtils';

interface ResourceDistributionChartProps {
  data: OrgBoardResourceResponse | null;
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  index?: number;
}

function CustomTreemapContent({ x = 0, y = 0, width = 0, height = 0, name = '', index = 0 }: TreemapContentProps) {
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={INSIGHT_CHART_COLORS[index % INSIGHT_CHART_COLORS.length]}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
        rx={4}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={11}
        fontWeight={600}
      >
        {name.length > 12 ? name.slice(0, 12) + '...' : name}
      </text>
    </g>
  );
}

export function ResourceDistributionChart({ data }: ResourceDistributionChartProps) {
  const { t } = useTranslation();

  const treemapData = useMemo(() => {
    if (!data?.boards) return [];
    return data.boards
      .filter((b) => b.total_work_minutes > 0)
      .map((b) => ({
        name: b.board.name,
        size: b.total_work_minutes,
      }));
  }, [data]);

  const { weeklyData, boardNames } = useMemo(() => {
    if (!data?.resource_distribution?.weekly_trend) return { weeklyData: [], boardNames: [] as string[] };

    const names = new Set<string>();
    data.resource_distribution.weekly_trend.forEach((w) => {
      w.boards.forEach((b) => names.add(b.board_name));
    });
    const boardNamesList = Array.from(names);

    const processed = data.resource_distribution.weekly_trend.map((w) => {
      const d = new Date(w.week_start);
      const entry: Record<string, string | number> = {
        weekLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      };
      boardNamesList.forEach((name) => {
        const board = w.boards.find((b) => b.board_name === name);
        entry[name] = board ? Math.round(board.work_minutes / 60 * 10) / 10 : 0;
      });
      return entry;
    });

    return { weeklyData: processed, boardNames: boardNamesList };
  }, [data]);

  if (!data || (treemapData.length === 0 && weeklyData.length === 0)) return null;

  return (
    <div className="space-y-6">
      {/* Treemap */}
      {treemapData.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-5">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-4">
            {t('organization.insights.boards.resourceDistribution', 'Resource Distribution')}
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <Treemap
              data={treemapData}
              dataKey="size"
              nameKey="name"
              content={<CustomTreemapContent />}
            >
              <Tooltip
                formatter={(value: number) => formatMinutesToHours(value)}
                contentStyle={CHART_TOOLTIP_STYLE}
              />
              {treemapData.map((_, i) => (
                <Cell key={i} fill={INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]} />
              ))}
            </Treemap>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {treemapData.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }} />
                <span className="text-[11px] text-slate-400">{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stacked Area Chart */}
      {weeklyData.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-5">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-4">
            {t('organization.insights.boards.weeklyTrend', 'Weekly Trend')}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fill: CHART_AXIS_FILL, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: CHART_AXIS_FILL, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              {boardNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="1"
                  fill={INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]}
                  stroke={INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {boardNames.map((name, i) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }} />
                <span className="text-[11px] text-slate-400">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
