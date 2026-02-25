import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, X, AlertTriangle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { organizationService, boardService } from '../../../utils/services';
import type { OrgBoardSimple, OrgBoardEligibilityCheck, OrgRole, Board } from '../../../types';

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
  const [myBoards, setMyBoards] = useState<Board[]>([]);
  const [eligibility, setEligibility] = useState<Record<string, OrgBoardEligibilityCheck>>({});
  const [adding, setAdding] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [showReleaseConfirm, setShowReleaseConfirm] = useState<string | null>(null);

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

  const handleOpenAddModal = async () => {
    setShowAddModal(true);
    try {
      const allBoards = await boardService.getBoards();
      // Filter boards not already in an org
      const available = allBoards.filter((b: Board) => !boards.some((ob) => ob.id === b.id));
      setMyBoards(available);

      // Check eligibility for each
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
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
          {t('organization.boards.title', 'Connected Boards')} ({boards.length})
        </h3>
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
            <div key={i} className="h-16 bg-bridge-obsidian rounded-xl border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <LayoutGrid size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t('organization.boards.empty', 'No boards linked to this organization')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {boards.map((board) => (
            <div
              key={board.id}
              className="bg-bridge-obsidian rounded-xl border border-white/5 p-4 flex items-center justify-between hover:border-white/10 transition-colors"
            >
              <div
                onClick={() => navigate(`/boards/${board.id}`)}
                className="flex-1 cursor-pointer"
              >
                <span className="text-white font-medium text-sm">{board.name}</span>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>{board.owner.name}</span>
                  <span>{board.member_count} members</span>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setShowReleaseConfirm(board.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title={t('organization.boards.release', 'Release from organization')}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Release Confirmation */}
      <AnimatePresence>
        {showReleaseConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReleaseConfirm(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle size={20} className="text-amber-400" />
                  <h2 className="text-lg font-bold text-white">{t('organization.boards.releaseConfirm', 'Release Board?')}</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">
                  {t('organization.boards.releaseWarning', 'After release, non-members can join this board. To re-link, all members must be org members.')}
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowReleaseConfirm(null)}
                    className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={() => handleReleaseBoard(showReleaseConfirm)}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-all text-sm font-bold"
                  >
                    {t('organization.boards.releaseButton', 'Release')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Board Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-white mb-4">{t('organization.boards.addTitle', 'Add Board to Organization')}</h2>
                <div className="space-y-2 mb-6">
                  {myBoards.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
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
                              ? 'border-white/5 hover:border-white/10 cursor-pointer'
                              : 'border-white/5 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white text-sm font-medium">{board.name}</span>
                            {isEligible ? (
                              <Check size={14} className="text-emerald-400" />
                            ) : check ? (
                              <AlertTriangle size={14} className="text-amber-400" />
                            ) : null}
                          </div>
                          {check && !isEligible && check.non_org_members.length > 0 && (
                            <div className="mt-2 text-xs text-amber-400">
                              {t('organization.boards.nonOrgMembers', 'Non-org members')}: {check.non_org_members.map((m) => m.name).join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleAddBoard}
                    disabled={!selectedBoardId || adding}
                    className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all text-sm disabled:opacity-50"
                  >
                    {adding ? t('common.adding', 'Adding...') : t('organization.boards.addButton', 'Add Board')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
