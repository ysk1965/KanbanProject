import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GitBranch, AlertTriangle, Plus, Flag } from "lucide-react";
import type { Feature, Milestone, Task } from "../types";

// ========================================
// Types & helpers
// ========================================

interface MilestoneBoardProps {
  features: Feature[];
  tasks: Task[];
  milestones: Milestone[];
  onFeatureClick?: (feature: Feature) => void;
  onCreateMilestone?: () => void;
  /** 소스 컬럼의 태스크들을 타겟 마일스톤(null=미배정)으로 재배정 */
  onMoveTasksMilestone?: (
    taskIds: string[],
    targetMilestoneId: string | null,
  ) => void;
}

const UNASSIGNED = "__unassigned__";

interface ColStat {
  total: number;
  completed: number;
  taskIds: string[];
}

/** "YYYY-MM-DD" → "M/D" (타임존 영향 없이 문자열 파싱) */
function toShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const p = dateStr.split("-");
  return p.length < 3 ? dateStr : `${Number(p[1])}/${Number(p[2])}`;
}

// ========================================
// Component
// ========================================

/**
 * 피처 우선 · 마일스톤 보드 (관리 홈).
 *
 * 컬럼 = 마일스톤(+미배정), 카드 = 피처. 카드를 다른 컬럼으로 드래그하면
 * 그 피처의 "홈 컬럼" 태스크(=상속분)가 타겟 마일스톤으로 일괄 이동한다.
 * 홈이 아닌 컬럼에 태스크가 걸친 피처는 유령 카드 + 갈래 배지로 표시.
 * 진실은 task.milestone_id — 전부 프론트 파생(백엔드 무변경).
 */
