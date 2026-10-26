import { apiClient } from '../../../../utils/api';
import type { BooksStage } from './books';
import type { RainEvent, RainKind } from './rainScore';

/**
 * 설교 노트 「챌린지」 API — 계약: docs/Tech/sermon-challenge-api.md
 * 응답은 snake_case, null 필드는 키가 빠진다(Jackson non_null) → 선택 필드는 `?:` 로 받고 `== null` 로 비교한다.
 */

export interface WeekComplete {
  note?: boolean;
  apply_done?: boolean;
  done?: boolean;
}

export interface Wallet {
  balance: number;
  week?: string;
  week_ends_at?: string | null;
  week_talents?: number;
  today_game_talents?: number;
  game_daily_cap?: number;
  streak_weeks?: number;
  best_streak?: number;
  week_complete?: WeekComplete | null;
  reward_credits?: number;
  reward_expires_at?: string | null;
  exchanged_this_month?: number;
  exchange_monthly_cap?: number;
  exchange_rate?: number;
  personal_credits_available?: number;
}

export interface LedgerItem {
  id: string;
  amount: number;
  reason: string;
  label?: string | null;
  created_at: string;
}

export interface LedgerPage {
  items: LedgerItem[];
  next_before?: string | null;
}

export interface ChurchRef {
  id: string;
  name: string;
  region?: string | null;
  dept?: string | null;
  changed_at?: string | null;
  can_change_at?: string | null;
}

export interface ChallengeProfile {
  nickname?: string | null;
  tag?: string | null;
  anonymous?: boolean;
  anon_name?: string | null;
  league_tier?: number;
  church?: ChurchRef | null;
}

export interface Church {
  id: string;
  name: string;
  region?: string | null;
  address?: string | null;
  member_count?: number;
}

export interface RainRules {
  lives?: number;
  level_every?: number;
  min_gap_ms?: number;
  max_duration_ms?: number;
}

export interface RainStartBody {
  set: string;
  label: string;
  pool: string[];
}

export interface RainStart {
  run_id: string;
  seed?: number;
  words: Array<{ i: number; text: string; kind?: RainKind | null }>;
  rules?: RainRules | null;
}

export interface GameRanks {
  global?: number | null;
  church?: number | null;
  league?: number | null;
}

export interface RainFinish {
  score: number;
  valid?: boolean;
  talents?: number;
  talents_capped?: boolean;
  best?: number | null;
  is_best?: boolean;
  ranks?: GameRanks | null;
}

export interface BooksStart {
  run_id: string;
  stage: BooksStage;
  cards: number[];
}

export interface BooksFinish {
  time_ms: number;
  valid?: boolean;
  talents?: number;
  talents_capped?: boolean;
  best_ms?: number | null;
  is_best?: boolean;
  ranks?: GameRanks | null;
}

export interface GameBest {
  best?: number | null;
  week_best?: number | null;
}

export type RankScope = 'global' | 'church' | 'group';
export type RankBoard = 'talent' | 'rain' | 'books';

export interface RankEntry {
  rank: number;
  name: string;
  anonymous?: boolean;
  dept?: string | null;
  value: number;
  me?: boolean;
  zone?: 'up' | 'stay' | 'down' | null;
}

export interface Rankings {
  week?: string;
  ends_at?: string | null;
  board?: RankBoard;
  scope?: RankScope;
  entries?: RankEntry[];
  me?: { rank?: number | null; value?: number | null } | null;
  gap_to_next?: number | null;
  locked?: 'no_church' | 'too_few' | null;
  members?: number | null;
}

export interface LeagueResult {
  week: string;
  rank: number;
  tier_from: number;
  tier_to: number;
  moved: 'up' | 'stay' | 'down';
}

export interface League {
  week?: string;
  ends_at?: string | null;
  tier: number;
  tier_name?: string | null;
  promote?: number;
  demote?: number;
  entries?: RankEntry[];
  last_result?: LeagueResult | null;
}

const C = '/challenge';

