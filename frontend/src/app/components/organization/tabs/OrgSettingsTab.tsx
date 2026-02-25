import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Trash2, AlertTriangle, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { organizationService, leaveService } from '../../../utils/services';
import type {
  OrganizationDetail, OrgDepartment, OrgJobGroup, OrgInviteLink, LeavePolicy, OrgRole, OrgMemberSimple,
} from '../../../types';

interface OrgSettingsTabProps {
  orgId: string;
  org: OrganizationDetail;
  myRole: OrgRole;
  onUpdate: () => void;
}

export function OrgSettingsTab({ orgId, org, myRole, onUpdate }: OrgSettingsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOwner = myRole === 'OWNER';

  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || '');
  const [saving, setSaving] = useState(false);

  // Sub-data
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [inviteLinks, setInviteLinks] = useState<OrgInviteLink[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);

  // Inline editors
  const [newDeptName, setNewDeptName] = useState('');
  const [newJobGroupName, setNewJobGroupName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

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

  const handleCreateInviteLink = async () => {
    try {
      await organizationService.createInviteLink(orgId, { role: 'MEMBER', expires_in_days: 7 });
      fetchSettings();
    } catch (error) {
      console.warn('Failed to create invite link:', error);
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

  const handleDeleteOrganization = async () => {
    if (deleteConfirm !== org.name) return;
    try {
      await organizationService.delete(orgId);
      navigate('/organizations');
    } catch (error) {
      console.warn('Failed to delete organization:', error);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Basic Info */}
      <section className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <h3 className="text-sm font-bold text-white mb-4">{t('organization.settings.basicInfo', 'Basic Information')}</h3>
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.settings.orgName', 'Organization Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.settings.description', 'Description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
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

      {/* Departments */}
      <section className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <h3 className="text-sm font-bold text-white mb-4">{t('organization.settings.departments', 'Departments')}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              {d.name}
              <button onClick={() => handleDeleteDepartment(d.id)} className="text-slate-500 hover:text-red-400 transition-colors">
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
            className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
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

      {/* Job Groups */}
      <section className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <h3 className="text-sm font-bold text-white mb-4">{t('organization.settings.jobGroups', 'Job Groups')}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {jobGroups.map((jg) => (
            <div key={jg.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              {jg.name}
              <button onClick={() => handleDeleteJobGroup(jg.id)} className="text-slate-500 hover:text-red-400 transition-colors">
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
            className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
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

      {/* Leave Policies */}
      <section className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <h3 className="text-sm font-bold text-white mb-4">{t('organization.settings.leavePolicies', 'Leave Policies')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th className="text-left py-2 px-3">{t('organization.settings.policyName', 'Name')}</th>
                <th className="text-left py-2 px-3">{t('organization.settings.defaultDays', 'Default Days')}</th>
                <th className="text-left py-2 px-3">{t('organization.settings.paid', 'Paid')}</th>
                <th className="text-left py-2 px-3">{t('organization.settings.active', 'Active')}</th>
              </tr>
            </thead>
            <tbody>
              {leavePolicies.map((p) => (
                <tr key={p.id} className="border-b border-white/5">
                  <td className="py-3 px-3 text-white">{p.name}</td>
                  <td className="py-3 px-3 text-slate-400">{p.default_days}</td>
                  <td className="py-3 px-3">{p.is_paid ? <span className="text-emerald-400">Yes</span> : <span className="text-slate-500">No</span>}</td>
                  <td className="py-3 px-3">{p.is_active ? <span className="text-emerald-400">Active</span> : <span className="text-red-400">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invite Links */}
      <section className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">{t('organization.settings.inviteLinks', 'Invite Links')}</h3>
          <button
            onClick={handleCreateInviteLink}
            className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
          >
            <Plus size={14} />
            {t('organization.settings.generateLink', 'Generate Link')}
          </button>
        </div>
        {inviteLinks.length === 0 ? (
          <p className="text-sm text-slate-500">{t('organization.settings.noLinks', 'No active invite links')}</p>
        ) : (
          <div className="space-y-2">
            {inviteLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Link2 size={14} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-300 truncate font-mono">
                    {link.code}
                  </span>
                  <span className="text-[9px] text-slate-500 shrink-0">
                    {link.used_count}{link.max_uses ? `/${link.max_uses}` : ''} used
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteInviteLink(link.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      {isOwner && (
        <section className="bg-bridge-obsidian rounded-2xl border border-red-500/20 p-6">
          <h3 className="text-sm font-bold text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} />
            {t('organization.settings.dangerZone', 'Danger Zone')}
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            {t('organization.settings.deleteWarning', 'Deleting this organization cannot be undone. All boards will be released.')}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={t('organization.settings.typeOrgName', 'Type organization name to confirm')}
              className="flex-1 bg-white/5 border border-red-500/20 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
            />
            <button
              onClick={handleDeleteOrganization}
              disabled={deleteConfirm !== org.name}
              className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-bold text-sm hover:bg-red-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
