import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard, Users, Check, Minus, Plus, Crown, AlertTriangle, Sparkles, ArrowRight, Undo2, Calendar, BarChart3, MessageSquare, Clock } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { toast } from 'sonner';
import { Subscription } from '../types';
import { formatDate as dateUtilsFormatDate } from '../utils/dateUtils';
import { MotionModal } from './ui/MotionModal';

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  currentBillableMembers: number;
  boardId?: string;
  onChangeBillingCycle: (billingCycle: 'MONTHLY' | 'YEARLY') => Promise<void>;
  onPurchaseSeats: (additionalSeats: number) => Promise<void>;
  onCancelSubscription: () => Promise<void>;
  onUndoCancellation?: () => Promise<void>;
}

const PRICE_PER_SEAT = {
  monthly: 5,
  yearly: 50,
};

const CREDITS_BASE = 200;
const CREDITS_PER_SEAT = 50;

export function SubscriptionModal({
  open,
  onClose,
  subscription,
  currentBillableMembers,
  boardId,
  onChangeBillingCycle,
  onPurchaseSeats,
  onCancelSubscription,
  onUndoCancellation,
}: SubscriptionModalProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'seats' | 'billing'>('overview');

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
      PAST_DUE: 'bg-amber-500/20 text-amber-400',
      SUSPENDED: 'bg-red-500/20 text-red-400',
      CANCELED: 'bg-slate-500/20 text-slate-400',
    };
    const statusKey = status === 'PAST_DUE' ? 'PastDue' : status.charAt(0) + status.slice(1).toLowerCase();
    return (
      <span className={`${styles[status] || ''} px-2 py-1 rounded text-xs font-medium`}>
        {t(`subscription.status${statusKey}`)}
      </span>
    );
  };

  const handleChangeBillingCycle = async (newCycle: 'MONTHLY' | 'YEARLY') => {
    if (newCycle === billingCycle) return;
    setIsProcessing(true);
    try {
      await onChangeBillingCycle(newCycle);
      toast.success(t('subscription.changeBillingSuccess'));
    } catch (error) {
      console.error('Change billing cycle failed:', error);
      toast.error(t('subscription.changeBillingFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePurchaseSeats = async () => {
    setIsProcessing(true);
    try {
      await onPurchaseSeats(additionalSeats);
      toast.success(t('subscription.purchaseSeatsSuccess', { count: additionalSeats }));
      setAdditionalSeats(1);
      setActiveTab('overview');
    } catch (error) {
      console.error('Purchase seats failed:', error);
      toast.error(t('subscription.purchaseSeatsFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      await onCancelSubscription();
      toast.success(t('subscription.cancelSuccess'));
      setShowCancelConfirm(false);
    } catch (error) {
      console.error('Cancel subscription failed:', error);
      toast.error(t('subscription.cancelFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoCancellation = async () => {
    if (!onUndoCancellation) return;
    setIsProcessing(true);
    try {
      await onUndoCancellation();
      toast.success(t('subscription.undoCancelSuccess'));
    } catch (error) {
      console.error('Undo cancellation failed:', error);
      toast.error(t('subscription.undoCancelFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const isCancellationPending = !!subscription?.cancel_requested_at;
  const seatUsagePercent = seatCount > 0 ? Math.min((currentBillableMembers / seatCount) * 100, 100) : 0;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-xl p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-5 border-b border-foreground/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-bridge-accent/10 rounded-xl">
              <CreditCard className="h-5 w-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('subscription.title')}</h2>
              {subscription && (
                <div className="mt-1">{getStatusBadge(subscription.status)}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation (only for ACTIVE subscriptions) */}
        {isActive && (
          <div className="flex border-b border-foreground/10">
            {(['overview', 'seats', 'billing'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-bridge-accent border-b-2 border-bridge-accent'
                    : 'text-slate-400 hover:text-foreground'
                }`}
              >
                {t(`subscription.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                  <p className="text-slate-400 text-xs mb-1">{t('subscription.memberCount')}</p>
                  <p className="text-foreground font-bold text-lg">
                    {currentBillableMembers} / {subscription.member_limit || 5}
                  </p>
                </div>
                <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                  <p className="text-slate-400 text-xs mb-1">{t('subscription.trialEndDate')}</p>
                  <p className="text-foreground font-bold text-lg">
                    {formatDate(subscription.trial_ends_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Active - Overview Tab */}
          {isActive && activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Cancellation Pending Banner (Overview) */}
              {isCancellationPending && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-amber-400" />
                        <p className="text-amber-400 font-medium text-sm">
                          {t('subscription.cancelPendingTitle')}
                        </p>
                      </div>
                      <p className="text-slate-400 text-xs">
                        {t('subscription.cancelPendingDesc', { date: formatDate(subscription?.current_period_end) })}
                      </p>
                    </div>
                    <button
                      onClick={handleUndoCancellation}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-2 bg-bridge-accent text-white rounded-lg text-xs font-medium hover:bg-bridge-accent/90 transition-all disabled:opacity-50 shrink-0 ml-3"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {t('subscription.undoCancellation')}
                    </button>
                  </div>
                </div>
              )}

              {/* Seat Usage */}
              <div className="bg-bridge-dark/50 rounded-xl border border-foreground/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-bridge-accent" />
                    <p className="text-foreground text-sm font-medium">{t('subscription.seatUsage')}</p>
                  </div>
                  <p className="text-slate-400 text-sm">
                    {currentBillableMembers} / {seatCount} {t('seatPurchase.seats')}
                  </p>
                </div>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      seatUsagePercent >= 90 ? 'bg-red-500' : seatUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-bridge-accent'
                    }`}
                    style={{ width: `${seatUsagePercent}%` }}
                  />
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                  <p className="text-slate-400 text-xs mb-1">{t('subscription.billingCycle')}</p>
                  <p className="text-foreground font-bold">
                    {billingCycle === 'MONTHLY' ? t('subscription.billingMonthly') : t('subscription.billingYearly')}
                  </p>
                </div>
                <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                  <p className="text-slate-400 text-xs mb-1">{t('subscription.price')}</p>
                  <p className="text-foreground font-bold">
                    ${totalPrice}
                    <span className="text-slate-400 text-xs font-normal">
                      {billingCycle === 'MONTHLY' ? t('subscription.perMonth') : t('subscription.perYear')}
                    </span>
                  </p>
                </div>
              </div>

              {/* Date Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subscription?.created_at && (
                  <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                    <p className="text-slate-400 text-xs mb-1">{t('subscription.startDate')}</p>
                    <p className="text-foreground text-sm font-medium">
                      {formatDate(subscription.created_at)}
                    </p>
                  </div>
                )}
                {subscription?.next_payment_at && (
                  <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                    <p className="text-slate-400 text-xs mb-1">{t('subscription.nextPaymentDate')}</p>
                    <p className="text-foreground text-sm font-medium">
                      {formatDate(subscription.next_payment_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* Period Info */}
              {subscription?.current_period_start && subscription?.current_period_end && (
                <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/5">
                  <p className="text-slate-400 text-xs mb-1">{t('subscription.currentPeriod')}</p>
                  <p className="text-foreground text-sm">
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
              <div className="bg-bridge-dark/50 rounded-xl border border-foreground/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-foreground text-sm font-medium">{t('subscription.currentSeats')}</p>
                  <p className="text-bridge-accent text-lg font-bold">{seatCount}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-xs">{t('subscription.usedSeats')}</p>
                  <p className="text-muted-foreground text-sm">{currentBillableMembers}</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-slate-400 text-xs">{t('subscription.availableSeats')}</p>
                  <p className="text-bridge-secondary text-sm font-medium">
                    {Math.max(seatCount - currentBillableMembers, 0)}
                  </p>
                </div>
              </div>

              {/* Purchase Additional Seats */}
              <div className="bg-bridge-dark/50 rounded-xl border border-foreground/10 p-4">
                <p className="text-foreground text-sm font-medium mb-4">{t('subscription.addSeats')}</p>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <IconButton
                      aria-label="좌석 수 감소"
                      onClick={() => setAdditionalSeats(Math.max(1, additionalSeats - 1))}
                      disabled={additionalSeats <= 1}
                      className="border border-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus />
                    </IconButton>
                    <span className="text-foreground text-xl font-bold w-10 text-center">{additionalSeats}</span>
                    <IconButton
                      aria-label="좌석 수 증가"
                      onClick={() => setAdditionalSeats(additionalSeats + 1)}
                      className="border border-foreground/10"
                    >
                      <Plus />
                    </IconButton>
                  </div>
                  <div className="text-right">
                    <p className="text-foreground font-bold">
                      +${pricePerSeat * additionalSeats}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {additionalSeats} × ${pricePerSeat}
                      {billingCycle === 'MONTHLY' ? t('subscription.perMonth') : t('subscription.perYear')}
                    </p>
                  </div>
                </div>

                {/* AI Credit Change Info */}
                <div className="bg-bridge-accent/5 rounded-xl border border-bridge-accent/20 p-3 mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-bridge-accent" />
                    <p className="text-xs font-bold text-bridge-accent uppercase tracking-widest">
                      {t('subscription.creditChangeLabel')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-slate-400 text-xs mb-0.5">{t('subscription.creditCurrentMonthly')}</p>
                      <p className="text-foreground text-sm font-bold">
                        {CREDITS_BASE + seatCount * CREDITS_PER_SEAT}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500 mx-2" />
                    <div className="text-center">
                      <p className="text-slate-400 text-xs mb-0.5">{t('subscription.creditAfterPurchase')}</p>
                      <p className="text-bridge-secondary text-sm font-bold">
                        {CREDITS_BASE + (seatCount + additionalSeats) * CREDITS_PER_SEAT}
                      </p>
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs text-center mt-1.5">
                    {t('subscription.creditPerSeat', { count: CREDITS_PER_SEAT })}
                  </p>
                </div>

                <button
                  onClick={handlePurchaseSeats}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 min-h-[44px] bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  {t('subscription.changeBillingCycle')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => handleChangeBillingCycle('MONTHLY')}
                    disabled={isProcessing}
                    className={`relative p-4 rounded-xl border transition-all ${
                      billingCycle === 'MONTHLY'
                        ? 'border-bridge-accent bg-bridge-accent/10'
                        : 'border-foreground/10 hover:border-bridge-border hover:bg-foreground/5'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-slate-400 text-xs mb-1">{t('upgrade.monthly')}</p>
                      <p className="text-foreground text-lg font-bold">${PRICE_PER_SEAT.monthly * seatCount}</p>
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
                        : 'border-foreground/10 hover:border-bridge-border hover:bg-foreground/5'
                    }`}
                  >
                    <div className="absolute -top-2 -right-2">
                      <span className="px-2 py-0.5 bg-bridge-secondary text-bridge-dark text-xs font-bold rounded-full">
                        17% off
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-slate-400 text-xs mb-1">{t('upgrade.yearly')}</p>
                      <p className="text-foreground text-lg font-bold">${PRICE_PER_SEAT.yearly * seatCount}</p>
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

              {/* Update Payment Method */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  {t('subscription.paymentMethod')}
                </p>
                <button
                  onClick={async () => {
                    if (!boardId) return;
                    try {
                      const { subscriptionService } = await import('../utils/services');
                      const url = await subscriptionService.getBillingPortalUrl(boardId);
                      window.open(url, '_blank');
                    } catch {
                      toast.error(t('subscription.updatePaymentFailed'));
                    }
                  }}
                  className="px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-xl text-sm text-foreground hover:bg-foreground/10 transition-all flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {t('subscription.updatePaymentMethod')}
                </button>
              </div>

              {/* Cancellation Pending Banner */}
              {isCancellationPending && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <p className="text-amber-400 font-medium text-sm">
                      {t('subscription.cancelPendingTitle')}
                    </p>
                  </div>
                  <p className="text-slate-400 text-xs mb-3">
                    {t('subscription.cancelPendingDesc', { date: formatDate(subscription?.current_period_end) })}
                  </p>
                  <button
                    onClick={handleUndoCancellation}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-3 py-2 bg-bridge-accent text-white rounded-lg text-sm font-medium hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {isProcessing ? t('common.processing') : t('subscription.undoCancellation')}
                  </button>
                </div>
              )}

              {/* Cancel Subscription */}
              {!isCancellationPending && (
                <div className="pt-4 border-t border-foreground/10">
                  {!showCancelConfirm ? (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="text-red-400 text-sm hover:text-red-300 transition-colors"
                    >
                      {t('subscription.cancelSubscription')}
                    </button>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <p className="text-red-400 font-medium text-sm">{t('subscription.cancelConfirmTitle')}</p>
                      </div>

                      {/* Grace period info */}
                      {subscription?.current_period_end && (
                        <div className="bg-foreground/5 rounded-lg p-3 mb-3">
                          <p className="text-foreground text-xs font-medium mb-1">
                            {t('subscription.cancelActiveUntil', { date: formatDate(subscription.current_period_end) })}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {t('subscription.cancelNextPaymentSkipped', { date: formatDate(subscription.next_payment_at) })}
                          </p>
                        </div>
                      )}

                      {/* Features lost */}
                      <div className="mb-3">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">
                          {t('subscription.cancelFeaturesLost')}
                        </p>
                        <div className="space-y-1.5">
                          {[
                            { icon: Calendar, label: t('subscription.cancelFeatureSchedule') },
                            { icon: BarChart3, label: t('subscription.cancelFeatureStats') },
                            { icon: MessageSquare, label: t('subscription.cancelFeatureSlack') },
                            { icon: Crown, label: t('subscription.cancelFeatureMilestone') },
                          ].map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
                              <X className="h-3 w-3 text-red-400 shrink-0" />
                              <Icon className="h-3 w-3 shrink-0" />
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 px-3 py-2.5 bg-bridge-accent text-white rounded-lg text-sm font-bold hover:bg-bridge-accent/90 transition-all"
                        >
                          {t('subscription.keepSubscription')}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={isProcessing}
                          className="px-3 py-2.5 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-all disabled:opacity-50"
                        >
                          {isProcessing ? t('common.processing') : t('subscription.cancelAnyway')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
        <div className="px-4 sm:px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 min-h-[44px] bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
          >
            {t('common.close')}
          </button>
        </div>
    </MotionModal>
  );
}
