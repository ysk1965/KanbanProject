import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Users, LayoutGrid, CalendarOff, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { organizationService, leaveService, orgSubscriptionService } from "../../../utils/services";
import { getTodayDateString } from "../../../utils/dateUtils";
import type {
  OrgBoardSimple,
  LeaveRequestResponse,
  OrgRole,
  OrgAnnouncement,
  AnniversaryType,
  OrgSubscription,
} from "../../../types";
import { OrgSubscriptionBadge } from "../subscription/OrgSubscriptionBadge";
import { OrgAnnouncementModal } from "../OrgAnnouncementModal";
import { OrgAnnouncementListModal } from "../OrgAnnouncementListModal";
import { AttendanceWidget } from "../AttendanceWidget";
import { CelebrationModal } from "../CelebrationModal";
import { OrgFeedSection } from "../OrgFeedSection";
import { OkrDashboardWidget } from "../okr/OkrDashboardWidget";

interface OrgDashboardTabProps {
  orgId: string;
  role: OrgRole;
}

export function OrgDashboardTab({ orgId, role }: OrgDashboardTabProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [boards, setBoards] = useState<OrgBoardSimple[]>([]);
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequestResponse[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);

  // Announcement modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<OrgAnnouncement | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Anniversary celebration modal
  const [celebrationTarget, setCelebrationTarget] = useState<{
    memberId: string;
    memberName: string;
    type: AnniversaryType;
    date: string;
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [boardsData, orgData] = await Promise.all([
          organizationService.getBoards(orgId),
          organizationService.get(orgId),
        ]);
        setBoards(boardsData);
        setMemberCount(orgData.member_count);

        // Fetch subscription data
        try {
          const subData = await orgSubscriptionService.get(orgId);
          setSubscription(subData);
        } catch {
          // Subscription data is optional
        }

        // Fetch today's approved leaves
        const today = getTodayDateString();
        try {
          const leavesData = await leaveService.getRequests(orgId, {
            status: "APPROVED",
            start_date: today,
            end_date: today,
            size: 100,
          });
          setTodayLeaves(leavesData.content);
        } catch {
          // Leave data is optional
        }
      } catch (error) {
        console.warn("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orgId]);

  const handleAnnouncementSaved = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Stats Cards — compact single row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden relative"
      >
        {subscription && (
          <div className="absolute top-2 right-3 z-10">
            <OrgSubscriptionBadge
              plan={subscription.plan}
              status={subscription.status}
              trialEndsAt={subscription.trial_ends_at}
              size="sm"
            />
          </div>
        )}
        {[
          {
            icon: Users,
            bgClass: "bg-bridge-accent/15",
            textClass: "text-bridge-accent",
            label: t("organization.dashboard.members", "Members"),
            value: memberCount,
            tab: "members" as const,
          },
          {
            icon: LayoutGrid,
            bgClass: "bg-bridge-secondary/15",
            textClass: "text-bridge-secondary",
            label: t("organization.dashboard.boards", "Boards"),
            value: boards.length,
            tab: "boards" as const,
          },
          {
            icon: CalendarOff,
            bgClass: "bg-amber-500/15",
            textClass: "text-amber-500",
            label: t("organization.dashboard.todayLeaves", "Today's Leaves"),
            value: todayLeaves.length,
            tab: "leaves" as const,
          },
        ].map((stat, index, arr) => (
          <div
            key={stat.label}
            onClick={() => setSearchParams({ tab: stat.tab })}
            className={`flex-1 flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-foreground/5 transition-colors group ${
              index < arr.length - 1 ? "border-r border-foreground/[0.08]" : ""
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg ${stat.bgClass} flex items-center justify-center shrink-0`}
            >
              <stat.icon size={14} className={stat.textClass} />
            </div>
            <span className="text-[11px] text-slate-400 truncate">
              {stat.label}
            </span>
            <span className="text-lg font-bold text-foreground ml-auto">
              {stat.value}
            </span>
            <ChevronRight size={12} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        ))}
      </motion.div>

      {/* 2. Attendance Widget */}
      <AttendanceWidget orgId={orgId} />

      {/* 3. OKR + Onboarding Widget */}
      <OkrDashboardWidget
        orgId={orgId}
        onNavigateOkr={() => setSearchParams({ tab: "okr" })}
        onNavigateOnboarding={() => setSearchParams({ tab: "settings", subtab: "onboarding" })}
      />

      {/* 4. Feed — Anniversaries + Announcements (Shorts-style swipe) */}
      <OrgFeedSection
        key={refreshKey}
        orgId={orgId}
        role={role}
        refreshKey={refreshKey}
        onOpenCelebration={(memberId, memberName, type, date) => {
          setCelebrationTarget({ memberId, memberName, type, date });
        }}
        onCreateAnnouncement={() => {
          setEditingAnnouncement(null);
          setShowCreateModal(true);
        }}
        onEditAnnouncement={(a) => {
          setEditingAnnouncement(a);
          setShowCreateModal(true);
        }}
        onViewAllAnnouncements={() => setShowListModal(true)}
      />

      {/* Modals */}
      <OrgAnnouncementModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingAnnouncement(null);
        }}
        orgId={orgId}
        editing={editingAnnouncement}
        onSaved={handleAnnouncementSaved}
      />
      <OrgAnnouncementListModal
        open={showListModal}
        onClose={() => setShowListModal(false)}
        orgId={orgId}
        role={role}
        onEditClick={(a) => {
          setEditingAnnouncement(a);
          setShowCreateModal(true);
        }}
      />
      {celebrationTarget && (
        <CelebrationModal
          open={!!celebrationTarget}
          onClose={() => setCelebrationTarget(null)}
          orgId={orgId}
          {...celebrationTarget}
        />
      )}
    </div>
  );
}
