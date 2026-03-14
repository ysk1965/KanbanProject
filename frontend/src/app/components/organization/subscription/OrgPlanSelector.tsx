import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Users,
  LayoutGrid,
  Shield,
  Crown,
  Check,
  BarChart3,
  Network,
} from 'lucide-react';

interface OrgPlanSelectorProps {
  currentPlan: string;
  orgId: string;
  onSelectPlan: (plan: 'FREE' | 'TEAM') => void;
}

interface PlanFeature {
  icon: React.ReactNode;
  label: string;
}

export function OrgPlanSelector({
  currentPlan,
  onSelectPlan,
}: OrgPlanSelectorProps) {
  const { t } = useTranslation();

  const freePlanFeatures: PlanFeature[] = [
    {
      icon: <Network size={13} />,
      label: t('orgSubscription.plan.free.orgChart', 'Org chart'),
    },
    {
      icon: <Users size={13} />,
      label: t('orgSubscription.plan.free.memberMgmt', 'Member management'),
    },
    {
      icon: <Shield size={13} />,
      label: t('orgSubscription.plan.free.hrReadOnly', 'HR data (read-only)'),
    },
    {
      icon: <LayoutGrid size={13} />,
      label: t('orgSubscription.plan.free.boardLimit', 'Up to 3 boards'),
    },
  ];

  const teamPlanFeatures: PlanFeature[] = [
    {
      icon: <LayoutGrid size={13} />,
      label: t('orgSubscription.plan.team.unlimitedBoards', 'Unlimited boards'),
    },
    {
      icon: <Shield size={13} />,
      label: t('orgSubscription.plan.team.hrFull', 'HR full access'),
    },
    {
      icon: <Crown size={13} />,
      label: t('orgSubscription.plan.team.premiumFeatures', 'Premium board features'),
    },
    {
      icon: <BarChart3 size={13} />,
      label: t('orgSubscription.plan.team.insights', 'Advanced insights'),
    },
    {
      icon: <Users size={13} />,
      label: t('orgSubscription.plan.team.unlimitedMembers', 'Unlimited members'),
    },
  ];

  const plans: Array<{
    key: 'FREE' | 'TEAM';
    title: string;
    subtitle: string;
    price: string;
    priceUnit: string;
    features: PlanFeature[];
    accent: string;
    accentBg: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'FREE',
      title: t('orgSubscription.plan.free.title', 'Free'),
      subtitle: t('orgSubscription.plan.free.subtitle', 'Basic organization management'),
      price: '$0',
      priceUnit: '',
      features: freePlanFeatures,
      accent: 'text-slate-400',
      accentBg: 'bg-slate-500/15',
      icon: <Users size={18} className="text-slate-400" />,
    },
    {
      key: 'TEAM',
      title: t('orgSubscription.plan.team.title', 'Team'),
      subtitle: t('orgSubscription.plan.team.subtitle', 'Full-featured team workspace'),
      price: '$15',
      priceUnit: t('orgSubscription.plan.team.priceUnit', '/seat/mo'),
      features: teamPlanFeatures,
      accent: 'text-bridge-accent',
      accentBg: 'bg-bridge-accent/15',
      icon: <Crown size={18} className="text-bridge-accent" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {plans.map((plan, index) => {
        const isCurrent = currentPlan === plan.key;
        return (
          <motion.div
            key={plan.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            onClick={() => onSelectPlan(plan.key)}
            className={`relative bg-bridge-obsidian rounded-2xl border p-5 transition-all cursor-pointer ${
              isCurrent
                ? 'border-bridge-accent shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                : 'border-foreground/[0.08] hover:border-foreground/[0.12]'
            }`}
          >
            {isCurrent && (
              <span className="absolute top-3 right-3 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                {t('orgSubscription.plan.current', 'Current')}
              </span>
            )}

            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-9 h-9 rounded-xl ${plan.accentBg} flex items-center justify-center`}
              >
                {plan.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{plan.title}</h3>
                <p className="text-xs text-slate-500">{plan.subtitle}</p>
              </div>
            </div>

            <div className="mb-4">
              <span className="text-2xl font-bold text-foreground">{plan.price}</span>
              {plan.priceUnit && (
                <span className="text-xs text-slate-400 ml-1">{plan.priceUnit}</span>
              )}
            </div>

            <div className="space-y-2">
              {plan.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check size={12} className={plan.accent} />
                  <span className="text-[12px] text-slate-400">{feature.label}</span>
                </div>
              ))}
            </div>

            {!isCurrent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPlan(plan.key);
                }}
                className={`mt-4 w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                  plan.key === 'TEAM'
                    ? 'bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                    : 'bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10'
                }`}
              >
                {plan.key === 'TEAM'
                  ? t('orgSubscription.plan.upgrade', 'Upgrade to Team')
                  : t('orgSubscription.plan.downgrade', 'Downgrade to Free')}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
