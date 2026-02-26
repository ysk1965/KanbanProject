import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Clock, LogIn, LogOut, Undo2, Users, UserX, Palmtree } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { organizationService } from "../../utils/services";
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
  const [data, setData] = useState<AttendanceTodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
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
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 animate-pulse h-28" />
    );
  }

  if (!data) return null;

  const myRecord = data.my_record;
  const isClockedIn = !!myRecord?.clock_in;
  const isClockedOut = !!myRecord?.clock_out;
  const isWorking = isClockedIn && !isClockedOut;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-bridge-accent" />
          <h3 className="text-sm font-bold text-foreground">
            {t("organization.attendance.todayStatus", "Today's Attendance")}
          </h3>
        </div>
      </div>

      {/* Team stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {
            icon: Users,
            bgClass: "bg-emerald-500/15",
            textClass: "text-emerald-500",
            label: t("organization.attendance.present", "Present"),
            value: data.present_count,
          },
          {
            icon: UserX,
            bgClass: "bg-red-500/15",
            textClass: "text-red-500",
            label: t("organization.attendance.absent", "Absent"),
            value: data.absent_count,
          },
          {
            icon: Palmtree,
            bgClass: "bg-blue-500/15",
            textClass: "text-blue-500",
            label: t("organization.attendance.onLeave", "On Leave"),
            value: data.on_leave_count,
          },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg ${stat.bgClass} flex items-center justify-center shrink-0`}
            >
              <stat.icon size={13} className={stat.textClass} />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">
                {stat.label}
              </div>
              <div className="text-sm font-bold text-foreground">
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* My status */}
      <div className="bg-foreground/[0.03] rounded-xl p-3 mb-3">
        {isWorking ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {t("organization.attendance.working", "Working")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {t("organization.attendance.clockInTime", "Clock In")}:{" "}
                  {extractTimeFromISO(myRecord!.clock_in)}
                </span>
                <span>
                  {t("organization.attendance.elapsed", "Elapsed")}:{" "}
                  {formatElapsed(elapsed, t)}
                </span>
              </div>
            </div>
            <button
              onClick={handleClockOut}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/30 transition-all disabled:opacity-50"
            >
              <LogOut size={14} />
              {t("organization.attendance.clockOut", "Clock Out")}
            </button>
          </div>
        ) : isClockedOut ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-xs font-bold text-muted-foreground">
                  {t("organization.attendance.clockedOut", "Clocked Out")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {t("organization.attendance.clockInTime", "Clock In")}:{" "}
                  {extractTimeFromISO(myRecord!.clock_in)}
                </span>
                <span>
                  {t("organization.attendance.clockOutTime", "Clock Out")}:{" "}
                  {extractTimeFromISO(myRecord!.clock_out)}
                </span>
                <span>
                  {t("organization.attendance.totalWork", "Total Work")}:{" "}
                  {formatElapsed(myRecord!.work_minutes, t)}
                </span>
              </div>
            </div>
            <button
              onClick={handleCancelClockOut}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/30 transition-all disabled:opacity-50"
            >
              <Undo2 size={14} />
              {t("organization.attendance.cancelClockOut", "Cancel")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground">
                {t("organization.attendance.notClockedIn", "Not Clocked In")}
              </span>
            </div>
            <button
              onClick={handleClockIn}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
            >
              <LogIn size={14} />
              {t("organization.attendance.clockIn", "Clock In")}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
