# BRIDGE v10.0 기획서: Cross-Domain Integration

> MySpace · Board · Organization 유기적 연결

```
문서 버전: v10.0
작성일: 2026-02-26
상태: Draft
```

---

## 0. Executive Summary

**비전**: 개인(MySpace) → 팀(Board) → 기업(Organization) 퍼널을 자연스럽게 연결하여, 개인 사용자 유입부터 기업 수익화까지의 여정을 하나의 앱 안에서 완성한다.

**현재 문제**:
- MySpace, Board, Organization이 완전히 격리된 사일로로 동작
- PersonalTask ≠ Task (별개 엔티티, 데이터 이동 불가)
- MySpace에서 Board 데이터에 접근 불가 (팀 할 일, 미팅, 스케줄)
- Organization Insights가 Board 실적과 약하게 연결
- 개인 캘린더에 조직 데이터(기념일, 휴가) 미반영

**목표 퍼널**:
```
신규 유저 → MySpace로 개인 생산성 관리 시작
         → "나의 모든 할 일" 위젯에서 Board 태스크 자연 노출
         → 팀 보드 경험 → 동료 초대
         → Organization 생성 → HR + 보드 성과 통합 관리
         → Premium 전환 (수익화)
```

**9개 기능**:

| # | 기능 | 방향 | 핵심 가치 |
|---|------|------|-----------|
| 1 | 개인태스크 → 보드 이관 | MySpace → Board | 개인 작업의 팀 승격 |
| 2 | 통합 투데이 뷰 | Board → MySpace | "나의 모든 할 일" 허브 |
| 3 | 크로스 캘린더 | Board → MySpace | 개인 + 팀 일정 통합 |
| 4 | 보드 성과 → Org 인사이트 | Board → Org | 데이터 기반 조직 관리 |
| 5 | 1:1 미팅 + 보드 컨텍스트 | Board → Org | 성과 기반 1:1 |
| 6 | 출결 + 스케줄 연동 | Org → Board | 근무 상태 실시간 반영 |
| 7 | Org 기념일 → MySpace 알림 | Org → MySpace | 조직 소속감 |
| 8 | 휴가 → MySpace 캘린더 반영 | Org → MySpace | 통합 일정 관리 |
| 9 | AI 다이어리 + 업무 회고 | Board → MySpace | 자동 업무 컨텍스트 |

---

## 1. 개인태스크 → 보드 이관

### 1.1 개요

MySpace의 PersonalTask를 특정 Board의 Feature/Task로 "보내기" 하여, 개인 작업이 팀 작업으로 자연스럽게 승격되는 흐름을 만든다.

### 1.2 사용자 시나리오

```
1. 유저가 MySpace에서 "랜딩 페이지 리디자인" 개인 태스크를 관리 중
2. 팀 보드에서 함께 진행하기로 결정
3. 태스크 상세 → "보드로 보내기" 버튼 클릭
4. 보드 선택 → Feature 선택 (or 새 Feature 생성) → Block 선택
5. PersonalTask 내용이 Board Task로 생성됨
6. 원본 PersonalTask에 "이관됨" 뱃지 + Board Task 링크 표시
7. (선택) 원본 자동 아카이브 or 양쪽 유지
```

### 1.3 데이터 모델 변경

```sql
-- PersonalTask 테이블에 이관 추적 필드 추가
ALTER TABLE personal_tasks ADD COLUMN migrated_to_task_id UUID REFERENCES tasks(id);
ALTER TABLE personal_tasks ADD COLUMN migrated_to_board_id UUID REFERENCES boards(id);
ALTER TABLE personal_tasks ADD COLUMN migrated_at TIMESTAMP;

-- Task 테이블에 출처 추적 필드 추가
ALTER TABLE tasks ADD COLUMN source_personal_task_id UUID REFERENCES personal_tasks(id);
```

```java
// PersonalTask.java 필드 추가
@Column(name = "migrated_to_task_id")
private UUID migratedToTaskId;

@Column(name = "migrated_to_board_id")
private UUID migratedToBoardId;

@Column(name = "migrated_at")
private LocalDateTime migratedAt;

public boolean isMigrated() {
    return migratedToTaskId != null;
}

// Task.java 필드 추가
@Column(name = "source_personal_task_id")
private UUID sourcePersonalTaskId;
```

### 1.4 API 설계

```
POST /api/v1/personal/tasks/{taskId}/migrate
```

**Request:**
```json
{
  "board_id": "uuid",
  "feature_id": "uuid",
  "block_id": "uuid",
  "archive_original": false
}
```

**Response:**
```json
{
  "personal_task_id": "uuid",
  "created_task": {
    "id": "uuid",
    "board_id": "uuid",
    "feature_id": "uuid",
    "title": "랜딩 페이지 리디자인",
    "description": "...",
    "source_personal_task_id": "uuid"
  },
  "migrated_at": "2026-02-26T12:00:00Z"
}
```

### 1.5 Backend 구현

```java
// PersonalTaskService.java — migrateToBoard 메서드 추가
@Transactional
public MigrateResponse migrateToBoard(UUID userId, UUID personalTaskId, MigrateRequest request) {
    PersonalTask personalTask = findByIdAndUserId(personalTaskId, userId);

    if (personalTask.isMigrated()) {
        throw new BusinessException(ErrorCode.ALREADY_MIGRATED);
    }

    // 보드 멤버 권한 확인
    Board board = boardRepository.findById(request.getBoardId())
        .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
    boardMemberRepository.findByBoardAndUserId(board, userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_BOARD_MEMBER));

    // Board Task 생성
    Task boardTask = Task.builder()
        .board(board)
        .feature(featureRepository.getReferenceById(request.getFeatureId()))
        .block(blockRepository.getReferenceById(request.getBlockId()))
        .title(personalTask.getTitle())
        .description(personalTask.getDescription())
        .dueDate(personalTask.getDueDate() != null
            ? personalTask.getDueDate().atStartOfDay() : null)
        .sourcePersonalTaskId(personalTaskId)
        .createdBy(userRepository.getReferenceById(userId))
        .build();
    taskRepository.save(boardTask);

    // PersonalTask 이관 표시
    personalTask.markAsMigrated(boardTask.getId(), board.getId());

    if (request.isArchiveOriginal()) {
        personalTask.updateStatus(PersonalTaskStatus.ARCHIVED);
    }

    return new MigrateResponse(personalTask, boardTask);
}
```

### 1.6 Frontend 구현

```
컴포넌트: MigrateToBoradModal.tsx (신규)
위치: frontend/src/app/components/personal/MigrateToBoradModal.tsx
```

**진입점**: PersonalTaskBoard.tsx 태스크 상세 영역에 "보드로 보내기" 버튼 추가

**모달 플로우**:
```
Step 1: 보드 선택 (내가 멤버인 보드 목록)
Step 2: Feature 선택 (해당 보드의 Feature 목록 + "새 Feature" 옵션)
Step 3: Block 선택 (Feature, Task, Done + 커스텀)
Step 4: 확인 (원본 아카이브 여부 토글)
```

