# BRIDGE SPOTS - MySpace v9.0 기획서: 완전 독립 데이터 구조 전환

## 0. Executive Summary

**목표**: MySpace(개인 보드)의 모든 데이터를 `user_id` 기반 독립 엔티티로 전환하여 팀 Board 의존성을 완전히 제거한다.

**배경**:
- 현재 MySpace는 팀 협업용 Board→Block→Feature→Task 계층 구조를 그대로 재사용
- 개인 할 일 하나 추가하려면 Feature 자동 생성이 필요하고, 1인 보드에 BoardMember/Subscription이 붙는 등 불필요한 오버헤드 발생
- PersonalEvent, Diary는 이미 user_id 기반 독립 구조로 잘 동작 중

**핵심 변경**:
- Board→Block→Feature→Task 4단 계층 → **PersonalTask (flat)** + 태그/카테고리
- DailyChecklist (board_id 기반) → **PersonalHabit** + HabitLog (user_id 기반)
- 신규 테이블 6개, 기존 유지 3개 (PersonalEvent, DiaryEntry, DiaryMessage)
- Board.type=PERSONAL 완전 삭제

---

## 1. 현재 상태 vs 목표 상태

### 1.1 AS-IS (현재)

```
Board (type=PERSONAL)
├── BoardMember (OWNER 1명)
├── Subscription (TRIAL/PREMIUM)
├── Block (To Do, In Progress, Done)
│   └── Feature (카테고리 역할)
│       └── Task (할 일)
│           └── ChecklistItem (하위 항목)
├── DailyChecklist (board_id 참조)
└── ScheduleBlock (board_id 참조)

+ PersonalEvent (user_id 기반) ✅ 독립
+ DiaryEntry (user_id 기반) ✅ 독립
```

**문제점**:
1. Feature→Task 계층이 개인용에 과함 (할 일 1개 추가에 Feature 자동 생성 필요)
2. 1인 보드에 협업 인프라(BoardMember, Subscription, 초대/권한) 전부 탑재
3. DailyChecklist가 board_id에 묶여 있어 독립 불가
4. 매번 `board.isPersonal()` 분기 처리 필요, 코드 복잡도 증가

### 1.2 TO-BE (목표)

```
User
├── PersonalTask (flat, 태그/카테고리 분류)
│   └── PersonalTaskChecklist (하위 항목)
├── PersonalTag (사용자별 태그)
├── PersonalHabit (반복 습관, DailyChecklist 대체)
│   └── PersonalHabitLog (일별 체크 기록)
├── PersonalEvent (유지) ✅
└── DiaryEntry + DiaryMessage (유지) ✅

Board (type=PERSONAL) → 완전 삭제
```

**이점**:
1. 모든 개인 데이터가 `user_id` 하나로 통일 → 쿼리 단순화
2. Board/Block/Feature/BoardMember/Subscription 의존성 제거 → 코드 간결화
3. 개인 보드의 UX를 독립적으로 발전 가능 (칸반에 제약받지 않음)
4. DailyChecklist → PersonalHabit으로 발전 → 반복/스트릭/히트맵 지원

---

## 2. 신규 데이터 모델

### 2.1 PersonalTask (할 일)

Board→Block→Feature→Task 4단 계층을 **flat 구조**로 대체한다.
상태값(TODO/IN_PROGRESS/DONE)으로 칸반 컬럼을 표현하고, `category` 문자열로 가벼운 그룹핑을 지원한다.

```
personal_tasks
├── id              VARCHAR(36) PK
├── user_id         VARCHAR(36) FK → users.id, NOT NULL
├── title           VARCHAR(200) NOT NULL
├── description     TEXT
├── status          VARCHAR(20) NOT NULL DEFAULT 'TODO'
│                   CHECK (TODO | IN_PROGRESS | DONE | ARCHIVED)
├── priority        VARCHAR(10) NOT NULL DEFAULT 'NONE'
│                   CHECK (NONE | LOW | MEDIUM | HIGH | URGENT)
├── due_date        DATE (nullable)
├── category        VARCHAR(100) (nullable, 자유 입력 - "업무", "개인", "사이드")
├── color           VARCHAR(20) (nullable)
├── position        INTEGER NOT NULL DEFAULT 0
├── completed_at    TIMESTAMP (nullable, DONE 전환 시 자동 설정)
├── created_at      TIMESTAMP NOT NULL (UTC)
└── updated_at      TIMESTAMP

인덱스:
  idx_personal_task_user_status     (user_id, status)
  idx_personal_task_user_position   (user_id, status, position)
  idx_personal_task_user_due        (user_id, due_date) WHERE due_date IS NOT NULL
```

