import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  GanttChart,
  Calendar,
  List,
  Flag,
  Lock,
} from "lucide-react";

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
  | "list";

interface BoardViewSwitcherProps {
  /** 현재 활성화된 뷰 모드 */
  viewMode: ViewMode;
  /** 뷰 모드 변경 콜백 */
  onViewModeChange: (mode: ViewMode) => void;
  /** 간트 차트 접근 권한 (프리미엄 기능) */
  canAccessGantt: boolean;
  /** 마일스톤 접근 권한 (프리미엄 기능) */
  canAccessMilestone: boolean;
}

interface SubViewItem {
  mode: ViewMode;
  icon: React.ElementType;
  labelKey: string;
  labelFallback: string;
  isPremium: boolean;
  checkAccess: (
    props: Pick<
      BoardViewSwitcherProps,
      "canAccessGantt" | "canAccessMilestone"
    >,
  ) => boolean;
}

const SUB_VIEWS: SubViewItem[] = [
  {
    mode: "kanban",
    icon: LayoutGrid,
    labelKey: "kanban.viewBoardKanban",
    labelFallback: "칸반",
    isPremium: false,
    checkAccess: () => true,
  },
  {
    mode: "list",
    icon: List,
    labelKey: "kanban.viewBoardList",
    labelFallback: "리스트",
    isPremium: false,
    checkAccess: () => true,
  },
  {
    mode: "gantt",
    icon: GanttChart,
    labelKey: "kanban.viewBoardGantt",
    labelFallback: "간트",
    isPremium: true,
    checkAccess: ({ canAccessGantt }) => canAccessGantt,
  },
  {
    mode: "calendar",
    icon: Calendar,
    labelKey: "kanban.viewBoardCalendar",
    labelFallback: "캘린더",
    isPremium: false,
    checkAccess: () => true,
  },
  {
    mode: "milestone",
    icon: Flag,
    labelKey: "kanban.viewBoardMilestone",
    labelFallback: "마일스톤",
    isPremium: true,
    checkAccess: ({ canAccessMilestone }) => canAccessMilestone,
  },
];

/**
 * 보드 서브뷰 전환 바 컴포넌트
 * 칸반 / 간트 / 캘린더 / 리스트 / 마일스톤 뷰 간 전환을 제공합니다.
 * 간트·마일스톤은 프리미엄 기능으로 잠금 아이콘이 표시됩니다.
 */
export function BoardViewSwitcher({
  viewMode,
  onViewModeChange,
  canAccessGantt,
  canAccessMilestone,
}: BoardViewSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center py-1.5">
      <div
        className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5"
        role="tablist"
        aria-label={t("kanban.viewBoard", "보드 서브뷰")}
      >
        {SUB_VIEWS.map(
          ({
            mode,
            icon: Icon,
            labelKey,
            labelFallback,
            isPremium,
            checkAccess,
          }) => {
            const isActive = viewMode === mode;
            const hasAccess = checkAccess({
              canAccessGantt,
              canAccessMilestone,
            });
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
                <span className="hidden md:inline">{label}</span>
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

BoardViewSwitcher.displayName = "BoardViewSwitcher";
