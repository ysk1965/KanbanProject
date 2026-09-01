import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Flag } from "lucide-react";
import type { Feature, Milestone, Task } from "../types";

// ========================================
// Types
// ========================================

interface MilestoneMatrixProps {
  features: Feature[];
  tasks: Task[];
  milestones: Milestone[];
  /** 셀/피처 클릭 시 피처 상세 열기 */
  onFeatureClick?: (feature: Feature) => void;
  /** 컬럼 헤더(마일스톤) 클릭 → 상세 페이지 */
  onMilestoneHeaderClick?: (milestoneId: string) => void;
}

interface CellCount {
  total: number;
  completed: number;
}

const UNASSIGNED = "__unassigned__";

/** "YYYY-MM-DD" → "M/D" (타임존 영향 없이 문자열에서 직접 파싱) */
function toShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function pct(c: CellCount): number {
  if (c.total === 0) return 0;
  return Math.round((c.completed / c.total) * 100);
}

// ========================================
// Component
// ========================================

/**
 * 피처 × 마일스톤 매트릭스 (마일스톤 관리 홈).
 *
 * 셀 = 그 피처의 태스크가 해당 마일스톤에 몇 개 배정됐는지.
 * 진실은 task.milestone_id — 전부 프론트에서 집계(백엔드 무변경).
 * "기본 마일스톤(●)" = 그 피처의 태스크가 가장 많은 마일스톤(파생).
 */
