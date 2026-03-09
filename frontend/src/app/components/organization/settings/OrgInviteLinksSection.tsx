import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Link2, Check, Copy, Clock } from "lucide-react";
import { toast } from "sonner";
import { organizationService } from "../../../utils/services";
import type { OrgInviteLink } from "../../../types";

interface OrgInviteLinksSectionProps {
  orgId: string;
  inviteLinks: OrgInviteLink[];
  onRefresh: () => void;
}

const selectClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all appearance-none cursor-pointer";

export function OrgInviteLinksSection({
  orgId,
  inviteLinks,
  onRefresh,
}: OrgInviteLinksSectionProps) {
  const { t } = useTranslation();

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviteExpiry, setInviteExpiry] = useState("7");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const EXPIRY_OPTIONS = [
    { value: "", label: t("organization.settings.noExpiry", "No expiry") },
    { value: "1", label: t("organization.settings.expiry1Day", "1 day") },
    { value: "7", label: t("organization.settings.expiry7Days", "7 days") },
    { value: "30", label: t("organization.settings.expiry30Days", "30 days") },
  ];

  const MAX_USES_OPTIONS = [
    { value: "", label: t("organization.settings.unlimited", "Unlimited") },
    { value: "1", label: "1" },
    { value: "5", label: "5" },
    { value: "10", label: "10" },
    { value: "25", label: "25" },
    { value: "100", label: "100" },
  ];

  const ROLE_OPTIONS: { value: "MEMBER" | "ADMIN"; label: string }[] = [
    { value: "MEMBER", label: t("organization.settings.roleMember", "Member") },
    { value: "ADMIN", label: t("organization.settings.roleAdmin", "Admin") },
  ];

  const handleCreateInviteLink = async () => {
    try {
      setCreatingLink(true);
      await organizationService.createInviteLink(orgId, {
        role: inviteRole,
        max_uses: inviteMaxUses ? Number(inviteMaxUses) : null,
        expires_in_days: inviteExpiry ? Number(inviteExpiry) : undefined,
      });
      setShowInviteForm(false);
      setInviteRole("MEMBER");
      setInviteExpiry("7");
      setInviteMaxUses("");
      onRefresh();
    } catch (error) {
      console.warn("Failed to create invite link:", error);
    } finally {
      setCreatingLink(false);
    }
  };

  const handleDeleteInviteLink = async (linkId: string) => {
    if (
      !confirm(
        t(
          "organization.settings.deleteLinkConfirm",
          "Delete this invite link?",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteInviteLink(orgId, linkId);
      onRefresh();
    } catch (error) {
      console.warn("Failed to delete invite link:", error);
      toast.error(
        t(
          "organization.settings.deleteLinkError",
          "Failed to delete invite link",
        ),
      );
    }
  };

  const handleCopyCode = (code: string) => {
    const url = `${window.location.origin}/org-invite/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const formatExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null;
    return new Date(expiresAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Link2 size={16} className="text-bridge-accent" />
          {t("organization.settings.inviteLinks", "Invite Links")}
        </h3>
        {!showInviteForm && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
          >
            <Plus size={14} />
            {t("organization.settings.generateLink", "Generate Link")}
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <div className="mb-4 p-3 bg-foreground/[0.03] rounded-xl border border-bridge-accent/20 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t("organization.settings.inviteRole", "Role")}
              </label>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "MEMBER" | "ADMIN")
                }
                className={`w-full ${selectClass}`}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t("organization.settings.expires", "Expires")}
              </label>
              <select
                value={inviteExpiry}
                onChange={(e) => setInviteExpiry(e.target.value)}
                className={`w-full ${selectClass}`}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t("organization.settings.maxUses", "Max Uses")}
              </label>
              <select
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
                className={`w-full ${selectClass}`}
              >
                {MAX_USES_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowInviteForm(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              onClick={handleCreateInviteLink}
              disabled={creatingLink}
              className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {creatingLink ? "..." : t("common.create", "Create")}
            </button>
          </div>
        </div>
      )}

      {/* Link list */}
      {inviteLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("organization.settings.noLinks", "No active invite links")}
        </p>
      ) : (
        <div className="space-y-2">
          {inviteLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Link2 size={14} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate font-mono">
                  {link.code}
                </span>
                {/* Role badge */}
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    link.role === "ADMIN"
                      ? "bg-bridge-accent/20 text-bridge-accent"
                      : "bg-slate-500/20 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {link.role}
                </span>
                {/* Meta info */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-muted-foreground">
                    {link.used_count}
                    {link.max_uses ? `/${link.max_uses}` : ""}{" "}
                    {t("organization.settings.used", "used")}
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
                  title={t(
                    "organization.settings.copyInviteUrl",
                    "Copy invite URL",
                  )}
                >
                  {copiedCode === link.code ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
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
  );
}
