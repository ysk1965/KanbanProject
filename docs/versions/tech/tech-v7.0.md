# BRIDGE - 기술 문서 v7.0

## 1. 아키텍처 개요

### 1.1 기술 스택

#### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Radix UI
- **3D**: Three.js + @react-three/fiber (랜딩 페이지)
- **Animation**: Framer Motion
- **Charts**: Recharts (v7.0 관리 대시보드)
- **DnD**: HTML5 Drag & Drop API (react-dnd)
- **State**: Context API
- **Date**: date-fns

#### Backend
- **Language**: Java 21
- **Framework**: Spring Boot 3.4
- **Security**: Spring Security + JWT
- **ORM**: Spring Data JPA
- **Database**: PostgreSQL

#### Infrastructure
- AWS ECS Fargate + Aurora PostgreSQL
- CloudFront + S3 + Redis
- Terraform (IaC)

### 1.2 프로젝트 구조

```
frontend/
├── src/app/
│   ├── components/       # UI 컴포넌트
│   │   ├── landing/      # 랜딩 페이지
│   │   ├── dashboard/    # 대시보드 관련
│   │   └── ManagementView.tsx  # v7.0 관리 대시보드
│   ├── pages/            # 페이지 컴포넌트
│   ├── contexts/         # React Context
│   ├── utils/            # API, 서비스, 유틸리티
│   │   ├── api.ts        # API 클라이언트
│   │   └── services.ts   # 비즈니스 로직
│   ├── types/            # TypeScript 타입 정의
│   └── styles/           # CSS 스타일

backend/
├── src/main/java/com/kanban/
│   ├── domain/
│   │   ├── board/        # 보드 도메인
│   │   ├── block/        # 블록 도메인
│   │   ├── feature/      # Feature 도메인
│   │   ├── task/         # Task 도메인
│   │   ├── checklist/    # 체크리스트 도메인
│   │   ├── milestone/    # 마일스톤 + Allocation (v7.0)
│   │   ├── schedule/     # 스케줄 블록 도메인
│   │   ├── statistics/   # 통계 + 관리 대시보드 (v7.0)
│   │   └── user/         # 사용자 도메인
│   └── global/           # 공통 설정, 예외 처리
```

---

## 2. 데이터 모델 (Backend)

### 2.1 v7.0 핵심 변경사항

| 변경 | 내용 |
|------|------|
| **Task.assignee 제거** | Task 레벨 담당자 필드 삭제 |
| **MilestoneAllocation 추가** | 마일스톤별 멤버 시간 할당 |
| **Task.estimatedMinutes 추가** | Task 예상 소요 시간 |
| **ManagementService 추가** | 관리 대시보드 통계 서비스 |

### 2.2 Task 엔티티

**파일**: `backend/src/main/java/com/kanban/domain/task/Task.java`

```java
@Entity
@Table(name = "tasks")
public class Task extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feature_id", nullable = false)
    private Feature feature;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "block_id", nullable = false)
    private Block block;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "estimated_minutes")
    private Integer estimatedMinutes;  // v7.0: 예상 소요 시간 (분)

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    // v7.0: assignee 필드 제거됨
    // 담당자는 ChecklistItem.assignee로 결정
}
```

**핵심 메서드**:
```java
// 블록 이동 시 자동 완료 처리
public void moveToBlock(Block newBlock) {
    boolean wasCompleted = this.isCompleted;
    this.block = newBlock;

    if (newBlock.isDoneBlock() && !wasCompleted) {
        this.isCompleted = true;
        this.completedAt = LocalDateTime.now();
        this.feature.incrementCompletedTasks();
    } else if (!newBlock.isDoneBlock() && wasCompleted) {
        this.isCompleted = false;
        this.completedAt = null;
        this.feature.decrementCompletedTasks();
    }
}
```

### 2.3 MilestoneAllocation 엔티티

**파일**: `backend/src/main/java/com/kanban/domain/milestone/MilestoneAllocation.java`

```java
@Entity
@Table(name = "milestone_allocations", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"milestone_id", "member_id"})
})
public class MilestoneAllocation extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private User member;

    @Column(name = "working_days", nullable = false)
    private Integer workingDays;

    @Column(name = "total_allocated_hours", nullable = false)
    private Double totalAllocatedHours;

    // 업데이트 메서드
    public void updateAllocation(Integer workingDays, Double totalAllocatedHours) {
        if (workingDays != null) this.workingDays = workingDays;
        if (totalAllocatedHours != null) this.totalAllocatedHours = totalAllocatedHours;
    }
}
```

