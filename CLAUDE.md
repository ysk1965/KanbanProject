# BRIDGE 프로젝트 개발 가이드

이 문서는 Claude Code가 BRIDGE 프로젝트 개발 시 참조하는 운영 가이드입니다.

## 프로젝트 구조

```
KanbanProject/
├── frontend/                     # React 18.3 + TypeScript 5.5 + Vite 6.3
│   └── src/app/
│       ├── components/           # 207개 컴포넌트
│       │   ├── ui/               # 52개 shadcn/Radix 기반 컴포넌트
│       │   ├── landing/          # 랜딩 페이지 (3D: BridgeScene, QuantumScene)
│       │   ├── admin/            # 관리자 대시보드 (13개)
│       │   ├── notes/            # 노트 에디터/댓글/협업 (20개)
│       │   ├── dashboard/        # 대시보드 뷰 (8개)
│       │   ├── personal/         # 개인 스페이스 (9개)
│       │   ├── bible/            # 성경 읽기 (4개)
│       │   ├── roulette/         # 룰렛 (4개)
│       │   └── customicon/       # 커스텀 이모지 (4개)
│       ├── pages/                # 10개 페이지 (KanbanBoardPage, AdminPage, PersonalBoardPage 등)
│       ├── contexts/             # AuthContext, DragContext, ThemeContext, AnalyticsContext
│       ├── hooks/                # 11개 훅 (useBoardWebSocket, useCollaboration 등)
│       ├── utils/                # 15개 유틸 (api.ts, services.ts, websocket.ts 등)
│       ├── types/                # TypeScript 타입 정의 (index.ts)
│       ├── i18n/locales/         # 10개 언어 (ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi)
│       ├── constants/            # 상수 정의
│       └── lib/                  # 외부 라이브러리 설정
├── backend/                      # Spring Boot 3.4.1 + Java 21 + Gradle 9.2
│   └── src/main/java/com/kanban/
│       ├── domain/               # 36개 도메인 패키지 (409개 Java 파일)
│       │   ├── auth/             # 인증 (JWT, Google OAuth2)
│       │   ├── board/            # 보드 (CRUD, 멤버, 커스텀 이모지, Today)
│       │   ├── block/            # 칸반 블록
│       │   ├── feature/          # 피처 카드 (AI 분해)
│       │   ├── task/             # 태스크 (의존성, 크로스보드)
│       │   ├── comment/          # 댓글 + 리액션 + AI
│       │   ├── checklist/        # 체크리스트 (AI)
│       │   ├── dailychecklist/   # 일일 체크리스트
│       │   ├── schedule/         # 일정 관리
│       │   ├── meeting/          # 미팅 (AI 전사/요약, 반복)
│       │   ├── note/             # 노트 (실시간 협업, 공유, 댓글)
│       │   ├── notification/     # 알림 + FCM 푸시
│       │   ├── integration/slack/# 슬랙 웹훅
│       │   ├── subscription/     # 구독/결제 + AI 크레딧
│       │   ├── statistics/       # 통계/관리
│       │   ├── report/           # 주간 리포트 (AI)
│       │   ├── standup/          # 데일리 스탠드업
│       │   ├── member/           # 보드 멤버 관리
│       │   ├── invite/           # 초대 링크
│       │   ├── admin/            # 시스템 관리
│       │   ├── personal/         # 개인 스페이스 (대시보드, 이벤트, 습관, 태스크)
│       │   ├── diary/            # 다이어리 (AI, 음성)
│       │   ├── customicon/       # 커스텀 아이콘 (OpenAI 이미지)
│       │   ├── monitoring/       # 모니터링 (CloudWatch, OpenAI 빌링)
│       │   └── ...               # activity, announcement, inquiry, milestone, tag, weight, system, test
│       └── global/               # 공통 (config 20개, security, filter, exception, scheduler 8개, websocket)
├── infrastructure/terraform/     # Terraform IaC (10개 모듈, dev/prod 환경)
├── docs/                         # 117개 문서 (IA, Wireframe, Design, ERD, API, Tech)
└── .github/workflows/            # CI/CD (ci, deploy-dev, deploy-mobile, terraform)
```

---

## 개발 명령어

```bash
# Frontend
cd frontend && npm run dev        # 개발 서버 (:5173)
cd frontend && npm run build      # 프로덕션 빌드 (타입체크 포함)

# Backend
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'  # H2 로컬
cd backend && ./gradlew build --no-daemon                                # 빌드

# Docker (로컬 DB)
docker-compose up -d              # PostgreSQL 15 + Redis 7
```

---

## BRIDGE 디자인 시스템 (v1.5.0)

상세 기획서: `docs/Design/v1.5.0.md`

