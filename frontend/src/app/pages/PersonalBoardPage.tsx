import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, BookHeart, ArrowLeft, LayoutGrid, Calendar, Plus, Command, Home, Loader2, Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import { PersonalSchedule } from '../components/personal/PersonalSchedule';
import { PersonalDiary } from '../components/personal/PersonalDiary';
import { PersonalTaskBoard } from '../components/personal/PersonalTaskBoard';
import { TodaySidebar } from '../components/personal/TodaySidebar';
import { PersonalOverview } from '../components/personal/PersonalOverview';
import { PersonalCalendar } from '../components/personal/PersonalCalendar';
import { PersonalHabits } from '../components/personal/PersonalHabits';
import { personalTaskAPI } from '../utils/api';
import { PersonalTask } from '../types';

type TabType = 'overview' | 'tasks' | 'schedule' | 'habits' | 'calendar' | 'diary';

export function PersonalBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { key: 'overview' as TabType, label: 'Overview', icon: Home },
    { key: 'tasks' as TabType, label: 'Tasks', icon: LayoutGrid },
    { key: 'schedule' as TabType, label: 'Schedule', icon: CalendarDays },
    { key: 'habits' as TabType, label: 'Habits', icon: Flame },
    { key: 'calendar' as TabType, label: 'Calendar', icon: Calendar },
    { key: 'diary' as TabType, label: 'AI Diary', icon: BookHeart },
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
  const handleQuickCapture = useCallback(async (title: string, dueDate?: string) => {
    try {
      await personalTaskAPI.create({ title, due_date: dueDate || undefined });
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }, []);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bridge-dark">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bridge-dark text-white selection:bg-bridge-secondary/30">
      {/* Header */}
      <header className="min-h-[3.5rem] md:h-16 border-b border-bridge-border flex items-center justify-between px-3 md:px-6 bg-bridge-dark shrink-0 z-30 gap-2">
        {/* 좌측 영역 */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button
            onClick={() => navigate('/boards')}
            className="p-2 hover:bg-bridge-surface-hover rounded-lg transition-colors text-zinc-400 hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>

          <h1 className="text-sm md:text-lg font-bold tracking-tight text-foreground truncate">My Space</h1>
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
              key={refreshKey}
              tasks={tasks}
              onRefresh={refresh}
            />
          )}
          {activeTab === 'schedule' && <PersonalSchedule />}
          {activeTab === 'habits' && <PersonalHabits />}
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
          className="fixed bottom-20 md:bottom-6 right-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 flex items-center justify-center text-white hover:bg-bridge-accent/90 hover:scale-105 active:scale-95 transition-all z-50"
        >
          <Plus size={20} className="md:w-6 md:h-6" />
        </button>
      )}

      {/* Quick Capture Modal (간소화) */}
      {quickCaptureOpen && (
        <QuickCaptureModal
          onClose={() => setQuickCaptureOpen(false)}
          onSubmit={handleQuickCapture}
        />
      )}
    </div>
  );
}

// 간소화된 Quick Capture 모달 (마감일 지원)
function QuickCaptureModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (title: string, dueDate?: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    await onSubmit(title.trim(), dueDate || undefined);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-start justify-center sm:pt-[20vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl p-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="할 일을 입력하세요..."
          className="w-full bg-transparent text-white text-lg placeholder-slate-600 outline-none py-2"
        />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none focus:border-bridge-accent/50 [color-scheme:dark]"
              placeholder="마감일"
            />
            <span className="text-xs text-slate-500">Enter로 추가</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className="px-4 py-1.5 bg-bridge-accent text-white text-sm rounded-lg font-medium disabled:opacity-50 hover:bg-bridge-accent/90 transition-colors"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
