import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FEATURE_COLORS } from '../constants';
import { CalendarDays, BookHeart, ArrowLeft, LayoutGrid, Calendar, Plus, Command, Home, Loader2, Flag, Repeat, Flame, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonalSchedule, type TabSwipeHandle } from '../components/personal/PersonalSchedule';
import { PersonalDiary } from '../components/personal/PersonalDiary';
import { PersonalTaskBoard } from '../components/personal/PersonalTaskBoard';

import { PersonalOverview } from '../components/personal/PersonalOverview';
import { PersonalCalendar } from '../components/personal/PersonalCalendar';
import { UserMenu } from '../components/UserMenu';
import { useAuth } from '../contexts/AuthContext';

import { personalTaskAPI, personalHabitAPI } from '../utils/api';
import { PersonalTask, PersonalTaskPriority, HabitFrequency, HabitImportance } from '../types';
import { getTodayDateString } from '../utils/dateUtils';

type TabType = 'overview' | 'tasks' | 'schedule' | 'calendar' | 'diary';
const TAB_ORDER: TabType[] = ['overview', 'tasks', 'schedule', 'calendar', 'diary'];

export function PersonalBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, logout, hideBilling } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { key: 'overview' as TabType, label: t('personal.tabs.overview', 'Overview'), icon: Home },
    { key: 'tasks' as TabType, label: t('personal.tabs.todo', 'ToDo'), icon: LayoutGrid },
    { key: 'schedule' as TabType, label: t('personal.tabs.schedule', 'Schedule'), icon: CalendarDays },
    { key: 'calendar' as TabType, label: t('personal.tabs.calendar', 'Calendar'), icon: Calendar },
    { key: 'diary' as TabType, label: t('personal.tabs.diary', 'AI Diary'), icon: BookHeart },
  ];

  // PersonalTask 로드 (board 의존 없이 user 기반)
  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        const data = await personalTaskAPI.getAll();
        setTasks(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load personal tasks:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTasks();
  }, [refreshKey]);

  // Ctrl+K / Cmd+K 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Quick Capture: PersonalTask 생성 (Feature 불필요)
  const handleQuickCapture = useCallback(async (title: string, dueDate?: string, priority?: PersonalTaskPriority) => {
    try {
      await personalTaskAPI.create({ title, due_date: dueDate || undefined, priority: priority || 'MEDIUM' });
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }, []);

  // Quick Capture: PersonalHabit 생성
  const handleQuickHabit = useCallback(async (data: {
    title: string;
    frequency_type?: HabitFrequency;
    frequency_days?: string;
    importance?: HabitImportance;
    icon?: string;
    color?: string;
    description?: string;
  }) => {
    try {
      await personalHabitAPI.create(data);
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Failed to create habit:', error);
    }
  }, []);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Optimistic update: 로컬 state만 즉시 변경 (API는 호출자가 별도 처리)
  const optimisticUpdate = useCallback((taskId: string, updates: Partial<PersonalTask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  // 탭 전환 슬라이드 방향 (1: 오른쪽→, -1: ←왼쪽)
  const slideDirectionRef = useRef(0);

  // 탭별 스와이프 네비게이션 ref
  const scheduleRef = useRef<TabSwipeHandle>(null);
  const calendarRef = useRef<TabSwipeHandle>(null);
  const diaryRef = useRef<TabSwipeHandle>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const changeTab = useCallback((newTab: TabType) => {
    setActiveTab(prev => {
      if (prev === newTab) return prev;
      slideDirectionRef.current = TAB_ORDER.indexOf(newTab) > TAB_ORDER.indexOf(prev) ? 1 : -1;
      return newTab;
    });
  }, []);

  // 모바일 스와이프로 탭 전환
  const touchStartRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const target = touchStartRef.current.target;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    // 가로 스크롤 가능한 컨테이너 내부에서 시작된 스와이프는 무시
    let el = target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth + 1) return;
      el = el.parentElement;
    }

    const currentTab = activeTabRef.current;

    // 홈/할일: 스와이프 없음
    if (currentTab === 'overview' || currentTab === 'tasks') return;

    // 일정: 전날/다음날 또는 전주/다음주
    if (currentTab === 'schedule') {
      if (deltaX < 0) scheduleRef.current?.swipeNext();
      else scheduleRef.current?.swipePrev();
      return;
    }

    // 캘린더: 이전월/다음월
    if (currentTab === 'calendar') {
      if (deltaX < 0) calendarRef.current?.swipeNext();
      else calendarRef.current?.swipePrev();
      return;
    }

    // AI다이어리: 전날/다음날
    if (currentTab === 'diary') {
      if (deltaX < 0) diaryRef.current?.swipeNext();
      else diaryRef.current?.swipePrev();
      return;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh bg-bridge-dark" role="status" aria-label="로딩 중">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bridge-dark text-foreground selection:bg-bridge-secondary/30">
      {/* Header */}
      <header className="min-h-[3.5rem] md:h-16 border-b border-bridge-border flex items-center justify-between px-3 md:px-6 bg-bridge-dark shrink-0 z-30 gap-2 safe-top">
        {/* 좌측 영역 */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button
            onClick={() => navigate('/boards')}
            className="p-2 hover:bg-bridge-surface-hover rounded-lg transition-colors text-slate-400 hover:text-foreground"
          >
            <Home size={18} />
          </button>

          <h1 className="text-sm md:text-lg font-bold tracking-tight text-foreground truncate">{t('dashboard.mySpace')}</h1>
        </div>

        {/* 중앙 탭 영역 */}
        <div className="hidden md:flex justify-center min-w-0 md:flex-1">
          <nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl border border-bridge-border overflow-x-auto shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => changeTab(tab.key)}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                    : 'text-slate-400 hover:text-foreground hover:bg-bridge-surface-hover'
                }`}
              >
                <tab.icon size={14} />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* 우측 영역 */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 text-slate-500 text-xs">
            <Command size={12} />
            <span>K</span>
          </div>
          {currentUser && (
            <UserMenu
              user={{
                ...currentUser,
                avatar: currentUser.profile_image || undefined,
              }}
              onOpenSubscription={() => {}}
              onLogout={logout}
              hideBilling={hideBilling}
              hideMySpace
            />
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode="wait" custom={slideDirectionRef.current}>
          <motion.div
            key={activeTab}
            custom={slideDirectionRef.current}
            variants={{
              enter: (dir: number) => ({ x: dir > 0 ? '40%' : '-40%', opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (dir: number) => ({ x: dir > 0 ? '-40%' : '40%', opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            {activeTab === 'overview' && (
              <PersonalOverview onNavigateTab={changeTab} onRefreshTasks={refresh} />
            )}
            {activeTab === 'tasks' && (
              <PersonalTaskBoard
                tasks={tasks}
                onRefresh={refresh}
                onOptimisticUpdate={optimisticUpdate}
              />
            )}
            {activeTab === 'schedule' && <PersonalSchedule ref={scheduleRef} />}
            {activeTab === 'calendar' && <PersonalCalendar ref={calendarRef} />}
            {activeTab === 'diary' && <PersonalDiary ref={diaryRef} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom toolbar – Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="md:hidden border-t border-foreground/[0.08] px-3 py-2 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 flex-1">
            {t('personal.tasks.tapToManage')}
          </p>
          <button
            onClick={() => setQuickCaptureOpen(true)}
            className="p-3 rounded-xl bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30 hover:bg-bridge-accent/90 active:scale-95 transition-all"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* 모바일 하단 여백 (탭바 + safe area 공간 확보) */}
      <div className="shrink-0 md:hidden" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }} />

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bridge-obsidian/95 backdrop-blur-xl border-t border-foreground/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => changeTab(tab.key)}
                className="relative flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg"
              >
                {isActive && (
                  <motion.div
                    layoutId="personal-tab-indicator"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-bridge-secondary"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                {isActive && (
                  <motion.div
                    layoutId="personal-tab-glow"
                    className="absolute inset-0 rounded-lg bg-bridge-secondary/8"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={isActive
                    ? { scale: 1.15, y: -2 }
                    : { scale: 1, y: 0 }
                  }
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <tab.icon
                    size={20}
                    className={`transition-colors duration-200 ${isActive ? 'text-bridge-secondary' : 'text-slate-500'}`}
                  />
                </motion.div>
                <motion.span
                  className={`text-xs font-medium transition-colors duration-200 ${isActive ? 'text-bridge-secondary' : 'text-slate-500'}`}
                  animate={isActive
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0.7, y: 0 }
                  }
                  transition={{ duration: 0.2 }}
                >
                  {tab.label}
                </motion.span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quick Capture Button – Desktop: FAB / Mobile: handled in toolbar above */}
      {activeTab === 'tasks' && (
        <button
          onClick={() => setQuickCaptureOpen(true)}
          className="hidden md:flex fixed fab-bottom-safe right-6 w-14 h-14 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 items-center justify-center text-white hover:bg-bridge-accent/90 hover:scale-105 active:scale-95 transition-all z-50"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Quick Capture Modal (간소화) */}
      <AnimatePresence>
        {quickCaptureOpen && (
          <QuickCaptureModal
            onClose={() => setQuickCaptureOpen(false)}
            onSubmitTask={handleQuickCapture}
            onSubmitHabit={handleQuickHabit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// 간소화된 Quick Capture 모달 (할 일 + 습관 토글)
type CaptureType = 'task' | 'habit';

const PRIORITY_OPTIONS: { value: PersonalTaskPriority; label: string; dot: string; color: string }[] = [
  { value: 'MEDIUM', label: '보통', dot: 'bg-amber-400', color: 'text-amber-400' },
  { value: 'HIGH',   label: '높음', dot: 'bg-orange-500', color: 'text-orange-500' },
  { value: 'URGENT', label: '긴급', dot: 'bg-red-500', color: 'text-red-500' },
];

// Habit: day chips (Mon → Sun, Java DayOfWeek)
const HABIT_DAY_CHIPS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

const HABIT_COLORS = FEATURE_COLORS;

const HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
];

function QuickCaptureModal({ onClose, onSubmitTask, onSubmitHabit }: {
  onClose: () => void;
  onSubmitTask: (title: string, dueDate?: string, priority?: PersonalTaskPriority) => void;
  onSubmitHabit: (data: {
    title: string;
    frequency_type?: HabitFrequency;
    frequency_days?: string;
    importance?: HabitImportance;
    icon?: string;
    color?: string;
    description?: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const [captureType, setCaptureType] = useState<CaptureType>('task');
  const [title, setTitle] = useState('');
  // Task fields
  const [dueDate, setDueDate] = useState(getTodayDateString());
  const [priority, setPriority] = useState<PersonalTaskPriority>('MEDIUM');
  const [showPriority, setShowPriority] = useState(false);
  // Habit fields — default all days selected
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [showMore, setShowMore] = useState(false);
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [description, setDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  /** Derive frequency_type from selected days */
  const deriveFrequency = (days: number[]): { type: HabitFrequency; days?: string } => {
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 7) return { type: 'DAILY' };
    const weekdays = [1, 2, 3, 4, 5];
    const weekend = [0, 6];
    if (sorted.length === 5 && weekdays.every(d => sorted.includes(d))) return { type: 'WEEKDAY' };
    if (sorted.length === 2 && weekend.every(d => sorted.includes(d))) return { type: 'WEEKEND' };
    return { type: 'CUSTOM', days: sorted.join(',') };
  };

  const isHabitValid = title.trim().length > 0 && selectedDays.length > 0;

  const handleSubmit = async () => {
    if (captureType === 'task') {
      if (!title.trim()) return;
      setIsSubmitting(true);
      await onSubmitTask(title.trim(), dueDate || undefined, priority);
    } else {
      if (!isHabitValid) return;
      setIsSubmitting(true);
      const freq = deriveFrequency(selectedDays);
      await onSubmitHabit({
        title: title.trim(),
        frequency_type: freq.type,
        frequency_days: freq.days,
        icon: icon || undefined,
        color,
        description: description.trim() || undefined,
      });
    }
    setIsSubmitting(false);
    onClose();
  };

  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === priority)!;

  // Unified inline capture — task & habit share the same bottom sheet
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-[20vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
      exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl p-4"
        layout
        transition={{ layout: { type: 'spring', stiffness: 500, damping: 35 } }}
      >
        {/* Type Toggle */}
        <div className="flex items-center gap-1 mb-3 bg-foreground/5 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setCaptureType('task')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              captureType === 'task'
                ? 'bg-bridge-accent text-white shadow-sm'
                : 'text-slate-400 hover:text-foreground'
            }`}
          >
            <Flag size={12} />
            {t('personal.quickCapture.task', '할 일')}
          </button>
          <button
            onClick={() => setCaptureType('habit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              captureType === 'habit'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-foreground'
            }`}
          >
            <Repeat size={12} />
            {t('personal.quickCapture.habit', '습관')}
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder={captureType === 'task'
            ? t('personal.quickCapture.taskPlaceholder', '할 일을 입력하세요...')
            : t('personal.quickCapture.habitPlaceholder', '습관 이름을 입력하세요...')
          }
          className="w-full bg-transparent text-foreground text-lg placeholder-slate-500 outline-none py-2"
        />

        <AnimatePresence mode="wait">
          {captureType === 'task' ? (
            <motion.div
              key="task-fields"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-between mt-3 pt-3 border-t border-foreground/[0.08]"
            >
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-400 border border-foreground/10 rounded-lg px-2 py-1 outline-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 dark:[color-scheme:dark]"
                  placeholder="마감일"
                />
                {/* Priority selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowPriority(!showPriority)}
                    className="flex items-center gap-1.5 px-2 py-1 border border-foreground/10 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${currentPriority.dot}`} />
                    <span className={`text-xs ${currentPriority.color}`}>{currentPriority.label}</span>
                  </button>
                  {showPriority && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPriority(false)} />
                      <div className="absolute left-0 bottom-full mb-1 bg-bridge-obsidian border border-foreground/10 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
                        {PRIORITY_OPTIONS.map(p => (
                          <button
                            key={p.value}
                            onClick={() => { setPriority(p.value); setShowPriority(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/5 transition-colors ${
                              priority === p.value ? 'text-foreground' : 'text-slate-400'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full ${p.dot}`} />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <span className="text-xs text-slate-500 hidden sm:inline">Enter</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || isSubmitting}
                className="px-4 py-1.5 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors bg-bridge-accent hover:bg-bridge-accent/90"
              >
                {t('personal.quickCapture.add', '추가')}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="habit-fields"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3"
            >
              {/* Repeat Days - compact inline */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 flex-shrink-0">{t('personal.habit.repeatOn', '반복')}</span>
                <div className="flex gap-1 flex-1">
                  {HABIT_DAY_CHIPS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleDay(value)}
                      className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${
                        selectedDays.includes(value)
                          ? 'bg-purple-500 text-white'
                          : 'bg-foreground/5 text-slate-500 hover:bg-foreground/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* More options toggle */}
              <AnimatePresence>
                {showMore && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {/* Icon Picker */}
                    <div className="flex flex-wrap gap-1">
                      {HABIT_ICONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setIcon(icon === emoji ? '' : emoji)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all ${
                            icon === emoji
                              ? 'bg-purple-500/20 ring-2 ring-purple-500 scale-110'
                              : 'bg-foreground/5 hover:bg-foreground/10'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Color Picker */}
                    <div className="flex gap-2">
                      {HABIT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className={`w-6 h-6 rounded-full transition-all ${
                            color === c
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110'
                              : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom row: more options + submit */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMore(!showMore)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-muted-foreground transition-colors"
                  >
                    {showMore ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showMore ? t('personal.habit.lessOptions', '접기') : t('personal.habit.moreOptions', '더 보기')}
                  </button>
                  <span className="text-xs text-slate-500 hidden sm:inline">Enter</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!isHabitValid || isSubmitting}
                  className="px-4 py-1.5 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors bg-purple-500 hover:bg-purple-500/90"
                >
                  {t('personal.quickCapture.add', '추가')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
