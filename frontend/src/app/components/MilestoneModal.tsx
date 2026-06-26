import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Flag,
  Calendar as CalendarIcon,
  Plus,
  ChevronRight,
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

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: Milestone | null;
  milestones: Milestone[];
  features: Feature[];
  featureMilestoneCountMap?: Record<string, number>;
  featurePrimaryMilestoneMap?: Record<string, string>;
  onSetPrimaryFeature?: (featureId: string) => void | Promise<void>;
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
  features,
  featureMilestoneCountMap = {},
  featurePrimaryMilestoneMap = {},
  onSetPrimaryFeature,
  onSave,
  onDelete,
  onSelectMilestone,
}: MilestoneModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(
    new Set(),
  );
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
      setSelectedFeatureIds(
        new Set(milestone.features?.map((f) => f.id) || []),
      );
    } else {
      setTitle("");
      setDescription("");
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedFeatureIds(new Set());
    }
    setDescExpanded(false);
    setPendingSelect(null);
  }, [milestone, isOpen]);

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
        feature_ids: Array.from(selectedFeatureIds),
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
    const baseFeat = new Set(milestone?.features?.map((f) => f.id) ?? []);
    const curStart = startDate ? format(startDate, "yyyy-MM-dd") : "";
    const curEnd = endDate ? format(endDate, "yyyy-MM-dd") : "";
    if (title !== baseTitle) return true;
    if (description !== baseDesc) return true;
    if (curStart !== baseStart) return true;
    if (curEnd !== baseEnd) return true;
    if (selectedFeatureIds.size !== baseFeat.size) return true;
    for (const id of selectedFeatureIds) if (!baseFeat.has(id)) return true;
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

  const toggleFeature = (featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  // 현재 마일스톤에 이미 저장된 링크의 대표 여부 (featureId → is_primary)
  const persistedLinkPrimary = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const f of milestone?.features ?? []) map.set(f.id, f.is_primary);
    return map;
  }, [milestone]);

  // Feature 정렬: 현재 마일스톤 연결 우선 → 연결 수 적은 순
  const sortedFeatures = useMemo(() => {
    return [...features].sort((a, b) => {
      const aSelected = selectedFeatureIds.has(a.id) ? 0 : 1;
      const bSelected = selectedFeatureIds.has(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      const aCount = featureMilestoneCountMap[a.id] || 0;
      const bCount = featureMilestoneCountMap[b.id] || 0;
      return aCount - bCount;
    });
  }, [features, selectedFeatureIds, featureMilestoneCountMap]);

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
          {/* 좌측: 마일스톤 리스트 */}
          <div className="w-56 shrink-0 border-r border-bridge-border flex flex-col bg-white/[0.01]">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {milestones.map((ms) => (
                <button
                  key={ms.id}
                  onClick={() => requestSelect(ms)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
                    milestone?.id === ms.id
                      ? "bg-bridge-accent/15 border border-bridge-accent/30"
                      : "hover:bg-bridge-surface-hover border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium truncate ${
                        milestone?.id === ms.id
                          ? "text-bridge-accent"
                          : "text-foreground"
                      }`}
                    >
                      {ms.title}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`shrink-0 ${
                        milestone?.id === ms.id
                          ? "text-bridge-accent"
                          : "text-zinc-600 group-hover:text-zinc-400"
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-500">
                      {format(new Date(ms.start_date), "M/d")} ~{" "}
                      {format(new Date(ms.end_date), "M/d")}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {ms.feature_count || ms.features?.length || 0}
                      {t("milestone.featureUnit", "개")}
                    </span>
                  </div>
                  {/* 진행률 바 */}
                  <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-full transition-all"
                      style={{ width: `${ms.progress_percentage || 0}%` }}
                    />
                  </div>
                </button>
              ))}
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

              {/* Feature 연결 */}
              <div className="space-y-2">
                <label className="kanban-label block">
                  {t("milestone.linkedFeatures")}
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 bg-bridge-surface rounded-xl p-2 border border-foreground/10">
                  {sortedFeatures.length > 0 ? (
                    sortedFeatures.map((feature) => {
                      const milestoneCount =
                        featureMilestoneCountMap[feature.id] || 0;
                      // 이 마일스톤에 저장된 링크의 대표 여부 (미저장이면 undefined)
                      const persistedPrimary = persistedLinkPrimary.get(
                        feature.id,
                      );
                      const isPrimaryHere = persistedPrimary === true;
                      // 이 마일스톤에 저장됐지만 대표가 아니며, 대표가 다른 마일스톤인 경우 = 이어짐
                      const primaryMsId = featurePrimaryMilestoneMap[feature.id];
                      const isContinuationHere =
                        persistedPrimary === false &&
                        !!primaryMsId &&
                        primaryMsId !== milestone?.id;
                      return (
                        <label
                          key={feature.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-bridge-surface-hover cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFeatureIds.has(feature.id)}
                            onChange={() => toggleFeature(feature.id)}
                            className="w-4 h-4 rounded border-foreground/10 bg-bridge-obsidian text-indigo-500 focus:ring-indigo-500"
                          />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: feature.color }}
                          />
                          <span className="text-sm text-foreground truncate flex-1">
                            {feature.title}
                          </span>
                          {isPrimaryHere && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent flex-shrink-0">
                              {t("milestone.primaryBadge", {
                                defaultValue: "대표",
                              })}
                            </span>
                          )}
                          {isContinuationHere && (
                            <>
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
                                {t("milestone.continuationBadge", {
                                  defaultValue: "이어짐",
                                })}
                              </span>
                              {onSetPrimaryFeature && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSetPrimaryFeature(feature.id);
                                  }}
                                  className="text-xs font-medium text-slate-400 hover:text-bridge-accent flex-shrink-0 transition-colors"
                                >
                                  {t("milestone.setPrimary", {
                                    defaultValue: "대표로 지정",
                                  })}
                                </button>
                              )}
                            </>
                          )}
                          {!isPrimaryHere &&
                            !isContinuationHere &&
                            milestoneCount > 0 && (
                              <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
                                {t("milestone.linkedCount", {
                                  count: milestoneCount,
                                })}
                              </span>
                            )}
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-4">
                      {t("milestone.noFeatures")}
                    </p>
                  )}
                </div>
              </div>
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
