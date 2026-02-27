# Organization HR Extension - 종합 기획서

> **Version**: v1.3.0
> **Date**: 2026-02-26
> **Status**: ✅ All Implemented (P1~P5 Complete)
> **기존 Flyway 최신**: V64 (organization indexes)
> **HR Extension Migration**: V65~V73

---

## 1. 프로젝트 개요

### 1.1 목적

Organization의 HR/People Management 기능을 확장하여, 단순 멤버 디렉토리를 넘어 **소규모 팀의 실질적인 인사 관리 플랫폼**으로 발전시킨다.

### 1.2 대상 기능 (5개)

| # | 기능 | 설명 | 난이도 | 신규 테이블 | Migration | Status |
|---|------|------|--------|------------|-----------|--------|
| 1 | **기념일/알림** | 생일, 입사기념일 자동 감지 및 알림 | 하 | 2 (설정+메시지) | V65 | ✅ |
| 2 | **조직도** | 부서/팀 계층 시각화, 리포팅 라인 | 중 | 0 (컬럼 추가) | V66~V67 | ✅ |
| 3 | **온보딩 체크리스트** | 신규 멤버 자동 할당 체크리스트 | 중 | 4 | V68~V69 | ✅ |
| 4 | **1:1 미팅 노트** | 매니저-멤버 정기 미팅 기록 | 중 | 3 | V70~V71 | ✅ |
| 5 | **근태 관리** | 출퇴근 기록, 근무시간 집계, 공휴일 연동 | 상 | 3 | V72 | ✅ |

### 1.3 기존 연동 포인트

```
┌─────────────────────────────────────────────────────┐
│                  Organization                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Members  │  │ Dept/JG  │  │ Leave System      │  │
│  │ (HR 필드) │  │ (계층)   │  │ (휴가/잔여)       │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│  ┌────┴──────────────┴─────────────────┴──────────┐  │
│  │              HR Extension Layer                 │  │
│  │                                                 │  │
│  │  ┌─────────┐ ┌──────┐ ┌────────┐ ┌────┐ ┌───┐ │  │
│  │  │기념일   │ │조직도│ │온보딩  │ │1:1 │ │근태│ │  │
│  │  │알림     │ │      │ │체크리스│ │미팅 │ │관리│ │  │
│  │  └─────────┘ └──────┘ └────────┘ └────┘ └───┘ │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 1.4 구현 순서

```
Phase 1: 기념일/알림 (V65)          ← 기존 데이터 활용, Quick Win           ✅ Complete
Phase 2: 조직도 (V66~V67)           ← 시각적 임팩트, 컬럼 추가 (Phase 3 선행 필수) ✅ Complete
Phase 3: 온보딩 체크리스트 (V68~V69) ← 신규 멤버 경험 개선 (manager_id 활용)  ✅ Complete
Phase 4: 1:1 미팅 노트 (V70~V71)    ← 매니저 도구                          ✅ Complete
Phase 5: 근태 관리 (V72)            ← 가장 복잡, Leave + 공휴일 연동        ✅ Complete
+ 공통: 인덱스/수정 (V73)           ← 누락 인덱스 추가, timezone 기본값 수정
```

> **의존성**: Phase 2(조직도)에서 추가하는 `manager_id`를 Phase 3(온보딩)의 MANAGER 자동 매핑에서 사용하므로, 반드시 Phase 2 → Phase 3 순서 준수.

### 1.5 타임존 전략

기념일 감지, 근태 판별 등에서 타임존이 핵심이므로 **멤버별 타임존** 방식을 채택.

```
organization_members.timezone (VARCHAR(50), DEFAULT 'Asia/Seoul')
→ 기념일 스케줄러: 멤버의 timezone 기준 "오늘" 계산
→ 근태 지각 판별: 멤버의 timezone 기준 출근 시각 변환
→ 프론트엔드: useHolidays 훅의 국가 설정과 연동
```

### 1.6 공휴일 전략

```
공휴일 판별:
├─ 프론트엔드: date-holidays 라이브러리 (20개국, 표시 전용)
├─ 백엔드: org_custom_holidays 테이블만 체크
│   → 표준 공휴일(설날 등)은 서버에서 판별하지 않음
│   → Admin이 필요한 공휴일을 org_custom_holidays에 직접 등록
│   → 근태 status = HOLIDAY 는 org_custom_holidays 기준
└─ 프론트엔드 캘린더: date-holidays + org_custom_holidays 합산 표시
```

### 1.7 Soft Delete 정책

기존 Organization/Board와 일관성을 위해 신규 테이블에도 **soft delete** 적용.

```
Soft Delete 대상 (deleted_at TIMESTAMP NULLABLE 추가):
├─ org_onboarding_instances      → 멤버 퇴사 시 soft delete
├─ org_one_on_ones               → 관계 해제 시 soft delete
├─ org_one_on_one_meetings       → 미팅 삭제 시 soft delete
└─ org_attendance_records        → 관리자 삭제 시 soft delete

Hard Delete 유지 (CASCADE):
├─ org_anniversary_settings      → 조직 삭제 시 함께 삭제
├─ org_celebration_messages      → 복구 필요성 낮음
├─ org_onboarding_templates      → 인스턴스는 스냅샷이므로 무관
├─ org_onboarding_template_items → 템플릿 삭제 시 함께 삭제
├─ org_onboarding_instance_items → 인스턴스 삭제 시 함께 삭제
├─ org_one_on_one_action_items   → 미팅 삭제 시 함께 삭제
├─ org_custom_holidays           → 단순 설정
└─ org_attendance_policies       → 단순 설정
```

### 1.8 공통 기술 규칙

#### 동시성 제어
- 출퇴근(clock-in/out), 온보딩 토글 등 상태 변경 API → `@Lock(PESSIMISTIC_WRITE)` 적용
- 온보딩 `completed_items` 카운터 → 토글 시 `SELECT COUNT(*) WHERE is_completed = true`로 재계산 (±1 방식 금지)

#### 스케줄러 중복 방지
- 멀티 인스턴스(EB) 환경에서 스케줄러 동시 실행 방지
- 기존 프로젝트 패턴에 따라 Redis 기반 분산 락 또는 `@SchedulerLock` 적용
- 알림 발송 시 멱등성 보장: `(member_id, notification_type, target_date)` 기준 중복 체크

#### 윤년 생일 처리
- `birth_date`가 2월 29일인 경우, 비윤년에는 **2월 28일**에 기념일 알림 발송

#### 멤버 퇴사(RESIGNED) 시 처리
```
멤버 work_status → RESIGNED 변경 시:
├─ 온보딩: IN_PROGRESS 인스턴스 → soft delete (자동)
├─ 1:1 관계: is_active = false (자동)
├─ 근태: 당일 미퇴근 기록 → 자동 퇴근 처리
├─ 매니저 해제: reports의 manager_id → NULL (ON DELETE SET NULL)
│   └─ reports 멤버에게 "매니저가 변경되었습니다" 알림
└─ 기념일: RESIGNED 멤버는 대상에서 자동 제외 (기존 로직)
```

#### 페이지네이션
- 축하 메시지 목록 (`GET /messages`) → cursor 페이지네이션 추가
- 온보딩 인스턴스 목록 (`GET /instances`) → 소규모이므로 전체 조회 유지
- 1:1 미팅 목록 → cursor 페이지네이션 (이미 명시됨)

#### `is_recurring` 공휴일 매칭 쿼리
```sql
WHERE (is_recurring = true
       AND EXTRACT(MONTH FROM holiday_date) = :month
       AND EXTRACT(DAY FROM holiday_date) = :day)
   OR (is_recurring = false AND holiday_date = :date)
```

---

# Feature 1: 기념일/알림 (Anniversary & Celebrations)

## F1-1. 개요

### 목적
멤버의 생일, 입사 기념일을 자동으로 감지하고 조직 대시보드에 표시 + 알림 발송. 기존 `birth_date`, `hire_date` 필드를 활용하므로 신규 데이터 입력 없이 즉시 동작. 멤버별 `timezone` 기준으로 "오늘"을 판별.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 대시보드 위젯 | 이번 주/이번 달 기념일 목록 표시 |
| 알림 발송 | 당일 아침 조직 멤버 전체에게 알림 (FCM + In-App) |
| 기념일 설정 | 조직별로 알림 ON/OFF, 표시할 기념일 종류 선택 |
| 기념 메시지 | 간단한 축하 메시지 작성 (선택 사항) |

### 데이터 소스

```
organization_members.birth_date  → 생일
organization_members.hire_date   → 입사기념일
→ 추가 입력 불필요, 기존 HR 프로필에서 자동 추출
```

## F1-2. IA (화면 설계)

### F1-2-1. 대시보드 위젯 (`OrgDashboardTab` 내)

```
┌─────────────────────────────────────────────────────────┐
│  OrgDashboardTab                                        │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ 구성원   │ │ 보드     │ │ 오늘 휴가│                │
│  │   12     │ │    3     │ │    1     │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🎂 다가오는 기념일                    이번 달 ▾  │  │
│  │─────────────────────────────────────────────────  │  │
│  │                                                   │  │
│  │  ┌─ 오늘 ──────────────────────────────────────┐ │  │
│  │  │ 🎂 김철수  생일  ·  축하 메시지 보내기 →    │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  ┌─ 이번 주 ──────────────────────────────────┐  │  │
│  │  │ 🎉 이영희  입사 2주년 (2/28)               │  │  │
│  │  │ 🎂 박민수  생일 (3/1)                      │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                   │  │
│  │  ┌─ 이번 달 ──────────────────────────────────┐  │  │
│  │  │ 🎉 최지은  입사 1주년 (3/15)               │  │  │
│  │  │ 🎂 정동욱  생일 (3/22)                     │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                   │  │
│  │  기념일이 없습니다 (empty state)                 │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  [기존: 공지사항, 연결된 보드, 오늘 휴가자]             │
└─────────────────────────────────────────────────────────┘
```

### F1-2-2. 축하 메시지 모달

```
┌──────────────────────────────────────┐
│ ─── gradient line ───                │
│                                      │
│  🎂 김철수님의 생일을 축하합니다!    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 축하 메시지를 남겨보세요...    │  │
│  │                                │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ 축하 메시지 ──────────────────┐  │
│  │ 👤 이영희: 생일 축하해요! 🎉  │  │
│  │ 👤 박민수: 오늘도 화이팅!      │  │
│  └────────────────────────────────┘  │
│                                      │
│  Esc 닫기              [보내기]      │
└──────────────────────────────────────┘
```

### F1-2-3. 기념일 설정 (`OrgSettingsTab` 내 섹션)

```
┌───────────────────────────────────────────────────────┐
│ 기념일 설정                                           │
│                                                       │
│  알림 활성화                              [토글 ON]   │
│                                                       │
│  표시할 기념일:                                       │
│    ☑ 생일                                             │
│    ☑ 입사 기념일                                      │
│                                                       │
│  알림 시점:                                           │
│    ○ 당일만                                           │
│    ● 전날 + 당일                                      │
│    ○ 3일 전 + 당일                                    │
│                                                       │
│  대시보드 표시 범위:                                  │
│    ○ 이번 주                                          │
│    ● 이번 달                                          │
└───────────────────────────────────────────────────────┘
```

## F1-3. ERD

### 신규 테이블

#### `org_anniversary_settings`

**목적:** 조직별 기념일 알림 설정

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, UNIQUE, NOT NULL | 조직 ID |
| birthday_enabled | BOOLEAN | NOT NULL, DEFAULT true | 생일 알림 활성화 |
| hire_anniversary_enabled | BOOLEAN | NOT NULL, DEFAULT true | 입사기념일 알림 활성화 |
| notify_timing | VARCHAR(20) | NOT NULL, DEFAULT 'DAY_BEFORE' | 알림 시점 |
| dashboard_range | VARCHAR(20) | NOT NULL, DEFAULT 'THIS_MONTH' | 대시보드 표시 범위 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

#### `org_celebration_messages`

**목적:** 기념일 축하 메시지

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| target_member_id | VARCHAR(36) | FK, NOT NULL | 축하 대상 멤버 |
| author_id | VARCHAR(36) | FK, NOT NULL | 작성자 (User) |
| anniversary_type | VARCHAR(20) | NOT NULL | BIRTHDAY / HIRE_ANNIVERSARY |
| anniversary_date | DATE | NOT NULL | 기념일 날짜 |
| message | VARCHAR(500) | NOT NULL | 축하 메시지 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

### Enum 정의

```
AnniversaryType: BIRTHDAY, HIRE_ANNIVERSARY
NotifyTiming: SAME_DAY, DAY_BEFORE, THREE_DAYS_BEFORE
DashboardRange: THIS_WEEK, THIS_MONTH
```

### Flyway Migration: V65

```sql
-- V65__add_anniversary_settings_and_celebrations.sql

