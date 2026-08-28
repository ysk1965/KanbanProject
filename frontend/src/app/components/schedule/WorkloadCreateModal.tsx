import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Plus } from "lucide-react";
import { calendarEventAPI } from "../../utils/api";
import { Feature, Milestone } from "../../types";
import { MotionModal } from "../ui/MotionModal";
import { ChecklistCreatePanel } from "./ChecklistCreatePanel";

// 부재 빠른 선택 프리셋 — 라벨이 그대로 내용에 들어간다
const ABSENCE_PRESETS = [
  "🏠 재택",
  "🌴 휴가",
  "⏰ 오전 반차",
  "⏰ 오후 반차",
  "✈️ 출장",
];

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
  /** 부재 탭 표시용 멤버 이름 (assigneeId가 멤버일 때) */
  assigneeName?: string | null;
  contractorId?: string | null;
  startDate: string;
  dueDate: string;
  onCreated: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
// 업무 탭은 공용 ChecklistCreatePanel(마일스톤 칩 → 피처/Task 2열)을 사용하고,
// 부재 탭만 이 컴포넌트가 직접 그린다.

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
  onCreated,
}: WorkloadCreateModalProps) {
  const { t } = useTranslation();

  // 업무 / 부재 탭 (부재는 멤버 행에서만 — assigneeId 있을 때)
  const [tab, setTab] = useState<"task" | "absence">("task");

  // ── 부재 탭 상태 ──
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

  // ── On open: reset ──
  useEffect(() => {
    if (!open) return;
    setTab("task");
    setAbsTitle("");
    setAbsStart(startDate);
    setAbsEnd(dueDate);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── 부재 저장 (calendarEventAPI) ──
  const canSubmitAbsence = absTitle.trim().length > 0 && absDays > 0;

  const handleSubmitAbsence = useCallback(async () => {
    const trimmed = absTitle.trim();
    if (!trimmed || !assigneeId || isSubmitting) return;
    if (absEnd < absStart) {
      setError(t("common.error", "An error occurred"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await calendarEventAPI.create(boardId, {
        event_type: "ABSENCE",
        member_id: assigneeId,
        title: trimmed,
        start_date: absStart,
        end_date: absEnd,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create absence:", err);
      setError(t("common.error", "An error occurred"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    absTitle,
    assigneeId,
    isSubmitting,
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
      if (canSubmitAbsence) handleSubmitAbsence();
    }
  };

  const crumbSep = (
    <span className="text-xs text-slate-500" aria-hidden="true">
      ›
    </span>
  );

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-[720px]"
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
            {tab === "absence"
              ? "부재 추가"
              : t("schedule.workloadCreate.title", "새 업무 추가")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tab === "absence"
              ? "부재 내용과 기간을 입력하세요"
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
            <button
              type="button"
              onClick={() => {
                setTab("absence");
                setTimeout(() => absTitleInputRef.current?.focus(), 50);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                tab === "absence"
                  ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
              }`}
            >
              🚶 부재
            </button>
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

      {tab === "absence" ? (
        /* ── 부재 pane ── */
        <>
          <div className="px-5 pt-4 pb-5 flex flex-col gap-4 sm:min-h-[440px]">
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
                    className="w-8 h-8 rounded-full shrink-0 bg-bridge-secondary/15
                      text-bridge-secondary text-xs font-bold flex items-center justify-center"
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
                    className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                      rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                      focus:ring-2 focus:ring-bridge-secondary/50 transition-all [color-scheme:dark]"
                  />
                  <span className="text-slate-500 text-xs">~</span>
                  <input
                    type="date"
                    value={absEnd}
                    min={absStart}
                    onChange={(e) => setAbsEnd(e.target.value)}
                    className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                      rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                      focus:ring-2 focus:ring-bridge-secondary/50 transition-all [color-scheme:dark]"
                  />
                  <span
                    className="shrink-0 text-xs font-bold px-2 py-1 rounded-full
                      bg-bridge-secondary/15 text-bridge-secondary"
                  >
                    {absDays > 0 ? `${absDays}일` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* 빠른 선택 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                빠른 선택
              </label>
              <div className="flex flex-wrap gap-2">
                {ABSENCE_PRESETS.map((preset) => {
                  const label = preset.replace(/^\S+\s/, "");
                  const active = absTitle.trim() === label;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAbsTitle(label)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        active
                          ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-bridge-secondary"
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
                placeholder="예: 부산 출장 · 오전 반차 · 재택"
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                  py-3 px-4 text-foreground placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-bridge-secondary/50 transition-all"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                워크로드 바에 이 텍스트가 표시됩니다
              </p>
            </div>

            <div className="flex-1" />

            {/* 부재 표시 요약 바 */}
            <div
              className="flex items-center gap-2 flex-wrap border border-bridge-secondary/30
                rounded-xl bg-bridge-secondary/[0.06] px-4 py-2.5"
            >
              <span className="text-xs font-bold text-slate-400 shrink-0">
                부재 표시
              </span>
              <span className="inline-flex items-center gap-1.5 max-w-[170px] text-xs font-bold text-foreground">
                <span className="truncate">
                  🚶 {assigneeName || "이 멤버"}
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
                    <span className="font-bold text-bridge-secondary">
                      {absDays}일간 부재
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

          {/* 부재 Footer */}
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
              onClick={handleSubmitAbsence}
              disabled={!canSubmitAbsence || isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-bridge-secondary
                disabled:opacity-50 disabled:cursor-not-allowed
                hover:bg-bridge-secondary/90 transition-all"
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
