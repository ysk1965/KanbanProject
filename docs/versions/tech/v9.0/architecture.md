# BRIDGE - 아키텍처 개요 v9.0

> 이 문서는 BRIDGE 서비스의 기술 스택과 프로젝트 구조를 정의합니다.
>
> **관련 문서**
> - [Backend 기술 문서](./backend.md)
> - [Frontend 기술 문서](./frontend.md)

---

## 1. 기술 스택

### 1.1 Frontend

| 카테고리 | 기술 |
|---------|------|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + Radix UI |
| **3D** | Three.js + @react-three/fiber (랜딩 페이지) |
| **Animation** | Framer Motion |
| **Charts** | Recharts (관리 대시보드, 통계 분석) |
| **DnD** | @dnd-kit/core, @dnd-kit/sortable (데일리 체크리스트) | ← v9.0 변경
| **State** | Context API |
| **Date** | date-fns |

### 1.2 Backend

| 카테고리 | 기술 |
|---------|------|
| **Language** | Java 21 |
| **Framework** | Spring Boot 3.4 |
| **Security** | Spring Security + JWT |
| **ORM** | Spring Data JPA |
| **Database** | PostgreSQL |
| **Email** | Spring Mail (SMTP) |

### 1.3 Infrastructure

| 카테고리 | 기술 |
|---------|------|
| **Compute** | AWS ECS Fargate |
| **Database** | Aurora PostgreSQL |
| **CDN** | CloudFront |
| **Storage** | S3 |
| **Cache** | Redis |
| **IaC** | Terraform |

---

## 2. 프로젝트 구조

### 2.1 Frontend 구조