**이관된 태스크 UI**:
```tsx
// PersonalTaskBoard 내 이관된 태스크 표시
{task.migrated_to_task_id && (
  <div className="flex items-center gap-1.5 mt-1">
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
      bg-bridge-accent/15 text-bridge-accent">
      이관됨
    </span>
    <button
      onClick={() => navigateToBoard(task.migrated_to_board_id, task.migrated_to_task_id)}
      className="text-[10px] text-bridge-accent hover:underline"
    >
      보드에서 보기 →
    </button>
  </div>
)}
```

### 1.7 Frontend 타입 변경

```typescript
// types/index.ts PersonalTask 확장
export interface PersonalTask {
  // ... 기존 필드
  migrated_to_task_id?: string | null;
  migrated_to_board_id?: string | null;
  migrated_at?: string | null;
}
```

---

## 2. 통합 투데이 뷰

### 2.1 개요

MySpace Overview에 "나의 보드 할 일" 위젯을 추가하여, 개인 태스크 + 팀 보드 체크리스트를 하나의 투데이 뷰에서 관리한다.

### 2.2 사용자 시나리오

```
1. 유저가 MySpace Overview 접근
2. 기존 위젯(개인 태스크, 습관, 일정) 외에 "보드 할 일" 위젯 노출
3. 위젯에는 내가 할당된 모든 보드의 ChecklistItem 중 미완료 항목 표시
4. 항목 클릭 → 해당 Board로 네비게이션
5. 체크 토글 → 인라인 완료 처리 (Board WebSocket 이벤트 전파)
```

### 2.3 데이터 모델

기존 테이블 활용 — 신규 테이블 없음. 집계 API만 추가.

**집계 대상**:
```
1. ChecklistItem WHERE assignee_id = :userId AND is_completed = false
   → 그룹핑: Board > Feature > Task > ChecklistItem
2. DailyChecklist WHERE assignee_id = :userId AND date = :today
   → 보드별 일일 체크리스트
3. Meeting WHERE participants CONTAINS :userId AND date = :today
   → 오늘 예정된 미팅
```

### 2.4 API 설계

```
GET /api/v1/personal/dashboard/board-tasks?date=2026-02-26
```

**Response:**
```json
{
  "boards": [
    {
      "board_id": "uuid",
      "board_name": "BRIDGE 개발",
      "board_emoji": "🚀",
      "items": [
        {
          "type": "CHECKLIST",
          "checklist_item_id": "uuid",
          "title": "API 엔드포인트 구현",
          "task_title": "백엔드 개발",
          "feature_title": "v10.0 크로스 도메인",
          "feature_color": "#6366F1",
          "due_date": "2026-02-28",
          "is_completed": false
        },
        {
          "type": "DAILY_CHECKLIST",
          "daily_checklist_id": "uuid",
          "title": "코드 리뷰 2건",
          "is_completed": false
        },
        {
          "type": "MEETING",
          "meeting_id": "uuid",
          "title": "스프린트 회고",
          "start_time": "14:00",
          "end_time": "15:00"
        }
      ],
      "pending_count": 5,
      "completed_today_count": 3
    }
  ],
  "total_pending": 12,
  "total_completed_today": 7
}
```

### 2.5 Backend 구현

```java
// PersonalDashboardService.java — getBoardTasks 메서드 추가
@Transactional(readOnly = true)
public BoardTasksResponse getBoardTasks(UUID userId, LocalDate date) {
    // 1. 유저가 참여 중인 모든 Board 조회
    List<BoardMember> memberships = boardMemberRepository.findByUserId(userId);

    List<BoardTaskGroup> groups = new ArrayList<>();

    for (BoardMember membership : memberships) {
        Board board = membership.getBoard();
        if (board.getDeletedAt() != null) continue;

        // 2. 미완료 ChecklistItem (내 할당)
        List<ChecklistItem> myChecklists = checklistItemRepository
            .findByAssigneeIdAndBoardIdAndCompleted(userId, board.getId(), false);

        // 3. 오늘 DailyChecklist (내 할당)
        List<DailyChecklist> myDailyChecklists = dailyChecklistRepository
            .findByAssigneeIdAndBoardIdAndDate(userId, board.getId(), date);

        // 4. 오늘 Meeting (내 참여)
        List<Meeting> myMeetings = meetingRepository
            .findByBoardIdAndDateAndParticipant(board.getId(), date, userId);

        groups.add(new BoardTaskGroup(board, myChecklists, myDailyChecklists, myMeetings));
    }

    return new BoardTasksResponse(groups);
}
```

### 2.6 Frontend 구현

```
컴포넌트: BoardTasksWidget.tsx (신규)
위치: frontend/src/app/components/personal/BoardTasksWidget.tsx
삽입 위치: PersonalOverview.tsx 내 위젯 그리드
```

**위젯 UI 구조**:
```tsx
// PersonalOverview.tsx 내 위젯 순서
<div className="grid gap-4">
  {/* 기존 위젯들 */}
  <QuickStatsWidget />

  {/* 신규: 보드 할 일 위젯 */}
  <BoardTasksWidget date={selectedDate} />

  <DueTodayWidget />
  <HabitsWidget />
  <SchedulePreview />
  <DiaryPreview />
</div>
```

**BoardTasksWidget 디자인**:
```tsx
<div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
  {/* 헤더 */}
  <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06]
    border-b border-foreground/[0.06] flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Briefcase className="w-4 h-4 text-bridge-accent" />
      <span className="text-[13px] md:text-sm font-bold text-foreground">
        보드 할 일
      </span>
    </div>
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
      bg-bridge-accent/15 text-bridge-accent">
      {totalPending}
    </span>
  </div>

  {/* 보드별 그룹 */}
  <div className="bg-bridge-dark p-3 md:p-5 space-y-3">
    {boards.map((board, index) => (
      <motion.div
        key={board.board_id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
      >
        {/* 보드 이름 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">{board.board_emoji}</span>
          <span className="text-[11px] font-bold text-foreground">
            {board.board_name}
          </span>
          <span className="text-[10px] text-slate-500">
            {board.pending_count}건
          </span>
        </div>

        {/* 항목 리스트 */}
        {board.items.map(item => (
          <BoardTaskItem
            key={item.id}
            item={item}
            onToggle={handleToggle}
            onNavigate={handleNavigate}
          />
        ))}
      </motion.div>
    ))}

    {/* 빈 상태 */}
    {boards.length === 0 && (
      <div className="text-center py-8">
        <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-[11px] text-slate-500">
          오늘 할당된 보드 작업이 없습니다
        </p>
      </div>
    )}
  </div>
</div>
```

---

## 3. 크로스 캘린더

### 3.1 개요

MySpace 캘린더/스케줄에 Board 미팅, 스케줄 블록, Organization 이벤트(기념일, 휴가)를 오버레이하여 "나의 모든 일정"을 한 곳에서 본다.

