import { useTranslation } from 'react-i18next';
import { SubscriptionStatus, BoardTier } from '../types';
import { Button } from './ui/button';
import { Crown, Sparkles } from 'lucide-react';

interface TrialBannerProps {
  status: SubscriptionStatus;
  onOpenSubscription?: () => void;
  onOpenPremiumBenefits?: () => void;
  tier?: BoardTier;
  trialEndsAt?: string | null;
  hideBilling?: boolean;
}

export function TrialBanner({ status, onOpenSubscription, onOpenPremiumBenefits, tier, trialEndsAt, hideBilling }: TrialBannerProps) {
  const { t } = useTranslation();

  // TESTER/ADMIN 사용자 또는 milkyway.pe.kr 도메인은 과금 배너 숨김
  if (hideBilling) return null;

  // TRIAL 상태: 남은 일수 카운트다운 배너
  if (status === 'TRIAL' && tier !== 'PREMIUM') {
    const daysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    // 남은 일수에 따라 긴급도 분기
    const isUrgent = daysRemaining <= 3;
    const isExpiring = daysRemaining <= 1;

    const bgClass = isExpiring
      ? 'bg-red-900/80 border-b border-red-800'
      : isUrgent
        ? 'bg-amber-900/80 border-b border-amber-800'
        : 'bg-bridge-accent/15 border-b border-bridge-accent/30';

    const textClass = isExpiring
      ? 'text-red-200'
      : isUrgent
        ? 'text-amber-200'
        : 'text-bridge-accent';

    const descClass = isExpiring
      ? 'text-red-300'
      : isUrgent
        ? 'text-amber-300'
        : 'text-slate-400';

    const buttonClass = isExpiring
      ? 'bg-red-500 hover:bg-red-600'
      : isUrgent
        ? 'bg-amber-500 hover:bg-amber-600 text-slate-900'
        : 'bg-bridge-accent hover:bg-bridge-accent/90';

    return (
      <div className={`${bgClass} px-6 py-2.5`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${textClass}`} />
            <span className={`text-sm font-semibold ${textClass}`}>
              {t('trial.trialActive', { days: daysRemaining })}
            </span>
            <span className={`text-sm ${descClass} hidden sm:inline`}>
              {t('trial.trialRemaining', { days: daysRemaining })}
            </span>
          </div>
          <Button
            size="sm"
            className={`h-7 text-xs ${buttonClass}`}
            onClick={onOpenPremiumBenefits || onOpenSubscription}
          >
            {t('trial.upgradeToPremium')}
          </Button>
        </div>
      </div>
    );
  }

  // Standard tier: Premium 유도 배너
  if (tier === 'STANDARD') {
    return (
      <div className="bg-bridge-obsidian border-b border-white/15 px-6 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-slate-400">
              {t('trial.standardPlan')}
            </span>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs bg-bridge-accent hover:bg-bridge-accent/90"
            onClick={onOpenPremiumBenefits || onOpenSubscription}
          >
            {t('trial.upgradeToPremium')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'ACTIVE' || tier === 'PREMIUM') return null;

  if (status === 'SUSPENDED') {
    return (
      <div className="bg-red-900 border-b border-red-800 px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔒</span>
            <div>
              <span className="font-semibold text-white">
                {t('trial.boardSuspended')}
              </span>
              <span className="text-red-200 ml-2">
                {t('trial.suspendedDesc')}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600"
              onClick={onOpenSubscription}
            >
              {t('trial.subscribe')}
            </Button>
            <Button variant="outline" size="sm" className="border-red-400 text-white hover:bg-red-800">
              {t('trial.exportData')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
