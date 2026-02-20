import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, MessageSquare, AtSign, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScheduleBlockInfo, CommentSummaryItem, MentionSummaryItem, commentAPI } from '../utils/api';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import { BoardMember } from './ShareBoardModal';
import { formatDateTime } from '../utils/dateUtils';
import { MotionModal } from './ui/MotionModal';

interface DailySummaryModalProps {
  boardId: string;
  member: BoardMember;
  selectedDate: Date;
  blocks: ScheduleBlockInfo[];
  onClose: () => void;
}

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

const formatTime = (timeStr: string): string => {
  const [h, m] = timeStr.split(':');
  return `${h}:${m}`;
};

export function DailySummaryModal({ boardId, member, selectedDate, blocks, onClose }: DailySummaryModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'schedule' | 'comments' | 'mentions'>('schedule');

  const [comments, setComments] = useState<CommentSummaryItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);

  const [mentions, setMentions] = useState<MentionSummaryItem[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsFetched, setMentionsFetched] = useState(false);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dateLabel = format(selectedDate, 'M월 d일 (E)', { locale: ko });

  // 스케줄 요약 데이터
  const summaryData = useMemo(() => {
    const totalBlocks = blocks.length;
    let totalMinutes = 0;
    let completedCount = 0;
    let totalChecklistCount = 0;

    blocks.forEach((block) => {
      totalMinutes += calcDuration(block.start_time, block.end_time);
      if (block.checklist_item) {
        totalChecklistCount += 1;
        if (block.checklist_item.completed) completedCount += 1;
      }
    });

    return {
      totalBlocks,
      totalHours: totalMinutes / 60,
      completedCount,
      totalChecklistCount,
      completionRate: totalChecklistCount > 0 ? Math.round((completedCount / totalChecklistCount) * 100) : 0,
    };
  }, [blocks]);

  // 댓글 lazy fetch
  const fetchComments = useCallback(async () => {
    if (commentsFetched) return;
    setCommentsLoading(true);
    try {
      const response = await commentAPI.getCommentSummary(boardId, member.userId, dateStr, dateStr);
      setComments(response.comments);
    } catch (err) {
      console.warn('Failed to fetch comment summary:', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
      setCommentsFetched(true);
    }
  }, [boardId, member.userId, dateStr, commentsFetched]);

  // 멘션 lazy fetch
  const fetchMentions = useCallback(async () => {
    if (mentionsFetched) return;
    setMentionsLoading(true);
    try {
      const response = await commentAPI.getCommentMentions(boardId, member.userId, dateStr, dateStr);
      setMentions(response.comments);
    } catch (err) {
      console.warn('Failed to fetch mention summary:', err);
      setMentions([]);
    } finally {
      setMentionsLoading(false);
      setMentionsFetched(true);
    }
  }, [boardId, member.userId, dateStr, mentionsFetched]);

  useEffect(() => {
    if (activeTab === 'comments') fetchComments();
    if (activeTab === 'mentions') fetchMentions();
  }, [activeTab, fetchComments, fetchMentions]);

  // 블록을 시간순 정렬
  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }, [blocks]);

  return (
    <MotionModal open onClose={onClose} className="sm:w-[520px] sm:max-w-[calc(100%-2rem)] max-h-[80vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm text-foreground font-medium"
              style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
            >
              {getInitials(member.name)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{member.name}</h2>
              <p className="text-xs text-slate-400">{dateLabel} {t('dailySummary.title')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'schedule'
                ? 'bg-bridge-accent text-white font-medium'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {t('dailySummary.scheduleTab')}
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'bg-bridge-accent text-white font-medium'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t('dailySummary.commentsTab')}
            {commentsFetched && comments.length > 0 && (
              <span className="text-[10px] bg-foreground/10 px-1.5 rounded-full">{comments.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('mentions')}
            className={`px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'mentions'
                ? 'bg-bridge-accent text-white font-medium'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <AtSign className="h-3.5 w-3.5" />
            {t('dailySummary.mentionsTab')}
            {mentionsFetched && mentions.length > 0 && (
              <span className="text-[10px] bg-foreground/10 px-1.5 rounded-full">{mentions.length}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'schedule' ? (
            // ========== 스케줄 탭 ==========
            sortedBlocks.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-slate-400 text-sm">{t('dailySummary.noBlocks')}</div>
              </div>
            ) : (
              <>
                {/* 요약 카드 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-bridge-dark rounded-lg p-3">
                    <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">{t('dailySummary.totalBlocks')}</div>
                    <div className="text-xl font-bold text-foreground">{summaryData.totalBlocks}</div>
                  </div>
                  <div className="bg-bridge-dark rounded-lg p-3">
                    <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">{t('dailySummary.totalHours')}</div>
                    <div className="text-xl font-bold text-foreground">{summaryData.totalHours.toFixed(1)}h</div>
                  </div>
                  <div className="bg-bridge-dark rounded-lg p-3">
                    <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">{t('dailySummary.completionRate')}</div>
                    <div className="text-xl font-bold text-foreground">
                      {summaryData.completionRate}%
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        ({summaryData.completedCount}/{summaryData.totalChecklistCount})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 블록 리스트 */}
                <div className="space-y-2">
                  {sortedBlocks.map((block) => {
                    const duration = calcDuration(block.start_time, block.end_time);
                    const title = block.checklist_item?.title || block.meeting?.title || block.task?.title || t('dailySummary.untitled');
                    const featureTitle = block.feature?.title;
                    const featureColor = block.feature?.color || block.meeting?.color;
                    const isCompleted = block.checklist_item?.completed;
                    const isMeeting = !!block.meeting;

                    return (
                      <div key={block.id} className="bg-bridge-dark rounded-lg p-3 flex items-start gap-3">
                        {/* 시간 */}
                        <div className="flex-shrink-0 text-right w-20">
                          <div className="text-sm text-foreground font-medium">
                            {formatTime(block.start_time)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            ~ {formatTime(block.end_time)}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60 > 0 ? `${duration % 60}m` : ''}` : `${duration}m`}
                          </div>
                        </div>

                        {/* 구분선 */}
                        <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: featureColor || '#6366F1' }} />

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isCompleted !== undefined && (
                              <CheckCircle2 className={`h-3.5 w-3.5 flex-shrink-0 ${isCompleted ? 'text-green-400' : 'text-slate-500'}`} />
                            )}
                            <span className={`text-sm font-medium truncate ${isMeeting ? 'text-purple-300' : 'text-foreground'}`}>
                              {isMeeting && '🗓 '}{title}
                            </span>
                          </div>
                          {featureTitle && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: featureColor || '#6366F1' }} />
                              <span className="text-[11px] text-slate-400 truncate">{featureTitle}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          ) : activeTab === 'comments' ? (
            // ========== 댓글 탭 ==========
            commentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-bridge-accent border-t-transparent rounded-full mr-3" />
                <span className="text-slate-400 text-sm">{t('dailySummary.loading')}</span>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                <div className="text-slate-400 text-sm">{t('dailySummary.noComments')}</div>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-bridge-dark rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-bridge-accent truncate">{comment.task_title}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{comment.content}</p>
                  </div>
                ))}
              </div>
            )
          ) : (
            // ========== 멘션 탭 ==========
            mentionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-5 w-5 border-2 border-bridge-accent border-t-transparent rounded-full mr-3" />
                <span className="text-slate-400 text-sm">{t('dailySummary.loading')}</span>
              </div>
            ) : mentions.length === 0 ? (
              <div className="text-center py-12">
                <AtSign className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                <div className="text-slate-400 text-sm">{t('dailySummary.noMentions')}</div>
              </div>
            ) : (
              <div className="space-y-3">
                {mentions.map((mention) => (
                  <div key={mention.id} className="bg-bridge-dark rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-bridge-accent truncate">{mention.task_title}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{formatDateTime(mention.created_at)}</span>
                    </div>
                    {mention.author_name && (
                      <div className="text-[11px] text-slate-400 mb-1.5">
                        {t('dailySummary.authorLabel')}: <span className="text-muted-foreground">{mention.author_name}</span>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{mention.content}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
    </MotionModal>
  );
}
