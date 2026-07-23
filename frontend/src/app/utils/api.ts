import { nowUTC } from "./dateUtils";
import { domainBrandName } from "./domain";
import { addBreadcrumb } from "../../lib/sentry";

// API Base URL - BE 서버
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

// 백엔드 Origin (파일 URL 해석용 · MCP 연결 명령의 BRIDGE_API_URL)
// 현재 FE가 붙어있는 백엔드 주소 → 환경별로 자동(로컬/milkyway/bridgespots).
export const BACKEND_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "http://localhost:8080";
  }
})();

// S3 직접 URL → CloudFront 리라이트
const CLOUDFRONT_DOMAIN = import.meta.env.VITE_CLOUDFRONT_DOMAIN as
  string | undefined;
const S3_DIRECT_URL_RE = /^https:\/\/[\w.-]+\.s3\.[\w.-]+\.amazonaws\.com\//;

/**
 * 백엔드에서 반환한 파일 URL을 최적 URL로 변환
 * - S3 직접 URL → CloudFront URL 리라이트 (VITE_CLOUDFRONT_DOMAIN 설정 시)
 * - 이미 절대 URL(http/https/blob/data)이면 그대로 반환
 * - 상대 경로(/uploads/...)이면 백엔드 origin을 앞에 붙임
 */
export const resolveFileUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    if (CLOUDFRONT_DOMAIN && S3_DIRECT_URL_RE.test(url)) {
      return url.replace(S3_DIRECT_URL_RE, `https://${CLOUDFRONT_DOMAIN}/`);
    }
    return url;
  }
  return `${BACKEND_ORIGIN}${url}`;
};

// 토큰 관리
const getAccessToken = (): string | null => {
  return localStorage.getItem("access_token");
};

const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

const getRefreshToken = (): string | null => {
  return localStorage.getItem("refresh_token");
};

// JWT 토큰 디코딩 (만료 시간 확인용)
const decodeToken = (token: string): { exp: number } | null => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

// 토큰이 곧 만료되는지 확인 (1시간 이내)
const isTokenExpiringSoon = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded) return true;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decoded.exp - now;
  const ONE_HOUR = 60 * 60;

  return timeUntilExpiry < ONE_HOUR;
};

// 토큰이 이미 만료되었는지 확인
const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded) return true;

  const now = Math.floor(Date.now() / 1000);
  return decoded.exp <= now;
};

// 서버 점검 시간 체크 (KST 03:30~08:30)
const isMaintenanceWindow = (): boolean => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return mins >= 3 * 60 + 30 && mins < 8 * 60 + 30;
};

// API 에러 타입
export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
  errors?: Record<string, string>;
}

// API 클라이언트
class ApiClient {
  private baseURL: string;
  private refreshPromise: Promise<boolean> | null = null;
  // Rate limit 관리: 엔드포인트별 backoff 상태
  private rateLimitBackoff: Map<string, { until: number; retries: number }> =
    new Map();

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    skipAuth: boolean = false,
  ): Promise<T> {
    // Rate limit backoff 체크: 이전에 429를 받은 엔드포인트는 backoff 기간 동안 즉시 차단
    const backoffKey = endpoint.split("?")[0]; // 쿼리 파라미터 제거
    const backoffState = this.rateLimitBackoff.get(backoffKey);
    if (backoffState && Date.now() < backoffState.until) {
      console.warn(
        `⏳ [Rate Limit] ${endpoint} — backoff ${Math.ceil((backoffState.until - Date.now()) / 1000)}s 남음`,
      );
      throw {
        code: "R001",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        status: 429,
      } as ApiError;
    }
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };

    // 인증 토큰 추가 (선제적 갱신 포함)
    if (!skipAuth) {
      let token = getAccessToken();

      // 토큰이 10분 이내 만료 예정이면 선제적으로 갱신
      if (token && isTokenExpiringSoon(token)) {
        console.log("🔄 [Token] 토큰 만료 임박, 선제적 갱신 시도...");
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          token = getAccessToken();
          console.log("✅ [Token] 선제적 갱신 완료");
        }
      }

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    // Request 로깅
    console.log(`🚀 [API Request] ${options?.method || "GET"} ${url}`, {
      headers: {
        ...headers,
        Authorization: headers.Authorization ? "***" : undefined,
      },
      body: options?.body ? JSON.parse(options.body as string) : undefined,
    });

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({
          code: "UNKNOWN",
          message: response.statusText,
          timestamp: nowUTC(),
        }));

        // Error Response 로깅
        console.error(`❌ [API Error] ${options?.method || "GET"} ${url}`, {
          status: response.status,
          error: errorData,
        });

        // Sentry breadcrumb: 에러 직전 어떤 API가 실패했는지 자동 첨부 (민감 body 제외)
        addBreadcrumb({
          category: "api",
          type: "http",
          level: response.status >= 500 ? "error" : "warning",
          message: `${options?.method || "GET"} ${endpoint} → ${response.status}`,
          data: { status: response.status, code: errorData.code },
        });

        // Rate Limit (429 Too Many Requests) — exponential backoff
        if (response.status === 429) {
          const currentBackoff = this.rateLimitBackoff.get(backoffKey);
          const retries = (currentBackoff?.retries || 0) + 1;
          // Exponential backoff: 2s, 4s, 8s, 16s, 30s max
          const backoffMs = Math.min(2000 * Math.pow(2, retries - 1), 30000);
          this.rateLimitBackoff.set(backoffKey, {
            until: Date.now() + backoffMs,
            retries,
          });
          console.warn(
            `🚫 [Rate Limit] ${endpoint} — ${backoffMs / 1000}s backoff (retry #${retries})`,
          );
          // 5회 이상 연속 429이면 backoff 맵 자동 클리어 타이머 설정 (60초 후)
          if (retries >= 5) {
            setTimeout(() => this.rateLimitBackoff.delete(backoffKey), 60000);
          } else {
            setTimeout(
              () => this.rateLimitBackoff.delete(backoffKey),
              backoffMs,
            );
          }
          throw errorData;
        }

        // 토큰 만료시 자동 갱신 시도
        if (response.status === 401 && errorData.code === "A004") {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            // 토큰 갱신 성공, 원래 요청 재시도
            return this.request<T>(endpoint, options, skipAuth);
          }
        }

        // AI 크레딧 소진 (402 Payment Required)
        if (response.status === 402) {
          // AI 크레딧 소진 이벤트 발행
          const creditExhaustedEvent = new CustomEvent("ai-credits-exhausted", {
            detail: {
              message: errorData.message || "AI 크레딧이 소진되었습니다",
              code: errorData.code || "AI_CREDITS_EXHAUSTED",
            },
          });
          window.dispatchEvent(creditExhaustedEvent);
        }

        throw errorData;
      }

      // 204 No Content 또는 빈 응답 처리
      if (response.status === 204) {
        console.log(`✅ [API Response] ${options?.method || "GET"} ${url}`, {
          status: 204,
          data: null,
        });
        return {} as T;
      }

      // Content-Length가 0이거나 응답 본문이 비어있는 경우 처리
      const contentLength = response.headers.get("Content-Length");
      const contentType = response.headers.get("Content-Type");

      if (contentLength === "0" || !contentType?.includes("application/json")) {
        console.log(`✅ [API Response] ${options?.method || "GET"} ${url}`, {
          status: response.status,
          data: null,
        });
        return {} as T;
      }

      const text = await response.text();
      if (!text || text.trim() === "") {
        console.log(`✅ [API Response] ${options?.method || "GET"} ${url}`, {
          status: response.status,
          data: null,
        });
        return {} as T;
      }

      const data = JSON.parse(text);

      // Success Response 로깅
      console.log(`✅ [API Response] ${options?.method || "GET"} ${url}`, {
        status: response.status,
        data,
      });

      return data;
    } catch (error) {
      console.error(`💥 [API Request failed] ${endpoint}`, error);

      // 네트워크 계층 실패(fetch reject)도 breadcrumb로 흔적 남김
      if (error instanceof TypeError) {
        addBreadcrumb({
          category: "api",
          type: "http",
          level: "error",
          message: `${options?.method || "GET"} ${endpoint} → network error`,
        });
      }

      // 네트워크 에러 + 점검 시간대이면 점검 이벤트 발행
      if (error instanceof TypeError && isMaintenanceWindow()) {
        window.dispatchEvent(
          new CustomEvent("server-maintenance", {
            detail: { message: "서비스 점검 중입니다 (03:30~08:30)" },
          }),
        );
      }

      throw error;
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    // 이미 refresh 진행 중이면 해당 Promise를 공유하여 중복 요청 방지
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.executeRefreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async executeRefreshToken(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      this.redirectToLogin();
      return false;
    }

    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.access_token, data.refresh_token);
        return true;
      }
    } catch {
      // 갱신 실패
    }

    // 세션 만료 - 로그인 페이지로 리다이렉트
    console.log("🔒 [Auth] 세션 만료, 로그인 페이지로 이동");
    clearTokens();
    localStorage.removeItem("user");
    this.redirectToLogin();
    return false;
  }

  private redirectToLogin(): void {
    // 이미 로그인 페이지면 리다이렉트 안함
    if (
      window.location.pathname === "/login" ||
      window.location.pathname === "/signup"
    ) {
      return;
    }
    window.location.href = "/login";
  }

  async get<T>(endpoint: string, skipAuth: boolean = false): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" }, skipAuth);
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    skipAuth: boolean = false,
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      },
      skipAuth,
    );
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    skipAuth: boolean = false,
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: "PUT",
        body: data ? JSON.stringify(data) : undefined,
      },
      skipAuth,
    );
  }

  async delete<T>(
    endpoint: string,
    data?: unknown,
    skipAuth: boolean = false,
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: "DELETE",
        body: data ? JSON.stringify(data) : undefined,
      },
      skipAuth,
    );
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    skipAuth: boolean = false,
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: "PATCH",
        body: data ? JSON.stringify(data) : undefined,
      },
      skipAuth,
    );
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

/**
 * 인증된 fetch 래퍼 (토큰 만료 시 자동 갱신 + 재시도)
 * multipart/form-data 등 apiClient로 처리 안 되는 요청에 사용
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = getAccessToken();

  // 토큰 만료 임박 시 선제적 갱신
  if (token && isTokenExpiringSoon(token)) {
    const refreshed = await apiClient["tryRefreshToken"]();
    if (refreshed) token = getAccessToken();
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response = await fetch(url, { ...options, headers });

  // 401 + 토큰 만료 → 갱신 후 재시도
  if (response.status === 401) {
    const errData = await response.json().catch(() => null);
    if (errData?.code === "A004") {
      const refreshed = await apiClient["tryRefreshToken"]();
      if (refreshed) {
        token = getAccessToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        response = await fetch(url, { ...options, headers });
      }
    }
  }

  return response;
}

// ========================================
// Types - BE 응답 형식에 맞춤 (snake_case)
// ========================================

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  profile_image?: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserResponse;
}

export interface BoardSubscription {
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELED";
  plan: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface MemberPreviewResponse {
  id: string;
  name: string;
  profile_image: string | null;
}

export interface BoardListItem {
  id: string;
  name: string;
  description: string | null;
  board_type?: "TEAM" | "PERSONAL";
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  is_starred: boolean;
  member_count: number;
  task_count: number;
  completed_tasks: number;
  members: MemberPreviewResponse[];
  subscription: BoardSubscription;
  organization_id?: string | null;
  organization_name?: string | null;
  created_at: string;
}

export interface BoardOwner {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
}

export interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  board_type?: "TEAM" | "PERSONAL";
  owner: BoardOwner;
  my_role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  is_starred: boolean;
  member_count: number;
  subscription: BoardSubscription;
  selected_milestone_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlockResponse {
  id: string;
  name: string;
  type: "FIXED" | "CUSTOM";
  fixed_type: "FEATURE" | "TASK" | "DONE" | null;
  color: string | null;
  position: number;
  show_progress_bar?: boolean;
  milestone_id?: string | null;
  milestone_title?: string | null;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

export interface AssigneeResponse {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
}

export interface FeatureResponse {
  id: string;
  title: string;
  description?: string;
  color: string;
  assignee: AssigneeResponse | null;
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
  start_date: string | null;
  due_date: string | null;
  status: "ACTIVE" | "COMPLETED";
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  position: number;
  tags: TagResponse[];
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

// Feature AI Types
export interface FeatureAITaskSuggestion {
  title: string;
  description: string | null;
  checklists: { title: string }[];
}

export interface FeatureAIDecompositionResponse {
  feature_id: string;
  feature_title: string;
  tasks: FeatureAITaskSuggestion[];
}

export interface FeatureAIApplyRequest {
  tasks: {
    title: string;
    description?: string;
    checklists?: { title: string }[];
  }[];
}

export interface FeatureAIApplyResult {
  tasks_created: number;
  checklists_created: number;
}

// Checklist AI Types
export interface ChecklistAIItemSuggestion {
  title: string;
}

export interface ChecklistAIDecompositionResponse {
  task_id: string;
  task_title: string;
  items: ChecklistAIItemSuggestion[];
}

export interface ChecklistAIApplyRequest {
  items: { title: string }[];
}

export interface ChecklistAIApplyResult {
  items_created: number;
}

// Comment AI Types
export interface CommentAIActionItem {
  title: string;
  assignee_hint: string | null;
}

export interface CommentAISummaryResponse {
  task_id: string;
  summary: string;
  decisions: string[];
  open_questions: string[];
  action_items: CommentAIActionItem[];
}

export interface TaskResponse {
  id: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  block_id: string;
  block_name?: string;
  task_number?: number | null;
  task_key?: string | null;
  title: string;
  description?: string;
  // v7.0: Task.assignee 제거 - ChecklistItem.assignee로 대체
  start_date: string | null;
  due_date: string | null;
  baseline_start_date: string | null;
  baseline_due_date: string | null;
  estimated_minutes: number | null;
  completed: boolean;
  position: number;
  feature_position?: number;
  tags: TagResponse[];
  checklist_total?: number;
  checklist_completed?: number;
  assignees?: { id: string; name: string }[];
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface ChecklistItemResponse {
  id: string;
  title: string;
  completed: boolean;
  assignee: {
    id: string;
    name: string;
    profile_image: string | null;
  } | null;
  contractor?: ContractorInfo | null;
  start_date: string | null;
  due_date: string | null;
  done_date: string | null;
  position: number;
  created_at: string;
  completed_at: string | null;
}

export interface ChecklistResponse {
  total: number;
  completed: number;
  items: ChecklistItemResponse[];
}

// Milestone Response Types
export interface MilestoneFeatureInfoResponse {
  id: string;
  title: string;
  color: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  is_primary: boolean;
}

export interface MilestoneSimpleResponse {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  feature_count: number;
  progress_percentage: number;
}

export interface MilestoneDetailResponse {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  feature_count: number;
  progress_percentage: number;
  features: MilestoneFeatureInfoResponse[];
  created_by: { id: string; name: string };
  created_at: string;
}

export interface MemberUserResponse {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
}

export interface MemberResponse {
  id: string;
  user: MemberUserResponse;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joined_at: string;
  invited_by: { id: string; name: string } | null;
  assignee_color?: string | null;
  display_order?: number | null;
  job_role?: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
  } | null;
}

export interface JobRoleResponse {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  display_order?: number | null;
  member_count?: number;
  created_at?: string;
}

export interface JobRolesListResponse {
  job_roles: JobRoleResponse[];
}

// 외주(BoardContractor) 타입
export interface ContractorPeriod {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ContractorInfo {
  id: string;
  name: string;
  color?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  periods?: ContractorPeriod[];
  status?: "active" | "upcoming" | "expired" | "none" | string;
  manager_member_id?: string | null;
  manager_name?: string | null;
  job_role?: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
  } | null;
}

export interface ContractorResponse extends ContractorInfo {
  display_order?: number | null;
  manager_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContractorsListResponse {
  contractors: ContractorResponse[];
}

export interface MembersListResponse {
  total: number;
  billable: number;
  members: MemberResponse[];
}

export interface InviteResultResponse {
  type: "DIRECT_ADD" | "EMAIL_SENT";
  member?: MemberResponse; // DIRECT_ADD인 경우
  email?: string; // EMAIL_SENT인 경우
  role?: string; // EMAIL_SENT인 경우
}

export interface InviteLinkResponse {
  id: string;
  code: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_by: { id: string; name: string };
  created_at: string;
}

export interface InviteLinkInfoResponse {
  board_id: string;
  board_name: string;
  role: string;
  is_valid: boolean;
  message: string;
}

export interface ActivityLogResponse {
  id: string;
  user: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ActivitiesResponse {
  activities: ActivityLogResponse[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface SubscriptionResponse {
  id: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELED";
  plan: string | null;
  billing_cycle: "MONTHLY" | "YEARLY" | null;
  price: number | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  billable_member_count: number;
  member_limit: number;
  seat_count: number;
  price_per_seat: number | null;
  next_payment_at: string | null;
  created_at: string;
}

export interface PricingPlanResponse {
  id: string;
  name: string;
  min_members: number;
  max_members: number;
  monthly_price: number;
  yearly_price: number;
  yearly_monthly_price: number;
  discount_percentage: number;
}

export interface PricingResponse {
  plans: PricingPlanResponse[];
  currency: string;
  trial_days: string;
}

// Board Tier Response Types
export type BoardTier = "TRIAL" | "STANDARD" | "PREMIUM";

export interface BoardTierResponse {
  tier: BoardTier;
  trial_ends_at: string | null;
  can_access_schedule: boolean;
  can_access_milestone: boolean;
}

export interface BoardLimitsResponse {
  task_limit: number | null;
  current_task_count: number;
  can_create_task: boolean;
}

export interface TaskMoveRequest {
  target_board_id: string;
  target_block_id: string;
}

export interface BoardFullResponse {
  // 기본 보드 정보
  id: string;
  name: string;
  description: string | null;
  board_type?: "TEAM" | "PERSONAL";
  owner: BoardOwner;
  my_role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  is_starred: boolean;
  member_count: number;
  subscription: BoardSubscription;
  schedule_settings: {
    work_hours_per_day: number;
    work_start_time: string;
  };
  selected_milestone_id: string | null;
  created_at: string;
  updated_at: string;

  // 통합 데이터
  blocks: BlockResponse[];
  features: FeatureResponse[];
  tasks: TaskResponse[];
  tags: TagResponse[];
  invite_links: InviteLinkResponse[]; // Admin+ 권한 없으면 빈 배열
  subscription_detail: SubscriptionResponse | null;
  activities: ActivitiesResponse;
  members: MembersListResponse;
  milestones: { milestones: MilestoneDetailResponse[] };
  tier_info: BoardTierResponse;
  limits: BoardLimitsResponse;
  ai_credits: import("../types").AiCredits | null;
}

// Seat Pricing Response
export interface SeatPricingResponse {
  price_per_seat: {
    monthly: number;
    yearly: number;
  };
  seat_count: number;
  estimated_price: {
    monthly: number;
    yearly: number;
  };
}

// ========================================
// Auth API
// ========================================

export const authAPI = {
  signup: async (data: { email: string; password: string; name: string }) => {
    const response = await apiClient.post<AuthResponse>(
      "/auth/signup",
      data,
      true,
    );
    setTokens(response.access_token, response.refresh_token);
    return response;
  },

  login: async (data: { email: string; password: string }) => {
    const response = await apiClient.post<AuthResponse>(
      "/auth/login",
      data,
      true,
    );
    setTokens(response.access_token, response.refresh_token);
    return response;
  },

  googleLogin: async (code: string) => {
    const response = await apiClient.post<AuthResponse>(
      "/auth/google",
      { code },
      true,
    );
    setTokens(response.access_token, response.refresh_token);
    return response;
  },

  googleLoginWithIdToken: async (idToken: string) => {
    const response = await apiClient.post<AuthResponse>(
      "/auth/google",
      { id_token: idToken },
      true,
    );
    setTokens(response.access_token, response.refresh_token);
    return response;
  },

  logout: async () => {
    const response = await apiClient.post<{ message: string }>("/auth/logout");
    clearTokens();
    return response;
  },

  verifyEmail: async (token: string) => {
    return apiClient.get<{ message: string }>(
      `/auth/verify-email?token=${token}`,
      true,
    );
  },

  resendVerificationEmail: async (email: string) => {
    return apiClient.post<{ message: string }>(
      "/auth/resend-verification",
      { email },
      true,
    );
  },

  forgotPassword: async (email: string) => {
    return apiClient.post<{ message: string }>(
      "/auth/forgot-password",
      { email },
      true,
    );
  },

  resetPassword: async (token: string, newPassword: string) => {
    return apiClient.post<{ message: string }>(
      "/auth/reset-password",
      { token, newPassword },
      true,
    );
  },

  refresh: async (refreshToken: string) => {
    return apiClient.post<{
      access_token: string;
      refresh_token: string;
      token_type: string;
    }>("/auth/refresh", { refresh_token: refreshToken }, true);
  },

  // 토큰이 존재하고 유효한지 확인 (만료 여부 포함)
  isAuthenticated: () => {
    const token = getAccessToken();
    if (!token) return false;
    return !isTokenExpired(token);
  },

  // 토큰이 존재하지만 만료되었는지 확인 (갱신 필요 여부)
  isTokenExpiredButExists: () => {
    const token = getAccessToken();
    if (!token) return false;
    return isTokenExpired(token);
  },

  // refresh token으로 access token 갱신 시도 (중복 요청 방지)
  tryRefreshToken: async (): Promise<boolean> => {
    // ApiClient의 refreshPromise를 공유하여 모든 경로에서 단일 요청 보장
    return apiClient["tryRefreshToken"]();
  },

  getAccessToken,
  clearTokens,
};

// ========================================
// User API
// ========================================

export const userAPI = {
  getMe: async () => {
    return apiClient.get<{
      id: string;
      email: string;
      name: string;
      profile_image: string;
      email_verified: boolean;
    }>("/users/me");
  },

  updateProfile: async (data: {
    name?: string;
    profileImage?: string;
    theme?: "dark" | "light";
  }) => {
    return apiClient.patch<{
      id: string;
      email: string;
      name: string;
      profile_image: string;
      email_verified: boolean;
      theme?: "dark" | "light";
    }>("/users/me", {
      name: data.name,
      profile_image: data.profileImage,
      theme: data.theme,
    });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiClient.post<{ message: string }>("/users/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  deleteAccount: async () => {
    return apiClient.delete<{ message: string }>("/users/me");
  },

  uploadProfileImage: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authenticatedFetch(
      `${API_BASE_URL}/users/me/profile-image`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        code: "UNKNOWN",
        message: response.statusText,
      }));
      throw errData;
    }

    return response.json() as Promise<{
      id: string;
      email: string;
      name: string;
      profile_image: string;
      email_verified: boolean;
      theme: string;
      provider: string;
    }>;
  },

  deleteProfileImage: async () => {
    return apiClient.delete<{
      id: string;
      email: string;
      name: string;
      profile_image: string;
      email_verified: boolean;
      theme: string;
      provider: string;
    }>("/users/me/profile-image");
  },

  getMyTasks: async (filter: "today" | "week" | "overdue" = "today") => {
    return apiClient.get<MyTasksResponse>(`/users/me/tasks?filter=${filter}`);
  },
};

export interface MyTasksBoardGroup {
  board_id: string;
  board_name: string;
  board_type?: string;
  tasks: Array<{
    id: string;
    title: string;
    due_date: string | null;
    is_completed: boolean;
    block_name: string;
    feature_title: string;
    feature_color: string;
  }>;
}

export interface MyTasksResponse {
  boards: MyTasksBoardGroup[];
  total_count: number;
  filter: string;
}

// ========================================
// Board API
// ========================================

export const boardAPI = {
  getBoards: async () => {
    return apiClient.get<BoardListItem[]>("/boards");
  },

  getBoard: async (boardId: string) => {
    return apiClient.get<BoardDetail>(`/boards/${boardId}`);
  },

  createBoard: async (data: {
    name: string;
    description?: string;
    background_gradient?: string;
  }) => {
    return apiClient.post<BoardDetail>("/boards", data);
  },

  updateBoard: async (
    boardId: string,
    data: { name?: string; description?: string; background_gradient?: string },
  ) => {
    return apiClient.put<BoardDetail>(`/boards/${boardId}`, data);
  },

  deleteBoard: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(`/boards/${boardId}`);
  },

  toggleStar: async (boardId: string) => {
    return apiClient.patch<{ board_id: string; is_starred: boolean }>(
      `/boards/${boardId}/star`,
    );
  },

  updateSelectedMilestone: async (
    boardId: string,
    milestoneId: string | null,
  ) => {
    return apiClient.patch<BoardDetail>(
      `/boards/${boardId}/selected-milestone`,
      {
        milestone_id: milestoneId,
      },
    );
  },

  getBoardTier: async (boardId: string) => {
    return apiClient.get<BoardTierResponse>(`/boards/${boardId}/tier`);
  },

  getBoardLimits: async (boardId: string) => {
    return apiClient.get<BoardLimitsResponse>(`/boards/${boardId}/limits`);
  },

  /**
   * 보드 진입 시 필요한 모든 데이터를 한 번에 조회
   * 기존 13개 개별 API 호출을 1개로 통합하여 서버 부하 감소
   */
  getBoardFull: async (boardId: string) => {
    return apiClient.get<BoardFullResponse>(`/boards/${boardId}/full`);
  },

  moveTask: async (taskId: string, data: TaskMoveRequest) => {
    return apiClient.post<void>(`/tasks/${taskId}/move`, data);
  },

  copyTask: async (taskId: string, data: TaskMoveRequest) => {
    return apiClient.post<void>(`/tasks/${taskId}/copy`, data);
  },
};

// ========================================
// Board Join Request API
// ========================================

export const boardJoinRequestAPI = {
  create: async (boardId: string, data?: { message?: string }) => {
    return apiClient.post<import("../types").BoardJoinRequest>(
      `/boards/${boardId}/join-requests`,
      data || {},
    );
  },

  list: async (boardId: string) => {
    return apiClient.get<{ requests: import("../types").BoardJoinRequest[] }>(
      `/boards/${boardId}/join-requests`,
    );
  },

  approve: async (boardId: string, requestId: string) => {
    return apiClient.patch<import("../types").BoardJoinRequest>(
      `/boards/${boardId}/join-requests/${requestId}/approve`,
    );
  },

  reject: async (boardId: string, requestId: string) => {
    return apiClient.patch<import("../types").BoardJoinRequest>(
      `/boards/${boardId}/join-requests/${requestId}/reject`,
    );
  },
};

// ========================================
// Block API
// ========================================

