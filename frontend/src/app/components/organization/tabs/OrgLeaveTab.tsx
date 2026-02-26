import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, CalendarOff, Palmtree, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { leaveService } from '../../../utils/services';
import { getTodayDateString } from '../../../utils/dateUtils';
import { MotionModal } from '../../ui/MotionModal';
import type {
  LeaveBalance, LeavePolicy, LeaveRequestResponse, LeaveRequestPageResponse,
  OrgRole, LeaveStatus, LeaveDurationType,
} from '../../../types';

interface OrgLeaveTabProps {
  orgId: string;
  myRole: OrgRole;
}

const STATUS_STYLES: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  REJECTED: 'bg-red-500/15 text-red-600 dark:text-red-400',
  CANCELED: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

const STATUS_LABEL_KEYS: Record<LeaveStatus, string> = {
  PENDING: 'organization.leave.statusPending',
  APPROVED: 'organization.leave.statusApproved',
  REJECTED: 'organization.leave.statusRejected',
  CANCELED: 'organization.leave.statusCanceled',
};

export function OrgLeaveTab({ orgId, myRole }: OrgLeaveTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState<LeaveRequestResponse[]>([]);
  const [requests, setRequests] = useState<LeaveRequestResponse[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);

  // Leave Request Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    policy_id: '',
    start_date: getTodayDateString(),
    end_date: getTodayDateString(),
    duration_type: 'FULL_DAY' as LeaveDurationType,
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [balanceData, policyData, requestData, onLeaveTodayData] = await Promise.all([
        leaveService.getMyBalance(orgId),
        leaveService.getPolicies(orgId),
        leaveService.getRequests(orgId, {
          status: statusFilter || undefined,
          page,
          size: 20,
        }),
        leaveService.getOnLeaveToday(orgId),
      ]);
      setBalances(balanceData);
      setPolicies(policyData.filter((p: LeavePolicy) => p.is_active));
      setRequests(requestData.content);
      setTotalElements(requestData.total_elements);
      setOnLeaveToday(onLeaveTodayData);
    } catch (error) {
      console.warn('Failed to fetch leave data:', error);
      toast.error(t('organization.leave.fetchError', 'Failed to load leave data'));
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmitRequest = async () => {
    if (!requestForm.policy_id || !requestForm.start_date || !requestForm.end_date) return;
    try {
      setSubmitting(true);
      await leaveService.createRequest(orgId, {
        policy_id: requestForm.policy_id,
        start_date: requestForm.start_date,
        end_date: requestForm.end_date,
        duration_type: requestForm.duration_type,
        reason: requestForm.reason || undefined,
      });
      setShowRequestModal(false);
      setRequestForm({
        policy_id: '',
        start_date: getTodayDateString(),
        end_date: getTodayDateString(),
        duration_type: 'FULL_DAY',
        reason: '',
      });
      fetchData();
      toast.success(t('organization.leave.submitSuccess', 'Leave request submitted'));
    } catch (error) {
      console.warn('Failed to submit leave request:', error);
      toast.error(t('organization.leave.submitError', 'Failed to submit leave request'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!confirm(t('organization.leave.approveConfirm', 'Approve this leave request?'))) return;
    try {
      await leaveService.approveRequest(orgId, requestId);
      fetchData();
      toast.success(t('organization.leave.approveSuccess', 'Leave request approved'));
    } catch (error) {
      console.warn('Failed to approve:', error);
      toast.error(t('organization.leave.approveError', 'Failed to approve leave request'));
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm(t('organization.leave.rejectConfirm', 'Reject this leave request?'))) return;
    try {
      await leaveService.rejectRequest(orgId, requestId);
      fetchData();
      toast.success(t('organization.leave.rejectSuccess', 'Leave request rejected'));
    } catch (error) {
      console.warn('Failed to reject:', error);
      toast.error(t('organization.leave.rejectError', 'Failed to reject leave request'));
    }
  };

  const handleCancel = async (requestId: string) => {
    if (!confirm(t('organization.leave.cancelConfirm', 'Cancel this leave request?'))) return;
    try {
      await leaveService.cancelRequest(orgId, requestId);
      fetchData();
      toast.success(t('organization.leave.cancelSuccess', 'Leave request canceled'));
    } catch (error) {
      console.warn('Failed to cancel:', error);
      toast.error(t('organization.leave.cancelError', 'Failed to cancel leave request'));
    }
  };

  const handleReopen = async (requestId: string) => {
    try {
      await leaveService.reopenRequest(orgId, requestId);
      fetchData();
    } catch (error) {
      console.warn('Failed to reopen:', error);
      toast.error(t('organization.leave.reopenError', 'Failed to reopen leave request'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* My Balance */}
      {balances.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            {t('organization.leave.myBalance', 'My Leave Balance')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {balances.map((b, index) => {
              const pct = b.total_days > 0 ? (b.remaining / b.total_days) * 100 : 0;
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.08]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground font-medium">{b.policy_name}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-bridge-secondary font-bold">{b.remaining}</span>
                      <span className="text-[10px] text-muted-foreground">/ {b.total_days}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-bridge-secondary rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* On Leave Today */}
      {onLeaveToday.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Palmtree size={14} className="text-bridge-secondary" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {t('organization.leave.onLeaveToday', "Today's Leave")}
            </h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
              {onLeaveToday.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {onLeaveToday.map((leave, index) => (
              <motion.div
                key={leave.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-center gap-2.5 px-3 py-2 bg-foreground/[0.03] rounded-xl border border-foreground/[0.08]"
              >
                <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center text-[11px] text-bridge-accent font-bold shrink-0">
                  {leave.requester?.name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <span className="text-sm text-foreground font-medium block truncate">{leave.requester?.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {leave.policy.name}
                    {leave.duration_type !== 'FULL_DAY' && (
                      <> · {leave.duration_type === 'AM_HALF' ? t('organization.leave.amHalf', 'AM') : t('organization.leave.pmHalf', 'PM')}</>
                    )}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <option value="">{t('organization.leave.allStatuses', 'All Statuses')}</option>
            <option value="PENDING">{t('organization.leave.pending', 'Pending')}</option>
            <option value="APPROVED">{t('organization.leave.approved', 'Approved')}</option>
            <option value="REJECTED">{t('organization.leave.rejected', 'Rejected')}</option>
            <option value="CANCELED">{t('organization.leave.canceled', 'Canceled')}</option>
          </select>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 transition-all"
        >
          <Plus size={16} />
          {t('organization.leave.request', 'Request Leave')}
        </button>
      </div>

      {/* Leave Requests List */}
      {requests.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
            <CalendarOff size={32} className="text-amber-500/60" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            {t('organization.leave.emptyTitle', 'No leave requests')}
          </h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">
            {t('organization.leave.emptyDesc', 'Submit a leave request to get started.')}
          </p>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
          >
            <Plus size={16} />
            {t('organization.leave.request', 'Request Leave')}
          </button>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {/* Pagination */}
          {totalElements > 20 && (
            <div className="flex items-center justify-between pb-2">
              <p className="text-muted-foreground text-xs">
                {t('organization.leave.totalRequests', '{{count}} requests', { count: totalElements })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1.5 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-muted-foreground text-xs px-2">
                  {page + 1} / {Math.ceil(totalElements / 20) || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(totalElements / 20) - 1, page + 1))}
                  disabled={page >= Math.ceil(totalElements / 20) - 1}
                  className="p-1.5 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {requests.map((req, index) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center text-xs text-bridge-accent font-bold">
                    {req.requester?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-medium text-sm">{req.requester?.name}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLES[req.status]}`}>
                        {t(STATUS_LABEL_KEYS[req.status])}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {req.policy.name} · {req.start_date} ~ {req.end_date} · {req.total_days}{t('organization.leave.days', ' days')}
                      {req.duration_type !== 'FULL_DAY' && ` (${req.duration_type === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')})`}
                    </div>
                    {req.reason && (
                      <div className="text-xs text-muted-foreground mt-1">{req.reason}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                        title={t('organization.leave.approve', 'Approve')}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title={t('organization.leave.reject', 'Reject')}
                      >
                        <X size={16} />
                      </button>
                    </>
                  )}
                  {(req.status === 'PENDING' || req.status === 'APPROVED') && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="p-2 text-muted-foreground hover:bg-foreground/[0.03] rounded-lg transition-colors text-xs"
                      title={t('organization.leave.cancel', 'Cancel')}
                    >
                      <Clock size={14} />
                    </button>
                  )}
                  {req.status === 'CANCELED' && (
                    <button
                      onClick={() => handleReopen(req.id)}
                      className="p-2 text-bridge-accent hover:bg-bridge-accent/10 rounded-lg transition-colors text-xs"
                      title={t('organization.leave.reopen', 'Reopen')}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Leave Request Modal */}
      <MotionModal open={showRequestModal} onClose={() => setShowRequestModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <h2 className="text-lg font-bold text-foreground">{t('organization.leave.requestTitle', 'Request Leave')}</h2>
        </div>
        <div className="px-5 pb-5 pt-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.leave.leaveType', 'Leave Type')}
            </label>
            <select
              value={requestForm.policy_id}
              onChange={(e) => setRequestForm({ ...requestForm, policy_id: e.target.value })}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            >
              <option value="">{t('organization.leave.selectType', 'Select leave type')}</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.leave.durationType', 'Duration Type')}
            </label>
            <div className="flex gap-2">
              {(['FULL_DAY', 'AM_HALF', 'PM_HALF'] as LeaveDurationType[]).map((dt) => (
                <button
                  key={dt}
                  onClick={() => {
                    setRequestForm({
                      ...requestForm,
                      duration_type: dt,
                      end_date: dt !== 'FULL_DAY' ? requestForm.start_date : requestForm.end_date,
                    });
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors border ${
                    requestForm.duration_type === dt
                      ? 'bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30'
                      : 'bg-foreground/[0.03] text-muted-foreground border-foreground/[0.08] hover:bg-foreground/[0.06]'
                  }`}
                >
                  {dt === 'FULL_DAY' ? t('organization.leave.fullDay', 'Full Day') : dt === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                {t('organization.leave.startDate', 'Start Date')}
              </label>
              <input
                type="date"
                value={requestForm.start_date}
                onChange={(e) => {
                  const val = e.target.value;
                  setRequestForm({
                    ...requestForm,
                    start_date: val,
                    end_date: requestForm.duration_type !== 'FULL_DAY' ? val : requestForm.end_date < val ? val : requestForm.end_date,
                  });
                }}
                className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                {t('organization.leave.endDate', 'End Date')}
              </label>
              <input
                type="date"
                value={requestForm.end_date}
                onChange={(e) => setRequestForm({ ...requestForm, end_date: e.target.value })}
                disabled={requestForm.duration_type !== 'FULL_DAY'}
                min={requestForm.start_date}
                className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all disabled:opacity-50"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.leave.reason', 'Reason (Optional)')}
            </label>
            <textarea
              value={requestForm.reason}
              onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
              rows={2}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRequestModal(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSubmitRequest}
              disabled={!requestForm.policy_id || submitting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
            >
              {submitting ? t('common.submitting', 'Submitting...') : t('organization.leave.submit', 'Submit Request')}
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