**설계 결정**:
- `category`는 VARCHAR 자유 입력: Feature 대체. 별도 테이블 불필요, 프론트에서 `DISTINCT category` 자동완성 제공
- `status`로 칸반 컬럼 표현: TODO=To Do, IN_PROGRESS=In Progress, DONE=Done
- `ARCHIVED` 상태: 삭제 대신 보관 (히스토리 보존)

### 2.2 PersonalTaskChecklist (할 일 하위 항목)

```
personal_task_checklists
├── id                VARCHAR(36) PK
├── personal_task_id  VARCHAR(36) FK → personal_tasks.id ON DELETE CASCADE
├── title             VARCHAR(200) NOT NULL
├── is_completed      BOOLEAN NOT NULL DEFAULT false
├── position          INTEGER NOT NULL DEFAULT 0
└── created_at        TIMESTAMP NOT NULL (UTC)

인덱스:
  idx_ptc_task (personal_task_id, position)
```

### 2.3 PersonalTag + PersonalTaskTag (태그 시스템)

기존 BRIDGE의 `tags`/`task_tags` 패턴을 따른다.
JSON 컬럼 대신 별도 테이블로 인덱싱, 태그 관리(이름 변경/색상/삭제 cascade) 지원.

```
personal_tags
├── id          VARCHAR(36) PK
├── user_id     VARCHAR(36) FK → users.id, NOT NULL
├── name        VARCHAR(50) NOT NULL
├── color       VARCHAR(20) (nullable)
└── created_at  TIMESTAMP NOT NULL (UTC)

UNIQUE (user_id, name)

personal_task_tags (M:N 조인 테이블)
├── id                VARCHAR(36) PK
├── personal_task_id  VARCHAR(36) FK → personal_tasks.id ON DELETE CASCADE
└── personal_tag_id   VARCHAR(36) FK → personal_tags.id ON DELETE CASCADE

UNIQUE (personal_task_id, personal_tag_id)
인덱스:
  idx_ptt_task (personal_task_id)
  idx_ptt_tag  (personal_tag_id)
```

### 2.4 PersonalHabit (습관 트래커)

DailyChecklist의 "매일 체크하는 항목" 개념을 발전시켜, **반복 주기/목표 횟수/연속 기록(스트릭)**을 지원한다.

```
personal_habits
├── id               VARCHAR(36) PK
├── user_id          VARCHAR(36) FK → users.id, NOT NULL
├── title            VARCHAR(200) NOT NULL
├── description      TEXT
├── icon             VARCHAR(50) (이모지 또는 Lucide 아이콘명)
├── color            VARCHAR(20) DEFAULT '#8B5CF6'
├── frequency_type   VARCHAR(20) NOT NULL DEFAULT 'DAILY'
│                    CHECK (DAILY | WEEKDAY | WEEKEND | CUSTOM)
├── frequency_days   VARCHAR(20) (CUSTOM일 때 "1,3,5" = 월,수,금, ISO DayOfWeek)
├── target_count     INTEGER NOT NULL DEFAULT 1 (예: 물 8잔 → target_count=8)
├── unit             VARCHAR(50) (nullable, "잔", "분", "페이지")
├── current_streak   INTEGER NOT NULL DEFAULT 0 (현재 연속 일수)
├── best_streak      INTEGER NOT NULL DEFAULT 0 (최고 연속 일수)
├── position         INTEGER NOT NULL DEFAULT 0
├── is_active        BOOLEAN NOT NULL DEFAULT true (soft delete)
├── created_at       TIMESTAMP NOT NULL (UTC)
└── updated_at       TIMESTAMP

인덱스:
  idx_personal_habit_user_active   (user_id, is_active)
  idx_personal_habit_user_position (user_id, is_active, position)
```