export function MilestoneBoard({
  features,
  tasks,
  milestones,
  onFeatureClick,
  onCreateMilestone,
  onMoveTasksMilestone,
}: MilestoneBoardProps) {
  const { t } = useTranslation();
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      ),
    [milestones],
  );

  const featureById = useMemo(() => {
    const m = new Map<string, Feature>();
    for (const f of features) m.set(f.id, f);
    return m;
  }, [features]);

  // featureId → (columnKey → ColStat)
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, ColStat>>();
    for (const tk of tasks) {
      if (!map.has(tk.feature_id)) map.set(tk.feature_id, new Map());
      const inner = map.get(tk.feature_id)!;
      const key = tk.milestone_id ?? UNASSIGNED;
      const s = inner.get(key) ?? { total: 0, completed: 0, taskIds: [] };
      s.total += 1;
      if (tk.completed) s.completed += 1;
      s.taskIds.push(tk.id);
      inner.set(key, s);
    }
    return map;
  }, [tasks]);

  // featureId → 홈 컬럼 key: 태스크 최다 마일스톤(동률→앞선 것), 전부 미배정이면 UNASSIGNED
  const homeByFeature = useMemo(() => {
    const result = new Map<string, string>();
    for (const [featureId, inner] of grid) {
      let bestKey = UNASSIGNED;
      let bestCount = 0;
      for (const ms of sortedMilestones) {
        const s = inner.get(ms.id);
        if (s && s.total > bestCount) {
          bestCount = s.total;
          bestKey = ms.id;
        }
      }
      // 마일스톤 배정이 하나도 없으면 미배정이 홈
      result.set(featureId, bestCount === 0 ? UNASSIGNED : bestKey);
    }
    return result;
  }, [grid, sortedMilestones]);

  // 컬럼 정의 (마일스톤 + 미배정)
  const columns = useMemo(
    () => [
      ...sortedMilestones.map((ms) => ({
        key: ms.id,
        title: ms.title,
        date: `${toShortDate(ms.start_date)} ~ ${toShortDate(ms.end_date)}`,
        accent: true,
      })),
      { key: UNASSIGNED, title: t("milestone.matrix.unassigned", { defaultValue: "미배정" }), date: "", accent: false },
    ],
    [sortedMilestones, t],
  );

  // 각 컬럼별: 홈인 피처(실제 카드) + 걸친 피처(유령 카드)
  const columnContent = useMemo(() => {
    const map = new Map<
      string,
      { real: string[]; ghost: string[] }
    >();
    for (const col of columns) map.set(col.key, { real: [], ghost: [] });
    for (const [featureId, inner] of grid) {
      const home = homeByFeature.get(featureId) ?? UNASSIGNED;
      map.get(home)?.real.push(featureId);
      for (const key of inner.keys()) {
        if (key === home) continue;
        // 홈이 아닌 컬럼에 태스크가 있으면 유령
        const bucket = map.get(key);
        if (bucket) bucket.ghost.push(featureId);
      }
    }
    return map;
  }, [columns, grid, homeByFeature]);

  // 컬럼 진행률(태스크 스코프)
  const columnProgress = useMemo(() => {
    const map = new Map<string, ColStat>();
    for (const col of columns)
      map.set(col.key, { total: 0, completed: 0, taskIds: [] });
    for (const inner of grid.values()) {
      for (const [key, s] of inner) {
        const c = map.get(key);
        if (!c) continue;
        c.total += s.total;
        c.completed += s.completed;
      }
    }
    return map;
  }, [columns, grid]);

  const activeFeature = activeFeatureId
    ? featureById.get(activeFeatureId)
    : null;

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveFeatureId(null);
    const featureId = String(e.active.id);
    const targetKey = e.over ? String(e.over.id) : null;
    if (!targetKey) return;
    const home = homeByFeature.get(featureId) ?? UNASSIGNED;
    if (targetKey === home) return;

    // 홈 컬럼의 태스크(상속분)만 이동
    const sourceStat = grid.get(featureId)?.get(home);
    const taskIds = sourceStat?.taskIds ?? [];
    if (taskIds.length === 0) return;

    const targetMilestoneId = targetKey === UNASSIGNED ? null : targetKey;
    onMoveTasksMilestone?.(taskIds, targetMilestoneId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) =>
        setActiveFeatureId(String(e.active.id))
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveFeatureId(null)}
    >
      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 items-start">
        {columns.map((col) => {
          const content = columnContent.get(col.key);
          const prog = columnProgress.get(col.key);
          const pct =
            prog && prog.total > 0
              ? Math.round((prog.completed / prog.total) * 100)
              : 0;
          return (
            <BoardColumn
              key={col.key}
              colKey={col.key}
              title={col.title}
              date={col.date}
              accent={col.accent}
              realCount={content?.real.length ?? 0}
              progressPct={prog && prog.total > 0 ? pct : null}
            >
              {content?.real.map((fid) => {
                const feature = featureById.get(fid);
                if (!feature) return null;
                const inner = grid.get(fid)!;
                const home = col.key;
                // 걸침: 홈이 아닌 마일스톤에 있는 태스크 수
                let splitCount = 0;
                let splitLabel = "";
                let unassignedCount = 0;
                for (const [k, s] of inner) {
                  if (k === home) continue;
                  if (k === UNASSIGNED) {
                    unassignedCount += s.total;
                  } else {
                    splitCount += s.total;
                    const ms = sortedMilestones.find((m) => m.id === k);
                    if (ms) splitLabel = ms.title;
                  }
                }
                return (
                  <FeatureCard
                    key={fid}
                    feature={feature}
                    onClick={() => onFeatureClick?.(feature)}
                    splitCount={splitCount}
                    splitLabel={splitLabel}
                    unassignedCount={unassignedCount}
                  />
                );
              })}

              {content?.ghost.map((fid) => {
                const feature = featureById.get(fid);
                if (!feature) return null;
                const s = grid.get(fid)?.get(col.key);
                return (
                  <GhostCard
                    key={`ghost-${fid}`}
                    feature={feature}
                    taskCount={s?.total ?? 0}
                    onClick={() => onFeatureClick?.(feature)}
                    label={t("milestone.board.ghostTasks", {
                      defaultValue: "이 마일스톤 태스크",
                    })}
                  />
                );
              })}

              {col.key === UNASSIGNED &&
                (content?.real.length ?? 0) === 0 &&
                (content?.ghost.length ?? 0) === 0 && (
                  <div className="text-xs text-slate-600 text-center py-6">
                    {t("milestone.board.dropToUnassign", {
                      defaultValue: "여기로 끌면 배정 해제",
                    })}
                  </div>
                )}
            </BoardColumn>
          );
        })}

        {/* 새 마일스톤 컬럼 */}
        {onCreateMilestone && (
          <button
            onClick={onCreateMilestone}
            className="flex-shrink-0 w-24 min-h-[160px] rounded-xl border border-dashed border-foreground/15 hover:border-bridge-accent/50 hover:bg-foreground/[0.02] text-slate-500 hover:text-bridge-accent transition-colors flex flex-col items-center justify-center gap-2"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">
              {t("milestone.create", { defaultValue: "마일스톤 추가" })}
            </span>
          </button>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeFeature ? (
          <FeatureCardView feature={activeFeature} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ========================================
// Column (droppable)
// ========================================

function BoardColumn({
  colKey,
  title,
  date,
  accent,
  realCount,
  progressPct,
  children,
}: {
  colKey: string;
  title: string;
  date: string;
  accent: boolean;
  realCount: number;
  progressPct: number | null;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  const isUnassigned = colKey === UNASSIGNED;

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-xl border p-2.5 min-h-[160px] transition-colors ${
        isUnassigned
          ? "bg-amber-500/[0.04] border-dashed border-amber-500/25"
          : "bg-foreground/[0.02] border-foreground/[0.06]"
      } ${isOver ? "ring-2 ring-bridge-secondary/50 bg-bridge-secondary/[0.04]" : ""}`}
    >
      {accent && (
        <div className="h-[3px] rounded-full mb-2.5 bg-gradient-to-r from-bridge-accent to-bridge-accent/40" />
      )}
      <div className="flex items-start justify-between px-1 pb-2.5">
        <div className="min-w-0">
          <div
            className={`text-xs font-bold truncate ${
              isUnassigned ? "text-amber-600 dark:text-amber-400" : "text-foreground"
            }`}
          >
            {title}
          </div>
          {date && <div className="text-xs text-slate-500 mt-0.5">{date}</div>}
        </div>
        <div className="text-xs text-slate-500 flex-shrink-0 ml-2 tabular-nums">
          {realCount}
          {progressPct !== null && (
            <span className="text-slate-600"> · {progressPct}%</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ========================================
// Feature card (draggable)
// ========================================

/** 순수 프리젠테이션(훅 없음) — DragOverlay 프리뷰에서도 재사용 */
function FeatureCardView({
  feature,
  splitCount = 0,
  splitLabel = "",
  unassignedCount = 0,
  dragging = false,
}: {
  feature: Feature;
  splitCount?: number;
  splitLabel?: string;
  unassignedCount?: number;
  dragging?: boolean;
}) {
  const { t } = useTranslation();
  const pct = Math.round(feature.progress_percentage);

  return (
    <div
      className={`bg-bridge-obsidian border border-foreground/[0.08] rounded-lg px-3 py-2.5 hover:border-foreground/[0.15] transition-colors ${
        dragging ? "shadow-2xl rotate-2 w-60" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: feature.color }}
        />
        <span className="text-xs font-medium text-foreground truncate flex-1">
          {feature.title}
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="mt-2 h-[5px] rounded-full bg-foreground/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full bg-bridge-accent"
          style={{ width: `${feature.progress_percentage}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-slate-400 tabular-nums">
          {feature.completed_tasks}/{feature.total_tasks} · {pct}%
        </span>
        {splitCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent"
            title={t("milestone.board.splitTip", {
              defaultValue: "다른 마일스톤으로 갈라진 태스크",
            })}
          >
            <GitBranch className="h-3 w-3" />
            {splitCount}
            {splitLabel ? ` → ${splitLabel}` : ""}
          </span>
        )}
        {unassignedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {unassignedCount}
          </span>
        )}
      </div>
    </div>
  );
}

/** 드래그 가능한 피처 카드 (컬럼 내부) */
function FeatureCard({
  feature,
  onClick,
  splitCount = 0,
  splitLabel = "",
  unassignedCount = 0,
}: {
  feature: Feature;
  onClick?: () => void;
  splitCount?: number;
  splitLabel?: string;
  unassignedCount?: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: feature.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`mb-2 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <FeatureCardView
        feature={feature}
        splitCount={splitCount}
        splitLabel={splitLabel}
        unassignedCount={unassignedCount}
      />
    </div>
  );
}

// ========================================
// Ghost card (non-draggable, 걸침 표시)
// ========================================

function GhostCard({
  feature,
  taskCount,
  onClick,
  label,
}: {
  feature: Feature;
  taskCount: number;
  onClick?: () => void;
  label: string;
}) {
  return (
    <div
      onClick={onClick}
      className="border border-dashed border-bridge-accent/30 bg-foreground/[0.015] rounded-lg px-3 py-2 mb-2 cursor-pointer hover:bg-foreground/[0.03] transition-colors"
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 opacity-60"
          style={{ backgroundColor: feature.color }}
        />
        <span className="text-xs font-medium text-slate-400 truncate flex-1">
          {feature.title}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/12 text-bridge-accent flex-shrink-0">
          <GitBranch className="h-2.5 w-2.5" />
          {taskCount}
        </span>
      </div>
      <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
        <Flag className="h-2.5 w-2.5" />
        {label} {taskCount}
      </div>
    </div>
  );
}
