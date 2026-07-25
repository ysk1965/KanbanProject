import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";

import {
  autoReportAPI,
  type AutoReport,
  type ReportConfig,
} from "../../utils/api";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { AutoReportSettingsPanel } from "../AutoReportSettingsPanel";
import { ReportGallery } from "./ReportGallery";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const pad2 = (n: number) => String(n).padStart(2, "0");

interface BoardReportSpaceProps {
  boardId: string;
  /** 관리자만 설정을 바꿀 수 있다 */
  canManage: boolean;
  boardName?: string;
}

/**
 * 스토리지 '보고서' 탭의 최상위 화면. 갤러리를 기본으로 보여주고,
 * 데이터 소스·발송·보관 설정은 ⚙ 설정 드로어로 접어 둔다.
 */
export function BoardReportSpace({
  boardId,
  canManage,
  boardName,
}: BoardReportSpaceProps) {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    void autoReportAPI
      .getConfig(boardId)
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [boardId]);

  const handleLoaded = useCallback((reports: AutoReport[]) => {
    setCount(reports.length);
  }, []);

  const dailyValue = config?.daily_enabled
    ? `매일 ${pad2(config.daily_hour)}:${pad2(config.daily_minute)}`
    : "꺼짐";
  const weeklyValue = config?.weekly_enabled
    ? `${DAY_LABELS[(config.weekly_day_of_week - 1 + 7) % 7]}요일 ${pad2(
        config.weekly_hour,
      )}:${pad2(config.weekly_minute)}`
    : "꺼짐";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-5 max-w-6xl pb-4">
        {/* 헤더 */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-0">
            {boardName && (
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {boardName}
              </span>
            )}
            <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
              보고서
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              매일 아침 전날 커밋으로 일일 보고서를, 주말에
              칸반·커밋·Confluence를 합쳐 주간 보고서를 만듭니다. 슬랙에는
              요약만 나가고, 자세히 보기 본문은 이 탭에 HTML로 쌓입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className={`ml-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              settingsOpen
                ? "bg-bridge-accent text-white"
                : "bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
            }`}
          >
            <Settings className="w-4 h-4" />
            {settingsOpen ? "설정 닫기" : "설정"}
          </button>
        </div>

        {/* 요약 스탯 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile
            icon={Clock}
            label="다음 일일 보고서"
            value={dailyValue}
            sub={config ? config.timezone : "—"}
            muted={!config?.daily_enabled}
          />
          <StatTile
            icon={CalendarDays}
            label="다음 주간 보고서"
            value={weeklyValue}
            sub="칸반 · 커밋 · Confluence 통합"
            muted={!config?.weekly_enabled}
          />
          <StatTile
            icon={FileText}
            label="보관된 HTML"
            value={count === null ? "…" : `${count}건`}
            sub="이 탭에 자동으로 모임"
          />
        </div>

        {/* ⚙ 설정 드로어 */}
        <AnimatePresence initial={false}>
          {settingsOpen && (
            <motion.div
              key="settings-drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 pt-2 pb-1">
                <AutoReportSettingsPanel
                  boardId={boardId}
                  canManage={canManage}
                  hideIntro
                  hideHistory
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 보관된 보고서 갤러리 */}
        <ReportGallery boardId={boardId} onLoaded={handleLoaded} />
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="relative bg-bridge-obsidian border border-foreground/[0.08] rounded-2xl px-4 py-3.5 overflow-hidden">
      <span
        className={`absolute left-0 inset-y-0 w-[3px] ${
          muted ? "bg-foreground/10" : "bg-bridge-accent"
        }`}
      />
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
        <Icon
          className={`w-3.5 h-3.5 ${muted ? "text-slate-500" : "text-bridge-secondary"}`}
        />
        {label}
      </div>
      <div
        className={`text-base md:text-lg font-bold mt-1.5 ${
          muted ? "text-slate-500" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