**설계 결정**:
- `frequency_type`: DAILY(매일), WEEKDAY(평일), WEEKEND(주말), CUSTOM(특정 요일)
- `frequency_days`: CUSTOM일 때 ISO DayOfWeek(1=월~7=일) 콤마 구분 저장
- `target_count` + `unit`: "물 8잔", "운동 30분" 등 목표 표현
- `current_streak`/`best_streak`: 엔티티에 저장, 체크인 시 트랜잭셔널 업데이트
- `is_active`: soft delete → 히스토리 보존 + 재활성화 가능

### 2.5 PersonalHabitLog (습관 일별 기록)

```
personal_habit_logs
├── id               VARCHAR(36) PK
├── habit_id         VARCHAR(36) FK → personal_habits.id ON DELETE CASCADE
├── log_date         DATE NOT NULL
├── completed_count  INTEGER NOT NULL DEFAULT 0
├── is_completed     BOOLEAN NOT NULL DEFAULT false (completed_count >= target_count)
├── note             VARCHAR(200) (nullable, 간단 메모)
├── created_at       TIMESTAMP NOT NULL (UTC)
└── updated_at       TIMESTAMP

UNIQUE (habit_id, log_date)

인덱스:
  idx_habit_log_date      (habit_id, log_date)
  idx_habit_log_completed (habit_id, is_completed, log_date)
```

### 2.6 기존 유지 엔티티 (변경 없음)

| 엔티티 | 테이블 | 스코프 | 비고 |
|--------|--------|--------|------|
| PersonalEvent | personal_events | user_id | 반복 일정(DAILY/WEEKLY), 색상, 올데이 지원 ✅ |
| DiaryEntry | diary_entries | user_id | AI 대화형 다이어리, 무드 트래킹 ✅ |
| DiaryMessage | diary_messages | diary_id | USER/AI 메시지, 대화 순서 ✅ |

---

## 3. ERD (목표 상태)

```
                          ┌──────────────┐
                          │     User     │
                          └──────┬───────┘
                                 │ 1:N (user_id)
          ┌──────────┬───────────┼───────────┬───────────┐
          │          │           │           │           │
  ┌───────▼──┐ ┌────▼─────┐ ┌──▼────┐ ┌────▼────┐ ┌───▼────────┐
  │Personal  │ │Personal  │ │Diary  │ │Personal │ │Personal    │
  │Task      │ │Event     │ │Entry  │ │Habit    │ │Tag         │
  └───┬──┬───┘ └──────────┘ └──┬────┘ └────┬────┘ └─────┬──────┘
      │  │                     │ 1:N       │ 1:N        │
      │  │              ┌──────▼──┐  ┌─────▼──────┐     │
      │  │              │Diary    │  │Personal    │     │
      │  │              │Message  │  │HabitLog    │     │
      │  │              └─────────┘  └────────────┘     │
      │  │                                              │
      │  │ 1:N                                    M:N   │
  ┌───▼──────────┐                         ┌────────────▼─┐
  │PersonalTask  │                         │PersonalTask  │
  │Checklist     │                         │Tag (join)    │
  └──────────────┘                         └──────────────┘
```

**신규 테이블 6개**: personal_tasks, personal_task_checklists, personal_tags, personal_task_tags, personal_habits, personal_habit_logs

---

## 4. API 엔드포인트 설계

기존 `/api/v1/personal/events` 패턴에 맞춰 **`/api/v1/personal/*`** 네임스페이스로 통일.

### 4.1 Personal Tasks

```
GET    /api/v1/personal/tasks                              전체 조회 (?status=&category=&tag_id=)
GET    /api/v1/personal/tasks/{taskId}                     상세 (체크리스트+태그 포함)
POST   /api/v1/personal/tasks                              생성
PUT    /api/v1/personal/tasks/{taskId}                     수정
PATCH  /api/v1/personal/tasks/{taskId}/status              상태 변경 (칸반 컬럼 이동)
PUT    /api/v1/personal/tasks/{taskId}/position            위치 변경 (드래그 정렬)
DELETE /api/v1/personal/tasks/{taskId}                     삭제
```