**Unique Constraint**: 같은 마일스톤에 같은 멤버는 한 번만 할당 가능

### 2.4 Milestone 엔티티 (확장)

**파일**: `backend/src/main/java/com/kanban/domain/milestone/Milestone.java`

```java
@Entity
@Table(name = "milestones")
public class Milestone extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "default_hours_per_day")
    @Builder.Default
    private Double defaultHoursPerDay = 6.0;  // v7.0: 기본 일일 작업 시간
}
```

### 2.5 엔티티 관계도

```
User ─── Board ─── Block
           │         │
           │    Feature ◄──┐
           │         │     │
           │       Task    │  (assignee 제거됨)
           │         │     │
           │    Checklist  │  (assignee 유지)
           │         │     │
           │  ScheduleBlock│  (assignee 유지)
           │               │
           ├─── Tag ───────┘
           │
           ├─── Milestone ──┬── MilestoneFeature ───► Feature
           │                │
           │                └── MilestoneAllocation ──► User (v7.0)
           │
           ├─── BoardMember
           ├─── InviteLink
           └─── Subscription
```

---

## 3. Repository 쿼리

### 3.1 TaskRepository

**파일**: `backend/src/main/java/com/kanban/domain/task/TaskRepository.java`

```java
public interface TaskRepository extends JpaRepository<Task, String> {

    // 기본 조회
    List<Task> findByBoardIdOrderByPositionAsc(String boardId);
    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);
    List<Task> findByBlockIdOrderByPositionAsc(String blockId);

    // Feature ID 목록으로 조회
    @Query("SELECT t FROM Task t WHERE t.feature.id IN :featureIds ORDER BY t.position ASC")
    List<Task> findByFeatureIds(@Param("featureIds") List<String> featureIds);

    // 마감 초과 Task
    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false AND t.dueDate IS NOT NULL " +
           "AND t.dueDate < CURRENT_DATE ORDER BY t.dueDate ASC")
    List<Task> findOverdueTasks(@Param("boardId") String boardId);

    // 정체 Task (N일 이상 같은 상태)
    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false AND t.updatedAt < :thresholdDate " +
           "ORDER BY t.updatedAt ASC")
    List<Task> findStagnantTasks(
        @Param("boardId") String boardId,
        @Param("thresholdDate") LocalDateTime thresholdDate
    );

    // 통계용
    int countByBoardId(String boardId);
    int countByBoardIdAndIsCompletedTrue(String boardId);

    @Query("SELECT COUNT(t) FROM Task t WHERE t.feature.id IN :featureIds AND t.isCompleted = false")
    int countIncompleteByFeatureIds(@Param("featureIds") List<String> featureIds);
}
```

### 3.2 MilestoneAllocationRepository

**파일**: `backend/src/main/java/com/kanban/domain/milestone/MilestoneAllocationRepository.java`

```java
public interface MilestoneAllocationRepository extends JpaRepository<MilestoneAllocation, String> {

    List<MilestoneAllocation> findByMilestoneId(String milestoneId);

    Optional<MilestoneAllocation> findByMilestoneIdAndMemberId(String milestoneId, String memberId);

    void deleteByMilestoneIdAndMemberId(String milestoneId, String memberId);

    // N+1 방지: 멤버 정보와 함께 조회
    @Query("SELECT ma FROM MilestoneAllocation ma " +
           "JOIN FETCH ma.member " +
           "WHERE ma.milestone.id = :milestoneId")
    List<MilestoneAllocation> findByMilestoneIdWithMember(@Param("milestoneId") String milestoneId);

    boolean existsByMilestoneIdAndMemberId(String milestoneId, String memberId);
}
```

### 3.3 ChecklistItemRepository

**파일**: `backend/src/main/java/com/kanban/domain/checklist/ChecklistItemRepository.java`

