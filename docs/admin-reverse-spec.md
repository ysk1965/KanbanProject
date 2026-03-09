# BRIDGE Admin Panel 역기획서

> **작성일**: 2026-02-27
> **버전**: v1.7.0 기준 (현행 코드 기반 역분석)
> **범위**: `/admin/*` 전체 (9개 탭, 14개 컴포넌트, 50+ API 엔드포인트)

---

## 1. 개요

### 1.1 제품 정의

BRIDGE Admin Panel은 시스템 관리자(ADMIN)가 서비스 전반을 모니터링·관리하는 통합 대시보드입니다. 사용자, 보드, 구독, 공지, 시스템 점검, 모니터링, 문의 응대까지 단일 인터페이스에서 처리합니다.

### 1.2 접근 권한

- **대상**: `system_role = ADMIN`인 사용자만 접근 가능
- **인증**: 모든 API에서 `verifyAdminAccess(UserPrincipal)` 선행 체크
- **에러**: 권한 없을 시 `403 ADMIN_ACCESS_DENIED`

### 1.3 진입 경로

- URL: `/admin` → 자동으로 `/admin/dashboard`로 리다이렉트
- 대시보드 헤더의 "← Back to Boards" 링크로 `/boards`로 복귀

---

## 2. 정보 구조 (IA)

```
/admin/
├── dashboard        # 시스템 개요 대시보드
├── analytics        # 성장/전환 분석 차트
├── users            # 사용자 관리
├── boards           # 보드 관리
├── subscriptions    # 구독 현황 (읽기전용)
├── announcements    # 시스템 공지 CRUD
├── system           # 점검 모드 관리
├── monitoring       # 인프라/AI 모니터링
└── inquiries        # 문의 응대
```

---

## 3. 레이아웃

### 3.1 공통 구조

