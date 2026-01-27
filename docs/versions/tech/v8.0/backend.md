# BRIDGE - Backend 기술 문서 v8.0

> 이 문서는 BRIDGE 서비스의 Backend 엔티티, API, 서비스 로직을 정의합니다.
>
> **관련 문서**
> - [아키텍처 개요](./architecture.md)
> - [Frontend 기술 문서](./frontend.md)

---

## 1. 엔티티 정의

### 1.1 User 엔티티

```java
@Entity
@Table(name = "users")
public class User extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "email", nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "profile_image", length = 500)
    private String profileImage;

    @Column(name = "auth_provider", length = 20)
    @Builder.Default
    private String authProvider = "email";

    @Column(name = "auth_provider_id")
    private String authProviderId;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private Boolean emailVerified = false;

    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "theme", length = 20)
    @Builder.Default
    private String theme = "dark";

    // 메서드
    public void verifyEmail() {
        this.emailVerified = true;
        this.emailVerifiedAt = LocalDateTime.now();
    }

    public void updateTheme(String theme) {
        if (theme != null && (theme.equals("dark") || theme.equals("light"))) {
            this.theme = theme;
        }
    }

    public void updatePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }
}
```

### 1.2 EmailVerificationToken 엔티티

```java
@Entity
@Table(name = "email_verification_tokens")
public class EmailVerificationToken {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token", nullable = false, unique = true, length = 64)
    private String token;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    public static EmailVerificationToken create(User user, int expirationHours) {
        return EmailVerificationToken.builder()
                .user(user)
                .token(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(expirationHours))
                .createdAt(LocalDateTime.now())
                .build();
    }

    public boolean isValid() {
        return !isExpired() && !isUsed();
    }

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiresAt);
    }

    public boolean isUsed() {
        return this.usedAt != null;
    }

    public void markAsUsed() {
        this.usedAt = LocalDateTime.now();
    }
}
```

### 1.3 PasswordResetToken 엔티티

```java
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token", nullable = false, unique = true, length = 64)
    private String token;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    public static PasswordResetToken create(User user, int expirationHours) {
        return PasswordResetToken.builder()
                .user(user)
                .token(UUID.randomUUID().toString().replace("-", ""))
                .expiresAt(LocalDateTime.now().plusHours(expirationHours))
                .createdAt(LocalDateTime.now())
                .build();
    }

    public boolean isValid() {
        return !isExpired() && !isUsed();
    }
}
```

### 1.4 Task 엔티티

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
    private Integer estimatedMinutes;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

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
}
```

### 1.5 WeightLevel 엔티티

```java
@Entity
@Table(name = "weight_levels")
public class WeightLevel extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "weight", nullable = false)
    private Double weight;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private Boolean isDefault = false;

    public void update(String name, Double weight, String color, Integer position) {
        if (name != null) this.name = name;
        if (weight != null) this.weight = weight;
        if (color != null) this.color = color;
        if (position != null) this.position = position;
    }
}
```

### 1.6 TaskWeight 엔티티

```java
@Entity
@Table(name = "task_weights")
public class TaskWeight extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "weight_level_id", nullable = false)
    private WeightLevel weightLevel;

    public void updateWeightLevel(WeightLevel weightLevel) {
        this.weightLevel = weightLevel;
    }

    public static TaskWeight create(Task task, WeightLevel weightLevel) {
        return TaskWeight.builder()
                .task(task)
                .weightLevel(weightLevel)
                .build();
    }
}
```

### 1.7 MilestoneAllocation 엔티티

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

    public void updateAllocation(Integer workingDays, Double totalAllocatedHours) {
        if (workingDays != null) this.workingDays = workingDays;
        if (totalAllocatedHours != null) this.totalAllocatedHours = totalAllocatedHours;
    }
}
```

---

## 2. API 명세

### 2.1 Auth API

