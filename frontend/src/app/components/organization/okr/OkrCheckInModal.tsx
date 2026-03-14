import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Loader2 } from "lucide-react";
import { MotionModal } from "../../ui/MotionModal";
import { okrService } from "../../../utils/services";
import type { OkrObjective, OkrKeyResult } from "../../../types";
import { OkrProgressBar } from "./OkrProgressBar";

interface OkrCheckInModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  krId: string;
  objectives: OkrObjective[];
  onRefresh: () => void;
}

function findKr(
  objectives: OkrObjective[],
  krId: string,
): OkrKeyResult | null {
  for (const obj of objectives) {
    for (const kr of obj.key_results || []) {
      if (kr.id === krId) return kr;
    }
    if (obj.children) {
      const found = findKr(obj.children, krId);
      if (found) return found;
    }
  }
  return null;
}

const CONFIDENCE_OPTIONS = [
  { value: "ON_TRACK", labelKey: "okr.confidence.onTrack", fallback: "On Track" },
  { value: "AT_RISK", labelKey: "okr.confidence.atRisk", fallback: "At Risk" },
  { value: "OFF_TRACK", labelKey: "okr.confidence.offTrack", fallback: "Off Track" },
] as const;

const CONFIDENCE_ACTIVE_STYLES: Record<string, string> = {
  ON_TRACK: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  AT_RISK: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  OFF_TRACK: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

export function OkrCheckInModal({
  open,
  onClose,
  orgId,
  krId,
  objectives,
  onRefresh,
}: OkrCheckInModalProps) {
  const { t } = useTranslation();
  const [newValue, setNewValue] = useState<number | "">("");
  const [confidence, setConfidence] = useState("ON_TRACK");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const kr = findKr(objectives, krId);

  // Reset form when modal opens with a new KR
  const [prevKrId, setPrevKrId] = useState(krId);
  if (krId !== prevKrId) {
    setPrevKrId(krId);
    setNewValue("");
    setConfidence("ON_TRACK");
    setNote("");
  }

  if (!kr) return null;

  const progress =
    kr.target_value === kr.start_value
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            ((kr.current_value - kr.start_value) /
              (kr.target_value - kr.start_value)) *
              100,
          ),
        );

  const handleSubmit = async () => {
    if (newValue === "" || saving) return;
    setSaving(true);
    try {
      await okrService.createCheckIn(orgId, krId, {
        new_value: Number(newValue),
        confidence,
        note: note.trim() || undefined,
      });
      onRefresh();
      onClose();
    } catch (e) {
      console.warn("Failed to create check-in:", e);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const labelClass =
    "text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";

  return (
    <MotionModal open={open} onClose={onClose} accentColor className="sm:max-w-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-xl bg-bridge-secondary/15 flex items-center justify-center">
          <BarChart3 size={16} className="text-bridge-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground truncate">
            {t("okr.addCheckin", "Check-in")}
          </h3>
          <div className="text-xs text-slate-400 truncate">
            {kr.title}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-4">
        {/* KR info summary */}
        <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground truncate">
              {kr.title}
            </span>
            <span className="text-xs font-bold text-bridge-accent shrink-0">
              {kr.current_value}/{kr.target_value}
              {kr.unit ? ` ${kr.unit}` : ""}
            </span>
          </div>
          <OkrProgressBar progress={progress} size="sm" animated={false} />
        </div>

        {/* Previous value (read-only) */}
        <div>
          <label className={labelClass}>
            {t("okr.previousValue", "Previous Value")}
          </label>
          <div className="w-full bg-foreground/[0.03] border border-foreground/[0.06] rounded-xl py-3 px-4 text-sm text-slate-400">
            {kr.current_value}
            {kr.unit ? ` ${kr.unit}` : ""}
          </div>
        </div>

        {/* New value */}
        <div>
          <label className={labelClass}>
            {t("okr.newValue", "New Value")}
          </label>
          <input
            type="number"
            value={newValue}
            onChange={(e) =>
              setNewValue(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder={String(kr.current_value)}
            className={inputClass}
            autoFocus
          />
        </div>

        {/* Confidence */}
        <div>
          <label className={labelClass}>Confidence</label>
          <div className="flex gap-2">
            {CONFIDENCE_OPTIONS.map((opt) => {
              const isActive = confidence === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setConfidence(opt.value)}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                    isActive
                      ? CONFIDENCE_ACTIVE_STYLES[opt.value]
                      : "bg-foreground/5 border-foreground/10 text-slate-400 hover:bg-foreground/10"
                  }`}
                >
                  {t(opt.labelKey, opt.fallback)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className={labelClass}>
            {t("okr.note", "Note")}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("okr.note", "Optional note...")}
            rows={2}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
              text-sm text-foreground placeholder-slate-500 outline-none resize-none
              focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          Esc {t("okr.cancel", "Cancel")}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("okr.cancel", "Cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={newValue === "" || saving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {t("okr.save", "Save")}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
