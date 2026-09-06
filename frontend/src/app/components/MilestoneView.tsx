import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Flag, Plus, Table2 } from "lucide-react";
import type { Feature, Task, Milestone } from "../types";
import { getTodayDateString } from "../utils/dateUtils";
import { MilestoneMatrix } from "./MilestoneMatrix";
import { MilestoneDetailView } from "./MilestoneDetailView";

type MilestoneViewMode = "detail" | "matrix";

// ========================================
// Types
// ========================================

interface MilestoneViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  milestones: Milestone[];
  onRefresh?: () => void;
  onFeatureClick?: (feature: Feature) => void;
  onCreateMilestone?: () => void;
  onEditMilestone?: (milestone: Milestone) => void;
  /** 상세 페이지에서 태스크 제목 클릭 시 태스크 상세 모달 */
  onTaskClick?: (task: Task) => void;
  /** 상세 페이지 "칸반에서 보기" — 마일스톤 필터 적용 후 칸반 뷰 전환 */
  onViewInKanban?: (milestoneId: string) => void;
  /** 상세 테이블 뷰 인라인 편집(태스크/체크 항목 추가, 토글) 허용 */
  canEdit?: boolean;
}

export type MilestoneStatusKey =
  "completed" | "waiting" | "overdue" | "inProgress";

/**
 * 마일스톤 상태(완료/대기/초과/진행중)와 배지·막대 색상을 한 곳에서 결정.
 * 상세 페이지 헤더(MilestoneDetailView)가 사용한다.
 */
