# BRIDGE - 프로젝트 소개서 (포트폴리오용)

> **AI-Powered Collaborative Project Management Platform**
> Full-Stack 개발 | 2024 ~ 현재

---

## 1. 프로젝트 개요

### BRIDGE란?

소규모 팀(2~20명)을 위한 **올인원 프로젝트 협업 플랫폼**입니다. 칸반 보드, 일정 관리, 미팅 기록, 팀 노트, AI 리포트를 하나의 서비스에서 제공합니다.

Jira + Notion + Google Calendar + Slack을 하나로 통합하여 도구 간 컨텍스트 전환 비용을 제거하는 것이 핵심 가치입니다.

| 항목 | 내용 |
|------|------|
| **서비스 URL** | https://bridgespots.com |
| **개발 기간** | 2024 ~ 현재 (지속 운영) |
| **역할** | 풀스택 개발 (기획, 설계, 프론트엔드, 백엔드, 인프라, 배포) |
| **규모** | Backend 246개 Java 파일 / Frontend 73개 컴포넌트 / 33개 DB 마이그레이션 |

### 서비스 스크린샷 구성

```
┌────────────────────────────────────────────────┐
│  [칸반 보드]  [일정]  [미팅]  [노트]  [통계]  [AI] │  ← 탭 기반 뷰 전환
├────────────────────────────────────────────────┤
│  FEATURE    │   TASK     │   DONE    │ Custom  │  ← 칸반 컬럼
│  ┌────────┐ │ ┌────────┐ │ ┌────────┐│         │
│  │Feature │ │ │ Task   │ │ │ Done   ││         │
│  │Card    │ │ │ Card   │ │ │ Card   ││         │
│  │(드래그) │ │ │(드래그) │ │ │        ││         │
│  └────────┘ │ └────────┘ │ └────────┘│         │
└────────────────────────────────────────────────┘
```

---

## 2. 기술 스택

### Frontend
| 기술 | 버전 | 선택 이유 |
|------|------|-----------|
| **React** | 18.3.1 | 컴포넌트 기반 UI, 풍부한 생태계 |
| **TypeScript** | 5.5.0 | 타입 안전성으로 런타임 에러 사전 방지 |
| **Vite** | 6.3.5 | 빠른 HMR, 최적화된 빌드 |
| **Tailwind CSS** | 4.1.12 | 유틸리티 퍼스트, 커스텀 디자인 시스템 구축 용이 |
| **Radix UI** | Latest | 접근성(A11y) 보장된 Headless UI (48개 컴포넌트 활용) |
| **Framer Motion** | 12.26.1 | 선언적 애니메이션, Spring 물리 엔진 |
| **@dnd-kit** | Latest | 유연한 드래그 앤 드롭 (카드/컬럼) |
| **Yjs** | 13.6.29 | CRDT 기반 충돌 없는 동시 편집 |
| **BlockNote** | 0.28.0 | Yjs 호환 블록 기반 리치 에디터 |
| **Three.js** | 0.182.0 | 3D 랜딩 페이지 인터랙션 |
| **i18next** | 25.8.4 | 10개국어 국제화 |

### Backend
| 기술 | 버전 | 선택 이유 |
|------|------|-----------|
| **Spring Boot** | 3.4.1 | 엔터프라이즈급 프레임워크, 풍부한 생태계 |
| **Java** | 21 | Virtual Threads, Pattern Matching 등 최신 기능 |
| **Spring Security** | 6.x | JWT + OAuth2 통합 인증 |
| **Spring WebSocket** | STOMP | 실시간 양방향 통신 |
| **PostgreSQL** | 15 | 안정적인 RDBMS, JSON 지원 |
| **Redis** | 7 | 고성능 캐시 레이어 |
| **Flyway** | Latest | 버전 관리 가능한 DB 마이그레이션 (V1~V33) |
| **jjwt** | 0.12.6 | JWT 생성/검증 |
| **Bucket4j** | 8.0.1 | API Rate Limiting |
| **AWS SDK** | 2.25.0 | S3 파일 저장, CloudWatch 모니터링 |