```
┌─────────────────────────────────────────────────┐
│ Header: ← Back to Boards | Admin               │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Sidebar  │  Main Content Area                   │
│ (md+)    │  (탭별 컴포넌트)                       │
│          │                                      │
│ ─────── │                                      │
│ 9 NavItems                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

- **Header**: `bg-bridge-obsidian`, 좌측에 뒤로가기 + "Admin" 타이틀
- **Sidebar**: 데스크톱(md+)에서 좌측 세로 네비게이션 (w-56), 모바일에서 가로 스크롤 탭바
- **네비게이션**: 9개 항목, 활성 탭은 `bg-bridge-accent text-white`
- **콘텐츠 영역**: `max-w-7xl mx-auto`, ErrorBoundary로 감싸짐

---

## 4. 탭별 상세 기획

---

### 4.1 Dashboard (시스템 개요)

**컴포넌트**: `AdminDashboardTab.tsx`
**API**: `GET /api/v1/admin/statistics`

#### 데이터 구조

```typescript
AdminStatistics {
  total_users: number       // 전체 가입자 수
  active_users: number      // 최근 30일 활성 사용자
  total_boards: number      // 전체 보드 수
  trial_boards: number      // TRIAL 보드 수
  standard_boards: number   // STANDARD 보드 수
  premium_boards: number    // PREMIUM 보드 수
  active_subscriptions: number  // 활성 구독 수
  personal_boards: number   // 개인 보드 수
  personal_board_adoption: number  // 개인보드 채택률 (%)
  active_personal_boards: number   // 30일 활성 개인보드
  total_diary_entries: number      // 전체 다이어리 수
}
```

#### UI 구성

| 섹션 | 내용 | 비고 |
|------|------|------|
| **KPI 카드 (3열)** | 전체 사용자 (활성 수 부제), 전체 보드, 활성 구독 | 아이콘 + 숫자 |
| **Personal Board 메트릭 (4열)** | 개인보드 수, 채택률(%), 30일 활성, 다이어리 수 | `bg-foreground/5` 카드 |
| **Board Type 분포** | Team vs Personal 수평 바 차트 | 보라색(Personal) / 회색(Team) |
| **Tier 분포** | TRIAL / STANDARD / PREMIUM 프로그레스 바 | 각각 grey / blue / purple |

#### 점검 사항

- [x] 로딩 스피너: `border-t-2 border-b-2 border-bridge-accent` (커스텀 스피너 → **디자인 시스템 위반**, Loader2 사용 권장)
- [x] 에러 상태: 빨간 카드 + 재시도 버튼 존재
- [ ] **개선 필요**: 테두리가 `border-bridge-border` 사용 → 디자인 시스템 통일 기준 `border-foreground/[0.08]`이어야 함
- [ ] **개선 필요**: 라운드가 `rounded-xl` → Dashboard 카드는 `rounded-2xl`이 통일 기준

---

### 4.2 Analytics (성장 분석)

**컴포넌트**: `AdminAnalyticsTab.tsx`
**API**: 5개 엔드포인트 (초기 로드 시 `Promise.all`로 병렬 호출)

| API | 파라미터 | 용도 |
|-----|---------|------|
| `GET /admin/statistics/signups` | `days` (7/14/30/90) | 일별 가입 추이 |
| `GET /admin/statistics/active-users` | `days` (7/14/30/90) | DAU/WAU/MAU + 일별 추이 |
| `GET /admin/statistics/conversion` | `days` (365 고정) | Trial → Paid 전환 |
| `GET /admin/analytics/diary` | `days` (7/14/30/90) | 다이어리 인게이지먼트 |
| `GET /admin/analytics/personal-conversion` | `days` (365 고정) | Personal → Team 전환 |

#### UI 구성

| 섹션 | 차트 유형 | 데이터 |
|------|---------|--------|
| **DAU/WAU/MAU 카드** (3열) | 숫자 카드 | 당일/주간/월간 활성 사용자 |
| **가입 추이** | Stacked BarChart | Email(인디고) + Google(틸) 가입 수 |
| **DAU 추이** | LineChart | 일별 활성 사용자 수 |
| **전환율** | 요약카드 5개 + ConversionFunnel + Monthly BarChart | 전환 퍼널 시각화 |
| **다이어리 인게이지먼트** | 요약카드 3개 + BarChart | 총 작성, 완료율, 활성 사용자 |
| **Personal→Team 전환** | 요약카드 3개 + 프로그레스바 | Personal only vs Both |

#### 기간 선택기

- 4개 옵션: 7일, 14일, 30일, 90일
- 각 차트 섹션별 독립 기간 선택 (signup, dau, diary 각각)
- Conversion과 PB Conversion은 365일 고정

#### 차트 라이브러리

- **Recharts**: `LineChart`, `BarChart`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`
- Tooltip 스타일: `bridge-obsidian` 배경, `rgba(255,255,255,0.1)` 테두리, 12px 라운드
- 그리드: `strokeDasharray="3 3"`, `stroke="rgba(255,255,255,0.05)"`

#### 점검 사항

- [x] 새로고침 버튼 존재
- [x] 기간 전환 시 해당 차트만 재로드 (불필요한 전체 리로드 없음)
- [ ] **개선 필요**: 카드 테두리 `border-bridge-border` → `border-foreground/[0.08]` 통일 필요
- [ ] **개선 필요**: 차트 카드 테두리 `border-foreground/5` → `/[0.08]` 통일 필요

---

### 4.3 Users (사용자 관리)

**컴포넌트**: `AdminUsersTab.tsx`, `AdminUserDetailModal.tsx`

#### 목록 API

```
GET /api/v1/admin/users?page=0&size=20&search=query
→ { users: UserSummary[], total, page, size }
```

#### 테이블 컬럼

| 컬럼 | 데이터 | 비고 |
|------|--------|------|
| 사용자 | 아바타 + 이름 + 이메일 | 프로필 이미지 있으면 표시, 없으면 이니셜 |
| 역할 | ADMIN/USER 뱃지 | ADMIN은 bridge-accent 뱃지 |
| 인증방식 | Email/Google 뱃지 | |
| 보드 수 | 숫자 | |
| 개인보드 | 체크 아이콘 (있으면) | |
| 가입일 | yyyy-MM-dd | |

#### 사용자 상세 모달 액션

