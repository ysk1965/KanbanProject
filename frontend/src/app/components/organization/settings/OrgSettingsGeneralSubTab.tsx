import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Camera, MonitorSmartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { organizationService } from "../../../utils/services";
import { OrgInviteLinksSection } from "./OrgInviteLinksSection";
import { OrgDangerZoneSection } from "./OrgDangerZoneSection";
import type { OrganizationDetail, OrgInviteLink, OrgRole } from "../../../types";

interface OrgSettingsGeneralSubTabProps {
  orgId: string;
  org: OrganizationDetail;
  myRole: OrgRole;
  onUpdate: () => void;
}

const inputSmClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

export function OrgSettingsGeneralSubTab({
  orgId,
  org,
  myRole,
  onUpdate,
}: OrgSettingsGeneralSubTabProps) {
  const { t } = useTranslation();
  const isOwner = myRole === "OWNER";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || "");
  const [saving, setSaving] = useState(false);

  const hasChanges = name.trim() !== org.name || description.trim() !== (org.description || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<OrgInviteLink[]>([]);

  const fetchInviteLinks = useCallback(async () => {
    try {
      const links = await organizationService.getInviteLinks(orgId).catch(() => []);
      setInviteLinks(links);
    } catch (error) {
      console.warn("Failed to fetch invite links:", error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchInviteLinks();
  }, [fetchInviteLinks]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      await organizationService.uploadLogo(orgId, file);
      onUpdate();
    } catch (error) {
      console.warn("Failed to upload logo:", error);
      toast.error(t("organization.settings.logoUploadError", "Failed to upload logo"));
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
      toast.error(t("organization.settings.saveError", "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info + Logo */}
        <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-bridge-accent" />
            {t("organization.settings.basicInfo", "Basic Information")}
          </h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="relative group">
              <div className="w-16 h-16 rounded-xl bg-foreground/[0.05] flex items-center justify-center overflow-hidden border border-foreground/[0.08]">
                {org.logo_url ? (
                  <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
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
                {t("organization.settings.logoHint", "Click camera to update logo")}
              </p>
            </div>
          </div>

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
                disabled={saving || !name.trim() || !hasChanges}
                className="px-4 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {saving ? "..." : t("common.save", "Save")}
              </button>
            </div>
          </div>
        </section>

        {/* Invite Links */}
        <OrgInviteLinksSection
          orgId={orgId}
          inviteLinks={inviteLinks}
          onRefresh={fetchInviteLinks}
        />
      </div>

      {/* HR System Integration */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
          <MonitorSmartphone size={16} className="text-bridge-accent" />
          {t("organization.settings.hrSystem", "External HR System")}
        </h3>
        <p className="text-[11px] text-slate-500 mb-4">
          {t("organization.settings.hrSystemDesc", "If your organization manages leave/vacation in an external HR system, you can hide those features from BRIDGE.")}
        </p>
        <div className="flex items-center justify-between p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.08]">
          <div>
            <span className="text-sm font-medium text-foreground">
              {t("organization.settings.hrSystemEnabled", "Hide BRIDGE leave/vacation features")}
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("organization.settings.hrSystemHint", "Leave management, leave balance, and HR info will not be displayed.")}
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                await organizationService.update(orgId, {
                  hr_system_enabled: !org.hr_system_enabled,
                });
                onUpdate();
                toast.success(t("organization.settings.saveSuccess", "Settings saved"));
              } catch {
                toast.error(t("organization.settings.saveError", "Failed to save settings"));
              }
            }}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              org.hr_system_enabled ? "bg-bridge-accent" : "bg-foreground/10"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                org.hr_system_enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Auto Board Access */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
          <Users size={16} className="text-bridge-accent" />
          {t("organization.settings.autoBoardAccess", "자동 보드 접근")}
        </h3>
        <p className="text-[11px] text-slate-500 mb-4">
          {t("organization.settings.autoBoardAccessDesc", "활성화하면 조직 구성원이 참가 신청 없이 모든 조직 보드에 편집 권한으로 접근할 수 있습니다.")}
        </p>
        <div className="flex items-center justify-between p-3 bg-foreground/[0.02] rounded-xl border border-foreground/[0.08]">
          <div>
            <span className="text-sm font-medium text-foreground">
              {t("organization.settings.autoBoardAccessEnabled", "자동 보드 접근 허용")}
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("organization.settings.autoBoardAccessHint", "조직 구성원이 MEMBER 역할로 자동 접근됩니다. 보드 멤버 목록에는 추가되지 않습니다.")}
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                await organizationService.update(orgId, {
                  auto_board_access_enabled: !org.auto_board_access_enabled,
                });
                onUpdate();
                toast.success(t("organization.settings.saveSuccess", "Settings saved"));
              } catch {
                toast.error(t("organization.settings.saveError", "Failed to save settings"));
              }
            }}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              org.auto_board_access_enabled ? "bg-bridge-accent" : "bg-foreground/10"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                org.auto_board_access_enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Danger Zone (OWNER only) */}
      {isOwner && <OrgDangerZoneSection orgId={orgId} org={org} onUpdate={onUpdate} />}
    </div>
  );
}
