# MySpace DTO & Table Relationships

> MySpace(개인 공간) 도메인의 엔티티, 테이블, DTO 간 관계도

---

## 1. 전체 ERD (Entity Relationship Diagram)

```
                                 ┌──────────────────┐
                                 │      users       │
                                 │──────────────────│
                                 │ id          (PK) │
                                 │ email            │
                                 │ name             │
                                 │ profile_image    │
                                 │ ...              │
                                 └────────┬─────────┘
                                          │
                  ┌───────────┬───────────┼───────────┬───────────┬──────────────┐
                  │           │           │           │           │              │
                  │ 1:N       │ 1:N       │ 1:N       │ 1:N       │ 1:1          │
                  ▼           ▼           ▼           ▼           ▼              ▼
        ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐
        │ personal_   │ │personal_ │ │ diary_   │ │personal_ │ │personal_ │ │diary_voice_      │
        │ tasks       │ │ events   │ │ entries  │ │ habits   │ │ tags     │ │settings          │
        └──┬────┬─────┘ └──────────┘ └────┬─────┘ └────┬─────┘ └─────┬────┘ └──────────────────┘
           │    │                          │            │              │
           │    │ 1:N                1:N   │       1:N  │         M:N  │
           │    │                          ▼            ▼              │
           │    │                   ┌──────────┐ ┌───────────┐        │
           │    │                   │ diary_   │ │personal_  │        │
           │    │                   │ messages │ │habit_logs │        │
           │    │                   └──────────┘ └───────────┘        │
           │    │                                                     │
           │    │ 1:N                                           M:N   │
           ▼    │                                                     │
  ┌─────────────────┐                                    ┌────────────▼──────┐
  │personal_task_   │                                    │ personal_task_    │
  │tags (join)      │◄───────────────────────────────────│ tags (join)       │
  └─────────────────┘                                    └───────────────────┘
```

---

## 2. 테이블별 상세 스키마

### 2.1 personal_tasks (개인 할 일)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, NOT NULL | 소유자 |
| `title` | VARCHAR(200) | NOT NULL | 제목 |
| `description` | TEXT | nullable | 설명 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'TODO' | TODO / IN_PROGRESS / DONE / ARCHIVED |
| `priority` | VARCHAR(10) | NOT NULL, DEFAULT 'MEDIUM' | NONE / LOW / MEDIUM / HIGH / URGENT |
| `due_date` | DATE | nullable | 마감일 |
| `category` | VARCHAR(100) | nullable | 자유 입력 카테고리 |
| `color` | VARCHAR(20) | nullable | 색상 |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | 정렬 순서 |
| `completed_at` | TIMESTAMP | nullable | DONE 전환 시 자동 설정 |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**인덱스**: `idx_personal_task_user_status(user_id, status)`, `idx_personal_task_user_position(user_id, status, position)`

**JPA 관계**:
- `@ManyToOne` → `User` (user_id)
- `@OneToMany` ← `PersonalTaskTag` (mappedBy="personalTask", cascade ALL, orphanRemoval)

---

### 2.2 personal_tags (개인 태그)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, NOT NULL | 소유자 |
| `name` | VARCHAR(50) | NOT NULL | 태그명 |
| `color` | VARCHAR(20) | nullable | 색상 |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |

**UNIQUE**: `(user_id, name)`

---

### 2.3 personal_task_tags (M:N 조인 테이블)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `personal_task_id` | VARCHAR(36) | FK → personal_tasks.id ON DELETE CASCADE | 태스크 |
| `personal_tag_id` | VARCHAR(36) | FK → personal_tags.id ON DELETE CASCADE | 태그 |

**UNIQUE**: `(personal_task_id, personal_tag_id)`
**인덱스**: `idx_ptt_task(personal_task_id)`, `idx_ptt_tag(personal_tag_id)`

