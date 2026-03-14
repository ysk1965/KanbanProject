import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, CalendarDays, Plus, Trash2 } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { toast } from "sonner";
import { organizationService } from "../../../utils/services";
import { TimePicker } from "../../ui/TimePicker";
import type {
  AttendancePolicyResponse,
  AttendanceHolidayResponse,
} from "../../../types";

interface OrgAttendancePolicySectionProps {
  orgId: string;
}

const inputSmClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

export function OrgAttendancePolicySection({
  orgId,
}: OrgAttendancePolicySectionProps) {
  const { t } = useTranslation();

  const [attendancePolicy, setAttendancePolicy] =
    useState<AttendancePolicyResponse | null>(null);
  const [attendancePolicyLoading, setAttendancePolicyLoading] = useState(true);
  const [savingAttendancePolicy, setSavingAttendancePolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    standard_hours: 8,
    core_time_start: "11:00",
    core_time_end: "17:00",
    late_threshold: "11:00",
    auto_clock_out: false,
    auto_clock_out_time: "22:00",
    weekend_days: "6,7",
  });

  const [holidays, setHolidays] = useState<AttendanceHolidayResponse[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [newHoliday, setNewHoliday] = useState({
    holiday_date: "",
    name: "",
    is_recurring: false,
  });
  const [addingHoliday, setAddingHoliday] = useState(false);

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        setAttendancePolicyLoading(true);
        const policy = await organizationService.getAttendancePolicy(orgId);
        setAttendancePolicy(policy);
        setPolicyForm({
          standard_hours: policy.standard_hours,
          core_time_start: policy.core_time_start || "",
          core_time_end: policy.core_time_end || "",
          late_threshold: policy.late_threshold || "",
          auto_clock_out: policy.auto_clock_out,
          auto_clock_out_time: policy.auto_clock_out_time || "22:00",
          weekend_days: policy.weekend_days || "6,7",
        });
      } catch {
        /* Optional feature */
      } finally {
        setAttendancePolicyLoading(false);
      }

      try {
        setHolidaysLoading(true);
        const h = await organizationService.getAttendanceHolidays(orgId);
        setHolidays(h);
      } catch {
        /* Optional */
      } finally {
        setHolidaysLoading(false);
      }
    };
    fetchAttendanceData();
  }, [orgId]);

  const handleSaveAttendancePolicy = async () => {
    try {
      setSavingAttendancePolicy(true);
      const saved = await organizationService.updateAttendancePolicy(orgId, {
        standard_hours: policyForm.standard_hours,
        core_time_start: policyForm.core_time_start || undefined,
        core_time_end: policyForm.core_time_end || undefined,
        late_threshold: policyForm.late_threshold || undefined,
        auto_clock_out: policyForm.auto_clock_out,
        auto_clock_out_time: policyForm.auto_clock_out_time,
        weekend_days: policyForm.weekend_days,
      });
      setAttendancePolicy(saved);
      toast.success(
        t("organization.attendance.policySaved", "Work policy saved"),
      );
    } catch {
      toast.error(
        t(
          "organization.attendance.policySaveError",
          "Failed to save work policy",
        ),
      );
    } finally {
      setSavingAttendancePolicy(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.holiday_date || !newHoliday.name.trim()) return;
    try {
      setAddingHoliday(true);
      const created = await organizationService.createAttendanceHoliday(orgId, {
        holiday_date: newHoliday.holiday_date,
        name: newHoliday.name.trim(),
        is_recurring: newHoliday.is_recurring,
      });
      setHolidays((prev) => [...prev, created]);
      setNewHoliday({ holiday_date: "", name: "", is_recurring: false });
      toast.success(t("organization.attendance.holidayAdded", "Holiday added"));
    } catch {
      toast.error(
        t("organization.attendance.holidayAddError", "Failed to add holiday"),
      );
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    if (
      !confirm(
        t(
          "organization.attendance.deleteHolidayConfirm",
          "Delete this holiday?",
        ),
      )
    )
      return;
    try {
      await organizationService.deleteAttendanceHoliday(orgId, holidayId);
      setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      toast.success(
        t("organization.attendance.holidayDeleted", "Holiday deleted"),
      );
    } catch {
      toast.error(
        t(
          "organization.attendance.holidayDeleteError",
          "Failed to delete holiday",
        ),
      );
    }
  };

  const WEEKDAY_OPTIONS = [
    { key: "1", label: t("organization.attendance.mon", "Mon") },
    { key: "2", label: t("organization.attendance.tue", "Tue") },
    { key: "3", label: t("organization.attendance.wed", "Wed") },
    { key: "4", label: t("organization.attendance.thu", "Thu") },
    { key: "5", label: t("organization.attendance.fri", "Fri") },
    { key: "6", label: t("organization.attendance.sat", "Sat") },
    { key: "7", label: t("organization.attendance.sun", "Sun") },
  ];

  const toggleWeekendDay = (day: string) => {
    const days = policyForm.weekend_days
      ? policyForm.weekend_days.split(",")
      : [];
    const idx = days.indexOf(day);
    if (idx >= 0) {
      days.splice(idx, 1);
    } else {
      days.push(day);
    }
    setPolicyForm((prev) => ({ ...prev, weekend_days: days.join(",") }));
  };

  return (
    <>
      {/* ── 7. Attendance Policy ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Clock size={16} className="text-bridge-accent" />
          {t("organization.attendance.policy", "Work Policy")}
        </h3>
        {attendancePolicyLoading ? (
          <div className="h-24 animate-pulse bg-foreground/[0.03] rounded-xl" />
        ) : (
          <div className="space-y-4">
            {/* Standard Hours */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t(
                  "organization.attendance.standardHours",
                  "Standard Hours (hours/day)",
                )}
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={policyForm.standard_hours}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    standard_hours: Number(e.target.value),
                  }))
                }
                className={inputSmClass + " w-24"}
              />
            </div>

            {/* Core Time */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t("organization.attendance.coreTime", "Core Time")}
              </label>
              <div className="flex items-center gap-2">
                <TimePicker
                  value={policyForm.core_time_start}
                  onChange={(val) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      core_time_start: val,
                    }))
                  }
                  placeholder={t(
                    "organization.attendance.coreTimeStart",
                    "Start",
                  )}
                  minuteStep={30}
                />
                <span className="text-muted-foreground text-xs">~</span>
                <TimePicker
                  value={policyForm.core_time_end}
                  onChange={(val) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      core_time_end: val,
                    }))
                  }
                  placeholder={t("organization.attendance.coreTimeEnd", "End")}
                  minuteStep={30}
                />
              </div>
            </div>

            {/* Late Threshold */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                {t("organization.attendance.lateThreshold", "Late Threshold")}
              </label>
              <TimePicker
                value={policyForm.late_threshold}
                onChange={(val) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    late_threshold: val,
                  }))
                }
                placeholder={t("organization.attendance.lateThreshold", "Late Threshold")}
                minuteStep={30}
              />
            </div>

            {/* Auto Clock Out */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                  {t(
                    "organization.attendance.autoClockOutSetting",
                    "Auto Clock Out",
                  )}
                </label>
                <span className="text-xs text-muted-foreground">
                  {t(
                    "organization.attendance.autoClockOutDesc",
                    "Auto clock out when not recorded",
                  )}
                </span>
              </div>
              <button
                onClick={() =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    auto_clock_out: !prev.auto_clock_out,
                  }))
                }
                className={`w-10 h-5 rounded-full transition-colors ${
                  policyForm.auto_clock_out
                    ? "bg-bridge-accent"
                    : "bg-foreground/10"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    policyForm.auto_clock_out
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {policyForm.auto_clock_out && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                  {t(
                    "organization.attendance.autoClockOutTime",
                    "Auto Clock Out Time",
                  )}
                </label>
                <TimePicker
                  value={policyForm.auto_clock_out_time}
                  onChange={(val) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      auto_clock_out_time: val,
                    }))
                  }
                  placeholder={t("organization.attendance.autoClockOutTime", "Auto Clock Out Time")}
                  minuteStep={30}
                />
              </div>
            )}

            {/* Weekend Days */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                {t("organization.attendance.weekendDays", "Weekend Days")}
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((wd) => {
                  const isSelected = policyForm.weekend_days
                    .split(",")
                    .includes(wd.key);
                  return (
                    <button
                      key={wd.key}
                      onClick={() => toggleWeekendDay(wd.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-bridge-accent/20 text-bridge-accent border border-bridge-accent/30"
                          : "bg-foreground/[0.03] text-muted-foreground border border-foreground/[0.08] hover:bg-foreground/[0.06]"
                      }`}
                    >
                      {wd.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveAttendancePolicy}
                disabled={savingAttendancePolicy}
                className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {savingAttendancePolicy ? "..." : t("common.save", "Save")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 8. Custom Holidays ── */}
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-bridge-secondary" />
          {t("organization.attendance.customHolidays", "Custom Holidays")}
        </h3>

        {/* Add Holiday Form */}
        <div className="flex items-end gap-2 mb-4 p-3 bg-foreground/[0.03] rounded-xl border border-foreground/[0.06]">
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
              {t("organization.attendance.holidayDate", "Date")}
            </label>
            <input
              type="date"
              value={newHoliday.holiday_date}
              onChange={(e) =>
                setNewHoliday((prev) => ({
                  ...prev,
                  holiday_date: e.target.value,
                }))
              }
              className={inputSmClass + " w-full"}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
              {t("organization.attendance.holidayName", "Holiday Name")}
            </label>
            <input
              type="text"
              value={newHoliday.name}
              onChange={(e) =>
                setNewHoliday((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              placeholder={t(
                "organization.attendance.holidayName",
                "Holiday Name",
              )}
              className={inputSmClass + " w-full"}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newHoliday.is_recurring}
                onChange={(e) =>
                  setNewHoliday((prev) => ({
                    ...prev,
                    is_recurring: e.target.checked,
                  }))
                }
                className="rounded border-foreground/20"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t("organization.attendance.recurring", "Recurring Annually")}
              </span>
            </label>
          </div>
          <button
            onClick={handleAddHoliday}
            disabled={
              addingHoliday ||
              !newHoliday.holiday_date ||
              !newHoliday.name.trim()
            }
            className="flex items-center gap-1 px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Plus size={13} />
            {t("organization.attendance.addHoliday", "Add Holiday")}
          </button>
        </div>

        {/* Holiday List */}
        {holidaysLoading ? (
          <div className="h-16 animate-pulse bg-foreground/[0.03] rounded-xl" />
        ) : holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t(
              "organization.attendance.noHolidays",
              "No custom holidays registered",
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 bg-foreground/[0.03] rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {h.holiday_date}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {h.name}
                  </span>
                  {h.is_recurring && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/20 text-bridge-secondary">
                      {t("organization.attendance.recurring", "Recurring")}
                    </span>
                  )}
                </div>
                <IconButton
                  onClick={() => handleDeleteHoliday(h.id)}
                  aria-label="삭제"
                  className="hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
