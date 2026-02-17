# BRIDGE SPOTS - Personal Board 기획서 v8.0

## 0. Executive Summary

**목표**: 개인 사용자를 위한 "나만의 공간"을 제공하여, BRIDGE 플랫폼에 유입·정착시키고 팀 보드 전환을 유도하는 성장 엔진

**핵심 전략**:
- 대부분 무료 제공 → 사용자 유입 극대화
- 기존 시스템(Board, Schedule, Note, Checklist, AI) 최대 재활용 → 빠른 개발
- AI 서비스를 적극 탈재하여 차별화 → "AI가 함께하는 일상 관리 도구"

**예상 사용자**: 개인 일정 관리, 일기 기록, 사진 앨범, 습관 추적, 자기계발 등을 원하는 개인 사용자

---

## 1. 서비스 구조 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           사용자 (User)                                 │
│   - 이메일/소셜 로그인 (기존 Auth 재활용)                                  │
│   - 팀 보드 + 퍼스널 보드 모두 접근 가능                                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
     ┌────────▼────────┐              ┌────────▼────────┐
     │   팀 보드 (기존)  │              │  퍼스널 보드 (신규) │
     │  Board.type=TEAM │              │ Board.type=PERSONAL│
     │  멀티 멤버, 협업  │              │  나만의 공간, 1인   │
     └────────┬────────┘              └────────┬────────┘
              │                                │
     기존 기능 전체                     ┌───────┼───────┬──────────┬──────────┐
                                      │       │       │          │          │
                                ┌─────▼──┐ ┌──▼───┐ ┌▼────┐ ┌───▼───┐ ┌───▼───┐
                                │ 내 일정 │ │ 일기  │ │ 노트 │ │ 습관   │ │ AI    │
                                │Schedule│ │Diary │ │Note │ │Habit  │ │Coach  │
                                └────────┘ └──────┘ └─────┘ └───────┘ └───────┘
```

---

## 2. 퍼스널 보드 모듈 상세

### 2.1 모듈 구성

| 모듈 | 설명 | 기존 재활용 | 신규 개발 |
|------|------|-----------|----------|
| **내 일정** | 개인 일정/캘린더 | Schedule, CalendarView | 개인 일정 특화 UI |
| **일기** | 일기 + 사진/감정 기록 | Note(DOCUMENT), FileUpload | Diary 엔티티, 감정 분석 AI |
| **노트** | 자유 메모/문서 | Note 도메인 전체 | 퍼스널 노트 뷰 |
| **습관 트래커** | 매일 반복 습관 체크 | DailyChecklist | 습관 통계, 연속 기록 |
| **AI 코치** | AI 대화형 코칭 | AIProvider, AI Credit | 코칭 프롬프트, 대화 UI |
| **갤러리** | 사진/이미지 모아보기 | FileUpload(S3) | 갤러리 뷰 |

### 2.2 서비스 구조 다이어그램

```
퍼스널 보드 (Board.type = PERSONAL)
│
├── 📅 내 일정 (My Schedule)
│   ├── 월간 캘린더 뷰  ← CalendarView 재활용
│   ├── 주간 타임라인   ← WeeklyScheduleView 재활용
│   ├── 일일 스케줄     ← DailyScheduleView 재활용
│   ├── 일정 생성/수정  ← ScheduleBlock 재활용
│   └── 🤖 AI 일정 제안  [NEW] - "이번 주 비어있는 시간에 운동 넣어줘"
│
├── 📓 일기 (Diary)  [NEW Module]
│   ├── 날짜별 일기 작성
│   │   ├── 텍스트 에디터  ← Note 블록 에디터 재활용
│   │   ├── 사진 첨부 (다중) ← FileUpload 재활용
│   │   ├── 감정 태그 (😊😢😤😴🎉 등)
│   │   ├── 날씨 태그 (☀️🌧️⛅❄️ 등)
│   │   └── 위치 태그 (선택)
│   ├── 캘린더 뷰 (일기 작성 날짜 표시)
│   ├── 갤러리 뷰 (사진 그리드)
│   ├── 🤖 AI 일기 요약 - 주간/월간 감정 분석 리포트
│   ├── 🤖 AI 일기 프롬프트 - "오늘 하루 어떠셨어요?" 작성 도우미
│   └── 🔒 개인 잠금 (PIN/생체인증 연동)
│
├── 📝 노트 (Notes)
│   ├── 폴더/문서 트리  ← Note 도메인 전체 재활용
│   ├── 블록 에디터     ← Note blocks 재활용
│   ├── 버전 히스토리   ← NoteVersion 재활용
│   ├── 공유 링크       ← Note.shareToken 재활용
│   └── 🤖 AI 요약/정리 - 긴 노트 요약, 액션 아이템 추출
│
├── ✅ 습관 트래커 (Habit Tracker)  [NEW Module]
│   ├── 습관 목록 관리  ← DailyChecklist 구조 확장
│   │   ├── 반복 주기 (매일/평일/주말/특정 요일)
│   │   ├── 목표 횟수 (예: 물 8잔)
│   │   ├── 카테고리 (건강, 학습, 생활 등)
│   │   └── 아이콘/색상 커스터마이징
│   ├── 오늘의 습관 체크
│   ├── 연속 기록 (Streak) 표시
│   ├── 월간 달성률 히트맵
│   ├── 🤖 AI 습관 코칭 - 달성률 기반 동기부여 메시지
│   └── 🤖 AI 습관 추천 - 기존 패턴 분석 후 새 습관 제안
│
├── 🤖 AI 코치 (AI Life Coach)  [NEW Module]
│   ├── 대화형 인터페이스
│   │   ├── 일정 관리 도우미 - "이번 주 일정 정리해줘"
│   │   ├── 일기 리뷰어 - "이번 달 감정 패턴 분석해줘"
│   │   ├── 습관 코치 - "운동 습관 만들고 싶어"
│   │   ├── 목표 설정 도우미 - "분기 목표 세우는 거 도와줘"
│   │   └── 회고 도우미 - "이번 주 회고 작성해줘"
│   ├── 컨텍스트 인식 (일정 + 일기 + 습관 데이터 기반)
│   └── 대화 히스토리 저장
│
└── 🖼️ 갤러리 (Gallery)
    ├── 일기 사진 자동 수집
    ├── 월별/태그별 분류
    └── 사진 뷰어 (라이트박스)  ← VideoLightbox 패턴 재활용
