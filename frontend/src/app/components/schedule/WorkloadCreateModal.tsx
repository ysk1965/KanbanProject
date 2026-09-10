import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Plus } from "lucide-react";
import { calendarEventAPI } from "../../utils/api";
import { Feature, Milestone } from "../../types";
import { MotionModal } from "../ui/MotionModal";
import { ChecklistCreatePanel } from "./ChecklistCreatePanel";
import { expandDateRange } from "../../utils/workloadBar";

// 빠른 선택 프리셋 — 이모지를 뗀 라벨이 그대로 내용에 들어간다
const ABSENCE_PRESETS = [
  "🏠 재택",
  "🌴 휴가",
  "⏰ 오전 반차",
  "⏰ 오후 반차",
  "✈️ 출장",
];
const HOLIDAY_WORK_PRESETS = [
  "🛠 휴일근무",
  "⏰ 오전만",
  "⏰ 오후만",
  "🏠 휴일 재택",
];

/** 개인 일정 탭 — 부재(근무일인데 없음) / 휴일근무(비근무일인데 있음) */
type MemberTab = "absence" | "holidayWork";
type Tab = "task" | MemberTab;

/** 탭별 문구·프리셋·색. 휴일근무는 보드 근무일과 같은 초록으로 "근무" 의미를 통일 */
const MEMBER_TAB_META: Record<
  MemberTab,
  {
    eventType: string;
    icon: string;
    label: string;
    subtitle: string;
    presets: string[];
    placeholder: string;
    summaryLabel: string;
    summaryUnit: string;
    // Tailwind는 정적 클래스만 인식하므로 색 변형을 통째로 둔다
    tabActive: string;
    chipActive: string;
    ring: string;
    badge: string;
    summaryBox: string;
    summaryStrong: string;
    submit: string;
  }
> = {
  absence: {
    eventType: "ABSENCE",
    icon: "🚶",
    label: "부재",
    subtitle: "부재 내용과 기간을 입력하세요",
    presets: ABSENCE_PRESETS,
    placeholder: "예: 부산 출장 · 오전 반차 · 재택",
    summaryLabel: "부재 표시",
    summaryUnit: "일간 부재",
    tabActive:
      "border-bridge-secondary/60 bg-bridge-secondary/15 text-foreground",
    chipActive:
      "border-bridge-secondary/60 bg-bridge-secondary/15 text-bridge-secondary",
    ring: "focus:ring-bridge-secondary/50",
    badge: "bg-bridge-secondary/15 text-bridge-secondary",
    summaryBox: "border-bridge-secondary/30 bg-bridge-secondary/[0.06]",
    summaryStrong: "text-bridge-secondary",
    submit: "bg-bridge-secondary hover:bg-bridge-secondary/90",
  },
  holidayWork: {
    eventType: "HOLIDAY_WORK",
    icon: "🛠",
    label: "휴일근무",
    subtitle: "주말·휴일에 이 멤버만 근무하는 날을 등록합니다",
    presets: HOLIDAY_WORK_PRESETS,
    placeholder: "예: 빌드 대응 · 오전만 · 휴일 재택",
    summaryLabel: "근무 표시",
    summaryUnit: "일간 휴일근무",
    tabActive: "border-emerald-500/60 bg-emerald-500/15 text-foreground",
    chipActive:
      "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    ring: "focus:ring-emerald-500/50",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    summaryBox: "border-emerald-500/30 bg-emerald-500/[0.06]",
    summaryStrong: "text-emerald-600 dark:text-emerald-400",
    submit: "bg-emerald-500 hover:bg-emerald-500/90",
  },
};

