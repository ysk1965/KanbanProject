"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { getTodayDateString } from "../utils/dateUtils";
import type { BoardContractor, ContractorPeriod } from "../types";

// 외부인원 계약 기간을 월 축 위 간트 막대로 시각화하는 계획 보조 뷰.
// 관리(추가/수정/삭제)는 리스트 탭에서 수행하고, 여기서는 "누가 언제 붙어있나"를 조망한다.

type PStatus = "active" | "upcoming" | "expired";
type Range = 3 | 6 | 12;

const WHO_PX = 144; // 좌측 인원 컬럼 고정 폭 (오늘 라인 calc 정합성)

const parseMs = (s: string) => new Date(s + "T00:00:00").getTime();
const md = (s: string) => s.slice(5).replace("-", ".");

function periodStatus(p: ContractorPeriod, today: string): PStatus {
  if (p.start_date && today < p.start_date) return "upcoming";
  if (p.end_date && today > p.end_date) return "expired";
  return "active";
}

function contractorStatus(c: BoardContractor, today: string): PStatus {
  const ps = c.periods || [];
  if (ps.length === 0) return "active";
  let up = false;
  let ex = false;
  for (const p of ps) {
    const s = periodStatus(p, today);
    if (s === "active") return "active";
    if (s === "upcoming") up = true;
    else ex = true;
  }
  return up ? "upcoming" : ex ? "expired" : "active";
}

const RANK: Record<PStatus, number> = { active: 0, upcoming: 1, expired: 2 };

const BAR_BG: Record<PStatus, string> = {
  active: "bg-emerald-500",
  upcoming: "bg-amber-500",
  expired: "bg-slate-400",
};
const STATUS_TEXT: Record<PStatus, string> = {
  active: "text-emerald-600 dark:text-emerald-400",
  upcoming: "text-amber-600 dark:text-amber-400",
  expired: "text-slate-500",
};
const DOT_BG: Record<PStatus, string> = {
  active: "bg-emerald-500",
  upcoming: "bg-amber-500",
  expired: "bg-slate-400",
};