### Infrastructure
| 기술 | 선택 이유 |
|------|-----------|
| **AWS** (12+ 서비스) | 프로덕션급 클라우드 인프라 |
| **Terraform** (9개 모듈) | 인프라를 코드로 관리 (IaC), dev/prod 환경 분리 |
| **GitHub Actions** (4개 워크플로우) | CI/CD 자동화 (테스트 → 빌드 → 배포) |
| **Docker** | 멀티스테이지 빌드, 비루트 사용자 보안 |
| **Sentry** | 프로덕션 에러 실시간 추적 |
| **Firebase Analytics** | 사용자 행동 분석 |

---

## 3. 핵심 기능 & 기술적 구현

### 3.1 칸반 보드 (실시간 동기화)

**기능**: Feature → Task 계층 구조의 칸반 보드. 드래그 앤 드롭으로 카드/컬럼 재배치, 변경 사항이 모든 멤버에게 실시간 반영.

**기술적 구현**:
- `@dnd-kit`으로 카드/컬럼 드래그 구현 (`DragContext`에서 상태 관리)
- STOMP WebSocket(`/topic/board/{boardId}`)으로 실시간 브로드캐스트
- 낙관적 업데이트: UI 먼저 반영 → API 호출 → 실패 시 롤백
- Task를 DONE 블록으로 이동 시 `task.complete()` → `feature.incrementCompletedTasks()` 자동 연쇄
- Feature 진행률 `getProgressPercentage()` = completedTasks / totalTasks × 100

```
[드래그 시작] → DragContext.startTaskDrag()
    → [드래그 중] updateTaskPlaceholder()  (실시간 위치 프리뷰)
    → [드롭] endTaskDrag()
        → PATCH /tasks/{id}/move  (서버 반영)
        → WebSocket TASK_MOVED 이벤트 브로드캐스트
        → 다른 클라이언트 자동 반영
```

### 3.2 CRDT 기반 동시 편집 (노트)

**기능**: 여러 사용자가 동시에 같은 문서를 편집해도 충돌이 발생하지 않는 실시간 협업 에디터.

**기술적 도전과 해결**:

| 도전 | 해결책 |
|------|--------|
| 동시 편집 충돌 | Yjs CRDT (Conflict-free Replicated Data Type) 적용 |
| 에디터 통합 | BlockNote 0.28.0 + Yjs Provider 연동 |
| 실시간 전송 | 별도 WebSocket 엔드포인트 (`/ws-collab`) 분리 |
| 상태 영속화 | `NoteCollabState` 엔티티에 CRDT 상태 저장 |

```
[Browser A: Editor]                    [Server: NoteCollabHandler]
     │                                        │
     ├── Yjs diff ──────────────────────────► │
     │                                        ├── patch 적용
     │                                        ├── NoteCollabState DB 저장
     │   ◄────────────────────── broadcast ───┤
     │                                        │
[Browser B: Editor]                           │
     │   ◄────────────────────── broadcast ───┤
     │                                        │
     ├── Yjs merge (CRDT 자동 병합) ──────────►│
```

### 3.3 AI 통합 (듀얼 프로바이더)

**기능**: 미팅 전사/요약, 주간 리포트 자동 생성, 노트 AI 제안. OpenAI와 Claude 중 선택 가능.

**기술적 구현**:

```java
// Strategy 패턴으로 AI 프로바이더 추상화
AIProvider (interface)
├── ClaudeAIProvider  → Claude API (claude-haiku-4-5-20251001)
└── OpenAIProvider    → OpenAI API (gpt-4o-mini)

// 환경변수 하나로 프로바이더 전환
ai.provider: ${AI_PROVIDER:openai}  // "claude" 또는 "openai"
```

- **크레딧 시스템**: 월간 크레딧 + 추가 구매, 이중 풀 소비 (월간 우선 → 구매분)
- **4가지 AI 기능별 독립 모델 설정**: team, personal, standup, meeting
- **스케줄 기반 자동 생성**: `DailyStandupScheduler`가 매분 체크 → UTC 시각 일치 시 자동 리포트 생성 → Slack 전달