**체크리스트 하위 항목**:
```
POST   /api/v1/personal/tasks/{taskId}/checklists          항목 추가
PUT    /api/v1/personal/tasks/{taskId}/checklists/{id}     항목 수정
PATCH  /api/v1/personal/tasks/{taskId}/checklists/{id}/toggle  완료 토글
DELETE /api/v1/personal/tasks/{taskId}/checklists/{id}     삭제
```

### 4.2 Personal Tags

```
GET    /api/v1/personal/tags                               전체 조회
POST   /api/v1/personal/tags                               생성
PUT    /api/v1/personal/tags/{tagId}                       수정 (이름, 색상)
DELETE /api/v1/personal/tags/{tagId}                       삭제 (cascade)

# 태그 할당
POST   /api/v1/personal/tasks/{taskId}/tags/{tagId}        태그 부착
DELETE /api/v1/personal/tasks/{taskId}/tags/{tagId}        태그 해제
```

### 4.3 Personal Habits

```
GET    /api/v1/personal/habits                             활성 습관 목록
GET    /api/v1/personal/habits/{habitId}                   상세 (최근 로그 포함)
POST   /api/v1/personal/habits                             생성
PUT    /api/v1/personal/habits/{habitId}                   수정
DELETE /api/v1/personal/habits/{habitId}                   비활성화 (soft delete)
PUT    /api/v1/personal/habits/{habitId}/position          순서 변경

# 일일 체크인
POST   /api/v1/personal/habits/{habitId}/check-in          오늘 체크 (increment/toggle)
GET    /api/v1/personal/habits/{habitId}/logs?start=&end=  기록 조회 (히트맵/통계용)
GET    /api/v1/personal/habits/today                       오늘의 습관 전체 + 로그 상태
GET    /api/v1/personal/habits/weekly?start_date=&end_date= 주간 매트릭스
```

### 4.4 Personal Dashboard (Today Summary)

기존 `GET /api/v1/boards/{boardId}/today-data` 대체.

```
GET    /api/v1/personal/dashboard/today
```

**응답 구조** (snake_case):
```json
{
  "due_today_tasks": [
    { "id": "...", "title": "...", "status": "TODO", "priority": "HIGH", "category": "업무" }
  ],
  "in_progress_tasks": [
    { "id": "...", "title": "...", "priority": "MEDIUM" }
  ],
  "personal_events": [
    { "id": "...", "title": "...", "start_time": "09:00", "end_time": "10:00", "color": "#6366F1" }
  ],
  "habits_today": [
    {
      "habit_id": "...", "title": "물 마시기", "icon": "💧",
      "target_count": 8, "completed_count": 3, "is_completed": false,
      "unit": "잔", "current_streak": 5
    }
  ],
  "task_completion_rate": 0.65,
  "habit_completion_rate": 0.5,
  "active_task_count": 12,
  "completed_today_count": 3
}
```

### 4.5 기존 유지 API (변경 없음)

```
# PersonalEvent (이미 독립)
GET    /api/v1/personal/events?date={date}
GET    /api/v1/personal/events/weekly?start_date=&end_date=
POST   /api/v1/personal/events
PUT    /api/v1/personal/events/{eventId}
DELETE /api/v1/personal/events/{eventId}?scope=

# Diary (이미 독립)
GET    /api/v1/diary?date={date}
GET    /api/v1/diary/{diaryId}
GET    /api/v1/diary/list?year=&month=
POST   /api/v1/diary
POST   /api/v1/diary/{diaryId}/messages
PUT    /api/v1/diary/{diaryId}/complete
PUT    /api/v1/diary/{diaryId}
DELETE /api/v1/diary/{diaryId}
```

---

## 5. 프론트엔드 변경 사항

### 5.1 탭 구조 변경

| 현재 | 변경 후 | 변경 내용 |
|------|---------|----------|
| Overview | Overview | 데이터 소스 변경 (board API → personal API) |
| Kanban | Tasks | PersonalTask 기반 상태별 보드 뷰 |
| Schedule | Schedule | DailyChecklist 연동 제거 → Habit 연동 |
| AI Diary | AI Diary | 변경 없음 ✅ |
| Calendar | Calendar | Feature 대신 PersonalTask 마감일 표시 |

