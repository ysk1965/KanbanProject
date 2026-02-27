import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronLeft, ChevronRight, Folder, Users, User, ListTodo, Calendar, Filter, Eye, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../utils/services';
import { BoardListResponse } from '../../utils/api';
import { AdminBoardDetailModal } from './AdminBoardDetailModal';
import { formatDate as dateUtilsFormatDate, formatRelativeTime } from '../../utils/dateUtils';

export function AdminBoardsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const TIER_OPTIONS = [
    { value: '', label: t('admin.boards.allTiers') },
    { value: 'FREE', label: 'FREE' },
    { value: 'STANDARD', label: 'STANDARD' },
    { value: 'PREMIUM', label: 'PREMIUM' },
    { value: 'ENTERPRISE', label: 'ENTERPRISE' },
  ];
  const TYPE_OPTIONS = [
    { value: '', label: t('admin.boards.allTypes', 'All Types') },
    { value: 'TEAM', label: t('admin.boards.typeTeam', 'Team') },
    { value: 'PERSONAL', label: t('admin.boards.typePersonal', 'Personal') },
  ];

  const [boards, setBoards] = useState<BoardListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      let data: BoardListResponse;
      if (showDeleted) {
        data = await adminService.getDeletedBoards({
          page,
          size: 20,
          search: search || undefined,
        });
      } else {
        data = await adminService.getBoards({
          page,
          size: 20,
          search: search || undefined,
          tier: tierFilter || undefined,
          board_type: typeFilter || undefined,
        });
      }
      setBoards(data);
    } catch (err) {
      console.error('Failed to load boards:', err);
      setError(t('admin.boards.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, tierFilter, typeFilter, showDeleted]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadBoards();
  };

  const handleBoardUpdate = () => {
    loadBoards();
  };

  const handleRestore = async (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation();
    try {
      setIsRestoring(boardId);
      await adminService.restoreBoard(boardId);
      loadBoards();
    } catch (err) {
      console.error('Failed to restore board:', err);
    } finally {
      setIsRestoring(null);
    }
  };

  const formatDate = (dateString: string) => {
    return dateUtilsFormatDate(dateString, t('admin.common.dateFormat'));
  };

  const getDaysUntilPermanentDelete = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diffMs = 7 * 24 * 60 * 60 * 1000 - (now.getTime() - deleted.getTime());
    const days = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return days;
  };

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'FREE':
        return 'bg-slate-500/20 text-slate-400';
      case 'STANDARD':
        return 'bg-blue-500/20 text-blue-400';
      case 'PREMIUM':
        return 'bg-purple-500/20 text-purple-400';
      case 'ENTERPRISE':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.boards.title')}</h2>
          <p className="text-slate-400">{t('admin.boards.subtitle')}</p>
        </div>
      </div>

      {/* Tab Toggle: Active / Deleted */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setShowDeleted(false); setPage(0); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !showDeleted
              ? 'bg-bridge-accent text-white'
              : 'bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10'
          }`}
        >
          <Folder className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          {t('admin.boards.activeBoards', 'Active Boards')}
        </button>
        <button
          onClick={() => { setShowDeleted(true); setPage(0); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showDeleted
              ? 'bg-red-500/20 text-red-400'
              : 'bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10'
          }`}
        >
          <Trash2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          {t('admin.boards.deletedBoards', 'Deleted Boards')}
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.boards.searchPlaceholder')}
              className="w-full bg-bridge-obsidian border border-foreground/[0.08] rounded-xl py-3 pl-12 pr-4
                text-foreground placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-medium
              hover:bg-bridge-accent/90 transition-colors"
          >
            {t('common.search')}
          </button>
        </form>
        {!showDeleted && (
          <>
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <select
                value={tierFilter}
                onChange={(e) => {
                  setTierFilter(e.target.value);
                  setPage(0);
                }}
                className="bg-bridge-obsidian border border-foreground/[0.08] rounded-xl py-3 pl-12 pr-8
                  text-foreground appearance-none cursor-pointer
                  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                  transition-all"
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-bridge-dark">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(0);
                }}
                className="bg-bridge-obsidian border border-foreground/[0.08] rounded-xl py-3 pl-4 pr-8
                  text-foreground appearance-none cursor-pointer
                  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                  transition-all"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-bridge-dark">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadBoards}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
        </div>
      )}

      {/* Boards Table */}
      {!isLoading && !error && boards && (
        <>
          {showDeleted && boards.boards.length === 0 ? (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-12 text-center">
              <Trash2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">{t('admin.boards.noDeletedBoards', 'No deleted boards')}</p>
              <p className="text-slate-500 text-sm mt-2">{t('admin.boards.noDeletedBoardsDesc', 'Deleted boards will appear here for 7 days before permanent deletion.')}</p>
            </div>
          ) : (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-foreground/[0.08]">
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.boards.board')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.boards.type', 'Type')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.boards.owner')}
                    </th>
                    {!showDeleted && (
                      <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        {t('admin.boards.tier')}
                      </th>
                    )}
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.boards.members')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.boards.tasks')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {showDeleted ? t('admin.boards.deletedAt', 'Deleted') : t('admin.boards.createdAt')}
                    </th>
                    <th className="text-right px-3 py-3 md:px-6 md:py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {boards.boards.map((board) => (
                    <tr
                      key={board.id}
                      onClick={() => setSelectedBoardId(board.id)}
                      className={`border-b border-foreground/[0.08] last:border-0 hover:bg-foreground/5 cursor-pointer transition-colors ${
                        showDeleted ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            showDeleted ? 'bg-red-500/20' : 'bg-bridge-accent/20'
                          }`}>
                            {showDeleted ? (
                              <Trash2 className="h-5 w-5 text-red-400" />
                            ) : (
                              <Folder className="h-5 w-5 text-bridge-accent" />
                            )}
                          </div>
                          <div>
                            <p className="text-foreground font-medium">{board.name}</p>
                            {board.description && (
                              <p className="text-slate-400 text-sm truncate max-w-[200px]">
                                {board.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            board.board_type === 'PERSONAL'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {board.board_type === 'PERSONAL' ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Users className="h-3 w-3" />
                          )}
                          {board.board_type === 'PERSONAL' ? t('admin.boards.typePersonal', 'Personal') : t('admin.boards.typeTeam', 'Team')}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div>
                          <p className="text-foreground">{board.owner_name}</p>
                          <p className="text-slate-400 text-sm">{board.owner_email}</p>
                        </div>
                      </td>
                      {!showDeleted && (
                        <td className="px-3 py-3 md:px-6 md:py-4">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getTierStyle(
                              board.tier
                            )}`}
                          >
                            {board.tier}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-foreground flex items-center gap-1">
                          <Users className="h-4 w-4 text-slate-400" />
                          {board.member_count}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-foreground flex items-center gap-1">
                          <ListTodo className="h-4 w-4 text-slate-400" />
                          {board.task_count}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        {showDeleted && board.deleted_at ? (
                          <div>
                            <span className="text-red-400 text-sm">
                              {formatRelativeTime(board.deleted_at)}
                            </span>
                            <p className="text-slate-500 text-xs mt-0.5">
                              {t('admin.boards.daysLeft', { days: getDaysUntilPermanentDelete(board.deleted_at) })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(board.created_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                        {showDeleted ? (
                          <button
                            onClick={(e) => handleRestore(e, board.id)}
                            disabled={isRestoring === board.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                              text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg
                              hover:bg-emerald-500/20 hover:border-emerald-500/30
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${isRestoring === board.id ? 'animate-spin' : ''}`} />
                            {t('admin.boards.restore', 'Restore')}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/boards/${board.id}`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                              text-slate-400 bg-foreground/5 border border-foreground/10 rounded-lg
                              hover:text-foreground hover:bg-bridge-accent/20 hover:border-bridge-accent/30
                              transition-all"
                            title={t('admin.boards.viewBoard')}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t('admin.boards.view')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {boards.boards.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm">
                {t('admin.common.totalItems', { count: boards.total.toLocaleString() })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-2 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg
                    text-slate-400 hover:text-foreground hover:bg-foreground/5
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-slate-400 px-4">
                  {page + 1} / {Math.ceil(boards.total / boards.size) || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(boards.total / boards.size) - 1, page + 1))}
                  disabled={page >= Math.ceil(boards.total / boards.size) - 1}
                  className="p-2 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg
                    text-slate-400 hover:text-foreground hover:bg-foreground/5
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Board Detail Modal */}
      {selectedBoardId && (
        <AdminBoardDetailModal
          boardId={selectedBoardId}
          onClose={() => setSelectedBoardId(null)}
          onUpdate={handleBoardUpdate}
        />
      )}
    </div>
  );
}
