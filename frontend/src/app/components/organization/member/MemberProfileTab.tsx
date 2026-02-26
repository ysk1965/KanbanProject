import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { organizationService } from '../../../utils/services';
import type {
  OrgMemberDetail, OrgRole, ContractType, WorkStatus, LeaveBalance,
  OrgDepartment, OrgJobGroup,
} from '../../../types';

interface MemberProfileTabProps {
  member: OrgMemberDetail;
  orgId: string;
  myRole: OrgRole;
  isSelf: boolean;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  onUpdate: (updated: OrgMemberDetail) => void;
}

const CONTRACT_LABELS: Record<ContractType, string> = {
  FULL_TIME: 'fullTime',
  CONTRACT: 'contract',
  INTERN: 'intern',
  PART_TIME: 'partTime',
};

const CONTRACT_OPTIONS: ContractType[] = ['FULL_TIME', 'CONTRACT', 'INTERN', 'PART_TIME'];
const STATUS_OPTIONS: WorkStatus[] = ['ACTIVE', 'ON_LEAVE', 'RESIGNED'];

function formatTenure(months: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!months || isNaN(months)) return '—';
  if (months < 12) return t('organization.members.detail.tenureMonths', { count: months });
  const y = Math.floor(months / 12);
  const m = months % 12;
  return t('organization.members.detail.tenureYears', { years: y, months: m });
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function MemberProfileTab({ member, orgId, myRole, isSelf, departments, jobGroups, onUpdate }: MemberProfileTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const canEditInfo = isAdmin;
  const canEditSelf = isSelf;
  const canEdit = canEditInfo || canEditSelf;

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: member.employee_id || '',
    contract_type: member.contract_type,
    work_status: member.work_status,
    department_id: member.department?.id || '',
    job_group_id: member.job_group?.id || '',
    job_title: member.job_title || '',
    phone: member.phone || '',
    birth_date: member.birth_date || '',
    hire_date: member.hire_date || '',
  });

  // Bio edit state
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bio, setBio] = useState(member.bio || '');
  const [savingBio, setSavingBio] = useState(false);

  // Leave balances
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);

  useEffect(() => {
    if (isAdmin || isSelf) {
      organizationService.getMemberLeaveBalances(orgId, member.id).then(setLeaveBalances).catch(() => {});
    }
  }, [orgId, member.id, isAdmin, isSelf]);

  const handleSaveInfo = async () => {
    try {
      setSaving(true);
      const updated = await organizationService.updateMember(orgId, member.id, {
        ...(isAdmin ? {
          employee_id: form.employee_id || null,
          contract_type: form.contract_type,
          work_status: form.work_status,
          birth_date: form.birth_date || null,
          hire_date: form.hire_date || null,
        } : {}),
        department_id: form.department_id || null,
        job_group_id: form.job_group_id || null,
        job_title: form.job_title || null,
        phone: form.phone || null,
      });
      onUpdate(updated);
      setIsEditing(false);
    } catch (error) {
      console.warn('Failed to update member:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBio = async () => {
    try {
      setSavingBio(true);
      const updated = await organizationService.updateMember(orgId, member.id, { bio: bio || null });
      onUpdate(updated);
      setIsEditingBio(false);
    } catch (error) {
      console.warn('Failed to update bio:', error);
    } finally {
      setSavingBio(false);
    }
  };

  const infoFields = [
    { key: 'employee_id', label: t('organization.members.detail.employeeId'), value: member.employee_id, adminOnly: true },
    { key: 'contract_type', label: t('organization.members.detail.contractType'), value: t(`organization.members.detail.${CONTRACT_LABELS[member.contract_type]}`), adminOnly: true },
    { key: 'job_group', label: t('organization.members.detail.jobGroup'), value: member.job_group?.name },
    { key: 'department', label: t('organization.members.detail.department'), value: member.department?.name },
    { key: 'job_title', label: t('organization.members.detail.jobTitle'), value: member.job_title },
    { key: 'phone', label: t('organization.members.detail.phone'), value: member.phone },
    { key: 'birth_date', label: t('organization.members.detail.birthDate'), value: formatDate(member.birth_date), adminOnly: true },
    { key: 'hire_date', label: t('organization.members.detail.hireDate'), value: formatDate(member.hire_date), adminOnly: true },
    { key: 'tenure', label: t('organization.members.detail.tenure'), value: member.tenure_months != null ? formatTenure(member.tenure_months, t) : '—', readOnly: true },
  ];

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Personal Info Card */}
      <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white">{t('organization.members.detail.personalInfo')}</h3>
          {canEdit && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-bridge-accent transition-colors">
              <Pencil size={12} />
              {t('organization.members.detail.edit')}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-0">
              {/* Employee ID */}
              {isAdmin && (
                <EditRow label={t('organization.members.detail.employeeId')}>
                  <input type="text" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
                </EditRow>
              )}
              {/* Contract Type */}
              {isAdmin && (
                <EditRow label={t('organization.members.detail.contractType')}>
                  <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value as ContractType })}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50">
                    {CONTRACT_OPTIONS.map((ct) => (
                      <option key={ct} value={ct}>{t(`organization.members.detail.${CONTRACT_LABELS[ct]}`)}</option>
                    ))}
                  </select>
                </EditRow>
              )}
              {/* Job Group */}
              <EditRow label={t('organization.members.detail.jobGroup')}>
                <select value={form.job_group_id} onChange={(e) => setForm({ ...form, job_group_id: e.target.value })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50">
                  <option value="">—</option>
                  {jobGroups.map((jg) => <option key={jg.id} value={jg.id}>{jg.name}</option>)}
                </select>
              </EditRow>
              {/* Department */}
              <EditRow label={t('organization.members.detail.department')}>
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50">
                  <option value="">—</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </EditRow>
              {/* Job Title */}
              <EditRow label={t('organization.members.detail.jobTitle')}>
                <input type="text" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
              </EditRow>
              {/* Phone */}
              <EditRow label={t('organization.members.detail.phone')}>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
              </EditRow>
              {/* Birth Date */}
              {isAdmin && (
                <EditRow label={t('organization.members.detail.birthDate')}>
                  <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
                </EditRow>
              )}
              {/* Hire Date */}
              {isAdmin && (
                <EditRow label={t('organization.members.detail.hireDate')}>
                  <input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
                </EditRow>
              )}

              {/* Save / Cancel */}
              <div className="flex justify-end gap-2 pt-3">
                <button onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors">
                  {t('organization.members.detail.cancel')}
                </button>
                <button onClick={handleSaveInfo} disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all disabled:opacity-50">
                  {saving ? '...' : t('organization.members.detail.save')}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                {infoFields.map((field) => (
                  <div key={field.key} className="flex items-center py-2.5 border-b border-black/[0.03] dark:border-white/[0.03]">
                    <span className="w-20 text-xs text-slate-400 shrink-0">{field.label}</span>
                    <span className="text-sm text-slate-900 dark:text-white truncate">{field.value || '—'}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bio Card */}
      <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white">{t('organization.members.detail.bio')}</h3>
          {(isAdmin || isSelf) && !isEditingBio && (
            <button onClick={() => setIsEditingBio(true)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-bridge-accent transition-colors">
              <Pencil size={12} />
              {t('organization.members.detail.edit')}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {isEditingBio ? (
            <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder={t('organization.members.detail.bioPlaceholder')}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white rounded-xl p-3 text-sm placeholder-slate-400 dark:placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-slate-400">{bio.length}/500</span>
                <div className="flex gap-2">
                  <button onClick={() => { setBio(member.bio || ''); setIsEditingBio(false); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors">
                    {t('organization.members.detail.cancel')}
                  </button>
                  <button onClick={handleSaveBio} disabled={savingBio}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all disabled:opacity-50">
                    {savingBio ? '...' : t('organization.members.detail.save')}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {member.bio ? (
                <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{member.bio}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  {isSelf ? t('organization.members.detail.bioPlaceholder') : t('organization.members.detail.noBio')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Leave Balance (Admin or Self) */}
      {leaveBalances.length > 0 && (
        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-5">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-4">
            {t('organization.members.detail.leaveBalance')} ({new Date().getFullYear()})
          </h3>
          <div className="space-y-3">
            {leaveBalances.map((lb) => {
              const pct = lb.total_days > 0 ? (lb.used_days / lb.total_days) * 100 : 0;
              const barColor = pct >= 80 ? 'bg-amber-500' : 'bg-bridge-accent';
              return (
                <div key={lb.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{lb.policy_name}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{lb.used_days} / {lb.total_days}{t('organization.members.detail.tenureMonths', { count: '' }).includes('월') ? '일' : ' days'}</span>
                  </div>
                  <div className="w-full h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-black/[0.03] dark:border-white/[0.03] last:border-0">
      <span className="w-24 text-xs text-slate-400 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
