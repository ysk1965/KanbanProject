import { useTranslation } from "react-i18next";

interface OkrConfidenceBadgeProps {
  confidence: string; // ON_TRACK | AT_RISK | OFF_TRACK
  size?: "sm" | "md";
}

const CONFIDENCE_STYLES: Record<string, string> = {
  ON_TRACK: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  AT_RISK: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  OFF_TRACK: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const CONFIDENCE_KEYS: Record<string, string> = {
  ON_TRACK: "okr.confidence.onTrack",
  AT_RISK: "okr.confidence.atRisk",
  OFF_TRACK: "okr.confidence.offTrack",
};

const CONFIDENCE_FALLBACKS: Record<string, string> = {
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  OFF_TRACK: "Off Track",
};

export function OkrConfidenceBadge({ confidence, size = "sm" }: OkrConfidenceBadgeProps) {
  const { t } = useTranslation();
  const style = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.ON_TRACK;
  const label = t(
    CONFIDENCE_KEYS[confidence] || CONFIDENCE_KEYS.ON_TRACK,
    CONFIDENCE_FALLBACKS[confidence] || "On Track",
  );

  return (
    <span
      className={`font-bold rounded-full ${style} ${
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
      }`}
    >
      {label}
    </span>
  );
}
