import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Folder, Users, ListTodo, Calendar, Trash2, Crown, Shield, User as UserIcon, Eye, ArrowRightLeft, CalendarPlus, AlertTriangle, Armchair, ChevronDown, Link2, Copy, Check, Pencil } from 'lucide-react';
import { adminService, inviteLinkService } from '../../utils/services';
import { AdminBoardDetail } from '../../utils/api';
import { formatDateTime, formatDate } from '../../utils/dateUtils';
import { ConfirmModal, PromptModal, SelectModal, Toast } from './AdminConfirmModal';

interface AdminBoardDetailModalProps {
  boardId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const TIER_OPTIONS = ['FREE', 'TRIAL', 'STANDARD', 'PREMIUM', 'ENTERPRISE'] as const;

export function AdminBoardDetailModal({ boardId, onClose, onUpdate }: AdminBoardDetailModalProps) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<AdminBoardDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; variant?: 'default' | 'danger'; confirmLabel?: string; onConfirm: () => void } | null>(null);
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; placeholder?: string; defaultValue?: string; inputType?: 'text' | 'number'; required?: boolean; onConfirm: (value: string) => void } | null>(null);
  const [selectAction, setSelectAction] = useState<{ title: string; message: string; options: { id: string; label: string; description?: string }[]; onConfirm: (id: string) => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    loadBoardDetail();
  }, [boardId]);

  const loadBoardDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getBoard(boardId);
      setBoard(data);
    } catch (err) {
      console.error('Failed to load board detail:', err);
      setError(t('admin.boardDetail.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTierChange = (newTier: typeof TIER_OPTIONS[number]) => {
    if (!board || board.tier === newTier) return;

    setConfirmAction({
      title: t('admin.boardDetail.changeTier'),
      message: t('admin.boardDetail.confirmTierChange', { tier: newTier }),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.updateBoardTier(boardId, newTier);
          setBoard({ ...board, tier: newTier });
          onUpdate();
        } catch (err) {
          console.error('Failed to update board tier:', err);
          setToast({ message: t('admin.boardDetail.tierChangeFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleDelete = () => {
    if (!board) return;

    setPromptAction({
      title: t('admin.boardDetail.deleteBoard'),
      message: t('admin.boardDetail.confirmDelete', { name: board.name }),
      placeholder: board.name,
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        if (value !== board.name) {
          setToast({ message: t('admin.boardDetail.nameNotMatch'), type: 'error' });
          return;
        }
        try {
          setIsDeleting(true);
          await adminService.deleteBoard(boardId);
          onUpdate();
          onClose();
        } catch (err) {
          console.error('Failed to delete board:', err);
          setToast({ message: t('admin.boardDetail.deleteFailed'), type: 'error' });
        } finally {
          setIsDeleting(false);
        }
      },
    });
  };

  const handleTransferOwnership = () => {
    if (!board) return;

    const eligibleMembers = board.members?.filter(m => m.role !== 'OWNER') || [];
    if (eligibleMembers.length === 0) {
      setToast({ message: t('admin.boardDetail.noEligibleMembers'), type: 'error' });
      return;
    }

    setSelectAction({
      title: t('admin.boardDetail.transferOwnership'),
      message: t('admin.boardDetail.selectMemberForTransfer'),
      options: eligibleMembers.map(m => ({
        id: m.id,
        label: m.name,
        description: `${m.email} (${m.role})`,
      })),
      onConfirm: async (selectedId: string) => {
        setSelectAction(null);
        const newOwner = eligibleMembers.find(m => m.id === selectedId);
        if (!newOwner) return;

        try {
          setIsUpdating(true);
          const updated = await adminService.transferBoardOwnership(boardId, newOwner.id);
          setBoard(updated);
          onUpdate();
          setToast({ message: t('admin.boardDetail.transferSuccess'), type: 'success' });
        } catch (err) {
          console.error('Failed to transfer ownership:', err);
          setToast({ message: t('admin.boardDetail.transferFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleUpdateSeatCount = () => {
    if (!board) return;

    setPromptAction({
      title: t('admin.boardDetail.updateSeatCount'),
      message: t('admin.boardDetail.enterSeatCount'),
      defaultValue: String(board.seat_count ?? 1),
      inputType: 'number',
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        const seatCount = parseInt(value, 10);
        if (isNaN(seatCount) || seatCount < 1) {
          setToast({ message: t('admin.boardDetail.enterValidSeatCount'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.updateSeatCount(boardId, seatCount);
          setBoard(updated);
          onUpdate();
          setToast({ message: t('admin.boardDetail.seatCountUpdateSuccess', { count: seatCount }), type: 'success' });
        } catch (err) {
          console.error('Failed to update seat count:', err);
          setToast({ message: t('admin.boardDetail.seatCountUpdateFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleStartEditName = () => {
    if (!board) return;
    setEditingName(board.name);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!board || !editingName.trim() || editingName.trim() === board.name) {
      setIsEditingName(false);
      return;
    }
    try {
      setIsUpdating(true);
      const updated = await adminService.updateBoardName(boardId, editingName.trim());
      setBoard(updated);
      onUpdate();
      setToast({ message: t('admin.boardDetail.nameUpdateSuccess'), type: 'success' });
    } catch (err) {
      console.error('Failed to update board name:', err);
      setToast({ message: t('admin.boardDetail.nameUpdateFailed'), type: 'error' });
    } finally {
      setIsUpdating(false);
      setIsEditingName(false);
    }
  };

  const handleExtendTrial = () => {
    if (!board) return;

    setPromptAction({
      title: t('admin.boardDetail.extendTrial'),
      message: t('admin.boardDetail.enterExtendDays'),
      defaultValue: '7',
      inputType: 'number',
      required: true,
      onConfirm: async (daysStr: string) => {
        setPromptAction(null);
        const days = parseInt(daysStr, 10);
        if (isNaN(days) || days < 1) {
          setToast({ message: t('admin.boardDetail.enterValidDays'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.extendTrial(boardId, days);
          setBoard({ ...board, tier: updated.tier, trial_ends_at: updated.trial_ends_at });
          onUpdate();
          setToast({ message: t('admin.boardDetail.extendSuccess', { days }), type: 'success' });
        } catch (err) {
          console.error('Failed to extend trial:', err);
          setToast({ message: t('admin.boardDetail.extendFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleGenerateInviteLink = async (role: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    if (!board) return;
    try {
      setIsGeneratingInvite(true);
      const link = await inviteLinkService.createInviteLink(boardId, {
        role,
        expires_in_hours: 168, // 7일
      });
      setInviteCode(link.code);
      setToast({ message: '초대 링크가 생성되었습니다.', type: 'success' });
    } catch (err) {
      console.error('Failed to generate invite link:', err);
      setToast({ message: '초대 링크 생성에 실패했습니다.', type: 'error' });
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCopyInviteUrl = (domain: string) => {
    if (!inviteCode) return;
    const url = `https://${domain}/invite/${inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 2000);
  };

  const formatDateLocal = (dateString: string | null | undefined) => {
    return formatDateTime(dateString);
  };

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'FREE':
      case 'TRIAL':
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

  const ROLE_OPTIONS = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

  const handleRoleChange = (memberId: string, memberName: string, newRole: 'ADMIN' | 'MEMBER' | 'VIEWER') => {
    if (!board) return;

    setConfirmAction({
      title: t('admin.boardDetail.changeRole'),
      message: t('admin.boardDetail.confirmRoleChange', { name: memberName, role: newRole }),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          const updated = await adminService.updateMemberRole(boardId, memberId, newRole);
          setBoard(updated);
          onUpdate();
          setToast({ message: t('admin.boardDetail.roleChangeSuccess', { name: memberName, role: newRole }), type: 'success' });
        } catch (err) {
          console.error('Failed to update member role:', err);
          setToast({ message: t('admin.boardDetail.roleChangeFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-amber-500/20 text-amber-400';
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-400';
      case 'MEMBER':
        return 'bg-blue-500/20 text-blue-400';
      case 'VIEWER':
        return 'bg-slate-500/20 text-slate-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <Crown className="h-4 w-4 text-amber-400" />;
      case 'ADMIN':
        return <Shield className="h-4 w-4 text-purple-400" />;
      case 'MEMBER':
        return <UserIcon className="h-4 w-4 text-blue-400" />;
      case 'VIEWER':
        return <Eye className="h-4 w-4 text-slate-400" />;
      default:
        return <UserIcon className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-bridge-obsidian rounded-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/15">
          <h2 className="text-xl font-bold text-white">{t('admin.boardDetail.title')}</h2>
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

          {!isLoading && !error && board && (
            <div className="space-y-6">
              {/* Board Info */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-bridge-accent/20 flex items-center justify-center">
                  <Folder className="h-8 w-8 text-bridge-accent" />
                </div>
                <div className="flex-1">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') setIsEditingName(false);
                        }}
                        autoFocus
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3
                          text-xl font-bold text-white placeholder-slate-600
                          focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                          transition-all"
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={isUpdating}
                        className="px-3 py-2 bg-bridge-accent text-white rounded-lg text-sm font-medium
                          hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors"
                      >
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => setIsEditingName(false)}
                        className="px-3 py-2 bg-white/5 text-slate-400 rounded-lg text-sm
                          hover:bg-white/10 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <h3 className="text-xl font-bold text-white">{board.name}</h3>
                      <button
                        onClick={handleStartEditName}
                        className="p-1 text-slate-500 hover:text-bridge-accent opacity-0 group-hover:opacity-100 transition-all"
                        title={t('admin.boardDetail.editName')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {board.description && (
                    <p className="text-slate-400 mt-1">{board.description}</p>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.tier')}
                  </p>
                  <select
                    value={board.tier}
                    onChange={(e) => handleTierChange(e.target.value as typeof TIER_OPTIONS[number])}
                    disabled={isUpdating}
                    className={`${getTierStyle(board.tier)} px-3 py-1 rounded-full text-sm font-medium
                      border-0 focus:outline-none cursor-pointer disabled:opacity-50`}
                  >
                    {TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier} className="bg-bridge-dark text-white">
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.owner')}
                  </p>
                  <div>
                    <p className="text-white font-medium">{board.owner_name}</p>
                    <p className="text-slate-400 text-sm">{board.owner_email}</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.memberCount')}
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-bridge-accent" />
                    {t('admin.common.countPeople', { count: board.member_count })}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.taskCount')}
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-bridge-secondary" />
                    {t('admin.common.countItems', { count: board.task_count })}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.seatCount')}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-white flex items-center gap-2">
                      <Armchair className="h-5 w-5 text-amber-400" />
                      {board.seat_count != null ? board.seat_count : t('admin.boardDetail.noSeatInfo')}
                    </p>
                    <button
                      onClick={handleUpdateSeatCount}
                      disabled={isUpdating}
                      className="text-xs text-bridge-accent hover:text-bridge-accent/80 disabled:opacity-50 transition-colors"
                    >
                      {t('common.edit')}
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.createdAt')}
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDateLocal(board.created_at)}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t('admin.boardDetail.subscriptionStatus')}
                  </p>
                  {board.subscription ? (
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        board.subscription.status === 'ACTIVE'
                          ? 'bg-green-500/20 text-green-400'
                          : board.subscription.status === 'CANCELLED'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {board.subscription.status}
                    </span>
                  ) : (
                    <span className="text-slate-400">{t('admin.boardDetail.noSubscription')}</span>
                  )}
                </div>
              </div>

              {/* Members List */}
              {board.members && board.members.length > 0 && (
                <div>
                  <h4 className="text-lg font-bold text-white mb-4">{t('admin.boardDetail.memberList')}</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {board.members.map((member) => (
                      <div
                        key={member.id}
                        className="bg-white/5 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {getRoleIcon(member.role)}
                          <div>
                            <p className="text-white font-medium">{member.name}</p>
                            <p className="text-slate-400 text-sm">{member.email}</p>
                          </div>
                        </div>
                        {member.role === 'OWNER' ? (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                            OWNER
                          </span>
                        ) : (
                          <div className="relative">
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, member.name, e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                              disabled={isUpdating}
                              className={`${getRoleBadgeStyle(member.role)} appearance-none pl-3 pr-7 py-1 rounded-full text-xs font-medium
                                border-0 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 cursor-pointer disabled:opacity-50 transition-colors`}
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role} className="bg-bridge-dark text-white">
                                  {role}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-60" />
                          </div>
                        )}
                      </div>
                    ))}
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
                  {/* 소유권 이전 */}
                  <button
                    onClick={handleTransferOwnership}
                    disabled={isUpdating || !board.members || board.members.length <= 1}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                    title={!board.members || board.members.length <= 1 ? t('admin.boardDetail.noEligibleMembers') : undefined}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    {t('admin.boardDetail.transferOwnership')}
                  </button>

                  {/* Trial 연장 */}
                  <button
                    onClick={handleExtendTrial}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-400 hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t('admin.boardDetail.extendTrial')}
                    {board.trial_ends_at && (
                      <span className="text-xs text-teal-400/70">
                        ({formatDateLocal(board.trial_ends_at).split(' ')[0]})
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Invite Link Generator */}
              <div className="border-t border-white/10 pt-6 space-y-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-bridge-accent" />
                  초대 URL 생성
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <select
                      id="invite-role-select"
                      defaultValue="MEMBER"
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                    >
                      <option value="VIEWER" className="bg-bridge-dark text-white">VIEWER</option>
                      <option value="MEMBER" className="bg-bridge-dark text-white">MEMBER</option>
                      <option value="ADMIN" className="bg-bridge-dark text-white">ADMIN</option>
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById('invite-role-select') as HTMLSelectElement;
                        handleGenerateInviteLink(select.value as 'ADMIN' | 'MEMBER' | 'VIEWER');
                      }}
                      disabled={isGeneratingInvite}
                      className="flex items-center gap-2 px-4 py-2 bg-bridge-accent/10 border border-bridge-accent/30 rounded-lg text-bridge-accent hover:bg-bridge-accent/20 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      <Link2 className="h-4 w-4" />
                      {isGeneratingInvite ? '생성 중...' : '링크 생성 (7일)'}
                    </button>
                  </div>

                  {inviteCode && (
                    <div className="space-y-2">
                      {[
                        { domain: 'bridgespots.com', label: 'BRIDGE SPOTS' },
                        { domain: 'milkyway.pe.kr', label: 'Milkyway' },
                      ].map(({ domain, label }) => (
                        <div
                          key={domain}
                          className="flex items-center gap-2 bg-white/5 rounded-lg p-3"
                        >
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest shrink-0 w-28">
                            {label}
                          </span>
                          <code className="flex-1 text-sm text-slate-300 truncate">
                            https://{domain}/invite/{inviteCode}
                          </code>
                          <button
                            onClick={() => handleCopyInviteUrl(domain)}
                            className="shrink-0 p-1.5 rounded-md hover:bg-white/10 transition-colors"
                            title="복사"
                          >
                            {copiedDomain === domain ? (
                              <Check className="h-4 w-4 text-green-400" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-400" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-t border-white/15 pt-6">
                <h4 className="text-lg font-bold text-red-400 mb-4">{t('admin.boardDetail.dangerZone')}</h4>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{t('admin.boardDetail.deleteBoard')}</p>
                      <p className="text-slate-400 text-sm">
                        {t('admin.boardDetail.deleteWarning')}
                      </p>
                    </div>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-medium
                        hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? t('admin.boardDetail.deleting') : t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          variant={confirmAction.variant}
          confirmLabel={confirmAction.confirmLabel}
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
          defaultValue={promptAction.defaultValue}
          inputType={promptAction.inputType}
          required={promptAction.required}
          onConfirm={promptAction.onConfirm}
          onCancel={() => setPromptAction(null)}
        />
      )}

      {selectAction && (
        <SelectModal
          isOpen={true}
          title={selectAction.title}
          message={selectAction.message}
          options={selectAction.options}
          onConfirm={selectAction.onConfirm}
          onCancel={() => setSelectAction(null)}
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
    </div>
  );
}