```
frontend/
├── src/app/
│   ├── components/           # UI 컴포넌트
│   │   ├── landing/          # 랜딩 페이지
│   │   ├── dashboard/        # 대시보드 관련
│   │   ├── ui/               # 기본 UI (shadcn)
│   │   │
│   │   ├── ManagementView.tsx      # 관리 대시보드
│   │   ├── StatisticsView.tsx      # 통계 분석
│   │   ├── WeeklyScheduleView.tsx  # 위클리 스케줄
│   │   ├── DailyScheduleView.tsx   # 데일리 스케줄 (타임블록)
│   │   ├── ScheduleBlock.tsx       # 스케줄 블록 컴포넌트
│   │   │
│   │   ├── DailyChecklistView.tsx  # 데일리 체크리스트 뷰          ← v9.0 추가
│   │   ├── DailyChecklistColumn.tsx # 멤버별 체크리스트 컬럼       ← v9.0 추가
│   │   ├── DailyChecklistItem.tsx  # 체크리스트 아이템            ← v9.0 추가
│   │   ├── AddDailyChecklistModal.tsx # 체크리스트 추가 모달     ← v9.0 추가
│   │   │
│   │   ├── SettingsPage.tsx        # 설정 페이지
│   │   ├── LoginPage.tsx           # 로그인
│   │   ├── ErrorBoundary.tsx       # 에러 처리
│   │   ├── AlertModal.tsx          # 알림 모달                    ← v9.0 추가
│   │   │
│   │   ├── EmailVerificationPendingPage.tsx  # 이메일 인증 대기
│   │   ├── EmailVerificationResultPage.tsx   # 이메일 인증 결과
│   │   ├── ForgotPasswordPage.tsx            # 비밀번호 찾기
│   │   ├── ResetPasswordPage.tsx             # 비밀번호 재설정
│   │   │
│   │   ├── TermsPage.tsx           # 이용약관
│   │   └── PrivacyPage.tsx         # 개인정보처리방침
│   │
│   ├── pages/                # 페이지 컴포넌트
│   │   └── KanbanBoardPage.tsx
│   │
│   ├── contexts/             # React Context
│   │   ├── AuthContext.tsx   # 인증 상태
│   │   └── ThemeContext.tsx  # 테마 상태
│   │
│   ├── utils/                # 유틸리티
│   │   ├── api.ts            # API 클라이언트
│   │   └── services.ts       # 비즈니스 로직
│   │
│   ├── types/                # TypeScript 타입
│   │   └── index.ts
│   │
│   └── styles/               # CSS 스타일
│       └── theme.css
│
├── public/                   # 정적 파일
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### 2.2 Backend 구조

```
backend/
├── src/main/java/com/kanban/
│   ├── domain/
│   │   ├── auth/             # 인증
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   └── dto/
│   │   │
│   │   ├── user/             # 사용자
│   │   │   ├── User.java
│   │   │   ├── EmailVerificationToken.java
│   │   │   ├── PasswordResetToken.java
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   └── dto/
│   │   │
│   │   ├── board/            # 보드
│   │   ├── block/            # 블록
│   │   ├── feature/          # Feature
│   │   ├── task/             # Task
│   │   ├── checklist/        # 체크리스트
│   │   ├── tag/              # 태그
│   │   │
│   │   ├── dailychecklist/   # 데일리 체크리스트        ← v9.0 추가
│   │   │   ├── DailyChecklist.java
│   │   │   ├── DailyChecklistRepository.java
│   │   │   ├── DailyChecklistService.java
│   │   │   ├── DailyChecklistController.java
│   │   │   └── dto/
│   │   │
│   │   ├── milestone/        # 마일스톤
│   │   │   ├── Milestone.java
│   │   │   ├── MilestoneAllocation.java
│   │   │   └── ...
│   │   │
│   │   ├── schedule/         # 스케줄 블록
│   │   ├── statistics/       # 통계
│   │   │
│   │   ├── weight/           # 가중치 시스템
│   │   │   ├── WeightLevel.java
│   │   │   ├── TaskWeight.java
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   └── dto/
│   │   │
│   │   ├── member/           # 보드 멤버
│   │   ├── invite/           # 초대
│   │   ├── subscription/     # 구독
│   │   ├── activity/         # 활동 로그
│   │   └── common/           # 공통
│   │
│   └── global/               # 전역 설정
│       ├── config/           # 설정
│       ├── security/         # 보안
│       ├── exception/        # 예외 처리
│       └── util/             # 유틸리티
│
├── src/main/resources/
│   ├── application.yml
│   └── application-{profile}.yml
│
└── build.gradle
```

---

## 3. 엔티티 관계도

```
User ─── Board ─── Block
           │         │
           │    Feature ◄──┐
           │         │     │
           │       Task ───┼──► TaskWeight ──► WeightLevel
           │         │     │
           │    Checklist ─┼──► DailyChecklist   ← v9.0 추가
           │         │     │         │
           │  ScheduleBlock│         └── assignee, assigned_date
           │               │
           ├─── Tag ───────┘
           │
           ├─── Milestone ──┬── MilestoneFeature ───► Feature
           │                │
           │                └── MilestoneAllocation ──► User
           │
           ├─── BoardMember
           ├─── InviteLink
           ├─── Subscription
           └─── WeightLevel

User ──┬── EmailVerificationToken
       ├── PasswordResetToken
       └── RefreshToken

DailyChecklist (v9.0 추가)
       │
       ├─── Board (소속 보드)
       ├─── ChecklistItem (연결된 체크리스트, nullable)
       ├─── User (담당자)
       ├─── assigned_date (할당 날짜)
       ├─── position (우선순위)
       └─── title (제목 백업)