**Base Path**: `/api/v1/auth`

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/signup` | 회원가입 |
| POST | `/login` | 로그인 |
| POST | `/google` | 구글 소셜 로그인 |
| POST | `/refresh` | 토큰 갱신 |
| POST | `/logout` | 로그아웃 |
| GET | `/me` | 현재 사용자 정보 |
| GET | `/verify-email` | 이메일 인증 |
| POST | `/resend-verification` | 인증 이메일 재발송 |
| POST | `/forgot-password` | 비밀번호 재설정 요청 |
| POST | `/reset-password` | 비밀번호 재설정 |

### 2.2 User API

**Base Path**: `/api/v1/users`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/me` | 현재 사용자 정보 조회 |
| PATCH | `/me` | 프로필 수정 (이름, 테마) |
| POST | `/me/password` | 비밀번호 변경 |
| DELETE | `/me` | 계정 삭제 |

**Request/Response**:

```java
// GET /me Response
{
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "profile_image": "https://...",
    "email_verified": true,
    "theme": "dark"
}

// PATCH /me Request
{
    "name": "새이름",
    "theme": "light"
}

// POST /me/password Request
{
    "currentPassword": "current123",
    "newPassword": "newPassword123"
}
```

### 2.3 Weight Level API

**Base Path**: `/api/v1/boards/{boardId}`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/weight-levels` | 가중치 레벨 목록 조회 |
| PUT | `/weight-levels` | 가중치 레벨 전체 수정 |
| POST | `/tasks/{taskId}/weight` | Task 가중치 설정 |
| GET | `/tasks/{taskId}/weight` | Task 가중치 조회 |

**Request/Response**:

```java
// GET /weight-levels Response
{
    "board_id": "uuid",
    "levels": [
        { "id": "1", "name": "Low", "weight": 0.5, "color": "slate", "position": 0, "is_default": false },
        { "id": "2", "name": "Medium", "weight": 1.0, "color": "blue", "position": 1, "is_default": true },
        { "id": "3", "name": "High", "weight": 1.5, "color": "amber", "position": 2, "is_default": false },
        { "id": "4", "name": "Critical", "weight": 2.0, "color": "red", "position": 3, "is_default": false }
    ],
    "default_level_id": "2"
}

// POST /tasks/{taskId}/weight Request
{
    "weight_level_id": "3"
}

// GET /tasks/{taskId}/weight Response
{
    "task_id": "uuid",
    "weight_level": {
        "id": "3",
        "name": "High",
        "weight": 1.5,
        "color": "amber"
    }
}
```

### 2.4 Statistics API

**Base Path**: `/api/v1/boards/{boardId}/statistics`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 보드 전체 통계 |
| GET | `/personal` | 개인 통계 |
| GET | `/management` | 관리 대시보드 통계 |

**쿼리 파라미터**:

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| start_date | date | 시작일 |
| end_date | date | 종료일 |
| milestone_id | string | 마일스톤 필터 |
| stagnant_task_days | int | 정체 Task 판정 일수 (기본: 3) |
| stuck_checklist_days | int | 막힌 체크리스트 판정 일수 (기본: 2) |

### 2.5 Milestone Allocation API

**Base Path**: `/api/v1/boards/{boardId}/milestones/{milestoneId}/allocations`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 마일스톤 할당 목록 조회 |
| POST | `/` | 할당 생성 |
| PUT | `/{allocationId}` | 할당 수정 |
| DELETE | `/{allocationId}` | 할당 삭제 |

---

## 3. Repository 쿼리

### 3.1 TaskRepository

```java
public interface TaskRepository extends JpaRepository<Task, String> {

    List<Task> findByBoardIdOrderByPositionAsc(String boardId);
    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);

    @Query("SELECT t FROM Task t WHERE t.feature.id IN :featureIds ORDER BY t.position ASC")
    List<Task> findByFeatureIds(@Param("featureIds") List<String> featureIds);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false AND t.dueDate < CURRENT_DATE")
    List<Task> findOverdueTasks(@Param("boardId") String boardId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false AND t.updatedAt < :thresholdDate")
    List<Task> findStagnantTasks(
        @Param("boardId") String boardId,
        @Param("thresholdDate") LocalDateTime thresholdDate
    );
}
```

### 3.2 WeightLevelRepository

```java
public interface WeightLevelRepository extends JpaRepository<WeightLevel, String> {

    List<WeightLevel> findByBoardIdOrderByPositionAsc(String boardId);

    Optional<WeightLevel> findByBoardIdAndIsDefaultTrue(String boardId);

    boolean existsByBoardId(String boardId);
}
```

### 3.3 TaskWeightRepository

```java
public interface TaskWeightRepository extends JpaRepository<TaskWeight, String> {

