import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, CalendarOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { leaveService } from '../../../utils/services';
import type {
  LeaveBalance, LeavePolicy, LeaveRequestResponse, LeaveRequestPageResponse,
  OrgRole, LeaveStatus, LeaveDurationType,
} from '../../../types';

interface OrgLeaveTabProps {
  orgId: string;
  myRole: OrgRole;
}

const STATUS_STYLES: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-500/20 text-amber-400',
  APPROVED: 'bg-emerald-500/20 text-emerald-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  CANCELED: 'bg-slate-500/20 text-slate-400',
};

export function OrgLeaveTab({ orgId, myRole }: OrgLeaveTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [requests, setRequests] = useState<LeaveRequestResponse[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);

  // Leave Request Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    policy_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    duration_type: 'FULL_DAY' as LeaveDurationType,
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [balanceData, policyData, requestData] = await Promise.all([
        leaveService.getMyBalance(orgId),
        leaveService.getPolicies(orgId),
        leaveService.getRequests(orgId, {
          status: statusFilter || undefined,
          page,
          size: 20,
        }),
      ]);
      setBalances(balanceData);
      setPolicies(policyData.filter((p: LeavePolicy) => p.is_active));
      setRequests(requestData.content);
      setTotalElements(requestData.total_elements);
    } catch (error) {
      console.warn('Failed to fetch leave data:', error);
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
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        duration_type: 'FULL_DAY',
        reason: '',
      });
      fetchData();
    } catch (error) {
      console.warn('Failed to submit leave request:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await leaveService.approveRequest(orgId, requestId);
      fetchData();
    } catch (error) {
      console.warn('Failed to approve:', error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await leaveService.rejectRequest(orgId, requestId);
      fetchData();
    } catch (error) {
      console.warn('Failed to reject:', error);
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await leaveService.cancelRequest(orgId, requestId);
      fetchData();
    } catch (error) {
      console.warn('Failed to cancel:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-bridge-obsidian rounded-xl border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* My Balance */}
      {balances.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            {t('organization.leave.myBalance', 'My Leave Balance')}
          </h3>
          <div className="flex flex-wrap gap-4">
            {balances.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="text-sm text-white font-medium">{b.policy_name}:</span>
                <span className="text-sm text-bridge-secondary font-bold">{b.remaining}</span>
                <span className="text-xs text-slate-500">/ {b.total_days}</span>
              </div>
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
            className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
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
        <div className="text-center py-16 text-slate-500">
          <CalendarOff size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t('organization.leave.empty', 'No leave requests')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-bridge-obsidian rounded-xl border border-white/5 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xs text-bridge-accent font-bold">
                    {req.requester?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{req.requester?.name}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLES[req.status]}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {req.policy.name} · {req.start_date} ~ {req.end_date} · {req.total_days}{t('organization.leave.days', ' days')}
                      {req.duration_type !== 'FULL_DAY' && ` (${req.duration_type === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')})`}
                    </div>
                    {req.reason && (
                      <div className="text-xs text-slate-400 mt-1">{req.reason}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                        title={t('organization.leave.approve', 'Approve')}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title={t('organization.leave.reject', 'Reject')}
                      >
                        <X size={16} />
                      </button>
                    </>
                  )}
                  {(req.status === 'PENDING' || req.status === 'APPROVED') && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="p-2 text-slate-400 hover:bg-white/5 rounded-lg transition-colors text-xs"
                      title={t('organization.leave.cancel', 'Cancel')}
                    >
                      <Clock size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leave Request Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-white mb-4">{t('organization.leave.requestTitle', 'Request Leave')}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                      {t('organization.leave.leaveType', 'Leave Type')}
                    </label>
                    <select
                      value={requestForm.policy_id}
                      onChange={(e) => setRequestForm({ ...requestForm, policy_id: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    >
                      <option value="">{t('organization.leave.selectType', 'Select leave type')}</option>
                      {policies.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
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
                              ? 'bg-bridge-accent/20 text-bridge-accent border-bridge-accent/30'
                              : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {dt === 'FULL_DAY' ? t('organization.leave.fullDay', 'Full Day') : dt === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                        {t('organization.leave.endDate', 'End Date')}
                      </label>
                      <input
                        type="date"
                        value={requestForm.end_date}
                        onChange={(e) => setRequestForm({ ...requestForm, end_date: e.target.value })}
                        disabled={requestForm.duration_type !== 'FULL_DAY'}
                        min={requestForm.start_date}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                      {t('organization.leave.reason', 'Reason (Optional)')}
                    </label>
                    <textarea
                      value={requestForm.reason}
                      onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowRequestModal(false)}
                    className="px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleSubmitRequest}
                    disabled={!requestForm.policy_id || submitting}
                    className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all text-sm disabled:opacity-50"
                  >
                    {submitting ? t('common.submitting', 'Submitting...') : t('organization.leave.submit', 'Submit Request')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