```

---

## 3. 비즈니스 모델 - 퍼스널 보드 전용

### 3.1 핵심 과금 원칙

> **"최대한 무료로 제공하여 사용자 유입 → BRIDGE 생태계 정착 → 팀 보드 전환 유도"**

### 3.2 퍼스널 보드 티어

| 기능 | Free | Personal Pro ($2.99/월) |
|------|:----:|:----:|
| **퍼스널 보드 생성** | 1개 | 3개 |
| **내 일정 (캘린더)** | ✅ 전체 | ✅ 전체 |
| **일기 작성** | ✅ 무제한 | ✅ 무제한 |
| **일기 사진 첨부** | 일기당 3장 | 일기당 20장 |
| **노트** | 20개 문서 | 무제한 |
| **습관 트래커** | 5개 습관 | 무제한 |
| **갤러리 저장 공간** | 500MB | 10GB |
| **AI 코치 대화** | 30회/월 | 300회/월 |
| **AI 일기 요약** | 주 1회 | 무제한 |
| **AI 습관 코칭** | 주 1회 | 무제한 |
| **AI 일정 제안** | ✅ | ✅ |
| **일기 잠금(PIN)** | ❌ | ✅ |
| **데이터 내보내기** | ❌ | ✅ (JSON/PDF) |
| **팀 보드 연결** | ❌ | ✅ (팀 일정 싱크) |

### 3.3 AI 크레딧 분리

| 구분 | 팀 보드 (기존) | 퍼스널 보드 (신규) |
|------|:---:|:---:|
| **크레딧 풀** | 보드 Subscription | 사용자 계정 레벨 |
| **Free 월 할당** | - | 50 크레딧 |
| **Pro 월 할당** | - | 500 크레딧 |
| **크레딧 소비** | 기존 동일 | 아래 표 참고 |

**퍼스널 AI 크레딧 소비표**:

| AI 기능 | 크레딧/회 | 설명 |
|---------|:---------:|------|
| AI 코치 대화 | 1 | 1회 대화 턴 |
| AI 일기 프롬프트 | 0 | 무료 (짧은 프롬프트) |
| AI 일기 주간 요약 | 3 | 7일치 일기 분석 |
| AI 일기 월간 리포트 | 5 | 30일치 감정 패턴 분석 |
| AI 습관 코칭 메시지 | 1 | 진행률 기반 코칭 |
| AI 습관 추천 | 2 | 패턴 분석 후 추천 |
| AI 일정 자동 배치 | 2 | 빈 시간 분석 + 일정 제안 |
| AI 노트 요약 | 2 | 문서 요약 + 액션아이템 |
| AI 주간 회고 생성 | 3 | 일정+일기+습관 종합 |

### 3.4 퍼널 전략

```
                    ┌─────────────────────┐
                    │  광고/바이럴/SEO     │
                    │  "AI 일기 앱" "일정 앱" │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  가입 (무료)          │
                    │  퍼스널 보드 자동 생성  │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  일기/일정/습관 사용   │  ← Free 기능으로 정착
                    │  AI 코치 체험         │
                    └──────────┬──────────┘
                               ▼
               ┌───────────────┴───────────────┐
               ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐
    │ Personal Pro 전환 │           │ 팀 보드 생성/초대  │
    │  AI+저장공간 확장  │           │  협업 기능 발견     │
    └──────────────────┘           └──────────────────┘
               │                               │
               └───────────┬───────────────────┘
                           ▼
                ┌──────────────────┐
                │ 팀 Premium 전환   │  ← 최종 목표
                │  시트 기반 과금    │
                └──────────────────┘