### 5.2 컴포넌트별 변경

#### PersonalBoardPage.tsx (전면 리팩토링)
- `boardService.getPersonalBoard()` 호출 **제거**
- `boardAPI.getBoardFull(boardId)` 호출 **제거**
- `blocks/features/tasks` 상태 → `personalTasks` 상태로 교체
- `personalBoardId` 상태 **제거**
- `checklistDataMap` 상태 **제거**

#### PersonalOverview.tsx (위젯 데이터 소스 변경)
| 위젯 | 현재 데이터 소스 | 변경 후 |
|------|-----------------|---------|
| Today's Schedule | personalEventService.getByDate() | 변경 없음 ✅ |
| Upcoming Deadlines | featureService.getFeatures() | personalTaskAPI.getTasks({ has_due_date: true }) |
| Daily Checklist | dailyChecklistAPI.getDailyChecklist() | personalHabitAPI.getToday() |
| AI Diary | diaryService.getByDate() | 변경 없음 ✅ |

#### PersonalKanbanView.tsx → PersonalTaskBoard.tsx (전면 교체)
- KanbanBlock 재사용 **제거**
- status별 3컬럼(TODO, IN_PROGRESS, DONE) 직접 렌더링
- PersonalTask 드래그 앤 드롭 (상태 변경 = 컬럼 이동)
- 카테고리/태그 필터링 UI 추가

#### TodaySidebar.tsx (데이터 소스 변경)
- `boardService.getTodayData(boardId)` → `personalDashboardAPI.getToday()`
- Due Today/In Progress: PersonalTask 기반
- Daily Checklist 섹션 → **Habits Today** 섹션으로 교체

#### PersonalSchedule.tsx (경량 수정)
- `dailyChecklistAPI.getChecklistRange()` → `personalHabitAPI.getWeekly()` 교체
- 체크리스트 행 → 습관 행으로 교체

#### CalendarView (personal 사용) (데이터 소스 변경)
- Feature 마감일 → PersonalTask 마감일로 교체

#### QuickAddTaskModal (간소화)
- Feature 자동 생성 로직 **제거**
- `personalTaskAPI.createTask({ title, category?, priority? })` 직접 호출

### 5.3 신규 TypeScript 타입

```typescript
// types/index.ts에 추가

export type PersonalTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';
export type PersonalTaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type HabitFrequency = 'DAILY' | 'WEEKDAY' | 'WEEKEND' | 'CUSTOM';

export interface PersonalTask {
  id: string;
  title: string;
  description?: string;
  status: PersonalTaskStatus;
  priority: PersonalTaskPriority;
  due_date: string | null;
  category: string | null;
  color: string | null;
  position: number;
  completed_at: string | null;
  tags: PersonalTag[];
  checklists: PersonalTaskChecklistItem[];
  created_at: string;
  updated_at: string | null;
}

export interface PersonalTaskChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  position: number;
}

export interface PersonalTag {
  id: string;
  name: string;
  color: string | null;
}

export interface PersonalHabit {
  id: string;
  title: string;
  description?: string;
  icon: string | null;
  color: string;
  frequency_type: HabitFrequency;
  frequency_days: string | null;
  target_count: number;
  unit: string | null;
  current_streak: number;
  best_streak: number;
  position: number;
  is_active: boolean;
}

export interface PersonalHabitLog {
  id: string;
  habit_id: string;
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
}

export interface PersonalDashboardToday {
  due_today_tasks: PersonalTask[];
  in_progress_tasks: PersonalTask[];
  personal_events: PersonalEventDetail[];
  habits_today: HabitTodayItem[];
  task_completion_rate: number;
  habit_completion_rate: number;
  active_task_count: number;
  completed_today_count: number;
}
```

### 5.4 신규 서비스 레이어

```
personalTaskService      → PersonalTask CRUD + 상태 변경 + 위치 변경 + 날짜 범위 조회
personalTagService       → PersonalTag CRUD + 태그 할당/해제
personalHabitService     → PersonalHabit CRUD + 체크인 + 오늘/주간 조회
personalDashboardService → 오늘 요약 데이터 조회
```