export const blockAPI = {
  getBlocks: async (boardId: string, milestoneId?: string) => {
    const query = milestoneId ? `?milestoneId=${milestoneId}` : "";
    return apiClient.get<{
      blocks: BlockResponse[];
      hidden_blocks?: BlockResponse[];
    }>(`/boards/${boardId}/blocks${query}`);
  },

  createBlock: async (
    boardId: string,
    data: { name: string; color: string; milestone_id?: string },
  ) => {
    return apiClient.post<BlockResponse>(`/boards/${boardId}/blocks`, data);
  },

  updateBlock: async (
    boardId: string,
    blockId: string,
    data: { name?: string; color?: string; show_progress_bar?: boolean },
  ) => {
    return apiClient.put<BlockResponse>(
      `/boards/${boardId}/blocks/${blockId}`,
      data,
    );
  },

  deleteBlock: async (boardId: string, blockId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/blocks/${blockId}`,
    );
  },

  reorderBlocks: async (boardId: string, blockIds: string[]) => {
    return apiClient.put<{ blocks: BlockResponse[] }>(
      `/boards/${boardId}/blocks/reorder`,
      {
        block_ids: blockIds,
      },
    );
  },
};

// ========================================
// Milestone Block Visibility API
// ========================================

export const milestoneBlockAPI = {
  toggleVisibility: async (
    boardId: string,
    milestoneId: string,
    blockId: string,
    hidden: boolean,
  ) => {
    return apiClient.put<void>(
      `/boards/${boardId}/milestones/${milestoneId}/blocks/${blockId}/visibility`,
      { hidden },
    );
  },
};

// ========================================
// Feature API
// ========================================

export const featureAPI = {
  getFeatures: async (boardId: string, milestoneId?: string) => {
    const query = milestoneId ? `?milestoneId=${milestoneId}` : "";
    return apiClient.get<{ features: FeatureResponse[] }>(
      `/boards/${boardId}/features${query}`,
    );
  },

  getFeature: async (boardId: string, featureId: string) => {
    return apiClient.get<FeatureResponse>(
      `/boards/${boardId}/features/${featureId}`,
    );
  },

  createFeature: async (
    boardId: string,
    data: {
      title: string;
      description?: string;
      color?: string;
      assignee_id?: string;
      start_date?: string;
      due_date?: string;
    },
  ) => {
    return apiClient.post<FeatureResponse>(`/boards/${boardId}/features`, data);
  },

  updateFeature: async (
    boardId: string,
    featureId: string,
    data: {
      title?: string;
      description?: string;
      color?: string;
      assignee_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
    },
  ) => {
    return apiClient.put<FeatureResponse>(
      `/boards/${boardId}/features/${featureId}`,
      data,
    );
  },

  deleteFeature: async (
    boardId: string,
    featureId: string,
    data?: {
      task_migrations?: Array<{ task_id: string; target_feature_id: string }>;
    },
  ) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/features/${featureId}`,
      data,
    );
  },

  reorderFeatures: async (boardId: string, featureIds: string[]) => {
    return apiClient.put<{ features: FeatureResponse[] }>(
      `/boards/${boardId}/features/reorder`,
      {
        feature_ids: featureIds,
      },
    );
  },

  // Feature 태그 관리
  addTag: async (boardId: string, featureId: string, tagId: string) => {
    return apiClient.post<TagResponse[]>(
      `/boards/${boardId}/features/${featureId}/tags`,
      {
        tag_id: tagId,
      },
    );
  },

  removeTag: async (boardId: string, featureId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/features/${featureId}/tags/${tagId}`,
    );
  },

  aiDecompose: async (
    boardId: string,
    featureId: string,
    language?: string,
  ) => {
    const params = language ? `?language=${language}` : "";
    return apiClient.post<FeatureAIDecompositionResponse>(
      `/boards/${boardId}/features/${featureId}/ai/decompose${params}`,
    );
  },

  aiApply: async (
    boardId: string,
    featureId: string,
    data: FeatureAIApplyRequest,
  ) => {
    return apiClient.post<FeatureAIApplyResult>(
      `/boards/${boardId}/features/${featureId}/ai/apply`,
      data,
    );
  },
};

// ========================================
// 마인드맵 API (보드당 1건)
// ========================================
import type { MindMapDocument, MiniKanbanDocument } from "../types";

export const mindMapAPI = {
  get: async (boardId: string) => {
    return apiClient.get<MindMapDocument>(`/boards/${boardId}/mindmap`);
  },
  save: async (boardId: string, doc: MindMapDocument) => {
    return apiClient.put<MindMapDocument>(`/boards/${boardId}/mindmap`, doc);
  },
};

// ========================================
// 미니 칸반 레이아웃 API (보드당 1건)
// ========================================
export const miniKanbanAPI = {
  get: async (boardId: string) => {
    return apiClient.get<MiniKanbanDocument>(`/boards/${boardId}/mini-kanban`);
  },
  save: async (boardId: string, doc: MiniKanbanDocument) => {
    return apiClient.put<MiniKanbanDocument>(
      `/boards/${boardId}/mini-kanban`,
      doc,
    );
  },
};

// ========================================
// Task API
// ========================================

export const taskAPI = {
  getTasks: async (
    boardId: string,
    params?: { block_id?: string; feature_id?: string; milestone_id?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.block_id) query.set("blockId", params.block_id);
    if (params?.feature_id) query.set("featureId", params.feature_id);
    if (params?.milestone_id) query.set("milestoneId", params.milestone_id);
    const queryString = query.toString();
    return apiClient.get<{ tasks: TaskResponse[] }>(
      `/boards/${boardId}/tasks${queryString ? `?${queryString}` : ""}`,
    );
  },

  getTask: async (boardId: string, taskId: string) => {
    return apiClient.get<TaskResponse>(`/boards/${boardId}/tasks/${taskId}`);
  },

  // 사람이 읽는 태스크 키(예: STORY-42) 해석 → { board_id, task_id }
  resolveKey: async (key: string) => {
    return apiClient.get<{ board_id: string; task_id: string }>(
      `/task-keys/${encodeURIComponent(key)}`,
    );
  },

  createTask: async (
    boardId: string,
    featureId: string,
    data: {
      title: string;
      description?: string;
      // v7.0: assignee_id 제거 - ChecklistItem에서 담당자 설정
      start_date?: string;
      due_date?: string;
      estimated_minutes?: number;
      milestone_id?: string | null;
    },
  ) => {
    return apiClient.post<TaskResponse>(
      `/boards/${boardId}/features/${featureId}/tasks`,
      data,
    );
  },

  updateTask: async (
    boardId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      // v7.0: assignee_id 제거 - ChecklistItem에서 담당자 설정
      start_date?: string | null;
      due_date?: string | null;
      estimated_minutes?: number | null;
    },
  ) => {
    return apiClient.put<TaskResponse>(
      `/boards/${boardId}/tasks/${taskId}`,
      data,
    );
  },

  updateTaskDates: async (
    boardId: string,
    taskId: string,
    data: {
      start_date?: string | null;
      end_date?: string | null;
    },
  ) => {
    return apiClient.put<TaskResponse>(
      `/boards/${boardId}/tasks/${taskId}/dates`,
      data,
    );
  },

  deleteTask: async (boardId: string, taskId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}`,
    );
  },

  saveBaseline: async (boardId: string) => {
    return apiClient.post<{ message: string }>(
      `/boards/${boardId}/tasks/save-baseline`,
    );
  },

  clearBaseline: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/baseline`,
    );
  },

  moveTask: async (
    boardId: string,
    taskId: string,
    data: { target_block_id: string; position: number },
  ) => {
    return apiClient.put<TaskResponse>(
      `/boards/${boardId}/tasks/${taskId}/move`,
      data,
    );
  },

  moveTaskToFeature: async (
    boardId: string,
    taskId: string,
    data: { target_feature_id: string },
  ) => {
    return apiClient.put<TaskResponse>(
      `/boards/${boardId}/tasks/${taskId}/move-feature`,
      data,
    );
  },

  // 피처 내 서브태스크 순서 변경
  reorderFeatureTasks: async (
    boardId: string,
    featureId: string,
    taskIds: string[],
  ) => {
    return apiClient.put<{ message: string }>(
      `/boards/${boardId}/features/${featureId}/tasks/reorder`,
      {
        task_ids: taskIds,
      },
    );
  },

  // Task 태그 관리
  addTag: async (boardId: string, taskId: string, tagId: string) => {
    return apiClient.post<TagResponse[]>(
      `/boards/${boardId}/tasks/${taskId}/tags`,
      {
        tag_id: tagId,
      },
    );
  },

  removeTag: async (boardId: string, taskId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}/tags/${tagId}`,
    );
  },
};

// ========================================
// Tag API
// ========================================

export const tagAPI = {
  getTags: async (boardId: string) => {
    return apiClient.get<{ tags: TagResponse[] }>(`/boards/${boardId}/tags`);
  },

  createTag: async (boardId: string, data: { name: string; color: string }) => {
    return apiClient.post<TagResponse>(`/boards/${boardId}/tags`, data);
  },

  updateTag: async (
    boardId: string,
    tagId: string,
    data: { name?: string; color?: string },
  ) => {
    return apiClient.put<TagResponse>(`/boards/${boardId}/tags/${tagId}`, data);
  },

  deleteTag: async (boardId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tags/${tagId}`,
    );
  },
};

// ========================================
// Mention Group API
// ========================================

export interface MentionGroupMemberInfo {
  user_id: string;
  name: string;
  profile_image: string | null;
}

export interface MentionGroupDetail {
  id: string;
  name: string;
  members: MentionGroupMemberInfo[];
  created_at: string;
}

export const mentionGroupAPI = {
  getGroups: async (boardId: string) => {
    return apiClient.get<{ groups: MentionGroupDetail[] }>(
      `/boards/${boardId}/mention-groups`,
    );
  },

  createGroup: async (
    boardId: string,
    data: { name: string; member_ids: string[] },
  ) => {
    return apiClient.post<MentionGroupDetail>(
      `/boards/${boardId}/mention-groups`,
      data,
    );
  },

  updateGroup: async (
    boardId: string,
    groupId: string,
    data: { name: string; member_ids: string[] },
  ) => {
    return apiClient.put<MentionGroupDetail>(
      `/boards/${boardId}/mention-groups/${groupId}`,
      data,
    );
  },

  deleteGroup: async (boardId: string, groupId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/mention-groups/${groupId}`,
    );
  },
};

// ========================================
// Checklist API
// ========================================

// Batch Checklist Response
export interface BatchChecklistResponse {
  [taskId: string]: ChecklistResponse;
}

export const checklistAPI = {
  getChecklist: async (boardId: string, taskId: string) => {
    return apiClient.get<ChecklistResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist`,
    );
  },

  getBatchChecklists: async (boardId: string, taskIds: string[]) => {
    return apiClient.post<BatchChecklistResponse>(
      `/boards/${boardId}/checklist-items/batch`,
      { task_ids: taskIds },
    );
  },

  addItem: async (
    boardId: string,
    taskId: string,
    data: {
      title: string;
      assignee_id?: string | null;
      contractor_id?: string | null;
      start_date?: string;
      due_date?: string;
    },
  ) => {
    return apiClient.post<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist`,
      data,
    );
  },

  updateItem: async (
    boardId: string,
    taskId: string,
    itemId: string,
    data: {
      title?: string;
      assignee_id?: string | null;
      contractor_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
    },
  ) => {
    return apiClient.put<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}`,
      data,
    );
  },

  // 부분 업데이트: payload에 포함된 키만 서버에서 갱신.
  // 키가 없으면 기존 값 보존, 키가 있고 값이 null이면 명시적 클리어.
  patchItem: async (
    boardId: string,
    taskId: string,
    itemId: string,
    data: {
      title?: string;
      assignee_id?: string | null;
      contractor_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
    },
  ) => {
    return apiClient.patch<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}`,
      data,
    );
  },

  deleteItem: async (boardId: string, taskId: string, itemId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}`,
    );
  },

  toggleItem: async (boardId: string, taskId: string, itemId: string) => {
    return apiClient.patch<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}/toggle`,
    );
  },

  moveToTask: async (
    boardId: string,
    taskId: string,
    itemId: string,
    data: { target_task_id: string },
  ) => {
    return apiClient.put<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}/move-task`,
      data,
    );
  },

  reorderItems: async (
    boardId: string,
    taskId: string,
    data: { item_ids: string[] },
  ) => {
    return apiClient.put<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}/checklist/reorder`,
      data,
    );
  },

  // 체크리스트 병합: source_ids 항목들의 타임블록을 target_id(대표)로 모으고 소스는 삭제.
  // title/start_date/due_date 미지정 시 서버가 대표 값 유지 + 기간 자동 확장.
  mergeItems: async (
    boardId: string,
    taskId: string,
    data: {
      target_id: string;
      source_ids: string[];
      title?: string;
      start_date?: string | null;
      due_date?: string | null;
    },
  ) => {
    return apiClient.post<ChecklistItemResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/merge`,
      data,
    );
  },

  aiDecompose: async (boardId: string, taskId: string, language?: string) => {
    const params = language ? `?language=${language}` : "";
    return apiClient.post<ChecklistAIDecompositionResponse>(
      `/boards/${boardId}/tasks/${taskId}/checklist/ai/decompose${params}`,
    );
  },

  aiApply: async (
    boardId: string,
    taskId: string,
    data: ChecklistAIApplyRequest,
  ) => {
    return apiClient.post<ChecklistAIApplyResult>(
      `/boards/${boardId}/tasks/${taskId}/checklist/ai/apply`,
      data,
    );
  },
};

// ========================================
// Comment API
// ========================================

export interface CommentAttachmentResponse {
  id: string;
  file_name: string;
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  file_size: number;
  created_at: string;
}

export interface CommentReactionResponse {
  emoji: string;
  image_url: string | null;
  is_custom: boolean;
  count: number;
  users: { id: string; name: string }[];
}

export interface CommentDetailResponse {
  id: string;
  task_id: string;
  author: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  content: string;
  mentions: string[];
  attachments: CommentAttachmentResponse[];
  reactions: CommentReactionResponse[];
  created_at: string;
  updated_at: string;
}

export interface ReactionsToggleResponse {
  reactions: CommentReactionResponse[];
}

export interface CommentListResponse {
  comments: CommentDetailResponse[];
  total_count: number;
}

export interface CommentSummaryItem {
  id: string;
  task_id: string;
  task_title: string;
  content: string;
  created_at: string;
}

export interface CommentSummaryResponse {
  comments: CommentSummaryItem[];
  total_count: number;
}

export interface MentionSummaryItem {
  id: string;
  task_id: string;
  task_title: string;
  content: string;
  author_name: string | null;
  created_at: string;
}

export interface MentionSummaryResponse {
  comments: MentionSummaryItem[];
  total_count: number;
}

// ========================================
// File Upload API
// ========================================

export const fileAPI = {
  /**
   * Presigned URL 요청 (S3 모드에서만)
   * mode="direct"이면 presigned 미지원 → upload() 사용
   */
  presign: async (data: {
    fileName: string;
    contentType: string;
    fileSize: number;
  }) => {
    return apiClient.post<{
      mode: string;
      tempKey?: string;
      uploadUrl?: string;
      message?: string;
    }>("/files/presign", {
      file_name: data.fileName,
      content_type: data.contentType,
      file_size: data.fileSize,
    });
  },

  /**
   * 서버 직접 업로드 (Local/S3 모두 지원)
   * 인증된 multipart 요청
   */
  upload: async (
    file: File,
  ): Promise<{ tempKey: string; previewUrl: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authenticatedFetch(`${API_BASE_URL}/files/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        code: "UNKNOWN",
        message: response.statusText,
      }));
      throw errData;
    }

    return response.json();
  },

  /**
   * 파일 업로드 (presigned URL 시도 → fallback: 직접 업로드)
   * 항상 tempKey를 반환
   */
  smartUpload: async (
    file: File,
  ): Promise<{ tempKey: string; previewUrl: string }> => {
    try {
      // 1. presigned URL 시도
      const presign = await fileAPI.presign({
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      if (
        presign.mode === "presigned" &&
        presign.uploadUrl &&
        presign.tempKey
      ) {
        // 2. S3에 직접 업로드
        const putResponse = await fetch(presign.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (putResponse.ok) {
          return {
            tempKey: presign.tempKey,
            previewUrl: URL.createObjectURL(file), // 로컬 미리보기
          };
        }
        // presigned 실패 시 fallback
      }
    } catch {
      // presign 실패 → fallback
    }

    // Fallback: 서버 직접 업로드
    return fileAPI.upload(file);
  },

  uploadNote: async (
    file: File,
    scope:
      { boardId: string } | { organizationId: string } | { personal: true },
  ): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    const param =
      "boardId" in scope
        ? `boardId=${encodeURIComponent(scope.boardId)}`
        : "organizationId" in scope
          ? `organizationId=${encodeURIComponent(scope.organizationId)}`
          : `personal=true`;

    const response = await authenticatedFetch(
      `${API_BASE_URL}/files/upload-note?${param}`,
      { method: "POST", body: formData },
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        code: "UNKNOWN",
        message: response.statusText,
      }));
      throw errData;
    }

    return response.json();
  },
};

// ========================================
// Comment API
// ========================================

export const commentAPI = {
  getComments: async (boardId: string, taskId: string) => {
    return apiClient.get<CommentListResponse>(
      `/boards/${boardId}/tasks/${taskId}/comments`,
    );
  },

  createComment: async (
    boardId: string,
    taskId: string,
    data: {
      content: string;
      mentions?: string[];
      fileKeys?: string[];
      parentId?: string;
    },
  ) => {
    return apiClient.post<CommentDetailResponse>(
      `/boards/${boardId}/tasks/${taskId}/comments`,
      {
        content: data.content,
        mentions: data.mentions,
        file_keys: data.fileKeys,
        parent_id: data.parentId,
      },
    );
  },

  updateComment: async (
    boardId: string,
    taskId: string,
    commentId: string,
    data: {
      content: string;
      mentions?: string[];
      keepAttachmentIds?: string[];
      newFileKeys?: string[];
    },
  ) => {
    return apiClient.put<CommentDetailResponse>(
      `/boards/${boardId}/tasks/${taskId}/comments/${commentId}`,
      {
        content: data.content,
        mentions: data.mentions,
        keep_attachment_ids: data.keepAttachmentIds,
        new_file_keys: data.newFileKeys,
      },
    );
  },

  deleteComment: async (boardId: string, taskId: string, commentId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}/comments/${commentId}`,
    );
  },

  deleteAttachment: async (
    boardId: string,
    taskId: string,
    commentId: string,
    attachmentId: string,
  ) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/tasks/${taskId}/comments/${commentId}/attachments/${attachmentId}`,
    );
  },

  getCommentSummary: async (
    boardId: string,
    authorId: string,
    startDate: string,
    endDate: string,
  ) => {
    return apiClient.get<CommentSummaryResponse>(
      `/boards/${boardId}/comments/summary?authorId=${authorId}&startDate=${startDate}&endDate=${endDate}`,
    );
  },

  getCommentMentions: async (
    boardId: string,
    mentionedUserId: string,
    startDate: string,
    endDate: string,
  ) => {
    return apiClient.get<MentionSummaryResponse>(
      `/boards/${boardId}/comments/mentions?mentionedUserId=${mentionedUserId}&startDate=${startDate}&endDate=${endDate}`,
    );
  },

  toggleReaction: async (
    boardId: string,
    taskId: string,
    commentId: string,
    emoji: string,
  ) => {
    return apiClient.post<ReactionsToggleResponse>(
      `/boards/${boardId}/tasks/${taskId}/comments/${commentId}/reactions/toggle`,
      { emoji },
    );
  },

  aiSummarize: async (boardId: string, taskId: string, language?: string) => {
    const params = language ? `?language=${language}` : "";
    return apiClient.post<CommentAISummaryResponse>(
      `/boards/${boardId}/tasks/${taskId}/comments/ai/summarize${params}`,
    );
  },
};

// ========================================
// Custom Emoji API
// ========================================

export interface CustomEmojiDetail {
  id: string;
  name: string;
  image_url: string;
  content_type: string;
  file_size: number;
  uploaded_by: { id: string; name: string };
  created_at: string;
}

export interface CustomEmojiListResponse {
  emojis: CustomEmojiDetail[];
}

// ========================================
// Board Resource API
// ========================================

export interface BoardResourceListResponse {
  resources: import("../types").BoardResource[];
  total_count: number;
}

export const boardResourceAPI = {
  getResources: async (boardId: string) => {
    return apiClient.get<BoardResourceListResponse>(
      `/boards/${boardId}/resources`,
    );
  },

  createResource: async (
    boardId: string,
    data: { title: string; url: string; description?: string },
  ) => {
    return apiClient.post<import("../types").BoardResource>(
      `/boards/${boardId}/resources`,
      data,
    );
  },

  updateResource: async (
    boardId: string,
    resourceId: string,
    data: { title: string; url: string; description?: string },
  ) => {
    return apiClient.put<import("../types").BoardResource>(
      `/boards/${boardId}/resources/${resourceId}`,
      data,
    );
  },

  deleteResource: async (boardId: string, resourceId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/resources/${resourceId}`,
    );
  },

  reorderResources: async (boardId: string, resourceIds: string[]) => {
    return apiClient.put<BoardResourceListResponse>(
      `/boards/${boardId}/resources/reorder`,
      { resource_ids: resourceIds },
    );
  },

  refreshFavicons: async (boardId: string) => {
    return apiClient.post<BoardResourceListResponse>(
      `/boards/${boardId}/resources/refresh-favicons`,
    );
  },
};

export const customEmojiAPI = {
  getEmojis: async (boardId: string) => {
    return apiClient.get<CustomEmojiListResponse>(
      `/boards/${boardId}/custom-emojis`,
    );
  },

  uploadEmoji: async (boardId: string, name: string, file: File) => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", file);
    return apiClient.post<CustomEmojiDetail>(
      `/boards/${boardId}/custom-emojis`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
  },

  deleteEmoji: async (boardId: string, emojiId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/custom-emojis/${emojiId}`,
    );
  },
};

// ========================================
// Member API
// ========================================

export const memberAPI = {
  getMembers: async (boardId: string) => {
    return apiClient.get<MembersListResponse>(`/boards/${boardId}/members`);
  },

  inviteMember: async (
    boardId: string,
    data: { email: string; role: "ADMIN" | "MEMBER" | "VIEWER" },
  ) => {
    return apiClient.post<InviteResultResponse>(
      `/boards/${boardId}/members/invite`,
      data,
    );
  },

  updateMemberRole: async (
    boardId: string,
    memberId: string,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ) => {
    return apiClient.put<MemberResponse>(
      `/boards/${boardId}/members/${memberId}/role`,
      { role },
    );
  },

  removeMember: async (boardId: string, memberId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/members/${memberId}`,
    );
  },

  updateMemberColor: async (
    boardId: string,
    memberId: string,
    assigneeColor: string | null,
  ) => {
    return apiClient.put<MemberResponse>(
      `/boards/${boardId}/members/${memberId}/color`,
      { assignee_color: assigneeColor },
    );
  },

  updateMemberJobRole: async (
    boardId: string,
    memberId: string,
    jobRoleId: string | null,
  ) => {
    return apiClient.put<MemberResponse>(
      `/boards/${boardId}/members/${memberId}/job-role`,
      { job_role_id: jobRoleId },
    );
  },

  reorderMembers: async (boardId: string, memberIds: string[]) => {
    return apiClient.put<MembersListResponse>(
      `/boards/${boardId}/members/reorder`,
      { member_ids: memberIds },
    );
  },

  getOrgCandidates: async (
    boardId: string,
    search?: string,
  ): Promise<import("../types").OrgBoardCandidate[]> => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiClient.get(`/boards/${boardId}/members/org-candidates${params}`);
  },

  transferOwnership: async (boardId: string, newOwnerUserId: string) => {
    return apiClient.post(`/boards/${boardId}/members/transfer-ownership`, {
      new_owner_user_id: newOwnerUserId,
    });
  },
};

// ========================================
// Job Role API
// ========================================

export const jobRoleAPI = {
  list: async (boardId: string) => {
    return apiClient.get<JobRolesListResponse>(`/boards/${boardId}/job-roles`);
  },

  create: async (
    boardId: string,
    data: { name: string; color?: string | null; icon?: string | null },
  ) => {
    return apiClient.post<JobRoleResponse>(
      `/boards/${boardId}/job-roles`,
      data,
    );
  },

  update: async (
    boardId: string,
    roleId: string,
    data: { name?: string; color?: string | null; icon?: string | null },
  ) => {
    return apiClient.put<JobRoleResponse>(
      `/boards/${boardId}/job-roles/${roleId}`,
      data,
    );
  },

  remove: async (boardId: string, roleId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/job-roles/${roleId}`,
    );
  },

  reorder: async (boardId: string, ids: string[]) => {
    return apiClient.put<JobRolesListResponse>(
      `/boards/${boardId}/job-roles/reorder`,
      { ids },
    );
  },
};

// ========================================
// Contractor API (외주)
// ========================================

export const contractorAPI = {
  list: async (boardId: string) => {
    return apiClient.get<ContractorsListResponse>(
      `/boards/${boardId}/contractors`,
    );
  },

  create: async (
    boardId: string,
    data: {
      name: string;
      manager_member_id: string;
      job_role_id?: string | null;
      color?: string | null;
      start_date?: string | null;
      end_date?: string | null;
    },
  ) => {
    return apiClient.post<ContractorResponse>(
      `/boards/${boardId}/contractors`,
      data,
    );
  },

  update: async (
    boardId: string,
    contractorId: string,
    data: {
      name?: string;
      manager_member_id?: string;
      job_role_id?: string | null;
      color?: string | null;
    },
  ) => {
    return apiClient.put<ContractorResponse>(
      `/boards/${boardId}/contractors/${contractorId}`,
      data,
    );
  },

  remove: async (boardId: string, contractorId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/contractors/${contractorId}`,
    );
  },

  setHidden: async (boardId: string, contractorId: string, hidden: boolean) => {
    return apiClient.put<ContractorResponse>(
      `/boards/${boardId}/contractors/${contractorId}/visibility`,
      { hidden },
    );
  },

  reorder: async (boardId: string, ids: string[]) => {
    return apiClient.put<ContractorsListResponse>(
      `/boards/${boardId}/contractors/reorder`,
      { ids },
    );
  },

  // ─── 계약 기간(periods) — 갱신/연장 ───
  addPeriod: async (
    boardId: string,
    contractorId: string,
    data: { start_date?: string | null; end_date?: string | null },
  ) => {
    return apiClient.post<ContractorResponse>(
      `/boards/${boardId}/contractors/${contractorId}/periods`,
      data,
    );
  },

  updatePeriod: async (
    boardId: string,
    contractorId: string,
    periodId: string,
    data: {
      start_date?: string | null;
      end_date?: string | null;
      clear_start_date?: boolean;
      clear_end_date?: boolean;
    },
  ) => {
    return apiClient.put<ContractorResponse>(
      `/boards/${boardId}/contractors/${contractorId}/periods/${periodId}`,
      data,
    );
  },

  deletePeriod: async (
    boardId: string,
    contractorId: string,
    periodId: string,
  ) => {
    return apiClient.delete<ContractorResponse>(
      `/boards/${boardId}/contractors/${contractorId}/periods/${periodId}`,
    );
  },
};

// ========================================
// Invite Link API
// ========================================

export const inviteLinkAPI = {
  getInviteLinks: async (boardId: string) => {
    return apiClient.get<{ invites: InviteLinkResponse[] }>(
      `/boards/${boardId}/invites`,
    );
  },

  createInviteLink: async (
    boardId: string,
    data: {
      role: "ADMIN" | "MEMBER" | "VIEWER";
      max_uses?: number | null;
      expires_in_hours?: number | null;
    },
  ) => {
    return apiClient.post<InviteLinkResponse>(
      `/boards/${boardId}/invites`,
      data,
    );
  },

  deleteInviteLink: async (boardId: string, inviteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/invites/${inviteId}`,
    );
  },

  getInviteLinkInfo: async (code: string) => {
    return apiClient.get<InviteLinkInfoResponse>(`/invites/${code}`, true);
  },

  acceptInvite: async (code: string) => {
    return apiClient.post<{
      board_id: string;
      board_name: string;
      role: string;
      message: string;
    }>(`/invites/${code}/accept`);
  },
};

// ========================================
// Activity API
// ========================================

export const activityAPI = {
  getActivities: async (
    boardId: string,
    params?: { cursor?: string; limit?: number },
  ) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", params.limit.toString());
    const queryString = query.toString();
    return apiClient.get<ActivitiesResponse>(
      `/boards/${boardId}/activities${queryString ? `?${queryString}` : ""}`,
    );
  },

  // 특정 대상(체크리스트 항목 등)의 변경 이력 조회 — 최신순 정렬
  getTargetActivities: async (
    boardId: string,
    targetType: string,
    targetId: string,
  ) => {
    return apiClient.get<ActivityLogResponse[]>(
      `/boards/${boardId}/activities/target/${targetType}/${targetId}`,
    );
  },
};

// ========================================
// Subscription API
// ========================================

