import { useCallback, useEffect, useRef, useState } from "react";
import { jiraAutofixAPI, JiraAutofixQueueStatus } from "../utils/api";

/**
 * "지금 맥에 맡길 수 있나"를 답하는 훅.
 *
 * <p>더보기 메뉴는 항목 밑에 러너 상태 한 줄을 띄우고, 위임 모달은 같은 값으로 입력을 막는다.
 * 도크는 이미 같은 엔드포인트를 10초마다 폴링하고 있으므로, 카드가 그걸 또 부르면 한 화면에서
 * 폴링이 둘 돈다. 짧은 캐시로 중복 호출을 흡수한다.
 *
 * <p>진입점(메뉴)은 상시 열려 있을 수 있어 폴링하지 않는다 — 필요할 때 부르고, 캐시가 신선하면
 * 그대로 쓴다. 모달을 열 때 `refresh()`로 한 번 당겨오면 그게 판단 시점의 값이다.
 */

const CACHE_TTL_MS = 15_000;

type CacheEntry = { at: number; status: JiraAutofixQueueStatus | null };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<JiraAutofixQueueStatus | null>>();

async function load(boardId: string, force: boolean) {
  const hit = cache.get(boardId);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.status;

  const pending = inflight.get(boardId);
  if (pending) return pending;

  const request = jiraAutofixAPI
    .getQueueStatus(boardId)
    .then((status) => {
      cache.set(boardId, { at: Date.now(), status });
      return status;
    })
    .catch(() => {
      // 조회 실패는 "맡길 수 없음"이 아니다. 모르는 상태로 두고 서버가 최종 판단하게 한다.
      cache.set(boardId, { at: Date.now(), status: null });
      return null;
    })
    .finally(() => inflight.delete(boardId));

  inflight.set(boardId, request);
  return request;
}

export interface AutofixRunnerReadiness {
  status: JiraAutofixQueueStatus | null;
  loading: boolean;
  /** 러너가 살아 있는가. 모르면 false로 두되, 그 이유를 reason이 말한다. */
  online: boolean;
  /**
   * 지금 맡길 수 있는가. 러너가 살아 있고 검증 클론이 준비됐을 때만 true.
   *
   * 실행 중지·일일 상한은 막지 않는다 — 둘 다 시간이 지나면 저절로 풀리므로,
   * 담아두고 기다리게 하는 편이 지시문을 어딘가에 적어두게 하는 것보다 낫다.
   */
  canDelegate: boolean;
  /** 맡길 수 없을 때 화면에 그대로 띄울 사유. 가능하면 null. */
  blockedReason: string | null;
  refresh: () => Promise<void>;
}

export function useAutofixRunnerStatus(
  boardId: string | null | undefined,
  enabled = true,
): AutofixRunnerReadiness {
  const [status, setStatus] = useState<JiraAutofixQueueStatus | null>(
    boardId ? (cache.get(boardId)?.status ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetch = useCallback(
    async (force: boolean) => {
      if (!boardId || !enabled) return;
      setLoading(true);
      const next = await load(boardId, force);
      if (mounted.current) {
        setStatus(next);
        setLoading(false);
      }
    },
    [boardId, enabled],
  );

  useEffect(() => {
    void fetch(false);
  }, [fetch]);

  const refresh = useCallback(async () => {
    await fetch(true);
  }, [fetch]);

  const online = status?.runner_online === true;
  // verify_ready는 nullable이다. 모르는 것(구버전 러너·진단 실패)은 문제로 취급하지 않는다 —
  // 알 수 없는 상태를 막으면 멀쩡한 맥을 세우게 된다.
  const verifyNotReady = status?.runner_status?.verify_ready === false;

  let blockedReason: string | null = null;
  if (status && !online) {
    blockedReason = "맥이 연결되지 않았습니다";
  } else if (verifyNotReady) {
    blockedReason =
      "검증 클론이 준비되지 않았습니다. 지금 맡기면 PR 직전에 실패합니다";
  }

  return {
    status,
    loading,
    online,
    canDelegate: online && !verifyNotReady,
    blockedReason,
    refresh,
  };
}
