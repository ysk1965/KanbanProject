import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Flag,
  Calendar as CalendarIcon,
  Plus,
  Check,
  Maximize2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { MotionModal } from "./ui/MotionModal";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Milestone, Feature } from "../types";
import { getTodayDateString } from "../utils/dateUtils";

// ────────────────────────────────────────────────────────────
// 세로 타임라인 진행률 링 노드
// ────────────────────────────────────────────────────────────
type MilestoneStatus = "done" | "current" | "risk" | "todo";

// 상태별 링 색 (완료=emerald, 현재=bridge-accent, 지연=amber, 예정=hollow)
const RING_COLOR: Record<MilestoneStatus, string> = {
  done: "#34d399",
  current: "#6366f1",
  risk: "#fbbf24",
  todo: "#64748b",
};

// yyyy-MM-dd → 타임존 무관 day 정수 (UTC 자정 기준)
function dateToNum(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// 진행률 + 기간(오늘 기준)으로 마일스톤 상태 파생
function deriveMilestoneStatus(
  m: { start_date: string; end_date: string; progress_percentage: number },
  today: string,
): MilestoneStatus {
  if (m.progress_percentage >= 100) return "done";
  if (m.start_date > today) return "todo"; // 아직 시작 전
  if (m.end_date < today) return "risk"; // 기간 지났는데 미완료
  return "current"; // 오늘이 기간 내부 = 진행 중
}

// 현재 마일스톤: 기간의 경과 비율(%)
function timeElapsedPercent(
  m: { start_date: string; end_date: string },
  today: string,
): number {
  const s = dateToNum(m.start_date);
  const e = dateToNum(m.end_date);
  const t = dateToNum(today);
  if (e <= s) return t >= s ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((t - s) / (e - s)) * 100)));
}