export const subscriptionAPI = {
  getSubscription: async (boardId: string) => {
    return apiClient.get<SubscriptionResponse>(
      `/boards/${boardId}/subscription`,
    );
  },

  // Seat 가격 조회
  getSeatPricing: async (boardId: string) => {
    return apiClient.get<SeatPricingResponse>(
      `/boards/${boardId}/subscription/pricing`,
    );
  },

  changePlan: async (
    boardId: string,
    data: { billing_cycle: "MONTHLY" | "YEARLY" },
  ) => {
    return apiClient.put<SubscriptionResponse>(
      `/boards/${boardId}/subscription/plan`,
      data,
    );
  },

  purchaseSeats: async (
    boardId: string,
    data: { additional_seats: number },
  ) => {
    return apiClient.post<SubscriptionResponse>(
      `/boards/${boardId}/subscription/seats`,
      data,
    );
  },

  cancelSubscription: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/subscription`,
    );
  },

  undoCancellation: async (boardId: string) => {
    return apiClient.post<{ message: string }>(
      `/boards/${boardId}/subscription/undo-cancel`,
    );
  },

  getBillingPortalUrl: async (boardId: string) => {
    return apiClient.get<{ url: string }>(
      `/boards/${boardId}/subscription/billing-portal`,
    );
  },

  // Polar Checkout - 보드 구독 시작
  createBoardCheckout: async (data: {
    board_id: string;
    billing_cycle: "MONTHLY" | "YEARLY";
    seat_count: number;
  }) => {
    return apiClient.post<{ checkout_url: string }>(
      "/checkout/board-subscription",
      data,
    );
  },

  // Polar Checkout - 조직 구독
  createOrgCheckout: async (data: {
    org_id: string;
    billing_cycle: "MONTHLY" | "YEARLY";
    seat_count: number;
  }) => {
    return apiClient.post<{ checkout_url: string }>(
      "/checkout/org-subscription",
      data,
    );
  },

  // Polar Checkout - 시트 추가 구매
  createSeatCheckout: async (data: {
    board_id: string;
    additional_seats: number;
  }) => {
    return apiClient.post<{ checkout_url: string }>("/checkout/seats", data);
  },

  // Polar Checkout - AI 크레딧 구매
  createCreditCheckout: async (data: {
    board_id: string;
    credit_amount: number;
  }) => {
    return apiClient.post<{ checkout_url: string }>(
      "/checkout/ai-credits",
      data,
    );
  },
};

// ========================================
// Pricing API
// ========================================

export const pricingAPI = {
  getPlans: async () => {
    return apiClient.get<PricingResponse>("/pricing", true);
  },
};

// ========================================
// Schedule Types (snake_case - matches backend Jackson config)
// ========================================

export interface ScheduleSettingsResponse {
  work_hours_per_day: number;
  work_start_time: string; // "HH:mm:ss" format
  schedule_display_mode: "TIME" | "BLOCK";
  break_start_time: string | null; // "HH:mm:ss" or null
  break_end_time: string | null; // "HH:mm:ss" or null
}

export interface ScheduleUserInfo {
  id: string;
  name: string;
  profile_image: string | null;
}

export interface ScheduleChecklistItemInfo {
  id: string;
  title: string;
  completed: boolean;
  start_date: string | null;
  due_date: string | null;
}

export interface ScheduleTaskInfo {
  id: string;
  title: string;
}

export interface ScheduleFeatureInfo {
  id: string;
  title: string;
  color: string;
}

// Meeting types
export interface MeetingInfo {
  id: string;
  title: string;
  color: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  color: string;
  participant_count: number;
  recurrence_rule: string | null;
  recurrence_group_id: string | null;
  recurrence_end_date: string | null;
}

export interface DiarizedSegment {
  speaker: string;
  text: string;
  order: number;
}

export interface DiarizedTranscript {
  segments: DiarizedSegment[];
  speaker_mapping: Record<string, string | null>;
}

export interface SpeakerMappingResult {
  meeting_id: string;
  speaker_mapping: Record<string, string | null>;
}

export interface MeetingDetail {
  id: string;
  title: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  transcript: string | null;
  color: string;
  recurrence_rule: string | null;
  recurrence_group_id: string | null;
  recurrence_end_date: string | null;
  created_by: { id: string; name: string; profile_image: string | null };
  participants: { id: string; name: string; profile_image: string | null }[];
  ai_suggestions: AISuggestionResponse | null;
  diarized_transcript: DiarizedTranscript | null;
  created_at: string;
  updated_at: string | null;
}

export interface TranscriptResult {
  meeting_id: string;
  transcript: string;
  diarized_transcript: DiarizedTranscript | null;
}

export interface AISummaryTopic {
  topic: string;
  important: boolean;
  points?: string[];
  decisions?: string[];
  discussions?: string[];
  action_items?: string[];
}

export interface AISuggestionResponse {
  meeting_id: string;
  meeting_title: string;
  key_points: string[];
  summary: AISummaryTopic[];
  features: AIFeatureSuggestion[];
}

export interface AIFeatureSuggestion {
  type: "NEW" | "EXISTING";
  feature_id: string | null;
  title: string;
  description: string | null;
  color: string | null;
  tasks: AITaskSuggestion[];
}

export interface AITaskSuggestion {
  title: string;
  description: string | null;
  checklists: AIChecklistSuggestion[];
}

export interface AIChecklistSuggestion {
  title: string;
}

export interface AIApplyRequest {
  features: AIFeatureSuggestionApply[];
}

export interface AIFeatureSuggestionApply {
  type: "NEW" | "EXISTING";
  feature_id?: string;
  title?: string;
  description?: string;
  color?: string;
  tasks: AITaskSuggestionApply[];
}

export interface AITaskSuggestionApply {
  title: string;
  description?: string;
  checklists: { title: string }[];
}

export interface AIApplyResult {
  features_created: number;
  tasks_created: number;
  checklists_created: number;
  created_feature_ids: string[];
  created_task_ids: string[];
}

export interface ScheduleBlockInfo {
  id: string;
  start_time: string; // "HH:mm:ss" format
  end_time: string; // "HH:mm:ss" format
  checklist_item: ScheduleChecklistItemInfo | null;
  task: ScheduleTaskInfo | null;
  feature: ScheduleFeatureInfo | null;
  meeting: MeetingInfo | null;
  block_type: string | null;
  title: string | null;
  color: string | null;
  board_id?: string | null;
  board_name?: string | null;
}

export interface ScheduleColumnInfo {
  user: ScheduleUserInfo;
  blocks: ScheduleBlockInfo[];
  org_blocks?: ScheduleBlockInfo[] | null;
}

export interface DailyScheduleResponse {
  date: string;
  settings: ScheduleSettingsResponse;
  columns: ScheduleColumnInfo[];
}

export interface WeeklyScheduleResponse {
  start_date: string;
  end_date: string;
  settings: ScheduleSettingsResponse;
  days: {
    date: string;
    columns: ScheduleColumnInfo[];
  }[];
}

/**
 * Day 모드 통합 응답 (스케줄 + 데일리 체크리스트)
 * 2개 API 호출 → 1개로 통합
 */
export interface DailyFullResponse {
  date: string;
  settings: ScheduleSettingsResponse;
  columns: ScheduleColumnInfo[];
  daily_checklists: DailyChecklistColumnResponse[];
  meetings: MeetingSummary[];
}

export interface ScheduleBlockDetailResponse {
  id: string;
  assignee_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  checklist_item: ScheduleChecklistItemInfo | null;
  task: ScheduleTaskInfo | null;
  feature: ScheduleFeatureInfo | null;
  block_type: string | null;
  title: string | null;
  color: string | null;
}

export interface BoardChecklistItemResponse {
  id: string;
  title: string;
  completed: boolean;
  assignee: {
    id: string;
    name: string;
    profile_image: string | null;
  } | null;
  start_date: string | null;
  due_date: string | null;
  task: {
    id: string;
    title: string;
  } | null;
  feature: {
    id: string;
    title: string;
    color: string;
  } | null;
  block?: {
    id: string;
    name: string;
    color: string | null;
    position: number | null;
  } | null;
  milestone?: {
    id: string;
    title: string;
  } | null;
}

export interface BoardChecklistResponse {
  total: number;
  items: BoardChecklistItemResponse[];
}

// ChecklistItem by-assignee 조회 응답 타입 (UC-001)
export interface AssigneeItemResponse {
  id: string;
  title: string;
  completed: boolean;
  start_date: string | null;
  due_date: string | null;
  task: {
    id: string;
    title: string;
  } | null;
  feature: {
    id: string;
    title: string;
    color: string;
  } | null;
  block?: {
    id: string;
    name: string;
    color: string | null;
    position: number | null;
  } | null;
  milestone?: {
    id: string;
    title: string;
  } | null;
}

export interface AssigneeGroupResponse {
  assignee: {
    id: string;
    name: string;
    profile_image: string | null;
    job_role?: {
      id: string;
      name: string;
      color?: string | null;
      icon?: string | null;
    } | null;
  };
  items: AssigneeItemResponse[];
}

export interface ContractorGroupResponse {
  contractor: ContractorInfo;
  items: AssigneeItemResponse[];
}

export interface ChecklistByAssigneeResponse {
  assignees: AssigneeGroupResponse[];
  contractors?: ContractorGroupResponse[];
  unassigned: AssigneeItemResponse[];
}

// ========================================
// Schedule API
// ========================================

export const scheduleAPI = {
  getDailySchedule: async (
    boardId: string,
    date: string,
    assigneeIds?: string[],
  ) => {
    const query = new URLSearchParams();
    query.set("date", date);
    if (assigneeIds && assigneeIds.length > 0) {
      assigneeIds.forEach((id) => query.append("assigneeIds", id));
    }
    return apiClient.get<DailyScheduleResponse>(
      `/boards/${boardId}/schedules?${query.toString()}`,
    );
  },

  /**
   * 주간 스케줄 조회 (7일치 데이터 한 번에)
   * 기존 7개 API 호출 → 1개로 통합
   */
  getWeeklySchedule: async (
    boardId: string,
    startDate: string,
    endDate: string,
    assigneeIds?: string[],
    includeOrgSchedules?: boolean,
  ) => {
    const query = new URLSearchParams();
    query.set("startDate", startDate);
    query.set("endDate", endDate);
    if (assigneeIds && assigneeIds.length > 0) {
      assigneeIds.forEach((id) => query.append("assigneeIds", id));
    }
    if (includeOrgSchedules) {
      query.set("includeOrgSchedules", "true");
    }
    return apiClient.get<WeeklyScheduleResponse>(
      `/boards/${boardId}/schedules/weekly?${query.toString()}`,
    );
  },

  /**
   * Day 모드 통합 조회 (스케줄 + 데일리 체크리스트)
   * 기존 2개 API 호출 → 1개로 통합
   */
  getDailyFull: async (
    boardId: string,
    date: string,
    assigneeIds?: string[],
    includeOrgSchedules?: boolean,
  ) => {
    const query = new URLSearchParams();
    query.set("date", date);
    if (assigneeIds && assigneeIds.length > 0) {
      assigneeIds.forEach((id) => query.append("assigneeIds", id));
    }
    if (includeOrgSchedules) {
      query.set("includeOrgSchedules", "true");
    }
    return apiClient.get<DailyFullResponse>(
      `/boards/${boardId}/schedules/daily-full?${query.toString()}`,
    );
  },

  createBlock: async (
    boardId: string,
    data: {
      checklist_item_id?: string;
      meeting_id?: string;
      block_type?: string;
      title?: string;
      color?: string;
      assignee_id: string;
      scheduled_date: string;
      start_time: string;
      end_time: string;
    },
  ) => {
    return apiClient.post<ScheduleBlockDetailResponse>(
      `/boards/${boardId}/schedules`,
      data,
    );
  },

  createWithChecklistItem: async (
    boardId: string,
    data: {
      assignee_id: string;
      scheduled_date: string;
      start_time: string;
      end_time: string;
      checklist_item: {
        task_id: string;
        title: string;
        start_date?: string;
        due_date?: string;
      };
    },
  ) => {
    return apiClient.post<ScheduleBlockDetailResponse>(
      `/boards/${boardId}/schedules/with-checklist-item`,
      data,
    );
  },

  updateBlock: async (
    boardId: string,
    blockId: string,
    data: {
      start_time?: string;
      end_time?: string;
      title?: string;
      color?: string;
    },
  ) => {
    return apiClient.put<ScheduleBlockDetailResponse>(
      `/boards/${boardId}/schedules/${blockId}`,
      data,
    );
  },

  deleteBlock: async (boardId: string, blockId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/schedules/${blockId}`,
    );
  },

  // 타임블록을 다른 체크리스트 항목으로 재지정 (같은 보드 내)
  reassignBlockChecklistItem: async (
    boardId: string,
    blockId: string,
    data: { checklist_item_id: string },
  ) => {
    return apiClient.patch<ScheduleBlockDetailResponse>(
      `/boards/${boardId}/schedules/${blockId}/checklist-item`,
      data,
    );
  },

  getSettings: async (boardId: string) => {
    return apiClient.get<ScheduleSettingsResponse>(
      `/boards/${boardId}/schedules/settings`,
    );
  },

  updateSettings: async (
    boardId: string,
    data: {
      work_hours_per_day?: number;
      work_start_time?: string;
      schedule_display_mode?: "TIME" | "BLOCK";
      break_start_time?: string | null;
      break_end_time?: string | null;
    },
  ) => {
    return apiClient.put<ScheduleSettingsResponse>(
      `/boards/${boardId}/schedules/settings`,
      data,
    );
  },

  getByChecklistItem: async (boardId: string, checklistItemId: string) => {
    return apiClient.get<ScheduleBlockDetailResponse[]>(
      `/boards/${boardId}/schedules/checklist-item/${checklistItemId}`,
    );
  },

  getByChecklistItems: async (boardId: string, checklistItemIds: string[]) => {
    return apiClient.post<Record<string, ScheduleBlockDetailResponse[]>>(
      `/boards/${boardId}/schedules/checklist-items/batch`,
      { checklist_item_ids: checklistItemIds },
    );
  },

  getScheduledTaskIds: async (boardId: string) => {
    return apiClient.get<{ task_ids: string[] }>(
      `/boards/${boardId}/schedules/scheduled-task-ids`,
    );
  },
};

// ========================================
// Meeting API
// ========================================

export const meetingAPI = {
  getMeetings: async (
    boardId: string,
    date: string,
  ): Promise<MeetingSummary[]> => {
    const query = new URLSearchParams();
    query.set("date", date);
    return apiClient.get<MeetingSummary[]>(
      `/boards/${boardId}/meetings?${query.toString()}`,
    );
  },

  getMeetingsByDateRange: async (
    boardId: string,
    startDate: string,
    endDate: string,
  ): Promise<MeetingSummary[]> => {
    return apiClient.get<MeetingSummary[]>(
      `/boards/${boardId}/meetings/range?startDate=${startDate}&endDate=${endDate}`,
    );
  },

  getMeetingDetail: async (
    boardId: string,
    meetingId: string,
  ): Promise<MeetingDetail> => {
    return apiClient.get<MeetingDetail>(
      `/boards/${boardId}/meetings/${meetingId}`,
    );
  },

  createMeeting: async (
    boardId: string,
    data: {
      title: string;
      meeting_date: string;
      start_time?: string;
      end_time?: string;
      memo?: string;
      color?: string;
      recurrence_rule?: string | null;
      recurrence_end_date?: string | null;
      recurrence_days_of_week?: number[] | null;
      recurrence_week_of_month?: number | null;
    },
  ): Promise<MeetingDetail> => {
    return apiClient.post<MeetingDetail>(`/boards/${boardId}/meetings`, data);
  },

  updateMeeting: async (
    boardId: string,
    meetingId: string,
    data: {
      title?: string;
      meeting_date?: string;
      start_time?: string | null;
      end_time?: string | null;
      memo?: string;
      color?: string;
      recurrence_end_date?: string | null;
    },
    scope?: "THIS_ONLY" | "THIS_AND_FUTURE",
  ): Promise<MeetingDetail> => {
    const query = scope ? `?scope=${scope}` : "";
    return apiClient.put<MeetingDetail>(
      `/boards/${boardId}/meetings/${meetingId}${query}`,
      data,
    );
  },

  deleteMeeting: async (
    boardId: string,
    meetingId: string,
    scope?: "THIS_ONLY" | "THIS_AND_FUTURE",
  ): Promise<{ message: string }> => {
    const query = scope ? `?scope=${scope}` : "";
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/meetings/${meetingId}${query}`,
    );
  },

  notifyParticipants: async (
    boardId: string,
    meetingId: string,
  ): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>(
      `/boards/${boardId}/meetings/${meetingId}/notify`,
    );
  },

  aiOrganize: async (
    boardId: string,
    meetingId: string,
    language?: string,
  ): Promise<AISuggestionResponse> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.post<AISuggestionResponse>(
      `/boards/${boardId}/meetings/${meetingId}/ai-organize${params}`,
    );
  },

  aiApply: async (
    boardId: string,
    meetingId: string,
    data: AIApplyRequest,
  ): Promise<AIApplyResult> => {
    return apiClient.post<AIApplyResult>(
      `/boards/${boardId}/meetings/${meetingId}/ai-apply`,
      data,
    );
  },

  transcribeAudio: async (
    boardId: string,
    meetingId: string,
    audioBlob: Blob,
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");

    const response = await authenticatedFetch(
      `${API_BASE_URL}/boards/${boardId}/meetings/${meetingId}/transcribe`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        code: "UNKNOWN",
        message: response.statusText,
      }));
      throw errData;
    }

    // 202 Accepted — result delivered via WebSocket (TRANSCRIPTION_COMPLETE)
  },

  updateTranscript: async (
    boardId: string,
    meetingId: string,
    transcript: string,
    diarizedTranscript?: DiarizedTranscript | null,
  ): Promise<TranscriptResult> => {
    const body: Record<string, string> = { transcript };
    if (diarizedTranscript) {
      body.diarized_transcript = JSON.stringify(diarizedTranscript);
    }
    return apiClient.put<TranscriptResult>(
      `/boards/${boardId}/meetings/${meetingId}/transcript`,
      body,
    );
  },

  updateSpeakerMapping: async (
    boardId: string,
    meetingId: string,
    speakerMapping: Record<string, string | null>,
  ): Promise<SpeakerMappingResult> => {
    return apiClient.put<SpeakerMappingResult>(
      `/boards/${boardId}/meetings/${meetingId}/speaker-mapping`,
      { speaker_mapping: speakerMapping },
    );
  },

  saveToNote: async (
    boardId: string,
    meetingId: string,
  ): Promise<NoteDetail> => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/meetings/${meetingId}/save-to-note`,
    );
  },
};

// ========================================
// Board Checklist API (for schedule)
// ========================================

export const boardChecklistAPI = {
  getItems: async (
    boardId: string,
    params?: {
      assignee_id?: string;
      is_scheduled?: boolean;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.assignee_id) query.set("assigneeId", params.assignee_id);
    if (params?.is_scheduled !== undefined) {
      query.set("isScheduled", params.is_scheduled.toString());
    }
    const queryString = query.toString();
    return apiClient.get<BoardChecklistResponse>(
      `/boards/${boardId}/checklist-items${queryString ? `?${queryString}` : ""}`,
    );
  },

  getItemsByAssignee: async (
    boardId: string,
    params?: {
      start_date?: string;
      end_date?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.start_date) query.set("startDate", params.start_date);
    if (params?.end_date) query.set("endDate", params.end_date);
    const queryString = query.toString();
    return apiClient.get<ChecklistByAssigneeResponse>(
      `/boards/${boardId}/checklist-items/by-assignee${queryString ? `?${queryString}` : ""}`,
    );
  },

  createFromWorkload: async (
    boardId: string,
    data: {
      title: string;
      assignee_id?: string | null;
      contractor_id?: string | null;
      start_date?: string;
      due_date?: string;
      feature_id?: string | null;
      task_id?: string | null;
      new_feature_title?: string | null;
    },
  ) => {
    return apiClient.post<ChecklistItemResponse>(
      `/boards/${boardId}/checklist-items/from-workload`,
      data,
    );
  },
};

// ========================================
// Milestone API
// ========================================

// Milestone Allocation Response Types
export interface MilestoneAllocationResponse {
  id: string;
  milestone_id: string;
  member: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  working_days: number;
  total_allocated_hours: number;
  actual_worked_hours?: number;
  difference?: number;
  status?: "OVER" | "UNDER" | "NORMAL";
}

export const milestoneAPI = {
  getMilestones: async (boardId: string) => {
    return apiClient.get<{ milestones: MilestoneSimpleResponse[] }>(
      `/boards/${boardId}/milestones`,
    );
  },

  getMilestone: async (boardId: string, milestoneId: string) => {
    return apiClient.get<MilestoneDetailResponse>(
      `/boards/${boardId}/milestones/${milestoneId}`,
    );
  },

  createMilestone: async (
    boardId: string,
    data: {
      title: string;
      description?: string;
      start_date: string;
      end_date: string;
      feature_ids?: string[];
    },
  ) => {
    return apiClient.post<MilestoneDetailResponse>(
      `/boards/${boardId}/milestones`,
      {
        title: data.title,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date,
        feature_ids: data.feature_ids,
      },
    );
  },

  updateMilestone: async (
    boardId: string,
    milestoneId: string,
    data: {
      title?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
    },
  ) => {
    return apiClient.put<MilestoneDetailResponse>(
      `/boards/${boardId}/milestones/${milestoneId}`,
      {
        title: data.title,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date,
      },
    );
  },

  deleteMilestone: async (boardId: string, milestoneId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/milestones/${milestoneId}`,
    );
  },

  addFeatures: async (
    boardId: string,
    milestoneId: string,
    featureIds: string[],
  ) => {
    return apiClient.post<MilestoneDetailResponse>(
      `/boards/${boardId}/milestones/${milestoneId}/features`,
      {
        feature_ids: featureIds,
      },
    );
  },

  removeFeature: async (
    boardId: string,
    milestoneId: string,
    featureId: string,
  ) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/milestones/${milestoneId}/features/${featureId}`,
    );
  },

  // Milestone Allocation APIs
  getAllocations: async (boardId: string, milestoneId: string) => {
    return apiClient.get<{ allocations: MilestoneAllocationResponse[] }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`,
    );
  },

  createAllocation: async (
    boardId: string,
    milestoneId: string,
    data: {
      member_id: string;
      working_days: number;
      total_allocated_hours: number;
    },
  ) => {
    return apiClient.post<MilestoneAllocationResponse>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`,
      data,
    );
  },

  updateAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
    data: {
      working_days?: number;
      total_allocated_hours?: number;
    },
  ) => {
    return apiClient.put<MilestoneAllocationResponse>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`,
      data,
    );
  },

  deleteAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
  ) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`,
    );
  },
};

// ========================================
// 스프린트 API (마일스톤 안의 선택형 스프린트)
// ========================================
import type { SprintBoard, SprintItemCard } from "../types";

export const sprintAPI = {
  /** 스프린트 프레임 조회 (타임라인 + 컬럼 + 게이지 + 백로그) */
  getSprintBoard: async (boardId: string, milestoneId: string) => {
    return apiClient.get<SprintBoard>(
      `/boards/${boardId}/milestones/${milestoneId}/sprint-board`,
    );
  },

  /** 마일스톤 관리 콘솔 — 마일스톤 전체 체크리스트(스프린트 무관) */
  getMilestoneConsole: async (boardId: string, milestoneId: string) => {
    return apiClient.get<SprintItemCard[]>(
      `/boards/${boardId}/milestones/${milestoneId}/console`,
    );
  },

  /** 체크리스트 항목을 다른 Task로 이동 (콘솔 DnD — 피쳐가 바뀔 수 있음) */
  moveChecklistTask: async (
    boardId: string,
    taskId: string,
    itemId: string,
    targetTaskId: string,
  ) => {
    return apiClient.put<void>(
      `/boards/${boardId}/tasks/${taskId}/checklist/${itemId}/move-task`,
      { target_task_id: targetTaskId },
    );
  },

  /** 스프린트 모드 on/off (관리자) — off 시 담긴 카드 병합 */
  toggleSprintMode: async (
    boardId: string,
    milestoneId: string,
    enabled: boolean,
  ) => {
    return apiClient.patch<SprintBoard>(
      `/boards/${boardId}/milestones/${milestoneId}/sprint-mode`,
      { enabled },
    );
  },

  /** 체크리스트 항목 담기 */
  addItem: async (
    boardId: string,
    sprintId: string,
    checklistItemId: string,
  ) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/sprints/${sprintId}/items`,
      { checklist_item_id: checklistItemId },
    );
  },

  /** 항목 빼기 (Task 백로그로 복귀) */
  removeItem: async (boardId: string, sprintId: string, itemId: string) => {
    return apiClient.delete<SprintBoard>(
      `/boards/${boardId}/sprints/${sprintId}/items/${itemId}`,
    );
  },

  /** 카드 컬럼 이동 (드래그) — END 컬럼 도달 시 완료 동기화 */
  moveToColumn: async (boardId: string, itemId: string, columnId: string) => {
    return apiClient.patch<SprintBoard>(
      `/boards/${boardId}/checklist-items/${itemId}/sprint-column`,
      { column_id: columnId },
    );
  },

  /** 중간 컬럼 추가 (관리자) */
  createColumn: async (
    boardId: string,
    milestoneId: string,
    name: string,
    color?: string | null,
  ) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/milestones/${milestoneId}/sprint-columns`,
      { name, color: color ?? null },
    );
  },

  /** 컬럼 이름/색 변경 (관리자) */
  updateColumn: async (
    boardId: string,
    columnId: string,
    patch: { name?: string; color?: string | null },
  ) => {
    return apiClient.patch<SprintBoard>(
      `/boards/${boardId}/sprint-columns/${columnId}`,
      patch,
    );
  },

  /** 중간 컬럼 삭제 (관리자) — 담긴 카드는 앞 컬럼으로 이동 */
  deleteColumn: async (boardId: string, columnId: string) => {
    return apiClient.delete<SprintBoard>(
      `/boards/${boardId}/sprint-columns/${columnId}`,
    );
  },

  /** 중간 컬럼 순서 재정렬 (관리자) */
  reorderColumns: async (
    boardId: string,
    milestoneId: string,
    columnIds: string[],
  ) => {
    return apiClient.patch<SprintBoard>(
      `/boards/${boardId}/milestones/${milestoneId}/sprint-columns/order`,
      { column_ids: columnIds },
    );
  },

  /** 스프린트 종료 (100% 완료 시 동결 + 다음 스프린트 생성/복귀) */
  closeSprint: async (boardId: string, sprintId: string) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/sprints/${sprintId}/close`,
    );
  },

  /** 아카이브 스프린트 재활성화 (수정 → 재동결용) */
  reactivateSprint: async (boardId: string, sprintId: string) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/sprints/${sprintId}/reactivate`,
    );
  },

  /** 재활성화 취소 (원래 동결 기록 복원) */
  cancelReactivation: async (boardId: string, sprintId: string) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/sprints/${sprintId}/cancel-reactivation`,
    );
  },

  /** 특정 스프린트의 담긴 카드 목록 (아카이브 열람용) */
  getSprintItems: async (boardId: string, sprintId: string) => {
    return apiClient.get<SprintItemCard[]>(
      `/boards/${boardId}/sprints/${sprintId}/items`,
    );
  },

  /** 아카이브 항목을 현재 스프린트로 재개 */
  resumeItem: async (boardId: string, itemId: string) => {
    return apiClient.post<SprintBoard>(
      `/boards/${boardId}/checklist-items/${itemId}/resume`,
    );
  },
};

// ========================================
// Calendar Event API (워크로드 특별 일정)
// ========================================

/** 워크로드 특별 일정 항목 (팀 이벤트 / 개인 부재 / 달력 예외) */
export interface CalendarEventItem {
  id: string;
  event_type: string; // BUILD/RELEASE/DEADLINE/EVENT/VACATION/TRIP/SICK/REMOTE/HOLIDAY/WORKDAY
  category: string; // TEAM/MEMBER/CALENDAR
  member: { id: string; name: string; profile_image: string | null } | null;
  title: string | null;
  start_date: string;
  end_date: string;
  color: string | null;
  recurring: boolean;
  created_at: string;
}

export interface CalendarEventPayload {
  event_type: string;
  member_id?: string | null;
  title?: string | null;
  start_date: string;
  end_date: string;
  color?: string | null;
  recurring?: boolean;
}

export const calendarEventAPI = {
  list: async (boardId: string) => {
    return apiClient.get<{ events: CalendarEventItem[] }>(
      `/boards/${boardId}/calendar-events`,
    );
  },

  create: async (boardId: string, data: CalendarEventPayload) => {
    return apiClient.post<CalendarEventItem>(
      `/boards/${boardId}/calendar-events`,
      data,
    );
  },

  update: async (
    boardId: string,
    eventId: string,
    data: Partial<CalendarEventPayload>,
  ) => {
    return apiClient.put<CalendarEventItem>(
      `/boards/${boardId}/calendar-events/${eventId}`,
      data,
    );
  },

  remove: async (boardId: string, eventId: string) => {
    return apiClient.delete<{ message?: string }>(
      `/boards/${boardId}/calendar-events/${eventId}`,
    );
  },
};

// ========================================
// Test Data API (for development)
// ========================================

export interface TestDataResponse {
  board_id: string;
  board_name: string;
  member_count: number;
  feature_count: number;
  task_count: number;
  checklist_item_count: number;
  schedule_block_count: number;
  message: string;
}

export interface TestOrgDataResponse {
  organization_id: string;
  organization_name: string;
  member_count: number;
  department_count: number;
  leave_policy_count: number;
  leave_request_count: number;
  onboarding_template_count: number;
  attendance_record_count: number;
  announcement_count: number;
  activity_count: number;
  message: string;
}

export const testDataAPI = {
  createTestBoard: async () => {
    return apiClient.post<TestDataResponse>("/test/create-board");
  },
  createTestOrganization: async () => {
    return apiClient.post<TestOrgDataResponse>("/test/create-organization");
  },
};

// ========================================
// Daily Checklist API
// ========================================

export interface DailyChecklistItemResponse {
  id: string;
  checklist_item_id: string | null;
  title: string;
  assignee: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  assigned_date: string;
  position: number;
  completed: boolean;
  task: {
    id: string;
    title: string;
  } | null;
  feature: {
    id: string;
    title: string;
    color: string;
  } | null;
  block?: {
    id: string;
    name: string;
    color: string | null;
    position: number | null;
  } | null;
  milestone?: {
    id: string;
    title: string;
  } | null;
  start_date?: string | null;
  due_date?: string | null;
  created_at: string;
  isVirtual?: boolean; // 워크로드 날짜 범위 기반 가상 항목 (DB 미저장)
}

export interface DailyChecklistColumnResponse {
  user: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  items: DailyChecklistItemResponse[];
}

export interface DailyChecklistResponse {
  date: string;
  columns: DailyChecklistColumnResponse[];
}

export interface TimeblockDataResponse {
  daily_checklist_items: DailyChecklistItemResponse[];
  board_checklist_items: BoardChecklistItemResponse[];
  meetings: MeetingSummary[];
}

export const dailyChecklistAPI = {
  // 타임블록 모달용 통합 데이터 조회
  getTimeblockData: async (
    boardId: string,
    date: string,
    assigneeId: string,
  ) => {
    return apiClient.get<TimeblockDataResponse>(
      `/boards/${boardId}/daily-checklists/timeblock-data?date=${date}&assigneeId=${assigneeId}`,
    );
  },

  // 일일 데일리 체크리스트 조회
  getDailyChecklist: async (boardId: string, date: string) => {
    return apiClient.get<DailyChecklistResponse>(
      `/boards/${boardId}/daily-checklists?date=${date}`,
    );
  },

  // 기존 체크리스트 항목을 데일리 체크리스트로 추가
  addItem: async (
    boardId: string,
    data: {
      checklist_item_id: string;
      assignee_id: string;
      assigned_date: string;
    },
  ) => {
    return apiClient.post<DailyChecklistItemResponse>(
      `/boards/${boardId}/daily-checklists`,
      data,
    );
  },

  // 새 체크리스트 생성 + 데일리 체크리스트로 추가
  addWithNewItem: async (
    boardId: string,
    data: {
      task_id: string;
      title: string;
      assignee_id: string;
      assigned_date: string;
    },
  ) => {
    return apiClient.post<DailyChecklistItemResponse>(
      `/boards/${boardId}/daily-checklists/with-item`,
      data,
    );
  },

  // 날짜 범위 내 체크리스트 조회 (캘린더용)
  getChecklistRange: async (
    boardId: string,
    startDate: string,
    endDate: string,
    assigneeId: string,
  ) => {
    return apiClient.get<DailyChecklistItemResponse[]>(
      `/boards/${boardId}/daily-checklists/range?startDate=${startDate}&endDate=${endDate}&assigneeId=${assigneeId}`,
    );
  },

  // 우선순위 순서 변경
  updatePosition: async (
    boardId: string,
    itemId: string,
    data: { position: number },
  ) => {
    return apiClient.put<DailyChecklistItemResponse>(
      `/boards/${boardId}/daily-checklists/${itemId}/position`,
      data,
    );
  },

  // 데일리 체크리스트에서 제거 (원본 체크리스트는 유지)
  removeItem: async (boardId: string, itemId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/daily-checklists/${itemId}`,
    );
  },
};

