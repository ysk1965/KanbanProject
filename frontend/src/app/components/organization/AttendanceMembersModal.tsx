import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Users, UserX, Palmtree, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { MotionModal } from "../ui/MotionModal";
import { organizationService } from "../../utils/services";
import type { AttendanceTodayMembers } from "../../types";

type TabKey = "present" | "absent" | "leave";

const TABS: {
  key: TabKey;
  labelKey: string;
  fallback: string;
  icon: typeof Users;
  iconClass: string;
}[] = [
  {
    key: "present",
    labelKey: "organization.attendance.present",
    fallback: "Present",
    icon: Users,
    iconClass: "text-emerald-500",
  },
  {
    key: "absent",
    labelKey: "organization.attendance.absent",
    fallback: "Absent",
    icon: UserX,
    iconClass: "text-red-400",
  },
  {
    key: "leave",
    labelKey: "organization.attendance.leave",
    fallback: "Leave",
    icon: Palmtree,
    iconClass: "text-blue-400",
  },
];

const LEAVE_TYPE_STYLE: Record<string, { labelKey: string; fallback: string; className: string }> = {
  FULL_DAY: {
    labelKey: "organization.attendance.fullDayLeave",
    fallback: "Full Day",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  AM_HALF: {
    labelKey: "organization.attendance.amHalfLeave",
    fallback: "AM Half",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  PM_HALF: {
    labelKey: "organization.attendance.pmHalfLeave",
    fallback: "PM Half",
    className: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
};

function extractTimeFromISO(isoStr: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function formatElapsedShort(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface MemberAvatarProps {
  name: string;
  profileImage: string | null;
}

function MemberAvatar({ name, profileImage }: MemberAvatarProps) {
  return profileImage ? (
    <img
      src={profileImage}
      alt={name}
      className="w-9 h-9 rounded-full object-cover shrink-0"
    />
  ) : (
    <div className="w-9 h-9 rounded-full bg-bridge-accent/15 flex items-center justify-center text-bridge-accent text-sm font-bold shrink-0">
      {name.charAt(0)}
    </div>
  );
}

interface AttendanceMembersModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  initialTab?: TabKey;
}

export function AttendanceMembersModal({
  open,
  onClose,
  orgId,
  initialTab = "present",
}: AttendanceMembersModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [data, setData] = useState<AttendanceTodayMembers | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync initialTab when modal re-opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await organizationService.getAttendanceTodayMembers(orgId);
        if (!cancelled) setData(res);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const getTabCount = (key: TabKey): number => {
    if (!data) return 0;
    switch (key) {
      case "present":
        return data.present_members.length;
      case "absent":
        return data.absent_members.length;
      case "leave":
        return data.leave_members.length;
    }
  };

  return (
    <MotionModal open={open} onClose={onClose}>
      <div className="w-full sm:max-w-lg max-h-[75vh] flex flex-col bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl">
        {/* Accent line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent rounded-t-2xl shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <Clock size={16} className="text-bridge-accent" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {t("organization.attendance.memberList", "Attendance Details")}
          </h3>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-foreground/[0.08] px-5 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-bridge-accent"
                  : "text-slate-400 hover:text-foreground"
              }`}
            >
              <tab.icon size={14} className={activeTab === tab.key ? "text-bridge-accent" : tab.iconClass} />
              <span>{t(tab.labelKey, tab.fallback)}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? "bg-bridge-accent/15 text-bridge-accent"
                    : "bg-foreground/[0.06] text-slate-400"
                }`}
              >
                {getTabCount(tab.key)}
              </span>
              {activeTab === tab.key && (
                <motion.div
                  layoutId="attendance-member-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-bridge-accent"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              {t("common.error", "Error")}
            </div>
          ) : (
            <div className="divide-y divide-foreground/[0.06]">
              {activeTab === "present" &&
                (data.present_members.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-12">
                    {t("organization.attendance.noPresent", "No members present")}
                  </div>
                ) : (
                  data.present_members.map((m, i) => (
                    <motion.div
                      key={m.member_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <MemberAvatar name={m.name} profileImage={m.profile_image} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {m.name}
                        </div>
                        {m.department_name && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {m.department_name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400">
                          {extractTimeFromISO(m.clock_in)}
                        </span>
                        {m.clock_out ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500">
                            {t("organization.attendance.clockedOut", "Clocked Out")}
                          </span>
                        ) : m.elapsed_minutes != null ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            {formatElapsedShort(m.elapsed_minutes)}
                          </span>
                        ) : null}
                        {m.late && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            {t("organization.attendance.late", "Late")}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))
                ))}

              {activeTab === "absent" &&
                (data.absent_members.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-12">
                    {t("organization.attendance.noAbsent", "No members absent")}
                  </div>
                ) : (
                  data.absent_members.map((m, i) => (
                    <motion.div
                      key={m.member_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <MemberAvatar name={m.name} profileImage={m.profile_image} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {m.name}
                        </div>
                        {m.department_name && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {m.department_name}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                ))}

              {activeTab === "leave" &&
                (data.leave_members.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-12">
                    {t("organization.attendance.noLeave", "No members on leave")}
                  </div>
                ) : (
                  data.leave_members.map((m, i) => {
                    const style = LEAVE_TYPE_STYLE[m.duration_type] ?? LEAVE_TYPE_STYLE.FULL_DAY;
                    return (
                      <motion.div
                        key={m.member_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <MemberAvatar name={m.name} profileImage={m.profile_image} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {m.name}
                          </div>
                          {m.department_name && (
                            <div className="text-[11px] text-slate-400 truncate">
                              {m.department_name}
                            </div>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${style.className}`}
                        >
                          {t(style.labelKey, style.fallback)}
                        </span>
                      </motion.div>
                    );
                  })
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-foreground/[0.08] shrink-0">
          <span className="text-[10px] text-slate-500">Esc {t("common.close", "Close")}</span>
        </div>
      </div>
    </MotionModal>
  );
}
