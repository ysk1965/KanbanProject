import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, X, AlertTriangle, Check, ChevronRight, Link } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService, boardService } from '../../../utils/services';
import { MotionModal } from '../../ui/MotionModal';
import type { OrgBoardSimple, OrgBoardEligibilityCheck, OrgRole, Board } from '../../../types';

type AddModalTab = 'create' | 'link';

interface OrgBoardsTabProps {
  orgId: string;
  myRole: OrgRole;
}

export function OrgBoardsTab({ orgId, myRole }: OrgBoardsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.getBoards(orgId);
      setBoards(data);
    } catch (error) {
      console.warn('Failed to fetch boards:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

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
    } catch (error) {
      console.warn('Failed to create board:', error);
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
    } catch (error) {
      console.warn('Failed to add board:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleReleaseBoard = async (boardId: string) => {
    try {
      await organizationService.removeBoard(orgId, boardId);
      setShowReleaseConfirm(null);
      fetchBoards();
    } catch (error) {
      console.warn('Failed to release board:', error);
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
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded-full">
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
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-bridge-obsidian rounded-xl border border-foreground/[0.05] animate-pulse" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-bridge-secondary/10 flex items-center justify-center mb-4">
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
        <div className="space-y-2">
          {boards.map((board, index) => (
            <motion.div
              key={board.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="group bg-bridge-obsidian rounded-xl border border-foreground/[0.05] p-4 flex items-center justify-between hover:border-foreground/[0.08] transition-all"
            >
              <div
                onClick={() => navigate(`/boards/${board.id}`)}
                className="flex items-center gap-3 flex-1 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-bridge-secondary/10 flex items-center justify-center shrink-0">
                  <LayoutGrid size={14} className="text-bridge-secondary" />
                </div>
                <div>
                  <span className="text-foreground font-medium text-sm group-hover:text-bridge-accent transition-colors">{board.name}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{board.owner.name}</span>
                    <span>{board.member_count} members</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <button
                    onClick={() => setShowReleaseConfirm(board.id)}
                    className="p-2 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title={t('organization.boards.release', 'Release from organization')}
                  >
                    <X size={16} />
                  </button>
                )}
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-bridge-accent group-hover:translate-x-0.5 transition-all" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Release Confirmation Modal */}
      <MotionModal open={!!showReleaseConfirm} onClose={() => setShowReleaseConfirm(null)} className="sm:max-w-sm">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500 rounded-t-2xl" />
        <div className="px-6 pt-5 pb-4 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">{t('organization.boards.releaseConfirm', 'Release Board?')}</h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground">
            {t('organization.boards.releaseWarning', 'After release, non-members can join this board. To re-link, all members must be org members.')}
          </p>
        </div>
        <div className="px-6 py-4 border-t border-foreground/[0.08] flex items-center justify-between">
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
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              {t('organization.boards.releaseButton', 'Release')}
            </button>
          </div>
        </div>
      </MotionModal>

      {/* Add Board Modal */}
      <MotionModal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-6 pt-5 pb-3 border-b border-foreground/[0.08]">
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
          <>
            <div className="px-6 py-5 space-y-3">
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !creating && newBoardName.trim() && handleCreateBoard()}
                placeholder={t('organization.boards.boardNamePlaceholder', 'Board name')}
                maxLength={100}
                autoFocus
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 outline-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
              />
              <textarea
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                placeholder={t('organization.boards.boardDescPlaceholder', 'Description (optional)')}
                rows={2}
                maxLength={500}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
              />
            </div>
            <div className="px-6 py-4 border-t border-foreground/[0.08] flex items-center justify-between">
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
        )}

        {/* Link Existing Board Tab */}
        {addModalTab === 'link' && (
          <>
            <div className="px-6 py-5 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
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
                          ? 'border-foreground/[0.05] hover:border-foreground/[0.08] cursor-pointer'
                          : 'border-foreground/[0.05] opacity-60'
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
            <div className="px-6 py-4 border-t border-foreground/[0.08] flex items-center justify-between">
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
        )}
      </MotionModal>
    </div>
  );
}