-- 멤버별 타임존 컬럼 추가
ALTER TABLE organization_members
ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul';

CREATE TABLE org_anniversary_settings (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    birthday_enabled BOOLEAN NOT NULL DEFAULT true,
    hire_anniversary_enabled BOOLEAN NOT NULL DEFAULT true,
    notify_timing VARCHAR(20) NOT NULL DEFAULT 'DAY_BEFORE',
    dashboard_range VARCHAR(20) NOT NULL DEFAULT 'THIS_MONTH',
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_celebration_messages (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    target_member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    author_id VARCHAR(36) NOT NULL REFERENCES users(id),
    anniversary_type VARCHAR(20) NOT NULL,
    anniversary_date DATE NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_celebration_org_date ON org_celebration_messages(organization_id, anniversary_date);
CREATE INDEX idx_celebration_target ON org_celebration_messages(target_member_id, anniversary_date);
-- 동일 멤버/날짜/타입에 작성자당 1개 메시지 보장
CREATE UNIQUE INDEX uq_celebration_author ON org_celebration_messages(target_member_id, author_id, anniversary_type, anniversary_date);
```

## F1-4. API

### 1.1 다가오는 기념일 조회

```
GET /api/v1/organizations/{orgId}/anniversaries/upcoming
Auth: OrgMember+
```

**Query Parameters:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| range | string | THIS_MONTH | THIS_WEEK / THIS_MONTH |

**Response (200):**

```json
{
  "data": {
    "today": [
      {
        "member_id": "uuid",
        "member_name": "김철수",
        "profile_image_url": "https://...",
        "department_name": "개발팀",
        "type": "BIRTHDAY",
        "date": "2026-02-26",
        "years": null,
        "message_count": 3
      }
    ],
    "this_week": [
      {
        "member_id": "uuid",
        "member_name": "이영희",
        "profile_image_url": null,
        "department_name": "디자인팀",
        "type": "HIRE_ANNIVERSARY",
        "date": "2026-02-28",
        "years": 2,
        "message_count": 0
      }
    ],
    "this_month": [
      {
        "member_id": "uuid",
        "member_name": "최지은",
        "profile_image_url": null,
        "department_name": null,
        "type": "HIRE_ANNIVERSARY",
        "date": "2026-03-15",
        "years": 1,
        "message_count": 0
      }
    ]
  }
}
```

**로직:**
1. 조직 멤버 중 `work_status != RESIGNED` 필터
2. `birth_date`에서 월/일 추출 → 올해 날짜와 비교
3. `hire_date`에서 연차 계산 → 입사 기념일 판별
4. 기간별 그룹핑 (today / this_week / this_month)
5. `anniversary_settings` 체크하여 비활성화된 타입 제외

### 1.2 축하 메시지 목록 조회

```
GET /api/v1/organizations/{orgId}/anniversaries/{memberId}/messages
Auth: OrgMember+
```

**Query Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| type | string | BIRTHDAY / HIRE_ANNIVERSARY |
| date | string | 기념일 날짜 (yyyy-MM-dd) |
| cursor | string | 커서 (선택, created_at 기반) |
| size | integer | 페이지 크기 (기본 20) |

**Response (200):**

```json
{
  "data": {
    "messages": [
      {
        "id": "uuid",
        "author_name": "이영희",
        "author_profile_image_url": "https://...",
        "message": "생일 축하해요! 🎉",
        "created_at": "2026-02-26T09:30:00Z"
      }
    ],
    "next_cursor": "cursor-token",
    "has_more": false
  }
}
```

### 1.3 축하 메시지 작성

```
POST /api/v1/organizations/{orgId}/anniversaries/{memberId}/messages
Auth: OrgMember+
```

**Request:**

```json
{
  "type": "BIRTHDAY",
  "date": "2026-02-26",
  "message": "생일 축하합니다!"
}
```

**Response (201):**

```json
{
  "data": {
    "id": "uuid",
    "message": "생일 축하합니다!",
    "created_at": "2026-02-26T09:30:00Z"
  }
}
```

**Validation:**
- `message` 1~500자
- 같은 멤버/같은 날짜/같은 타입에 본인이 이미 메시지를 남긴 경우 → 409 `CELEBRATION_MESSAGE_ALREADY_EXISTS`
- 대상 멤버 work_status = RESIGNED → 404

### 1.4 축하 메시지 수정/삭제

```
PUT /api/v1/organizations/{orgId}/anniversaries/{memberId}/messages/{messageId}
Auth: 작성자 본인
```

**Request:**

```json
{
  "message": "수정된 축하 메시지!"
}
```

```
DELETE /api/v1/organizations/{orgId}/anniversaries/{memberId}/messages/{messageId}
Auth: 작성자 본인 / OrgAdmin+
```

### 1.5 기념일 설정 조회/수정

```
GET /api/v1/organizations/{orgId}/anniversary-settings
Auth: OrgAdmin+
```

```
PUT /api/v1/organizations/{orgId}/anniversary-settings
Auth: OrgAdmin+
```

**Request (PUT):**

```json
{
  "birthday_enabled": true,
  "hire_anniversary_enabled": true,
  "notify_timing": "DAY_BEFORE",
  "dashboard_range": "THIS_MONTH"
}
```

## F1-5. Flows

### 기념일 감지 & 알림 플로우 (스케줄러)

```
매일 매시 정각 (00분) 스케줄러 실행 (멤버별 타임존 대응)
│
├─ 1. 모든 조직의 anniversary_settings 조회
│     └─ 활성화된 조직만 필터
│
├─ 2. 각 조직의 ACTIVE 멤버 조회:
│     ├─ 멤버의 timezone 기준 현재 시각이 09:00인지 확인
│     │   (예: UTC 00:00 실행 시 → timezone=Asia/Seoul 멤버는 09:00 KST)
│     ├─ 해당 멤버의 birth_date, hire_date 조회
│     ├─ notify_timing에 따라 대상 날짜 계산 (멤버 timezone 기준 "오늘")
│     │   ├─ SAME_DAY: 기념일 당일만
│     │   ├─ DAY_BEFORE: 전날 + 기념일 당일
│     │   └─ THREE_DAYS_BEFORE: 3일 전 ~ 기념일 당일 (매일)
│     │
│     └─ 3. 기념일 해당 멤버 발견 시:
│           ├─ In-App 알림 생성 (NotificationType.ANNIVERSARY)
│           ├─ FCM 푸시 발송 (opt-in 멤버만)
│           └─ OrgActivity 로그 기록
│
└─ 4. 완료
```

### 축하 메시지 플로우

```
사용자가 대시보드 기념일 위젯에서 "축하 메시지 보내기" 클릭
│
├─ 1. CelebrationModal 열림
│     ├─ 기존 메시지 목록 로드 (GET /messages)
│     └─ 메시지 입력 폼 표시
│
├─ 2. 메시지 작성 후 "보내기"
│     ├─ POST /messages → 저장
│     ├─ 대상 멤버에게 In-App 알림
│     └─ 위젯의 message_count 갱신
│
└─ 3. 모달 닫기 → 대시보드 위젯 리프레시
```

---

# Feature 2: 조직도 (Organization Chart)

## F2-1. 개요

### 목적
부서/팀 계층 구조와 멤버 배치를 시각적으로 표현. 현재 `departments`, `job_groups`와 멤버 데이터를 트리 형태로 렌더링.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 트리 뷰 | 조직 → 부서 → 멤버 계층 트리 |
| 리포팅 라인 | 멤버 간 보고 관계 (manager → reports) |
| 드래그 이동 | 멤버를 다른 부서로 드래그 이동 (Admin+) |
| 검색/필터 | 멤버 검색, 부서 접기/펼치기 |
| 멤버 프로필 | 클릭 시 MemberDetailModal 연결 |

### 핵심 결정: 리포팅 라인

기존 `organization_members`에 `manager_id` (자기참조 FK) 추가로 리포팅 라인 구현.

```
조직
├── 개발팀
│   ├── 김철수 (팀장) ← manager_id: null (최상위)
│   │   ├── 이영희 (프론트) ← manager_id: 김철수
│   │   └── 박민수 (백엔드) ← manager_id: 김철수
│   └── 미배정 멤버
├── 디자인팀
│   └── 최지은 (리더) ← manager_id: null
└── 미배정
    └── 정동욱 ← department: null
```

## F2-2. IA (화면 설계)

### 새로운 탭: Organization Chart

`OrganizationDetailPage`에 **6번째 탭** 추가:

```
[대시보드] [구성원] [조직도] [보드] [휴가] [설정]
                      ^^^^ NEW
```

### F2-2-1. 조직도 탭 (`OrgChartTab`)

```
┌──────────────────────────────────────────────────────────┐
│  조직도                                                   │
│                                                           │
│  ┌─ 툴바 ──────────────────────────────────────────────┐ │
│  │ 🔍 멤버 검색...    [트리뷰] [리스트뷰]   [펼치기]   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─ 트리 뷰 ──────────────────────────────────────────┐  │
│  │                                                     │  │
│  │  ┌──────────────────────────────┐                   │  │
│  │  │ 🏢 우리 조직                 │                   │  │
│  │  │ 12명 · 3개 부서              │                   │  │
│  │  └──────────┬───────────────────┘                   │  │
│  │             │                                       │  │
│  │    ┌────────┼────────┬──────────┐                   │  │
│  │    │        │        │          │                    │  │
│  │  ┌─┴──┐  ┌─┴──┐  ┌──┴──┐  ┌───┴───┐               │  │
│  │  │개발 │  │디자│  │마케 │  │미배정  │               │  │
│  │  │ 5명 │  │ 3명│  │ 2명 │  │  2명   │               │  │
│  │  └─┬───┘  └─┬──┘  └──┬──┘  └───────┘               │  │
│  │    │        │        │                              │  │
│  │  ┌─┴───────────────────┐                            │  │
│  │  │ 👤 김철수 · 팀장     │ ← 매니저 노드             │  │
│  │  │ 정규직 · 입사 2년    │                            │  │
│  │  └─┬───────────────────┘                            │  │
│  │    │                                                │  │
│  │  ┌─┴──────────┬──────────────┐                      │  │
│  │  │            │              │                       │  │
│  │  │ 👤 이영희  │ 👤 박민수   │  ← 직속 리포트        │  │
│  │  │ 프론트     │ 백엔드      │                       │  │
│  │  └────────────┴─────────────┘                       │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  * Admin 이상: 멤버 카드를 드래그하여 부서 이동 가능      │
└──────────────────────────────────────────────────────────┘
```

### F2-2-2. 리스트 뷰 (대안 레이아웃)

```
┌──────────────────────────────────────────────────────────┐
│  ▼ 개발팀 (5명)                                          │
│  ├─ 👤 김철수 · 팀장 · 정규직           [매니저 해제]    │
│  │  ├─ 👤 이영희 · 프론트엔드 · 정규직  [매니저 변경]    │
│  │  └─ 👤 박민수 · 백엔드 · 계약직      [매니저 변경]    │
│  ├─ 👤 한소영 · 풀스택 · 인턴           [매니저 지정]    │
│  └─ 👤 윤기훈 · DevOps · 정규직         [매니저 지정]    │
│                                                           │
│  ▼ 디자인팀 (3명)                                        │
│  ├─ 👤 최지은 · UX 리드 · 정규직                         │
│  │  └─ 👤 송예진 · UI 디자이너 · 정규직                  │
│  └─ 👤 오태현 · 그래픽 · 파트타임                        │
│                                                           │
│  ▶ 마케팅팀 (2명) ← 접힌 상태                            │
│                                                           │
│  ▼ 미배정 (2명)                                          │
│  ├─ 👤 정동욱                                            │
│  └─ 👤 이수빈                                            │
└──────────────────────────────────────────────────────────┘
```

## F2-3. ERD

### 기존 테이블 수정

#### `organization_members` 컬럼 추가

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| manager_id | VARCHAR(36) | FK (self), NULLABLE | 직속 매니저 멤버 ID |

### Enum 추가 (프론트 전용)

```
OrgChartViewMode: TREE, LIST
```

### Flyway Migration: V66~V67

> **구현 시 변경**: 기존 알림 테이블의 `board_id` nullable 변경(V66)과 매니저 컬럼 추가(V67)로 분리됨.

```sql
-- V66__make_notification_board_nullable.sql
-- 조직 알림에서는 board_id가 필요 없으므로 nullable 변경
ALTER TABLE notifications ALTER COLUMN board_id DROP NOT NULL;

-- V67__add_manager_to_organization_members.sql

ALTER TABLE organization_members
ADD COLUMN manager_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL;

CREATE INDEX idx_org_members_manager ON organization_members(manager_id);
```

## F2-4. API

### 2.1 조직도 데이터 조회

```
GET /api/v1/organizations/{orgId}/chart
Auth: OrgMember+
```

**Response (200):**

```json
{
  "data": {
    "organization_name": "우리 조직",
    "total_members": 12,
    "departments": [
      {
        "id": "dept-uuid",
        "name": "개발팀",
        "display_order": 1,
        "members": [
          {
            "id": "member-uuid",
            "user_name": "김철수",
            "profile_image_url": "https://...",
            "job_title": "팀장",
            "contract_type": "FULL_TIME",
            "work_status": "ACTIVE",
            "manager_id": null,
            "reports": [
              {
                "id": "member-uuid-2",
                "user_name": "이영희",
                "profile_image_url": null,
                "job_title": "프론트엔드",
                "contract_type": "FULL_TIME",
                "work_status": "ACTIVE",
                "manager_id": "member-uuid",
                "reports": []
              }
            ]
          }
        ]
      }
    ],
    "unassigned": [
      {
        "id": "member-uuid-x",
        "user_name": "정동욱",
        "profile_image_url": null,
        "job_title": null,
        "contract_type": "FULL_TIME",
        "work_status": "ACTIVE",
        "manager_id": null,
        "reports": []
      }
    ]
  }
}
```

**로직:**
1. 조직 멤버 전체 조회 (RESIGNED 제외)
2. 부서별 그룹핑
3. 각 부서 내 `manager_id = null` 인 멤버를 루트로
4. 재귀적으로 reports 트리 구성
5. `department_id = null` 멤버는 "미배정" 그룹

### 2.2 매니저 지정/변경

```
PUT /api/v1/organizations/{orgId}/members/{memberId}/manager
Auth: OrgAdmin+
```

**Request:**

```json
{
  "manager_id": "member-uuid"
}
```

- `manager_id: null` → 매니저 해제
- 자기 자신 지정 불가 → 400 `SELF_MANAGER_NOT_ALLOWED`
- 순환 참조 감지 → 400 `CIRCULAR_MANAGER_REFERENCE`

**로직:**
1. memberId와 manager_id가 같은 조직 소속인지 확인
2. 순환 참조 체크: manager 체인을 따라가며 memberId 등장 여부 확인 (max depth 10, 초과 시 400 `MANAGER_CHAIN_TOO_DEEP`)
3. manager_id 업데이트
4. OrgActivity 로그: `MANAGER_CHANGED`

### 2.3 부서 이동 (드래그)

기존 `PUT /api/v1/organizations/{orgId}/members/{memberId}` 의 `department_id` 필드 활용.

## F2-5. Flows

### 조직도 렌더링 플로우

```
1. OrgChartTab 마운트
2. GET /chart → 부서별 트리 데이터 수신
3. viewMode에 따라 렌더링:
   - TREE: 커스텀 트리 다이어그램 (div + CSS flex/grid, Framer Motion 애니메이션)
   - LIST: 들여쓰기 리스트 뷰
   * 드래그 이동은 기존 @dnd-kit 활용
4. 멤버 클릭 → MemberDetailModal 열기
5. [Admin+] 멤버 드래그 → 부서 변경 API 호출 → 트리 리프레시
```

### 매니저 지정 플로우

```
1. 리스트뷰에서 멤버 행의 [매니저 지정] 클릭
2. 같은 부서 멤버 드롭다운 표시 (또는 전체 멤버 검색)
3. 매니저 선택 → PUT /members/{id}/manager
4. 순환 참조 시 에러 토스트 표시
5. 성공 시 트리 리프레시 + Activity 로그
```

---

# Feature 3: 온보딩 체크리스트 (Onboarding Checklist)

## F3-1. 개요

### 목적
신규 멤버 초대 시 자동으로 할당되는 온보딩 체크리스트. 관리자가 템플릿을 미리 구성하면, 새 멤버 합류 시 자동 생성.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 템플릿 관리 | Admin이 온보딩 체크리스트 템플릿 생성/수정 |
| 자동 할당 | 새 멤버 합류 시 체크리스트 자동 생성 |
| 진행 추적 | 멤버별 온보딩 진행률 확인 |
| 담당자 지정 | 각 항목에 담당자(매니저/본인) 지정 가능 |
| 기한 설정 | 각 항목에 D+N 기한 (합류일 기준) |

### 설계 원칙

```
템플릿 (Template)          인스턴스 (Instance)
─────────────────          ──────────────────
Admin이 미리 구성     →    멤버 합류 시 복사 생성
수정해도 기존 인스턴스      각 멤버별 독립 체크
영향 없음                  완료/미완료 개별 추적
```

## F3-2. IA (화면 설계)

### 대시보드 위젯

```
┌───────────────────────────────────────────────────────┐
│ 📋 온보딩 진행 현황                          전체 보기│
│───────────────────────────────────────────────────────│
│                                                       │
│  👤 정동욱 · 2/26 합류 · 진행률 30%                   │
│  ████████░░░░░░░░░░░░░░░░░░░░░                        │
│  3/10 완료 · 다음: 슬랙 채널 가입 (D+1)               │
│                                                       │
│  👤 이수빈 · 2/24 합류 · 진행률 70%                   │
│  █████████████████████░░░░░░░░░                        │
│  7/10 완료 · 다음: 첫 PR 제출 (D+7)                   │
│                                                       │
│  진행 중인 온보딩이 없습니다 (empty state)             │
└───────────────────────────────────────────────────────┘
```

### 템플릿 관리 (`OrgSettingsTab` 내 섹션)

```
┌───────────────────────────────────────────────────────┐
│ 온보딩 체크리스트 템플릿                    [+ 템플릿]│
│───────────────────────────────────────────────────────│
│                                                       │
│  ┌─ 기본 온보딩 ─────────────────── [수정] [삭제] ─┐ │
│  │ 10개 항목 · 자동 할당: ON                        │ │
│  │                                                   │ │
│  │  ☐ 1. 팀 소개 문서 읽기          D+0  담당: -    │ │
│  │  ☐ 2. 슬랙 채널 가입             D+1  담당: -    │ │
│  │  ☐ 3. 개발 환경 세팅             D+1  담당: 매니저│ │
│  │  ☐ 4. Git 리포지토리 접근 설정   D+1  담당: 매니저│ │
│  │  ☐ 5. 코드 컨벤션 문서 읽기      D+2  담당: -    │ │
│  │  ☐ 6. 1:1 미팅 (매니저)          D+3  담당: 매니저│ │
│  │  ☐ 7. 보드 투어                  D+3  담당: 매니저│ │
│  │  ☐ 8. 첫 태스크 할당             D+5  담당: 매니저│ │
│  │  ☐ 9. 첫 PR 제출                 D+7  담당: -    │ │
│  │  ☐10. 온보딩 피드백 작성          D+14 담당: -    │ │
│  │                                                   │ │
│  │  [+ 항목 추가]                                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 디자이너 온보딩 ────────────── [수정] [삭제] ──┐ │
│  │ 8개 항목 · 자동 할당: ON (직군: 디자인)          │ │
│  │ ...                                               │ │
│  └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 멤버별 온보딩 상세 (MemberDetailModal 내 탭 또는 섹션)

```
┌──────────────────────────────────────────────────────┐
│ 📋 온보딩 진행                                        │
│                                                       │
│  기본 온보딩 · 7/10 완료 · 70%                        │
│  █████████████████████░░░░░░░░░                        │
│                                                       │
│  ✅ 1. 팀 소개 문서 읽기         2/24 완료             │
│  ✅ 2. 슬랙 채널 가입            2/24 완료             │
│  ✅ 3. 개발 환경 세팅            2/25 완료  👤 매니저  │
│  ✅ 4. Git 리포지토리 접근 설정  2/25 완료  👤 매니저  │
│  ✅ 5. 코드 컨벤션 문서 읽기     2/25 완료             │
│  ✅ 6. 1:1 미팅 (매니저)         2/26 완료  👤 매니저  │
│  ✅ 7. 보드 투어                 2/26 완료  👤 매니저  │
│  ☐  8. 첫 태스크 할당            기한: 3/1  👤 매니저  │
│  ☐  9. 첫 PR 제출               기한: 3/3             │
│  ☐ 10. 온보딩 피드백 작성        기한: 3/10            │
│                                                       │
│  [완료 처리] ← Admin/매니저가 대신 체크 가능           │
└──────────────────────────────────────────────────────┘
```

## F3-3. ERD

### 신규 테이블

#### `org_onboarding_templates`

**목적:** 온보딩 체크리스트 템플릿 (조직별)

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| name | VARCHAR(100) | NOT NULL | 템플릿 이름 |
| description | VARCHAR(500) | NULLABLE | 설명 |
| auto_assign | BOOLEAN | NOT NULL, DEFAULT true | 자동 할당 여부 |
| target_department_id | VARCHAR(36) | FK, NULLABLE | 특정 부서 대상 (null=전체) |
| target_job_group_id | VARCHAR(36) | FK, NULLABLE | 특정 직군 대상 (null=전체) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | 활성 여부 |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | 정렬 순서 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

#### `org_onboarding_template_items`

**목적:** 템플릿 내 개별 항목

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| template_id | VARCHAR(36) | FK, NOT NULL | 템플릿 ID |
| title | VARCHAR(200) | NOT NULL | 항목 제목 |
| description | VARCHAR(500) | NULLABLE | 상세 설명 |
| due_day_offset | INTEGER | NULLABLE | 합류일 기준 D+N |
| assignee_role | VARCHAR(20) | NULLABLE | 담당자 역할 (MANAGER, SELF) |
| display_order | INTEGER | NOT NULL | 정렬 순서 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |

#### `org_onboarding_instances`

**목적:** 멤버별 온보딩 인스턴스 (템플릿 복사본)

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| member_id | VARCHAR(36) | FK, NOT NULL | 대상 멤버 ID |
| template_name | VARCHAR(100) | NOT NULL | 원본 템플릿 이름 (스냅샷) |
| source_template_id | VARCHAR(36) | FK, NULLABLE | 원본 템플릿 ID (삭제 시 null) |
| total_items | INTEGER | NOT NULL | 전체 항목 수 |
| completed_items | INTEGER | NOT NULL, DEFAULT 0 | 완료 항목 수 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'IN_PROGRESS' | IN_PROGRESS / COMPLETED |
| started_at | TIMESTAMP | NOT NULL | 시작일 (합류일) |
| completed_at | TIMESTAMP | NULLABLE | 전체 완료일 |
| deleted_at | TIMESTAMP | NULLABLE | 삭제 시각 (soft delete) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |

#### `org_onboarding_instance_items`

**목적:** 인스턴스 내 개별 항목 (체크 가능)

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| instance_id | VARCHAR(36) | FK, NOT NULL | 인스턴스 ID |
| title | VARCHAR(200) | NOT NULL | 항목 제목 |
| description | VARCHAR(500) | NULLABLE | 상세 설명 |
| due_date | DATE | NULLABLE | 실제 기한 (합류일 + offset 계산) |
| assignee_id | VARCHAR(36) | FK, NULLABLE | 실제 담당자 멤버 ID |
| is_completed | BOOLEAN | NOT NULL, DEFAULT false | 완료 여부 |
| completed_at | TIMESTAMP | NULLABLE | 완료 시각 |
| completed_by | VARCHAR(36) | FK, NULLABLE | 완료 처리한 사람 |
| display_order | INTEGER | NOT NULL | 정렬 순서 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |

### Enum 정의

```
OnboardingStatus: IN_PROGRESS, COMPLETED
AssigneeRole: MANAGER, SELF (템플릿용 - 인스턴스 생성 시 실제 멤버로 매핑)
```

### Flyway Migration: V68~V69

> **구현 시 변경**: V66 분리로 인해 1 버전 오프셋 발생 (V67→V68, V68→V69).

```sql
-- V68__create_onboarding_templates.sql

CREATE TABLE org_onboarding_templates (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    auto_assign BOOLEAN NOT NULL DEFAULT true,
    target_department_id VARCHAR(36) REFERENCES org_departments(id) ON DELETE SET NULL,
    target_job_group_id VARCHAR(36) REFERENCES org_job_groups(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_onboarding_template_items (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NOT NULL REFERENCES org_onboarding_templates(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    due_day_offset INTEGER,
    assignee_role VARCHAR(20),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_onboarding_tmpl_org ON org_onboarding_templates(organization_id);
CREATE INDEX idx_onboarding_tmpl_items ON org_onboarding_template_items(template_id);

-- V69__create_onboarding_instances.sql

CREATE TABLE org_onboarding_instances (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    source_template_id VARCHAR(36) REFERENCES org_onboarding_templates(id) ON DELETE SET NULL,
    template_name VARCHAR(100) NOT NULL,
    total_items INTEGER NOT NULL,
    completed_items INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_onboarding_instance_items (
    id VARCHAR(36) PRIMARY KEY,
    instance_id VARCHAR(36) NOT NULL REFERENCES org_onboarding_instances(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    due_date DATE,
    assignee_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP,
    completed_by VARCHAR(36) REFERENCES users(id),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_onboarding_inst_org ON org_onboarding_instances(organization_id);
CREATE INDEX idx_onboarding_inst_member ON org_onboarding_instances(member_id);
CREATE INDEX idx_onboarding_inst_items ON org_onboarding_instance_items(instance_id);
```

## F3-4. API

### 3.1 템플릿 CRUD

```
GET /api/v1/organizations/{orgId}/onboarding/templates
Auth: OrgAdmin+
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "tmpl-uuid",
      "name": "기본 온보딩",
      "description": "모든 신규 멤버 대상",
      "auto_assign": true,
      "target_department": null,
      "target_job_group": null,
      "is_active": true,
      "item_count": 10,
      "display_order": 1
    }
  ]
}
```

```
POST /api/v1/organizations/{orgId}/onboarding/templates
Auth: OrgAdmin+
```

**Request:**

```json
{
  "name": "기본 온보딩",
  "description": "모든 신규 멤버 대상",
  "auto_assign": true,
  "target_department_id": null,
  "target_job_group_id": null,
  "items": [
    {
      "title": "팀 소개 문서 읽기",
      "description": "Notion 팀 위키 참고",
      "due_day_offset": 0,
      "assignee_role": "SELF"
    },
    {
      "title": "개발 환경 세팅",
      "due_day_offset": 1,
      "assignee_role": "MANAGER"
    }
  ]
}
```

```
PUT /api/v1/organizations/{orgId}/onboarding/templates/{templateId}
Auth: OrgAdmin+
```

```
DELETE /api/v1/organizations/{orgId}/onboarding/templates/{templateId}
Auth: OrgAdmin+
```

- 삭제 시 CASCADE로 template_items도 삭제
- 이미 생성된 인스턴스에는 영향 없음 (스냅샷)

### 3.2 인스턴스 조회

```
GET /api/v1/organizations/{orgId}/onboarding/instances
Auth: OrgAdmin+ (전체) / OrgMember (본인만)
```

**Query Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| status | string | IN_PROGRESS / COMPLETED |
| member_id | string | 특정 멤버 필터 |

**Response (200):**

```json
{
  "data": [
    {
      "id": "inst-uuid",
      "member_id": "member-uuid",
      "member_name": "정동욱",
      "member_profile_image_url": null,
      "template_name": "기본 온보딩",
      "total_items": 10,
      "completed_items": 3,
      "progress_percent": 30,
      "status": "IN_PROGRESS",
      "started_at": "2026-02-26T00:00:00Z",
      "next_item": {
        "title": "슬랙 채널 가입",
        "due_date": "2026-02-27"
      }
    }
  ]
}
```

### 3.3 인스턴스 항목 조회

```
GET /api/v1/organizations/{orgId}/onboarding/instances/{instanceId}/items
Auth: OrgAdmin+ / 본인
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "item-uuid",
      "title": "팀 소개 문서 읽기",
      "description": "Notion 팀 위키 참고",
      "due_date": "2026-02-26",
      "assignee_id": null,
      "assignee_name": null,
      "is_completed": true,
      "completed_at": "2026-02-26T05:30:00Z",
      "completed_by_name": "정동욱",
      "display_order": 1
    }
  ]
}
```

### 3.4 항목 완료 토글

```
PUT /api/v1/organizations/{orgId}/onboarding/instances/{instanceId}/items/{itemId}/toggle
Auth: OrgAdmin+ / 본인 / 담당자
```

**Response (200):**

```json
{
  "data": {
    "is_completed": true,
    "completed_at": "2026-02-26T09:00:00Z",
    "instance_progress": {
      "completed_items": 4,
      "total_items": 10,
      "progress_percent": 40,
      "status": "IN_PROGRESS"
    }
  }
}
```

**로직:**
1. `@Lock(PESSIMISTIC_WRITE)` — 인스턴스 행 잠금
2. 현재 상태 반전 (true ↔ false)
3. `completed_at`, `completed_by` 업데이트
4. `instances.completed_items` = `SELECT COUNT(*) WHERE is_completed = true` (카운터 재계산)
5. 모든 항목 완료 시 `status = COMPLETED`, `completed_at` 설정
6. 담당자 또는 대상 멤버에게 알림 (완료 시)

### 3.5 수동 온보딩 할당

```
POST /api/v1/organizations/{orgId}/onboarding/instances
Auth: OrgAdmin+
```

**Request:**

```json
{
  "member_id": "member-uuid",
  "template_id": "tmpl-uuid"
}
```

- 이미 같은 템플릿의 IN_PROGRESS 인스턴스가 있으면 → 409 `ONBOARDING_ALREADY_ASSIGNED`

## F3-5. Flows

### 자동 온보딩 할당 플로우

```
1. 새 멤버가 조직에 합류 (invite accept / admin invite)
   │
2. OrganizationService.inviteMember() 또는 OrgInviteService.acceptInvite()
   │
3. 조직의 활성 온보딩 템플릿 조회
   │
   ├─ 각 템플릿의 조건 확인:
   │   ├─ auto_assign = true?
   │   ├─ target_department_id 일치? (null이면 전체)
   │   └─ target_job_group_id 일치? (null이면 전체)
   │
4. 조건 맞는 템플릿마다:
   │
   ├─ OnboardingInstance 생성
   │   ├─ started_at = 멤버 joined_at
   │   └─ template_name = 현재 템플릿 이름 (스냅샷)
   │
   ├─ OnboardingInstanceItem 생성 (템플릿 항목 복사)
   │   ├─ due_date = joined_at + due_day_offset
   │   └─ assignee_id 매핑:
   │       ├─ MANAGER → member.manager_id (없으면 null)
   │       └─ SELF → member 본인
   │
5. 대상 멤버에게 온보딩 시작 알림
6. 매니저에게 "새 멤버 온보딩 시작" 알림
```

### 진행 추적 플로우

```
멤버 또는 관리자가 항목 체크
│
├─ PUT /toggle → is_completed 반전
│
├─ 완료 시:
│   ├─ completed_items++ → progress_percent 재계산
│   ├─ 전체 완료 → status = COMPLETED, Activity 로그
│   └─ 담당자 있으면 → 알림 ("항목 완료됨")
│
└─ 미완료로 되돌리기 시:
    └─ completed_items-- → status = IN_PROGRESS (이전에 COMPLETED였으면)
```

---

# Feature 4: 1:1 미팅 노트 (One-on-One Meeting Notes)

## F4-1. 개요

### 목적
매니저-멤버 간 정기 1:1 미팅 기록. 이전 미팅 히스토리 확인, 액션 아이템 추적. 기존 Meeting 도메인과는 별도 — 팀 미팅이 아닌 **개인 간 미팅**에 특화. 노트 작성은 기존 **BlockNote 에디터**를 재사용하여 리치 텍스트 지원.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 1:1 생성 | 두 멤버 간 1:1 관계 설정 (보통 매니저-멤버) |
| 미팅 노트 | 미팅별 어젠다, 논의 내용, 액션 아이템 기록 |
| 액션 아이템 | 미팅에서 나온 할 일 추적 (완료/미완료) |
| 미팅 히스토리 | 이전 미팅 기록 타임라인 |
| 반복 리마인더 | 주간/격주/월간 리마인더 (선택) |

### 기존 Meeting 도메인과의 차이

| 구분 | 기존 Meeting | 1:1 미팅 노트 |
|------|-------------|---------------|
| 참석자 | 다수 (팀 미팅) | 정확히 2명 |
| AI 기능 | 전사/요약 | 없음 |
| 에디터 | 텍스트 | BlockNote 리치 에디터 |
| 소속 | 보드 | 조직 |
| 반복 | 복잡한 반복 패턴 | 간단 (주/격주/월) |
| 핵심 | 회의록 | 어젠다 + 액션 아이템 |

## F4-2. IA (화면 설계)

### 멤버 상세 내 1:1 섹션 (MemberDetailModal)

기존 MemberDetailModal 탭에 **1:1 미팅** 탭 추가:

```
[프로필] [활동] [보드] [1:1 미팅]
                        ^^^^ NEW
```

### F4-2-1. 1:1 미팅 탭

```
┌──────────────────────────────────────────────────────┐
│ 1:1 미팅 with 김철수                    [+ 새 미팅]  │
│──────────────────────────────────────────────────────│
│                                                       │
│  반복: 격주 화요일 · 다음 미팅: 3/4               ⚙  │
│                                                       │
│  ┌─ 미완료 액션 아이템 (3개) ────────────────────┐   │
│  │ ☐ API 문서 업데이트          from 2/18 미팅   │   │
│  │ ☐ 코드 리뷰 프로세스 제안    from 2/18 미팅   │   │
│  │ ☐ 온보딩 가이드 검토          from 2/4 미팅    │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  ┌─ 2026-02-18 미팅 ────────────────────────────┐    │
│  │                                               │    │
│  │  📋 어젠다                                    │    │
│  │  · 스프린트 15 회고                           │    │
│  │  · 성장 목표 점검                             │    │
│  │                                               │    │
│  │  📝 노트                                     │    │
│  │  스프린트 15에서 API 성능 개선 작업 잘 진행.  │    │
│  │  다음 스프린트에서 프론트 리팩토링 시작 예정.  │    │
│  │                                               │    │
│  │  ✅ 액션 아이템                                │    │
│  │  ✅ 성능 테스트 스크립트 작성 (완료 2/20)      │    │
│  │  ☐ API 문서 업데이트                          │    │
│  │  ☐ 코드 리뷰 프로세스 제안                    │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ┌─ 2026-02-04 미팅 ────────────────────────────┐    │
│  │  📋 어젠다: 온보딩 피드백, Q1 목표 설정       │    │
│  │  📝 요약: 온보딩 가이드 업데이트 필요...       │    │
│  │  ✅ 3/3 액션 완료                              │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ──── 더 보기 ────                                    │
└──────────────────────────────────────────────────────┘
```

### F4-2-2. 미팅 노트 작성/편집 모달

```
┌──────────────────────────────────────┐
│ ─── gradient line ───                │
│                                      │
│  1:1 미팅 · 2026-02-26              │
│  👤 나 ↔ 👤 김철수                  │
│                                      │
│  📋 어젠다                           │
│  ┌────────────────────────────────┐  │
│  │ · 스프린트 16 계획              │  │
│  │ · 성장 목표 중간 점검           │  │
│  │ · (추가...)                     │  │
│  └────────────────────────────────┘  │
│                                      │
│  📝 노트                            │
│  ┌────────────────────────────────┐  │
│  │ 자유 형식 텍스트 입력...        │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ✅ 액션 아이템                      │
│  ┌────────────────────────────────┐  │
│  │ ☐ 새 액션 아이템 입력...       │  │
│  │ 담당: [나 ▾]                   │  │
│  └────────────────────────────────┘  │
│  [+ 액션 추가]                       │
│                                      │
│  Esc 닫기              [저장]        │
└──────────────────────────────────────┘
```

## F4-3. ERD

### 신규 테이블

#### `org_one_on_ones`

**목적:** 1:1 관계 설정 (두 멤버 간)

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| member_a_id | VARCHAR(36) | FK, NOT NULL | 멤버 A (보통 매니저) |
| member_b_id | VARCHAR(36) | FK, NOT NULL | 멤버 B (보통 리포트) |
| recurrence_type | VARCHAR(20) | NULLABLE | WEEKLY / BIWEEKLY / MONTHLY / NONE |
| recurrence_day | INTEGER | NULLABLE | 요일 (1=월 ~ 7=일) |
| next_meeting_date | DATE | NULLABLE | 다음 예정 미팅 |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | 활성 여부 |
| deleted_at | TIMESTAMP | NULLABLE | 삭제 시각 (soft delete) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

**Unique Constraint:** `(organization_id, member_a_id, member_b_id)` — 같은 조직 내 두 멤버 간 1:1은 하나만
**Check Constraint:** `member_a_id < member_b_id` — DB 레벨에서 ID 순서 보장

> **ID 정렬 규칙**: 서비스 레이어에서 항상 `member_a_id < member_b_id`로 정렬하여 저장. DB CHECK constraint로도 이중 보장.

#### `org_one_on_one_meetings`

**목적:** 개별 미팅 기록

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| one_on_one_id | VARCHAR(36) | FK, NOT NULL | 1:1 관계 ID |
| meeting_date | DATE | NOT NULL | 미팅 날짜 |
| agenda | TEXT | NULLABLE | 어젠다 (BlockNote JSON) |
| notes | TEXT | NULLABLE | 미팅 노트 (BlockNote JSON) |
| created_by | VARCHAR(36) | FK, NOT NULL | 작성자 (User) |
| deleted_at | TIMESTAMP | NULLABLE | 삭제 시각 (soft delete) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

#### `org_one_on_one_action_items`

**목적:** 미팅에서 나온 액션 아이템

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| meeting_id | VARCHAR(36) | FK, NOT NULL | 미팅 ID |
| title | VARCHAR(300) | NOT NULL | 액션 아이템 내용 |
| assignee_id | VARCHAR(36) | FK, NULLABLE | 담당자 (Organization Member) |
| is_completed | BOOLEAN | NOT NULL, DEFAULT false | 완료 여부 |
| completed_at | TIMESTAMP | NULLABLE | 완료 시각 |
| display_order | INTEGER | NOT NULL | 정렬 순서 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |

### Enum 정의

```
RecurrenceType: WEEKLY, BIWEEKLY, MONTHLY, NONE
```

### Flyway Migration: V70~V71

> **구현 시 변경**: V66 분리로 인해 1 버전 오프셋 발생 (V69→V70, V70→V71).

```sql
-- V70__create_one_on_one_tables.sql

CREATE TABLE org_one_on_ones (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_a_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    member_b_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    recurrence_type VARCHAR(20),
    recurrence_day INTEGER,
    next_meeting_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_one_on_one UNIQUE (organization_id, member_a_id, member_b_id),
    CONSTRAINT chk_different_members CHECK (member_a_id != member_b_id),
    CONSTRAINT chk_member_order CHECK (member_a_id < member_b_id)
);

CREATE TABLE org_one_on_one_meetings (
    id VARCHAR(36) PRIMARY KEY,
    one_on_one_id VARCHAR(36) NOT NULL REFERENCES org_one_on_ones(id),
    meeting_date DATE NOT NULL,
    agenda TEXT,
    notes TEXT,
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- V71__create_one_on_one_action_items.sql

CREATE TABLE org_one_on_one_action_items (
    id VARCHAR(36) PRIMARY KEY,
    meeting_id VARCHAR(36) NOT NULL REFERENCES org_one_on_one_meetings(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    assignee_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_one_on_one_org ON org_one_on_ones(organization_id);
CREATE INDEX idx_one_on_one_members ON org_one_on_ones(member_a_id, member_b_id);
CREATE INDEX idx_one_on_one_meetings ON org_one_on_one_meetings(one_on_one_id, meeting_date DESC);
CREATE INDEX idx_one_on_one_actions ON org_one_on_one_action_items(meeting_id);
CREATE INDEX idx_one_on_one_actions_open ON org_one_on_one_action_items(assignee_id) WHERE is_completed = false;
```

## F4-4. API

### 4.1 1:1 관계 CRUD

```
GET /api/v1/organizations/{orgId}/one-on-ones
Auth: OrgMember+ (본인 관련만) / OrgAdmin+ (전체)
```

```
POST /api/v1/organizations/{orgId}/one-on-ones
Auth: OrgAdmin+ / 본인이 참여하는 경우 OrgMember+
```

**Request:**

```json
{
  "member_b_id": "member-uuid",
  "recurrence_type": "BIWEEKLY",
  "recurrence_day": 2
}
```

- `member_a_id`는 요청자 본인으로 자동 설정
- 이미 두 멤버 간 1:1이 있으면 → 409 `ONE_ON_ONE_ALREADY_EXISTS`

```
PUT /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}
Auth: 참여 멤버 / OrgAdmin+
```

```
DELETE /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}
Auth: 참여 멤버 / OrgAdmin+
```

### 4.2 미팅 노트 CRUD

```
GET /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/meetings
Auth: 참여 멤버 / OrgAdmin+
```

**Query Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| cursor | string | 커서 기반 페이지네이션 |
| size | integer | 페이지 크기 (기본 10) |

**Response (200):**

```json
{
  "data": {
    "meetings": [
      {
        "id": "meeting-uuid",
        "meeting_date": "2026-02-18",
        "agenda": "[{\"type\":\"bulletListItem\",\"content\":[{\"type\":\"text\",\"text\":\"스프린트 15 회고\"}]}, ...]",
        "notes": "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"스프린트 15에서 API 성능 개선 작업 잘 진행...\"}]}]",
        "action_items": [
          {
            "id": "action-uuid",
            "title": "성능 테스트 스크립트 작성",
            "assignee_name": "이영희",
            "is_completed": true,
            "completed_at": "2026-02-20T10:00:00Z"
          },
          {
            "id": "action-uuid-2",
            "title": "API 문서 업데이트",
            "assignee_name": "이영희",
            "is_completed": false,
            "completed_at": null
          }
        ],
        "created_by_name": "김철수",
        "created_at": "2026-02-18T07:00:00Z"
      }
    ],
    "next_cursor": "cursor-token",
    "has_more": true
  }
}
```

```
POST /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/meetings
Auth: 참여 멤버
```

**Request:**

```json
{
  "meeting_date": "2026-02-26",
  "agenda": "[{\"type\":\"bulletListItem\",\"content\":[{\"type\":\"text\",\"text\":\"스프린트 16 계획\"}]}]",
  "notes": "[]",
  "action_items": [
    {
      "title": "리팩토링 범위 정리",
      "assignee_id": "member-uuid"
    }
  ]
}
```

```
PUT /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/meetings/{meetingId}
Auth: 참여 멤버
```

```
DELETE /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/meetings/{meetingId}
Auth: 작성자 / OrgAdmin+
```

### 4.3 액션 아이템 토글

```
PUT /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/action-items/{actionId}/toggle
Auth: 참여 멤버
```

### 4.4 미완료 액션 아이템 조회 (크로스 미팅)

```
GET /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/action-items/open
Auth: 참여 멤버
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "action-uuid",
      "title": "API 문서 업데이트",
      "assignee_name": "이영희",
      "meeting_date": "2026-02-18",
      "created_at": "2026-02-18T07:00:00Z"
    }
  ]
}
```

## F4-5. Flows

### 1:1 미팅 생성 플로우

```
1. MemberDetailModal → [1:1 미팅] 탭 → [+ 새 미팅]
   또는 매니저가 직접 1:1 관계 생성
│
2. 1:1 관계 존재 확인:
   ├─ 있음 → 바로 미팅 노트 작성 모달
   └─ 없음 → 1:1 관계 생성 (반복 설정 선택)
│
3. 미팅 노트 작성:
   ├─ 어젠다 입력 (이전 미팅 미완료 액션 자동 표시)
   ├─ 노트 입력
   └─ 액션 아이템 추가 (담당자 지정)
│
4. 저장 → 미팅 히스토리에 추가
5. 상대 멤버에게 알림: "새 1:1 미팅 노트가 기록되었습니다"
```

### 반복 리마인더 플로우

```
스케줄러 (매일 오전)
│
├─ 활성 1:1 중 next_meeting_date = 오늘인 건 조회
│
├─ 양쪽 멤버에게 리마인더 알림:
│   "오늘 {상대방}님과의 1:1 미팅이 예정되어 있습니다"
│
└─ next_meeting_date 업데이트:
    ├─ 현재보다 과거이면 현재 기준으로 다음 날짜 계산 (장애 skip 대응)
    ├─ WEEKLY: +7일
    ├─ BIWEEKLY: +14일
    └─ MONTHLY: 다음 달 같은 요일
```

---

# Feature 5: 근태 관리 (Attendance & Time Tracking)

## F5-1. 개요

### 목적
출퇴근 기록, 근무 시간 집계, 초과근무 통계. 기존 Leave 시스템과 연동하여 휴가일은 자동 반영. 공휴일은 기존 `date-holidays` 라이브러리 + 조직별 커스텀 공휴일로 관리.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 출퇴근 기록 | 출근/퇴근 버튼으로 시간 기록 |
| 근무 시간 계산 | 일별/주별/월별 근무 시간 집계 |
| 근무 정책 설정 | 조직별 근무 시간, 코어 타임, 초과근무 기준 |
| 대시보드 | 근태 현황 요약 (출근 현황, 총 근무시간, 평균) |
| Leave 연동 | 휴가일 자동 표시, 반차 근무시간 자동 조정 |
| 공휴일 연동 | `date-holidays` 라이브러리 + 조직별 커스텀 공휴일 |
| CSV 내보내기 | 월별 근태 데이터 CSV 다운로드 |

### 설계 결정

```
근태 기록 방식: "버튼 기반" (출근 클릭 → 퇴근 클릭)
├─ 장점: 단순, 직관적
├─ 단점: 클릭 누락 가능
└─ 보완: 관리자가 수동 수정 가능, 자동 퇴근 (자정)

근무 정책: 조직 단위 설정
├─ 표준 근무시간: 8시간 (configurable)
├─ 코어 타임: 10:00~16:00 (configurable)
├─ 초과근무 기준: 표준 근무시간 초과분
└─ 반차 기준: standard_hours / 2 (4시간)

타임존: 멤버별 timezone 활용
├─ 지각 판별: member.timezone 기준으로 clock_in UTC → 로컬 시각 변환 후 late_threshold와 비교
└─ 자동 퇴근: 멤버별 timezone 기준 auto_clock_out_time 도래 시 처리

공휴일: 기존 date-holidays 라이브러리 활용
├─ 프론트엔드: useHolidays 훅 (20개국 지원)
├─ 백엔드: org_custom_holidays 테이블 (조직별 추가 공휴일)
└─ 판별: date-holidays 결과 + 커스텀 공휴일 합산
```

## F5-2. IA (화면 설계)

### 조직 대시보드 위젯

```
┌───────────────────────────────────────────────────────┐
│ ⏰ 오늘 근태 현황                                     │
│───────────────────────────────────────────────────────│
│                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ 출근     │ │ 미출근   │ │ 휴가     │              │
│  │   8      │ │    2     │ │    1     │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│                                                       │
│  나의 근무: 출근 09:12 · 근무중 4시간 23분            │
│  ┌───────────────────┐                                │
│  │    [퇴근하기]     │                                │
│  └───────────────────┘                                │
│  ── 또는 미출근 시 ──                                 │
│  ┌───────────────────┐                                │
│  │    [출근하기]     │                                │
│  └───────────────────┘                                │
└───────────────────────────────────────────────────────┘
```

### 새로운 탭: 근태 관리

`OrganizationDetailPage`에 **탭 추가**:

```
[대시보드] [구성원] [조직도] [보드] [휴가] [근태] [설정]
                                          ^^^^ NEW
```

### F5-2-1. 근태 탭 (`OrgAttendanceTab`)

```
┌──────────────────────────────────────────────────────────┐
│  근태 관리                                                │
│                                                           │
│  ┌─ 필터 ──────────────────────────────────────────────┐ │
│  │ 📅 2026년 2월 ◀ ▶   [전체 부서 ▾]   [내보내기]    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─ 월간 요약 ────────────────────────────────────────┐  │
│  │                                                     │  │
│  │  평균 근무시간: 7.8h/일  │  초과근무: 총 12h       │  │
│  │  출근율: 95%             │  지각: 3회              │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ 일별 기록 (나의 근태) ────────────────────────────┐  │
│  │                                                     │  │
│  │  날짜     출근     퇴근     근무     상태           │  │
│  │  ─────────────────────────────────────────────      │  │
│  │  2/26    09:12    -        진행중    ✅ 출근        │  │
│  │  2/25    09:05    18:30    8h25m    ✅ 정상        │  │
│  │  2/24    09:45    19:15    8h30m    ⚠️ 지각        │  │
│  │  2/23    -        -        -        🏖 연차        │  │
│  │  2/22    -        -        -        📅 주말        │  │
│  │  2/21    08:55    18:10    8h15m    ✅ 정상        │  │
│  │  ...                                                │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Admin: 팀원 근태 현황 ────────────────────────────┐  │
│  │                                                     │  │
│  │  이름      부서     이번 달    평균    지각  초과   │  │
│  │  ───────────────────────────────────────────────    │  │
│  │  김철수   개발     168h      8.0h   0    12h       │  │
│  │  이영희   개발     165h      7.9h   1     8h       │  │
│  │  박민수   개발     170h      8.1h   2    14h       │  │
│  │  ...                                                │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### F5-2-2. 근무 정책 설정 (`OrgSettingsTab` 내)

```
┌───────────────────────────────────────────────────────┐
│ 근무 정책                                             │
│                                                       │
│  표준 근무시간 (시간/일)                              │
│  ┌──────────────────┐                                 │
│  │ 8                 │                                │
│  └──────────────────┘                                 │
│                                                       │
│  코어 타임                                            │
│  ┌──────────┐  ~  ┌──────────┐                       │
│  │ 10:00    │     │ 16:00    │                       │
│  └──────────┘     └──────────┘                       │
│                                                       │
│  지각 기준 시각                                       │
│  ┌──────────┐                                         │
│  │ 10:00    │  (코어 타임 시작 이후 출근 = 지각)     │
│  └──────────┘                                         │
│                                                       │
│  자동 퇴근 처리                              [토글]   │
│  퇴근 미기록 시 23:59에 자동 처리                     │
│                                                       │
│  주말 설정: ☑ 토요일  ☑ 일요일                       │
│                                                       │
│                               [저장]                  │
└───────────────────────────────────────────────────────┘
```

## F5-3. ERD

### 신규 테이블

#### `org_attendance_policies`

**목적:** 조직별 근무 정책

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, UNIQUE, NOT NULL | 조직 ID |
| standard_hours | DECIMAL(4,2) | NOT NULL, DEFAULT 8.00 | 일일 표준 근무시간 |
| core_time_start | TIME | NULLABLE | 코어 타임 시작 |
| core_time_end | TIME | NULLABLE | 코어 타임 종료 |
| late_threshold | TIME | NULLABLE | 지각 기준 시각 |
| auto_clock_out | BOOLEAN | NOT NULL, DEFAULT true | 자동 퇴근 처리 |
| auto_clock_out_time | TIME | NOT NULL, DEFAULT '23:59' | 자동 퇴근 시각 |
| weekend_days | VARCHAR(20) | NOT NULL, DEFAULT '6,7' | 주말 (1=월~7=일) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

#### `org_attendance_records`

**목적:** 일별 출퇴근 기록

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| member_id | VARCHAR(36) | FK, NOT NULL | 멤버 ID |
| record_date | DATE | NOT NULL | 근무 날짜 |
| clock_in | TIMESTAMP | NULLABLE | 출근 시각 (UTC) |
| clock_out | TIMESTAMP | NULLABLE | 퇴근 시각 (UTC) |
| work_minutes | INTEGER | NULLABLE | 근무 분 (계산값) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'ABSENT' | 상태 |
| is_late | BOOLEAN | NOT NULL, DEFAULT false | 지각 여부 |
| is_auto_clocked_out | BOOLEAN | NOT NULL, DEFAULT false | 자동 퇴근 여부 |
| note | VARCHAR(300) | NULLABLE | 관리자 메모 |
| modified_by | VARCHAR(36) | FK, NULLABLE | 수정자 (관리자 수정 시) |
| deleted_at | TIMESTAMP | NULLABLE | 삭제 시각 (soft delete) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |
| updated_at | TIMESTAMP | NOT NULL | 수정 시각 (UTC) |

**Unique Constraint:** `(organization_id, member_id, record_date)` — 하루에 한 건

### Enum 정의

```
AttendanceStatus:
  PRESENT     - 정상 출근
  ABSENT      - 미출근
  ON_LEAVE    - 휴가 (Leave 연동)
  HALF_DAY    - 반차 (Leave 연동)
  WEEKEND     - 주말
  HOLIDAY     - 공휴일
```

#### `org_custom_holidays`

**목적:** 조직별 커스텀 공휴일 (date-holidays 외 추가 지정)

| Column | Type | Constraints | 설명 |
|--------|------|-------------|------|
| id | VARCHAR(36) | PK | UUID |
| organization_id | VARCHAR(36) | FK, NOT NULL | 조직 ID |
| holiday_date | DATE | NOT NULL | 공휴일 날짜 |
| name | VARCHAR(100) | NOT NULL | 공휴일 이름 |
| is_recurring | BOOLEAN | NOT NULL, DEFAULT false | 매년 반복 여부 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 (UTC) |

**Unique Constraint:** `(organization_id, holiday_date)`

### Flyway Migration: V72

> **구현 시 변경**: V66 분리로 인해 1 버전 오프셋 발생 (V71→V72).

```sql
-- V72__create_attendance_tables.sql

CREATE TABLE org_custom_holidays (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    holiday_date DATE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_custom_holiday UNIQUE (organization_id, holiday_date)
);

CREATE INDEX idx_custom_holidays_org ON org_custom_holidays(organization_id, holiday_date);

CREATE TABLE org_attendance_policies (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    standard_hours DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    core_time_start TIME,
    core_time_end TIME,
    late_threshold TIME,
    auto_clock_out BOOLEAN NOT NULL DEFAULT true,
    auto_clock_out_time TIME NOT NULL DEFAULT '23:59:00',
    weekend_days VARCHAR(20) NOT NULL DEFAULT '6,7',
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_attendance_records (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    member_id VARCHAR(36) NOT NULL REFERENCES organization_members(id),
    record_date DATE NOT NULL,
    clock_in TIMESTAMP,
    clock_out TIMESTAMP,
    work_minutes INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'ABSENT',
    is_late BOOLEAN NOT NULL DEFAULT false,
    is_auto_clocked_out BOOLEAN NOT NULL DEFAULT false,
    note VARCHAR(300),
    modified_by VARCHAR(36) REFERENCES users(id),
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_attendance_record UNIQUE (organization_id, member_id, record_date)
);

CREATE INDEX idx_attendance_org_date ON org_attendance_records(organization_id, record_date);
CREATE INDEX idx_attendance_member ON org_attendance_records(member_id, record_date);
```

### Flyway Migration: V73 (공통 인덱스/수정)

> Phase 2~4 구현 후 누락된 인덱스와 timezone 기본값을 일괄 보정하는 마이그레이션.

```sql
-- V73__add_missing_org_indexes_and_fixes.sql

-- 1. Missing index on org_one_on_one_meetings.created_by
CREATE INDEX IF NOT EXISTS idx_one_on_one_meetings_created_by
    ON org_one_on_one_meetings(created_by);

-- 2. Missing index for soft-delete queries on org_one_on_one_meetings
CREATE INDEX IF NOT EXISTS idx_one_on_one_meetings_active
    ON org_one_on_one_meetings(one_on_one_id) WHERE deleted_at IS NULL;

-- 3. Missing index on org_one_on_ones.next_meeting_date for scheduling queries
CREATE INDEX IF NOT EXISTS idx_one_on_one_next_meeting
    ON org_one_on_ones(organization_id, next_meeting_date) WHERE deleted_at IS NULL AND is_active = true;

-- 4. Missing index on organization_members.manager_id for org chart queries
CREATE INDEX IF NOT EXISTS idx_orgmember_manager
    ON organization_members(organization_id, manager_id);

-- 5. Fix V63 timezone: update org_announcements default to UTC
ALTER TABLE org_announcements ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');
ALTER TABLE org_announcements ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');

-- 6. Fix V63 timezone: update org_activities default to UTC
ALTER TABLE org_activities ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');

-- 7. Add updated_at to org_one_on_one_action_items for audit tracking
ALTER TABLE org_one_on_one_action_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- 8. Add updated_at to org_onboarding_template_items for audit tracking
ALTER TABLE org_onboarding_template_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
```

## F5-4. API

### 5.1 출근/퇴근

```
POST /api/v1/organizations/{orgId}/attendance/clock-in
Auth: OrgMember+
```

**Response (201):**

```json
{
  "data": {
    "id": "record-uuid",
    "record_date": "2026-02-26",
    "clock_in": "2026-02-26T00:12:00Z",
    "status": "PRESENT",
    "is_late": false
  }
}
```

**로직:**
1. `@Lock(PESSIMISTIC_WRITE)` — 멤버 행 잠금 (중복 출근 방지)
2. 멤버의 `timezone` 기준 "오늘" 날짜 계산
3. 오늘 날짜 기준 이미 출근 기록 있으면 → 409 `ALREADY_CLOCKED_IN`
4. `AttendanceRecord` 생성 (clock_in = now UTC)
4. `late_threshold` 비교: clock_in UTC → 멤버 timezone 로컬 시각 변환 후 비교 → is_late 판별
5. 휴가 상태 확인 → ON_LEAVE/HALF_DAY 자동 반영
6. 공휴일 확인 → date-holidays + org_custom_holidays → HOLIDAY 자동 반영

```
POST /api/v1/organizations/{orgId}/attendance/clock-out
Auth: OrgMember+
```

**Response (200):**

```json
{
  "data": {
    "id": "record-uuid",
    "record_date": "2026-02-26",
    "clock_in": "2026-02-26T00:12:00Z",
    "clock_out": "2026-02-26T09:30:00Z",
    "work_minutes": 558,
    "status": "PRESENT",
    "is_late": false
  }
}
```

**로직:**
1. 오늘 출근 기록 없으면 → 400 `NOT_CLOCKED_IN`
2. 이미 퇴근했으면 → 409 `ALREADY_CLOCKED_OUT`
3. `clock_out = now UTC`
4. `work_minutes = (clock_out - clock_in) / 60` 계산

### 5.2 나의 근태 기록 조회

```
GET /api/v1/organizations/{orgId}/attendance/my-records
Auth: OrgMember+
```

**Query Parameters:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| year | integer | 올해 | 년도 |
| month | integer | 이번 달 | 월 |

**Response (200):**

```json
{
  "data": {
    "summary": {
      "total_work_days": 20,
      "present_days": 18,
      "leave_days": 1,
      "absent_days": 1,
      "late_count": 2,
      "total_work_minutes": 8640,
      "avg_work_minutes_per_day": 480,
      "overtime_minutes": 120
    },
    "records": [
      {
        "record_date": "2026-02-26",
        "clock_in": "2026-02-26T00:12:00Z",
        "clock_out": null,
        "work_minutes": null,
        "status": "PRESENT",
        "is_late": false,
        "leave_info": null
      },
      {
        "record_date": "2026-02-23",
        "clock_in": null,
        "clock_out": null,
        "work_minutes": null,
        "status": "ON_LEAVE",
        "is_late": false,
        "leave_info": {
          "policy_name": "연차",
          "duration_type": "FULL_DAY"
        }
      }
    ]
  }
}
```

### 5.3 팀 근태 현황 (Admin)

```
GET /api/v1/organizations/{orgId}/attendance/team-summary
Auth: OrgAdmin+
```

**Query Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| year | integer | 년도 |
| month | integer | 월 |
| department_id | string | 부서 필터 (선택) |

**Response (200):**

```json
{
  "data": {
    "members": [
      {
        "member_id": "uuid",
        "member_name": "김철수",
        "department_name": "개발팀",
        "total_work_minutes": 9600,
        "avg_work_minutes_per_day": 480,
        "late_count": 0,
        "overtime_minutes": 720,
        "present_days": 20,
        "leave_days": 0,
        "absent_days": 0
      }
    ]
  }
}
```

### 5.4 오늘 출근 현황

```
GET /api/v1/organizations/{orgId}/attendance/today
Auth: OrgMember+
```

**Response (200):**

```json
{
  "data": {
    "present_count": 8,
    "absent_count": 2,
    "on_leave_count": 1,
    "total_active_members": 11,
    "my_record": {
      "clock_in": "2026-02-26T00:12:00Z",
      "clock_out": null,
      "status": "PRESENT",
      "elapsed_minutes": 263
    }
  }
}
```

### 5.5 관리자 근태 수정

```
PUT /api/v1/organizations/{orgId}/attendance/records/{recordId}
Auth: OrgAdmin+
```

**Request:**

```json
{
  "clock_in": "2026-02-26T00:00:00Z",
  "clock_out": "2026-02-26T09:00:00Z",
  "note": "VPN 접속 확인으로 출근 시간 수정"
}
```

- `work_minutes` 자동 재계산
- `modified_by` 기록
- Activity 로그

### 5.6 근태 CSV 내보내기

```
GET /api/v1/organizations/{orgId}/attendance/export
Auth: OrgAdmin+
```

**Query Parameters:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| year | integer | 년도 |
| month | integer | 월 |
| department_id | string | 부서 필터 (선택) |

**Response:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename="attendance_2026_02.csv"`

```csv
이름,부서,날짜,출근,퇴근,근무시간(분),상태,지각,비고
김철수,개발팀,2026-02-26,09:12,18:30,558,PRESENT,N,
이영희,개발팀,2026-02-26,09:45,19:15,570,PRESENT,Y,
```

> 시각은 멤버별 timezone 기준 로컬 시각으로 변환하여 내보냄.

### 5.7 커스텀 공휴일 관리

```
GET /api/v1/organizations/{orgId}/attendance/holidays
Auth: OrgMember+
```

```
POST /api/v1/organizations/{orgId}/attendance/holidays
Auth: OrgAdmin+
```

**Request:**

```json
{
  "holiday_date": "2026-03-01",
  "name": "삼일절",
  "is_recurring": true
}
```

```
DELETE /api/v1/organizations/{orgId}/attendance/holidays/{holidayId}
Auth: OrgAdmin+
```

### 5.8 근무 정책 CRUD

```
GET /api/v1/organizations/{orgId}/attendance/policy
Auth: OrgMember+
```

```
PUT /api/v1/organizations/{orgId}/attendance/policy
Auth: OrgAdmin+
```

**Request:**

```json
{
  "standard_hours": 8.0,
  "core_time_start": "10:00",
  "core_time_end": "16:00",
  "late_threshold": "10:00",
  "auto_clock_out": true,
  "auto_clock_out_time": "23:59",
  "weekend_days": "6,7"
}
```

## F5-5. Flows

### 출퇴근 플로우

```
멤버가 대시보드에서 [출근하기] 클릭
│
├─ 1. POST /attendance/clock-in
│     ├─ 오늘 날짜 레코드 생성
│     ├─ 지각 판별 (late_threshold 기준)
│     └─ 대시보드 위젯 업데이트 (출근 시각 표시 + 경과 시간)
│
├─ 2. 근무 중... (경과 시간 실시간 표시)
│
├─ 3. [퇴근하기] 클릭
│     ├─ POST /attendance/clock-out
│     ├─ work_minutes 계산
│     └─ 대시보드 위젯 업데이트 (퇴근 완료)
│
└─ 4. 자동 퇴근 (선택):
      ├─ 스케줄러가 auto_clock_out_time에 미퇴근자 처리
      └─ is_auto_clocked_out = true, clock_out = auto_clock_out_time
```

### Leave 연동 플로우

```
Leave 승인 시:
│
├─ 1. LeaveService에서 승인 처리
│
├─ 2. 승인된 날짜 범위의 AttendanceRecord 자동 생성/업데이트:
│     ├─ FULL_DAY → status = ON_LEAVE, work_minutes = 0
│     ├─ AM_HALF → status = HALF_DAY (오후 출근 기대, 기준 = standard_hours / 2)
│     └─ PM_HALF → status = HALF_DAY (오전 퇴근 기대, 기준 = standard_hours / 2)
│
└─ 3. Leave 취소 시 → AttendanceRecord의 status를 ABSENT로 복원
```

### 자동 퇴근 스케줄러

```
매분 실행 (멤버별 타임존 대응):
│
├─ 1. auto_clock_out = true인 조직의 attendance_policy 조회
│
├─ 2. 오늘 clock_in 있으나 clock_out 없는 레코드 조회
│
├─ 3. 각 레코드의 멤버 timezone 기준:
│     ├─ 현재 시각이 auto_clock_out_time에 도달했는지 확인
│     ├─ 도달한 경우:
│     │   ├─ clock_out = now UTC
│     │   ├─ work_minutes 계산
│     │   ├─ is_auto_clocked_out = true
│     │   └─ 멤버에게 알림: "자동 퇴근 처리되었습니다"
│     └─ 미도달 → skip
│
└─ 4. 완료
```

---

# 공통 사항

## 알림 타입 추가 (NotificationType)

| 타입 | 설명 | 트리거 |
|------|------|--------|
| `ANNIVERSARY_BIRTHDAY` | 생일 알림 | 스케줄러 (기념일) |
| `ANNIVERSARY_HIRE` | 입사 기념일 알림 | 스케줄러 (기념일) |
| `CELEBRATION_MESSAGE` | 축하 메시지 수신 | 축하 메시지 작성 시 |
| `ONBOARDING_ASSIGNED` | 온보딩 할당됨 | 멤버 합류 시 |
| `ONBOARDING_ITEM_COMPLETED` | 온보딩 항목 완료 | 항목 체크 시 |
| `ONBOARDING_COMPLETED` | 온보딩 전체 완료 | 모든 항목 완료 시 |
| `ONE_ON_ONE_REMINDER` | 1:1 미팅 리마인더 | 스케줄러 (반복) |
| `ONE_ON_ONE_NOTE_ADDED` | 1:1 미팅 노트 추가 | 노트 작성 시 |
| `ATTENDANCE_AUTO_CLOCK_OUT` | 자동 퇴근 처리 | 스케줄러 (근태) |

## OrgActivity 타입 추가 (OrgActivityType)

| 타입 | 설명 |
|------|------|
| `MANAGER_CHANGED` | 매니저 변경 |
| `ONBOARDING_STARTED` | 온보딩 시작 |
| `ONBOARDING_COMPLETED` | 온보딩 완료 |
| `ONE_ON_ONE_CREATED` | 1:1 관계 생성 |
| `ATTENDANCE_POLICY_UPDATED` | 근무 정책 변경 |

## 새 탭 추가 요약

```
기존:  [대시보드] [구성원] [보드] [휴가] [설정]
변경:  [대시보드] [구성원] [조직도] [보드] [휴가] [근태] [인사이트] [설정]
                          ^^^^^^                  ^^^^   ^^^^^^^^
                          NEW                     NEW    NEW
```

> **모바일 대응**: 8개 탭은 작은 화면에서 넘칠 수 있으므로 **가로 스크롤 탭바** 적용. `overflow-x-auto scrollbar-hide` + `snap-x`로 구현.

## 대시보드 위젯 추가 요약

```
기존 위젯:
  - 통계 카드 (구성원, 보드, 오늘 휴가)
  - 공지사항
  - 연결된 보드
  - 오늘 휴가자

추가 위젯:
  - 🎂 다가오는 기념일 (Feature 1)
  - 📋 온보딩 진행 현황 (Feature 3) — Admin만
  - ⏰ 오늘 근태 현황 + 출퇴근 버튼 (Feature 5)

※ 실시간 WebSocket 연동 불필요. 위젯은 탭 진입 시 fetch + 수동 새로고침.
```

## Settings 섹션 추가 요약

```
기존 섹션:
  - 기본 정보
  - 부서
  - 직무 그룹
  - 초대 링크
  - 휴가 정책
  - 소유권 이전
  - 조직 삭제

추가 섹션:
  - 기념일 설정 (Feature 1)
  - 온보딩 템플릿 (Feature 3)
  - 근무 정책 (Feature 5)
  - 커스텀 공휴일 관리 (Feature 5)
```

## 스케줄러 추가

| 스케줄러 | 주기 | 역할 |
|----------|------|------|
| `AnniversaryNotificationScheduler` | 매시 정각 | 멤버별 timezone 기준 09:00 도래 시 기념일 감지 + 알림 |
| `OneOnOneReminderScheduler` | 매시 정각 | 멤버별 timezone 기준 09:00 도래 시 1:1 미팅 리마인더 |
| `AttendanceAutoClockOutScheduler` | 매분 | 멤버별 timezone 기준 auto_clock_out_time 도래 시 자동 퇴근 |

## 프론트엔드 신규 컴포넌트

> 구현 시 일부 컴포넌트 경로/구조가 변경됨. 아래는 **실제 구현 기준** 테이블.

| 컴포넌트 | 위치 | 설명 |
|----------|------|------|
| `AnniversaryWidget` | organization/ | 기념일 위젯 (대시보드) |
| `CelebrationModal` | organization/ | 축하 메시지 모달 |
| `OrgChartTab` | organization/tabs/ | 조직도 탭 |
| `OnboardingWidget` | organization/ | 온보딩 진행 위젯 (대시보드) |
| `OnboardingTemplatesSection` | organization/ | 템플릿 관리 (설정 탭 내) |
| `MemberOneOnOneTab` | organization/member/ | 1:1 미팅 탭 (MemberDetailModal 내) |
| `OneOnOneMeetingModal` | organization/ | 미팅 노트 작성/편집 모달 |
| `OrgAttendanceTab` | organization/tabs/ | 근태 관리 탭 |
| `AttendanceWidget` | organization/ | 근태 현황 + 출퇴근 버튼 (대시보드) |
| `OrgInsightsTab` | organization/tabs/ | 인사이트 탭 (멤버 기여도, 보드 리소스) |
| `insights/*` | organization/tabs/insights/ | 인사이트 서브 컴포넌트들 |

> **구현 시 변경사항**:
> - `OrgChartTreeView`/`OrgChartListView`: `OrgChartTab` 내부에 통합 구현
> - `AttendancePolicySection`/`CustomHolidaySection`: `OrgSettingsTab` 내 인라인 섹션으로 구현 (별도 파일 미분리)
> - `OnboardingDetailSection`: `MemberProfileTab` 내에 통합 구현
> - 위젯 컴포넌트들: `organization/widgets/` 하위 대신 `organization/` 직접 배치

## i18n 키 구조

```json
{
  "organization": {
    "anniversary": {
      "upcoming": "다가오는 기념일",
      "birthday": "생일",
      "hireAnniversary": "입사 {{years}}주년",
      "sendMessage": "축하 메시지 보내기",
      "settings": { ... }
    },
    "chart": {
      "title": "조직도",
      "treeView": "트리 뷰",
      "listView": "리스트 뷰",
      "unassigned": "미배정",
      "setManager": "매니저 지정",
      "removeManager": "매니저 해제"
    },
    "onboarding": {
      "title": "온보딩",
      "progress": "진행 현황",
      "template": "템플릿",
      "completed": "완료",
      "inProgress": "진행 중",
      "nextItem": "다음 항목"
    },
    "oneOnOne": {
      "title": "1:1 미팅",
      "newMeeting": "새 미팅",
      "agenda": "어젠다",
      "notes": "노트",
      "actionItems": "액션 아이템",
      "openActions": "미완료 액션"
    },
    "attendance": {
      "title": "근태",
      "clockIn": "출근하기",
      "clockOut": "퇴근하기",
      "present": "출근",
      "absent": "미출근",
      "late": "지각",
      "overtime": "초과근무",
      "policy": "근무 정책",
      "standardHours": "표준 근무시간",
      "coreTime": "코어 타임",
      "export": "내보내기",
      "holiday": "공휴일",
      "customHoliday": "커스텀 공휴일",
      "halfDay": "반차"
    }
  }
}
```

---

## 구현 일정 제안

| Phase | 기능 | BE | FE | Migration | 총 예상 | 비고 | Status |
|-------|------|----|----|-----------|---------|------|--------|
| 1 | 기념일/알림 | 2일 | 2일 | V65 | 4일 | timezone 컬럼 포함 | ✅ |
| 2 | 조직도 | 1일 | 3일 | V66~V67 | 4일 | V66=notification nullable, V67=manager_id | ✅ |
| 3 | 온보딩 체크리스트 | 3일 | 3일 | V68~V69 | 6일 | manager_id 활용 | ✅ |
| 4 | 1:1 미팅 노트 | 3일 | 3일 | V70~V71 | 6일 | 미팅 노트 + 액션 아이템 | ✅ |
| 5 | 근태 관리 | 5일 | 4일 | V72 | 9일 | 공휴일+CSV 포함 | ✅ |
| 공통 | 인덱스/수정 | - | - | V73 | - | 누락 인덱스, timezone 기본값 | ✅ |
| **합계** | | **14일** | **15일** | **V65~V73** | **~29일** | | ✅ |
