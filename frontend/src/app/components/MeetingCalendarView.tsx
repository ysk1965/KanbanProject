import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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