| 액션 | API | 제약 조건 |
|------|-----|----------|
| **역할 변경** | `PATCH /admin/users/{id}` | 자기 자신 불가, 마지막 ADMIN 불가 |
| **계정 비활성화** | `POST /admin/users/{id}/deactivate` | ADMIN 계정 불가 |
| **계정 활성화** | `POST /admin/users/{id}/activate` | 이미 활성이면 불가 |
| **이메일 인증** | `POST /admin/users/{id}/verify-email` | 이미 인증이면 불가 |
| **비번 리셋** | `POST /admin/users/{id}/send-password-reset` | Google 계정 불가 |
| **개인보드 생성** | `POST /admin/users/{id}/create-personal-board` | |
| **AI 크레딧 조정** | `PATCH /admin/users/{id}/personal-ai-credits` | 월간/보너스 분리 |
| **계정 삭제** | `DELETE /admin/users/{id}` | ADMIN 불가, 비활성 상태여야 함, 보드 Owner 불가 |
| **보드에서 제거** | `DELETE /admin/users/{id}/boards/{boardId}` | Owner 불가 |

#### 비즈니스 규칙

1. 시스템에 최소 1명의 ADMIN이 항상 존재해야 함
2. 사용자 삭제 전 반드시 비활성화 선행 필요
3. 보드 Owner인 사용자는 소유권 이전 전까지 삭제 불가

---

### 4.4 Boards (보드 관리)

**컴포넌트**: `AdminBoardsTab.tsx`, `AdminBoardDetailModal.tsx`

#### 목록 API

```
GET /api/v1/admin/boards?page=0&size=20&search=&tier=&board_type=
GET /api/v1/admin/boards/deleted?page=0&size=20  (삭제된 보드)
```

#### 탭 구조

- **Active 보드 탭**: 필터 (Tier: FREE/STANDARD/PREMIUM/ENTERPRISE, Type: TEAM/PERSONAL)
- **Deleted 보드 탭**: 소프트 삭제된 보드 목록, 복원 가능

#### 테이블 컬럼

| 컬럼 | 데이터 |
|------|--------|
| 이름 | 보드명 |
| 타입 | TEAM/PERSONAL 뱃지 |
| Owner | 이름 + 이메일 |
| Tier | FREE/STANDARD/PREMIUM 뱃지 (색상 구분) |
| 멤버 수 | 숫자 |
| 태스크 수 | 숫자 |
| 생성일 | yyyy-MM-dd |
| 삭제일 (삭제 탭) | + 영구삭제까지 남은 일수 |

#### 보드 상세 모달 액션

| 액션 | API | 비고 |
|------|-----|------|
| **이름 변경** | `PATCH /admin/boards/{id}/name` | |
| **Tier 변경** | `PATCH /admin/boards/{id}/tier` | PREMIUM 업그레이드 시 구독 상태 변경 |
| **소유권 이전** | `POST /admin/boards/{id}/transfer-ownership` | 기존 Owner → ADMIN 역할로 변경 |
| **Trial 연장** | `PATCH /admin/boards/{id}/extend-trial` | 일수 또는 날짜로 지정 |
| **멤버 역할 변경** | `PATCH /admin/boards/{id}/members/{memberId}/role` | Owner 역할 변경 불가 (이전 사용) |
| **좌석 수 변경** | `PATCH /admin/boards/{id}/seat-count` | 최소 1 |
| **AI 크레딧 조정** | `PATCH /admin/boards/{id}/ai-credits` | 월간/구매 크레딧 분리 |
| **소프트 삭제** | `DELETE /admin/boards/{id}` | 7일 복구 기간 |
| **복원** | `POST /admin/boards/{id}/restore` | 삭제된 보드만 |
| **영구 삭제** | `DELETE /admin/boards/{id}/permanent` | 모든 연관 데이터 삭제 |

#### 소프트 삭제 정책

- 삭제 시 `deletedAt` 타임스탬프 기록
- 7일간 복구 가능 (UI에 남은 일수 표시)
- `BoardCleanupScheduler`가 7일 후 자동 영구 삭제

---

### 4.5 Subscriptions (구독 현황)

**컴포넌트**: `AdminSubscriptionsTab.tsx`
**API**: `GET /api/v1/admin/subscriptions?page=0&size=20`

#### 테이블 (읽기 전용)

| 컬럼 | 데이터 |
|------|--------|
| 보드명 | 링크 없음 |
| Owner | 이름 |
| Tier | 뱃지 |
| 상태 | TRIAL/ACTIVE/CANCELED/EXPIRED 뱃지 (색상 구분) |
| 시작일 | |
| 종료일 | |

**특이 사항**: 이 탭은 조회 전용이며 어떠한 수정 액션도 없음. 보드 상세에서 구독 관련 변경 가능.

