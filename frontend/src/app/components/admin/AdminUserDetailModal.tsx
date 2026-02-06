import { useState, useEffect } from 'react';
import { X, User as UserIcon, Mail, Shield, Calendar, Folder, CheckCircle, XCircle, Key, Image, Clock, Ban, UserCheck, KeyRound, MailCheck, AlertTriangle } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminUserDetail, AdminBoardSummary } from '../../utils/api';
import { formatDateTime } from '../../utils/dateUtils';

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

  const formatDateLocal = (dateString: string | null | undefined) => {
    return formatDateTime(dateString);
  };

  const handleDeactivate = async () => {
    if (!user) return;
    const reason = prompt('비활성화 사유를 입력하세요 (선택사항):');
    if (reason === null) return; // 취소

    if (!confirm(`${user.name}님의 계정을 비활성화하시겠습니까?\n비활성화된 계정은 로그인할 수 없습니다.`)) return;

    try {
      setIsUpdating(true);
      const updated = await adminService.deactivateUser(userId, reason || undefined);
      setUser({ ...user, is_active: updated.is_active, deactivated_at: updated.deactivated_at, deactivated_reason: updated.deactivated_reason });
      onUpdate();
      alert('계정이 비활성화되었습니다.');
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      alert('계정 비활성화에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleActivate = async () => {
    if (!user) return;
    if (!confirm(`${user.name}님의 계정을 다시 활성화하시겠습니까?`)) return;

    try {
      setIsUpdating(true);
      const updated = await adminService.activateUser(userId);
      setUser({ ...user, is_active: updated.is_active, deactivated_at: null, deactivated_reason: null });
      onUpdate();
      alert('계정이 활성화되었습니다.');
    } catch (err) {
      console.error('Failed to activate user:', err);
      alert('계정 활성화에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!user) return;
    if (!confirm(`${user.name}님의 이메일을 강제로 인증 처리하시겠습니까?`)) return;

    try {
      setIsUpdating(true);
      await adminService.verifyUserEmail(userId);
      setUser({ ...user, email_verified: true });
      onUpdate();
      alert('이메일이 인증 처리되었습니다.');
    } catch (err) {
      console.error('Failed to verify email:', err);
      alert('이메일 인증 처리에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user) return;
    if (!confirm(`${user.email}로 비밀번호 재설정 메일을 발송하시겠습니까?`)) return;

    try {
      setIsUpdating(true);
      await adminService.sendPasswordResetEmail(userId);
      alert('비밀번호 재설정 메일이 발송되었습니다.');
    } catch (err) {
      console.error('Failed to send password reset email:', err);
      alert('메일 발송에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">{user.name}</h3>
                    {user.is_active === false && (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full flex items-center gap-1">
                        <Ban className="h-3 w-3" />
                        비활성화
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4" />
                    {user.email}
                    {user.email_verified ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                  </p>
                  {user.is_active === false && user.deactivated_reason && (
                    <p className="text-red-400/80 text-sm mt-1">
                      사유: {user.deactivated_reason}
                    </p>
                  )}
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
                    {formatDateLocal(user.created_at)}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    마지막 로그인
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDateLocal(user.last_login_at)}
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

              {/* OAuth Provider Info */}
              {user.provider === 'google' && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google 계정 정보
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Google ID
                      </p>
                      <p className="text-white text-sm font-mono flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 text-blue-400" />
                        {user.auth_provider_id || '-'}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        프로필 이미지 URL
                      </p>
                      <p className="text-white text-sm flex items-center gap-2 truncate" title={user.profile_image || '-'}>
                        <Image className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                        <span className="truncate">{user.profile_image ? 'Google 프로필 사용' : '-'}</span>
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        이메일 인증일
                      </p>
                      <p className="text-white text-sm flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-blue-400" />
                        {user.email_verified_at ? formatDateLocal(user.email_verified_at) : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                            board.tier === 'FREE' || board.tier === 'TRIAL'
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

              {/* Admin Actions */}
              <div className="border-t border-white/10 pt-6 space-y-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  관리자 작업
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 이메일 인증 */}
                  {!user.email_verified && (
                    <button
                      onClick={handleVerifyEmail}
                      disabled={isUpdating}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      <MailCheck className="h-4 w-4" />
                      이메일 강제 인증
                    </button>
                  )}

                  {/* 비밀번호 리셋 (Google 계정 제외) */}
                  {user.provider !== 'google' && (
                    <button
                      onClick={handleSendPasswordReset}
                      disabled={isUpdating}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                      비밀번호 리셋 메일
                    </button>
                  )}

                  {/* 계정 활성화/비활성화 */}
                  {user.is_active === false ? (
                    <button
                      onClick={handleActivate}
                      disabled={isUpdating}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-400 hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                    >
                      <UserCheck className="h-4 w-4" />
                      계정 활성화
                    </button>
                  ) : (
                    <button
                      onClick={handleDeactivate}
                      disabled={isUpdating || user.system_role === 'ADMIN'}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title={user.system_role === 'ADMIN' ? '관리자 계정은 비활성화할 수 없습니다' : undefined}
                    >
                      <Ban className="h-4 w-4" />
                      계정 비활성화
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
