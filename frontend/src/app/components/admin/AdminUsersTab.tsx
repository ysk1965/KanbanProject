import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, Shield, User as UserIcon, Mail, Calendar } from 'lucide-react';
import { adminService } from '../../utils/services';
import { UserListResponse } from '../../utils/api';
import { AdminUserDetailModal } from './AdminUserDetailModal';

export function AdminUsersTab() {
  const [users, setUsers] = useState<UserListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getUsers({ page, size: 20, search: search || undefined });
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('사용자 목록을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadUsers();
  };

  const handleUserUpdate = () => {
    loadUsers();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">사용자 관리</h2>
          <p className="text-slate-400">시스템 사용자를 관리합니다</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 이메일로 검색..."
            className="w-full bg-bridge-obsidian border border-white/10 rounded-xl py-3 pl-12 pr-4
              text-white placeholder-slate-600
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

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadUsers}
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

      {/* Users Table */}
      {!isLoading && !error && users && (
        <>
          <div className="bg-bridge-obsidian rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    사용자
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    역할
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    가입방식
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    보드
                  </th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    가입일
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.profile_image ? (
                          <img
                            src={user.profile_image}
                            alt={user.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                            <UserIcon className="h-5 w-5 text-bridge-accent" />
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{user.name}</p>
                          <p className="text-slate-400 text-sm flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          user.system_role === 'ADMIN'
                            ? 'bg-amber-500/20 text-amber-400'
                            : user.system_role === 'TESTER'
                              ? 'bg-teal-500/20 text-teal-400'
                              : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        <Shield className="h-3 w-3" />
                        {user.system_role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          user.provider === 'google'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {user.provider === 'google' ? 'Google' : 'Email'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white">{user.board_count}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(user.created_at)}
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
              총 {users.total.toLocaleString()}명
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 bg-bridge-obsidian border border-white/10 rounded-lg
                  text-slate-400 hover:text-white hover:bg-white/5
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-slate-400 px-4">
                {page + 1} / {Math.ceil(users.total / users.size) || 1}
              </span>
              <button
                onClick={() => setPage(Math.min(Math.ceil(users.total / users.size) - 1, page + 1))}
                disabled={page >= Math.ceil(users.total / users.size) - 1}
                className="p-2 bg-bridge-obsidian border border-white/10 rounded-lg
                  text-slate-400 hover:text-white hover:bg-white/5
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* User Detail Modal */}
      {selectedUserId && (
        <AdminUserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUpdate={handleUserUpdate}
        />
      )}
    </div>
  );
}