// ========================================
// Statistics API (Analytics & Productivity)
// ========================================

// 통계 응답 타입들
export interface StatisticsSummaryResponse {
  total_work_minutes: number;
  completed_work_minutes: number;
  incomplete_work_minutes: number;
  total_tasks: number;
  completed_tasks: number;
  incomplete_tasks: number;
  total_features: number;
  completed_features: number;
  average_feature_progress: number;
  focus_rate: number;
  period_start: string;
  period_end: string;
}

export interface MemberStatisticsResponse {
  member: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  total_minutes: number;
  completed_minutes: number;
  task_count: number;
  completed_task_count: number;
  impact_score: number;
  by_feature: {
    feature_id: string;
    feature_title: string;
    feature_color: string;
    minutes: number;
  }[];
}

export interface FeatureStatisticsResponse {
  feature: {
    id: string;
    title: string;
    color: string;
  };
  total_minutes: number;
  completed_minutes: number;
  task_count: number;
  completed_task_count: number;
  progress_percentage: number;
  by_member: {
    member_id: string;
    member_name: string;
    minutes: number;
  }[];
}

export interface TagStatisticsResponse {
  tag: {
    id: string;
    name: string;
    color: string;
  };
  total_minutes: number;
  task_count: number;
}

export interface ImpactStatisticsResponse {
  total_impact_score: number;
  by_member: {
    member_id: string;
    member_name: string;
    profile_image: string | null;
    impact_score: number;
    weighted_minutes: number;
  }[];
  by_weight_level: {
    level: WeightLevelResponse;
    total_minutes: number;
    task_count: number;
  }[];
}

export interface DailyTrendResponse {
  date: string;
  total_minutes: number;
  completed_minutes: number;
  task_completed_count: number;
}

export interface BoardStatisticsResponse {
  summary: StatisticsSummaryResponse;
  by_member: MemberStatisticsResponse[];
  by_feature: FeatureStatisticsResponse[];
  by_tag: TagStatisticsResponse[];
  impact: ImpactStatisticsResponse;
  daily_trend: DailyTrendResponse[];
}

// Management Statistics Response Types
export interface ManagementStatisticsResponse {
  milestone_health: MilestoneHealthResponse[];
  team_productivity: MemberProductivityResponse[];
  delayed_items: DelayedItemsResponse;
  summary: ManagementSummaryResponse;
  settings: ManagementSettingsResponse;
}

export interface MilestoneHealthResponse {
  milestone: {
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
  };
  progress_percentage: number;
  estimated_completion_date: string | null;
  status: "ON_TRACK" | "SLOW" | "AT_RISK" | "OVERDUE";
  days_remaining: number;
  days_overdue: number;
  velocity: {
    average_tasks_per_day: number;
    tasks_remaining: number;
    tasks_completed: number;
    tasks_total: number;
    required_velocity: number;
  };
  burndown: {
    date: string;
    ideal_remaining: number;
    actual_remaining: number;
  }[];
  feature_summary: {
    total_features: number;
    completed_features: number;
    at_risk_features: number;
  };
}

export interface MemberProductivityResponse {
  member: {
    id: string;
    name: string;
    profile_image: string | null;
    role?: string;
  };
  assigned_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  completion_rate: number;
  total_checklists: number;
  completed_checklists: number;
  checklist_completion_rate: number;
  status: "NORMAL" | "NEEDS_ATTENTION" | "COMPLETED";
  in_progress_task_details: {
    task_id: string;
    task_title: string;
    feature_id: string;
    feature_title: string;
    feature_color: string;
    current_block: string;
    days_in_progress: number;
    start_date: string | null;
    due_date: string | null;
    checklist_total: number;
    checklist_completed: number;
  }[];
  stuck_checklists: {
    checklist_id: string;
    checklist_title: string;
    task_id: string;
    task_title: string;
    feature_title: string;
    days_stuck: number;
    created_at: string;
  }[];
  recent_completed_tasks: {
    task_id: string;
    task_title: string;
    feature_title: string;
    completed_at: string;
    days_to_complete: number;
  }[];
}

export interface DelayedItemsResponse {
  overdue_features: {
    feature_id: string;
    feature_title: string;
    feature_color: string;
    due_date: string;
    days_overdue: number;
    assignee: { id: string; name: string; profile_image: string | null } | null;
    progress_percentage: number;
    tasks_remaining: number;
  }[];
  stagnant_tasks: {
    task_id: string;
    task_title: string;
    feature_id: string;
    feature_title: string;
    feature_color: string;
    current_block: string;
    block_name: string;
    days_in_block: number;
    assignee: { id: string; name: string; profile_image: string | null } | null;
    due_date: string | null;
    is_overdue: boolean;
  }[];
  stuck_checklists: {
    checklist_id: string;
    checklist_title: string;
    task_id: string;
    task_title: string;
    feature_id: string;
    feature_title: string;
    feature_color: string;
    days_stuck: number;
    assignee: { id: string; name: string; profile_image: string | null } | null;
    due_date: string | null;
  }[];
  bottleneck_summary: {
    most_delayed_member: {
      member: { id: string; name: string; profile_image: string | null };
      delayed_item_count: number;
      overdue_tasks: number;
      stuck_checklists: number;
    } | null;
    most_problematic_block: {
      block_id: string;
      block_name: string;
      stuck_task_count: number;
      average_days_stuck: number;
    } | null;
    total_overdue_features: number;
    total_stagnant_tasks: number;
    total_stuck_checklists: number;
  };
}

export interface ManagementSummaryResponse {
  total_milestones: number;
  on_track_milestones: number;
  at_risk_milestones: number;
  overdue_milestones: number;
  total_members: number;
  members_on_track: number;
  members_needing_attention: number;
  total_delayed_items: number;
  overall_health_score: number;
}

export interface ManagementSettingsResponse {
  stagnant_task_days_threshold: number;
  stuck_checklist_days_threshold: number;
}

export interface PersonalStatisticsResponse {
  summary: {
    total_work_minutes: number;
    completed_work_minutes: number;
    total_tasks: number;
    completed_tasks: number;
    impact_score: number;
  };
  by_feature: {
    feature_id: string;
    feature_title: string;
    feature_color: string;
    minutes: number;
    task_count: number;
  }[];
  by_tag: {
    tag_id: string;
    tag_name: string;
    tag_color: string;
    minutes: number;
  }[];
  top_tasks: {
    task_id: string;
    task_title: string;
    feature_title: string;
    minutes: number;
  }[];
  daily_trend: {
    date: string;
    minutes: number;
  }[];
}

// 가중치 레벨 타입
export interface WeightLevelResponse {
  id: string;
  name: string;
  weight: number;
  color: string;
  position: number;
  is_default: boolean;
}

export interface BoardWeightSettingsResponse {
  board_id: string;
  levels: WeightLevelResponse[];
  default_level_id: string;
}

export const statisticsAPI = {
  // 보드 전체 통계 조회
  getBoardStatistics: async (
    boardId: string,
    params?: {
      start_date?: string;
      end_date?: string;
      milestone_ids?: string[];
      feature_ids?: string[];
      member_ids?: string[];
      tag_ids?: string[];
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.start_date) query.set("start_date", params.start_date);
    if (params?.end_date) query.set("end_date", params.end_date);
    if (params?.milestone_ids?.length) {
      params.milestone_ids.forEach((id) => query.append("milestone_ids", id));
    }
    if (params?.feature_ids?.length) {
      params.feature_ids.forEach((id) => query.append("feature_ids", id));
    }
    if (params?.member_ids?.length) {
      params.member_ids.forEach((id) => query.append("member_ids", id));
    }
    if (params?.tag_ids?.length) {
      params.tag_ids.forEach((id) => query.append("tag_ids", id));
    }
    const queryString = query.toString();
    return apiClient.get<BoardStatisticsResponse>(
      `/boards/${boardId}/statistics${queryString ? `?${queryString}` : ""}`,
    );
  },

  // 개인 통계 조회 (본인 데이터만)
  getPersonalStatistics: async (
    boardId: string,
    params?: {
      start_date?: string;
      end_date?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.start_date) query.set("start_date", params.start_date);
    if (params?.end_date) query.set("end_date", params.end_date);
    const queryString = query.toString();
    return apiClient.get<PersonalStatisticsResponse>(
      `/boards/${boardId}/statistics/personal${queryString ? `?${queryString}` : ""}`,
    );
  },

  // 관리 대시보드 통계 조회
  getManagementStatistics: async (
    boardId: string,
    params?: {
      milestone_id?: string;
      stagnant_task_days?: number;
      stuck_checklist_days?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.milestone_id) query.set("milestone_id", params.milestone_id);
    if (params?.stagnant_task_days !== undefined) {
      query.set("stagnant_task_days", params.stagnant_task_days.toString());
    }
    if (params?.stuck_checklist_days !== undefined) {
      query.set("stuck_checklist_days", params.stuck_checklist_days.toString());
    }
    const queryString = query.toString();
    return apiClient.get<ManagementStatisticsResponse>(
      `/boards/${boardId}/statistics/management${queryString ? `?${queryString}` : ""}`,
    );
  },

  // 가중치 레벨 설정 조회
  getWeightLevels: async (boardId: string) => {
    return apiClient.get<BoardWeightSettingsResponse>(
      `/boards/${boardId}/weight-levels`,
    );
  },

  // 가중치 레벨 설정 생성/수정
  updateWeightLevels: async (
    boardId: string,
    data: {
      levels: {
        id?: string;
        name: string;
        weight: number;
        color: string;
        position: number;
      }[];
      default_level_id?: string;
    },
  ) => {
    return apiClient.put<BoardWeightSettingsResponse>(
      `/boards/${boardId}/weight-levels`,
      data,
    );
  },

  // Task 가중치 설정
  setTaskWeight: async (
    boardId: string,
    taskId: string,
    weightLevelId: string,
  ) => {
    return apiClient.patch<{ task_id: string; weight_level_id: string }>(
      `/boards/${boardId}/tasks/${taskId}/weight`,
      { weight_level_id: weightLevelId },
    );
  },

  // Task 가중치 조회
  getTaskWeight: async (boardId: string, taskId: string) => {
    return apiClient.get<{
      task_id: string;
      weight_level: WeightLevelResponse | null;
    }>(`/boards/${boardId}/tasks/${taskId}/weight`);
  },
};

// ==================== Admin API ====================

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  profile_image?: string | null;
  system_role: "USER" | "TESTER" | "ADMIN";
  provider: "email" | "google";
  email_verified: boolean;
  created_at: string;
  board_count: number;
  is_active: boolean;
  deactivated_at?: string | null;
  deactivated_reason?: string | null;
  has_personal_board?: boolean;
}

export interface AdminUserDetail extends AdminUserSummary {
  last_login_at?: string | null;
  owned_board_count: number;
  member_board_count: number;
  auth_provider_id?: string | null;
  email_verified_at?: string | null;
  // Personal Board fields
  has_personal_board?: boolean;
  personal_board_id?: string | null;
  personal_board_created_at?: string | null;
  personal_board_task_count?: number | null;
  personal_board_diary_count?: number | null;
  personal_board_event_count?: number | null;
  // Personal AI Credits
  personal_ai_credits?: number | null;
  personal_credits_used?: number | null;
  personal_credits_reset_date?: string | null;
}

export interface AdminBoardSummary {
  id: string;
  name: string;
  description?: string | null;
  tier: "FREE" | "TRIAL" | "STANDARD" | "PREMIUM" | "ENTERPRISE";
  board_type?: "TEAM" | "PERSONAL";
  owner_id: string;
  owner_name: string;
  owner_email: string;
  member_count: number;
  task_count: number;
  created_at: string;
  trial_ends_at?: string | null;
  deleted_at?: string | null;
}

export interface AdminBoardDetail extends AdminBoardSummary {
  members: {
    id: string;
    name: string;
    email: string;
    profile_image?: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    joined_at: string;
  }[];
  seat_count?: number | null;
  subscription?: {
    id: string;
    status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING";
    started_at: string;
    expires_at?: string | null;
  } | null;
  monthly_ai_credits?: number | null;
  monthly_credits_used?: number | null;
  purchased_credits?: number | null;
  credits_reset_date?: string | null;
  // Personal Board fields
  diary_count?: number | null;
  diary_completion_rate?: number | null;
  personal_event_count?: number | null;
  last_activity_at?: string | null;
}

export interface AdminStatistics {
  total_users: number;
  active_users: number;
  total_boards: number;
  trial_boards: number;
  standard_boards: number;
  premium_boards: number;
  active_subscriptions: number;
  // Personal Board metrics (P1)
  personal_boards?: number;
  personal_board_adoption?: number;
  active_personal_boards?: number;
  total_diary_entries?: number;
}

// Analytics Types
export interface SignupTrendData {
  date: string;
  count: number;
  email_count: number;
  google_count: number;
}

export interface SignupTrend {
  data: SignupTrendData[];
  total: number;
}

export interface DailyActiveData {
  date: string;
  count: number;
}

export interface ActiveUserStats {
  dau: number;
  wau: number;
  mau: number;
  trend: DailyActiveData[];
}

export interface MonthlyConversion {
  month: string;
  trial_started: number;
  converted: number;
  rate: number;
}

export interface ConversionStats {
  total_trial_started: number;
  total_converted: number;
  conversion_rate: number;
  trial_in_progress: number;
  trial_expired_not_converted: number;
  trend: MonthlyConversion[];
}

export interface DiaryStatsData {
  date: string;
  count: number;
}

export interface DiaryStats {
  total_entries: number;
  completion_rate: number;
  active_users: number;
  trend: DiaryStatsData[];
}

export interface PersonalConversionStats {
  personal_only: number;
  both: number;
  conversion_rate: number;
  trend: { date: string; count: number }[];
}

// ==================== Churn Analysis Types ====================

export interface CohortData {
  cohort_week: string;
  signup_count: number;
  retention: number[];
}

export interface RetentionAnalysis {
  cohorts: CohortData[];
  average_retention: number[];
}

export interface InactiveUser {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
  created_at: string;
  last_active_at: string | null;
  inactive_days: number;
  board_count: number;
  last_action: string | null;
  last_action_at: string | null;
}

export interface InactiveSummary {
  inactive_7d: number;
  inactive_14d: number;
  inactive_30d: number;
}

export interface InactiveUserList {
  users: InactiveUser[];
  total: number;
  page: number;
  size: number;
  summary: InactiveSummary;
}

export interface DayDropout {
  trial_day: number;
  count: number;
  percentage: number;
}

export interface TrialActionStat {
  action: string;
  count: number;
  percentage: number;
}

export interface TrialDropoutAnalysis {
  total_expired_trials: number;
  dropout_by_day: DayDropout[];
  actions_before_dropout: TrialActionStat[];
  never_acted_count: number;
  never_acted_percentage: number;
}

export interface WeeklyActivity {
  week: string;
  total_actions: number;
  active_users: number;
}

export interface FeatureUsageStat {
  action: string;
  count: number;
  unique_users: number;
}

export interface ActivityTrends {
  weekly_activity: WeeklyActivity[];
  activity_change_rate: number;
  feature_usage: FeatureUsageStat[];
}

// Announcement Types
export interface AnnouncementDetail {
  id: string;
  title: string;
  content: string;
  type: "POPUP" | "BANNER" | "NOTICE";
  is_active: boolean;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  target_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
  estimated_end_at: string | null;
  started_at: string | null;
}

export interface BulkCreateResult {
  created: number;
  failed: number;
  total: number;
}

export interface AdminSubscriptionSummary {
  id: string;
  board_id: string;
  board_name: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  tier: "FREE" | "STANDARD" | "PREMIUM" | "ENTERPRISE";
  status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING";
  started_at: string;
  expires_at?: string | null;
}

export interface UserListResponse {
  users: AdminUserSummary[];
  total: number;
  page: number;
  size: number;
}

export interface BoardListResponse {
  boards: AdminBoardSummary[];
  total: number;
  page: number;
  size: number;
}

export interface SubscriptionListResponse {
  subscriptions: AdminSubscriptionSummary[];
  total: number;
  page: number;
  size: number;
}

// ==================== Admin Organization Types ====================

export interface AdminOrgSummary {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
    profile_image?: string | null;
  };
  plan: "FREE" | "TEAM";
  subscription_status:
    "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED" | null;
  member_count: number;
  board_count: number;
  seat_count: number;
  trial_ends_at?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface AdminOrgDetail extends AdminOrgSummary {
  billing_cycle?: "MONTHLY" | "YEARLY" | null;
  active_member_count: number;
  price_per_seat?: number | null;
  total_price?: number | null;
  current_period_end?: string | null;
  trial_used?: boolean;
  monthly_ai_credits?: number | null;
  monthly_credits_used?: number | null;
  remaining_ai_credits?: number | null;
  credits_reset_date?: string | null;
  departments_enabled?: boolean;
  job_groups_enabled?: boolean;
  positions_enabled?: boolean;
  titles_enabled?: boolean;
  grades_enabled?: boolean;
  members: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    profile_image?: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER";
    department_name?: string | null;
    position_name?: string | null;
    title_name?: string | null;
    contract_type?: string | null;
    work_status?: string | null;
    joined_at: string;
  }[];
  boards: AdminBoardSummary[];
  updated_at?: string;
}

export interface OrgListResponse {
  organizations: AdminOrgSummary[];
  total: number;
  page: number;
  size: number;
}

export interface AdminOrgStatistics {
  total_organizations: number;
  active_organizations: number;
  free_orgs: number;
  team_orgs: number;
  trial_orgs: number;
  active_org_subscriptions: number;
  total_org_members: number;
}

export const adminAPI = {
  // 사용자 목록 조회
  getUsers: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.search) searchParams.append("search", params.search);
    return apiClient.get<UserListResponse>(
      `/admin/users?${searchParams.toString()}`,
    );
  },

  // 사용자 상세 조회
  getUser: async (userId: string) => {
    return apiClient.get<AdminUserDetail>(`/admin/users/${userId}`);
  },

  // 사용자 정보 수정
  updateUser: async (
    userId: string,
    data: { system_role?: "USER" | "TESTER" | "ADMIN" },
  ) => {
    return apiClient.patch<AdminUserSummary>(`/admin/users/${userId}`, data);
  },

  // 사용자의 보드 목록 조회
  getUserBoards: async (userId: string) => {
    return apiClient.get<{ boards: AdminBoardSummary[] }>(
      `/admin/users/${userId}/boards`,
    );
  },

  // 사용자 비활성화
  deactivateUser: async (userId: string, reason?: string) => {
    return apiClient.post<AdminUserSummary>(
      `/admin/users/${userId}/deactivate`,
      { reason },
    );
  },

  // 사용자 활성화
  activateUser: async (userId: string) => {
    return apiClient.post<AdminUserSummary>(
      `/admin/users/${userId}/activate`,
      {},
    );
  },

  // 이메일 강제 인증
  verifyUserEmail: async (userId: string) => {
    return apiClient.post<AdminUserSummary>(
      `/admin/users/${userId}/verify-email`,
      {},
    );
  },

  // 비밀번호 리셋 메일 발송
  sendPasswordResetEmail: async (userId: string) => {
    return apiClient.post<{ message: string }>(
      `/admin/users/${userId}/send-password-reset`,
      {},
    );
  },

  // Personal Board 생성
  createPersonalBoard: async (userId: string) => {
    return apiClient.post<{ message: string }>(
      `/admin/users/${userId}/create-personal-board`,
      {},
    );
  },

  // 유저 개인 AI 크레딧 조정
  adjustPersonalAiCredits: async (
    userId: string,
    data: { personal_ai_credits?: number; add_bonus_credits?: number },
  ) => {
    return apiClient.patch<AdminUserDetail>(
      `/admin/users/${userId}/personal-ai-credits`,
      data,
    );
  },

  // 사용자 영구 삭제
  deleteUser: async (userId: string) => {
    return apiClient.delete<{ message: string }>(`/admin/users/${userId}`);
  },

  // 사용자를 보드에서 제거
  removeUserFromBoard: async (userId: string, boardId: string) => {
    return apiClient.delete<{ message: string }>(
      `/admin/users/${userId}/boards/${boardId}`,
    );
  },

  // 보드 목록 조회
  getBoards: async (params: {
    page?: number;
    size?: number;
    search?: string;
    tier?: string;
    board_type?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.search) searchParams.append("search", params.search);
    if (params.tier) searchParams.append("tier", params.tier);
    if (params.board_type) searchParams.append("board_type", params.board_type);
    return apiClient.get<BoardListResponse>(
      `/admin/boards?${searchParams.toString()}`,
    );
  },

  // 보드 상세 조회
  getBoard: async (boardId: string) => {
    return apiClient.get<AdminBoardDetail>(`/admin/boards/${boardId}`);
  },

  // 보드 삭제 (소프트)
  deleteBoard: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(`/admin/boards/${boardId}`);
  },

  // 보드 복구
  restoreBoard: async (boardId: string) => {
    return apiClient.post<{ message: string }>(
      `/admin/boards/${boardId}/restore`,
    );
  },

  // 보드 영구 삭제
  permanentlyDeleteBoard: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(
      `/admin/boards/${boardId}/permanent`,
    );
  },

  // 삭제된 보드 목록 조회
  getDeletedBoards: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.search) searchParams.append("search", params.search);
    return apiClient.get<BoardListResponse>(
      `/admin/boards/deleted?${searchParams.toString()}`,
    );
  },

  // 보드 이름 변경
  updateBoardName: async (boardId: string, name: string) => {
    return apiClient.patch<AdminBoardDetail>(`/admin/boards/${boardId}/name`, {
      name,
    });
  },

  // 보드 티어 변경
  updateBoardTier: async (
    boardId: string,
    tier: "FREE" | "STANDARD" | "PREMIUM" | "ENTERPRISE",
  ) => {
    return apiClient.patch<AdminBoardSummary>(`/admin/boards/${boardId}/tier`, {
      tier,
    });
  },

  // 소유권 이전
  transferBoardOwnership: async (boardId: string, newOwnerId: string) => {
    return apiClient.post<AdminBoardDetail>(
      `/admin/boards/${boardId}/transfer-ownership`,
      { new_owner_id: newOwnerId },
    );
  },

  // Trial 기간 연장
  extendTrial: async (boardId: string, extendDays: number) => {
    return apiClient.patch<AdminBoardSummary>(
      `/admin/boards/${boardId}/extend-trial`,
      { extendDays },
    );
  },

  // 멤버 역할 변경
  updateMemberRole: async (
    boardId: string,
    memberId: string,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ) => {
    return apiClient.patch<AdminBoardDetail>(
      `/admin/boards/${boardId}/members/${memberId}/role`,
      { role },
    );
  },

  // 시트 수 변경
  updateSeatCount: async (boardId: string, seatCount: number) => {
    return apiClient.patch<AdminBoardDetail>(
      `/admin/boards/${boardId}/seat-count`,
      { seat_count: seatCount },
    );
  },

  // AI 크레딧 조정
  adjustAiCredits: async (
    boardId: string,
    data: { monthly_ai_credits?: number; add_purchased_credits?: number },
  ) => {
    return apiClient.patch<AdminBoardDetail>(
      `/admin/boards/${boardId}/ai-credits`,
      data,
    );
  },

  // ==================== Organizations ====================

  // 조직 목록 조회
  getOrganizations: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.search) searchParams.append("search", params.search);
    return apiClient.get<OrgListResponse>(
      `/admin/organizations?${searchParams.toString()}`,
    );
  },

  // 삭제된 조직 목록 조회
  getDeletedOrganizations: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.search) searchParams.append("search", params.search);
    return apiClient.get<OrgListResponse>(
      `/admin/organizations/deleted?${searchParams.toString()}`,
    );
  },

  // 조직 상세 조회
  getOrganization: async (orgId: string) => {
    return apiClient.get<AdminOrgDetail>(`/admin/organizations/${orgId}`);
  },

  // 조직 정보 수정
  updateOrganization: async (
    orgId: string,
    data: { name?: string; description?: string },
  ) => {
    return apiClient.patch<AdminOrgDetail>(
      `/admin/organizations/${orgId}`,
      data,
    );
  },

  // 조직 삭제 (소프트)
  deleteOrganization: async (orgId: string) => {
    return apiClient.delete<{ message: string }>(
      `/admin/organizations/${orgId}`,
    );
  },

  // 조직 복구
  restoreOrganization: async (orgId: string) => {
    return apiClient.post<{ message: string }>(
      `/admin/organizations/${orgId}/restore`,
    );
  },

  // 조직 영구 삭제
  permanentlyDeleteOrganization: async (orgId: string) => {
    return apiClient.delete<{ message: string }>(
      `/admin/organizations/${orgId}/permanent`,
    );
  },

  // 소유권 이전
  transferOrgOwnership: async (orgId: string, newOwnerMemberId: string) => {
    return apiClient.post<AdminOrgDetail>(
      `/admin/organizations/${orgId}/transfer-ownership`,
      { new_owner_member_id: newOwnerMemberId },
    );
  },

  // 구독 수정
  updateOrgSubscription: async (
    orgId: string,
    data: {
      plan?: string;
      status?: string;
      billing_cycle?: string;
      seat_count?: number;
    },
  ) => {
    return apiClient.patch<AdminOrgDetail>(
      `/admin/organizations/${orgId}/subscription`,
      data,
    );
  },

  // Trial 연장
  extendOrgTrial: async (orgId: string, extendDays: number) => {
    return apiClient.patch<AdminOrgDetail>(
      `/admin/organizations/${orgId}/extend-trial`,
      { extend_days: extendDays },
    );
  },

  // 조직 AI 크레딧 조정
  adjustOrgAiCredits: async (
    orgId: string,
    data: {
      monthly_ai_credits?: number;
      reset_used_credits?: boolean;
      add_bonus_credits?: number;
    },
  ) => {
    return apiClient.patch<AdminOrgDetail>(
      `/admin/organizations/${orgId}/ai-credits`,
      data,
    );
  },

  // 조직 통계
  getOrgStatistics: async () => {
    return apiClient.get<AdminOrgStatistics>("/admin/organizations/statistics");
  },

  // 통계 조회
  getStatistics: async () => {
    return apiClient.get<AdminStatistics>("/admin/statistics");
  },

  // Analytics: 가입자 추이
  getSignupTrend: async (days: number = 30) => {
    return apiClient.get<SignupTrend>(`/admin/statistics/signups?days=${days}`);
  },

  // Analytics: DAU/WAU/MAU
  getActiveUserStats: async (days: number = 30) => {
    return apiClient.get<ActiveUserStats>(
      `/admin/statistics/active-users?days=${days}`,
    );
  },

  // Analytics: 결제 전환율
  getConversionStats: async (days: number = 365) => {
    return apiClient.get<ConversionStats>(
      `/admin/statistics/conversion?days=${days}`,
    );
  },

  // Analytics: Diary 통계
  getDiaryStats: async (days: number = 30) => {
    return apiClient.get<DiaryStats>(`/admin/statistics/diary?days=${days}`);
  },

  // Analytics: Personal → Team 전환 통계
  getPersonalConversionStats: async (days: number = 365) => {
    return apiClient.get<PersonalConversionStats>(
      `/admin/statistics/personal-conversion?days=${days}`,
    );
  },

  // Churn Analysis
  getRetentionAnalysis: async (weeks: number = 8) => {
    return apiClient.get<RetentionAnalysis>(
      `/admin/statistics/churn/retention?weeks=${weeks}`,
    );
  },
  getInactiveUsers: async (
    inactiveDays: number = 14,
    page: number = 0,
    size: number = 20,
  ) => {
    return apiClient.get<InactiveUserList>(
      `/admin/statistics/churn/inactive-users?inactive_days=${inactiveDays}&page=${page}&size=${size}`,
    );
  },
  getTrialDropoutAnalysis: async (days: number = 90) => {
    return apiClient.get<TrialDropoutAnalysis>(
      `/admin/statistics/churn/trial-dropout?days=${days}`,
    );
  },
  getActivityTrends: async (days: number = 90) => {
    return apiClient.get<ActivityTrends>(
      `/admin/statistics/churn/activity-trends?days=${days}`,
    );
  },

  // 구독 목록 조회
  getSubscriptions: async (params: { page?: number; size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    return apiClient.get<SubscriptionListResponse>(
      `/admin/subscriptions?${searchParams.toString()}`,
    );
  },

  // 공지사항 관리
  getAnnouncements: async () => {
    return apiClient.get<AnnouncementDetail[]>("/admin/announcements");
  },

  createAnnouncement: async (data: {
    title: string;
    content?: string;
    type?: "POPUP" | "BANNER" | "NOTICE";
    is_active?: boolean;
    start_at?: string | null;
    end_at?: string | null;
    priority?: number;
    target_role?: string | null;
  }) => {
    return apiClient.post<AnnouncementDetail>("/admin/announcements", data);
  },

  updateAnnouncement: async (
    id: string,
    data: {
      title: string;
      content?: string;
      type?: "POPUP" | "BANNER" | "NOTICE";
      is_active?: boolean;
      start_at?: string | null;
      end_at?: string | null;
      priority?: number;
      target_role?: string | null;
    },
  ) => {
    return apiClient.put<AnnouncementDetail>(
      `/admin/announcements/${id}`,
      data,
    );
  },

  deleteAnnouncement: async (id: string) => {
    return apiClient.delete<{ message: string }>(`/admin/announcements/${id}`);
  },

  bulkCreatePersonalBoards: async () => {
    return apiClient.post<BulkCreateResult>(
      "/admin/system/bulk-create-personal-boards",
      {},
    );
  },

  // 수익화 토글
  getMonetizationStatus: async () => {
    return apiClient.get<{ monetization_enabled: boolean }>(
      "/admin/system/monetization",
    );
  },

  setMonetizationEnabled: async (enabled: boolean) => {
    return apiClient.put<{ monetization_enabled: boolean }>(
      "/admin/system/monetization",
      { monetization_enabled: enabled },
    );
  },

  // 점검 모드
  getMaintenanceStatus: async () => {
    return apiClient.get<MaintenanceStatus>("/admin/system/maintenance");
  },

  setMaintenanceMode: async (data: {
    enabled: boolean;
    message?: string;
    estimated_end_at?: string | null;
  }) => {
    return apiClient.post<MaintenanceStatus>("/admin/system/maintenance", data);
  },

  // 문의 관리
  getInquiries: async (params: {
    page?: number;
    size?: number;
    status?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined)
      searchParams.append("page", params.page.toString());
    if (params.size !== undefined)
      searchParams.append("size", params.size.toString());
    if (params.status) searchParams.append("status", params.status);
    return apiClient.get<import("../types").InquiryListResponse>(
      `/admin/inquiries?${searchParams.toString()}`,
    );
  },

  getInquiryDetail: async (inquiryId: string) => {
    return apiClient.get<import("../types").InquiryDetail>(
      `/admin/inquiries/${inquiryId}`,
    );
  },

  replyToInquiry: async (inquiryId: string, content: string) => {
    return apiClient.post<import("../types").InquiryReply>(
      `/admin/inquiries/${inquiryId}/reply`,
      { content },
    );
  },

  updateInquiryStatus: async (inquiryId: string, status: string) => {
    return apiClient.patch<import("../types").InquiryDetail>(
      `/admin/inquiries/${inquiryId}/status`,
      { status },
    );
  },
};