### 3.4 구독 & 결제 시스템

**기능**: Seat 기반 구독 모델. Trial(7일) → Standard(무료) → Premium(유료) 3단계 플랜.

**기술적 구현**:

```
Trial 생성 (보드 생성 시 자동)
    │
    ├── 7일 후 자동 만료 → Standard
    │   (checkAndUpdateTierIfTrialExpired() 호출 시 체크)
    │
    └── 결제 (토스페이먼츠)
        ├── TossPaymentsService.confirmPayment()
        ├── PaymentHistory 기록
        ├── Subscription.activateSeatSubscription()
        └── Board.upgradeToPremium()
```

- **토스페이먼츠 연동**: 서버사이드 결제 확인 (confirm URL)
- **Seat 기반 가격**: 월 $5/seat, 연 $50/seat (17% 할인)
- **기능 게이팅**: `board.isPremium()`, `board.canAccessSchedule()`, `board.canAccessSlack()`으로 Premium 전용 기능 제어

### 3.5 알림 시스템 (멀티채널)

**기능**: @멘션, 체크리스트 배정, 태스크 댓글 3종 알림. 인앱 + Slack 이중 채널.

**기술적 구현**:

```
댓글 작성 이벤트
    │
    ├── CommentService.create()
    │   ├── mentions 파싱 (CSV user IDs)
    │   ├── COMMENT_MENTION 알림 생성 (멘션 대상)
    │   └── TASK_COMMENT 알림 생성 (task.createdBy + 체크리스트 assignees - 중복 제외)
    │
    ├── NotificationService.save() → DB 저장
    │
    ├── WebSocketEventService.sendUserEvent() → 실시간 전달
    │
    └── @Async SlackNotificationService.sendMentionNotifications()
        ├── NotificationPreference 확인 (per-user per-board)
        ├── MemberSlackWebhook 조회
        └── Slack Rich Message 발송 (비동기, 비차단)
```

- **커서 기반 페이지네이션**: 무한 스크롤 알림 목록
- **사용자별 설정**: 보드별로 알림 유형 On/Off (`NotificationPreference`)
- **비동기 Slack 전달**: `@Async`로 메인 트랜잭션 차단 없이 전달

### 3.6 실시간 아키텍처

**기능**: 칸반 변경, 미팅 참석, 온라인 상태 등 모든 이벤트를 실시간 동기화.

**기술적 구현**:

```
┌──────────────────────────────────────────────────┐
│                 WebSocket Layer                    │
│                                                    │
│  /ws (STOMP)              /ws-collab (Yjs CRDT)   │
│  ├── Board events         └── Note 동시 편집        │
│  ├── Meeting presence                              │
│  ├── Schedule updates                              │
│  └── Notifications                                 │
│                                                    │
│  인증: WebSocketAuthInterceptor (JWT)              │
│  하트비트: 4초 / 재연결: 5초 지수 백오프              │
│  셀프 이벤트 필터링: 낙관적 업데이트 중복 방지         │
└──────────────────────────────────────────────────┘
```

- **20+ 이벤트 타입**: TASK_CREATED/UPDATED/DELETED/MOVED, FEATURE_*, COMMENT_*, CHECKLIST_*, MEETING_*, PRESENCE_*, MEMBER_* 등
- **3개 토픽 레벨**: board-wide, user-specific, global-user
- **Non-blocking**: WebSocket 전송 실패 시 로그만 남기고 비즈니스 로직 정상 진행

### 3.7 10개국어 국제화 (i18n)

**기능**: 한국어, 영어, 일본어, 중국어(간체/번체), 베트남어, 태국어, 스페인어, 포르투갈어(브라질), 힌디어 지원.

**기술적 구현**:
- `i18next` + `react-i18next` + JSON 로케일 파일
- 브라우저 언어 자동 감지 + localStorage 영속화
- 날짜/시간 표시: `date-fns` 로케일과 양방향 동기화
- `dateUtils.ts`에서 `setLocale()` 호출 시 i18n + date-fns 동시 변경

### 3.8 인프라 & DevOps

**프로덕션 인프라** (AWS, Terraform IaC):