// "MM.DD" 축약
function fmtShort(date: string): string {
  return date.slice(5).replace("-", ".");
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface WorkloadCreateModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  features: Feature[];
  milestones: Milestone[];
  assigneeId?: string | null;
  /** 개인 일정 탭 표시용 멤버 이름 (assigneeId가 멤버일 때) */
  assigneeName?: string | null;
  contractorId?: string | null;
  startDate: string;
  dueDate: string;
  /**
   * 보드 달력 기준 비근무일(주말·휴무일·공휴일) 판정.
   * 드래그 범위가 전부 비근무일이면 휴일근무 탭을 먼저 열고, 평일이 섞이면 안내를 띄운다.
   */
  isOffDay?: (dateStr: string) => boolean;
  onCreated: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
// 업무 탭은 공용 ChecklistCreatePanel(마일스톤 칩 → 피처/Task 2열)을 사용하고,
// 개인 일정 탭(부재/휴일근무)만 이 컴포넌트가 직접 그린다.

export function WorkloadCreateModal({
  open,
  onClose,
  boardId,
  features,
  milestones,
  assigneeId,
  assigneeName,
  contractorId,
  startDate,
  dueDate,
  isOffDay,
  onCreated,
}: WorkloadCreateModalProps) {
  const { t } = useTranslation();

  // 업무 / 부재 / 휴일근무 탭 (개인 일정은 멤버 행에서만 — assigneeId 있을 때)
  const [tab, setTab] = useState<Tab>("task");

  // ── 개인 일정 탭 상태 (부재·휴일근무 공용) ──
  const [absTitle, setAbsTitle] = useState("");
  const [absStart, setAbsStart] = useState(startDate);
  const [absEnd, setAbsEnd] = useState(dueDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const absTitleInputRef = useRef<HTMLInputElement>(null);

  const absDays = useMemo(() => {
    const a = Date.parse(absStart);
    const b = Date.parse(absEnd);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }, [absStart, absEnd]);

  // 기간 중 비근무일/평일 수 — 기본 탭 결정과 안내 문구용
  const { offCount, weekdayCount } = useMemo(() => {
    if (!isOffDay || absDays <= 0) return { offCount: 0, weekdayCount: 0 };
    let off = 0;
    for (const ds of expandDateRange(absStart, absEnd)) {
      if (isOffDay(ds)) off += 1;
    }
    return { offCount: off, weekdayCount: absDays - off };
  }, [isOffDay, absStart, absEnd, absDays]);

  // ── On open: reset. 드래그 범위가 전부 비근무일이면 휴일근무 탭을 먼저 연다 ──
  useEffect(() => {
    if (!open) return;
    let initialTab: Tab = "task";
    if (assigneeId && isOffDay && startDate && dueDate) {
      const days = expandDateRange(startDate, dueDate);
      if (days.length > 0 && days.every((ds) => isOffDay(ds))) {
        initialTab = "holidayWork";
      }
    }
    setTab(initialTab);
    setAbsTitle(initialTab === "holidayWork" ? "휴일근무" : "");
    setAbsStart(startDate);
    setAbsEnd(dueDate);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const memberTab: MemberTab | null =
    tab === "absence" || tab === "holidayWork" ? tab : null;
  const tabMeta = memberTab ? MEMBER_TAB_META[memberTab] : null;

  const switchMemberTab = (next: MemberTab) => {
    setTab(next);
    setError(null);
    // 프리셋 라벨은 탭 간 의미가 달라 비우고, 휴일근무는 기본 내용을 채워 둔다
    setAbsTitle(next === "holidayWork" ? "휴일근무" : "");
    setTimeout(() => absTitleInputRef.current?.focus(), 50);
  };

  // ── 개인 일정 저장 (calendarEventAPI) ──
  const canSubmitMember = absTitle.trim().length > 0 && absDays > 0;

  const handleSubmitMember = useCallback(async () => {
    const trimmed = absTitle.trim();
    if (!trimmed || !assigneeId || isSubmitting || !tabMeta) return;
    if (absEnd < absStart) {
      setError(t("common.error", "An error occurred"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await calendarEventAPI.create(boardId, {
        event_type: tabMeta.eventType,
        member_id: assigneeId,
        title: trimmed,
        start_date: absStart,
        end_date: absEnd,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create member calendar event:", err);
      const code = (err as { code?: string } | null)?.code;
      setError(
        code === "CE002"
          ? "같은 기간에 이미 부재 또는 휴일근무가 등록되어 있어요"
          : t("common.error", "An error occurred"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    absTitle,
    assigneeId,
    isSubmitting,
    tabMeta,
    absStart,
    absEnd,
    boardId,
    onCreated,
    onClose,
    t,
  ]);

  const handleAbsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmitMember) handleSubmitMember();
    }
  };

  const crumbSep = (
    <span className="text-xs text-slate-500" aria-hidden="true">
      ›
    </span>
  );

  // 기간 성격 안내 — 휴일근무에 평일이 섞였거나, 부재가 전부 비근무일인 경우
  const rangeHint = (() => {
    if (!memberTab || !isOffDay || absDays <= 0) return null;
    if (memberTab === "holidayWork" && weekdayCount > 0) {
      return {
        tone: "warn" as const,
        text: `평일 ${weekdayCount}일이 포함되어 있어요. 휴일근무는 주말·휴일에만 표시됩니다.`,
      };
    }
    if (memberTab === "absence" && offCount === absDays) {
      return {
        tone: "info" as const,
        text: "주말·휴일만 포함된 기간이에요. 휴일근무를 등록하려던 게 아닌가요?",
      };
    }
    return null;
  })();

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-[840px]"
      accentColor
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Plus
          className="w-5 h-5 text-bridge-accent shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            {tabMeta
              ? `${tabMeta.label} 추가`
              : t("schedule.workloadCreate.title", "새 업무 추가")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tabMeta
              ? tabMeta.subtitle
              : t(
                  "schedule.workloadCreate.subtitle",
                  "추가할 위치를 선택하세요",
                )}
          </p>
        </div>
        {assigneeId && (
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setTab("task")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                tab === "task"
                  ? "border-bridge-accent/60 bg-bridge-accent/15 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
              }`}
            >
              <Plus size={12} /> 업무
            </button>
            {(["absence", "holidayWork"] as MemberTab[]).map((key) => {
              const m = MEMBER_TAB_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchMemberTab(key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    tab === key
                      ? m.tabActive
                      : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={onClose}
          aria-label={t("common.close", "Close")}
          className="p-1 rounded-lg text-slate-500 hover:text-foreground
            hover:bg-foreground/5 transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {tabMeta ? (
        /* ── 개인 일정 pane (부재 / 휴일근무) ── */
        <>
          <div className="px-5 pt-4 pb-5 flex flex-col gap-4 sm:min-h-[540px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 대상 멤버 */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                  대상 멤버
                </label>
                <div
                  className="flex items-center gap-2.5 px-3 py-2 bg-foreground/[0.03]
                    border border-foreground/10 rounded-xl"
                >
                  <span
                    className={`w-8 h-8 rounded-full shrink-0 text-xs font-bold flex items-center justify-center ${tabMeta.badge}`}
                  >
                    {(assigneeName || "?").slice(0, 1)}
                  </span>
                  <span className="text-xs font-bold text-foreground truncate">
                    {assigneeName || "이 멤버"}
                  </span>
                </div>
              </div>

              {/* 기간 */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                  기간
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={absStart}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAbsStart(v);
                      if (absEnd < v) setAbsEnd(v);
                    }}
                    className={`flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                      rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                      focus:ring-2 ${tabMeta.ring} transition-all [color-scheme:dark]`}
                  />
                  <span className="text-slate-500 text-xs">~</span>
                  <input
                    type="date"
                    value={absEnd}
                    min={absStart}
                    onChange={(e) => setAbsEnd(e.target.value)}
                    className={`flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                      rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                      focus:ring-2 ${tabMeta.ring} transition-all [color-scheme:dark]`}
                  />
                  <span
                    className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full ${tabMeta.badge}`}
                  >
                    {absDays > 0 ? `${absDays}일` : "—"}
                  </span>
                </div>
                {rangeHint && (
                  <p
                    className={`text-xs mt-1.5 ${
                      rangeHint.tone === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-500"
                    }`}
                  >
                    {rangeHint.text}
                  </p>
                )}
              </div>
            </div>

            {/* 빠른 선택 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                빠른 선택
              </label>
              <div className="flex flex-wrap gap-2">
                {tabMeta.presets.map((preset) => {
                  const label = preset.replace(/^\S+\s/, "");
                  const active = absTitle.trim() === label;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAbsTitle(label)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        active
                          ? tabMeta.chipActive
                          : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 내용 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                내용
              </label>
              <input
                ref={absTitleInputRef}
                type="text"
                value={absTitle}
                onChange={(e) => setAbsTitle(e.target.value)}
                onKeyDown={handleAbsKeyDown}
                placeholder={tabMeta.placeholder}
                className={`w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                  py-3 px-4 text-foreground placeholder-slate-500
                  focus:outline-none focus:ring-2 ${tabMeta.ring} transition-all`}
              />
              <p className="text-xs text-slate-500 mt-1.5">
                워크로드 바에 이 텍스트가 표시됩니다
              </p>
            </div>

            <div className="flex-1" />

            {/* 표시 요약 바 */}
            <div
              className={`flex items-center gap-2 flex-wrap border rounded-xl px-4 py-2.5 ${tabMeta.summaryBox}`}
            >
              <span className="text-xs font-bold text-slate-400 shrink-0">
                {tabMeta.summaryLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 max-w-[170px] text-xs font-bold text-foreground">
                <span className="truncate">
                  {tabMeta.icon} {assigneeName || "이 멤버"}
                </span>
              </span>
              {crumbSep}
              <span
                className={`text-xs font-bold truncate max-w-[170px] ${
                  absTitle.trim() ? "text-foreground" : "text-slate-500"
                }`}
              >
                {absTitle.trim() || "내용 입력"}
              </span>
              {crumbSep}
              <span className="text-xs font-bold text-foreground">
                {fmtShort(absStart)} ~ {fmtShort(absEnd)}
              </span>
              <span className="text-xs text-slate-500">
                {absDays > 0 ? (
                  <>
                    —{" "}
                    <span className={`font-bold ${tabMeta.summaryStrong}`}>
                      {absDays}
                      {tabMeta.summaryUnit}
                    </span>
                    로 표시됩니다
                  </>
                ) : (
                  "— 종료일이 시작일보다 빠릅니다"
                )}
              </span>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* 개인 일정 Footer */}
          <div className="flex items-center gap-2.5 px-5 py-3 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-500 flex-1">
              Esc {t("schedule.workloadCreate.cancel", "취소")}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-foreground
                bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all"
            >
              {t("schedule.workloadCreate.cancel", "취소")}
            </button>
            <button
              onClick={handleSubmitMember}
              disabled={!canSubmitMember || isSubmitting}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-all ${tabMeta.submit}`}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("schedule.workloadCreate.submit", "추가")
              )}
            </button>
          </div>
        </>
      ) : (
        /* ── 업무 pane: 공용 생성 패널 ── */
        <ChecklistCreatePanel
          open={open && tab === "task"}
          boardId={boardId}
          features={features}
          milestones={milestones}
          assigneeId={assigneeId}
          contractorId={contractorId}
          startDate={startDate}
          dueDate={dueDate}
          onCreated={() => {
            onCreated();
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </MotionModal>
  );
}
