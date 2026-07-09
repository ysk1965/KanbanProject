import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, Flag, Plus, Briefcase, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { IconButton } from "../ui/IconButton";
import { Milestone } from "../../types";
import { CalendarEventItem } from "../../utils/api";
import { HolidayInfo } from "../../hooks/useHolidays";
import { calendarTypeMeta } from "./calendarEventMeta";
import {
  MilestoneColorMap,
  resolveMilestoneColor,
  withAlpha,
} from "../../utils/milestoneColor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 선택한 날짜에 걸치는 항목들 — 종류별로 미리 분류해 전달받는다 */
export interface DayDetailData {
  milestones: Milestone[];
  events: CalendarEventItem[]; // TEAM
  absences: CalendarEventItem[]; // MEMBER
  customHolidays: CalendarEventItem[]; // CALENDAR/HOLIDAY (사용자 생성 — 편집 가능)
  workdayEvents: CalendarEventItem[]; // CALENDAR/WORKDAY (근무일 지정 — 편집 가능)
  publicHolidays: HolidayInfo[]; // 라이브러리 공휴일 (레코드 없음 — 편집 불가)
}

interface DayDetailPanelProps {
  date: string; // yyyy-MM-dd
  data: DayDetailData;
  /** 마일스톤 id → 색 (배열 순서 기준). 미전달 시 id 해시 fallback */
  milestoneColorMap?: MilestoneColorMap;
  canManage: boolean;
  /** 모바일에서 오버레이로 열려 있는지 (데스크톱은 항상 노출) */
  mobileOpen: boolean;
  onClose: () => void;
  onMilestoneClick: (m: Milestone) => void;
  onEventClick: (e: CalendarEventItem) => void;
  onAdd: (date: string) => void;
  onDesignateWorkday: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function initialsOf(name: string): string {
  return name.trim().charAt(0) || "?";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DayDetailPanel({
  date,
  data,
  milestoneColorMap,
  canManage,
  mobileOpen,
  onClose,
  onMilestoneClick,
  onEventClick,
  onAdd,
  onDesignateWorkday,
}: DayDetailPanelProps) {
  const { t } = useTranslation();

  const dateObj = useMemo(() => parseDate(date), [date]);
  const isWorkdayForced = data.workdayEvents.length > 0;

  const totalCount =
    data.milestones.length +
    data.events.length +
    data.absences.length +
    data.customHolidays.length +
    data.publicHolidays.length +
    data.workdayEvents.length;

  const isEmpty = totalCount === 0;

  const groupLabel = (label: string, count: number) => (
    <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <span className="text-xs font-medium text-slate-400 bg-foreground/[0.06] rounded-full px-1.5">
        {count}
      </span>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop — 모바일 오버레이가 열렸을 때만 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:relative inset-y-0 right-0 z-50 lg:z-auto
          w-full max-w-sm lg:max-w-none lg:w-[320px] shrink-0
          border-l border-foreground/[0.08] bg-bridge-dark
          flex-col overflow-hidden shadow-2xl lg:shadow-none
          ${mobileOpen ? "flex" : "hidden"} lg:flex`}
        role="complementary"
        aria-label={t("schedule.calendar.detail.title", "선택한 날짜 상세")}
      >
        {/* Top accent line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent shrink-0" />

        {/* Header */}
        <div className="px-4 pt-3.5 pb-3 border-b border-foreground/[0.08] shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <span className="text-3xl font-bold text-foreground tracking-tight leading-none tabular-nums">
                {dateObj.getDate()}
              </span>
              <span className="text-xs text-slate-400 font-medium truncate">
                {format(dateObj, "yyyy · MMM")} · {format(dateObj, "EEEE")}
              </span>
            </div>
            <div className="lg:hidden">
              <IconButton
                aria-label={t("common.close", "닫기")}
                size="sm"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          {/* Count summary */}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span>
              {t("schedule.calendar.layer.event", "이벤트")}{" "}
              <b className="text-slate-300 tabular-nums">
                {data.events.length}
              </b>
            </span>
            <span>
              {t("schedule.calendar.layer.absence", "부재")}{" "}
              <b className="text-slate-300 tabular-nums">
                {data.absences.length}
              </b>
            </span>
            <span>
              {t("schedule.calendar.layer.milestone", "마일스톤")}{" "}
              <b className="text-slate-300 tabular-nums">
                {data.milestones.length}
              </b>
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
              <span className="text-2xl opacity-40 mb-2">✳️</span>
              <p className="text-xs text-slate-500">
                {t(
                  "schedule.calendar.detail.empty",
                  "이 날은 등록된 일정이 없습니다",
                )}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-2">
              {/* ===== 휴무일 · 근무일 ===== */}
              {(data.publicHolidays.length > 0 ||
                data.customHolidays.length > 0 ||
                data.workdayEvents.length > 0) && (
                <div>
                  {groupLabel(
                    t("schedule.calendar.detail.holidayGroup", "휴무일"),
                    data.publicHolidays.length +
                      data.customHolidays.length +
                      data.workdayEvents.length,
                  )}
                  <div className="flex flex-col gap-1">
                    {/* 공휴일 (라이브러리 — 편집 불가, 근무일 지정만) */}
                    {data.publicHolidays.map((h) => (
                      <div
                        key={`ph-${h.date}-${h.name}`}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors"
                      >
                        <span className="w-1 self-stretch rounded-full bg-red-400/80 shrink-0" />
                        <span className="w-6 h-6 grid place-items-center rounded-full bg-red-500/15 text-sm shrink-0">
                          🏛️
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-medium text-foreground truncate ${
                              isWorkdayForced ? "line-through opacity-60" : ""
                            }`}
                          >
                            {h.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {isWorkdayForced
                              ? t(
                                  "schedule.calendar.detail.workdayOverridden",
                                  "공휴일 · 근무일로 지정됨",
                                )
                              : t(
                                  "schedule.calendar.detail.publicHoliday",
                                  "공휴일 · 시스템 제공",
                                )}
                          </div>
                        </div>
                        {canManage && !isWorkdayForced && (
                          <button
                            type="button"
                            onClick={() => onDesignateWorkday(date)}
                            className="text-xs font-medium text-slate-400 hover:text-bridge-accent whitespace-nowrap px-1.5 py-1 rounded-lg hover:bg-bridge-accent/10 transition-colors shrink-0"
                          >
                            {t(
                              "schedule.calendar.detail.designateWorkday",
                              "근무일 지정",
                            )}
                          </button>
                        )}
                      </div>
                    ))}