    Optional<TaskWeight> findByTaskId(String taskId);

    @Query("SELECT tw FROM TaskWeight tw JOIN FETCH tw.weightLevel WHERE tw.task.id = :taskId")
    Optional<TaskWeight> findByTaskIdWithWeightLevel(@Param("taskId") String taskId);

    @Query("SELECT tw FROM TaskWeight tw JOIN FETCH tw.weightLevel WHERE tw.task.id IN :taskIds")
    List<TaskWeight> findByTaskIdsWithWeightLevel(@Param("taskIds") List<String> taskIds);
}
```

---

## 4. Service 핵심 로직

### 4.1 AuthService - 이메일 인증

```java
@Transactional
public void verifyEmail(String token) {
    EmailVerificationToken verificationToken = emailVerificationTokenRepository
        .findByToken(token)
        .orElseThrow(() -> new BadRequestException("유효하지 않은 인증 토큰입니다"));

    if (!verificationToken.isValid()) {
        if (verificationToken.isExpired()) {
            throw new BadRequestException("만료된 인증 토큰입니다");
        }
        throw new BadRequestException("이미 사용된 인증 토큰입니다");
    }

    User user = verificationToken.getUser();
    user.verifyEmail();
    verificationToken.markAsUsed();

    userRepository.save(user);
    emailVerificationTokenRepository.save(verificationToken);
}

@Transactional
public void resendVerificationEmail(String email) {
    User user = userRepository.findByEmail(email)
        .orElseThrow(() -> new BadRequestException("존재하지 않는 이메일입니다"));

    if (user.getEmailVerified()) {
        throw new BadRequestException("이미 인증된 이메일입니다");
    }

    emailVerificationTokenRepository.deleteByUserId(user.getId());

    EmailVerificationToken token = EmailVerificationToken.create(user, 24);
    emailVerificationTokenRepository.save(token);

    emailService.sendVerificationEmail(user.getEmail(), token.getToken());
}
```

### 4.2 AuthService - 비밀번호 재설정

```java
@Transactional
public void requestPasswordReset(String email) {
    userRepository.findByEmail(email).ifPresent(user -> {
        passwordResetTokenRepository.deleteByUserId(user.getId());

        PasswordResetToken token = PasswordResetToken.create(user, 1); // 1시간
        passwordResetTokenRepository.save(token);

        emailService.sendPasswordResetEmail(user.getEmail(), token.getToken());
    });
    // 보안상 존재하지 않는 이메일에도 동일 응답
}

@Transactional
public void resetPassword(String token, String newPassword) {
    PasswordResetToken resetToken = passwordResetTokenRepository
        .findByToken(token)
        .orElseThrow(() -> new BadRequestException("유효하지 않은 토큰입니다"));

    if (!resetToken.isValid()) {
        throw new BadRequestException("만료되었거나 이미 사용된 토큰입니다");
    }

    validatePassword(newPassword);

    User user = resetToken.getUser();
    user.updatePassword(passwordEncoder.encode(newPassword));
    resetToken.markAsUsed();

    userRepository.save(user);
    passwordResetTokenRepository.save(resetToken);
}

private void validatePassword(String password) {
    if (password.length() < 8) {
        throw new BadRequestException("비밀번호는 8자 이상이어야 합니다");
    }
    if (!password.matches(".*[a-zA-Z].*") || !password.matches(".*[0-9].*")) {
        throw new BadRequestException("비밀번호는 영문자와 숫자를 포함해야 합니다");
    }
}
```

### 4.3 WeightLevelService

```java
@Transactional
public BoardWeightSettings getWeightLevels(String boardId, String userId) {
    validateBoardAccess(boardId, userId);

    List<WeightLevel> levels = weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);

    if (levels.isEmpty()) {
        levels = createDefaultWeightLevels(boardId);
    }

    WeightLevel defaultLevel = levels.stream()
        .filter(WeightLevel::getIsDefault)
        .findFirst()
        .orElse(levels.get(0));

    return BoardWeightSettings.builder()
        .board_id(boardId)
        .levels(levels.stream().map(this::mapToLevelInfo).toList())
        .default_level_id(defaultLevel.getId())
        .build();
}

