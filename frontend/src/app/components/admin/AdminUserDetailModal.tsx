import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User as UserIcon, Mail, Shield, Calendar, Folder, CheckCircle, XCircle, Key, Image, Clock, Ban, UserCheck, KeyRound, MailCheck, AlertTriangle, Trash2, UserMinus } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminUserDetail, AdminBoardSummary } from '../../utils/api';
import { formatDateTime } from '../../utils/dateUtils';
import { ConfirmModal, PromptModal, Toast } from './AdminConfirmModal';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

interface AdminUserDetailModalProps {
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function AdminUserDetailModal({ userId, onClose, onUpdate }: AdminUserDetailModalProps) {
  const { t } = useTranslation();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [boards, setBoards] = useState<AdminBoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; variant?: 'default' | 'danger'; onConfirm: () => void } | null>(null);
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; placeholder?: string; onConfirm: (value: string) => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
      setError(t('admin.userDetail.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = (newRole: 'USER' | 'TESTER' | 'ADMIN') => {
    if (!user || user.system_role === newRole) return;

    let confirmMessage = '';
    if (newRole === 'ADMIN') {
      confirmMessage = t('admin.userDetail.confirmAdminRole', { name: user.name });
    } else if (newRole === 'TESTER') {
      confirmMessage = t('admin.userDetail.confirmTesterRole', { name: user.name });
    } else {
      confirmMessage = t('admin.userDetail.confirmUserRole', { name: user.name });
    }

    setConfirmAction({
      title: t('admin.userDetail.changeRole'),
      message: confirmMessage,
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.updateUser(userId, { system_role: newRole });
          setUser({ ...user, system_role: newRole });
          onUpdate();
        } catch (err) {
          console.error('Failed to update user role:', err);
          setToast({ message: t('admin.userDetail.roleChangeFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const formatDateLocal = (dateString: string | null | undefined) => {
    return formatDateTime(dateString);
  };

  const handleDeactivate = () => {
    if (!user) return;
    setPromptAction({
      title: t('admin.userDetail.deactivateAccount'),
      message: t('admin.userDetail.enterDeactivateReason'),
      placeholder: t('admin.userDetail.deactivateReasonPlaceholder'),
      onConfirm: async (reason: string) => {
        setPromptAction(null);
        try {
          setIsUpdating(true);
          const updated = await adminService.deactivateUser(userId, reason || undefined);
          setUser({ ...user, is_active: updated.is_active, deactivated_at: updated.deactivated_at, deactivated_reason: updated.deactivated_reason });
          onUpdate();
          setToast({ message: t('admin.userDetail.deactivated'), type: 'success' });
        } catch (err) {
          console.error('Failed to deactivate user:', err);
          setToast({ message: t('admin.userDetail.deactivateFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleActivate = () => {
    if (!user) return;
    setConfirmAction({
      title: t('admin.userDetail.activateAccount'),
      message: t('admin.userDetail.confirmActivate', { name: user.name }),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          const updated = await adminService.activateUser(userId);
          setUser({ ...user, is_active: updated.is_active, deactivated_at: null, deactivated_reason: null });
          onUpdate();
          setToast({ message: t('admin.userDetail.activated'), type: 'success' });
        } catch (err) {
          console.error('Failed to activate user:', err);
          setToast({ message: t('admin.userDetail.activateFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleVerifyEmail = () => {
    if (!user) return;
    setConfirmAction({
      title: t('admin.userDetail.forceVerifyEmail'),
      message: t('admin.userDetail.confirmVerifyEmail', { name: user.name }),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.verifyUserEmail(userId);
          setUser({ ...user, email_verified: true });
          onUpdate();
          setToast({ message: t('admin.userDetail.emailVerified'), type: 'success' });
        } catch (err) {
          console.error('Failed to verify email:', err);
          setToast({ message: t('admin.userDetail.emailVerifyFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleSendPasswordReset = () => {
    if (!user) return;
    setConfirmAction({
      title: t('admin.userDetail.passwordResetEmail'),
      message: t('admin.userDetail.confirmPasswordReset', { email: user.email }),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.sendPasswordResetEmail(userId);
          setToast({ message: t('admin.userDetail.passwordResetSent'), type: 'success' });
        } catch (err) {
          console.error('Failed to send password reset email:', err);
          setToast({ message: t('admin.userDetail.passwordResetFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleDeleteUser = () => {
    if (!user) return;
    setConfirmAction({
      title: t('admin.userDetail.deleteAccount'),
      message: t('admin.userDetail.confirmDelete', { name: user.name }),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.deleteUser(userId);
          onUpdate();
          onClose();
          setToast({ message: t('admin.userDetail.deleted'), type: 'success' });
        } catch (err) {
          console.error('Failed to delete user:', err);
          setToast({ message: t('admin.userDetail.deleteFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleRemoveFromBoard = (board: AdminBoardSummary) => {
    if (!user) return;
    setConfirmAction({
      title: t('admin.userDetail.removeFromBoard'),
      message: t('admin.userDetail.confirmRemoveFromBoard', { name: user.name, board: board.name }),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.removeUserFromBoard(userId, board.id);
          setBoards(boards.filter(b => b.id !== board.id));
          onUpdate();
          setToast({ message: t('admin.userDetail.removedFromBoard'), type: 'success' });
        } catch (err) {
          console.error('Failed to remove from board:', err);
          setToast({ message: t('admin.userDetail.removeFromBoardFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="bg-bridge-obsidian text-foreground border-white/20 max-w-2xl p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl max-h-[90vh] flex flex-col">
          <DialogTitle className="sr-only">{t('admin.userDetail.title')}</DialogTitle>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/15">
            <h2 className="text-xl font-bold text-white">{t('admin.userDetail.title')}</h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
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
                          {t('admin.userDetail.deactivatedBadge')}
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
                        {t('admin.userDetail.reason')}: {user.deactivated_reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.userDetail.role')}
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
                      {t('admin.userDetail.provider')}
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
                      {t('admin.userDetail.joinedAt')}
                    </p>
                    <p className="text-white flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatDateLocal(user.created_at)}
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.userDetail.lastLogin')}
                    </p>
                    <p className="text-white flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatDateLocal(user.last_login_at)}
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.userDetail.ownedBoards')}
                    </p>
                    <p className="text-white flex items-center gap-2">
                      <Folder className="h-4 w-4 text-bridge-accent" />
                      {t('admin.common.countItems', { count: user.owned_board_count })}
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.userDetail.memberBoards')}
                    </p>
                    <p className="text-white flex items-center gap-2">
                      <Folder className="h-4 w-4 text-bridge-secondary" />
                      {t('admin.common.countItems', { count: user.member_board_count })}
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
                      {t('admin.userDetail.googleAccountInfo')}
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
                          {t('admin.userDetail.profileImageUrl')}
                        </p>
                        <p className="text-white text-sm flex items-center gap-2 truncate" title={user.profile_image || '-'}>
                          <Image className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                          <span className="truncate">{user.profile_image ? t('admin.userDetail.googleProfileUsed') : '-'}</span>
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          {t('admin.userDetail.emailVerifiedAt')}
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
                    <h4 className="text-lg font-bold text-white mb-4">{t('admin.userDetail.boardList')}</h4>
                    <div className="space-y-2">
                      {boards.map((board) => {
                        const isOwner = board.owner_id === user.id;
                        return (
                          <div
                            key={board.id}
                            className="bg-white/5 rounded-xl p-4 flex items-center justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium">{board.name}</p>
                              <p className="text-slate-400 text-sm">
                                {t('admin.userDetail.boardMemberTaskInfo', { members: board.member_count, tasks: board.task_count })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
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
                              <button
                                onClick={() => handleRemoveFromBoard(board)}
                                disabled={isUpdating || isOwner}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isOwner ? t('admin.userDetail.cannotRemoveOwner') : t('admin.userDetail.removeFromBoard')}
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Admin Actions */}
                <div className="border-t border-white/10 pt-6 space-y-4">
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    {t('admin.common.adminActions')}
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
                        {t('admin.userDetail.forceVerifyEmail')}
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
                        {t('admin.userDetail.passwordResetEmail')}
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
                        {t('admin.userDetail.activateAccount')}
                      </button>
                    ) : (
                      <button
                        onClick={handleDeactivate}
                        disabled={isUpdating || user.system_role === 'ADMIN'}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title={user.system_role === 'ADMIN' ? t('admin.userDetail.cannotDeactivateAdmin') : undefined}
                      >
                        <Ban className="h-4 w-4" />
                        {t('admin.userDetail.deactivateAccount')}
                      </button>
                    )}
                  </div>

                  {/* 계정 영구 삭제 (비활성화된 사용자만) */}
                  {user.is_active === false && (
                    <button
                      onClick={handleDeleteUser}
                      disabled={isUpdating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-900/30 border border-red-500/50 rounded-xl text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-50 font-bold"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('admin.userDetail.deleteAccount')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          variant={confirmAction.variant}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {promptAction && (
        <PromptModal
          isOpen={true}
          title={promptAction.title}
          message={promptAction.message}
          placeholder={promptAction.placeholder}
          onConfirm={promptAction.onConfirm}
          onCancel={() => setPromptAction(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={!!toast}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