### 3.2 사용자 시나리오

```
1. MySpace 캘린더 뷰 접근
2. 기존 개인 이벤트(파란색) 외에:
   - Board 미팅 (보라색 점)
   - Board 스케줄 블록 (인디고 점)
   - Org 기념일 (분홍색 점) — feature #7과 연결
   - Org 휴가 (초록색 점) — feature #8과 연결
3. 각 점 클릭 → 상세 팝오버 → "보드에서 보기" / "조직에서 보기" 링크
4. 스케줄 뷰에서도 동일하게 Board 스케줄 타임블록 오버레이
```

### 3.3 API 설계

```
GET /api/v1/personal/calendar/unified?start_date=2026-02-01&end_date=2026-02-28
```

**Response:**
```json
{
  "personal_events": [...],
  "board_events": [
    {
      "source": "MEETING",
      "board_id": "uuid",
      "board_name": "BRIDGE 개발",
      "meeting_id": "uuid",
      "title": "스프린트 플래닝",
      "event_date": "2026-02-27",
      "start_time": "10:00",
      "end_time": "11:00",
      "color": "#8B5CF6"
    },
    {
      "source": "SCHEDULE_BLOCK",
      "board_id": "uuid",
      "board_name": "BRIDGE 개발",
      "schedule_block_id": "uuid",
      "title": "API 개발",
      "task_title": "v10 백엔드",
      "event_date": "2026-02-27",
      "start_time": "14:00",
      "end_time": "17:00",
      "color": "#6366F1"
    }
  ],
  "org_events": [
    {
      "source": "ANNIVERSARY",
      "org_id": "uuid",
      "org_name": "BRIDGE Inc.",
      "title": "김철수님 생일",
      "event_date": "2026-02-28",
      "anniversary_type": "BIRTHDAY",
      "color": "#F472B6"
    },
    {
      "source": "LEAVE",
      "org_id": "uuid",
      "org_name": "BRIDGE Inc.",
      "title": "연차 (이영희)",
      "event_date": "2026-02-26",
      "end_date": "2026-02-27",
      "leave_type": "ANNUAL",
      "color": "#34D399"
    }
  ]
}
```

### 3.4 Backend 구현

```java
// PersonalCalendarService.java (신규)
@Service
@RequiredArgsConstructor
public class PersonalCalendarService {

    private final PersonalEventRepository personalEventRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final OrganizationMemberRepository orgMemberRepository;
    private final OrgAnniversarySettingRepository anniversarySettingRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    @Transactional(readOnly = true)
    public UnifiedCalendarResponse getUnifiedCalendar(
            UUID userId, LocalDate startDate, LocalDate endDate) {

        // 1. 개인 이벤트
        List<PersonalEvent> personalEvents = personalEventRepository
            .findByUserIdAndDateRange(userId, startDate, endDate);

        // 2. Board 미팅 + 스케줄 블록
        List<BoardMember> memberships = boardMemberRepository.findByUserId(userId);
        List<UUID> boardIds = memberships.stream()
            .map(m -> m.getBoard().getId())
            .filter(id -> /* board not deleted */ true)
            .toList();

        List<Meeting> meetings = meetingRepository
            .findByBoardIdsAndDateRange(boardIds, startDate, endDate);
        List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository
            .findByAssigneeIdAndBoardIdsAndDateRange(userId, boardIds, startDate, endDate);

        // 3. Org 기념일 + 휴가
        List<OrganizationMember> orgMemberships = orgMemberRepository
            .findByUserIdAndActiveOrgs(userId);

        List<OrgAnniversaryEvent> anniversaries = new ArrayList<>();
        List<LeaveEvent> leaves = new ArrayList<>();

        for (OrganizationMember orgMembership : orgMemberships) {
            UUID orgId = orgMembership.getOrganization().getId();

            // 기념일 (생일, 입사일)
            anniversaries.addAll(
                anniversarySettingRepository.findUpcomingByOrgAndDateRange(
                    orgId, startDate, endDate));

            // 승인된 휴가
            leaves.addAll(
                leaveRequestRepository.findApprovedByOrgAndDateRange(
                    orgId, startDate, endDate));
        }

        return new UnifiedCalendarResponse(
            personalEvents, meetings, scheduleBlocks, anniversaries, leaves);
    }
}
```

### 3.5 Frontend 구현

**PersonalCalendar.tsx 확장**: 기존 개인 이벤트 렌더링에 크로스 도메인 이벤트 도트 추가

```tsx
// 캘린더 날짜 셀 내 이벤트 도트 렌더링
<div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
  {/* 개인 이벤트 — 기존 */}
  {personalEvents.map(e => (
    <div key={e.id} className="w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: e.color }} />
  ))}

  {/* Board 미팅 */}
  {boardMeetings.map(m => (
    <div key={m.meeting_id} className="w-1.5 h-1.5 rounded-full bg-purple-500" />
  ))}

  {/* Board 스케줄 */}
  {scheduleBlocks.map(s => (
    <div key={s.schedule_block_id} className="w-1.5 h-1.5 rounded-full bg-bridge-accent" />
  ))}

  {/* Org 기념일 */}
  {anniversaries.map(a => (
    <div key={a.title} className="w-1.5 h-1.5 rounded-full bg-pink-400" />
  ))}

  {/* Org 휴가 */}
  {leaveEvents.map(l => (
    <div key={l.title} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
  ))}
</div>
```

**필터 토글**: 캘린더 상단에 소스별 필터 칩

```tsx
<div className="flex gap-2 mb-3 flex-wrap">
  <FilterChip label="개인" color="bridge-accent" active={filters.personal} />
  <FilterChip label="보드 미팅" color="purple-500" active={filters.meetings} />
  <FilterChip label="보드 스케줄" color="indigo-500" active={filters.schedule} />
  <FilterChip label="기념일" color="pink-400" active={filters.anniversary} />
  <FilterChip label="휴가" color="emerald-400" active={filters.leave} />
</div>
```

---

## 4. 보드 성과 → Org 인사이트

### 4.1 개요

Organization에 속한 Board들의 Feature 완료율, Task 처리량, 멤버별 기여도를 Org Insights에 실시간 집계하여, "왜 Organization이 필요한지"를 데이터로 증명한다.

### 4.2 사용자 시나리오

```
1. Org 관리자가 Insights 탭 접근
2. 기존 메트릭(근무시간, 활동수) 외에:
   - Board별 Feature 완료율 차트
   - 멤버별 Task 처리 속도 (평균 완료 시간)
   - 팀 병목 감지 (7일 이상 정체된 Task 알림)
   - 보드 간 워크로드 밸런스 시각화
3. 특정 멤버 클릭 → 보드별 기여 상세 (어떤 Feature에서 몇 건 완료)
4. "주간 리포트" 자동 생성 옵션 (이메일/슬랙)
```

### 4.3 현재 OrgInsightsService 확장

