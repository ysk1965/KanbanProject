import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Users, X, ChevronLeft, ChevronRight, Mail, Link2, Copy, Check, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { organizationService } from '../../../utils/services';
import { MotionModal } from '../../ui/MotionModal';
import { MemberDetailModal } from '../MemberDetailModal';
import type {
  OrgMemberSimple, OrgMemberPageResponse, OrgDepartment, OrgJobGroup,
  OrgPosition, OrgTitle, OrgGrade,
  OrgRole, ContractType, WorkStatus, OrgMemberInviteResult, OrgInviteLink,
  OrgStructureSettings,
} from '../../../types';

interface OrgMembersTabProps {
  orgId: string;
  myRole: OrgRole;
  myUserId: string;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
  structureSettings: OrgStructureSettings;
  hrSystemEnabled?: boolean;
}

const CONTRACT_BADGE: Record<ContractType, string> = {
  FULL_TIME: 'bg-bridge-accent/15 text-bridge-accent',
  CONTRACT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  INTERN: 'bg-bridge-secondary/15 text-bridge-secondary',
  PART_TIME: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
};

const CONTRACT_LABEL_KEYS: Record<ContractType, string> = {
  FULL_TIME: 'organization.members.contractFullTime',
  CONTRACT: 'organization.members.contractContract',
  INTERN: 'organization.members.contractIntern',
  PART_TIME: 'organization.members.contractPartTime',
};

const STATUS_BADGE: Record<WorkStatus, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  ON_LEAVE: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  RESIGNED: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const STATUS_LABEL_KEYS: Record<WorkStatus, string> = {
  ACTIVE: 'organization.members.statusActive',
  ON_LEAVE: 'organization.members.statusOnLeave',
  RESIGNED: 'organization.members.statusResigned',
};

