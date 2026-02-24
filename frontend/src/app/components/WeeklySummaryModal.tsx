import { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, CheckCircle2, BarChart3, Calendar, FileText, MessageSquare, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScheduleBlockInfo, ScheduleColumnInfo, CommentSummaryItem, commentAPI } from '../utils/api';
import { getInitials } from '../utils/assigneeColor';
import { BoardMember } from './ShareBoardModal';
import { MotionModal } from './ui/MotionModal';

interface WeeklySummaryModalProps {
  boardId: string;
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

// Overnight-safe duration: end < start → crosses midnight
const calcDuration = (startTime: string, endTime: string): number => {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return e >= s ? e - s : (24 * 60 - s) + e;
};

// 주간 기록 테이블 행 타입
interface WeeklyRecordRow {
  key: string;
  itemTitle: string;
  featureTitle: string;
  featureColor: string;
  totalMinutes: number;
  blockCount: number;
  taskIds: Set<string>;
  completed: boolean;
}

export function WeeklySummaryModal({ boardId, member, weekDays, weeklyData, onClose }: WeeklySummaryModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'stats' | 'narrative'>('stats');
  const [comments, setComments] = useState<CommentSummaryItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);
  // 댓글 상세 뷰 상태
  const [commentDetailRow, setCommentDetailRow] = useState<WeeklyRecordRow | null>(null);
  // 전체 블록 수집
  const allBlocks = useMemo(() => {
    const blocks: { date: string; block: ScheduleBlockInfo }[] = [];
    weekDays.forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayColumns = weeklyData.get(dateStr) || [];
      const memberColumn = dayColumns.find((col) => col.user.id === member.userId);
      (memberColumn?.blocks || []).forEach((block) => {
        blocks.push({ date: dateStr, block });
      });
    });
    return blocks;
  }, [member.userId, weekDays, weeklyData]);

  const summaryData = useMemo(() => {
    const totalBlocks = allBlocks.length;

    let totalMinutes = 0;
    allBlocks.forEach(({ block }) => {
      totalMinutes += calcDuration(block.start_time, block.end_time);
    });
    const totalHours = totalMinutes / 60;

    const dailyBreakdown = weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayBlocks = allBlocks.filter((b) => b.date === dateStr);
      let dayMinutes = 0;
      dayBlocks.forEach(({ block }) => {
        dayMinutes += calcDuration(block.start_time, block.end_time);
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

    const featureMap = new Map<string, { title: string; color: string; blockCount: number; minutes: number }>();
    let noFeatureMinutes = 0;
    let noFeatureBlocks = 0;

    allBlocks.forEach(({ block }) => {
      const duration = calcDuration(block.start_time, block.end_time);
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
        title: t('weeklySummary.unclassified'),
        color: '#71717a',
        blockCount: noFeatureBlocks,
        minutes: noFeatureMinutes,
      });
    }

    const maxFeatureMinutes = Math.max(...featureBreakdown.map((f) => f.minutes), 1);

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
  }, [allBlocks, weekDays]);

  const weekRangeLabel = `${format(weekDays[0], 'M월 d일', { locale: ko })} - ${format(weekDays[weekDays.length - 1], 'M월 d일', { locale: ko })}`;

  // 줄글 탭 선택 시 댓글 lazy fetch
  const fetchComments = useCallback(async () => {
    if (commentsFetched) return;
    setCommentsLoading(true);
    try {
      const startDate = format(weekDays[0], 'yyyy-MM-dd');
      const endDate = format(weekDays[weekDays.length - 1], 'yyyy-MM-dd');
      const response = await commentAPI.getCommentSummary(boardId, member.userId, startDate, endDate);
      setComments(response.comments);
    } catch (err) {
      console.warn('Failed to fetch comment summary:', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
      setCommentsFetched(true);
    }
  }, [boardId, member.userId, weekDays, commentsFetched]);

  useEffect(() => {
    if (activeTab === 'narrative') {
      fetchComments();
    }
  }, [activeTab, fetchComments]);

  // 주간 개요 텍스트
  const overviewText = useMemo(() => {
    if (summaryData.totalBlocks === 0) return null;
    const activeDays = summaryData.dailyBreakdown.filter((d) => d.blockCount > 0).length;
    const avgHours = (summaryData.totalHours / summaryData.dailyBreakdown.length).toFixed(1);

    let text = t('weeklySummary.overviewText', {
      name: member.name,
      range: weekRangeLabel,
      blocks: summaryData.totalBlocks,
      hours: summaryData.totalHours.toFixed(1),
      totalDays: summaryData.dailyBreakdown.length,
      activeDays,
      avgHours,
    });

    if (summaryData.totalChecklistCount > 0) {
      text += t('weeklySummary.overviewChecklist', {
        rate: summaryData.completionRate,
        completed: summaryData.completedCount,
        total: summaryData.totalChecklistCount,
      });
    }
    return text;
  }, [member.name, weekRangeLabel, summaryData]);

  // 주간 기록 테이블 데이터
  const weeklyRecords = useMemo((): WeeklyRecordRow[] => {
    const rowMap = new Map<string, WeeklyRecordRow>();

    allBlocks.forEach(({ block }) => {
      const duration = calcDuration(block.start_time, block.end_time);
      const itemTitle = block.checklist_item?.title || block.task?.title || t('weeklySummary.unassigned');
      const featureTitle = block.feature?.title || t('weeklySummary.unclassified');
      const featureColor = block.feature?.color || '#71717a';
      const taskId = block.task?.id || null;
      const completed = block.checklist_item?.completed ?? false;
      // 같은 아이템 제목 + 같은 피처로 그룹핑
      const key = `${featureTitle}::${itemTitle}`;

      const existing = rowMap.get(key);
      if (existing) {
        existing.totalMinutes += duration;
        existing.blockCount += 1;
        if (taskId) existing.taskIds.add(taskId);
        if (completed) existing.completed = true;
      } else {
        const taskIds = new Set<string>();
        if (taskId) taskIds.add(taskId);
        rowMap.set(key, {
          key,
          itemTitle,
          featureTitle,
          featureColor,
          totalMinutes: duration,
          blockCount: 1,
          taskIds,
          completed,
        });
      }
    });

    return Array.from(rowMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [allBlocks]);

  // 댓글을 task_id로 인덱싱
  const commentsByTaskId = useMemo(() => {
    const map = new Map<string, CommentSummaryItem[]>();
    comments.forEach((c) => {
      const list = map.get(c.task_id) || [];
      list.push(c);
      map.set(c.task_id, list);
    });
    return map;
  }, [comments]);

  // 특정 row에 대한 댓글 수 계산
  const getCommentCount = (row: WeeklyRecordRow): number => {
    let count = 0;
    row.taskIds.forEach((taskId) => {
      count += (commentsByTaskId.get(taskId) || []).length;
    });
    return count;
  };

  // 특정 row에 대한 댓글 목록
  const getRowComments = (row: WeeklyRecordRow): CommentSummaryItem[] => {
    const result: CommentSummaryItem[] = [];
    row.taskIds.forEach((taskId) => {
      const taskComments = commentsByTaskId.get(taskId);
      if (taskComments) result.push(...taskComments);
    });
    return result.sort((a, b) => a.created_at.localeCompare(b.created_at));
  };

  const maxRowMinutes = useMemo(() => {
    return Math.max(...weeklyRecords.map((r) => r.totalMinutes), 1);
  }, [weeklyRecords]);

  return (
    <MotionModal open onClose={onClose} className="sm:w-[560px] sm:max-w-[calc(100%-2rem)] max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-sm text-white font-medium">
              {getInitials(member.name)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{member.name}</h2>
              <p className="text-xs text-slate-400">{weekRangeLabel} {t('weeklySummary.weekSummary')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0">
          <button
            onClick={() => { setActiveTab('stats'); setCommentDetailRow(null); }}
            className={`px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'stats'
                ? 'bg-bridge-accent text-white font-medium'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {t('weeklySummary.statsTab')}
          </button>
          <button
            onClick={() => { setActiveTab('narrative'); setCommentDetailRow(null); }}
            className={`px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'narrative'
                ? 'bg-bridge-accent text-white font-medium'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {t('weeklySummary.recordTab')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'stats' ? (
            // ========== 통계 탭 ==========
            summaryData.totalBlocks === 0 ? (
              <div className="text-center py-12">
                <div className="text-slate-400 text-sm">{t('weeklySummary.noTimeBlocks')}</div>
              </div>
            ) : (
              <>
                {/* 통계 카드 (2x2) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bridge-dark rounded-lg p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>{t('weeklySummary.totalTimeBlocks')}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{summaryData.totalBlocks}</div>
                  </div>
                  <div className="bg-bridge-dark rounded-lg p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{t('weeklySummary.totalWorkHours')}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{summaryData.totalHours.toFixed(1)}h</div>
                  </div>
                  <div className="bg-bridge-dark rounded-lg p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{t('weeklySummary.completionRate')}</span>
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
                      <span>{t('weeklySummary.dailyAverage')}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{(summaryData.totalHours / 7).toFixed(1)}h</div>
                  </div>
                </div>

                {/* 일별 현황 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {t('weeklySummary.dailyStatus')}
                  </label>
                  <div className="space-y-2">
                    {summaryData.dailyBreakdown.map((day) => (
                      <div
                        key={day.dateStr}
                        className={`flex items-center gap-3 py-1.5 px-2 rounded ${
                          day.isToday ? 'bg-indigo-900/20' : ''
                        }`}
                      >
                        <span className={`w-8 text-xs font-medium ${day.isToday ? 'text-indigo-400' : 'text-muted-foreground'}`}>
                          {day.dayLabel}
                        </span>
                        <span className="w-10 text-[10px] text-slate-400">{day.dateLabel}</span>
                        <span className="w-14 text-xs text-slate-400 text-right">{day.blockCount}</span>
                        <span className="w-14 text-xs text-foreground font-medium text-right">{day.hours.toFixed(1)}h</span>
                        <div className="flex-1 h-3 bg-foreground/5 rounded overflow-hidden">
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
                      {t('weeklySummary.featureStatus')}
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
                          <div className="h-1.5 bg-foreground/5 rounded overflow-hidden ml-4">
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
            )
          ) : (
            // ========== 주간 기록 탭 ==========
            commentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-bridge-accent border-t-transparent rounded-full mr-3" />
                <span className="text-slate-400 text-sm">{t('weeklySummary.loadingData')}</span>
              </div>
            ) : summaryData.totalBlocks === 0 ? (
              <div className="text-center py-12">
                <div className="text-slate-400 text-sm">{t('weeklySummary.noTimeBlocks')}</div>
              </div>
            ) : commentDetailRow ? (
              // ===== 댓글 상세 뷰 =====
              <div>
                <button
                  onClick={() => setCommentDetailRow(null)}
                  className="flex items-center gap-1 text-slate-400 hover:text-foreground text-sm mb-4 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('weeklySummary.goBack')}
                </button>
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: commentDetailRow.featureColor }}
                  />
                  <span className="text-sm font-medium text-foreground">{commentDetailRow.itemTitle}</span>
                  <span className="text-xs text-slate-400">({commentDetailRow.featureTitle})</span>
                </div>
                {(() => {
                  const rowComments = getRowComments(commentDetailRow);
                  if (rowComments.length === 0) {
                    return (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        {t('weeklySummary.noComments')}
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {rowComments.map((c) => (
                        <div key={c.id} className="bg-bridge-dark rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-slate-400">{c.task_title}</span>
                            <span className="text-[10px] text-slate-500">
                              {format(new Date(c.created_at), 'M/d E HH:mm', { locale: ko })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                            {c.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // ===== 주간 개요 + 테이블 =====
              <div className="space-y-6">
                {/* 주간 개요 */}
                {overviewText && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('weeklySummary.weeklyOverview')}
                    </label>
                    <p className="text-muted-foreground font-light leading-relaxed text-sm">
                      {overviewText}
                    </p>
                  </div>
                )}

                {/* 주간 기록 테이블 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {t('weeklySummary.weeklyRecord')}
                  </label>
                  {/* 테이블 헤더 */}
                  <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-foreground/10">
                    <div className="flex-1">{t('weeklySummary.timeBlockCol')}</div>
                    <div className="w-20 text-right">{t('weeklySummary.hoursSpent')}</div>
                    <div className="w-14 text-center">{t('weeklySummary.commentsCol')}</div>
                  </div>
                  {/* 테이블 행 */}
                  <div className="divide-y divide-white/5">
                    {weeklyRecords.map((row) => {
                      const commentCount = getCommentCount(row);
                      const hours = (row.totalMinutes / 60).toFixed(1);
                      const barWidth = (row.totalMinutes / maxRowMinutes) * 100;

                      return (
                        <div key={row.key} className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                          {/* 타임블록 이름 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: row.featureColor }}
                              />
                              <span className={`text-sm truncate ${row.completed ? 'text-slate-500 line-through' : 'text-foreground'}`}>
                                {row.itemTitle}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 ml-4">
                              <span className="text-[10px] text-slate-500">{row.featureTitle}</span>
                              {/* 미니 바 */}
                              <div className="flex-1 h-1 bg-foreground/5 rounded overflow-hidden max-w-[120px]">
                                <div
                                  className="h-full rounded"
                                  style={{ width: `${barWidth}%`, backgroundColor: row.featureColor, opacity: 0.6 }}
                                />
                              </div>
                            </div>
                          </div>
                          {/* 투입시간 */}
                          <div className="w-20 text-right flex-shrink-0">
                            <span className="text-sm font-medium text-foreground">{hours}h</span>
                            {row.blockCount > 1 && (
                              <span className="text-[10px] text-slate-500 ml-1">({row.blockCount})</span>
                            )}
                          </div>
                          {/* 댓글 버튼 */}
                          <div className="w-14 flex justify-center flex-shrink-0">
                            {commentCount > 0 ? (
                              <button
                                onClick={() => setCommentDetailRow(row)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-bridge-accent/10 hover:bg-bridge-accent/20 text-bridge-accent transition-colors"
                              >
                                <MessageSquare className="h-3 w-3" />
                                <span className="text-xs font-medium">{commentCount}</span>
                              </button>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-foreground/10 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl hover:bg-foreground/10 transition-all text-sm"
          >
            {t('common.close')}
          </button>
        </div>
    </MotionModal>
  );
}