**JPA 관계**:
- `@ManyToOne` → `PersonalTask` (personal_task_id)
- `@ManyToOne` → `PersonalTag` (personal_tag_id)

---

### 2.4 personal_habits (개인 습관)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, NOT NULL | 소유자 |
| `title` | VARCHAR(200) | NOT NULL | 습관명 |
| `description` | TEXT | nullable | 설명 |
| `icon` | VARCHAR(50) | nullable | 아이콘 (이모지/Lucide) |
| `color` | VARCHAR(20) | DEFAULT '#8B5CF6' | 색상 |
| `frequency_type` | VARCHAR(20) | NOT NULL, DEFAULT 'DAILY' | DAILY / WEEKDAY / WEEKEND / CUSTOM |
| `frequency_days` | VARCHAR(20) | nullable | CUSTOM시 요일 ("1,3,5") |
| `target_count` | INTEGER | NOT NULL, DEFAULT 1 | 목표 횟수 |
| `unit` | VARCHAR(50) | nullable | 단위 ("잔","분") |
| `current_streak` | INTEGER | NOT NULL, DEFAULT 0 | 현재 연속일 |
| `best_streak` | INTEGER | NOT NULL, DEFAULT 0 | 최고 연속일 |
| `importance` | VARCHAR(10) | NOT NULL, DEFAULT 'MEDIUM' | HIGH / MEDIUM |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | 정렬 순서 |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | soft delete |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**인덱스**: `idx_personal_habit_user_active(user_id, is_active)`, `idx_personal_habit_user_position(user_id, is_active, position)`

**JPA 관계**:
- `@ManyToOne` → `User` (user_id)
- `@OneToMany` ← `PersonalHabitLog` (mappedBy="habit", cascade ALL, orphanRemoval)

---

### 2.5 personal_habit_logs (습관 일별 기록)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `habit_id` | VARCHAR(36) | FK → personal_habits.id ON DELETE CASCADE | 습관 |
| `log_date` | DATE | NOT NULL | 기록 날짜 |
| `completed_count` | INTEGER | NOT NULL, DEFAULT 0 | 완료 횟수 |
| `is_completed` | BOOLEAN | NOT NULL, DEFAULT false | 목표 달성 여부 |
| `note` | VARCHAR(200) | nullable | 간단 메모 |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**UNIQUE**: `(habit_id, log_date)`
**인덱스**: `idx_habit_log_date(habit_id, log_date)`, `idx_habit_log_completed(habit_id, is_completed, log_date)`

**JPA 관계**:
- `@ManyToOne` → `PersonalHabit` (habit_id)

---

### 2.6 personal_events (개인 일정)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, NOT NULL | 소유자 |
| `title` | VARCHAR(200) | NOT NULL | 제목 |
| `description` | TEXT | nullable | 설명 |
| `event_date` | DATE | NOT NULL | 일정 날짜 |
| `start_time` | TIME | nullable | 시작 시간 |
| `end_time` | TIME | nullable | 종료 시간 |
| `color` | VARCHAR(20) | DEFAULT '#6366F1' | 색상 |
| `all_day` | BOOLEAN | DEFAULT false | 종일 여부 |
| `recurrence_rule` | VARCHAR(20) | nullable | 반복 규칙 |
| `recurrence_group_id` | VARCHAR(36) | nullable | 반복 그룹 ID |
| `recurrence_end_date` | DATE | nullable | 반복 종료일 |
| `recurrence_days_of_week` | VARCHAR(20) | nullable | 반복 요일 |
| `event_type` | VARCHAR(20) | NOT NULL, DEFAULT 'SCHEDULE' | CALENDAR / SCHEDULE |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**인덱스**: `idx_personal_event_user_date(user_id, event_date)`, `idx_personal_event_recurrence_group(recurrence_group_id)`

**JPA 관계**:
- `@ManyToOne` → `User` (user_id)

---

