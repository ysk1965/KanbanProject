import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Star, LayoutGrid, LogOut, Package2, AlertTriangle, Menu, FlaskConical, CalendarDays, BookHeart, Clock, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Board } from '../../types';
import { testDataAPI } from '../../utils/api';
import { boardService } from '../../utils/services';
import { getInitials } from '../../utils/assigneeColor';
import { Sidebar } from './Sidebar';
import { BoardCard, CreateBoardCard } from './BoardCard';
import { CreateBoardModal } from './CreateBoardModal';
import { EditBoardModal } from './EditBoardModal';
import { OnboardingModal } from '../OnboardingModal';
import { MyTasksWidget } from './MyTasksWidget';

interface DashboardProps {
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string, description?: string) => void;
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
          className="w-full max-w-md bg-bridge-obsidian rounded-2xl overflow-hidden shadow-2xl border border-white/20 p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/20 rounded-full">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-white">{t('board.deleteBoard')}</h2>
          </div>

          <p className="text-slate-400 mb-6">
            <span className="font-bold text-white">"{boardName}"</span> {t('board.deleteConfirm')}
            <br />
            <span className="text-rose-400 text-sm">{t('board.deleteIrreversible')}</span>
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/20 rounded-xl hover:bg-white/5"
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
  const { user, logout, isAdmin } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Board | null>(null);
  const [isCreatingTestBoard, setIsCreatingTestBoard] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('bridge_show_onboarding') === 'true'
  );

  // Personal Board Today 데이터
  const [todayData, setTodayData] = useState<{
    due_today_tasks: Array<{ id: string; title: string }>;
    in_progress_tasks: Array<{ id: string; title: string }>;
    completion_rate: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const board = await boardService.getPersonalBoard();
        const data = await boardService.getTodayData(board.id);
        setTodayData(data as any);
      } catch {
        // Personal board may not exist yet
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
      // 보드로 바로 이동
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

  // 검색 필터링
  const filteredBoards = useMemo(
    () =>
      boards.filter((b) =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [boards, searchQuery]
  );

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


  return (
    <div className="flex h-screen text-white overflow-hidden selection:bg-bridge-secondary/30" style={{ background: 'radial-gradient(ellipse at 20% 0%, var(--bridge-dark) 0%, var(--bridge-dark) 50%, #030508 100%)' }}>
      {/* Cosmic Background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Teal nebula - top right */}
        <div className="absolute w-[600px] h-[600px] rounded-full blur-[200px]" style={{ top: '-10%', right: '-5%', background: 'radial-gradient(circle, rgba(45,212,191,0.08) 0%, transparent 70%)' }} />
        {/* Indigo nebula - bottom left */}
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[180px]" style={{ bottom: '-5%', left: '-5%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)' }} />
        {/* Star field */}
        <div className="star-bg opacity-40" style={{ position: 'absolute', inset: 0 }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(3,5,8,0.5) 100%)' }} />
      </div>

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Header */}
        <header className="h-16 border-b border-white/[0.06] bg-bridge-dark/60 backdrop-blur-sm px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {/* 모바일 햄버거 메뉴 */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <Menu size={20} />
            </button>

            {/* Search */}
            <div className="relative w-full max-w-sm hidden md:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                placeholder={t('dashboard.searchPlaceholder')}
                className="w-full bg-white/5 border border-white/[0.08] rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-bridge-secondary/40 focus:bg-white/[0.06] transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">{t('dashboard.logout')}</span>
            </button>

            {/* Profile Avatar */}
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20 bg-slate-700">
              {user?.profile_image ? (
                <img
                  src={user.profile_image}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-bridge-secondary to-bridge-accent">
                  {getInitials(user?.name || 'U')}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-10">
            {/* My Board - Personal Board (최상단) */}
            {!searchQuery && (
              <section>
                <motion.button
                  onClick={() => navigate('/my-board')}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full max-w-2xl group relative overflow-hidden rounded-2xl border border-white/10 hover:border-bridge-accent/40 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-bridge-accent/20 via-purple-500/10 to-bridge-secondary/20 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="relative p-6">
                    <div className="flex items-center gap-6">
                      <div className="flex gap-3">
                        <div className="w-12 h-12 rounded-xl bg-bridge-accent/20 border border-bridge-accent/30 flex items-center justify-center">
                          <CalendarDays size={22} className="text-bridge-accent" />
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                          <BookHeart size={22} className="text-purple-400" />
                        </div>
                      </div>
                      <div className="text-left flex-1">
                        <h3 className="text-lg font-bold text-white mb-1">{t('dashboard.mySpace')}</h3>
                        <p className="text-sm text-slate-400">
                          {t('dashboard.mySpaceDesc')}
                        </p>
                      </div>
                      <div className="ml-auto text-slate-500 group-hover:text-white transition-colors">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>

                    {/* Today Preview */}
                    {todayData && (todayData.due_today_tasks.length > 0 || todayData.in_progress_tasks.length > 0) && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                        {/* Progress bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-full transition-all"
                              style={{ width: `${Math.round(todayData.completion_rate)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-bridge-secondary">
                            {Math.round(todayData.completion_rate)}%
                          </span>
                        </div>

                        <div className="flex gap-4 text-left">
                          {/* Due today */}
                          {todayData.due_today_tasks.length > 0 && (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <Clock size={10} className="text-orange-400" />
                                <span className="text-[10px] text-orange-400 font-bold">
                                  {t('personal.dueToday', '오늘 마감')} {todayData.due_today_tasks.length}
                                </span>
                              </div>
                              {todayData.due_today_tasks.slice(0, 3).map((task) => (
                                <div key={task.id} className="text-[11px] text-slate-300 truncate">
                                  {task.title}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* In progress */}
                          {todayData.in_progress_tasks.length > 0 && (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <ListTodo size={10} className="text-bridge-accent" />
                                <span className="text-[10px] text-bridge-accent font-bold">
                                  {t('personal.inProgress', '진행중')} {todayData.in_progress_tasks.length}
                                </span>
                              </div>
                              {todayData.in_progress_tasks.slice(0, 3).map((task) => (
                                <div key={task.id} className="text-[11px] text-slate-300 truncate">
                                  {task.title}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.button>
              </section>
            )}

            {/* My Tasks Widget - Cross-board task overview */}
            {!searchQuery && <MyTasksWidget />}

            {/* Header Content */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold font-serif mb-1">{t('dashboard.yourProjects')}</h1>
                <p className="text-slate-400 text-sm">
                  {t('dashboard.managingWorkspaces', { count: boards.length })}
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-xl font-bold text-sm shadow-lg shadow-bridge-secondary/15 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus size={18} /> {t('dashboard.createNewBoard')}
              </button>
            </div>

            {/* Empty State */}
            {filteredBoards.length === 0 && searchQuery && (
              <div className="h-64 flex flex-col items-center justify-center bg-bridge-obsidian/30 border-2 border-dashed rounded-3xl border-white/20">
                <Package2 size={48} className="text-slate-400 mb-4" />
                <p className="text-slate-400 font-medium">
                  {t('dashboard.noSearchResult', { query: searchQuery })}
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-bridge-secondary text-sm font-bold hover:underline"
                >
                  {t('dashboard.clearSearch')}
                </button>
              </div>
            )}

            {/* No boards at all */}
            {boards.length === 0 && !searchQuery && (
              <div className="h-64 flex flex-col items-center justify-center bg-bridge-obsidian/30 border-2 border-dashed rounded-3xl border-white/20">
                <Package2 size={48} className="text-slate-400 mb-4" />
                <p className="text-slate-400 font-medium">{t('board.noBoards')}</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 px-6 py-2 bg-bridge-secondary text-bridge-dark text-sm font-bold rounded-xl hover:bg-bridge-secondary/90 transition-colors"
                >
                  {t('board.createFirst')}
                </button>
              </div>
            )}

            {/* Starred Section */}
            {starredBoards.length > 0 && !searchQuery && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Star size={18} className="text-amber-500" fill="#F59E0B" />
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                    {t('dashboard.starredBoards')}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
              </section>
            )}

            {/* Main Section */}
            {filteredBoards.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <LayoutGrid size={18} className="text-bridge-secondary" />
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                    {t('dashboard.workspaceBoards')}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

                  {/* Create Card Button */}
                  <CreateBoardCard onClick={() => setIsCreateModalOpen(true)} />
                </div>
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

      {/* Test Board Creation Button (Admin Only) */}
      {isAdmin && (
        <button
          onClick={handleCreateTestBoard}
          disabled={isCreatingTestBoard}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-amber-500/90 hover:bg-amber-500 text-black font-bold text-sm rounded-xl shadow-lg shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('board.testBoardTitle')}
        >
          <FlaskConical size={18} className={isCreatingTestBoard ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">{isCreatingTestBoard ? t('board.creating') : t('dashboard.testBoard')}</span>
        </button>
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
        .star-bg {
          background-image:
            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), transparent),
            radial-gradient(1px 1px at 80px 60px, rgba(255,255,255,0.25), transparent),
            radial-gradient(1.5px 1.5px at 150px 20px, rgba(255,255,255,0.35), transparent),
            radial-gradient(1px 1px at 200px 90px, rgba(255,255,255,0.2), transparent),
            radial-gradient(1px 1px at 40px 110px, rgba(255,255,255,0.3), transparent),
            radial-gradient(1.5px 1.5px at 280px 45px, rgba(45,212,191,0.25), transparent),
            radial-gradient(1px 1px at 320px 80px, rgba(255,255,255,0.2), transparent),
            radial-gradient(1px 1px at 110px 130px, rgba(99,102,241,0.2), transparent);
          background-size: 400px 160px;
        }
      `}</style>
    </div>
  );
}
