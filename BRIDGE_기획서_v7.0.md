# BRIDGE 기획서 v7.0

> 프로젝트 관리 및 팀 협업을 위한 칸반 보드 서비스

---

## 목차

1. [서비스 개요](#1-서비스-개요)
2. [사용자 및 인증](#2-사용자-및-인증)
3. [보드 관리](#3-보드-관리)
4. [칸반 보드 구조](#4-칸반-보드-구조)
5. [마일스톤 관리](#5-마일스톤-관리)
6. [스케줄 관리](#6-스케줄-관리)
7. [통계 및 분석](#7-통계-및-분석)
8. [관리 대시보드](#8-관리-대시보드)
9. [멤버 및 권한](#9-멤버-및-권한)
10. [구독 및 결제](#10-구독-및-결제)
11. [기술 스택](#11-기술-스택)
12. [데이터 모델](#12-데이터-모델)
13. [API 명세](#13-api-명세)

---

## 1. 서비스 개요

### 1.1 서비스 소개

BRIDGE는 소프트웨어 개발 팀을 위한 프로젝트 관리 도구입니다. 칸반 보드를 기반으로 Feature-Task-Checklist 계층 구조로 작업을 관리하며, 마일스톤 기반 스프린트 관리, 팀원별 일정 관리, 통계 분석 기능을 제공합니다.

### 1.2 핵심 기능

| 기능 | 설명 |
|------|------|
| **칸반 보드** | Feature → Task → Checklist 계층 구조의 작업 관리 |
| **마일스톤** | 스프린트/마일스톤 기반 일정 관리 및 인원 할당 |
| **데일리 스케줄** | 체크리스트 항목 기반 일일/주간 일정 관리 |
| **관리 대시보드** | 마일스톤 헬스, 팀원 생산성, 지연 항목 모니터링 |
| **통계 분석** | 작업 완료율, 멤버별 작업량, 번다운 차트 |
| **팀 협업** | 역할 기반 멤버 관리, 초대 링크, 활동 로그 |

### 1.3 뷰 모드

| 뷰 | 설명 |
|-----|------|
| **Kanban** | 블록 기반 칸반 보드 뷰 |
| **Weekly** | 주간 간트차트 형태의 일정 뷰 |
| **Schedule** | 데일리 스케줄 (타임 블록) 뷰 |
| **Statistics** | 보드/개인 통계 분석 뷰 |
| **Management** | PM을 위한 관리 대시보드 뷰 |

---

## 2. 사용자 및 인증

### 2.1 회원가입/로그인

| 방식 | 설명 |
|------|------|
| **이메일 가입** | 이메일 + 비밀번호 기반 회원가입 |
| **Google OAuth** | Google 계정 연동 로그인 |

### 2.2 인증 방식

- **JWT 토큰**: Access Token (단기) + Refresh Token (장기)
- **자동 갱신**: Access Token 만료 시 자동으로 Refresh Token으로 갱신
- **토큰 저장**: LocalStorage (Access/Refresh Token)

### 2.3 사용자 정보

| 필드 | 설명 |
|------|------|
| `id` | UUID |
| `email` | 이메일 (유니크) |
| `name` | 사용자 이름 |
| `profile_image` | 프로필 이미지 URL |
| `auth_provider` | 인증 제공자 (email, GOOGLE) |

---

## 3. 보드 관리

### 3.1 보드 기본 정보

| 필드 | 설명 |
|------|------|
| `name` | 보드 이름 |
| `description` | 보드 설명 |
| `owner` | 보드 소유자 |
| `is_starred` | 즐겨찾기 여부 |
| `selected_milestone_id` | 현재 선택된 마일스톤 |

### 3.2 보드 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `work_hours_per_day` | 8 | 일일 근무 시간 |
| `work_start_time` | 09:00 | 근무 시작 시간 |
| `schedule_display_mode` | TIME | 스케줄 표시 모드 |

### 3.3 보드 등급 (Tier)

| 등급 | 설명 | 제한 |
|------|------|------|
| **TRIAL** | 7일 무료 체험 | 모든 기능 사용 가능 |
| **STANDARD** | 기본 플랜 | Task 10개 제한 |
| **PREMIUM** | 프리미엄 플랜 | 무제한 |

---

## 4. 칸반 보드 구조

### 4.1 계층 구조

```
Board (보드)
 └── Block (블록/컬럼)
      └── Feature (피처/기능)
           └── Task (작업)
                └── ChecklistItem (체크리스트 항목)
```

### 4.2 Block (블록)

칸반 보드의 세로 컬럼입니다.

| 타입 | 설명 |
|------|------|
| **FIXED - FEATURE** | Feature 블록 (고정) |
| **FIXED - TASK** | Task 블록 (고정) |
| **FIXED - DONE** | Done 블록 (고정) |
| **CUSTOM** | 사용자 정의 블록 |

**주요 기능**:
- 블록 순서 변경 (드래그앤드롭)
- 커스텀 블록 생성/삭제
- 블록별 색상 설정

### 4.3 Feature (피처)

작업의 상위 그룹입니다.

| 필드 | 설명 |
|------|------|
| `title` | 피처 제목 |
| `description` | 피처 설명 |
| `color` | 피처 색상 (카드 및 차트에 사용) |
| `assignee` | 담당자 |
| `priority` | 우선순위 (HIGH, MEDIUM, LOW) |
| `due_date` | 마감일 |
| `status` | 상태 (ACTIVE, COMPLETED) |
| `total_tasks` | 총 Task 수 |
| `completed_tasks` | 완료된 Task 수 |
| `tags` | 태그 목록 |

**자동 완료**: 모든 Task가 완료되면 Feature도 자동으로 COMPLETED 상태로 변경

### 4.4 Task (작업)

실제 작업 단위입니다.

| 필드 | 설명 |
|------|------|
| `title` | Task 제목 |
| `description` | Task 설명 |
| `feature_id` | 소속 Feature |
| `block_id` | 현재 위치한 Block |
| `assignee` | 담당자 (선택) |
| `start_date` | 시작일 |
| `due_date` | 마감일 |
| `estimated_minutes` | 예상 소요 시간 (분) |
| `is_completed` | 완료 여부 |
| `tags` | 태그 목록 |

**주요 기능**:
- Task 블록 간 이동 (드래그앤드롭)
- Done 블록 이동 시 자동 완료 처리
- 체크리스트 항목 관리

### 4.5 ChecklistItem (체크리스트)

Task 내의 세부 작업 항목입니다.

| 필드 | 설명 |
|------|------|
| `title` | 항목 제목 |
| `is_completed` | 완료 여부 |
| `assignee` | 담당자 |
| `start_date` | 시작일 |
| `due_date` | 마감일 |
| `position` | 순서 |

**핵심 개념**:
- **Task의 담당자** = Task 내 ChecklistItem들의 담당자들
- 체크리스트 담당자 기준으로 팀원 생산성 측정

### 4.6 Tag (태그)

Feature와 Task에 부착하는 라벨입니다.

| 필드 | 설명 |
|------|------|
| `name` | 태그 이름 |
| `color` | 태그 색상 |

---

## 5. 마일스톤 관리

### 5.1 Milestone (마일스톤)

스프린트/마일스톤 기반 일정 관리입니다.

| 필드 | 설명 |
|------|------|
| `title` | 마일스톤 제목 |
| `description` | 마일스톤 설명 |
| `start_date` | 시작일 |
| `end_date` | 종료일 |
| `default_hours_per_day` | 기본 일일 작업 시간 (기본값: 8시간) |

### 5.2 마일스톤-Feature 연결

- 하나의 Feature는 여러 마일스톤에 연결 가능
- 마일스톤 선택 시 해당 마일스톤에 연결된 Feature/Task만 필터링

### 5.3 MilestoneAllocation (인원 할당)

마일스톤별 멤버의 작업 시간 할당입니다.

| 필드 | 설명 |
|------|------|
| `member` | 할당된 멤버 |
| `working_days` | 근무일 수 |
| `total_allocated_hours` | 총 할당 시간 |

**활용**:
- 마일스톤 내 멤버별 작업 가능 시간 계산
- 업무 과열 여부 판정 기준
- 인원 할당 대시보드 표시

---

## 6. 스케줄 관리

### 6.1 ScheduleBlock (스케줄 블록)

체크리스트 항목 기반 일정 블록입니다.

| 필드 | 설명 |
|------|------|
| `checklist_item` | 연결된 체크리스트 항목 |
| `assignee` | 담당자 |
| `scheduled_date` | 예약 날짜 |
| `start_time` | 시작 시간 |
| `end_time` | 종료 시간 |

### 6.2 뷰 모드

#### Daily Schedule (데일리 스케줄)
- 하루 단위 타임 블록 표시
- 담당자별 필터링
- 스케줄 블록 드래그앤드롭

#### Weekly Schedule (위클리 간트차트)
- 주간 간트차트 형태
- Feature/Task 기반 일정 표시
- 날짜 범위 기반 표시

### 6.3 스케줄 설정

| 설정 | 설명 |
|------|------|
| `work_hours_per_day` | 일일 근무 시간 |
| `work_start_time` | 근무 시작 시간 |

---

## 7. 통계 및 분석

### 7.1 보드 통계 (Statistics View)

| 항목 | 설명 |
|------|------|
| **Summary** | 총 Task 수, 완료 Task 수, 완료율, 진행 중 Task |
| **By Member** | 멤버별 작업량, 완료율, 기여도 |
| **By Feature** | Feature별 완료율, Task 분포 |
| **By Milestone** | 마일스톤별 진행 현황 |
| **By Tag** | 태그별 Task 분포 |
| **Impact** | 작업 영향도 분석 |

### 7.2 개인 통계

| 항목 | 설명 |
|------|------|
| **My Tasks** | 내 담당 Task 현황 |
| **Completion Rate** | 개인 완료율 |
| **Time Tracking** | 작업 시간 추적 |

### 7.3 필터 옵션

| 필터 | 설명 |
|------|------|
| `date_from` / `date_to` | 기간 필터 |
| `milestone_id` | 마일스톤 필터 |
| `feature_ids` | Feature 필터 |
| `member_ids` | 멤버 필터 |
| `tag_ids` | 태그 필터 |

---

## 8. 관리 대시보드

### 8.1 개요

PM을 위한 프로젝트 관리 대시보드입니다. 마일스톤 선택 시 해당 마일스톤 기준으로 모든 데이터가 필터링됩니다.

### 8.2 Summary Cards (요약 카드)

| 카드 | 설명 |
|------|------|
| **건강 점수** | 전체 프로젝트 건강 점수 (0-100) |
| **마일스톤 진행** | 선택된 마일스톤 진행률 |
| **팀원** | 총 멤버 수 / 확인 필요 멤버 수 |
| **지연 항목** | 지연된 항목 수 |

### 8.3 마일스톤 헬스 (Milestone Health)

| 항목 | 설명 |
|------|------|
| **진행률** | Task 완료 기준 진행률 (%) |
| **예상 완료일** | 현재 속도 기준 예상 완료일 |
| **상태** | ON_TRACK, SLOW, AT_RISK, OVERDUE |
| **남은 일수** | 마감까지 남은 일수 (또는 초과 일수) |
| **Velocity** | 일 평균 완료 Task 수, 필요 속도 |
| **Burndown** | 번다운 차트 데이터 |
| **Feature 요약** | 총 Feature 수, 완료 수, 위험 Feature 수 |
| **Task 목록** | 마일스톤 내 Task 목록 (예상 시간 설정용) |
| **인원 할당** | MilestoneAllocation 기반 할당 현황 |

#### 마일스톤 상태 판정

| 상태 | 조건 |
|------|------|
| **ON_TRACK** | 예상 완료일이 마감일 이전 |
| **SLOW** | 예상 완료일이 마감일 + 3일 이내 |
| **AT_RISK** | 예상 완료일이 마감일 + 3일 초과 |
| **OVERDUE** | 이미 마감일 초과 |

### 8.4 팀원 생산성 (Team Productivity)

| 컬럼 | 설명 |
|------|------|
| **팀원** | 멤버 정보 (이름, 역할) |
| **할당** | ChecklistItem 담당자 기준 Task 수 |
| **완료** | 할당된 Task 중 완료 수 |
| **완료율** | (완료 / 할당) × 100% |
| **작업 시간** | 실제 사용 시간 / 마일스톤 할당 시간 |
| **상태** | 업무 과열 여부 (NORMAL, OVERWORKED, RELAXED) |

#### 업무 과열 상태 판정

최근 7일간 일 평균 작업 시간 vs 할당 일 평균 시간 비교:

| 상태 | 조건 | 라벨 |
|------|------|------|
| **OVERWORKED** | 최근 7일 > 할당 × 130% | 과열 |
| **NORMAL** | 70% ~ 130% 범위 | 정상 |
| **RELAXED** | 최근 7일 < 할당 × 70% | 여유 |

- 기본 일 평균 시간: 8시간

#### 확장 상세

멤버 클릭 시 확장되어 표시:

| 섹션 | 설명 |
|------|------|
| **담당 Task** | 체크리스트 담당자 기준 모든 Task |
| **전체 체크리스트** | 마일스톤 내 본인 담당 모든 체크리스트 |
| **진행 중 체크리스트** | 미완료 체크리스트 목록 |

### 8.5 지연 항목 (Delayed Items)

| 항목 | 설명 |
|------|------|
| **Overdue Features** | 마감일 초과 Feature |
| **Stagnant Tasks** | N일 이상 같은 블록에 정체된 Task |
| **Stuck Checklists** | N일 이상 미완료 체크리스트 |
| **Bottleneck Summary** | 가장 지연이 많은 멤버/블록 |

---

## 9. 멤버 및 권한

### 9.1 역할 (Role)

| 역할 | 권한 |
|------|------|
| **OWNER** | 모든 권한 (보드 삭제 포함) |
| **ADMIN** | 멤버 관리, 설정 변경 가능 |
| **MEMBER** | Task/Feature 생성, 수정, 삭제 가능 |
| **VIEWER** | 읽기만 가능 |

### 9.2 멤버 초대

#### 이메일 초대
- 이메일 주소로 직접 초대
- 초대받은 사용자가 수락하면 멤버로 추가

#### 초대 링크
| 필드 | 설명 |
|------|------|
| `code` | 초대 코드 (20자) |
| `role` | 초대된 역할 |
| `max_uses` | 최대 사용 횟수 (null = 무제한) |
| `expires_at` | 만료 시간 |
| `is_active` | 활성 여부 |

### 9.3 활동 로그 (Activity Log)

모든 주요 액션을 기록합니다.

| 액션 타입 | 설명 |
|-----------|------|
| CREATE | 생성 |
| UPDATE | 수정 |
| DELETE | 삭제 |
| MOVE | 이동 |
| COMPLETE | 완료 |
| ASSIGN | 할당 |
| UNASSIGN | 할당 해제 |

---

## 10. 구독 및 결제

### 10.1 구독 상태

| 상태 | 설명 |
|------|------|
| **TRIAL** | 7일 무료 체험 |
| **ACTIVE** | 활성 구독 |
| **GRACE** | 결제 유예 기간 |
| **SUSPENDED** | 일시 중지 |
| **CANCELED** | 취소됨 |

### 10.2 플랜

| 플랜 | 설명 |
|------|------|
| **Standard** | 기본 기능 (Task 10개 제한) |
| **Premium** | 모든 기능 무제한 |

### 10.3 결제 주기

- Monthly (월간)
- Yearly (연간) - 할인 적용

---

## 11. 기술 스택

### 11.1 Backend

| 항목 | 기술 |
|------|------|
| Framework | Spring Boot 3.x |
| Language | Java 17+ |
| Database | JPA/Hibernate |
| Security | Spring Security + JWT |
| Build | Gradle |

### 11.2 Frontend

| 항목 | 기술 |
|------|------|
| Framework | React 18+ |
| Language | TypeScript |
| UI Library | shadcn/ui (Tailwind CSS) |
| State | React Hooks + Context API |
| HTTP Client | Fetch API |
| Routing | React Router v6 |
| Animation | Framer Motion |
| Icons | Lucide React |

### 11.3 디자인 시스템

| 변수 | HEX | 용도 |
|------|-----|------|
| `bridge-dark` | #0A0E17 | 메인 배경 |
| `bridge-obsidian` | #0F1419 | 카드/헤더 배경 |
| `bridge-accent` | #6366F1 | 주요 액센트 (인디고) |
| `bridge-secondary` | #2DD4BF | 보조 액센트 (틸) |

---

## 12. 데이터 모델

### 12.1 ERD 개요

```
User ──┬── Board (owner)
       │
       ├── BoardMember ──── Board
       │
       ├── Feature (assignee, created_by)
       │
       ├── Task (assignee, created_by)
       │
       ├── ChecklistItem (assignee)
       │
       ├── ScheduleBlock (assignee)
       │
       ├── ActivityLog (user)
       │
       └── MilestoneAllocation (member)

Board ──┬── Block
        │
        ├── Feature
        │
        ├── Task
        │
        ├── Milestone ──── MilestoneFeature ──── Feature
        │           │
        │           └── MilestoneAllocation
        │
        ├── Tag ──┬── FeatureTag
        │         └── TaskTag
        │
        ├── InviteLink
        │
        ├── Subscription
        │
        └── WeightLevel ──── TaskWeight ──── Task

Feature ──── Task ──── ChecklistItem ──── ScheduleBlock
```

### 12.2 주요 Entity

| Entity | 설명 |
|--------|------|
| User | 사용자 |
| Board | 칸반 보드 |
| BoardMember | 보드 멤버 (역할 포함) |
| Block | 칸반 블록 |
| Feature | 피처 |
| Task | 작업 |
| ChecklistItem | 체크리스트 항목 |
| Milestone | 마일스톤 |
| MilestoneFeature | 마일스톤-Feature 연결 |
| MilestoneAllocation | 마일스톤 인원 할당 |
| ScheduleBlock | 스케줄 블록 |
| Tag | 태그 |
| InviteLink | 초대 링크 |
| ActivityLog | 활동 로그 |
| Subscription | 구독 |
| WeightLevel | 가중치 레벨 |

---

## 13. API 명세

### 13.1 Base URL

```
http://localhost:8080/api/v1
```

### 13.2 인증 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| POST | `/auth/google` | Google OAuth |
| POST | `/auth/refresh` | 토큰 갱신 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/me` | 현재 사용자 |

### 13.3 보드 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards` | 보드 목록 |
| POST | `/boards` | 보드 생성 |
| GET | `/boards/{id}` | 보드 상세 |
| PUT | `/boards/{id}` | 보드 수정 |
| DELETE | `/boards/{id}` | 보드 삭제 |
| PATCH | `/boards/{id}/star` | 즐겨찾기 토글 |
| PATCH | `/boards/{id}/selected-milestone` | 마일스톤 선택 |
| GET | `/boards/{id}/tier` | Tier 정보 |
| GET | `/boards/{id}/limits` | 제한 정보 |

### 13.4 블록 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/blocks` | 블록 목록 |
| POST | `/boards/{boardId}/blocks` | 블록 생성 |
| PUT | `/boards/{boardId}/blocks/{id}` | 블록 수정 |
| DELETE | `/boards/{boardId}/blocks/{id}` | 블록 삭제 |
| PUT | `/boards/{boardId}/blocks/reorder` | 순서 변경 |

### 13.5 Feature API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/features` | Feature 목록 |
| POST | `/boards/{boardId}/features` | Feature 생성 |
| GET | `/boards/{boardId}/features/{id}` | Feature 상세 |
| PUT | `/boards/{boardId}/features/{id}` | Feature 수정 |
| DELETE | `/boards/{boardId}/features/{id}` | Feature 삭제 |
| PUT | `/boards/{boardId}/features/reorder` | 순서 변경 |

### 13.6 Task API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/tasks` | Task 목록 |
| POST | `/boards/{boardId}/features/{featureId}/tasks` | Task 생성 |
| GET | `/boards/{boardId}/tasks/{id}` | Task 상세 |
| PUT | `/boards/{boardId}/tasks/{id}` | Task 수정 |
| DELETE | `/boards/{boardId}/tasks/{id}` | Task 삭제 |
| PUT | `/boards/{boardId}/tasks/{id}/move` | Task 이동 |
| PUT | `/boards/{boardId}/tasks/{id}/dates` | 날짜 수정 |

### 13.7 체크리스트 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/tasks/{taskId}/checklist` | 체크리스트 조회 |
| POST | `/boards/{boardId}/tasks/{taskId}/checklist` | 항목 생성 |
| PUT | `/boards/{boardId}/tasks/{taskId}/checklist/{id}` | 항목 수정 |
| DELETE | `/boards/{boardId}/tasks/{taskId}/checklist/{id}` | 항목 삭제 |
| PATCH | `/boards/{boardId}/tasks/{taskId}/checklist/{id}/toggle` | 완료 토글 |

### 13.8 마일스톤 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/milestones` | 마일스톤 목록 |
| POST | `/boards/{boardId}/milestones` | 마일스톤 생성 |
| GET | `/boards/{boardId}/milestones/{id}` | 마일스톤 상세 |
| PUT | `/boards/{boardId}/milestones/{id}` | 마일스톤 수정 |
| DELETE | `/boards/{boardId}/milestones/{id}` | 마일스톤 삭제 |
| POST | `/boards/{boardId}/milestones/{id}/features` | Feature 추가 |
| DELETE | `/boards/{boardId}/milestones/{id}/features/{featureId}` | Feature 제거 |
| GET | `/boards/{boardId}/milestones/{id}/allocations` | 할당 목록 |
| POST | `/boards/{boardId}/milestones/{id}/allocations` | 할당 생성 |
| PUT | `/boards/{boardId}/milestones/{id}/allocations/{allocId}` | 할당 수정 |
| DELETE | `/boards/{boardId}/milestones/{id}/allocations/{allocId}` | 할당 삭제 |

### 13.9 스케줄 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/schedules` | 일일 스케줄 |
| POST | `/boards/{boardId}/schedules` | 스케줄 블록 생성 |
| POST | `/boards/{boardId}/schedules/with-checklist-item` | 체크리스트와 함께 생성 |
| PUT | `/boards/{boardId}/schedules/{id}` | 스케줄 블록 수정 |
| DELETE | `/boards/{boardId}/schedules/{id}` | 스케줄 블록 삭제 |
| GET | `/boards/{boardId}/schedules/settings` | 설정 조회 |
| PUT | `/boards/{boardId}/schedules/settings` | 설정 수정 |

### 13.10 멤버 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/members` | 멤버 목록 |
| POST | `/boards/{boardId}/members/invite` | 멤버 초대 |
| PUT | `/boards/{boardId}/members/{id}/role` | 역할 변경 |
| DELETE | `/boards/{boardId}/members/{id}` | 멤버 제거 |

### 13.11 초대 링크 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/invites` | 초대 링크 목록 |
| POST | `/boards/{boardId}/invites` | 초대 링크 생성 |
| DELETE | `/boards/{boardId}/invites/{id}` | 초대 링크 삭제 |
| GET | `/invites/{code}` | 초대 링크 정보 (공개) |
| POST | `/invites/{code}/accept` | 초대 수락 (공개) |

### 13.12 통계 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/statistics` | 보드 통계 |
| GET | `/boards/{boardId}/statistics/personal` | 개인 통계 |
| GET | `/boards/{boardId}/statistics/management` | 관리 대시보드 |

### 13.13 활동 로그 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/activities` | 활동 로그 (커서 페이징) |

### 13.14 태그 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/boards/{boardId}/tags` | 태그 목록 |
| POST | `/boards/{boardId}/tags` | 태그 생성 |
| PUT | `/boards/{boardId}/tags/{id}` | 태그 수정 |
| DELETE | `/boards/{boardId}/tags/{id}` | 태그 삭제 |

### 13.15 구독 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/pricing` | 가격 정책 (공개) |
| GET | `/boards/{boardId}/subscription` | 구독 정보 |
| POST | `/boards/{boardId}/subscription/start` | 구독 시작 |
| PUT | `/boards/{boardId}/subscription/plan` | 플랜 변경 |
| DELETE | `/boards/{boardId}/subscription` | 구독 취소 |

---

## 변경 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| v7.0 | 2025-01 | 전체 기획서 작성 - 모든 구현 기능 반영 |

---

*© 2025 BRIDGE Project*