```

---

## 4. 데이터 모델 (엔티티 설계)

### 4.1 기존 엔티티 확장

#### Board 엔티티 확장
```java
// 기존 Board에 boardType 필드 추가
@Entity
public class Board {
    // ... 기존 필드 ...

    @Enumerated(EnumType.STRING)
    @Column(name = "board_type", nullable = false)
    private BoardType boardType = BoardType.TEAM;  // 기본값: 팀 보드

    // 퍼스널 보드 전용 설정
    @Column(name = "personal_pin_hash")
    private String personalPinHash;  // PIN 잠금 (Pro)

    public boolean isPersonal() {
        return this.boardType == BoardType.PERSONAL;
    }
}

public enum BoardType {
    TEAM,      // 기존 팀 보드
    PERSONAL   // 퍼스널 보드
}
```

#### User 엔티티 확장
```java
@Entity
public class User {
    // ... 기존 필드 ...

    // 퍼스널 AI 크레딧 (계정 레벨)
    @Column(name = "personal_ai_credits_monthly")
    private Integer personalAiCreditsMonthly = 50;

    @Column(name = "personal_ai_credits_used")
    private Integer personalAiCreditsUsed = 0;

    @Column(name = "personal_tier")
    @Enumerated(EnumType.STRING)
    private PersonalTier personalTier = PersonalTier.FREE;

    @Column(name = "personal_storage_used_bytes")
    private Long personalStorageUsedBytes = 0L;
}

public enum PersonalTier {
    FREE,
    PRO
}
```

### 4.2 신규 엔티티

#### DiaryEntry (일기)
```java
@Entity
@Table(name = "diary_entries", indexes = {
    @Index(name = "idx_diary_board_date", columnList = "board_id, entry_date"),
    @Index(name = "idx_diary_user", columnList = "user_id")
})
public class DiaryEntry extends BaseTimeEntity {
    @Id
    private String id;  // UUID

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "board_id")
    private Board board;  // 퍼스널 보드 참조

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(columnDefinition = "TEXT")
    private String content;  // 일기 본문 (HTML/Markdown)

    @Column(name = "mood")
    @Enumerated(EnumType.STRING)
    private Mood mood;  // 감정 태그

    @Column(name = "weather")
    @Enumerated(EnumType.STRING)
    private Weather weather;  // 날씨 태그

    @Column(name = "location")
    private String location;  // 위치 (선택)

    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;  // AI 요약

    @Column(name = "is_locked")
    private Boolean isLocked = false;  // PIN 잠금 여부

    // 일기 → 사진 관계 (1:N)
    @OneToMany(mappedBy = "diaryEntry", cascade = CascadeType.ALL)
    private List<DiaryPhoto> photos = new ArrayList<>();
}

public enum Mood {
    HAPPY, SAD, ANGRY, TIRED, EXCITED, CALM, ANXIOUS, GRATEFUL, NEUTRAL
}

public enum Weather {
    SUNNY, CLOUDY, RAINY, SNOWY, WINDY, FOGGY, STORMY
}
```

#### DiaryPhoto (일기 사진)
```java
@Entity
@Table(name = "diary_photos")
public class DiaryPhoto extends BaseTimeEntity {
    @Id
    private String id;  // UUID

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "diary_entry_id")
    private DiaryEntry diaryEntry;

    @Column(name = "file_url", length = 500, nullable = false)
    private String fileUrl;  // S3/Local URL

    @Column(name = "thumbnail_url", length = 500)
    private String thumbnailUrl;

    @Column(name = "file_size")
    private Long fileSize;  // bytes

    @Column(name = "position")
    private Integer position;  // 순서

    @Column(name = "caption")
    private String caption;  // 사진 설명 (선택)
}
```

#### Habit (습관)
```java
@Entity
@Table(name = "habits", indexes = {
    @Index(name = "idx_habit_board", columnList = "board_id"),
    @Index(name = "idx_habit_user", columnList = "user_id")
})
public class Habit extends BaseTimeEntity {
    @Id
    private String id;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "board_id")
    private Board board;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 500)
    private String description;

    @Column(name = "icon", length = 10)
    private String icon;  // 이모지

    @Column(name = "color", length = 7)
    private String color;  // HEX 색상

    @Column(name = "category")
    @Enumerated(EnumType.STRING)
    private HabitCategory category;

    @Column(name = "frequency_type")
    @Enumerated(EnumType.STRING)
    private FrequencyType frequencyType;  // DAILY, WEEKDAY, WEEKEND, CUSTOM

    @Column(name = "frequency_days")
    private String frequencyDays;  // "MON,WED,FRI" (CUSTOM일 때)

    @Column(name = "target_count")
    private Integer targetCount = 1;  // 일일 목표 횟수

    @Column(name = "unit", length = 50)
    private String unit;  // "잔", "분", "페이지" 등

    @Column(name = "current_streak")
    private Integer currentStreak = 0;

    @Column(name = "best_streak")
    private Integer bestStreak = 0;

    @Column(name = "position")
    private Integer position;

    @Column(name = "is_active")
    private Boolean isActive = true;

    @Column(name = "is_archived")
    private Boolean isArchived = false;
}

