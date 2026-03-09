import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Building2, Users, Folder, Calendar, Crown, Shield, User as UserIcon, Trash2, ArrowRightLeft, CalendarPlus, AlertTriangle, Pencil, Loader2 } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminOrgDetail } from '../../utils/api';
import { formatDateTime, formatDate } from '../../utils/dateUtils';
import { ConfirmModal, PromptModal, SelectModal, Toast } from './AdminConfirmModal';
import { MotionModal } from '../ui/MotionModal';

interface AdminOrgDetailModalProps {
  orgId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function AdminOrgDetailModal({ orgId, onClose, onUpdate }: AdminOrgDetailModalProps) {
  const { t } = useTranslation();
  const [org, setOrg] = useState<AdminOrgDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; variant?: 'default' | 'danger'; confirmLabel?: string; onConfirm: () => void } | null>(null);
  const [promptAction, setPromptAction] = useState<{ title: string; message: string; placeholder?: string; defaultValue?: string; inputType?: 'text' | 'number'; required?: boolean; onConfirm: (value: string) => void } | null>(null);
  const [selectAction, setSelectAction] = useState<{ title: string; message: string; options: { id: string; label: string; description?: string }[]; onConfirm: (id: string) => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'boards'>('info');

  useEffect(() => {
    loadOrgDetail();
  }, [orgId]);

  const loadOrgDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getOrganization(orgId);
      setOrg(data);
    } catch (err) {
      console.error('Failed to load organization detail:', err);
      setError(t('admin.organizations.loadFailed', 'Failed to load organization'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditName = () => {
    if (!org) return;
    setPromptAction({
      title: t('admin.organizations.actions.edit'),
      message: t('admin.organizations.editNameMessage', 'Enter new organization name'),
      defaultValue: org.name,
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        try {
          setIsUpdating(true);
          const updated = await adminService.updateOrganization(orgId, { name: value });
          setOrg(updated);
          onUpdate();
          setToast({ message: t('admin.organizations.updateSuccess', 'Organization updated'), type: 'success' });
        } catch (err) {
          console.error('Failed to update organization:', err);
          setToast({ message: t('admin.organizations.updateFailed', 'Failed to update'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleDelete = () => {
    if (!org) return;
    setConfirmAction({
      title: t('admin.organizations.actions.delete'),
      message: t('admin.organizations.confirm.delete'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.deleteOrganization(orgId);
          onUpdate();
          onClose();
        } catch (err) {
          console.error('Failed to delete organization:', err);
          setToast({ message: t('admin.organizations.deleteFailed', 'Failed to delete'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handlePermanentDelete = () => {
    if (!org) return;
    setConfirmAction({
      title: t('admin.organizations.actions.permanentDelete'),
      message: t('admin.organizations.confirm.permanentDelete'),
      variant: 'danger',
      confirmLabel: t('admin.organizations.actions.permanentDelete'),
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          setIsUpdating(true);
          await adminService.permanentlyDeleteOrganization(orgId);
          onUpdate();
          onClose();
        } catch (err) {
          console.error('Failed to permanently delete organization:', err);
          setToast({ message: t('admin.organizations.permanentDeleteFailed', 'Failed to delete'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleTransferOwnership = () => {
    if (!org) return;
    const eligibleMembers = org.members?.filter(m => m.role !== 'OWNER') || [];
    if (eligibleMembers.length === 0) {
      setToast({ message: t('admin.organizations.noEligibleMembers', 'No eligible members'), type: 'error' });
      return;
    }
    setSelectAction({
      title: t('admin.organizations.actions.transferOwnership'),
      message: t('admin.organizations.confirm.transferOwnership'),
      options: eligibleMembers.map(m => ({
        id: m.id,
        label: m.name,
        description: `${m.email} (${m.role})`,
      })),
      onConfirm: async (selectedId: string) => {
        setSelectAction(null);
        try {
          setIsUpdating(true);
          const updated = await adminService.transferOrgOwnership(orgId, selectedId);
          setOrg(updated);
          onUpdate();
          setToast({ message: t('admin.organizations.transferSuccess', 'Ownership transferred'), type: 'success' });
        } catch (err) {
          console.error('Failed to transfer ownership:', err);
          setToast({ message: t('admin.organizations.transferFailed', 'Failed to transfer'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleExtendTrial = () => {
    if (!org) return;
    setPromptAction({
      title: t('admin.organizations.actions.extendTrial'),
      message: t('admin.organizations.extendTrialMessage', 'Enter days to extend'),
      defaultValue: '7',
      inputType: 'number',
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        const days = parseInt(value, 10);
        if (isNaN(days) || days < 1) {
          setToast({ message: t('admin.organizations.invalidDays', 'Enter a valid number'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.extendOrgTrial(orgId, days);
          setOrg(updated);
          onUpdate();
          setToast({ message: t('admin.organizations.trialExtended', 'Trial extended'), type: 'success' });
        } catch (err) {
          console.error('Failed to extend trial:', err);
          setToast({ message: t('admin.organizations.extendFailed', 'Failed to extend trial'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleUpdateSubscription = () => {
    if (!org) return;
    setPromptAction({
      title: t('admin.organizations.actions.updateSubscription'),
      message: t('admin.organizations.updateSeatMessage', 'Enter new seat count'),
      defaultValue: String(org.seat_count ?? 0),
      inputType: 'number',
      required: true,
      onConfirm: async (value: string) => {
        setPromptAction(null);
        const seats = parseInt(value, 10);
        if (isNaN(seats) || seats < 0) {
          setToast({ message: t('admin.organizations.invalidSeats', 'Enter a valid number'), type: 'error' });
          return;
        }
        try {
          setIsUpdating(true);
          const updated = await adminService.updateOrgSubscription(orgId, { seat_count: seats });
          setOrg(updated);
          onUpdate();
          setToast({ message: t('admin.organizations.subscriptionUpdated', 'Subscription updated'), type: 'success' });
        } catch (err) {
          console.error('Failed to update subscription:', err);
          setToast({ message: t('admin.organizations.subscriptionUpdateFailed', 'Failed to update'), type: 'error' });
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Crown className="h-3.5 w-3.5 text-amber-400" />;
      case 'ADMIN': return <Shield className="h-3.5 w-3.5 text-bridge-accent" />;
      default: return <UserIcon className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  const getPlanStyle = (plan: string) => {
    switch (plan) {
      case 'FREE': return 'bg-slate-500/15 text-slate-400';
      case 'TEAM': return 'bg-bridge-accent/15 text-bridge-accent';
      default: return 'bg-slate-500/15 text-slate-400';
    }
  };

  const getStatusStyle = (status: string | null) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'TRIAL': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'SUSPENDED': return 'bg-red-500/15 text-red-600 dark:text-red-400';
      case 'CANCELED': return 'bg-slate-500/15 text-slate-400';
      case 'PAST_DUE': return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      default: return 'bg-slate-500/15 text-slate-400';
    }
  };

  return (
    <>
      <MotionModal open={true} onClose={onClose} className="sm:max-w-3xl p-0 overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Top Accent Line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{org?.name || t('admin.organizations.detail.title')}</h2>
              {org && (
                <p className="text-sm text-slate-400">{org.owner.email}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 pt-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-400">{error}</p>
            </div>
          ) : org ? (
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 border-b border-foreground/[0.08] pb-0">
                {(['info', 'members', 'boards'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab
                        ? 'border-bridge-accent text-bridge-accent'
                        : 'border-transparent text-slate-400 hover:text-foreground'
                    }`}
                  >
                    {tab === 'info' && t('admin.organizations.detail.info')}
                    {tab === 'members' && `${t('admin.organizations.detail.members')} (${org.members?.length || 0})`}
                    {tab === 'boards' && `${t('admin.organizations.detail.boards')} (${org.boards?.length || 0})`}
                  </button>
                ))}
              </div>

              {/* Info Tab */}
              {activeTab === 'info' && (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">ID</p>
                      <p className="text-sm text-foreground font-mono">{org.id}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('admin.organizations.table.owner')}</p>
                      <p className="text-sm text-foreground">{org.owner.name}</p>
                      <p className="text-xs text-slate-400">{org.owner.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('admin.organizations.table.created')}</p>
                      <p className="text-sm text-foreground">{formatDateTime(org.created_at)}</p>
                    </div>
                    {org.description && (
                      <div className="col-span-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Description</p>
                        <p className="text-sm text-foreground">{org.description}</p>
                      </div>
                    )}
                  </div>

                  {/* Subscription Info */}
                  <div className="bg-foreground/[0.03] rounded-xl p-4 border border-foreground/[0.08]">
                    <h3 className="text-sm font-bold text-foreground mb-3">{t('admin.organizations.detail.subscription')}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.plan')}</p>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${getPlanStyle(org.plan)}`}>
                          {org.plan}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.status')}</p>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusStyle(org.subscription_status)}`}>
                          {org.subscription_status || '-'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.seatCount')}</p>
                        <p className="text-sm font-bold text-foreground">{org.seat_count}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.activeMembers')}</p>
                        <p className="text-sm font-bold text-foreground">{org.active_member_count}</p>
                      </div>
                      {org.billing_cycle && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.billingCycle')}</p>
                          <p className="text-sm text-foreground">
                            {org.billing_cycle === 'MONTHLY' ? t('admin.organizations.detail.monthly') : t('admin.organizations.detail.yearly')}
                          </p>
                        </div>
                      )}
                      {org.trial_ends_at && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.trialEndsAt')}</p>
                          <p className="text-sm text-foreground">{formatDate(org.trial_ends_at)}</p>
                        </div>
                      )}
                      {org.current_period_end && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.currentPeriodEnd')}</p>
                          <p className="text-sm text-foreground">{formatDate(org.current_period_end)}</p>
                        </div>
                      )}
                      {org.price_per_seat != null && org.price_per_seat > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.pricePerSeat')}</p>
                          <p className="text-sm text-foreground">${(org.price_per_seat / 100).toLocaleString()}</p>
                        </div>
                      )}
                      {org.total_price != null && org.total_price > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">{t('admin.organizations.detail.totalPrice')}</p>
                          <p className="text-sm font-bold text-foreground">${(org.total_price / 100).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleEditName} disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" /> {t('admin.organizations.actions.edit')}
                    </button>
                    <button onClick={handleTransferOwnership} disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50">
                      <ArrowRightLeft className="h-3.5 w-3.5" /> {t('admin.organizations.actions.transferOwnership')}
                    </button>
                    <button onClick={handleUpdateSubscription} disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-bridge-accent bg-bridge-accent/10 border border-bridge-accent/20 rounded-lg hover:bg-bridge-accent/20 transition-all disabled:opacity-50">
                      <Users className="h-3.5 w-3.5" /> {t('admin.organizations.actions.updateSubscription')}
                    </button>
                    <button onClick={handleExtendTrial} disabled={isUpdating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50">
                      <CalendarPlus className="h-3.5 w-3.5" /> {t('admin.organizations.actions.extendTrial')}
                    </button>
                    {org.deleted_at ? (
                      <button onClick={handlePermanentDelete} disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50">
                        <AlertTriangle className="h-3.5 w-3.5" /> {t('admin.organizations.actions.permanentDelete')}
                      </button>
                    ) : (
                      <button onClick={handleDelete} disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" /> {t('admin.organizations.actions.delete')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Members Tab */}
              {activeTab === 'members' && (
                <div className="space-y-2">
                  {org.members && org.members.length > 0 ? (
                    org.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl border border-foreground/[0.08]"
                      >
                        <div className="flex items-center gap-3">
                          {member.profile_image ? (
                            <img src={member.profile_image} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                              <UserIcon className="h-4 w-4 text-bridge-accent" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-foreground">{member.name}</p>
                              {getRoleIcon(member.role)}
                              <span className="text-[10px] font-bold text-slate-400">{member.role}</span>
                            </div>
                            <p className="text-xs text-slate-400">{member.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {member.department_name && (
                            <p className="text-xs text-slate-400">{member.department_name}</p>
                          )}
                          {member.position_name && (
                            <p className="text-xs text-slate-500">{member.position_name}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-center py-8">{t('admin.organizations.noMembers', 'No members')}</p>
                  )}
                </div>
              )}

              {/* Boards Tab */}
              {activeTab === 'boards' && (
                <div className="space-y-2">
                  {org.boards && org.boards.length > 0 ? (
                    org.boards.map((board) => (
                      <div
                        key={board.id}
                        className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl border border-foreground/[0.08]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
                            <Folder className="h-4 w-4 text-bridge-accent" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{board.name}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{board.member_count}</span>
                              <span>·</span>
                              <span>{board.tier}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(board.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-center py-8">{t('admin.organizations.noBoards', 'No boards')}</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-[10px] text-slate-600">Esc {t('common.close', '닫기')}</span>
        </div>
      </MotionModal>

      {/* Confirm/Prompt/Select Modals */}
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
