import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Star, Plus, Users, FlaskConical, Loader2, LayoutGrid, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { CreateBoardModal } from './CreateBoardModal';
import { EditBoardModal } from './EditBoardModal';
import { UserMenu } from './UserMenu';
import { Button } from './ui/button';
import { MotionModal } from './ui/MotionModal';
import type { Board } from '../types';
import { testDataAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

declare const __FE_COMMIT_HASH__: string;

interface BoardListPageProps {
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string, description?: string, backgroundGradient?: string) => void;
  onUpdateBoard: (boardId: string, name: string, description?: string, backgroundGradient?: string) => void;
  onDeleteBoard: (boardId: string) => void;
  onToggleStar: (boardId: string) => void;
  onLogout: () => void;
  onRefreshBoards?: () => void;
}

// 보드 색상 gradient 생성 (dashboard/BoardCard와 동일)
const BOARD_GRADIENTS = [
  'linear-gradient(135deg, #6366F1 0%, #a855f7 100%)',  // Indigo Purple
  'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)',  // Teal Cyan
  'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',  // Rose Orange
  'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',  // Green Blue
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',  // Amber Red
  'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)',  // Violet Pink
];

function getBoardGradient(boardId: string): string {
  const hash = boardId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return BOARD_GRADIENTS[hash % BOARD_GRADIENTS.length];
}

export function BoardListPage({
  boards,
  onSelectBoard,
  onCreateBoard,
  onUpdateBoard,
  onDeleteBoard,
  onToggleStar,
  onLogout,
  onRefreshBoards,
}: BoardListPageProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isCreatingTestData, setIsCreatingTestData] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hideBilling, currentUser, updateCurrentUser } = useAuth();

  const [beCommit, setBeCommit] = useState<string>('');
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
    const origin = (() => { try { return new URL(apiBase).origin; } catch { return 'http://localhost:8080'; } })();
    fetch(`${origin}/health`).then(r => r.json()).then(d => setBeCommit(d.commit || '')).catch(() => {});
  }, []);

  const handleEditBoard = (board: Board) => {
    setSelectedBoard(board);
    setIsEditModalOpen(true);
  };

  const handleDeleteBoard = (board: Board) => {
    setSelectedBoard(board);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteBoard = () => {
    if (selectedBoard) {
      onDeleteBoard(selectedBoard.id);
      setIsDeleteDialogOpen(false);
      setSelectedBoard(null);
    }
  };

  const handleCreateTestBoard = async () => {
    if (isCreatingTestData) return;

    setIsCreatingTestData(true);
    try {
      const response = await testDataAPI.createTestBoard();
      console.log('Test board response:', response);
      // 보드 목록 새로고침 후 해당 보드로 바로 이동
      onRefreshBoards?.();
      onSelectBoard(response.board_id);
    } catch (error) {
      console.error('Failed to create/join test board:', error);
      alert(t('board.testBoardFailed'));
    } finally {
      setIsCreatingTestData(false);
    }
  };

  const starredBoards = boards.filter((b) => b.is_starred);

  return (
    <div className="min-h-screen bg-bridge-dark text-foreground">
      {/* 헤더 */}
      <header className="border-b border-bridge-border glass safe-top">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-4 cursor-pointer group"
              onClick={() => navigate('/')}
            >
              <div className="w-12 h-12 bg-bridge-accent rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.4)] group-hover:rotate-6 transition-all duration-500">
                <span className="text-xl font-jakarta font-bold text-white">B</span>
              </div>
              <div>
                <h1 className="text-xl font-jakarta font-bold tracking-tight group-hover:text-bridge-secondary transition-colors">BRIDGE</h1>
                {!hideBilling && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="px-2 py-0.5 bg-bridge-accent/20 text-bridge-secondary rounded-full text-[10px] font-bold tracking-wider uppercase">
                      Premium
                    </span>
                    <span className="text-slate-400">Workspace</span>
                  </div>
                )}
              </div>
            </div>
            {currentUser && (
              <UserMenu
                user={{
                  id: currentUser.id,
                  name: currentUser.name,
                  email: currentUser.email,
                  avatar: currentUser.profile_image || undefined,
                }}
                onOpenSubscription={() => navigate('/settings')}
                onLogout={onLogout}
                hideBilling={hideBilling}
              />
            )}
          </div>
        </div>
      </header>

      {/* 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-8 py-12">
        {/* 즐겨찾기한 보드 */}
        {starredBoards.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <h2 className="text-lg font-jakarta font-bold text-foreground tracking-tight">
                Starred Boards
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {starredBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  onClick={() => onSelectBoard(board.id)}
                  onToggleStar={() => onToggleStar(board.id)}
                  onEdit={() => handleEditBoard(board)}
                  onDelete={() => handleDeleteBoard(board)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 마이스페이스 */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-bridge-accent/10 rounded-lg">
              <LayoutGrid className="h-5 w-5 text-bridge-accent" />
            </div>
            <h2 className="text-lg font-jakarta font-bold text-foreground tracking-tight">Your Boards</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onClick={() => onSelectBoard(board.id)}
                onToggleStar={() => onToggleStar(board.id)}
                onEdit={() => handleEditBoard(board)}
                onDelete={() => handleDeleteBoard(board)}
              />
            ))}

            {/* 새 보드 생성 카드 */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="h-28 bg-foreground/5 hover:bg-foreground/10 border border-bridge-border hover:border-bridge-accent/50 rounded-2xl flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-300 group"
            >
              <div className="p-3 bg-foreground/5 rounded-xl group-hover:bg-bridge-accent/20 transition-colors mb-2">
                <Plus className="h-6 w-6 group-hover:text-bridge-accent" />
              </div>
              <span className="text-sm font-medium">Create new board</span>
            </button>

            {/* 테스트 보드 생성 카드 (개발용) */}
            <button
              onClick={handleCreateTestBoard}
              disabled={isCreatingTestData}
              className="h-28 bg-gradient-to-br from-bridge-accent/10 to-bridge-secondary/10 hover:from-bridge-accent/20 hover:to-bridge-secondary/20 border border-bridge-accent/30 rounded-2xl flex flex-col items-center justify-center text-bridge-secondary hover:text-bridge-secondary transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingTestData ? (
                <>
                  <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                  <span className="text-sm font-medium">Creating...</span>
                </>
              ) : (
                <>
                  <div className="p-3 bg-bridge-accent/20 rounded-xl mb-2">
                    <FlaskConical className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-medium">Create Test Board</span>
                </>
              )}
            </button>
          </div>
        </section>
      </main>

      {/* 새 보드 생성 모달 */}
      <CreateBoardModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBoard={(name, description, backgroundGradient) => {
          onCreateBoard(name, description, backgroundGradient);
          setIsCreateModalOpen(false);
        }}
      />

      {/* 보드 수정 모달 */}
      <EditBoardModal
        open={isEditModalOpen}
        board={selectedBoard}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedBoard(null);
        }}
        onUpdateBoard={onUpdateBoard}
      />

      {/* 보드 삭제 확인 다이얼로그 */}
      <MotionModal open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} className="sm:max-w-sm p-6">
        <h3 className="text-lg font-semibold text-foreground font-jakarta">{t('board.deleteBoard', 'Delete Board')}</h3>
        <p className="text-sm text-slate-400 mt-1">
          {t('board.deleteConfirm', { name: selectedBoard?.name })}
        </p>
        <div className="bg-bridge-accent/10 border border-bridge-accent/20 rounded-lg p-3 mt-3">
          <p className="text-xs text-bridge-secondary">
            {t('board.softDeleteNotice', 'This board can be recovered by an administrator within 7 days.')}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button onClick={() => setIsDeleteDialogOpen(false)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-bridge-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
            {t('common.cancel', 'Cancel')}
          </button>
          <button onClick={confirmDeleteBoard} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-600 hover:bg-red-700 text-white">
            {t('common.delete', 'Delete')}
          </button>
        </div>
      </MotionModal>

      {/* Version Info */}
      <div className="fixed bottom-2 left-3 text-[10px] text-slate-600 select-none pointer-events-none z-10">
        FE: {typeof __FE_COMMIT_HASH__ !== 'undefined' ? __FE_COMMIT_HASH__ : 'dev'}
        {beCommit && <> · BE: {beCommit}</>}
      </div>
    </div>
  );
}

