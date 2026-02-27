import { useState, useRef, useEffect } from 'react';
import { Star, Users, MoreHorizontal, ShieldCheck, Pencil, Trash2, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Board } from '../../types';
import { getInitials } from '../../utils/assigneeColor';
import { formatRelativeTime } from '../../utils/dateUtils';

// 보드 배경 그라데이션 색상 (빨주노초파남보 무지개 순서)
const GRADIENTS = [
  'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)', // Red
  'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)', // Rose → Orange
  'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)', // Orange → Yellow
  'linear-gradient(135deg, #EAB308 0%, #84CC16 100%)', // Yellow → Lime
  'linear-gradient(135deg, #059669 0%, #34D399 100%)', // Emerald Green
  'linear-gradient(135deg, #10B981 0%, #2DD4BF 100%)', // Emerald → Teal
  'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)', // Teal → Cyan
  'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)', // Sky → Blue
  'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)', // Blue → Indigo
  'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)', // Indigo → Purple
  'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)', // Violet → Fuchsia
  'linear-gradient(135deg, #D946EF 0%, #EC4899 100%)', // Fuchsia → Pink
];

// boardId를 기반으로 그라데이션 선택
export function getGradient(boardId: string): string {
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

export function BoardCard({ board, onToggleStar, onClick, onDelete, onEdit }: BoardCardProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [starAnimating, setStarAnimating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isTrial = board.subscription?.status === 'TRIAL' && board.tier !== 'PREMIUM';
  const isOrgBoard = !!board.organization_id;
  const taskCount = board.task_count ?? 0;
  const completedTasks = board.completed_tasks ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
  const isOwner = board.role === 'OWNER';
  const canManage = board.role === 'OWNER' || board.role === 'ADMIN';
  const members = board.members ?? [];

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStarAnimating(true);
    onToggleStar(board.id);
    setTimeout(() => setStarAnimating(false), 600);
  };

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`relative flex flex-col h-[14rem] min-h-0 w-full bg-bridge-obsidian/60 backdrop-blur-sm rounded-2xl group border transition-all shadow-lg hover:shadow-xl cursor-pointer ${isOrgBoard ? 'border-bridge-accent/20 hover:border-bridge-accent/40 hover:shadow-bridge-accent/10' : 'border-bridge-border hover:border-foreground/[0.15] hover:shadow-bridge-accent/5'} ${isMenuOpen ? 'z-50' : ''}`}
      onClick={() => onClick(board)}
    >
      {/* Dynamic Background Header - Compact */}
      <div
        className="h-16 w-full relative overflow-hidden shrink-0 rounded-t-2xl"
        style={{ background: board.background_gradient || getGradient(board.id) }}
      >
        {/* Shimmer effect on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.12) 55%, transparent 60%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }}
        />
        <div className="absolute inset-0 opacity-[0.08] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      </div>

      {/* Top right controls - outside header to avoid overflow-hidden clipping */}
      <div className="absolute top-2.5 right-2.5 flex gap-1.5 z-10">
          {/* Star Button */}
          <motion.button
            onClick={handleStarClick}
            animate={starAnimating ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 0.4 }}
            className="p-1.5 bg-black/20 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors"
          >
            <Star
              size={13}
              fill={board.is_starred ? '#F59E0B' : 'transparent'}
              stroke={board.is_starred ? '#F59E0B' : 'rgba(255,255,255,0.8)'}
              className="transition-colors"
            />
          </motion.button>

          {/* Context Menu */}
          {canManage && (
            <div ref={menuRef} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="p-1.5 bg-black/20 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors"
              >
                <MoreHorizontal size={13} className="text-white/80" />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-1.5 w-44 bg-bridge-obsidian border border-bridge-border rounded-xl shadow-2xl overflow-hidden z-30"
                  >
                    {onEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onEdit(board); }}
                        className="w-full px-3.5 py-2.5 text-left text-[13px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex items-center gap-2.5 transition-colors"
                      >
                        <Pencil size={14} className="text-slate-400" />
                        {t('board.editBoard')}
                      </button>
                    )}
                    {onDelete && isOwner && (
                      <>
                        <div className="border-t border-bridge-border my-1" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onDelete(board.id); }}
                          className="w-full px-3.5 py-2.5 text-left text-[13px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2.5 transition-colors"
                        >
                          <Trash2 size={14} />
                          {t('board.deleteBoard')}
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
      </div>

      {/* Card Body */}
      <div className="px-4 py-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Title Row */}
        <div className="flex items-start gap-2 mb-0.5 shrink-0">
          <h3 className="text-[15px] font-bold text-foreground group-hover:text-bridge-secondary transition-colors truncate flex-1">
            {board.name}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {isOwner && <ShieldCheck size={13} className="text-bridge-accent" />}
            {isTrial && (
              <span className="px-1.5 py-0.5 bg-bridge-secondary/10 text-bridge-secondary text-[8px] font-bold uppercase tracking-wider rounded border border-bridge-secondary/20">
                {t('dashboard.trialPlan')}
              </span>
            )}
          </div>
        </div>

        {/* Organization Badge */}
        {isOrgBoard && board.organization_name && (
          <div className="flex items-center gap-1 mb-0.5 shrink-0">
            <Building2 size={10} className="text-bridge-accent shrink-0" />
            <span className="text-[10px] font-medium text-bridge-accent truncate">
              {board.organization_name}
            </span>
          </div>
        )}

        {/* Description — hide for org cards to save space */}
        {!isOrgBoard && (
          <p className="text-[11px] text-slate-500 line-clamp-1 shrink-0">
            {board.description || t('dashboard.noDescription')}
          </p>
        )}

        {/* Spacer — pushes bottom content down */}
        <div className="flex-1 min-h-0" />

        {/* Progress Section — pinned to bottom */}
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            {/* Mini circular progress */}
            <div className="relative w-8 h-8 shrink-0">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.08" />
                <motion.circle
                  cx="16" cy="16" r="13" fill="none"
                  stroke="url(#progressGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 13}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 13 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 13 * (1 - progress / 100) }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2DD4BF" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-300">
                {progress}%
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-slate-500 font-medium">{t('dashboard.tasksProgress')}</span>
                <span className="text-slate-400 font-bold">{completedTasks}/{taskCount}</span>
              </div>
              {/* Last Activity */}
              {board.updated_at && (
                <div className="text-[10px] text-slate-600 truncate">
                  {t('dashboard.lastActivity', 'Last activity')} {formatRelativeTime(board.updated_at)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Members */}
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-foreground/[0.06] shrink-0">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users size={11} />
            <span className="text-[10px] font-medium">{t('dashboard.memberCount', { count: board.member_count })}</span>
          </div>

          {/* Member Avatars */}
          <div className="flex -space-x-1.5">
            {members.slice(0, 3).map((member) => (
              <div
                key={member.id}
                className="w-5.5 h-5.5 w-[22px] h-[22px] rounded-full border-[1.5px] border-bridge-obsidian overflow-hidden bg-slate-700"
              >
                {member.profile_image ? (
                  <img src={member.profile_image} alt={member.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-br from-bridge-secondary to-bridge-accent">
                    {getInitials(member.name)}
                  </div>
                )}
              </div>
            ))}
            {board.member_count > 3 && (
              <div className="w-[22px] h-[22px] rounded-full border-[1.5px] border-bridge-obsidian bg-foreground/5 flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                +{board.member_count - 3}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shimmer keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.div>
  );
}

// 새 보드 생성 카드
export function CreateBoardCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="h-[14rem] flex flex-col items-center justify-center bg-foreground/[0.02] backdrop-blur-sm border-2 border-dashed border-bridge-border rounded-2xl cursor-pointer hover:border-bridge-secondary/30 hover:bg-foreground/[0.03] transition-all group"
    >
      <div className="w-11 h-11 rounded-xl bg-foreground/5 flex items-center justify-center mb-3 group-hover:bg-bridge-secondary/15 group-hover:scale-110 transition-all">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-slate-500 group-hover:text-bridge-secondary transition-colors"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </div>
      <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase tracking-[0.2em] transition-colors">
        {t('dashboard.newBoard')}
      </span>
    </motion.div>
  );
}
