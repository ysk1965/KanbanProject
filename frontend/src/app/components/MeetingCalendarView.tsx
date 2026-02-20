import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Repeat, Clock, MoreVertical, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { meetingAPI, MeetingSummary } from '../utils/api';
import { useHolidays } from '../hooks/useHolidays';
import { BoardMember } from './ShareBoardModal';
import { MeetingView } from './MeetingView';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';
import { MotionModal } from './ui/MotionModal';

interface MeetingCalendarViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  onRefreshSchedule?: () => void;
  refreshTrigger?: number;
}

export function MeetingCalendarView({ boardId, boardMembers, onRefreshSchedule, refreshTrigger }: MeetingCalendarViewProps) {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();

  const initialDate = useMemo(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      try {
        return parseISO(dateParam);
      } catch {
        return new Date();
      }
    }
    return new Date();
  }, []);

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [monthMeetings, setMonthMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { holidayMap } = useHolidays(i18n.language, currentMonth.getFullYear());

  const activeMembers = useMemo(
    () => boardMembers.filter((m) => m.role !== 'viewer'),
    [boardMembers]
  );

  const loadMonthMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const data = await meetingAPI.getMeetingsByDateRange(boardId, startDate, endDate);
      setMonthMeetings(data);
    } catch (error) {
      console.error('Failed to load month meetings:', error);
      setMonthMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, currentMonth]);

  useEffect(() => {
    loadMonthMeetings();
  }, [loadMonthMeetings]);

  // WebSocket 이벤트로 인한 리프레시
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadMonthMeetings();
    }
  }, [refreshTrigger]);

  const meetingCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    monthMeetings.forEach((meeting) => {
      const dateKey = meeting.meeting_date;
      map.set(dateKey, (map.get(dateKey) || 0) + 1);
    });
    return map;
  }, [monthMeetings]);

  // Recurring meeting series (grouped by recurrence_group_id)
  const recurringSeries = useMemo(() => {
    const groupMap = new Map<string, MeetingSummary>();
    monthMeetings.forEach((meeting) => {
      if (meeting.recurrence_group_id && !groupMap.has(meeting.recurrence_group_id)) {
        groupMap.set(meeting.recurrence_group_id, meeting);
      }
    });
    return Array.from(groupMap.values());
  }, [monthMeetings]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    setSelectedDate(today);
  };

  const handleDateClick = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, currentMonth)) {
      setCurrentMonth(startOfMonth(day));
    }
    setMobileSidebarOpen(false);
  };

  const handleRefreshSchedule = useCallback(() => {
    loadMonthMeetings();
    onRefreshSchedule?.();
  }, [loadMonthMeetings, onRefreshSchedule]);

  const calendarContent = (
    <>
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2.5 mb-4">
          <Calendar size={18} className="text-bridge-accent" />
          <h2 className="text-base font-bold text-foreground">
            {t('meeting.tab', '회의')}
          </h2>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {t('dailySchedule.today', '오늘')}
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mini Calendar Grid */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-3">
          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {weekDays.map((day, i) => (
              <div
                key={day}
                className={`text-center text-[10px] font-bold uppercase tracking-widest py-1 ${
                  i === 0 ? 'text-red-400/60' : i === 6 ? 'text-blue-400/60' : 'text-slate-500'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const count = meetingCountByDate.get(dateKey) || 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = isSameDay(day, selectedDate);
              const isTodayDate = isToday(day);
              const dayOfWeek = day.getDay();
              const isHoliday = isCurrentMonth && holidayMap.has(dateKey);

              return (
                <button
                  key={dateKey}
                  onClick={() => handleDateClick(day)}
                  className={`
                    relative flex flex-col items-center justify-center py-2 rounded-lg transition-all min-h-[44px]
                    ${isSelected
                      ? 'bg-bridge-accent/20 border border-bridge-accent/50'
                      : 'border border-transparent hover:bg-foreground/5'
                    }
                    ${!isCurrentMonth ? 'opacity-30' : ''}
                  `}
                >
                  <span
                    className={`
                      text-xs font-medium leading-none
                      ${isTodayDate
                        ? 'bg-bridge-accent text-white rounded-full w-6 h-6 flex items-center justify-center text-[11px]'
                        : isSelected
                          ? 'text-foreground'
                          : isHoliday || dayOfWeek === 0
                            ? 'text-red-400/80'
                            : dayOfWeek === 6
                              ? 'text-blue-400/80'
                              : 'text-muted-foreground'
                      }
                    `}
                  >
                    {format(day, 'd')}
                  </span>
                  {count > 0 && (
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-bridge-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recurring Meetings Section */}
      {recurringSeries.length > 0 && (
        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <Repeat size={14} className="text-bridge-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('meeting.recurring', '반복')} {t('meeting.tab', '회의')}
            </span>
          </div>
          <div className="space-y-1.5">
            {recurringSeries.map((meeting) => (
              <RecurringMeetingCard
                key={meeting.recurrence_group_id}
                meeting={meeting}
                monthMeetings={monthMeetings}
                boardId={boardId}
                onNavigate={(date) => {
                  setSelectedDate(date);
                  if (!isSameMonth(date, currentMonth)) {
                    setCurrentMonth(startOfMonth(date));
                  }
                }}
                onRefresh={handleRefreshSchedule}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop - Left Panel - Mini Calendar */}
      <div className="hidden md:flex w-[340px] flex-shrink-0 border-r border-foreground/5 flex-col overflow-hidden">
        {calendarContent}
      </div>

      {/* Mobile - Mini Calendar Sheet */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-bridge-dark border-foreground/10 flex flex-col">
          <SheetTitle className="sr-only">{t('meeting.tab', '회의')}</SheetTitle>
          {calendarContent}
        </SheetContent>
      </Sheet>

      {/* Right Panel - Meeting List */}
      <div className="flex-1 overflow-y-auto">
        <MeetingView
          boardId={boardId}
          selectedDate={selectedDate}
          boardMembers={activeMembers}
          onRefreshSchedule={handleRefreshSchedule}
          refreshTrigger={refreshTrigger}
          onOpenCalendar={() => setMobileSidebarOpen(true)}
        />
      </div>
    </div>
  );
}

// ============================
// Recurring Meeting Card with Edit/Delete
// ============================

interface RecurringMeetingCardProps {
  meeting: MeetingSummary;
  monthMeetings: MeetingSummary[];
  boardId: string;
  onNavigate: (date: Date) => void;
  onRefresh: () => void;
}

function RecurringMeetingCard({ meeting, monthMeetings, boardId, onNavigate, onRefresh }: RecurringMeetingCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const ruleLabel =
    meeting.recurrence_rule === 'WEEKLY'
      ? t('meeting.recurrenceWeekly', '매주')
      : meeting.recurrence_rule === 'BIWEEKLY'
        ? t('meeting.recurrenceBiweekly', '격주')
        : t('meeting.recurrenceMonthly', '매월');

  const timeStr =
    meeting.start_time && meeting.end_time
      ? `${meeting.start_time.slice(0, 5)} - ${meeting.end_time.slice(0, 5)}`
      : meeting.start_time
        ? meeting.start_time.slice(0, 5)
        : null;

  // Find the first occurrence (earliest date in this series)
  const firstOccurrence = monthMeetings
    .filter((m) => m.recurrence_group_id === meeting.recurrence_group_id)
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0];

  // Find next occurrence of this series
  const nextDate = monthMeetings
    .filter(
      (m) =>
        m.recurrence_group_id === meeting.recurrence_group_id &&
        m.meeting_date >= format(new Date(), 'yyyy-MM-dd')
    )
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0];

  const handleCardClick = () => {
    if (nextDate) {
      onNavigate(parseISO(nextDate.meeting_date));
    }
  };

  return (
    <>
      <div
        className="relative w-full text-left p-2.5 rounded-xl bg-white/[0.03] border border-foreground/5 hover:bg-white/[0.06] hover:border-foreground/10 transition-all group cursor-pointer"
        onClick={handleCardClick}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="w-1 h-8 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: meeting.color || '#8B5CF6' }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground truncate group-hover:text-bridge-secondary transition-colors">
              {meeting.title}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-semibold text-bridge-secondary/80 bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
                {ruleLabel}
              </span>
              {timeStr && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                  <Clock size={9} />
                  {timeStr}
                </span>
              )}
            </div>
            {firstOccurrence && (
              <div className="text-[10px] text-slate-500 mt-1">
                {format(parseISO(firstOccurrence.meeting_date), 'M/d', { locale: ko })}~
              </div>
            )}
          </div>

          {/* Context Menu Button */}
          <div ref={menuRef} className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 rounded-lg text-slate-500 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-foreground/10 transition-all"
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                >
                  <Pencil size={12} />
                  {t('common.edit', '수정')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                  {t('meeting.delete', '삭제')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <RecurringEditModal
          boardId={boardId}
          meeting={meeting}
          onClose={() => setEditOpen(false)}
          onUpdated={() => {
            setEditOpen(false);
            onRefresh();
          }}
        />
      )}

      {/* Delete Scope Modal */}
      <MotionModal open={deleteOpen} onClose={() => setDeleteOpen(false)} className="sm:w-[400px] sm:max-w-[calc(100%-2rem)] p-0 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">
              {t('meeting.deleteRecurringTitle', '반복 회의 삭제')}
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              {t('meeting.deleteRecurringMessage', '이 회의는 반복 회의입니다. 어떻게 삭제하시겠습니까?')}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  try {
                    await meetingAPI.deleteMeeting(boardId, meeting.id, 'THIS_AND_FUTURE');
                    setDeleteOpen(false);
                    onRefresh();
                  } catch (error) {
                    console.error('Failed to delete recurring series:', error);
                  }
                }}
                className="w-full px-4 py-3 text-sm font-semibold bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
              >
                {t('meeting.deleteThisAndFuture', '이후 회의 모두 삭제')}
              </button>
              <button
                onClick={() => setDeleteOpen(false)}
                className="w-full px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
      </MotionModal>
    </>
  );
}

// ============================
// Recurring Edit Modal
// ============================

interface RecurringEditModalProps {
  boardId: string;
  meeting: MeetingSummary;
  onClose: () => void;
  onUpdated: () => void;
}

function RecurringEditModal({ boardId, meeting, onClose, onUpdated }: RecurringEditModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(meeting.title);
  const [startTime, setStartTime] = useState(meeting.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(meeting.end_time?.slice(0, 5) || '');
  const [color, setColor] = useState(meeting.color || '#8B5CF6');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colorOptions = ['#8B5CF6', '#6366F1', '#2DD4BF', '#F59E0B', '#EF4444', '#EC4899', '#10B981', '#3B82F6'];

  const canSubmit = title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await meetingAPI.updateMeeting(
        boardId,
        meeting.id,
        {
          title: title.trim(),
          start_time: startTime || null,
          end_time: endTime || null,
          color,
        },
        'THIS_AND_FUTURE'
      );
      onUpdated();
    } catch (error) {
      console.error('Failed to update recurring series:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-bridge-obsidian rounded-2xl shadow-2xl w-[420px] max-w-[calc(100vw-2rem)] flex flex-col overflow-hidden border border-foreground/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
          <h2 className="text-base font-bold text-foreground">
            {t('meeting.editRecurring', '반복 회의 수정')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('meeting.startTime', '시작 시간')}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('meeting.endTime', '종료 시간')}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.color', '색상')}
            </label>
            <div className="flex gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/30'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-foreground/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-foreground transition-colors border border-foreground/10 rounded-xl hover:bg-foreground/5"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex-1 py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.processing', '처리 중...')}
              </>
            ) : (
              t('common.save', '저장')
            )}
          </button>
        </div>

        <p className="px-6 pb-4 text-[10px] text-slate-500">
          {t('meeting.editRecurringHint', '이후 모든 반복 회의에 적용됩니다')}
        </p>
      </div>
    </div>
  );
}
