import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Clock, LogIn, LogOut, Undo2, Users, UserX, Palmtree } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { organizationService } from "../../utils/services";
import { useOrgData } from "../../contexts/OrgDataContext";
import { AttendanceMembersModal } from "./AttendanceMembersModal";
import type { AttendanceTodayStatus } from "../../types";

interface AttendanceWidgetProps {
  orgId: string;
}

function formatElapsed(
  minutes: number | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (minutes == null || isNaN(minutes) || minutes <= 0)
    return `0${t("organization.attendance.minutes", "m")}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}${t("organization.attendance.minutes", "m")}`;
  if (m === 0) return `${h}${t("organization.attendance.hours", "h")}`;
  return `${h}${t("organization.attendance.hours", "h")} ${m}${t("organization.attendance.minutes", "m")}`;
}

function extractTimeFromISO(isoStr: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

export function AttendanceWidget({ orgId }: AttendanceWidgetProps) {
  const { t } = useTranslation();
  const { org } = useOrgData();
  const hrSystemEnabled = org?.hr_system_enabled === true;
  const [data, setData] = useState<AttendanceTodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"present" | "absent" | "leave">("present");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToday = useCallback(async () => {
    try {
      setLoading(true);
      const res = await organizationService.getAttendanceToday(orgId);
      setData(res);
      if (res.my_record) {
        setElapsed(res.my_record.elapsed_minutes ?? 0);
      }
    } catch {
      // optional
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // Auto-update elapsed time every minute using absolute time calculation
  useEffect(() => {
    if (data?.my_record?.clock_in && !data.my_record.clock_out) {
      const clockInTime = new Date(data.my_record.clock_in).getTime();
      const updateElapsed = () => {
        const now = Date.now();
        setElapsed(Math.floor((now - clockInTime) / 60000));
      };
      updateElapsed();
      intervalRef.current = setInterval(updateElapsed, 60000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data]);

  const handleClockIn = async () => {
    try {
      setActing(true);
      await organizationService.clockIn(orgId);
      toast.success(
        t("organization.attendance.clockInSuccess", "Clocked in successfully"),
      );
      fetchToday();
    } catch {
      toast.error(t("organization.attendance.clockIn", "Clock In") + " failed");
    } finally {
      setActing(false);
    }
  };

  const handleClockOut = async () => {
    try {
      setActing(true);
      await organizationService.clockOut(orgId);
      toast.success(
        t(
          "organization.attendance.clockOutSuccess",
          "Clocked out successfully",
        ),
      );
      if (intervalRef.current) clearInterval(intervalRef.current);
      fetchToday();
    } catch {
      toast.error(
        t("organization.attendance.clockOut", "Clock Out") + " failed",
      );
    } finally {
      setActing(false);
    }
  };

  const handleCancelClockOut = async () => {
    try {
      setActing(true);
      await organizationService.cancelClockOut(orgId);
      toast.success(
        t("organization.attendance.cancelClockOutSuccess", "Clock out cancelled"),
      );
      fetchToday();
    } catch {
      toast.error(
        t("organization.attendance.cancelClockOutFailed", "Failed to cancel clock out"),
      );
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse h-32" />
    );
  }

  if (!data) return null;

  const myRecord = data.my_record;
  const isClockedIn = !!myRecord?.clock_in;
  const isClockedOut = !!myRecord?.clock_out;
  const isWorking = isClockedIn && !isClockedOut;
  const totalLeaves =
    (data.full_day_leave_count ?? 0) +
    (data.am_half_leave_count ?? 0) +
    (data.pm_half_leave_count ?? 0);

  const teamStats = [
    {
      icon: Users,
      iconClass: "text-emerald-500",
      label: t("organization.attendance.present", "Present"),
      value: data.present_count,
      tabKey: "present" as const,
    },
    {
      icon: UserX,
      iconClass: "text-red-400",
      label: t("organization.attendance.absent", "Absent"),
      value: data.absent_count,
      tabKey: "absent" as const,
    },
    ...(!hrSystemEnabled ? [{
      icon: Palmtree,
      iconClass: "text-blue-400",
      label: t("organization.attendance.leave", "Leave"),
      value: totalLeaves,
      tabKey: "leave" as const,
    }] : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <Clock size={15} className="text-bridge-accent" />
        <h3 className="text-[13px] font-bold text-foreground">
          {t("organization.attendance.todayStatus", "Today's Attendance")}
        </h3>
      </div>

      {/* My Status — Hero Section */}
      <div className="px-5 pb-4">
        <div className={`rounded-xl p-4 ${
          isClockedOut
            ? "bg-blue-500/[0.07] border border-blue-500/15"
            : isWorking
              ? "bg-emerald-500/[0.07] border border-emerald-500/15"
              : "bg-foreground/[0.03]"
        }`}>
          {isWorking ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {t("organization.attendance.working", "Working")}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <span>
                      {extractTimeFromISO(myRecord!.clock_in)}{" "}
                      {t("organization.attendance.clockInTime", "Clock In")}
                    </span>
                    <span className="text-foreground/15">·</span>
                    <span>
                      {formatElapsed(elapsed, t)}{" "}
                      {t("organization.attendance.elapsed", "Elapsed")}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleClockOut}
                disabled={acting}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500/25 transition-all disabled:opacity-50"
              >
                <LogOut size={13} />
                {t("organization.attendance.clockOut", "Clock Out")}
              </button>
            </div>
          ) : isClockedOut ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <LogOut size={16} className="text-blue-500" />
                </div>
                <div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {t("organization.attendance.clockedOut", "Clocked Out")}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                    <span>
                      {t("organization.attendance.clockInTime", "Clock In")}{" "}
                      {extractTimeFromISO(myRecord!.clock_in)}
                    </span>
                    <span className="text-foreground/20">·</span>
                    <span>
                      {t("organization.attendance.clockOutTime", "Clock Out")}{" "}
                      {extractTimeFromISO(myRecord!.clock_out)}
                    </span>
                    <span className="text-foreground/20">·</span>
                    <span className="font-medium text-foreground/70">
                      {t("organization.attendance.totalWork", "Total Work")}{" "}
                      {formatElapsed(myRecord!.work_minutes, t)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleCancelClockOut}
                disabled={acting}
                className="flex items-center gap-1.5 px-3 py-2 bg-foreground/5 text-slate-500 dark:text-slate-400 border border-foreground/10 rounded-xl text-xs font-bold hover:bg-foreground/10 transition-all disabled:opacity-50 shrink-0"
              >
                <Undo2 size={13} />
                {t("organization.attendance.cancelClockOut", "Cancel")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-400/50" />
                </div>
                <span className="text-xs text-slate-400">
                  {t("organization.attendance.notClockedIn", "Not Clocked In")}
                </span>
              </div>
              <button
                onClick={handleClockIn}
                disabled={acting}
                className="flex items-center gap-1.5 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
              >
                <LogIn size={13} />
                {t("organization.attendance.clockIn", "Clock In")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Team Stats — Compact Footer (clickable) */}
      <div className="flex items-center divide-x divide-foreground/[0.06] border-t border-foreground/[0.06]">
        {teamStats.map((stat) => (
          <button
            key={stat.label}
            onClick={() => {
              setModalTab(stat.tabKey);
              setModalOpen(true);
            }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 hover:bg-foreground/[0.03] transition-colors cursor-pointer"
          >
            <stat.icon size={13} className={stat.iconClass} />
            <span className="text-xs text-slate-400">{stat.label}</span>
            <span className="text-sm font-bold text-foreground">{stat.value}</span>
          </button>
        ))}
      </div>

      {/* Members detail modal */}
      <AttendanceMembersModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orgId={orgId}
        initialTab={modalTab}
      />
    </motion.div>
  );
}
