import { createContext, useContext } from 'react';
import type { SermonProfileState } from './useSermonProfile';

/** 이름표 상태를 편집기(「나의 갈피에 고정」)와 나의 갈피 화면이 같이 쓴다. SermonTab 이 채운다 */
export const ProfileContext = createContext<SermonProfileState | null>(null);

export function useProfile(): SermonProfileState | null {
  return useContext(ProfileContext);
}
