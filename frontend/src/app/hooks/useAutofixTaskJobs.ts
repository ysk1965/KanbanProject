import { useCallback, useEffect, useRef, useState } from "react";
import { jiraAutofixAPI, JiraAutofixJob } from "../utils/api";

/**
 * "내 항목이 지금 어디까지 갔나"를 답하는 훅.
 *
 * <p>맡긴 사람이 진행 상황을 보려고 하단 도크를 열어 큐에서 자기 항목을 찾아야 한다면, 사람들은
 * 확인하지 않는다. 맡긴 자리(카드)에서 바로 보여야 한다.
 *
 * <p><b>진행 중인 작업이 있을 때만 폴링한다.</b> 대부분의 카드에는 자동수정 작업이 아예 없고,
 * 끝난 작업의 상태는 변하지 않는다 — 그런 카드까지 10초마다 서버를 부를 이유가 없다.
 */

const POLL_INTERVAL_MS = 10_000;

/** 아직 결과가 정해지지 않은 상태. 이 중 하나라도 있으면 화면이 곧 바뀐다. */
const LIVE_STATUSES = new Set(["QUEUED", "DISPATCHED"]);

export interface AutofixTaskJobs {
  /** 체크리스트 항목 id → 그 항목의 가장 최근 작업. 재시도하면 이전 작업은 이력이지 현재가 아니다. */
  byChecklistItem: Map<string, JiraAutofixJob>;
  /** 태스크 전체를 맡긴 작업 중 가장 최근 것. */
  taskJob: JiraAutofixJob | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAutofixTaskJobs(
  boardId: string | null | undefined,
  taskId: string | null | undefined,
  enabled = true,
): AutofixTaskJobs {
  const [jobs, setJobs] = useState<JiraAutofixJob[]>([]);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetch = useCallback(async () => {
    if (!boardId || !taskId || !enabled) return;
    setLoading(true);
    try {
      const next = await jiraAutofixAPI.getJobsForTask(boardId, taskId);
      if (mounted.current) setJobs(next ?? []);
    } catch {
      // 상태 칩은 부가 정보다. 못 가져왔다고 카드가 고장 난 것처럼 보이면 안 된다.
      if (mounted.current) setJobs([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [boardId, taskId, enabled]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const hasLive = jobs.some((job) => LIVE_STATUSES.has(job.status));

  useEffect(() => {
    if (!hasLive || !enabled) return;
    timer.current = window.setInterval(() => void fetch(), POLL_INTERVAL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [hasLive, enabled, fetch]);

  /*
   * 서버가 queued_at 내림차순으로 준다. 앞에 오는 것이 최신이므로 먼저 본 것만 남긴다 —
   * 실패 후 다시 맡긴 항목에서 옛 실패 칩이 남아 있으면 화면이 거짓말을 한다.
   */
  const byChecklistItem = new Map<string, JiraAutofixJob>();
  let taskJob: JiraAutofixJob | null = null;
  for (const job of jobs) {
    if (job.checklist_item_id) {
      if (!byChecklistItem.has(job.checklist_item_id)) {
        byChecklistItem.set(job.checklist_item_id, job);
      }
    } else if (!taskJob) {
      taskJob = job;
    }
  }

  return { byChecklistItem, taskJob, loading, refresh: fetch };
}
