import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, BookHeart, ArrowLeft, LayoutGrid, Calendar, Plus, Command, Home, Loader2, Flag, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonalSchedule } from '../components/personal/PersonalSchedule';
import { PersonalDiary } from '../components/personal/PersonalDiary';
import { PersonalTaskBoard } from '../components/personal/PersonalTaskBoard';
import { TodaySidebar } from '../components/personal/TodaySidebar';
import { PersonalOverview } from '../components/personal/PersonalOverview';
import { PersonalCalendar } from '../components/personal/PersonalCalendar';

import { personalTaskAPI, personalHabitAPI } from '../utils/api';
import { PersonalTask, PersonalTaskPriority, HabitFrequency, HabitImportance } from '../types';
import { getTodayDateString } from '../utils/dateUtils';

type TabType = 'overview' | 'tasks' | 'schedule' | 'calendar' | 'diary';

export function PersonalBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        setTasks(data);
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
  const handleQuickHabit = useCallback(async (
    title: string,
    frequencyType: HabitFrequency,
    importance: HabitImportance,
    frequencyDays?: string,
  ) => {
    try {
      await personalHabitAPI.create({
        title,
        frequency_type: frequencyType,
        frequency_days: frequencyDays,
        importance,
      });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh bg-bridge-dark">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-bridge-dark text-white selection:bg-bridge-secondary/30">
      {/* Header */}
      <header className="min-h-[3.5rem] md:h-16 border-b border-bridge-border flex items-center justify-between px-3 md:px-6 bg-bridge-dark shrink-0 z-30 gap-2 safe-top">
        {/* 좌측 영역 */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button
            onClick={() => navigate('/boards')}
            className="p-2 hover:bg-bridge-surface-hover rounded-lg transition-colors text-zinc-400 hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>

          <h1 className="text-sm md:text-lg font-bold tracking-tight text-foreground truncate">{t('dashboard.mySpace')}</h1>
        </div>

        {/* 중앙 탭 영역 */}
        <div className="hidden md:flex justify-center min-w-0 md:flex-1">
          <nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl border border-bridge-border overflow-x-auto shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
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
          <div className="hidden md:flex items-center gap-1.5 text-zinc-500 text-xs">
            <Command size={12} />
            <span>K</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Today Sidebar — tasks 탭일 때만 */}
        {activeTab === 'tasks' && <TodaySidebar tasks={tasks} />}

        <div className="flex-1 overflow-hidden">
          {activeTab === 'overview' && (
            <PersonalOverview onNavigateTab={setActiveTab} />
          )}
          {activeTab === 'tasks' && (
            <PersonalTaskBoard
              tasks={tasks}
              onRefresh={refresh}
              onOptimisticUpdate={optimisticUpdate}
            />
          )}
          {activeTab === 'schedule' && <PersonalSchedule />}
          {activeTab === 'calendar' && <PersonalCalendar />}
          {activeTab === 'diary' && <PersonalDiary />}
        </div>
      </main>

      {/* 모바일 하단 여백 (탭바 + safe area 공간 확보) */}
      <div className="shrink-0 md:hidden" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }} />

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bridge-obsidian/95 backdrop-blur-xl border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'text-bridge-secondary'
                  : 'text-zinc-500'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="personal-tab-indicator"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-bridge-secondary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Floating Quick Capture Button */}
      {activeTab === 'tasks' && (
        <button
          onClick={() => setQuickCaptureOpen(true)}
          className="fixed fab-bottom-safe right-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 flex items-center justify-center text-white hover:bg-bridge-accent/90 hover:scale-105 active:scale-95 transition-all z-50"
        >
          <Plus size={20} className="md:w-6 md:h-6" />
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

// 0=Sun … 6=Sat — display order: Mon→Sun
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Mon first, Sun last

const IMPORTANCE_OPTIONS: { value: HabitImportance; label: string; dot: string; color: string }[] = [
  { value: 'MEDIUM', label: '보통', dot: 'bg-slate-400', color: 'text-slate-400' },
  { value: 'HIGH',   label: '중요', dot: 'bg-orange-500', color: 'text-orange-500' },
];

/** Derive frequency_type + frequency_days from a set of selected day indices */
function deriveFrequency(days: Set<number>): { type: HabitFrequency; days?: string } {
  if (days.size === 7) return { type: 'DAILY' };
  const sorted = [...days].sort((a, b) => a - b);
  const weekdays = [1, 2, 3, 4, 5];
  const weekend  = [0, 6];
  if (sorted.length === 5 && weekdays.every(d => days.has(d))) return { type: 'WEEKDAY' };
  if (sorted.length === 2 && weekend.every(d => days.has(d))) return { type: 'WEEKEND' };
  return { type: 'CUSTOM', days: sorted.join(',') };
}

function QuickCaptureModal({ onClose, onSubmitTask, onSubmitHabit }: {
  onClose: () => void;
  onSubmitTask: (title: string, dueDate?: string, priority?: PersonalTaskPriority) => void;
  onSubmitHabit: (title: string, frequencyType: HabitFrequency, importance: HabitImportance, frequencyDays?: string) => void;
}) {
  const [captureType, setCaptureType] = useState<CaptureType>('task');
  const [title, setTitle] = useState('');
  // Task fields
  const [dueDate, setDueDate] = useState(getTodayDateString());
  const [priority, setPriority] = useState<PersonalTaskPriority>('MEDIUM');
  const [showPriority, setShowPriority] = useState(false);
  // Habit fields — default all days selected
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [importance, setImportance] = useState<HabitImportance>('MEDIUM');
  const [showImportance, setShowImportance] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    if (captureType === 'task') {
      await onSubmitTask(title.trim(), dueDate || undefined, priority);
    } else {
      const freq = deriveFrequency(selectedDays);
      await onSubmitHabit(title.trim(), freq.type, importance, freq.days);
    }
    setIsSubmitting(false);
    onClose();
  };

  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === priority)!;
  const currentImportance = IMPORTANCE_OPTIONS.find(i => i.value === importance)!;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-[20vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
      exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl p-4">
        {/* Type Toggle */}
        <div className="flex items-center gap-1 mb-3 bg-white/5 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setCaptureType('task')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              captureType === 'task'
                ? 'bg-bridge-accent text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flag size={12} />
            할 일
          </button>
          <button
            onClick={() => setCaptureType('habit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              captureType === 'habit'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Repeat size={12} />
            습관
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
          placeholder={captureType === 'task' ? '할 일을 입력하세요...' : '습관을 입력하세요...'}
          className="w-full bg-transparent text-white text-lg placeholder-slate-600 outline-none py-2"
        />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            {captureType === 'task' ? (
              <>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none focus:border-bridge-accent/50 [color-scheme:dark]"
                  placeholder="마감일"
                />
                {/* Priority selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowPriority(!showPriority)}
                    className="flex items-center gap-1.5 px-2 py-1 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${currentPriority.dot}`} />
                    <span className={`text-xs ${currentPriority.color}`}>{currentPriority.label}</span>
                  </button>
                  {showPriority && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPriority(false)} />
                      <div className="absolute left-0 bottom-full mb-1 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
                        {PRIORITY_OPTIONS.map(p => (
                          <button
                            key={p.value}
                            onClick={() => { setPriority(p.value); setShowPriority(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                              priority === p.value ? 'text-white' : 'text-slate-400'
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
              </>
            ) : (
              <>
                {/* Day chips — inline togglable */}
                <div className="flex items-center gap-0.5">
                  {DAY_ORDER.map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`w-7 h-7 rounded-full text-[11px] font-bold transition-all ${
                        selectedDays.has(day)
                          ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/30'
                          : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
                {/* Importance selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowImportance(!showImportance)}
                    className="flex items-center gap-1.5 px-2 py-1 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${currentImportance.dot}`} />
                    <span className={`text-xs ${currentImportance.color}`}>{currentImportance.label}</span>
                  </button>
                  {showImportance && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowImportance(false)} />
                      <div className="absolute left-0 bottom-full mb-1 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
                        {IMPORTANCE_OPTIONS.map(i => (
                          <button
                            key={i.value}
                            onClick={() => { setImportance(i.value); setShowImportance(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                              importance === i.value ? 'text-white' : 'text-slate-400'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full ${i.dot}`} />
                            {i.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            <span className="text-xs text-slate-500 hidden sm:inline">Enter로 추가</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className={`px-4 py-1.5 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors ${
              captureType === 'task'
                ? 'bg-bridge-accent hover:bg-bridge-accent/90'
                : 'bg-purple-500 hover:bg-purple-500/90'
            }`}
          >
            추가
          </button>
        </div>
      </div>
    </motion.div>
  );
}