```java
public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, String> {

    List<ChecklistItem> findByTaskIdOrderByPositionAsc(String taskId);

    // 담당자 기반 조회 (v7.0 핵심)
    @Query("SELECT ci FROM ChecklistItem ci WHERE ci.assignee.id = :assigneeId")
    List<ChecklistItem> findByAssigneeId(@Param("assigneeId") String assigneeId);

    // 정체 체크리스트 (N일 이상 미완료)
    @Query("SELECT ci FROM ChecklistItem ci WHERE ci.task.board.id = :boardId " +
           "AND ci.isCompleted = false AND ci.createdAt < :thresholdDate")
    List<ChecklistItem> findStuckChecklists(
        @Param("boardId") String boardId,
        @Param("thresholdDate") LocalDateTime thresholdDate
    );
}
```

---

## 4. API 명세

### 4.1 Milestone Allocation API

**Base Path**: `/api/v1/boards/{boardId}/milestones/{milestoneId}/allocations`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 마일스톤 할당 목록 조회 |
| POST | `/` | 할당 생성 |
| PUT | `/{allocationId}` | 할당 수정 |
| DELETE | `/{allocationId}` | 할당 삭제 |

**Request/Response DTOs**:

```java
// 할당 생성 요청
public static class CreateAllocation {
    @NotBlank
    private String memberId;
    @NotNull
    private Integer workingDays;
    @NotNull
    private Double totalAllocatedHours;
}

// 할당 응답
public static class AllocationDto {
    private String id;
    private String milestoneId;
    private MemberInfo member;
    private Integer workingDays;
    private Double totalAllocatedHours;
    private Double actualWorkedHours;   // 실제 작업 시간 (계산값)
    private Double difference;           // 실제 - 할당
    private String status;               // OVER | UNDER | NORMAL
}
```

### 4.2 Statistics/Management API

**Base Path**: `/api/v1/boards/{boardId}/statistics`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 보드 전체 통계 |
| GET | `/personal` | 개인 통계 |
| GET | `/management` | 관리 대시보드 통계 (v7.0) |

**관리 대시보드 쿼리 파라미터**:

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|:------:|------|
| milestone_id | string | - | 특정 마일스톤 필터 |
| stagnant_task_days | int | 3 | 정체 Task 판정 일수 |
| stuck_checklist_days | int | 2 | 막힌 체크리스트 판정 일수 |

**응답 구조**:

```java
public static class ManagementStatistics {
    private List<MilestoneHealth> milestone_health;
    private List<MemberProductivity> team_productivity;
    private DelayedItems delayed_items;
    private ManagementSummary summary;
    private ManagementSettings settings;
}

public static class MilestoneHealth {
    private MilestoneInfo milestone;
    private double progress_percentage;
    private String estimated_completion_date;
    private String status;  // ON_TRACK | SLOW | AT_RISK | OVERDUE
    private int days_remaining;
    private int days_overdue;
    private VelocityInfo velocity;
    private List<BurndownPoint> burndown;
    private FeatureSummary feature_summary;
    private List<MilestoneTask> tasks;
    private AllocationSummary allocation_summary;
}

public static class VelocityInfo {
    private double average_tasks_per_day;
    private int tasks_remaining;
    private int tasks_completed;
    private int tasks_total;
    private double required_velocity;
    // 시간 기반 메트릭
    private Integer estimated_total_minutes;
    private Integer actual_total_minutes;
    private Integer remaining_estimated_minutes;
    private Double average_minutes_per_day;
    private Double required_minutes_per_day;
    private Double time_efficiency;
}

public static class MemberProductivity {
    private MemberInfo member;
    private int assigned_tasks;
    private int completed_tasks;
    private int in_progress_tasks;
    private double completion_rate;
    private int total_checklists;
    private int completed_checklists;
    private double checklist_completion_rate;
    private String status;  // NORMAL | OVERWORKED | RELAXED
    // ChecklistItem 담당자 기준
    private List<InProgressTask> assigned_task_details;
    private List<MemberChecklistInfo> all_checklist_details;
    private List<MemberChecklistInfo> in_progress_checklist_details;
}

public static class DelayedItems {
    private List<OverdueTask> overdue_tasks;
    private List<StagnantTask> stagnant_tasks;
    private List<AtRiskFeature> at_risk_features;
}
```

### 4.3 Task API (v7.0 변경)

**변경 사항**: `assignee_id` 필드 제거

