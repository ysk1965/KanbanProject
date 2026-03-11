import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, LayoutGrid, X, AlertTriangle, Check, ChevronRight, Link, Clock, Shield, Crown, Users, Zap, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { organizationService, boardService } from '../../../utils/services';
import { useOrgData } from '../../../contexts/OrgDataContext';
import { MotionModal } from '../../ui/MotionModal';
import type { OrgBoardSimple, OrgBoardEligibilityCheck, OrgRole, Board } from '../../../types';

type AddModalTab = 'create' | 'link';

interface OrgBoardsTabProps {
  orgId: string;
  myRole: OrgRole;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "2026-01-13" → "26.1.2" (YY.M.주차) */
function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  const yy = d.getFullYear() % 100;
  const month = d.getMonth() + 1;
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${yy}.${month}.${weekOfMonth}`;
}

function WeeklyChart({ weeks }: { weeks: Array<{ week_start: string; minutes: number }> }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!weeks || weeks.length === 0) return null;

  const maxMin = Math.max(...weeks.map(w => w.minutes), 1);

  // 라벨 표시 기준: 첫 주, 월 경계, 이번 주, hover된 주
  const labels = weeks.map((w, i) => formatWeekLabel(w.week_start));
  const showLabel = (i: number) => {
    if (i === weeks.length - 1) return true; // 이번 주
    if (i === 0) return true; // 첫 주
    if (hoveredIndex === i) return true; // hover
    // 월이 바뀌는 시점
    const prevMonth = new Date(weeks[i - 1].week_start + 'T00:00:00').getMonth();
    const currMonth = new Date(weeks[i].week_start + 'T00:00:00').getMonth();
    return prevMonth !== currMonth;
  };

  return (
    <div className="relative rounded-lg bg-foreground/[0.03] border border-foreground/[0.05] px-2.5 py-2">
      {/* Hover tooltip */}
      <AnimatePresence>
        {hoveredIndex !== null && weeks[hoveredIndex] && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-bridge-obsidian border border-foreground/[0.12] shadow-lg z-10 whitespace-nowrap"
          >
            <span className="text-[10px] font-bold text-foreground">
              {formatMinutes(weeks[hoveredIndex].minutes)}
            </span>
            <span className="text-[9px] text-slate-500 ml-1.5">
              {labels[hoveredIndex]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bars */}
      <div className="flex items-end gap-[4px] h-10">
        {weeks.map((w, i) => {
          const pct = w.minutes > 0 ? Math.max((w.minutes / maxMin) * 100, 8) : 0;
          const isCurrentWeek = i === weeks.length - 1;
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={w.week_start}
              className="flex-1 flex flex-col items-center gap-1 h-full justify-end cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className="w-full rounded-t-[3px] transition-all duration-200"
                style={{
                  height: w.minutes > 0 ? `${pct}%` : '2px',
                  background: w.minutes === 0
                    ? 'var(--foreground)'
                    : isCurrentWeek
                    ? 'linear-gradient(to top, rgb(79, 82, 221), rgb(129, 131, 245))'
                    : isHovered
                    ? 'linear-gradient(to top, rgb(30, 190, 171), rgb(55, 225, 200))'
                    : 'rgb(45, 212, 191)',
                  opacity: w.minutes === 0
                    ? 0.06
                    : isHovered
                    ? 1
                    : isCurrentWeek
                    ? 1
                    : 0.45,
                  boxShadow: isHovered && w.minutes > 0
                    ? isCurrentWeek
                      ? '0 0 8px rgba(99,102,241,0.4)'
                      : '0 0 8px rgba(45,212,191,0.4)'
                    : 'none',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Week labels: YY.M.W format */}
      <div className="flex gap-[4px] mt-1">
        {weeks.map((w, i) => {
          const isCurrentWeek = i === weeks.length - 1;
          return (
            <div key={`label-${w.week_start}`} className="flex-1 flex justify-center">
              {showLabel(i) ? (
                <span className={`text-[8px] leading-none ${
                  isCurrentWeek
                    ? 'text-bridge-accent font-bold'
                    : hoveredIndex === i
                    ? 'text-bridge-secondary font-medium'
                    : 'text-slate-500'
                }`}>
                  {labels[i]}
                </span>
              ) : (
                <div className={`w-[3px] h-[3px] rounded-full mt-0.5 ${
                  hoveredIndex === i ? 'bg-bridge-secondary' : 'bg-foreground/10'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrgBoardsTab({ orgId, myRole }: OrgBoardsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { subscription, loadSubscription } = useOrgData();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const [boards, setBoards] = useState<OrgBoardSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTab, setAddModalTab] = useState<AddModalTab>('create');
  const [myBoards, setMyBoards] = useState<Board[]>([]);
  const [eligibility, setEligibility] = useState<Record<string, OrgBoardEligibilityCheck>>({});
  const [adding, setAdding] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [showReleaseConfirm, setShowReleaseConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.getBoards(orgId);
      setBoards(data);
      loadSubscription();
    } catch (error) {
      console.warn('Failed to fetch boards:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId, loadSubscription]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setAddModalTab('create');
    setNewBoardName('');
    setNewBoardDescription('');
    setSelectedBoardId('');
  };

  const handleSwitchToLink = async () => {
    setAddModalTab('link');
    try {
      const allBoards = await boardService.getBoards();
      const available = allBoards.filter((b: Board) => !boards.some((ob) => ob.id === b.id));
      setMyBoards(available);

      const checks: Record<string, OrgBoardEligibilityCheck> = {};
      await Promise.all(
        available.map(async (b: Board) => {
          try {
            const check = await organizationService.checkBoardEligibility(orgId, b.id);
            checks[b.id] = check;
          } catch {
            // skip
          }
        })
      );
      setEligibility(checks);
    } catch (error) {
      console.warn('Failed to load boards:', error);
    }
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      setCreating(true);
      await organizationService.createBoard(orgId, {
        name: newBoardName.trim(),
        ...(newBoardDescription.trim() && { description: newBoardDescription.trim() }),
      });
      setShowAddModal(false);
      setNewBoardName('');
      setNewBoardDescription('');
      fetchBoards();
      toast.success(t('organization.boards.createSuccess', 'Board created'));
    } catch (error) {
      console.warn('Failed to create board:', error);
      toast.error(t('organization.boards.createError', 'Failed to create board'));
    } finally {
      setCreating(false);
    }
  };

  const handleAddBoard = async () => {
    if (!selectedBoardId) return;
    try {
      setAdding(true);
      await organizationService.addBoard(orgId, { board_id: selectedBoardId });
      setShowAddModal(false);
      setSelectedBoardId('');
      fetchBoards();
      toast.success(t('organization.boards.addSuccess', 'Board linked'));
    } catch (error) {
      console.warn('Failed to add board:', error);
      toast.error(t('organization.boards.addError', 'Failed to link board'));
    } finally {
      setAdding(false);
    }
  };

  const handleReleaseBoard = async (boardId: string) => {
    try {
      await organizationService.removeBoard(orgId, boardId);
      setShowReleaseConfirm(null);
      fetchBoards();
      toast.success(t('organization.boards.releaseSuccess', 'Board released'));
    } catch (error) {
      console.warn('Failed to release board:', error);
      toast.error(t('organization.boards.releaseError', 'Failed to release board'));
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      setDeleting(true);
      await organizationService.deleteBoard(orgId, boardId);
      setShowDeleteConfirm(null);
      fetchBoards();
      toast.success(t('organization.boards.deleteSuccess', 'Board deleted. It can be recovered within 7 days.'));
    } catch (error) {
      console.warn('Failed to delete board:', error);
      toast.error(t('organization.boards.deleteError', 'Failed to delete board'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-bridge-secondary" />
          <h3 className="text-sm font-bold text-foreground">
            {t('organization.boards.title', 'Connected Boards')}
          </h3>
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/15 px-1.5 py-0.5 rounded-full">
            {boards.length}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 transition-all"
          >
            <Plus size={16} />
            {t('organization.boards.add', 'Add Board')}
          </button>
        )}
      </div>

      {/* Board List */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] animate-pulse" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-bridge-secondary/15 flex items-center justify-center mb-4">
            <LayoutGrid size={32} className="text-bridge-secondary/60" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            {t('organization.boards.emptyTitle', 'No boards linked')}
          </h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">
            {t('organization.boards.emptyDesc', 'Link your existing boards to manage them under this organization.')}
          </p>
          {isAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
            >
              <Plus size={16} />
              {t('organization.boards.add', 'Add Board')}
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {boards.map((board, index) => {
            const maxAvatars = 4;
            const extraCount = board.member_count - maxAvatars;
            const visibleMembers = (board.members || []).slice(0, maxAvatars);

            return (
              <motion.div
                key={board.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="group bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 hover:border-foreground/[0.12] transition-all"
              >
                {/* Top row: icon + name + actions */}
                <div className="flex items-center justify-between">
                  <div
                    onClick={() => navigate(`/boards/${board.id}`)}
                    className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-bridge-secondary/15 flex items-center justify-center shrink-0">
                      <LayoutGrid size={14} className="text-bridge-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground font-medium text-sm group-hover:text-bridge-accent transition-colors truncate">{board.name}</span>
                        {board.tier === 'ORG_MANAGED' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent inline-flex items-center gap-0.5 shrink-0">
                            <Shield size={9} />
                            {t('organization.boards.orgManaged', 'Org Managed')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{board.owner.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setShowReleaseConfirm(board.id)}
                          className="p-2 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          title={t('organization.boards.release', 'Release from organization')}
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(board.id)}
                          className="p-2 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          title={t('organization.boards.delete', 'Delete board')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-bridge-accent group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                {/* Time summary + Weekly chart */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      <span>{t('organization.boards.totalTime', 'Total')}</span>
                      <span className="font-bold text-foreground">{formatMinutes(board.total_minutes)}</span>
                    </div>
                    <div className="w-px h-3 bg-foreground/10" />
                    <div className="flex items-center gap-1">
                      <span>{t('organization.boards.thisMonth', 'This month')}</span>
                      <span className="font-bold text-bridge-accent">{formatMinutes(board.monthly_minutes)}</span>
                    </div>
                  </div>
                  <WeeklyChart weeks={board.weekly_times} />
                </div>

                {/* Bottom row: member avatars + member count */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center">
                    {visibleMembers.map((member, i) => (
                      <div
                        key={member.id}
                        className={`w-7 h-7 rounded-full border-2 border-bridge-obsidian flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden ${i > 0 ? '-ml-2' : ''}`}
                        title={member.name}
                      >
                        {member.profile_image ? (
                          <img src={member.profile_image} alt={member.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-bridge-accent/20 text-bridge-accent flex items-center justify-center">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    ))}
                    {extraCount > 0 && (
                      <div className="w-7 h-7 rounded-full border-2 border-bridge-obsidian bg-foreground/10 flex items-center justify-center text-[10px] font-bold text-muted-foreground -ml-2 shrink-0">
                        +{extraCount}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {t('organization.boards.memberCount', '{{count}} members', { count: board.member_count })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Release Confirmation Modal */}
      <MotionModal open={!!showReleaseConfirm} onClose={() => setShowReleaseConfirm(null)} className="sm:max-w-sm">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">{t('organization.boards.releaseConfirm', 'Release Board?')}</h2>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-muted-foreground">
            {t('organization.boards.releaseWarning', 'After release, non-members can join this board. To re-link, all members must be org members.')}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReleaseConfirm(null)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={() => showReleaseConfirm && handleReleaseBoard(showReleaseConfirm)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              {t('organization.boards.releaseButton', 'Release')}
            </button>
          </div>
        </div>
      </MotionModal>

      {/* Delete Confirmation Modal */}
      <MotionModal open={!!showDeleteConfirm} onClose={() => !deleting && setShowDeleteConfirm(null)} className="sm:max-w-sm">
        <div className="h-[2px] bg-gradient-to-r from-red-500 to-red-700 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
              <Trash2 size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {t('organization.boards.deleteConfirm', 'Delete Board?')}
              </h2>
              <p className="text-[11px] text-slate-500">
                {boards.find(b => b.id === showDeleteConfirm)?.name}
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('organization.boards.deleteWarning', 'This board and all its data will be deleted. It can be recovered within 7 days.')}
          </p>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={14} className="text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
              {t('organization.boards.deleteIrreversible', 'All features, tasks, comments, and files will be affected. The board will also be unlinked from the organization.')}
            </span>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(null)}
              disabled={deleting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-50"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={() => showDeleteConfirm && handleDeleteBoard(showDeleteConfirm)}
              disabled={deleting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting
                ? t('common.deleting', 'Deleting...')
                : t('organization.boards.deleteButton', 'Delete Board')}
            </button>
          </div>
        </div>
      </MotionModal>

      {/* Add Board Modal */}
      <MotionModal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <h2 className="text-lg font-bold text-foreground mb-3">
            {t('organization.boards.addTitle', 'Add Board to Organization')}
          </h2>
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setAddModalTab('create')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                addModalTab === 'create'
                  ? 'bg-bridge-accent/15 text-bridge-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <Plus size={13} />
              {t('organization.boards.createNew', 'Create New')}
            </button>
            <button
              onClick={handleSwitchToLink}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                addModalTab === 'link'
                  ? 'bg-bridge-accent/15 text-bridge-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <Link size={13} />
              {t('organization.boards.linkExisting', 'Link Existing')}
            </button>
          </div>
        </div>

        {/* Create New Board Tab */}
        {addModalTab === 'create' && (
          subscription && !subscription.can_create_org_board ? (
            <>
              <div className="px-5 pb-5 pt-4">
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mb-4">
                    <Crown size={28} className="text-bridge-accent" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    {t('organization.boards.upgradeTitle', 'PRO plan required')}
                  </h3>
                  <p className="text-sm text-slate-400 mb-5 max-w-xs leading-relaxed">
                    {t('organization.boards.upgradeDesc', 'Upgrade your organization to the PRO plan to create and manage boards within the organization.')}
                  </p>
                  <div className="w-full space-y-2.5 mb-5">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
                      <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
                        <LayoutGrid size={14} className="text-bridge-accent" />
                      </div>
                      <div className="text-left">
                        <span className="text-[12px] font-bold text-foreground">
                          {t('organization.boards.upgradeBenefit1', 'Unlimited board creation')}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {t('organization.boards.upgradeBenefit1Desc', 'Create as many boards as your team needs')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
                      <div className="w-8 h-8 rounded-lg bg-bridge-secondary/15 flex items-center justify-center shrink-0">
                        <Users size={14} className="text-bridge-secondary" />
                      </div>
                      <div className="text-left">
                        <span className="text-[12px] font-bold text-foreground">
                          {t('organization.boards.upgradeBenefit2', 'Team collaboration')}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {t('organization.boards.upgradeBenefit2Desc', 'All organization members can access and collaborate')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                        <Zap size={14} className="text-amber-500" />
                      </div>
                      <div className="text-left">
                        <span className="text-[12px] font-bold text-foreground">
                          {t('organization.boards.upgradeBenefit3', 'Premium features included')}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {t('organization.boards.upgradeBenefit3Desc', 'AI, analytics, and all premium features')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06]">
                    <AlertTriangle size={13} className="text-slate-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 leading-relaxed">
                      {t('organization.boards.trialBoardHint', 'You can create regular boards from the board list. Organization-managed boards require a PRO plan.')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">ESC</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setSearchParams({ tab: 'settings', subtab: 'subscription' });
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
                  >
                    {t('organization.boards.upgradePro', 'Upgrade to PRO')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-5 pb-5 pt-4 space-y-3">
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !creating && newBoardName.trim() && handleCreateBoard()}
                  placeholder={t('organization.boards.boardNamePlaceholder', 'Board name')}
                  maxLength={100}
                  autoFocus
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 outline-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                <textarea
                  value={newBoardDescription}
                  onChange={(e) => setNewBoardDescription(e.target.value)}
                  placeholder={t('organization.boards.boardDescPlaceholder', 'Description (optional)')}
                  rows={2}
                  maxLength={500}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
              <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">ESC</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleCreateBoard}
                    disabled={!newBoardName.trim() || creating}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
                  >
                    {creating
                      ? t('common.creating', 'Creating...')
                      : t('organization.boards.createButton', 'Create Board')}
                  </button>
                </div>
              </div>
            </>
          )
        )}

        {/* Link Existing Board Tab */}
        {addModalTab === 'link' && (
          subscription && !subscription.can_create_org_board ? (
            <>
              <div className="px-5 pb-5 pt-4">
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mb-4">
                    <Crown size={28} className="text-bridge-accent" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    {t('organization.boards.upgradeTitle', 'PRO plan required')}
                  </h3>
                  <p className="text-sm text-slate-400 mb-5 max-w-xs leading-relaxed">
                    {t('organization.boards.upgradeLinkDesc', 'Upgrade to the PRO plan to link existing boards to your organization and manage them centrally.')}
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] w-full">
                    <AlertTriangle size={13} className="text-slate-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 leading-relaxed text-left">
                      {t('organization.boards.trialBoardHint', 'You can create regular boards from the board list. Organization-managed boards require a PRO plan.')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">ESC</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setSearchParams({ tab: 'settings', subtab: 'subscription' });
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
                  >
                    {t('organization.boards.upgradePro', 'Upgrade to PRO')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-5 pb-5 pt-4 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {myBoards.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t('organization.boards.noAvailable', 'No available boards to add')}
                  </p>
                ) : (
                  myBoards.map((board) => {
                    const check = eligibility[board.id];
                    const isEligible = check?.is_eligible;
                    return (
                      <div
                        key={board.id}
                        onClick={() => isEligible && setSelectedBoardId(board.id)}
                        className={`p-3 rounded-xl border transition-colors ${
                          selectedBoardId === board.id
                            ? 'border-bridge-accent bg-bridge-accent/10'
                            : isEligible
                            ? 'border-foreground/[0.08] hover:border-foreground/[0.12] cursor-pointer'
                            : 'border-foreground/[0.08] opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-foreground text-sm font-medium">{board.name}</span>
                          {isEligible ? (
                            <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                          ) : check ? (
                            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
                          ) : null}
                        </div>
                        {check && !isEligible && check.non_org_members.length > 0 && (
                          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                            {t('organization.boards.nonOrgMembers', 'Non-org members')}: {check.non_org_members.map((m) => m.name).join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">ESC</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleAddBoard}
                    disabled={!selectedBoardId || adding}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
                  >
                    {adding ? t('common.adding', 'Adding...') : t('organization.boards.addButton', 'Add Board')}
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </MotionModal>
    </div>
  );
}
