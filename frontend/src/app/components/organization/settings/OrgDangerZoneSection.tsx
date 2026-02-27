import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Trash2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { organizationService } from "../../../utils/services";
import type { OrganizationDetail, OrgMemberSimple } from "../../../types";

interface OrgDangerZoneSectionProps {
  orgId: string;
  org: OrganizationDetail;
  onUpdate: () => void;
}

const selectClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all appearance-none cursor-pointer";

export function OrgDangerZoneSection({
  orgId,
  org,
  onUpdate,
}: OrgDangerZoneSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgMemberSimple[]>([]);
  const [transferMemberId, setTransferMemberId] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    organizationService
      .getMembers(orgId, { size: 200 })
      .then((res: { content: OrgMemberSimple[] }) => {
        setMembers(
          (res.content || []).filter(
            (m: OrgMemberSimple) => m.role !== "OWNER",
          ),
        );
      })
      .catch(() => {});
  }, [orgId]);

  const handleTransferOwnership = async () => {
    if (transferConfirm !== org.name || !transferMemberId) return;
    try {
      setTransferring(true);
      await organizationService.transferOwnership(orgId, {
        member_id: transferMemberId,
      });
      setTransferMemberId("");
      setTransferConfirm("");
      onUpdate();
    } catch (error) {
      console.warn("Failed to transfer ownership:", error);
    } finally {
      setTransferring(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (deleteConfirm !== org.name) return;
    try {
      await organizationService.delete(orgId);
      navigate("/boards");
    } catch (error) {
      console.warn("Failed to delete organization:", error);
    }
  };

  return (
    <section className="bg-bridge-obsidian rounded-2xl border border-red-500/20 p-6">
      <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-6 flex items-center gap-2">
        <AlertTriangle size={16} />
        {t("organization.settings.dangerZone", "Danger Zone")}
      </h3>

      {/* Transfer Ownership */}
      <div className="mb-6 pb-6 border-b border-red-500/10">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRightLeft size={14} className="text-amber-500" />
          <span className="text-sm font-bold text-foreground">
            {t("organization.settings.transferOwnership", "Transfer Ownership")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t(
            "organization.settings.transferWarning",
            "Transfer ownership to another member. You will be demoted to Admin.",
          )}
        </p>
        <div className="space-y-2">
          <select
            value={transferMemberId}
            onChange={(e) => setTransferMemberId(e.target.value)}
            className={`w-full ${selectClass} py-2 px-3 rounded-xl text-sm`}
          >
            <option value="">
              {t("organization.settings.selectMember", "Select a member...")}
            </option>
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
                placeholder={t(
                  "organization.settings.typeOrgName",
                  "Type organization name to confirm",
                )}
                className="flex-1 bg-foreground/[0.03] border border-amber-500/20 rounded-xl py-2 px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              />
              <button
                onClick={handleTransferOwnership}
                disabled={transferConfirm !== org.name || transferring}
                className="px-4 py-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl font-bold text-sm hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {transferring ? "..." : <ArrowRightLeft size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Organization */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={14} className="text-red-500" />
          <span className="text-sm font-bold text-foreground">
            {t("organization.settings.deleteOrg", "Delete Organization")}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {t(
            "organization.settings.deleteWarning",
            "Deleting this organization cannot be undone. All boards will be released.",
          )}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={t(
              "organization.settings.typeOrgName",
              "Type organization name to confirm",
            )}
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
  );
}