---

### 4.6 Announcements (공지 관리)

**컴포넌트**: `AdminAnnouncementsTab.tsx`
**API**: CRUD 4개 엔드포인트

```
GET    /api/v1/admin/announcements          → AnnouncementDetail[]
POST   /api/v1/admin/announcements          → AnnouncementDetail
PUT    /api/v1/admin/announcements/{id}     → AnnouncementDetail
DELETE /api/v1/admin/announcements/{id}     → { message }
```

#### 공지 유형

| 유형 | 설명 |
|------|------|
| `POPUP` | 팝업 형태로 표시 |
| `BANNER` | 상단 배너 형태 |
| `NOTICE` | 일반 공지 (기본값) |

#### 폼 필드

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| title | text | O | |
| content | textarea | | |
| type | select | | POPUP/BANNER/NOTICE (기본: NOTICE) |
| priority | number | | 높을수록 상위 노출 (기본: 0) |
| start_at | datetime | | |
| end_at | datetime | | 자정이면 23:59:59로 자동 보정 |
| is_active | toggle | | 기본: true |
| target_role | select | | 특정 역할에만 노출 (선택) |

#### 비즈니스 규칙

- 활성 공지 조회: `is_active=true AND start_at <= now AND (end_at IS NULL OR end_at >= now)`
- 정렬: `priority DESC, created_at DESC`
- **end_at 보정**: 00:00:00이면 23:59:59로 자동 변환 (해당일 전체 포함)

---

### 4.7 System (점검 모드)

**컴포넌트**: `AdminSystemTab.tsx`
**API**: 2개 엔드포인트

```
GET  /api/v1/admin/system/maintenance       → MaintenanceStatus
POST /api/v1/admin/system/maintenance       → MaintenanceStatus
```

#### 상태 흐름

```
정상 운영 ──[시작 버튼]──→ 점검 중 ──[해제 버튼]──→ 정상 운영
                              │
                         [변경 저장]
                              │
                         시간 연장/메시지 수정
```

#### 정상 운영 상태 UI

- **상태 카드**: 초록색 배경, 방패 아이콘, "정상 운영" 텍스트
- **점검 시작 폼**: 메시지(textarea) + 예상 종료 시간(datetime-local, 필수) + 시작 버튼(빨간색)

#### 점검 중 상태 UI

- **상태 카드**: 빨간색 배경, 경고 아이콘, 남은 시간, 진행률(%)
- **프로그레스 바**: 빨강→주황 그라데이션
- **정보 패널**: 시작 시간, 예상 종료, 메시지
- **수정 폼**: 종료 시간 변경, 메시지 편집
- **버튼 2개**: "변경사항 저장" (변경 있을 때만 활성) + "즉시 해제" (초록, 확인 모달)

#### 데이터 저장

- `system_config` 테이블의 `key = "maintenance_mode"` 레코드
- JSON 직렬화: `{ enabled, message, estimatedEndAt, startedAt }`
- 해제 시 `startedAt = null`, 재시작 시 기존 `startedAt` 유지

---

### 4.8 Monitoring (인프라 모니터링)

**컴포넌트**: `AdminMonitoringTab.tsx`, `MonitoringCharts.tsx`
**API**: 6개 엔드포인트 (초기 로드 시 `Promise.all` 병렬 호출)

| API | 용도 |
|-----|------|
| `GET /admin/monitoring/dashboard` | JVM, HikariCP, API 메트릭 |
| `GET /admin/monitoring/api-metrics/history?hours=24` | API 추이 (24시간) |
| `GET /admin/monitoring/alert-config` | Slack 알림 설정 |
| `GET /admin/monitoring/ai-usage?days=30` | AI 사용량 |
| `GET /admin/monitoring/billing/openai?days=30` | OpenAI 빌링 |

#### UI 구성

| 섹션 | 내용 | 비고 |
|------|------|------|
| **상태 카드 (4열)** | JVM Heap%, DB 커넥션, API 에러율(클릭 가능), 총 요청 | 각각 프로그레스 바 포함 |
| **차트 영역** | Top 10 느린 엔드포인트, API 추이, EC2/RDS, OpenAI 비용, AI 사용량 | MonitoringCharts 컴포넌트 |
| **OpenAI 빌링** | 총 비용, 총 요청, 총 토큰 | 연결 안 됐으면 안내 문구 |
| **AI 사용량 (4열)** | 총 호출, 총 토큰, 추정 비용, 평균 토큰/호출 | |
| **Slack 알림 설정** | Webhook URL, 활성 토글, 테스트, 저장 | |
| **서버 시간** | UTC 서버 시간 표시 | 하단 |

