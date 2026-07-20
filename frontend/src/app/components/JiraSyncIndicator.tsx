import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { jiraAPI, type JiraStatus } from "../utils/api";
import { parseUTCDate, formatRelativeTime } from "../utils/dateUtils";

/**
 * JIRA 동기화 상태 인디케이터 (스프린트 헤더 · JIRA 뷰 전용).
 * 백엔드 pullSync가 2분마다 도는 것을 화면에 드러낸다.
 *  · 대기: 마지막 동기화 상대시각 + 다음 주기까지 카운트다운 링
 *  · 진행: 수동 동기화(클릭) 중 스피너
 *  · 오류: last_error 존재 시 경고 + 재시도
 * 상태 자체는 주기적으로 getStatus를 재조회해 최신 last_synced_at을 반영한다.
 */

// 백엔드 JiraSyncScheduler.pullSync 주기(초)와 일치.
const POLL_SECONDS = 120;
// 상태 재조회 주기(초) — last_synced_at을 최신으로 유지.
const REFETCH_SECONDS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * 6; // r=6

interface Props {
  boardId: string;
  status: JiraStatus;
  onStatusRefetch: (s: JiraStatus | null) => void;
}

export function JiraSyncIndicator({ boardId, status, onStatusRefetch }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const refetchingRef = useRef(false);

  // 1초 틱 — 상대시각/카운트다운 갱신.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refetchStatus = useCallback(async () => {
    if (refetchingRef.current) return;
    refetchingRef.current = true;
    try {
      const fresh = await jiraAPI.getStatus(boardId);
      onStatusRefetch(fresh);
    } catch {
      /* 일시 실패는 다음 주기에 복구 */
    } finally {
      refetchingRef.current = false;
    }
  }, [boardId, onStatusRefetch]);

  // 주기적 상태 재조회 — 서버측 폴링 결과(last_synced_at)를 반영.
  useEffect(() => {
    const id = setInterval(refetchStatus, REFETCH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [refetchStatus]);

  // 수동 동기화 — 지금 즉시 pull.
  const handleSyncNow = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (syncing) return;
      setSyncing(true);
      try {
        await jiraAPI.importIssues(boardId);
        await refetchStatus();
      } catch {
        await refetchStatus(); // last_error가 반영됨
      } finally {
        setSyncing(false);
      }
    },
    [boardId, syncing, refetchStatus],
  );

  const lastSyncedDate = parseUTCDate(status.last_synced_at);
  const hasError = !!status.last_error || status.status === "ERROR";

  // 다음 주기까지 남은 초 (0~POLL_SECONDS로 clamp).
  let remainingSec = POLL_SECONDS;
  if (lastSyncedDate) {
    const nextMs = lastSyncedDate.getTime() + POLL_SECONDS * 1000;
    remainingSec = Math.max(0, Math.round((nextMs - nowMs) / 1000));
  }
  const fraction = Math.max(0, Math.min(1, remainingSec / POLL_SECONDS));
  const dashOffset = RING_CIRCUMFERENCE * (1 - fraction);
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");

  // ── 오류 상태 ──
  if (hasError && !syncing) {
    return (
      <button
        type="button"
        onClick={handleSyncNow}
        title={status.last_error || "JIRA 동기화 실패 — 클릭하면 재시도"}
        aria-label="JIRA 동기화 실패, 재시도"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
          border border-amber-500/40 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400
          hover:bg-amber-500/[0.14] transition-colors whitespace-nowrap shrink-0
          focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="font-bold">동기화 실패</span>
        <span className="underline underline-offset-2">재시도</span>
      </button>
    );
  }

  // ── 진행 상태 ──
  if (syncing) {
    return (
      <span
        title="JIRA 동기화 중"
        aria-label="JIRA 동기화 중"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
          border border-bridge-accent/40 bg-bridge-accent/[0.12] text-bridge-accent
          whitespace-nowrap shrink-0"
      >
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span className="font-bold">동기화 중…</span>
      </span>
    );
  }

  // ── 대기 상태 (카운트다운 링) ──
  const relative = lastSyncedDate ? formatRelativeTime(lastSyncedDate) : null;
  return (
    <button
      type="button"
      onClick={handleSyncNow}
      title={
        relative
          ? `마지막 동기화 ${relative} · 다음 ${mm}:${ss} · 클릭하면 지금 동기화`
          : "클릭하면 지금 JIRA 동기화"
      }
      aria-label={
        relative ? `JIRA 마지막 동기화 ${relative}` : "JIRA 동기화 대기"
      }
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
        border border-foreground/10 bg-foreground/[0.04] text-slate-400
        hover:bg-foreground/[0.08] hover:text-foreground transition-colors whitespace-nowrap shrink-0
        focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
    >
      <svg
        className="w-3.5 h-3.5 shrink-0 -rotate-90"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          strokeWidth="2.2"
          className="stroke-foreground/15"
        />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="stroke-bridge-secondary"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="font-bold text-foreground">
        {relative ?? "동기화 대기"}
      </span>
      {lastSyncedDate && (
        <span className="text-slate-500 tabular-nums">
          · 다음 {mm}:{ss}
        </span>
      )}
    </button>
  );
}