### 컬러 팔레트

| 이름 | 변수 | Dark Mode | Light Mode | 용도 |
|------|------|-----------|------------|------|
| Bridge Dark | `bridge-dark` | `#191f2d` | `#fffcf8` | 메인 배경 |
| Bridge Obsidian | `bridge-obsidian` | `#151B28` | `#efe6d8` | 카드/헤더 배경 |
| Bridge Accent | `bridge-accent` | `#6366F1` | `#6366F1` | 주요 액센트 (인디고) |
| Bridge Secondary | `bridge-secondary` | `#2DD4BF` | `#14B8A6` | 보조 액센트 (틸) |
| Bridge Surface | `bridge-surface` | `#1e2a42` | `#efe3d2` | 서피스 배경 |
| Bridge Border | `bridge-border` | `#384d6e` | `#E4DFDA` | 강조 테두리 |

모든 Bridge 테마 변수는 `frontend/src/styles/theme.css`에 정의. `.light` 클래스로 자동 전환.

### 3-Tier 테마 시스템 (다크/라이트 모드)

| Tier | 방식 | `dark:` 필요 | 용도 |
|------|------|-------------|------|
| 1 | Bridge Colors (CSS Variables) | **불필요** (자동 전환) | 배경, 액센트, 테두리 |
| 2 | `dark:` Prefix (Tailwind) | **필요** | 입력 필드, 텍스트, Status 색상 |
| 3 | BlockNote Colors | **불필요** | 노트 에디터 전용 |

```tsx
// Tier 1: Bridge 토큰 - dark: 불필요 (자동 전환)
<div className="bg-bridge-dark" />              // #191f2d ↔ #fffcf8
<div className="bg-bridge-obsidian" />          // #151B28 ↔ #efe6d8
<span className="text-foreground" />            // oklch(0.985) ↔ #3D2E1F
<div className="border-foreground/10" />        // 자동 대응

// Tier 2: dark: Prefix - 수동 분기
<input className="bg-black/5 dark:bg-white/5 text-slate-900 dark:text-white
  border-black/10 dark:border-white/10" />
<span className="text-emerald-600 dark:text-emerald-400" />  // Status 뱃지
```

### 타이포그래피

- **페이지 제목**: `text-2xl font-bold text-foreground tracking-tight`
- **위젯 제목**: `text-[13px] md:text-sm font-bold text-foreground`
- **라벨**: `text-[11px] font-bold uppercase tracking-widest text-slate-400`
- **Subtitle**: `text-[11px] text-slate-500`
- **본문**: `text-base font-light leading-relaxed`
- **Badge**: `text-[10px] font-bold`
- **Hint**: `text-[10px] text-slate-600`

### 컴포넌트 스타일

```tsx
// 카드 (마이스페이스 - Foreground 기반)
<div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-4" />

// 카드 (Organization - dark: 기반)
<div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-6" />

// WidgetCard (마이스페이스 위젯)
<div className="rounded-2xl border border-foreground/[0.12] overflow-hidden">
  <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06]" />
  <div className="bg-bridge-dark p-3 md:p-5">{children}</div>
</div>

// MotionModal (마이스페이스 모달)
// Backdrop: rgba(0,0,0,0.2) + blur(2px)
<div className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl
  border border-foreground/10 shadow-2xl" />
// 모달 Top Accent Line
<div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
// 모달 Header
<div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]" />
// 모달 Footer
<div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
  <span className="text-[10px] text-slate-600">Esc 닫기</span>
  <button className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent" />
</div>

// Primary 버튼 (페이지)
<button className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold
  hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all" />

// Secondary 버튼 (dark: 기반)
<button className="px-5 py-2.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
  text-slate-900 dark:text-white rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all" />

// Ghost 버튼
<button className="text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors" />

// Icon 버튼
<button className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5
  transition-colors shrink-0" />

// 입력 필드 (dark: 기반 - Organization 등)
<input className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
  rounded-xl py-3 px-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all" />

// Textarea (Foreground 기반 - 마이스페이스 모달)
<textarea className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
  text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none
  focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all" />

// 뱃지 (공통 패턴)
<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-{color}/10 text-{color}" />
// Bridge 뱃지: bg-bridge-accent/20 text-bridge-accent (dark: 불필요)
// Status 뱃지: bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 (dark: 필요)

// Glass Morphism 헤더
<header className="bg-bridge-obsidian border-b border-white/5 glass" />
```

### 새 컴포넌트 작성 시 규칙

