import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  GanttChart,
  Calendar,
  List,
  Network,
  Lock,
  Check,
  ChevronDown,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

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
  | "mindmap";

interface FloatingViewSwitcherProps {
  /** 현재 활성화된 뷰 모드 */
  viewMode: ViewMode;
  /** 뷰 모드 변경 콜백 */
  onViewModeChange: (mode: ViewMode) => void;
  /** 간트 차트 접근 권한 (프리미엄 기능) */
  canAccessGantt: boolean;
}

interface BoardViewItem {
  mode: ViewMode;
  icon: React.ElementType;
  labelKey: string;
  labelFallback: string;
  isPremium: boolean;
  checkAccess: (canAccessGantt: boolean) => boolean;
}

/** 보드 표현 뷰 (칸반/리스트/간트/캘린더) — 같은 데이터를 다르게 보여주는 그룹 */
const BOARD_VIEWS: BoardViewItem[] = [
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
    checkAccess: (canAccessGantt) => canAccessGantt,
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
    mode: "mindmap",
    icon: Network,
    labelKey: "kanban.viewBoardMindMap",
    labelFallback: "마인드맵",
    isPremium: false,
    checkAccess: () => true,
  },
];

/**
 * 우하단 고정 "뷰" 전환 버튼 (Trello식)
 * 클릭하면 위로 메뉴가 펼쳐지며 칸반/리스트/간트/캘린더(보드 표현) 사이를 전환합니다.
 * 마일스톤은 상단 서브탭으로 분리되어 이 메뉴에는 포함되지 않습니다.
 * 간트는 프리미엄 기능으로 잠금 아이콘이 표시됩니다.
 */
export function FloatingViewSwitcher({
  viewMode,
  onViewModeChange,
  canAccessGantt,
}: FloatingViewSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const active = BOARD_VIEWS.find((v) => v.mode === viewMode) ?? BOARD_VIEWS[0];
  const ActiveIcon = active.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("kanban.viewSwitcher", "뷰 전환")}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40
            flex items-center gap-1.5 px-3.5 py-2.5 rounded-full
            bg-bridge-obsidian/95 backdrop-blur-xl
            border border-foreground/[0.08] shadow-lg shadow-black/20
            text-xs font-bold text-foreground
            hover:border-foreground/[0.12] hover:bg-bridge-obsidian
            focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
        >
          <ActiveIcon
            size={15}
            className="text-bridge-accent"
            aria-hidden="true"
          />
          <span>{t("kanban.viewSwitcher", "뷰")}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        role="menu"
        aria-label={t("kanban.viewBoard", "보드 서브뷰")}
        className="w-52 p-1.5 bg-bridge-obsidian border-foreground/[0.08] shadow-2xl rounded-xl"
      >
        {BOARD_VIEWS.map(
          ({
            mode,
            icon: Icon,
            labelKey,
            labelFallback,
            isPremium,
            checkAccess,
          }) => {
            const isActive = viewMode === mode;
            const hasAccess = checkAccess(canAccessGantt);
            const label = t(labelKey, labelFallback);

            return (
              <button
                key={mode}
                role="menuitemradio"
                aria-checked={isActive}
                aria-label={
                  isPremium && !hasAccess
                    ? `${label} (${t("common.premiumRequired", "프리미엄 필요")})`
                    : label
                }
                onClick={() => {
                  // 잠금 항목도 호출 → handleViewModeChange가 프리미엄 검사/업셀 처리
                  onViewModeChange(mode);
                  setOpen(false);
                }}
                className={
                  isActive
                    ? "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold bg-bridge-accent/15 text-bridge-accent transition-colors"
                    : "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                }
              >
                <Icon size={15} aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
                {isActive && <Check size={14} aria-hidden="true" />}
                {isPremium && !hasAccess && (
                  <Lock
                    size={12}
                    className="text-slate-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          },
        )}
      </PopoverContent>
    </Popover>
  );
}

FloatingViewSwitcher.displayName = "FloatingViewSwitcher";
