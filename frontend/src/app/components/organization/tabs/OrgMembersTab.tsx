import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Users, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService } from '../../../utils/services';
import { MotionModal } from '../../ui/MotionModal';
import { MemberDetailModal } from '../MemberDetailModal';
import type {
  OrgMemberSimple, OrgMemberPageResponse, OrgDepartment, OrgJobGroup,
  OrgRole, ContractType, WorkStatus, OrgMemberInviteResult,
} from '../../../types';

interface OrgMembersTabProps {
  orgId: string;
  myRole: OrgRole;
  myUserId: string;
}

const CONTRACT_BADGE: Record<ContractType, string> = {
  FULL_TIME: 'bg-bridge-accent/20 text-bridge-accent',
  CONTRACT: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  INTERN: 'bg-bridge-secondary/20 text-bridge-secondary',
  PART_TIME: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
};

const STATUS_BADGE: Record<WorkStatus, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  ON_LEAVE: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  RESIGNED: 'bg-red-500/20 text-red-600 dark:text-red-400',
};

export function OrgMembersTab({ orgId, myRole, myUserId }: OrgMembersTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const [members, setMembers] = useState<OrgMemberSimple[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER', department_id: '', job_title: '' });
  const [inviting, setInviting] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [jobGroupFilter, setJobGroupFilter] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const data: OrgMemberPageResponse = await organizationService.getMembers(orgId, {
        department_id: departmentFilter || undefined,
        job_group_id: jobGroupFilter || undefined,
        contract_type: contractFilter || undefined,
        work_status: statusFilter || undefined,
        search: search || undefined,
        page,
        size: 20,
      });
      setMembers(data.content);
      setTotalElements(data.total_elements);
    } catch (error) {
      console.warn('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId, departmentFilter, jobGroupFilter, contractFilter, statusFilter, search, page]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [depts, jgs] = await Promise.all([
          organizationService.getDepartments(orgId),
          organizationService.getJobGroups(orgId),
        ]);
        setDepartments(depts);
        setJobGroups(jgs);
      } catch {
        // Filters are optional
      }
    };
    fetchFilters();
  }, [orgId]);

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) return;
    try {
      setInviting(true);
      await organizationService.inviteMember(orgId, {
        email: inviteForm.email.trim(),
        role: inviteForm.role || undefined,
        department_id: inviteForm.department_id || undefined,
        job_title: inviteForm.job_title || undefined,
      });
      setShowInviteModal(false);
      setInviteForm({ email: '', role: 'MEMBER', department_id: '', job_title: '' });
      fetchMembers();
    } catch (error) {
      console.warn('Failed to invite member:', error);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('organization.members.searchPlaceholder', 'Search by name or email...')}
            className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {departments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(0); }}
            className="bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          >
            <option value="">{t('organization.members.allDepartments', 'All Departments')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
        >
          <option value="">{t('organization.members.allStatuses', 'All Statuses')}</option>
          <option value="ACTIVE">{t('organization.members.active', 'Active')}</option>
          <option value="ON_LEAVE">{t('organization.members.onLeave', 'On Leave')}</option>
          <option value="RESIGNED">{t('organization.members.resigned', 'Resigned')}</option>
        </select>

        {isAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 transition-all"
          >
            <Plus size={16} />
            {t('organization.members.invite', 'Invite')}
          </button>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users size={12} />
        {t('organization.members.resultCount', '{{count}} members found', { count: totalElements })}
      </div>

      {/* Member Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-bridge-obsidian rounded-xl border border-foreground/[0.05] animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-bridge-accent/10 flex items-center justify-center mb-4">
            <Users size={32} className="text-bridge-accent/60" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            {t('organization.members.emptyTitle', 'No members found')}
          </h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">
            {t('organization.members.emptyDesc', 'Invite team members to collaborate in this organization.')}
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
            >
              <Plus size={16} />
              {t('organization.members.invite', 'Invite')}
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {members.map((member, index) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => setSelectedMemberId(member.id)}
              className="bg-bridge-obsidian rounded-xl border border-foreground/[0.05] p-4 hover:border-bridge-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-bridge-accent/20 flex items-center justify-center text-sm text-bridge-accent font-bold shrink-0">
                  {member.user.profile_image ? (
                    <img src={member.user.profile_image} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    member.user.name?.charAt(0) || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium text-sm truncate">{member.user.name}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${CONTRACT_BADGE[member.contract_type]}`}>
                      {member.contract_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {member.department?.name && <span>{member.department.name}</span>}
                    {member.department?.name && member.job_title && <span> · </span>}
                    {member.job_title && <span>{member.job_title}</span>}
                  </div>
                </div>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[member.work_status]}`}>
                  {member.work_status.replace('_', ' ')}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Member Detail Modal */}
      <MemberDetailModal
        open={!!selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
        orgId={orgId}
        memberId={selectedMemberId || ''}
        myRole={myRole}
        myUserId={myUserId}
        departments={departments}
        jobGroups={jobGroups}
        onMemberUpdated={fetchMembers}
      />

      {/* Invite Modal */}
      <MotionModal open={showInviteModal} onClose={() => setShowInviteModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-6 pt-5 pb-4 border-b border-foreground/[0.08]">
          <h2 className="text-lg font-bold text-foreground">{t('organization.members.inviteTitle', 'Invite Member')}</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.members.email', 'Email')}
            </label>
            <input
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              placeholder="user@example.com"
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.members.role', 'Role')}
            </label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {departments.length > 0 && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                {t('organization.members.department', 'Department')}
              </label>
              <select
                value={inviteForm.department_id}
                onChange={(e) => setInviteForm({ ...inviteForm, department_id: e.target.value })}
                className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              >
                <option value="">{t('common.none', 'None')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.members.jobTitle', 'Job Title')}
            </label>
            <input
              type="text"
              value={inviteForm.job_title}
              onChange={(e) => setInviteForm({ ...inviteForm, job_title: e.target.value })}
              placeholder={t('organization.members.jobTitlePlaceholder', 'e.g. Frontend Developer')}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInviteModal(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleInvite}
              disabled={!inviteForm.email.trim() || inviting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
            >
              {inviting ? t('common.sending', 'Sending...') : t('organization.members.sendInvite', 'Send Invite')}
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