// 종료일까지 D-day 라벨
function dDayLabel(m: { end_date: string }, today: string): string {
  const days = Math.round(
    (dateToNum(m.end_date) - dateToNum(today)) / 86400000,
  );
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${-days}`;
}

function MilestoneRingNode({
  percent,
  status,
  selected,
  size = 22,
}: {
  percent: number;
  status: MilestoneStatus;
  selected?: boolean;
  size?: number;
}) {
  const sw = size >= 28 ? 3.5 : 3; // 큰 노드는 스트로크도 비례해서 굵게
  const R = size / 2 - sw;
  const CIRC = 2 * Math.PI * R;
  const c = size / 2;
  const pct = Math.max(0, Math.min(100, percent));
  const color = RING_COLOR[status];
  const isDone = status === "done";
  const checkPx = size >= 28 ? 16 : 12;
  const dotPx = size >= 28 ? 7 : 5;
  return (
    <span
      className="relative grid place-items-center rounded-full bg-bridge-dark"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={sw}
        />
        {pct > 0 && (
          <circle
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
          />
        )}
      </svg>
      {isDone && (
        <Check
          className="absolute"
          style={{ color, width: checkPx, height: checkPx }}
          strokeWidth={3.5}
        />
      )}
      {selected && !isDone && (
        <span
          className="absolute rounded-full"
          style={{ width: dotPx, height: dotPx, background: color }}
        />
      )}
    </span>
  );
}

// 필수 입력 필드의 충족 여부를 인풋 우측에 표시하는 상태 아이콘
//  - 미충족: 점선 원(hollow) / 충족: emerald 체크
function FieldStatusIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <span
      className="grid place-items-center rounded-full bg-emerald-500"
      style={{ width: 20, height: 20 }}
      aria-hidden
    >
      <Check className="h-3 w-3 text-white" strokeWidth={3} />
    </span>
  ) : (
    <span
      className="block rounded-full border border-dashed border-slate-500"
      style={{ width: 20, height: 20 }}
      aria-hidden
    />
  );
}

// ────────────────────────────────────────────────────────────
// 생성 중 임시 위치 미리보기 — 점선 고스트 노드
//  - 기간(startDate)에 따라 레일의 시작일 순서 자리에 끼어 표시된다.
//  - 배지는 필수 입력 상태를 반영: 제목 필요 → 기간 필요 → 생성 준비완료
// ────────────────────────────────────────────────────────────
function GhostRailNode({
  title,
  startDate,
  endDate,
  newLabel,
  readyLabel,
  needTitleLabel,
  needPeriodLabel,
  undatedSubLabel,
}: {
  title: string;
  startDate?: Date;
  endDate?: Date;
  newLabel: string;
  readyLabel: string;
  needTitleLabel: string;
  needPeriodLabel: string;
  undatedSubLabel: string;
}) {
  const dated = !!(startDate && endDate);
  const hasTitle = !!title.trim();
  const ready = hasTitle && dated;
  const badgeText = ready
    ? readyLabel
    : !hasTitle
      ? needTitleLabel
      : needPeriodLabel;
  return (
    <div
      className="relative grid grid-cols-[24px_1fr] items-center gap-2.5 rounded-lg border border-dashed border-bridge-accent bg-bridge-accent/10 py-2 pr-2"
      aria-hidden
    >
      <span
        className="justify-self-center grid place-items-center rounded-full border border-dashed border-bridge-accent bg-bridge-dark"
        style={{ width: 22, height: 22 }}
      >
        <Plus className="h-3 w-3 text-bridge-accent" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-bridge-accent">
            {title.trim() || newLabel}
          </span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold text-white ${
              ready ? "bg-emerald-500" : "bg-bridge-accent"
            }`}
          >
            {badgeText}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400 tabular-nums">
          {dated
            ? `${format(startDate!, "M/d")}~${format(endDate!, "M/d")}`
            : undatedSubLabel}
        </span>
      </span>
    </div>
  );
}

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: Milestone | null;
  milestones: Milestone[];
  features: Feature[];
  featureMilestoneCountMap?: Record<string, number>;
  featurePrimaryMilestoneMap?: Record<string, string>;
  onSave: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    feature_ids?: string[];
  }) => Promise<void>;
  onDelete?: (milestoneId: string) => Promise<void>;
  onSelectMilestone: (milestone: Milestone | null) => void;
}