export const challengeAPI = {
  wallet: () => apiClient.get<Wallet>(`${C}/wallet`),
  ledger: (before?: string | null, limit = 30) =>
    apiClient.get<LedgerPage>(
      `${C}/ledger?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),
  exchange: (credits: number) => apiClient.post<Wallet>(`${C}/exchange`, { credits }),

  profile: () => apiClient.get<ChallengeProfile>(`${C}/profile`),
  putProfile: (body: { nickname: string; anonymous: boolean }) =>
    apiClient.put<ChallengeProfile>(`${C}/profile`, body),

  churches: (q: string, limit = 20) =>
    apiClient.get<{ items?: Church[] }>(`/churches?q=${encodeURIComponent(q)}&limit=${limit}`),
  createChurch: (body: { name: string; region: string; address: string | null }) =>
    apiClient.post<Church>('/churches', body),
  setChurch: (body: { church_id: string; dept: string | null }) =>
    apiClient.put<ChallengeProfile>(`${C}/church`, body),
  leaveChurch: () => apiClient.delete<ChallengeProfile>(`${C}/church`),

  startRain: (body: RainStartBody) => apiClient.post<RainStart>(`${C}/games/rain/runs`, body),
  finishRain: (runId: string, body: { duration_ms: number; events: RainEvent[] }) =>
    apiClient.post<RainFinish>(`${C}/games/rain/runs/${encodeURIComponent(runId)}/finish`, body),
  startBooks: (stage: BooksStage) => apiClient.post<BooksStart>(`${C}/games/books/runs`, { stage }),
  finishBooks: (runId: string, body: { order: number[]; duration_ms: number; moves: number }) =>
    apiClient.post<BooksFinish>(`${C}/games/books/runs/${encodeURIComponent(runId)}/finish`, body),
  best: (game: 'rain' | 'books', stage?: BooksStage) =>
    apiClient.get<GameBest>(`${C}/games/${game}/best${stage ? `?stage=${stage}` : ''}`),

  rankings: (scope: RankScope, board: RankBoard, groupId?: string | null) =>
    apiClient.get<Rankings>(
      `${C}/rankings?scope=${scope}&board=${board}${groupId ? `&group_id=${encodeURIComponent(groupId)}` : ''}`,
    ),
  league: () => apiClient.get<League>(`${C}/league`),
};

export function challengeErrorCode(e: unknown): string | null {
  const x = e as {
    code?: string;
    errorCode?: string;
    response?: { data?: { code?: string } };
  } | null;
  return x?.code || x?.errorCode || x?.response?.data?.code || null;
}

export function challengeErrorMessage(e: unknown, fallback = '잠시 후 다시 시도해 주세요'): string {
  switch (challengeErrorCode(e)) {
    case 'CH001':
      return '닉네임은 2~12자 한글·영문·숫자로 정해 주세요';
    case 'CH002':
      return '입력한 값을 다시 확인해 주세요';
    case 'CH003':
      return '달란트가 모자라요';
    case 'CH004':
      return '이번 달 교환 한도를 다 썼어요';
    case 'CH005':
      return '소속 교회는 30일에 한 번 바꿀 수 있어요';
    case 'CH006':
      return '이 판은 끝났거나 시간이 지났어요';
    case 'CH007':
      return '교회를 찾을 수 없어요';
    case 'SG002':
      return '모임 멤버만 볼 수 있어요';
    default:
      return fallback;
  }
}

/** 서버가 아직 없거나(404·5xx) 연결이 끊긴 실패 — 「아직 준비 중」으로 보여 준다 (CH·SG 업무 오류는 아님) */
export function isUnavailable(e: unknown): boolean {
  const code = challengeErrorCode(e);
  if (code && /^(CH|SG)\d/.test(code)) return false;
  const status = (e as { status?: number } | null)?.status;
  return status == null || status === 404 || status >= 500;
}

export const TIER_NAMES = ['겨자씨', '새싹', '가지', '열매', '포도나무'];
export function tierName(t: number | null | undefined, given?: string | null): string {
  return given || TIER_NAMES[Math.max(0, Math.min(4, t ?? 0))];
}