private List<WeightLevel> createDefaultWeightLevels(String boardId) {
    Board board = boardRepository.findById(boardId)
        .orElseThrow(() -> new ResourceNotFoundException("보드를 찾을 수 없습니다"));

    List<WeightLevel> defaults = List.of(
        WeightLevel.builder().board(board).name("Low").weight(0.5).color("slate").position(0).isDefault(false).build(),
        WeightLevel.builder().board(board).name("Medium").weight(1.0).color("blue").position(1).isDefault(true).build(),
        WeightLevel.builder().board(board).name("High").weight(1.5).color("amber").position(2).isDefault(false).build(),
        WeightLevel.builder().board(board).name("Critical").weight(2.0).color("red").position(3).isDefault(false).build()
    );

    return weightLevelRepository.saveAll(defaults);
}

@Transactional
public TaskWeightDetail setTaskWeight(String boardId, String taskId, String userId, String weightLevelId) {
    validateBoardAccess(boardId, userId);

    Task task = taskRepository.findById(taskId)
        .orElseThrow(() -> new ResourceNotFoundException("Task를 찾을 수 없습니다"));

    WeightLevel weightLevel = weightLevelRepository.findById(weightLevelId)
        .orElseThrow(() -> new ResourceNotFoundException("가중치 레벨을 찾을 수 없습니다"));

    TaskWeight taskWeight = taskWeightRepository.findByTaskId(taskId)
        .map(tw -> {
            tw.updateWeightLevel(weightLevel);
            return tw;
        })
        .orElseGet(() -> TaskWeight.create(task, weightLevel));

    taskWeightRepository.save(taskWeight);

    return TaskWeightDetail.builder()
        .task_id(taskId)
        .weight_level(mapToLevelInfo(weightLevel))
        .build();
}
```

### 4.4 StatisticsService - 임팩트 계산

```java
private ImpactStatistics calculateImpactStatistics(
    List<Task> completedTasks,
    Map<String, TaskWeight> taskWeights
) {
    double totalImpact = 0;
    double totalWeight = 0;
    Map<String, Double> impactByLevel = new HashMap<>();
    Map<String, Double> memberImpacts = new HashMap<>();

    for (Task task : completedTasks) {
        double weight = getTaskWeight(task.getId(), taskWeights);
        double minutes = task.getEstimatedMinutes() != null ? task.getEstimatedMinutes() : 0;
        double impact = minutes * weight;

        totalImpact += impact;
        totalWeight += weight;

        String levelName = getLevelName(task.getId(), taskWeights);
        impactByLevel.merge(levelName, impact, Double::sum);

        for (String memberId : getTaskAssigneeIds(task)) {
            memberImpacts.merge(memberId, impact, Double::sum);
        }
    }

    return ImpactStatistics.builder()
        .total_impact_score(totalImpact)
        .average_weight(completedTasks.isEmpty() ? 0 : totalWeight / completedTasks.size())
        .impact_by_weight_level(impactByLevel)
        .member_impacts(buildMemberImpacts(memberImpacts, totalImpact))
        .build();
}
```

---

## 5. 데이터베이스 마이그레이션

### 5.1 v8.0 마이그레이션 SQL

```sql
-- 사용자 테이블 확장
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN theme VARCHAR(20) DEFAULT 'dark';

-- 이메일 인증 토큰 테이블
CREATE TABLE email_verification_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

-- 비밀번호 재설정 토큰 테이블
CREATE TABLE password_reset_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

-- 가중치 레벨 테이블
CREATE TABLE weight_levels (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    weight DECIMAL(4,2) NOT NULL,
    color VARCHAR(20),
    position INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Task 가중치 테이블
CREATE TABLE task_weights (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    weight_level_id VARCHAR(36) NOT NULL REFERENCES weight_levels(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id)
);

-- 인덱스
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_weight_levels_board ON weight_levels(board_id);
CREATE INDEX idx_task_weights_task ON task_weights(task_id);
```

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v7.0 | 2026-01-13 | Task.assignee 제거, MilestoneAllocation 추가, Task.estimatedMinutes 추가 |
| v8.0 | 2026-01-15 | EmailVerificationToken, PasswordResetToken, WeightLevel, TaskWeight 추가, User.theme 필드 |

---

**문서 버전**: 8.0
**최종 수정**: 2026년 1월 15일
