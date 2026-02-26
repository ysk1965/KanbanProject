import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Building2,
  Users,
  Briefcase,
  Camera,
  Crown,
  Award,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { organizationService, leaveService } from "../../../utils/services";
import { OnboardingTemplatesSection } from "../OnboardingTemplatesSection";
import { OrgLeavePoliciesSection } from "../settings/OrgLeavePoliciesSection";
import { OrgAnniversarySettingsSection } from "../settings/OrgAnniversarySettingsSection";
import { OrgAttendancePolicySection } from "../settings/OrgAttendancePolicySection";
import { OrgInviteLinksSection } from "../settings/OrgInviteLinksSection";
import { OrgDangerZoneSection } from "../settings/OrgDangerZoneSection";
import type {
  OrganizationDetail,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgInviteLink,
  LeavePolicy,
  OrgRole,
} from "../../../types";

interface OrgSettingsTabProps {
  orgId: string;
  org: OrganizationDetail;
  myRole: OrgRole;
  onUpdate: () => void;
}

const inputSmClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

export function OrgSettingsTab({
  orgId,
  org,
  myRole,
  onUpdate,
}: OrgSettingsTabProps) {
  const { t } = useTranslation();
  const isOwner = myRole === "OWNER";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Basic info
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Sub-data
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  const [titles, setTitles] = useState<OrgTitle[]>([]);
  const [grades, setGrades] = useState<OrgGrade[]>([]);
  const [inviteLinks, setInviteLinks] = useState<OrgInviteLink[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);

  // Inline editors
  const [newDeptName, setNewDeptName] = useState("");
  const [newJobGroupName, setNewJobGroupName] = useState("");
  const [newPositionName, setNewPositionName] = useState("");
  const [newTitleName, setNewTitleName] = useState("");
  const [newGradeName, setNewGradeName] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const [depts, jgs, pos, ttls, grds, links, policies] = await Promise.all([
        organizationService.getDepartments(orgId),
        organizationService.getJobGroups(orgId),
        organizationService.getPositions(orgId).catch(() => []),
        organizationService.getTitles(orgId).catch(() => []),
        organizationService.getGrades(orgId).catch(() => []),
        organizationService.getInviteLinks(orgId).catch(() => []),
        leaveService.getPolicies(orgId),
      ]);
      setDepartments(depts);
      setJobGroups(jgs);
      setPositions(pos);
      setTitles(ttls);
      setGrades(grds);
      setInviteLinks(links);
      setLeavePolicies(policies);
    } catch (error) {
      console.warn("Failed to fetch settings data:", error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Handlers ──

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      await organizationService.uploadLogo(orgId, file);
      onUpdate();
    } catch (error) {
      console.warn("Failed to upload logo:", error);
      toast.error(
        t("organization.settings.logoUploadError", "Failed to upload logo"),
      );
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveBasicInfo = async () => {
    try {
      setSaving(true);
      await organizationService.update(orgId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onUpdate();
      toast.success(t("organization.settings.saveSuccess", "Settings saved"));
    } catch (error) {
      console.warn("Failed to update:", error);
      toast.error(
        t("organization.settings.saveError", "Failed to save settings"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      await organizationService.createDepartment(orgId, {
        name: newDeptName.trim(),
      });
      setNewDeptName("");
      fetchSettings();
    } catch (error) {
      console.warn("Failed to add department:", error);
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deleteDeptConfirm",
          "Delete this department? Members in this department will be unassigned.",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteDepartment(orgId, deptId);
      fetchSettings();
    } catch (error) {
      console.warn("Failed to delete department:", error);
      toast.error(
        t(
          "organization.settings.deleteDeptError",
          "Failed to delete department",
        ),
      );
    }
  };

  const handleAddJobGroup = async () => {
    if (!newJobGroupName.trim()) return;
    try {
      await organizationService.createJobGroup(orgId, {
        name: newJobGroupName.trim(),
      });
      setNewJobGroupName("");
      fetchSettings();
    } catch (error) {
      console.warn("Failed to add job group:", error);
    }
  };

  const handleDeleteJobGroup = async (jgId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deleteJobGroupConfirm",
          "Delete this job group? Members in this group will be unassigned.",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteJobGroup(orgId, jgId);
      fetchSettings();
    } catch (error) {
      console.warn("Failed to delete job group:", error);
      toast.error(
        t(
          "organization.settings.deleteJobGroupError",
          "Failed to delete job group",
        ),
      );
    }
  };

  // Position handlers
  const handleAddPosition = async () => {
    if (!newPositionName.trim()) return;
    try {
      await organizationService.createPosition(orgId, {
        name: newPositionName.trim(),
      });
      setNewPositionName("");
      fetchSettings();
    } catch (error) {
      console.warn("Failed to add position:", error);
    }
  };

  const handleDeletePosition = async (posId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deletePositionConfirm",
          "Delete this position? Members with this position will be unassigned.",
        ),
      )
    )
      return;
    try {
      await organizationService.deletePosition(orgId, posId);
      fetchSettings();
    } catch (error) {
      console.warn("Failed to delete position:", error);
      toast.error(
        t(
          "organization.settings.deletePositionError",
          "Failed to delete position",
        ),
      );
    }
  };

  // Title handlers
  const handleAddTitle = async () => {
    if (!newTitleName.trim()) return;
    try {
      await organizationService.createTitle(orgId, {
        name: newTitleName.trim(),
      });
      setNewTitleName("");
      fetchSettings();
    } catch (error) {
      console.warn("Failed to add title:", error);
    }
  };

  const handleDeleteTitle = async (titleId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deleteTitleConfirm",
          "Delete this title? Members with this title will be unassigned.",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteTitle(orgId, titleId);
      fetchSettings();
    } catch (error) {
      console.warn("Failed to delete title:", error);
      toast.error(
        t("organization.settings.deleteTitleError", "Failed to delete title"),
      );
    }
  };

  // Grade handlers
  const handleAddGrade = async () => {
    if (!newGradeName.trim()) return;
    try {
      await organizationService.createGrade(orgId, {
        name: newGradeName.trim(),
      });
      setNewGradeName("");
      fetchSettings();
    } catch (error) {
      console.warn("Failed to add grade:", error);
    }
  };

  const handleDeleteGrade = async (gradeId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deleteGradeConfirm",
          "Delete this grade? Members with this grade will be unassigned.",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteGrade(orgId, gradeId);
      fetchSettings();
    } catch (error) {
      console.warn("Failed to delete grade:", error);
      toast.error(
        t("organization.settings.deleteGradeError", "Failed to delete grade"),
      );
    }
  };

  // ── Render ──

  return (
    <div className="max-w-3xl space-y-8">
      {/* ── 1. Basic Info + Logo ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Building2 size={16} className="text-bridge-accent" />
          {t("organization.settings.basicInfo", "Basic Information")}
        </h3>

        {/* Logo */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            <div className="w-16 h-16 rounded-xl bg-foreground/[0.05] flex items-center justify-center overflow-hidden border border-foreground/[0.08]">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 size={24} className="text-muted-foreground" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
              className="absolute -bottom-1 -right-1 p-1 bg-bridge-accent rounded-lg text-white hover:bg-bridge-accent/90 transition-colors shadow-lg"
            >
              <Camera size={12} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{org.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {t(
                "organization.settings.logoHint",
                "Click camera to update logo",
              )}
            </p>
          </div>
        </div>

        {/* Name & Description */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
              {t("organization.settings.name", "Organization Name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full ${inputSmClass}`}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
              {t("organization.settings.description", "Description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`w-full resize-none ${inputSmClass}`}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveBasicInfo}
              disabled={saving || !name.trim()}
              className="px-4 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {saving ? "..." : t("common.save", "Save")}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. Departments ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Users size={16} className="text-teal-400" />
          {t("organization.settings.departments", "Departments")}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
            placeholder={t(
              "organization.settings.newDeptPlaceholder",
              "New department name",
            )}
            className={`flex-1 ${inputSmClass}`}
          />
          <button
            onClick={handleAddDepartment}
            disabled={!newDeptName.trim()}
            className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
            >
              <span className="text-sm text-foreground">{dept.name}</span>
              <button
                onClick={() => handleDeleteDepartment(dept.id)}
                className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Job Groups ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Briefcase size={16} className="text-purple-400" />
          {t("organization.settings.jobGroups", "Job Groups")}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newJobGroupName}
            onChange={(e) => setNewJobGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddJobGroup()}
            placeholder={t(
              "organization.settings.newJobGroupPlaceholder",
              "New job group name",
            )}
            className={`flex-1 ${inputSmClass}`}
          />
          <button
            onClick={handleAddJobGroup}
            disabled={!newJobGroupName.trim()}
            className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {jobGroups.map((jg) => (
            <div
              key={jg.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
            >
              <span className="text-sm text-foreground">{jg.name}</span>
              <button
                onClick={() => handleDeleteJobGroup(jg.id)}
                className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3-1. Positions (직책) ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Crown size={16} className="text-amber-400" />
          {t("organization.settings.positions", "Positions")}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newPositionName}
            onChange={(e) => setNewPositionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddPosition()}
            placeholder={t(
              "organization.settings.newPositionPlaceholder",
              "New position name",
            )}
            className={`flex-1 ${inputSmClass}`}
          />
          <button
            onClick={handleAddPosition}
            disabled={!newPositionName.trim()}
            className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {positions.map((pos) => (
            <div
              key={pos.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
            >
              <span className="text-sm text-foreground">{pos.name}</span>
              <button
                onClick={() => handleDeletePosition(pos.id)}
                className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3-2. Titles (직위) ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Award size={16} className="text-indigo-400" />
          {t("organization.settings.titles", "Titles")}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newTitleName}
            onChange={(e) => setNewTitleName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTitle()}
            placeholder={t(
              "organization.settings.newTitlePlaceholder",
              "New title name",
            )}
            className={`flex-1 ${inputSmClass}`}
          />
          <button
            onClick={handleAddTitle}
            disabled={!newTitleName.trim()}
            className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {titles.map((ttl) => (
            <div
              key={ttl.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
            >
              <span className="text-sm text-foreground">{ttl.name}</span>
              <button
                onClick={() => handleDeleteTitle(ttl.id)}
                className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3-3. Grades (직급) ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-rose-400" />
          {t("organization.settings.grades", "Grades")}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newGradeName}
            onChange={(e) => setNewGradeName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddGrade()}
            placeholder={t(
              "organization.settings.newGradePlaceholder",
              "New grade name",
            )}
            className={`flex-1 ${inputSmClass}`}
          />
          <button
            onClick={handleAddGrade}
            disabled={!newGradeName.trim()}
            className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {grades.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
            >
              <span className="text-sm text-foreground">{g.name}</span>
              <button
                onClick={() => handleDeleteGrade(g.id)}
                className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Leave Policies ── */}
      <OrgLeavePoliciesSection
        orgId={orgId}
        leavePolicies={leavePolicies}
        onRefresh={fetchSettings}
      />

      {/* ── 5. Anniversary Settings ── */}
      <OrgAnniversarySettingsSection orgId={orgId} />

      {/* ── 6. Onboarding Templates ── */}
      <OnboardingTemplatesSection
        orgId={orgId}
        departments={departments}
        jobGroups={jobGroups}
      />

      {/* ── 7-8. Attendance Policy + Holidays ── */}
      <OrgAttendancePolicySection orgId={orgId} />

      {/* ── 9. Invite Links ── */}
      <OrgInviteLinksSection
        orgId={orgId}
        inviteLinks={inviteLinks}
        onRefresh={fetchSettings}
      />

      {/* ── 10. Danger Zone (OWNER only) ── */}
      {isOwner && (
        <OrgDangerZoneSection orgId={orgId} org={org} onUpdate={onUpdate} />
      )}
    </div>
  );
}