public enum HabitCategory {
    HEALTH, EXERCISE, STUDY, WORK, MINDFULNESS, SOCIAL, CREATIVITY, LIFESTYLE
}

public enum FrequencyType {
    DAILY, WEEKDAY, WEEKEND, CUSTOM
}
```

#### HabitLog (습관 기록)
```java
@Entity
@Table(name = "habit_logs",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_habit_log_date",
        columnNames = {"habit_id", "log_date"}
    ),
    indexes = {
        @Index(name = "idx_habit_log_date", columnList = "habit_id, log_date")
    })
public class HabitLog extends BaseTimeEntity {
    @Id
    private String id;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "habit_id")
    private Habit habit;

    @Column(name = "log_date", nullable = false)
    private LocalDate logDate;

    @Column(name = "completed_count")
    private Integer completedCount = 0;

    @Column(name = "is_completed")
    private Boolean isCompleted = false;  // completedCount >= targetCount

    @Column(name = "note", length = 500)
    private String note;  // 간단 메모
}
```

#### AiCoachConversation (AI 코치 대화)
```java
@Entity
@Table(name = "ai_coach_conversations", indexes = {
    @Index(name = "idx_ai_coach_user", columnList = "user_id"),
    @Index(name = "idx_ai_coach_board", columnList = "board_id")
})
public class AiCoachConversation extends BaseTimeEntity {
    @Id
    private String id;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "board_id")
    private Board board;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 200)
    private String title;  // 대화 제목 (자동 생성)

    @Column(name = "topic")
    @Enumerated(EnumType.STRING)
    private CoachTopic topic;  // 대화 주제

    @Column(name = "context_snapshot", columnDefinition = "TEXT")
    private String contextSnapshot;  // 대화 시작 시 컨텍스트 (JSON)

    @Column(name = "is_archived")
    private Boolean isArchived = false;
}

public enum CoachTopic {
    SCHEDULE,    // 일정 관리
    DIARY,       // 일기 리뷰
    HABIT,       // 습관 코칭
    GOAL,        // 목표 설정
    RETROSPECT,  // 회고
    GENERAL      // 일반 대화
}
```

#### AiCoachMessage (AI 코치 메시지)
```java
@Entity
@Table(name = "ai_coach_messages", indexes = {
    @Index(name = "idx_ai_coach_msg_conv", columnList = "conversation_id")
})
public class AiCoachMessage extends BaseTimeEntity {
    @Id
    private String id;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "conversation_id")
    private AiCoachConversation conversation;

    @Column(name = "role", nullable = false)
    @Enumerated(EnumType.STRING)
    private MessageRole role;  // USER, ASSISTANT, SYSTEM

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;
}

public enum MessageRole {
    USER, ASSISTANT, SYSTEM
}
```

### 4.3 ERD 관계도

```
┌──────────────┐      1:1       ┌──────────────────┐
│     User     │───────────────▶│  PersonalTier    │
│              │                │  (User 내 필드)   │
│  personal_   │                └──────────────────┘
│  tier        │
│  ai_credits  │
└──────┬───────┘
       │ 1:N
       ├────────────────────────────────────┐
       │                                    │
┌──────▼───────┐                   ┌───────▼────────┐
│    Board     │                   │ AiCoach        │
│ type=PERSONAL│                   │ Conversation   │
└──────┬───────┘                   └───────┬────────┘
       │                                   │ 1:N
       │ 1:N                       ┌───────▼────────┐
       ├──────────────┐            │ AiCoachMessage │
       │              │            └────────────────┘
┌──────▼───┐  ┌───────▼──────┐
│DiaryEntry│  │    Habit     │
└──────┬───┘  └───────┬──────┘
       │ 1:N          │ 1:N
┌──────▼───┐  ┌───────▼──────┐
│DiaryPhoto│  │  HabitLog    │
└──────────┘  └──────────────┘

