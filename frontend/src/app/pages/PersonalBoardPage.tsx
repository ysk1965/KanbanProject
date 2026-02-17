import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, BookHeart, ArrowLeft, LayoutGrid, Calendar, Plus, Command, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { PersonalSchedule } from '../components/personal/PersonalSchedule';
import { PersonalDiary } from '../components/personal/PersonalDiary';
import { PersonalKanbanView } from '../components/personal/PersonalKanbanView';
import { TodaySidebar } from '../components/personal/TodaySidebar';
import { PersonalOverview } from '../components/personal/PersonalOverview';
import { CalendarView } from '../components/CalendarView';
import { QuickAddTaskModal } from '../components/QuickAddTaskModal';
import { boardService, taskService, featureService } from '../utils/services';
import { boardAPI, BoardFullResponse } from '../utils/api';
import { Block, Feature, Task, ChecklistItem } from '../types';
import { Loader2 } from 'lucide-react';

type TabType = 'overview' | 'kanban' | 'schedule' | 'diary' | 'calendar';

export function PersonalBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [personalBoardId, setPersonalBoardId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checklistDataMap, setChecklistDataMap] = useState<{ [taskId: string]: ChecklistItem[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);

  const tabs = [
    { key: 'overview' as TabType, label: 'Overview', icon: Home },
    { key: 'kanban' as TabType, label: 'Kanban', icon: LayoutGrid },
    { key: 'schedule' as TabType, label: 'Schedule', icon: CalendarDays },
    { key: 'diary' as TabType, label: 'AI Diary', icon: BookHeart },
    { key: 'calendar' as TabType, label: 'Calendar', icon: Calendar },
  ];

  // Personal Board 로드 (lazy 생성)
  useEffect(() => {
    const loadPersonalBoard = async () => {
      try {
        setIsLoading(true);
        const board = await boardService.getPersonalBoard();
        setPersonalBoardId(board.id);

        const fullData: BoardFullResponse = await boardAPI.getBoardFull(board.id);
        setBlocks(fullData.blocks || []);
        setFeatures(fullData.features || []);
        setTasks(fullData.tasks || []);
      } catch (error) {
        console.error('Failed to load personal board:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPersonalBoard();
  }, []);

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

  // Quick Capture: Task 생성
  const handleQuickCapture = useCallback(async (data: {
    featureId?: string;
    newFeatureTitle?: string;
    taskTitle: string;
  }) => {
    if (!personalBoardId) return;
    try {
      setIsSubmittingTask(true);

      let featureId = data.featureId;

      // Feature가 없으면 기본 Feature 생성
      if (!featureId && features.length === 0) {
        const newFeature = await featureService.createFeature(personalBoardId, {
          title: data.newFeatureTitle || 'Personal',
        });
        featureId = newFeature.id;
        setFeatures(prev => [...prev, newFeature]);
      } else if (!featureId && features.length > 0) {
        featureId = features[0].id;
      }

      if (!featureId) return;

      await taskService.createTask(personalBoardId, featureId, {
        title: data.taskTitle,
      });

      // Refresh kanban view
      setKanbanRefreshKey(k => k + 1);

      // Reload data for calendar tab
      const fullData = await boardAPI.getBoardFull(personalBoardId);
      setTasks(fullData.tasks || []);
      setFeatures(fullData.features || []);
      setBlocks(fullData.blocks || []);
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsSubmittingTask(false);
    }
  }, [personalBoardId, features]);

  // 첫 번째 블록 (To Do) 이름
  const firstBlockName = blocks.length > 0
    ? [...blocks].sort((a, b) => a.position - b.position)[0]?.name
    : 'To Do';

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
      <header className="h-14 border-b border-white/[0.06] bg-bridge-obsidian/80 backdrop-blur-sm px-4 md:px-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/boards')}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
        >
          <ArrowLeft size={18} />
        </button>

        <h1 className="text-lg font-bold font-serif">My Space</h1>

        {/* Tabs */}
        <div className="flex items-center gap-1 ml-6 bg-white/5 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="personal-tab-bg"
                  className="absolute inset-0 bg-bridge-accent/20 border border-bridge-accent/30 rounded-lg"
                  transition={{ type: 'spring', duration: 0.3 }}
                />
              )}
              <tab.icon size={16} className="relative z-10" />
              <span className="relative z-10 hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Quick Capture shortcut hint */}
        <div className="ml-auto hidden md:flex items-center gap-1.5 text-slate-500 text-xs">
          <Command size={12} />
          <span>K</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Today Sidebar — kanban 탭일 때만 */}
        {activeTab === 'kanban' && personalBoardId && (
          <TodaySidebar boardId={personalBoardId} />
        )}

        <div className="flex-1 overflow-hidden">
          {activeTab === 'overview' && personalBoardId && (
            <PersonalOverview
              boardId={personalBoardId}
              tasks={tasks}
              onNavigateTab={setActiveTab}
            />
          )}
          {activeTab === 'kanban' && personalBoardId && (
            <PersonalKanbanView
              key={kanbanRefreshKey}
              boardId={personalBoardId}
            />
          )}
          {activeTab === 'schedule' && <PersonalSchedule />}
          {activeTab === 'diary' && <PersonalDiary />}
          {activeTab === 'calendar' && personalBoardId && (
            <CalendarView
              boardId={personalBoardId}
              features={features}
              tasks={tasks}
              checklistDataMap={checklistDataMap}
              onViewFeature={() => {}}
              onViewTask={() => {}}
            />
          )}
        </div>
      </main>

      {/* Floating Quick Capture Button */}
      {activeTab === 'kanban' && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setQuickCaptureOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 flex items-center justify-center text-white hover:bg-bridge-accent/90 transition-colors z-50"
        >
          <Plus size={24} />
        </motion.button>
      )}

      {/* Quick Capture Modal */}
      <QuickAddTaskModal
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        features={features}
        blockName={firstBlockName}
        onSubmit={handleQuickCapture}
        isSubmitting={isSubmittingTask}
        isSimpleMode
      />
    </div>
  );
}
