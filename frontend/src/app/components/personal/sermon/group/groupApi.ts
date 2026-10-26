import { apiClient } from '../../../../utils/api';

/**
 * 설교 노트 「모임」 API — 계약: docs/Tech/sermon-groups-api.md
 * 응답은 snake_case, null 필드는 키가 빠진다(Jackson non_null) → 선택 필드는 `?:` 로 받는다.
 */

export type GroupKind = 'church' | 'study' | 'family' | 'friend' | 'team';
export type MemberRole = 'leader' | 'co_leader' | 'member';
export type MemberStatus = 'pending' | 'active';

export interface ServiceSlot {
  dow: number;
  start: string;
  end: string;
  part?: string | null;
}

export interface GroupService {
  id: string;
  name: string;
  active: boolean;
  slots: ServiceSlot[];
}

export interface GroupMember {
  user_id: string;
  display_name: string;
  role: MemberRole;
  status: MemberStatus;
  profile_image?: string | null;
}

export interface GroupMe {
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  display_name: string;
  muted_service_ids?: string[];
}

export interface SermonGroup {
  id: string;
  name: string;
  kind: GroupKind;
  services: GroupService[];
  join_approval: boolean;
  invite_code?: string | null;
  invite_expires_at?: string | null;
  me: GroupMe;
  members: GroupMember[];
  member_count: number;
  created_at?: string;
}

export interface SessionMemberState {
  user_id: string;
  state: 'written' | 'private';
}

export interface SessionSummary {
  id: string;
  service_id?: string | null;
  date: string;
  name?: string | null;
  title?: string | null;
  preacher?: string | null;
  refs?: string[];
  locked?: boolean;
  updated_by_name?: string | null;
  members?: SessionMemberState[];
  my_share_id?: string | null;
}

export interface WeekResponse {
  sessions: SessionSummary[];
  pokes_for_me?: Array<{ from_name: string; created_at: string }>;
}

export interface ShareHighlight {
  ref: string;
  marks: Array<[number, number]>;
  text?: string;
}

export interface ShareThought {
  id: string;
  tag: string;
  text: string;
}

export interface ShareFields {
  highlights?: ShareHighlight[];
  thoughts?: ShareThought[];
  summary?: string;
}

export interface ShareReaction {
  item_key: string;
  kind: ReactionKind;
  count: number;
  mine: boolean;
}

export type ReactionKind = 'amen' | 'curious' | 'keeping';
export type Heard = 'live' | 'video' | 'other';

export interface SessionShare {
  id: string;
  user_id: string;
  display_name: string;
  my_title?: string | null;
  heard?: Heard | null;
  part?: string | null;
  private?: boolean;
  fields?: ShareFields | null;
  updated_at?: string;
  reactions?: ShareReaction[];
}

export interface SessionDetail {
  session: SessionSummary;
  shares: SessionShare[];
}

export interface InvitePreview {
  group_id: string;
  name: string;
  kind: GroupKind;
  services: GroupService[];
  leader_name?: string | null;
  member_count: number;
  join_approval: boolean;
  this_week?: Array<{
    service_id?: string | null;
    date: string;
    name?: string | null;
    title?: string | null;
    refs?: string[];
    recorded_count: number;
  }>;
  my_status?: MemberStatus | null;
}

export interface CreateGroupBody {
  name: string;
  kind: GroupKind;
  services: GroupService[];
  join_approval: boolean;
  display_name: string;
  invite_expires_days: 7 | 30 | null;
}

export interface ShareBody {
  note_id: string;
  my_title: string;
  heard: Heard;
  part: string | null;
  private: boolean;
  fields: ShareFields;
}

const G = '/sermon-groups';
const S = '/sermon-sessions';

