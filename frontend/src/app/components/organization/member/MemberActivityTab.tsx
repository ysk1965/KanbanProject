import { useTranslation } from 'react-i18next';
import { Calendar, LayoutGrid, Clock, FileText } from 'lucide-react';
import type { OrgMemberDetail, ContractType } from '../../../types';

interface MemberActivityTabProps {
  member: OrgMemberDetail;
  boardCount: number;
}

const CONTRACT_LABELS: Record<ContractType, string> = {
  FULL_TIME: 'fullTime',
  CONTRACT: 'contract',
  INTERN: 'intern',
  PART_TIME: 'partTime',
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatTenure(months: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!months || isNaN(months)) return '—';
  if (months < 12) return t('organization.members.detail.tenureMonths', { count: months });
  const y = Math.floor(months / 12);
  const m = months % 12;
  return t('organization.members.detail.tenureYears', { years: y, months: m });
}

export function MemberActivityTab({ member, boardCount }: MemberActivityTabProps) {
  const { t } = useTranslation();

  const stats = [
    { icon: <Calendar size={20} className="text-bridge-accent" />, label: t('organization.members.detail.statsHireDate'), value: formatDate(member.hire_date) },
    { icon: <LayoutGrid size={20} className="text-bridge-secondary" />, label: t('organization.members.detail.statsBoards'), value: `${boardCount}` },
    { icon: <Clock size={20} className="text-amber-500" />, label: t('organization.members.detail.statsTenure'), value: formatTenure(member.tenure_months, t) },
    { icon: <FileText size={20} className="text-purple-500" />, label: t('organization.members.detail.statsContract'), value: t(`organization.members.detail.${CONTRACT_LABELS[member.contract_type]}`) },
  ];

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <div key={i} className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-4 text-center">
            <div className="flex justify-center mb-2">{stat.icon}</div>
            <div className="text-[11px] text-slate-400 mb-1">{stat.label}</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Activity Timeline Placeholder */}
      <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-bridge-accent/10 flex items-center justify-center mx-auto mb-3">
          <Clock size={24} className="text-bridge-accent/50" />
        </div>
        <p className="text-sm text-slate-400">{t('organization.members.detail.activityComingSoon')}</p>
      </div>
    </div>
  );
}
