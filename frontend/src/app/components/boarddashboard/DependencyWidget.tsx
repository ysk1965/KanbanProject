import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock } from "lucide-react";
import type { Task, TaskDependency } from "../../types";
import { taskDependencyAPI } from "../../utils/api";
import { getDDay } from "../../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";
import { DashboardCard, DashboardEmpty } from "./DashboardCard";
import { isAssignedTo } from "./dashboardUtils";

interface BlockingEntry {
  /** 내 태스크 — 다른 사람 작업을 막고 있다 */
  task: Task;
  waiting: Task[];
  waitingNames: string[];
}

interface BlockedEntry {
  /** 나를 막고 있는 남의 태스크 */
  blocker: Task;
  /** 대기 중인 내 태스크 */
  mine: Task;
}

interface DependencyWidgetProps {
  boardId: string;
  tasks: Task[];
  userId: string | undefined;
  onTaskClick: (task: Task) => void;
}

/**
 * 의존성 — "내가 막고 있는 것 / 나를 막고 있는 것".
 * 보드 전체 의존성 목록을 받아 내 태스크 기준으로 양방향 요약한다(읽기 전용).
 */
export function DependencyWidget({
  boardId,
  tasks,
  userId,
  onTaskClick,
}: DependencyWidgetProps) {
  const { t } = useTranslation();

  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    taskDependencyAPI
      .getByBoard(boardId)
      .then((res) => {
        if (!cancelled) setDeps(res ?? []);
      })
      .catch(() => {
        if (!cancelled) setDeps([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const { blocking, blocked } = useMemo(() => {
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const blockingMap = new Map<string, BlockingEntry>();
    const blockedList: BlockedEntry[] = [];

    for (const dep of deps) {
      const pre = taskMap.get(dep.predecessor_id);
      const suc = taskMap.get(dep.successor_id);
      if (!pre || !suc) continue;

      // 내가 막고 있는 것: 내 미완료 선행 태스크를 남의 태스크가 기다린다
      if (isAssignedTo(pre, userId) && !pre.completed && !suc.completed) {
        const entry = blockingMap.get(pre.id) ?? {
          task: pre,
          waiting: [],
          waitingNames: [],
        };
        entry.waiting.push(suc);
        for (const a of suc.assignees ?? []) {
          if (a.id !== userId && !entry.waitingNames.includes(a.name)) {
            entry.waitingNames.push(a.name);
          }
        }
        blockingMap.set(pre.id, entry);
      }

      // 나를 막고 있는 것: 내 미완료 태스크가 남의 미완료 선행 태스크를 기다린다
      if (
        isAssignedTo(suc, userId) &&
        !suc.completed &&
        !pre.completed &&
        !isAssignedTo(pre, userId)
      ) {
        blockedList.push({ blocker: pre, mine: suc });
      }
    }

    const blockingList = Array.from(blockingMap.values()).sort(
      (a, b) => b.waiting.length - a.waiting.length,
    );

    return { blocking: blockingList, blocked: blockedList };
  }, [deps, tasks, userId]);

  const isEmpty = blocking.length === 0 && blocked.length === 0;

  return (
    <DashboardCard
      title={t("boardDashboard.dependencyTitle", "의존성")}
      subtitle={t("boardDashboard.dependencySubtitle", "태스크 연결 기준")}
      isLoading={isLoading}
      padded={false}
    >
      {isEmpty ? (
        <div className="px-4">
          <DashboardEmpty
            message={t(
              "boardDashboard.dependencyEmpty",
              "지금 걸려 있는 의존성이 없습니다.",
            )}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              {t("boardDashboard.dependencyBlocking", "내가 막고 있는 것")}
            </h3>
            {blocking.length === 0 ? (
              <p className="text-xs text-slate-600">
                {t("boardDashboard.dependencyNoBlocking", "없음")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {blocking.slice(0, 3).map((entry) => {
                  const dday = getDDay(entry.task.due_date);
                  return (
                    <li
                      key={entry.task.id}
                      className="py-2 border-t border-foreground/[0.08] first:border-t-0 first:pt-0"
                    >
                      <button
                        type="button"
                        onClick={() => onTaskClick(entry.task)}
                        className="flex items-start gap-2.5 text-left w-full group"
                      >
                        <span className="flex-none w-5 h-5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 grid place-items-center text-xs font-bold">
                          {entry.waiting.length}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-rose-600 dark:text-rose-400 group-hover:underline line-clamp-2">
                            {entry.task.title}
                          </span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {entry.waitingNames.length > 0
                              ? t("boardDashboard.dependencyWaitingBy", {
                                  names: entry.waitingNames
                                    .slice(0, 3)
                                    .join(" · "),
                                  count: entry.waiting.length,
                                })
                              : t("boardDashboard.dependencyWaitingCount", {
                                  count: entry.waiting.length,
                                })}
                            {dday.text ? ` · ${dday.text}` : ""}
                          </span>
                        </span>
                        <AlertTriangle
                          size={13}
                          className="ml-auto flex-none text-rose-500/70"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-4 md:border-l border-t md:border-t-0 border-foreground/[0.08]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              {t("boardDashboard.dependencyBlocked", "나를 막고 있는 것")}
            </h3>
            {blocked.length === 0 ? (
              <p className="text-xs text-slate-600">
                {t("boardDashboard.dependencyNoBlocked", "없음")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {blocked.slice(0, 3).map((entry) => {
                  const owner = entry.blocker.assignees?.[0];
                  const dday = getDDay(entry.blocker.due_date);
                  return (
                    <li
                      key={`${entry.blocker.id}-${entry.mine.id}`}
                      className="py-2 border-t border-foreground/[0.08] first:border-t-0 first:pt-0"
                    >
                      <button
                        type="button"
                        onClick={() => onTaskClick(entry.blocker)}
                        className="flex items-start gap-2.5 text-left w-full group"
                      >
                        <span
                          className="flex-none w-5 h-5 rounded-md grid place-items-center text-xs font-bold text-white"
                          style={{
                            backgroundColor: owner
                              ? getAssigneeHex(owner.name)
                              : "#64748b",
                          }}
                        >
                          {owner ? getInitials(owner.name) : "?"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-foreground group-hover:underline line-clamp-2">
                            {entry.blocker.title}
                          </span>
                          <span className="block text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {dday.urgency === "overdue"
                              ? `${t("boardDashboard.overdueShort", "지연")} ${dday.text} · `
                              : ""}
                            {t("boardDashboard.dependencyMineWaiting", {
                              title: entry.mine.title,
                            })}
                          </span>
                        </span>
                        <Clock
                          size={13}
                          className="ml-auto flex-none text-slate-500"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