```java
// Task 생성 요청 (assignee_id 제거)
public static class Create {
    @NotBlank @Size(max = 200)
    private String title;
    private String description;
    private LocalDate startDate;
    private LocalDate dueDate;
    private Integer estimatedMinutes;  // v7.0 추가
    // private String assigneeId;  // 제거됨
}

// Task 응답 (assignee 제거)
public static class Simple {
    private String id;
    private String featureId;
    private String featureTitle;
    private String featureColor;
    private String blockId;
    private String blockName;
    private String title;
    private LocalDate startDate;
    private LocalDate dueDate;
    private Integer estimatedMinutes;
    private boolean completed;
    private Integer position;
    private List<TagInfo> tags;
    private int checklistTotal;
    private int checklistCompleted;
    // private AssigneeInfo assignee;  // 제거됨
}
```

---

## 5. Service 핵심 로직

### 5.1 MilestoneService - 실제 작업 시간 계산

**파일**: `backend/src/main/java/com/kanban/domain/milestone/service/MilestoneService.java`

```java
/**
 * 마일스톤 내 멤버별 실제 작업 시간 계산
 *
 * 계산 흐름:
 * 1. 마일스톤에 속한 Feature ID 목록 조회
 * 2. 마일스톤 기간 내 ScheduleBlock 조회
 * 3. Feature에 속한 ChecklistItem의 ScheduleBlock만 필터링
 * 4. assignee별 시간 합산 (분 → 시간 변환)
 */
private Map<String, Double> calculateMemberActualHours(Milestone milestone) {
    // 1. 마일스톤의 Feature ID들
    List<String> featureIds = milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestone.getId());
    if (featureIds.isEmpty()) {
        return Collections.emptyMap();
    }

    // 2. 기간 내 스케줄 블록
    List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository.findByBoardIdAndScheduledDateBetween(
        milestone.getBoard().getId(),
        milestone.getStartDate(),
        milestone.getEndDate()
    );

    // 3. Feature 내 Task에 속한 블록만 필터링 + 시간 계산
    Map<String, Double> memberHours = new HashMap<>();

    for (ScheduleBlock block : scheduleBlocks) {
        if (block.getChecklistItem() == null || block.getAssignee() == null) continue;

        Task task = block.getChecklistItem().getTask();
        if (task == null || task.getFeature() == null) continue;

        if (!featureIds.contains(task.getFeature().getId())) continue;

        // 시간 계산 (분 → 시간)
        long minutes = Duration.between(block.getStartTime(), block.getEndTime()).toMinutes();
        double hours = minutes / 60.0;

        memberHours.merge(block.getAssignee().getId(), hours, Double::sum);
    }

    return memberHours;
}
```

### 5.2 ManagementService - 팀 생산성 계산

**파일**: `backend/src/main/java/com/kanban/domain/statistics/service/ManagementService.java`

```java
/**
 * ChecklistItem.assignee 기준 팀원 생산성 계산
 *
 * v7.0 변경: Task.assignee 대신 ChecklistItem.assignee 사용
 */
private List<MemberProductivity> calculateTeamProductivity(
    String boardId,
    List<BoardMember> members,
    List<Task> tasks
) {
    List<MemberProductivity> result = new ArrayList<>();

    for (BoardMember bm : members) {
        String memberId = bm.getUser().getId();

        // ChecklistItem assignee 기준으로 Task 필터링
        List<Task> assignedTasks = tasks.stream()
            .filter(t -> checklistItemRepository.findByTaskIdOrderByPositionAsc(t.getId()).stream()
                .anyMatch(ci -> ci.getAssignee() != null &&
                         ci.getAssignee().getId().equals(memberId)))
            .collect(Collectors.toList());

        int completedTasks = (int) assignedTasks.stream()
            .filter(Task::getIsCompleted)
            .count();

        // 체크리스트 통계
        List<ChecklistItem> allChecklists = assignedTasks.stream()
            .flatMap(t -> checklistItemRepository.findByTaskIdOrderByPositionAsc(t.getId()).stream())
            .filter(ci -> ci.getAssignee() != null &&
                         ci.getAssignee().getId().equals(memberId))
            .collect(Collectors.toList());

        int completedChecklists = (int) allChecklists.stream()
            .filter(ChecklistItem::getIsCompleted)
            .count();

        // 상태 판정
        double completionRate = assignedTasks.isEmpty() ? 0 :
            (double) completedTasks / assignedTasks.size() * 100;

        String status = determineStatus(completionRate);

        result.add(MemberProductivity.builder()
            .member(mapToMemberInfo(bm.getUser()))
            .assignedTasks(assignedTasks.size())
            .completedTasks(completedTasks)
            .completionRate(completionRate)
            .totalChecklists(allChecklists.size())
            .completedChecklists(completedChecklists)
            .status(status)
            .build());
    }

    return result;
}

private String determineStatus(double completionRate) {
    if (completionRate >= 70 && completionRate <= 130) return "NORMAL";
    if (completionRate > 130) return "OVERWORKED";
    return "RELAXED";
}
```

