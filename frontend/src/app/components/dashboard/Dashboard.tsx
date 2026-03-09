import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Star, LayoutGrid, LogOut, Package2, AlertTriangle, Menu, FlaskConical, CalendarDays, BookHeart, ListTodo, List, Grid3X3, ChevronRight, X, Users, CheckCircle2, Flame, Clock, Sparkles, Circle, Flag, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Board, PersonalDashboardToday } from '../../types';
import { testDataAPI, personalDashboardAPI, resolveFileUrl } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import { boardService } from '../../utils/services';
import { getInitials } from '../../utils/assigneeColor';
import { Sidebar } from './Sidebar';
import { BoardCard, CreateBoardCard, getGradient } from './BoardCard';
import { CreateBoardModal } from './CreateBoardModal';
import { EditBoardModal } from './EditBoardModal';
import { OnboardingModal } from '../OnboardingModal';


interface DashboardProps {
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string, description?: string, backgroundGradient?: string) => void;
  onToggleStar: (boardId: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  onUpdateBoard?: (boardId: string, name: string, description?: string, backgroundGradient?: string) => void;
  onRefreshBoards: () => void;
}

// 삭제 확인 모달
function DeleteConfirmModal({
  isOpen,
  boardName,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  boardName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-bridge-obsidian rounded-2xl overflow-hidden shadow-2xl border border-bridge-border p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/20 rounded-full">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{t('board.deleteBoard')}</h2>
          </div>

          <p className="text-slate-400 mb-6">
            <span className="font-bold text-foreground">"{boardName}"</span> {t('board.deleteConfirm')}
            <br />
            <span className="text-rose-400 text-sm">{t('board.deleteIrreversible')}</span>
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors border border-bridge-border rounded-xl hover:bg-foreground/5"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 bg-rose-500 text-sm font-bold rounded-xl hover:bg-rose-600 transition-colors"
            >
              {t('common.delete')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

type ViewMode = 'grid' | 'list';
type BoardFilter = 'all' | 'owned' | 'joined';

export function Dashboard({
  boards,
  onSelectBoard,
  onCreateBoard,
  onToggleStar,
  onDeleteBoard,
  onUpdateBoard,
  onRefreshBoards,
}: DashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, logout, isAdmin, updateCurrentUser } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Board | null>(null);
  const [isCreatingTestBoard, setIsCreatingTestBoard] = useState(false);
  const [isCreatingTestOrg, setIsCreatingTestOrg] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('all');
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('bridge_show_onboarding') === 'true'
  );

  // Personal Board Today 데이터
  const [todayData, setTodayData] = useState<PersonalDashboardToday | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await personalDashboardAPI.getToday(getTodayDateString());
        setTodayData(data);
      } catch {
        // Personal dashboard data may not be available
      }
    })();
  }, []);

  // 테스트 보드 생성/참여 (개발용)
  const handleCreateTestBoard = async () => {
    if (isCreatingTestBoard) return;
    setIsCreatingTestBoard(true);
    try {
      const response = await testDataAPI.createTestBoard();
      onRefreshBoards();
      onSelectBoard(response.board_id);
    } catch (error) {
      console.error('Failed to create/join test board:', error);
    } finally {
      setIsCreatingTestBoard(false);
    }
  };

  // 테스트 조직 생성/참여 (개발용)
  const handleCreateTestOrg = async () => {
    if (isCreatingTestOrg) return;
    setIsCreatingTestOrg(true);
    try {
      const response = await testDataAPI.createTestOrganization();
      navigate(`/organizations/${response.organization_id}`);
    } catch (error) {
      console.error('Failed to create/join test organization:', error);
    } finally {
      setIsCreatingTestOrg(false);
    }
  };

  // 즐겨찾기 보드 필터링
  const starredBoards = useMemo(
    () => boards.filter((b) => b.is_starred),
    [boards]
  );

  // 검색 + 필터링
  const filteredBoards = useMemo(() => {
    let result = boards;

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description?.toLowerCase().includes(q))
      );
    }

    // Board filter
    if (boardFilter === 'owned') {
      result = result.filter(b => b.role === 'OWNER');
    } else if (boardFilter === 'joined') {
      result = result.filter(b => b.role !== 'OWNER');
    }

    return result;
  }, [boards, searchQuery, boardFilter]);

  const handleBoardClick = (board: Board) => {
    onSelectBoard(board.id);
  };

  const handleDeleteClick = (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (board) {
      setDeleteTarget({ id: boardId, name: board.name });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget && onDeleteBoard) {
      onDeleteBoard(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const handleEditClick = (board: Board) => {
    setEditTarget(board);
  };

  const handleUpdateBoard = (boardId: string, name: string, description?: string, backgroundGradient?: string) => {
    if (onUpdateBoard) {
      onUpdateBoard(boardId, name, description, backgroundGradient);
    }
    setEditTarget(null);
  };

  const todayTaskCount = todayData
    ? (todayData.due_today_tasks?.length || 0) + (todayData.in_progress_tasks?.length || 0)
    : 0;

  const hasPersonalSpace = currentUser?.personal_space_enabled ?? false;

  return (
    <div className="fixed inset-0 flex text-foreground overflow-hidden selection:bg-bridge-secondary/30 bg-bridge-dark" style={{ background: 'radial-gradient(ellipse at 20% 0%, var(--bridge-dark) 0%, var(--bridge-dark) 50%, var(--bridge-dark) 100%)' }}>
      {/* Cosmic Background — dark mode only */}
      <div className="absolute inset-0 pointer-events-none hidden dark:block">
        <div className="absolute w-[600px] h-[600px] rounded-full blur-[200px]" style={{ top: '-10%', right: '-5%', background: 'radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[180px]" style={{ bottom: '-5%', left: '-5%', background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)' }} />
        <div className="star-bg opacity-30" style={{ position: 'absolute', inset: 0 }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(3,5,8,0.5) 100%)' }} />
      </div>

      {/* Sidebar - now with boards data */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        boards={boards}
        onSelectBoard={onSelectBoard}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0 min-h-0">
        {/* Header */}
        <header className="border-b border-bridge-border bg-bridge-dark/60 backdrop-blur-sm shrink-0 safe-top">
          <div className="h-14 px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors shrink-0"
            >
              <Menu size={18} />
            </button>

            {/* Desktop Search */}
            <div className="relative w-full max-w-xs hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                type="text"
                placeholder={t('dashboard.searchPlaceholder')}
                className="w-full bg-foreground/[0.04] border border-bridge-border rounded-xl py-1.5 pl-9 pr-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-bridge-secondary/30 focus:bg-foreground/[0.06] transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Mobile Search Toggle */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors shrink-0"
            >
              <Search size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline text-xs font-medium">{t('dashboard.logout')}</span>
            </button>

            {/* Profile Avatar + Name */}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 hover:bg-foreground/5 rounded-xl px-2 py-1.5 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-bridge-border bg-slate-700 shrink-0">
                {currentUser?.profile_image ? (
                  <img src={resolveFileUrl(currentUser.profile_image)} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-bridge-secondary to-bridge-accent">
                    {getInitials(currentUser?.name || 'U')}
                  </div>
                )}
              </div>
              <span className="hidden sm:inline text-xs font-medium text-muted-foreground">{currentUser?.name}</span>
            </button>
          </div>
          </div>
        </header>

        {/* Mobile Search Bar (expandable) */}
        <AnimatePresence>
          {mobileSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden border-b border-bridge-border bg-bridge-dark/60 backdrop-blur-sm overflow-hidden"
            >
              <div className="px-4 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                  <input
                    autoFocus
                    type="text"
                    placeholder={t('dashboard.searchPlaceholder')}
                    className="w-full bg-foreground/[0.04] border border-bridge-border rounded-xl py-2 pl-9 pr-10 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-bridge-secondary/30 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className={`flex-1 min-h-0 overflow-y-auto px-6 md:px-8 py-6 custom-scrollbar ${hasPersonalSpace ? 'pb-20 lg:pb-6' : ''}`}>
          <div className="max-w-7xl mx-auto space-y-6">

            {/* My Space Card — Dashboard Strip (Desktop only, 모바일은 하단 바) */}
            {!searchQuery && hasPersonalSpace && !window.location.hostname.includes('milkyway.pe.kr') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="hidden lg:block"
              >
                <button
                  onClick={() => navigate('/my-board')}
                  className="w-full group overflow-hidden rounded-2xl border border-foreground/[0.08] hover:border-foreground/[0.12] bg-bridge-obsidian transition-all duration-300 text-left"
                >
                  {/* Header */}
                  <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-foreground/[0.08]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-bridge-secondary/15 flex items-center justify-center">
                        <Sparkles size={17} className="text-bridge-secondary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground font-jakarta tracking-tight">{t('dashboard.mySpace')}</h3>
                        <p className="text-[11px] text-slate-500">{t('dashboard.mySpaceDesc')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-slate-600 group-hover:text-slate-400 transition-colors">Open</span>
                      <ChevronRight size={16} className="text-slate-600 group-hover:text-bridge-secondary group-hover:translate-x-0.5 transition-all duration-300" />
                    </div>
                  </div>

                  {/* Body: 2-zone split */}
                  {todayData && (
                    <div className="flex">
                      {/* Left Scoreboard */}
                      <div className="w-48 shrink-0 border-r border-foreground/[0.08] p-4 flex flex-col items-center gap-3">
                        {/* Ring Gauges */}
                        <div className="flex items-center gap-5">
                          {/* Task Ring */}
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative w-14 h-14">
                              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.06" />
                                <motion.circle
                                  cx="28" cy="28" r="23" fill="none"
                                  stroke="url(#msTaskGrad)"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  strokeDasharray={`${2 * Math.PI * 23}`}
                                  initial={{ strokeDashoffset: 2 * Math.PI * 23 }}
                                  animate={{ strokeDashoffset: 2 * Math.PI * 23 * (1 - (todayData.task_completion_rate || 0) / 100) }}
                                  transition={{ duration: 1, ease: 'easeOut' }}
                                />
                                <defs>
                                  <linearGradient id="msTaskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#6366F1" />
                                    <stop offset="100%" stopColor="#2DD4BF" />
                                  </linearGradient>
                                </defs>
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground/70">
                                {Math.round(todayData.task_completion_rate || 0)}%
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Task</span>
                          </div>

                          {/* Habit Ring */}
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative w-14 h-14">
                              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.06" />
                                <motion.circle
                                  cx="28" cy="28" r="23" fill="none"
                                  stroke="url(#msHabitGrad)"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  strokeDasharray={`${2 * Math.PI * 23}`}
                                  initial={{ strokeDashoffset: 2 * Math.PI * 23 }}
                                  animate={{ strokeDashoffset: 2 * Math.PI * 23 * (1 - (todayData.habit_completion_rate || 0) / 100) }}
                                  transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                                />
                                <defs>
                                  <linearGradient id="msHabitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#FB923C" />
                                    <stop offset="100%" stopColor="#FBBF24" />
                                  </linearGradient>
                                </defs>
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground/70">
                                {Math.round(todayData.habit_completion_rate || 0)}%
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Habit</span>
                          </div>
                        </div>

                        {/* Diary Status Chip */}
                        <div className="w-full rounded-lg bg-foreground/[0.04] p-2.5">
                          {todayData.diary_today ? (
                            todayData.diary_today.status === 'COMPLETED' ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={13} className="text-bridge-secondary shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-bridge-secondary leading-tight">{t('dashboard.diaryCompleted', 'Done')}</p>
                                  {todayData.diary_today.mood && (
                                    <p className="text-[9px] text-slate-500 truncate">{todayData.diary_today.mood}</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-amber-500 leading-tight">{t('dashboard.diaryChatting', 'Chatting...')}</p>
                                  <p className="text-[9px] text-slate-500">{t('dashboard.diaryChattingDesc', 'AI와 대화 중')}</p>
                                </div>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-2">
                              <BookHeart size={13} className="text-pink-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-medium text-foreground/70 leading-tight">{t('dashboard.diaryNotStarted', '오늘의 기록')}</p>
                                <p className="text-[9px] text-slate-500">{t('dashboard.diaryNotStartedDesc', 'AI와 하루를 정리해보세요')}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Agenda */}
                      <div className="flex-1 p-4 flex flex-col">
                        <div className="grid grid-cols-3 gap-5 flex-1">
                          {/* Habits Column */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Flame size={13} className="text-orange-400 shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Habits</span>
                              <span className="ml-auto text-[10px] font-bold text-orange-400">
                                {todayData.habits_today?.filter(h => h.is_completed).length || 0}/{todayData.habits_today?.length || 0}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {todayData.habits_today?.slice(0, 4).map(h => (
                                <div key={h.habit_id} className="flex items-center gap-1.5 py-0.5">
                                  {h.is_completed
                                    ? <CheckCircle2 size={11} className="text-bridge-secondary shrink-0" />
                                    : <Circle size={11} className="text-foreground/25 shrink-0" />
                                  }
                                  <span className={`text-[11px] truncate leading-tight ${h.is_completed ? 'text-slate-500 line-through' : 'text-foreground/80'}`}>
                                    {h.title}
                                  </span>
                                </div>
                              ))}
                              {(todayData.habits_today?.length || 0) > 4 && (
                                <span className="text-[10px] text-slate-500 pl-4">+{todayData.habits_today!.length - 4} more</span>
                              )}
                              {(!todayData.habits_today || todayData.habits_today.length === 0) && (
                                <p className="text-[10px] text-slate-500 italic py-1">No habits today</p>
                              )}
                            </div>
                          </div>

                          {/* Tasks Column */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <ListTodo size={13} className="text-bridge-accent shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tasks</span>
                              <span className="ml-auto text-[10px] font-bold text-bridge-accent">{todayTaskCount}</span>
                            </div>
                            <div className="space-y-1">
                              {todayData.due_today_tasks?.slice(0, 4).map(task => (
                                <div key={task.id} className="flex items-center gap-1.5 py-0.5">
                                  {task.status === 'DONE'
                                    ? <CheckCircle2 size={11} className="text-bridge-secondary shrink-0" />
                                    : <Circle size={11} className="text-foreground/25 shrink-0" />
                                  }
                                  <span className={`text-[11px] truncate leading-tight ${task.status === 'DONE' ? 'text-slate-500 line-through' : 'text-foreground/80'}`}>
                                    {task.title}
                                  </span>
                                  {task.priority === 'URGENT' && <Flag size={9} className="text-rose-400 shrink-0" />}
                                </div>
                              ))}
                              {(todayData.due_today_tasks?.length || 0) > 4 && (
                                <span className="text-[10px] text-slate-500 pl-4">+{todayData.due_today_tasks!.length - 4} more</span>
                              )}
                              {(!todayData.due_today_tasks || todayData.due_today_tasks.length === 0) && (
                                <p className="text-[10px] text-slate-500 italic py-1">No tasks due</p>
                              )}
                            </div>
                          </div>

                          {/* Events Column */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Clock size={13} className="text-purple-400 shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Events</span>
                              <span className="ml-auto text-[10px] font-bold text-purple-400">{todayData.personal_events?.length || 0}</span>
                            </div>
                            <div className="space-y-1">
                              {todayData.personal_events?.slice(0, 4).map(event => (
                                <div key={event.id} className="flex items-center gap-1.5 py-0.5">
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0 w-10">
                                    {event.all_day ? 'All' : event.start_time?.slice(0, 5) || '—'}
                                  </span>
                                  <span className="text-[11px] text-foreground/80 truncate leading-tight">{event.title}</span>
                                </div>
                              ))}
                              {(todayData.personal_events?.length || 0) > 4 && (
                                <span className="text-[10px] text-slate-500 pl-4">+{todayData.personal_events!.length - 4} more</span>
                              )}
                              {(!todayData.personal_events || todayData.personal_events.length === 0) && (
                                <p className="text-[10px] text-slate-500 italic py-1">No events</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Footer: in-progress count */}
                        {(todayData.in_progress_tasks?.length || 0) > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-foreground/[0.06]">
                            <span className="text-[10px] text-slate-500">
                              {t('dashboard.inProgress', '진행 중')} {todayData.in_progress_tasks?.length || 0}{t('dashboard.countSuffix', '건')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              </motion.div>
            )}

            {/* Project Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div>
                <h1 className="text-2xl font-bold font-jakarta mb-0.5">{t('dashboard.yourProjects')}</h1>
                <p className="text-slate-500 text-xs">
                  {t('dashboard.managingWorkspaces', { count: boards.length })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Board Filter */}
                <div className="flex items-center gap-0.5 bg-foreground/[0.04] rounded-lg p-0.5">
                  {(['all', 'owned', 'joined'] as BoardFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setBoardFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                        boardFilter === f
                          ? 'text-foreground bg-foreground/10'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {f === 'all' && t('dashboard.filterAll', 'All')}
                      {f === 'owned' && t('dashboard.filterOwned', 'Mine')}
                      {f === 'joined' && t('dashboard.filterJoined', 'Joined')}
                    </button>
                  ))}
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-0.5 bg-foreground/[0.04] rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'text-foreground bg-foreground/10' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Grid3X3 size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'text-foreground bg-foreground/10' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <List size={14} />
                  </button>
                </div>

              </div>
            </div>

            {/* Empty States */}
            {filteredBoards.length === 0 && searchQuery && (
              <div className="h-48 flex flex-col items-center justify-center bg-foreground/[0.02] border border-dashed rounded-2xl border-bridge-border">
                <Package2 size={36} className="text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium text-sm">
                  {t('dashboard.noSearchResult', { query: searchQuery })}
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-bridge-secondary text-xs font-bold hover:underline"
                >
                  {t('dashboard.clearSearch')}
                </button>
              </div>
            )}

            {boards.length === 0 && !searchQuery && (
              <div className="h-48 flex flex-col items-center justify-center bg-foreground/[0.02] border border-dashed rounded-2xl border-bridge-border">
                <Package2 size={36} className="text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium text-sm">{t('board.noBoards')}</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-3 px-5 py-2 bg-bridge-secondary text-bridge-dark text-xs font-bold rounded-xl hover:bg-bridge-secondary/90 transition-colors"
                >
                  {t('board.createFirst')}
                </button>
              </div>
            )}

            {/* Starred Section */}
            {starredBoards.length > 0 && !searchQuery && boardFilter === 'all' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Star size={14} className="text-amber-500" fill="#F59E0B" />
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                    {t('dashboard.starredBoards')}
                  </h2>
                  <span className="text-[10px] text-slate-600">{starredBoards.length}</span>
                </div>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {starredBoards.map((board) => (
                      <BoardCard
                        key={board.id}
                        board={board}
                        onToggleStar={onToggleStar}
                        onClick={handleBoardClick}
                        onDelete={onDeleteBoard ? handleDeleteClick : undefined}
                        onEdit={handleEditClick}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {starredBoards.map((board) => (
                      <BoardListItem
                        key={board.id}
                        board={board}
                        onToggleStar={onToggleStar}
                        onClick={handleBoardClick}
                        onEdit={handleEditClick}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Organization Board Section */}
            {filteredBoards.filter(b => b.organization_id).length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={14} className="text-bridge-accent" />
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                    {t('dashboard.orgBoards', 'Organization Boards')}
                  </h2>
                  <span className="text-[10px] text-slate-600">{filteredBoards.filter(b => b.organization_id).length}</span>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredBoards.filter(b => b.organization_id).map((board) => (
                      <BoardCard
                        key={board.id}
                        board={board}
                        onToggleStar={onToggleStar}
                        onClick={handleBoardClick}
                        onDelete={onDeleteBoard ? handleDeleteClick : undefined}
                        onEdit={handleEditClick}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredBoards.filter(b => b.organization_id).map((board) => (
                      <BoardListItem
                        key={board.id}
                        board={board}
                        onToggleStar={onToggleStar}
                        onClick={handleBoardClick}
                        onEdit={handleEditClick}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Workspace Board Section — always show when there are any boards (for Create card) */}
            {filteredBoards.length > 0 && (
              <section>
                {(() => {
                  const personalBoards = filteredBoards.filter(b => !b.organization_id);
                  return (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <LayoutGrid size={14} className="text-bridge-secondary" />
                        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                          {t('dashboard.workspaceBoards')}
                        </h2>
                        <span className="text-[10px] text-slate-600">{personalBoards.length}</span>
                      </div>

                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {personalBoards.map((board) => (
                            <BoardCard
                              key={board.id}
                              board={board}
                              onToggleStar={onToggleStar}
                              onClick={handleBoardClick}
                              onDelete={onDeleteBoard ? handleDeleteClick : undefined}
                              onEdit={handleEditClick}
                            />
                          ))}
                          <CreateBoardCard onClick={() => setIsCreateModalOpen(true)} />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {personalBoards.map((board) => (
                            <BoardListItem
                              key={board.id}
                              board={board}
                              onToggleStar={onToggleStar}
                              onClick={handleBoardClick}
                              onEdit={handleEditClick}
                            />
                          ))}
                          {/* Create button in list mode */}
                          <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-bridge-border hover:border-bridge-secondary/30 hover:bg-foreground/[0.02] transition-all group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-foreground/5 group-hover:bg-bridge-secondary/15 flex items-center justify-center transition-colors">
                              <Plus size={16} className="text-muted-foreground group-hover:text-bridge-secondary transition-colors" />
                            </div>
                            <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-wider transition-colors">
                              {t('dashboard.newBoard')}
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

          </div>
        </main>
      </div>

      {/* Create Board Modal */}
      <CreateBoardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={onCreateBoard}
      />

      {/* Edit Board Modal */}
      <EditBoardModal
        isOpen={!!editTarget}
        board={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdate={handleUpdateBoard}
        onDelete={onDeleteBoard}
      />

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        boardName={deleteTarget?.name || ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Mobile Bottom Bar - My Space Quick Access */}
      {hasPersonalSpace && !window.location.hostname.includes('milkyway.pe.kr') && (
        <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden safe-bottom bg-bridge-obsidian/95 backdrop-blur-xl">
          <div className="border-t border-bridge-border">
            <button
              onClick={() => navigate('/my-board')}
              className="w-full flex items-center justify-between px-4 py-2.5 active:bg-foreground/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Mini Progress Ring */}
                {todayData && (todayData.habits_today?.length || 0) > 0 ? (
                  <div className="relative w-9 h-9 flex items-center justify-center">
                    <svg width={36} height={36} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx={18} cy={18} r={15} fill="none" className="stroke-foreground/10" strokeWidth={2.5} />
                      <circle
                        cx={18} cy={18} r={15}
                        fill="none"
                        stroke={
                          (todayData.habits_today?.filter(h => h.is_completed).length || 0) >= (todayData.habits_today?.length || 1)
                            ? '#2DD4BF' : '#8B5CF6'
                        }
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 15}
                        strokeDashoffset={2 * Math.PI * 15 * (1 - (todayData.habits_today?.filter(h => h.is_completed).length || 0) / Math.max(todayData.habits_today?.length || 1, 1))}
                        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
                      />
                    </svg>
                    <Sparkles size={14} className="text-bridge-secondary" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bridge-secondary/20 to-bridge-accent/20 border border-bridge-border flex items-center justify-center">
                    <Sparkles size={16} className="text-bridge-secondary" />
                  </div>
                )}
                <div className="flex flex-col items-start">
                  <span className="text-sm font-bold text-foreground">{t('dashboard.mySpace')}</span>
                  {todayData && (() => {
                    const nextEvent = todayData.personal_events
                      ?.filter(e => e.start_time && !e.all_day)
                      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                      .find(e => {
                        const now = new Date();
                        const [h, m] = (e.start_time || '00:00').split(':').map(Number);
                        return h * 60 + m > now.getHours() * 60 + now.getMinutes();
                      });
                    return nextEvent ? (
                      <span className="text-[10px] text-slate-500 truncate max-w-[160px]">
                        {nextEvent.start_time?.slice(0, 5)} {nextEvent.title}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {todayData && (
                  <div className="flex items-center gap-1.5">
                    {todayTaskCount > 0 && (
                      <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded">
                        {todayTaskCount}
                      </span>
                    )}
                    {(todayData.habits_today?.length || 0) > 0 && (
                      <span className="text-[10px] font-bold text-purple-400 bg-purple-400/15 px-1.5 py-0.5 rounded">
                        {todayData.habits_today?.filter(h => h.is_completed).length || 0}/{todayData.habits_today?.length || 0}
                      </span>
                    )}
                  </div>
                )}
                <ChevronRight size={16} className="text-slate-500" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Test Data Creation Buttons (Admin Only) */}
      {isAdmin && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          <button
            onClick={handleCreateTestBoard}
            disabled={isCreatingTestBoard}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/90 hover:bg-amber-500 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('board.testBoardTitle')}
          >
            <FlaskConical size={16} className={isCreatingTestBoard ? 'animate-pulse' : ''} />
            <span className="hidden sm:inline">{isCreatingTestBoard ? t('board.creating') : t('dashboard.testBoard')}</span>
          </button>
          <button
            onClick={handleCreateTestOrg}
            disabled={isCreatingTestOrg}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/90 hover:bg-amber-500 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('dashboard.testOrgTitle', 'Create Test Organization')}
          >
            <Building2 size={16} className={isCreatingTestOrg ? 'animate-pulse' : ''} />
            <span className="hidden sm:inline">{isCreatingTestOrg ? t('board.creating') : t('dashboard.testOrg', 'Test Org')}</span>
          </button>
        </div>
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* Custom Styles */}
      <style>{`
        .star-bg {
          background-image:
            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 80px 60px, rgba(255,255,255,0.2), transparent),
            radial-gradient(1.5px 1.5px at 150px 20px, rgba(255,255,255,0.25), transparent),
            radial-gradient(1px 1px at 200px 90px, rgba(255,255,255,0.15), transparent),
            radial-gradient(1px 1px at 40px 110px, rgba(255,255,255,0.2), transparent),
            radial-gradient(1.5px 1.5px at 280px 45px, rgba(45,212,191,0.15), transparent),
            radial-gradient(1px 1px at 320px 80px, rgba(255,255,255,0.15), transparent),
            radial-gradient(1px 1px at 110px 130px, rgba(99,102,241,0.15), transparent);
          background-size: 400px 160px;
        }
      `}</style>
    </div>
  );
}

// List view item for boards
function BoardListItem({ board, onToggleStar, onClick, onEdit }: {
  board: Board;
  onToggleStar: (id: string) => void;
  onClick: (board: Board) => void;
  onEdit?: (board: Board) => void;
}) {
  const { t } = useTranslation();
  const isTrial = board.subscription?.status === 'TRIAL' && board.tier !== 'PREMIUM';
  const isOrgBoard = !!board.organization_id;
  const taskCount = board.task_count ?? 0;
  const completedTasks = board.completed_tasks ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
  const members = board.members ?? [];

  return (
    <motion.div
      whileHover={{ x: 2 }}
      onClick={() => onClick(board)}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-foreground/[0.02] border hover:bg-foreground/[0.03] cursor-pointer transition-all group ${isOrgBoard ? 'border-bridge-accent/20 hover:border-bridge-accent/40' : 'border-bridge-border hover:border-foreground/[0.12]'}`}
    >
      {/* Color indicator */}
      <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden"
        style={{ background: getGradient(board.id) }}
      />

      {/* Board info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground truncate group-hover:text-bridge-secondary transition-colors">
            {board.name}
          </h3>
          {isOrgBoard && board.organization_name && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-bridge-accent/15 text-bridge-accent text-[9px] font-bold rounded-full shrink-0">
              <Building2 size={9} />
              {board.organization_name}
            </span>
          )}
          {isTrial && (
            <span className="px-1.5 py-0.5 bg-bridge-secondary/10 text-bridge-secondary text-[8px] font-bold uppercase tracking-wider rounded shrink-0">
              {t('dashboard.trialPlan')}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 truncate">{board.description || t('dashboard.noDescription')}</p>
      </div>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-2 shrink-0 w-28">
        <div className="flex-1 h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{progress}%</span>
      </div>

      {/* Members */}
      <div className="hidden sm:flex items-center gap-1.5 text-slate-500 shrink-0">
        <Users size={12} />
        <span className="text-[10px] font-medium">{board.member_count}</span>
      </div>

      {/* Star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleStar(board.id); }}
        className="p-1.5 hover:bg-foreground/5 rounded-lg transition-colors shrink-0"
      >
        <Star
          size={14}
          fill={board.is_starred ? '#F59E0B' : 'transparent'}
          stroke={board.is_starred ? '#F59E0B' : 'rgba(255,255,255,0.3)'}
        />
      </button>
    </motion.div>
  );
}
