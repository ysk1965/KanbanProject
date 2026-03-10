import { motion } from 'framer-motion';
import { Building2, ChevronRight, LayoutGrid, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { OrganizationSimple } from '../../types';

interface OrgSummaryStripProps {
  organizations: OrganizationSimple[];
  onOrgClick: (orgId: string) => void;
  onViewAll: () => void;
}

export default function OrgSummaryStrip({
  organizations,
  onOrgClick,
  onViewAll,
}: OrgSummaryStripProps) {
  const { t } = useTranslation();

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'OWNER':
        return t('organization.role.owner', 'Owner');
      case 'ADMIN':
        return t('organization.role.admin', 'Admin');
      default:
        return t('organization.role.member', 'Member');
    }
  };

  return (
    <div>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-bridge-accent" />
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
            {t('dashboard.myOrganizations', 'My Organizations')}
          </h2>
          <span className="text-[10px] text-slate-600">
            {organizations.length}
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="text-[10px] font-bold text-slate-500 hover:text-foreground transition-colors"
        >
          {t('common.viewAll', 'View All')}
        </button>
      </div>

      {/* Container Card */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] divide-y divide-foreground/[0.06] overflow-hidden">
        {organizations.map((org, index) => (
          <motion.button
            key={org.id}
            onClick={() => onOrgClick(org.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="flex items-center gap-3 px-4 py-2.5 w-full text-left group hover:bg-foreground/[0.03] transition-colors"
          >
            {/* Logo */}
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt={org.name}
                className="w-7 h-7 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-bridge-accent/10 flex items-center justify-center shrink-0">
                <Building2 size={14} className="text-bridge-accent" />
              </div>
            )}

            {/* Name */}
            <span className="text-[13px] font-bold text-foreground truncate flex-1 min-w-0">
              {org.name}
            </span>

            {/* Role Badge */}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0">
              {getRoleLabel(org.my_role)}
            </span>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-2.5 shrink-0">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <Users size={10} />
                {org.member_count}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <LayoutGrid size={10} />
                {org.board_count}
              </span>
            </div>

            {/* Chevron */}
            <ChevronRight
              size={14}
              className="text-slate-600 group-hover:text-foreground transition-colors shrink-0"
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
