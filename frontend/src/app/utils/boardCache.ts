import { Block, ChecklistItem } from "../types";
import { boardService } from "./services";

export type BoardFullData = Awaited<
  ReturnType<typeof boardService.getBoardFull>
>;

export interface BoardCacheEntry {
  fullData: BoardFullData;
  // 마일스톤 선택 보드의 필터링된 블록 결과 (없으면 fullData.blocks 사용)
  blocksResult: { blocks: Block[]; hiddenBlocks: Block[] } | null;
  checklistMap: { [taskId: string]: ChecklistItem[] };
  scheduledTaskIds: string[];
  cachedAt: number;
}

const DEFAULT_MAX_AGE_MS = 5 * 60_000;

// 보드 재진입 시 즉시 페인트용 stale-while-revalidate 캐시 (모듈 레벨, 세션 한정)
const cache = new Map<string, BoardCacheEntry>();

export const boardCache = {
  get(boardId: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS) {
    const entry = cache.get(boardId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > maxAgeMs) {
      cache.delete(boardId);
      return null;
    }
    return entry;
  },
  set(boardId: string, entry: Omit<BoardCacheEntry, "cachedAt">) {
    cache.set(boardId, { ...entry, cachedAt: Date.now() });
  },
  clear(boardId: string) {
    cache.delete(boardId);
  },
};
