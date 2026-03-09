import { useState, useMemo, useCallback, useRef } from "react";
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
  Camera,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { OrgDataProvider, useOrgData } from "../contexts/OrgDataContext";
import type { OrgRole } from "../types";
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
import { OrgPhotoGalleryTab } from "../components/organization/tabs/OrgPhotoGalleryTab";
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
  | "photos"
  | "settings"
  | "settings_structure"
  | "settings_attendance"
  | "settings_onboarding";

type GroupKey = "dashboard" | "people" | "leave" | "workspace" | "photos" | "settings";

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
    key: "photos",
    labelKey: "organization.tabs.photos",
    icon: Camera,
    defaultTab: "photos",
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

  if (!orgId) return null;

  return (
    <OrgDataProvider orgId={orgId}>
      <OrgDetailPageContent />
    </OrgDataProvider>
  );
}

function OrgDetailPageContent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    orgId,
    org,
    myRole,
    myMemberId,
    isAdmin,
    departments,
    jobGroups,
    positions,
    titles,
    grades,
    structureSettings,
    myLeaveBalances,
    loading,
    refreshOrg,
    refreshLeaveBalances,
  } = useOrgData();

  const [showProfileModal, setShowProfileModal] = useState(false);

  // ─── Tab state with visited-tab persistence ───
  const activeTab = (searchParams.get("tab") as TabKey) || "dashboard";
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set([activeTab]));

  const setActiveTab = useCallback((tab: TabKey) => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      return new Set([...prev, tab]);
    });
    setSearchParams({ tab });
  }, [setSearchParams]);

  const hrSystemEnabled = org?.hr_system_enabled === true;
  const visibleGroups = TAB_GROUPS.filter((g) => {
    if (g.adminOnly && !isAdmin) return false;
    if (g.key === "leave" && hrSystemEnabled) return false;
    return true;
  });

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

  // ─── Sub-tab swipe navigation (mobile) ───
  const touchStartRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);
  const slideAnimRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const triggerSlide = useCallback((dir: number) => {
    const el = slideAnimRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = `translateX(${dir * 60}px)`;
    el.style.opacity = "0";
    el.offsetHeight; // force reflow
    el.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
    el.style.transform = "translateX(0)";
    el.style.opacity = "1";
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const target = touchStartRef.current.target;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    // 가로 스크롤 가능한 컨테이너 내부에서 시작된 스와이프는 무시
    let el = target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth + 1) return;
      el = el.parentElement;
    }

    const currentGroup = TAB_GROUPS.find(
      (g) => g.defaultTab === activeTabRef.current || g.subTabs?.some((s) => s.key === activeTabRef.current),
    );
    if (!currentGroup?.subTabs) return;

    const currentIdx = currentGroup.subTabs.findIndex((s) => s.key === activeTabRef.current);
    if (currentIdx === -1) return;

    const nextIdx = deltaX < 0 ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx < 0 || nextIdx >= currentGroup.subTabs.length) return;

    triggerSlide(deltaX < 0 ? -1 : 1);
    setActiveTab(currentGroup.subTabs[nextIdx].key);
  }, [setActiveTab, triggerSlide]);

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

  // ─── Tab rendering helper: visited tabs stay mounted, hidden when inactive ───
  const renderTab = (key: TabKey, component: React.ReactNode, adminRequired = false) => {
    if (adminRequired && !isAdmin) return null;
    if (!visitedTabs.has(key)) return null;
    return (
      <div key={key} className={activeTab === key ? undefined : "hidden"}>
        {activeTab === key ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {component}
          </motion.div>
        ) : (
          component
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bridge-dark flex flex-col">
      {/* Header Bar (full-width, matching MySpace) */}
      <header className="border-b border-foreground/[0.08] bg-bridge-dark/80 backdrop-blur-xl sticky top-0 z-30 shrink-0 safe-top">
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
            {aggregatedLeave && !hrSystemEnabled && (
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

        {/* Sub-tab bar (pill style, matching Board) */}
        {activeGroup.subTabs && (
          <div className="flex items-center justify-center py-1.5 border-t border-foreground/5">
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
      </header>

      {/* Content — visited tabs stay mounted (hidden when inactive) */}
      <div className="flex-1" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div ref={slideAnimRef} className="max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-6">
          {renderTab("dashboard",
            <OrgDashboardTab orgId={orgId} role={myRole} />
          )}
          {renderTab("members",
            <OrgMembersTab
              orgId={orgId}
              myRole={myRole}
              myUserId={currentUser?.id || ""}
              departments={departments}
              jobGroups={jobGroups}
              positions={positions}
              titles={titles}
              grades={grades}
              structureSettings={structureSettings}
            />
          )}
          {renderTab("chart",
            <OrgChartTab
              orgId={orgId}
              myRole={myRole}
              departments={departments}
              myUserId={currentUser?.id || ""}
              jobGroups={jobGroups}
              positions={positions}
              titles={titles}
              grades={grades}
              structureSettings={structureSettings}
            />
          )}
          {renderTab("boards",
            <OrgBoardsTab orgId={orgId} myRole={myRole} />
          )}
          {renderTab("leaves",
            <OrgLeaveTab orgId={orgId} myRole={myRole} />
          )}
          {renderTab("attendance",
            <OrgAttendanceTab
              orgId={orgId}
              myRole={myRole}
              departments={departments}
            />
          )}
          {renderTab("insights",
            <OrgInsightsTab
              orgId={orgId}
              myRole={myRole}
              departments={departments}
              jobGroups={jobGroups}
              structureSettings={structureSettings}
            />
          )}
          {renderTab("okr",
            <OrgOkrTab orgId={orgId} myRole={myRole} />
          )}
          {renderTab("photos",
            <OrgPhotoGalleryTab orgId={orgId} myRole={myRole} />
          )}
          {renderTab("settings",
            <OrgSettingsGeneralSubTab
              orgId={orgId}
              org={org}
              myRole={myRole}
              onUpdate={refreshOrg}
            />,
            true,
          )}
          {renderTab("settings_structure",
            <OrgSettingsStructureSubTab orgId={orgId} />,
            true,
          )}
          {renderTab("settings_attendance",
            <OrgSettingsAttendanceSubTab orgId={orgId} onLeaveBalanceChange={refreshLeaveBalances} hrSystemEnabled={hrSystemEnabled} />,
            true,
          )}
          {renderTab("settings_onboarding",
            <OrgSettingsOnboardingSubTab orgId={orgId} />,
            true,
          )}
        </div>

        {/* Bottom spacer for mobile tab bar */}
        <div className="shrink-0 md:hidden" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }} />
      </div>

      {/* ─── Mobile Bottom Tab Bar (MySpace style) ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bridge-obsidian/95 backdrop-blur-xl border-t border-foreground/10"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            const isActive = activeGroup.key === group.key;
            return (
              <button
                key={group.key}
                onClick={() => setActiveTab(group.defaultTab)}
                className="relative flex flex-col items-center gap-0.5 py-1 px-2 min-w-0"
              >
                {isActive && (
                  <motion.div
                    layoutId="org-tab-indicator"
                    className="absolute -top-2 w-8 h-[3px] rounded-full bg-bridge-secondary"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                {isActive && (
                  <motion.div
                    layoutId="org-tab-glow"
                    className="absolute inset-0 rounded-xl bg-bridge-secondary/8"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={isActive ? { scale: 1.15, y: -2 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <Icon
                    size={20}
                    className={`transition-colors duration-200 ${
                      isActive ? "text-bridge-secondary" : "text-slate-500"
                    }`}
                  />
                </motion.div>
                <motion.span
                  className={`text-[10px] font-medium transition-colors duration-200 ${
                    isActive ? "text-bridge-secondary" : "text-slate-500"
                  }`}
                  animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {t(group.labelKey, group.key.charAt(0).toUpperCase() + group.key.slice(1))}
                </motion.span>
              </button>
            );
          })}
        </div>
      </nav>

      {myMemberId && (
        <MemberDetailModal
          open={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          orgId={orgId}
          memberId={myMemberId}
          myRole={myRole}
          myUserId={currentUser?.id || ""}
          departments={departments}
          jobGroups={jobGroups}
          positions={positions}
          titles={titles}
          grades={grades}
          structureSettings={structureSettings}
          onMemberUpdated={refreshOrg}
        />
      )}
    </div>
  );
}