#### 자동 새로고침

- 체크박스로 on/off (기본: on)
- 1분(60초) 간격으로 dashboard + history만 갱신
- AI 사용량/빌링은 자동 갱신 미포함 (변동이 적음)

#### 에러 상세 모달

- API 에러율 카드 클릭 시 모달 오픈
- Top 에러 엔드포인트 목록: HTTP 메서드 뱃지 + 경로 + 에러 수 + 상태 코드 분포
- 상태 코드 뱃지 색상: 5xx(빨강), 401/403(주황), 404(파랑), 기타(회색)

#### 점검 사항

- [ ] **이슈**: `handleSaveConfig`과 `handleTestAlert`에서 `alert()` 사용 → 브라우저 알림 대신 Toast 사용 권장
- [x] 에러 상세 모달은 직접 DOM으로 구현 (MotionModal 미사용이지만 기능적으로 문제 없음)

---

### 4.9 Inquiries (문의 응대)

**컴포넌트**: `AdminInquiriesTab.tsx`
**API**: 4개 엔드포인트

```
GET   /api/v1/admin/inquiries?page=0&size=20&status=     → InquiryListResponse
GET   /api/v1/admin/inquiries/{id}                       → InquiryDetail
POST  /api/v1/admin/inquiries/{id}/reply                 → ReplyDetail
PATCH /api/v1/admin/inquiries/{id}/status                → InquiryDetail
```

#### 상태 흐름

```
PENDING → IN_PROGRESS → RESOLVED → CLOSED
```

| 상태 | 색상 | 의미 |
|------|------|------|
| PENDING | yellow | 접수됨, 미처리 |
| IN_PROGRESS | blue | 처리 중 |
| RESOLVED | green | 해결됨 |
| CLOSED | grey | 종료 |

#### 목록 화면

- **상태 필터**: 전체 / PENDING / IN_PROGRESS / RESOLVED / CLOSED 버튼 그룹
- **테이블**: 제목(+첨부 아이콘), 작성자(아바타+이름), 상태 뱃지, 답변 수, 날짜
- **페이지네이션**: 20건 단위, 이전/다음 버튼

#### 상세 화면

- **뒤로가기 + 제목**: 문의 상세 헤더
- **문의 정보 카드**: 제목, 작성자(이름+이메일), 날짜, 상태 드롭다운(실시간 변경 가능)
- **내용 표시**: `whitespace-pre-wrap` (줄바꿈 보존)
- **첨부파일**: 다운로드 링크 (Paperclip 아이콘 + 파일명)
- **답변 히스토리**: `bridge-accent/10` 배경으로 관리자 답변 강조 표시
- **답변 작성 폼**: textarea (5000자 제한) + 전송 버튼

---

## 5. 공통 UI 패턴

### 5.1 로딩 상태

```tsx
// 전 탭 공통 패턴
<div className="flex items-center justify-center h-64">
  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
</div>
```

> **점검**: 디자인 시스템 기준 `<Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />`를 사용해야 하나, 대부분의 탭에서 커스텀 border 스피너 사용 중. Inquiries 탭만 Loader2 사용.

### 5.2 에러 상태

```tsx
// 전 탭 공통 패턴
<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
  <p className="text-red-400">{error}</p>
  <button onClick={retry} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg">
    재시도
  </button>
</div>
```

### 5.3 확인 모달

**컴포넌트**: `AdminConfirmModal.tsx`

- `ConfirmModal`: 위험 작업 확인 (variant: danger/warning)
- `PromptModal`: 입력값 필요한 확인
- `SelectModal`: 선택지 확인
- `Toast`: 성공/에러 알림 (3초 자동 닫힘)

### 5.4 테이블 패턴

```tsx
// 공통 테이블 스타일
<table className="w-full min-w-[640px]">
  <thead>
    <tr className="border-b border-foreground/5">
      <th className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">...</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-foreground/5 hover:bg-foreground/5 cursor-pointer">
      <td className="px-3 py-3 md:px-6 md:py-4">...</td>
    </tr>
  </tbody>
</table>
```

