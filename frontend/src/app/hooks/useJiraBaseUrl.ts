import { useEffect, useState } from "react";
import { jiraAPI } from "../utils/api";

/**
 * 보드의 JIRA 사이트 주소(base_url)를 가져온다 — 이슈 원문 링크를 조립하려는 화면용.
 *
 * <p>스프린트 보드처럼 이미 {@code JiraStatus}를 들고 있는 화면은 이 훅이 필요 없다.
 * 태스크 상세 모달처럼 보드 어디서든 열리는 화면이 문제인데, 링크 하나 때문에 연동 상태를
 * props로 관통시키면 중간 컴포넌트가 전부 그 사실을 알아야 한다. 그래서 여기서 직접 읽되,
 * 보드당 한 번만 읽고 모듈 캐시에 남긴다 — 모달을 열 때마다 요청이 나가지 않게.
 *
 * <p>주소는 세션 중에 바뀌지 않는다(바뀌면 연동을 다시 맺은 것이고, 그때는 화면이 새로 뜬다).
 */

/** boardId → base_url. null은 "물어봤고 없더라"(미연동)라는 확정 답이라 다시 묻지 않는다. */
const cache = new Map<string, string | null>();
/** 같은 보드로 동시에 열린 모달이 각자 요청하지 않도록 진행 중 요청을 공유한다. */
const inFlight = new Map<string, Promise<string | null>>();

function load(boardId: string): Promise<string | null> {
  const running = inFlight.get(boardId);
  if (running) return running;

  const request = jiraAPI
    .getStatus(boardId)
    .then((status) => (status?.connected ? (status.base_url ?? null) : null))
    .catch(() => null) // 미연동·권한없음 — 링크를 못 만들 뿐 화면은 그대로 뜬다
    .then((baseUrl) => {
      cache.set(boardId, baseUrl);
      inFlight.delete(boardId);
      return baseUrl;
    });

  inFlight.set(boardId, request);
  return request;
}

/**
 * @param boardId 대상 보드. null이면 조회하지 않는다.
 * @param enabled 링크가 실제로 필요할 때만 켠다(예: JIRA 연동 카드를 열었을 때).
 *                꺼져 있으면 요청하지 않는다 — 연동 없는 보드에서 모달을 열 때마다 헛질의하지 않도록.
 */
export function useJiraBaseUrl(
  boardId: string | null | undefined,
  enabled: boolean,
): string | null {
  const [baseUrl, setBaseUrl] = useState<string | null>(() =>
    boardId ? (cache.get(boardId) ?? null) : null,
  );

  useEffect(() => {
    if (!boardId || !enabled) return;
    if (cache.has(boardId)) {
      setBaseUrl(cache.get(boardId) ?? null);
      return;
    }
    let alive = true;
    load(boardId).then((url) => {
      if (alive) setBaseUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [boardId, enabled]);

  return baseUrl;
}