### 5.3 StatisticsService - 번다운 계산

**파일**: `backend/src/main/java/com/kanban/domain/statistics/service/StatisticsService.java`

```java
/**
 * 번다운 차트 데이터 생성
 *
 * - ideal_remaining: 매일 균등하게 완료해야 할 Task 수
 * - actual_remaining: 해당 날짜까지 실제 남은 Task 수
 * - 시간 기반 메트릭도 동일 로직 적용
 */
private List<BurndownPoint> calculateBurndown(
    Milestone milestone,
    List<Task> tasks,
    Map<String, Integer> taskActualMinutes
) {
    LocalDate start = milestone.getStartDate();
    LocalDate end = milestone.getEndDate();
    int totalTasks = tasks.size();
    int totalDays = (int) ChronoUnit.DAYS.between(start, end) + 1;

    // 예상 총 시간 (분)
    int totalEstimatedMinutes = tasks.stream()
        .mapToInt(t -> t.getEstimatedMinutes() != null ? t.getEstimatedMinutes() : 0)
        .sum();

    List<BurndownPoint> burndown = new ArrayList<>();

    for (int i = 0; i < totalDays; i++) {
        LocalDate date = start.plusDays(i);

        // 이상적 남은 Task 수 (선형 감소)
        double idealRemaining = totalTasks * (1 - (double)(i + 1) / totalDays);

        // 실제 남은 Task 수
        int actualRemaining = (int) tasks.stream()
            .filter(t -> !t.getIsCompleted() ||
                        (t.getCompletedAt() != null && t.getCompletedAt().toLocalDate().isAfter(date)))
            .count();

        // 시간 기반 (선택적)
        Double idealRemainingMinutes = totalEstimatedMinutes > 0 ?
            totalEstimatedMinutes * (1 - (double)(i + 1) / totalDays) : null;

        Integer actualRemainingMinutes = totalEstimatedMinutes > 0 ?
            calculateRemainingMinutes(tasks, date, taskActualMinutes) : null;

        burndown.add(BurndownPoint.builder()
            .date(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
            .idealRemaining(idealRemaining)
            .actualRemaining(actualRemaining)
            .idealRemainingMinutes(idealRemainingMinutes)
            .actualRemainingMinutes(actualRemainingMinutes)
            .build());
    }

    return burndown;
}
```

---

## 6. Frontend 타입 정의

### 6.1 Task 타입 (v7.0)

**파일**: `frontend/src/app/types/index.ts`

```typescript
export interface Task {
  id: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  block_id: string;
  block_name?: string;
  title: string;
  description?: string;
  // v7.0: Task.assignee 제거 - ChecklistItem.assignee로 대체
  start_date: string | null;
  due_date: string | null;
  estimated_minutes: number | null;  // v7.0: 예상 시간
  completed: boolean;
  position: number;
  tags: Tag[];
  checklist_total?: number;
  checklist_completed?: number;
  checklist_version?: number;
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}
```

### 6.2 MilestoneAllocation 타입

```typescript
export type MilestoneAllocationStatus = 'OVER' | 'UNDER' | 'NORMAL';

export interface MilestoneAllocation {
  id: string;
  milestone_id: string;
  member: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  working_days: number;
  total_allocated_hours: number;
  actual_worked_hours?: number;
  difference?: number;
  status?: MilestoneAllocationStatus;
}
```

### 6.3 Management 타입