### 5.5 뱃지 패턴

```tsx
// 역할 뱃지
<span className="px-2 py-0.5 rounded-full text-xs font-bold bg-bridge-accent/20 text-bridge-accent">ADMIN</span>

// 상태 뱃지
<span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-400/10 text-yellow-400">PENDING</span>

// Tier 뱃지
<span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400">PREMIUM</span>
```

---

## 6. API 엔드포인트 전체 목록

### 6.1 사용자 관리 (12개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/users` | 사용자 목록 (페이징+검색) |
| GET | `/admin/users/{id}` | 사용자 상세 |
| PATCH | `/admin/users/{id}` | 역할 변경 |
| GET | `/admin/users/{id}/boards` | 사용자 보드 목록 |
| POST | `/admin/users/{id}/deactivate` | 비활성화 |
| POST | `/admin/users/{id}/activate` | 활성화 |
| POST | `/admin/users/{id}/verify-email` | 이메일 인증 |
| POST | `/admin/users/{id}/send-password-reset` | 비번 리셋 메일 |
| DELETE | `/admin/users/{id}` | 영구 삭제 |
| DELETE | `/admin/users/{id}/boards/{boardId}` | 보드에서 제거 |
| POST | `/admin/users/{id}/create-personal-board` | 개인보드 생성 |
| PATCH | `/admin/users/{id}/personal-ai-credits` | AI 크레딧 조정 |

### 6.2 보드 관리 (14개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/boards` | 보드 목록 (페이징+필터) |
| GET | `/admin/boards/deleted` | 삭제된 보드 목록 |
| GET | `/admin/boards/{id}` | 보드 상세 |
| DELETE | `/admin/boards/{id}` | 소프트 삭제 |
| POST | `/admin/boards/{id}/restore` | 복원 |
| DELETE | `/admin/boards/{id}/permanent` | 영구 삭제 |
| PATCH | `/admin/boards/{id}/name` | 이름 변경 |
| PATCH | `/admin/boards/{id}/tier` | Tier 변경 |
| POST | `/admin/boards/{id}/transfer-ownership` | 소유권 이전 |
| PATCH | `/admin/boards/{id}/extend-trial` | Trial 연장 |
| PATCH | `/admin/boards/{id}/members/{memberId}/role` | 멤버 역할 변경 |
| PATCH | `/admin/boards/{id}/seat-count` | 좌석 수 변경 |
| PATCH | `/admin/boards/{id}/ai-credits` | AI 크레딧 조정 |

### 6.3 통계/분석 (5개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/statistics` | 전체 통계 |
| GET | `/admin/statistics/signups` | 가입 추이 |
| GET | `/admin/statistics/active-users` | 활성 사용자 (DAU/WAU/MAU) |
| GET | `/admin/statistics/conversion` | 전환율 |
| GET | `/admin/subscriptions` | 구독 목록 |

### 6.4 공지 (4개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/announcements` | 전체 공지 |
| POST | `/admin/announcements` | 공지 생성 |
| PUT | `/admin/announcements/{id}` | 공지 수정 |
| DELETE | `/admin/announcements/{id}` | 공지 삭제 |

### 6.5 시스템 (2개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/system/maintenance` | 점검 상태 조회 |
| POST | `/admin/system/maintenance` | 점검 모드 설정 |

### 6.6 모니터링 (6개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/monitoring/dashboard` | 대시보드 메트릭 |
| GET | `/admin/monitoring/api-metrics/history` | API 추이 (시간별) |
| GET | `/admin/monitoring/ai-usage` | AI 사용량 |
| GET | `/admin/monitoring/billing/openai` | OpenAI 빌링 |
| GET | `/admin/monitoring/alert-config` | 알림 설정 조회 |
| PATCH | `/admin/monitoring/alert-config` | 알림 설정 수정 |
| POST | `/admin/monitoring/alert-config/test` | 테스트 알림 발송 |

### 6.7 문의 (4개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/admin/inquiries` | 문의 목록 |
| GET | `/admin/inquiries/{id}` | 문의 상세 |
| POST | `/admin/inquiries/{id}/reply` | 답변 작성 |
| PATCH | `/admin/inquiries/{id}/status` | 상태 변경 |

