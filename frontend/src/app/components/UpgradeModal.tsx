import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Rocket, Calendar, BarChart3, Target, MessageSquare } from 'lucide-react';

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
  seatCount: number;
  onUpgrade: (billingCycle: 'MONTHLY' | 'YEARLY') => Promise<void>;
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
  seatCount,
  onUpgrade,
}: UpgradeModalProps) {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open) return null;

  const triggerTitle = t(`upgrade.triggers.${trigger}.title`);
  const triggerDescription = t(`upgrade.triggers.${trigger}.description`);
  const monthlyPrice = PRICE_PER_SEAT.monthly * seatCount;
  const yearlyPrice = PRICE_PER_SEAT.yearly * seatCount;
  const yearlyMonthlyPrice = yearlyPrice / 12;
  const discountPercentage = 17;

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      await onUpgrade(billingCycle);
      onClose();
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert(t('upgrade.upgradeFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-2xl shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
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
          <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/15">
            <p className="text-foreground font-medium mb-1">{triggerTitle}</p>
            <p className="text-slate-400 text-sm">{triggerDescription}</p>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('upgrade.premiumBenefits')}
          </p>
          <div className="space-y-2">
            {PREMIUM_FEATURE_ICONS.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="p-1.5 bg-bridge-accent/10 rounded-lg">
                  <feature.icon className="h-4 w-4 text-bridge-accent" />
                </div>
                <span className="text-slate-300 text-sm">{t(`upgrade.features.${feature.key}`)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('upgrade.selectPlan')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly */}
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-white/20 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">{t('upgrade.monthly')}</p>
                <p className="text-foreground text-xl font-bold">${monthlyPrice}</p>
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
                  : 'border-white/20 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <div className="absolute -top-2 -right-2">
                <span className="px-2 py-0.5 bg-bridge-secondary text-bridge-dark text-[10px] font-bold rounded-full">
                  {t('upgrade.discount', { percent: discountPercentage })}
                </span>
              </div>
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">{t('upgrade.yearly')}</p>
                <p className="text-foreground text-xl font-bold">${yearlyPrice}</p>
                <p className="text-slate-400 text-xs">/year (${yearlyMonthlyPrice.toFixed(2)}/mo)</p>
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
              price: billingCycle === 'MONTHLY' ? PRICE_PER_SEAT.monthly : PRICE_PER_SEAT.yearly,
              period: billingCycle === 'YEARLY' ? '/year' : '/month',
            })}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 text-foreground rounded-xl font-medium hover:bg-white/10 transition-all"
          >
            {t('common.later')}
          </button>
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing') : t('upgrade.startPremium')}
          </button>
        </div>
      </div>
    </div>
  );
}