// ========================================
// Inquiry API (유저용)
// ========================================

export const inquiryAPI = {
  createInquiry: async (data: {
    title: string;
    content: string;
    fileKeys?: string[];
  }) => {
    return apiClient.post<import("../types").InquiryDetail>("/inquiries", data);
  },

  getMyInquiries: async () => {
    return apiClient.get<import("../types").InquirySummary[]>("/inquiries");
  },

  getInquiry: async (inquiryId: string) => {
    return apiClient.get<import("../types").InquiryDetail>(
      `/inquiries/${inquiryId}`,
    );
  },

  replyToInquiry: async (inquiryId: string, content: string) => {
    return apiClient.post<import("../types").InquiryReply>(
      `/inquiries/${inquiryId}/replies`,
      { content },
    );
  },

  getUnreadReplyCount: async () => {
    return apiClient.get<number>("/inquiries/unread-count");
  },
};

// System API (공개)
export const systemAPI = {
  getStatus: async () => {
    return apiClient.get<MaintenanceStatus>("/system/status");
  },

  getActiveAnnouncements: async () => {
    return apiClient.get<AnnouncementDetail[]>("/system/announcements/active");
  },

  getMonetizationStatus: async () => {
    return apiClient.get<{ monetization_enabled: boolean }>(
      "/system/monetization",
    );
  },
};

// ========================================
// Notification API
// ========================================

export const notificationAPI = {
  getNotifications: async (params?: {
    boardId?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.boardId) query.set("boardId", params.boardId);
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", params.limit.toString());
    const queryString = query.toString();
    return apiClient.get<{
      notifications: Array<{
        id: string;
        type: string;
        title: string;
        message: string;
        board_id: string;
        board_name: string | null;
        task_id: string | null;
        comment_id: string | null;
        sender: {
          id: string;
          name: string | null;
          profile_image: string | null;
        };
        read: boolean;
        read_at: string | null;
        created_at: string;
      }>;
      unread_count: number;
      has_more: boolean;
      next_cursor: string | null;
    }>(`/notifications${queryString ? `?${queryString}` : ""}`);
  },

  getUnreadCount: async (boardId?: string) => {
    const query = boardId ? `?boardId=${boardId}` : "";
    return apiClient.get<{ unread_count: number }>(
      `/notifications/unread-count${query}`,
    );
  },

  getUnreadCounts: async (boardId?: string) => {
    const query = boardId ? `?boardId=${boardId}` : "";
    return apiClient.get<{
      unread_count: number;
      unread_inquiry_count: number;
    }>(`/notifications/unread-counts${query}`);
  },

  markAsRead: async (notificationId: string) => {
    return apiClient.put<Record<string, unknown>>(
      `/notifications/${notificationId}/read`,
    );
  },

  markAllAsRead: async (boardId?: string) => {
    const query = boardId ? `?boardId=${boardId}` : "";
    return apiClient.put<{ message: string }>(
      `/notifications/read-all${query}`,
    );
  },
};

// ========================================
// Slack Webhook API
// ========================================

export interface SlackWebhookConfig {
  id: string;
  board_id: string;
  webhook_url_masked: string;
  channel_name: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlackTestResult {
  success: boolean;
  message: string;
}

export interface SlackWebhookMemberStatus {
  user_id: string;
  connected: boolean;
  enabled: boolean;
  channel_name: string | null;
  account_linked?: boolean;  // Slack 계정 연동(봇 DM 수신 가능) 여부
  bot_installed?: boolean;   // 보드에 Slack 앱 설치 여부
  reachable?: boolean;       // 실제 Slack 알림 수신 상태 (봇 DM 또는 웹훅)
}

export const notificationPreferenceAPI = {
  getMyPreferences: async (boardId: string) => {
    return apiClient.get<{
      id: string | null;
      board_id: string;
      comment_mention_enabled: boolean;
      checklist_assigned_enabled: boolean;
      task_comment_enabled: boolean;
      slack_comment_mention_enabled: boolean;
      slack_checklist_assigned_enabled: boolean;
      slack_task_comment_enabled: boolean;
      discord_comment_mention_enabled: boolean;
      discord_checklist_assigned_enabled: boolean;
      discord_task_comment_enabled: boolean;
      discord_meeting_memo_shared_enabled: boolean;
      discord_note_comment_mention_enabled: boolean;
      created_at: string | null;
      updated_at: string | null;
    }>(`/boards/${boardId}/notification-preferences/me`);
  },

  upsertMyPreferences: async (
    boardId: string,
    data: {
      commentMentionEnabled?: boolean;
      checklistAssignedEnabled?: boolean;
      taskCommentEnabled?: boolean;
      slackCommentMentionEnabled?: boolean;
      slackChecklistAssignedEnabled?: boolean;
      slackTaskCommentEnabled?: boolean;
      discordCommentMentionEnabled?: boolean;
      discordChecklistAssignedEnabled?: boolean;
      discordTaskCommentEnabled?: boolean;
      discordMeetingMemoSharedEnabled?: boolean;
      discordNoteCommentMentionEnabled?: boolean;
    },
  ) => {
    return apiClient.put(`/boards/${boardId}/notification-preferences/me`, {
      comment_mention_enabled: data.commentMentionEnabled,
      checklist_assigned_enabled: data.checklistAssignedEnabled,
      task_comment_enabled: data.taskCommentEnabled,
      slack_comment_mention_enabled: data.slackCommentMentionEnabled,
      slack_checklist_assigned_enabled: data.slackChecklistAssignedEnabled,
      slack_task_comment_enabled: data.slackTaskCommentEnabled,
      discord_comment_mention_enabled: data.discordCommentMentionEnabled,
      discord_checklist_assigned_enabled: data.discordChecklistAssignedEnabled,
      discord_task_comment_enabled: data.discordTaskCommentEnabled,
      discord_meeting_memo_shared_enabled: data.discordMeetingMemoSharedEnabled,
      discord_note_comment_mention_enabled:
        data.discordNoteCommentMentionEnabled,
    });
  },
};

// ========================================
// Personal Access Token (PAT) API — MCP 연결용
// ========================================

export interface PatSummary {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** 발급 직후 1회만 반환. token(원문)은 이 응답에서만 볼 수 있다. */
export interface PatCreated {
  id: string;
  name: string;
  token: string;
  token_prefix: string;
  expires_at: string | null;
  created_at: string;
}

export const patAPI = {
  list: async () => apiClient.get<PatSummary[]>("/pat"),

  create: async (data: { name?: string; expiresInDays?: number | null }) =>
    apiClient.post<PatCreated>("/pat", {
      name: data.name || undefined,
      expires_in_days: data.expiresInDays ?? undefined,
    }),

  revoke: async (id: string) => apiClient.delete<void>(`/pat/${id}`),
};

export const slackWebhookAPI = {
  getMemberStatuses: async (boardId: string) => {
    return apiClient.get<SlackWebhookMemberStatus[]>(
      `/boards/${boardId}/slack-webhook/statuses`,
    );
  },

  getMyConfig: async (boardId: string) => {
    return apiClient.get<SlackWebhookConfig>(
      `/boards/${boardId}/slack-webhook/me`,
    );
  },

  upsertMyConfig: async (
    boardId: string,
    data: {
      webhookUrl?: string;
      channelName?: string;
      enabled?: boolean;
    },
  ) => {
    return apiClient.put<SlackWebhookConfig>(
      `/boards/${boardId}/slack-webhook/me`,
      {
        webhook_url: data.webhookUrl || undefined,
        channel_name: data.channelName,
        enabled: data.enabled,
      },
    );
  },

  deleteMyConfig: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/slack-webhook/me`,
    );
  },

  testMyWebhook: async (boardId: string) => {
    return apiClient.post<SlackTestResult>(
      `/boards/${boardId}/slack-webhook/me/test?brandName=${encodeURIComponent(domainBrandName)}`,
    );
  },
};

// ========================================
// Slack App (OAuth) API
// ========================================

export interface SlackAppInstallation {
  id: string;
  scope: "BOARD" | "ORGANIZATION";
  slack_team_id: string;
  slack_team_name: string;
  bot_user_id: string | null;
  active: boolean;
  installed_by_name: string | null;
  default_channel_id: string | null;
  default_channel_name: string | null;
  scopes: string | null;
  created_at: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  member_count: number;
}

export interface SlackChannelList {
  channels: SlackChannel[];
  next_cursor: string | null;
}

export interface SlackUserLinkStatus {
  linked: boolean;
  slack_user_id: string | null;
  slack_username: string | null;
  slack_team_id: string | null;
}

export interface SlackMemberStatus {
  user_id: string;
  linked: boolean;
  slack_username: string | null;
}

export const slackAppAPI = {
  getInstallUrl: async (scope: "BOARD" | "ORGANIZATION", entityId: string) => {
    const origin = encodeURIComponent(window.location.origin);
    return apiClient.get<{ url: string }>(
      `/slack/oauth/install?scope=${scope}&entity_id=${entityId}&origin=${origin}`,
    );
  },

  getStatus: async (boardId: string) => {
    return apiClient.get<SlackAppInstallation | null>(
      `/slack/app/status?board_id=${boardId}`,
    );
  },

  getOrgStatus: async (orgId: string) => {
    return apiClient.get<SlackAppInstallation | null>(
      `/slack/app/status?organization_id=${orgId}`,
    );
  },

  listChannels: async (boardId: string, cursor?: string) => {
    const params = cursor ? `&cursor=${cursor}` : "";
    return apiClient.get<SlackChannelList>(
      `/slack/app/channels?board_id=${boardId}${params}`,
    );
  },

  listOrgChannels: async (orgId: string, cursor?: string) => {
    const params = cursor ? `&cursor=${cursor}` : "";
    return apiClient.get<SlackChannelList>(
      `/slack/app/channels?organization_id=${orgId}${params}`,
    );
  },

  setDefaultChannel: async (
    installationId: string,
    channelId: string,
    channelName: string,
  ) => {
    return apiClient.put(
      `/slack/app/channel?installation_id=${installationId}`,
      {
        channelId: channelId,
        channelName: channelName,
      },
    );
  },

  uninstall: async (installationId: string) => {
    return apiClient.delete(`/slack/app/${installationId}`);
  },

  // User link (per-user Slack account linking for DM notifications)
  getUserLinkUrl: async (boardId: string) => {
    const origin = encodeURIComponent(window.location.origin);
    return apiClient.get<{ url: string }>(
      `/slack/oauth/user-link?board_id=${boardId}&origin=${origin}`,
    );
  },

  getUserLinkStatus: async () => {
    return apiClient.get<SlackUserLinkStatus>(`/slack/user/me`);
  },

  unlinkUser: async () => {
    return apiClient.delete(`/slack/user/me`);
  },

  getMemberStatuses: async (boardId: string) => {
    return apiClient.get<SlackMemberStatus[]>(
      `/slack/user/statuses?board_id=${boardId}`,
    );
  },

  testNotification: async (boardId: string) => {
    return apiClient.post<{ success: boolean; message: string }>(
      `/slack/app/test?board_id=${boardId}`,
      {},
    );
  },
};

// ========================================
// Discord Bot API
// ========================================

export interface DiscordBotConfig {
  board_id: string;
  guild_id: string;
  guild_name: string;
  channel_id: string | null;
  channel_name: string | null;
  bot_connected: boolean;
  installed_by: string;
  created_at: string;
}

export interface DiscordUserLinkStatus {
  linked: boolean;
  discord_user_id: string | null;
  discord_username: string | null;
}

export interface DiscordMemberStatus {
  user_id: string;
  linked: boolean;
  discord_username: string | null;
  enabled: boolean;
}

export interface DiscordTestResult {
  success: boolean;
  message: string;
}

export const discordAPI = {
  getOAuthUrl: async (boardId: string, type: "bot_install" | "user_link") => {
    const origin = encodeURIComponent(window.location.origin);
    return apiClient.get<{ oauth_url: string }>(
      `/boards/${boardId}/discord/oauth-url?type=${type}&origin=${origin}`,
    );
  },

  getConfig: async (boardId: string) => {
    return apiClient.get<DiscordBotConfig | null>(
      `/boards/${boardId}/discord/config`,
    );
  },

  deleteConfig: async (boardId: string) => {
    return apiClient.delete(`/boards/${boardId}/discord/config`);
  },

  getMyLink: async (boardId: string) => {
    return apiClient.get<DiscordUserLinkStatus>(
      `/boards/${boardId}/discord/me`,
    );
  },

  unlinkMe: async (boardId: string) => {
    return apiClient.delete(`/boards/${boardId}/discord/me`);
  },

  getMemberStatuses: async (boardId: string) => {
    return apiClient.get<DiscordMemberStatus[]>(
      `/boards/${boardId}/discord/statuses`,
    );
  },

  testNotification: async (boardId: string) => {
    return apiClient.post<DiscordTestResult>(`/boards/${boardId}/discord/test`);
  },
};

// ========================================
// JIRA Integration API
// ========================================

export interface JiraStatus {
  board_id: string;
  connected: boolean;
  auth_type: string | null; // API_TOKEN / OAUTH_3LO
  needs_site_selection: boolean;
  base_url: string | null;
  project_key: string | null;
  jql: string | null;
  status: string; // CONNECTED / ERROR / DISCONNECTED
  last_synced_at: string | null;
  last_error: string | null;
  milestone_auto_assign: boolean;
  write_back_enabled: boolean;
  write_back_target_status_id: string | null;
  /** 블록↔JIRA status 양방향 매핑 (key=blockId/__rejected). */
  block_status_map: Record<string, JiraBlockStatusEntry> | null;
  /** 웹훅 수신 토큰(Phase 4). 근실시간 pull URL 조립용. */
  webhook_token: string | null;
  connected_by_name: string | null;
  /** 동기화 방식 MANUAL/MIRROR. 신규 UI는 MIRROR만. */
  sync_mode: string | null;
  /** 미러 준비 완료(MIRROR + 상태별 컬럼 생성됨). 가이드/JIRA뷰 진입 판단. */
  mirror_ready: boolean;
  /** 미러 대상으로 선택된 JIRA Agile 보드 id (null=자동선택). 보드 드롭다운 초기값. */
  agile_board_id: string | null;
}

/** 프로젝트의 JIRA Agile 보드 (미러 대상 선택 드롭다운용). */
export interface JiraAgileBoard {
  id: string;
  name: string;
  type: string; // kanban / scrum / simple
  selected: boolean;
}

/** 매핑 항목: key=blockId(블록 매핑) 또는 "__rejected"(반려 전환 규칙). */
export interface JiraBlockStatusEntry {
  jira_status_id?: string;
  dir?: "push" | "pull";
  qa?: "REVIEW" | "VERIFIED";
  /** __rejected 전용: 반려 시작 status(검토중). 여기서 개발 블록으로 되돌리면 반려로 감지. */
  from_status_id?: string;
  /** __rejected 전용: 반려 시 복귀할 블록(작업 중). */
  return_block_id?: string;
}

export interface JiraSiteRef {
  cloud_id: string;
  url: string;
  name: string;
}

export interface JiraTestResult {
  success: boolean;
  message: string;
  project_name: string | null;
}

export interface JiraNameRef {
  id: string;
  name: string;
  /** JIRA statusCategory: new(할 일) / indeterminate(진행 중) / done(완료). */
  category?: string | null;
  /** JIRA statusCategory.colorName. */
  category_color?: string | null;
}

export interface JiraBlockRef {
  id: string;
  name: string;
  fixed_type: string | null;
  /** 미러 컬럼이면 대표 JIRA 상태 id. */
  jira_status_id: string | null;
  /** 미러 컬럼에 묶인 JIRA 상태 id 전체 (카드 배치용). */
  jira_status_ids: string[] | null;
}

export interface JiraMeta {
  statuses: JiraNameRef[];
  blocks: JiraBlockRef[];
}

export interface JiraMirrorSetup {
  columns: number;
  created: number;
  reused: number;
  status: JiraStatus;
  /** 컬럼 출처: BOARD_CONFIG(JIRA 보드 구성) / STATUS_FALLBACK(보드 구성 실패→상태 목록). */
  column_source: string | null;
  /** 출처 상세 — BOARD_CONFIG면 보드명, STATUS_FALLBACK면 폴백 사유. */
  column_source_detail: string | null;
}

export interface JiraTransitions {
  task_id: string;
  current_status_id: string | null;
  /** 이 카드가 드롭 가능한 JIRA 상태 id들. */
  allowed_status_ids: string[];
}

export interface JiraPreviewItem {
  key: string;
  summary: string;
  target_type: "FEATURE" | "TASK";
  block_name: string | null;
  assignee_name: string | null;
  assignee_matched: boolean;
  parent_key: string | null;
  attachment_count: number;
  skipped: boolean;
  skip_reason: string | null;
  will_update: boolean;
}

export interface JiraImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  features: number;
  tasks: number;
  checklists: number;
  comments: number;
  milestone_name?: string | null;
  items?: JiraPreviewItem[] | null;
  errors: string[];
}

export const jiraAPI = {
  getStatus: async (boardId: string) => {
    return apiClient.get<JiraStatus | null>(`/boards/${boardId}/jira/status`);
  },

  // ── OAuth (Atlassian으로 연결) ──
  getOAuthUrl: async (boardId: string) => {
    const origin = encodeURIComponent(window.location.origin);
    return apiClient.get<{ oauth_url: string }>(
      `/boards/${boardId}/jira/oauth/url?origin=${origin}`,
    );
  },
  getSites: async (boardId: string) => {
    return apiClient.get<JiraSiteRef[]>(`/boards/${boardId}/jira/oauth/sites`);
  },
  finalize: async (
    boardId: string,
    data: { cloudId: string; baseUrl: string; projectKey: string },
  ) => {
    return apiClient.post<JiraStatus>(
      `/boards/${boardId}/jira/oauth/finalize`,
      {
        cloud_id: data.cloudId,
        base_url: data.baseUrl,
        project_key: data.projectKey,
      },
    );
  },

  connect: async (
    boardId: string,
    data: {
      baseUrl: string;
      projectKey: string;
      accountEmail: string;
      apiToken: string;
      jql?: string;
    },
  ) => {
    return apiClient.post<JiraStatus>(`/boards/${boardId}/jira/connect`, {
      base_url: data.baseUrl,
      project_key: data.projectKey,
      account_email: data.accountEmail,
      api_token: data.apiToken,
      jql: data.jql || undefined,
    });
  },

  test: async (boardId: string) => {
    return apiClient.post<JiraTestResult>(`/boards/${boardId}/jira/test`);
  },

  getMeta: async (boardId: string) => {
    return apiClient.get<JiraMeta>(`/boards/${boardId}/jira/meta`);
  },

  updateWriteBack: async (
    boardId: string,
    data: { enabled: boolean; targetStatusId?: string | null },
  ) => {
    return apiClient.put<JiraStatus>(`/boards/${boardId}/jira/write-back`, {
      enabled: data.enabled,
      target_status_id: data.targetStatusId || undefined,
    });
  },

  updateBlockStatusMap: async (
    boardId: string,
    blockStatusMap: Record<string, JiraBlockStatusEntry>,
  ) => {
    return apiClient.put<JiraStatus>(
      `/boards/${boardId}/jira/block-status-map`,
      { block_status_map: blockStatusMap },
    );
  },

  /** 미러 대상으로 고를 수 있는 프로젝트의 JIRA Agile 보드 목록. */
  getBoards: async (boardId: string) => {
    return apiClient.get<JiraAgileBoard[]>(`/boards/${boardId}/jira/boards`);
  },

  /** 미러 대상 Agile 보드 선택 (빈 문자열이면 자동 선택). 저장 후 재동기화 필요. */
  selectAgileBoard: async (boardId: string, agileBoardId: string) => {
    return apiClient.put<JiraStatus>(`/boards/${boardId}/jira/agile-board`, {
      agile_board_id: agileBoardId || undefined,
    });
  },

  /** 미러 셋업 — JIRA 상태별 미러 컬럼 생성 + 미러 모드 전환 (멱등). */
  setupMirror: async (boardId: string) => {
    return apiClient.post<JiraMirrorSetup>(
      `/boards/${boardId}/jira/mirror/setup`,
    );
  },

  /** pre-block — 이 태스크에서 드롭 가능한 JIRA 상태 id 목록. */
  getTaskTransitions: async (boardId: string, taskId: string) => {
    return apiClient.get<JiraTransitions>(
      `/boards/${boardId}/jira/tasks/${taskId}/transitions`,
    );
  },

  importIssues: async (
    boardId: string,
    data?: { jql?: string; preview?: boolean },
  ) => {
    return apiClient.post<JiraImportResult>(`/boards/${boardId}/jira/import`, {
      jql: data?.jql || undefined,
      preview: data?.preview ?? false,
    });
  },

  disconnect: async (boardId: string) => {
    return apiClient.delete<{ message: string }>(`/boards/${boardId}/jira`);
  },
};

// ========================================
// Daily Standup Config API
// ========================================

import type { StandupConfig } from "../types";

export const standupConfigAPI = {
  getConfig: async (boardId: string) => {
    return apiClient.get<StandupConfig>(`/boards/${boardId}/standup-config`);
  },

  upsertConfig: async (
    boardId: string,
    data: {
      enabled: boolean;
      sendHour: number;
      sendMinute: number;
      timezone: string;
      language?: string;
    },
  ) => {
    return apiClient.put<StandupConfig>(`/boards/${boardId}/standup-config`, {
      enabled: data.enabled,
      send_hour: data.sendHour,
      send_minute: data.sendMinute,
      timezone: data.timezone,
      language: data.language,
    });
  },
};

// ========================================
// AI Report API
// ========================================

import type { ReportType, WeeklyReport, WeeklyReportListItem } from "../types";

export const reportAPI = {
  generateReport: async (
    boardId: string,
    data: {
      reportType: ReportType;
      periodStart: string;
      periodEnd: string;
      language?: string;
      targetUserId?: string;
    },
  ) => {
    return apiClient.post<WeeklyReport>(`/boards/${boardId}/reports`, {
      report_type: data.reportType,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      language: data.language,
      target_user_id: data.targetUserId,
    });
  },

  getReports: async (
    boardId: string,
    reportType?: ReportType,
    targetUserId?: string,
  ) => {
    const params = new URLSearchParams();
    if (reportType) params.set("report_type", reportType);
    if (targetUserId) params.set("target_user_id", targetUserId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<{ reports: WeeklyReportListItem[] }>(
      `/boards/${boardId}/reports${query}`,
    );
  },

  getReport: async (boardId: string, reportId: string) => {
    return apiClient.get<WeeklyReport>(
      `/boards/${boardId}/reports/${reportId}`,
    );
  },

  regenerateReport: async (
    boardId: string,
    reportId: string,
    language?: string,
  ) => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.post<WeeklyReport>(
      `/boards/${boardId}/reports/${reportId}/regenerate${params}`,
    );
  },
};

// ========================================
// Note API
// ========================================

export interface NoteTreeItem {
  id: string;
  parent_id: string | null;
  type: "FOLDER" | "DOCUMENT" | "BOARD";
  title: string;
  position: number;
  depth: number;
  tags: NoteTagInfo[];
  created_by: NoteUserInfo;
  updated_by: NoteUserInfo;
  created_at: string;
  updated_at: string;
  children: NoteTreeItem[];
}

export interface BoardNoteSection {
  board_id: string;
  board_name: string;
  note_count: number;
  user_role: string;
  tree: NoteTreeItem[];
}

export interface NoteDetail {
  id: string;
  parent_id: string | null;
  type: "FOLDER" | "DOCUMENT" | "BOARD";
  title: string;
  content: string | null;
  position: number;
  depth: number;
  tags: NoteTagInfo[];
  created_by: NoteUserInfo;
  updated_by: NoteUserInfo;
  created_at: string;
  updated_at: string;
  version_count: number;
  ai_suggestions: string | null;
  ai_content_snapshot: string | null;
  is_shared: boolean;
  share_token: string | null;
  share_code: string | null;
  has_unpublished_draft: boolean;
  like_count: number;
  liked: boolean;
}

export interface SharedNote {
  title: string;
  content: string | null;
  type: "FOLDER" | "DOCUMENT" | "BOARD";
  tags: NoteTagInfo[];
  author_name: string;
  updated_at: string;
  /** 링크 미리보기용 평문 발췌 (BOARD/발췌 불가 시 null) */
  excerpt?: string | null;
  /** 상위 폴더 제목 */
  parent_title?: string | null;
  /** 소속 보드명 또는 조직명 */
  board_name?: string | null;
}

export interface NoteAISuggestionResponse {
  noteId: string;
  noteTitle: string;
  key_points: string[];
  summary: AISummaryTopic[];
  features: AIFeatureSuggestion[];
}

export interface NoteAIApplyResult {
  features_created: number;
  tasks_created: number;
  checklists_created: number;
  created_feature_ids: string[];
  created_task_ids: string[];
}

export interface NoteListItem {
  id: string;
  title: string;
  parent_id: string | null;
  parent_title: string | null;
  tags: NoteTagInfo[];
  updated_by: NoteUserInfo;
  created_at: string;
  updated_at: string;
}

export interface NoteTagInfo {
  id: string;
  name: string;
  color: string;
}

export interface NoteTrashItem {
  id: string;
  type: "FOLDER" | "DOCUMENT" | "BOARD";
  title: string;
  parent_id: string | null;
  parent_title: string | null;
  parent_deleted: boolean;
  has_children: boolean;
  deleted_by: NoteUserInfo | null;
  deleted_at: string | null;
  created_at: string;
}

export interface NoteUserInfo {
  id: string;
  name: string;
  profile_image: string | null;
}

export interface NoteVersionInfo {
  id: string;
  version_number: number;
  title: string;
  created_by: NoteUserInfo;
  created_at: string;
}

export interface NoteVersionDetail {
  id: string;
  version_number: number;
  title: string;
  content: string | null;
  created_by: NoteUserInfo;
  created_at: string;
}

export interface NoteCommentAuthor {
  id: string | null;
  name: string;
  profile_image: string | null;
}

export interface NoteCommentDetail {
  id: string;
  note_id: string;
  block_id: string | null;
  parent_id: string | null;
  author: NoteCommentAuthor;
  content: string;
  mentions: string[];
  is_resolved: boolean;
  resolved_by: NoteCommentAuthor | null;
  resolved_at: string | null;
  reactions: CommentReactionResponse[];
  replies: NoteCommentDetail[];
  created_at: string;
  updated_at: string;
}

export interface NoteCommentListResponse {
  threads: NoteCommentDetail[];
  total_threads: number;
}

export const noteCommentAPI = {
  getComments: async (boardId: string, noteId: string) => {
    return apiClient.get<NoteCommentListResponse>(
      `/boards/${boardId}/notes/${noteId}/comments`,
    );
  },

  createComment: async (
    boardId: string,
    noteId: string,
    data: {
      content: string;
      block_id?: string | null;
      parent_id?: string | null;
      mentions?: string[];
    },
  ) => {
    return apiClient.post<NoteCommentDetail>(
      `/boards/${boardId}/notes/${noteId}/comments`,
      data,
    );
  },

  updateComment: async (
    boardId: string,
    noteId: string,
    commentId: string,
    data: {
      content: string;
      mentions?: string[];
    },
  ) => {
    return apiClient.put<NoteCommentDetail>(
      `/boards/${boardId}/notes/${noteId}/comments/${commentId}`,
      data,
    );
  },

  deleteComment: async (boardId: string, noteId: string, commentId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/notes/${noteId}/comments/${commentId}`,
    );
  },