**총계: 약 48개 API 엔드포인트**

---

## 7. 백엔드 성능 최적화 패턴

### 7.1 N+1 방지 배치 쿼리

```java
// 사용자 목록: 각 사용자별 보드 수를 1회 쿼리로 해결
Map<String, Integer> boardCountMap = boardRepository.countByUserInvolvementBatch(userIds);

// 보드 목록: 멤버 수 + 태스크 수 + 구독 정보를 3회 배치 쿼리로 해결
Map<String, Long> memberCountMap = boardMemberRepository.countGroupedByBoardId(boardIds);
Map<String, Long> taskCountMap = taskRepository.countGroupedByBoardId(boardIds);
Map<String, Subscription> subscriptionMap = subscriptionRepository.findByBoardIdIn(boardIds);
```

### 7.2 페이지네이션

- 전 목록 API: `page` + `size` 파라미터 (기본 20건)
- `Spring Data JPA Pageable` 활용
- `total` 카운트와 함께 반환

---

## 8. 에러 코드 체계

| 코드 | HTTP | 메시지 | 사용처 |
|------|------|--------|--------|
| `ADMIN_ACCESS_DENIED` | 403 | 관리자 권한이 필요합니다 | 모든 엔드포인트 |
| `CANNOT_REMOVE_LAST_ADMIN` | 400 | 마지막 관리자는 역할을 변경할 수 없습니다 | 역할 변경 |
| `CANNOT_DEMOTE_SELF` | 400 | 자신의 관리자 역할은 변경할 수 없습니다 | 역할 변경 |
| `CANNOT_DEACTIVATE_ADMIN` | 400 | 관리자 계정은 비활성화할 수 없습니다 | 비활성화 |
| `CANNOT_DELETE_ADMIN_USER` | 400 | 관리자 계정은 삭제할 수 없습니다 | 삭제 |
| `CANNOT_DELETE_ACTIVE_USER` | 400 | 활성 상태의 사용자는 삭제할 수 없습니다 | 삭제 |
| `CANNOT_REMOVE_OWNER` | 400 | Owner는 보드에서 제거할 수 없습니다 | 멤버 제거 |
| `CANNOT_CHANGE_OWNER_ROLE` | 400 | Owner 역할은 이전으로만 변경 가능합니다 | 역할 변경 |
| `GOOGLE_USER_NO_PASSWORD` | 400 | Google 계정은 비밀번호 리셋 불가 | 비번 리셋 |

---

## 9. i18n (다국어 지원)

### 지원 언어

10개: ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi

### 네임스페이스 구조

```
admin.dashboard.*        # 대시보드 탭
admin.analytics.*        # 분석 탭
admin.users.*            # 사용자 관리 탭
admin.boards.*           # 보드 관리 탭
admin.subscriptions.*    # 구독 탭
admin.announcements.*    # 공지 탭
admin.system.*           # 시스템 탭
admin.monitoring.*       # 모니터링 탭
admin.inquiries.*        # 문의 탭
admin.common.*           # 공통 (새로고침, 날짜 포맷 등)
```

---

## 10. 디자인 시스템 준수 점검

### 10.1 준수 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| Bridge Color 사용 | O | `bridge-dark`, `bridge-obsidian`, `bridge-accent` |
| `text-foreground` 통일 | O | |
| `text-slate-*` 보조 텍스트 | O | `slate-400` (보조), `slate-500` (힌트) |
| Lucide React 아이콘 | O | |
| Recharts 차트 | O | |
| 모바일 반응형 | O | `md:` breakpoint 적용 |
| 에러/로딩 상태 | O | 전 탭 일관된 패턴 |
| 확인 모달 (위험 액션) | O | ConfirmModal 사용 |

### 10.2 미준수 항목 (개선 필요)

