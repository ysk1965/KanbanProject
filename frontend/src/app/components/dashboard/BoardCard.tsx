import { Star, Users, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Board } from '../../types';

// 보드 배경 그라데이션 색상
const GRADIENTS = [
  'linear-gradient(135deg, #6366F1 0%, #a855f7 100%)', // Indigo Purple
  'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)', // Teal Cyan
  'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)', // Rose Orange
  'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)', // Green Blue
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)', // Amber Red
  'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)', // Violet Pink
];

// boardId를 기반으로 그라데이션 선택
function getGradient(boardId: string): string {
  let hash = 0;
  for (let i = 0; i < boardId.length; i++) {
    hash = boardId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

interface BoardCardProps {
  board: Board;
  onToggleStar: (id: string) => void;
  onClick: (board: Board) => void;
  onDelete?: (id: string) => void;
  onEdit?: (board: Board) => void;
}

export function BoardCard({ board, onToggleStar, onClick, onEdit }: BoardCardProps) {
  const isTrial = board.subscription?.status === 'TRIAL';
  const taskCount = board.task_count ?? 0;
  const completedTasks = board.completed_tasks ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
  const isOwner = board.role === 'OWNER';
  const canManage = board.role === 'OWNER' || board.role === 'ADMIN';
  const members = board.members ?? [];

  return (
    <motion.div
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      className="relative flex flex-col h-52 w-full bg-bridge-obsidian/60 backdrop-blur-sm rounded-2xl overflow-hidden group border border-white/5 hover:border-white/20 transition-all shadow-xl cursor-pointer"
      onClick={() => onClick(board)}
    >
      {/* Dynamic Background Header */}
      <div
        className="h-20 w-full relative overflow-hidden"
        style={{ background: getGradient(board.id) }}
      >
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(board.id);
            }}
            className="p-1.5 bg-black/20 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors"
          >
            <Star
              size={14}
              fill={board.is_starred ? '#F59E0B' : 'transparent'}
              stroke={board.is_starred ? '#F59E0B' : 'white'}
            />
          </button>

          {/* Edit Button - 바로 수정 모달 열기 */}
          {canManage && onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(board);
              }}
              className="p-1.5 bg-black/20 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors"
            >
              <MoreHorizontal size={14} className="text-white" />
            </button>
          )}
        </div>

        {isTrial && (
          <div className="absolute bottom-2 left-3 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[9px] font-bold text-bridge-secondary border border-bridge-secondary/30 uppercase tracking-widest">
            Trial Plan
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col h-full bg-slate-900/40">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-md font-bold text-white group-hover:text-bridge-accent transition-colors truncate pr-2">
            {board.name}
          </h3>
          {isOwner && <ShieldCheck size={14} className="text-bridge-accent mt-1 shrink-0" />}
        </div>

        <p className="text-[11px] text-slate-500 mb-4 line-clamp-1 h-4">
          {board.description || 'No description provided'}
        </p>

        {/* Progress Section */}
        <div className="space-y-1.5 mt-auto">
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className="text-slate-500 uppercase tracking-tighter">Tasks Progress</span>
            <span className="text-slate-300">{progress}%</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-bridge-accent to-purple-500"
            />
          </div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Users size={12} />
            <span className="text-[11px] font-medium">{board.member_count} members</span>
          </div>

          {/* Member Avatars */}
          <div className="flex -space-x-1.5">
            {members.slice(0, 3).map((member, i) => (
              <div
                key={member.id}
                className="w-6 h-6 rounded-full border border-slate-900 overflow-hidden bg-slate-700"
              >
                {member.profile_image ? (
                  <img
                    src={member.profile_image}
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br from-bridge-accent to-purple-500">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {board.member_count > 3 && (
              <div className="w-6 h-6 rounded-full border border-slate-900 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400">
                +{board.member_count - 3}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// 새 보드 생성 카드
export function CreateBoardCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className="h-52 flex flex-col items-center justify-center bg-bridge-obsidian/30 backdrop-blur-sm border-2 border-dashed border-white/5 rounded-2xl cursor-pointer hover:border-bridge-accent/30 hover:bg-white/[0.02] transition-all group"
    >
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-bridge-accent/20 group-hover:text-bridge-accent transition-colors">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </div>
      <span className="text-xs font-bold text-slate-500 group-hover:text-slate-300 uppercase tracking-widest">
        New Board
      </span>
    </motion.div>
  );
}