  toggleResolved: async (
    boardId: string,
    noteId: string,
    commentId: string,
  ) => {
    return apiClient.post<NoteCommentDetail>(
      `/boards/${boardId}/notes/${noteId}/comments/${commentId}/resolve`,
    );
  },

  toggleReaction: async (
    boardId: string,
    noteId: string,
    commentId: string,
    emoji: string,
  ) => {
    return apiClient.post<ReactionsToggleResponse>(
      `/boards/${boardId}/notes/${noteId}/comments/${commentId}/reactions/toggle`,
      { emoji },
    );
  },
};

/**
 * Build the query string for a note update (PUT). Both flags default to true on
 * the server, so only the false cases are emitted.
 *   createVersion=false → title-only autosaves that must not snapshot a version.
 *   discardDraft=false  → publish while other editors are live; keep the shared
 *                         Yjs draft instead of nuking it out from under them.
 */
function buildNoteUpdateParams(
  createVersion: boolean,
  discardDraft: boolean,
): string {
  const parts: string[] = [];
  if (!createVersion) parts.push("createVersion=false");
  if (!discardDraft) parts.push("discardDraft=false");
  return parts.length ? `?${parts.join("&")}` : "";
}

export const noteAPI = {
  getTree: async (boardId: string) => {
    return apiClient.get<NoteTreeItem[]>(`/boards/${boardId}/notes`);
  },

  getList: async (boardId: string) => {
    return apiClient.get<NoteListItem[]>(`/boards/${boardId}/notes/list`);
  },

  getDetail: async (boardId: string, noteId: string) => {
    return apiClient.get<NoteDetail>(`/boards/${boardId}/notes/${noteId}`);
  },

  create: async (
    boardId: string,
    data: {
      title: string;
      type: "FOLDER" | "DOCUMENT" | "BOARD";
      parentId?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ) => {
    return apiClient.post<NoteDetail>(`/boards/${boardId}/notes`, {
      title: data.title,
      type: data.type,
      parent_id: data.parentId,
      content: data.content,
      tag_ids: data.tagIds,
    });
  },

  update: async (
    boardId: string,
    noteId: string,
    data: {
      title?: string;
      content?: string;
      tagIds?: string[];
    },
    createVersion = true,
    discardDraft = true,
  ) => {
    const params = buildNoteUpdateParams(createVersion, discardDraft);
    return apiClient.put<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}${params}`,
      data,
    );
  },

  delete: async (boardId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/notes/${noteId}`,
    );
  },

  move: async (
    boardId: string,
    noteId: string,
    data: {
      parentId?: string | null;
      position?: number;
    },
  ) => {
    return apiClient.put<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/move`,
      {
        parent_id: data.parentId,
        position: data.position,
      },
    );
  },

  getVersions: async (boardId: string, noteId: string) => {
    return apiClient.get<NoteVersionInfo[]>(
      `/boards/${boardId}/notes/${noteId}/versions`,
    );
  },

  getVersionDetail: async (
    boardId: string,
    noteId: string,
    versionId: string,
  ) => {
    return apiClient.get<NoteVersionDetail>(
      `/boards/${boardId}/notes/${noteId}/versions/${versionId}`,
    );
  },

  restoreVersion: async (
    boardId: string,
    noteId: string,
    versionId: string,
    liveSnapshot?: { current_title?: string; current_content?: string },
  ) => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/versions/${versionId}/restore`,
      liveSnapshot,
    );
  },

  deleteVersion: async (boardId: string, noteId: string, versionId: string) => {
    return apiClient.delete<void>(
      `/boards/${boardId}/notes/${noteId}/versions/${versionId}`,
    );
  },

  deleteAllVersions: async (boardId: string, noteId: string) => {
    return apiClient.delete<void>(
      `/boards/${boardId}/notes/${noteId}/versions`,
    );
  },

  discardDraft: async (boardId: string, noteId: string) => {
    return apiClient.delete<void>(`/boards/${boardId}/notes/${noteId}/draft`);
  },

  restoreDraft: async (boardId: string, noteId: string) => {
    return apiClient.post<void>(
      `/boards/${boardId}/notes/${noteId}/draft/restore`,
    );
  },

  hasArchivedDraft: async (boardId: string, noteId: string) => {
    return apiClient.get<{ available: boolean }>(
      `/boards/${boardId}/notes/${noteId}/draft/archived`,
    );
  },

  getTags: async (boardId: string) => {
    return apiClient.get<NoteTagInfo[]>(`/boards/${boardId}/note-tags`);
  },

  createTag: async (boardId: string, data: { name: string; color: string }) => {
    return apiClient.post<NoteTagInfo>(`/boards/${boardId}/note-tags`, data);
  },

  deleteTag: async (boardId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/note-tags/${tagId}`,
    );
  },

  aiOrganize: async (
    boardId: string,
    noteId: string,
    language?: string,
  ): Promise<NoteAISuggestionResponse> => {
    const params = language ? `?language=${language}` : "";
    return apiClient.post<NoteAISuggestionResponse>(
      `/boards/${boardId}/notes/${noteId}/ai-organize${params}`,
    );
  },

  aiApply: async (
    boardId: string,
    noteId: string,
    data: AIApplyRequest,
  ): Promise<NoteAIApplyResult> => {
    return apiClient.post<NoteAIApplyResult>(
      `/boards/${boardId}/notes/${noteId}/ai-apply`,
      data,
    );
  },

  enableShare: async (boardId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/share`,
    );
  },

  disableShare: async (boardId: string, noteId: string) => {
    return apiClient.delete<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/share`,
    );
  },

  rotateShareToken: async (boardId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/share/rotate`,
    );
  },

  // ===== Like =====
  toggleLike: async (boardId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/like/toggle`,
    );
  },

  // ===== Trash =====

  getTrash: async (boardId: string) => {
    return apiClient.get<NoteTrashItem[]>(`/boards/${boardId}/notes/trash`);
  },

  restoreFromTrash: async (boardId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/boards/${boardId}/notes/${noteId}/restore`,
    );
  },

  permanentDelete: async (boardId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/notes/${noteId}/permanent`,
    );
  },

  emptyTrash: async (boardId: string) => {
    return apiClient.delete<{ deleted_count: number }>(
      `/boards/${boardId}/notes/trash`,
    );
  },
};

export const publicNoteAPI = {
  getSharedNote: async (shareToken: string) => {
    return apiClient.get<SharedNote>(`/public/notes/${shareToken}`, true);
  },
};

// ========================================
// Organization Note API
// ========================================

export const orgNoteAPI = {
  getBoardNotes: async (orgId: string) => {
    return apiClient.get<BoardNoteSection[]>(
      `/organizations/${orgId}/notes/board-notes`,
    );
  },

  getTree: async (orgId: string) => {
    return apiClient.get<NoteTreeItem[]>(`/organizations/${orgId}/notes`);
  },

  getList: async (orgId: string) => {
    return apiClient.get<NoteListItem[]>(`/organizations/${orgId}/notes/list`);
  },

  getDetail: async (orgId: string, noteId: string) => {
    return apiClient.get<NoteDetail>(`/organizations/${orgId}/notes/${noteId}`);
  },

  create: async (
    orgId: string,
    data: {
      title: string;
      type: "FOLDER" | "DOCUMENT" | "BOARD";
      parentId?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ) => {
    return apiClient.post<NoteDetail>(`/organizations/${orgId}/notes`, {
      title: data.title,
      type: data.type,
      parent_id: data.parentId,
      content: data.content,
      tag_ids: data.tagIds,
    });
  },

  update: async (
    orgId: string,
    noteId: string,
    data: {
      title?: string;
      content?: string;
      tagIds?: string[];
    },
    createVersion = true,
    discardDraft = true,
  ) => {
    const params = buildNoteUpdateParams(createVersion, discardDraft);
    return apiClient.put<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}${params}`,
      data,
    );
  },

  delete: async (orgId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/organizations/${orgId}/notes/${noteId}`,
    );
  },

  move: async (
    orgId: string,
    noteId: string,
    data: {
      parentId?: string | null;
      position?: number;
    },
  ) => {
    return apiClient.put<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/move`,
      {
        parent_id: data.parentId,
        position: data.position,
      },
    );
  },

  getVersions: async (orgId: string, noteId: string) => {
    return apiClient.get<NoteVersionInfo[]>(
      `/organizations/${orgId}/notes/${noteId}/versions`,
    );
  },

  getVersionDetail: async (
    orgId: string,
    noteId: string,
    versionId: string,
  ) => {
    return apiClient.get<NoteVersionDetail>(
      `/organizations/${orgId}/notes/${noteId}/versions/${versionId}`,
    );
  },

  restoreVersion: async (
    orgId: string,
    noteId: string,
    versionId: string,
    liveSnapshot?: { current_title?: string; current_content?: string },
  ) => {
    return apiClient.post<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/versions/${versionId}/restore`,
      liveSnapshot,
    );
  },

  deleteVersion: async (orgId: string, noteId: string, versionId: string) => {
    return apiClient.delete<void>(
      `/organizations/${orgId}/notes/${noteId}/versions/${versionId}`,
    );
  },

  deleteAllVersions: async (orgId: string, noteId: string) => {
    return apiClient.delete<void>(
      `/organizations/${orgId}/notes/${noteId}/versions`,
    );
  },

  discardDraft: async (orgId: string, noteId: string) => {
    return apiClient.delete<void>(
      `/organizations/${orgId}/notes/${noteId}/draft`,
    );
  },

  restoreDraft: async (orgId: string, noteId: string) => {
    return apiClient.post<void>(
      `/organizations/${orgId}/notes/${noteId}/draft/restore`,
    );
  },

  hasArchivedDraft: async (orgId: string, noteId: string) => {
    return apiClient.get<{ available: boolean }>(
      `/organizations/${orgId}/notes/${noteId}/draft/archived`,
    );
  },

  getTags: async (orgId: string) => {
    return apiClient.get<NoteTagInfo[]>(`/organizations/${orgId}/note-tags`);
  },

  createTag: async (orgId: string, data: { name: string; color: string }) => {
    return apiClient.post<NoteTagInfo>(
      `/organizations/${orgId}/note-tags`,
      data,
    );
  },

  deleteTag: async (orgId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(
      `/organizations/${orgId}/note-tags/${tagId}`,
    );
  },

  enableShare: async (orgId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/share`,
    );
  },

  disableShare: async (orgId: string, noteId: string) => {
    return apiClient.delete<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/share`,
    );
  },

  rotateShareToken: async (orgId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/share/rotate`,
    );
  },

  // ===== Like =====
  toggleLike: async (orgId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/like/toggle`,
    );
  },

  // ===== Trash =====

  getTrash: async (orgId: string) => {
    return apiClient.get<NoteTrashItem[]>(
      `/organizations/${orgId}/notes/trash`,
    );
  },

  restoreFromTrash: async (orgId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(
      `/organizations/${orgId}/notes/${noteId}/restore`,
    );
  },

  permanentDelete: async (orgId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/organizations/${orgId}/notes/${noteId}/permanent`,
    );
  },

  emptyTrash: async (orgId: string) => {
    return apiClient.delete<{ deleted_count: number }>(
      `/organizations/${orgId}/notes/trash`,
    );
  },
};

export const orgNoteCommentAPI = {
  getComments: async (orgId: string, noteId: string) => {
    return apiClient.get<NoteCommentListResponse>(
      `/organizations/${orgId}/notes/${noteId}/comments`,
    );
  },

  createComment: async (
    orgId: string,
    noteId: string,
    data: {
      content: string;
      block_id?: string | null;
      parent_id?: string | null;
      mentions?: string[];
    },
  ) => {
    return apiClient.post<NoteCommentDetail>(
      `/organizations/${orgId}/notes/${noteId}/comments`,
      data,
    );
  },

  updateComment: async (
    orgId: string,
    noteId: string,
    commentId: string,
    data: {
      content: string;
      mentions?: string[];
    },
  ) => {
    return apiClient.put<NoteCommentDetail>(
      `/organizations/${orgId}/notes/${noteId}/comments/${commentId}`,
      data,
    );
  },

  deleteComment: async (orgId: string, noteId: string, commentId: string) => {
    return apiClient.delete<{ message: string }>(
      `/organizations/${orgId}/notes/${noteId}/comments/${commentId}`,
    );
  },

  toggleResolved: async (orgId: string, noteId: string, commentId: string) => {
    return apiClient.post<NoteCommentDetail>(
      `/organizations/${orgId}/notes/${noteId}/comments/${commentId}/resolve`,
    );
  },

  toggleReaction: async (
    orgId: string,
    noteId: string,
    commentId: string,
    emoji: string,
  ) => {
    return apiClient.post<ReactionsToggleResponse>(
      `/organizations/${orgId}/notes/${noteId}/comments/${commentId}/reactions/toggle`,
      { emoji },
    );
  },
};

// ========================================
// Personal (MySpace) Note API — owner-scoped mirror of orgNoteAPI.
// Scope는 JWT의 현재 사용자로 암묵 결정되므로 경로에 scope id가 없다.
// 첫 인자 _scopeId는 noteService/orgNoteService와 시그니처를 맞추기 위한 무시값.
// ========================================

export const myNoteAPI = {
  getTree: async (_scopeId?: string) => {
    return apiClient.get<NoteTreeItem[]>(`/me/notes`);
  },

  getList: async (_scopeId?: string) => {
    return apiClient.get<NoteListItem[]>(`/me/notes/list`);
  },

  getDetail: async (_scopeId: string, noteId: string) => {
    return apiClient.get<NoteDetail>(`/me/notes/${noteId}`);
  },

  create: async (
    _scopeId: string,
    data: {
      title: string;
      type: "FOLDER" | "DOCUMENT" | "BOARD";
      parentId?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ) => {
    return apiClient.post<NoteDetail>(`/me/notes`, {
      title: data.title,
      type: data.type,
      parent_id: data.parentId,
      content: data.content,
      tag_ids: data.tagIds,
    });
  },

  update: async (
    _scopeId: string,
    noteId: string,
    data: {
      title?: string;
      content?: string;
      tagIds?: string[];
    },
    createVersion = true,
    discardDraft = true,
  ) => {
    const params = buildNoteUpdateParams(createVersion, discardDraft);
    return apiClient.put<NoteDetail>(`/me/notes/${noteId}${params}`, data);
  },

  delete: async (_scopeId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(`/me/notes/${noteId}`);
  },

  move: async (
    _scopeId: string,
    noteId: string,
    data: {
      parentId?: string | null;
      position?: number;
    },
  ) => {
    return apiClient.put<NoteDetail>(`/me/notes/${noteId}/move`, {
      parent_id: data.parentId,
      position: data.position,
    });
  },

  getVersions: async (_scopeId: string, noteId: string) => {
    return apiClient.get<NoteVersionInfo[]>(`/me/notes/${noteId}/versions`);
  },

  getVersionDetail: async (
    _scopeId: string,
    noteId: string,
    versionId: string,
  ) => {
    return apiClient.get<NoteVersionDetail>(
      `/me/notes/${noteId}/versions/${versionId}`,
    );
  },

  restoreVersion: async (
    _scopeId: string,
    noteId: string,
    versionId: string,
    liveSnapshot?: { current_title?: string; current_content?: string },
  ) => {
    return apiClient.post<NoteDetail>(
      `/me/notes/${noteId}/versions/${versionId}/restore`,
      liveSnapshot,
    );
  },

  deleteVersion: async (
    _scopeId: string,
    noteId: string,
    versionId: string,
  ) => {
    return apiClient.delete<void>(`/me/notes/${noteId}/versions/${versionId}`);
  },

  deleteAllVersions: async (_scopeId: string, noteId: string) => {
    return apiClient.delete<void>(`/me/notes/${noteId}/versions`);
  },

  discardDraft: async (_scopeId: string, noteId: string) => {
    return apiClient.delete<void>(`/me/notes/${noteId}/draft`);
  },

  restoreDraft: async (_scopeId: string, noteId: string) => {
    return apiClient.post<void>(`/me/notes/${noteId}/draft/restore`);
  },

  hasArchivedDraft: async (_scopeId: string, noteId: string) => {
    return apiClient.get<{ available: boolean }>(
      `/me/notes/${noteId}/draft/archived`,
    );
  },

  getTags: async (_scopeId?: string) => {
    return apiClient.get<NoteTagInfo[]>(`/me/note-tags`);
  },

  createTag: async (
    _scopeId: string,
    data: { name: string; color: string },
  ) => {
    return apiClient.post<NoteTagInfo>(`/me/note-tags`, data);
  },

  deleteTag: async (_scopeId: string, tagId: string) => {
    return apiClient.delete<{ message: string }>(`/me/note-tags/${tagId}`);
  },

  enableShare: async (_scopeId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(`/me/notes/${noteId}/share`);
  },

  disableShare: async (_scopeId: string, noteId: string) => {
    return apiClient.delete<NoteDetail>(`/me/notes/${noteId}/share`);
  },

  rotateShareToken: async (_scopeId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(`/me/notes/${noteId}/share/rotate`);
  },

  toggleLike: async (_scopeId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(`/me/notes/${noteId}/like/toggle`);
  },

  getTrash: async (_scopeId?: string) => {
    return apiClient.get<NoteTrashItem[]>(`/me/notes/trash`);
  },

  restoreFromTrash: async (_scopeId: string, noteId: string) => {
    return apiClient.post<NoteDetail>(`/me/notes/${noteId}/restore`);
  },

  permanentDelete: async (_scopeId: string, noteId: string) => {
    return apiClient.delete<{ message: string }>(
      `/me/notes/${noteId}/permanent`,
    );
  },

  emptyTrash: async (_scopeId?: string) => {
    return apiClient.delete<{ deleted_count: number }>(`/me/notes/trash`);
  },
};

export const myNoteCommentAPI = {
  getComments: async (_scopeId: string, noteId: string) => {
    return apiClient.get<NoteCommentListResponse>(
      `/me/notes/${noteId}/comments`,
    );
  },

  createComment: async (
    _scopeId: string,
    noteId: string,
    data: {
      content: string;
      block_id?: string | null;
      parent_id?: string | null;
      mentions?: string[];
    },
  ) => {
    return apiClient.post<NoteCommentDetail>(
      `/me/notes/${noteId}/comments`,
      data,
    );
  },

  updateComment: async (
    _scopeId: string,
    noteId: string,
    commentId: string,
    data: {
      content: string;
      mentions?: string[];
    },
  ) => {
    return apiClient.put<NoteCommentDetail>(
      `/me/notes/${noteId}/comments/${commentId}`,
      data,
    );
  },

  deleteComment: async (
    _scopeId: string,
    noteId: string,
    commentId: string,
  ) => {
    return apiClient.delete<{ message: string }>(
      `/me/notes/${noteId}/comments/${commentId}`,
    );
  },

  toggleResolved: async (
    _scopeId: string,
    noteId: string,
    commentId: string,
  ) => {
    return apiClient.post<NoteCommentDetail>(
      `/me/notes/${noteId}/comments/${commentId}/resolve`,
    );
  },

  toggleReaction: async (
    _scopeId: string,
    noteId: string,
    commentId: string,
    emoji: string,
  ) => {
    return apiClient.post<ReactionsToggleResponse>(
      `/me/notes/${noteId}/comments/${commentId}/reactions/toggle`,
      { emoji },
    );
  },
};

// ========================================
// Task Dependency API
// ========================================

import type {
  PersonalEvent,
  DiaryDetail,
  DiarySimple,
  DiaryAiReply,
  DiaryVoiceReply,
  DiaryVoiceSettings,
  AiCredits,
  AiCreditPurchaseRequest,
  AiCreditPurchaseResult,
  DiaryWorkContextData,
} from "../types";

// ========================================
// Personal Space API
// ========================================

export const personalSpaceAPI = {
  activate: async (): Promise<{ personal_space_enabled: boolean }> => {
    return apiClient.post("/personal-space/activate", {});
  },

  getStatus: async (): Promise<{ personal_space_enabled: boolean }> => {
    return apiClient.get("/personal-space/status");
  },
};

// ========================================
// Personal Event API
// ========================================

export const personalEventAPI = {
  getByDate: async (
    date: string,
    eventType?: string,
  ): Promise<PersonalEvent[]> => {
    const typeParam = eventType ? `&event_type=${eventType}` : "";
    return apiClient.get(`/personal/events?date=${date}${typeParam}`);
  },

  getWeekly: async (
    startDate: string,
    endDate: string,
    eventType?: string,
  ): Promise<PersonalEvent[]> => {
    const typeParam = eventType ? `&event_type=${eventType}` : "";
    return apiClient.get(
      `/personal/events/weekly?start_date=${startDate}&end_date=${endDate}${typeParam}`,
    );
  },

  create: async (data: {
    title: string;
    description?: string;
    event_date: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    color?: string;
    all_day?: boolean;
    recurrence_rule?: string;
    recurrence_end_date?: string;
    recurrence_days_of_week?: number[];
    event_type?: string;
  }): Promise<PersonalEvent> => {
    return apiClient.post("/personal/events", data);
  },

  update: async (
    eventId: string,
    data: {
      title?: string;
      description?: string;
      event_date?: string;
      end_date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      color?: string;
      all_day?: boolean;
      recurrence_rule?: string;
      recurrence_end_date?: string;
      recurrence_days_of_week?: number[];
      scope?: string;
    },
  ): Promise<PersonalEvent> => {
    return apiClient.put(`/personal/events/${eventId}`, data);
  },

  delete: async (eventId: string, scope?: string): Promise<void> => {
    const query = scope ? `?scope=${scope}` : "";
    return apiClient.delete(`/personal/events/${eventId}${query}`);
  },
};

// ========================================
// Diary API
// ========================================

export const diaryAPI = {
  getByDate: async (date: string): Promise<DiaryDetail | null> => {
    const data = await apiClient.get<DiaryDetail | null>(`/diary?date=${date}`);
    // Backend returns null (empty body) when no diary exists → apiClient returns {}
    return data && (data as DiaryDetail).id ? data : null;
  },

  getById: async (diaryId: string): Promise<DiaryDetail> => {
    return apiClient.get(`/diary/${diaryId}`);
  },

  getList: async (year: number, month: number): Promise<DiarySimple[]> => {
    return apiClient.get(`/diary/list?year=${year}&month=${month}`);
  },

  create: async (
    diaryDate: string,
    language?: string,
  ): Promise<DiaryDetail> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.post(`/diary${params}`, { diary_date: diaryDate });
  },

  sendMessage: async (
    diaryId: string,
    content: string,
    language?: string,
  ): Promise<DiaryAiReply> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.post(`/diary/${diaryId}/messages${params}`, { content });
  },

  complete: async (
    diaryId: string,
    data: {
      title?: string;
      content?: string;
      mood?: string;
    },
    language?: string,
  ): Promise<DiaryDetail> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.put(`/diary/${diaryId}/complete${params}`, data);
  },

  reopen: async (diaryId: string): Promise<DiaryDetail> => {
    return apiClient.put(`/diary/${diaryId}/reopen`, {});
  },

  reset: async (diaryId: string, language?: string): Promise<DiaryDetail> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    return apiClient.put(`/diary/${diaryId}/reset${params}`, {});
  },

  update: async (
    diaryId: string,
    data: {
      title?: string;
      content?: string;
      mood?: string;
    },
  ): Promise<DiaryDetail> => {
    return apiClient.put(`/diary/${diaryId}`, data);
  },

  delete: async (diaryId: string): Promise<void> => {
    return apiClient.delete(`/diary/${diaryId}`);
  },

  // Voice endpoints
  sendVoiceMessage: async (
    diaryId: string,
    audioBlob: Blob,
    language?: string,
  ): Promise<DiaryVoiceReply> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");

    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    const response = await authenticatedFetch(
      `${API_BASE_URL}/diary/${diaryId}/voice-message${params}`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        code: "UNKNOWN",
        message: response.statusText,
      }));
      throw errData;
    }

    return response.json();
  },

  getVoiceSettings: async (): Promise<DiaryVoiceSettings> => {
    return apiClient.get("/diary/voice-settings");
  },

  updateVoiceSettings: async (
    data: Partial<DiaryVoiceSettings>,
  ): Promise<DiaryVoiceSettings> => {
    return apiClient.put("/diary/voice-settings", data);
  },

  // Personal AI Credits
  getPersonalCredits: async (): Promise<AiCredits> => {
    return apiClient.get("/diary/credits");
  },

  purchasePersonalCredits: async (
    data: AiCreditPurchaseRequest,
  ): Promise<AiCreditPurchaseResult> => {
    return apiClient.post("/diary/credits/purchase", data);
  },

  getWorkContext: async (date?: string): Promise<DiaryWorkContextData> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/diary/work-context${params}`);
  },
};

// ========================================
// Task Dependency API
// ========================================

import type { TaskDependency } from "../types";

export const taskDependencyAPI = {
  // 보드의 모든 의존성 조회
  getByBoard: async (boardId: string): Promise<TaskDependency[]> => {
    return apiClient.get(`/boards/${boardId}/task-dependencies`);
  },

  // 의존성 생성
  create: async (
    boardId: string,
    data: { predecessor_id: string; successor_id: string },
  ): Promise<TaskDependency> => {
    return apiClient.post(`/boards/${boardId}/task-dependencies`, data);
  },

  // 의존성 삭제
  delete: async (boardId: string, dependencyId: string): Promise<void> => {
    return apiClient.delete(
      `/boards/${boardId}/task-dependencies/${dependencyId}`,
    );
  },
};

// ─── Personal Task API (v9.0) ───

export const personalTaskAPI = {
  getAll: async (): Promise<import("../types").PersonalTask[]> => {
    return apiClient.get("/personal/tasks");
  },

  getById: async (taskId: string): Promise<import("../types").PersonalTask> => {
    return apiClient.get(`/personal/tasks/${taskId}`);
  },

  create: async (data: {
    title: string;
    description?: string;
    priority?: import("../types").PersonalTaskPriority;
    due_date?: string;
    category?: string;
    color?: string;
  }): Promise<import("../types").PersonalTask> => {
    return apiClient.post("/personal/tasks", data);
  },

  update: async (
    taskId: string,
    data: {
      title?: string;
      description?: string;
      priority?: import("../types").PersonalTaskPriority;
      due_date?: string | null;
      category?: string | null;
      color?: string;
    },
  ): Promise<import("../types").PersonalTask> => {
    return apiClient.put(`/personal/tasks/${taskId}`, data);
  },

  updateStatus: async (
    taskId: string,
    status: import("../types").PersonalTaskStatus,
  ): Promise<import("../types").PersonalTask> => {
    return apiClient.patch(`/personal/tasks/${taskId}/status`, { status });
  },

  updatePosition: async (
    taskId: string,
    data: {
      status?: import("../types").PersonalTaskStatus;
      position: number;
    },
  ): Promise<void> => {
    return apiClient.put(`/personal/tasks/${taskId}/position`, data);
  },

  delete: async (taskId: string): Promise<void> => {
    return apiClient.delete(`/personal/tasks/${taskId}`);
  },

  getCategories: async (): Promise<string[]> => {
    return apiClient.get("/personal/tasks/categories");
  },
};

// ─── Personal Habit API (v9.0) ───

export const personalHabitAPI = {
  getAll: async (): Promise<import("../types").PersonalHabit[]> => {
    return apiClient.get("/personal/habits");
  },

  getById: async (
    habitId: string,
  ): Promise<import("../types").PersonalHabit> => {
    return apiClient.get(`/personal/habits/${habitId}`);
  },

  create: async (data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    frequency_type?: import("../types").HabitFrequency;
    frequency_days?: string;
    target_count?: number;
    unit?: string;
    importance?: import("../types").HabitImportance;
  }): Promise<import("../types").PersonalHabit> => {
    return apiClient.post("/personal/habits", data);
  },

  update: async (
    habitId: string,
    data: {
      title?: string;
      description?: string;
      icon?: string;
      color?: string;
      frequency_type?: import("../types").HabitFrequency;
      frequency_days?: string;
      target_count?: number;
      unit?: string;
      importance?: import("../types").HabitImportance;
    },
  ): Promise<import("../types").PersonalHabit> => {
    return apiClient.put(`/personal/habits/${habitId}`, data);
  },

  delete: async (habitId: string): Promise<void> => {
    return apiClient.delete(`/personal/habits/${habitId}`);
  },

  updatePosition: async (habitId: string, position: number): Promise<void> => {
    return apiClient.put(`/personal/habits/${habitId}/position`, { position });
  },

  checkIn: async (
    habitId: string,
    options?: { note?: string; log_date?: string },
  ): Promise<import("../types").HabitTodayItem> => {
    return apiClient.post(
      `/personal/habits/${habitId}/check-in`,
      options ?? {},
    );
  },

  getLogs: async (
    habitId: string,
    startDate: string,
    endDate: string,
  ): Promise<import("../types").PersonalHabitLog[]> => {
    return apiClient.get(
      `/personal/habits/${habitId}/logs?start_date=${startDate}&end_date=${endDate}`,
    );
  },

  getToday: async (
    date?: string,
  ): Promise<import("../types").HabitTodayItem[]> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/habits/today${params}`);
  },

  getWeekly: async (
    startDate: string,
    endDate: string,
  ): Promise<import("../types").HabitWeeklyMatrix> => {
    return apiClient.get(
      `/personal/habits/weekly?start_date=${startDate}&end_date=${endDate}`,
    );
  },
};

