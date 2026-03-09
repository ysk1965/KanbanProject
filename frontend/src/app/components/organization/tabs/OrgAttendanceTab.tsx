import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Download,
  Users,
  Timer,
  TrendingUp,
  CalendarCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { organizationService } from "../../../utils/services";

import type {
  OrgRole,
  OrgDepartment,
  AttendanceMyRecordsResponse,
  AttendanceMonthlySummary,
  AttendanceRecordDetail,
  AttendanceTeamMemberSummary,
  AttendanceStatus,
} from "../../../types";

interface OrgAttendanceTabProps {
  orgId: string;
  myRole: OrgRole;
  departments: OrgDepartment[];
}

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ABSENT: "bg-red-500/15 text-red-600 dark:text-red-400",
  ON_LEAVE: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  HALF_DAY: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  WEEKEND: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  HOLIDAY: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

function formatMinutes(
  minutes: number | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (minutes == null || isNaN(minutes) || minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}${t("organization.attendance.minutes", "m")}`;
  if (m === 0) return `${h}${t("organization.attendance.hours", "h")}`;
  return `${h}${t("organization.attendance.hours", "h")} ${m}${t("organization.attendance.minutes", "m")}`;
}

function extractTime(isoStr: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function getStatusLabelKey(status: AttendanceStatus): string {
  const map: Record<AttendanceStatus, string> = {
    PRESENT: "organization.attendance.present",
    ABSENT: "organization.attendance.absent",
    ON_LEAVE: "organization.attendance.onLeave",
    HALF_DAY: "organization.attendance.halfDay",
    WEEKEND: "organization.attendance.weekend",
    HOLIDAY: "organization.attendance.holiday",
  };
  return map[status];
}

export function OrgAttendanceTab({
  orgId,
  myRole,
  departments,
}: OrgAttendanceTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  // Month picker
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // My records
  const [myData, setMyData] = useState<AttendanceMyRecordsResponse | null>(
    null,
  );
  const [loadingMy, setLoadingMy] = useState(true);

  // Team summary (admin only)
  const [teamMembers, setTeamMembers] = useState<AttendanceTeamMemberSummary[]>(
    [],
  );
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  const fetchMyRecords = useCallback(async () => {
    try {
      setLoadingMy(true);
      const data = await organizationService.getMyAttendanceRecords(orgId, {
        year,
        month,
      });
      setMyData(data);
    } catch {
      // optional
    } finally {
      setLoadingMy(false);
    }
  }, [orgId, year, month]);

  const fetchTeamSummary = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingTeam(true);
      const data = await organizationService.getAttendanceTeamSummary(orgId, {
        year,
        month,
        department_id: deptFilter || undefined,
      });
      setTeamMembers(data.members);
    } catch {
      // optional
    } finally {
      setLoadingTeam(false);
    }
  }, [orgId, year, month, deptFilter, isAdmin]);

  useEffect(() => {
    fetchMyRecords();
  }, [fetchMyRecords]);

  useEffect(() => {
    fetchTeamSummary();
  }, [fetchTeamSummary]);

  const goPrev = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const goNext = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await organizationService.exportAttendanceCsv(orgId, {
        year,
        month,
        department_id: deptFilter || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${year}_${String(month).padStart(2, "0")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("organization.attendance.export", "Export") + " failed");
    } finally {
      setExporting(false);
    }
  };

  const summary: AttendanceMonthlySummary | null = myData?.summary ?? null;
  const records: AttendanceRecordDetail[] = myData?.records ?? [];

  const attendanceRate = summary
    ? summary.total_work_days > 0
      ? Math.round((summary.present_days / summary.total_work_days) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-6">
      {/* Month Picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-bridge-accent" />
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("organization.attendance.title", "Attendance")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-foreground min-w-[120px] text-center">
            {year}. {String(month).padStart(2, "0")}
          </span>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      {loadingMy ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse"
            />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: Timer,
              bgClass: "bg-bridge-accent/15",
              textClass: "text-bridge-accent",
              label: t(
                "organization.attendance.avgWorkHours",
                "Avg. Work Hours",
              ),
              value: formatMinutes(summary.avg_work_minutes_per_day, t),
              sub: t("organization.attendance.perDay", "/day"),
            },
            {
              icon: TrendingUp,
              bgClass: "bg-amber-500/15",
              textClass: "text-amber-500",
              label: t(
                "organization.attendance.totalOvertime",
                "Total Overtime",
              ),
              value: formatMinutes(summary.overtime_minutes, t),
              sub: null,
            },
            {
              icon: CalendarCheck,
              bgClass: "bg-emerald-500/15",
              textClass: "text-emerald-500",
              label: t(
                "organization.attendance.attendanceRate",
                "Attendance Rate",
              ),
              value: `${attendanceRate}%`,
              sub: `${summary.present_days}/${summary.total_work_days}`,
            },
            {
              icon: AlertTriangle,
              bgClass: "bg-red-500/15",
              textClass: "text-red-500",
              label: t("organization.attendance.lateCount", "Late Count"),
              value: String(summary.late_count),
              sub: t("organization.attendance.times", "times"),
            },
          ].map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-7 h-7 rounded-lg ${card.bgClass} flex items-center justify-center`}
                >
                  <card.icon size={14} className={card.textClass} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-foreground">
                  {card.value}
                </span>
                {card.sub && (
                  <span className="text-[11px] text-muted-foreground">
                    {card.sub}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      {/* My Daily Records */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarCheck size={14} className="text-bridge-secondary" />
          <h3 className="text-sm font-bold text-foreground">
            {t("organization.attendance.myAttendance", "My Attendance")}
          </h3>
        </div>

        {loadingMy ? (
          <div className="h-40 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse" />
        ) : records.length === 0 ? (
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-bridge-accent/10 flex items-center justify-center mx-auto mb-3">
              <Clock size={24} className="text-bridge-accent/60" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "organization.attendance.noMyRecords",
                "No attendance records for this month",
              )}
            </p>
          </div>
        ) : (
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-foreground/[0.08] bg-foreground/[0.02]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("organization.attendance.date", "Date")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("organization.attendance.clockInTime", "Clock In")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("organization.attendance.clockOutTime", "Clock Out")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("organization.attendance.workHours", "Work Hours")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("organization.attendance.status", "Status")}
              </span>
            </div>
            {/* Rows */}
            <div className="divide-y divide-foreground/[0.04]">
              {records.map((record, index) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="grid grid-cols-5 gap-2 px-4 py-2.5 items-center hover:bg-foreground/[0.02] transition-colors"
                >
                  <span className="text-sm text-foreground font-medium">
                    {record.record_date}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {extractTime(record.clock_in)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {record.is_auto_clocked_out ? (
                      <span className="flex items-center gap-1">
                        {extractTime(record.clock_out)}
                        <span
                          className="text-[9px] text-amber-500"
                          title={t(
                            "organization.attendance.autoClockOut",
                            "Auto",
                          )}
                        >
                          (A)
                        </span>
                      </span>
                    ) : (
                      extractTime(record.clock_out)
                    )}
                  </span>
                  <span className="text-sm text-foreground">
                    {formatMinutes(record.work_minutes, t)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[record.status]}`}
                    >
                      {t(getStatusLabelKey(record.status), record.status)}
                    </span>
                    {record.is_late && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <AlertTriangle size={10} />
                        {t("organization.attendance.late", "Late")}
                      </span>
                    )}
                    {record.leave_info && (
                      <span className="text-[10px] text-muted-foreground">
                        ({record.leave_info.policy_name})
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin: Team Summary */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-bridge-accent" />
              <h3 className="text-sm font-bold text-foreground">
                {t("organization.attendance.teamSummary", "Team Attendance")}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Department filter */}
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all appearance-none cursor-pointer"
              >
                <option value="">
                  {t(
                    "organization.attendance.allDepartments",
                    "All Departments",
                  )}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {/* Export */}
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/15 transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                {t("organization.attendance.exportCsv", "Export CSV")}
              </button>
            </div>
          </div>

          {loadingTeam ? (
            <div className="h-40 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse" />
          ) : teamMembers.length === 0 ? (
            <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("organization.attendance.noTeamData", "No team data for this month")}
              </p>
            </div>
          ) : (
            <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-7 gap-2 px-4 py-2.5 border-b border-foreground/[0.08] bg-foreground/[0.02]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.name", "Name")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.department", "Dept")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.monthlyTotal", "This Month")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.average", "Average")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.late", "Late")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.overtime", "Overtime")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("organization.attendance.present", "Present")} /{" "}
                  {t("organization.attendance.onLeave", "Leave")} /{" "}
                  {t("organization.attendance.absent", "Absent")}
                </span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-foreground/[0.04]">
                {teamMembers.map((member, index) => (
                  <motion.div
                    key={member.member_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className="grid grid-cols-7 gap-2 px-4 py-2.5 items-center hover:bg-foreground/[0.02] transition-colors"
                  >
                    <span className="text-sm text-foreground font-medium truncate">
                      {member.member_name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {member.department_name || "-"}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatMinutes(member.total_work_minutes, t)}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatMinutes(member.avg_work_minutes_per_day, t)}
                    </span>
                    <span className="text-sm text-foreground">
                      {member.late_count > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {member.late_count}
                        </span>
                      ) : (
                        "0"
                      )}
                    </span>
                    <span className="text-sm text-foreground">
                      {formatMinutes(member.overtime_minutes, t)}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {member.present_days}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        {member.leave_days}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {member.absent_days}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
