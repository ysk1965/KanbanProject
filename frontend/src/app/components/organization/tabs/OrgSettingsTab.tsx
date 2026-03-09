import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Settings,
  Building2,
  Clock,
  Rocket,
  CreditCard,
} from "lucide-react";
import { OrgSettingsGeneralSubTab } from "../settings/OrgSettingsGeneralSubTab";
import { OrgSettingsStructureSubTab } from "../settings/OrgSettingsStructureSubTab";
import { OrgSettingsAttendanceSubTab } from "../settings/OrgSettingsAttendanceSubTab";
import { OrgSettingsOnboardingSubTab } from "../settings/OrgSettingsOnboardingSubTab";
import { OrgBillingSection } from "../subscription/OrgBillingSection";
import { useOrgData } from "../../../contexts/OrgDataContext";
import type { OrganizationDetail, OrgRole } from "../../../types";

interface OrgSettingsTabProps {
  orgId: string;
  org: OrganizationDetail;
  myRole: OrgRole;
  onUpdate: () => void;
}

type SettingsSubTab = "general" | "structure" | "attendance" | "onboarding" | "subscription";

export function OrgSettingsTab({
  orgId,
  org,
  myRole,
  onUpdate,
}: OrgSettingsTabProps) {
  const { t } = useTranslation();
  const { subscription, loadSubscription, refreshSubscription } = useOrgData();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("general");

  useEffect(() => {
    if (activeSubTab === "subscription") {
      loadSubscription();
    }
  }, [activeSubTab, loadSubscription]);

  const subTabs: { key: SettingsSubTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "general",
      label: t("organization.settings.subtabs.general", "General"),
      icon: <Settings size={14} />,
    },
    {
      key: "structure",
      label: t("organization.settings.subtabs.structure", "Organization Structure"),
      icon: <Building2 size={14} />,
    },
    {
      key: "attendance",
      label: t("organization.settings.subtabs.attendance", "Attendance & Leave"),
      icon: <Clock size={14} />,
    },
    {
      key: "onboarding",
      label: t("organization.settings.subtabs.onboarding", "Onboarding"),
      icon: <Rocket size={14} />,
    },
    {
      key: "subscription",
      label: t("organization.settings.subtabs.subscription", "Subscription"),
      icon: <CreditCard size={14} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSubTab === tab.key
                ? "bg-bridge-accent text-white"
                : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab Content */}
      <motion.div
        key={activeSubTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {activeSubTab === "general" && (
          <OrgSettingsGeneralSubTab
            orgId={orgId}
            org={org}
            myRole={myRole}
            onUpdate={onUpdate}
          />
        )}
        {activeSubTab === "structure" && (
          <OrgSettingsStructureSubTab orgId={orgId} />
        )}
        {activeSubTab === "attendance" && (
          <OrgSettingsAttendanceSubTab orgId={orgId} />
        )}
        {activeSubTab === "onboarding" && (
          <OrgSettingsOnboardingSubTab orgId={orgId} />
        )}
        {activeSubTab === "subscription" && (
          subscription ? (
            <OrgBillingSection
              orgId={orgId}
              subscription={subscription}
              onUpdate={refreshSubscription}
            />
          ) : (
            <div className="text-center py-12 text-sm text-slate-500">
              {t("orgSubscription.billing.unavailable", "Subscription data unavailable")}
            </div>
          )
        )}
      </motion.div>
    </div>
  );
}