export const sermonGroupAPI = {
  list: () => apiClient.get<SermonGroup[]>(G),
  create: (body: CreateGroupBody) => apiClient.post<SermonGroup>(G, body),
  get: (id: string) => apiClient.get<SermonGroup>(`${G}/${id}`),
  update: (
    id: string,
    body: Partial<Pick<SermonGroup, 'name' | 'kind' | 'services' | 'join_approval'>>,
  ) => apiClient.patch<SermonGroup>(`${G}/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`${G}/${id}`),
  renewInvite: (id: string, expires_days: 7 | 30 | null) =>
    apiClient.post<SermonGroup>(`${G}/${id}/invite`, { expires_days }),
  disableInvite: (id: string) => apiClient.delete<SermonGroup>(`${G}/${id}/invite`),

  /** 공개 — 로그인 전이면 skipAuth (토큰 갱신·로그인 이동을 타지 않게) */
  invitePreview: (code: string, loggedIn: boolean, start?: string) =>
    apiClient.get<InvitePreview>(
      `${G}/invite/${encodeURIComponent(code)}${start ? `?start=${encodeURIComponent(start)}` : ''}`,
      !loggedIn,
    ),
  join: (code: string, body: { display_name: string; muted_service_ids: string[] }) =>
    apiClient.post<SermonGroup>(`${G}/invite/${encodeURIComponent(code)}/join`, body),

  updateMe: (id: string, body: { display_name?: string; muted_service_ids?: string[] }) =>
    apiClient.patch<SermonGroup>(`${G}/${id}/members/me`, body),
  leave: (id: string) => apiClient.delete<void>(`${G}/${id}/members/me`),
  approve: (id: string, userId: string) =>
    apiClient.post<SermonGroup>(`${G}/${id}/members/${userId}/approve`),
  kick: (id: string, userId: string) => apiClient.delete<void>(`${G}/${id}/members/${userId}`),
  setRole: (id: string, userId: string, role: MemberRole) =>
    apiClient.patch<SermonGroup>(`${G}/${id}/members/${userId}`, { role }),

  week: (id: string, start: string) =>
    apiClient.get<WeekResponse>(`${G}/${id}/week?start=${encodeURIComponent(start)}`),
  openSession: (id: string, body: { name: string; date: string }) =>
    apiClient.post<SessionSummary>(`${G}/${id}/sessions`, body),
  poke: (id: string, body: { to_user_id: string; session_id: string | null; week_start: string }) =>
    apiClient.post<void>(`${G}/${id}/pokes`, body),

  resolveSession: (body: { group_id: string; service_id: string; date: string }) =>
    apiClient.put<SessionSummary>(`${S}/resolve`, body),
  updateSession: (id: string, body: { title?: string; preacher?: string; refs?: string[] }) =>
    apiClient.patch<SessionSummary>(`${S}/${id}`, body),
  lockSession: (id: string, locked: boolean) =>
    apiClient.patch<SessionSummary>(`${S}/${id}/lock`, { locked }),
  session: (id: string) => apiClient.get<SessionDetail>(`${S}/${id}`),
  putShare: (sessionId: string, body: ShareBody) =>
    apiClient.put<SessionShare>(`${S}/${sessionId}/share`, body),
  deleteShare: (sessionId: string) => apiClient.delete<void>(`${S}/${sessionId}/share`),
  react: (shareId: string, item_key: string, kind: ReactionKind) =>
    apiClient.post<ShareReaction>(`/sermon-shares/${shareId}/reactions`, { item_key, kind }),
};

/** API 에러 코드 (SG001 …) */
export function groupErrorCode(e: unknown): string | null {
  const x = e as {
    code?: string;
    errorCode?: string;
    response?: { data?: { code?: string } };
  } | null;
  return x?.code || x?.errorCode || x?.response?.data?.code || null;
}

export function groupErrorMessage(e: unknown, fallback = '잠시 후 다시 시도해 주세요'): string {
  switch (groupErrorCode(e)) {
    case 'SG001':
      return '모임을 찾을 수 없어요';
    case 'SG002':
      return '모임 멤버만 볼 수 있어요';
    case 'SG003':
      return '모임 리더만 할 수 있어요';
    case 'SG004':
      return '초대 링크가 만료됐거나 꺼졌어요';
    case 'SG005':
      return '이미 참여한 모임이에요';
    case 'SG006':
      return '모임 인원이 가득 찼어요 (50명)';
    case 'SG007':
      return '모임은 20개까지 참여할 수 있어요';
    case 'SG008':
      return '리더가 설교 정보를 잠가 두었어요';
    case 'SG009':
      return '이번 주에는 이미 같이 쓰자고 했어요';
    default:
      return fallback;
  }
}