현재 `OrgInsightsService`는 ScheduleBlock 기반 `total_minutes`, `completed_tasks`(ChecklistItem 기준)를 집계합니다. 여기에 Feature-level 성과 메트릭을 추가합니다.

### 4.4 API 설계

```
GET /api/v1/organizations/{orgId}/insights/board-performance
    ?start_date=2026-02-01&end_date=2026-02-28
```

**Response:**
```json
{
  "boards": [
    {
      "board_id": "uuid",
      "board_name": "BRIDGE 개발",
      "metrics": {
        "total_features": 12,
        "completed_features": 8,
        "feature_completion_rate": 0.67,
        "total_tasks": 156,
        "completed_tasks": 120,
        "task_completion_rate": 0.77,
        "avg_task_completion_hours": 18.5,
        "stale_tasks_count": 3,
        "active_members": 6
      },
      "feature_progress": [
        {
          "feature_id": "uuid",
          "title": "v10 크로스 도메인",
          "color": "#6366F1",
          "total_tasks": 24,
          "completed_tasks": 15,
          "progress": 0.625,
          "due_date": "2026-03-15",
          "is_overdue": false
        }
      ],
      "weekly_trend": [
        {
          "week_start": "2026-02-17",
          "completed_tasks": 32,
          "new_tasks": 28,
          "velocity": 1.14
        }
      ]
    }
  ],
  "org_summary": {
    "total_boards": 4,
    "avg_completion_rate": 0.72,
    "total_stale_tasks": 7,
    "top_performer": {
      "user_id": "uuid",
      "name": "김철수",
      "completed_tasks": 45
    },
    "bottleneck_alert": {
      "count": 3,
      "boards": ["BRIDGE 개발", "마케팅"]
    }
  }
}
```

### 4.5 Backend 구현

```java
// OrgInsightsService.java — getBoardPerformance 메서드 추가
@Transactional(readOnly = true)
public BoardPerformanceResponse getBoardPerformance(
        UUID orgId, UUID userId, LocalDate startDate, LocalDate endDate) {

    validateOrgAccess(orgId, userId, OrgRole.ADMIN);

    List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);

    List<BoardMetrics> boardMetricsList = orgBoards.stream().map(board -> {
        // Feature 완료율
        List<Feature> features = featureRepository.findByBoardId(board.getId());
        long completedFeatures = features.stream()
            .filter(f -> f.getStatus() == FeatureStatus.COMPLETED).count();

        // Task 완료율 + 평균 완료 시간
        List<Task> tasks = taskRepository.findByBoardId(board.getId());
        List<Task> completedTasks = tasks.stream()
            .filter(Task::isCompleted)
            .filter(t -> !t.getCompletedAt().toLocalDate().isBefore(startDate))
            .toList();

        double avgCompletionHours = completedTasks.stream()
            .filter(t -> t.getCreatedAt() != null && t.getCompletedAt() != null)
            .mapToLong(t -> Duration.between(t.getCreatedAt(), t.getCompletedAt()).toHours())
            .average().orElse(0);

        // 병목 감지: 7일 이상 미완료
        long staleTasks = tasks.stream()
            .filter(t -> !t.isCompleted())
            .filter(t -> t.getCreatedAt().isBefore(
                LocalDateTime.now(ZoneOffset.UTC).minusDays(7)))
            .count();

        // 주간 트렌드
        List<WeeklyTrend> weeklyTrend = calculateWeeklyTrend(
            board.getId(), startDate, endDate);

        return new BoardMetrics(board, features, completedFeatures,
            tasks.size(), completedTasks.size(), avgCompletionHours,
            staleTasks, weeklyTrend);
    }).toList();

    return new BoardPerformanceResponse(boardMetricsList,
        calculateOrgSummary(boardMetricsList));
}
```

### 4.6 Frontend 구현

```
컴포넌트: OrgBoardPerformanceSection.tsx (신규)
위치: frontend/src/app/components/admin/organization/OrgBoardPerformanceSection.tsx
삽입 위치: OrgInsightsTab.tsx 내 새로운 섹션
```

**주요 시각화**:
- Board별 Feature 진행률 바 차트
- 주간 Velocity 라인 차트 (완료 vs 신규)
- 병목 Task 알림 카드
- Top Performer 뱃지

---

## 5. 1:1 미팅 + 보드 컨텍스트

### 5.1 개요

Organization의 1:1 미팅에서 해당 멤버의 Board 성과 요약을 자동으로 제공하여, 데이터 기반의 의미 있는 1:1을 가능하게 한다.

### 5.2 사용자 시나리오

```
1. 매니저가 1:1 미팅 기록 화면 진입
2. 상대 멤버의 "최근 2주 보드 성과 요약" 카드 자동 표시:
   - 완료한 ChecklistItem 수 / 전체 할당 수
   - 참여 중인 Feature와 진행률
   - 가장 활발한 Board
   - 평균 Task 완료 시간
3. 성과 데이터를 참고하여 1:1 노트 작성
4. 액션 아이템에 Board Task 링크 첨부 가능
```

### 5.3 API 설계

```
GET /api/v1/organizations/{orgId}/one-on-ones/{oneOnOneId}/board-context
    ?period_days=14
```

**Response:**
```json
{
  "member": {
    "user_id": "uuid",
    "name": "김철수",
    "profile_image": "url"
  },
  "period": {
    "start_date": "2026-02-12",
    "end_date": "2026-02-26"
  },
  "summary": {
    "completed_checklist_items": 23,
    "total_assigned_items": 31,
    "completion_rate": 0.74,
    "avg_completion_hours": 12.3,
    "active_boards": 2,
    "most_active_board": {
      "board_id": "uuid",
      "board_name": "BRIDGE 개발"
    }
  },
  "feature_involvement": [
    {
      "feature_id": "uuid",
      "feature_title": "v10 크로스 도메인",
      "board_name": "BRIDGE 개발",
      "progress": 0.625,
      "member_contribution": 8
    }
  ],
  "recent_completions": [
    {
      "checklist_item_id": "uuid",
      "title": "통합 캘린더 API 구현",
      "task_title": "크로스 캘린더",
      "completed_at": "2026-02-25T09:30:00Z",
      "board_name": "BRIDGE 개발"
    }
  ]
}
```

### 5.4 Backend 구현

