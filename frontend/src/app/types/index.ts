// ========================================
// 사용자 타입
// ========================================

export type SystemRole = "USER" | "TESTER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  name: string;
  profile_image?: string | null;
  email_verified?: boolean;
  theme?: "dark" | "light";
  provider?: "email" | "google";
  system_role?: SystemRole;
  personal_space_enabled?: boolean;
}

// ========================================
// Admin 관련 타입
// ========================================

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  profile_image: string | null;
  email_verified: boolean;
  auth_provider: string;
  system_role: SystemRole;
  board_count: number;
  last_login_at: string | null;
  created_at: string;
  has_personal_board?: boolean;
}

export interface AdminUserDetail extends AdminUser {
  boards: AdminBoardSummary[];
  // Personal Board fields
  has_personal_board?: boolean;
  personal_board_id?: string | null;
  personal_board_created_at?: string | null;
  personal_board_task_count?: number | null;
  personal_board_diary_count?: number | null;
  personal_board_event_count?: number | null;
}

export interface AdminBoardSummary {
  id: string;
  name: string;
  description: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  tier: BoardTier;
  board_type?: BoardType;
  member_count: number;
  task_count: number;
  subscription_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface AdminBoardDetail extends AdminBoardSummary {
  members: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
    role: BoardRole;
    joined_at: string;
  }[];
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

export interface AdminSubscription {
  id: string;
  board_id: string;
  board_name: string;
  owner: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  status: SubscriptionStatus;
  plan: string | null;
  price: number | null;
  seat_count: number | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

// ========================================
// 역할 타입
// ========================================

export type BoardRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
/** @deprecated Use BoardRole instead */
export type Role = BoardRole;

export type BoardType = "TEAM" | "PERSONAL";

// ========================================
// 구독 관련 타입
// ========================================

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELED";

export interface Subscription {
  id?: string;
  status: SubscriptionStatus;
  plan: string | null;
  billing_cycle?: "MONTHLY" | "YEARLY" | null;
  price?: number | null;
  seat_count?: number;
  price_per_seat?: number | null;
  trial_ends_at: string | null;
  current_period_start?: string | null;
  current_period_end: string | null;
  billable_member_count?: number;
  member_limit?: number;
  next_payment_at?: string | null;
  created_at?: string;
  cancel_requested_at?: string | null;
  past_due_since?: string | null;
  days_past_due?: number | null;
  days_until_suspension?: number | null;
}

// ========================================
// 보드 관련 타입
// ========================================

export type BoardTier = "TRIAL" | "STANDARD" | "PREMIUM" | "ORG_MANAGED";

export interface OrgBoardCandidate {
  user_id: string;
  name: string;
  email: string;
  profile_image: string | null;
  department: string | null;
  position: string | null;
}

export interface BoardOwner {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
}

export interface BoardSubscription {
  status: SubscriptionStatus;
  plan: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface MemberPreview {
  id: string;
  name: string;
  profile_image: string | null;
}

export interface Board {
  id: string;
  name: string;
  description?: string | null;
  background_gradient?: string | null;
  board_type?: BoardType;
  owner?: BoardOwner;
  role?: BoardRole;
  my_role?: BoardRole;
  is_starred: boolean;
  member_count: number;
  task_count?: number;
  completed_tasks?: number;
  members?: MemberPreview[];
  subscription: BoardSubscription;
  tier?: BoardTier;
  trial_ends_at?: string | null;
  selected_milestone_id?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  is_org_member_viewer?: boolean;
  has_pending_join_request?: boolean;
  created_at: string;
  updated_at?: string;
}

export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface BoardJoinRequest {
  id: string;
  board_id: string;
  requester: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  status: JoinRequestStatus;
  message: string | null;
  reviewed_by: {
    id: string;
    name: string;
  } | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface BoardTierInfo {
  tier: BoardTier;
  trial_ends_at: string | null;
  can_access_schedule: boolean;
  can_access_milestone: boolean;
  can_access_statistics: boolean;
  can_access_slack: boolean;
}

export interface BoardLimits {
  task_limit: number | null;
  current_task_count: number;
  can_create_task: boolean;
}

// ========================================
// 멤버 타입
// ========================================

export interface BoardMember {
  id: string;
  user: User;
  role: BoardRole;
  joined_at: string;
  invited_by?: { id: string; name: string } | null;
  assignee_color?: string | null;
  job_role?: JobRoleInfo | null;
}

// ========================================
// 직군(JobRole) 타입
// ========================================

export interface JobRoleInfo {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface JobRole extends JobRoleInfo {
  display_order?: number | null;
  member_count?: number;
  created_at?: string;
}

// ========================================
// 외주(BoardContractor) 타입
// ========================================

export interface ContractorPeriod {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ContractorInfo {
  id: string;
  name: string;
  color?: string | null;
  // 대표(현재) 기간 — periods 에서 파생, 하위호환 표시용
  start_date?: string | null;
  end_date?: string | null;
  // 전체 계약 기간 이력 (start_date ASC)
  periods?: ContractorPeriod[];
  // 파생 상태: active / upcoming / expired / none
  status?: "active" | "upcoming" | "expired" | "none" | string;
  manager_member_id?: string | null;
  manager_name?: string | null;
  job_role?: JobRoleInfo | null;
  // 워크로드 뷰 숨김 여부 (더이상 진행하지 않는 외주)
  hidden?: boolean;
}

export interface BoardContractor extends ContractorInfo {
  display_order?: number | null;
  manager_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ========================================
// 블록 타입
// ========================================

export type BlockType = "FIXED" | "CUSTOM";
export type FixedBlockType = "FEATURE" | "TASK" | "DONE" | null;

export interface Block {
  id: string;
  name: string;
  type: BlockType;
  fixed_type: FixedBlockType;
  color: string | null;
  position: number;
  milestone_id?: string | null;
  milestone_title?: string | null;
}

// ========================================
// 태그 타입
// ========================================

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

// ========================================
// 담당자 타입
// ========================================

export interface Assignee {
  id: string;
  name: string;
  email: string;
  profile_image: string | null;
}

// ========================================
// Feature 타입
// ========================================

export type FeatureStatus = "ACTIVE" | "COMPLETED";

export interface Feature {
  id: string;
  title: string;
  description?: string;
  color: string;
  assignee: Assignee | null;
  start_date: string | null;
  due_date: string | null;
  status: FeatureStatus;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  position: number;
  tags: Tag[];
  inbox?: boolean;
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface FeatureDeleteRequest {
  task_migrations?: Array<{
    task_id: string;
    target_feature_id: string;
  }>;
}

// ========================================
// Task 타입
// ========================================

export interface Task {
  id: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  block_id: string;
  block_name?: string;
  title: string;
  description?: string;
  // v7.0: Task.assignee 제거 - ChecklistItem.assignee로 대체
  start_date: string | null; // 시작일 (위클리 스케줄용)
  due_date: string | null;
  baseline_start_date: string | null;
  baseline_due_date: string | null;
  estimated_minutes: number | null;
  completed: boolean;
  position: number;
  tags: Tag[];
  checklist_total?: number;
  checklist_completed?: number;
  assignees?: { id: string; name: string }[];
  checklist_version?: number; // 체크리스트 변경 감지용 버전
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

// ========================================
// 태스크 의존성 타입 (FS: Finish-to-Start)
// ========================================

export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  created_at: string;
}

// ========================================
// 마일스톤 타입
// ========================================

export interface MilestoneFeatureInfo {
  id: string;
  title: string;
  color: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  is_primary: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  feature_count: number;
  progress_percentage: number;
  features?: MilestoneFeatureInfo[];
  created_by?: { id: string; name: string };
  created_at?: string;
  default_hours_per_day?: number;
}

// ========================================
// 마일스톤 인원 할당 타입
// ========================================

export type MilestoneAllocationStatus = "OVER" | "UNDER" | "NORMAL";

export interface MilestoneAllocation {
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
  status?: MilestoneAllocationStatus;
}

// ========================================
// 체크리스트 타입
// ========================================

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  assignee?: {
    id: string;
    name: string;
    profile_image: string | null;
  } | null;
  contractor?: ContractorInfo | null;
  start_date: string | null;
  due_date: string | null;
  done_date: string | null;
  position: number;
  created_at?: string;
  completed_at?: string | null;
}

export interface Checklist {
  total: number;
  completed: number;
  items: ChecklistItem[];
}

// ========================================
// 초대 링크 타입
// ========================================

export interface InviteLink {
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

// ========================================
// 초대 결과 타입
// ========================================

export interface InviteResult {
  type: "DIRECT_ADD" | "EMAIL_SENT";
  member?: BoardMember; // DIRECT_ADD인 경우
  email?: string; // EMAIL_SENT인 경우
  role?: string; // EMAIL_SENT인 경우
}

// ========================================
// 댓글 타입
// ========================================

export interface CommentAttachment {
  id: string;
  file_name: string;
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  file_size: number;
  created_at: string;
}

export interface CommentReactionUser {
  id: string;
  name: string;
}

export interface CommentReaction {
  emoji: string;
  image_url: string | null;
  is_custom: boolean;
  count: number;
  users: CommentReactionUser[];
}

export interface BoardCustomEmoji {
  id: string;
  name: string;
  image_url: string;
  content_type: string;
}

export interface BoardResource {
  id: string;
  title: string;
  url: string;
  description?: string | null;
  favicon_url?: string | null;
  display_order: number;
  created_by_name?: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  content: string;
  mentions: string[];
  attachments: CommentAttachment[];
  reactions: CommentReaction[];
  parent_id: string | null;
  parent_author_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCommentListResponse {
  comments: TaskComment[];
  total_count: number;
}

// ========================================
// 활동 로그 타입
// ========================================

export type ActivityAction =
  | "BOARD_CREATED"
  | "BOARD_UPDATED"
  | "BLOCK_CREATED"
  | "BLOCK_UPDATED"
  | "BLOCK_DELETED"
  | "BLOCK_REORDERED"
  | "FEATURE_CREATED"
  | "FEATURE_UPDATED"
  | "FEATURE_DELETED"
  | "FEATURE_COMPLETED"
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "TASK_MOVED"
  | "TASK_COMPLETED"
  | "TASK_REOPENED"
  | "CHECKLIST_CREATED"
  | "CHECKLIST_CHECKED"
  | "TAG_CREATED"
  | "TAG_DELETED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "MEMBER_LEFT"
  | "MEMBER_REMOVED"
  | "MEMBER_ROLE_CHANGED"
  | "SUBSCRIPTION_STARTED"
  | "SUBSCRIPTION_PLAN_CHANGED"
  | "SUBSCRIPTION_CANCELED";

export interface ActivityLog {
  id: string;
  user: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  action: ActivityAction | string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ========================================
// 알림(Notification) 타입
// ========================================

export type NotificationType =
  | "COMMENT_MENTION"
  | "CHECKLIST_ASSIGNED"
  | "TASK_COMMENT";

export interface NotificationItem {
  id: string;
  type: NotificationType;
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
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unread_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface NotificationPreferences {
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
}

// ========================================
// 데일리 스탠드업 설정
// ========================================

export interface StandupConfig {
  id: string;
  board_id: string;
  enabled: boolean;
  send_hour_utc: number;
  send_minute_utc: number;
  timezone: string;
  language: string;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// 요금제 타입
// ========================================

export interface PricingPlan {
  id: string;
  name: string;
  min_members: number;
  max_members: number;
  monthly_price: number;
  yearly_price: number;
  yearly_monthly_price: number;
  discount_percentage: number;
}

export interface SeatPricing {
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
// 필터 옵션 타입
// ========================================

export interface FilterOptions {
  keyword: string;
  members: string[];
  features: string[];
  tags: string[];
  cardStatus: string[];
  dueDate: string[];
}

// ========================================
// 드래그 아이템 타입
// ========================================

export interface DragItem {
  type: "task";
  taskId: string;
  currentBlock: string;
}

export interface BlockDragItem {
  type: "block";
  blockId: string;
  position: number;
}

// ========================================
// API 에러 타입
// ========================================

export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
}

// 에러 코드 상수
export const ERROR_CODES = {
  // 공통
  C001: "잘못된 입력값",
  C002: "서버 오류",
  // 인증
  A001: "이미 사용 중인 이메일",
  A002: "이메일/비밀번호 불일치",
  A003: "유효하지 않은 토큰",
  A004: "만료된 토큰",
  A005: "인증 필요",
  // 사용자
  U001: "사용자 없음",
  // 보드
  B001: "보드 없음",
  B002: "보드 접근 권한 없음",
  B003: "보드 정지 상태",
  B004: "Premium 기능 필요",
  // 블록
  BL001: "블록 없음",
  BL002: "고정 블록 삭제 불가",
  BL003: "고정 블록 수정 불가",
  // Feature
  F001: "Feature 없음",
  // Task
  T001: "Task 없음",
  T002: "Task 이동 불가 블록",
  T003: "Task 제한 초과 (Standard 보드 10개 제한)",
  // 태그
  TG001: "태그 없음",
  TG002: "이미 존재하는 태그",
  // 체크리스트
  CL001: "체크리스트 항목 없음",
  // 멤버
  M001: "멤버 없음",
  M002: "이미 멤버임",
  M003: "Owner 내보내기 불가",
  M004: "Owner 역할 변경 불가",
  // 초대
  I001: "초대 링크 없음",
  I002: "만료된 초대 링크",
  I003: "유효하지 않은 초대 링크",
  // 구독
  S001: "구독 정보 없음",
  S002: "체험 기간 만료",
  S003: "결제 필요",
  S004: "멤버 수 제한 초과",
  // 알림
  N001: "알림 없음",
} as const;

// ========================================
// 통계 시스템 타입 (Statistics & Productivity)
// ========================================

/**
 * 가중치 레벨 - 보드별로 커스텀 설정 가능
 * 예: Low(0.5), Medium(1.0), High(1.5), Critical(2.0)
 */
export interface WeightLevel {
  id: string;
  name: string;
  weight: number;
  color: string;
  position: number;
  is_default?: boolean;
}

/**
 * 보드의 가중치 설정
 */
export interface BoardWeightSettings {
  board_id: string;
  levels: WeightLevel[];
  default_level_id: string;
}

/**
 * Task에 적용된 가중치 정보
 */
export interface TaskWeight {
  task_id: string;
  weight_level_id: string;
  weight_level?: WeightLevel;
}

/**
 * 통계 필터 옵션
 */
export interface StatisticsFilter {
  start_date: string | null;
  end_date: string | null;
  milestone_ids: string[];
  feature_ids: string[];
  member_ids: string[];
  tag_ids: string[];
}

/**
 * 시간 블록 통계 정보
 */
export interface TimeBlockStatistics {
  total_minutes: number;
  completed_minutes: number;
  incomplete_minutes: number;
  block_count: number;
}

/**
 * Feature 내 Task별 시간 정보
 */
export interface FeatureTaskTime {
  task_id: string;
  task_title: string;
  minutes: number;
  percentage: number;
}

/**
 * 구성원별 통계
 */
export interface MemberStatistics {
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
    tasks?: FeatureTaskTime[];
  }[];
}

/**
 * Feature별 통계
 */
export interface FeatureStatistics {
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

/**
 * Milestone별 통계
 */
export interface MilestoneStatistics {
  milestone: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
  };
  total_minutes: number;
  completed_minutes: number;
  feature_count: number;
  completed_feature_count: number;
  progress_percentage: number;
  by_feature: FeatureStatistics[];
}

/**
 * 태그별 통계
 */
export interface TagStatistics {
  tag: {
    id: string;
    name: string;
    color: string;
  };
  total_minutes: number;
  task_count: number;
}

/**
 * 임팩트 점수 통계
 * Impact Score = Σ (Task 사용 시간 × Task Weight)
 */
export interface ImpactStatistics {
  total_impact_score: number;
  by_member: {
    member_id: string;
    member_name: string;
    profile_image: string | null;
    impact_score: number;
    weighted_minutes: number;
  }[];
  by_weight_level: {
    level: WeightLevel;
    total_minutes: number;
    task_count: number;
  }[];
}

/**
 * 요약 대시보드 KPI
 */
export interface StatisticsSummary {
  // 시간 기반
  total_work_minutes: number;
  completed_work_minutes: number;
  incomplete_work_minutes: number;

  // 작업 기반
  total_tasks: number;
  completed_tasks: number;
  incomplete_tasks: number;

  // Feature 기반
  total_features: number;
  completed_features: number;
  average_feature_progress: number;

  // 집중도 (완료 시간 / 전체 시간)
  focus_rate: number;

  // 기간 정보
  period_start: string;
  period_end: string;
}

/**
 * 전체 통계 응답
 */
export interface BoardStatistics {
  summary: StatisticsSummary;
  by_member: MemberStatistics[];
  by_feature: FeatureStatistics[];
  by_milestone: MilestoneStatistics[];
  by_tag: TagStatistics[];
  impact: ImpactStatistics;

  // 일별 트렌드 (차트용)
  daily_trend: {
    date: string;
    total_minutes: number;
    completed_minutes: number;
    task_completed_count: number;
  }[];
}

/**
 * 개인 통계 (Member용 - 본인 데이터만)
 */
export interface PersonalStatistics {
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

/**
 * 통계 뷰 타입
 */
export type StatisticsViewType =
  | "overview" // 요약 대시보드
  | "individual" // 개인 생산성
  | "team" // 팀 생산성
  | "work" // 작업 분석
  | "impact" // 임팩트 분석
  | "management"; // 관리 대시보드

// ========================================
// AI 주간 보고서 타입
// ========================================

export type ReportType = "TEAM" | "PERSONAL";

export interface WeeklyReport {
  id: string;
  report_type: ReportType;
  target_user_id: string | null;
  period_start: string;
  period_end: string;
  content: string;
  data_snapshot: string | null;
  generated_by: string;
  generated_by_name: string;
  created_at: string;
}

export interface ReportMeeting {
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  memo?: string;
  has_transcript: boolean;
  participants: string[];
  created_by?: string; // only in team reports
}

export interface PersonalReportData {
  board_name: string;
  period: { start: string; end: string };
  user_name: string;
  features: PersonalReportFeature[];
  meetings?: ReportMeeting[];
  summary: {
    total_minutes: number;
    completed_checklists: number;
    total_checklists: number;
    total_comments: number;
    total_meetings?: number;
  };
}

export interface PersonalReportFeature {
  title: string;
  status: string;
  progress: string;
  tasks: PersonalReportTask[];
}

export interface PersonalReportTask {
  title: string;
  block: string;
  completed: boolean;
  checklists?: { title: string; completed: boolean }[];
  time_minutes?: number;
  time_details?: { date: string; minutes: number }[];
  comments?: { content: string }[];
}

export interface TeamReportData {
  board_name: string;
  period: { start: string; end: string };
  statistics: {
    summary: {
      total_work_minutes: number;
      completed_work_minutes: number;
      total_tasks: number;
      completed_tasks: number;
      total_features: number;
      completed_features: number;
      average_feature_progress: number;
      focus_rate: number;
    };
    by_member: Array<{
      member: { id: string; name: string; profile_image: string };
      total_minutes: number;
      completed_minutes: number;
      task_count: number;
      completed_task_count: number;
      impact_score: number;
    }>;
    by_feature: Array<{
      feature: { id: string; title: string; color: string };
      total_minutes: number;
      task_count: number;
      completed_task_count: number;
      progress_percentage: number;
    }>;
  };
  management: {
    milestone_health: Array<{
      milestone: { title: string; end_date: string };
      progress_percentage: number;
      status: string;
      days_remaining: number;
      days_overdue: number;
    }>;
    delayed_items: {
      bottleneck_summary: {
        total_overdue_features: number;
        total_stagnant_tasks: number;
        total_stuck_checklists: number;
      };
      overdue_features: Array<{
        feature_title: string;
        days_overdue: number;
        assignee?: { name: string };
        progress_percentage: number;
      }>;
      stagnant_tasks: Array<{
        task_title: string;
        feature_title: string;
        days_in_block: number;
        block_name: string;
        assignee?: { name: string };
      }>;
    };
    summary: {
      overall_health_score: number;
      total_delayed_items: number;
      total_members: number;
    };
  };
  comments: Array<{
    author: string;
    task_title: string;
    content: string;
    created_at: string;
  }>;
  meetings?: ReportMeeting[];
}

export interface WeeklyReportListItem {
  id: string;
  report_type: ReportType;
  target_user_id: string | null;
  target_user_name: string | null;
  period_start: string;
  period_end: string;
  generated_by_name: string;
  created_at: string;
}

// ========================================
// 데일리 체크리스트 타입
// ========================================

/**
 * 데일리 체크리스트 항목
 * 특정 날짜에 특정 멤버에게 할당된 체크리스트
 */
export interface DailyChecklistItem {
  id: string;
  checklist_item_id: string | null; // 원본 체크리스트 ID (삭제된 경우 null)
  title: string; // 체크리스트 제목 (원본 삭제 시 백업용)
  assignee: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  assigned_date: string; // 할당 날짜 (yyyy-MM-dd)
  position: number; // 우선순위 순서
  completed: boolean; // 원본 체크리스트 완료 상태
  task: {
    id: string;
    title: string;
  } | null;
  feature: {
    id: string;
    title: string;
    color: string;
  } | null;
  created_at: string;
}

/**
 * 멤버별 데일리 체크리스트 컬럼
 */
export interface DailyChecklistColumn {
  user: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  items: DailyChecklistItem[];
}

/**
 * 데일리 체크리스트 응답
 */
export interface DailyChecklistResponse {
  date: string;
  columns: DailyChecklistColumn[];
}

// ==================== Management Dashboard Types ====================

/**
 * 마일스톤 헬스 상태
 */
export type MilestoneHealthStatus = "ON_TRACK" | "SLOW" | "AT_RISK" | "OVERDUE";

/**
 * 멤버 생산성 상태
 */
export type MemberProductivityStatus = "NORMAL" | "OVERWORKED" | "RELAXED";

/**
 * 마일스톤 정보
 */
export interface MilestoneInfo {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
}

/**
 * 속도 정보
 */
export interface VelocityInfo {
  average_tasks_per_day: number;
  tasks_remaining: number;
  tasks_completed: number;
  tasks_total: number;
  required_velocity: number;
  // 시간 기반 메트릭
  estimated_total_minutes: number | null;
  actual_total_minutes: number | null;
  remaining_estimated_minutes: number | null;
  average_minutes_per_day: number | null;
  required_minutes_per_day: number | null;
  time_efficiency: number | null; // 실제/예상 * 100
}

/**
 * 번다운 차트 데이터 포인트
 */
export interface BurndownPoint {
  date: string;
  ideal_remaining: number;
  actual_remaining: number;
  // 시간 기반 번다운 (분 단위)
  ideal_remaining_minutes: number | null;
  actual_remaining_minutes: number | null;
}

/**
 * Feature 요약
 */
export interface FeatureSummary {
  total_features: number;
  completed_features: number;
  at_risk_features: number;
}

/**
 * 마일스톤 내 Task 정보 (예상 시간 설정용)
 * 담당자는 Task가 아닌 ChecklistItem들의 담당자 목록
 */
export interface MilestoneTask {
  task_id: string;
  task_title: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  assignees: ManagementMemberInfo[]; // ChecklistItem 담당자들 (중복 제거)
  current_block: string;
  is_completed: boolean;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  start_date: string | null;
  due_date: string | null;
}

/**
 * 마일스톤 헬스
 */
export interface MilestoneHealth {
  milestone: MilestoneInfo;
  progress_percentage: number;
  estimated_completion_date: string | null;
  status: MilestoneHealthStatus;
  days_remaining: number;
  days_overdue: number;
  velocity: VelocityInfo;
  burndown: BurndownPoint[];
  feature_summary: FeatureSummary;
  tasks: MilestoneTask[];
}

/**
 * 멤버 정보 (관리용)
 */
export interface ManagementMemberInfo {
  id: string;
  name: string;
  profile_image: string | null;
  role?: string;
}

/**
 * 진행 중 Task 상세
 */
export interface InProgressTask {
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
  // 시간 기반 메트릭
  estimated_minutes: number | null;
  actual_minutes: number | null;
  time_efficiency: number | null;
}

/**
 * 막힌 체크리스트 항목
 */
export interface StuckChecklistItem {
  checklist_id: string;
  checklist_title: string;
  task_id: string;
  task_title: string;
  feature_title: string;
  days_stuck: number;
  created_at: string;
}

/**
 * 최근 완료 Task
 */
export interface RecentCompletedTask {
  task_id: string;
  task_title: string;
  feature_title: string;
  completed_at: string;
  days_to_complete: number;
}

/**
 * 멤버 생산성
 */
export interface MemberProductivity {
  member: ManagementMemberInfo;
  assigned_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  completion_rate: number;
  total_checklists: number;
  completed_checklists: number;
  checklist_completion_rate: number;
  status: MemberProductivityStatus;
  in_progress_task_details: InProgressTask[];
  stuck_checklists: StuckChecklistItem[];
  recent_completed_tasks: RecentCompletedTask[];
  // 시간 기반 메트릭
  total_estimated_minutes: number | null;
  total_actual_minutes: number | null;
  time_efficiency: number | null;
  average_minutes_per_day: number | null;
  // ChecklistItem 담당자 기준 새 필드
  assigned_task_details?: InProgressTask[];
  all_checklist_details?: MemberChecklistInfo[];
  in_progress_checklist_details?: MemberChecklistInfo[];
}

/**
 * 멤버 체크리스트 정보 (모든 체크리스트 / 진행 중 체크리스트 표시용)
 */
export interface MemberChecklistInfo {
  checklist_id: string;
  checklist_title: string;
  task_id: string;
  task_title: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  is_completed: boolean;
  created_at: string | null;
  completed_at: string | null;
}

/**
 * 마감 초과 Feature
 */
export interface OverdueFeature {
  feature_id: string;
  feature_title: string;
  feature_color: string;
  due_date: string;
  days_overdue: number;
  assignee: ManagementMemberInfo | null;
  progress_percentage: number;
  tasks_remaining: number;
}

/**
 * 정체 Task
 */
export interface StagnantTask {
  task_id: string;
  task_title: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  current_block: string;
  block_name: string;
  days_in_block: number;
  assignee: ManagementMemberInfo | null;
  due_date: string | null;
  is_overdue: boolean;
}

/**
 * 막힌 체크리스트
 */
export interface StuckChecklist {
  checklist_id: string;
  checklist_title: string;
  task_id: string;
  task_title: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  days_stuck: number;
  assignee: ManagementMemberInfo | null;
  due_date: string | null;
}

/**
 * 멤버 병목
 */
export interface MemberBottleneck {
  member: ManagementMemberInfo;
  delayed_item_count: number;
  overdue_tasks: number;
  stuck_checklists: number;
}

/**
 * 블록 병목
 */
export interface BlockBottleneck {
  block_id: string;
  block_name: string;
  stuck_task_count: number;
  average_days_stuck: number;
}

/**
 * 병목 요약
 */
export interface BottleneckSummary {
  most_delayed_member: MemberBottleneck | null;
  most_problematic_block: BlockBottleneck | null;
  total_overdue_features: number;
  total_stagnant_tasks: number;
  total_stuck_checklists: number;
}

/**
 * 지연 항목
 */
export interface DelayedItems {
  overdue_features: OverdueFeature[];
  stagnant_tasks: StagnantTask[];
  stuck_checklists: StuckChecklist[];
  bottleneck_summary: BottleneckSummary;
}

/**
 * 관리 요약
 */
export interface ManagementSummary {
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

/**
 * 관리 설정
 */
export interface ManagementSettings {
  stagnant_task_days_threshold: number;
  stuck_checklist_days_threshold: number;
}

/**
 * 관리 통계 응답
 */
export interface ManagementStatistics {
  milestone_health: MilestoneHealth[];
  team_productivity: MemberProductivity[];
  delayed_items: DelayedItems;
  summary: ManagementSummary;
  settings: ManagementSettings;
}

// ========================================
// 문의사항 타입
// ========================================

export type InquiryStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface InquiryAttachment {
  id: string;
  original_file_name: string;
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  file_size: number;
}

export type InquiryReplyType = "ADMIN" | "USER";

export interface InquiryReply {
  id: string;
  admin: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  } | null;
  reply_type: InquiryReplyType;
  content: string;
  created_at: string;
}

export interface InquirySummary {
  id: string;
  title: string;
  status: InquiryStatus;
  user: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  reply_count: number;
  attachment_count: number;
  has_new_reply: boolean;
  created_at: string;
  updated_at: string;
}

export interface InquiryDetail {
  id: string;
  title: string;
  content: string;
  status: InquiryStatus;
  user: {
    id: string;
    name: string;
    email: string;
    profile_image: string | null;
  };
  attachments: InquiryAttachment[];
  replies: InquiryReply[];
  created_at: string;
  updated_at: string;
}

export interface InquiryListResponse {
  inquiries: InquirySummary[];
  total: number;
  page: number;
  size: number;
}

// ========================================
// WebSocket Events
// ========================================

export type BoardEventType =
  | "FEATURE_CREATED"
  | "FEATURE_UPDATED"
  | "FEATURE_DELETED"
  | "FEATURE_RESTORED"
  | "FEATURES_REORDERED"
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "TASK_MOVED"
  | "TASK_RESTORED"
  | "BLOCK_CREATED"
  | "BLOCK_UPDATED"
  | "BLOCK_DELETED"
  | "BLOCKS_REORDERED"
  | "COMMENT_CREATED"
  | "COMMENT_UPDATED"
  | "COMMENT_DELETED"
  | "COMMENT_REACTION_TOGGLED"
  | "CHECKLIST_CREATED"
  | "CHECKLIST_UPDATED"
  | "CHECKLIST_DELETED"
  | "CHECKLIST_RESTORED"
  | "CHECKLIST_TOGGLED"
  | "SCHEDULE_CREATED"
  | "SCHEDULE_UPDATED"
  | "SCHEDULE_DELETED"
  | "MEETING_CREATED"
  | "MEETING_UPDATED"
  | "MEETING_DELETED"
  | "TRANSCRIPTION_PROGRESS"
  | "BOARD_UPDATED"
  | "MEMBER_JOINED"
  | "MEMBER_LEFT"
  | "MEMBER_UPDATED"
  | "NOTIFICATION_CREATED"
  | "INQUIRY_REPLIED"
  | "NOTE_COMMENT_CREATED"
  | "NOTE_COMMENT_UPDATED"
  | "NOTE_COMMENT_DELETED"
  | "NOTE_COMMENT_RESOLVED"
  | "NOTE_COMMENT_REACTION_TOGGLED"
  | "PRESENCE_JOINED"
  | "PRESENCE_LEFT";

export interface BoardWebSocketEvent {
  type: BoardEventType;
  board_id: string;
  user_id: string;
  user_name: string;
  timestamp: string;
  data: unknown;
}

// ========================================
// Monitoring Types
// ========================================

export interface MonitoringJvmMetrics {
  heap_used: number;
  heap_max: number;
  heap_usage_percent: number;
  non_heap_used: number;
  live_threads: number;
  peak_threads: number;
  gc_pause_count: number;
  gc_pause_total_ms: number;
}

export interface MonitoringHikariMetrics {
  active_connections: number;
  idle_connections: number;
  pending_connections: number;
  total_connections: number;
  max_connections: number;
  usage_percent: number;
}

export interface MonitoringEndpointMetric {
  endpoint: string;
  http_method: string;
  request_count: number;
  avg_response_ms: number;
  max_response_ms: number;
  p95_response_ms: number;
  error_count: number;
}

export interface MonitoringErrorEndpoint {
  endpoint: string;
  http_method: string;
  error_count: number;
  request_count: number;
  error_rate: number;
  status_codes: Record<string, number>;
}

export interface MonitoringApiMetrics {
  total_requests: number;
  total_errors: number;
  error_rate: number;
  avg_response_ms: number;
  top_slowest_endpoints: MonitoringEndpointMetric[];
  top_error_endpoints: MonitoringErrorEndpoint[];
}

export interface MonitoringEc2Metrics {
  cpu_utilization: number;
  network_in: number;
  network_out: number;
}

export interface MonitoringRdsMetrics {
  cpu_utilization: number;
  database_connections: number;
  freeable_memory_mb: number;
  read_iops: number;
  write_iops: number;
}

export interface MonitoringCloudWatchMetrics {
  ec2: MonitoringEc2Metrics | null;
  rds: MonitoringRdsMetrics | null;
}

export interface MonitoringDashboard {
  jvm: MonitoringJvmMetrics;
  hikari: MonitoringHikariMetrics;
  api: MonitoringApiMetrics;
  cloud_watch: MonitoringCloudWatchMetrics | null;
  server_time: string;
}

export interface MonitoringApiMetricSnapshot {
  endpoint: string;
  http_method: string;
  snapshot_time: string;
  request_count: number;
  avg_response_ms: number;
  max_response_ms: number;
  p95_response_ms: number;
  p99_response_ms: number;
  error_count: number;
  error_rate: number;
}

export interface MonitoringAlertConfig {
  slack_webhook_url: string;
  enabled: boolean;
  thresholds: Record<string, number>;
  alert_email_recipients: string[];
}

export interface MonitoringAiUsageByBoard {
  board_id: string;
  board_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  call_count: number;
}

export interface MonitoringAiUsageByFeature {
  feature_type: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  call_count: number;
}

export interface MonitoringAiUsageDailyTrend {
  date: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  call_count: number;
}

export interface MonitoringAiUsageMetrics {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost_usd: number;
  by_board: MonitoringAiUsageByBoard[];
  by_feature: MonitoringAiUsageByFeature[];
  daily_trend: MonitoringAiUsageDailyTrend[];
}

// OpenAI 계정 빌링
export interface OpenAIDailyCost {
  date: string;
  amount_usd: number;
}

export interface OpenAIModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

export interface OpenAIBilling {
  connected: boolean;
  total_cost_usd: number | null;
  daily_costs: OpenAIDailyCost[];
  model_usage: OpenAIModelUsage[];
}

// ========================================
// AI Credits
// ========================================

export interface AiCredits {
  monthly_credits: number;
  monthly_used: number;
  purchased_credits: number;
  total_available: number;
  reset_date: string | null;
  warning_level: "LOW" | "CRITICAL" | "EXHAUSTED" | null;
}

export interface AiCreditPurchaseRequest {
  credit_amount: number;
  amount: number;
}

export interface AiCreditPurchaseResult {
  purchase_id: string;
  credit_amount: number;
  total_amount: number;
  updated_credits: AiCredits;
}

export interface AiCreditPurchaseHistory {
  id: string;
  credit_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
}

export interface AiCreditUsageHistory {
  id: string;
  user_id: string;
  user_name: string;
  feature_type: string;
  credits_used: number;
  created_at: string;
}

// ========================================
// 개인 일정 (Personal Event)
// ========================================

export interface PersonalEvent {
  id: string;
  title: string;
  description?: string | null;
  event_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  color: string;
  all_day: boolean;
  recurrence_rule?: string | null;
  recurrence_group_id?: string | null;
  recurrence_end_date?: string | null;
  recurrence_days_of_week?: string | null;
  event_type: "CALENDAR" | "SCHEDULE";
  created_at: string;
  updated_at?: string;
}

// ========================================
// AI 일기 (Diary)
// ========================================

export type DiaryStatus = "CHATTING" | "COMPLETED";

export interface DiarySimple {
  id: string;
  diary_date: string;
  title?: string | null;
  mood?: string | null;
  status: DiaryStatus;
  created_at: string;
}

export interface DiaryMessage {
  id: string;
  role: "USER" | "AI";
  content: string;
  message_order: number;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  created_at: string;
}

export interface DiaryDetail {
  id: string;
  diary_date: string;
  title?: string | null;
  content?: string | null;
  mood?: string | null;
  status: DiaryStatus;
  messages: DiaryMessage[];
  created_at: string;
  updated_at?: string;
}

export interface DiaryAiReply {
  diary_id: string;
  user_message: DiaryMessage;
  ai_message: DiaryMessage;
}

export interface DiaryVoiceReply {
  diary_id: string;
  user_text: string;
  user_message: DiaryMessage;
  ai_text: string;
  ai_message: DiaryMessage;
  ai_audio_url: string;
}

export interface DiaryVoiceSettings {
  voice_type: string;
  auto_play: boolean;
  speed: number;
}

// ─── Personal Task (v9.0 MySpace) ───

export type PersonalTaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
export type PersonalTaskPriority = "MEDIUM" | "HIGH" | "URGENT";
export type HabitFrequency = "DAILY" | "WEEKDAY" | "WEEKEND" | "CUSTOM";
export type HabitImportance = "HIGH" | "MEDIUM";

export interface PersonalTask {
  id: string;
  title: string;
  description?: string | null;
  status: PersonalTaskStatus;
  priority: PersonalTaskPriority;
  due_date: string | null;
  category: string | null;
  color: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PersonalHabit {
  id: string;
  title: string;
  description?: string | null;
  icon: string | null;
  color: string;
  frequency_type: HabitFrequency;
  frequency_days: string | null;
  target_count: number;
  unit: string | null;
  importance: HabitImportance;
  current_streak: number;
  best_streak: number;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface PersonalHabitLog {
  id: string;
  log_date: string;
  completed_count: number;
  is_completed: boolean;
  note: string | null;
}

export interface HabitTodayItem {
  habit_id: string;
  title: string;
  icon: string | null;
  color: string;
  target_count: number;
  completed_count: number;
  is_completed: boolean;
  unit: string | null;
  current_streak: number;
  importance: HabitImportance;
  frequency_type: HabitFrequency;
  frequency_days: string | null;
  weekly_target: number;
  weekly_completed: number;
}

export interface HabitWeeklyRow {
  habit_id: string;
  title: string;
  icon: string | null;
  color: string;
  days: HabitDayStatus[];
}

export interface HabitDayStatus {
  date: string;
  completed_count: number;
  target_count: number;
  is_completed: boolean;
}

export interface HabitWeeklyMatrix {
  habits: HabitWeeklyRow[];
  start_date: string;
  end_date: string;
}

export interface DiaryTodayInfo {
  id: string;
  status: DiaryStatus;
  title?: string | null;
  mood?: string | null;
}

export interface DiaryOverviewInfo {
  id: string;
  status: DiaryStatus;
  title?: string | null;
  mood?: string | null;
  last_message_content?: string | null;
  last_message_role?: string | null;
}

export interface PersonalOverviewData {
  all_tasks: PersonalTask[];
  all_habits: PersonalHabit[];
  habits_today: HabitTodayItem[];
  weekly_matrix: HabitWeeklyMatrix;
  today_events: PersonalEvent[];
  due_today_tasks: PersonalTask[];
  in_progress_tasks: PersonalTask[];
  task_completion_rate: number;
  habit_completion_rate: number;
  active_task_count: number;
  completed_today_count: number;
  diary_today: DiaryOverviewInfo | null;
}

export interface PersonalDashboardToday {
  due_today_tasks: PersonalTask[];
  in_progress_tasks: PersonalTask[];
  personal_events: PersonalEvent[];
  habits_today: HabitTodayItem[];
  task_completion_rate: number;
  habit_completion_rate: number;
  active_task_count: number;
  completed_today_count: number;
  diary_today: DiaryTodayInfo | null;
}

// ========================================
// Organization (조직)
// ========================================

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";
export type ContractType = "FULL_TIME" | "CONTRACT" | "INTERN" | "PART_TIME";
export type WorkStatus = "ACTIVE" | "ON_LEAVE" | "RESIGNED";
export type LeaveCategory = "ANNUAL" | "SICK" | "REFRESH" | "OTHER";
export type LeaveDurationType = "FULL_DAY" | "AM_HALF" | "PM_HALF";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

export interface OrganizationOwnerInfo {
  id: string;
  name: string;
  email?: string;
  profile_image?: string | null;
}

export interface OrganizationSimple {
  id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  owner: OrganizationOwnerInfo;
  member_count: number;
  board_count: number;
  my_role: OrgRole;
  created_at: string;
  current_plan?: string; // "FREE" | "TEAM"
  subscription_status?: string; // "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED"
  trial_ends_at?: string | null; // ISO8601
  can_create_org_board?: boolean;
  can_access_hr_features?: boolean;
  hr_system_enabled?: boolean;
  auto_board_access_enabled?: boolean;
}

export interface OrganizationDetail extends OrganizationSimple {
  updated_at?: string;
  my_member_id?: string;
}

export interface OrgDepartment {
  id: string;
  name: string;
  display_order: number;
  parent_department_id: string | null;
  leader_id: string | null;
  leader_name: string | null;
  leader_profile_image: string | null;
  description: string | null;
  created_at: string;
}

export interface OrgJobGroup {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface OrgPosition {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface OrgTitle {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface OrgGrade {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface OrgStructureSettings {
  departments_enabled: boolean;
  job_groups_enabled: boolean;
  positions_enabled: boolean;
  titles_enabled: boolean;
  grades_enabled: boolean;
}

export interface OrgStructureData {
  settings: OrgStructureSettings;
  departments: OrgDepartment[];
  job_groups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
}

export interface OrgMemberUserInfo {
  id: string;
  name: string;
  email: string;
  profile_image?: string | null;
}

export interface OrgMemberDepartmentInfo {
  id: string;
  name: string;
}

export interface OrgMemberJobGroupInfo {
  id: string;
  name: string;
}

export interface OrgMemberPositionInfo {
  id: string;
  name: string;
}

export interface OrgMemberTitleInfo {
  id: string;
  name: string;
}

export interface OrgMemberGradeInfo {
  id: string;
  name: string;
}

export interface OrgMemberConcurrentDeptInfo {
  id: string;
  department: OrgMemberDepartmentInfo;
  position?: OrgMemberPositionInfo | null;
  display_order: number;
}

export interface OrgMemberSimple {
  id: string;
  user: OrgMemberUserInfo;
  role: OrgRole;
  department?: OrgMemberDepartmentInfo | null;
  job_group?: OrgMemberJobGroupInfo | null;
  position?: OrgMemberPositionInfo | null;
  title?: OrgMemberTitleInfo | null;
  grade?: OrgMemberGradeInfo | null;
  job_title?: string | null;
  contract_type: ContractType;
  work_status: WorkStatus;
  hire_date?: string | null;
  joined_at: string;
}

export interface OrgMemberDetail extends OrgMemberSimple {
  employee_id?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  bio?: string | null;
  tenure_months: number;
  invited_by?: OrgMemberUserInfo | null;
  concurrent_depts?: OrgMemberConcurrentDeptInfo[] | null;
}

// Member Detail - Board Info
export interface OrgMemberBoard {
  id: string;
  name: string;
  description?: string | null;
  owner_name: string;
  member_count: number;
  created_at: string;
}

// Organization Member History
export interface OrgMemberHistoryItem {
  id: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  title_id: string | null;
  title_name: string | null;
  grade_id: string | null;
  grade_name: string | null;
  job_group_id: string | null;
  job_group_name: string | null;
  job_title: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  duration_months: number | null;
  description: string | null;
  source: "AUTO" | "MANUAL";
  created_by_id: string | null;
  created_at: string;
}

export interface OrgMemberHistoryCreateRequest {
  effective_start_date?: string;
  department_id?: string | null;
  position_id?: string | null;
  title_id?: string | null;
  grade_id?: string | null;
  job_group_id?: string | null;
  job_title?: string | null;
  description?: string | null;
}

export interface OrgMemberPageResponse {
  content: OrgMemberSimple[];
  total_elements: number;
  total_pages: number;
  page: number;
  size: number;
}

export interface OrgMemberInviteResult {
  type: "direct_add" | "email_sent";
  member?: OrgMemberSimple;
  email?: string;
  role?: OrgRole;
}

export interface OrgMemberRemoveResult {
  removed_member: {
    id: string;
    name: string;
  };
  cascade_removed_from_boards: Array<{
    board_id: string;
    board_name: string;
  }>;
}

export interface OrgInviteLink {
  id: string;
  code: string;
  role: OrgRole;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  is_active: boolean;
  invite_url?: string;
  created_at: string;
}

export interface OrgInvitePublicInfo {
  organization_name: string;
  logo_url?: string | null;
  member_count: number;
  role: OrgRole;
}

// ========================================
// Organization Announcement & Activity
// ========================================

export interface OrgAnnouncement {
  id: string;
  author_name: string;
  author_profile_image: string | null;
  title: string;
  content: string | null;
  is_pinned: boolean;
  comment_count: number;
  attachments?: OrgAnnouncementAttachment[];
  created_at: string;
  updated_at: string;
}

export interface OrgAnnouncementAttachment {
  id: string;
  file_name: string;
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  file_size: number;
  created_at: string;
}

export interface OrgAnnouncementListResponse {
  announcements: OrgAnnouncement[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface OrgAnnouncementComment {
  id: string;
  announcement_id: string;
  author_name: string;
  author_profile_image: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface OrgAnnouncementCommentListResponse {
  comments: OrgAnnouncementComment[];
  total_count: number;
}

export type OrgActivityType =
  | "MEMBER_JOINED"
  | "MEMBER_LEFT"
  | "MEMBER_ROLE_CHANGED"
  | "BOARD_ADDED"
  | "BOARD_REMOVED"
  | "BOARD_CREATED"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "ANNOUNCEMENT_POSTED"
  | "ANNIVERSARY_CELEBRATED";

export interface OrgActivity {
  id: string;
  actor_name: string;
  activity_type: OrgActivityType;
  target_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface OrgActivityListResponse {
  activities: OrgActivity[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface OrgBoardSimple {
  id: string;
  name: string;
  description?: string | null;
  owner: { id: string; name: string };
  member_count: number;
  tier?: string;
  created_at: string;
  total_minutes: number;
  monthly_minutes: number;
  members: Array<{
    id: string;
    name: string;
    profile_image: string | null;
  }>;
  weekly_times: Array<{
    week_start: string;
    minutes: number;
  }>;
}

export interface OrgBoardEligibilityCheck {
  board_id: string;
  board_name: string;
  is_eligible: boolean;
  total_members: number;
  non_org_members: Array<{
    user_id: string;
    name: string;
    email: string;
  }>;
}

// ========================================
// Leave (휴가)
// ========================================

export interface LeavePolicy {
  id: string;
  name: string;
  leave_category: LeaveCategory;
  default_days: number;
  is_paid: boolean;
  requires_approval: boolean;
  description?: string | null;
  display_order?: number;
  is_active: boolean;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  policy_id: string;
  policy_name: string;
  leave_category: LeaveCategory;
  year: number;
  total_days: number;
  used_days: number;
  remaining: number;
  is_active: boolean;
}

export interface LeaveRequestRequester {
  member_id: string;
  name: string;
  email: string;
  department_name?: string | null;
}

export interface LeaveRequestReviewer {
  member_id: string;
  name: string;
}

export interface LeaveRequestPolicyInfo {
  id: string;
  name: string;
  leave_category: LeaveCategory;
}

export interface LeaveRequestResponse {
  id: string;
  requester: LeaveRequestRequester;
  policy: LeaveRequestPolicyInfo;
  start_date: string;
  end_date: string;
  duration_type: LeaveDurationType;
  total_days: number;
  reason?: string | null;
  status: LeaveStatus;
  reviewer?: LeaveRequestReviewer | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  created_at: string;
}

export interface LeaveRequestPageResponse {
  content: LeaveRequestResponse[];
  total_elements: number;
  total_pages: number;
  page: number;
  size: number;
}

// ─── Leave Balance Adjustments ───

export type LeaveAdjustmentType =
  | "GRANT"
  | "REVOKE"
  | "MANUAL_ADJUST"
  | "ANNUAL_INIT";

export interface LeaveBalanceAdjustmentResponse {
  id: string;
  member_name: string | null;
  member_email: string | null;
  policy_name: string;
  leave_category: LeaveCategory;
  adjustment_type: LeaveAdjustmentType;
  days: number;
  previous_total: number;
  new_total: number;
  reason: string;
  granted_by_name: string | null;
  created_at: string;
}

export interface LeaveAdjustmentPageResponse {
  content: LeaveBalanceAdjustmentResponse[];
  total_elements: number;
  total_pages: number;
  page: number;
  size: number;
}

// ─── Organization Onboarding ───

export interface OnboardingTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  auto_assign: boolean;
  target_department: { id: string; name: string } | null;
  target_job_group: { id: string; name: string } | null;
  is_active: boolean;
  item_count: number;
  display_order: number;
}

export interface OnboardingTemplateDetail extends OnboardingTemplateSummary {
  items: OnboardingTemplateItemDetail[];
}

export interface OnboardingTemplateItemDetail {
  id: string;
  title: string;
  description: string | null;
  due_day_offset: number | null;
  assignee_role: string | null;
  display_order: number;
}

export interface OnboardingInstanceSummary {
  id: string;
  member_id: string;
  member_name: string;
  member_profile_image_url: string | null;
  template_name: string;
  total_items: number;
  completed_items: number;
  progress_percent: number;
  status: string;
  started_at: string;
  next_item: { title: string; due_date: string | null } | null;
}

export interface OnboardingInstanceItemDetail {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
  display_order: number;
}

export interface OnboardingToggleResult {
  is_completed: boolean;
  completed_at: string | null;
  instance_progress: {
    completed_items: number;
    total_items: number;
    progress_percent: number;
    status: string;
  };
}

// ─── Organization Chart ───

export interface OrgChartMemberNode {
  id: string;
  user_name: string;
  profile_image_url: string | null;
  job_title: string | null;
  contract_type: string | null;
  work_status: string | null;
  manager_id: string | null;
  job_group_id: string | null;
  job_group_name: string | null;
  reports: OrgChartMemberNode[];
}

export interface OrgChartLeaderInfo {
  member_id: string;
  user_name: string;
  profile_image_url: string | null;
  job_title: string | null;
}

export interface OrgChartDepartmentNode {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  parent_department_id: string | null;
  member_count: number;
  total_member_count: number;
  child_dept_count: number;
  leader: OrgChartLeaderInfo | null;
  children: OrgChartDepartmentNode[];
  members: OrgChartMemberNode[];
}

export interface OrgChartData {
  organization_name: string;
  total_members: number;
  departments: OrgChartDepartmentNode[];
  unassigned: OrgChartMemberNode[];
}

// ─── Organization Insights ───

export interface OrgInsightsSummary {
  period: { start_date: string; end_date: string };
  total_work_minutes: number;
  previous_total_work_minutes: number;
  change_percentage: number;
  active_members: number;
  total_members: number;
  completed_tasks: number;
  active_boards: number;
  total_boards: number;
}

export interface OrgMemberContribution {
  member: {
    id: string;
    user_id: string;
    name: string;
    profile_image: string | null;
    department: string | null;
    job_group: string | null;
    job_title: string | null;
  };
  total_work_minutes: number;
  previous_work_minutes: number;
  change_percentage: number;
  completed_tasks: number;
  activity_count: number;
  primary_board: { id: string; name: string } | null;
  board_breakdown: {
    board_id: string;
    board_name: string;
    work_minutes: number;
    percentage: number;
  }[];
}

export interface OrgMemberContributionDetail {
  member: {
    id: string;
    name: string;
    profile_image: string | null;
    department: string | null;
    job_group: string | null;
    job_title: string | null;
  };
  total_work_minutes: number;
  completed_tasks: number;
  activity_count: number;
  board_details: {
    board_id: string;
    board_name: string;
    work_minutes: number;
    completed_tasks: number;
    top_features: { id: string; title: string; work_minutes: number }[];
  }[];
  weekly_trend: {
    week_start: string;
    work_minutes: number;
    completed_tasks: number;
  }[];
}

export interface OrgBoardResource {
  board: { id: string; name: string; owner_name: string };
  total_work_minutes: number;
  org_share_percentage: number;
  contributor_count: number;
  completed_tasks: number;
  feature_progress: number;
  top_contributors: {
    member_id: string;
    name: string;
    profile_image: string | null;
    work_minutes: number;
    percentage: number;
  }[];
  weekly_trend: { week_start: string; work_minutes: number }[];
}

export interface OrgBoardResourceResponse {
  boards: OrgBoardResource[];
  resource_distribution: {
    total_work_minutes: number;
    weekly_trend: {
      week_start: string;
      boards: { board_id: string; board_name: string; work_minutes: number }[];
    }[];
  };
}

// ─── Organization Anniversary & Celebrations ───

export type AnniversaryType = "BIRTHDAY" | "HIRE_ANNIVERSARY";
export type NotifyTiming = "SAME_DAY" | "DAY_BEFORE" | "THREE_DAYS_BEFORE";
export type AnniversaryDashboardRange = "THIS_WEEK" | "THIS_MONTH";

export interface AnniversaryItem {
  member_id: string;
  member_name: string;
  profile_image_url: string | null;
  department_name: string | null;
  type: AnniversaryType;
  date: string;
  years: number | null;
  message_count: number;
}

export interface UpcomingAnniversaries {
  today: AnniversaryItem[];
  this_week: AnniversaryItem[];
  this_month: AnniversaryItem[];
}

export interface CelebrationMessage {
  id: string;
  author_name: string;
  author_profile_image_url: string | null;
  message: string;
  created_at: string;
}

export interface AnniversarySettings {
  id: string;
  birthday_enabled: boolean;
  hire_anniversary_enabled: boolean;
  notify_timing: NotifyTiming;
  dashboard_range: AnniversaryDashboardRange;
}

// ─── Organization 1:1 Meeting Notes ───

export type OneOnOneRecurrenceType = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "NONE";

export interface OneOnOneMemberInfo {
  id: string;
  user_id: string;
  name: string;
  profile_image_url: string | null;
  job_title: string | null;
  department_name: string | null;
}

export interface OneOnOneSummary {
  id: string;
  member_a: OneOnOneMemberInfo;
  member_b: OneOnOneMemberInfo;
  recurrence_type: OneOnOneRecurrenceType | null;
  recurrence_day: number | null;
  next_meeting_date: string | null;
  active: boolean;
  meeting_count: number;
  created_at: string;
}

export interface OneOnOneActionItemDetail {
  id: string;
  title: string;
  assignee_id: string | null;
  assignee_name: string | null;
  completed: boolean;
  completed_at: string | null;
  display_order: number;
}

export interface OneOnOneMeetingDetail {
  id: string;
  meeting_date: string;
  agenda: string | null;
  notes: string | null;
  action_items: OneOnOneActionItemDetail[];
  created_by_name: string;
  created_at: string;
}

export interface OneOnOneMeetingListResponse {
  meetings: OneOnOneMeetingDetail[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface OneOnOneOpenActionItem {
  id: string;
  title: string;
  assignee_name: string | null;
  meeting_date: string;
  created_at: string;
}

// ─── Organization Attendance & Time Tracking ───

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_LEAVE"
  | "HALF_DAY"
  | "WEEKEND"
  | "HOLIDAY";

export interface AttendanceRecordDetail {
  id: string;
  record_date: string;
  clock_in: string | null;
  clock_out: string | null;
  work_minutes: number | null;
  status: AttendanceStatus;
  is_late: boolean;
  is_auto_clocked_out: boolean;
  note: string | null;
  leave_info: {
    policy_name: string;
    duration_type: string;
  } | null;
}

export interface AttendanceMonthlySummary {
  total_work_days: number;
  present_days: number;
  leave_days: number;
  absent_days: number;
  late_count: number;
  total_work_minutes: number;
  avg_work_minutes_per_day: number;
  overtime_minutes: number;
}

export interface AttendanceMyRecordsResponse {
  summary: AttendanceMonthlySummary;
  records: AttendanceRecordDetail[];
}

export interface AttendanceMyTodayRecord {
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
  elapsed_minutes: number | null;
  work_minutes: number | null;
}

export interface AttendanceTodayStatus {
  present_count: number;
  absent_count: number;
  on_leave_count: number;
  full_day_leave_count: number;
  am_half_leave_count: number;
  pm_half_leave_count: number;
  total_active_members: number;
  my_record: AttendanceMyTodayRecord | null;
}

export interface AttendanceTeamMemberSummary {
  member_id: string;
  member_name: string;
  department_name: string | null;
  total_work_minutes: number;
  avg_work_minutes_per_day: number;
  late_count: number;
  overtime_minutes: number;
  present_days: number;
  leave_days: number;
  absent_days: number;
}

export interface AttendanceTeamSummaryResponse {
  members: AttendanceTeamMemberSummary[];
}

export interface AttendancePolicyResponse {
  id: string;
  standard_hours: number;
  core_time_start: string | null;
  core_time_end: string | null;
  late_threshold: string | null;
  auto_clock_out: boolean;
  auto_clock_out_time: string;
  weekend_days: string;
}

export interface AttendanceHolidayResponse {
  id: string;
  holiday_date: string;
  name: string;
  is_recurring: boolean;
}

// ─── Today Members (attendance modal) ───

export interface AttendancePresentMember {
  member_id: string;
  name: string;
  profile_image: string | null;
  department_name: string | null;
  clock_in: string | null;
  clock_out: string | null;
  elapsed_minutes: number | null;
  late: boolean;
}

export interface AttendanceAbsentMember {
  member_id: string;
  name: string;
  profile_image: string | null;
  department_name: string | null;
}

export interface AttendanceLeaveMember {
  member_id: string;
  name: string;
  profile_image: string | null;
  department_name: string | null;
  duration_type: "FULL_DAY" | "AM_HALF" | "PM_HALF";
}

export interface AttendanceTodayMembers {
  present_members: AttendancePresentMember[];
  absent_members: AttendanceAbsentMember[];
  leave_members: AttendanceLeaveMember[];
}

// ========================================
// Cross-Domain Integration (v10.0)
// ========================================

// Feature #2: 통합 투데이 뷰
export interface BoardTaskItem {
  type: "CHECKLIST" | "DAILY_CHECKLIST" | "MEETING";
  checklist_item_id?: string;
  daily_checklist_id?: string;
  meeting_id?: string;
  title: string;
  task_title?: string;
  feature_title?: string;
  feature_color?: string;
  due_date?: string | null;
  is_completed?: boolean;
  start_time?: string;
  end_time?: string;
}

export interface BoardTaskGroup {
  board_id: string;
  board_name: string;
  board_emoji?: string;
  items: BoardTaskItem[];
  pending_count: number;
  completed_today_count: number;
}

export interface BoardTasksData {
  boards: BoardTaskGroup[];
  total_pending: number;
  total_completed_today: number;
}

// Feature #3: 크로스 캘린더
export interface UnifiedCalendarEvent {
  source: "MEETING" | "SCHEDULE_BLOCK" | "ANNIVERSARY" | "LEAVE";
  board_id?: string;
  board_name?: string;
  org_id?: string;
  org_name?: string;
  meeting_id?: string;
  schedule_block_id?: string;
  title: string;
  task_title?: string;
  event_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  color: string;
  anniversary_type?: string;
  leave_type?: string;
}

export interface UnifiedCalendarData {
  personal_events: PersonalEvent[];
  board_events: UnifiedCalendarEvent[];
  org_events: UnifiedCalendarEvent[];
}

// Feature #7: 오늘의 축하
export interface CelebrationItem {
  org_id: string;
  org_name: string;
  member_user_id: string;
  member_name: string;
  member_profile_image?: string | null;
  type: "BIRTHDAY" | "HIRE_ANNIVERSARY";
  message_template: string;
  can_send_message: boolean;
  already_sent: boolean;
}

export interface CelebrationsData {
  celebrations: CelebrationItem[];
}

// Feature #9: AI 다이어리 업무 회고
export interface BoardCompletedItem {
  type: "CHECKLIST_ITEM";
  title: string;
  task_title: string;
  feature_title?: string;
  completed_at: string;
}

export interface BoardCompletedGroup {
  board_name: string;
  board_emoji?: string;
  items: BoardCompletedItem[];
}

export interface PersonalCompletedItem {
  title: string;
  type: "HABIT" | "TASK";
  completed_at: string;
}

export interface DiaryWorkContextWeeklySummary {
  total_completed: number;
  previous_week_completed: number;
  change_percentage: number;
  most_active_board?: string;
  habit_streak_highlights?: { habit_title: string; current_streak: number }[];
}

export interface DiaryWorkContextData {
  date: string;
  completed_today: BoardCompletedGroup[];
  personal_completed_today: PersonalCompletedItem[];
  weekly_summary: DiaryWorkContextWeeklySummary | null;
}

// ===== OKR Types =====

export interface OkrCycle {
  id: string;
  organization_id: string;
  name: string;
  cycle_type: string; // QUARTERLY | HALF_YEARLY | YEARLY | CUSTOM
  start_date: string;
  end_date: string;
  status: string; // PLANNING | ACTIVE | REVIEW | CLOSED
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OkrObjective {
  id: string;
  cycle_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  level: string; // COMPANY | DEPARTMENT | INDIVIDUAL
  department_id: string | null;
  department_name: string | null;
  owner: OkrMemberInfo | null;
  parent_objective_id: string | null;
  progress: number;
  confidence: string; // ON_TRACK | AT_RISK | OFF_TRACK
  sort_order: number;
  key_results: OkrKeyResult[];
  children: OkrObjective[];
  created_at: string;
  updated_at: string;
}

export interface OkrKeyResult {
  id: string;
  objective_id: string;
  title: string;
  description: string | null;
  metric_type: string; // PERCENTAGE | NUMBER | CURRENCY | BOOLEAN | MILESTONE
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string | null;
  owner: OkrMemberInfo | null;
  weight: number;
  linked_board_id: string | null;
  sort_order: number;
  last_checkin_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OkrCheckIn {
  id: string;
  key_result_id: string;
  previous_value: number;
  new_value: number;
  confidence: string;
  note: string | null;
  author: OkrMemberInfo;
  created_at: string;
}

export interface OkrMemberInfo {
  id: string;
  user_name: string;
  profile_image_url: string | null;
}

export interface OkrTreeData {
  cycle: OkrCycle;
  overall_progress: number;
  total_objectives: number;
  total_key_results: number;
  objectives: OkrObjective[];
}

// ===== Org Subscription Types =====

export type OrgPlan = "FREE" | "TEAM";

export interface OrgSubscription {
  id: string;
  organization_id: string;
  plan: OrgPlan;
  status: string;
  billing_cycle: string | null;
  seat_count: number;
  active_member_count: number;
  price_per_seat: number;
  total_price: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_at: string | null;
  trial_ends_at: string | null;
  board_limit: number;
  board_count: number;
  member_limit: number;
  can_access_premium_board_features: boolean;
  can_access_hr_features: boolean;
  can_read_hr_data: boolean;
  can_create_org_board: boolean;
  trial_used: boolean;
  cancel_requested_at?: string | null;
  // AI Credit Pool
  monthly_ai_credits?: number;
  monthly_credits_used?: number;
  total_available_credits?: number;
  credits_reset_date?: string | null;
  credit_warning_level?: "LOW" | "CRITICAL" | "EXHAUSTED" | null;
}

export interface MigrationPreview {
  current_total_monthly: number;
  new_monthly: number;
  credit_from_existing: number;
  first_payment: number;
  unique_members: number;
}

// ===== Photo Gallery (v14.0) =====

export type PhotoShareLinkType = "VIEW" | "UPLOAD";
export type PhotoShareLinkStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface PhotoShareLink {
  id: string;
  link_type: PhotoShareLinkType;
  token: string;
  tab_id: string | null;
  tab_name: string | null;
  title: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_by: {
    id: string;
    name: string;
    email: string;
    profile_image_url: string | null;
  } | null;
  created_at: string;
  status: PhotoShareLinkStatus;
}

export interface PhotoShareLinkCreatePayload {
  tab_id?: string | null;
  link_type: PhotoShareLinkType;
  expires_in_days?: number | null;
  title?: string | null;
}

export interface OrgPhotoTab {
  id: string;
  name: string;
  description: string | null;
  photo_count: number;
  cover_photo_url: string | null;
  sort_order: number;
  is_shared: boolean;
  share_token: string | null;
  is_upload_enabled: boolean;
  upload_token: string | null;
  upload_token_expires_at: string | null;
  created_by: {
    id: string;
    name: string;
    email: string;
    profile_image_url: string | null;
  };
  created_at: string;
}

export interface OrgPhoto {
  id: string;
  tab_id: string;
  s3_key: string;
  thumbnail_key: string | null;
  url: string;
  thumbnail_url: string | null;
  original_filename: string;
  file_size: number;
  content_type: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  uploaded_by: {
    id: string;
    name: string;
    email: string;
    profile_image_url: string | null;
  };
  created_at: string;
}

export interface OrgPhotoPage {
  photos: OrgPhoto[];
  next_cursor: string | null;
  has_next: boolean;
  total_count: number;
}

export interface SharedGalleryInfo {
  gallery_title: string | null;
  organization_name: string;
  organization_logo_url: string | null;
  albums: SharedAlbumSummary[];
  total_photo_count: number;
}

export interface SharedAlbumSummary {
  id: string;
  name: string;
  description: string | null;
  photo_count: number;
  cover_photo_url: string | null;
}

export interface UploadAlbumInfo {
  album_name: string;
  album_description: string | null;
  organization_name: string;
  organization_logo_url: string | null;
  expires_at: string;
}

export interface GalleryUploadInfo {
  organization_name: string;
  organization_logo_url: string | null;
  albums: SharedAlbumSummary[];
  expires_at: string;
}

/** @deprecated kept for per-album share backward compat */
export interface SharedAlbumInfo {
  album_name: string;
  album_description: string | null;
  photo_count: number;
  cover_photo_url: string | null;
  organization_name: string;
  organization_logo_url: string | null;
}

export interface SharedPhotoItem {
  id: string;
  url: string;
  thumbnail_url: string | null;
  original_filename: string;
  file_size: number;
  content_type: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  created_at: string;
}

export interface SharedPhotoPage {
  photos: SharedPhotoItem[];
  next_cursor: string | null;
  has_next: boolean;
  total_count: number;
}

// ========================================
// Trash (휴지통)
// ========================================

export interface TrashFeatureItem {
  id: string;
  title: string;
  description: string | null;
  total_tasks: number;
  completed_tasks: number;
  deleted_at: string;
  deleted_by: string | null;
}

export interface TrashTaskItem {
  id: string;
  title: string;
  feature_id: string | null;
  feature_title: string | null;
  deleted_at: string;
  deleted_by: string | null;
  part_of_deleted_feature: boolean;
}

export interface TrashChecklistItemEntry {
  id: string;
  title: string;
  task_id: string | null;
  task_title: string | null;
  deleted_at: string;
  deleted_by: string | null;
  part_of_deleted_parent: boolean;
}

export interface TrashListResponse {
  features: TrashFeatureItem[];
  tasks: TrashTaskItem[];
  checklist_items: TrashChecklistItemEntry[];
  retention_days: number;
}
