import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, BookHeart, ChevronLeft, ChevronRight, Check, Sparkles, RotateCcw, BookOpen, Pencil, RefreshCw, AlertTriangle, X, CalendarIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday as isTodayFn,
  addMonths,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { diaryService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import type { DiaryDetail, DiaryMessage, DiarySimple } from '../../types';

const MOODS = [
  { emoji: '\u{1F60A}', label: '행복', value: 'happy' },
  { emoji: '\u{1F60C}', label: '평온', value: 'calm' },
  { emoji: '\u{1F914}', label: '생각 많은', value: 'thoughtful' },
  { emoji: '\u{1F614}', label: '피곤', value: 'tired' },
  { emoji: '\u{1F622}', label: '슬픔', value: 'sad' },
  { emoji: '\u{1F620}', label: '짜증', value: 'frustrated' },
  { emoji: '\u{1F929}', label: '신남', value: 'excited' },
  { emoji: '\u{1F971}', label: '지루', value: 'bored' },
];

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function PersonalDiary() {
  const [currentDate, setCurrentDate] = useState(toDateString(new Date()));
  const [diary, setDiary] = useState<DiaryDetail | null>(null);
  const [diaryList, setDiaryList] = useState<DiarySimple[]>([]);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentDateObj = new Date(currentDate + 'T00:00:00');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(currentDateObj));

  // Sync calendar month when currentDate changes to a different month
  useEffect(() => {
    const dateMonth = startOfMonth(new Date(currentDate + 'T00:00:00'));
    if (!isSameMonth(dateMonth, calendarMonth)) {
      setCalendarMonth(dateMonth);
    }
  }, [currentDate]);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthNum = calendarMonth.getMonth() + 1;

  useEffect(() => {
    loadDiary();
  }, [currentDate]);

  useEffect(() => {
    loadDiaryList();
  }, [calendarYear, calendarMonthNum]);

  useEffect(() => {
    scrollToBottom();
  }, [diary?.messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadDiary = async () => {
    setIsLoading(true);
    try {
      const data = await diaryService.getByDate(currentDate);
      setDiary(data);
    } catch (error) {
      console.error('Failed to load diary:', error);
      setDiary(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDiaryList = async () => {
    try {
      const data = await diaryService.getList(calendarYear, calendarMonthNum);
      setDiaryList(data);
    } catch (error) {
      console.error('Failed to load diary list:', error);
    }
  };

  const handleStartDiary = async () => {
    try {
      const data = await diaryService.create(currentDate);
      setDiary(data);
    } catch (error) {
      console.error('Failed to create diary:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !diary || isSending) return;

    const content = message.trim();
    setMessage('');
    setIsSending(true);

    // Optimistic update - add user message immediately
    const tempUserMsg: DiaryMessage = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content,
      message_order: (diary.messages?.length || 0) + 1,
      created_at: new Date().toISOString(),
    };
    setDiary((prev) => prev ? { ...prev, messages: [...(prev.messages || []), tempUserMsg] } : prev);

    try {
      const reply = await diaryService.sendMessage(diary.id, content);
      // Replace temp message with actual and add AI reply
      setDiary((prev) => {
        if (!prev) return prev;
        const msgs = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          messages: [...msgs, reply.user_message, reply.ai_message],
        };
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Revert optimistic update
      setDiary((prev) => prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev);
      setMessage(content);
    } finally {
      setIsSending(false);
    }
  };

  const [isCompleting, setIsCompleting] = useState(false);

  const handleCompleteDiary = async (mood?: string) => {
    if (!diary || isCompleting) return;
    setIsCompleting(true);
    try {
      const data = await diaryService.complete(diary.id, { mood });
      setDiary(data);
      loadDiaryList();
    } catch (error) {
      console.error('Failed to complete diary:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleReopen = async () => {
    if (!diary) return;
    try {
      const data = await diaryService.reopen(diary.id);
      setDiary(data);
    } catch (error) {
      console.error('Failed to reopen diary:', error);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = async () => {
    if (!diary) return;
    try {
      const data = await diaryService.reset(diary.id);
      setDiary(data);
      setShowResetConfirm(false);
      loadDiaryList();
    } catch (error) {
      console.error('Failed to reset diary:', error);
    }
  };

  const today = toDateString(new Date());
  const isToday = currentDate === today;

  // Diary dates for the mini calendar indicators
  const diaryDateMap = useMemo(() => {
    const map = new Map<string, DiarySimple>();
    diaryList.forEach((d) => map.set(d.diary_date, d));
    return map;
  }, [diaryList]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [calendarMonth]);

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  const handleCalendarDateClick = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    setCurrentDate(dateStr);
    if (!isSameMonth(day, calendarMonth)) {
      setCalendarMonth(startOfMonth(day));
    }
    setShowMobileSidebar(false);
  };

  const handlePrevMonth = () => setCalendarMonth(subMonths(calendarMonth, 1));
  const handleNextMonth = () => setCalendarMonth(addMonths(calendarMonth, 1));
  const handleCalendarToday = () => {
    const now = new Date();
    setCalendarMonth(startOfMonth(now));
    setCurrentDate(toDateString(now));
  };

  return (
    <div className="h-full flex relative">
      {/* Mobile Sidebar Toggle Button */}
      <button
        onClick={() => setShowMobileSidebar(true)}
        className="md:hidden fixed left-4 z-40 w-11 h-11 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 flex items-center justify-center text-white hover:bg-bridge-accent/90 transition-colors"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CalendarIcon size={18} />
      </button>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar - Calendar & Diary List */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto
        w-[300px] md:w-[340px] flex-shrink-0 border-r border-white/5 flex flex-col overflow-hidden
        bg-bridge-dark md:bg-transparent
        transition-transform duration-300 ease-in-out
        ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          {/* Title */}
          <div className="flex items-center gap-2.5 mb-4">
            <BookOpen size={18} className="text-bridge-accent" />
            <h2 className="text-base font-bold text-white">AI 다이어리</h2>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="md:hidden ml-auto p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">
              {format(calendarMonth, 'yyyy년 M월', { locale: ko })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleCalendarToday}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                오늘
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
                const diaryEntry = diaryDateMap.get(dateKey);
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isSelected = dateKey === currentDate;
                const isTodayDate = isTodayFn(day);
                const dayOfWeek = day.getDay();

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleCalendarDateClick(day)}
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
                    {diaryEntry && (
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full ${
                        diaryEntry.status === 'COMPLETED' ? 'bg-bridge-secondary' : 'bg-amber-400'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Diary List for Current Month */}
        <div className="flex-1 overflow-auto px-4 pb-4 min-h-0 custom-scrollbar">
          <div className="flex items-center gap-2 mb-2">
            <BookHeart size={14} className="text-bridge-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              이번 달 일기
            </span>
            {diaryList.length > 0 && (
              <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
                {diaryList.length}
              </span>
            )}
          </div>
          {diaryList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-xs">이번 달 일기가 아직 없어요</p>
              <p className="text-slate-600 text-[10px] mt-1">오늘부터 시작해볼까요?</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {diaryList.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setCurrentDate(d.diary_date); setShowMobileSidebar(false); }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all group ${
                    d.diary_date === currentDate
                      ? 'bg-bridge-accent/15 border border-bridge-accent/30'
                      : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                      d.status === 'COMPLETED' ? 'bg-bridge-secondary' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-white truncate group-hover:text-bridge-accent transition-colors">
                          {d.title || format(new Date(d.diary_date + 'T00:00:00'), 'M월 d일')}
                        </span>
                        <span className="text-sm flex-shrink-0 ml-2">
                          {d.mood ? MOODS.find((m) => m.value === d.mood)?.emoji || '' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          d.status === 'COMPLETED'
                            ? 'text-bridge-secondary/80 bg-bridge-secondary/10'
                            : 'text-amber-400/80 bg-amber-400/10'
                        }`}>
                          {d.status === 'COMPLETED' ? '완료' : '작성 중'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {format(new Date(d.diary_date + 'T00:00:00'), 'M/d (E)', { locale: ko })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-bridge-accent/30 border-t-bridge-accent rounded-full animate-spin" />
              불러오는 중...
            </div>
          </div>
        ) : !diary ? (
          /* No diary for this date - Warm Welcome */
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center gap-4 md:gap-5 max-w-md text-center"
            >
              {/* Greeting icon */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="relative"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-bridge-accent/20 via-purple-500/15 to-bridge-secondary/20 border border-white/10 flex items-center justify-center">
                  <Pencil size={32} className="text-bridge-accent" />
                </div>
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-bridge-secondary/20 border border-bridge-secondary/30 flex items-center justify-center">
                  <Sparkles size={13} className="text-bridge-secondary" />
                </div>
              </motion.div>

              {/* Time-aware greeting */}
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {isToday ? (
                    <>
                      {new Date().getHours() < 12
                        ? '좋은 아침이에요 ☀️'
                        : new Date().getHours() < 18
                          ? '좋은 오후예요 🌤'
                          : '수고한 하루였죠 🌙'}
                    </>
                  ) : (
                    `${format(new Date(currentDate + 'T00:00:00'), 'M월 d일', { locale: ko })}의 기록`
                  )}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {isToday
                    ? 'AI가 오늘 하루에 대해 물어볼게요.\n편하게 대화하다 보면 일기가 자연스럽게 완성돼요.'
                    : '이 날의 기억을 되살려 볼까요?\nAI와 함께 그날의 이야기를 기록해보세요.'}
                </p>
              </div>

              {/* CTA Button */}
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleStartDiary}
                className="flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-bridge-accent to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-bridge-accent/25 transition-shadow hover:shadow-bridge-accent/40"
              >
                <Sparkles size={18} />
                {isToday ? '오늘의 일기 시작하기' : '일기 작성하기'}
              </motion.button>

              {/* Subtle hint */}
              <p className="text-[11px] text-slate-600 mt-1">
                보통 3~5분이면 하루를 정리할 수 있어요
              </p>
            </motion.div>
          </div>
        ) : diary.status === 'COMPLETED' ? (
          /* Completed Diary View */
          <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg md:text-2xl font-bold font-serif text-white mb-1 truncate">
                    {diary.title || `${formatDate(diary.diary_date)}의 일기`}
                  </h2>
                  {diary.mood && (
                    <span className="text-lg">
                      {MOODS.find((m) => m.value === diary.mood)?.emoji || diary.mood}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReopen}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 border border-white/10 rounded-xl hover:text-white hover:bg-white/5 transition-all"
                  >
                    <RotateCcw size={14} />
                    이어서 쓰기
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 border border-white/10 rounded-xl hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all"
                  >
                    <RefreshCw size={14} />
                    다시 대화하기
                  </button>
                </div>
              </div>

              <div className="bg-bridge-obsidian/60 rounded-2xl border border-white/5 p-6">
                <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {diary.content || '아직 내용이 없습니다.'}
                </div>
              </div>

              {/* Conversation History */}
              {diary.messages && diary.messages.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                    대화 기록
                  </h3>
                  <div className="space-y-3">
                    {diary.messages.map((msg) => (
                      <ChatBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isCompleting ? (
          /* AI Generating Diary Content */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-bridge-accent/20 via-purple-500/15 to-bridge-secondary/20 border border-white/10 flex items-center justify-center">
                  <Sparkles size={28} className="text-bridge-accent animate-pulse" />
                </div>
                <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-bridge-accent/30 border-t-bridge-accent animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-1">일기를 정리하고 있어요</h3>
                <p className="text-slate-400 text-sm">대화 내용을 바탕으로 오늘의 일기를 작성 중...</p>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Chatting Mode */
          <>
            {/* Chat Messages */}
            <div className="flex-1 overflow-auto p-3 md:p-6 space-y-3 md:space-y-4 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-3 md:space-y-4">
                {diary.messages?.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                {isSending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-bridge-accent" />
                    </div>
                    <div className="bg-bridge-obsidian/60 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Complete Button + Mood Selector */}
            {diary.messages && diary.messages.filter((m) => m.role === 'USER').length >= 5 && (
              <div className="border-t border-white/[0.06] px-3 md:px-6 py-2 md:py-3">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-slate-500 w-full md:w-auto">
                      오늘의 기분:
                    </span>
                    {MOODS.map((mood) => (
                      <button
                        key={mood.value}
                        onClick={() => handleCompleteDiary(mood.value)}
                        disabled={isCompleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title={mood.label}
                      >
                        <span>{mood.emoji}</span>
                        <span className="text-slate-300">{mood.label}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => handleCompleteDiary()}
                      disabled={isCompleting}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-bridge-secondary/20 border border-bridge-secondary/30 text-bridge-secondary rounded-full text-xs font-bold hover:bg-bridge-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Check size={14} />
                      일기 완성
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-white/[0.06] px-3 md:px-6 py-3 md:py-4">
              <div className="max-w-2xl mx-auto flex gap-2 md:gap-3">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="오늘 하루를 이야기해주세요..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  disabled={isSending}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isSending}
                  className="p-3 bg-bridge-accent text-white rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reset Confirm Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="relative bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl max-w-sm w-full mx-4"
          >
            <button
              onClick={() => setShowResetConfirm(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">대화를 다시 시작할까요?</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  기존 대화 내용과 생성된 일기가 모두 삭제되고,<br />
                  새로운 대화가 시작됩니다.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full mt-1">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500/80 rounded-xl hover:bg-red-500 transition-all"
                >
                  다시 시작
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}

function ChatBubble({ message }: { message: DiaryMessage }) {
  const isAI = message.role === 'AI';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isAI ? '' : 'flex-row-reverse'}`}
    >
      {isAI && (
        <div className="w-8 h-8 rounded-full bg-bridge-accent/20 border border-bridge-accent/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-bridge-accent" />
        </div>
      )}
      <div
        className={`max-w-[90%] md:max-w-[80%] px-3 md:px-4 py-2.5 md:py-3 rounded-2xl text-sm leading-relaxed ${
          isAI
            ? 'bg-bridge-obsidian/60 border border-white/5 rounded-tl-sm text-slate-300'
            : 'bg-bridge-accent/15 border border-bridge-accent/20 rounded-tr-sm text-white'
        }`}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
