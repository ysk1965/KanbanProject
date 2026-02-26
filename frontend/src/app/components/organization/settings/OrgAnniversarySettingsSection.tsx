import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Cake } from "lucide-react";
import { anniversaryService } from "../../../utils/services";
import type {
  AnniversarySettings,
  NotifyTiming,
  AnniversaryDashboardRange,
} from "../../../types";

interface OrgAnniversarySettingsSectionProps {
  orgId: string;
}

export function OrgAnniversarySettingsSection({
  orgId,
}: OrgAnniversarySettingsSectionProps) {
  const { t } = useTranslation();

  const [anniversarySettings, setAnniversarySettings] =
    useState<AnniversarySettings | null>(null);
  const [anniversaryLoading, setAnniversaryLoading] = useState(true);

  useEffect(() => {
    const fetchAnniversary = async () => {
      try {
        setAnniversaryLoading(true);
        const settings = await anniversaryService.getSettings(orgId);
        setAnniversarySettings(settings);
      } catch {
        // Optional feature
      } finally {
        setAnniversaryLoading(false);
      }
    };
    fetchAnniversary();
  }, [orgId]);

  const handleAnniversarySettingChange = async (
    updates: Partial<AnniversarySettings>,
  ) => {
    if (!anniversarySettings) return;
    const optimistic = { ...anniversarySettings, ...updates };
    setAnniversarySettings(optimistic);
    try {
      const saved = await anniversaryService.updateSettings(orgId, updates);
      setAnniversarySettings(saved);
    } catch {
      setAnniversarySettings(anniversarySettings);
    }
  };

  return (
    <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-6">
      <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
        <Cake size={16} className="text-pink-400" />
        {t("organization.anniversary.settings", "Anniversary Settings")}
      </h3>

      {anniversaryLoading ? (
        <div className="h-20 animate-pulse bg-foreground/[0.03] rounded-xl" />
      ) : anniversarySettings ? (
        <div className="space-y-5">
          {/* Toggles */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm text-foreground">
                {t(
                  "organization.anniversary.birthdayEnabled",
                  "Birthday Notifications",
                )}
              </span>
              <button
                onClick={() =>
                  handleAnniversarySettingChange({
                    birthday_enabled: !anniversarySettings.birthday_enabled,
                  })
                }
                className={`relative w-10 h-5 rounded-full transition-colors ${anniversarySettings.birthday_enabled ? "bg-bridge-accent" : "bg-foreground/10"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${anniversarySettings.birthday_enabled ? "translate-x-5" : ""}`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm text-foreground">
                {t(
                  "organization.anniversary.hireAnniversaryEnabled",
                  "Hire Anniversary Notifications",
                )}
              </span>
              <button
                onClick={() =>
                  handleAnniversarySettingChange({
                    hire_anniversary_enabled:
                      !anniversarySettings.hire_anniversary_enabled,
                  })
                }
                className={`relative w-10 h-5 rounded-full transition-colors ${anniversarySettings.hire_anniversary_enabled ? "bg-bridge-accent" : "bg-foreground/10"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${anniversarySettings.hire_anniversary_enabled ? "translate-x-5" : ""}`}
                />
              </button>
            </label>
          </div>

          {/* Notify Timing */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              {t(
                "organization.anniversary.notifyTiming",
                "Notification Timing",
              )}
            </label>
            <div className="space-y-1.5">
              {[
                {
                  value: "SAME_DAY" as NotifyTiming,
                  label: t(
                    "organization.anniversary.notifyTimingSameDay",
                    "Same day only",
                  ),
                },
                {
                  value: "DAY_BEFORE" as NotifyTiming,
                  label: t(
                    "organization.anniversary.notifyTimingDayBefore",
                    "Day before + Same day",
                  ),
                },
                {
                  value: "THREE_DAYS_BEFORE" as NotifyTiming,
                  label: t(
                    "organization.anniversary.notifyTimingThreeDays",
                    "3 days before + Same day",
                  ),
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-foreground/[0.03] transition-colors"
                >
                  <div
                    onClick={() =>
                      handleAnniversarySettingChange({
                        notify_timing: option.value,
                      })
                    }
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      anniversarySettings.notify_timing === option.value
                        ? "border-bridge-accent"
                        : "border-foreground/20"
                    }`}
                  >
                    {anniversarySettings.notify_timing === option.value && (
                      <div className="w-2 h-2 rounded-full bg-bridge-accent" />
                    )}
                  </div>
                  <span className="text-sm text-foreground">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Dashboard Range */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              {t(
                "organization.anniversary.dashboardRange",
                "Dashboard Display Range",
              )}
            </label>
            <div className="space-y-1.5">
              {[
                {
                  value: "THIS_WEEK" as AnniversaryDashboardRange,
                  label: t(
                    "organization.anniversary.dashboardRangeWeek",
                    "This Week",
                  ),
                },
                {
                  value: "THIS_MONTH" as AnniversaryDashboardRange,
                  label: t(
                    "organization.anniversary.dashboardRangeMonth",
                    "This Month",
                  ),
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-foreground/[0.03] transition-colors"
                >
                  <div
                    onClick={() =>
                      handleAnniversarySettingChange({
                        dashboard_range: option.value,
                      })
                    }
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      anniversarySettings.dashboard_range === option.value
                        ? "border-bridge-accent"
                        : "border-foreground/20"
                    }`}
                  >
                    {anniversarySettings.dashboard_range === option.value && (
                      <div className="w-2 h-2 rounded-full bg-bridge-accent" />
                    )}
                  </div>
                  <span className="text-sm text-foreground">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            "organization.anniversary.settingsLoadError",
            "Failed to load anniversary settings",
          )}
        </p>
      )}
    </section>
  );
}
