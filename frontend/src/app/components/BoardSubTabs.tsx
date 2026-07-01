import { useTranslation } from "react-i18next";
import { LayoutGrid, Flag, Network, Lock } from "lucide-react";

type ViewMode =
  | "kanban"
  | "gantt"
  | "schedule"
  | "calendar"
  | "milestone"
  | "meeting"
  | "notes"
  | "statistics"
  | "ai_report"
  | "list"
  | "mindmap"
  | "minikanban";

interface BoardSubTabsProps {
  /** 현재 활성화된 뷰 모드 */
  viewMode: ViewMode;
  /** 뷰 모드 변경 콜백 */
  onViewModeChange: (mode: ViewMode) => void;
  /** 마일스톤 접근 권한 (프리미엄 기능) */
  canAccessMilestone: boolean;
}

interface TabItem {
  mode: ViewMode;
  icon: React.ElementType;
  labelKey: string;
  labelFallback: string;
  isPremium: boolean;
  checkAccess: (canAccessMilestone: boolean) => boolean;
}

const TABS: TabItem[] = [
  {
    mode: "kanban",
    icon: LayoutGrid,
    labelKey: "kanban.viewBoardKanban",
    labelFallback: "칸반",
    isPremium: false,
    checkAccess: () => true,
  },
  {
    mode: "milestone",
    icon: Flag,
    labelKey: "kanban.viewBoardMilestone",
    labelFallback: "마일스톤",
    isPremium: true,
    checkAccess: (canAccessMilestone) => canAccessMilestone,
  },
  {
    mode: "mindmap",
    icon: Network,
    labelKey: "kanban.viewBoardMindMap",
    labelFallback: "마인드맵",
    isPremium: false,
    checkAccess: () => true,
  },
];

/**
 * 보드 상단 서브탭 바 (칸반 / 마일스톤 / 마인드맵)
 * 리스트·간트·캘린더·미니 칸반 등 보드 표현 뷰는 우하단 FloatingViewSwitcher로 분리됨.
 * 마일스톤은 프리미엄 기능으로 잠금 아이콘이 표시됩니다.
 */
export function BoardSubTabs({
  viewMode,
  onViewModeChange,
  canAccessMilestone,
}: BoardSubTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-1.5">
      <div
        className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5"
        role="tablist"
        aria-label={t("kanban.viewBoard", "보드 서브뷰")}
      >
        {TABS.map(
          ({
            mode,
            icon: Icon,
            labelKey,
            labelFallback,
            isPremium,
            checkAccess,
          }) => {
            // 칸반 탭은 보드 표현 뷰(리스트/간트/캘린더/미니 칸반 포함) 전체에서 활성 유지.
            // 마일스톤·마인드맵 탭은 각 뷰일 때만 활성.
            const isActive =
              mode === "kanban"
                ? viewMode !== "milestone" && viewMode !== "mindmap"
                : viewMode === mode;
            const hasAccess = checkAccess(canAccessMilestone);
            const label = t(labelKey, labelFallback);

            return (
              <button
                key={mode}
                role="tab"
                aria-selected={isActive}
                aria-label={
                  isPremium && !hasAccess
                    ? `${label} (${t("common.premiumRequired", "프리미엄 필요")})`
                    : label
                }
                onClick={() => onViewModeChange(mode)}
                className={
                  isActive
                    ? "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-foreground/10 text-foreground transition-colors"
                    : "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                }
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
                {isPremium && !hasAccess && (
                  <Lock
                    size={10}
                    className="text-slate-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}

BoardSubTabs.displayName = "BoardSubTabs";