| 항목 | 현재 | 기준 | 영향 범위 |
|------|------|------|----------|
| **로딩 스피너** | border 스피너 (커스텀) | `<Loader2>` 컴포넌트 | Dashboard, Analytics, System, Monitoring, Boards, Users, Subscriptions, Announcements (8개 탭) |
| **카드 테두리** | `border-bridge-border` | `border-foreground/[0.08]` | Dashboard, Analytics (MetricCard) |
| **카드 라운드** | 일부 `rounded-xl` | `rounded-2xl` (카드 통일) | Dashboard 상단 카드 |
| **차트 카드 테두리** | `border-foreground/5` | `border-foreground/[0.08]` | Analytics 전체 차트 |
| **모달 구현** | 에러 상세 모달 직접 구현 | `MotionModal` 사용 | Monitoring 에러 상세 |
| **alert() 사용** | `alert()` (브라우저 기본) | Toast 컴포넌트 | Monitoring (저장/테스트 알림) |
| **placeholder 색상** | `placeholder-slate-600` | `placeholder-slate-500` | System, Monitoring 입력 필드 |

---

## 11. 백엔드 아키텍처

### 11.1 파일 구조

```
backend/src/main/java/com/kanban/domain/admin/
├── controller/
│   └── AdminController.java        # 48+ 엔드포인트
├── service/
│   └── AdminService.java           # 비즈니스 로직
└── dto/
    ├── AdminRequest.java           # 요청 DTO (10개 inner class)
    └── AdminResponse.java          # 응답 DTO (15+ inner class)
```

### 11.2 의존성

```
AdminController
  ├── AdminService (주 서비스)
  ├── InquiryService (문의 위임)
  └── MonitoringService (모니터링 위임, 별도 컨트롤러)

AdminService
  ├── UserRepository
  ├── BoardRepository
  ├── BoardMemberRepository
  ├── TaskRepository
  ├── SubscriptionRepository
  ├── AnnouncementRepository
  ├── SystemConfigRepository
  ├── AuthService (비번 리셋 위임)
  ├── BoardService (보드 생성/삭제 위임)
  └── UserService (계정 삭제 위임)
```

### 11.3 관련 스케줄러

| 스케줄러 | 주기 | 관련 기능 |
|---------|------|----------|
| `MonitoringScheduler` | 1시간/5분/매일 3시 | 메트릭 플러시, 알림 체크, 데이터 정리 |
| `SubscriptionScheduler` | 매시간 | 구독 만료 처리 (통계에 영향) |
| `BoardCleanupScheduler` | 매일 | 소프트 삭제 7일 후 영구 삭제 |

---

## 12. 종합 평가 및 개선 제안

### 12.1 잘 된 점

1. **완성도 높은 CRUD**: 사용자/보드 관리 기능이 포괄적이며, 비즈니스 규칙 검증이 철저함
2. **안전 장치**: Admin 자기 자신 보호, 마지막 Admin 보호, 소프트 삭제 등 방어적 설계
3. **성능**: N+1 방지 배치 쿼리 패턴 잘 적용
4. **분석 도구**: 가입 추이, DAU/WAU/MAU, 전환율, 다이어리 등 핵심 지표 커버
5. **모니터링**: JVM, DB, API, AI, OpenAI 빌링까지 종합적 모니터링

### 12.2 개선 제안

| 우선순위 | 항목 | 설명 |
|---------|------|------|
| **높음** | 로딩 스피너 통일 | 8개 탭의 커스텀 스피너를 `Loader2` 컴포넌트로 교체 |
| **높음** | alert() 제거 | Monitoring 탭 `alert()` → Toast 컴포넌트로 교체 |
| **중간** | 테두리 토큰 통일 | `border-bridge-border` / `border-foreground/5` → `border-foreground/[0.08]` |
| **중간** | placeholder 통일 | `placeholder-slate-600` → `placeholder-slate-500` |
| **중간** | 에러 모달 개선 | Monitoring 에러 상세를 MotionModal로 리팩토링 |
| **낮음** | 카드 라운드 통일 | Dashboard 카드 `rounded-xl` → `rounded-2xl` |
| **낮음** | 대시보드 차트 추가 | Dashboard 탭에 간단한 미니 차트 (최근 7일 추이 등) 추가 |
| **기능** | 일괄 작업 | 사용자/보드 목록에서 체크박스 선택 후 일괄 처리 (비활성화, Tier 변경 등) |
| **기능** | 검색 히스토리 | 자주 사용하는 검색어/필터 저장 |
| **기능** | 내보내기 | 사용자/보드 목록 CSV 다운로드 |
| **기능** | 활동 로그 | 관리자 행위 감사 로그 (누가, 언제, 무엇을) |

---

*이 문서는 코드 기반 역분석으로 작성되었으며, 실제 기획 의도와 다를 수 있습니다.*
