import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "../../types";
import { getTodayDateString, getDDay } from "../../utils/dateUtils";
import { DashboardCard, DashboardEmpty } from "./DashboardCard";
import {
  TaskBucket,
  TASK_BUCKETS,
  isAssignedTo,
  resolveTaskBucket,
} from "./dashboardUtils";

const VISIBLE_PER_COLUMN = 4;

interface ColumnMeta {
  dotClass: string;
  lineClass: string;
  labelKey: string;
  labelFallback: string;
  ruleKey: string;
  ruleFallback: string;
}

const COLUMN_META: Record<TaskBucket, ColumnMeta> = {
  overdue: {
    dotClass: "bg-rose-500",
    lineClass: "bg-rose-500",
    labelKey: "boardDashboard.bucketOverdue",
    labelFallback: "지연",
    ruleKey: "boardDashboard.bucketOverdueRule",
    ruleFallback: "마감일이 지난 미완료",
  },
  today: {
    dotClass: "bg-amber-500",
    lineClass: "bg-amber-500",
    labelKey: "boardDashboard.bucketToday",
    labelFallback: "오늘",
    ruleKey: "boardDashboard.bucketTodayRule",
    ruleFallback: "오늘 마감",
  },
  doing: {
    dotClass: "bg-bridge-accent",
    lineClass: "bg-bridge-accent",
    labelKey: "boardDashboard.bucketDoing",
    labelFallback: "진행 중",
    ruleKey: "boardDashboard.bucketDoingRule",
    ruleFallback: "시작일이 지난 진행 건",
  },
  upcoming: {
    dotClass: "bg-slate-500",
    lineClass: "bg-foreground/10",
    labelKey: "boardDashboard.bucketUpcoming",
    labelFallback: "예정",
    ruleKey: "boardDashboard.bucketUpcomingRule",
    ruleFallback: "마감 이전 · 미착수",
  },
};

const CARD_STRIPE: Record<TaskBucket, string> = {
  overdue: "bg-rose-500",
  today: "bg-amber-500",
  doing: "bg-bridge-accent",
  upcoming: "bg-foreground/20",
};

interface MyTaskBoardWidgetProps {
  tasks: Task[];
  userId: string | undefined;
  onTaskClick: (task: Task) => void;
  onOpenKanban: () => void;
}

/**
 * 내 태스크 — 지연 / 오늘 / 진행 중 / 예정 4열 보드.
 * 앞 두 열은 마감일에서 파생되고, 뒤 두 열은 진행 상태에서 파생된다.
 */
export function MyTaskBoardWidget({
  tasks,
  userId,
  onTaskClick,
  onOpenKanban,
}: MyTaskBoardWidgetProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const [expanded, setExpanded] = useState<Set<TaskBucket>>(new Set());

  const { columns, assignedTotal, doneTotal } = useMemo(() => {
    const buckets: Record<TaskBucket, Task[]> = {
      overdue: [],
      today: [],
      doing: [],
      upcoming: [],
    };
    let assigned = 0;
    let done = 0;

    for (const task of tasks) {
      if (!isAssignedTo(task, userId)) continue;
      assigned += 1;
      if (task.completed) {
        done += 1;
        continue;
      }
      const bucket = resolveTaskBucket(task, today);
      if (bucket) buckets[bucket].push(task);
    }

    // 마감일 순 — 마감 없는 건은 뒤로
    for (const key of TASK_BUCKETS) {
      buckets[key].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    }

    return { columns: buckets, assignedTotal: assigned, doneTotal: done };
  }, [tasks, userId, today]);

  const hasAny = TASK_BUCKETS.some((key) => columns[key].length > 0);

  const toggleExpand = (bucket: TaskBucket) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  return (
    <DashboardCard
      title={t("boardDashboard.myTasksTitle", "내 태스크")}
      subtitle={`${doneTotal} / ${assignedTotal}`}
      linkLabel={t("boardDashboard.myTasksLink", "칸반에서 보기")}
      onLinkClick={onOpenKanban}
      padded={false}
    >
      {!hasAny ? (
        <div className="px-4">
          <DashboardEmpty
            message={t(
              "boardDashboard.myTasksEmpty",
              "나에게 배정된 진행 중인 태스크가 없습니다.",
            )}
            actionLabel={t("boardDashboard.myTasksLink", "칸반에서 보기")}
            onAction={onOpenKanban}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 p-4 items-start">
            {TASK_BUCKETS.map((bucket) => {
              const meta = COLUMN_META[bucket];
              const list = columns[bucket];
              const isOpen = expanded.has(bucket);
              const visible = isOpen ? list : list.slice(0, VISIBLE_PER_COLUMN);
              const hidden = list.length - visible.length;

              return (
                <div
                  key={bucket}
                  className="bg-foreground/[0.03] rounded-xl p-2.5 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2 px-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
                    />
                    <span className="text-xs font-bold text-foreground">
                      {t(meta.labelKey, meta.labelFallback)}
                    </span>
                    <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-foreground/[0.08] text-slate-400">
                      {list.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 px-0.5 -mt-1">
                    {t(meta.ruleKey, meta.ruleFallback)}
                  </p>
                  <span className={`h-0.5 rounded-full ${meta.lineClass}`} />

                  {visible.map((task) => {
                    const dday = getDDay(task.due_date);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onTaskClick(task)}
                        className="relative w-full text-left bg-bridge-dark rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] pl-3 pr-2.5 py-2.5 overflow-hidden transition-colors"
                      >
                        <span
                          className={`absolute left-0 inset-y-0 w-[3px] ${CARD_STRIPE[bucket]}`}
                        />
                        {task.feature_title && (
                          <span
                            className="inline-block text-xs font-bold px-1.5 py-0.5 rounded-full mb-1.5"
                            style={{
                              backgroundColor: `${task.feature_color || "#6366F1"}26`,
                              color: task.feature_color || "#6366F1",
                            }}
                          >
                            {task.feature_title}
                          </span>
                        )}
                        <p className="text-xs font-medium text-foreground leading-snug line-clamp-3">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-slate-500 truncate">
                            {task.block_name ||
                              t("boardDashboard.noBlock", "미분류")}
                          </span>
                          {dday.text && (
                            <span
                              className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                dday.urgency === "overdue" ||
                                dday.urgency === "today"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-foreground/[0.08] text-slate-400"
                              }`}
                            >
                              {dday.text}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {list.length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-3">
                      {t("boardDashboard.columnEmpty", "없음")}
                    </p>
                  )}

                  {(hidden > 0 || isOpen) && list.length > VISIBLE_PER_COLUMN && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(bucket)}
                      className="text-xs text-slate-400 hover:text-foreground transition-colors py-1"
                    >
                      {isOpen
                        ? t("boardDashboard.showLess", "접기")
                        : t("boardDashboard.showMore", { count: hidden })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="px-4 pb-3 text-xs text-slate-600">
            {t(
              "boardDashboard.myTasksHint",
              "지연 · 오늘은 마감일 기준으로 자동 분류됩니다. 카드를 누르면 태스크 상세가 열립니다.",
            )}
          </p>
        </>
      )}
    </DashboardCard>
  );
}