```
┌─────────────┐
│   Route 53  │ → DNS
│  (optional) │
└──────┬──────┘
       ▼
┌─────────────┐     ┌───────────────────┐
│  CloudFront │────►│ S3 (React SPA)    │
│    (CDN)    │     │ Cache: 1년(static) │
└──────┬──────┘     │ no-cache(index)   │
       │            └───────────────────┘
       ▼
┌─────────────┐     ┌───────────────────┐
│     ALB     │────►│ Elastic Beanstalk │
│             │     │ Spring Boot ×2~4  │
└─────────────┘     │ Rolling Deploy    │
                    └────┬────┬────┬────┘
                         │    │    │
            ┌────────────┘    │    └────────────┐
            ▼                 ▼                 ▼
   ┌──────────────┐  ┌────────────┐   ┌──────────────┐
   │ Aurora        │  │   Redis    │   │     S3       │
   │ Serverless v2 │  │ ElastiCache│   │  (파일 저장)  │
   │ 0.5~4 ACU    │  │            │   │              │
   └──────────────┘  └────────────┘   └──────────────┘
```

- **Terraform 9개 모듈**: VPC, SG, EB, RDS, ElastiCache, S3+CloudFront, ACM, Route53 완전 코드화
- **환경 분리**: dev ($45/월 최적화) vs prod (Aurora Serverless 자동 스케일링)
- **CI/CD**: GitHub Actions 4개 워크플로우 (CI → Deploy Dev → Deploy TestProd → Terraform)
- **Docker 멀티스테이지 빌드**: JDK 21 빌드 → JRE 21 런타임 (이미지 크기 최소화)
- **보안**: 비루트 사용자 (UID 1001), Health Check (`/actuator/health`)

---

## 4. 아키텍처 결정 & 기술적 챌린지

### 4.1 주요 아키텍처 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| **상태 관리** | Context API (Redux 미사용) | 73개 컴포넌트 규모에서 Context + hooks 조합이 충분, 불필요한 복잡성 제거 |
| **실시간 통신** | STOMP WebSocket | HTTP 폴링 대비 지연시간 대폭 감소, Spring 네이티브 지원 |
| **동시 편집** | Yjs CRDT | OT(Operational Transform) 대비 서버 부하 감소, 오프라인 지원 가능 |
| **AI 프로바이더** | Strategy 패턴 | 환경변수 하나로 OpenAI ↔ Claude 전환, vendor lock-in 방지 |
| **인증** | JWT (Stateless) | 수평 확장 용이, 서버 세션 불필요 |
| **DB 마이그레이션** | Flyway | 버전 관리 가능, 롤백 지원, 팀 개발 시 충돌 최소화 |
| **인프라** | Terraform IaC | 환경 재현성, 코드 리뷰 가능, dev/prod 동일 구조 보장 |
| **프론트엔드 배포** | S3 + CloudFront | 글로벌 CDN, HTTPS 자동, 무중단 배포 |
| **백엔드 배포** | Elastic Beanstalk | Rolling 배포로 무중단, Auto Scaling, Health Check 내장 |

### 4.2 기술적 챌린지 & 해결

#### Challenge 1: CRDT 동시 편집과 영속화

**문제**: Yjs CRDT 상태를 서버에 영속화하면서도 실시간 성능을 유지해야 함.

**해결**:
- 별도 WebSocket 엔드포인트 (`/ws-collab`) 분리로 칸반 이벤트와 간섭 차단
- `NoteCollabState` 엔티티에 바이너리 CRDT 상태 저장
- `NoteCollabHandler`에서 diff/patch만 전송 (전체 문서 아닌 변경분만)
- 클라이언트 Yjs가 자동 병합 처리 (서버는 릴레이 역할)

#### Challenge 2: 칸반 완료 연쇄 로직

**문제**: Task 이동 시 Feature 통계 정합성 유지 (동시 다발적 이동 시 경합 조건).