export function getMilestoneStatus(
  startDate: string,
  endDate: string,
  progress: number,
  // 손 안 댄 기본 마일스톤(is_default)은 기간이 지나도 overdue 경고를 띄우지 않는다.
  suppressOverdue: boolean = false,
): { key: MilestoneStatusKey; barColor: string; badgeClasses: string } {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (progress >= 100) {
    return {
      key: "completed",
      barColor: "bg-green-500",
      badgeClasses:
        "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
    };
  }
  if (now < start) {
    return {
      key: "waiting",
      barColor: "bg-slate-400",
      badgeClasses:
        "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30",
    };
  }
  if (now > end && !suppressOverdue) {
    return {
      key: "overdue",
      barColor: "bg-red-500",
      badgeClasses:
        "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    };
  }
  return {
    key: "inProgress",
    barColor: "bg-bridge-accent",
    badgeClasses:
      "bg-bridge-accent/20 text-bridge-accent border-bridge-accent/30",
  };
}

// ========================================
// Main Component
// ========================================

export function MilestoneView({
  boardId,
  features,
  tasks,
  milestones,
  onRefresh,
  onFeatureClick,
  onCreateMilestone,
  onEditMilestone,
  onTaskClick,
  onViewInKanban,
  canEdit = false,
}: MilestoneViewProps) {
  const { t } = useTranslation();

  // 마일스톤 클릭 → 풀 페이지 상세 (컬럼=피처, 카드=태스크)
  const [detailMilestoneId, setDetailMilestoneId] = useState<string | null>(
    null,
  );

  // 뷰 모드: 디테일(기본) · 매트릭스. 보드별 localStorage 영속화.
  // 구 값(board/cards)은 뷰가 제거되어 detail로 폴백.
  const viewModeKey = `milestoneViewMode_v2_${boardId}`;
  const [viewMode, setViewMode] = useState<MilestoneViewMode>(() => {
    if (typeof window === "undefined") return "detail";
    const saved = localStorage.getItem(viewModeKey);
    return saved === "matrix" ? "matrix" : "detail";
  });
  const changeViewMode = useCallback(
    (mode: MilestoneViewMode) => {
      setViewMode(mode);
      try {
        localStorage.setItem(viewModeKey, mode);
      } catch {
        /* ignore */
      }
    },
    [viewModeKey],
  );

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => {
      return (
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
    });
  }, [milestones]);

  // ========================================
  // 상세 페이지 (마일스톤 클릭 또는 디테일 탭)
  // ========================================

  // 디테일 탭 기본 마일스톤 — 진행 중 > 다가오는 > 마지막 (날짜 문자열 비교)
  const defaultDetailMilestone = useMemo(() => {
    if (sortedMilestones.length === 0) return null;
    const today = getTodayDateString();
    const inProgress = sortedMilestones.find(
      (m) =>
        m.start_date.slice(0, 10) <= today && today <= m.end_date.slice(0, 10),
    );
    if (inProgress) return inProgress;
    const upcoming = sortedMilestones.find(
      (m) => m.start_date.slice(0, 10) > today,
    );
    return upcoming ?? sortedMilestones[sortedMilestones.length - 1];
  }, [sortedMilestones]);

  // 디테일 탭에서 보여줄 마일스톤 — 명시 선택 > 기본(진행 중)
  const detailMilestone =
    (detailMilestoneId
      ? milestones.find((m) => m.id === detailMilestoneId)
      : null) ?? defaultDetailMilestone;

  // 마일스톤 클릭(매트릭스 헤더) → 디테일 탭으로 전환
  // 매트릭스에서 진입한 경우만 Esc로 매트릭스에 돌아간다 (디테일 탭 직접 진입 시 Esc 무시)
  const [enteredFromMatrix, setEnteredFromMatrix] = useState(false);
  const openDetail = useCallback(
    (milestoneId: string) => {
      setDetailMilestoneId(milestoneId);
      setEnteredFromMatrix(true);
      changeViewMode("detail");
    },
    [changeViewMode],
  );
  const changeViewModeByTab = useCallback(
    (mode: MilestoneViewMode) => {
      setEnteredFromMatrix(false);
      changeViewMode(mode);
    },
    [changeViewMode],
  );

  // ========================================
  // Empty State
  // ========================================

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
          <Flag className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {t("milestone.onboardingTitle", {
            defaultValue: "Manage your project with milestones",
          })}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          {t("milestone.onboardingDesc", {
            defaultValue:
              "Group features into milestones to track schedules and progress at a glance.",
          })}
        </p>
        {onCreateMilestone && (
          <button
            onClick={onCreateMilestone}
            className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
          >
            <Plus className="h-4 w-4" />
            {t("milestone.createFirst", { defaultValue: "마일스톤 만들기" })}
          </button>
        )}
      </div>
    );
  }

  // ========================================
  // Render
  // ========================================

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      {/* Header with create button */}
      {onCreateMilestone && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4" />
            <span>
              {milestones.length}{" "}
              {t("milestone.count", { defaultValue: "개 마일스톤" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 뷰 토글: 디테일 · 매트릭스 */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/5 border border-foreground/[0.08]">
              <button
                onClick={() => changeViewModeByTab("detail")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  viewMode === "detail"
                    ? "bg-bridge-accent text-white font-bold"
                    : "text-slate-400 hover:text-foreground"
                }`}
                title={t("milestone.viewDetail", { defaultValue: "디테일" })}
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t("milestone.viewDetail", { defaultValue: "디테일" })}
                </span>
              </button>
              <button
                onClick={() => changeViewModeByTab("matrix")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  viewMode === "matrix"
                    ? "bg-bridge-accent text-white font-bold"
                    : "text-slate-400 hover:text-foreground"
                }`}
                title={t("milestone.matrix.title", {
                  defaultValue: "피처 × 마일스톤",
                })}
              >
                <Table2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t("milestone.viewMatrix", { defaultValue: "매트릭스" })}
                </span>
              </button>
            </div>
            <button
              onClick={onCreateMilestone}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("milestone.create", { defaultValue: "마일스톤 추가" })}
            </button>
          </div>
        </div>
      )}

      {viewMode === "detail" && detailMilestone ? (
        <MilestoneDetailView
          boardId={boardId}
          milestone={detailMilestone}
          milestones={milestones}
          features={features}
          tasks={tasks}
          onBack={() => {
            if (!enteredFromMatrix) return;
            setDetailMilestoneId(null);
            setEnteredFromMatrix(false);
            changeViewMode("matrix");
          }}
          onSelectMilestone={setDetailMilestoneId}
          onEditMilestone={onEditMilestone}
          onTaskClick={onTaskClick}
          onFeatureClick={onFeatureClick}
          onViewInKanban={onViewInKanban}
          canEdit={canEdit}
          onRefresh={onRefresh}
        />
      ) : (
        <MilestoneMatrix
          features={features}
          tasks={tasks}
          milestones={milestones}
          onFeatureClick={onFeatureClick}
          onMilestoneHeaderClick={openDetail}
        />
      )}
    </div>
  );
}