### 2.7 diary_entries (AI 일기)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, NOT NULL | 소유자 |
| `diary_date` | DATE | NOT NULL | 일기 날짜 |
| `title` | VARCHAR(200) | nullable | 제목 |
| `content` | TEXT | nullable | 내용 |
| `mood` | VARCHAR(50) | nullable | 감정 |
| `status` | VARCHAR(20) | DEFAULT 'CHATTING' | CHATTING / COMPLETED |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**UNIQUE**: `(user_id, diary_date)`
**인덱스**: `idx_diary_user_date(user_id, diary_date)`

**JPA 관계**:
- `@ManyToOne` → `User` (user_id)
- `@OneToMany` ← `DiaryMessage` (mappedBy="diary", cascade ALL, orphanRemoval, OrderBy messageOrder ASC)

---

### 2.8 diary_messages (일기 메시지)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `diary_id` | VARCHAR(36) | FK → diary_entries.id, NOT NULL | 일기 |
| `role` | VARCHAR(10) | NOT NULL | USER / AI |
| `content` | TEXT | NOT NULL | 메시지 내용 |
| `message_order` | INTEGER | NOT NULL | 대화 순서 |
| `audio_url` | VARCHAR(500) | nullable | 음성 URL |
| `audio_duration_seconds` | INTEGER | nullable | 음성 길이(초) |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**인덱스**: `idx_diary_message_diary(diary_id, message_order)`

**JPA 관계**:
- `@ManyToOne` → `DiaryEntry` (diary_id)

---

### 2.9 diary_voice_settings (음성 설정)

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|---------|------|
| `id` | VARCHAR(36) | PK | UUID |
| `user_id` | VARCHAR(36) | FK → users.id, UNIQUE, NOT NULL | 소유자 |
| `voice_type` | VARCHAR(20) | NOT NULL, DEFAULT 'nova' | 음성 타입 |
| `auto_play` | BOOLEAN | NOT NULL, DEFAULT true | 자동 재생 |
| `speed` | DECIMAL | NOT NULL, DEFAULT 1.0 | 재생 속도 |
| `created_at` | TIMESTAMP | NOT NULL | 생성일 (UTC) |
| `updated_at` | TIMESTAMP | nullable | 수정일 |

**JPA 관계**:
- `@OneToOne` → `User` (user_id, unique)

---

## 3. Entity ↔ DTO 매핑 관계도