+ 기존 Note, ScheduleBlock, DailyChecklist도 Board에 연결 (재활용)
```

---

## 5. API 설계

### 5.1 퍼스널 보드 관리

```
POST   /api/v1/personal/boards              → 퍼스널 보드 생성 (가입 시 자동)
GET    /api/v1/personal/boards              → 내 퍼스널 보드 목록
GET    /api/v1/personal/boards/{id}         → 퍼스널 보드 상세
PUT    /api/v1/personal/boards/{id}         → 퍼스널 보드 수정 (이름, 설정)
GET    /api/v1/personal/dashboard           → 퍼스널 대시보드 (오늘 요약)
```

### 5.2 일기 (Diary)

```
POST   /api/v1/personal/{boardId}/diary                → 일기 작성
GET    /api/v1/personal/{boardId}/diary                → 일기 목록 (날짜 범위)
GET    /api/v1/personal/{boardId}/diary/{id}           → 일기 상세
PUT    /api/v1/personal/{boardId}/diary/{id}           → 일기 수정
DELETE /api/v1/personal/{boardId}/diary/{id}           → 일기 삭제
POST   /api/v1/personal/{boardId}/diary/{id}/photos    → 사진 업로드
DELETE /api/v1/personal/{boardId}/diary/{id}/photos/{photoId} → 사진 삭제

# AI 기능
POST   /api/v1/personal/{boardId}/diary/ai/prompt      → AI 일기 작성 프롬프트
POST   /api/v1/personal/{boardId}/diary/ai/summary      → AI 주간/월간 요약
GET    /api/v1/personal/{boardId}/diary/ai/mood-report  → AI 감정 분석 리포트

# 갤러리
GET    /api/v1/personal/{boardId}/gallery               → 갤러리 (전체 사진)
GET    /api/v1/personal/{boardId}/gallery/monthly        → 월별 사진
```

### 5.3 습관 트래커 (Habit)

```
POST   /api/v1/personal/{boardId}/habits               → 습관 생성
GET    /api/v1/personal/{boardId}/habits               → 습관 목록
PUT    /api/v1/personal/{boardId}/habits/{id}          → 습관 수정
DELETE /api/v1/personal/{boardId}/habits/{id}          → 습관 삭제
PATCH  /api/v1/personal/{boardId}/habits/{id}/archive  → 습관 보관

# 습관 기록
POST   /api/v1/personal/{boardId}/habits/{id}/log      → 오늘 체크
PUT    /api/v1/personal/{boardId}/habits/{id}/log/{date} → 기록 수정
GET    /api/v1/personal/{boardId}/habits/{id}/logs     → 기록 조회 (날짜 범위)
GET    /api/v1/personal/{boardId}/habits/today          → 오늘의 습관 전체

# 통계
GET    /api/v1/personal/{boardId}/habits/stats          → 전체 통계
GET    /api/v1/personal/{boardId}/habits/{id}/heatmap   → 월간 히트맵

# AI 기능
POST   /api/v1/personal/{boardId}/habits/ai/coaching    → AI 습관 코칭
POST   /api/v1/personal/{boardId}/habits/ai/recommend   → AI 습관 추천
```

### 5.4 AI 코치 (AI Coach)

```
POST   /api/v1/personal/{boardId}/coach/conversations             → 대화 시작
GET    /api/v1/personal/{boardId}/coach/conversations             → 대화 목록
GET    /api/v1/personal/{boardId}/coach/conversations/{id}        → 대화 상세 (메시지 포함)
DELETE /api/v1/personal/{boardId}/coach/conversations/{id}        → 대화 삭제

POST   /api/v1/personal/{boardId}/coach/conversations/{id}/messages → 메시지 전송
```

### 5.5 퍼스널 일정 (기존 Schedule API 재활용 + 확장)

```
# 기존 Schedule API를 퍼스널 보드에서도 사용 (boardId로 구분)
GET    /api/v1/schedules/{boardId}/daily     → 일일 스케줄 (기존)
GET    /api/v1/schedules/{boardId}/weekly    → 주간 스케줄 (기존)
POST   /api/v1/schedules/{boardId}/blocks    → 일정 생성 (기존)

