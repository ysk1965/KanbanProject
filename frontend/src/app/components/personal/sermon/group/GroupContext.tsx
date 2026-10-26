import { createContext, useContext } from 'react';
import type { GroupStore } from './groupStore';

/**
 * 설교 노트 화면 어디서나 모임에 닿는 길 — SermonTab 이 내려 준다.
 * (한 주 동안·편집기·목록 사이드바가 props 를 길게 넘기지 않게)
 */
export interface SermonGroupCtx {
  store: GroupStore;
  userId: string;
  anonymous: boolean;
  openGroup: (groupId: string) => void;
  openSession: (sessionId: string, groupId: string) => void;
  openCreate: () => void;
  /** 예배표 자리에서 바로 새 노트 (지금 시간대면 자동 연결) */
  startInSlot: (groupId: string, serviceId: string, date: string) => void;
  onLogin?: () => void;
}

export const GroupContext = createContext<SermonGroupCtx | null>(null);

export function useSermonGroups(): SermonGroupCtx | null {
  return useContext(GroupContext);
}