---

## 6. 백엔드 패키지 구조

기존 `domain/personal/` 패키지를 확장한다.

```
domain/personal/
├── PersonalEvent.java                  (기존 유지)
├── PersonalEventRepository.java        (기존 유지)
├── PersonalTask.java                   (NEW)
├── PersonalTaskRepository.java         (NEW)
├── PersonalTaskChecklist.java          (NEW)
├── PersonalTaskChecklistRepository.java (NEW)
├── PersonalTag.java                    (NEW)
├── PersonalTagRepository.java          (NEW)
├── PersonalTaskTag.java                (NEW)
├── PersonalTaskTagRepository.java      (NEW)
├── PersonalHabit.java                  (NEW)
├── PersonalHabitRepository.java        (NEW)
├── PersonalHabitLog.java               (NEW)
├── PersonalHabitLogRepository.java     (NEW)
├── PersonalTaskStatus.java             (NEW enum)
├── PersonalTaskPriority.java           (NEW enum)
├── HabitFrequency.java                 (NEW enum)
│
├── controller/
│   ├── PersonalEventController.java    (기존 유지)
│   ├── PersonalTaskController.java     (NEW)
│   ├── PersonalTagController.java      (NEW)
│   ├── PersonalHabitController.java    (NEW)
│   └── PersonalDashboardController.java (NEW)
│
├── dto/
│   ├── PersonalEventRequest.java       (기존 유지)
│   ├── PersonalEventResponse.java      (기존 유지)
│   ├── PersonalTaskRequest.java        (NEW)
│   ├── PersonalTaskResponse.java       (NEW)
│   ├── PersonalHabitRequest.java       (NEW)
│   ├── PersonalHabitResponse.java      (NEW)
│   └── PersonalDashboardResponse.java  (NEW)
│
└── service/
    ├── PersonalEventService.java       (기존 유지)
    ├── PersonalTaskService.java        (NEW)
    ├── PersonalHabitService.java       (NEW)
    └── PersonalDashboardService.java   (NEW)
```

---

## 7. 데이터 마이그레이션 전략

### Phase 1: 테이블 생성 (비파괴적, 기존 코드와 공존)

```sql
-- V42__create_personal_tasks.sql
CREATE TABLE personal_tasks (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'TODO',
    priority        VARCHAR(10)  NOT NULL DEFAULT 'NONE',
    due_date        DATE,
    category        VARCHAR(100),
    color           VARCHAR(20),
    position        INTEGER      NOT NULL DEFAULT 0,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP,
    CONSTRAINT chk_personal_task_status CHECK (status IN ('TODO','IN_PROGRESS','DONE','ARCHIVED')),
    CONSTRAINT chk_personal_task_priority CHECK (priority IN ('NONE','LOW','MEDIUM','HIGH','URGENT'))
);
CREATE INDEX idx_personal_task_user_status ON personal_tasks (user_id, status);
CREATE INDEX idx_personal_task_user_position ON personal_tasks (user_id, status, position);
CREATE INDEX idx_personal_task_user_due ON personal_tasks (user_id, due_date) WHERE due_date IS NOT NULL;

CREATE TABLE personal_task_checklists (
    id                VARCHAR(36)  PRIMARY KEY,
    personal_task_id  VARCHAR(36)  NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
    title             VARCHAR(200) NOT NULL,
    is_completed      BOOLEAN      NOT NULL DEFAULT false,
    position          INTEGER      NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
CREATE INDEX idx_ptc_task ON personal_task_checklists (personal_task_id, position);

CREATE TABLE personal_tags (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL REFERENCES users(id),
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(20),
    created_at  TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uk_personal_tag_user_name UNIQUE (user_id, name)
);

CREATE TABLE personal_task_tags (
    id                VARCHAR(36) PRIMARY KEY,
    personal_task_id  VARCHAR(36) NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
    personal_tag_id   VARCHAR(36) NOT NULL REFERENCES personal_tags(id) ON DELETE CASCADE,
    CONSTRAINT uk_personal_task_tag UNIQUE (personal_task_id, personal_tag_id)
);
CREATE INDEX idx_ptt_task ON personal_task_tags (personal_task_id);
CREATE INDEX idx_ptt_tag ON personal_task_tags (personal_tag_id);
```

