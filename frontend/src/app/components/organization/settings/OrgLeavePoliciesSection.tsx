import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, CalendarDays } from "lucide-react";
import { leaveService } from "../../../utils/services";
import type { LeavePolicy, LeaveCategory } from "../../../types";

interface OrgLeavePoliciesSectionProps {
  orgId: string;
  leavePolicies: LeavePolicy[];
  onRefresh: () => void;
}

const CATEGORY_COLORS: Record<LeaveCategory, string> = {
  ANNUAL: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  SICK: "bg-red-500/20 text-red-600 dark:text-red-400",
  REFRESH: "bg-teal-500/20 text-teal-600 dark:text-teal-400",
  OTHER: "bg-slate-500/20 text-slate-600 dark:text-slate-400",
};

const CATEGORY_LABEL_KEYS: Record<LeaveCategory, string> = {
  ANNUAL: "organization.settings.categoryAnnual",
  SICK: "organization.settings.categorySick",
  REFRESH: "organization.settings.categoryRefresh",
  OTHER: "organization.settings.categoryOther",
};

const selectClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all appearance-none cursor-pointer";
const inputSmClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

export function OrgLeavePoliciesSection({
  orgId,
  leavePolicies,
  onRefresh,
}: OrgLeavePoliciesSectionProps) {
  const { t } = useTranslation();

  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editPolicy, setEditPolicy] = useState({
    name: "",
    default_days: 0,
    is_paid: true,
    requires_approval: true,
    description: "",
  });
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: "",
    leave_category: "OTHER" as LeaveCategory,
    default_days: 0,
    is_paid: true,
    requires_approval: true,
    description: "",
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  // ── Handlers ──

  const startEditPolicy = (p: LeavePolicy) => {
    setEditingPolicyId(p.id);
    setEditPolicy({
      name: p.name,
      default_days: p.default_days,
      is_paid: p.is_paid,
      requires_approval: p.requires_approval,
      description: p.description || "",
    });
  };

  const handleSavePolicy = async (policyId: string) => {
    try {
      setSavingPolicy(true);
      await leaveService.updatePolicy(orgId, policyId, editPolicy);
      setEditingPolicyId(null);
      onRefresh();
    } catch (error) {
      console.warn("Failed to update policy:", error);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleTogglePolicyActive = async (p: LeavePolicy) => {
    try {
      await leaveService.updatePolicy(orgId, p.id, {
        is_active: !p.is_active,
      });
      onRefresh();
    } catch (error) {
      console.warn("Failed to toggle policy:", error);
    }
  };

  const handleCreatePolicy = async () => {
    if (!newPolicy.name.trim()) return;
    try {
      setSavingPolicy(true);
      await leaveService.createPolicy(orgId, {
        ...newPolicy,
        name: newPolicy.name.trim(),
        description: newPolicy.description.trim() || undefined,
      });
      setShowNewPolicy(false);
      setNewPolicy({
        name: "",
        leave_category: "OTHER",
        default_days: 0,
        is_paid: true,
        requires_approval: true,
        description: "",
      });
      onRefresh();
    } catch (error) {
      console.warn("Failed to create policy:", error);
    } finally {
      setSavingPolicy(false);
    }
  };

  // ── Render ──

  return (
    <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <CalendarDays size={16} className="text-amber-400" />
          {t("organization.settings.leavePolicies", "Leave Policies")}
        </h3>
        {!showNewPolicy && (
          <button
            onClick={() => setShowNewPolicy(true)}
            className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
          >
            <Plus size={14} />
            {t("organization.settings.addPolicy", "Add Policy")}
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
                    onChange={(e) =>
                      setEditPolicy({ ...editPolicy, name: e.target.value })
                    }
                    placeholder={t(
                      "organization.settings.policyNamePlaceholder",
                      "Policy name",
                    )}
                    className={inputSmClass}
                  />
                  <input
                    type="number"
                    value={editPolicy.default_days}
                    onChange={(e) =>
                      setEditPolicy({
                        ...editPolicy,
                        default_days: Number(e.target.value),
                      })
                    }
                    min={0}
                    step={0.5}
                    className={inputSmClass}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPolicy.is_paid}
                      onChange={(e) =>
                        setEditPolicy({
                          ...editPolicy,
                          is_paid: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    {t("organization.settings.paid", "Paid")}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPolicy.requires_approval}
                      onChange={(e) =>
                        setEditPolicy({
                          ...editPolicy,
                          requires_approval: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    {t(
                      "organization.settings.requiresApproval",
                      "Requires Approval",
                    )}
                  </label>
                </div>
                <input
                  type="text"
                  value={editPolicy.description}
                  onChange={(e) =>
                    setEditPolicy({
                      ...editPolicy,
                      description: e.target.value,
                    })
                  }
                  placeholder={t(
                    "organization.settings.policyDescription",
                    "Description (optional)",
                  )}
                  className={`w-full ${inputSmClass}`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingPolicyId(null)}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("common.cancel", "Cancel")}
                  </button>
                  <button
                    onClick={() => handleSavePolicy(p.id)}
                    disabled={savingPolicy || !editPolicy.name.trim()}
                    className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                  >
                    {savingPolicy ? "..." : t("common.save", "Save")}
                  </button>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm text-foreground font-medium">
                    {p.name}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[p.leave_category]}`}
                  >
                    {t(CATEGORY_LABEL_KEYS[p.leave_category])}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {p.default_days}d
                  </span>
                  {p.is_paid && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      {t("organization.settings.paid", "Paid")}
                    </span>
                  )}
                  {p.requires_approval && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                      {t("organization.settings.approval", "Approval")}
                    </span>
                  )}
                  <button
                    onClick={() => handleTogglePolicyActive(p)}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                      p.is_active
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400"
                        : "bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400"
                    }`}
                  >
                    {p.is_active
                      ? t("organization.settings.active", "Active")
                      : t("organization.settings.inactive", "Inactive")}
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
                onChange={(e) =>
                  setNewPolicy({ ...newPolicy, name: e.target.value })
                }
                placeholder={t(
                  "organization.settings.policyNamePlaceholder",
                  "Policy name",
                )}
                className={`col-span-1 ${inputSmClass}`}
              />
              <select
                value={newPolicy.leave_category}
                onChange={(e) =>
                  setNewPolicy({
                    ...newPolicy,
                    leave_category: e.target.value as LeaveCategory,
                  })
                }
                className={selectClass}
              >
                {(Object.keys(CATEGORY_LABEL_KEYS) as LeaveCategory[]).map(
                  (cat) => (
                    <option key={cat} value={cat}>
                      {t(CATEGORY_LABEL_KEYS[cat])}
                    </option>
                  ),
                )}
              </select>
              <input
                type="number"
                value={newPolicy.default_days}
                onChange={(e) =>
                  setNewPolicy({
                    ...newPolicy,
                    default_days: Number(e.target.value),
                  })
                }
                min={0}
                step={0.5}
                placeholder={t("organization.settings.daysPlaceholder", "Days")}
                className={inputSmClass}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPolicy.is_paid}
                  onChange={(e) =>
                    setNewPolicy({ ...newPolicy, is_paid: e.target.checked })
                  }
                  className="rounded"
                />
                {t("organization.settings.paid", "Paid")}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPolicy.requires_approval}
                  onChange={(e) =>
                    setNewPolicy({
                      ...newPolicy,
                      requires_approval: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                {t(
                  "organization.settings.requiresApproval",
                  "Requires Approval",
                )}
              </label>
            </div>
            <input
              type="text"
              value={newPolicy.description}
              onChange={(e) =>
                setNewPolicy({ ...newPolicy, description: e.target.value })
              }
              placeholder={t(
                "organization.settings.policyDescription",
                "Description (optional)",
              )}
              className={`w-full ${inputSmClass}`}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewPolicy(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={handleCreatePolicy}
                disabled={savingPolicy || !newPolicy.name.trim()}
                className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {savingPolicy ? "..." : t("common.create", "Create")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