```typescript
export type MilestoneHealthStatus = 'ON_TRACK' | 'SLOW' | 'AT_RISK' | 'OVERDUE';
export type MemberProductivityStatus = 'NORMAL' | 'OVERWORKED' | 'RELAXED';

export interface VelocityInfo {
  average_tasks_per_day: number;
  tasks_remaining: number;
  tasks_completed: number;
  tasks_total: number;
  required_velocity: number;
  estimated_total_minutes: number | null;
  actual_total_minutes: number | null;
  remaining_estimated_minutes: number | null;
  average_minutes_per_day: number | null;
  required_minutes_per_day: number | null;
  time_efficiency: number | null;
}

export interface MilestoneHealth {
  milestone: MilestoneInfo;
  progress_percentage: number;
  estimated_completion_date: string | null;
  status: MilestoneHealthStatus;
  days_remaining: number;
  days_overdue: number;
  velocity: VelocityInfo;
  burndown: BurndownPoint[];
  feature_summary: FeatureSummary;
  tasks: MilestoneTask[];
}

export interface MemberProductivity {
  member: ManagementMemberInfo;
  assigned_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  completion_rate: number;
  total_checklists: number;
  completed_checklists: number;
  checklist_completion_rate: number;
  status: MemberProductivityStatus;
  in_progress_task_details: InProgressTask[];
  stuck_checklists: StuckChecklistItem[];
  recent_completed_tasks: RecentCompletedTask[];
  total_estimated_minutes: number | null;
  total_actual_minutes: number | null;
  time_efficiency: number | null;
  average_minutes_per_day: number | null;
  // v7.0: ChecklistItem 담당자 기준
  assigned_task_details?: InProgressTask[];
  all_checklist_details?: MemberChecklistInfo[];
  in_progress_checklist_details?: MemberChecklistInfo[];
}

export interface DelayedItems {
  overdue_features: OverdueFeature[];
  stagnant_tasks: StagnantTask[];
  stuck_checklists: StuckChecklist[];
  bottleneck_summary: BottleneckSummary;
}

export interface ManagementStatistics {
  milestone_health: MilestoneHealth[];
  team_productivity: MemberProductivity[];
  delayed_items: DelayedItems;
  summary: ManagementSummary;
  settings: ManagementSettings;
}
```

---

## 7. Frontend API 클라이언트

### 7.1 Milestone Allocation API

**파일**: `frontend/src/app/utils/api.ts`