1. **Bridge 컬러 사용**: `#1d2125` 대신 `bridge-dark`, `bridge-obsidian` (자동 테마 전환)
2. **테두리**: Org = `border-black/5 dark:border-white/5` / 마이스페이스 = `border-foreground/5`
3. **텍스트**: Org = `text-slate-900 dark:text-white` / 마이스페이스 = `text-foreground`
4. **호버**: `hover:bg-foreground/5` 또는 `hover:bg-black/10 dark:hover:bg-white/10`
5. **라운드**: 카드 `rounded-2xl`, 버튼/인풋 `rounded-xl`, 작은 요소 `rounded-lg`, 뱃지 `rounded-full`
6. **아이콘**: Lucide React (`import { Plus } from 'lucide-react'`)
7. **애니메이션**: Framer Motion (`motion.div` with `initial/animate/transition`)
8. **모달**: `MotionModal` 컴포넌트 사용 (`frontend/src/app/components/ui/MotionModal.tsx`)
9. **Status 색상**: 뱃지 BG는 `/20` 고정, 텍스트만 `dark:` 분기 (예: `text-amber-600 dark:text-amber-400`)

### 디자인 참조 파일

- `docs/Design/v1.5.0.md` - **디자인 시스템 전체 기획서**
- `frontend/src/styles/theme.css` - CSS 변수 정의 (Bridge + shadcn + Light Mode)
- `frontend/src/app/components/personal/` - 마이스페이스 (foreground 기반 패턴)
- `frontend/src/app/components/organization/tabs/` - 조직 관리 (dark: 기반 패턴)
- `frontend/src/app/components/ui/MotionModal.tsx` - 모달 컴포넌트
- `frontend/src/app/components/landing/LandingPage.tsx` - 랜딩 디자인

---

## API 규칙

- 백엔드: `http://localhost:8080/api/v1/`
- API 클라이언트: `frontend/src/app/utils/api.ts` (JWT 자동 갱신 포함)
- 서비스 레이어: `frontend/src/app/utils/services.ts`
- WebSocket: `frontend/src/app/utils/websocket.ts` (STOMP)

### JSON 필드 네이밍: snake_case 통일 (필수)

**핵심: 백엔드 Jackson `SNAKE_CASE` 전략 → API JSON 필드는 모두 `snake_case`**

```
Backend (application.yml): jackson.property-naming-strategy: SNAKE_CASE
→ Java userId → JSON user_id
→ Java channelName → JSON channel_name
→ Java createdAt → JSON created_at
```

| 구분 | 네이밍 | 예시 |
|------|--------|------|
| **API 인터페이스 필드** | `snake_case` | `user_id`, `board_id`, `created_at` |
| **API 요청 body** | `snake_case` | `{ webhook_url: "...", channel_name: "..." }` |
| **프론트엔드 내부 변수** | `camelCase` | `const userId = data.user_id` |
| **React props** | `camelCase` | `<Card boardId={data.board_id} />` |

```typescript
// ✅ 올바른 사용
export interface SlackWebhookMemberStatus {
  user_id: string;
  channel_name: string | null;
  enabled: boolean;
}

// ❌ 사용 금지 (camelCase로 API 인터페이스)
export interface SlackWebhookMemberStatus {
  userId: string;        // ← 백엔드는 user_id로 전송
}
```

---

## 타임존 처리 (필수)

**원칙: UTC 저장, 클라이언트 타임존 표시**

### Backend
```java
// ✅ 올바른 사용
LocalDateTime.now(ZoneOffset.UTC)

// ❌ 사용 금지
LocalDateTime.now()                           // 서버 타임존 의존
LocalDateTime.now(ZoneId.of("Asia/Seoul"))    // 지역 하드코딩
```

### Frontend
`frontend/src/app/utils/dateUtils.ts` 함수만 사용:

```typescript
import { formatDate, formatDateTime, formatRelativeTime, getTodayDateString } from '../utils/dateUtils';

formatDate(serverDate)              // 로컬 타임존 표시
formatDateTime(serverDate)          // 날짜+시간
formatRelativeTime(serverDate)      // "3일 전"
getTodayDateString()                // 오늘 (yyyy-MM-dd)
toDateTimeLocalValue(serverDate)    // 서버 → input value
fromDateTimeLocalValue(inputValue)  // input → 서버 UTC ISO

// ❌ 사용 금지
new Date().toISOString().split('T')[0]
new Date(x).toLocaleDateString('ko-KR')
```

---

## 핵심 아키텍처 패턴

### Assignee Color System
- 중앙 관리: `frontend/src/app/utils/assigneeColor.ts`
- 6색: indigo, purple, teal, rose, amber, emerald
- `getAssigneeHex(name, customColor?)` → inline 스타일 (DraggableCard)
- `getAssigneeClasses(name, customColor?)` → Tailwind 클래스 (TaskDetailModal 등)
- DB: `board_members.assignee_color` (nullable VARCHAR)
- `memberColorMap` prop 흐름: KanbanBoardPage → KanbanBlock → DraggableCard

