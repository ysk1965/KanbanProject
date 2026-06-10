import { memo } from "react";
import { Clock, Users, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ScheduleSubTab = "timeblock" | "calendar" | "resource";

interface ScheduleSubTabBarProps {
  activeTab: ScheduleSubTab;
  onChange: (tab: ScheduleSubTab) => void;
}

// 일정 탭 서브탭 바 (타임블록 / 워크로드 / 캘린더)
export const ScheduleSubTabBar = memo(function ScheduleSubTabBar({
  activeTab,
  onChange,
}: ScheduleSubTabBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-foreground/5">
      <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
        <button
          onClick={() => onChange("timeblock")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
            activeTab === "timeblock"
              ? "font-medium bg-foreground/10 text-foreground"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          }`}
          aria-label={t("schedule.subTab.timeblock", "Time Block")}
        >
          <Clock size={14} />
          <span className="hidden md:inline">
            {t("schedule.subTab.timeblock", "Time Block")}
          </span>
        </button>
        <button
          onClick={() => onChange("resource")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
            activeTab === "resource"
              ? "font-medium bg-foreground/10 text-foreground"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          }`}
          aria-label={t("schedule.subTab.resource", "Resource")}
        >
          <Users size={14} />
          <span className="hidden md:inline">
            {t("schedule.subTab.resource", "Resource")}
          </span>
        </button>
        <button
          onClick={() => onChange("calendar")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
            activeTab === "calendar"
              ? "font-medium bg-foreground/10 text-foreground"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          }`}
          aria-label={t("schedule.subTab.calendar", "Calendar")}
        >
          <Calendar size={14} />
          <span className="hidden md:inline">
            {t("schedule.subTab.calendar", "Calendar")}
          </span>
        </button>
      </div>
    </div>
  );
});