```sql
-- V43__create_personal_habits.sql
CREATE TABLE personal_habits (
    id               VARCHAR(36)  PRIMARY KEY,
    user_id          VARCHAR(36)  NOT NULL REFERENCES users(id),
    title            VARCHAR(200) NOT NULL,
    description      TEXT,
    icon             VARCHAR(50),
    color            VARCHAR(20)  DEFAULT '#8B5CF6',
    frequency_type   VARCHAR(20)  NOT NULL DEFAULT 'DAILY',
    frequency_days   VARCHAR(20),
    target_count     INTEGER      NOT NULL DEFAULT 1,
    unit             VARCHAR(50),
    current_streak   INTEGER      NOT NULL DEFAULT 0,
    best_streak      INTEGER      NOT NULL DEFAULT 0,
    position         INTEGER      NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at       TIMESTAMP,
    CONSTRAINT chk_habit_frequency CHECK (frequency_type IN ('DAILY','WEEKDAY','WEEKEND','CUSTOM'))
);
CREATE INDEX idx_personal_habit_user_active ON personal_habits (user_id, is_active);
CREATE INDEX idx_personal_habit_user_position ON personal_habits (user_id, is_active, position);

CREATE TABLE personal_habit_logs (
    id               VARCHAR(36)  PRIMARY KEY,
    habit_id         VARCHAR(36)  NOT NULL REFERENCES personal_habits(id) ON DELETE CASCADE,
    log_date         DATE         NOT NULL,
    completed_count  INTEGER      NOT NULL DEFAULT 0,
    is_completed     BOOLEAN      NOT NULL DEFAULT false,
    note             VARCHAR(200),
    created_at       TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at       TIMESTAMP,
    CONSTRAINT uk_habit_log_date UNIQUE (habit_id, log_date)
);
CREATE INDEX idx_habit_log_date ON personal_habit_logs (habit_id, log_date);
CREATE INDEX idx_habit_log_completed ON personal_habit_logs (habit_id, is_completed, log_date);
```

### Phase 2: 기존 데이터 이전

```sql
-- V44__migrate_personal_board_data.sql

-- 1) Feature→Task → PersonalTask 변환
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, position, completed_at, created_at, updated_at)
SELECT
    t.id,
    b.owner_id,
    t.title,
    t.description,
    CASE
        WHEN t.is_completed = true THEN 'DONE'
        WHEN bl.name ILIKE '%progress%' THEN 'IN_PROGRESS'
        ELSE 'TODO'
    END,
    'NONE',
    t.due_date,
    f.title,       -- Feature 제목을 category로 사용
    t.position,
    t.completed_at,
    t.created_at,
    t.updated_at
FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN features f ON t.feature_id = f.id
JOIN blocks bl ON t.block_id = bl.id
WHERE b.board_type = 'PERSONAL';

-- 2) ChecklistItem → PersonalTaskChecklist 변환
INSERT INTO personal_task_checklists (id, personal_task_id, title, is_completed, position, created_at)
SELECT ci.id, ci.task_id, ci.title, ci.is_completed, ci.position, ci.created_at
FROM checklist_items ci
JOIN tasks t ON ci.task_id = t.id
JOIN boards b ON t.board_id = b.id
WHERE b.board_type = 'PERSONAL';

-- 3) DailyChecklist → PersonalHabit 변환
INSERT INTO personal_habits (id, user_id, title, frequency_type, target_count, position, is_active, created_at)
SELECT DISTINCT ON (dc.assignee_id, dc.title)
    gen_random_uuid()::text,
    dc.assignee_id,
    dc.title,
    'DAILY',
    1,
    dc.position,
    true,
    MIN(dc.created_at)
FROM daily_checklists dc
JOIN boards b ON dc.board_id = b.id
WHERE b.board_type = 'PERSONAL'
GROUP BY dc.assignee_id, dc.title, dc.position;

-- 4) DailyChecklist 기록 → HabitLog 변환
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, created_at)
SELECT
    gen_random_uuid()::text,
    ph.id,
    dc.assigned_date,
    CASE WHEN ci.is_completed THEN 1 ELSE 0 END,
    COALESCE(ci.is_completed, false),
    dc.created_at
FROM daily_checklists dc
JOIN boards b ON dc.board_id = b.id
LEFT JOIN checklist_items ci ON dc.checklist_item_id = ci.id
JOIN personal_habits ph ON ph.user_id = dc.assignee_id AND ph.title = dc.title
WHERE b.board_type = 'PERSONAL'
ON CONFLICT (habit_id, log_date) DO NOTHING;
```

