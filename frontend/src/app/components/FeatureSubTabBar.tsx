import { memo } from "react";
import { FileBarChart2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export type FeatureSubTab = "report" | "ld_upscale";

interface FeatureSubTabBarProps {
  activeTab: FeatureSubTab;
  onChange: (tab: FeatureSubTab) => void;
}

const TABS: {
  key: FeatureSubTab;
  Icon: typeof FileBarChart2;
  i18nKey: string;
  fallback: string;
}[] = [
  {
    key: "report",
    Icon: FileBarChart2,
    i18nKey: "kanban.viewReport",
    fallback: "보고서",
  },
  {
    key: "ld_upscale",
    Icon: Sparkles,
    i18nKey: "kanban.viewLdUpscale",
    fallback: "LD 업스케일",
  },
];

// 도구 탭 서브탭 바 (보고서 / LD 업스케일 — 이후 도구가 늘면 TABS 에 추가)
export const FeatureSubTabBar = memo(function FeatureSubTabBar({
  activeTab,
  onChange,
}: FeatureSubTabBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-foreground/5">
      <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
        {TABS.map(({ key, Icon, i18nKey, fallback }) => {
          const label = t(i18nKey, fallback);
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                activeTab === key
                  ? "font-medium bg-foreground/10 text-foreground"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
              aria-label={label}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