export function ContractorTimeline({
  contractors,
  onSelect,
}: {
  contractors: BoardContractor[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>(6);
  const today = getTodayDateString();

  const visible = useMemo(
    () =>
      contractors
        .filter((c) => !c.hidden)
        .sort(
          (a, b) =>
            RANK[contractorStatus(a, today)] - RANK[contractorStatus(b, today)],
        ),
    [contractors, today],
  );

  const win = useMemo(() => {
    const td = new Date(today + "T00:00:00");
    const ty = td.getFullYear();
    const tm = td.getMonth();
    let start: Date;
    let count: number;
    if (range === 12) {
      start = new Date(ty, 0, 1);
      count = 12;
    } else if (range === 3) {
      start = new Date(ty, tm - 1, 1);
      count = 3;
    } else {
      start = new Date(ty, tm - 2, 1);
      count = 6;
    }
    const end = new Date(start.getFullYear(), start.getMonth() + count, 1);
    return { startMs: start.getTime(), endMs: end.getTime(), start, count };
  }, [range, today]);

  const frac = (ms: number) => (ms - win.startMs) / (win.endMs - win.startMs);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const todayFrac = frac(parseMs(today));

  const months = useMemo(
    () =>
      Array.from({ length: win.count }, (_, i) => {
        const d = new Date(win.start.getFullYear(), win.start.getMonth() + i, 1);
        return { label: `${d.getMonth() + 1}월`, left: frac(d.getTime()) * 100 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win],
  );

  // 공백 경고: 가장 임박한 '활동중' 종료 계약
  const insight = useMemo(() => {
    let best: { name: string; role: string; end: string; days: number } | null =
      null;
    const td = parseMs(today);
    for (const c of visible) {
      for (const p of c.periods || []) {
        if (periodStatus(p, today) === "active" && p.end_date) {
          const days = Math.round((parseMs(p.end_date) - td) / 86400000);
          if (!best || days < best.days)
            best = {
              name: c.name,
              role: c.job_role?.name || "",
              end: p.end_date,
              days,
            };
        }
      }
    }
    return best;
  }, [visible, today]);

  const gridBg = `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / win.count}% - 1px), rgba(148,163,184,0.14) calc(${100 / win.count}% - 1px), rgba(148,163,184,0.14) ${100 / win.count}%)`;

  const rangeOptions: { r: Range; label: string }[] = [
    { r: 3, label: t("contractor.range3", "3개월") },
    { r: 6, label: t("contractor.range6", "6개월") },
    { r: 12, label: t("contractor.range12", "연간") },
  ];

  return (
    <div>
      {/* 컨트롤: 범례 + 범위 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          {(["active", "upcoming", "expired"] as PStatus[]).map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400"
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${DOT_BG[s]}`} />
              {s === "active"
                ? t("contractor.statusActive", "활동중")
                : s === "upcoming"
                  ? t("contractor.statusUpcoming", "예정")
                  : t("contractor.statusExpired", "만료")}
            </span>
          ))}
        </div>
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08]">
          {rangeOptions.map((o) => (
            <button
              key={o.r}
              type="button"
              onClick={() => setRange(o.r)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                range === o.r
                  ? "bg-bridge-obsidian text-foreground font-bold shadow-sm"
                  : "text-slate-400 hover:text-foreground font-medium"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500">
          {t("contractor.timelineEmpty", "표시할 외부인원이 없습니다")}
        </div>
      ) : (
        <>
          {/* 월 축 헤더 */}
          <div className="flex items-end h-5 mb-1">
            <div style={{ width: WHO_PX }} className="shrink-0" />
            <div className="relative flex-1 h-full">
              {months.map((m, i) => (
                <span
                  key={i}
                  className="absolute bottom-0 text-xs text-slate-500 tabular-nums"
                  style={{ left: `${m.left}%`, transform: "translateX(4px)" }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* 차트 본문 */}
          <div className="relative">
            {/* 오늘 라인 */}
            {todayFrac >= 0 && todayFrac <= 1 && (
              <>
                <div
                  className="absolute -top-1 z-20 -translate-x-1/2 px-1.5 py-0.5 rounded bg-bridge-accent text-white text-xs font-bold whitespace-nowrap pointer-events-none"
                  style={{
                    left: `calc(${WHO_PX}px + (100% - ${WHO_PX}px) * ${todayFrac})`,
                  }}
                >
                  {t("contractor.today", "오늘")}
                </div>
                <div
                  className="absolute top-4 bottom-1 w-0.5 bg-bridge-accent z-10 pointer-events-none"
                  style={{
                    left: `calc(${WHO_PX}px + (100% - ${WHO_PX}px) * ${todayFrac})`,
                  }}
                />
              </>
            )}

            <div className="pt-4">
              {visible.map((c) => {
                const cst = contractorStatus(c, today);
                const initials = c.name.slice(0, 2);
                return (
                  <div key={c.id} className="flex items-center h-11">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      style={{ width: WHO_PX }}
                      className="shrink-0 flex items-center gap-2 pr-3 text-left rounded-lg hover:bg-foreground/5 h-9 transition-colors"
                      title={t("contractor.editInList", "리스트에서 편집")}
                    >
                      <span
                        className="relative w-7 h-7 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: c.color || "#6366F1" }}
                      >
                        {initials}
                        <span
                          className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-bridge-obsidian ${DOT_BG[cst]}`}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-foreground truncate leading-tight">
                          {c.name}
                        </span>
                        {c.job_role?.name && (
                          <span className="block text-xs text-slate-500 truncate leading-tight">
                            {c.job_role.name}
                          </span>
                        )}
                      </span>
                    </button>

                    <div
                      className="relative flex-1 h-full"
                      style={{ backgroundImage: gridBg }}
                    >
                      {(c.periods || []).map((p) => {
                        const sMs = p.start_date
                          ? parseMs(p.start_date)
                          : win.startMs;
                        const eMs = p.end_date ? parseMs(p.end_date) : win.endMs;
                        const ls = frac(sMs);
                        const le = frac(eMs);
                        if (le <= 0 || ls >= 1) return null;
                        const L = clamp01(ls);
                        const R = clamp01(le);
                        const widthPct = Math.max((R - L) * 100, 3);
                        const clipL = ls < 0 || !p.start_date;
                        const clipR = le > 1 || !p.end_date;
                        const st = periodStatus(p, today);
                        const showLabel = R - L > 0.16;
                        const rem =
                          st === "active" && p.end_date
                            ? `D-${Math.round((parseMs(p.end_date) - parseMs(today)) / 86400000)}`
                            : st === "upcoming" && p.start_date
                              ? `D-${Math.round((parseMs(p.start_date) - parseMs(today)) / 86400000)} 시작`
                              : t("contractor.statusExpired", "만료");
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(c.id)}
                            title={`${c.name} · ${
                              st === "active"
                                ? t("contractor.statusActive", "활동중")
                                : st === "upcoming"
                                  ? t("contractor.statusUpcoming", "예정")
                                  : t("contractor.statusExpired", "만료")
                            }\n${p.start_date || "?"} ~ ${p.end_date || t("contractor.ongoing", "진행중")}\n${rem}`}
                            className={`group absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 overflow-hidden text-white shadow-sm hover:brightness-110 hover:z-20 transition ${BAR_BG[st]} ${st === "expired" ? "opacity-60" : ""}`}
                            style={{ left: `${L * 100}%`, width: `${widthPct}%` }}
                          >
                            {clipL && (
                              <span className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/25 to-transparent" />
                            )}
                            {clipR && (
                              <span className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-black/25 to-transparent" />
                            )}
                            {showLabel && (
                              <span className="relative text-xs font-bold whitespace-nowrap truncate">
                                {md(p.start_date || "")}
                                {p.start_date && (p.end_date || clipR) ? "–" : ""}
                                {p.end_date ? md(p.end_date) : ""}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 공백 경고 인사이트 */}
          {insight && (
            <div className="mt-3 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-foreground leading-snug">
                {t("contractor.gapWarnPre", "가장 먼저")}{" "}
                <b className="font-bold text-amber-600 dark:text-amber-400">
                  {insight.name}
                  {insight.role ? ` (${insight.role})` : ""}
                </b>{" "}
                {t("contractor.gapWarnMid", "계약이")}{" "}
                <b className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {md(insight.end)} (D-{insight.days})
                </b>{" "}
                {t(
                  "contractor.gapWarnPost",
                  "종료됩니다. 이후 공백에 대비하세요.",
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ContractorTimeline;