export function OrgMembersTab({ orgId, myRole, myUserId, departments, jobGroups, positions, titles, grades, structureSettings, hrSystemEnabled }: OrgMembersTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const [members, setMembers] = useState<OrgMemberSimple[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState<'email' | 'link'>('email');
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER', department_id: '', job_title: '' });
  const [inviting, setInviting] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Invite link states
  const [inviteLinks, setInviteLinks] = useState<OrgInviteLink[]>([]);
  const [linkRole, setLinkRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [linkExpiry, setLinkExpiry] = useState('7');
  const [linkMaxUses, setLinkMaxUses] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  const fetchInviteLinks = useCallback(async () => {
    try {
      const links = await organizationService.getInviteLinks(orgId).catch(() => []);
      setInviteLinks(links);
    } catch {
      // ignore
    }
  }, [orgId]);

  useEffect(() => {
    if (showInviteModal && inviteTab === 'link') {
      fetchInviteLinks();
    }
  }, [showInviteModal, inviteTab, fetchInviteLinks]);

  const handleCreateLink = async () => {
    try {
      setCreatingLink(true);
      await organizationService.createInviteLink(orgId, {
        role: linkRole,
        max_uses: linkMaxUses ? Number(linkMaxUses) : null,
        expires_in_days: linkExpiry ? Number(linkExpiry) : undefined,
      });
      setLinkRole('MEMBER');
      setLinkExpiry('7');
      setLinkMaxUses('');
      fetchInviteLinks();
      toast.success(t('organization.members.linkCreated', 'Invite link created'));
    } catch {
      toast.error(t('organization.members.linkCreateError', 'Failed to create invite link'));
    } finally {
      setCreatingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await organizationService.deleteInviteLink(orgId, linkId);
      fetchInviteLinks();
    } catch {
      toast.error(t('organization.members.linkDeleteError', 'Failed to delete invite link'));
    }
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/org-invite/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      toast.success(t('organization.members.linkCopied', 'Link copied to clipboard'));
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const formatExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null;
    return new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

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
      toast.success(t('organization.members.inviteSuccess', 'Invite sent successfully'));
    } catch (error) {
      console.warn('Failed to invite member:', error);
      toast.error(t('organization.members.inviteError', 'Failed to invite member'));
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
            className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {structureSettings.departments_enabled && departments.length > 0 && (
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

        {!hrSystemEnabled && (
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
        )}

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
            <div key={i} className="h-24 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] animate-pulse" />
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
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => setSelectedMemberId(member.id)}
              className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 hover:border-foreground/[0.12] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-bridge-accent/15 flex items-center justify-center text-sm text-bridge-accent font-bold shrink-0">
                  {member.user.profile_image ? (
                    <img src={member.user.profile_image} alt={member.user.name || '프로필'} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    member.user.name?.charAt(0) || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium text-sm truncate">{member.user.name}</span>
                    {!hrSystemEnabled && (
                      <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded-full ${CONTRACT_BADGE[member.contract_type]}`}>
                        {t(CONTRACT_LABEL_KEYS[member.contract_type])}
                      </span>
                    )}
                    {structureSettings.positions_enabled && member.position?.name && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                        {member.position.name}
                      </span>
                    )}
                    {structureSettings.grades_enabled && member.grade?.name && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-300">
                        {member.grade.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {structureSettings.departments_enabled && member.department?.name && <span>{member.department.name}</span>}
                    {structureSettings.departments_enabled && member.department?.name && member.job_title && <span> · </span>}
                    {member.job_title && <span>{member.job_title}</span>}
                  </div>
                </div>
                {!hrSystemEnabled && (
                  <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[member.work_status]}`}>
                    {t(STATUS_LABEL_KEYS[member.work_status])}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalElements > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            {t('organization.members.resultCount', '{{count}} members found', { count: totalElements })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-muted-foreground text-xs px-2">
              {page + 1} / {Math.ceil(totalElements / 20) || 1}
            </span>
            <button
              onClick={() => setPage(Math.min(Math.ceil(totalElements / 20) - 1, page + 1))}
              disabled={page >= Math.ceil(totalElements / 20) - 1}
              className="p-1.5 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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
        positions={positions}
        titles={titles}
        grades={grades}
        structureSettings={structureSettings}
        onMemberUpdated={fetchMembers}
      />

      {/* Invite Modal */}
      <MotionModal open={showInviteModal} onClose={() => setShowInviteModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-5 pt-4 pb-0 border-b border-foreground/[0.08]">
          <h2 className="text-lg font-bold text-foreground mb-3">{t('organization.members.inviteTitle', 'Invite Member')}</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setInviteTab('email')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                inviteTab === 'email'
                  ? 'text-bridge-accent border-b-2 border-bridge-accent'
                  : 'text-slate-400 hover:text-foreground'
              }`}
            >
              <Mail size={14} />
              {t('organization.members.tabEmail', 'Email')}
            </button>
            <button
              onClick={() => setInviteTab('link')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                inviteTab === 'link'
                  ? 'text-bridge-accent border-b-2 border-bridge-accent'
                  : 'text-slate-400 hover:text-foreground'
              }`}
            >
              <Link2 size={14} />
              {t('organization.members.tabLink', 'Invite Link')}
            </button>
          </div>
        </div>

        {inviteTab === 'email' ? (
          <>
            <div className="px-5 pb-5 pt-4 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  {t('organization.members.email', 'Email')}
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  {t('organization.members.role', 'Role')}
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                >
                  <option value="MEMBER">{t('organization.members.roleMember', 'Member')}</option>
                  <option value="ADMIN">{t('organization.members.roleAdmin', 'Admin')}</option>
                </select>
              </div>
              {structureSettings.departments_enabled && departments.length > 0 && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
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
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  {t('organization.members.jobTitle', 'Job Title')}
                </label>
                <input
                  type="text"
                  value={inviteForm.job_title}
                  onChange={(e) => setInviteForm({ ...inviteForm, job_title: e.target.value })}
                  placeholder={t('organization.members.jobTitlePlaceholder', 'e.g. Frontend Developer')}
                  className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
              <span className="text-xs text-muted-foreground">ESC</span>
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
          </>
        ) : (
          <>
            <div className="px-5 pb-5 pt-4 space-y-4">
              {/* Create link form */}
              <div className="p-3 bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">
                      {t('organization.members.role', 'Role')}
                    </label>
                    <select
                      value={linkRole}
                      onChange={(e) => setLinkRole(e.target.value as 'MEMBER' | 'ADMIN')}
                      className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-2 px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    >
                      <option value="MEMBER">{t('organization.members.roleMember', 'Member')}</option>
                      <option value="ADMIN">{t('organization.members.roleAdmin', 'Admin')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">
                      {t('organization.members.linkExpiry', 'Expires')}
                    </label>
                    <select
                      value={linkExpiry}
                      onChange={(e) => setLinkExpiry(e.target.value)}
                      className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-2 px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    >
                      <option value="">{t('organization.members.noExpiry', 'No expiry')}</option>
                      <option value="1">{t('organization.members.expiry1Day', '1 day')}</option>
                      <option value="7">{t('organization.members.expiry7Days', '7 days')}</option>
                      <option value="30">{t('organization.members.expiry30Days', '30 days')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1 block">
                      {t('organization.members.linkMaxUses', 'Max Uses')}
                    </label>
                    <select
                      value={linkMaxUses}
                      onChange={(e) => setLinkMaxUses(e.target.value)}
                      className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-2 px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    >
                      <option value="">{t('organization.members.unlimited', 'Unlimited')}</option>
                      <option value="1">1</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleCreateLink}
                    disabled={creatingLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                  >
                    <Link2 size={12} />
                    {creatingLink ? '...' : t('organization.members.generateLink', 'Generate Link')}
                  </button>
                </div>
              </div>

              {/* Existing links */}
              {inviteLinks.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  {t('organization.members.noLinks', 'No active invite links')}
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {inviteLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Link2 size={14} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-foreground truncate font-mono">{link.code}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          link.role === 'ADMIN'
                            ? 'bg-bridge-accent/15 text-bridge-accent'
                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                        }`}>
                          {link.role}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">
                          {link.used_count}{link.max_uses ? `/${link.max_uses}` : ''} {t('organization.members.used', 'used')}
                        </span>
                        {link.expires_at && (
                          <span className="text-xs text-slate-500 flex items-center gap-0.5 shrink-0">
                            <Clock size={8} />
                            {formatExpiry(link.expires_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleCopyLink(link.code)}
                          className="p-1.5 text-slate-500 hover:text-bridge-accent transition-colors"
                        >
                          {copiedCode === link.code ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
              <span className="text-xs text-muted-foreground">ESC</span>
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </>
        )}
      </MotionModal>
    </div>
  );
}
