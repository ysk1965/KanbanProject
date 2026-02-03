import { useState, useMemo } from 'react';
import { Search, Plus, Star, LayoutGrid, LogOut, Rocket, Package2, AlertTriangle, Menu, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Board } from '../../types';
import { testDataAPI } from '../../utils/api';
import { Sidebar } from './Sidebar';
import { BoardCard, CreateBoardCard } from './BoardCard';
import { CreateBoardModal } from './CreateBoardModal';
import { EditBoardModal } from './EditBoardModal';
import { UpgradeModal } from './UpgradeModal';

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
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-bridge-obsidian rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/20 rounded-full">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-white">보드 삭제</h2>
          </div>

          <p className="text-slate-400 mb-6">
            <span className="font-bold text-white">"{boardName}"</span> 보드를 삭제하시겠습니까?
            <br />
            <span className="text-rose-400 text-sm">이 작업은 되돌릴 수 없습니다.</span>
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
            >
              취소
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 bg-rose-500 text-sm font-bold rounded-xl hover:bg-rose-600 transition-colors"
            >
              삭제
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
  const { user, logout, hideBilling, isAdmin } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Board | null>(null);
  const [isCreatingTestBoard, setIsCreatingTestBoard] = useState(false);

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

  // 유료 멤버 수 계산 (간단하게 전체 보드의 최대 멤버 수로 추정)
  const totalMembers = Math.max(...boards.map((b) => b.member_count), 1);

  return (
    <div className="flex h-screen bg-bridge-dark text-white overflow-hidden selection:bg-bridge-accent/30">
      {/* Star Background Effect */}
      <div className="absolute inset-0 star-bg pointer-events-none opacity-30" />

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
        hideBilling={hideBilling}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Header */}
        <header className="h-16 border-b border-white/5 bg-bridge-dark/60 backdrop-blur-sm px-4 md:px-8 flex items-center justify-between">
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                type="text"
                placeholder="Quick search projects..."
                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-bridge-accent/50 focus:bg-white/10 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Upgrade Button - TESTER/ADMIN 사용자는 숨김 */}
            {!hideBilling && (
              <button
                onClick={() => setIsUpgradeModalOpen(true)}
                className="hidden lg:flex items-center gap-2 px-4 py-1.5 bg-bridge-accent/10 text-bridge-accent rounded-full border border-bridge-accent/20 text-xs font-bold hover:bg-bridge-accent hover:text-white transition-all"
              >
                <Rocket size={14} /> Upgrade Pro
              </button>
            )}

            {/* Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>

            {/* Profile Avatar */}
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-slate-700">
              {user?.profile_image ? (
                <img
                  src={user.profile_image}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-bridge-accent to-purple-500">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-10">
            {/* Header Content */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold font-serif mb-1">Your Projects</h1>
                <p className="text-slate-500 text-sm">
                  Managing{' '}
                  <span className="text-bridge-accent font-bold">{boards.length}</span>{' '}
                  active workspaces
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-bridge-accent to-purple-500 rounded-xl font-bold text-sm shadow-lg shadow-bridge-accent/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus size={18} /> Create New Board
              </button>
            </div>

            {/* Empty State */}
            {filteredBoards.length === 0 && searchQuery && (
              <div className="h-64 flex flex-col items-center justify-center bg-bridge-obsidian/30 border-2 border-dashed rounded-3xl border-white/10">
                <Package2 size={48} className="text-slate-600 mb-4" />
                <p className="text-slate-400 font-medium">
                  No boards found for "{searchQuery}"
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-bridge-accent text-sm font-bold hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}

            {/* No boards at all */}
            {boards.length === 0 && !searchQuery && (
              <div className="h-64 flex flex-col items-center justify-center bg-bridge-obsidian/30 border-2 border-dashed rounded-3xl border-white/10">
                <Package2 size={48} className="text-slate-600 mb-4" />
                <p className="text-slate-400 font-medium">아직 보드가 없습니다</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 px-6 py-2 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 transition-colors"
                >
                  첫 번째 보드 만들기
                </button>
              </div>
            )}

            {/* Starred Section */}
            {starredBoards.length > 0 && !searchQuery && (
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Star size={18} className="text-amber-500" fill="#F59E0B" />
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">
                    Starred Boards
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
                  <LayoutGrid size={18} className="text-bridge-accent" />
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">
                    Workspace Boards
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

      {/* Upgrade Modal - TESTER/ADMIN 사용자는 숨김 */}
      {!hideBilling && (
        <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          memberCount={totalMembers}
        />
      )}

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
          title="테스트 보드 생성 (관리자 전용)"
        >
          <FlaskConical size={18} className={isCreatingTestBoard ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">{isCreatingTestBoard ? '생성 중...' : 'Test Board'}</span>
        </button>
      )}

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
        .star-bg {
          background-image: radial-gradient(2px 2px at 20px 30px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.2), transparent),
                            radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.2), transparent);
          background-size: 200px 100px;
        }
      `}</style>
    </div>
  );
}
