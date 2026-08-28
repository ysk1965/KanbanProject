import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { mindMapShareAPI } from "../utils/api";
import { fromDateTimeLocalValue } from "../utils/dateUtils";
import type { MindMapShareSettings } from "../types";

interface MindMapShareModalProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
}

/** 서버 UTC ISO → 로컬 기준 yyyy-MM-dd (date input value) */
function toLocalDateValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 옵션 토글 스위치 (FeatureDrawer 스위치 문법) */
function ToggleSwitch({
  on,
  disabled,
  busy,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onToggle}
      className={`relative block w-11 h-6 shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
        on ? "bg-bridge-accent" : "bg-foreground/15"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
      {busy && (
        <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
      )}
    </button>
  );
}

export function MindMapShareModal({
  boardId,
  open,
  onClose,
}: MindMapShareModalProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MindMapShareSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  // 열릴 때마다 현재 설정 조회
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setCopied(false);
    mindMapShareAPI
      .get(boardId)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  const save = useCallback(
    async (key: string, next: MindMapShareSettings) => {
      setSavingKey(key);
      try {
        const saved = await mindMapShareAPI.update(boardId, {
          enabled: next.enabled,
          show_tasks: next.show_tasks,
          show_assignees: next.show_assignees,
          show_memos: next.show_memos,
          expires_at: next.expires_at,
        });
        setSettings(saved);
      } catch {
        setError(true);
      } finally {
        setSavingKey(null);
      }
    },
    [boardId],
  );

  const handleToggle = useCallback(
    (key: "enabled" | "show_tasks" | "show_assignees" | "show_memos") => {
      if (!settings) return;
      void save(key, { ...settings, [key]: !settings[key] });
    },
    [settings, save],
  );

  const handleExpiryChange = useCallback(
    (value: string) => {
      if (!settings) return;
      // 선택한 날짜의 로컬 23:59을 UTC ISO로 변환. 비우면 무기한
      const expiresAt = value ? fromDateTimeLocalValue(`${value}T23:59`) : null;
      void save("expires_at", { ...settings, expires_at: expiresAt });
    },
    [settings, save],
  );

  const handleRotate = useCallback(async () => {
    if (
      !window.confirm(
        t(
          "mindmap.shareRotateConfirm",
          "기존 링크는 즉시 무효화됩니다. 재발급할까요?",
        ),
      )
    ) {
      return;
    }
    setSavingKey("rotate");
    try {
      const saved = await mindMapShareAPI.rotate(boardId);
      setSettings(saved);
      setCopied(false);
    } catch {
      setError(true);
    } finally {
      setSavingKey(null);
    }
  }, [boardId, t]);

  const shareUrl = settings?.share_code
    ? `${window.location.origin}/shared/mindmap/${settings.share_code}`
    : null;

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 무시 */
    }
  }, [shareUrl]);

  const enabled = settings?.enabled ?? false;

  const OPTION_ROWS: Array<{
    key: "show_tasks" | "show_assignees" | "show_memos";
    label: string;
    desc: string;
  }> = [
    {
      key: "show_tasks",
      label: t("mindmap.shareShowTasks", "태스크 목록 표시"),
      desc: t(
        "mindmap.shareShowTasksDesc",
        "피처 아래 태스크 제목을 포함합니다",
      ),
    },
    {
      key: "show_assignees",
      label: t("mindmap.shareShowAssignees", "담당자 표시"),
      desc: t(
        "mindmap.shareShowAssigneesDesc",
        "끄면 담당자 이름이 노출되지 않습니다",
      ),
    },
    {
      key: "show_memos",
      label: t("mindmap.shareShowMemos", "메모 노드 포함"),
      desc: t("mindmap.shareShowMemosDesc", "캔버스의 자유 메모를 포함합니다"),
    },
  ];

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="sm:max-w-md bg-bridge-obsidian p-0 overflow-hidden"
    >
      {/* Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Link2 className="w-4 h-4 text-bridge-accent shrink-0" />
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t("mindmap.shareTitle", "마인드맵 외부 공유")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close", "닫기")}
          className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 바디 */}
      <div className="px-5 pb-5 pt-4">
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : !settings ? (
          <p className="py-8 text-center text-xs text-slate-500">
            {t("mindmap.shareLoadError", "공유 설정을 불러오지 못했습니다")}
          </p>
        ) : (
          <div className="space-y-4">
            {/* 마스터 토글 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-foreground">
                  {t("mindmap.sharePublicLink", "공개 링크")}
                </div>
                <div className="text-xs text-slate-500">
                  {t(
                    "mindmap.sharePublicLinkDesc",
                    "링크가 있는 누구나 로그인 없이 열람할 수 있습니다",
                  )}
                </div>
              </div>
              <ToggleSwitch
                on={enabled}
                busy={savingKey === "enabled"}
                label={t("mindmap.sharePublicLink", "공개 링크")}
                onToggle={() => handleToggle("enabled")}
              />
            </div>

            {/* 링크 + 복사 */}
            {enabled && shareUrl && (
              <div className="flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl px-3 py-2">
                <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-400">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
                >
                  {copied ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied
                    ? t("mindmap.shareCopied", "복사됨")
                    : t("mindmap.shareCopy", "복사")}
                </button>
              </div>
            )}

            {/* 노출 옵션 */}
            <div
              className={`space-y-3 border-t border-foreground/[0.08] pt-4 ${
                enabled ? "" : "opacity-40 pointer-events-none"
              }`}
            >
              {OPTION_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">
                      {row.label}
                    </div>
                    <div className="text-xs text-slate-500">{row.desc}</div>
                  </div>
                  <ToggleSwitch
                    on={settings[row.key]}
                    disabled={!enabled}
                    busy={savingKey === row.key}
                    label={row.label}
                    onToggle={() => handleToggle(row.key)}
                  />
                </div>
              ))}

              {/* 만료일 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {t("mindmap.shareExpiry", "만료일")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t(
                      "mindmap.shareExpiryDesc",
                      "지나면 링크가 자동으로 비활성화됩니다",
                    )}
                  </div>
                </div>
                <input
                  type="date"
                  value={toLocalDateValue(settings.expires_at)}
                  disabled={!enabled}
                  onChange={(e) => handleExpiryChange(e.target.value)}
                  aria-label={t("mindmap.shareExpiry", "만료일")}
                  className="shrink-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-40"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-400">
                {t("mindmap.shareSaveError", "저장에 실패했습니다. 다시 시도해주세요.")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <button
          type="button"
          onClick={handleRotate}
          disabled={!settings?.share_code || savingKey === "rotate"}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingKey === "rotate" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {t("mindmap.shareRotate", "링크 재발급")}
        </button>
        <span className="text-xs text-slate-600">
          {t("common.escToClose", "Esc 닫기")}
        </span>
      </div>
    </MotionModal>
  );
}