export function MilestoneMatrix({
  features,
  tasks,
  milestones,
  onFeatureClick,
  onMilestoneHeaderClick,
}: MilestoneMatrixProps) {
  const { t } = useTranslation();

  // 마일스톤을 시작일 순으로 정렬
  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      ),
    [milestones],
  );

  // 태스크가 하나라도 있는 피처만 행으로 표시
  const rows = useMemo(() => {
    const featureIdsWithTasks = new Set(tasks.map((tk) => tk.feature_id));
    return features.filter((f) => featureIdsWithTasks.has(f.id));
  }, [features, tasks]);

  // featureId → (milestoneId | UNASSIGNED) → CellCount
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, CellCount>>();
    for (const tk of tasks) {
      if (!map.has(tk.feature_id)) map.set(tk.feature_id, new Map());
      const inner = map.get(tk.feature_id)!;
      const key = tk.milestone_id ?? UNASSIGNED;
      const cell = inner.get(key) ?? { total: 0, completed: 0 };
      cell.total += 1;
      if (tk.completed) cell.completed += 1;
      inner.set(key, cell);
    }
    return map;
  }, [tasks]);

  // featureId → 기본(대표) 마일스톤 id: 태스크 최다 마일스톤(동률이면 앞선 것)
  const primaryByFeature = useMemo(() => {
    const result = new Map<string, string>();
    for (const [featureId, inner] of grid) {
      let best: string | null = null;
      let bestCount = 0;
      for (const ms of sortedMilestones) {
        const c = inner.get(ms.id);
        if (c && c.total > bestCount) {
          bestCount = c.total;
          best = ms.id;
        }
      }
      if (best) result.set(featureId, best);
    }
    return result;
  }, [grid, sortedMilestones]);

  // 마일스톤별 합계(태스크 스코프) + 미배정 합계
  const columnSums = useMemo(() => {
    const sums = new Map<string, CellCount>();
    for (const ms of sortedMilestones)
      sums.set(ms.id, { total: 0, completed: 0 });
    sums.set(UNASSIGNED, { total: 0, completed: 0 });
    for (const inner of grid.values()) {
      for (const [key, c] of inner) {
        const s = sums.get(key);
        if (!s) continue;
        s.total += c.total;
        s.completed += c.completed;
      }
    }
    return sums;
  }, [grid, sortedMilestones]);

  const unassignedTotal = columnSums.get(UNASSIGNED)?.total ?? 0;

  const cellClass =
    "px-3 py-2.5 text-center text-xs tabular-nums border-b border-r border-foreground/[0.06] transition-colors";

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
      {/* 상단 안내 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.08]">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Layers className="h-3.5 w-3.5 text-bridge-accent" />
          <span className="font-medium text-foreground">
            {t("milestone.matrix.title", {
              defaultValue: "피처 × 마일스톤",
            })}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          {t("milestone.matrix.hint", {
            defaultValue: "● = 기본 마일스톤 · 셀 클릭 시 피처 상세",
          })}
        </span>
      </div>

      {/* 매트릭스 (가로 스크롤) */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-bridge-surface px-4 py-3 text-left text-xs font-bold text-foreground border-b border-r border-foreground/[0.08] min-w-[180px]">
                {t("milestone.matrix.featureCol", {
                  defaultValue: "Feature ↓ / Milestone →",
                })}
              </th>
              {sortedMilestones.map((ms) => (
                <th
                  key={ms.id}
                  onClick={
                    onMilestoneHeaderClick
                      ? () => onMilestoneHeaderClick(ms.id)
                      : undefined
                  }
                  className={`bg-bridge-surface px-3 py-3 text-center text-xs font-bold text-foreground border-b border-r border-foreground/[0.08] min-w-[104px]${
                    onMilestoneHeaderClick
                      ? " cursor-pointer hover:text-bridge-accent transition-colors"
                      : ""
                  }`}
                  title={
                    onMilestoneHeaderClick
                      ? t("milestone.detail.open", {
                          defaultValue: "상세 보기",
                        })
                      : undefined
                  }
                >
                  <div className="truncate max-w-[140px] mx-auto">
                    {ms.title}
                  </div>
                  <div className="text-xs font-normal text-slate-500 mt-0.5">
                    {toShortDate(ms.start_date)}~{toShortDate(ms.end_date)}
                  </div>
                </th>
              ))}
              {unassignedTotal > 0 && (
                <th className="bg-amber-500/10 px-3 py-3 text-center text-xs font-bold text-amber-600 dark:text-amber-400 border-b border-r border-foreground/[0.08] min-w-[88px]">
                  {t("milestone.matrix.unassigned", {
                    defaultValue: "미배정",
                  })}
                </th>
              )}
              <th className="bg-black/20 px-3 py-3 text-center text-xs font-bold text-slate-400 border-b border-foreground/[0.08] min-w-[112px]">
                {t("milestone.matrix.featureTotal", {
                  defaultValue: "피처 전체",
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((feature) => {
              const inner = grid.get(feature.id);
              const primaryMs = primaryByFeature.get(feature.id);
              return (
                <tr
                  key={feature.id}
                  className="group hover:bg-foreground/[0.02] transition-colors"
                >
                  {/* 피처명 (sticky) */}
                  <td
                    className="sticky left-0 z-10 bg-bridge-obsidian group-hover:bg-bridge-obsidian px-4 py-2.5 border-b border-r border-foreground/[0.06]"
                    onClick={() => onFeatureClick?.(feature)}
                    style={{ cursor: onFeatureClick ? "pointer" : "default" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: feature.color }}
                      />
                      <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
                        {feature.title}
                      </span>
                    </div>
                  </td>

                  {/* 마일스톤 셀 */}
                  {sortedMilestones.map((ms) => {
                    const c = inner?.get(ms.id);
                    const isPrimary = primaryMs === ms.id;
                    if (!c || c.total === 0) {
                      return (
                        <td
                          key={ms.id}
                          className={`${cellClass} text-slate-600`}
                        >
                          —
                        </td>
                      );
                    }
                    const isDone = c.completed === c.total;
                    return (
                      <td
                        key={ms.id}
                        onClick={() => onFeatureClick?.(feature)}
                        className={`${cellClass} cursor-pointer ${
                          isDone
                            ? isPrimary
                              ? "bg-emerald-500/[0.18] text-emerald-600 dark:text-emerald-400 font-bold ring-1 ring-inset ring-emerald-500/40"
                              : "bg-emerald-500/[0.10] text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-500/[0.16]"
                            : isPrimary
                              ? "bg-bridge-accent/[0.18] text-foreground font-bold ring-1 ring-inset ring-bridge-accent/40"
                              : "bg-bridge-accent/[0.08] text-bridge-accent font-medium hover:bg-bridge-accent/[0.14]"
                        }`}
                        title={
                          isDone
                            ? t("milestone.matrix.doneTip", {
                                defaultValue: "모든 태스크 완료",
                              })
                            : isPrimary
                              ? t("milestone.matrix.primaryTip", {
                                  defaultValue:
                                    "기본 마일스톤 — 새 태스크가 상속됩니다",
                                })
                              : undefined
                        }
                      >
                        {isPrimary && "● "}
                        {c.completed}/{c.total}
                        {isDone && " ✓"}
                      </td>
                    );
                  })}

                  {/* 미배정 셀 */}
                  {unassignedTotal > 0 &&
                    (() => {
                      const c = inner?.get(UNASSIGNED);
                      if (!c || c.total === 0) {
                        return (
                          <td className={`${cellClass} text-slate-600`}>—</td>
                        );
                      }
                      return (
                        <td
                          onClick={() => onFeatureClick?.(feature)}
                          className={`${cellClass} cursor-pointer bg-amber-500/[0.12] text-amber-600 dark:text-amber-400 font-bold hover:bg-amber-500/20`}
                        >
                          {c.total}
                        </td>
                      );
                    })()}

                  {/* 피처 전체 */}
                  <td className="px-3 py-2.5 text-center text-xs tabular-nums text-slate-400 border-b border-foreground/[0.06] bg-black/10">
                    {feature.completed_tasks}/{feature.total_tasks}
                    <span className="text-slate-500">
                      {" · "}
                      {Math.round(feature.progress_percentage)}%
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* 합계 행 */}
            <tr className="bg-bridge-secondary/[0.06]">
              <td className="sticky left-0 z-10 bg-bridge-obsidian px-4 py-3 border-r border-foreground/[0.08]">
                <div className="flex items-center gap-2 text-xs font-bold text-bridge-secondary">
                  <Flag className="h-3.5 w-3.5" />
                  {t("milestone.matrix.sumRow", {
                    defaultValue: "마일스톤 합계",
                  })}
                </div>
              </td>
              {sortedMilestones.map((ms) => {
                const s = columnSums.get(ms.id) ?? { total: 0, completed: 0 };
                return (
                  <td
                    key={ms.id}
                    className="px-3 py-3 text-center text-xs font-bold text-foreground tabular-nums border-r border-foreground/[0.08]"
                  >
                    {s.total > 0 ? (
                      <>
                        {s.total}
                        <span className="text-slate-500 font-normal">
                          {" · "}
                          {pct(s)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600 font-normal">0</span>
                    )}
                  </td>
                );
              })}
              {unassignedTotal > 0 && (
                <td className="px-3 py-3 text-center text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums border-r border-foreground/[0.08]">
                  {unassignedTotal}
                </td>
              )}
              <td className="border-foreground/[0.08]" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
