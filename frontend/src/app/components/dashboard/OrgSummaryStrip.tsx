import { motion } from 'framer-motion';
import { Building2, ChevronRight, LayoutGrid, Star, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Board, OrganizationSimple } from '../../types';
import { BoardCard, getGradient } from './BoardCard';

type ViewMode = 'grid' | 'list';

interface OrgBoardGroup {
  org: OrganizationSimple;
  boards: Board[];
}

interface OrgSummaryStripProps {
  organizations: OrganizationSimple[];
  orgBoardsMap: Map<string, OrgBoardGroup>;
  onOrgClick: (orgId: string) => void;
  onViewAll: () => void;
  onSelectBoard: (board: Board) => void;
  onToggleStar: (boardId: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  onEditBoard?: (board: Board) => void;
  viewMode: ViewMode;
}

export default function OrgSummaryStrip({
  organizations,
  orgBoardsMap,
  onOrgClick,
  onViewAll,
  onSelectBoard,
  onToggleStar,
  onDeleteBoard,
  onEditBoard,
  viewMode,
}: OrgSummaryStripProps) {
  const { t } = useTranslation();

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'OWNER':
        return t('organization.role.owner', 'Owner');
      case 'ADMIN':
        return t('organization.role.admin', 'Admin');
      default:
        return t('organization.role.member', 'Member');
    }
  };

  return (
    <div className="space-y-5">
      {organizations.map((org, orgIndex) => {
        const group = orgBoardsMap.get(org.id);
        const orgBoards = group?.boards ?? [];

        return (
          <div key={org.id}>
            {/* Org Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-bridge-accent" />
                <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                  {t('dashboard.myOrganizations', 'My Organizations')}
                </h2>
                {organizations.length > 1 && (
                  <span className="text-[10px] text-slate-600">
                    {orgIndex + 1}/{organizations.length}
                  </span>
                )}
              </div>
              <button
                onClick={onViewAll}
                className="text-[10px] font-bold text-slate-500 hover:text-foreground transition-colors"
              >
                {t('common.viewAll', 'View All')}
              </button>
            </div>

            {/* Org Info Row */}
            <motion.button
              onClick={() => onOrgClick(org.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: orgIndex * 0.04 }}
              className="flex items-center gap-3 px-4 py-2.5 w-full text-left group hover:bg-foreground/[0.03] transition-colors bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] mb-3"
            >
              {/* Logo */}
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-bridge-accent/10 flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-bridge-accent" />
                </div>
              )}

              {/* Name */}
              <span className="text-[13px] font-bold text-foreground truncate flex-1 min-w-0">
                {org.name}
              </span>

              {/* Role Badge */}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0">
                {getRoleLabel(org.my_role)}
              </span>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Users size={10} />
                  {org.member_count}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <LayoutGrid size={10} />
                  {org.board_count}
                </span>
              </div>

              {/* Chevron */}
              <ChevronRight
                size={14}
                className="text-slate-600 group-hover:text-foreground transition-colors shrink-0"
              />
            </motion.button>

            {/* Org Boards Grid */}
            {orgBoards.length > 0 && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {orgBoards.map((board) => (
                    <BoardCard
                      key={board.id}
                      board={board}
                      onToggleStar={onToggleStar}
                      onClick={onSelectBoard}
                      onDelete={onDeleteBoard}
                      onEdit={onEditBoard}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {orgBoards.map((board) => (
                    <OrgBoardListItem
                      key={board.id}
                      board={board}
                      onToggleStar={onToggleStar}
                      onClick={onSelectBoard}
                      onEdit={onEditBoard}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// Inline list item for org boards (reuses same pattern as Dashboard BoardListItem)
function OrgBoardListItem({ board, onToggleStar, onClick, onEdit }: {
  board: Board;
  onToggleStar: (id: string) => void;
  onClick: (board: Board) => void;
  onEdit?: (board: Board) => void;
}) {
  const { t } = useTranslation();
  const taskCount = board.task_count ?? 0;
  const completedTasks = board.completed_tasks ?? 0;
  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;

  return (
    <motion.div
      whileHover={{ x: 2 }}
      onClick={() => onClick(board)}
      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-foreground/[0.02] border border-bridge-accent/20 hover:border-bridge-accent/40 hover:bg-foreground/[0.03] cursor-pointer transition-all group"
    >
      <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden"
        style={{ background: getGradient(board.id) }}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-foreground truncate group-hover:text-bridge-secondary transition-colors">
          {board.name}
        </h3>
        <p className="text-[11px] text-slate-500 truncate">{board.description || t('dashboard.noDescription')}</p>
      </div>
      <div className="hidden md:flex items-center gap-2 shrink-0 w-28">
        <div className="flex-1 h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{progress}%</span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-slate-500 shrink-0">
        <Users size={12} />
        <span className="text-[10px] font-medium">{board.member_count}</span>
      </div>
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