interface BoardCardProps {
  board: Board;
  onClick: () => void;
  onToggleStar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function BoardCard({ board, onClick, onToggleStar, onEdit, onDelete }: BoardCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <div
      className="relative h-28 rounded-2xl overflow-hidden cursor-pointer group shadow-lg hover:shadow-xl hover:shadow-bridge-accent/10 transition-all duration-300"
      onClick={onClick}
    >
      {/* 배경 그라데이션 */}
      <div
        className="absolute inset-0"
        style={{ background: board.background_gradient || getBoardGradient(board.id) }}
      />

      {/* 패턴 오버레이 */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />

      {/* 호버 오버레이 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

      {/* 상단 버튼 영역 */}
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        {/* 별표 버튼 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className="p-1.5 rounded-lg hover:bg-black/20 transition-colors"
        >
          <Star
            className={`h-4 w-4 ${
              board.is_starred
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-white/70 hover:text-white'
            }`}
          />
        </button>

        {/* 더보기 버튼 */}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1.5 rounded-lg hover:bg-black/20 transition-colors"
          >
            <MoreHorizontal className="h-4 w-4 text-white/70 hover:text-white" />
          </button>

          {/* 드롭다운 메뉴 */}
          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-36 bg-bridge-obsidian border border-bridge-border rounded-xl shadow-xl overflow-hidden z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onEdit();
                }}
                className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex items-center gap-2 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Board
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onDelete();
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Board
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 보드 이름 */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
        <h3 className="font-semibold text-white text-sm mb-1 truncate">{board.name}</h3>
        {board.member_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <Users className="h-3 w-3" />
            <span>{board.member_count} members</span>
          </div>
        )}
      </div>
    </div>
  );
}
