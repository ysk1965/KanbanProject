import { apiClient } from '../../../../utils/api';

/**
 * 함께 읽는 길 — 통독 API. 계약: docs/Tech/sermon-reading-plans-api.md
 * 응답은 snake_case, null 필드는 키가 빠진다(Jackson non_null) → 선택 필드는 `?:` 로 받는다.
 * 장 키는 "b:c" (책 0~65, 장 1부터). today 는 항상 기기 날짜(todayString).
 */

export interface DueChapter {
  day_no: number;
  date: string;
  chapter: string;
}

export interface TodayChapter {
  chapter: string;
  done: boolean;
}

export interface MinePlan {
  id: string;
  title: string;
  template: string;
  group_id?: string;
  group_name?: string;
  start_date: string;
  end_date: string;
  total_days: number;
  today_day_no?: number;
  my_done_days: number;
  behind_days: number;
  due?: DueChapter[];
  /** 오늘 날의 장 전부 + 내가 찍었는지 (today_day_no 없으면 키 없음) */
  today_chapters?: TodayChapter[];
}

export interface PlanDay {
  day_no: number;
  date: string;
  chapters: string[];
  done_count: number;
  my_chapters?: string[];
  /** 그날 다 읽은 멤버 번호 (members 순서). 없으면 키 생략 */
  readers?: number[];
  /** readers 중 이틀 이상 늦게 마저 읽은 멤버 번호 */
  late?: number[];
}

export interface PlanMember {
  user_id: string;
  display_name: string;
  profile_image?: string;
  done_days: number;
  /** 보는 사람 본인일 때만 true */
  me?: boolean;
}

export interface PlanPerson {
  user_id: string;
  display_name: string;
  profile_image?: string;
}

export interface PlanDetail {
  id: string;
  title: string;
  template: string;
  status: 'active' | 'done' | 'ended';
  group_id?: string;
  group_name?: string;
  owner_user_id?: string;
  start_date: string;
  end_date: string;
  total_days: number;
  today_day_no?: number;
  can_manage?: boolean;
  days: PlanDay[];
  member_count: number;
  team_done: number;
  team_total: number;
  /** 사람별 줄 — 모임 멤버(가입순). 예전 서버면 없음 */
  members?: PlanMember[];
  today?: { read?: PlanPerson[]; unread?: PlanPerson[] };
}

export interface NewPlanBody {
  group_id?: string;
  title: string;
  template: string;
  days: Array<{ date: string; chapters: string[] }>;
}

export interface Stamped {
  plan_id: string;
  title: string;
  group_name?: string;
  day_no: number;
  day_done: boolean;
}

const R = '/reading-plans';
const q = (today: string) => `today=${encodeURIComponent(today)}`;

export const readingAPI = {
  create: (body: NewPlanBody) => apiClient.post<PlanDetail>(R, body),
  mine: (today: string) => apiClient.get<{ plans?: MinePlan[] }>(`${R}/mine?${q(today)}`),
  get: (id: string, today: string) => apiClient.get<PlanDetail>(`${R}/${id}?${q(today)}`),
  ofGroup: (groupId: string, today: string) =>
    apiClient.get<{ plan?: PlanDetail }>(`${R}/group/${groupId}?${q(today)}`),
  stamp: (chapter: string, today: string) =>
    apiClient.post<{ stamped?: Stamped[] }>(`${R}/checks/chapter`, { chapter, today }),
  checkDay: (id: string, dayNo: number, checked: boolean, today: string) =>
    apiClient.put<PlanDetail>(`${R}/${id}/days/${dayNo}/check`, { checked, today }),
  end: (id: string) => apiClient.delete<void>(`${R}/${id}`),
};

export function readingErrorMessage(e: unknown, fallback = '잠시 후 다시 시도해 주세요'): string {
  const x = e as { code?: string; errorCode?: string; response?: { data?: { code?: string } } };
  switch (x?.code || x?.errorCode || x?.response?.data?.code) {
    case 'RPL001':
      return '기기 날짜를 확인해 주세요';
    case 'RPL002':
      return '길 내용을 다시 확인해 주세요';
    case 'RPL003':
      return '이 모임엔 이미 진행 중인 길이 있어요';
    case 'RPL004':
      return '내 읽기표는 3개까지 함께 쓸 수 있어요';
    case 'RPL005':
      return '아직 오지 않은 날이에요';
    case 'RPL006':
      return '길을 찾을 수 없어요';
    case 'SG003':
      return '모임 리더만 길을 낼 수 있어요';
    default:
      return fallback;
  }
}
