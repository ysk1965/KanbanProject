import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Phone, Cake, Calendar, Clock, LayoutGrid, FileText, Copy, Check, Briefcase, Award, GraduationCap } from 'lucide-react';
import type { OrgMemberDetail, OrgMemberBoard, LeaveBalance, ContractType } from '../../../types';

interface MemberSidebarProps {
  member: OrgMemberDetail;
  boards: OrgMemberBoard[];
  leaveBalances: LeaveBalance[];
  isAdmin: boolean;
  isSelf: boolean;
  hrSystemEnabled?: boolean;
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

function formatBirthday(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1)}/${String(d.getDate()).padStart(2, '0')}`;
}

export function MemberSidebar({ member, boards, leaveBalances, isAdmin, isSelf, hrSystemEnabled }: MemberSidebarProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const canViewPrivate = isAdmin || isSelf;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(member.user.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <div className="w-[260px] shrink-0 border-l border-foreground/[0.08] overflow-y-auto bg-foreground/[0.01]">
      <div className="p-4 space-y-5">

        {/* Contact Info */}
        <SidebarSection title={t('organization.members.detail.sidebarContact')}>
          {/* Email */}
          <div className="flex items-center gap-2 group">
            <Mail size={13} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate flex-1">{member.user.email}</span>
            <button
              onClick={handleCopyEmail}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-bridge-accent transition-all"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
          </div>

          {/* Phone */}
          {member.phone && (
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500">{member.phone}</span>
            </div>
          )}

          {/* Birthday */}
          {canViewPrivate && member.birth_date && (
            <div className="flex items-center gap-2">
              <Cake size={13} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500">{formatBirthday(member.birth_date)}</span>
            </div>
          )}
        </SidebarSection>

        {/* Quick Stats */}
        <SidebarSection title={t('organization.members.detail.sidebarOverview')}>
          {!hrSystemEnabled && (
            <StatRow icon={Calendar} label={t('organization.members.detail.statsHireDate')} value={formatDate(member.hire_date)} />
          )}
          {!hrSystemEnabled && (
            <StatRow icon={Clock} label={t('organization.members.detail.statsTenure')} value={formatTenure(member.tenure_months, t)} />
          )}
          <StatRow icon={LayoutGrid} label={t('organization.members.detail.statsBoards')} value={`${boards.length}`} />
          {!hrSystemEnabled && (
            <StatRow
              icon={FileText}
              label={t('organization.members.detail.statsContract')}
              value={t(`organization.members.detail.${CONTRACT_LABELS[member.contract_type]}`)}
            />
          )}
          {member.position && (
            <StatRow icon={Briefcase} label={t('organization.members.detail.position')} value={member.position.name} />
          )}
          {member.title && (
            <StatRow icon={Award} label={t('organization.members.detail.title')} value={member.title.name} />
          )}
          {member.grade && (
            <StatRow icon={GraduationCap} label={t('organization.members.detail.grade')} value={member.grade.name} />
          )}
        </SidebarSection>

        {/* Leave Balance */}
        {!hrSystemEnabled && canViewPrivate && leaveBalances.length > 0 && (
          <SidebarSection title={`${t('organization.members.detail.leaveBalance')} (${new Date().getFullYear()})`}>
            <div className="space-y-2.5">
              {leaveBalances.map((lb) => {
                const pct = lb.total_days > 0 ? (lb.used_days / lb.total_days) * 100 : 0;
                const barColor = pct >= 80 ? 'bg-amber-500' : 'bg-bridge-accent';
                return (
                  <div key={lb.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-500">{lb.policy_name}</span>
                      <span className="text-[11px] font-bold text-foreground">
                        {lb.used_days}/{lb.total_days}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-foreground/[0.03] rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SidebarSection>
        )}

        {/* Bio */}
        {member.bio && (
          <SidebarSection title={t('organization.members.detail.sidebarBio')}>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {member.bio}
            </p>
          </SidebarSection>
        )}
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-4 border-b border-foreground/[0.08] last:border-0 last:pb-0">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-slate-400" />
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}