# 퍼스널 전용 확장
POST   /api/v1/personal/{boardId}/schedule/ai/suggest   → AI 일정 제안
POST   /api/v1/personal/{boardId}/schedule/ai/optimize  → AI 일정 최적화
```

### 5.6 퍼스널 대시보드 (오늘 요약)

```json
// GET /api/v1/personal/dashboard 응답
{
  "today": {
    "date": "2026-02-17",
    "mood_yesterday": "HAPPY",
    "schedules": [
      { "title": "팀 미팅", "start_time": "10:00", "end_time": "11:00" }
    ],
    "habits_today": {
      "total": 5,
      "completed": 3,
      "items": [
        { "title": "물 8잔 마시기", "target": 8, "completed": 5, "icon": "💧" }
      ]
    },
    "diary_written_today": false,
    "streak_days": 15,
    "ai_greeting": "좋은 아침이에요! 어제 기분이 좋으셨네요. 오늘도 좋은 하루 되세요 🌟"
  },
  "weekly_summary": {
    "diary_count": 5,
    "habit_completion_rate": 0.72,
    "schedule_count": 12,
    "ai_insight": "이번 주 습관 달성률이 72%로 지난주보다 8% 올랐어요!"
  }
}
```

---

## 6. 프론트엔드 구조

### 6.1 라우팅

```
/personal                          → PersonalDashboardPage (대시보드)
/personal/:boardId                 → PersonalBoardPage (메인)
/personal/:boardId?tab=schedule    → 내 일정 탭
/personal/:boardId?tab=diary       → 일기 탭
/personal/:boardId?tab=notes       → 노트 탭
/personal/:boardId?tab=habits      → 습관 트래커 탭
/personal/:boardId?tab=coach       → AI 코치 탭
/personal/:boardId?tab=gallery     → 갤러리 탭
```

### 6.2 신규 컴포넌트 목록

```
components/personal/
├── PersonalDashboardPage.tsx       ← 오늘 요약 대시보드
├── PersonalBoardPage.tsx           ← 메인 페이지 (탭 컨테이너)
├── PersonalSidebar.tsx             ← 좌측 네비게이션
│
├── diary/
│   ├── DiaryView.tsx               ← 일기 메인 뷰 (리스트+캘린더 토글)
│   ├── DiaryEditor.tsx             ← 일기 작성/수정 에디터
│   ├── DiaryCard.tsx               ← 일기 카드 (목록용)
│   ├── DiaryCalendarView.tsx       ← 캘린더 뷰 (CalendarView 확장)
│   ├── DiaryMoodSelector.tsx       ← 감정 선택 UI
│   ├── DiaryPhotoUploader.tsx      ← 사진 업로드 (FileUpload 재활용)
│   ├── DiaryAIPromptPanel.tsx      ← AI 작성 도우미
│   └── DiaryMoodReport.tsx         ← AI 감정 분석 리포트
│
├── habits/
│   ├── HabitView.tsx               ← 습관 메인 뷰
│   ├── HabitCard.tsx               ← 습관 카드 (체크 포함)
│   ├── HabitCreateModal.tsx        ← 습관 생성/수정 모달
│   ├── HabitHeatmap.tsx            ← 월간 달성 히트맵
│   ├── HabitStreakBadge.tsx        ← 연속 기록 뱃지
│   └── HabitAICoachPanel.tsx       ← AI 코칭 패널
│
├── coach/
│   ├── AICoachView.tsx             ← AI 코치 메인 뷰
│   ├── AICoachConversation.tsx     ← 대화 UI (채팅형)
│   ├── AICoachTopicSelector.tsx    ← 주제 선택
│   └── AICoachContextCard.tsx      ← 컨텍스트 카드 (일정/습관/일기 요약)
│
├── gallery/
│   ├── GalleryView.tsx             ← 갤러리 메인 (그리드)
│   ├── GalleryPhotoCard.tsx        ← 사진 카드
│   └── GalleryLightbox.tsx         ← 사진 뷰어 (VideoLightbox 패턴)
│
└── shared/
    ├── PersonalHeader.tsx          ← 퍼스널 보드 헤더
    ├── PersonalTabNavigation.tsx   ← 탭 네비게이션
    ├── TodaySummaryWidget.tsx      ← 오늘 요약 위젯
    └── PersonalUpgradePrompt.tsx   ← Pro 업그레이드 유도
```

### 6.3 기존 컴포넌트 재활용 맵

| 신규 컴포넌트 | 재활용 대상 | 재활용 방식 |
|-------------|-----------|-----------|
| DiaryEditor | Note 블록 에디터 | 블록 에디터 코어 그대로 사용 |
| DiaryCalendarView | CalendarView | 캘린더 UI + 일기 데이터 오버레이 |
| DiaryPhotoUploader | CommentPanel 첨부 | 파일 업로드 로직 재활용 |
| HabitCard | DailyChecklistItem | 체크 UI 패턴 확장 |
| HabitCreateModal | AddDailyChecklistModal | 모달 구조 + 폼 패턴 |
| AICoachView | MeetingAISuggestionModal | AI 결과 표시 패턴 |
| GalleryLightbox | VideoLightbox | 라이트박스 패턴 그대로 |
| PersonalDashboard | BoardListPage | 카드 그리드 레이아웃 |
| PersonalTabNavigation | KanbanBoardPage 탭 | 탭 네비게이션 패턴 |

### 6.4 상태 관리

```tsx
// 새로운 Context: PersonalBoardContext
interface PersonalBoardState {
  board: Board | null;            // 퍼스널 보드 정보
  todaySummary: TodaySummary;     // 오늘 요약 데이터
  habits: Habit[];                // 습관 목록
  diaryEntries: DiaryEntry[];     // 일기 목록
  aiCredits: PersonalAiCredits;   // AI 크레딧 잔여
  activeTab: PersonalTab;         // 현재 활성 탭
}

type PersonalTab = 'schedule' | 'diary' | 'notes' | 'habits' | 'coach' | 'gallery';
```

---

## 7. AI 서비스 상세 설계

### 7.1 AI 코치 시스템 프롬프트

```
당신은 BRIDGE의 AI 라이프 코치입니다.
사용자의 일정, 일기, 습관 데이터를 기반으로 개인화된 코칭을 제공합니다.

