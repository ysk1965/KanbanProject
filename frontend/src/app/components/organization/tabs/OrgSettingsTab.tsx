import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, Trash2, AlertTriangle, Link2, Building2, Users, Briefcase,
  CalendarDays, Camera, Pencil, Check, ArrowRightLeft, Copy, Clock,
} from 'lucide-react';
import { organizationService, leaveService } from '../../../utils/services';
import type {
  OrganizationDetail, OrgDepartment, OrgJobGroup, OrgInviteLink, LeavePolicy,
  OrgRole, OrgMemberSimple, LeaveCategory,
} from '../../../types';

interface OrgSettingsTabProps {
  orgId: string;
  org: OrganizationDetail;
  myRole: OrgRole;
  onUpdate: () => void;
}

const CATEGORY_LABELS: Record<LeaveCategory, string> = {
  ANNUAL: 'Annual',
  SICK: 'Sick',
  REFRESH: 'Refresh',
  OTHER: 'Other',
};

const CATEGORY_COLORS: Record<LeaveCategory, string> = {
  ANNUAL: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  SICK: 'bg-red-500/20 text-red-600 dark:text-red-400',
  REFRESH: 'bg-teal-500/20 text-teal-600 dark:text-teal-400',
  OTHER: 'bg-slate-500/20 text-slate-600 dark:text-slate-400',
};

const EXPIRY_OPTIONS = [
  { value: '', label: 'No expiry' },
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

const MAX_USES_OPTIONS = [
  { value: '', label: 'Unlimited' },
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '100', label: '100' },
];

const ROLE_OPTIONS: { value: 'MEMBER' | 'ADMIN'; label: string }[] = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'ADMIN', label: 'Admin' },
];

const selectClass = 'bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all appearance-none cursor-pointer';
const inputSmClass = 'bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all';