export function MilestoneModal({
  isOpen,
  onClose,
  milestone,
  milestones,
  featureMilestoneCountMap = {},
  onSave,
  onDelete,
  onSelectMilestone,
}: MilestoneModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<{
    target: Milestone | null;
  } | null>(null);
  // 레일 항목별 오버플로(⋯) 메뉴 — 열려 있는 마일스톤 id
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const isEditMode = !!milestone;

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDescription(milestone.description || "");
      setStartDate(new Date(milestone.start_date));
      setEndDate(new Date(milestone.end_date));
    } else {
      setTitle("");
      setDescription("");
      setStartDate(undefined);
      setEndDate(undefined);
    }
    setDescExpanded(false);
    setPendingSelect(null);
    setMenuFor(null);
  }, [milestone, isOpen]);

  // 세로 타임라인 레일: 시작일 순 정렬
  //  - 오늘이 어떤 마일스톤 기간 안이면 → 그 마일스톤을 "current"로 강조 (구분선 없음)
  //  - 오늘이 마일스톤 사이 공백/이전/이후면 → 그 위치에만 TODAY 구분선
  const today = getTodayDateString();
  // 생성 모드에서 미리보기용 고스트의 시작일 키 (yyyy-MM-dd) — 없으면 맨 끝
  const isCreating = !milestone;
  const ghostStart =
    isCreating && startDate ? format(startDate, "yyyy-MM-dd") : null;
  type RailEntry =
    | { kind: "today" }
    | { kind: "ghost" }
    | { kind: "milestone"; m: Milestone; status: MilestoneStatus };
  const railItems = useMemo<RailEntry[]>(() => {
    const sorted = [...milestones].sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
    );
    // 오늘이 어떤 마일스톤 기간 내부에 있는가?
    const hasCurrent = sorted.some(
      (m) => m.start_date <= today && today <= m.end_date,
    );
    const items: RailEntry[] = [];
    let dividerInserted = false;
    let ghostInserted = false;
    for (const m of sorted) {
      // 생성 중 고스트: 시작일 오름차순에서 자기보다 늦은 첫 항목 앞에 삽입
      if (
        isCreating &&
        !ghostInserted &&
        ghostStart &&
        m.start_date > ghostStart
      ) {
        items.push({ kind: "ghost" });
        ghostInserted = true;
      }
      // 현재 마일스톤이 없을 때만, 오늘보다 늦게 시작하는 첫 항목 앞에 구분선
      if (!hasCurrent && !dividerInserted && m.start_date > today) {
        items.push({ kind: "today" });
        dividerInserted = true;
      }
      items.push({
        kind: "milestone",
        m,
        status: deriveMilestoneStatus(m, today),
      });
    }
    // 오늘이 모든 마일스톤보다 이후 (현재도 없고 삽입도 안 됨) → 맨 아래
    if (!hasCurrent && !dividerInserted) items.push({ kind: "today" });
    // 고스트가 아직 안 들어갔으면 (기간 미정 or 가장 늦은 시작) → 맨 아래
    if (isCreating && !ghostInserted) items.push({ kind: "ghost" });
    return items;
  }, [milestones, today, isCreating, ghostStart]);

  // 피처별 소속 마일스톤 목록 (레일과 동일한 시작일 순 번호 부여)
  //  - "담긴 작업"에서 걸친 피처가 어느 마일스톤들에 있는지 칩으로 표시
  const featureMilestonesMap = useMemo<
    Record<string, Array<{ id: string; order: number; title: string }>>
  >(() => {
    const sorted = [...milestones].sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
    );
    const orderMap: Record<string, number> = {};
    sorted.forEach((m, i) => {
      orderMap[m.id] = i + 1;
    });
    const map: Record<
      string,
      Array<{ id: string; order: number; title: string }>
    > = {};
    for (const m of sorted) {
      if (!m.features) continue;
      for (const f of m.features) {
        (map[f.id] ||= []).push({
          id: m.id,
          order: orderMap[m.id] ?? 0,
          title: m.title,
        });
      }
    }
    return map;
  }, [milestones]);

  const handleSave = async (): Promise<boolean> => {
    // 필수 미충족 시 생성 버튼이 비활성이라 도달할 수 없지만, 안전 가드로 유지
    if (!title.trim() || !startDate || !endDate) {
      return false;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
      });
      return true;
    } catch (error) {
      console.error("Failed to save milestone:", error);
      alert(t("milestone.saveFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // 현재 폼이 원본(또는 새 마일스톤 기준)과 다른지
  const isDirty = (() => {
    const baseTitle = milestone?.title ?? "";
    const baseDesc = milestone?.description ?? "";
    const baseStart = milestone
      ? format(new Date(milestone.start_date), "yyyy-MM-dd")
      : "";
    const baseEnd = milestone
      ? format(new Date(milestone.end_date), "yyyy-MM-dd")
      : "";
    const curStart = startDate ? format(startDate, "yyyy-MM-dd") : "";
    const curEnd = endDate ? format(endDate, "yyyy-MM-dd") : "";
    if (title !== baseTitle) return true;
    if (description !== baseDesc) return true;
    if (curStart !== baseStart) return true;
    if (curEnd !== baseEnd) return true;
    return false;
  })();

  // 필수 입력(제목 + 기간) 충족 여부 — 생성 모드에서 생성 버튼 게이팅
  const hasTitle = title.trim().length > 0;
  const hasPeriod = !!startDate && !!endDate;
  const canCreate = hasTitle && hasPeriod;

  // 다른 마일스톤(또는 새 마일스톤)으로 전환 — 변경사항 있으면 확인 후
  const requestSelect = (target: Milestone | null) => {
    if (isDirty) {
      setPendingSelect({ target });
    } else {
      onSelectMilestone(target);
    }
  };

  const discardAndSelect = () => {
    const target = pendingSelect?.target ?? null;
    setPendingSelect(null);
    onSelectMilestone(target);
  };

  const saveAndSelect = async () => {
    const target = pendingSelect?.target ?? null;
    const ok = await handleSave();
    if (ok) {
      setPendingSelect(null);
      onSelectMilestone(target);
    }
  };

  const handleDelete = async (target: Milestone) => {
    if (!onDelete) return;

    if (!confirm(t("milestone.deleteConfirm"))) return;

    try {
      await onDelete(target.id);
      setMenuFor(null);
      // 선택 중이던 마일스톤을 지웠으면 생성 모드로
      if (milestone?.id === target.id) onSelectMilestone(null);
    } catch (error) {
      console.error("Failed to delete milestone:", error);
      alert(t("milestone.deleteFailed"));
    }
  };

  return (
    <>
      <MotionModal
        open={isOpen}
        onClose={onClose}
        className="sm:max-w-4xl bg-bridge-dark p-0 overflow-hidden flex flex-col max-h-[90dvh]"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-bridge-border bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-foreground">
              {t("milestone.manageTitle", "마일스톤 관리")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 좌측 리스트 + 우측 폼 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측: 세로 타임라인 레일 */}
          <div className="w-56 shrink-0 border-r border-bridge-border flex flex-col bg-white/[0.01]">
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <div className="relative flex flex-col gap-0.5">
                {/* 세로 스파인 */}
                <div
                  className="absolute top-3 bottom-3 w-px bg-bridge-border"
                  style={{ left: 12 }}
                  aria-hidden
                />
                {/* 메뉴 열림 시 바깥 클릭 닫기용 백드롭 */}
                {menuFor && (
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuFor(null)}
                    aria-hidden
                  />
                )}
                {railItems.map((it) => {
                  if (it.kind === "today") {
                    return (
                      <div
                        key="__today__"
                        className="relative flex items-center gap-2.5 py-1"
                      >
                        <span className="grid w-6 place-items-center">
                          <span className="h-0.5 w-3 rounded-full bg-rose-400 ring-2 ring-bridge-dark" />
                        </span>
                        <span className="text-xs font-bold tracking-widest text-rose-400">
                          TODAY
                        </span>
                      </div>
                    );
                  }
                  if (it.kind === "ghost") {
                    return (
                      <GhostRailNode
                        key="__ghost__"
                        title={title}
                        startDate={startDate}
                        endDate={endDate}
                        newLabel={t("milestone.new", "새 마일스톤")}
                        readyLabel={t("milestone.ghostReady", {
                          defaultValue: "생성 준비완료",
                        })}
                        needTitleLabel={t("milestone.ghostNeedTitle", {
                          defaultValue: "제목 필요",
                        })}
                        needPeriodLabel={t("milestone.ghostNeedPeriod", {
                          defaultValue: "기간 필요",
                        })}
                        undatedSubLabel={t("milestone.ghostUndated", {
                          defaultValue: "기간 미정 · 맨 끝",
                        })}
                      />
                    );
                  }
                  const m = it.m;
                  const isSel = milestone?.id === m.id;
                  const isCurrent = it.status === "current";
                  const work = m.progress_percentage || 0;
                  const elapsed = isCurrent ? timeElapsedPercent(m, today) : 0;
                  const menuOpen = menuFor === m.id;
                  return (
                    <div key={m.id} className="group relative">
                      <button
                        onClick={() => requestSelect(m)}
                        className={`relative grid w-full grid-cols-[24px_1fr] items-center gap-2.5 rounded-lg py-2 pr-2 text-left transition-all ${
                          isSel
                            ? "bg-bridge-accent/15 border border-bridge-accent/30"
                            : "border border-transparent hover:bg-bridge-surface-hover"
                        }`}
                      >
                        {/* 현재 마일스톤: 빨강 좌측 액센트 */}
                        {isCurrent && (
                          <span
                            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-rose-400"
                            aria-hidden
                          />
                        )}
                        <span className="justify-self-center">
                          <MilestoneRingNode
                            percent={work}
                            status={it.status}
                            selected={isSel}
                            size={isCurrent ? 30 : 22}
                          />
                        </span>
                        {isCurrent ? (
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 pr-7">
                              <span
                                className={`min-w-0 truncate text-sm font-medium ${
                                  isSel
                                    ? "text-bridge-accent"
                                    : "text-foreground"
                                }`}
                              >
                                {m.title}
                              </span>
                              <span className="shrink-0 rounded-full bg-rose-400/15 px-1.5 py-0.5 text-xs font-bold text-rose-400">
                                {t("milestone.todayBadge", {
                                  defaultValue: "오늘",
                                })}
                              </span>
                              <span className="ml-auto shrink-0 text-xs font-medium text-rose-400 tabular-nums">
                                {dDayLabel(m, today)}
                              </span>
                            </span>
                            {/* 이중 바: 기간 경과(로즈) 위에 작업 진행(그라디언트) — 작업<기간이면 로즈 꼬리로 지연 표시 */}
                            <span className="relative mt-2 block h-1.5 overflow-hidden rounded-full bg-foreground/10">
                              <span
                                className="absolute inset-y-0 left-0 rounded-full bg-rose-400/30"
                                style={{ width: `${elapsed}%` }}
                              />
                              <span
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bridge-secondary to-bridge-accent"
                                style={{ width: `${work}%` }}
                              />
                            </span>
                            <span className="mt-1.5 flex items-center justify-between text-xs font-medium tabular-nums">
                              <span className="text-bridge-accent">
                                {t("milestone.workShort", {
                                  defaultValue: "작업",
                                })}{" "}
                                {work}%
                              </span>
                              <span className="text-rose-400">
                                {t("milestone.elapsedShort", {
                                  defaultValue: "기간",
                                })}{" "}
                                {elapsed}%
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="min-w-0">
                            <span
                              className={`block truncate pr-6 text-sm font-medium ${
                                isSel ? "text-bridge-accent" : "text-foreground"
                              }`}
                            >
                              {m.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 tabular-nums">
                              {format(new Date(m.start_date), "M/d")}~
                              {format(new Date(m.end_date), "M/d")}
                              {isSel && ` · ${work}%`}
                            </span>
                          </span>
                        )}
                      </button>

                      {/* 항목별 오버플로(⋯) — 삭제를 대상 옆으로 */}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor(menuOpen ? null : m.id);
                          }}
                          aria-label={t("common.more", {
                            defaultValue: "더보기",
                          })}
                          className={`absolute right-1.5 top-1.5 z-20 grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-all hover:bg-foreground/10 hover:text-foreground ${
                            menuOpen
                              ? "opacity-100 bg-foreground/10"
                              : "opacity-0 focus:opacity-100 group-hover:opacity-100"
                          }`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      )}
                      {menuOpen && onDelete && (
                        <div className="absolute right-1.5 top-9 z-20 w-32 rounded-xl border border-bridge-border bg-bridge-obsidian p-1 shadow-2xl">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(m);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("common.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 리스트 끝: 새 마일스톤 추가 카드 (편집 중일 때만 노출, 생성 중엔 고스트로 대체) */}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => requestSelect(null)}
                    className="mt-1 grid w-full grid-cols-[24px_1fr] items-center gap-2.5 rounded-lg border border-dashed border-bridge-border py-2.5 pr-2 text-left text-slate-400 transition-all hover:border-bridge-accent hover:bg-bridge-accent/5 hover:text-bridge-accent"
                  >
                    <span className="justify-self-center grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-current">
                      <Plus size={13} />
                    </span>
                    <span className="text-sm font-medium">
                      {t("milestone.addNew", {
                        defaultValue: "새 마일스톤 추가",
                      })}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 우측: 편집 폼 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* 제목 */}
              <div className="space-y-2">
                <label className="kanban-label block">
                  {t("milestone.titleLabel")} *
                </label>
                <div className="relative">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("milestone.titlePlaceholder")}
                    className="bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 focus:border-indigo-500/50 rounded-xl pr-11"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <FieldStatusIcon filled={hasTitle} />
                  </span>
                </div>
              </div>

              {/* 설명 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="kanban-label block">
                    {t("milestone.descriptionLabel")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setDescExpanded(true)}
                    aria-label={t("milestone.descriptionExpand", {
                      defaultValue: "크게 보기",
                    })}
                    title={t("milestone.descriptionExpand", {
                      defaultValue: "크게 보기",
                    })}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("milestone.descriptionPlaceholder")}
                  rows={3}
                  className="bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 resize-none focus:border-indigo-500/50 rounded-xl"
                />
              </div>

              {/* 기간 */}
              <div className="space-y-2">
                <label className="kanban-label block">
                  {t("milestone.periodLabel")} *
                </label>
                <div className="relative">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-10 justify-start text-left font-normal bg-bridge-surface-hover border-foreground/10 text-foreground hover:bg-bridge-surface-hover hover:border-indigo-500/50 rounded-xl pr-11"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                        {startDate && endDate ? (
                          <>
                            {format(startDate, "yyyy. MM. dd.", { locale: ko })}
                            {" ~ "}
                            {format(endDate, "yyyy. MM. dd.", { locale: ko })}
                          </>
                        ) : (
                          <span className="text-slate-400">
                            {t("milestone.selectPeriod")}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-bridge-surface border-bridge-border"
                      align="start"
                    >
                      <Calendar
                        mode="range"
                        selected={{
                          from: startDate,
                          to: endDate,
                        }}
                        onSelect={(range) => {
                          setStartDate(range?.from);
                          setEndDate(range?.to);
                        }}
                        numberOfMonths={2}
                        locale={ko}
                        className="text-foreground"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <FieldStatusIcon filled={hasPeriod} />
                  </span>
                </div>
              </div>

              {/* 담긴 작업 (태스크에서 자동 파생 — 읽기 전용) */}
              {isEditMode && (
                <div className="space-y-2">
                  <label className="kanban-label block">
                    {t("milestone.containedWork", {
                      defaultValue: "담긴 작업",
                    })}
                    <span className="ml-1.5 text-xs font-normal normal-case tracking-normal text-slate-500">
                      ·{" "}
                      {t("milestone.derivedHint", {
                        defaultValue: "태스크 자동 파생",
                      })}
                    </span>
                  </label>
                  {milestone?.features && milestone.features.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto space-y-1 bg-bridge-surface rounded-xl p-2 border border-foreground/10">
                      {milestone.features.map((feature) => {
                        const spanning =
                          (featureMilestoneCountMap[feature.id] || 0) > 1;
                        return (
                          <div
                            key={feature.id}
                            className="flex items-center gap-2 p-2 rounded-lg"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: feature.color }}
                            />
                            <span className="text-sm text-foreground truncate flex-1">
                              {feature.title}
                            </span>
                            {spanning && (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                {(featureMilestonesMap[feature.id] || []).map(
                                  (ms) => {
                                    const isHere = ms.id === milestone?.id;
                                    return (
                                      <span
                                        key={ms.id}
                                        title={ms.title}
                                        className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border px-1.5 text-xs font-bold tabular-nums ${
                                          isHere
                                            ? "border-bridge-accent/50 bg-bridge-accent/20 text-bridge-accent"
                                            : "border-foreground/10 bg-foreground/5 text-slate-400"
                                        }`}
                                      >
                                        {ms.order}
                                      </span>
                                    );
                                  },
                                )}
                              </span>
                            )}
                            <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
                              {feature.completed_tasks}/{feature.total_tasks}
                            </span>
                            <div className="w-14 h-1.5 rounded-full bg-foreground/10 overflow-hidden flex-shrink-0">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-bridge-secondary to-bridge-accent"
                                style={{
                                  width: `${feature.progress_percentage || 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-6 bg-bridge-surface rounded-xl border border-foreground/10">
                      {t("milestone.noContainedWork", {
                        defaultValue:
                          "배정된 태스크가 없습니다. 마일스톤 보드·태스크에서 배정하세요.",
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-between p-5 border-t border-bridge-border bg-white/[0.02]">
              <div className="min-h-[34px] flex items-center">
                {/* 편집 중 변경이 없으면 저장 비활성 이유를 명시 */}
                {isEditMode && !isDirty && (
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-1 w-1 rounded-full bg-slate-500" />
                    {t("milestone.noChanges", {
                      defaultValue: "변경사항 없음",
                    })}
                  </span>
                )}
                {/* 생성 모드: 남은 필수 입력을 안내 */}
                {!isEditMode && !canCreate && (
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-1 w-1 rounded-full bg-bridge-accent" />
                    {t("milestone.requiredHint", {
                      defaultValue: "입력 필요",
                    })}
                    {": "}
                    {[
                      !hasTitle &&
                        t("milestone.titleLabel", { defaultValue: "제목" }),
                      !hasPeriod &&
                        t("milestone.periodLabel", { defaultValue: "기간" }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  className="text-xs font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || (isEditMode ? !isDirty : !canCreate)}
                  className="px-6 py-2.5 bg-white text-black font-bold text-xs rounded-lg tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400 disabled:hover:bg-white/10"
                >
                  {isSaving
                    ? t("milestone.saving")
                    : isEditMode
                      ? t("milestone.saveChanges", {
                          defaultValue: "변경 저장",
                        })
                      : t("common.create")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </MotionModal>

      {/* 설명 전체화면 편집 팝업 (동일 description 상태에 바인딩) */}
      <MotionModal
        open={descExpanded}
        onClose={() => setDescExpanded(false)}
        aria-label={t("milestone.descriptionLabel")}
        className="sm:max-w-3xl bg-bridge-dark p-0 overflow-hidden flex flex-col max-h-[85dvh]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="text-sm font-bold text-foreground">
            {t("milestone.descriptionLabel")}
          </span>
          <button
            type="button"
            onClick={() => setDescExpanded(false)}
            aria-label={t("common.close", { defaultValue: "닫기" })}
            className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <Textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("milestone.descriptionPlaceholder")}
            className="w-full h-[60vh] bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 resize-none focus:border-indigo-500/50 rounded-xl"
          />
        </div>
      </MotionModal>

      {/* 편집 중 다른 마일스톤 전환 시 저장 확인 */}
      <MotionModal
        open={!!pendingSelect}
        onClose={() => setPendingSelect(null)}
        aria-label={t("milestone.unsavedTitle", {
          defaultValue: "저장하지 않은 변경사항",
        })}
        className="sm:max-w-sm bg-bridge-obsidian p-0 overflow-hidden flex flex-col"
      >
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-bold text-foreground">
            {t("milestone.unsavedTitle", {
              defaultValue: "저장하지 않은 변경사항",
            })}
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            {t("milestone.unsavedDesc", {
              defaultValue:
                "이 마일스톤의 변경사항을 저장할까요? 저장하지 않으면 변경 내용이 사라집니다.",
            })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-foreground/[0.08]">
          <button
            type="button"
            onClick={() => setPendingSelect(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("common.cancel", { defaultValue: "취소" })}
          </button>
          <button
            type="button"
            onClick={discardAndSelect}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            {t("milestone.discardAndMove", { defaultValue: "버리고 이동" })}
          </button>
          <button
            type="button"
            onClick={saveAndSelect}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors disabled:opacity-50"
          >
            {t("common.save", { defaultValue: "저장" })}
          </button>
        </div>
      </MotionModal>
    </>
  );
}