### Frontend 상태 관리
- `AuthContext` → 인증/사용자 상태
- `DragContext` → 드래그 앤 드롭 상태
- `ThemeContext` → 테마 설정
- `AnalyticsContext` → 분석 이벤트
- 주요 상태는 KanbanBoardPage에서 관리 후 props로 전달

### Frontend 핵심 훅
- `useBoardDataLoader` → 보드 데이터 로딩/패칭
- `useBoardWebSocket` → WebSocket 연결 관리
- `useBoardFilters` → 필터 상태 관리
- `useBoardPermissions` → 역할 기반 권한 체크
- `useCollaboration` → 실시간 협업 (Yjs)
- `useNotificationManager` → 알림 처리
- `useAudioRecorder` → 미팅 녹음

### Backend 레이어
```
Controller → Service (비즈니스 로직) → Repository (JPA)
                └→ FacadeService (복합 로직: BoardFacadeService, ScheduleFacadeService)
                └→ AIService (AI 기능: MeetingAI, NoteAI, ReportAI, DiaryAI, FeatureAI, ChecklistAI, CommentAI)
```

### Backend 스케줄러 (8개)
- `MonitoringScheduler` → 시스템 모니터링 + AI 크레딧 월간 리셋
- `SubscriptionScheduler` → 구독 상태 관리
- `ActivityLogCleanupScheduler` → 활동 로그 정리
- `BoardCleanupScheduler` → 삭제된 보드 정리
- `DailyStandupScheduler` → 스탠드업 알림
- `ExpiredTokenCleanupScheduler` → 만료 토큰 정리
- `PersonalTaskCleanupScheduler` → 개인 태스크 정리
- `TempFileCleanupScheduler` → 임시 파일 정리

### 프로파일별 환경
| 설정 | local | dev | prod |
|------|-------|-----|------|
| DB | H2 in-memory | PostgreSQL (RDS) | PostgreSQL (Aurora Serverless v2) |
| Cache | Simple | Redis | Redis (ElastiCache) |
| Storage | Local filesystem | S3 + CloudFront | S3 + CloudFront |
| JPA ddl-auto | update | update | validate |
| Flyway | off | on | on |
| Push | disabled | FCM | FCM |

---

## 실시간 기능

### WebSocket (STOMP)
- 보드 이벤트 실시간 동기화 (카드 이동, 생성, 수정, 삭제)
- Redis Pub/Sub 기반 멀티 인스턴스 브로드캐스트
- `frontend/src/app/utils/websocket.ts` → `useBoardWebSocket` 훅

### 실시간 협업 (Yjs)
- 노트 동시 편집 (Yjs + y-protocols)
- `NoteCollabWebSocketConfig` (백엔드) + `useCollaboration` (프론트엔드)
- 커서 위치/선택 영역 공유 (CollabPresence)

---

## AI 크레딧 시스템

- `AiCreditService` → 크레딧 소비 (pessimistic lock)
- 티어별 크레딧: TRIAL=100, STANDARD=30, PREMIUM=200+(seats*50)
- 소비 순서: Monthly free → Purchased (FIFO)
- 402 `AI_CREDITS_EXHAUSTED` → FE `ai-credits-exhausted` CustomEvent → 모달
- 월간 리셋: `MonitoringScheduler` (cron daily midnight UTC)

---

## Task Orchestration Workflow

복잡한 작업(3개 이상 하위 태스크, 다중 파일 수정, 시스템 분석 등) 요청 시:

### Phase 0: 판단 (Triage)

**병렬 오케스트레이션** (하나라도 해당 시):
- 2개 이상 독립적인 탐색/분석 필요
- 서로 다른 도메인에 걸친 작업
- BE + FE 모두 작업 필요
- 결과 취합이 필요한 작업

**직접 실행** (모두 해당 시):
- 단일 파일 또는 명확한 위치의 수정
- 순차적 의존성이 강해 병렬화 불가
- 간단한 질문/확인 작업

### Phase 1~4: 분석 → 실행 → 검증 → 완료
```
오케스트레이션 → "[Orchestration] N개 병렬 작업으로 진행합니다" 선언 후 Task tool 병렬 실행
직접 실행     → 바로 작업 수행
애매한 경우   → 사용자에게 확인
```

---

## 빌드 검증

```bash
# Frontend 빌드 (타입체크 포함)
cd frontend && npm run build

# Backend 빌드
cd backend && ./gradlew build --no-daemon
```
