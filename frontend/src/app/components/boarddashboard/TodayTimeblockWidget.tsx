import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { scheduleAPI, ScheduleBlockInfo } from "../../utils/api";
import { getTodayDateString } from "../../utils/dateUtils";
import { DashboardCard } from "./DashboardCard";
import { formatHours, formatTime, timeToMinutes } from "./dashboardUtils";

/** 1시간당 픽셀. 30분 보조선이 같이 그려지므로 짝수로 유지한다. */
const HOUR_H = 60;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const DEFAULT_COLOR = "#6366F1";

interface PlacedBlock {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  top: number;
  height: number;
  startMin: number;
  endMin: number;
  isMeeting: boolean;
}

interface GapSlot {
  top: number;
  height: number;
  label: string;
}

interface TodayTimeblockWidgetProps {
  boardId: string;
  /** 로그인 사용자 id — 이 사람의 열만 그린다 */
  userId: string | undefined;
  /** 헤더 링크: 일정 탭(타임블록)으로 이동 */
  onOpenSchedule: () => void;
}

/**
 * 오늘의 타임블록 — 하루를 세로로 세운 레일.
 * 추가 버튼은 두지 않는다. 빈 구간을 누르면 일정 탭의 타임블록으로 넘어간다.
 */
export function TodayTimeblockWidget({
  boardId,
  userId,
  onOpenSchedule,
}: TodayTimeblockWidgetProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  const [blocks, setBlocks] = useState<ScheduleBlockInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    if (!boardId || !userId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    scheduleAPI
      .getDailyFull(boardId, today, [userId])
      .then((res) => {
        if (cancelled) return;
        const mine = res.columns.find((c) => c.user.id === userId);
        setBlocks(mine?.blocks ?? []);
      })
      .catch(() => {
        if (!cancelled) setBlocks([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, userId, today]);

  // 현재 시각 표시선 — 1분마다 갱신
  useEffect(() => {
    const timer = window.setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { placed, startHour, endHour, hours, busyMinutes } = useMemo(() => {
    const items: PlacedBlock[] = [];

    for (const b of blocks) {
      const s = timeToMinutes(b.start_time);
      const e = timeToMinutes(b.end_time);
      if (s == null || e == null || e <= s) continue;
      items.push({
        id: b.id,
        title:
          b.title ||
          b.checklist_item?.title ||
          b.task?.title ||
          b.meeting?.title ||
          t("boardDashboard.timeblockUntitled", "제목 없음"),
        subtitle: `${formatTime(b.start_time)} – ${formatTime(b.end_time)}`,
        color: b.color || b.feature?.color || DEFAULT_COLOR,
        top: 0,
        height: 0,
        startMin: s,
        endMin: e,
        isMeeting: b.meeting != null || b.block_type === "MEETING",
      });
    }
    items.sort((a, b) => a.startMin - b.startMin);

    // 표시 구간: 기본 08–20시, 블록이 벗어나면 그만큼 넓힌다
    let sh = DEFAULT_START_HOUR;
    let eh = DEFAULT_END_HOUR;
    for (const it of items) {
      sh = Math.min(sh, Math.floor(it.startMin / 60));
      eh = Math.max(eh, Math.ceil(it.endMin / 60));
    }

    const originMin = sh * 60;
    for (const it of items) {
      it.top = ((it.startMin - originMin) / 60) * HOUR_H;
      it.height = Math.max(18, ((it.endMin - it.startMin) / 60) * HOUR_H);
    }

    const hourList: number[] = [];
    for (let h = sh; h < eh; h += 1) hourList.push(h);

    const busy = items.reduce((sum, it) => sum + (it.endMin - it.startMin), 0);

    return {
      placed: items,
      startHour: sh,
      endHour: eh,
      hours: hourList,
      busyMinutes: busy,
    };
  }, [blocks, t]);

  // 블록 사이의 빈 구간 — 누르면 일정 탭으로 넘어간다
  const gaps = useMemo<GapSlot[]>(() => {
    const originMin = startHour * 60;
    const endMin = endHour * 60;
    const result: GapSlot[] = [];
    let cursor = originMin;

    const pushGap = (from: number, to: number) => {
      if (to - from < 30) return;
      result.push({
        top: ((from - originMin) / 60) * HOUR_H,
        height: ((to - from) / 60) * HOUR_H,
        label: `${String(Math.floor(from / 60)).padStart(2, "0")}:${String(from % 60).padStart(2, "0")} – ${String(Math.floor(to / 60)).padStart(2, "0")}:${String(to % 60).padStart(2, "0")}`,
      });
    };

    for (const it of placed) {
      if (it.startMin > cursor) pushGap(cursor, it.startMin);
      cursor = Math.max(cursor, it.endMin);
    }
    pushGap(cursor, endMin);
    return result;
  }, [placed, startHour, endHour]);

  const windowMinutes = (endHour - startHour) * 60;
  const freeMinutes = Math.max(0, windowMinutes - busyMinutes);
  const nowTop = ((nowMinutes - startHour * 60) / 60) * HOUR_H;
  const showNowLine = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <DashboardCard
      title={t("boardDashboard.timeblockTitle", "오늘의 타임블록")}
      subtitle={t("boardDashboard.timeblockDate", {
        defaultValue: "{{date}}",
        date: today.slice(5).replace("-", "/"),
      })}
      linkLabel={t("boardDashboard.timeblockLink", "주간 타임블록")}
      onLinkClick={onOpenSchedule}
      isLoading={isLoading}
      padded={false}
    >
      <div className="grid grid-cols-[36px_1fr] px-4 pt-3">
        <div className="grid">
          {hours.map((h) => (
            <span
              key={h}
              className="text-xs text-slate-500 -translate-y-1.5"
              style={{ height: HOUR_H }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>

        <div
          className="relative border-l border-foreground/[0.08]"
          style={{
            height: hours.length * HOUR_H,
            backgroundImage: `repeating-linear-gradient(to bottom, rgba(148,163,184,0.14) 0 1px, transparent 1px ${HOUR_H}px), repeating-linear-gradient(to bottom, transparent 0 ${HOUR_H / 2}px, rgba(148,163,184,0.08) ${HOUR_H / 2}px ${HOUR_H / 2 + 1}px, transparent ${HOUR_H / 2 + 1}px ${HOUR_H}px)`,
          }}
        >
          {gaps.map((gap) => (
            <button
              key={`gap-${gap.top}`}
              type="button"
              onClick={onOpenSchedule}
              title={t("boardDashboard.timeblockGapHint", "일정 탭에서 추가")}
              className="absolute left-1.5 right-0.5 rounded-lg border border-dashed border-foreground/10 hover:border-bridge-accent/50 hover:bg-bridge-accent/5 transition-colors flex items-center justify-center"
              style={{ top: gap.top, height: gap.height }}
            >
              <span className="text-xs text-slate-600">{gap.label}</span>
            </button>
          ))}

          {placed.map((b) => (
            <div
              key={b.id}
              className="absolute left-1.5 right-0.5 rounded-lg px-2.5 py-1.5 overflow-hidden"
              style={{
                top: b.top,
                height: b.height,
                borderLeft: `3px solid ${b.color}`,
                backgroundColor: `${b.color}26`,
              }}
            >
              <p className="text-xs font-medium text-foreground truncate">
                {b.title}
              </p>
              {b.height >= 34 && (
                <p className="text-xs text-slate-500 truncate">{b.subtitle}</p>
              )}
            </div>
          ))}

          {showNowLine && (
            <div
              className="absolute left-0 right-0 h-[1.5px] bg-rose-500 pointer-events-none"
              style={{ top: nowTop }}
            >
              <span className="absolute -left-[3px] -top-[2.5px] w-1.5 h-1.5 rounded-full bg-rose-500" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-500">
        <span>
          {t("boardDashboard.timeblockBusy", "배치")}{" "}
          <b className="font-bold text-foreground">
            {formatHours(busyMinutes)}
          </b>
        </span>
        <span>
          {t("boardDashboard.timeblockFree", "여유")}{" "}
          <b className="font-bold text-foreground">
            {formatHours(freeMinutes)}
          </b>
        </span>
        <span className="ml-auto">
          {String(startHour).padStart(2, "0")} –{" "}
          {String(endHour).padStart(2, "0")}
        </span>
      </div>
    </DashboardCard>
  );
}
