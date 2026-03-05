import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Check,
  Minus,
  Plus,
  Rocket,
  Crown,
  Calendar,
  CalendarDays,
  Target,
  BarChart3,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react';
import { MotionModal } from './ui/MotionModal';

interface PremiumBenefitsModalProps {
  open: boolean;
  onClose: () => void;
  currentBillableMembers: number;
  onUpgrade: (billingCycle: 'MONTHLY' | 'YEARLY', seatCount: number) => Promise<void>;
}

const PRICE_PER_SEAT = {
  monthly: 5,
  yearly: 50,
};

const COMPARISON_FEATURES = [
  { key: 'kanban', icon: null, standard: true, premium: true },
  { key: 'weeklySchedule', icon: Calendar, standard: false, premium: true },
  { key: 'dailySchedule', icon: CalendarDays, standard: false, premium: true },
  { key: 'milestone', icon: Target, standard: false, premium: true },
  { key: 'aiReport', icon: Sparkles, standard: false, premium: true },
  { key: 'slack', icon: MessageSquare, standard: false, premium: true },
  { key: 'statistics', icon: BarChart3, standard: false, premium: true },
] as const;

export function PremiumBenefitsModal({
  open,
  onClose,
  currentBillableMembers,
  onUpgrade,
}: PremiumBenefitsModalProps) {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [isProcessing, setIsProcessing] = useState(false);
  const minSeats = Math.max(currentBillableMembers, 1);
  const [seatCount, setSeatCount] = useState(minSeats);

  const pricePerSeat = billingCycle === 'MONTHLY' ? PRICE_PER_SEAT.monthly : PRICE_PER_SEAT.yearly;
  const totalPrice = pricePerSeat * seatCount;
  const yearlyMonthlyEquiv = billingCycle === 'YEARLY' ? (PRICE_PER_SEAT.yearly * seatCount) / 12 : null;

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      await onUpgrade(billingCycle, seatCount);
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      console.error('Upgrade failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-2xl p-0">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-1 text-white/60 hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Hero Section */}
        <div className="relative overflow-hidden px-5 sm:px-8 pt-6 sm:pt-10 pb-6 sm:pb-8">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-bridge-accent/20 via-bridge-accent/5 to-bridge-secondary/10" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-bridge-accent/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-bridge-secondary/10 rounded-full blur-[80px]" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-bridge-accent to-bridge-secondary rounded-2xl shadow-lg shadow-bridge-accent/20">
                <Crown className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  {t('premiumBenefits.heroTitle')}
                </h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {t('premiumBenefits.heroSubtitle')}
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex gap-3 mt-6">
              {[
                { value: '6+', labelKey: 'premiumBenefits.statFeatures' },
                { value: 'AI', labelKey: 'premiumBenefits.statReport' },
                { value: 'Slack', labelKey: 'premiumBenefits.statIntegration' },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-center"
                >
                  <p className="text-lg font-bold text-bridge-secondary">{stat.value}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{t(stat.labelKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="px-5 sm:px-8 pb-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
            {t('premiumBenefits.comparisonTitle')}
          </p>

          <div className="rounded-xl border border-foreground/10 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_64px_64px] sm:grid-cols-[1fr_100px_100px] bg-foreground/5 border-b border-foreground/10">
              <div className="px-3 sm:px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {t('premiumBenefits.feature')}
              </div>
              <div className="px-2 sm:px-4 py-3 text-center text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Standard
              </div>
              <div className="px-2 sm:px-4 py-3 text-center text-[10px] sm:text-[11px] font-bold text-bridge-secondary uppercase tracking-widest">
                Premium
              </div>
            </div>

            {/* Table Rows */}
            {COMPARISON_FEATURES.map((feature, index) => (
              <div
                key={feature.key}
                className={`grid grid-cols-[1fr_64px_64px] sm:grid-cols-[1fr_100px_100px] ${
                  index < COMPARISON_FEATURES.length - 1 ? 'border-b border-foreground/5' : ''
                } hover:bg-white/[0.02] transition-colors`}
              >
                <div className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
                  {feature.icon && (
                    <feature.icon className="h-4 w-4 text-slate-500 shrink-0 hidden sm:block" />
                  )}
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {t(`premiumBenefits.features.${feature.key}`)}
                  </span>
                </div>
                <div className="px-2 sm:px-4 py-3 flex items-center justify-center">
                  {feature.standard ? (
                    <Check className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-600" />
                  )}
                </div>
                <div className="px-2 sm:px-4 py-3 flex items-center justify-center">
                  <Check className="h-4 w-4 text-bridge-secondary" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seat Count Selector */}
        <div className="px-5 sm:px-8 pb-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
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

        {/* Pricing Section */}
        <div className="px-5 sm:px-8 pb-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
            {t('premiumBenefits.pricingTitle')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Monthly */}
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-foreground/10 hover:border-bridge-border hover:bg-foreground/5'
              }`}
            >
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">{t('upgrade.monthly')}</p>
                <p className="text-foreground text-lg sm:text-xl font-bold">${PRICE_PER_SEAT.monthly * seatCount}</p>
                <p className="text-slate-500 text-xs">{t('upgrade.perMonth')}</p>
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
                  : 'border-foreground/10 hover:border-bridge-border hover:bg-foreground/5'
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

          <p className="text-slate-500 text-xs mt-3 text-center">
            {t('upgrade.seatInfo', {
              count: seatCount,
              price: pricePerSeat,
              period: billingCycle === 'YEARLY' ? '/year' : '/month',
            })}
          </p>
        </div>

        {/* CTA */}
        <div className="px-5 sm:px-8 pb-6 sm:pb-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 min-h-[44px] bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
          >
            {t('common.later')}
          </button>
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 min-h-[44px] bg-gradient-to-r from-bridge-accent to-bridge-accent/80 text-white rounded-xl font-bold hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Rocket className="h-4 w-4" />
            {isProcessing ? t('common.processing') : t('premiumBenefits.upgradeCta')}
          </button>
        </div>
    </MotionModal>
  );
}