### 3.1 PersonalTask 도메인

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PersonalTask Domain                                │
│                                                                             │
│  ┌──────────────────┐         ┌──────────────────────────────┐              │
│  │  Request DTOs    │         │      Entity                  │              │
│  │──────────────────│         │──────────────────────────────│              │
│  │ Create           │ ──────► │  PersonalTask                │              │
│  │  .title          │         │   .id                        │              │
│  │  .description    │         │   .user → User               │              │
│  │  .priority       │         │   .title                     │              │
│  │  .dueDate        │         │   .description               │              │
│  │  .category       │         │   .status (enum)             │              │
│  │  .color          │         │   .priority (enum)           │              │
│  │                  │         │   .dueDate                   │              │
│  │ Update           │ ──────► │   .category                  │              │
│  │  .title          │         │   .color                     │              │
│  │  .description    │         │   .position                  │              │
│  │  .priority       │         │   .completedAt               │              │
│  │  .dueDate        │         │   .taskTags → Set<TaskTag>   │              │
│  │  .category       │         │   .createdAt (BaseTimeEntity)│              │
│  │  .color          │         │   .updatedAt (BaseTimeEntity)│              │
│  │                  │         └────────────┬─────────────────┘              │
│  │ StatusUpdate     │ ──────►              │                                │
│  │  .status         │                      │ of()                           │
│  │                  │                      ▼                                │
│  │ PositionUpdate   │         ┌──────────────────────────────┐              │
│  │  .status         │         │  Response DTOs               │              │
│  │  .position       │         │──────────────────────────────│              │
│  └──────────────────┘         │ Detail                       │              │
│                               │  .id, .title, .description   │              │
│                               │  .status, .priority          │              │
│                               │  .dueDate, .category, .color │              │
│                               │  .position, .completedAt     │              │
│                               │  .createdAt, .updatedAt      │              │
│                               │                              │              │
│                               │ Summary                      │              │
│                               │  .id, .title                 │              │
│                               │  .status, .priority          │              │
│                               │  .dueDate, .category         │              │
│                               └──────────────────────────────┘              │
│                                                                             │
│  Enums: PersonalTaskStatus  (TODO, IN_PROGRESS, DONE, ARCHIVED)             │
│         PersonalTaskPriority (NONE, LOW, MEDIUM, HIGH, URGENT)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 PersonalHabit 도메인

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PersonalHabit Domain                                │
│                                                                             │
│  ┌──────────────────┐         ┌──────────────────────────────┐              │
│  │  Request DTOs    │         │      Entity                  │              │
│  │──────────────────│         │──────────────────────────────│              │
│  │ Create           │ ──────► │  PersonalHabit               │              │
│  │  .title          │         │   .id                        │              │
│  │  .description    │         │   .user → User               │              │
│  │  .icon           │         │   .title                     │              │
│  │  .color          │         │   .description               │              │
│  │  .frequencyType  │         │   .icon                      │              │
│  │  .frequencyDays  │         │   .color                     │              │
│  │  .targetCount    │         │   .frequencyType (enum)      │              │
│  │  .unit           │         │   .frequencyDays             │              │
│  │  .importance     │         │   .targetCount               │              │
│  │                  │         │   .unit                      │              │
│  │ Update           │ ──────► │   .currentStreak             │              │
│  │  (same fields)   │         │   .bestStreak                │              │
│  │                  │         │   .importance (enum)         │              │
│  │ PositionUpdate   │ ──────► │   .position                  │              │
│  │  .position       │         │   .isActive                  │              │
│  │                  │         │   .logs → List<HabitLog>     │              │
│  │ CheckIn          │         │   .createdAt (BaseTimeEntity)│              │
│  │  .note           │         │   .updatedAt (BaseTimeEntity)│              │
│  │  .logDate        │         └────────────┬─────────────────┘              │
│  └──────────────────┘                      │ of()                           │
│                                            ▼                                │
│                               ┌──────────────────────────────┐              │
│                               │  Response DTOs               │              │
│                               │──────────────────────────────│              │
│                               │ Detail                       │              │
│                               │  .id, .title, .description   │              │
│                               │  .icon, .color               │              │
│                               │  .frequencyType, .frequencyDays│             │
│                               │  .targetCount, .unit         │              │
│                               │  .importance                 │              │
│                               │  .currentStreak, .bestStreak │              │
│                               │  .position, .isActive        │              │
│                               │  .createdAt, .updatedAt      │              │
│                               │                              │              │
│  ┌──────────────────┐         │ TodayItem (집계)             │              │
│  │  PersonalHabitLog │ ──────►│  .habitId, .title, .icon     │              │
│  │  (Entity)         │        │  .color, .targetCount        │              │
│  │   .habit → Habit  │        │  .completedCount, .isCompleted│             │
│  │   .logDate        │        │  .unit, .currentStreak       │              │
│  │   .completedCount │        │  .importance                 │              │
│  │   .isCompleted    │        │  .frequencyType, .frequencyDays│             │
│  │   .note           │        │  .weeklyTarget, .weeklyCompleted│            │
│  │   .createdAt      │        │                              │              │
│  │   .updatedAt      │        │ LogEntry                     │              │
│  └──────────────────┘         │  .id, .logDate               │              │
│                               │  .completedCount, .isCompleted│             │
│                               │  .note                       │              │
│                               │                              │              │
│                               │ WeeklyMatrix                 │              │
│                               │  .habits: List<HabitWeeklyRow>│             │
│                               │  .startDate, .endDate        │              │
│                               │                              │              │
│                               │ HabitWeeklyRow               │              │
│                               │  .habitId, .title, .icon     │              │
│                               │  .color                      │              │
│                               │  .days: List<DayStatus>      │              │
│                               │                              │              │
│                               │ DayStatus                    │              │
│                               │  .date, .completedCount      │              │
│                               │  .targetCount, .isCompleted  │              │
│                               └──────────────────────────────┘              │
│                                                                             │
│  Enums: HabitFrequency  (DAILY, WEEKDAY, WEEKEND, CUSTOM)                   │
│         HabitImportance (HIGH, MEDIUM)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.3 PersonalEvent 도메인

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PersonalEvent Domain                                 │
│                                                                             │
│  ┌──────────────────┐         ┌──────────────────────────────┐              │
│  │  Request DTOs    │         │      Entity                  │              │
│  │──────────────────│         │──────────────────────────────│              │
│  │ Create           │ ──────► │  PersonalEvent               │              │
│  │  .title          │         │   .id                        │              │
│  │  .description    │         │   .user → User               │              │
│  │  .eventDate      │         │   .title                     │              │
│  │  .startTime      │         │   .description               │              │
│  │  .endTime        │         │   .eventDate                 │              │
│  │  .color          │         │   .startTime                 │              │
│  │  .allDay         │         │   .endTime                   │              │
│  │  .recurrenceRule │         │   .color                     │              │
│  │  .recurrenceEndDate│       │   .allDay                    │              │
│  │  .recurrenceDaysOfWeek│    │   .recurrenceRule            │              │
│  │  .eventType      │         │   .recurrenceGroupId         │              │
│  │                  │         │   .recurrenceEndDate         │              │
│  │ Update           │ ──────► │   .recurrenceDaysOfWeek      │              │
│  │  (same + .scope) │         │   .eventType                 │              │
│  └──────────────────┘         │   .createdAt (BaseTimeEntity)│              │
│                               │   .updatedAt (BaseTimeEntity)│              │
│                               └────────────┬─────────────────┘              │
│                                            │ of()                           │
│                                            ▼                                │
│                               ┌──────────────────────────────┐              │
│                               │  Response DTO                │              │
│                               │──────────────────────────────│              │
│                               │ Detail                       │              │
│                               │  .id, .title, .description   │              │
│                               │  .eventDate                  │              │
│                               │  .startTime, .endTime        │              │
│                               │  .color, .allDay             │              │
│                               │  .recurrenceRule             │              │
│                               │  .recurrenceGroupId          │              │
│                               │  .recurrenceEndDate          │              │
│                               │  .recurrenceDaysOfWeek       │              │
│                               │  .eventType                  │              │
│                               │  .createdAt, .updatedAt      │              │
│                               └──────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.4 Diary 도메인

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Diary Domain                                     │
│                                                                             │
│  ┌──────────────────┐         ┌──────────────────────────────┐              │
│  │  Request DTOs    │         │      Entities                │              │
│  │──────────────────│         │──────────────────────────────│              │
│  │ Create           │ ──────► │  DiaryEntry                  │              │
│  │  .diaryDate      │         │   .id                        │              │
│  │                  │         │   .user → User               │              │
│  │ SendMessage      │ ──────► │   .diaryDate                 │              │
│  │  .content        │    │    │   .title                     │              │
│  │                  │    │    │   .content                   │              │
│  │ Complete         │ ──►│    │   .mood                      │              │
│  │  .title          │    │    │   .status (enum)             │              │
│  │  .content        │    │    │   .messages → List<Message>  │              │
│  │  .mood           │    │    │   .createdAt (BaseTimeEntity)│              │
│  │                  │    │    │   .updatedAt (BaseTimeEntity)│              │
│  │ Update           │ ──►│    └────────────┬─────────────────┘              │
│  │  .title          │    │                 │                                │
│  │  .content        │    │            1:N  │                                │
│  │  .mood           │    │                 ▼                                │
│  └──────────────────┘    │    ┌──────────────────────────────┐              │
│                          └──► │  DiaryMessage                │              │
│                               │   .id                        │              │
│                               │   .diary → DiaryEntry        │              │
│                               │   .role (USER / AI)          │              │
│                               │   .content                   │              │
│                               │   .messageOrder              │              │
│                               │   .audioUrl                  │              │
│                               │   .audioDurationSeconds      │              │
│                               │   .createdAt (BaseTimeEntity)│              │
│                               └────────────┬─────────────────┘              │
│                                            │ of()                           │
│                                            ▼                                │
│                               ┌──────────────────────────────┐              │
│  ┌──────────────────┐         │  Response DTOs               │              │
│  │DiaryVoiceSettings│         │──────────────────────────────│              │
│  │ (Entity)         │         │ Simple                       │              │
│  │  .id             │         │  .id, .diaryDate, .title     │              │
│  │  .user → User    │         │  .mood, .status, .createdAt  │              │
│  │  .voiceType      │         │                              │              │
│  │  .autoPlay       │         │ Detail                       │              │
│  │  .speed          │         │  .id, .diaryDate, .title     │              │
│  └──────────────────┘         │  .content, .mood, .status    │              │
│                               │  .messages: List<MessageDetail>│             │
│                               │  .createdAt, .updatedAt      │              │
│                               │                              │              │
│                               │ MessageDetail                │              │
│                               │  .id, .role, .content        │              │
│                               │  .messageOrder               │              │
│                               │  .audioUrl, .audioDurationSeconds│           │
│                               │  .createdAt                  │              │
│                               │                              │              │
│                               │ AiReply                      │              │
│                               │  .diaryId                    │              │
│                               │  .userMessage: MessageDetail │              │
│                               │  .aiMessage: MessageDetail   │              │
│                               │                              │              │
│                               │ VoiceReply                   │              │
│                               │  .diaryId, .userText         │              │
│                               │  .userMessage, .aiText       │              │
│                               │  .aiMessage, .aiAudioUrl     │              │
│                               └──────────────────────────────┘              │
│                                                                             │
│  Enum: DiaryStatus (CHATTING, COMPLETED)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.5 PersonalDashboard (집계 DTO)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PersonalDashboardResponse (집계)                         │
│                                                                             │
│  여러 도메인을 조합하여 오늘의 대시보드 데이터를 제공                        │
│                                                                             │
│  PersonalDashboardResponse                                                  │
│  ├── dueTodayTasks:    List<PersonalTaskResponse.Detail>   ← PersonalTask   │
│  ├── inProgressTasks:  List<PersonalTaskResponse.Detail>   ← PersonalTask   │
│  ├── personalEvents:   List<PersonalEventResponse.Detail>  ← PersonalEvent  │
│  ├── habitsToday:      List<PersonalHabitResponse.TodayItem> ← PersonalHabit│
│  ├── taskCompletionRate:   double                                           │
│  ├── habitCompletionRate:  double                                           │
│  ├── activeTaskCount:      long                                             │
│  ├── completedTodayCount:  long                                             │
│  └── diaryToday:       DiaryTodayInfo                      ← DiaryEntry    │
│       ├── id: String                                                        │
│       ├── status: String (CHATTING / COMPLETED)                             │
│       ├── title: String                                                     │
│       └── mood: String                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. JPA 관계 요약표

