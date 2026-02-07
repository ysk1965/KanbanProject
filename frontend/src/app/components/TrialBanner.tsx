import { useTranslation } from 'react-i18next';
import { SubscriptionStatus, BoardTier } from '../types';
import { Button } from './ui/button';
import { Lock } from 'lucide-react';

interface TrialBannerProps {
  status: SubscriptionStatus;
  daysRemaining?: number;
  onOpenSubscription?: () => void;
  tier?: BoardTier;
  hideBilling?: boolean;
}

export function TrialBanner({ status, daysRemaining = 0, onOpenSubscription, tier, hideBilling }: TrialBannerProps) {
  const { t } = useTranslation();

  // TESTER/ADMIN 사용자는 과금 배너 숨김
  if (hideBilling) return null;
  // Standard tier: 간결한 알림 배너
  if (tier === 'STANDARD') {
    return (
      <div className="bg-bridge-obsidian border-b border-white/15 px-6 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">
              {t('trial.standardPlan')}
            </span>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs bg-bridge-accent hover:bg-bridge-accent/90"
            onClick={onOpenSubscription}
          >
            {t('trial.upgradeToPremium')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'ACTIVE' || tier === 'PREMIUM') return null;

  if (status === 'TRIAL') {
    return (
      <div className="bg-blue-900 border-b border-blue-800 px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎉</span>
            <div>
              <span className="font-semibold text-white">
                {t('trial.trialActive', { days: daysRemaining })}
              </span>
              <span className="text-blue-200 ml-2">
                {t('trial.trialRemaining', { days: daysRemaining })}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-blue-400 text-white hover:bg-blue-800"
            onClick={onOpenSubscription}
          >
            {t('trial.viewPricing')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'GRACE') {
    return (
      <div className="bg-yellow-900 border-b border-yellow-800 px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            <div>
              <span className="font-semibold text-white">
                {t('trial.trialEnded')}
              </span>
              <span className="text-yellow-200 ml-2">
                {t('trial.graceWarning')}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-yellow-500 hover:bg-yellow-600 text-slate-900"
            onClick={onOpenSubscription}
          >
            {t('trial.subscribeNow')}
          </Button>
        </div>
      </div>
    );
  }

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