[원칙]
1. 따뜻하고 응원하는 톤을 유지합니다
2. 데이터 기반으로 구체적인 인사이트를 제공합니다
3. 강압적이지 않은 부드러운 제안을 합니다
4. 사용자의 감정과 상태를 존중합니다
5. 실행 가능한 작은 액션을 제안합니다

[컨텍스트 주입]
- 최근 7일 일기 요약
- 이번 주 습관 달성률
- 오늘/이번 주 일정
- 사용자의 감정 패턴
```

### 7.2 AI 일기 분석 프롬프트

```
사용자의 일기 데이터를 분석하여 감정 리포트를 생성합니다.

[분석 항목]
1. 주간 감정 흐름 그래프 데이터 (mood별 일수)
2. 주요 감정 트리거 (일기 내용에서 추출)
3. 긍정/부정 비율
4. 반복되는 패턴 (특정 요일, 시간대)
5. 한 줄 인사이트

[출력 형식]
JSON 구조로 반환 → 프론트엔드에서 차트 렌더링
```

### 7.3 AI 모델 설정 (기존 패턴 따름)

```yaml
ai:
  model:
    # 기존
    team: gpt-4o-mini
    personal: gpt-4o-mini
    standup: gpt-4o-mini
    meeting: gpt-4o-mini
    # 신규 (퍼스널 보드)
    coach: gpt-4o-mini        # AI 코치 대화
    diary: gpt-4o-mini        # 일기 분석/프롬프트
    habit: gpt-4o-mini        # 습관 코칭
