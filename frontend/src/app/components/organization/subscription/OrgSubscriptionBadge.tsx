import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';

interface OrgSubscriptionBadgeProps {
  plan: string;
  status: string;
  trialEndsAt?: string | null;
  size?: 'sm' | 'md';
}

export function OrgSubscriptionBadge({
  plan,
  status,
  trialEndsAt,
  size = 'sm',
}: OrgSubscriptionBadgeProps) {
  const { t } = useTranslation();

  const textSize = size === 'sm' ? 'text-xs' : 'text-xs';

  if (status === 'TRIAL' && trialEndsAt) {
    const now = new Date();
    const end = new Date(trialEndsAt);
    const diffMs = end.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return (
      <span
        className={`${textSize} font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1`}
      >
        {t('orgSubscription.badge.trial', 'HR Trial')}
        <span className="opacity-70">
          {t('orgSubscription.badge.daysLeft', '{{days}}d left', { days: daysLeft })}
        </span>
      </span>
    );
  }

  if (plan === 'TEAM' && (status === 'ACTIVE' || status === 'PAST_DUE')) {
    return (
      <span
        className={`${textSize} font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent inline-flex items-center gap-1`}
      >
        <Crown size={size === 'sm' ? 10 : 12} />
        {t('orgSubscription.badge.team', 'Team')}
      </span>
    );
  }

  // FREE plan
  return (
    <span
      className={`${textSize} font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400`}
    >
      {t('orgSubscription.badge.free', 'Free')}
    </span>
  );
}
