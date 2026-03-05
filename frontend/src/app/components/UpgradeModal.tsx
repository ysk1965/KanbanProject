import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Rocket, Calendar, BarChart3, Target, MessageSquare, Minus, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from './ui/MotionModal';

export type UpgradeTrigger =
  | 'weekly_schedule'
  | 'milestone'
  | 'statistics'
  | 'slack'
  | 'trial_ending';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  trigger: UpgradeTrigger;
  currentBillableMembers: number;
  onUpgrade: (billingCycle: 'MONTHLY' | 'YEARLY', seatCount: number) => Promise<void>;
}

const PREMIUM_FEATURE_ICONS = [
  { icon: Calendar, key: 'weeklySchedule' },
  { icon: Target, key: 'milestone' },
  { icon: MessageSquare, key: 'slack' },
  { icon: BarChart3, key: 'statistics' },
];

const PRICE_PER_SEAT = {
  monthly: 5,
  yearly: 50,
};

export function UpgradeModal({
  open,
  onClose,
  trigger,
  currentBillableMembers,
  onUpgrade,
}: UpgradeModalProps) {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [isProcessing, setIsProcessing] = useState(false);
  const minSeats = Math.max(currentBillableMembers, 1);
  const [seatCount, setSeatCount] = useState(minSeats);

  const triggerTitle = t(`upgrade.triggers.${trigger}.title`);
  const triggerDescription = t(`upgrade.triggers.${trigger}.description`);
  const pricePerSeat = billingCycle === 'MONTHLY' ? PRICE_PER_SEAT.monthly : PRICE_PER_SEAT.yearly;

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      await onUpgrade(billingCycle, seatCount);
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      console.error('Upgrade failed:', error);
      toast.error(t('upgrade.upgradeFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-lg p-0">
        {/* Header */}
        <div className="relative px-4 sm:px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-bridge-accent/20 rounded-xl">
              <Rocket className="h-6 w-6 text-bridge-accent" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t('upgrade.title')}</h2>
          </div>

          {/* Trigger message */}
          <div className="bg-bridge-dark/50 rounded-xl p-4 border border-foreground/10">
            <p className="text-foreground font-medium mb-1">{triggerTitle}</p>
            <p className="text-slate-400 text-sm">{triggerDescription}</p>
          </div>
        </div>

        {/* Features */}
        <div className="px-4 sm:px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('upgrade.premiumBenefits')}
          </p>
          <div className="space-y-2">
            {PREMIUM_FEATURE_ICONS.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="p-1.5 bg-bridge-accent/10 rounded-lg">
                  <feature.icon className="h-4 w-4 text-bridge-accent" />
                </div>
                <span className="text-muted-foreground text-sm">{t(`upgrade.features.${feature.key}`)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Seat Count Selector */}
        <div className="px-4 sm:px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('upgrade.seatSelection')}
          </p>

          <div className="bg-bridge-dark/50 rounded-xl border border-foreground/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-bridge-accent/10 rounded-lg">
                  <Users className="h-4 w-4 text-bridge-accent" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">{t('upgrade.seats')}</p>
                  <p className="text-slate-500 text-xs">
                    {t('upgrade.currentMembers', { count: currentBillableMembers })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSeatCount(Math.max(minSeats, seatCount - 1))}
                  disabled={seatCount <= minSeats}
                  className="p-1.5 rounded-lg border border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-foreground text-xl font-bold w-10 text-center">{seatCount}</span>
                <button
                  onClick={() => setSeatCount(seatCount + 1)}
                  className="p-1.5 rounded-lg border border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-all"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="px-4 sm:px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('upgrade.selectPlan')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Monthly */}
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-foreground/10 hover:border-foreground/10 hover:bg-foreground/5'
              }`}
            >
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">{t('upgrade.monthly')}</p>
                <p className="text-foreground text-lg sm:text-xl font-bold">${PRICE_PER_SEAT.monthly * seatCount}</p>
                <p className="text-slate-400 text-xs">/month</p>
              </div>
              {billingCycle === 'MONTHLY' && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-bridge-accent" />
                </div>
              )}
            </button>

            {/* Yearly */}
            <button
              onClick={() => setBillingCycle('YEARLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'YEARLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-foreground/10 hover:border-foreground/10 hover:bg-foreground/5'
              }`}
            >
              <div className="absolute -top-2 -right-2">
                <span className="px-2 py-0.5 bg-bridge-secondary text-bridge-dark text-[10px] font-bold rounded-full">
                  {t('upgrade.discount', { percent: 17 })}
                </span>
              </div>
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">{t('upgrade.yearly')}</p>
                <p className="text-foreground text-lg sm:text-xl font-bold">${PRICE_PER_SEAT.yearly * seatCount}</p>
                <p className="text-slate-400 text-xs">/year (${((PRICE_PER_SEAT.yearly * seatCount) / 12).toFixed(2)}/mo)</p>
              </div>
              {billingCycle === 'YEARLY' && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-bridge-accent" />
                </div>
              )}
            </button>
          </div>

          {/* Seat info */}
          <p className="text-slate-400 text-xs mt-3 text-center">
            {t('upgrade.seatInfo', {
              count: seatCount,
              price: pricePerSeat,
              period: billingCycle === 'YEARLY' ? '/year' : '/month',
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 sm:px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 min-h-[44px] bg-foreground/5 border border-foreground/10 text-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
          >
            {t('common.later')}
          </button>
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 min-h-[44px] bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing') : t('upgrade.startPremium')}
          </button>
        </div>
    </MotionModal>
  );
}