```

---

## 4. API 구조

### 4.1 Base URL

```
Production: https://api.bridge-spots.com/api/v1
Development: http://localhost:8080/api/v1
```

### 4.2 API 그룹

| 그룹 | Base Path | 설명 |
|------|-----------|------|
| Auth | `/auth` | 인증 (로그인, 회원가입, 토큰) |
| Users | `/users` | 사용자 정보 |
| Boards | `/boards` | 보드 CRUD |
| Blocks | `/boards/:id/blocks` | 블록 관리 |
| Features | `/boards/:id/features` | Feature CRUD |
| Tasks | `/boards/:id/tasks` | Task CRUD |
| Checklists | `/boards/:id/tasks/:id/checklists` | 체크리스트 |
| DailyChecklists | `/boards/:id/daily-checklists` | 데일리 체크리스트 | ← v9.0 추가
| Tags | `/boards/:id/tags` | 태그 관리 |
| Milestones | `/boards/:id/milestones` | 마일스톤 |
| Schedule | `/boards/:id/schedules` | 스케줄 블록 |
| Statistics | `/boards/:id/statistics` | 통계 |
| Weight | `/boards/:id/weight-levels` | 가중치 레벨 |
| Members | `/boards/:id/members` | 멤버 관리 |
| Invites | `/boards/:id/invites` | 초대 관리 |
| Subscriptions | `/boards/:id/subscription` | 구독 관리 |

### 4.3 인증 방식

```
Authorization: Bearer {access_token}
```

- Access Token: 15분 유효
- Refresh Token: 7일 유효
- 토큰 갱신: `POST /auth/refresh`

---

## 5. 데이터베이스 스키마 개요

### 5.1 주요 테이블

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 |
| `email_verification_tokens` | 이메일 인증 토큰 |
| `password_reset_tokens` | 비밀번호 재설정 토큰 |
| `refresh_tokens` | 리프레시 토큰 |
| `boards` | 보드 |
| `board_members` | 보드 멤버 |
| `blocks` | 블록 |
| `features` | Feature |
| `tasks` | Task |
| `checklist_items` | 체크리스트 |
| `daily_checklists` | 데일리 체크리스트 | ← v9.0 추가
| `tags` | 태그 |
| `milestones` | 마일스톤 |
| `milestone_features` | 마일스톤-Feature 연결 |
| `milestone_allocations` | 마일스톤 할당 |
| `schedule_blocks` | 스케줄 블록 |
| `weight_levels` | 가중치 레벨 |
| `task_weights` | Task 가중치 |
| `invite_links` | 초대 링크 |
| `subscriptions` | 구독 |
| `activities` | 활동 로그 |

### 5.2 인덱스 전략

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| `tasks` | `board_id` | 보드별 Task 조회 |
| `tasks` | `feature_id` | Feature별 Task 조회 |
| `checklist_items` | `task_id` | Task별 체크리스트 조회 |
| `checklist_items` | `assignee_id` | 담당자별 조회 |
| `schedule_blocks` | `board_id, scheduled_date` | 날짜별 스케줄 조회 |
| `milestone_allocations` | `milestone_id` | 마일스톤별 할당 조회 |
| `daily_checklists` | `board_id, assigned_date` | 날짜별 데일리 체크리스트 조회 | ← v9.0 추가
| `daily_checklists` | `board_id, checklist_item_id, assigned_date` | 중복 체크 | ← v9.0 추가

---

## 6. 보안 설정

### 6.1 CORS 설정

```yaml
# application.yml
cors:
  allowed-origins:
    - https://bridge-spots.com
    - http://localhost:5173
  allowed-methods:
    - GET, POST, PUT, PATCH, DELETE, OPTIONS
  allowed-headers:
    - Authorization, Content-Type
```

### 6.2 보안 규칙

| 항목 | 설정 |
|------|------|
| 비밀번호 해싱 | BCrypt (강도 10) |
| JWT 알고리즘 | HS256 |
| HTTPS | 필수 (Production) |
| XSS | 입력 새니타이징 |
| CSRF | JWT 사용으로 비활성화 |

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v7.0 | 2026-01-13 | 통계 도메인, 마일스톤 할당 추가 |
| v8.0 | 2026-01-15 | 가중치 도메인, 이메일 인증 토큰, 비밀번호 재설정 토큰 추가 |
| v9.0 | 2026-01-17 | 데일리 체크리스트 도메인 추가, dnd-kit 라이브러리 도입 |

---

**문서 버전**: 9.0
**최종 수정**: 2026년 1월 17일
