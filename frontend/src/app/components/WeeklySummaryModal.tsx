import { useMemo } from 'react';
import { X, Clock, CheckCircle2, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScheduleBlockInfo, ScheduleColumnInfo } from '../utils/api';
import { BoardMember } from './ShareBoardModal';

interface WeeklySummaryModalProps {
  member: BoardMember;
  weekDays: Date[];
  weeklyData: Map<string, ScheduleColumnInfo[]>;
  onClose: () => void;
}

// "HH:mm:ss" 또는 "HH:mm" -> 총 분
const timeToMinutes = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

export function WeeklySummaryModal({ member, weekDays, weeklyData, onClose }: WeeklySummaryModalProps) {
  const summaryData = useMemo(() => {
    // 1. 해당 멤버의 모든 블록 수집
    const allBlocks: { date: string; block: ScheduleBlockInfo }[] = [];

    weekDays.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayColumns = weeklyData.get(dateStr) || [];
      const memberColumn = dayColumns.find((col) => col.user.id === member.userId);
      const blocks = memberColumn?.blocks || [];
      blocks.forEach((block) => {
        allBlocks.push({ date: dateStr, block });
      });
    });

    // 2. 총 블록 수
    const totalBlocks = allBlocks.length;

    // 3. 총 작업 시간 (분)
    let totalMinutes = 0;
    allBlocks.forEach(({ block }) => {
      totalMinutes += timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
    });
    const totalHours = totalMinutes / 60;

    // 4. 일별 현황
    const dailyBreakdown = weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayBlocks = allBlocks.filter((b) => b.date === dateStr);
      let dayMinutes = 0;
      dayBlocks.forEach(({ block }) => {
        dayMinutes += timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
      });
      return {
        dateStr,
        dayLabel: format(day, 'E', { locale: ko }),
        dateLabel: format(day, 'M/d'),
        blockCount: dayBlocks.length,
        hours: dayMinutes / 60,
        isToday: dateStr === format(new Date(), 'yyyy-MM-dd'),
      };
    });

    const maxDayHours = Math.max(...dailyBreakdown.map((d) => d.hours), 0.1);

    // 5. Feature별 분류
    const featureMap = new Map<string, { title: string; color: string; blockCount: number; minutes: number }>();
    let noFeatureMinutes = 0;
    let noFeatureBlocks = 0;

    allBlocks.forEach(({ block }) => {
      const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
      if (block.feature) {
        const existing = featureMap.get(block.feature.id);
        if (existing) {
          existing.blockCount += 1;
          existing.minutes += duration;
        } else {
          featureMap.set(block.feature.id, {
            title: block.feature.title,
            color: block.feature.color,
            blockCount: 1,
            minutes: duration,
          });
        }
      } else {
        noFeatureBlocks += 1;
        noFeatureMinutes += duration;
      }
    });

    const featureBreakdown = Array.from(featureMap.values()).sort((a, b) => b.minutes - a.minutes);
    if (noFeatureBlocks > 0) {
      featureBreakdown.push({
        title: '미분류',
        color: '#71717a',
        blockCount: noFeatureBlocks,
        minutes: noFeatureMinutes,
      });
    }

    const maxFeatureMinutes = Math.max(...featureBreakdown.map((f) => f.minutes), 1);

    // 6. 완료율
    let completedCount = 0;
    let totalChecklistCount = 0;
    allBlocks.forEach(({ block }) => {
      if (block.checklist_item) {
        totalChecklistCount += 1;
        if (block.checklist_item.completed) {
          completedCount += 1;
        }
      }
    });
    const completionRate = totalChecklistCount > 0
      ? Math.round((completedCount / totalChecklistCount) * 100)
      : 0;

    return {
      totalBlocks,
      totalHours,
      dailyBreakdown,
      maxDayHours,
      featureBreakdown,
      maxFeatureMinutes,
      completedCount,
      totalChecklistCount,
      completionRate,
    };
  }, [member.userId, weekDays, weeklyData]);

  const weekRangeLabel = `${format(weekDays[0], 'M월 d일', { locale: ko })} - ${format(weekDays[6], 'M월 d일', { locale: ko })}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-bridge-obsidian rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-sm text-white font-medium">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{member.name}</h2>
              <p className="text-xs text-slate-400">{weekRangeLabel} 주간 요약</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {summaryData.totalBlocks === 0 ? (
            <div className="text-center py-12">
              <div className="text-slate-500 text-sm">이번 주에 등록된 타임블록이 없습니다</div>
            </div>
          ) : (
            <>
              {/* 통계 카드 (2x2) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bridge-dark rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>총 타임블록</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{summaryData.totalBlocks}개</div>
                </div>
                <div className="bg-bridge-dark rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>총 작업시간</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{summaryData.totalHours.toFixed(1)}시간</div>
                </div>
                <div className="bg-bridge-dark rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>완료율</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {summaryData.completionRate}%
                    <span className="text-sm font-normal text-slate-400 ml-2">
                      ({summaryData.completedCount}/{summaryData.totalChecklistCount})
                    </span>
                  </div>
                </div>
                <div className="bg-bridge-dark rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>일 평균</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{(summaryData.totalHours / 7).toFixed(1)}시간</div>
                </div>
              </div>

              {/* 일별 현황 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  일별 현황
                </label>
                <div className="space-y-2">
                  {summaryData.dailyBreakdown.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded ${
                        day.isToday ? 'bg-indigo-900/20' : ''
                      }`}
                    >
                      <span className={`w-8 text-xs font-medium ${day.isToday ? 'text-indigo-400' : 'text-slate-300'}`}>
                        {day.dayLabel}
                      </span>
                      <span className="w-10 text-[10px] text-slate-500">{day.dateLabel}</span>
                      <span className="w-14 text-xs text-slate-400 text-right">{day.blockCount}블록</span>
                      <span className="w-14 text-xs text-foreground font-medium text-right">{day.hours.toFixed(1)}h</span>
                      <div className="flex-1 h-3 bg-white/5 rounded overflow-hidden">
                        <div
                          className="h-full bg-bridge-accent rounded transition-all"
                          style={{ width: `${(day.hours / summaryData.maxDayHours) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 피처별 현황 */}
              {summaryData.featureBreakdown.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    피처별 현황
                  </label>
                  <div className="space-y-3">
                    {summaryData.featureBreakdown.map((feature, idx) => (
                      <div key={idx}>
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: feature.color }}
                          />
                          <span className="text-sm text-foreground truncate flex-1">{feature.title}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {(feature.minutes / 60).toFixed(1)}h ({feature.blockCount})
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded overflow-hidden ml-4">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${(feature.minutes / summaryData.maxFeatureMinutes) * 100}%`,
                              backgroundColor: feature.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
