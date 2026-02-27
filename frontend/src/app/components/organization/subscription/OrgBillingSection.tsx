import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Crown,
  Users,
  Calendar,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { orgSubscriptionService } from '../../../utils/services';
import { formatDate } from '../../../utils/dateUtils';
import { MotionModal } from '../../ui/MotionModal';
import { OrgPlanSelector } from './OrgPlanSelector';
import { OrgMigrationWizard } from './OrgMigrationWizard';
import type { OrgSubscription } from '../../../types';

interface OrgBillingSectionProps {
  orgId: string;
  subscription: OrgSubscription;
  onUpdate: () => void;
}

interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  description: string | null;
}

export function OrgBillingSection({
  orgId,
  subscription,
  onUpdate,
}: OrgBillingSectionProps) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

  // Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    try {
      setLoadingPayments(true);
      const data = await orgSubscriptionService.getPayments(orgId);
      setPayments(data as PaymentRecord[]);
    } catch (error) {
      console.warn('Failed to fetch payments:', error);
    } finally {
      setLoadingPayments(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (showPayments && payments.length === 0) {
      fetchPayments();
    }
  }, [showPayments, payments.length, fetchPayments]);

  const handleDowngrade = async () => {
    try {
      setActionLoading(true);
      await orgSubscriptionService.downgrade(orgId);
      toast.success(t('orgSubscription.billing.downgradeSuccess', 'Downgraded to Free plan'));
      setShowDowngradeConfirm(false);
      onUpdate();
    } catch (error) {
      console.warn('Downgrade failed:', error);
      toast.error(t('orgSubscription.billing.downgradeError', 'Downgrade failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setActionLoading(true);
      await orgSubscriptionService.cancel(orgId);
      toast.success(t('orgSubscription.billing.cancelSuccess', 'Subscription cancelled'));
      setShowCancelConfirm(false);
      onUpdate();
    } catch (error) {
      console.warn('Cancel failed:', error);
      toast.error(t('orgSubscription.billing.cancelError', 'Cancel failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePlanSelect = (plan: 'FREE' | 'TEAM') => {
    setShowPlanModal(false);
    if (plan === 'TEAM' && subscription.plan === 'FREE') {
      setShowMigrationModal(true);
    } else if (plan === 'FREE' && subscription.plan === 'TEAM') {
      setShowDowngradeConfirm(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'TRIAL':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'PAST_DUE':
        return 'bg-red-500/15 text-red-600 dark:text-red-400';
      case 'CANCELLED':
        return 'bg-slate-500/15 text-slate-400';
      default:
        return 'bg-slate-500/15 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bridge-accent/15 flex items-center justify-center">
              <Crown size={18} className="text-bridge-accent" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {subscription.plan === 'TEAM'
                  ? t('orgSubscription.billing.teamPlan', 'Team Plan')
                  : t('orgSubscription.billing.freePlan', 'Free Plan')}
              </h3>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(subscription.status)}`}
              >
                {subscription.status}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowPlanModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-all"
          >
            {t('orgSubscription.billing.changePlan', 'Change Plan')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {subscription.billing_cycle && (
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">
                {t('orgSubscription.billing.cycle', 'Billing Cycle')}
              </span>
              <span className="text-sm font-bold text-foreground">
                {subscription.billing_cycle === 'MONTHLY'
                  ? t('orgSubscription.billing.monthly', 'Monthly')
                  : t('orgSubscription.billing.yearly', 'Yearly')}
              </span>
            </div>
          )}
          {subscription.total_price > 0 && (
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">
                {t('orgSubscription.billing.totalPrice', 'Total Price')}
              </span>
              <span className="text-sm font-bold text-foreground">
                {formatCurrency(subscription.total_price)}
                <span className="text-[11px] text-slate-400 ml-0.5">
                  /{subscription.billing_cycle === 'YEARLY'
                    ? t('orgSubscription.billing.yr', 'yr')
                    : t('orgSubscription.billing.mo', 'mo')}
                </span>
              </span>
            </div>
          )}
          {subscription.next_payment_at && (
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">
                {t('orgSubscription.billing.nextPayment', 'Next Payment')}
              </span>
              <span className="text-sm font-bold text-foreground">
                {formatDate(subscription.next_payment_at)}
              </span>
            </div>
          )}
          {subscription.current_period_end && (
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">
                {t('orgSubscription.billing.periodEnd', 'Period End')}
              </span>
              <span className="text-sm font-bold text-foreground">
                {formatDate(subscription.current_period_end)}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Seat Management */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-bridge-secondary/15 flex items-center justify-center">
            <Users size={18} className="text-bridge-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('orgSubscription.billing.seats', 'Seat Management')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {t('orgSubscription.billing.seatsDesc', 'Active members vs. available seats')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] text-slate-400">
                {t('orgSubscription.billing.used', 'Used')}
              </span>
              <span className="text-sm font-bold text-foreground">
                {subscription.active_member_count}
                <span className="text-slate-400 font-normal">
                  {' '}/ {subscription.member_limit === -1 ? t('orgSubscription.billing.unlimited', 'unlimited') : subscription.member_limit}
                </span>
              </span>
            </div>
            <div className="h-2 bg-foreground/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-bridge-secondary rounded-full transition-all"
                style={{
                  width: `${
                    subscription.member_limit === -1
                      ? 30
                      : Math.min(
                          (subscription.active_member_count / subscription.member_limit) * 100,
                          100,
                        )
                  }%`,
                }}
              />
            </div>
          </div>
        </div>

        {subscription.plan === 'TEAM' && (
          <div className="mt-3 flex items-center justify-between text-[12px]">
            <span className="text-slate-400">
              {t('orgSubscription.billing.pricePerSeat', '{{price}}/seat', {
                price: formatCurrency(subscription.price_per_seat),
              })}
            </span>
            <span className="text-[11px] text-slate-500">
              {t('orgSubscription.billing.seatCount', '{{count}} seats', {
                count: subscription.seat_count,
              })}
            </span>
          </div>
        )}
      </motion.div>

      {/* Board Usage */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Calendar size={18} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('orgSubscription.billing.boardUsage', 'Board Usage')}
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-slate-400">
            {t('orgSubscription.billing.boardsUsed', 'Boards used')}
          </span>
          <span className="text-sm font-bold text-foreground">
            {subscription.board_count}
            <span className="text-slate-400 font-normal">
              {' '}/ {subscription.board_limit === -1 ? t('orgSubscription.billing.unlimited', 'unlimited') : subscription.board_limit}
            </span>
          </span>
        </div>
      </motion.div>

      {/* Payment History */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]"
      >
        <button
          onClick={() => setShowPayments(!showPayments)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center">
              <CreditCard size={18} className="text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {t('orgSubscription.billing.paymentHistory', 'Payment History')}
            </h3>
          </div>
          {showPayments ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </button>

        {showPayments && (
          <div className="px-5 pb-5 border-t border-foreground/[0.08]">
            {loadingPayments ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                {t('orgSubscription.billing.noPayments', 'No payment history')}
              </p>
            ) : (
              <div className="space-y-2 pt-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between py-2 border-b border-foreground/[0.06] last:border-b-0"
                  >
                    <div>
                      <span className="text-sm text-foreground font-medium block">
                        {formatCurrency(payment.amount)}
                      </span>
                      {payment.description && (
                        <span className="text-[11px] text-slate-500">
                          {payment.description}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(payment.status)}`}
                      >
                        {payment.status}
                      </span>
                      {payment.paid_at && (
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {formatDate(payment.paid_at)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Danger Zone */}
      {subscription.plan === 'TEAM' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="bg-bridge-obsidian rounded-2xl border border-red-500/20 p-5"
        >
          <h3 className="text-sm font-bold text-foreground mb-1">
            {t('orgSubscription.billing.dangerZone', 'Danger Zone')}
          </h3>
          <p className="text-[11px] text-slate-500 mb-4">
            {t(
              'orgSubscription.billing.dangerDesc',
              'Downgrading or cancelling will remove premium features.',
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDowngradeConfirm(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
            >
              {t('orgSubscription.billing.downgradeButton', 'Downgrade to Free')}
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
            >
              {t('orgSubscription.billing.cancelButton', 'Cancel Subscription')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Plan Selection Modal */}
      <MotionModal open={showPlanModal} onClose={() => setShowPlanModal(false)} className="sm:max-w-2xl">
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <Crown size={18} className="text-bridge-accent" />
          <h2 className="text-lg font-bold text-foreground">
            {t('orgSubscription.billing.selectPlan', 'Select Plan')}
          </h2>
        </div>
        <div className="px-5 pb-5 pt-4">
          <OrgPlanSelector
            currentPlan={subscription.plan}
            orgId={orgId}
            onSelectPlan={handlePlanSelect}
          />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-[10px] text-slate-600">Esc {t('common.close', 'Close')}</span>
          <button
            onClick={() => setShowPlanModal(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </MotionModal>

      {/* Migration Wizard Modal */}
      <MotionModal
        open={showMigrationModal}
        onClose={() => setShowMigrationModal(false)}
        className="sm:max-w-lg"
      >
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
        <OrgMigrationWizard
          orgId={orgId}
          onComplete={() => {
            setShowMigrationModal(false);
            onUpdate();
          }}
          onCancel={() => setShowMigrationModal(false)}
        />
      </MotionModal>

      {/* Downgrade Confirmation Modal */}
      <MotionModal
        open={showDowngradeConfirm}
        onClose={() => setShowDowngradeConfirm(false)}
        className="sm:max-w-sm"
      >
        <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">
              {t('orgSubscription.billing.downgradeTitle', 'Downgrade to Free?')}
            </h2>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            {t(
              'orgSubscription.billing.downgradeWarning',
              'You will lose access to premium board features, unlimited boards, and full HR features. This change takes effect at the end of the current billing period.',
            )}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-slate-600">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDowngradeConfirm(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleDowngrade}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('orgSubscription.billing.downgradeConfirm', 'Downgrade')
              )}
            </button>
          </div>
        </div>
      </MotionModal>

      {/* Cancel Confirmation Modal */}
      <MotionModal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        className="sm:max-w-sm"
      >
        <div className="h-1 bg-gradient-to-r from-red-500 to-red-700 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-foreground">
              {t('orgSubscription.billing.cancelTitle', 'Cancel Subscription?')}
            </h2>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            {t(
              'orgSubscription.billing.cancelWarning',
              'Your subscription will be cancelled. You will retain access until the end of the current billing period.',
            )}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-slate-600">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('orgSubscription.billing.cancelConfirm', 'Cancel Subscription')
              )}
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