```java
// OrgOneOnOneService.java — getBoardContext 메서드 추가
@Transactional(readOnly = true)
public OneOnOneBoardContextResponse getBoardContext(
        UUID orgId, UUID requesterId, UUID oneOnOneId, int periodDays) {

    OrgOneOnOne oneOnOne = findOneOnOneWithAccess(orgId, requesterId, oneOnOneId);

    // 상대 멤버 결정 (requesterId가 아닌 쪽)
    UUID targetUserId = oneOnOne.getMemberA().getUser().getId().equals(requesterId)
        ? oneOnOne.getMemberB().getUser().getId()
        : oneOnOne.getMemberA().getUser().getId();

    LocalDateTime periodStart = LocalDateTime.now(ZoneOffset.UTC)
        .minusDays(periodDays);

    // Org에 속한 Board에서 멤버의 성과 집계
    List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);
    List<UUID> orgBoardIds = orgBoards.stream().map(Board::getId).toList();

    // 완료한 ChecklistItem
    List<ChecklistItem> completedItems = checklistItemRepository
        .findCompletedByAssigneeAndBoardIdsAfter(
            targetUserId, orgBoardIds, periodStart);

    // 전체 할당된 ChecklistItem
    long totalAssigned = checklistItemRepository
        .countByAssigneeAndBoardIds(targetUserId, orgBoardIds);

    // Feature 참여 현황
    List<FeatureContribution> featureContributions =
        calculateFeatureContributions(targetUserId, orgBoardIds, periodStart);

    return new OneOnOneBoardContextResponse(
        targetUserId, completedItems, totalAssigned, featureContributions);
}
```

### 5.5 Frontend 구현

```
컴포넌트: OneOnOneBoardContext.tsx (신규)
위치: frontend/src/app/components/admin/organization/OneOnOneBoardContext.tsx
삽입 위치: OneOnOneMeetingModal.tsx 미팅 기록 폼 상단
```

**UI 구조**:
```tsx
<div className="rounded-2xl border border-foreground/[0.08] overflow-hidden mb-4">
  <div className="px-5 py-3 bg-foreground/[0.06] border-b border-foreground/[0.06]
    flex items-center gap-2">
    <BarChart3 className="w-4 h-4 text-bridge-accent" />
    <span className="text-[13px] font-bold text-foreground">
      최근 {periodDays}일 보드 성과
    </span>
  </div>

  <div className="p-5 space-y-4">
    {/* 핵심 지표 3개 */}
    <div className="grid grid-cols-3 gap-3">
      <StatCard label="완료" value={summary.completed_checklist_items}
        sub={`/ ${summary.total_assigned_items}`} />
      <StatCard label="완료율" value={`${(summary.completion_rate * 100).toFixed(0)}%`} />
      <StatCard label="평균 완료" value={`${summary.avg_completion_hours.toFixed(1)}h`} />
    </div>

    {/* Feature 참여 */}
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        참여 Feature
      </span>
      {featureInvolvement.map(f => (
        <FeatureProgressBar key={f.feature_id} feature={f} />
      ))}
    </div>
  </div>
</div>
```

---

## 6. 출결 + 스케줄 연동

### 6.1 개요

Organization 출결(근태) 데이터와 Board 스케줄을 연동하여, 출근 상태 기반 스케줄 자동 반영 및 부재 시 팀 알림을 제공한다.

### 6.2 사용자 시나리오

```
1. 멤버가 Org에서 출근 체크인
2. Board 스케줄 뷰에서 해당 멤버 컬럼에 "출근 중" 뱃지 표시
3. 멤버가 휴가/반차 상태면:
   - 스케줄 뷰에서 해당 멤버 컬럼 비활성화 + "휴가" 뱃지
   - 해당 멤버에게 할당된 오늘 스케줄 블록에 경고 표시
4. 팀원 전체의 오늘 출결 현황을 스케줄 뷰 상단에 요약 표시
```

### 6.3 API 설계

```
GET /api/v1/boards/{boardId}/schedules/attendance-status?date=2026-02-26
```

**Response:**
```json
{
  "date": "2026-02-26",
  "members": [
    {
      "user_id": "uuid",
      "name": "김철수",
      "attendance_status": "PRESENT",
      "clock_in_time": "09:05",
      "is_late": false,
      "work_minutes_today": 240
    },
    {
      "user_id": "uuid",
      "name": "이영희",
      "attendance_status": "ON_LEAVE",
      "leave_type": "ANNUAL",
      "leave_note": "연차",
      "affected_schedule_blocks": 3
    },
    {
      "user_id": "uuid",
      "name": "박민수",
      "attendance_status": "NOT_CHECKED_IN",
      "expected_clock_in": "09:00"
    }
  ]
}
```

### 6.4 Backend 구현

```java
// ScheduleFacadeService.java — getAttendanceStatus 메서드 추가
@Transactional(readOnly = true)
public ScheduleAttendanceResponse getAttendanceStatus(
        UUID boardId, UUID requesterId, LocalDate date) {

    Board board = boardRepository.findById(boardId)
        .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

    // Board가 Organization에 속해있지 않으면 빈 응답
    if (board.getOrganization() == null) {
        return ScheduleAttendanceResponse.empty(date);
    }

    UUID orgId = board.getOrganization().getId();
    List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);

    List<MemberAttendanceStatus> statuses = boardMembers.stream().map(bm -> {
        UUID userId = bm.getUser().getId();

        // Org 멤버 출결 조회
        Optional<OrgAttendanceRecord> record = attendanceRecordRepository
            .findByOrgMemberUserIdAndDate(orgId, userId, date);

        // 휴가 여부 확인
        Optional<LeaveRequest> leave = leaveRequestRepository
            .findApprovedByUserAndDate(orgId, userId, date);

        // 영향받는 스케줄 블록 수
        int affectedBlocks = 0;
        if (leave.isPresent()) {
            affectedBlocks = scheduleBlockRepository
                .countByAssigneeIdAndBoardIdAndDate(userId, boardId, date);
        }

        return new MemberAttendanceStatus(bm.getUser(), record, leave, affectedBlocks);
    }).toList();

    return new ScheduleAttendanceResponse(date, statuses);
}
```

### 6.5 Frontend 구현

**DailyScheduleView.tsx / WeeklyScheduleView.tsx 확장**:

```tsx
// 스케줄 뷰 상단 출결 요약 바
<div className="flex items-center gap-3 px-4 py-2 bg-foreground/[0.03]
  rounded-xl border border-foreground/[0.08] mb-3">
  {attendanceStatus.members.map(member => (
    <div key={member.user_id} className="flex items-center gap-1.5">
      <Avatar src={member.profile_image} size="xs" />
      <AttendanceBadge status={member.attendance_status} />
    </div>
  ))}
</div>

// AttendanceBadge 컴포넌트
function AttendanceBadge({ status }: { status: string }) {
  const config = {
    PRESENT: { label: '출근', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    ON_LEAVE: { label: '휴가', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    LATE: { label: '지각', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    NOT_CHECKED_IN: { label: '미출근', className: 'bg-slate-500/15 text-slate-500' },
  };
  const { label, className } = config[status] || config.NOT_CHECKED_IN;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}
```

---

## 7. Org 기념일 → MySpace 알림

### 7.1 개요

Organization에서 관리하는 팀원 생일/입사기념일을 MySpace 캘린더에 자동 표시하고, 당일 알림을 보내 조직 소속감을 높인다.

### 7.2 사용자 시나리오

```
1. Org 설정에서 기념일 알림 활성화 (이미 구현: OrgAnniversarySetting)
2. MySpace 캘린더에 팀원 생일/입사일이 핑크색 점으로 표시
3. 당일 아침 → MySpace Overview에 "오늘의 축하" 카드 노출
4. 카드에서 축하 메시지 보내기 → CelebrationMessage 생성
5. 해당 멤버에게 푸시 알림 발송
```

