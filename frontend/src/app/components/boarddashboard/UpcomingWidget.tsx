import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, Flag } from "lucide-react";
import type { Milestone, Task } from "../../types";
import { meetingAPI, MeetingSummary } from "../../utils/api";
import { getTodayDateString, getDDay } from "../../utils/dateUtils";
import { DashboardCard, DashboardEmpty } from "./DashboardCard";
import { isAssignedTo, formatTime } from "./dashboardUtils";
import { addDaysToDate as addDays } from "../../utils/workloadBar";

const LOOKAHEAD_DAYS = 21;
const MAX_ITEMS = 4;

type UpcomingKind = "meeting" | "milestone";

interface UpcomingItem {
  id: string;
  kind: UpcomingKind;
  date: string;
  title: string;
  detail: string;
}

interface UpcomingWidgetProps {
  boardId: string;
  milestones: Milestone[];
  tasks: Task[];
  userId: string | undefined;
  /** 헤더 링크: 일정 탭으로 이동 */
  onOpenSchedule: () => void;
}

/** 다가오는 일정 — 회의와 마일스톤을 한 줄로 합쳐 날짜순으로 보여준다. */
export function UpcomingWidget({
  boardId,
  milestones,
  tasks,
  userId,
  onOpenSchedule,
}: UpcomingWidgetProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    meetingAPI
      .getMeetingsByDateRange(boardId, today, addDays(today, LOOKAHEAD_DAYS))
      .then((res) => {
        if (!cancelled) setMeetings(res ?? []);
      })
      .catch(() => {
        if (!cancelled) setMeetings([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, today]);

  const items = useMemo<UpcomingItem[]>(() => {
    const limit = addDays(today, LOOKAHEAD_DAYS);
    const result: UpcomingItem[] = [];

    for (const m of meetings) {
      if (m.meeting_date < today || m.meeting_date > limit) continue;
      const time = formatTime(m.start_time);
      result.push({
        id: `meeting-${m.id}`,
        kind: "meeting",
        date: m.meeting_date,
        title: m.title,
        detail: [
          time,
          t("boardDashboard.upcomingParticipants", {
            count: m.participant_count,
          }),
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    for (const ms of milestones) {
      if (!ms.end_date || ms.end_date < today || ms.end_date > limit) continue;
      // 이 마일스톤에 걸린 내 태스크 진척
      const mine = tasks.filter(
        (task) => task.milestone_id === ms.id && isAssignedTo(task, userId),
      );
      const done = mine.filter((task) => task.completed).length;
      result.push({
        id: `milestone-${ms.id}`,
        kind: "milestone",
        date: ms.end_date,
        title: ms.title,
        detail:
          mine.length > 0
            ? t("boardDashboard.upcomingMyProgress", {
                done,
                total: mine.length,
              })
            : t("boardDashboard.upcomingProgress", {
                percent: Math.round(ms.progress_percentage ?? 0),
              }),
      });
    }

    return result
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, MAX_ITEMS);
  }, [meetings, milestones, tasks, userId, today, t]);

  return (
    <DashboardCard
      title={t("boardDashboard.upcomingTitle", "다가오는 일정")}
      linkLabel={t("boardDashboard.upcomingLink", "일정")}
      onLinkClick={onOpenSchedule}
      isLoading={isLoading}
    >
      {items.length === 0 ? (
        <DashboardEmpty
          message={t(
            "boardDashboard.upcomingEmpty",
            "3주 안에 예정된 회의나 마일스톤이 없습니다.",
          )}
        />
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const dday = getDDay(item.date);
            const [, month, day] = item.date.split("-");
            const Icon = item.kind === "meeting" ? Users : Flag;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2.5 border-t border-foreground/[0.08] first:border-t-0 first:pt-0"
              >
                <span className="flex-none w-11 text-center">
                  <span className="block text-sm font-bold text-foreground leading-none">
                    {day}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {t("boardDashboard.monthShort", { month: Number(month) })}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      size={12}
                      className="flex-none text-slate-500"
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-foreground truncate">
                      {item.title}
                    </span>
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5 truncate">
                    {item.detail}
                  </span>
                </span>
                <span
                  className={`flex-none text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    dday.diff <= 1
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "bg-foreground/[0.08] text-slate-400"
                  }`}
                >
                  {dday.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