**해결**:
- `Task.moveToBlock()` 내부에서 Feature 카운터 자동 관리
- `@Transactional`로 원자성 보장
- DONE 블록 이동 = `task.complete()` + `feature.incrementCompletedTasks()`
- DONE 블록 이탈 = `task.reopen()` + `feature.decrementCompletedTasks()`
- Feature 자동 완료: `completedTasks == totalTasks` → `status = COMPLETED`

#### Challenge 3: 알림 중복 방지

**문제**: 댓글 작성 시 @멘션 대상 + TASK_COMMENT 대상이 겹칠 수 있음.

**해결**:
- TASK_COMMENT 수신자 계산 시 `댓글 작성자 + 이미 멘션 받은 사용자`를 제외
- 수신자 집합: `(task.createdBy ∪ checklist.assignees) - (comment.author ∪ mention.recipients)`

#### Challenge 4: Dev/Prod 환경 비용 최적화

**문제**: 프로덕션급 인프라를 유지하면서 개발 환경 비용을 최소화해야 함.

**해결**:
- Dev: NAT Gateway 제거 (EC2를 public subnet에 배치), RDS t4g.micro (free tier), Redis 미사용
- Prod: Aurora Serverless v2 (0.5~4 ACU 자동 스케일링), ElastiCache Redis
- Terraform 모듈 재사용: 동일 모듈에 변수만 다르게 적용
- Dev 비용: ~$45-50/월 달성

#### Challenge 5: 10개국어 날짜/시간 처리

**문제**: UTC 저장 → 10개 로케일 표시 변환, i18n과 날짜 라이브러리 동기화.

**해결**:
- Backend: `LocalDateTime.now(ZoneOffset.UTC)` 강제
- Frontend: `dateUtils.ts`에서 `parseUTCDate()` → 브라우저 로케일 표시
- 언어 변경 시 `setLocale()` → i18next + date-fns 로케일 동시 전환
- `formatRelativeTime()`: "3일 전", "2 days ago" 등 로케일별 상대 시간

---

## 5. 프로젝트 성과

### 5.1 규모 지표

| 항목 | 수치 |
|------|------|
| Backend Java 파일 | 246개 |
| Frontend 컴포넌트 | 73개 (+ 48개 UI 컴포넌트) |
| API 엔드포인트 | 100+ |
| 도메인 패키지 | 31개 |
| DB 마이그레이션 | 33개 (V1~V33) |
| Terraform 모듈 | 9개 |
| CI/CD 워크플로우 | 4개 |
| 지원 언어 | 10개국어 |
| WebSocket 이벤트 | 20+ 타입 |

### 5.2 기술적 성과

- **완전한 실시간 협업**: STOMP WebSocket + Yjs CRDT로 지연 없는 동시 편집
- **AI 통합**: 듀얼 프로바이더 (OpenAI/Claude) 전환 가능한 아키텍처
- **프로덕션 운영**: Terraform IaC + CI/CD + 모니터링 + 에러 추적 완비
- **Seat 기반 SaaS**: 구독/결제/크레딧 시스템 완전 구현
- **접근성 & 국제화**: Radix UI(A11y) + 10개국어 + 다크/라이트 테마

### 5.3 학습 & 성장

| 영역 | 경험 |
|------|------|
| **Full-Stack 개발** | React 18 + Spring Boot 3.4 + PostgreSQL + Redis 전 레이어 |
| **실시간 시스템** | WebSocket(STOMP) + CRDT(Yjs) 설계 및 구현 |
| **클라우드 인프라** | AWS 12+ 서비스 Terraform으로 관리 |
| **CI/CD** | GitHub Actions 파이프라인 설계 (테스트 → 빌드 → 배포) |
| **AI 통합** | OpenAI/Claude API 연동, Strategy 패턴 추상화 |
| **결제 시스템** | 토스페이먼츠 연동, Seat 기반 구독 모델 |
| **국제화** | 10개국어 지원, UTC 타임존 전략 |
| **보안** | JWT, OAuth2, Rate Limiting, RBAC, 이메일 인증 |
| **모니터링** | Sentry + CloudWatch + 커스텀 AOP 메트릭 |
| **Docker** | 멀티스테이지 빌드, 비루트 사용자, Health Check |

---