### 7.3 데이터 흐름

```
기존 OrgAnniversarySetting (birthday/hire_date 관리)
  → PersonalCalendarService에서 조회 (feature #3 크로스 캘린더)
  → PersonalDashboardService에서 "오늘의 축하" 집계 (신규)
  → NotificationService에서 당일 푸시 발송 (신규 스케줄러)
```

### 7.4 API 설계

```
GET /api/v1/personal/dashboard/celebrations?date=2026-02-26
```

**Response:**
```json
{
  "celebrations": [
    {
      "org_id": "uuid",
      "org_name": "BRIDGE Inc.",
      "member_user_id": "uuid",
      "member_name": "김철수",
      "member_profile_image": "url",
      "type": "BIRTHDAY",
      "message_template": "🎂 {name}님의 생일을 축하합니다!",
      "can_send_message": true,
      "already_sent": false
    }
  ]
}
```

### 7.5 Backend 구현

```java
// PersonalDashboardService.java — getCelebrations 메서드 추가
@Transactional(readOnly = true)
public CelebrationsResponse getCelebrations(UUID userId, LocalDate date) {
    List<OrganizationMember> myOrgs = orgMemberRepository
        .findByUserIdAndActiveOrgs(userId);

    List<CelebrationItem> celebrations = new ArrayList<>();

    for (OrganizationMember myMembership : myOrgs) {
        Organization org = myMembership.getOrganization();

        // 기념일 설정이 활성화된 경우만
        OrgAnniversarySetting setting = anniversarySettingRepository
            .findByOrganizationId(org.getId()).orElse(null);
        if (setting == null || !setting.isEnabled()) continue;

        // 오늘 생일인 멤버
        if (setting.isBirthdayEnabled()) {
            List<OrganizationMember> birthdayMembers = orgMemberRepository
                .findByOrgIdAndBirthMonth(org.getId(),
                    date.getMonthValue(), date.getDayOfMonth());

            for (OrganizationMember bm : birthdayMembers) {
                if (bm.getUser().getId().equals(userId)) continue; // 본인 제외

                boolean alreadySent = celebrationMessageRepository
                    .existsBySenderAndRecipientAndDate(userId,
                        bm.getUser().getId(), date);

                celebrations.add(new CelebrationItem(
                    org, bm, "BIRTHDAY", alreadySent));
            }
        }

        // 오늘 입사기념일인 멤버
        if (setting.isHireDateEnabled()) {
            List<OrganizationMember> hireMembers = orgMemberRepository
                .findByOrgIdAndHireMonth(org.getId(),
                    date.getMonthValue(), date.getDayOfMonth());

            for (OrganizationMember hm : hireMembers) {
                if (hm.getUser().getId().equals(userId)) continue;

                celebrations.add(new CelebrationItem(
                    org, hm, "HIRE_ANNIVERSARY", false));
            }
        }
    }

    return new CelebrationsResponse(celebrations);
}
```

### 7.6 스케줄러: 기념일 푸시 알림

```java
// AnniversaryNotificationScheduler.java (신규)
@Component
@RequiredArgsConstructor
public class AnniversaryNotificationScheduler {

    private final OrgMemberRepository orgMemberRepository;
    private final OrgAnniversarySettingRepository settingRepository;
    private final PushNotificationService pushService;

    @Scheduled(cron = "0 0 9 * * *") // 매일 09:00 UTC
    public void sendAnniversaryNotifications() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        List<Organization> orgsWithAnniversary = settingRepository
            .findEnabledOrganizations();

        for (Organization org : orgsWithAnniversary) {
            // 생일 알림
            List<OrganizationMember> birthdayMembers = orgMemberRepository
                .findByOrgIdAndBirthMonth(org.getId(),
                    today.getMonthValue(), today.getDayOfMonth());

            // 해당 Org의 모든 멤버에게 푸시
            List<OrganizationMember> allMembers = orgMemberRepository
                .findByOrganizationId(org.getId());

            for (OrganizationMember birthday : birthdayMembers) {
                for (OrganizationMember recipient : allMembers) {
                    if (recipient.equals(birthday)) continue;
                    pushService.sendPush(
                        recipient.getUser().getId(),
                        "🎂 " + birthday.getUser().getName() + "님의 생일입니다!",
                        org.getName());
                }
            }
        }
    }
}
```

### 7.7 Frontend 구현

```
컴포넌트: CelebrationsWidget.tsx (신규)
위치: frontend/src/app/components/personal/CelebrationsWidget.tsx
삽입 위치: PersonalOverview.tsx 위젯 그리드 상단 (오늘 축하 있을 때만 표시)
```

```tsx
// 조건부 렌더링 — 축하할 기념일이 있을 때만
{celebrations.length > 0 && (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl border border-pink-500/20 overflow-hidden
      bg-gradient-to-r from-pink-500/5 to-purple-500/5"
  >
    <div className="px-5 py-3 flex items-center gap-2">
      <PartyPopper className="w-4 h-4 text-pink-400" />
      <span className="text-[13px] font-bold text-foreground">오늘의 축하</span>
    </div>
    <div className="px-5 pb-4 space-y-2">
      {celebrations.map(c => (
        <CelebrationCard key={c.member_user_id} celebration={c} />
      ))}
    </div>
  </motion.div>
)}
```

---

## 8. 휴가 → MySpace 캘린더 반영

### 8.1 개요

Organization에서 승인된 휴가를 MySpace 캘린더에 자동 등록하여, 별도 수동 입력 없이 개인 일정에 반영된다.

### 8.2 사용자 시나리오

```
1. 멤버가 Org에서 연차 신청 → 관리자 승인
2. 승인 즉시 MySpace 캘린더에 "연차" 이벤트 자동 등록 (초록색)
3. MySpace 스케줄 뷰에서도 해당 날짜 전체 블록 표시
4. 휴가 취소 시 → MySpace 캘린더에서 자동 제거
5. 캘린더에서 휴가 이벤트 클릭 → "Organization에서 관리" 안내
```

### 8.3 구현 전략