export function OrgSettingsTab({ orgId, org, myRole, onUpdate }: OrgSettingsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOwner = myRole === 'OWNER';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Basic info
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || '');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Sub-data
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [inviteLinks, setInviteLinks] = useState<OrgInviteLink[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);

  // Inline editors
  const [newDeptName, setNewDeptName] = useState('');
  const [newJobGroupName, setNewJobGroupName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Invite link form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [inviteExpiry, setInviteExpiry] = useState('7');
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Leave policy editing
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editPolicy, setEditPolicy] = useState({ name: '', default_days: 0, is_paid: true, requires_approval: true, description: '' });
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: '', leave_category: 'OTHER' as LeaveCategory, default_days: 0, is_paid: true, requires_approval: true, description: '' });
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Ownership transfer
  const [members, setMembers] = useState<OrgMemberSimple[]>([]);
  const [transferMemberId, setTransferMemberId] = useState('');
  const [transferConfirm, setTransferConfirm] = useState('');
  const [transferring, setTransferring] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [depts, jgs, links, policies] = await Promise.all([
        organizationService.getDepartments(orgId),
        organizationService.getJobGroups(orgId),
        organizationService.getInviteLinks(orgId).catch(() => []),
        leaveService.getPolicies(orgId),
      ]);
      setDepartments(depts);
      setJobGroups(jgs);
      setInviteLinks(links);
      setLeavePolicies(policies);
    } catch (error) {
      console.warn('Failed to fetch settings data:', error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Load members for ownership transfer (OWNER only)
  useEffect(() => {
    if (!isOwner) return;
    organizationService.getMembers(orgId, { size: 200 }).then((res: any) => {
      setMembers((res.content || []).filter((m: OrgMemberSimple) => m.role !== 'OWNER'));
    }).catch(() => {});
  }, [orgId, isOwner]);

  // ── Handlers ──

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      await organizationService.uploadLogo(orgId, file);
      onUpdate();
    } catch (error) {
      console.warn('Failed to upload logo:', error);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveBasicInfo = async () => {
    try {
      setSaving(true);
      await organizationService.update(orgId, { name: name.trim(), description: description.trim() || undefined });
      onUpdate();
    } catch (error) {
      console.warn('Failed to update:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      await organizationService.createDepartment(orgId, { name: newDeptName.trim() });
      setNewDeptName('');
      fetchSettings();
    } catch (error) {
      console.warn('Failed to add department:', error);
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    try {
      await organizationService.deleteDepartment(orgId, deptId);
      fetchSettings();
    } catch (error) {
      console.warn('Failed to delete department:', error);
    }
  };

  const handleAddJobGroup = async () => {
    if (!newJobGroupName.trim()) return;
    try {
      await organizationService.createJobGroup(orgId, { name: newJobGroupName.trim() });
      setNewJobGroupName('');
      fetchSettings();
    } catch (error) {
      console.warn('Failed to add job group:', error);
    }
  };

  const handleDeleteJobGroup = async (jgId: string) => {
    try {
      await organizationService.deleteJobGroup(orgId, jgId);
      fetchSettings();
    } catch (error) {
      console.warn('Failed to delete job group:', error);
    }
  };

  // Leave policy handlers
  const startEditPolicy = (p: LeavePolicy) => {
    setEditingPolicyId(p.id);
    setEditPolicy({ name: p.name, default_days: p.default_days, is_paid: p.is_paid, requires_approval: p.requires_approval, description: p.description || '' });
  };

  const handleSavePolicy = async (policyId: string) => {
    try {
      setSavingPolicy(true);
      await leaveService.updatePolicy(orgId, policyId, editPolicy);
      setEditingPolicyId(null);
      fetchSettings();
    } catch (error) {
      console.warn('Failed to update policy:', error);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleTogglePolicyActive = async (p: LeavePolicy) => {
    try {
      await leaveService.updatePolicy(orgId, p.id, { is_active: !p.is_active });
      fetchSettings();
    } catch (error) {
      console.warn('Failed to toggle policy:', error);
    }
  };

  const handleCreatePolicy = async () => {
    if (!newPolicy.name.trim()) return;
    try {
      setSavingPolicy(true);
      await leaveService.createPolicy(orgId, { ...newPolicy, name: newPolicy.name.trim(), description: newPolicy.description.trim() || undefined });
      setShowNewPolicy(false);
      setNewPolicy({ name: '', leave_category: 'OTHER', default_days: 0, is_paid: true, requires_approval: true, description: '' });
      fetchSettings();
    } catch (error) {
      console.warn('Failed to create policy:', error);
    } finally {
      setSavingPolicy(false);
    }
  };

  // Invite link handlers
  const handleCreateInviteLink = async () => {
    try {
      setCreatingLink(true);
      await organizationService.createInviteLink(orgId, {
        role: inviteRole,
        max_uses: inviteMaxUses ? Number(inviteMaxUses) : null,
        expires_in_days: inviteExpiry ? Number(inviteExpiry) : undefined,
      });
      setShowInviteForm(false);
      setInviteRole('MEMBER');
      setInviteExpiry('7');
      setInviteMaxUses('');
      fetchSettings();
    } catch (error) {
      console.warn('Failed to create invite link:', error);
    } finally {
      setCreatingLink(false);
    }
  };

  const handleDeleteInviteLink = async (linkId: string) => {
    try {
      await organizationService.deleteInviteLink(orgId, linkId);
      fetchSettings();
    } catch (error) {
      console.warn('Failed to delete invite link:', error);
    }
  };

  const handleCopyCode = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // Ownership transfer
  const handleTransferOwnership = async () => {
    if (transferConfirm !== org.name || !transferMemberId) return;
    try {
      setTransferring(true);
      await organizationService.transferOwnership(orgId, { member_id: transferMemberId });
      setTransferMemberId('');
      setTransferConfirm('');
      onUpdate();
    } catch (error) {
      console.warn('Failed to transfer ownership:', error);
    } finally {
      setTransferring(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (deleteConfirm !== org.name) return;
    try {
      await organizationService.delete(orgId);
      navigate('/organizations');
    } catch (error) {
      console.warn('Failed to delete organization:', error);
    }
  };

  const formatExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null;
    return new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // ── Render ──

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── 1. Basic Info + Logo ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Building2 size={16} className="text-bridge-accent" />
          {t('organization.settings.basicInfo', 'Basic Information')}
        </h3>
        <div className="space-y-4">
          {/* Logo */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.settings.logo', 'Logo')}
            </label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="relative w-16 h-16 rounded-xl overflow-hidden border border-foreground/[0.08] hover:border-bridge-accent/50 transition-all group shrink-0"
              >
                {org.logo_url ? (
                  <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-bridge-accent/10 flex items-center justify-center">
                    <Building2 size={24} className="text-bridge-accent/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingLogo ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={16} className="text-white" />
                  )}
                </div>
              </button>
              <span className="text-[11px] text-muted-foreground">
                {t('organization.settings.logoHint', 'Click to upload')}
              </span>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.settings.orgName', 'Organization Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.settings.description', 'Description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveBasicInfo}
              disabled={saving || !name.trim()}
              className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. Departments ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Users size={16} className="text-bridge-secondary" />
          {t('organization.settings.departments', 'Departments')}
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-1.5 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg text-sm text-foreground">
              {d.name}
              <button onClick={() => handleDeleteDepartment(d.id)} className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
            placeholder={t('organization.settings.addDepartment', 'Add department...')}
            className="flex-1 bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2 px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
          <button
            onClick={handleAddDepartment}
            disabled={!newDeptName.trim()}
            className="p-2 bg-bridge-accent/20 text-bridge-accent rounded-xl hover:bg-bridge-accent/30 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* ── 3. Job Groups ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Briefcase size={16} className="text-purple-400" />
          {t('organization.settings.jobGroups', 'Job Groups')}
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {jobGroups.map((jg) => (
            <div key={jg.id} className="flex items-center gap-2 px-3 py-1.5 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg text-sm text-foreground">
              {jg.name}
              <button onClick={() => handleDeleteJobGroup(jg.id)} className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newJobGroupName}
            onChange={(e) => setNewJobGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddJobGroup()}
            placeholder={t('organization.settings.addJobGroup', 'Add job group...')}
            className="flex-1 bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-2 px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
          <button
            onClick={handleAddJobGroup}
            disabled={!newJobGroupName.trim()}
            className="p-2 bg-bridge-accent/20 text-bridge-accent rounded-xl hover:bg-bridge-accent/30 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* ── 4. Leave Policies (CRUD) ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CalendarDays size={16} className="text-amber-400" />
            {t('organization.settings.leavePolicies', 'Leave Policies')}
          </h3>
          {!showNewPolicy && (
            <button
              onClick={() => setShowNewPolicy(true)}
              className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
            >
              <Plus size={14} />
              {t('organization.settings.addPolicy', 'Add Policy')}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {leavePolicies.map((p) => (
            <div key={p.id} className="p-3 bg-foreground/[0.03] rounded-xl">
              {editingPolicyId === p.id ? (
                /* ── Edit mode ── */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editPolicy.name}
                      onChange={(e) => setEditPolicy({ ...editPolicy, name: e.target.value })}
                      placeholder="Policy name"
                      className={inputSmClass}
                    />
                    <input
                      type="number"
                      value={editPolicy.default_days}
                      onChange={(e) => setEditPolicy({ ...editPolicy, default_days: Number(e.target.value) })}
                      min={0}
                      step={0.5}
                      className={inputSmClass}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                      <input type="checkbox" checked={editPolicy.is_paid} onChange={(e) => setEditPolicy({ ...editPolicy, is_paid: e.target.checked })} className="rounded" />
                      {t('organization.settings.paid', 'Paid')}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                      <input type="checkbox" checked={editPolicy.requires_approval} onChange={(e) => setEditPolicy({ ...editPolicy, requires_approval: e.target.checked })} className="rounded" />
                      {t('organization.settings.requiresApproval', 'Requires Approval')}
                    </label>
                  </div>
                  <input
                    type="text"
                    value={editPolicy.description}
                    onChange={(e) => setEditPolicy({ ...editPolicy, description: e.target.value })}
                    placeholder={t('organization.settings.policyDescription', 'Description (optional)')}
                    className={`w-full ${inputSmClass}`}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingPolicyId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={() => handleSavePolicy(p.id)}
                      disabled={savingPolicy || !editPolicy.name.trim()}
                      className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                    >
                      {savingPolicy ? '...' : t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-foreground font-medium">{p.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[p.leave_category]}`}>
                      {CATEGORY_LABELS[p.leave_category]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{p.default_days}d</span>
                    {p.is_paid && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">Paid</span>}
                    {p.requires_approval && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">Approval</span>}
                    <button
                      onClick={() => handleTogglePolicyActive(p)}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                        p.is_active
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400'
                          : 'bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => startEditPolicy(p)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── New policy form ── */}
          {showNewPolicy && (
            <div className="p-3 bg-foreground/[0.03] rounded-xl border border-bridge-accent/20 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                  placeholder="Policy name"
                  className={`col-span-1 ${inputSmClass}`}
                />
                <select
                  value={newPolicy.leave_category}
                  onChange={(e) => setNewPolicy({ ...newPolicy, leave_category: e.target.value as LeaveCategory })}
                  className={selectClass}
                >
                  {(Object.keys(CATEGORY_LABELS) as LeaveCategory[]).map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={newPolicy.default_days}
                  onChange={(e) => setNewPolicy({ ...newPolicy, default_days: Number(e.target.value) })}
                  min={0}
                  step={0.5}
                  placeholder="Days"
                  className={inputSmClass}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={newPolicy.is_paid} onChange={(e) => setNewPolicy({ ...newPolicy, is_paid: e.target.checked })} className="rounded" />
                  {t('organization.settings.paid', 'Paid')}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={newPolicy.requires_approval} onChange={(e) => setNewPolicy({ ...newPolicy, requires_approval: e.target.checked })} className="rounded" />
                  {t('organization.settings.requiresApproval', 'Requires Approval')}
                </label>
              </div>
              <input
                type="text"
                value={newPolicy.description}
                onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
                placeholder={t('organization.settings.policyDescription', 'Description (optional)')}
                className={`w-full ${inputSmClass}`}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNewPolicy(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleCreatePolicy}
                  disabled={savingPolicy || !newPolicy.name.trim()}
                  className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                >
                  {savingPolicy ? '...' : t('common.create', 'Create')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. Invite Links (Enhanced) ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Link2 size={16} className="text-bridge-accent" />
            {t('organization.settings.inviteLinks', 'Invite Links')}
          </h3>
          {!showInviteForm && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
            >
              <Plus size={14} />
              {t('organization.settings.generateLink', 'Generate Link')}
            </button>
          )}
        </div>

        {/* Invite form */}
        {showInviteForm && (
          <div className="mb-4 p-3 bg-foreground/[0.03] rounded-xl border border-bridge-accent/20 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')} className={`w-full ${selectClass}`}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Expires</label>
                <select value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} className={`w-full ${selectClass}`}>
                  {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">Max Uses</label>
                <select value={inviteMaxUses} onChange={(e) => setInviteMaxUses(e.target.value)} className={`w-full ${selectClass}`}>
                  {MAX_USES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInviteForm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateInviteLink}
                disabled={creatingLink}
                className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {creatingLink ? '...' : t('common.create', 'Create')}
              </button>
            </div>
          </div>
        )}

        {/* Link list */}
        {inviteLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('organization.settings.noLinks', 'No active invite links')}</p>
        ) : (
          <div className="space-y-2">
            {inviteLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Link2 size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate font-mono">{link.code}</span>
                  {/* Role badge */}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    link.role === 'ADMIN' ? 'bg-bridge-accent/20 text-bridge-accent' : 'bg-slate-500/20 text-slate-600 dark:text-slate-400'
                  }`}>
                    {link.role}
                  </span>
                  {/* Meta info */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] text-muted-foreground">
                      {link.used_count}{link.max_uses ? `/${link.max_uses}` : ''} used
                    </span>
                    {link.expires_at && (
                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                        <Clock size={8} />
                        {formatExpiry(link.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopyCode(link.code)}
                    className="p-1.5 text-muted-foreground hover:text-bridge-accent transition-colors"
                    title="Copy invite URL"
                  >
                    {copiedCode === link.code ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => handleDeleteInviteLink(link.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 6. Danger Zone (OWNER only) ── */}
      {isOwner && (
        <section className="bg-bridge-obsidian rounded-2xl border border-red-500/20 p-6">
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-6 flex items-center gap-2">
            <AlertTriangle size={16} />
            {t('organization.settings.dangerZone', 'Danger Zone')}
          </h3>

          {/* Transfer Ownership */}
          <div className="mb-6 pb-6 border-b border-red-500/10">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft size={14} className="text-amber-500" />
              <span className="text-sm font-bold text-foreground">{t('organization.settings.transferOwnership', 'Transfer Ownership')}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('organization.settings.transferWarning', 'Transfer ownership to another member. You will be demoted to Admin.')}
            </p>
            <div className="space-y-2">
              <select
                value={transferMemberId}
                onChange={(e) => setTransferMemberId(e.target.value)}
                className={`w-full ${selectClass} py-2 px-3 rounded-xl text-sm`}
              >
                <option value="">{t('organization.settings.selectMember', 'Select a member...')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.name} ({m.user.email}) — {m.role}
                  </option>
                ))}
              </select>
              {transferMemberId && (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={transferConfirm}
                    onChange={(e) => setTransferConfirm(e.target.value)}
                    placeholder={t('organization.settings.typeOrgName', 'Type organization name to confirm')}
                    className="flex-1 bg-foreground/[0.03] border border-amber-500/20 rounded-xl py-2 px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                  />
                  <button
                    onClick={handleTransferOwnership}
                    disabled={transferConfirm !== org.name || transferring}
                    className="px-4 py-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl font-bold text-sm hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {transferring ? '...' : <ArrowRightLeft size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Delete Organization */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={14} className="text-red-500" />
              <span className="text-sm font-bold text-foreground">{t('organization.settings.deleteOrg', 'Delete Organization')}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {t('organization.settings.deleteWarning', 'Deleting this organization cannot be undone. All boards will be released.')}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={t('organization.settings.typeOrgName', 'Type organization name to confirm')}
                className="flex-1 bg-foreground/[0.03] border border-red-500/20 rounded-xl py-2 px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
              />
              <button
                onClick={handleDeleteOrganization}
                disabled={deleteConfirm !== org.name}
                className="px-4 py-2 bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-xl font-bold text-sm hover:bg-red-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
