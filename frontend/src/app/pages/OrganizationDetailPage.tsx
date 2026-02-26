import { useState, useEffect, useCallback } from "react";
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
  Palmtree,
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
} from "../types";
import { OrgDashboardTab } from "../components/organization/tabs/OrgDashboardTab";
import { OrgMembersTab } from "../components/organization/tabs/OrgMembersTab";
import { OrgBoardsTab } from "../components/organization/tabs/OrgBoardsTab";
import { OrgLeaveTab } from "../components/organization/tabs/OrgLeaveTab";
import { OrgSettingsTab } from "../components/organization/tabs/OrgSettingsTab";
import { OrgInsightsTab } from "../components/organization/tabs/OrgInsightsTab";
import { OrgAttendanceTab } from "../components/organization/tabs/OrgAttendanceTab";
import { OrgChartTab } from "../components/organization/tabs/OrgChartTab";
import { MemberDetailModal } from "../components/organization/MemberDetailModal";

type TabKey =
  | "dashboard"
  | "members"
  | "chart"
  | "boards"
  | "leaves"
  | "attendance"
  | "insights"
  | "settings";

const ROLE_BADGE_STYLES: Record<OrgRole, string> = {
  OWNER:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  ADMIN: "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30",
  MEMBER:
    "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const TABS: {
  key: TabKey;
  labelKey: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}[] = [
  {
    key: "dashboard",
    labelKey: "organization.tabs.dashboard",
    icon: <BarChart3 size={16} />,
  },
  {
    key: "members",
    labelKey: "organization.tabs.members",
    icon: <Users size={16} />,
  },
  {
    key: "chart",
    labelKey: "organization.tabs.chart",
    icon: <Network size={16} />,
  },
  {
    key: "boards",
    labelKey: "organization.tabs.boards",
    icon: <LayoutGrid size={16} />,
  },
  {
    key: "leaves",
    labelKey: "organization.tabs.leaves",
    icon: <CalendarOff size={16} />,
  },
  {
    key: "attendance",
    labelKey: "organization.tabs.attendance",
    icon: <Clock size={16} />,
  },
  {
    key: "insights",
    labelKey: "organization.tabs.insights",
    icon: <TrendingUp size={16} />,
  },
  {
    key: "settings",
    labelKey: "organization.tabs.settings",
    icon: <Settings size={16} />,
    adminOnly: true,
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

  const activeTab = (searchParams.get("tab") as TabKey) || "dashboard";

  const setActiveTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  const fetchOrg = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const data = await organizationService.get(orgId);
      setOrg(data);
      setMyRole(data.my_role);
      // Fetch supplementary data in parallel
      const [balances, membersData, depts, jgs, pos, tls, gds] = await Promise.all([
        leaveService.getMyBalance(orgId).catch(() => [] as LeaveBalance[]),
        organizationService.getMembers(orgId, { size: 200 }).catch(() => null),
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
      ]);
      setMyLeaveBalances(balances);
      setDepartments(depts);
      setJobGroups(jgs);
      setPositions(pos);
      setTitles(tls);
      setGrades(gds);
      if (membersData && currentUser) {
        const me = membersData.content.find(
          (m) => m.user.id === currentUser.id,
        );
        if (me) setMyMemberId(me.id);
      }
    } catch (error) {
      console.warn("Failed to fetch organization:", error);
      navigate("/organizations");
    } finally {
      setLoading(false);
    }
  }, [orgId, navigate, currentUser]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  if (loading || !org) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/organizations")}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-10 h-10 rounded-xl object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-bridge-accent/15 flex items-center justify-center">
                  <Building2 size={20} className="text-bridge-accent" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground tracking-tight">
                    {org.name}
                  </h1>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${ROLE_BADGE_STYLES[myRole]}`}
                  >
                    {myRole}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {org.member_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutGrid size={12} />
                    {org.board_count}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* My Profile & Leave Balance */}
          <div className="flex items-center gap-3">
            {myLeaveBalances.length > 0 && (
              <div className="flex items-center gap-2 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] px-3 py-2">
                <Palmtree size={14} className="text-emerald-500 shrink-0" />
                <div className="flex items-center gap-2">
                  {myLeaveBalances.map((b) => (
                    <div key={b.id} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {b.policy_name}
                      </span>
                      <span className="text-[13px] font-bold text-foreground">
                        {b.remaining}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        / {b.total_days}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentUser && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                title={t("organization.profile.edit", "Edit Profile")}
              >
                {currentUser.profile_image ? (
                  <img
                    src={currentUser.profile_image}
                    alt={currentUser.name}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-bridge-accent/30"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-bridge-accent/15 ring-2 ring-bridge-accent/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-bridge-accent">
                      {currentUser.name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-px">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-bridge-accent/10 text-bridge-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              {tab.icon}
              {t(
                tab.labelKey,
                tab.key.charAt(0).toUpperCase() + tab.key.slice(1),
              )}
            </button>
          ))}
        </div>

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
              />
            )}
            {activeTab === "settings" && isAdmin && (
              <OrgSettingsTab
                orgId={orgId!}
                org={org}
                myRole={myRole}
                onUpdate={fetchOrg}
              />
            )}
          </motion.div>
        </AnimatePresence>
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
          onMemberUpdated={fetchOrg}
        />
      )}
    </div>
  );
}