**방식 A (실시간 동기화)**: 휴가 승인 시 PersonalEvent 자동 생성
**방식 B (조회 시 통합)**: 크로스 캘린더(feature #3)에서 조회 시 합산

→ **방식 B 채택**: 중복 데이터 없이 feature #3의 UnifiedCalendar API에서 처리

### 8.4 데이터 흐름

```
LeaveRequest (status=APPROVED)
  → PersonalCalendarService.getUnifiedCalendar() 에서 조회
  → org_events[source=LEAVE] 로 응답
  → PersonalCalendar.tsx에서 초록색 이벤트로 렌더링
```

### 8.5 Frontend 구현

크로스 캘린더(feature #3)의 일부로 구현됩니다.

**캘린더 상세 팝오버**:
```tsx
// 휴가 이벤트 클릭 시
{event.source === 'LEAVE' && (
  <div className="p-3 space-y-2">
    <div className="flex items-center gap-2">
      <Palmtree className="w-4 h-4 text-emerald-400" />
      <span className="text-sm font-bold text-foreground">{event.title}</span>
    </div>
    <div className="text-[11px] text-slate-500">
      {event.org_name} · {event.leave_type}
    </div>
    {event.end_date && event.end_date !== event.event_date && (
      <div className="text-[11px] text-slate-400">
        {formatDate(event.event_date)} ~ {formatDate(event.end_date)}
      </div>
    )}
    <div className="pt-2 border-t border-foreground/[0.08]">
      <span className="text-[10px] text-slate-600">
        조직 설정에서 관리됩니다
      </span>
    </div>
  </div>
)}
```

**스케줄 뷰 전일 블록**:
```tsx
// PersonalSchedule.tsx — 휴가일 표시
{isLeaveDay && (
  <div className="absolute inset-0 bg-emerald-500/5 border border-emerald-500/20
    rounded-xl flex items-center justify-center">
    <div className="flex items-center gap-2">
      <Palmtree className="w-5 h-5 text-emerald-400" />
      <span className="text-sm font-bold text-emerald-500">
        {leaveEvent.leave_type === 'ANNUAL' ? '연차' : leaveEvent.title}
      </span>
    </div>
  </div>
)}
```

---

## 9. AI 다이어리 + 업무 회고

### 9.1 개요

AI 다이어리 작성 시 "오늘 완료한 Board 태스크"를 자동 컨텍스트로 제공하여, 업무 회고가 자연스럽게 일기에 녹아들게 한다.

### 9.2 사용자 시나리오

```
1. 유저가 MySpace AI 다이어리 접근
2. AI 첫 메시지에 "오늘 완료한 업무 요약" 자동 포함:
   "안녕하세요! 오늘 하루 어떠셨나요?
    📋 오늘 완료한 작업:
    - [BRIDGE 개발] API 엔드포인트 구현 ✓
    - [BRIDGE 개발] 통합 테스트 작성 ✓
    - [마케팅] 랜딩 카피 검토 ✓
    이 중에서 특별히 기억에 남는 작업이 있나요?"
3. 유저의 대화에 업무 컨텍스트가 자연스럽게 반영
4. AI가 업무 패턴 기반 인사이트 제공:
   "이번 주에 BRIDGE 개발 보드에서 12건을 완료하셨네요.
    지난 주 대비 50% 증가했어요."
```

### 9.3 API 설계

```
GET /api/v1/personal/diary/work-context?date=2026-02-26
```

**Response:**
```json
{
  "date": "2026-02-26",
  "completed_today": [
    {
      "board_name": "BRIDGE 개발",
      "board_emoji": "🚀",
      "items": [
        {
          "type": "CHECKLIST_ITEM",
          "title": "API 엔드포인트 구현",
          "task_title": "v10 백엔드",
          "feature_title": "크로스 도메인",
          "completed_at": "2026-02-26T14:30:00Z"
        }
      ]
    }
  ],
  "personal_completed_today": [
    {
      "title": "영어 공부 30분",
      "type": "HABIT",
      "completed_at": "2026-02-26T07:00:00Z"
    },
    {
      "title": "보고서 초안 작성",
      "type": "TASK",
      "completed_at": "2026-02-26T10:15:00Z"
    }
  ],
  "weekly_summary": {
    "total_completed": 23,
    "previous_week_completed": 18,
    "change_percentage": 27.8,
    "most_active_board": "BRIDGE 개발",
    "habit_streak_highlights": [
      {
        "habit_title": "운동",
        "current_streak": 14
      }
    ]
  }
}
```

### 9.4 Backend 구현

```java
// DiaryWorkContextService.java (신규)
@Service
@RequiredArgsConstructor
public class DiaryWorkContextService {

    private final BoardMemberRepository boardMemberRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitLogRepository habitLogRepository;
    private final PersonalHabitRepository habitRepository;

    @Transactional(readOnly = true)
    public DiaryWorkContextResponse getWorkContext(UUID userId, LocalDate date) {

        // 1. 오늘 완료한 Board ChecklistItem
        List<BoardMember> memberships = boardMemberRepository.findByUserId(userId);
        List<UUID> boardIds = memberships.stream()
            .map(m -> m.getBoard().getId()).toList();

        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = date.plusDays(1).atStartOfDay();

        List<ChecklistItem> completedItems = checklistItemRepository
            .findCompletedByAssigneeAndBoardIdsAndDateRange(
                userId, boardIds, dayStart, dayEnd);

        // Board별 그룹핑
        Map<UUID, List<ChecklistItem>> byBoard = completedItems.stream()
            .collect(Collectors.groupingBy(ci -> ci.getTask().getBoard().getId()));

        // 2. 오늘 완료한 PersonalTask
        List<PersonalTask> completedTasks = personalTaskRepository
            .findCompletedTodayByUserId(userId, dayStart, dayEnd);

        // 3. 오늘 체크인한 Habit
        List<PersonalHabitLog> todayLogs = habitLogRepository
            .findCompletedByUserIdAndDate(userId, date);

        // 4. 주간 요약
        LocalDate weekStart = date.with(java.time.DayOfWeek.MONDAY);
        LocalDate prevWeekStart = weekStart.minusWeeks(1);

        long thisWeekCompleted = checklistItemRepository
            .countCompletedByAssigneeAndBoardIdsAndDateRange(
                userId, boardIds, weekStart.atStartOfDay(), dayEnd);
        long prevWeekCompleted = checklistItemRepository
            .countCompletedByAssigneeAndBoardIdsAndDateRange(
                userId, boardIds, prevWeekStart.atStartOfDay(),
                weekStart.atStartOfDay());

        return new DiaryWorkContextResponse(
            byBoard, completedTasks, todayLogs,
            thisWeekCompleted, prevWeekCompleted);
    }
}
```

### 9.5 AI 프롬프트 확장

```java
// DiaryAIService.java — 시스템 프롬프트에 업무 컨텍스트 추가
private String buildSystemPrompt(UUID userId, LocalDate date) {
    DiaryWorkContextResponse workContext =
        diaryWorkContextService.getWorkContext(userId, date);

    StringBuilder prompt = new StringBuilder();
    prompt.append("당신은 사용자의 하루를 함께 돌아보는 따뜻한 AI 다이어리 파트너입니다.\n\n");

    if (!workContext.isEmpty()) {
        prompt.append("## 오늘의 업무 컨텍스트\n");
        prompt.append("사용자가 오늘 완료한 작업:\n");

        for (BoardCompleted board : workContext.getCompletedToday()) {
            prompt.append("- [").append(board.getBoardName()).append("] ");
            for (CompletedItem item : board.getItems()) {
                prompt.append(item.getTitle()).append(" ✓\n");
            }
        }

        if (workContext.getWeeklySummary() != null) {
            prompt.append("\n이번 주 총 ")
                .append(workContext.getWeeklySummary().getTotalCompleted())
                .append("건 완료 (지난 주 대비 ")
                .append(workContext.getWeeklySummary().getChangePercentage())
                .append("% 변화)\n");
        }

        prompt.append("\n이 정보를 자연스럽게 대화에 활용하되, ");
        prompt.append("강제로 업무 이야기를 꺼내지 마세요. ");
        prompt.append("사용자가 업무 관련 이야기를 하면 구체적으로 반응해주세요.\n");
    }

    return prompt.toString();
}
```

### 9.6 Frontend 구현

**PersonalDiary.tsx 확장**: AI 첫 메시지에 업무 요약 카드 포함

```tsx
// 다이어리 시작 시 업무 컨텍스트 로드
useEffect(() => {
  if (isNewDiary) {
    personalDashboardAPI.getWorkContext(selectedDate)
      .then(setWorkContext);
  }
}, [selectedDate, isNewDiary]);

// AI 첫 메시지 내 업무 요약 카드
{workContext && workContext.completed_today.length > 0 && (
  <div className="mt-2 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] p-3">
    <div className="flex items-center gap-1.5 mb-2">
      <ClipboardCheck className="w-3.5 h-3.5 text-bridge-accent" />
      <span className="text-[11px] font-bold text-foreground">
        오늘 완료한 작업
      </span>
    </div>
    <div className="space-y-1">
      {workContext.completed_today.map(board => (
        board.items.map(item => (
          <div key={item.title} className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">{board.board_emoji}</span>
            <span className="text-foreground">{item.title}</span>
            <Check className="w-3 h-3 text-emerald-400" />
          </div>
        ))
      ))}
    </div>
    {workContext.weekly_summary && (
      <div className="mt-2 pt-2 border-t border-foreground/[0.06]
        text-[10px] text-slate-500">
        이번 주 {workContext.weekly_summary.total_completed}건 완료
        {workContext.weekly_summary.change_percentage > 0 && (
          <span className="text-emerald-400 ml-1">
            (+{workContext.weekly_summary.change_percentage.toFixed(0)}%)
          </span>
        )}
      </div>
    )}
  </div>
)}
```

---

## 10. 구현 우선순위 & 의존성

```
Phase 1 — MySpace 허브화 (2~3주)
├── Feature #2: 통합 투데이 뷰                    ← 독립, 가장 빠른 가치
├── Feature #3: 크로스 캘린더                      ← 독립
│   ├── (포함) Feature #7: Org 기념일 표시
│   └── (포함) Feature #8: 휴가 캘린더 반영
└── Feature #9: AI 다이어리 + 업무 회고             ← 독립

Phase 2 — 전환 퍼널 (1~2주)
└── Feature #1: 개인태스크 → 보드 이관             ← DB 마이그레이션 필요

Phase 3 — Org 수익화 (2~3주)
├── Feature #4: 보드 성과 → Org 인사이트           ← 독립
├── Feature #5: 1:1 미팅 + 보드 컨텍스트           ← Feature #4 이후
└── Feature #6: 출결 + 스케줄 연동                 ← 독립
```

### DB 마이그레이션 요약

```sql
-- Feature #1: 개인태스크 이관 추적
ALTER TABLE personal_tasks ADD COLUMN migrated_to_task_id UUID;
ALTER TABLE personal_tasks ADD COLUMN migrated_to_board_id UUID;
ALTER TABLE personal_tasks ADD COLUMN migrated_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN source_personal_task_id UUID;

-- 인덱스
CREATE INDEX idx_personal_tasks_migrated ON personal_tasks(migrated_to_task_id);
CREATE INDEX idx_tasks_source_personal ON tasks(source_personal_task_id);
```

### 신규 파일 목록

**Backend:**
```
PersonalCalendarService.java          (Feature #3)
PersonalCalendarController.java       (Feature #3)
DiaryWorkContextService.java          (Feature #9)
AnniversaryNotificationScheduler.java (Feature #7)

DTO: UnifiedCalendarResponse, BoardTasksResponse,
     BoardPerformanceResponse, OneOnOneBoardContextResponse,
     ScheduleAttendanceResponse, CelebrationsResponse,
     DiaryWorkContextResponse, MigrateRequest/Response
```

**Frontend:**
```
BoardTasksWidget.tsx          (Feature #2)
MigrateToBoradModal.tsx       (Feature #1)
OrgBoardPerformanceSection.tsx (Feature #4)
OneOnOneBoardContext.tsx       (Feature #5)
CelebrationsWidget.tsx        (Feature #7)
```

---

## 11. 성과 지표 (KPI)

| 지표 | 측정 방법 | 목표 |
|------|-----------|------|
| MySpace DAU | 일일 MySpace 방문 수 | +40% |
| MySpace → Board 전환율 | 이관 기능 사용 or 보드 생성 비율 | 15% |
| Board → Org 전환율 | Board 유저 중 Org 생성 비율 | 8% |
| 투데이 뷰 체크 완료율 | BoardTasksWidget 인라인 완료 비율 | 60% |
| AI 다이어리 작성률 | 업무 컨텍스트 제공 후 작성 완료율 | +25% |
| 1:1 미팅 데이터 활용률 | BoardContext 조회 후 노트 작성 비율 | 70% |
| Premium 전환율 | Org Insights 사용 후 Premium 전환 | 5% |

---

## 12. 전체 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                        MySpace (허브)                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 개인태스크 │  │  크로스   │  │ AI 다이어리│  │  축하 위젯  │  │
│  │  + 이관   │  │  캘린더   │  │ + 업무회고 │  │ (기념일)   │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └──────┬─────┘  │
│       │             │              │               │         │
│  ┌────┴─────────────┴──────────────┴───────────────┴──┐     │
│  │              통합 투데이 뷰 (보드 할 일)              │     │
│  └────────────────────────┬───────────────────────────┘     │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐
│     Board A     │ │   Board B   │ │    Board C       │
│  Feature/Task   │ │ Feature/Task│ │  Feature/Task    │
│  ChecklistItem  │ │ Schedule    │ │  Meeting         │
│  DailyChecklist │ │ Meeting     │ │                  │
└────────┬────────┘ └──────┬──────┘ └────────┬─────────┘
         │                 │                 │
         └────────┬────────┘                 │
                  ▼                          │
┌─────────────────────────────────────────────────────────────┐
│                     Organization                             │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 보드 성과  │  │ 1:1 미팅  │  │ 출결+스케줄│  │  휴가 관리  │  │
│  │ 인사이트  │  │ +보드컨텍│  │   연동    │  │ →캘린더반영 │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                             │
│  기념일 → MySpace 알림    |    Premium 전용 메트릭          │
└─────────────────────────────────────────────────────────────┘
```

---

*이 문서는 BRIDGE v10.0의 Cross-Domain Integration 기획서입니다.*
*구현 시 CLAUDE.md의 디자인 시스템, API 규칙, 타임존 처리 규칙을 준수합니다.*
