import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Flag,
  Calendar as CalendarIcon,
  Plus,
  Check,
  Maximize2,
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
type MilestoneStatus = "done" | "active" | "risk" | "todo";

// 상태별 링 색 (완료=emerald, 진행=bridge-accent, 지연=amber, 예정=hollow)
const RING_COLOR: Record<MilestoneStatus, string> = {
  done: "#34d399",
  active: "#6366f1",
  risk: "#fbbf24",
  todo: "#64748b",
};

// 진행률 + 기간(오늘 기준)으로 마일스톤 상태 파생
function deriveMilestoneStatus(
  m: { start_date: string; end_date: string; progress_percentage: number },
  today: string,
): MilestoneStatus {
  if (m.progress_percentage >= 100) return "done";
  if (m.start_date > today) return "todo"; // 아직 시작 전
  if (m.end_date < today) return "risk"; // 기간 지났는데 미완료
  return "active"; // 진행 중
}

function MilestoneRingNode({
  percent,
  status,
  selected,
}: {
  percent: number;
  status: MilestoneStatus;
  selected?: boolean;
}) {
  const R = 8;
  const CIRC = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, percent));
  const color = RING_COLOR[status];
  const isDone = status === "done";
  return (
    <span
      className="relative grid place-items-center rounded-full bg-bridge-dark"
      style={{ width: 22, height: 22 }}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
        <circle
          cx="11"
          cy="11"
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth="3"
        />
        {pct > 0 && (
          <circle
            cx="11"
            cy="11"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
          />
        )}
      </svg>
      {isDone && (
        <Check
          className="absolute h-3 w-3"
          strokeWidth={3.5}
          style={{ color }}
        />
      )}
      {selected && !isDone && (
        <span
          className="absolute rounded-full"
          style={{ width: 5, height: 5, background: color }}
        />
      )}
    </span>
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
  }, [milestone, isOpen]);

  // 세로 타임라인 레일: 시작일 순 정렬 + TODAY 마커 삽입
  const today = getTodayDateString();
  const railItems = useMemo<
    Array<
      { today: true } | { today?: false; m: Milestone; status: MilestoneStatus }
    >
  >(() => {
    const sorted = [...milestones].sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
    );
    const items: Array<
      { today: true } | { today?: false; m: Milestone; status: MilestoneStatus }
    > = [];
    let todayInserted = false;
    for (const m of sorted) {
      if (!todayInserted && m.end_date >= today) {
        items.push({ today: true });
        todayInserted = true;
      }
      items.push({ m, status: deriveMilestoneStatus(m, today) });
    }
    if (!todayInserted) items.push({ today: true });
    return items;
  }, [milestones, today]);

  const handleSave = async (): Promise<boolean> => {
    if (!title.trim() || !startDate || !endDate) {
      alert(t("milestone.requiredFields"));
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

  const handleDelete = async () => {
    if (!milestone || !onDelete) return;

    if (!confirm(t("milestone.deleteConfirm"))) return;

    try {
      await onDelete(milestone.id);
      onSelectMilestone(null);
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
                {railItems.map((it) =>
                  it.today ? (
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
                  ) : (
                    <button
                      key={it.m.id}
                      onClick={() => requestSelect(it.m)}
                      className={`relative grid grid-cols-[24px_1fr] items-center gap-2.5 rounded-lg py-2 pr-2 text-left transition-all ${
                        milestone?.id === it.m.id
                          ? "bg-bridge-accent/15 border border-bridge-accent/30"
                          : "border border-transparent hover:bg-bridge-surface-hover"
                      }`}
                    >
                      <span className="justify-self-center">
                        <MilestoneRingNode
                          percent={it.m.progress_percentage || 0}
                          status={it.status}
                          selected={milestone?.id === it.m.id}
                        />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block truncate text-sm font-medium ${
                            milestone?.id === it.m.id
                              ? "text-bridge-accent"
                              : "text-foreground"
                          }`}
                        >
                          {it.m.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 tabular-nums">
                          {format(new Date(it.m.start_date), "M/d")}~
                          {format(new Date(it.m.end_date), "M/d")}
                          {milestone?.id === it.m.id &&
                            ` · ${it.m.progress_percentage || 0}%`}
                        </span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="p-2 border-t border-bridge-border">
              <button
                onClick={() => requestSelect(null)}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  !milestone
                    ? "bg-bridge-accent text-white"
                    : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                }`}
              >
                <Plus size={14} />
                {t("milestone.new", "새 마일스톤")}
              </button>
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
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("milestone.titlePlaceholder")}
                  className="bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 focus:border-indigo-500/50 rounded-xl"
                />
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-10 justify-start text-left font-normal bg-bridge-surface-hover border-foreground/10 text-foreground hover:bg-bridge-surface-hover hover:border-indigo-500/50 rounded-xl"
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
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 flex-shrink-0">
                                ⑂{" "}
                                {t("milestone.spanningShort", {
                                  defaultValue: "걸침",
                                })}
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
              <div>
                {isEditMode && onDelete && (
                  <Button
                    variant="ghost"
                    onClick={handleDelete}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    {t("common.delete")}
                  </Button>
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
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-white text-black font-bold text-xs rounded-lg tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving
                    ? t("milestone.saving")
                    : isEditMode
                      ? t("common.edit")
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
