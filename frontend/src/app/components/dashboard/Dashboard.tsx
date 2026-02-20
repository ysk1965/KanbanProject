import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Star, LayoutGrid, LogOut, Package2, AlertTriangle, Menu, FlaskConical, CalendarDays, BookHeart, ListTodo, List, Grid3X3, ChevronRight, X, Users, CheckCircle2, Flame, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Board, PersonalDashboardToday } from '../../types';
import { testDataAPI, personalDashboardAPI, personalSpaceAPI, resolveFileUrl } from '../../utils/api';
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
  onUpdateBoard?: (boardId: string, name: string, description?: string) => void;
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
        const data = await personalDashboardAPI.getToday();
        setTodayData(data);
      } catch {
        // Personal dashboard data may not be available
      }
    })();
  }, []);

  // 보드가 하나도 없으면 자동으로 생성 모달 오픈
  useEffect(() => {
    if (boards.length === 0) {
      setIsCreateModalOpen(true);
    }
  }, [boards]);

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

  const handleUpdateBoard = (boardId: string, name: string, description?: string) => {
    if (onUpdateBoard) {
      onUpdateBoard(boardId, name, description);
    }
    setEditTarget(null);
  };

  const todayTaskCount = todayData
    ? (todayData.due_today_tasks?.length || 0) + (todayData.in_progress_tasks?.length || 0)
    : 0;

  const hasPersonalSpace = currentUser?.personal_space_enabled ?? false;

  const handleActivatePersonalSpace = async () => {
    try {
      await personalSpaceAPI.activate();
      updateCurrentUser({ personal_space_enabled: true });
      navigate('/my-board');
    } catch (error) {
      console.error('Failed to activate personal space:', error);
    }
  };

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
        <header className="h-14 border-b border-bridge-border bg-bridge-dark/60 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between shrink-0 safe-top">
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

            {/* My Space Card (My Space가 있을 때만, 모바일에서는 하단 바로 대체) */}
            {!searchQuery && hasPersonalSpace && !window.location.hostname.includes('milkyway.pe.kr') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="hidden lg:block"
              >
                <button
                  onClick={() => navigate('/my-board')}
                  className="w-full group relative overflow-hidden rounded-2xl border border-bridge-border hover:border-bridge-secondary/25 transition-all duration-500 text-left"
                >
                  {/* Ambient Background */}
                  <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-bridge-accent/[0.07] via-purple-500/[0.04] to-bridge-secondary/[0.07]" />
                    <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-[120px] bg-bridge-secondary/[0.06] group-hover:bg-bridge-secondary/[0.1] transition-all duration-700" />
                    <div className="absolute -bottom-24 -left-24 w-56 h-56 rounded-full blur-[100px] bg-bridge-accent/[0.06] group-hover:bg-bridge-accent/[0.1] transition-all duration-700" />
                  </div>

                  <div className="relative px-6 py-5">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-bridge-secondary/20 to-bridge-accent/20 border border-bridge-border flex items-center justify-center group-hover:border-bridge-secondary/30 transition-all duration-300">
                          <Sparkles size={20} className="text-bridge-secondary" />
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

                    {/* Stats Row */}
                    {todayData && (
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-foreground/[0.03] rounded-xl border border-foreground/[0.05] group-hover:bg-foreground/[0.05] group-hover:border-foreground/[0.08] transition-all">
                          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
                            <ListTodo size={14} className="text-bridge-accent" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground leading-none">{todayTaskCount}</div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Tasks</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-foreground/[0.03] rounded-xl border border-foreground/[0.05] group-hover:bg-foreground/[0.05] group-hover:border-foreground/[0.08] transition-all">
                          <div className="w-8 h-8 rounded-lg bg-orange-400/15 flex items-center justify-center shrink-0">
                            <Flame size={14} className="text-orange-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground leading-none">
                              {todayData.habits_today?.filter(h => h.is_completed).length || 0}
                              <span className="text-muted-foreground font-normal text-xs">/{todayData.habits_today?.length || 0}</span>
                            </div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Habits</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-foreground/[0.03] rounded-xl border border-foreground/[0.05] group-hover:bg-foreground/[0.05] group-hover:border-foreground/[0.08] transition-all">
                          <div className="w-8 h-8 rounded-lg bg-purple-400/15 flex items-center justify-center shrink-0">
                            <Clock size={14} className="text-purple-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground leading-none">{todayData.personal_events?.length || 0}</div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Events</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-foreground/[0.03] rounded-xl border border-foreground/[0.05] group-hover:bg-foreground/[0.05] group-hover:border-foreground/[0.08] transition-all">
                          <div className="w-8 h-8 rounded-lg bg-bridge-secondary/15 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={14} className="text-bridge-secondary" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-bridge-secondary leading-none">{Math.round(todayData.task_completion_rate || 0)}%</div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Done</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dual Progress Bars */}
                    {todayData && (
                      <div className="flex items-center gap-4">
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider w-8">Task</span>
                          <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.round(todayData.task_completion_rate || 0)}%` }}
                              transition={{ duration: 1, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider w-8">Habit</span>
                          <div className="flex-1 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.round(todayData.habit_completion_rate || 0)}%` }}
                              transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

            {/* Main Board Section */}
            {filteredBoards.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <LayoutGrid size={14} className="text-bridge-secondary" />
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                    {t('dashboard.workspaceBoards')}
                  </h2>
                  <span className="text-[10px] text-slate-600">{filteredBoards.length}</span>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredBoards.map((board) => (
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
                    {filteredBoards.map((board) => (
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
        hasPersonalSpace={hasPersonalSpace}
        onActivatePersonalSpace={handleActivatePersonalSpace}
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
              className="w-full flex items-center justify-between px-5 py-3 active:bg-foreground/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bridge-secondary/20 to-bridge-accent/20 border border-bridge-border flex items-center justify-center">
                  <Sparkles size={16} className="text-bridge-secondary" />
                </div>
                <span className="text-sm font-bold text-foreground">{t('dashboard.mySpace')}</span>
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
                      <span className="text-[10px] font-bold text-orange-400 bg-orange-400/15 px-1.5 py-0.5 rounded">
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

      {/* Test Board Creation Button (Admin Only) */}
      {isAdmin && (
        <button
          onClick={handleCreateTestBoard}
          disabled={isCreatingTestBoard}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-amber-500/90 hover:bg-amber-500 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('board.testBoardTitle')}
        >
          <FlaskConical size={16} className={isCreatingTestBoard ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">{isCreatingTestBoard ? t('board.creating') : t('dashboard.testBoard')}</span>
        </button>
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
  const taskCount = board.task_count ?? 0;
  const completedTasks = board.completed_tasks ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
  const members = board.members ?? [];

  return (
    <motion.div
      whileHover={{ x: 2 }}
      onClick={() => onClick(board)}
      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-foreground/[0.02] border border-bridge-border hover:border-foreground/[0.12] hover:bg-foreground/[0.03] cursor-pointer transition-all group"
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
