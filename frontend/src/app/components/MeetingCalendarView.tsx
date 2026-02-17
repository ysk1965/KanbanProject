import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Repeat, Clock } from 'lucide-react';
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
import { BoardMember } from './ShareBoardModal';
import { MeetingView } from './MeetingView';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';

interface MeetingCalendarViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  onRefreshSchedule?: () => void;
  refreshTrigger?: number;
}

export function MeetingCalendarView({ boardId, boardMembers, onRefreshSchedule, refreshTrigger }: MeetingCalendarViewProps) {
  const { t } = useTranslation();
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
          <h2 className="text-base font-bold text-white">
            {t('meeting.tab', '회의')}
          </h2>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              {t('dailySchedule.today', '오늘')}
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mini Calendar Grid */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="bg-bridge-obsidian rounded-xl border border-white/5 p-3">
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

              return (
                <button
                  key={dateKey}
                  onClick={() => handleDateClick(day)}
                  className={`
                    relative flex flex-col items-center justify-center py-2 rounded-lg transition-all min-h-[44px]
                    ${isSelected
                      ? 'bg-bridge-accent/20 border border-bridge-accent/50'
                      : 'border border-transparent hover:bg-white/5'
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
                          ? 'text-white'
                          : dayOfWeek === 0
                            ? 'text-red-400/80'
                            : dayOfWeek === 6
                              ? 'text-blue-400/80'
                              : 'text-slate-300'
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
            {recurringSeries.map((meeting) => {
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

              // Find next occurrence of this series
              const nextDate = monthMeetings
                .filter(
                  (m) =>
                    m.recurrence_group_id === meeting.recurrence_group_id &&
                    m.meeting_date >= format(new Date(), 'yyyy-MM-dd')
                )
                .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0];

              return (
                <button
                  key={meeting.recurrence_group_id}
                  onClick={() => {
                    if (nextDate) {
                      const date = parseISO(nextDate.meeting_date);
                      setSelectedDate(date);
                      if (!isSameMonth(date, currentMonth)) {
                        setCurrentMonth(startOfMonth(date));
                      }
                    }
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all group"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-1 h-8 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: meeting.color || '#8B5CF6' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate group-hover:text-bridge-secondary transition-colors">
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
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop - Left Panel - Mini Calendar */}
      <div className="hidden md:flex w-72 flex-shrink-0 border-r border-white/5 flex-col overflow-hidden">
        {calendarContent}
      </div>

      {/* Mobile - Mini Calendar Sheet */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-bridge-dark border-white/10 flex flex-col">
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