| Source Entity | Relation | Target Entity | FK Column | Cascade | Note |
|--------------|----------|---------------|-----------|---------|------|
| `PersonalTask` | N:1 | `User` | user_id | - | 소유자 |
| `PersonalTask` | 1:N | `PersonalTaskTag` | personal_task_id | ALL + orphanRemoval | 태그 매핑 |
| `PersonalTag` | N:1 | `User` | user_id | - | 소유자 |
| `PersonalTaskTag` | N:1 | `PersonalTask` | personal_task_id | - | M:N 조인 |
| `PersonalTaskTag` | N:1 | `PersonalTag` | personal_tag_id | - | M:N 조인 |
| `PersonalHabit` | N:1 | `User` | user_id | - | 소유자 |
| `PersonalHabit` | 1:N | `PersonalHabitLog` | habit_id | ALL + orphanRemoval | 일별 기록 |
| `PersonalHabitLog` | N:1 | `PersonalHabit` | habit_id | - | 습관 참조 |
| `PersonalEvent` | N:1 | `User` | user_id | - | 소유자 |
| `DiaryEntry` | N:1 | `User` | user_id | - | 소유자 |
| `DiaryEntry` | 1:N | `DiaryMessage` | diary_id | ALL + orphanRemoval | 대화 메시지 |
| `DiaryMessage` | N:1 | `DiaryEntry` | diary_id | - | 일기 참조 |
| `DiaryVoiceSettings` | 1:1 | `User` | user_id (UNIQUE) | - | 음성 설정 |

