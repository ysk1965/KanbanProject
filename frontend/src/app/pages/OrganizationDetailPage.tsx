import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Building2,
  Users,
  LayoutGrid,
  Settings,
  CalendarOff,
  BarChart3,
  TrendingUp,
  Network,
  Clock,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { organizationService, leaveService } from "../utils/services";
import type {
  OrganizationDetail,
  OrgRole,
  LeaveBalance,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
} from "../types";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../components/ui/tooltip";
import { OrgDashboardTab } from "../components/organization/tabs/OrgDashboardTab";
import { OrgMembersTab } from "../components/organization/tabs/OrgMembersTab";
import { OrgBoardsTab } from "../components/organization/tabs/OrgBoardsTab";
import { OrgLeaveTab } from "../components/organization/tabs/OrgLeaveTab";
import { OrgSettingsGeneralSubTab } from "../components/organization/settings/OrgSettingsGeneralSubTab";
import { OrgSettingsStructureSubTab } from "../components/organization/settings/OrgSettingsStructureSubTab";
import { OrgSettingsAttendanceSubTab } from "../components/organization/settings/OrgSettingsAttendanceSubTab";
import { OrgSettingsOnboardingSubTab } from "../components/organization/settings/OrgSettingsOnboardingSubTab";
import { OrgInsightsTab } from "../components/organization/tabs/OrgInsightsTab";
import { OrgAttendanceTab } from "../components/organization/tabs/OrgAttendanceTab";
import { OrgChartTab } from "../components/organization/tabs/OrgChartTab";
import { OrgOkrTab } from "../components/organization/tabs/OrgOkrTab";
import { MemberDetailModal } from "../components/organization/MemberDetailModal";

// ─── Tab types ───

type TabKey =
  | "dashboard"
  | "members"
  | "chart"
  | "boards"
  | "leaves"
  | "attendance"
  | "insights"
  | "okr"
  | "settings"
  | "settings_structure"
  | "settings_attendance"
  | "settings_onboarding";

type GroupKey = "dashboard" | "people" | "leave" | "workspace" | "settings";

interface TabGroup {
  key: GroupKey;
  labelKey: string;
  icon: typeof BarChart3;
  defaultTab: TabKey;
  adminOnly?: boolean;
  subTabs?: { key: TabKey; labelKey: string }[];
}

const ROLE_BADGE_STYLES: Record<OrgRole, string> = {
  OWNER:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  ADMIN: "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30",
  MEMBER:
    "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const TAB_GROUPS: TabGroup[] = [
  {
    key: "dashboard",
    labelKey: "organization.tabs.dashboard",
    icon: BarChart3,
    defaultTab: "dashboard",
  },
  {
    key: "people",
    labelKey: "organization.tabs.people",
    icon: Users,
    defaultTab: "members",
    subTabs: [
      { key: "members", labelKey: "organization.tabs.members" },
      { key: "chart", labelKey: "organization.tabs.chart" },
    ],
  },
  {
    key: "leave",
    labelKey: "organization.tabs.leave",
    icon: CalendarOff,
    defaultTab: "leaves",
    subTabs: [
      { key: "leaves", labelKey: "organization.tabs.leaves" },
      { key: "attendance", labelKey: "organization.tabs.attendance" },
    ],
  },
  {
    key: "workspace",
    labelKey: "organization.tabs.workspace",
    icon: LayoutGrid,
    defaultTab: "boards",
    subTabs: [
      { key: "boards", labelKey: "organization.tabs.boards" },
      { key: "insights", labelKey: "organization.tabs.insights" },
      { key: "okr", labelKey: "organization.tabs.okr" },
    ],
  },
  {
    key: "settings",
    labelKey: "organization.tabs.settings",
    icon: Settings,
    defaultTab: "settings",
    adminOnly: true,
    subTabs: [
      { key: "settings", labelKey: "organization.settings.subtabs.general" },
      { key: "settings_structure", labelKey: "organization.settings.subtabs.structure" },
      { key: "settings_attendance", labelKey: "organization.settings.subtabs.attendance" },
      { key: "settings_onboarding", labelKey: "organization.settings.subtabs.onboarding" },
    ],
  },
];

