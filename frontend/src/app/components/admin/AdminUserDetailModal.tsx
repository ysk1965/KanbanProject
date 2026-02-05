import { useState, useEffect } from 'react';
import { X, User as UserIcon, Mail, Shield, Calendar, Folder, CheckCircle, XCircle } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminUserDetail, AdminBoardSummary } from '../../utils/api';

interface AdminUserDetailModalProps {
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function AdminUserDetailModal({ userId, onClose, onUpdate }: AdminUserDetailModalProps) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [boards, setBoards] = useState<AdminBoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadUserDetail();
  }, [userId]);

  const loadUserDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [userData, boardsData] = await Promise.all([
        adminService.getUser(userId),
        adminService.getUserBoards(userId),
      ]);
      setUser(userData);
      setBoards(boardsData);
    } catch (err) {
      console.error('Failed to load user detail:', err);
      setError('사용자 정보를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (newRole: 'USER' | 'TESTER' | 'ADMIN') => {
    if (!user || user.system_role === newRole) return;

    let confirmMessage = '';
    if (newRole === 'ADMIN') {
      confirmMessage = `${user.name}님에게 관리자 권한을 부여하시겠습니까?`;
    } else if (newRole === 'TESTER') {
      confirmMessage = `${user.name}님을 테스터로 설정하시겠습니까? (과금 UI 숨김)`;
    } else {
      confirmMessage = `${user.name}님을 일반 사용자로 변경하시겠습니까?`;
    }

    if (!confirm(confirmMessage)) return;

    try {
      setIsUpdating(true);
      await adminService.updateUser(userId, { system_role: newRole });
      setUser({ ...user, system_role: newRole });
      onUpdate();
    } catch (err) {
      console.error('Failed to update user role:', err);
      alert('역할 변경에 실패했습니다');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bridge-obsidian rounded-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/15">
          <h2 className="text-xl font-bold text-white">사용자 상세</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {!isLoading && !error && user && (
            <div className="space-y-6">
              {/* User Info */}
              <div className="flex items-start gap-4">
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt={user.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                    <UserIcon className="h-8 w-8 text-bridge-accent" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{user.name}</h3>
                  <p className="text-slate-400 flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4" />
                    {user.email}
                    {user.email_verified ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                  </p>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    역할
                  </p>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-bridge-accent" />
                    <select
                      value={user.system_role}
                      onChange={(e) => handleRoleChange(e.target.value as 'USER' | 'TESTER' | 'ADMIN')}
                      disabled={isUpdating}
                      className="bg-transparent text-white font-medium focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      <option value="USER" className="bg-bridge-dark">USER</option>
                      <option value="TESTER" className="bg-bridge-dark">TESTER</option>
                      <option value="ADMIN" className="bg-bridge-dark">ADMIN</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    가입 방식
                  </p>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      user.provider === 'google'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    {user.provider === 'google' ? 'Google' : 'Email'}
                  </span>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    가입일
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(user.created_at)}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    마지막 로그인
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(user.last_login_at)}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    소유 보드
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Folder className="h-4 w-4 text-bridge-accent" />
                    {user.owned_board_count}개
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    참여 보드
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Folder className="h-4 w-4 text-bridge-secondary" />
                    {user.member_board_count}개
                  </p>
                </div>
              </div>

              {/* Boards List */}
              {boards.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-white mb-4">보드 목록</h4>
                  <div className="space-y-2">
                    {boards.map((board) => (
                      <div
                        key={board.id}
                        className="bg-white/5 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-white font-medium">{board.name}</p>
                          <p className="text-slate-400 text-sm">
                            멤버 {board.member_count}명 / 태스크 {board.task_count}개
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            board.tier === 'FREE'
                              ? 'bg-slate-500/20 text-slate-400'
                              : board.tier === 'STANDARD'
                              ? 'bg-blue-500/20 text-blue-400'
                              : board.tier === 'PREMIUM'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {board.tier}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
