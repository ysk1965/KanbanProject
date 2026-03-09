import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrgMemberBoard } from '../../../types';

interface MemberBoardsTabProps {
  boards: OrgMemberBoard[];
  loading: boolean;
  onBoardClick: (boardId: string) => void;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function MemberBoardsTab({ boards, loading, onBoardClick }: MemberBoardsTabProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="px-6 py-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-bridge-accent/10 flex items-center justify-center mx-auto mb-3">
          <LayoutGrid size={24} className="text-bridge-accent/50" />
        </div>
        <p className="text-sm text-slate-400">{t('organization.members.detail.noBoards')}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="text-xs text-slate-400 mb-3">
        {t('organization.members.detail.boards')} ({boards.length})
      </div>
      <div className="space-y-2">
        {boards.map((board, i) => (
          <motion.div
            key={board.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onBoardClick(board.id)}
            className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-4 hover:border-bridge-accent/30 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{board.name}</span>
              <span className="text-[10px] text-slate-400">{t('organization.boards.memberCount', { count: board.member_count })}</span>
            </div>
            {board.description && (
              <p className="text-xs text-slate-400 truncate">{board.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
              <span>Owner: {board.owner_name}</span>
              <span>{formatDate(board.created_at)}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