```

---

## 8. 기존 시스템 재활용 전략 정리

### 8.1 재활용 맵 (기존 → 퍼스널)

| 기존 도메인 | 퍼스널에서 활용 | 변경 사항 |
|-----------|-------------|----------|
| **Board** | 퍼스널 보드 컨테이너 | `boardType=PERSONAL` 추가 |
| **ScheduleBlock** | 내 일정 | 변경 없음 (boardId로 구분) |
| **CalendarView** | 일정 + 일기 캘린더 | 일기 오버레이 추가 |
| **DailyScheduleView** | 일일 스케줄 | 변경 없음 |
| **WeeklyScheduleView** | 주간 스케줄 | 변경 없음 |
| **Note** | 퍼스널 노트 | 변경 없음 (boardId로 구분) |
| **Note 블록 에디터** | 일기 에디터 | 재활용 |
| **NoteVersion** | 노트 버전 관리 | 변경 없음 |
| **DailyChecklist** | 습관 체크 UX 참조 | 별도 Habit 엔티티 |
| **FileUploadService** | 일기 사진 업로드 | 경로만 personal/ 추가 |
| **AIProvider** | AI 코치 + 분석 | 새 프롬프트 추가 |
| **AI Credit System** | 퍼스널 크레딧 | User 레벨 크레딧 풀 |
| **CommentAttachment** | 사진 업로드 패턴 | 구조 참조 |
| **ActivityLog** | 퍼스널 활동 로그 | targetType 확장 |
| **AuthContext** | 인증 | 변경 없음 |
| **ThemeContext** | 다크/라이트 테마 | 변경 없음 |
| **i18n** | 다국어 | 퍼스널 키 추가 |
| **shadcn/ui** | 전체 UI 컴포넌트 | 변경 없음 |

### 8.2 변경이 필요한 기존 코드

| 파일 | 변경 내용 |
|-----|---------|
| `Board.java` | `boardType` 필드 추가 |
| `User.java` | 퍼스널 티어, AI 크레딧 필드 추가 |
| `BoardService.java` | 퍼스널 보드 생성 로직 (자동 생성) |
| `BoardListPage.tsx` | 퍼스널 보드 섹션 추가 |
| `App.tsx` | `/personal/*` 라우트 추가 |
| `services.ts` | 퍼스널 API 서비스 추가 |
| `types/index.ts` | 퍼스널 타입 정의 추가 |
| `application.yml` | AI 모델 설정 추가 |
| `i18n/locales/*.json` | 퍼스널 번역 키 추가 |

---

## 9. 개발 우선순위 (Phase 계획)

### Phase 1: 기반 구축 + 일기 (2~3주)
- [ ] Board 엔티티에 `boardType` 추가 + 마이그레이션
- [ ] User 엔티티에 퍼스널 티어/크레딧 추가
- [ ] 퍼스널 보드 자동 생성 (회원가입 시)
- [ ] `PersonalBoardPage` + 탭 네비게이션
- [ ] `/personal` 라우팅 추가
- [ ] **일기 모듈 전체** (CRUD + 사진 + 감정/날씨 태그)
- [ ] 일기 캘린더 뷰
- [ ] 갤러리 뷰

### Phase 2: 습관 트래커 (1~2주)
- [ ] Habit + HabitLog 엔티티
- [ ] 습관 CRUD + 오늘 체크
- [ ] 연속 기록(Streak) + 히트맵
- [ ] 습관 통계 화면

### Phase 3: AI 코치 + AI 기능 (2~3주)
- [ ] AI 코치 대화 시스템 (엔티티 + API + UI)
- [ ] AI 일기 프롬프트 ("오늘 하루 어떠셨어요?" 가이드)
- [ ] AI 일기 주간/월간 감정 분석 리포트
- [ ] AI 습관 코칭 메시지
- [ ] AI 일정 제안
- [ ] 퍼스널 AI 크레딧 시스템

### Phase 4: 대시보드 + 통합 (1~2주)
- [ ] 퍼스널 대시보드 (오늘 요약)
- [ ] AI 인사이트 위젯
- [ ] 퍼스널 일정 (기존 Schedule 연동)
- [ ] 퍼스널 노트 (기존 Note 연동)
- [ ] BoardListPage에 퍼스널 보드 진입점 추가

### Phase 5: 과금 + 폴리싱 (1~2주)
- [ ] Personal Pro 구독 결제 연동
- [ ] Free/Pro 기능 게이팅
- [ ] PIN 잠금 기능
- [ ] 데이터 내보내기 (JSON/PDF)
- [ ] 팀 보드 연결 (Pro)
- [ ] i18n 번역
- [ ] 온보딩 플로우

---

## 10. KPI 및 성공 지표

| 지표 | 목표 | 측정 방법 |
|------|------|---------|
| **퍼스널 보드 활성 사용자** | MAU 1,000+ (3개월) | 주 1회 이상 접속 |
| **일기 작성률** | 주 3회 이상 (활성 사용자 중 40%) | 일기 생성 API 호출 |
| **습관 달성률** | 평균 60% 이상 | HabitLog 완료 비율 |
| **AI 코치 사용률** | 활성 사용자 중 50% | AI 대화 생성 수 |
| **Free → Pro 전환율** | 5~8% | 구독 전환 추적 |
| **퍼스널 → 팀 보드 전환** | 15% | 퍼스널 사용자의 팀 보드 생성 |
| **D7 리텐션** | 40% | 가입 7일 후 재방문 |

---

## 11. 기술 참고사항

### 데이터베이스 마이그레이션 (Flyway)
```sql
-- V8_001__add_board_type.sql
ALTER TABLE boards ADD COLUMN board_type VARCHAR(20) NOT NULL DEFAULT 'TEAM';

-- V8_002__add_user_personal_fields.sql
ALTER TABLE users ADD COLUMN personal_tier VARCHAR(20) NOT NULL DEFAULT 'FREE';
ALTER TABLE users ADD COLUMN personal_ai_credits_monthly INTEGER NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN personal_ai_credits_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN personal_storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- V8_003__create_diary_tables.sql
CREATE TABLE diary_entries (...);
CREATE TABLE diary_photos (...);

-- V8_004__create_habit_tables.sql
CREATE TABLE habits (...);
CREATE TABLE habit_logs (...);

-- V8_005__create_ai_coach_tables.sql
CREATE TABLE ai_coach_conversations (...);
CREATE TABLE ai_coach_messages (...);
```

### 퍼스널 보드의 기존 기능 접근 제어
```java
// 퍼스널 보드에서 비활성화할 기능
- 멤버 초대 (1인 보드)
- 슬랙 웹훅 (팀 기능)
- 마일스톤 (팀 기능)
- 관리 대시보드 (팀 기능)
- Feature-Task 구조 (퍼스널은 flat 구조)

// 퍼스널 보드에서 활성화할 기능
- Schedule (캘린더, 일일, 주간)
- Note (폴더, 문서, 버전)
- DailyChecklist (기존 체크리스트)
+ Diary (신규)
+ Habit (신규)
+ AI Coach (신규)
+ Gallery (신규)
```

---

## 12. 경쟁 분석 및 차별화

| 경쟁 서비스 | 강점 | BRIDGE 차별화 |
|-----------|------|-------------|
| **Notion** | 올인원 워크스페이스 | AI 코치 + 감정 분석 (Notion에 없음) |
| **Day One** | 일기 전문 | 일정+습관+AI 통합 (Day One은 일기만) |
| **Habitica** | 게이미피케이션 | 깔끔한 UI + AI 코칭 (Habitica는 게임형) |
| **Google Calendar** | 일정 관리 | 일기+습관+AI 통합 생태계 |
| **Bear/Obsidian** | 노트 | 일정+습관+AI와 통합된 노트 |

**BRIDGE Personal의 킬러 포인트**:
> "일정 관리 + 일기 + 습관 추적 + AI 코칭"이 하나의 앱에서 유기적으로 연결되는 경험.
> AI가 내 일기, 습관, 일정을 종합 분석하여 개인화된 인사이트를 제공.
