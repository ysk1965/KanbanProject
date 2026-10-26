import { apiClient } from '../../../../utils/api';
import { worshipToServer } from '../worship';
import type { SermonProfileData } from './profileModel';

/**
 * 「나의 갈피」 이름표 API — 계약: docs/Tech/sermon-profile-api.md
 * snake_case, null 필드는 키가 빠진다(non_null) → 선택 필드는 `?:`.
 */

export interface VerseEntry {
  verse_ref: string;
  from_at: string;
  to_at?: string | null;
}

export interface ProfileChurch {
  id: string;
  name: string;
  region?: string | null;
  dept?: string | null;
}

export interface ProfileResponse extends SermonProfileData {
  user_id: string;
  display_name?: string | null;
  /** false = 아직 저장한 적 없음 (기본값으로 채워 옴) */
  saved: boolean;
  verse_history?: VerseEntry[];
  /** 지금 대표 말씀이 몇 번째인지 */
  verse_count?: number | null;
  /** 챌린지 소속 교회 (읽기 전용) */
  church?: ProfileChurch | null;
  updated_at?: string;
}

const P = '/sermon-profile';

export const sermonProfileAPI = {
  me: () => apiClient.get<ProfileResponse>(`${P}/me`),
  put: (body: SermonProfileData) =>
    apiClient.put<ProfileResponse>(`${P}/me`, {
      ...body,
      worship_services: worshipToServer(body.worship_services),
    }),
  get: (userId: string) => apiClient.get<ProfileResponse>(`${P}/${encodeURIComponent(userId)}`),
};