// ─── Custom Icon API ───

export const customIconAPI = {
  uploadReference: async (
    file: File,
  ): Promise<{ reference_id: string; url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await authenticatedFetch(
      `${API_BASE_URL}/customicon/upload-reference`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ message: "Upload failed" }));
      throw err;
    }
    return response.json();
  },
  analyzeStyle: async (
    referenceId: string,
  ): Promise<{
    style: string;
    stroke_weight: string;
    corner_radius: string;
    fill: string;
    detail: string;
    padding_ratio: number;
  }> => {
    return apiClient.post("/customicon/analyze-style", {
      reference_id: referenceId,
    });
  },
  generate: async (request: {
    reference_id: string;
    icon_names: string[];
    layout: string;
    style_options: {
      type: string;
      stroke_weight: string;
      corner_radius: string;
      padding_ratio: number;
      background: string;
      show_grid_lines: boolean;
    };
    custom_prompt?: string;
  }): Promise<{
    job_id: string;
    sprite_sheet_url: string;
    icons: Array<{ name: string; index: number; url: string; size: string }>;
  }> => {
    return apiClient.post("/customicon/generate", request);
  },
};

// ─── Organization API ───

export const organizationAPI = {
  // Organization CRUD
  list: async (): Promise<import("../types").OrganizationSimple[]> => {
    return apiClient.get("/organizations");
  },
  get: async (
    orgId: string,
  ): Promise<import("../types").OrganizationDetail> => {
    return apiClient.get(`/organizations/${orgId}`);
  },
  create: async (data: {
    name: string;
    description?: string;
  }): Promise<import("../types").OrganizationDetail> => {
    return apiClient.post("/organizations", data);
  },
  update: async (
    orgId: string,
    data: {
      name?: string;
      description?: string;
      hr_system_enabled?: boolean;
      auto_board_access_enabled?: boolean;
    },
  ): Promise<import("../types").OrganizationDetail> => {
    return apiClient.put(`/organizations/${orgId}`, data);
  },
  uploadLogo: async (
    orgId: string,
    file: File,
  ): Promise<import("../types").OrganizationDetail> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await authenticatedFetch(
      `${API_BASE_URL}/organizations/${orgId}/logo`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ message: "Upload failed" }));
      throw err;
    }
    return response.json();
  },
  delete: async (orgId: string): Promise<{ message: string }> => {
    return apiClient.delete(`/organizations/${orgId}`);
  },
  transferOwnership: async (
    orgId: string,
    data: { member_id: string },
  ): Promise<import("../types").OrganizationDetail> => {
    return apiClient.put(`/organizations/${orgId}/transfer-ownership`, data);
  },

  // Structure Data (combined)
  getStructureData: async (
    orgId: string,
  ): Promise<import("../types").OrgStructureData> => {
    return apiClient.get(`/organizations/${orgId}/structure-data`);
  },

  // Departments
  getDepartments: async (
    orgId: string,
  ): Promise<import("../types").OrgDepartment[]> => {
    return apiClient.get(`/organizations/${orgId}/departments`);
  },
  createDepartment: async (
    orgId: string,
    data: {
      name: string;
      display_order?: number;
      parent_department_id?: string;
      leader_id?: string;
      description?: string;
    },
  ): Promise<import("../types").OrgDepartment> => {
    return apiClient.post(`/organizations/${orgId}/departments`, data);
  },
  updateDepartment: async (
    orgId: string,
    deptId: string,
    data: {
      name?: string;
      display_order?: number;
      parent_department_id?: string | null;
      leader_id?: string | null;
      description?: string;
    },
  ): Promise<import("../types").OrgDepartment> => {
    return apiClient.put(`/organizations/${orgId}/departments/${deptId}`, data);
  },
  deleteDepartment: async (orgId: string, deptId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/departments/${deptId}`);
  },

  // Job Groups
  getJobGroups: async (
    orgId: string,
  ): Promise<import("../types").OrgJobGroup[]> => {
    return apiClient.get(`/organizations/${orgId}/job-groups`);
  },
  createJobGroup: async (
    orgId: string,
    data: { name: string; display_order?: number },
  ): Promise<import("../types").OrgJobGroup> => {
    return apiClient.post(`/organizations/${orgId}/job-groups`, data);
  },
  updateJobGroup: async (
    orgId: string,
    jobGroupId: string,
    data: { name?: string; display_order?: number },
  ): Promise<import("../types").OrgJobGroup> => {
    return apiClient.put(
      `/organizations/${orgId}/job-groups/${jobGroupId}`,
      data,
    );
  },
  deleteJobGroup: async (orgId: string, jobGroupId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/job-groups/${jobGroupId}`);
  },

  // Positions
  getPositions: async (
    orgId: string,
  ): Promise<import("../types").OrgPosition[]> => {
    return apiClient.get(`/organizations/${orgId}/positions`);
  },
  createPosition: async (
    orgId: string,
    data: { name: string; display_order?: number },
  ): Promise<import("../types").OrgPosition> => {
    return apiClient.post(`/organizations/${orgId}/positions`, data);
  },
  updatePosition: async (
    orgId: string,
    positionId: string,
    data: { name?: string; display_order?: number },
  ): Promise<import("../types").OrgPosition> => {
    return apiClient.put(
      `/organizations/${orgId}/positions/${positionId}`,
      data,
    );
  },
  deletePosition: async (orgId: string, positionId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/positions/${positionId}`);
  },

  // Titles
  getTitles: async (orgId: string): Promise<import("../types").OrgTitle[]> => {
    return apiClient.get(`/organizations/${orgId}/titles`);
  },
  createTitle: async (
    orgId: string,
    data: { name: string; display_order?: number },
  ): Promise<import("../types").OrgTitle> => {
    return apiClient.post(`/organizations/${orgId}/titles`, data);
  },
  updateTitle: async (
    orgId: string,
    titleId: string,
    data: { name?: string; display_order?: number },
  ): Promise<import("../types").OrgTitle> => {
    return apiClient.put(`/organizations/${orgId}/titles/${titleId}`, data);
  },
  deleteTitle: async (orgId: string, titleId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/titles/${titleId}`);
  },

  // Grades
  getGrades: async (orgId: string): Promise<import("../types").OrgGrade[]> => {
    return apiClient.get(`/organizations/${orgId}/grades`);
  },
  createGrade: async (
    orgId: string,
    data: { name: string; display_order?: number },
  ): Promise<import("../types").OrgGrade> => {
    return apiClient.post(`/organizations/${orgId}/grades`, data);
  },
  updateGrade: async (
    orgId: string,
    gradeId: string,
    data: { name?: string; display_order?: number },
  ): Promise<import("../types").OrgGrade> => {
    return apiClient.put(`/organizations/${orgId}/grades/${gradeId}`, data);
  },
  deleteGrade: async (orgId: string, gradeId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/grades/${gradeId}`);
  },

  // Members
  getMembers: async (
    orgId: string,
    params?: {
      department_id?: string;
      job_group_id?: string;
      contract_type?: string;
      work_status?: string;
      search?: string;
      page?: number;
      size?: number;
    },
  ): Promise<import("../types").OrgMemberPageResponse> => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/members${qs ? `?${qs}` : ""}`,
    );
  },
  getMember: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OrgMemberDetail> => {
    return apiClient.get(`/organizations/${orgId}/members/${memberId}`);
  },
  inviteMember: async (
    orgId: string,
    data: {
      email: string;
      role?: string;
      department_id?: string;
      job_title?: string;
    },
  ): Promise<import("../types").OrgMemberInviteResult> => {
    return apiClient.post(`/organizations/${orgId}/members`, data);
  },
  updateMember: async (
    orgId: string,
    memberId: string,
    data: Record<string, unknown>,
  ): Promise<import("../types").OrgMemberDetail> => {
    return apiClient.put(`/organizations/${orgId}/members/${memberId}`, data);
  },
  changeMemberRole: async (
    orgId: string,
    memberId: string,
    data: { role: string },
  ): Promise<void> => {
    return apiClient.put(
      `/organizations/${orgId}/members/${memberId}/role`,
      data,
    );
  },
  removeMember: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OrgMemberRemoveResult> => {
    return apiClient.delete(`/organizations/${orgId}/members/${memberId}`);
  },
  getMemberBoards: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OrgMemberBoard[]> => {
    return apiClient.get(`/organizations/${orgId}/members/${memberId}/boards`);
  },
  getMemberLeaveBalances: async (
    orgId: string,
    memberId: string,
    year?: number,
  ): Promise<import("../types").LeaveBalance[]> => {
    const params = year ? `?year=${year}` : "";
    return apiClient.get(
      `/organizations/${orgId}/members/${memberId}/leave-balances${params}`,
    );
  },
  uploadMemberProfileImage: async (
    orgId: string,
    memberId: string,
    file: File,
  ): Promise<import("../types").OrgMemberDetail> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await authenticatedFetch(
      `${API_BASE_URL}/organizations/${orgId}/members/${memberId}/profile-image`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const errData = await response
        .json()
        .catch(() => ({ code: "UNKNOWN", message: response.statusText }));
      throw errData;
    }
    return response.json();
  },
  deleteMemberProfileImage: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OrgMemberDetail> => {
    return apiClient.delete(
      `/organizations/${orgId}/members/${memberId}/profile-image`,
    );
  },
  updateMemberConcurrentDepts: async (
    orgId: string,
    memberId: string,
    data: {
      concurrent_depts: Array<{
        department_id: string;
        position_id?: string | null;
        display_order?: number;
      }>;
    },
  ): Promise<import("../types").OrgMemberConcurrentDeptInfo[]> => {
    return apiClient.put(
      `/organizations/${orgId}/members/${memberId}/concurrent-depts`,
      data,
    );
  },

  // Member History
  getMemberHistory: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OrgMemberHistoryItem[]> => {
    return apiClient.get(
      `/organizations/${orgId}/members/${memberId}/histories`,
    );
  },
  createMemberHistory: async (
    orgId: string,
    memberId: string,
    data: import("../types").OrgMemberHistoryCreateRequest,
  ): Promise<import("../types").OrgMemberHistoryItem> => {
    return apiClient.post(
      `/organizations/${orgId}/members/${memberId}/histories`,
      data,
    );
  },
  updateMemberHistoryDescription: async (
    orgId: string,
    memberId: string,
    historyId: string,
    description: string,
  ): Promise<import("../types").OrgMemberHistoryItem> => {
    return apiClient.patch(
      `/organizations/${orgId}/members/${memberId}/histories/${historyId}/description`,
      { description },
    );
  },
  deleteMemberHistory: async (
    orgId: string,
    memberId: string,
    historyId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/members/${memberId}/histories/${historyId}`,
    );
  },

  // Boards
  getBoards: async (
    orgId: string,
  ): Promise<import("../types").OrgBoardSimple[]> => {
    return apiClient.get(`/organizations/${orgId}/boards`);
  },
  checkBoardEligibility: async (
    orgId: string,
    boardId: string,
  ): Promise<import("../types").OrgBoardEligibilityCheck> => {
    return apiClient.get(
      `/organizations/${orgId}/boards/check-eligibility?board_id=${boardId}`,
    );
  },
  addBoard: async (
    orgId: string,
    data: { board_id: string },
  ): Promise<import("../types").OrgBoardSimple> => {
    return apiClient.post(`/organizations/${orgId}/boards`, data);
  },
  createBoard: async (
    orgId: string,
    data: { name: string; description?: string },
  ): Promise<import("../types").OrgBoardSimple> => {
    return apiClient.post(`/organizations/${orgId}/boards/create`, data);
  },
  removeBoard: async (orgId: string, boardId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/boards/${boardId}`);
  },
  deleteBoard: async (orgId: string, boardId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/boards/${boardId}/delete`);
  },

  // Invite Links
  getInviteLinks: async (
    orgId: string,
  ): Promise<import("../types").OrgInviteLink[]> => {
    return apiClient.get(`/organizations/${orgId}/invites`);
  },
  createInviteLink: async (
    orgId: string,
    data: { role?: string; max_uses?: number | null; expires_in_days?: number },
  ): Promise<import("../types").OrgInviteLink> => {
    return apiClient.post(`/organizations/${orgId}/invites`, data);
  },
  deleteInviteLink: async (orgId: string, linkId: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/invites/${linkId}`);
  },
  getInviteInfo: async (
    code: string,
  ): Promise<import("../types").OrgInvitePublicInfo> => {
    return apiClient.get(`/org-invites/${code}`);
  },
  acceptInvite: async (
    code: string,
  ): Promise<{
    organization_id: string;
    organization_name: string;
    role: string;
    message: string;
  }> => {
    return apiClient.post(`/org-invites/${code}/accept`, {});
  },

  // Onboarding
  getOnboardingTemplates: async (
    orgId: string,
  ): Promise<import("../types").OnboardingTemplateSummary[]> => {
    return apiClient.get(`/organizations/${orgId}/onboarding/templates`);
  },
  getOnboardingTemplate: async (
    orgId: string,
    templateId: string,
  ): Promise<import("../types").OnboardingTemplateDetail> => {
    return apiClient.get(
      `/organizations/${orgId}/onboarding/templates/${templateId}`,
    );
  },
  createOnboardingTemplate: async (
    orgId: string,
    data: Record<string, unknown>,
  ): Promise<import("../types").OnboardingTemplateDetail> => {
    return apiClient.post(`/organizations/${orgId}/onboarding/templates`, data);
  },
  updateOnboardingTemplate: async (
    orgId: string,
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<import("../types").OnboardingTemplateDetail> => {
    return apiClient.put(
      `/organizations/${orgId}/onboarding/templates/${templateId}`,
      data,
    );
  },
  deleteOnboardingTemplate: async (
    orgId: string,
    templateId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/onboarding/templates/${templateId}`,
    );
  },
  getOnboardingInstances: async (
    orgId: string,
    params?: { status?: string; member_id?: string },
  ): Promise<import("../types").OnboardingInstanceSummary[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.member_id) query.set("member_id", params.member_id);
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/onboarding/instances${qs ? `?${qs}` : ""}`,
    );
  },
  getOnboardingInstanceItems: async (
    orgId: string,
    instanceId: string,
  ): Promise<import("../types").OnboardingInstanceItemDetail[]> => {
    return apiClient.get(
      `/organizations/${orgId}/onboarding/instances/${instanceId}/items`,
    );
  },
  toggleOnboardingItem: async (
    orgId: string,
    instanceId: string,
    itemId: string,
  ): Promise<import("../types").OnboardingToggleResult> => {
    return apiClient.put(
      `/organizations/${orgId}/onboarding/instances/${instanceId}/items/${itemId}/toggle`,
      {},
    );
  },
  createOnboardingInstance: async (
    orgId: string,
    data: { member_id: string; template_id: string },
  ): Promise<import("../types").OnboardingInstanceSummary> => {
    return apiClient.post(`/organizations/${orgId}/onboarding/instances`, data);
  },

  // Chart
  getChart: async (orgId: string): Promise<import("../types").OrgChartData> => {
    return apiClient.get(`/organizations/${orgId}/chart`);
  },
  updateManager: async (
    orgId: string,
    memberId: string,
    data: { manager_id: string | null },
  ): Promise<void> => {
    return apiClient.put(
      `/organizations/${orgId}/members/${memberId}/manager`,
      data,
    );
  },

  // Insights
  getInsightsSummary: async (
    orgId: string,
    params: { start_date: string; end_date: string },
  ): Promise<import("../types").OrgInsightsSummary> => {
    const query = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
    });
    return apiClient.get(`/organizations/${orgId}/insights/summary?${query}`);
  },

  getInsightMembers: async (
    orgId: string,
    params: {
      start_date: string;
      end_date: string;
      department_id?: string;
      job_group_id?: string;
      sort_by?: string;
      sort_dir?: string;
    },
  ): Promise<import("../types").OrgMemberContribution[]> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
    });
    return apiClient.get(`/organizations/${orgId}/insights/members?${query}`);
  },

  getInsightMemberDetail: async (
    orgId: string,
    memberId: string,
    params: { start_date: string; end_date: string },
  ): Promise<import("../types").OrgMemberContributionDetail> => {
    const query = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
    });
    return apiClient.get(
      `/organizations/${orgId}/insights/members/${memberId}?${query}`,
    );
  },

  getInsightBoards: async (
    orgId: string,
    params: {
      start_date: string;
      end_date: string;
      sort_by?: string;
    },
  ): Promise<import("../types").OrgBoardResourceResponse> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
    });
    return apiClient.get(`/organizations/${orgId}/insights/boards?${query}`);
  },

  // 1:1 Meeting Notes
  getOneOnOnes: async (
    orgId: string,
  ): Promise<import("../types").OneOnOneSummary[]> => {
    return apiClient.get(`/organizations/${orgId}/one-on-ones`);
  },
  createOneOnOne: async (
    orgId: string,
    data: {
      member_b_id: string;
      recurrence_type?: string;
      recurrence_day?: number;
    },
  ): Promise<import("../types").OneOnOneSummary> => {
    return apiClient.post(`/organizations/${orgId}/one-on-ones`, data);
  },
  updateOneOnOne: async (
    orgId: string,
    oneOnOneId: string,
    data: {
      recurrence_type?: string;
      recurrence_day?: number;
      next_meeting_date?: string;
    },
  ): Promise<import("../types").OneOnOneSummary> => {
    return apiClient.put(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}`,
      data,
    );
  },
  deleteOneOnOne: async (orgId: string, oneOnOneId: string): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}`,
    );
  },
  getOneOnOneByMember: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").OneOnOneSummary | null> => {
    try {
      const data = await apiClient.get<import("../types").OneOnOneSummary>(
        `/organizations/${orgId}/one-on-ones/by-member/${memberId}`,
      );
      // 204 No Content returns {} — treat as null
      if (!data || !data.id) return null;
      return data;
    } catch {
      return null;
    }
  },
  getOneOnOneMeetings: async (
    orgId: string,
    oneOnOneId: string,
    params?: {
      cursor?: string;
      size?: number;
    },
  ): Promise<import("../types").OneOnOneMeetingListResponse> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.size) query.set("size", String(params.size));
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/meetings${qs ? `?${qs}` : ""}`,
    );
  },
  createOneOnOneMeeting: async (
    orgId: string,
    oneOnOneId: string,
    data: {
      meeting_date: string;
      agenda?: string;
      notes?: string;
      action_items?: { title: string; assignee_id?: string }[];
    },
  ): Promise<import("../types").OneOnOneMeetingDetail> => {
    return apiClient.post(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/meetings`,
      data,
    );
  },
  updateOneOnOneMeeting: async (
    orgId: string,
    oneOnOneId: string,
    meetingId: string,
    data: {
      meeting_date?: string;
      agenda?: string;
      notes?: string;
      action_items?: { title: string; assignee_id?: string }[];
    },
  ): Promise<import("../types").OneOnOneMeetingDetail> => {
    return apiClient.put(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/meetings/${meetingId}`,
      data,
    );
  },
  deleteOneOnOneMeeting: async (
    orgId: string,
    oneOnOneId: string,
    meetingId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/meetings/${meetingId}`,
    );
  },
  toggleOneOnOneActionItem: async (
    orgId: string,
    oneOnOneId: string,
    actionId: string,
  ): Promise<import("../types").OneOnOneActionItemDetail> => {
    return apiClient.put(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/action-items/${actionId}/toggle`,
      {},
    );
  },
  getOneOnOneOpenActions: async (
    orgId: string,
    oneOnOneId: string,
  ): Promise<import("../types").OneOnOneOpenActionItem[]> => {
    return apiClient.get(
      `/organizations/${orgId}/one-on-ones/${oneOnOneId}/action-items/open`,
    );
  },

  // Attendance & Time Tracking
  clockIn: async (
    orgId: string,
  ): Promise<import("../types").AttendanceRecordDetail> => {
    return apiClient.post(`/organizations/${orgId}/attendance/clock-in`, {});
  },
  clockOut: async (
    orgId: string,
  ): Promise<import("../types").AttendanceRecordDetail> => {
    return apiClient.post(`/organizations/${orgId}/attendance/clock-out`, {});
  },
  cancelClockOut: async (
    orgId: string,
  ): Promise<import("../types").AttendanceRecordDetail> => {
    return apiClient.post(
      `/organizations/${orgId}/attendance/cancel-clock-out`,
      {},
    );
  },
  getMyAttendanceRecords: async (
    orgId: string,
    params?: { year?: number; month?: number },
  ): Promise<import("../types").AttendanceMyRecordsResponse> => {
    const query = new URLSearchParams();
    if (params?.year) query.set("year", String(params.year));
    if (params?.month) query.set("month", String(params.month));
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/attendance/my-records${qs ? `?${qs}` : ""}`,
    );
  },
  getAttendanceToday: async (
    orgId: string,
  ): Promise<import("../types").AttendanceTodayStatus> => {
    return apiClient.get(`/organizations/${orgId}/attendance/today`);
  },
  getAttendanceTodayMembers: async (
    orgId: string,
  ): Promise<import("../types").AttendanceTodayMembers> => {
    return apiClient.get(`/organizations/${orgId}/attendance/today/members`);
  },
  getAttendanceTeamSummary: async (
    orgId: string,
    params?: { year?: number; month?: number; department_id?: string },
  ): Promise<import("../types").AttendanceTeamSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.year) query.set("year", String(params.year));
    if (params?.month) query.set("month", String(params.month));
    if (params?.department_id) query.set("department_id", params.department_id);
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/attendance/team-summary${qs ? `?${qs}` : ""}`,
    );
  },
  adminModifyAttendance: async (
    orgId: string,
    recordId: string,
    data: { clock_in?: string; clock_out?: string; note?: string },
  ): Promise<import("../types").AttendanceRecordDetail> => {
    return apiClient.put(
      `/organizations/${orgId}/attendance/records/${recordId}`,
      data,
    );
  },
  getAttendancePolicy: async (
    orgId: string,
  ): Promise<import("../types").AttendancePolicyResponse> => {
    return apiClient.get(`/organizations/${orgId}/attendance/policy`);
  },
  updateAttendancePolicy: async (
    orgId: string,
    data: {
      standard_hours?: number;
      core_time_start?: string;
      core_time_end?: string;
      late_threshold?: string;
      auto_clock_out?: boolean;
      auto_clock_out_time?: string;
      weekend_days?: string;
    },
  ): Promise<import("../types").AttendancePolicyResponse> => {
    return apiClient.put(`/organizations/${orgId}/attendance/policy`, data);
  },
  getAttendanceHolidays: async (
    orgId: string,
  ): Promise<import("../types").AttendanceHolidayResponse[]> => {
    return apiClient.get(`/organizations/${orgId}/attendance/holidays`);
  },
  createAttendanceHoliday: async (
    orgId: string,
    data: { holiday_date: string; name: string; is_recurring?: boolean },
  ): Promise<import("../types").AttendanceHolidayResponse> => {
    return apiClient.post(`/organizations/${orgId}/attendance/holidays`, data);
  },
  deleteAttendanceHoliday: async (
    orgId: string,
    holidayId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/attendance/holidays/${holidayId}`,
    );
  },
  exportAttendanceCsv: async (
    orgId: string,
    params?: { year?: number; month?: number; department_id?: string },
  ): Promise<Blob> => {
    const query = new URLSearchParams();
    if (params?.year) query.set("year", String(params.year));
    if (params?.month) query.set("month", String(params.month));
    if (params?.department_id) query.set("department_id", params.department_id);
    const qs = query.toString();
    const url = `${API_BASE_URL}/organizations/${orgId}/attendance/export${qs ? `?${qs}` : ""}`;
    const token = getAccessToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },

  // Structure Settings
  getStructureSettings: async (
    orgId: string,
  ): Promise<import("../types").OrgStructureSettings> => {
    return apiClient.get(`/organizations/${orgId}/structure-settings`);
  },
  updateStructureSettings: async (
    orgId: string,
    data: Partial<import("../types").OrgStructureSettings>,
  ): Promise<import("../types").OrgStructureSettings> => {
    return apiClient.put(`/organizations/${orgId}/structure-settings`, data);
  },
};

// ─── Organization Announcement API ───

export const orgAnnouncementAPI = {
  list: async (
    orgId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<import("../types").OrgAnnouncementListResponse> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/announcements${qs ? `?${qs}` : ""}`,
    );
  },
  create: async (
    orgId: string,
    data: {
      title: string;
      content?: string;
      is_pinned?: boolean;
      file_keys?: string[];
    },
  ): Promise<import("../types").OrgAnnouncement> => {
    return apiClient.post(`/organizations/${orgId}/announcements`, data);
  },
  update: async (
    orgId: string,
    id: string,
    data: {
      title: string;
      content?: string;
      keep_attachment_ids?: string[];
      new_file_keys?: string[];
    },
  ): Promise<import("../types").OrgAnnouncement> => {
    return apiClient.put(`/organizations/${orgId}/announcements/${id}`, data);
  },
  delete: async (orgId: string, id: string): Promise<void> => {
    return apiClient.delete(`/organizations/${orgId}/announcements/${id}`);
  },
  togglePin: async (
    orgId: string,
    id: string,
  ): Promise<import("../types").OrgAnnouncement> => {
    return apiClient.put(`/organizations/${orgId}/announcements/${id}/pin`, {});
  },
  // Comments
  getComments: async (
    orgId: string,
    announcementId: string,
  ): Promise<import("../types").OrgAnnouncementCommentListResponse> => {
    return apiClient.get(
      `/organizations/${orgId}/announcements/${announcementId}/comments`,
    );
  },
  addComment: async (
    orgId: string,
    announcementId: string,
    data: { content: string },
  ): Promise<import("../types").OrgAnnouncementComment> => {
    return apiClient.post(
      `/organizations/${orgId}/announcements/${announcementId}/comments`,
      data,
    );
  },
  updateComment: async (
    orgId: string,
    announcementId: string,
    commentId: string,
    data: { content: string },
  ): Promise<import("../types").OrgAnnouncementComment> => {
    return apiClient.put(
      `/organizations/${orgId}/announcements/${announcementId}/comments/${commentId}`,
      data,
    );
  },
  deleteComment: async (
    orgId: string,
    announcementId: string,
    commentId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/announcements/${announcementId}/comments/${commentId}`,
    );
  },
};