export function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<OrgRole>("MEMBER");
  const [myLeaveBalances, setMyLeaveBalances] = useState<LeaveBalance[]>([]);
  const [myMemberId, setMyMemberId] = useState<string>("");
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  const [titles, setTitles] = useState<OrgTitle[]>([]);
  const [grades, setGrades] = useState<OrgGrade[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [structureSettings, setStructureSettings] = useState<OrgStructureSettings>({
    departments_enabled: true, job_groups_enabled: true, positions_enabled: true,
    titles_enabled: true, grades_enabled: true,
  });

  const activeTab = (searchParams.get("tab") as TabKey) || "dashboard";

  const setActiveTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";
  const visibleGroups = TAB_GROUPS.filter((g) => !g.adminOnly || isAdmin);

  // Compute active group from active tab
  const activeGroup = useMemo(() => {
    return (
      TAB_GROUPS.find(
        (g) =>
          g.defaultTab === activeTab ||
          g.subTabs?.some((s) => s.key === activeTab),
      ) || TAB_GROUPS[0]
    );
  }, [activeTab]);

  const aggregatedLeave = useMemo(() => {
    const active = myLeaveBalances.filter((b) => b.is_active !== false);
    if (active.length === 0) return null;
    const order = ["ANNUAL", "SICK", "REFRESH", "OTHER"] as const;
    const sums: Record<string, number> = { ANNUAL: 0, SICK: 0, REFRESH: 0, OTHER: 0 };
    for (const b of active) sums[b.leave_category || "OTHER"] += b.remaining;
    const i18nKeys: Record<string, string> = {
      ANNUAL: "organization.settings.categoryAnnual",
      SICK: "organization.settings.categorySick",
      REFRESH: "organization.settings.categoryRefresh",
      OTHER: "organization.settings.categoryOther",
    };
    return {
      values: order.map((c) => sums[c]),
      labels: order.map((c) => i18nKeys[c]),
    };
  }, [myLeaveBalances]);

  const fetchOrg = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const data = await organizationService.get(orgId);
      setOrg(data);
      setMyRole(data.my_role);
      const [balances, membersData, depts, jgs, pos, tls, gds, ss] =
        await Promise.all([
          leaveService.getMyBalance(orgId).catch(() => [] as LeaveBalance[]),
          organizationService
            .getMembers(orgId, { size: 200 })
            .catch(() => null),
          organizationService
            .getDepartments(orgId)
            .catch(() => [] as OrgDepartment[]),
          organizationService
            .getJobGroups(orgId)
            .catch(() => [] as OrgJobGroup[]),
          organizationService
            .getPositions(orgId)
            .catch(() => [] as OrgPosition[]),
          organizationService
            .getTitles(orgId)
            .catch(() => [] as OrgTitle[]),
          organizationService
            .getGrades(orgId)
            .catch(() => [] as OrgGrade[]),
          organizationService
            .getStructureSettings(orgId)
            .catch(() => null as OrgStructureSettings | null),
        ]);
      setMyLeaveBalances(balances);
      setDepartments(depts);
      setJobGroups(jgs);
      setPositions(pos);
      setTitles(tls);
      setGrades(gds);
      if (ss) setStructureSettings(ss);
      if (membersData && currentUser) {
        const me = membersData.content.find(
          (m) => m.user.id === currentUser.id,
        );
        if (me) setMyMemberId(me.id);
      }
    } catch (error) {
      console.warn("Failed to fetch organization:", error);
      navigate("/boards");
    } finally {
      setLoading(false);
    }
  }, [orgId, navigate, currentUser]);

  const refreshLeaveBalances = useCallback(async () => {
    if (!orgId) return;
    try {
      const balances = await leaveService.getMyBalance(orgId);
      setMyLeaveBalances(balances);
    } catch { /* ignore */ }
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  if (loading || !org) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  // ─── Tab Nav (pill style) ───

  const tabNav = (
    <nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl border border-bridge-border overflow-x-auto shrink-0">
      {visibleGroups.map((group) => {
        const Icon = group.icon;
        const isActive = activeGroup.key === group.key;
        return (
          <button
            key={group.key}
            onClick={() => setActiveTab(group.defaultTab)}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              isActive
                ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                : "text-slate-400 hover:text-foreground hover:bg-bridge-surface-hover"
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">
              {t(
                group.labelKey,
                group.key.charAt(0).toUpperCase() + group.key.slice(1),
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bridge-dark flex flex-col">
      {/* Header Bar (full-width, matching MySpace) */}
      <header className="border-b border-foreground/[0.08] bg-bridge-dark/80 backdrop-blur-xl sticky top-0 z-30 shrink-0">
        {/* Desktop: 3-column header */}
        <div className="relative flex items-center justify-between h-14 md:h-16 px-3 md:px-6 gap-3">
          {/* Left: Back + Org Info */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/boards")}
              className="p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-bridge-surface-hover transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-bridge-accent" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm md:text-base font-bold text-foreground tracking-tight truncate max-w-[120px] md:max-w-[200px]">
                    {org.name}
                  </h1>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${ROLE_BADGE_STYLES[myRole]}`}
                  >
                    {myRole}
                  </span>
                </div>
                <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {org.member_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutGrid size={11} />
                    {org.board_count}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center: Tabs (desktop) — absolute center */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {tabNav}
          </div>

          {/* Right: Leave + Profile */}
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            {aggregatedLeave && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveTab("leaves")} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-foreground/[0.03] border border-foreground/[0.08] cursor-pointer hover:border-foreground/[0.15] transition-colors">
                    <span className="text-[10px] md:text-[11px] font-bold text-slate-400">
                      {t("organization.tabs.leave", "휴가")}
                    </span>
                    <span className="text-[10px] md:text-[11px] font-bold text-foreground tracking-wide">
                      {aggregatedLeave.values.join(" \u00B7 ")}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  <span className="text-xs">
                    {aggregatedLeave.labels.map((key, i) => (
                      <span key={key}>
                        {i > 0 && "  |  "}
                        {t(key)} {aggregatedLeave.values[i]}
                      </span>
                    ))}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
            {currentUser && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                title={t("organization.profile.edit", "Edit Profile")}
              >
                {currentUser.profile_image ? (
                  <img
                    src={currentUser.profile_image}
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-bridge-accent/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/15 ring-2 ring-bridge-accent/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-bridge-accent">
                      {currentUser.name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile: Tabs row */}
        <div className="md:hidden pb-3 px-3">
          <div className="overflow-x-auto -mx-1">{tabNav}</div>
        </div>
      </header>

      {/* Sub-tab bar (pill style, matching Board) */}
      {activeGroup.subTabs && (
        <div className="flex items-center justify-center py-1.5 border-b border-foreground/5">
          <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
            {activeGroup.subTabs.map((sub) => (
              <button
                key={sub.key}
                onClick={() => setActiveTab(sub.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === sub.key
                    ? "bg-foreground/10 text-foreground"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                {t(
                  sub.labelKey,
                  sub.key.charAt(0).toUpperCase() + sub.key.slice(1),
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-6">

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "dashboard" && (
                <OrgDashboardTab orgId={orgId!} role={myRole} />
              )}
              {activeTab === "members" && (
                <OrgMembersTab
                  orgId={orgId!}
                  myRole={myRole}
                  myUserId={currentUser?.id || ""}
                />
              )}
              {activeTab === "chart" && (
                <OrgChartTab
                  orgId={orgId!}
                  myRole={myRole}
                  departments={departments}
                  myUserId={currentUser?.id || ""}
                />
              )}
              {activeTab === "boards" && (
                <OrgBoardsTab orgId={orgId!} myRole={myRole} />
              )}
              {activeTab === "leaves" && (
                <OrgLeaveTab orgId={orgId!} myRole={myRole} />
              )}
              {activeTab === "attendance" && (
                <OrgAttendanceTab
                  orgId={orgId!}
                  myRole={myRole}
                  departments={departments}
                />
              )}
              {activeTab === "insights" && (
                <OrgInsightsTab
                  orgId={orgId!}
                  myRole={myRole}
                  departments={departments}
                  jobGroups={jobGroups}
                  structureSettings={structureSettings}
                />
              )}
              {activeTab === "okr" && (
                <OrgOkrTab orgId={orgId!} myRole={myRole} />
              )}
              {activeTab === "settings" && isAdmin && (
                <OrgSettingsGeneralSubTab
                  orgId={orgId!}
                  org={org}
                  myRole={myRole}
                  onUpdate={fetchOrg}
                />
              )}
              {activeTab === "settings_structure" && isAdmin && (
                <OrgSettingsStructureSubTab orgId={orgId!} />
              )}
              {activeTab === "settings_attendance" && isAdmin && (
                <OrgSettingsAttendanceSubTab orgId={orgId!} onLeaveBalanceChange={refreshLeaveBalances} />
              )}
              {activeTab === "settings_onboarding" && isAdmin && (
                <OrgSettingsOnboardingSubTab orgId={orgId!} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {myMemberId && (
        <MemberDetailModal
          open={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          orgId={orgId!}
          memberId={myMemberId}
          myRole={myRole}
          myUserId={currentUser?.id || ""}
          departments={departments}
          jobGroups={jobGroups}
          positions={positions}
          titles={titles}
          grades={grades}
          structureSettings={structureSettings}
          onMemberUpdated={fetchOrg}
        />
      )}
    </div>
  );
}
