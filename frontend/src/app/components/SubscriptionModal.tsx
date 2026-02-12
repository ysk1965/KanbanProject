import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard, Users, Check, Minus, Plus, Crown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Subscription } from '../types';
import { formatDate as dateUtilsFormatDate } from '../utils/dateUtils';

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  currentBillableMembers: number;
  onChangeBillingCycle: (billingCycle: 'MONTHLY' | 'YEARLY') => Promise<void>;
  onPurchaseSeats: (additionalSeats: number) => Promise<void>;
  onCancelSubscription: () => Promise<void>;
}

const PRICE_PER_SEAT = {
  monthly: 5,
  yearly: 50,
};

export function SubscriptionModal({
  open,
  onClose,
  subscription,
  currentBillableMembers,
  onChangeBillingCycle,
  onPurchaseSeats,
  onCancelSubscription,
}: SubscriptionModalProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'seats' | 'billing'>('overview');

  if (!open) return null;

  const seatCount = subscription?.seat_count || 0;
  const billingCycle = subscription?.billing_cycle || 'MONTHLY';
  const pricePerSeat = billingCycle === 'MONTHLY' ? PRICE_PER_SEAT.monthly : PRICE_PER_SEAT.yearly;
  const totalPrice = pricePerSeat * seatCount;
  const isActive = subscription?.status === 'ACTIVE';

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return dateUtilsFormatDate(dateStr, 'yyyy-MM-dd');
  };

  const getStatusBadge = (status: Subscription['status']) => {
    const styles: Record<string, string> = {
      TRIAL: 'bg-blue-500/20 text-blue-400',
      ACTIVE: 'bg-green-500/20 text-green-400',
      SUSPENDED: 'bg-red-500/20 text-red-400',
      CANCELED: 'bg-slate-500/20 text-slate-400',
    };
    return (
      <span className={`${styles[status] || ''} px-2 py-1 rounded text-xs font-medium`}>
        {t(`subscription.status${status.charAt(0) + status.slice(1).toLowerCase()}`)}
      </span>
    );
  };

  const handleChangeBillingCycle = async (newCycle: 'MONTHLY' | 'YEARLY') => {
    if (newCycle === billingCycle) return;
    setIsProcessing(true);
    try {
      await onChangeBillingCycle(newCycle);
    } catch (error) {
      console.error('Change billing cycle failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePurchaseSeats = async () => {
    setIsProcessing(true);
    try {
      await onPurchaseSeats(additionalSeats);
      setAdditionalSeats(1);
      setActiveTab('overview');
    } catch (error) {
      console.error('Purchase seats failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      await onCancelSubscription();
      setShowCancelConfirm(false);
    } catch (error) {
      console.error('Cancel subscription failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const seatUsagePercent = seatCount > 0 ? Math.min((currentBillableMembers / seatCount) * 100, 100) : 0;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-bridge-obsidian rounded-2xl border border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-bridge-accent/10 rounded-xl">
                  <CreditCard className="h-5 w-5 text-bridge-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{t('subscription.title')}</h2>
                  {subscription && (
                    <div className="mt-1">{getStatusBadge(subscription.status)}</div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Navigation (only for ACTIVE subscriptions) */}
            {isActive && (
              <div className="flex border-b border-white/10">
                {(['overview', 'seats', 'billing'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'text-bridge-accent border-b-2 border-bridge-accent'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t(`subscription.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              {/* Trial info */}
              {subscription?.status === 'TRIAL' && (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-4 w-4 text-blue-400" />
                      <p className="text-blue-400 font-medium text-sm">{t('subscription.trialActive')}</p>
                    </div>
                    {subscription.trial_ends_at && (
                      <p className="text-slate-400 text-sm">
                        {t('subscription.trialEndsAt', { date: formatDate(subscription.trial_ends_at) })}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                      <p className="text-slate-400 text-xs mb-1">{t('subscription.memberCount')}</p>
                      <p className="text-white font-bold text-lg">
                        {currentBillableMembers} / {subscription.member_limit || 5}
                      </p>
                    </div>
                    <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                      <p className="text-slate-400 text-xs mb-1">{t('subscription.trialEndDate')}</p>
                      <p className="text-white font-bold text-lg">
                        {formatDate(subscription.trial_ends_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Active - Overview Tab */}
              {isActive && activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Seat Usage */}
                  <div className="bg-bridge-dark/50 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-bridge-accent" />
                        <p className="text-white text-sm font-medium">{t('subscription.seatUsage')}</p>
                      </div>
                      <p className="text-slate-400 text-sm">
                        {currentBillableMembers} / {seatCount} {t('seatPurchase.seats')}
                      </p>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          seatUsagePercent >= 90 ? 'bg-red-500' : seatUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-bridge-accent'
                        }`}
                        style={{ width: `${seatUsagePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Pricing Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                      <p className="text-slate-400 text-xs mb-1">{t('subscription.billingCycle')}</p>
                      <p className="text-white font-bold">
                        {billingCycle === 'MONTHLY' ? t('subscription.billingMonthly') : t('subscription.billingYearly')}
                      </p>
                    </div>
                    <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                      <p className="text-slate-400 text-xs mb-1">{t('subscription.price')}</p>
                      <p className="text-white font-bold">
                        ${totalPrice}
                        <span className="text-slate-400 text-xs font-normal">
                          {billingCycle === 'MONTHLY' ? t('subscription.perMonth') : t('subscription.perYear')}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Date Info */}
                  <div className="grid grid-cols-2 gap-4">
                    {subscription?.created_at && (
                      <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                        <p className="text-slate-400 text-xs mb-1">{t('subscription.startDate')}</p>
                        <p className="text-white text-sm font-medium">
                          {formatDate(subscription.created_at)}
                        </p>
                      </div>
                    )}
                    {subscription?.next_payment_at && (
                      <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                        <p className="text-slate-400 text-xs mb-1">{t('subscription.nextPaymentDate')}</p>
                        <p className="text-white text-sm font-medium">
                          {formatDate(subscription.next_payment_at)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Period Info */}
                  {subscription?.current_period_start && subscription?.current_period_end && (
                    <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/5">
                      <p className="text-slate-400 text-xs mb-1">{t('subscription.currentPeriod')}</p>
                      <p className="text-white text-sm">
                        {formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Active - Seats Tab */}
              {isActive && activeTab === 'seats' && (
                <div className="space-y-4">
                  {/* Current Seats */}
                  <div className="bg-bridge-dark/50 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-white text-sm font-medium">{t('subscription.currentSeats')}</p>
                      <p className="text-bridge-accent text-lg font-bold">{seatCount}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-slate-400 text-xs">{t('subscription.usedSeats')}</p>
                      <p className="text-slate-300 text-sm">{currentBillableMembers}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-slate-400 text-xs">{t('subscription.availableSeats')}</p>
                      <p className="text-bridge-secondary text-sm font-medium">
                        {Math.max(seatCount - currentBillableMembers, 0)}
                      </p>
                    </div>
                  </div>

                  {/* Purchase Additional Seats */}
                  <div className="bg-bridge-dark/50 rounded-xl border border-white/10 p-4">
                    <p className="text-white text-sm font-medium mb-4">{t('subscription.addSeats')}</p>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setAdditionalSeats(Math.max(1, additionalSeats - 1))}
                          disabled={additionalSeats <= 1}
                          className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-white text-xl font-bold w-10 text-center">{additionalSeats}</span>
                        <button
                          onClick={() => setAdditionalSeats(additionalSeats + 1)}
                          className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">
                          +${pricePerSeat * additionalSeats}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {additionalSeats} × ${pricePerSeat}
                          {billingCycle === 'MONTHLY' ? t('subscription.perMonth') : t('subscription.perYear')}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handlePurchaseSeats}
                      disabled={isProcessing}
                      className="w-full px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? t('common.processing') : t('subscription.purchaseSeats')}
                    </button>
                  </div>
                </div>
              )}

              {/* Active - Billing Tab */}
              {isActive && activeTab === 'billing' && (
                <div className="space-y-4">
                  {/* Change Billing Cycle */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                      {t('subscription.changeBillingCycle')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleChangeBillingCycle('MONTHLY')}
                        disabled={isProcessing}
                        className={`relative p-4 rounded-xl border transition-all ${
                          billingCycle === 'MONTHLY'
                            ? 'border-bridge-accent bg-bridge-accent/10'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-slate-400 text-xs mb-1">{t('upgrade.monthly')}</p>
                          <p className="text-white text-lg font-bold">${PRICE_PER_SEAT.monthly * seatCount}</p>
                          <p className="text-slate-500 text-xs">{t('upgrade.perMonth')}</p>
                        </div>
                        {billingCycle === 'MONTHLY' && (
                          <div className="absolute top-3 right-3">
                            <Check className="h-4 w-4 text-bridge-accent" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() => handleChangeBillingCycle('YEARLY')}
                        disabled={isProcessing}
                        className={`relative p-4 rounded-xl border transition-all ${
                          billingCycle === 'YEARLY'
                            ? 'border-bridge-accent bg-bridge-accent/10'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="absolute -top-2 -right-2">
                          <span className="px-2 py-0.5 bg-bridge-secondary text-bridge-dark text-[10px] font-bold rounded-full">
                            17% off
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="text-slate-400 text-xs mb-1">{t('upgrade.yearly')}</p>
                          <p className="text-white text-lg font-bold">${PRICE_PER_SEAT.yearly * seatCount}</p>
                          <p className="text-slate-500 text-xs">
                            {t('upgrade.perYear')} (${((PRICE_PER_SEAT.yearly * seatCount) / 12).toFixed(2)}/mo)
                          </p>
                        </div>
                        {billingCycle === 'YEARLY' && (
                          <div className="absolute top-3 right-3">
                            <Check className="h-4 w-4 text-bridge-accent" />
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Cancel Subscription */}
                  <div className="pt-4 border-t border-white/10">
                    {!showCancelConfirm ? (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="text-red-400 text-sm hover:text-red-300 transition-colors"
                      >
                        {t('subscription.cancelSubscription')}
                      </button>
                    ) : (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                          <p className="text-red-400 font-medium text-sm">{t('subscription.cancelConfirmTitle')}</p>
                        </div>
                        <p className="text-slate-400 text-xs mb-3">{t('subscription.cancelConfirmDesc')}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-lg text-sm hover:bg-white/10 transition-all"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="flex-1 px-3 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-all disabled:opacity-50"
                          >
                            {isProcessing ? t('common.processing') : t('subscription.confirmCancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Non-active states (SUSPENDED, CANCELED) */}
              {subscription && !isActive && subscription.status !== 'TRIAL' && (
                <div className="space-y-4">
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                    <p className="text-yellow-400 text-sm font-medium">
                      {t(`subscription.${subscription.status.toLowerCase()}Message`)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-medium hover:bg-white/10 transition-all"
              >
                {t('common.close')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