// ─── Organization Activity API ───

export const orgActivityAPI = {
  list: async (
    orgId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<import("../types").OrgActivityListResponse> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/activities${qs ? `?${qs}` : ""}`,
    );
  },
};

// ─── Leave Management API ───

export const leaveAPI = {
  // Policies
  getPolicies: async (
    orgId: string,
  ): Promise<import("../types").LeavePolicy[]> => {
    return apiClient.get(`/organizations/${orgId}/leave-policies`);
  },
  createPolicy: async (
    orgId: string,
    data: {
      name: string;
      leave_category: string;
      default_days?: number;
      is_paid?: boolean;
      requires_approval?: boolean;
      description?: string;
    },
  ): Promise<import("../types").LeavePolicy> => {
    return apiClient.post(`/organizations/${orgId}/leave-policies`, data);
  },
  updatePolicy: async (
    orgId: string,
    policyId: string,
    data: Record<string, unknown>,
  ): Promise<import("../types").LeavePolicy> => {
    return apiClient.put(
      `/organizations/${orgId}/leave-policies/${policyId}`,
      data,
    );
  },

  // Balances
  getMyBalance: async (
    orgId: string,
  ): Promise<import("../types").LeaveBalance[]> => {
    return apiClient.get(`/organizations/${orgId}/my-leave-balance`);
  },
  getMemberBalance: async (
    orgId: string,
    memberId: string,
  ): Promise<import("../types").LeaveBalance[]> => {
    return apiClient.get(
      `/organizations/${orgId}/members/${memberId}/leave-balance`,
    );
  },
  updateMemberBalance: async (
    orgId: string,
    memberId: string,
    balanceId: string,
    data: { total_days: number },
  ): Promise<import("../types").LeaveBalance> => {
    return apiClient.put(
      `/organizations/${orgId}/members/${memberId}/leave-balance/${balanceId}`,
      data,
    );
  },

  // On Leave Today
  getOnLeaveToday: async (
    orgId: string,
    date?: string,
  ): Promise<import("../types").LeaveRequestResponse[]> => {
    const query = date ? `?date=${date}` : "";
    return apiClient.get(`/organizations/${orgId}/on-leave-today${query}`);
  },

  // Leave Requests
  getRequests: async (
    orgId: string,
    params?: {
      status?: string;
      requester_id?: string;
      start_date?: string;
      end_date?: string;
      page?: number;
      size?: number;
    },
  ): Promise<import("../types").LeaveRequestPageResponse> => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/leave-requests${qs ? `?${qs}` : ""}`,
    );
  },
  createRequest: async (
    orgId: string,
    data: {
      policy_id: string;
      start_date: string;
      end_date: string;
      duration_type?: string;
      reason?: string;
    },
  ): Promise<import("../types").LeaveRequestResponse> => {
    return apiClient.post(`/organizations/${orgId}/leave-requests`, data);
  },
  approveRequest: async (
    orgId: string,
    requestId: string,
  ): Promise<import("../types").LeaveRequestResponse> => {
    return apiClient.put(
      `/organizations/${orgId}/leave-requests/${requestId}/approve`,
      {},
    );
  },
  rejectRequest: async (
    orgId: string,
    requestId: string,
    data?: { comment?: string },
  ): Promise<import("../types").LeaveRequestResponse> => {
    return apiClient.put(
      `/organizations/${orgId}/leave-requests/${requestId}/reject`,
      data || {},
    );
  },
  cancelRequest: async (
    orgId: string,
    requestId: string,
  ): Promise<import("../types").LeaveRequestResponse> => {
    return apiClient.put(
      `/organizations/${orgId}/leave-requests/${requestId}/cancel`,
      {},
    );
  },
  reopenRequest: async (
    orgId: string,
    requestId: string,
  ): Promise<import("../types").LeaveRequestResponse> => {
    return apiClient.put(
      `/organizations/${orgId}/leave-requests/${requestId}/reopen`,
      {},
    );
  },

  // Balance Adjustments
  adjustBalance: async (
    orgId: string,
    memberId: string,
    balanceId: string,
    data: {
      adjustment_type: string;
      days: number;
      reason: string;
    },
  ): Promise<import("../types").LeaveBalance> => {
    return apiClient.post(
      `/organizations/${orgId}/members/${memberId}/leave-balance/${balanceId}/adjust`,
      data,
    );
  },
  getMemberAdjustments: async (
    orgId: string,
    memberId: string,
    params?: { page?: number; size?: number },
  ): Promise<import("../types").LeaveAdjustmentPageResponse> => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/members/${memberId}/leave-adjustments${qs ? `?${qs}` : ""}`,
    );
  },
  getAdjustments: async (
    orgId: string,
    params?: { page?: number; size?: number },
  ): Promise<import("../types").LeaveAdjustmentPageResponse> => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiClient.get(
      `/organizations/${orgId}/leave-adjustments${qs ? `?${qs}` : ""}`,
    );
  },
};

// ─── Anniversary & Celebrations API ───

export const anniversaryAPI = {
  getUpcoming: async (
    orgId: string,
    range?: string,
  ): Promise<import("../types").UpcomingAnniversaries> => {
    const params = range ? `?range=${range}` : "";
    return apiClient.get(
      `/organizations/${orgId}/anniversaries/upcoming${params}`,
    );
  },
  getMessages: async (
    orgId: string,
    memberId: string,
    params: { type: string; date: string; cursor?: string; size?: number },
  ): Promise<{
    messages: import("../types").CelebrationMessage[];
    next_cursor: string | null;
    has_more: boolean;
  }> => {
    const query = new URLSearchParams();
    query.set("type", params.type);
    query.set("date", params.date);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.size) query.set("size", String(params.size));
    return apiClient.get(
      `/organizations/${orgId}/anniversaries/${memberId}/messages?${query.toString()}`,
    );
  },
  createMessage: async (
    orgId: string,
    memberId: string,
    data: { type: string; date: string; message: string },
  ): Promise<{ id: string; message: string; created_at: string }> => {
    return apiClient.post(
      `/organizations/${orgId}/anniversaries/${memberId}/messages`,
      data,
    );
  },
  updateMessage: async (
    orgId: string,
    memberId: string,
    messageId: string,
    data: { message: string },
  ): Promise<import("../types").CelebrationMessage> => {
    return apiClient.put(
      `/organizations/${orgId}/anniversaries/${memberId}/messages/${messageId}`,
      data,
    );
  },
  deleteMessage: async (
    orgId: string,
    memberId: string,
    messageId: string,
  ): Promise<void> => {
    return apiClient.delete(
      `/organizations/${orgId}/anniversaries/${memberId}/messages/${messageId}`,
    );
  },
  getSettings: async (
    orgId: string,
  ): Promise<import("../types").AnniversarySettings> => {
    return apiClient.get(`/organizations/${orgId}/anniversary-settings`);
  },
  updateSettings: async (
    orgId: string,
    data: Partial<import("../types").AnniversarySettings>,
  ): Promise<import("../types").AnniversarySettings> => {
    return apiClient.put(`/organizations/${orgId}/anniversary-settings`, data);
  },
};

// ─── Personal Dashboard API (v9.0) ───

export const personalDashboardAPI = {
  getToday: async (
    date?: string,
  ): Promise<import("../types").PersonalDashboardToday> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/dashboard/today${params}`);
  },
  getOverview: async (
    date?: string,
  ): Promise<import("../types").PersonalOverviewData> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/dashboard/overview${params}`);
  },
  getBoardTasks: async (
    date?: string,
  ): Promise<import("../types").BoardTasksData> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/dashboard/board-tasks${params}`);
  },
  getCelebrations: async (
    date?: string,
  ): Promise<import("../types").CelebrationsData> => {
    const params = date ? `?date=${date}` : "";
    return apiClient.get(`/personal/dashboard/celebrations${params}`);
  },
};

// ─── Personal Calendar API (v10.0) ───

export const personalCalendarAPI = {
  getUnifiedCalendar: async (
    startDate: string,
    endDate: string,
  ): Promise<import("../types").UnifiedCalendarData> => {
    return apiClient.get(
      `/personal/calendar/unified?start_date=${startDate}&end_date=${endDate}`,
    );
  },
};

// ========================================
// Org Subscription API
// ========================================

export const orgSubscriptionAPI = {
  get: async (orgId: string): Promise<import("../types").OrgSubscription> => {
    return apiClient.get(`/organizations/${orgId}/subscription`);
  },

  activate: async (
    orgId: string,
    data: { billing_cycle: string; seat_count: number },
  ): Promise<import("../types").OrgSubscription> => {
    return apiClient.post(
      `/organizations/${orgId}/subscription/activate`,
      data,
    );
  },

  migratePreview: async (
    orgId: string,
    data: { billing_cycle: string; board_ids: string[] },
  ): Promise<import("../types").MigrationPreview> => {
    return apiClient.post(
      `/organizations/${orgId}/subscription/migrate/preview`,
      data,
    );
  },

  migrate: async (
    orgId: string,
    data: { billing_cycle: string; board_ids: string[] },
  ): Promise<import("../types").OrgSubscription> => {
    return apiClient.post(`/organizations/${orgId}/subscription/migrate`, data);
  },

  downgrade: async (
    orgId: string,
  ): Promise<import("../types").OrgSubscription> => {
    return apiClient.post(`/organizations/${orgId}/subscription/downgrade`);
  },

  cancel: async (orgId: string): Promise<{ message: string }> => {
    return apiClient.delete(`/organizations/${orgId}/subscription`);
  },

  undoCancel: async (orgId: string): Promise<{ message: string }> => {
    return apiClient.post(`/organizations/${orgId}/subscription/undo-cancel`);
  },

  getPayments: async (orgId: string) => {
    return apiClient.get(`/organizations/${orgId}/subscription/payments`);
  },

  purchaseSeats: async (
    orgId: string,
    additionalSeats: number,
  ): Promise<import("../types").OrgSubscription> => {
    return apiClient.post(`/organizations/${orgId}/subscription/seats`, {
      additional_seats: additionalSeats,
    });
  },
};

// ─── Org Photo Gallery API ───

export const orgPhotoAPI = {
  // Tab CRUD
  getTabs: (orgId: string): Promise<import("../types").OrgPhotoTab[]> =>
    apiClient.get(`/organizations/${orgId}/photos/tabs`),

  createTab: (
    orgId: string,
    data: { name: string; description?: string },
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.post(`/organizations/${orgId}/photos/tabs`, data),

  updateTab: (
    orgId: string,
    tabId: string,
    data: { name: string; description?: string; cover_photo_id?: string },
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.put(`/organizations/${orgId}/photos/tabs/${tabId}`, data),

  deleteTab: (orgId: string, tabId: string): Promise<void> =>
    apiClient.delete(`/organizations/${orgId}/photos/tabs/${tabId}`),

  reorderTabs: (orgId: string, tabIds: string[]): Promise<void> =>
    apiClient.put(`/organizations/${orgId}/photos/tabs/reorder`, {
      tab_ids: tabIds,
    }),

  // Sharing
  enableShare: (
    orgId: string,
    tabId: string,
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.post(`/organizations/${orgId}/photos/tabs/${tabId}/share`),

  disableShare: (
    orgId: string,
    tabId: string,
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.delete(`/organizations/${orgId}/photos/tabs/${tabId}/share`),

  // Gallery-level sharing
  enableGalleryShare: (
    orgId: string,
    title?: string,
  ): Promise<{ share_token: string }> =>
    apiClient.post(`/organizations/${orgId}/photos/gallery-share`, { title }),

  disableGalleryShare: (orgId: string): Promise<void> =>
    apiClient.delete(`/organizations/${orgId}/photos/gallery-share`),

  updateGalleryShareTitle: (orgId: string, title: string): Promise<void> =>
    apiClient.patch(`/organizations/${orgId}/photos/gallery-share`, { title }),

  getGalleryShareStatus: (
    orgId: string,
  ): Promise<{ enabled: boolean; share_token: string; title: string }> =>
    apiClient.get(`/organizations/${orgId}/photos/gallery-share`),

  // Gallery-level upload
  enableGalleryUpload: (orgId: string): Promise<{ upload_token: string }> =>
    apiClient.post(`/organizations/${orgId}/photos/gallery-upload`),

  disableGalleryUpload: (orgId: string): Promise<void> =>
    apiClient.delete(`/organizations/${orgId}/photos/gallery-upload`),

  getGalleryUploadStatus: (
    orgId: string,
  ): Promise<{ enabled: boolean; upload_token: string; expires_at: string }> =>
    apiClient.get(`/organizations/${orgId}/photos/gallery-upload`),

  // Upload link
  enableUploadLink: (
    orgId: string,
    tabId: string,
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.post(`/organizations/${orgId}/photos/tabs/${tabId}/upload-link`),

  disableUploadLink: (
    orgId: string,
    tabId: string,
  ): Promise<import("../types").OrgPhotoTab> =>
    apiClient.delete(
      `/organizations/${orgId}/photos/tabs/${tabId}/upload-link`,
    ),

  // Multi share-link management
  listShareLinks: (
    orgId: string,
    tabId?: string,
  ): Promise<{ links: import("../types").PhotoShareLink[] }> => {
    const query = tabId ? `?tab_id=${encodeURIComponent(tabId)}` : "";
    return apiClient.get(`/organizations/${orgId}/photos/share-links${query}`);
  },

  issueShareLink: (
    orgId: string,
    payload: import("../types").PhotoShareLinkCreatePayload,
  ): Promise<import("../types").PhotoShareLink> =>
    apiClient.post(`/organizations/${orgId}/photos/share-links`, payload),

  revokeShareLink: (orgId: string, linkId: string): Promise<void> =>
    apiClient.delete(`/organizations/${orgId}/photos/share-links/${linkId}`),

  // Photo CRUD
  getPhotos: (
    orgId: string,
    params: { tab_id?: string; cursor?: string; size?: number },
  ): Promise<import("../types").OrgPhotoPage> => {
    const query = new URLSearchParams();
    if (params.tab_id) query.set("tab_id", params.tab_id);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.size) query.set("size", String(params.size));
    return apiClient.get(`/organizations/${orgId}/photos?${query.toString()}`);
  },

  uploadPhotos: async (
    orgId: string,
    tabId: string,
    files: File[],
  ): Promise<import("../types").OrgPhoto[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    // NOTE: Do NOT set Content-Type — browser sets multipart boundary automatically
    const response = await authenticatedFetch(
      `${API_BASE_URL}/organizations/${orgId}/photos/upload?tabId=${tabId}`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ message: "Upload failed" }));
      throw err;
    }
    return response.json();
  },

  updatePhoto: (
    orgId: string,
    photoId: string,
    data: { caption: string },
  ): Promise<import("../types").OrgPhoto> =>
    apiClient.put(`/organizations/${orgId}/photos/${photoId}`, data),

  deletePhotos: (orgId: string, photoIds: string[]): Promise<void> =>
    apiClient.delete(`/organizations/${orgId}/photos/batch`, {
      photo_ids: photoIds,
    }),

  // Download
  downloadPhoto: (orgId: string, photoId: string) =>
    apiClient.get(`/organizations/${orgId}/photos/${photoId}/download`),

  downloadPhotos: (orgId: string, photoIds: string[]) =>
    apiClient.post(`/organizations/${orgId}/photos/batch-download`, {
      photo_ids: photoIds,
    }),
};

// ─── Public Gallery API (no auth) ───

export const publicGalleryAPI = {
  getSharedGallery: (
    shareToken: string,
  ): Promise<import("../types").SharedGalleryInfo> =>
    apiClient.get(`/public/gallery/${shareToken}`, true),

  getSharedGalleryPhotos: (
    shareToken: string,
    albumId: string,
    params?: { cursor?: string; size?: number },
  ): Promise<import("../types").SharedPhotoPage> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.size) query.set("size", String(params.size));
    const qs = query.toString();
    return apiClient.get(
      `/public/gallery/${shareToken}/albums/${albumId}/photos${qs ? `?${qs}` : ""}`,
      true,
    );
  },
};

// ─── Chunked Upload Helper ───

const CHUNK_MAX_SIZE = 100 * 1024 * 1024; // 100MB per batch
const CHUNK_MAX_FILES = 20; // max files per batch

export interface ChunkedUploadProgress {
  uploadedFiles: number;
  totalFiles: number;
  currentBatch: number;
  totalBatches: number;
}

function splitFilesIntoChunks(files: File[]): File[][] {
  const chunks: File[][] = [];
  let currentChunk: File[] = [];
  let currentSize = 0;

  for (const file of files) {
    // If adding this file exceeds limits, start a new chunk
    if (
      currentChunk.length > 0 &&
      (currentSize + file.size > CHUNK_MAX_SIZE ||
        currentChunk.length >= CHUNK_MAX_FILES)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(file);
    currentSize += file.size;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function uploadFormData(
  url: string,
  files: File[],
): Promise<import("../types").OrgPhoto[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ message: "Upload failed" }));
    throw err;
  }
  return response.json();
}

export const publicUploadAPI = {
  getUploadAlbumInfo: (
    uploadToken: string,
  ): Promise<import("../types").UploadAlbumInfo> =>
    apiClient.get(`/public/upload/${uploadToken}`, true),

  uploadPhotos: async (
    uploadToken: string,
    files: File[],
    onProgress?: (progress: ChunkedUploadProgress) => void,
  ): Promise<import("../types").OrgPhoto[]> => {
    const chunks = splitFilesIntoChunks(files);
    const allResults: import("../types").OrgPhoto[] = [];
    let uploadedFiles = 0;

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.({
        uploadedFiles,
        totalFiles: files.length,
        currentBatch: i + 1,
        totalBatches: chunks.length,
      });

      const results = await uploadFormData(
        `${API_BASE_URL}/public/upload/${uploadToken}`,
        chunks[i],
      );
      allResults.push(...results);
      uploadedFiles += chunks[i].length;
    }

    onProgress?.({
      uploadedFiles: files.length,
      totalFiles: files.length,
      currentBatch: chunks.length,
      totalBatches: chunks.length,
    });

    return allResults;
  },
};

// ─── Public Gallery Upload API (no auth) ───

export const publicGalleryUploadAPI = {
  getGalleryUploadInfo: (
    uploadToken: string,
  ): Promise<import("../types").GalleryUploadInfo> =>
    apiClient.get(`/public/gallery-upload/${uploadToken}`, true),

  createAlbum: (
    uploadToken: string,
    data: { name: string; description?: string },
  ): Promise<import("../types").SharedAlbumSummary> =>
    apiClient.post(`/public/gallery-upload/${uploadToken}/albums`, data, true),

  deleteAlbum: (uploadToken: string, albumId: string): Promise<void> =>
    apiClient.delete(
      `/public/gallery-upload/${uploadToken}/albums/${albumId}`,
      undefined,
      true,
    ),

  getAlbumPhotos: (
    uploadToken: string,
    albumId: string,
    params?: { cursor?: string; size?: number },
  ): Promise<import("../types").SharedPhotoPage> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.size) query.set("size", String(params.size));
    const qs = query.toString();
    return apiClient.get(
      `/public/gallery-upload/${uploadToken}/albums/${albumId}/photos${qs ? `?${qs}` : ""}`,
      true,
    );
  },

  uploadPhotos: async (
    uploadToken: string,
    albumId: string,
    files: File[],
    onProgress?: (progress: ChunkedUploadProgress) => void,
  ): Promise<import("../types").OrgPhoto[]> => {
    const chunks = splitFilesIntoChunks(files);
    const allResults: import("../types").OrgPhoto[] = [];
    let uploadedFiles = 0;

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.({
        uploadedFiles,
        totalFiles: files.length,
        currentBatch: i + 1,
        totalBatches: chunks.length,
      });

      const results = await uploadFormData(
        `${API_BASE_URL}/public/gallery-upload/${uploadToken}/albums/${albumId}/photos`,
        chunks[i],
      );
      allResults.push(...results);
      uploadedFiles += chunks[i].length;
    }

    onProgress?.({
      uploadedFiles: files.length,
      totalFiles: files.length,
      currentBatch: chunks.length,
      totalBatches: chunks.length,
    });

    return allResults;
  },

  deletePhoto: (
    uploadToken: string,
    albumId: string,
    photoId: string,
  ): Promise<void> =>
    apiClient.delete(
      `/public/gallery-upload/${uploadToken}/albums/${albumId}/photos/${photoId}`,
      undefined,
      true,
    ),
};

/** @deprecated kept for per-album share backward compat */
export const publicAlbumAPI = {
  getSharedAlbum: (
    shareToken: string,
  ): Promise<import("../types").SharedAlbumInfo> =>
    apiClient.get(`/public/albums/${shareToken}`, true),

  getSharedAlbumPhotos: (
    shareToken: string,
    params?: { cursor?: string; size?: number },
  ): Promise<import("../types").SharedPhotoPage> => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.size) query.set("size", String(params.size));
    const qs = query.toString();
    return apiClient.get(
      `/public/albums/${shareToken}/photos${qs ? `?${qs}` : ""}`,
      true,
    );
  },
};

// ========================================
// Trash API (휴지통)
// ========================================

import type { TrashListResponse } from "../types";

export const trashAPI = {
  list: (boardId: string): Promise<TrashListResponse> =>
    apiClient.get<TrashListResponse>(`/boards/${boardId}/trash`),

  restoreFeature: (boardId: string, featureId: string): Promise<void> =>
    apiClient.post<void>(
      `/boards/${boardId}/trash/features/${featureId}/restore`,
      {},
    ),

  restoreTask: (boardId: string, taskId: string): Promise<void> =>
    apiClient.post<void>(
      `/boards/${boardId}/trash/tasks/${taskId}/restore`,
      {},
    ),

  restoreChecklistItem: (boardId: string, itemId: string): Promise<void> =>
    apiClient.post<void>(
      `/boards/${boardId}/trash/checklist-items/${itemId}/restore`,
      {},
    ),

  permanentlyDeleteFeature: (
    boardId: string,
    featureId: string,
  ): Promise<void> =>
    apiClient.delete<void>(`/boards/${boardId}/trash/features/${featureId}`),

  permanentlyDeleteTask: (boardId: string, taskId: string): Promise<void> =>
    apiClient.delete<void>(`/boards/${boardId}/trash/tasks/${taskId}`),

  permanentlyDeleteChecklistItem: (
    boardId: string,
    itemId: string,
  ): Promise<void> =>
    apiClient.delete<void>(
      `/boards/${boardId}/trash/checklist-items/${itemId}`,
    ),

  emptyTrash: (boardId: string): Promise<void> =>
    apiClient.delete<void>(`/boards/${boardId}/trash`),
};

// ========================================
// Storage API (마이스페이스 개인 파일 보관함)
// 경로는 /me/storage 고정, 스코프는 JWT 사용자로 결정된다.
// ========================================

export interface StorageFolderTree {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  depth: number;
  is_shared: boolean;
  share_code: string | null;
  children: StorageFolderTree[];
}

export interface StorageFileItem {
  id: string;
  folder_id: string | null;
  original_filename: string;
  content_type: string | null;
  file_size: number;
  url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  is_image: boolean;
  is_video: boolean;
  is_shared: boolean;
  share_code: string | null;
  created_at: string;
}

export interface StorageUsage {
  used: number;
  quota: number;
  tier: string;
}

export interface StorageCategoryUsage {
  category: "IMAGE" | "VIDEO" | "DOCUMENT" | "OTHER";
  bytes: number;
  count: number;
}

export interface StorageUsageDetail {
  used: number;
  quota: number;
  tier: string;
  file_count: number;
  categories: StorageCategoryUsage[];
}

export interface StoragePresignResult {
  mode: string; // "presigned" | "direct"
  upload_url: string | null;
  s3_key: string | null;
}

export interface StorageTrashItem {
  id: string;
  type: "FOLDER" | "FILE";
  name: string;
  deleted_at: string | null;
}

// S3 직접 PUT (진행률 콜백 지원 — XHR 사용)
function putToS3WithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 업로드 실패 (${xhr.status})`));
    xhr.onerror = () => reject(new Error("S3 업로드 네트워크 오류"));
    xhr.send(file);
  });
}

export const myStorageAPI = {
  // Folders
  getFolders: () => apiClient.get<StorageFolderTree[]>(`/me/storage/folders`),

  createFolder: (name: string, parentId?: string | null) =>
    apiClient.post<StorageFolderTree>(`/me/storage/folders`, {
      name,
      parent_id: parentId ?? null,
    }),

  renameFolder: (folderId: string, name: string) =>
    apiClient.put<StorageFolderTree>(`/me/storage/folders/${folderId}`, { name }),

  moveFolder: (folderId: string, parentId: string | null, position?: number) =>
    apiClient.put<StorageFolderTree>(`/me/storage/folders/${folderId}/move`, {
      parent_id: parentId,
      position: position ?? null,
    }),

  deleteFolder: (folderId: string) =>
    apiClient.delete<{ message: string }>(`/me/storage/folders/${folderId}`),

  enableFolderShare: (folderId: string) =>
    apiClient.post<StorageFolderTree>(`/me/storage/folders/${folderId}/share`, {}),

  disableFolderShare: (folderId: string) =>
    apiClient.delete<StorageFolderTree>(`/me/storage/folders/${folderId}/share`),

  // Files
  getFiles: (folderId?: string | null) => {
    const q = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : "";
    return apiClient.get<StorageFileItem[]>(`/me/storage/files${q}`);
  },

  /**
   * 파일 업로드: presigned(S3 직접, 대용량/진행률) 우선, 미지원(로컬)이면 multipart 폴백.
   */
  uploadFile: async (
    file: File,
    folderId?: string | null,
    onProgress?: (percent: number) => void,
  ): Promise<StorageFileItem> => {
    const presign = await apiClient.post<StoragePresignResult>(
      `/me/storage/files/presign`,
      {
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        file_size: file.size,
        folder_id: folderId ?? null,
      },
    );

    if (presign.mode === "presigned" && presign.upload_url && presign.s3_key) {
      await putToS3WithProgress(presign.upload_url, file, onProgress);
      return apiClient.post<StorageFileItem>(`/me/storage/files/confirm`, {
        s3_key: presign.s3_key,
        folder_id: folderId ?? null,
        original_filename: file.name,
        content_type: file.type || "application/octet-stream",
        file_size: file.size,
      });
    }

    // 폴백: 서버 경유 multipart
    const formData = new FormData();
    formData.append("file", file);
    if (folderId) formData.append("folder_id", folderId);
    const response = await authenticatedFetch(`${API_BASE_URL}/me/storage/files`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const errData = await response
        .json()
        .catch(() => ({ code: "UNKNOWN", message: response.statusText }));
      throw errData;
    }
    onProgress?.(100);
    return response.json();
  },

  moveFile: (fileId: string, folderId: string | null) =>
    apiClient.put<StorageFileItem>(`/me/storage/files/${fileId}/move`, {
      folder_id: folderId,
    }),

  deleteFile: (fileId: string) =>
    apiClient.delete<{ message: string }>(`/me/storage/files/${fileId}`),

  enableFileShare: (fileId: string) =>
    apiClient.post<StorageFileItem>(`/me/storage/files/${fileId}/share`, {}),

  disableFileShare: (fileId: string) =>
    apiClient.delete<StorageFileItem>(`/me/storage/files/${fileId}/share`),

  /** 인증 다운로드 → Blob (브라우저 저장은 서비스 레이어에서 트리거) */
  downloadFile: async (fileId: string): Promise<Blob> => {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/me/storage/files/${fileId}/download`,
      { method: "GET" },
    );
    if (!response.ok) throw new Error("다운로드에 실패했습니다");
    return response.blob();
  },

  // Usage
  getUsage: () => apiClient.get<StorageUsage>(`/me/storage/usage`),

  getUsageDetail: () =>
    apiClient.get<StorageUsageDetail>(`/me/storage/usage/detail`),

  // Trash
  getTrash: () => apiClient.get<StorageTrashItem[]>(`/me/storage/trash`),

  restoreFile: (fileId: string) =>
    apiClient.post<{ message: string }>(`/me/storage/trash/files/${fileId}/restore`, {}),

  restoreFolder: (folderId: string) =>
    apiClient.post<{ message: string }>(`/me/storage/trash/folders/${folderId}/restore`, {}),

  permanentDeleteFile: (fileId: string) =>
    apiClient.delete<{ message: string }>(`/me/storage/trash/files/${fileId}`),

  permanentDeleteFolder: (folderId: string) =>
    apiClient.delete<{ message: string }>(`/me/storage/trash/folders/${folderId}`),

  emptyTrash: () =>
    apiClient.delete<{ deleted_count: number }>(`/me/storage/trash`),
};
