import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Folder, Users, ListTodo, Calendar, Trash2, Crown, Shield, User as UserIcon, Eye, ArrowRightLeft, CalendarPlus, AlertTriangle, Armchair, ChevronDown, Link2, Copy, Check, Pencil, UserMinus, Sparkles, Plus, BookOpen, CalendarDays, Clock, Loader2 } from 'lucide-react';
import { adminService, inviteLinkService } from '../../utils/services';
import { AdminBoardDetail } from '../../utils/api';
import { formatDateTime, formatDate } from '../../utils/dateUtils';
import { ConfirmModal, PromptModal, SelectModal, Toast } from './AdminConfirmModal';
import { MotionModal } from '../ui/MotionModal';
import { IconButton } from '../ui/IconButton';

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

  const handleSetMonthlyCredits = () => {
    if (!board) return;

    setPromptAction({
      title: t('admin.boardDetail.setMonthlyCredits'),
      message: t('admin.boardDetail.enterMonthlyCreditsMessage'),
      defaultValue: String(board.monthly_ai_credits ?? 0),
      inputType: 'number',
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        const credits = parseInt(value, 10);
        if (isNaN(credits) || credits < 0) {
          setToast({ message: t('admin.boardDetail.enterValidCredits'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.adjustAiCredits(boardId, { monthly_ai_credits: credits });
          setBoard(updated);
          onUpdate();
          setToast({ message: t('admin.boardDetail.monthlyCreditsSet', { credits }), type: 'success' });
        } catch (err) {
          console.error('Failed to set monthly credits:', err);
          setToast({ message: t('admin.boardDetail.creditSetFailed'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleAddPurchasedCredits = () => {
    if (!board) return;

    setPromptAction({
      title: t('admin.boardDetail.addPurchasedCredits'),
      message: t('admin.boardDetail.enterPurchasedCreditsMessage', { credits: board.purchased_credits ?? 0 }),
      defaultValue: '100',
      inputType: 'number',
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        const credits = parseInt(value, 10);
        if (isNaN(credits) || credits < 1) {
          setToast({ message: t('admin.boardDetail.enterMinOneCredit'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.adjustAiCredits(boardId, { add_purchased_credits: credits });
          setBoard(updated);
          onUpdate();
          setToast({ message: t('admin.boardDetail.purchasedCreditsAdded', { credits }), type: 'success' });
        } catch (err) {
          console.error('Failed to add purchased credits:', err);
          setToast({ message: t('admin.boardDetail.creditAddFailed'), type: 'error' });
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
      setToast({ message: t('admin.boardDetail.inviteLinkGenerated'), type: 'success' });
    } catch (err) {
      console.error('Failed to generate invite link:', err);
      setToast({ message: t('admin.boardDetail.inviteLinkFailed'), type: 'error' });
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

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (!board) return;

    setConfirmAction({
      title: t('admin.boardDetail.removeMember'),
      message: t('admin.boardDetail.confirmRemoveMember', { name: memberName }),
      variant: 'danger',
      confirmLabel: t('admin.boardDetail.removeMember'),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.removeUserFromBoard(memberId, boardId);
          // 멤버 목록에서 제거
          setBoard({
            ...board,
            members: board.members?.filter(m => m.id !== memberId),
            member_count: board.member_count - 1,
          });
          onUpdate();
          setToast({ message: t('admin.boardDetail.removeMemberSuccess', { name: memberName }), type: 'success' });
        } catch (err) {
          console.error('Failed to remove member:', err);
          setToast({ message: t('admin.boardDetail.removeMemberFailed'), type: 'error' });
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
    <>
      <MotionModal open={true} onClose={onClose} className="sm:max-w-2xl p-0 overflow-hidden max-h-[90dvh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/[0.08]">
            <h2 className="text-xl font-bold text-foreground">{t('admin.boardDetail.title')}</h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {isLoading && (
              <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
                <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {!isLoading && !error && board && (() => {
              const isPersonal = board.board_type === 'PERSONAL';
              return (
              <div className="space-y-6">
                {/* Board Info */}
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${isPersonal ? 'bg-purple-500/20' : 'bg-bridge-accent/20'}`}>
                    {isPersonal ? <UserIcon className="h-8 w-8 text-purple-400" /> : <Folder className="h-8 w-8 text-bridge-accent" />}
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
                          className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl py-2 px-3
                            text-xl font-bold text-foreground placeholder-slate-500
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
                          className="px-3 py-2 bg-foreground/5 text-slate-400 rounded-lg text-sm
                            hover:bg-foreground/10 transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <h3 className="text-xl font-bold text-foreground">{board.name}</h3>
                        {isPersonal && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                            <UserIcon className="h-3 w-3" />
                            {t('admin.boards.typePersonal', 'Personal')}
                          </span>
                        )}
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
                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
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

                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.boardDetail.owner')}
                    </p>
                    <div>
                      <p className="text-foreground font-medium">{board.owner_name}</p>
                      <p className="text-slate-400 text-sm">{board.owner_email}</p>
                    </div>
                  </div>

                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.boardDetail.memberCount')}
                    </p>
                    <p className="text-foreground flex items-center gap-2">
                      <Users className="h-5 w-5 text-bridge-accent" />
                      {t('admin.common.countPeople', { count: board.member_count })}
                    </p>
                  </div>

                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.boardDetail.taskCount')}
                    </p>
                    <p className="text-foreground flex items-center gap-2">
                      <ListTodo className="h-5 w-5 text-bridge-secondary" />
                      {t('admin.common.countItems', { count: board.task_count })}
                    </p>
                  </div>

                  {!isPersonal && (
                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.boardDetail.seatCount')}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-foreground flex items-center gap-2">
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
                  )}

                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('admin.boardDetail.createdAt')}
                    </p>
                    <p className="text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatDateLocal(board.created_at)}
                    </p>
                  </div>

                  <div className="bg-foreground/5 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
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

                {/* Personal Board Activity */}
                {isPersonal && (
                  <div className="border-t border-foreground/10 pt-6 space-y-4">
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-purple-400" />
                      {t('admin.boardDetail.personalActivity', 'Personal Activity')}
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-foreground/5 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          {t('admin.boardDetail.taskCount')}
                        </p>
                        <p className="text-foreground text-xl font-bold flex items-center gap-2">
                          <ListTodo className="h-5 w-5 text-bridge-secondary" />
                          {board.task_count}
                        </p>
                      </div>
                      <div className="bg-foreground/5 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          {t('admin.boardDetail.diaryEntries', 'Diary Entries')}
                        </p>
                        <p className="text-foreground text-xl font-bold flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-bridge-accent" />
                          {board.diary_count ?? 0}
                        </p>
                        {board.diary_completion_rate != null && (
                          <p className="text-slate-400 text-sm mt-1">
                            {t('admin.boardDetail.completionRate', '{{rate}}% completed').replace('{{rate}}', String(board.diary_completion_rate))}
                          </p>
                        )}
                      </div>
                      <div className="bg-foreground/5 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          {t('admin.boardDetail.events', 'Events')}
                        </p>
                        <p className="text-foreground text-xl font-bold flex items-center gap-2">
                          <CalendarDays className="h-5 w-5 text-amber-400" />
                          {board.personal_event_count ?? 0}
                        </p>
                      </div>
                      <div className="bg-foreground/5 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          {t('admin.boardDetail.lastActivity', 'Last Activity')}
                        </p>
                        <p className="text-foreground text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-400" />
                          {board.last_activity_at ? formatDateLocal(board.last_activity_at) : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Members List */}
                {!isPersonal && board.members && board.members.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold text-foreground mb-4">{t('admin.boardDetail.memberList')}</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {board.members.map((member) => (
                        <div
                          key={member.id}
                          className="bg-foreground/5 rounded-xl p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            {getRoleIcon(member.role)}
                            <div>
                              <p className="text-foreground font-medium">{member.name}</p>
                              <p className="text-slate-400 text-sm">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.role === 'OWNER' ? (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                                OWNER
                              </span>
                            ) : (
                              <>
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
                                <IconButton
                                  onClick={() => handleRemoveMember(member.id, member.name)}
                                  disabled={isUpdating}
                                  aria-label={t('admin.boardDetail.removeMember')}
                                  className="hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  <UserMinus />
                                </IconButton>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Credits */}
                <div className="border-t border-foreground/10 pt-6 space-y-4">
                  <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-bridge-accent" />
                    {t('admin.boardDetail.aiCredits')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Monthly Credits */}
                    <div className="bg-foreground/5 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {t('admin.boardDetail.monthlyCredits')}
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-medium">
                            {board.monthly_credits_used ?? 0} / {board.monthly_ai_credits ?? 0}
                          </span>
                          <button
                            onClick={handleSetMonthlyCredits}
                            disabled={isUpdating}
                            className="text-xs text-bridge-accent hover:text-bridge-accent/80 disabled:opacity-50 transition-colors"
                          >
                            {t('admin.boardDetail.configure')}
                          </button>
                        </div>
                        <div className="w-full bg-foreground/10 rounded-full h-2">
                          <div
                            className="bg-bridge-accent rounded-full h-2 transition-all"
                            style={{
                              width: `${board.monthly_ai_credits ? Math.min(100, ((board.monthly_credits_used ?? 0) / board.monthly_ai_credits) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Purchased Credits */}
                    <div className="bg-foreground/5 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {t('admin.boardDetail.purchasedCredits')}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-foreground font-medium">
                          {board.purchased_credits ?? 0}
                        </span>
                        <button
                          onClick={handleAddPurchasedCredits}
                          disabled={isUpdating}
                          className="flex items-center gap-1 text-xs text-bridge-secondary hover:text-bridge-secondary/80 disabled:opacity-50 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          {t('admin.boardDetail.add')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reset Date */}
                  {board.credits_reset_date && (
                    <p className="text-xs text-slate-500">
                      {t('admin.boardDetail.nextReset')} {formatDateTime(board.credits_reset_date)}
                    </p>
                  )}
                </div>

                {/* Admin Actions */}
                <div className="border-t border-foreground/10 pt-6 space-y-4">
                  <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    {t('admin.common.adminActions')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 소유권 이전 (Personal Board에서는 숨김) */}
                    {!isPersonal && (
                    <button
                      onClick={handleTransferOwnership}
                      disabled={isUpdating || !board.members || board.members.length <= 1}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                      title={!board.members || board.members.length <= 1 ? t('admin.boardDetail.noEligibleMembers') : undefined}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      {t('admin.boardDetail.transferOwnership')}
                    </button>
                    )}

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

                {/* Invite Link Generator (Personal Board에서는 숨김) */}
                {!isPersonal && (
                <div className="border-t border-foreground/10 pt-6 space-y-4">
                  <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-bridge-accent" />
                    {t('admin.boardDetail.generateInviteUrl')}
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <select
                        id="invite-role-select"
                        defaultValue="MEMBER"
                        className="bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
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
                        {isGeneratingInvite ? t('admin.boardDetail.generating') : t('admin.boardDetail.generateLink7Days')}
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
                            className="flex items-center gap-2 bg-foreground/5 rounded-lg p-3"
                          >
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0 w-28">
                              {label}
                            </span>
                            <code className="flex-1 text-sm text-slate-300 truncate">
                              https://{domain}/invite/{inviteCode}
                            </code>
                            <button
                              onClick={() => handleCopyInviteUrl(domain)}
                              className="shrink-0 p-1.5 rounded-md hover:bg-foreground/10 transition-colors"
                              title={t('admin.boardDetail.copy')}
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
                )}

                {/* Danger Zone */}
                <div className="border-t border-foreground/[0.08] pt-6">
                  <h4 className="text-lg font-bold text-red-400 mb-4">{t('admin.boardDetail.dangerZone')}</h4>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground font-medium">{t('admin.boardDetail.deleteBoard')}</p>
                        <p className="text-slate-400 text-sm">
                          {t('admin.boardDetail.softDeleteWarning', 'The board will be soft-deleted. It can be restored within 7 days.')}
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
              );
            })()}
          </div>
      </MotionModal>

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
    </>
  );
}
