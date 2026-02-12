# BRIDGE 프로젝트 개발 가이드

이 문서는 Claude Code가 BRIDGE 프로젝트 개발 시 참조하는 운영 가이드입니다.

## 프로젝트 구조

```
KanbanProject/
├── frontend/                     # React 18 + TypeScript + Vite
│   └── src/app/
│       ├── components/           # 79개 UI 컴포넌트
│       │   ├── landing/          # 랜딩 페이지 (LandingPage, Diagrams, BridgeScene)
│       │   └── ui/               # 48개 shadcn/Radix 기반 컴포넌트
│       ├── pages/                # 페이지 (KanbanBoardPage, AdminPage 등)
│       ├── contexts/             # AuthContext, DragContext, ThemeContext, AnalyticsContext
│       ├── hooks/                # useAnalytics, useVideoThumbnail
│       ├── utils/                # api.ts, services.ts, dateUtils.ts, assigneeColor.ts
│       ├── types/                # TypeScript 타입 정의 (index.ts)
│       ├── i18n/locales/         # 10개 언어 (ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi)
│       ├── constants/            # 상수 정의
│       └── lib/                  # 외부 라이브러리 설정
├── backend/                      # Spring Boot 3.4 + Java 21 + Gradle
│   └── src/main/java/com/kanban/
│       ├── domain/               # 31개 도메인 패키지 (246개 Java 파일)
│       │   ├── auth/             # 인증 (JWT, Google OAuth2)
│       │   ├── board/            # 보드 (CRUD, 멤버, 커스텀 이모지)
│       │   ├── block/            # 칸반 블록
│       │   ├── feature/          # 피처 카드
│       │   ├── task/             # 태스크
│       │   ├── comment/          # 댓글 + 리액션
│       │   ├── checklist/        # 체크리스트
│       │   ├── dailychecklist/   # 일일 체크리스트
│       │   ├── schedule/         # 일정 관리
│       │   ├── meeting/          # 미팅 (AI 전사/요약)
│       │   ├── note/             # 노트 (폴더/문서, 버전관리)
│       │   ├── notification/     # 알림
│       │   ├── integration/slack/# 슬랙 웹훅
│       │   ├── subscription/     # 구독/결제 (토스페이먼츠)
│       │   ├── statistics/       # 통계
│       │   ├── report/           # 주간 리포트 (AI)
│       │   ├── member/           # 보드 멤버 관리
│       │   ├── invite/           # 초대 링크
│       │   ├── admin/            # 시스템 관리
│       │   └── ...               # activity, announcement, inquiry, milestone, tag, weight 등
│       └── global/               # 공통 (config, security, filter, exception, email, scheduler)
├── infrastructure/terraform/     # Terraform IaC (dev, prod 환경)
├── docs/                         # 기획 문서 (IA, Wireframe, Design, ERD, API, Tech)
└── .github/workflows/            # CI/CD (ci, deploy-dev, deploy-testprod, terraform)
```

---

## 개발 명령어

```bash
# Frontend
cd frontend && npm run dev        # 개발 서버 (:5173)
cd frontend && npm run build      # 프로덕션 빌드 (타입체크 포함)

# Backend
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'  # H2 로컬
cd backend && ./gradlew build test --no-daemon                           # 빌드+테스트

# Docker (로컬 DB)
docker-compose up -d              # PostgreSQL 15 + Redis 7
```

---

## BRIDGE 디자인 시스템

### 컬러 팔레트

| 이름 | 변수 | HEX | 용도 |
|------|------|-----|------|
| Bridge Dark | `bridge-dark` | `#0A0E17` | 메인 배경 |
| Bridge Obsidian | `bridge-obsidian` | `#0F1419` | 카드/헤더 배경 |
| Bridge Accent | `bridge-accent` | `#6366F1` | 주요 액센트 (인디고) |
| Bridge Secondary | `bridge-secondary` | `#2DD4BF` | 보조 액센트 (틸) |

모든 Bridge 테마 변수는 `frontend/src/styles/theme.css`에 정의.

#### 사용 예시
```tsx
// 배경
<div className="bg-bridge-dark" />           // 메인 배경
<div className="bg-bridge-obsidian" />       // 카드/섹션 배경

// 텍스트
<span className="text-bridge-accent" />      // 강조 텍스트
<span className="text-bridge-secondary" />   // 보조 강조

// 버튼
<button className="bg-bridge-accent hover:bg-bridge-accent/90" />

// 테두리
<div className="border border-white/10" />   // 기본 테두리
<div className="border border-bridge-accent/50" /> // 강조 테두리
```

### 타이포그래피

- **헤딩**: `font-serif font-bold tracking-tight`
- **본문**: `font-light` 또는 기본
- **라벨**: `text-[11px] font-bold uppercase tracking-widest text-slate-400`
- **작은 텍스트**: `text-[10px] tracking-[0.3em] uppercase`

### 컴포넌트 스타일

```tsx
// 카드
<div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6" />

// Primary 버튼
<button className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold
  hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all" />

// Secondary 버튼
<button className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl
  hover:bg-white/10 transition-all" />

// Ghost 버튼
<button className="text-slate-400 hover:text-white hover:bg-white/5 transition-colors" />

// 입력 필드
<input className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4
  text-white placeholder-slate-600
  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
  transition-all" />

// 모달
<div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl" />

// Glass Morphism 헤더
<header className="bg-bridge-obsidian border-b border-white/5 glass" />
```

### 새 컴포넌트 작성 시 규칙

1. **Bridge 컬러 사용**: `#1d2125` 대신 `bridge-dark`, `bridge-obsidian`
2. **테두리**: `border-gray-700` 대신 `border-white/10` 또는 `border-white/5`
3. **텍스트**: `text-gray-400` 대신 `text-slate-400`
4. **호버**: `hover:bg-[#3a4149]` 대신 `hover:bg-white/5`
5. **라운드**: `rounded-xl` 또는 `rounded-2xl`
6. **아이콘**: Lucide React (`import { Plus } from 'lucide-react'`)
7. **애니메이션**: Framer Motion (`motion.div` with `initial/animate/transition`)

### 디자인 참조 파일

- `frontend/src/app/components/landing/LandingPage.tsx` - 전체 디자인 시스템
- `frontend/src/app/components/LoginPage.tsx` - 폼 디자인
- `frontend/src/app/components/BoardListPage.tsx` - 카드 그리드

---

## API 규칙

- 백엔드: `http://localhost:8080/api/v1/`
- API 클라이언트: `frontend/src/app/utils/api.ts` (JWT 자동 갱신 포함)
- 서비스 레이어: `frontend/src/app/utils/services.ts`

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

### Backend 레이어
```
Controller → Service (비즈니스 로직) → Repository (JPA)
                └→ FacadeService (복합 로직: BoardFacadeService, ScheduleFacadeService)
```

### 프로파일별 환경
| 설정 | local | dev | prod |
|------|-------|-----|------|
| DB | H2 in-memory | PostgreSQL (RDS) | PostgreSQL (Aurora Serverless v2) |
| Cache | Simple | Simple | Redis (ElastiCache) |
| Storage | Local filesystem | S3 + CloudFront | S3 + CloudFront |
| JPA ddl-auto | update | update | validate |
| Flyway | off | on | on |

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

# Backend 빌드 + 테스트
cd backend && ./gradlew build
```