---

## 5. Enum 정리

| Enum | 위치 | 값 |
|------|------|-----|
| `PersonalTaskStatus` | personal/ | `TODO`, `IN_PROGRESS`, `DONE`, `ARCHIVED` |
| `PersonalTaskPriority` | personal/ | `NONE`, `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `HabitFrequency` | personal/ | `DAILY`, `WEEKDAY`, `WEEKEND`, `CUSTOM` |
| `HabitImportance` | personal/ | `HIGH`, `MEDIUM` |
| `DiaryStatus` | diary/ | `CHATTING`, `COMPLETED` |

---

## 6. API 엔드포인트 ↔ DTO 매핑

| API | Method | Request DTO | Response DTO |
|-----|--------|-------------|--------------|
| `/api/v1/personal/tasks` | GET | - | `List<PersonalTaskResponse.Detail>` |
| `/api/v1/personal/tasks/{id}` | GET | - | `PersonalTaskResponse.Detail` |
| `/api/v1/personal/tasks` | POST | `PersonalTaskRequest.Create` | `PersonalTaskResponse.Detail` |
| `/api/v1/personal/tasks/{id}` | PUT | `PersonalTaskRequest.Update` | `PersonalTaskResponse.Detail` |
| `/api/v1/personal/tasks/{id}/status` | PATCH | `PersonalTaskRequest.StatusUpdate` | `PersonalTaskResponse.Detail` |
| `/api/v1/personal/tasks/{id}/position` | PUT | `PersonalTaskRequest.PositionUpdate` | - |
| `/api/v1/personal/habits` | GET | - | `List<PersonalHabitResponse.Detail>` |
| `/api/v1/personal/habits/{id}` | GET | - | `PersonalHabitResponse.Detail` |
| `/api/v1/personal/habits` | POST | `PersonalHabitRequest.Create` | `PersonalHabitResponse.Detail` |
| `/api/v1/personal/habits/{id}` | PUT | `PersonalHabitRequest.Update` | `PersonalHabitResponse.Detail` |
| `/api/v1/personal/habits/{id}/check-in` | POST | `PersonalHabitRequest.CheckIn` | `PersonalHabitResponse.TodayItem` |
| `/api/v1/personal/habits/today` | GET | - | `List<PersonalHabitResponse.TodayItem>` |
| `/api/v1/personal/habits/weekly` | GET | ?start_date&end_date | `PersonalHabitResponse.WeeklyMatrix` |
| `/api/v1/personal/events` | GET | ?date= | `List<PersonalEventResponse.Detail>` |
| `/api/v1/personal/events` | POST | `PersonalEventRequest.Create` | `PersonalEventResponse.Detail` |
| `/api/v1/personal/events/{id}` | PUT | `PersonalEventRequest.Update` | `PersonalEventResponse.Detail` |
| `/api/v1/personal/dashboard/today` | GET | - | `PersonalDashboardResponse` |
| `/api/v1/diary` | POST | `DiaryRequest.Create` | `DiaryResponse.Detail` |
| `/api/v1/diary/{id}/messages` | POST | `DiaryRequest.SendMessage` | `DiaryResponse.AiReply` |
| `/api/v1/diary/{id}/complete` | PUT | `DiaryRequest.Complete` | `DiaryResponse.Detail` |
| `/api/v1/diary/{id}` | GET | - | `DiaryResponse.Detail` |
| `/api/v1/diary/list` | GET | ?year&month | `List<DiaryResponse.Simple>` |

---

## 7. 패키지 구조

```
com.kanban.domain/
├── personal/                              # 개인 공간 도메인
│   ├── PersonalTask.java                  # 할 일 엔티티
│   ├── PersonalTaskRepository.java
│   ├── PersonalTaskStatus.java            # enum: TODO, IN_PROGRESS, DONE, ARCHIVED
│   ├── PersonalTaskPriority.java          # enum: NONE, LOW, MEDIUM, HIGH, URGENT
│   ├── PersonalTag.java                   # 태그 엔티티
│   ├── PersonalTagRepository.java
│   ├── PersonalTaskTag.java               # M:N 조인 엔티티
│   ├── PersonalTaskTagRepository.java
│   ├── PersonalHabit.java                 # 습관 엔티티
│   ├── PersonalHabitRepository.java
│   ├── PersonalHabitLog.java              # 습관 일별 기록 엔티티
│   ├── PersonalHabitLogRepository.java
│   ├── HabitFrequency.java                # enum: DAILY, WEEKDAY, WEEKEND, CUSTOM
│   ├── HabitImportance.java               # enum: HIGH, MEDIUM
│   ├── PersonalEvent.java                 # 일정 엔티티
│   ├── PersonalEventRepository.java
│   ├── controller/
│   │   ├── PersonalTaskController.java
│   │   ├── PersonalHabitController.java
│   │   ├── PersonalEventController.java
│   │   ├── PersonalDashboardController.java
│   │   └── PersonalSpaceController.java
│   ├── dto/
│   │   ├── PersonalTaskRequest.java       # Create, Update, StatusUpdate, PositionUpdate
│   │   ├── PersonalTaskResponse.java      # Detail, Summary
│   │   ├── PersonalHabitRequest.java      # Create, Update, PositionUpdate, CheckIn
│   │   ├── PersonalHabitResponse.java     # Detail, TodayItem, LogEntry, WeeklyMatrix, ...
│   │   ├── PersonalEventRequest.java      # Create, Update
│   │   ├── PersonalEventResponse.java     # Detail
│   │   └── PersonalDashboardResponse.java # 오늘 대시보드 집계
│   └── service/
│       ├── PersonalTaskService.java
│       ├── PersonalHabitService.java
│       ├── PersonalEventService.java
│       └── PersonalDashboardService.java
│
└── diary/                                 # AI 일기 도메인
    ├── DiaryEntry.java                    # 일기 엔티티
    ├── DiaryEntryRepository.java
    ├── DiaryMessage.java                  # 메시지 엔티티
    ├── DiaryMessageRepository.java
    ├── DiaryStatus.java                   # enum: CHATTING, COMPLETED
    ├── DiaryVoiceSettings.java            # 음성 설정 엔티티
    ├── DiaryVoiceSettingsRepository.java
    ├── controller/
    │   └── DiaryController.java
    ├── dto/
    │   ├── DiaryRequest.java              # Create, SendMessage, Complete, Update
    │   └── DiaryResponse.java             # Simple, Detail, MessageDetail, AiReply, VoiceReply
    └── service/
        ├── DiaryService.java
        ├── DiaryAIService.java
        └── DiaryVoiceService.java
```
