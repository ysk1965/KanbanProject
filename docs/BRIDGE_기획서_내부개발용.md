# BRIDGE - 기술 기획서 (내부 개발 참조용)

> **시스템 아키텍처 & 도메인 상세 명세**
> 최종 업데이트: 2026-02-14 | 코드베이스 실측 기반

---

## 목차

1. [시스템 아키텍처 개요](#1-시스템-아키텍처-개요)
2. [기술 스택 상세](#2-기술-스택-상세)
3. [도메인 모델 & 엔티티](#3-도메인-모델--엔티티)
4. [API 엔드포인트 전체 목록](#4-api-엔드포인트-전체-목록)
5. [인증 & 보안](#5-인증--보안)
6. [실시간 동기화 (WebSocket)](#6-실시간-동기화-websocket)
7. [AI 서비스 아키텍처](#7-ai-서비스-아키텍처)
8. [구독 & 결제 시스템](#8-구독--결제-시스템)
9. [알림 시스템](#9-알림-시스템)
10. [파일 업로드 시스템](#10-파일-업로드-시스템)
11. [프론트엔드 아키텍처](#11-프론트엔드-아키텍처)
12. [인프라 & 배포](#12-인프라--배포)
13. [모니터링 & 운영](#13-모니터링--운영)
14. [코딩 규칙 & 컨벤션](#14-코딩-규칙--컨벤션)
15. [DB 마이그레이션 이력](#15-db-마이그레이션-이력)

---

## 1. 시스템 아키텍처 개요

### 1.1 전체 구조

```
                              ┌─────────────────────┐
                              │     CloudFront       │
                              │     (CDN/SSL)        │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                                         ▼
           ┌───────────────┐                        ┌───────────────┐
           │  S3 Bucket    │                        │     ALB       │
           │  (React SPA)  │                        │ (Load Balancer)│
           └───────────────┘                        └───────┬───────┘
                                                            │
                                                   ┌───────▼───────┐
                                                   │ Elastic       │
                                                   │ Beanstalk     │
                                                   │ (Spring Boot) │
                                                   │ 2~4 instances │
                                                   └───┬───┬───┬───┘
                                                       │   │   │
                                          ┌────────────┘   │   └────────────┐
                                          ▼                ▼                ▼
                                   ┌────────────┐  ┌────────────┐  ┌────────────┐
                                   │  Aurora     │  │   Redis    │  │   S3       │
                                   │ Serverless  │  │ ElastiCache│  │  (Files)   │
                                   │  v2 (PG)   │  │  (Cache)   │  │            │
                                   └────────────┘  └────────────┘  └────────────┘
```

### 1.2 레이어 아키텍처 (Backend)

```
HTTP Request
    │
    ▼
┌──────────────────────────────────────────────────┐
│  Filter Chain                                     │
│  RateLimitingFilter → JwtAuthenticationFilter     │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│  Controller Layer (@RestController)               │
│  요청 검증, DTO 변환, 응답 반환                      │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│  Service Layer (@Service, @Transactional)         │
│  비즈니스 로직, 도메인 규칙 적용                      │
│  FacadeService: 복합 로직 (Board, Schedule)        │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│  Repository Layer (Spring Data JPA)               │
│  JPQL 쿼리, EntityGraph, Specification            │
└──────────────────────┬───────────────────────────┘
                       ▼
                   Database
```

### 1.3 패키지 구조 (Backend)

```
com.kanban/
├── domain/                          # 31개 도메인 패키지
│   ├── auth/                        # 인증 (JWT, OAuth2)
│   │   ├── controller/AuthController
│   │   ├── dto/ (LoginRequest, SignupRequest, TokenResponse, ...)
│   │   ├── service/AuthService
│   │   └── security/ (JwtProvider, JwtAuthenticationFilter, RateLimitingFilter)
│   ├── user/                        # 사용자 관리
│   │   ├── entity/ (User, RefreshToken, EmailVerificationToken, PasswordResetToken)
│   │   ├── controller/UserController
│   │   ├── service/UserService
│   │   └── repository/
│   ├── board/                       # 보드
│   │   ├── entity/ (Board, BoardMember, BoardCustomEmoji, UserBoardStar)
│   │   ├── controller/ (BoardController, BoardCustomEmojiController)
│   │   ├── service/ (BoardService, BoardFacadeService, BoardCustomEmojiService)
│   │   └── repository/
│   ├── block/                       # 칸반 블록(컬럼)
│   │   ├── entity/ (Block, BlockType, FixedBlockType)
│   │   ├── controller/BlockController
│   │   └── service/BlockService
│   ├── feature/                     # 피처(에픽)
│   │   ├── entity/ (Feature, FeatureStatus, FeatureTag)
│   │   ├── controller/FeatureController
│   │   └── service/FeatureService
│   ├── task/                        # 태스크
│   │   ├── entity/ (Task, TaskTag)
│   │   ├── controller/TaskController
│   │   └── service/TaskService
│   ├── comment/                     # 댓글 + 리액션
│   │   ├── entity/ (Comment, CommentAttachment, CommentReaction)
│   │   ├── controller/ (CommentController, BoardCommentController)
│   │   └── service/CommentService
│   ├── checklist/                   # 체크리스트
│   │   ├── entity/ChecklistItem
│   │   ├── controller/ (ChecklistController, BoardChecklistController)
│   │   └── service/ChecklistService
│   ├── dailychecklist/              # 일일 체크리스트
│   ├── schedule/                    # 일정 관리 (Premium)
│   │   ├── entity/ScheduleBlock
│   │   ├── controller/ScheduleController
│   │   └── service/ (ScheduleService, ScheduleFacadeService)
│   ├── meeting/                     # 미팅 (AI 전사/요약)
│   │   ├── entity/Meeting
│   │   ├── controller/MeetingController
│   │   └── service/ (MeetingService, MeetingTranscriptionService, MeetingAIService)
│   ├── note/                        # 노트 (폴더/문서, CRDT)
│   │   ├── entity/ (Note, NoteVersion, NoteTag, NoteCollabState)
│   │   ├── controller/ (NoteController, NoteTagController)
│   │   └── service/ (NoteService, NoteAIService, NoteCollabService)
│   ├── notification/                # 알림
│   │   ├── entity/ (Notification, NotificationPreference)
│   │   ├── controller/ (NotificationController, NotificationPreferenceController)
│   │   └── service/ (NotificationService, NotificationPreferenceService)
│   ├── integration/slack/           # Slack 연동
│   │   ├── entity/MemberSlackWebhook
│   │   ├── controller/SlackWebhookController
│   │   └── service/ (SlackNotificationService, SlackWebhookService)
│   ├── subscription/                # 구독/결제
│   │   ├── entity/ (Subscription, PaymentHistory, AiCreditPurchase, PricingPlan)
│   │   ├── controller/ (SubscriptionController, AiCreditController)
│   │   └── service/ (SubscriptionService, AiCreditService, TossPaymentsService)
│   ├── statistics/                  # 통계
│   ├── report/                      # AI 주간 리포트
│   │   ├── entity/WeeklyReport
│   │   └── service/ (ReportService, ReportAIService)
│   ├── member/                      # 보드 멤버
│   ├── invite/                      # 초대 링크
│   ├── admin/                       # 시스템 관리
│   ├── activity/                    # 활동 로그
│   ├── announcement/                # 공지사항
│   ├── inquiry/                     # 문의
│   ├── milestone/                   # 마일스톤
│   ├── tag/                         # 태그
│   ├── weight/                      # 작업 가중치
│   └── standup/                     # 스탠드업 설정
│
└── global/                          # 공통 인프라
    ├── config/                      # SecurityConfig, JacksonConfig, CacheConfig, S3Config, AIConfig, WebSocketConfig
    ├── security/                    # CORS, Filter Chain
    ├── filter/                      # ActivityTrackingFilter
    ├── exception/                   # GlobalExceptionHandler, BusinessException, ErrorCode
    ├── email/                       # EmailService (Thymeleaf templates)
    ├── scheduler/                   # DailyStandupScheduler, MonitoringScheduler, CleanupSchedulers
    ├── file/                        # FileUploadService, S3FileUploadService, VideoThumbnailService
    ├── monitoring/                  # CloudWatchConfig, MonitoringScheduler
    └── ai/                          # AIProvider, ClaudeAIProvider, OpenAIProvider
```

---

## 2. 기술 스택 상세

### 2.1 Backend

| 기술 | 버전 | 설정 파일 |
|------|------|-----------|
| Spring Boot | 3.4.1 | `build.gradle` |
| Java | 21 | Gradle toolchain |
| Spring Security | 6.x | `SecurityConfig.java` |
| Spring Data JPA | 3.x | `application.yml` |
| Spring WebSocket | STOMP | `WebSocketConfig.java` |
| PostgreSQL | 15 | `docker-compose.yml` |
| H2 (Local) | embedded | `application-local.yml` |
| Redis | 7 | `docker-compose.yml` |
| jjwt | 0.12.6 | JWT 인증 |
| Flyway | auto | DB 마이그레이션 (V1~V33) |
| Bucket4j | 8.0.1 | Rate Limiting |
| AWS SDK | 2.25.0 | S3, CloudWatch |
| Sentry | 7.3.0 | 에러 추적 |
| Thumbnailator | 0.4.20 | 이미지 썸네일 |
| FFmpeg | 0.8.0 | 비디오 썸네일 |
| Google API Client | 2.2.0 | Google OAuth2 |

### 2.2 Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| TypeScript | 5.5.0 | 타입 안전성 |
| Vite | 6.3.5 | 빌드 도구 |
| React Router | 7.12.0 | 라우팅 |
| Tailwind CSS | 4.1.12 | 유틸리티 CSS |
| Radix UI | Latest | 접근성 UI (48개 컴포넌트) |
| Framer Motion | 12.26.1 | 애니메이션 |
| React Hook Form | 7.55.0 | 폼 관리 |
| @dnd-kit | Latest | 드래그 앤 드롭 |
| @stomp/stompjs | 7.3.0 | WebSocket 클라이언트 |
| Yjs | 13.6.29 | CRDT 동시 편집 |
| BlockNote | 0.28.0 | 블록 에디터 |
| i18next | 25.8.4 | 국제화 (10개국어) |
| date-fns | 3.6.0 | 날짜 유틸리티 |
| Recharts | 2.15.2 | 차트 |
| Firebase | 10.8.0 | Analytics |
| Sentry | 8.0.0 | 에러 추적 |
| Three.js | 0.182.0 | 3D 랜딩 |
| @tosspayments/sdk | 2.5.0 | 결제 |
| Lucide React | 0.487.0 | 아이콘 |

### 2.3 Infrastructure

| 기술 | 버전 | 용도 |
|------|------|------|
| Terraform | 1.6.0 | IaC (9개 모듈) |
| GitHub Actions | - | CI/CD (4개 워크플로우) |
| Docker | Multi-stage | 컨테이너화 |
| AWS VPC | - | 네트워크 격리 |
| AWS ALB | - | 로드 밸런싱 |
| Elastic Beanstalk | - | 앱 배포 |
| Aurora Serverless v2 | - | 프로덕션 DB |
| ElastiCache | Redis 7 | 프로덕션 캐시 |
| S3 + CloudFront | - | 정적 파일 + CDN |
| Route 53 | - | DNS |
| ACM | - | SSL/TLS |
| CloudWatch | - | 로그/메트릭 |

---

## 3. 도메인 모델 & 엔티티

### 3.1 핵심 엔티티 관계

```
User (1) ─────── (N) BoardMember (N) ─────── (1) Board
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                                  Block          Feature         Subscription
                                    │               │
                                    │    ┌──────────┼──────────┐
                                    │    ▼          ▼          ▼
                                    └─► Task      Tag      Milestone
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                          Comment   ChecklistItem  ScheduleBlock
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              Attachment  Reaction  Notification

Board (1) ──── (N) Meeting
Board (1) ──── (N) Note (self-referencing tree, max depth 4)
Board (1) ──── (N) WeeklyReport
Board (1) ──── (N) ActivityLog
Board (1) ──── (N) MemberSlackWebhook
Board (1) ──── (N) DailyChecklist
Board (1) ──── (N) DailyStandupConfig
Board (1) ──── (N) Announcement (system-wide)
Board (1) ──── (N) Inquiry
```

### 3.2 엔티티 상세

#### User
```java
@Entity @Table(name = "users")
- id: UUID (PK)
- email: String (unique, not null)
- password_hash: String (nullable - Google OAuth 사용자)
- name: String (not null)
- profile_image: String (nullable)
- auth_provider: String ("email" | "GOOGLE")
- auth_provider_id: String (nullable)
- last_login_at: LocalDateTime
- last_active_at: LocalDateTime
- email_verified: boolean (default false)
- email_verified_at: LocalDateTime
- theme: String ("dark" | "light", default "dark")
- system_role: SystemRole (USER | ADMIN)
- is_active: boolean (default true)
- deactivated_at, deactivated_reason: 탈퇴 처리용
```

#### Board
```java
@Entity @Table(name = "boards")
- id: UUID (PK)
- name: String (not null)
- description: String (nullable)
- owner_id: UUID (FK → users)
- work_hours_per_day: int (default 8)
- work_start_time: LocalTime (default 09:00)
- schedule_display_mode: String ("TIME")
- break_start_time, break_end_time: LocalTime
- selected_milestone_id: UUID (nullable)
- tier: BoardTier (TRIAL | STANDARD | PREMIUM)
- trial_ends_at: LocalDateTime
- created_at, updated_at: LocalDateTime (UTC)
```

#### Feature
```java
@Entity @Table(name = "features")
- id: UUID (PK)
- board_id: UUID (FK → boards)
- title: String (not null)
- description: String (nullable)
- color: String (HEX)
- assignee_id: UUID (FK → users, nullable)
- due_date: LocalDate (nullable)
- status: FeatureStatus (ACTIVE | COMPLETED)
- total_tasks, completed_tasks: int
- position: int
- created_by: UUID
- completed_at: LocalDateTime
```

#### Task
```java
@Entity @Table(name = "tasks")
- id: UUID (PK)
- feature_id: UUID (FK → features)
- board_id: UUID (FK → boards)
- block_id: UUID (FK → blocks)
- title: String (not null)
- description: String (nullable)
- start_date, due_date: LocalDate (nullable)
- baseline_start_date, baseline_due_date: LocalDate (nullable)
- estimated_minutes: Integer (nullable)
- is_completed: boolean
- position: int
- created_by: UUID
- completed_at: LocalDateTime
```

#### Block
```java
@Entity @Table(name = "blocks")
- id: UUID (PK)
- board_id: UUID (FK → boards)
- name: String (not null)
- type: BlockType (FIXED | CUSTOM)
- fixed_type: FixedBlockType (FEATURE | TASK | DONE | null)
- color: String (nullable)
- position: int
```

#### Comment
```java
@Entity @Table(name = "comments")
- id: UUID (PK)
- task_id: UUID (FK → tasks)
- board_id: UUID (FK → boards)
- author_id: UUID (FK → users)
- content: String (TEXT)
- mentions: String (comma-separated user IDs)
- attachments: List<CommentAttachment> (cascade)
- reactions: List<CommentReaction> (cascade, BatchSize 100)
```

#### ChecklistItem
```java
@Entity @Table(name = "checklist_items")
- id: UUID (PK)
- task_id: UUID (FK → tasks)
- title: String (not null)
- is_completed: boolean
- assignee_id: UUID (FK → users, nullable)
- start_date, due_date, done_date: LocalDate (nullable)
- position: int
```

#### Meeting
```java
@Entity @Table(name = "meetings")
- id: UUID (PK)
- board_id: UUID (FK → boards)
- title: String
- meeting_date: LocalDate
- start_time, end_time: LocalTime
- memo, transcript, ai_suggestions: String (TEXT)
- color: String (default "#8B5CF6")
- recurrence_rule, recurrence_group_id, recurrence_end_date
- created_by: UUID
```

#### Note
```java
@Entity @Table(name = "notes")
- id: UUID (PK)
- board_id: UUID (FK → boards)
- parent_id: UUID (self-referencing FK, nullable)
- type: NoteType (FOLDER | DOCUMENT)
- title: String
- content: String (TEXT)
- position: int
- depth: int (max 4)
- is_deleted: boolean (soft delete)
- ai_suggestions, ai_content_snapshot: String (TEXT)
- created_by, updated_by: UUID
```

#### Subscription
```java
@Entity @Table(name = "subscriptions")
- id: UUID (PK)
- board_id: UUID (FK → boards, unique)
- status: SubscriptionStatus (TRIAL | ACTIVE | SUSPENDED | CANCELED)
- plan: String (nullable for trial, "PREMIUM" for paid)
- billing_cycle: BillingCycle (MONTHLY | YEARLY)
- price: Integer (cents)
- seat_count: int
- trial_ends_at, current_period_start, current_period_end: LocalDateTime
- monthly_ai_credits, monthly_credits_used, purchased_credits: int
- credits_reset_date: LocalDate
```

#### Notification
```java
@Entity @Table(name = "notifications")
- id: UUID (PK)
- recipient_id: UUID (FK → users, indexed)
- board_id: UUID (FK → boards)
- type: NotificationType (COMMENT_MENTION | CHECKLIST_ASSIGNED | TASK_COMMENT)
- title, message: String
- task_id, comment_id, sender_id: UUID (nullable)
- metadata: String (JSON)
- read_at: LocalDateTime (nullable, indexed)
- created_at: LocalDateTime (indexed)
```

---

## 4. API 엔드포인트 전체 목록

### 4.1 인증 (`/api/v1/auth`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/signup` | 회원가입 (email, password, name) |
| POST | `/login` | 이메일 로그인 |
| POST | `/google` | Google OAuth2 로그인 |
| POST | `/refresh` | 토큰 갱신 |
| POST | `/logout` | 로그아웃 |
| GET | `/me` | 현재 사용자 정보 |
| GET | `/verify-email?token=` | 이메일 인증 |
| POST | `/resend-verification` | 인증 메일 재발송 |
| POST | `/forgot-password` | 비밀번호 리셋 요청 |
| POST | `/reset-password` | 비밀번호 리셋 실행 |

### 4.2 사용자 (`/api/v1/users`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/me` | 내 프로필 |
| PATCH | `/me` | 프로필 수정 |
| PATCH | `/me/password` | 비밀번호 변경 |
| PATCH | `/me/theme` | 테마 변경 |

### 4.3 보드 (`/api/v1/boards`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 내 보드 목록 |
| POST | `/` | 보드 생성 |
| GET | `/{boardId}` | 보드 상세 |
| PATCH | `/{boardId}` | 보드 수정 |
| DELETE | `/{boardId}` | 보드 삭제 |
| POST | `/{boardId}/star` | 즐겨찾기 토글 |
| PATCH | `/{boardId}/settings` | 보드 설정 수정 |
| PATCH | `/{boardId}/milestone` | 선택 마일스톤 변경 |

### 4.4 블록 (`/api/v1/boards/{boardId}/blocks`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 블록 목록 |
| POST | `/` | 커스텀 블록 생성 |
| PATCH | `/{blockId}` | 블록 수정 |
| DELETE | `/{blockId}` | 블록 삭제 |
| PATCH | `/{blockId}/position` | 블록 순서 변경 |

### 4.5 피처 (`/api/v1/boards/{boardId}/features`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 피처 목록 |
| POST | `/` | 피처 생성 |
| GET | `/{featureId}` | 피처 상세 |
| PATCH | `/{featureId}` | 피처 수정 |
| DELETE | `/{featureId}` | 피처 삭제 |
| PATCH | `/{featureId}/position` | 순서 변경 |
| PATCH | `/{featureId}/assignee` | 담당자 변경 |

### 4.6 태스크 (`/api/v1/boards/{boardId}/tasks`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 태스크 목록 |
| POST | `/` | 태스크 생성 |
| GET | `/{taskId}` | 태스크 상세 |
| PATCH | `/{taskId}` | 태스크 수정 |
| DELETE | `/{taskId}` | 태스크 삭제 |
| PATCH | `/{taskId}/move` | 블록 간 이동 |
| PATCH | `/{taskId}/position` | 순서 변경 |
| PATCH | `/{taskId}/feature` | 피처 변경 |
| PATCH | `/{taskId}/dates` | 날짜 변경 |
| POST | `/{taskId}/baseline` | Baseline 저장 |

### 4.7 댓글 (`/api/v1/boards/{boardId}/tasks/{taskId}/comments`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 댓글 목록 |
| POST | `/` | 댓글 작성 |
| PATCH | `/{commentId}` | 댓글 수정 |
| DELETE | `/{commentId}` | 댓글 삭제 |
| POST | `/{commentId}/reactions` | 리액션 추가/제거 |

### 4.8 체크리스트 (`/api/v1/boards/{boardId}/checklists`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/task/{taskId}` | 태스크의 체크리스트 |
| POST | `/` | 아이템 생성 |
| PATCH | `/{itemId}` | 아이템 수정 |
| DELETE | `/{itemId}` | 아이템 삭제 |
| PATCH | `/{itemId}/toggle` | 완료 토글 |
| PATCH | `/{itemId}/assignee` | 담당자 변경 |
| PATCH | `/{itemId}/position` | 순서 변경 |
| POST | `/batch` | 일괄 처리 |

### 4.9 일정 (`/api/v1/boards/{boardId}/schedule-blocks`) [Premium]

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 일정 블록 목록 |
| POST | `/` | 일정 블록 생성 |
| PATCH | `/{blockId}` | 일정 블록 수정 |
| DELETE | `/{blockId}` | 일정 블록 삭제 |

### 4.10 미팅 (`/api/v1/boards/{boardId}/meetings`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 미팅 목록 |
| POST | `/` | 미팅 생성 |
| GET | `/{meetingId}` | 미팅 상세 |
| PATCH | `/{meetingId}` | 미팅 수정 |
| DELETE | `/{meetingId}` | 미팅 삭제 |
| POST | `/{meetingId}/transcribe` | AI 전사 |
| POST | `/{meetingId}/summarize` | AI 요약 |

### 4.11 노트 (`/api/v1/boards/{boardId}/notes`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 노트 트리 |
| POST | `/` | 노트 생성 (FOLDER/DOCUMENT) |
| GET | `/{noteId}` | 노트 상세 |
| PATCH | `/{noteId}` | 노트 수정 |
| DELETE | `/{noteId}` | 노트 삭제 (soft delete) |
| PATCH | `/{noteId}/move` | 노트 이동 |
| GET | `/{noteId}/versions` | 버전 이력 |
| POST | `/{noteId}/ai-suggest` | AI 제안 |

### 4.12 알림 (`/api/v1/notifications`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 알림 목록 |
| GET | `/unread` | 미읽은 알림 (커서 기반 페이징) |
| PATCH | `/{id}/read` | 읽음 처리 |
| PATCH | `/read-all` | 전체 읽음 처리 |

### 4.13 구독 (`/api/v1/subscriptions`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 현재 구독 정보 |
| POST | `/activate` | Premium 활성화 |
| PATCH | `/` | Seat 수 변경 |
| POST | `/cancel` | 구독 취소 |

### 4.14 기타 엔드포인트

| 카테고리 | Base Path | 주요 기능 |
|----------|-----------|-----------|
| 멤버 | `/api/v1/boards/{boardId}/members` | 멤버 관리, 역할, 색상 |
| 초대 | `/api/v1/invites` | 초대 링크 생성/검증 |
| 태그 | `/api/v1/boards/{boardId}/tags` | 태그 CRUD |
| 마일스톤 | `/api/v1/boards/{boardId}/milestones` | 마일스톤 관리 |
| Slack | `/api/v1/slack` | Webhook 등록/해제 |
| AI 크레딧 | `/api/v1/ai-credits` | 잔액 조회, 추가 구매 |
| 리포트 | `/api/v1/reports` | 주간 리포트 생성/조회 |
| 통계 | `/api/v1/statistics` | 보드/개인 통계 |
| 일일체크리스트 | `/api/v1/boards/{boardId}/daily-checklists` | 개인 일일 체크리스트 |
| 파일 | `/api/v1/files` | 업로드/다운로드/삭제 |
| 관리자 | `/api/v1/admin` | 사용자/보드/구독 관리 |
| 시스템 | `/api/v1/system` | 점검 모드, 공지사항 |
| 문의 | `/api/v1/inquiries` | 고객 문의 |
| 공지 | `/api/v1/announcements` | 시스템 공지 |

---

## 5. 인증 & 보안

### 5.1 JWT 인증 흐름

```
[Client]                          [Server]
   │                                  │
   ├──POST /auth/login──────────────►│
   │  { email, password }            │
   │                                  │ BCrypt 검증
   │◄──── TokenResponse ─────────────┤
   │  { access_token (1h),           │
   │    refresh_token (7d),          │
   │    user }                       │
   │                                  │
   ├──GET /api/v1/boards ───────────►│
   │  Authorization: Bearer {token}  │
   │                                  │ JwtAuthenticationFilter 검증
   │◄──── 200 OK ────────────────────┤
   │                                  │
   ├──POST /auth/refresh ───────────►│  (토큰 만료 10분 전 선제 갱신)
   │  { refresh_token }              │
   │◄──── New TokenResponse ─────────┤
```

### 5.2 보안 설정

| 항목 | 설정 |
|------|------|
| 비밀번호 | BCrypt, 최소 8자, 대소문자+숫자+특수문자 필수 |
| JWT Access Token | 1시간 (HMAC SHA) |
| JWT Refresh Token | 7일 |
| Google OAuth2 | google-api-client 2.2.0 |
| Rate Limiting | Bucket4j 기반 |
| CORS | localhost:5173/5174/3000 + bridgespots.com + milkyway.pe.kr |
| Session | STATELESS (JWT 기반) |
| 이메일 인증 | 필수 (미인증 시 보드 접근 차단) |

### 5.3 역할 기반 접근 제어

```
SystemRole: USER → ADMIN (시스템 전체)
BoardRole:  VIEWER → MEMBER → ADMIN → OWNER (보드별)
```

| 권한 | VIEWER | MEMBER | ADMIN | OWNER |
|------|--------|--------|-------|-------|
| 보드 조회 | O | O | O | O |
| 태스크 생성/수정 | X | O | O | O |
| 멤버 초대 | X | X | O | O |
| 보드 설정 변경 | X | X | O | O |
| 보드 삭제 | X | X | X | O |
| 구독 관리 | X | X | X | O |

---

## 6. 실시간 동기화 (WebSocket)

### 6.1 STOMP WebSocket 아키텍처

```
[Browser A]──┐
[Browser B]──┤──STOMP──►[/ws endpoint]──►[SimpleBroker]──►[/topic/board/{boardId}]
[Browser C]──┘                                            [/topic/board/{boardId}/user/{userId}]
                                                          [/topic/user/{userId}]
```

**설정:**
- 엔드포인트: `/ws` (STOMP), `/ws-collab` (Yjs CRDT)
- 인증: `WebSocketAuthInterceptor` (JWT in CONNECT headers)
- 하트비트: 4초 간격
- 재연결: 5초 지수 백오프

### 6.2 이벤트 타입

```
TASK_CREATED, TASK_UPDATED, TASK_DELETED, TASK_MOVED
FEATURE_CREATED, FEATURE_UPDATED, FEATURE_DELETED
COMMENT_CREATED, COMMENT_UPDATED
CHECKLIST_ITEM_CREATED, CHECKLIST_ITEM_TOGGLED
SCHEDULE_CREATED, SCHEDULE_UPDATED
MEETING_CREATED, MEETING_UPDATED
MEMBER_JOINED, MEMBER_LEFT, MEMBER_ONLINE
PRESENCE_JOINED, PRESENCE_LEFT
NOTIFICATION_SENT, ANNOUNCEMENT_CREATED
```

### 6.3 Yjs CRDT (노트 동시 편집)

```
[Editor A] ←→ [Yjs Provider] ←→ [/ws-collab] ←→ [NoteCollabHandler] ←→ [NoteCollabState DB]
[Editor B] ←→ [Yjs Provider] ←→ [/ws-collab] ←→        ↑
                                                  diff/patch sync
```

---

## 7. AI 서비스 아키텍처

### 7.1 프로바이더 패턴

```java
AIProvider (interface)
├── ClaudeAIProvider  (CLAUDE_API_KEY → claude-haiku-4-5-20251001)
└── OpenAIProvider    (OPENAI_API_KEY → gpt-4o-mini)
```

### 7.2 AI 기능별 모델 설정

| 기능 | 모델 키 | 기본 모델 |
|------|---------|-----------|
| 팀 리포트 | ai.{provider}.model.team | gpt-4o-mini / claude-haiku |
| 개인 리포트 | ai.{provider}.model.personal | gpt-4o-mini / claude-haiku |
| 스탠드업 | ai.{provider}.model.standup | gpt-4o-mini / claude-haiku |
| 미팅 전사/요약 | ai.{provider}.model.meeting | gpt-4o-mini / claude-haiku |

### 7.3 크레딧 소비 흐름

```
AI 요청 → hasEnoughCredits() 확인 → consumeCredits(amount)
                                        ├── monthlyCredits 우선 소비
                                        └── purchasedCredits 보조 소비
리셋: 매일 UTC 00:00 (DailyStandupScheduler cron)
```

---

## 8. 구독 & 결제 시스템

### 8.1 플랜 상태 흐름

```
보드 생성 → TRIAL (7일, 전체 기능)
                │
                ├── 7일 경과 → STANDARD (무료, 기능 제한)
                │
                ├── 결제 → ACTIVE/PREMIUM (seat-based)
                │              │
                │              ├── 취소 → CANCELED
                │              └── 미결제 → SUSPENDED
                │
                └── Admin 업그레이드 → PREMIUM (수동)
```

### 8.2 가격 정책

```
MONTHLY: $5.00/seat (500 cents)
YEARLY:  $50.00/seat/년 (5000 cents, 월 $4.17)
총 요금 = pricePerSeat × seatCount
```

### 8.3 기능 게이팅

| 기능 | TRIAL | STANDARD | PREMIUM |
|------|-------|----------|---------|
| 칸반 보드 | O | O | O |
| 댓글/멘션 | O | O | O |
| 알림 | O | O | O |
| 일정 관리 | O | X | O |
| 마일스톤 | O | X | O |
| Slack 연동 | O | X | O |
| AI 기능 | O | 제한적 | O |
| 멤버 제한 | 5명 | 5명 | seat 기반 |

---

## 9. 알림 시스템

### 9.1 알림 유형 & 수신자 로직

| 유형 | 트리거 | 수신자 |
|------|--------|--------|
| COMMENT_MENTION | 댓글에서 @멘션 | 멘션된 사용자 (작성자 제외) |
| CHECKLIST_ASSIGNED | 체크리스트 아이템 배정 | 배정된 사용자 (배정자 제외) |
| TASK_COMMENT | 태스크에 댓글 작성 | task.createdBy + 체크리스트 배정자 (작성자 & 멘션 수신자 제외) |

### 9.2 전달 채널

```
댓글/배정 이벤트
    ├── DB 저장 (Notification entity)
    ├── WebSocket 실시간 전달 (/topic/board/{boardId}/user/{userId})
    └── Slack Webhook (@Async, MemberSlackWebhook 참조)
```

### 9.3 사용자 설정

- `NotificationPreference` (per-user per-board)
- 각 알림 유형별 On/Off 토글 가능

---

## 10. 파일 업로드 시스템

| 항목 | 설정 |
|------|------|
| 최대 파일 크기 | 5MB (일반), 50MB (비디오) |
| 지원 타입 | JPEG, PNG, GIF, WebP, MP4, WebM, QuickTime |
| 이미지 썸네일 | 400×400px (Thumbnailator) |
| 비디오 썸네일 | FFmpeg 추출 |
| 로컬 저장소 | `./uploads` (local 프로파일) |
| 프로덕션 | S3 (`bridge-kanban-attachments`) + CloudFront CDN |
| 임시 파일 만료 | 60분 (TempFileCleanupScheduler) |

---

## 11. 프론트엔드 아키텍처

### 11.1 라우팅 구조

| 경로 | 컴포넌트 | 보호 |
|------|----------|------|
| `/` | Home (redirect) | - |
| `/landing` | LandingPage | Public |
| `/compare` | ComparisonPage | Public |
| `/login` | LoginPage | LoginRoute |
| `/verify-email/:token` | EmailVerificationResultPage | Public |
| `/forgot-password` | ForgotPasswordPage | Public |
| `/reset-password/:token` | ResetPasswordPage | Public |
| `/settings` | SettingsPage | PrivateRoute |
| `/boards` | BoardListPage | PrivateRoute |
| `/boards/:boardId` | KanbanBoardPage | PrivateRoute |
| `/payment/success` | PaymentSuccessPage | PrivateRoute |
| `/payment/fail` | PaymentFailPage | PrivateRoute |
| `/invite/:code` | InviteLandingPage | Public |
| `/admin/*` | AdminPage | AdminRoute |
| `/announcements` | AnnouncementsPage | Public |
| `/terms` | TermsPage | Public |
| `/privacy` | PrivacyPage | Public |

### 11.2 상태 관리

| Context | 역할 |
|---------|------|
| AuthContext | 인증 상태, 로그인/로그아웃, 사용자 정보 |
| DragContext | 드래그 앤 드롭 상태 (Task, Block) |
| ThemeContext | 다크/라이트 테마 |
| AnalyticsContext | Firebase Analytics + Sentry 이벤트 |

### 11.3 컴포넌트 구조 (73개)

```
components/
├── landing/        (5) LandingPage, Diagrams, BridgeScene, QuantumScene, ComparisonPage
├── ui/            (48) Radix UI 기반 공통 컴포넌트
├── admin/          (8) 관리자 대시보드 탭
├── notes/          (2+) 노트 에디터 + 블록
├── figma/          (1) ImageWithFallback
└── 메인 컴포넌트   (9+) KanbanBlock, DraggableCard, FeatureCard, CommentPanel, ...
```

### 11.4 서비스 레이어

```
api.ts (Low-level)           services.ts (High-level)
├── boardAPI                 ├── boardService
├── featureAPI               ├── featureService
├── taskAPI                  ├── taskService
├── blockAPI                 ├── blockService
├── commentAPI → implicit    ├── (included in task flows)
├── checklistAPI             ├── checklistService
├── scheduleAPI              ├── scheduleService
├── meetingAPI → implicit    ├── (included in board flows)
├── noteAPI                  ├── noteService
├── subscriptionAPI          ├── subscriptionService
├── notificationAPI          ├── (context-driven)
├── statisticsAPI            ├── statisticsService
├── reportAPI → implicit     ├── (included in AI flows)
└── ...                      └── Mock fallback (USE_MOCK_ON_ERROR)
```

---

## 12. 인프라 & 배포

### 12.1 환경별 구성

| 항목 | Local | Dev | Prod |
|------|-------|-----|------|
| DB | H2 in-memory | PostgreSQL (RDS t4g.micro) | Aurora Serverless v2 |
| Cache | Simple | Simple | Redis (ElastiCache) |
| Storage | Local filesystem | S3 + CloudFront | S3 + CloudFront |
| JPA ddl-auto | update | update | validate |
| Flyway | off | on | on |
| 인스턴스 | - | t3.small ×1~2 | t3.small ×2~4 |
| 배포 방식 | - | Rolling | Rolling (50% batch) |
| 비용 | $0 | ~$45-50/월 | 가변 (Aurora Serverless) |

### 12.2 Terraform 모듈 (9개)

```
modules/
├── vpc/                 VPC + 서브넷 (2 AZ)
├── security-groups/     ALB, EB, RDS, ElastiCache SG
├── elastic-beanstalk/   앱 + 환경 + IAM
├── rds/                 Aurora PostgreSQL Cluster
├── rds-simple/          단순 RDS (dev용)
├── elasticache/         Redis
├── s3-cloudfront/       프론트엔드 호스팅
├── acm-certificate/     SSL/TLS (us-east-1)
└── route53/             DNS
```

### 12.3 CI/CD 파이프라인 (4개)

| 워크플로우 | 트리거 | 동작 |
|-----------|--------|------|
| `ci.yml` | PR to main/develop, push to develop | Backend 빌드+테스트 (PG+Redis 컨테이너), Frontend 타입체크 |
| `deploy-dev.yml` | CI 성공 후 (develop) | JAR → EB, React → S3, CloudFront 무효화 |
| `deploy-testprod.yml` | push to testprod | 동일 (testprod 환경) |
| `terraform.yml` | infra 변경 PR/push | Plan (PR), Apply (main push/manual) |

---

## 13. 모니터링 & 운영

### 13.1 모니터링 레이어

| 레이어 | 도구 | 메트릭 |
|--------|------|--------|
| Infrastructure | CloudWatch | CPU, 메모리, 네트워크 I/O |
| Application | Spring Actuator | JVM Heap, GC, HikariCP 커넥션 |
| API Performance | Custom AOP | 응답시간 p50/p95/p99, RPS, 에러율 |
| Error Tracking | Sentry | 실시간 에러 (traces sample rate: 10%) |
| User Analytics | Firebase | 사용자 행동, 이벤트 |

### 13.2 알림 임계치

| 메트릭 | 임계치 |
|--------|--------|
| CPU | 80% |
| Memory | 85% |
| HikariCP Active | 90% |
| Error Rate | 5% |
| Slow API | 3,000ms |

### 13.3 스케줄러

| 스케줄러 | 주기 | 역할 |
|----------|------|------|
| DailyStandupScheduler | 매분 | 스탠드업 리포트 생성 + Slack 전달 |
| MonitoringScheduler | 5분 | 시스템 헬스 체크 + 알림 |
| TempFileCleanupScheduler | 주기적 | 60분 초과 임시 파일 삭제 |
| ActivityLogCleanupScheduler | 일일 | 7일 이상 활동 로그 삭제 |
| AI Credit Reset | 매일 UTC 00:00 | 월간 크레딧 리셋 |

---

## 14. 코딩 규칙 & 컨벤션

### 14.1 JSON 필드 네이밍

```
Backend Jackson: SNAKE_CASE 전략
→ Java camelCase → JSON snake_case 자동 변환

API 인터페이스: snake_case (user_id, board_id, created_at)
Frontend 내부: camelCase (userId, boardId)
React Props: camelCase
```

### 14.2 타임존

```
Backend: LocalDateTime.now(ZoneOffset.UTC) 필수
Frontend: UTC 파싱 → 브라우저 로캘 표시
저장 형식: ISO 8601 with Z suffix
유틸: dateUtils.ts 함수만 사용
```

### 14.3 에러 처리

```java
// Backend: BusinessException + ErrorCode enum
throw new BusinessException(ErrorCode.BOARD_NOT_FOUND);

// GlobalExceptionHandler: @ControllerAdvice
// → JSON { error_code, message, timestamp }
// → Sentry 자동 보고 (prod)
```

### 14.4 프론트엔드 스타일링

```
컬러: bridge-dark, bridge-obsidian, bridge-accent, bridge-secondary
테두리: border-white/10, border-white/5
텍스트: text-slate-400
호버: hover:bg-white/5
라운드: rounded-xl, rounded-2xl
아이콘: Lucide React
애니메이션: Framer Motion
```

---

## 15. DB 마이그레이션 이력

| 버전 | 파일명 | 내용 |
|------|--------|------|
| V1~V4 | 초기 세팅 | 핵심 테이블 (users, boards, blocks, features, tasks) |
| V5 | add_comment_attachments | 댓글 첨부파일 |
| V6 | add_assignee_color_to_board_members | 담당자 색상 시스템 |
| V7 | create_announcements_table | 공지사항 |
| V8 | create_system_config_table | 시스템 설정 |
| V9 | allow_nullable_created_by | 사용자 탈퇴 처리 |
| V10 | add_last_active_at | 사용자 활동 추적 |
| V11 | create_inquiries_table | 문의 시스템 |
| V12 | add_user_reply_to_inquiry_replies | 문의 답변 |
| V13 | add_has_new_reply | 답변 알림 플래그 |
| V14 | create_member_slack_webhooks | Slack 연동 |
| V15 | drop_priority_from_features | 스키마 정리 |
| V16 | create_weekly_reports | 주간 리포트 |
| V17 | update_system_role_by_email | 관리자 역할 |
| V18 | fix_notifications_type_check | 알림 제약조건 |
| V19 | create_meetings_table | 미팅 |
| V20 | add_meeting_notification_type | 미팅 알림 |
| V21 | add_baseline_dates_to_tasks | 태스크 Baseline |
| V22 | add_meeting_transcript | 미팅 전사 |
| V23 | fix_activity_log_check | 활동 로그 제약조건 |
| V24 | add_checklist_moved | 체크리스트 이동 활동 |
| V25 | create_notes_tables | 노트 기능 |
| V26 | create_comment_reactions | 댓글 리액션 |
| V27 | create_board_custom_emojis | 커스텀 이모지 |
| V28 | add_display_order_to_board_members | 멤버 정렬 |
| V29 | add_meeting_recurrence | 반복 미팅 |
| V30 | create_monitoring_tables | 모니터링 |
| V31 | create_ai_usage_logs | AI 사용 로그 |
| V32 | ai_credits | AI 크레딧 시스템 |
| V33 | create_note_collab_states | 노트 협업 상태 (Yjs) |

---

> 본 문서는 Backend 246개 Java 파일, Frontend 73개 컴포넌트, 33개 Flyway 마이그레이션, 9개 Terraform 모듈, 4개 CI/CD 워크플로우를 실측 분석하여 작성되었습니다.