## 6. 기능 목록 (전체)

### Core
- [x] 칸반 보드 (Feature → Task 계층, 드래그 앤 드롭)
- [x] 커스텀 블록(컬럼) 생성
- [x] 자동 완료 연쇄 (Task → Feature 진행률)
- [x] 태그 시스템 (Feature/Task)
- [x] 체크리스트 (담당자 배정, 날짜 설정)
- [x] 일일 체크리스트 (개인별)
- [x] 마일스톤 (프로젝트 페이즈, 리소스 배분)
- [x] 담당자 색상 시스템 (6색, 커스텀 색상)

### 협업
- [x] 댓글 + @멘션 + 파일 첨부
- [x] 이모지 리액션 (커스텀 이모지 포함)
- [x] 실시간 WebSocket 동기화 (20+ 이벤트)
- [x] 온라인 상태 표시
- [x] 알림 (멘션, 배정, 댓글) + 커서 기반 페이징
- [x] 사용자별 보드별 알림 설정
- [x] Slack 연동 (개인별 Webhook)
- [x] 초대 링크 (역할, 사용 횟수, 만료일)
- [x] 활동 로그 (전체 변경 이력)

### 일정 & 미팅
- [x] 일간/주간 일정 뷰 (타임라인)
- [x] Baseline 일정 비교
- [x] 미팅 캘린더 뷰
- [x] 반복 미팅
- [x] AI 미팅 전사 (음성 → 텍스트)
- [x] AI 미팅 요약 (액션 아이템 추출)

### 노트
- [x] 폴더/문서 계층 구조 (최대 4단계)
- [x] BlockNote 리치 에디터
- [x] Yjs CRDT 동시 편집
- [x] 버전 관리
- [x] AI 콘텐츠 제안

### AI & 리포트
- [x] 주간 팀 리포트 (AI 생성)
- [x] 개인 리포트 (AI 생성)
- [x] 스탠드업 리포트 (자동 스케줄)
- [x] AI 크레딧 시스템 (월간 + 추가 구매)
- [x] 듀얼 AI 프로바이더 (OpenAI / Claude)

### 구독 & 결제
- [x] 3단계 플랜 (Trial → Standard → Premium)
- [x] Seat 기반 가격 ($5/seat/월)
- [x] 토스페이먼츠 연동
- [x] 기능 게이팅 (Premium 전용)
- [x] AI 크레딧 추가 구매

### 관리자
- [x] 대시보드 (시스템 메트릭)
- [x] 사용자 관리 (활성화/비활성화)
- [x] 구독 관리 (플랜 변경, Trial 연장)
- [x] 공지사항 관리
- [x] 문의 관리
- [x] 시스템 점검 모드

### 인프라
- [x] AWS 12+ 서비스 (VPC, ALB, EB, Aurora, Redis, S3, CloudFront, ...)
- [x] Terraform IaC (9개 모듈, dev/prod 분리)
- [x] CI/CD (GitHub Actions 4개 워크플로우)
- [x] Docker 멀티스테이지 빌드
- [x] Sentry 에러 추적
- [x] CloudWatch 모니터링
- [x] 커스텀 성능 모니터링 (AOP 기반)

### 기타
- [x] Google OAuth2 소셜 로그인
- [x] 이메일 인증 (Gmail SMTP)
- [x] 비밀번호 재설정
- [x] 다크/라이트 테마
- [x] 10개국어 국제화
- [x] 3D 랜딩 페이지 (Three.js)
- [x] 통계 대시보드
- [x] 파일 업로드 (S3 + CDN + 썸네일)
- [x] Rate Limiting

---

## 7. 연락처

- **프로젝트**: BRIDGE
- **서비스**: https://bridgespots.com
- **기술 스택 요약**: React 18 / Spring Boot 3.4 / PostgreSQL / Redis / AWS / Terraform

---

> 본 문서의 모든 기능과 수치는 실제 코드베이스(Backend 246개 Java 파일, Frontend 73개 컴포넌트, 33개 DB 마이그레이션)를 분석하여 작성되었습니다. 구현되지 않은 기능은 포함하지 않았습니다.