                    {/* 사용자 지정 휴무일 (편집/삭제 가능) */}
                    {data.customHolidays.map((e) => {
                      const meta = calendarTypeMeta(e.event_type);
                      return (
                        <button
                          key={`ch-${e.id}`}
                          type="button"
                          onClick={() => onEventClick(e)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors text-left"
                        >
                          <span className="w-1 self-stretch rounded-full bg-red-400/80 shrink-0" />
                          <span className="w-6 h-6 grid place-items-center rounded-full bg-red-500/15 text-sm shrink-0">
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {e.title ||
                                t("schedule.calendar.layer.holiday", "휴무일")}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t(
                                "schedule.calendar.detail.customHoliday",
                                "지정 휴무일",
                              )}
                              {e.recurring
                                ? ` · ${t("schedule.calendar.detail.yearly", "매년 반복")}`
                                : ""}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                        </button>
                      );
                    })}

                    {/* 근무일 지정 (편집/삭제 가능) */}
                    {data.workdayEvents.map((e) => (
                      <button
                        key={`wd-${e.id}`}
                        type="button"
                        onClick={() => onEventClick(e)}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors text-left"
                      >
                        <span className="w-1 self-stretch rounded-full bg-emerald-400/80 shrink-0" />
                        <span className="w-6 h-6 grid place-items-center rounded-full bg-emerald-500/15 shrink-0">
                          <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {e.title ||
                              t("schedule.calendar.workday", "근무일")}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t(
                              "schedule.calendar.detail.workdayDesignated",
                              "근무일 지정",
                            )}
                            {e.recurring
                              ? ` · ${t("schedule.calendar.detail.yearly", "매년 반복")}`
                              : ""}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== 마일스톤 ===== */}
              {data.milestones.length > 0 && (
                <div>
                  {groupLabel(
                    t("schedule.calendar.layer.milestone", "마일스톤"),
                    data.milestones.length,
                  )}
                  <div className="flex flex-col gap-1">
                    {data.milestones.map((m) => {
                      const msColor = resolveMilestoneColor(
                        m.id,
                        milestoneColorMap,
                      ).hex;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onMilestoneClick(m)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors text-left"
                        >
                          <span
                            className="w-1 self-stretch rounded-full shrink-0"
                            style={{ backgroundColor: msColor }}
                          />
                          <span
                            className="w-6 h-6 grid place-items-center rounded-full shrink-0"
                            style={{
                              backgroundColor: withAlpha(msColor, 0.15),
                            }}
                          >
                            <Flag
                              className="w-3.5 h-3.5"
                              style={{ color: msColor }}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {m.title}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t(
                                "schedule.calendar.detail.inPeriod",
                                "기간 중",
                              )}
                            </div>
                          </div>
                          <span
                            className="text-xs font-bold tabular-nums shrink-0"
                            style={{ color: msColor }}
                          >
                            {Math.round(m.progress_percentage)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== 이벤트 (TEAM) ===== */}
              {data.events.length > 0 && (
                <div>
                  {groupLabel(
                    t("schedule.calendar.layer.event", "이벤트"),
                    data.events.length,
                  )}
                  <div className="flex flex-col gap-1">
                    {data.events.map((e) => {
                      const meta = calendarTypeMeta(e.event_type);
                      const color = e.color || meta.color;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onEventClick(e)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors text-left"
                        >
                          <span
                            className="w-1 self-stretch rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className="w-6 h-6 grid place-items-center rounded-full text-sm shrink-0"
                            style={{ backgroundColor: `${color}26` }}
                          >
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {e.title || meta.label}
                            </div>
                            <div className="text-xs text-slate-500">
                              {meta.label}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== 부재 (MEMBER) ===== */}
              {data.absences.length > 0 && (
                <div>
                  {groupLabel(
                    t("schedule.calendar.layer.absence", "부재"),
                    data.absences.length,
                  )}
                  <div className="flex flex-col gap-1">
                    {data.absences.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onEventClick(e)}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl border border-transparent hover:border-foreground/[0.08] hover:bg-foreground/[0.04] transition-colors text-left"
                      >
                        <span className="w-1 self-stretch rounded-full bg-sky-400/80 shrink-0" />
                        {e.member?.profile_image ? (
                          <img
                            src={e.member.profile_image}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-6 h-6 grid place-items-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300 shrink-0">
                            {initialsOf(e.member?.name || "?")}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {e.member?.name}
                          </div>
                          {e.title && (
                            <div className="text-xs text-slate-500 truncate">
                              {e.title}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {canManage && (
          <div className="border-t border-foreground/[0.08] p-3 shrink-0">
            <button
              type="button"
              onClick={() => onAdd(date)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("schedule.calendar.detail.addForDay", "이 날 일정 추가")}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

DayDetailPanel.displayName = "DayDetailPanel";