### Phase 3: 프론트엔드 전환

새 API를 사용하도록 프론트엔드 컴포넌트 업데이트.

### Phase 4: 이전 데이터 정리

```sql
-- V45__cleanup_personal_boards.sql (이전 완료 확인 후 실행)

DELETE FROM daily_checklists WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM schedule_blocks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM checklist_items WHERE task_id IN (SELECT id FROM tasks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL'));
DELETE FROM tasks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM features WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM blocks WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM board_members WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM subscriptions WHERE board_id IN (SELECT id FROM boards WHERE board_type = 'PERSONAL');
DELETE FROM boards WHERE board_type = 'PERSONAL';
```

---

## 8. 삭제/교체 대상

### 8.1 Backend 삭제 대상

| 대상 | 위치 | 조치 |
|------|------|------|
| `BoardService.createPersonalBoard()` | board/service/BoardService.java | 삭제 |
| `BoardService.ensurePersonalBoard()` | board/service/BoardService.java | 삭제 |
| `BoardController.getPersonalBoard()` | board/controller/BoardController.java | 삭제 |
| Personal board admin API | admin/controller/AdminController.java | Personal 전용 통계로 교체 |
| DailyChecklist personal 사용 | dailychecklist/ | 팀 보드 전용으로 유지 |
| ScheduleBlock personal 사용 | schedule/ | 팀 보드 전용으로 유지 |

### 8.2 Frontend 삭제 대상

| 대상 | 파일 | 조치 |
|------|------|------|
| `boardService.getPersonalBoard()` | utils/services.ts | 삭제 |
| `boardService.getTodayData()` personal 사용 | utils/services.ts | personalDashboardAPI로 교체 |
| `boardAPI.getBoardFull()` personal 사용 | utils/api.ts | personalTaskAPI로 교체 |
| `dailyChecklistAPI.*` personal 사용 | utils/api.ts | personalHabitAPI로 교체 |
| `PersonalKanbanView.tsx` | components/personal/ | PersonalTaskBoard.tsx로 교체 |
| Board/Block/Feature/Task 타입 personal 사용 | types/index.ts | PersonalTask 타입으로 교체 |

---

## 9. 개발 순서

### Step 1: 백엔드 신규 엔티티 + API (Phase 1)
- Flyway V42, V43 마이그레이션
- PersonalTask, PersonalTag, PersonalHabit 엔티티/리포지토리/서비스/컨트롤러
- PersonalDashboardService

### Step 2: 프론트엔드 전환 (Phase 3)
- PersonalBoardPage board 의존성 제거
- PersonalTaskBoard 컴포넌트 (칸반 대체)
- Overview/Sidebar/Schedule 데이터 소스 교체
- 신규 서비스 레이어 (api.ts, services.ts)

### Step 3: 데이터 마이그레이션 + 정리 (Phase 2, 4)
- V44 데이터 이전 SQL
- V45 정리 SQL
- Backend personal board 코드 제거

---

## 부록: v8.0과의 차이점

| 항목 | v8.0 (기존) | v9.0 (이번) |
|------|------------|------------|
| **보드 구조** | Board.type=PERSONAL (재사용) | Board 의존 완전 제거 |
| **태스크** | Feature→Task 계층 | PersonalTask (flat) |
| **체크리스트** | DailyChecklist (board_id) | PersonalHabit (user_id) |
| **스케줄** | ScheduleBlock (board_id) | PersonalEvent만 사용 |
| **범위** | 습관/AI코치/갤러리 포함 | 현재 구현 기능에 집중 |
| **티어** | Board Subscription 기반 | 추후 User 레벨 별도 설계 |
