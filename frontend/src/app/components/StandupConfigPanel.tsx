import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { standupConfigAPI } from "../utils/api";
import { StandupConfig } from "../types";
import { formatRelativeTime } from "../utils/dateUtils";

interface StandupConfigPanelProps {
  boardId: string;
  isAdmin: boolean;
  canAccessSlack: boolean;
  hasSlack: boolean;
}

const TIMEZONES = [
  { value: "Asia/Seoul", label: "Asia/Seoul (KST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function utcToLocal(
  utcHour: number,
  utcMinute: number,
  timezone: string,
): { hour: number; minute: number } {
  try {
    const now = new Date();
    const utcDate = new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        utcHour,
        utcMinute,
      ),
    );
    const localStr = utcDate.toLocaleString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const [h, m] = localStr.split(":").map(Number);
    return { hour: h, minute: m };
  } catch {
    return { hour: utcHour, minute: utcMinute };
  }
}

export function StandupConfigPanel({
  boardId,
  isAdmin,
  canAccessSlack,
  hasSlack,
}: StandupConfigPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<StandupConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local form state
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [language, setLanguage] = useState("ko");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await standupConfigAPI.getConfig(boardId);
      if (data) {
        setConfig(data);
        setEnabled(data.enabled);
        setTimezone(data.timezone);
        setLanguage(data.language);
        const local = utcToLocal(
          data.send_hour_utc,
          data.send_minute_utc,
          data.timezone,
        );
        setHour(local.hour);
        setMinute(local.minute);
      }
    } catch {
      // No config yet - use defaults
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (isAdmin && canAccessSlack) {
      fetchConfig();
    } else {
      setIsLoading(false);
    }
  }, [fetchConfig, isAdmin, canAccessSlack]);

  const saveConfig = useCallback(
    async (
      newEnabled: boolean,
      newHour: number,
      newMinute: number,
      newTimezone: string,
      newLanguage: string,
    ) => {
      setIsSaving(true);
      setSaved(false);
      try {
        const data = await standupConfigAPI.upsertConfig(boardId, {
          enabled: newEnabled,
          sendHour: newHour,
          sendMinute: newMinute,
          timezone: newTimezone,
          language: newLanguage,
        });
        if (data) {
          setConfig(data);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error("Failed to save standup config:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [boardId],
  );

  const debouncedSave = useCallback(
    (
      newEnabled: boolean,
      newHour: number,
      newMinute: number,
      newTimezone: string,
      newLanguage: string,
    ) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveConfig(newEnabled, newHour, newMinute, newTimezone, newLanguage);
      }, 800);
    },
    [saveConfig],
  );

  const handleEnabledToggle = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    debouncedSave(newEnabled, hour, minute, timezone, language);
  };

  const handleHourChange = (newHour: number) => {
    setHour(newHour);
    debouncedSave(enabled, newHour, minute, timezone, language);
  };

  const handleMinuteChange = (newMinute: number) => {
    setMinute(newMinute);
    debouncedSave(enabled, hour, newMinute, timezone, language);
  };

  const handleTimezoneChange = (newTz: string) => {
    setTimezone(newTz);
    debouncedSave(enabled, hour, minute, newTz, language);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    debouncedSave(enabled, hour, minute, timezone, newLang);
  };

  // Only show for admin users with Slack access
  if (!isAdmin || !canAccessSlack) return null;
  if (isLoading) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-foreground/10 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-bridge-secondary" />
          <span className="text-xs font-medium text-muted-foreground">
            {t("standupConfig.title")}
          </span>
          {enabled && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-bridge-secondary/20 text-bridge-secondary text-xs font-bold uppercase">
              ON
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isSaving && (
            <Loader2 size={10} className="text-slate-400 animate-spin" />
          )}
          {saved && <CheckCircle size={10} className="text-green-400" />}
          {isOpen ? (
            <ChevronUp size={12} className="text-slate-400" />
          ) : (
            <ChevronDown size={12} className="text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 border-t border-foreground/5 space-y-3">
          <p className="text-xs text-slate-500 pt-2 leading-tight">
            {t("standupConfig.description")}
          </p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("standupConfig.enabled")}
            </span>
            <button
              onClick={handleEnabledToggle}
              disabled={!hasSlack}
              className={`w-8 h-4.5 rounded-full transition-colors relative ${
                !hasSlack
                  ? "bg-foreground/5 cursor-not-allowed opacity-40"
                  : enabled
                    ? "bg-bridge-secondary"
                    : "bg-foreground/10"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {!hasSlack && (
            <p className="text-xs text-amber-400/70">
              {t("standupConfig.requiresSlack")}
            </p>
          )}

          {/* Time settings (only when enabled) */}
          {enabled && hasSlack && (
            <>
              {/* Send time */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
                  {t("standupConfig.sendTime")}
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={hour}
                    onChange={(e) => handleHourChange(Number(e.target.value))}
                    className="bg-foreground/5 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground
                      focus:outline-none focus:ring-1 focus:ring-bridge-secondary/50 appearance-none cursor-pointer"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h} className="bg-bridge-obsidian">
                        {String(h).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 text-xs">:</span>
                  <select
                    value={minute}
                    onChange={(e) => handleMinuteChange(Number(e.target.value))}
                    className="bg-foreground/5 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground
                      focus:outline-none focus:ring-1 focus:ring-bridge-secondary/50 appearance-none cursor-pointer"
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m} className="bg-bridge-obsidian">
                        {String(m).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
                  {t("standupConfig.timezone")}
                </label>
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground
                    focus:outline-none focus:ring-1 focus:ring-bridge-secondary/50 appearance-none cursor-pointer"
                >
                  {TIMEZONES.map((tz) => (
                    <option
                      key={tz.value}
                      value={tz.value}
                      className="bg-bridge-obsidian"
                    >
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
                  {t("standupConfig.language")}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLanguageChange("ko")}
                    className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                      language === "ko"
                        ? "bg-bridge-secondary/20 text-bridge-secondary border border-bridge-secondary/30"
                        : "bg-foreground/5 text-slate-400 border border-foreground/10 hover:bg-foreground/10"
                    }`}
                  >
                    {t("standupConfig.korean")}
                  </button>
                  <button
                    onClick={() => handleLanguageChange("en")}
                    className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                      language === "en"
                        ? "bg-bridge-secondary/20 text-bridge-secondary border border-bridge-secondary/30"
                        : "bg-foreground/5 text-slate-400 border border-foreground/10 hover:bg-foreground/10"
                    }`}
                  >
                    {t("standupConfig.english")}
                  </button>
                </div>
              </div>

              {/* Last sent */}
              {config?.last_sent_at && (
                <div className="text-xs text-slate-500">
                  {t("standupConfig.lastSent")}:{" "}
                  {formatRelativeTime(config.last_sent_at)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