```typescript
export const milestoneAPI = {
  // 할당 조회
  getAllocations: async (boardId: string, milestoneId: string) => {
    return apiClient.get<{ allocations: MilestoneAllocationResponse[] }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`
    );
  },

  // 할당 생성
  createAllocation: async (
    boardId: string,
    milestoneId: string,
    data: {
      member_id: string;
      working_days: number;
      total_allocated_hours: number;
    }
  ) => {
    return apiClient.post<MilestoneAllocationResponse>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`,
      data
    );
  },

  // 할당 수정
  updateAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
    data: {
      working_days?: number;
      total_allocated_hours?: number;
    }
  ) => {
    return apiClient.put<MilestoneAllocationResponse>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`,
      data
    );
  },

  // 할당 삭제
  deleteAllocation: async (boardId: string, milestoneId: string, allocationId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`
    );
  },
};
```

### 7.2 Statistics API

```typescript
export const statisticsAPI = {
  // 관리 대시보드 통계
  getManagementStatistics: async (
    boardId: string,
    params?: {
      milestone_id?: string;
      stagnant_task_days?: number;
      stuck_checklist_days?: number;
    }
  ) => {
    const queryString = new URLSearchParams();
    if (params?.milestone_id) queryString.append('milestone_id', params.milestone_id);
    if (params?.stagnant_task_days) queryString.append('stagnant_task_days', params.stagnant_task_days.toString());
    if (params?.stuck_checklist_days) queryString.append('stuck_checklist_days', params.stuck_checklist_days.toString());

    return apiClient.get<ManagementStatisticsResponse>(
      `/boards/${boardId}/statistics/management${queryString ? `?${queryString}` : ''}`
    );
  },
};
```

---

## 8. 핵심 컴포넌트 구조

### 8.1 ManagementView 컴포넌트

**파일**: `frontend/src/app/components/ManagementView.tsx`

**Props**:
```typescript
interface ManagementViewProps {
  boardId: string;
  milestones: Milestone[];
  members: BoardMember[];
  onTaskClick?: (taskId: string) => void;
  refreshTrigger?: number;
}
```

**State**:
```typescript
const [data, setData] = useState<ManagementStatistics | null>(null);
const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
const [settings, setSettings] = useState({
  stagnant_task_days: 3,
  stuck_checklist_days: 2,
});
const [activeTab, setActiveTab] = useState<'health' | 'productivity' | 'delayed'>('health');
```

**구조**:
```
ManagementView
├── 요약 카드 (건강점수, 마일스톤, 팀원, 지연항목)
├── 탭 네비게이션
└── 탭 컨텐츠
    ├── MilestoneHealthSection
    │   ├── 진행률 표시
    │   ├── 추정 정확도
    │   ├── 번다운 차트 (Recharts)
    │   ├── TeamAllocationSubSection
    │   └── Task 목록 (인라인 시간 편집)
    ├── TeamProductivitySection
    │   ├── 팀원별 통계 테이블
    │   └── 확장 상세 (담당 Task, 체크리스트)
    └── DelayedItemsSection
        ├── 마감초과 Feature
        ├── 정체 Task
        ├── 막힌 체크리스트
        └── 병목 요약
```

### 8.2 시간 포맷팅 유틸리티

```typescript
// 전체 형식: "2시간 30분"
const formatMinutes = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
};

// 축약 형식: "2h 30m"
const formatMinutesShort = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};
```

### 8.3 추정 정확도 계산

```typescript
// 추정 정확도 = (예상 / 실제) * 100
const efficiency = actual > 0 ? (estimated / actual) * 100 : 0;

const getEfficiencyColor = (eff: number) => {
  if (eff >= 80 && eff <= 120) return 'text-emerald-400';  // 정상
  if ((eff >= 50 && eff < 80) || (eff > 120 && eff <= 150)) return 'text-yellow-400';  // 주의
  return 'text-red-400';  // 위험
};
```

---

## 9. 데이터베이스 스키마

### 9.1 v7.0 마이그레이션

```sql
-- Task에서 assignee 컬럼 제거
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_id;

-- Task에 estimated_minutes 추가
ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER;

-- milestone_allocations 테이블 생성
CREATE TABLE milestone_allocations (
    id VARCHAR(36) PRIMARY KEY,
    milestone_id VARCHAR(36) NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    member_id VARCHAR(36) NOT NULL REFERENCES users(id),
    working_days INTEGER NOT NULL,
    total_allocated_hours DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(milestone_id, member_id)
);

-- 마일스톤에 기본 일일 시간 추가
ALTER TABLE milestones ADD COLUMN default_hours_per_day DECIMAL(4,2) DEFAULT 6.0;

-- 인덱스 추가
CREATE INDEX idx_milestone_allocations_milestone ON milestone_allocations(milestone_id);
CREATE INDEX idx_milestone_allocations_member ON milestone_allocations(member_id);
```

---

## 10. 주요 계산 로직 요약

### 10.1 담당자 결정 (v7.0 핵심)

```
기존 (v6.x):
  Task.assignee → 단일 담당자

변경 (v7.0):
  Task
  └── ChecklistItem
      └── assignee → 각 항목별 담당자

  Task 담당자 = ChecklistItem.assignee 목록 (중복 제거)
```

### 10.2 실제 작업 시간 계산

```
멤버의 실제 작업 시간 =
  해당 멤버가 담당한 ChecklistItem의 ScheduleBlock 시간 합계

ScheduleBlock 시간 = endTime - startTime (분 단위)
```

### 10.3 마일스톤 건강도 상태

```
진행률 vs 예상 진행률 비교:
- ON_TRACK: 실제 >= 예상
- SLOW: 실제 < 예상 (7일 이내 지연)
- AT_RISK: 실제 < 예상 (7일 초과 지연)
- OVERDUE: 마감일 지남
```

### 10.4 팀원 생산성 상태

```
완료율 = 완료 Task / 할당 Task * 100

- NORMAL: 70% <= 완료율 <= 130%
- OVERWORKED: 완료율 > 130%
- RELAXED: 완료율 < 70%
```

### 10.5 할당 상태

```
차이 = 실제 시간 - 할당 시간

- NORMAL: -10% <= 차이 <= +10%
- OVER: 실제 > 할당의 110%
- UNDER: 실제 < 할당의 90%
```

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v7.0 | 2026-01-13 | Task.assignee 제거, MilestoneAllocation 추가, ManagementService 추가, Task.estimatedMinutes 추가, ChecklistItem 담당자 기준 통계 |

---

**문서 버전**: 7.0
**문서 유형**: 기술
**최종 수정**: 2026년 1월 13일
