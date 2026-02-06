import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, Folder, Users, ListTodo, Calendar, Filter } from 'lucide-react';
import { adminService } from '../../utils/services';
import { BoardListResponse } from '../../utils/api';
import { AdminBoardDetailModal } from './AdminBoardDetailModal';
import { formatDate as dateUtilsFormatDate } from '../../utils/dateUtils';

const TIER_OPTIONS = [
  { value: '', label: '전체 티어' },
  { value: 'FREE', label: 'FREE' },
  { value: 'STANDARD', label: 'STANDARD' },
  { value: 'PREMIUM', label: 'PREMIUM' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
];

export function AdminBoardsTab() {
  const [boards, setBoards] = useState<BoardListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getBoards({
        page,
        size: 20,
        search: search || undefined,
        tier: tierFilter || undefined,
      });
      setBoards(data);
    } catch (err) {
      console.error('Failed to load boards:', err);
      setError('보드 목록을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, tierFilter]);

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

  const formatDate = (dateString: string) => {
    return dateUtilsFormatDate(dateString, 'yyyy년 M월 d일');
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
          <h2 className="text-2xl font-bold text-white mb-2">보드 관리</h2>
          <p className="text-slate-400">시스템 보드를 관리합니다</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3">
        <form onSubmit={handleSearch} className="flex gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="보드명 또는 소유자로 검색..."
              className="w-full bg-bridge-obsidian border border-white/20 rounded-xl py-3 pl-12 pr-4
                text-white placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-medium
              hover:bg-bridge-accent/90 transition-colors"
          >
            검색
          </button>
        </form>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(0);
            }}
            className="bg-bridge-obsidian border border-white/20 rounded-xl py-3 pl-12 pr-8
              text-white appearance-none cursor-pointer
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
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadBoards}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
        </div>
      )}

      {/* Boards Table */}
      {!isLoading && !error && boards && (
        <>
          <div className="bg-bridge-obsidian rounded-xl border border-white/15 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/15">
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    보드
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    소유자
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    티어
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    멤버
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    태스크
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    생성일
                  </th>
                </tr>
              </thead>
              <tbody>
                {boards.boards.map((board) => (
                  <tr
                    key={board.id}
                    onClick={() => setSelectedBoardId(board.id)}
                    className="border-b border-white/15 last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
                          <Folder className="h-5 w-5 text-bridge-accent" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{board.name}</p>
                          {board.description && (
                            <p className="text-slate-400 text-sm truncate max-w-[200px]">
                              {board.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white">{board.owner_name}</p>
                        <p className="text-slate-400 text-sm">{board.owner_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getTierStyle(
                          board.tier
                        )}`}
                      >
                        {board.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white flex items-center gap-1">
                        <Users className="h-4 w-4 text-slate-400" />
                        {board.member_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white flex items-center gap-1">
                        <ListTodo className="h-4 w-4 text-slate-400" />
                        {board.task_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(board.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">
              총 {boards.total.toLocaleString()}개
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 bg-bridge-obsidian border border-white/20 rounded-lg
                  text-slate-400 hover:text-white hover:bg-white/5
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
                className="p-2 bg-bridge-obsidian border border-white/20 rounded-lg
                  text-slate-400 hover:text-white hover:bg-white/5
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
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
