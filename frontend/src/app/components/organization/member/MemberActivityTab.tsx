import { useTranslation } from 'react-i18next';
import { Clock, TrendingUp } from 'lucide-react';
import type { OrgMemberDetail } from '../../../types';

interface MemberActivityTabProps {
  member: OrgMemberDetail;
  boardCount: number;
}

export function MemberActivityTab({ member: _member, boardCount: _boardCount }: MemberActivityTabProps) {
  const { t } = useTranslation();

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Activity Timeline Placeholder */}
      <div className="bg-foreground/[0.02] rounded-xl border border-foreground/[0.08] p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
          <TrendingUp size={24} className="text-bridge-accent/50" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">
          {t('organization.members.detail.activityTimelineTitle', 'Activity Timeline')}
        </h3>
        <p className="text-xs text-slate-400 max-w-[240px] mx-auto">
          {t('organization.members.detail.activityComingSoon')}
        </p>
      </div>

      {/* Contribution Summary Placeholder */}
      <div className="bg-foreground/[0.02] rounded-xl border border-foreground/[0.08] p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bridge-secondary/15 flex items-center justify-center mx-auto mb-4">
          <Clock size={24} className="text-bridge-secondary/50" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">
          {t('organization.members.detail.contributionTitle', 'Contribution')}
        </h3>
        <p className="text-xs text-slate-400 max-w-[240px] mx-auto">
          {t('organization.members.detail.activityComingSoon')}
        </p>
      </div>
    </div>
  );
}
