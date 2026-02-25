# Organization Service - ERD & Database Design

> **Version**: v1.0.0 | **Date**: 2026-02-25
> **기존 Flyway 최신**: V59 | **신규 시작**: V60

---

## 1. Entity Relationship Diagram

```
┌──────────┐       ┌────────────────────┐       ┌──────────┐
│  users   │       │  organizations     │       │  boards   │
│──────────│       │────────────────────│       │──────────│
│ id (PK)  │◄──┐   │ id (PK)            │   ┌──►│ id (PK)  │
│ email    │   │   │ name               │   │   │ name     │
│ name     │   │   │ description        │   │   │ org_id(FK│──► organizations
│ ...      │   │   │ logo_url           │   │   │ ...      │
└──────────┘   │   │ owner_id (FK)──────┼───┤   └──────────┘
               │   │ created_at         │   │
               │   │ updated_at         │   │
               │   │ deleted_at         │   │
               │   └────────────────────┘   │
               │              │             │
               │              │ 1:N         │
               │              ▼             │
               │   ┌────────────────────────┴───────┐
               │   │  organization_members           │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               ├───┤ user_id (FK) ──────────────────►│
               │   │ organization_id (FK) ──────────►│
               │   │ role (ENUM)                     │
               │   │ department_id (FK) → depts      │
               │   │ job_group_id (FK) → job_groups   │
               │   │ job_title                       │
               │   │ contract_type (ENUM)            │
               │   │ work_status (ENUM)              │
               │   │ employee_id                     │
               │   │ phone                           │
               │   │ birth_date                      │
               │   │ hire_date                       │
               │   │ bio (TEXT)                      │
               │   │ joined_at                       │
               │   │ invited_by (FK) ───────────────►│
               │   │ display_order                   │
               │   │ created_at, updated_at          │
               │   └────────────────────────────────┘
               │
               │   ┌────────────────────────────────┐
               │   │  organization_departments       │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               │   │ name                            │
               │   │ display_order                   │
               │   └────────────────────────────────┘
               │
               │   ┌────────────────────────────────┐
               │   │  organization_job_groups        │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               │   │ name                            │
               │   │ display_order                   │
               │   └────────────────────────────────┘
               │
               │   ┌────────────────────────────────┐
               │   │  leave_policies                 │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               │   │ name                            │
               │   │ leave_category (ENUM)           │
               │   │ default_days (DECIMAL)          │
               │   │ is_paid (BOOLEAN)               │
               │   │ requires_approval (BOOLEAN)     │
               │   │ description                     │
               │   │ display_order                   │
               │   │ is_active (BOOLEAN)             │
               │   │ created_at, updated_at          │
               │   └────────────────────────────────┘
               │              │
               │              │ 1:N
               │              ▼
               │   ┌────────────────────────────────┐
               │   │  leave_balances                 │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               │   │ member_id (FK) → org_members    │
               │   │ policy_id (FK) → leave_policies │
               │   │ year (INT)                      │
               │   │ total_days (DECIMAL)            │
               │   │ used_days (DECIMAL)             │
               │   │ created_at, updated_at          │
               │   └────────────────────────────────┘
               │
               │   ┌────────────────────────────────┐
               │   │  leave_requests                 │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               ├───┤ requester_id (FK) → org_members │
               │   │ policy_id (FK) → leave_policies │
               │   │ start_date (DATE)               │
               │   │ end_date (DATE)                 │
               │   │ duration_type (ENUM)            │
               │   │ total_days (DECIMAL)            │
               │   │ reason (TEXT)                   │
               │   │ status (ENUM)                   │
               ├───┤ reviewer_id (FK) → org_members  │
               │   │ reviewed_at                     │
               │   │ review_comment                  │
               │   │ created_at, updated_at          │
               │   └────────────────────────────────┘
               │
               │   ┌────────────────────────────────┐
               │   │  organization_invite_links      │
               │   │────────────────────────────────│
               │   │ id (PK)                         │
               │   │ organization_id (FK)            │
               │   │ code (UNIQUE)                   │
               │   │ role (ENUM, default MEMBER)     │
               │   │ max_uses (INT, nullable)        │
               │   │ used_count (INT, default 0)     │
               │   │ expires_at (nullable)           │
               │   │ is_active (BOOLEAN)             │
               ├───┤ created_by (FK) → users         │
               │   │ created_at                      │
               │   └────────────────────────────────┘
```

---

## 2. Enum Definitions

```java
// 조직 역할
public enum OrgRole {
    OWNER,    // 조직 소유자 (1명)
    ADMIN,    // 조직 관리자
    MEMBER    // 일반 구성원
}

// 계약 형태
public enum ContractType {
    FULL_TIME,   // 정직원
    CONTRACT,    // 계약직
    INTERN,      // 인턴
    PART_TIME    // 파트타임
}

// 근무 상태
public enum WorkStatus {
    ACTIVE,      // 재직 중
    ON_LEAVE,    // 휴직 중
    RESIGNED     // 퇴사
}

// 휴가 카테고리 (대분류)
public enum LeaveCategory {
    ANNUAL,      // 연차
    SICK,        // 병가
    REFRESH,     // 리프레시 휴가
    OTHER        // 기타 (경조, 장기근속, 건강검진 등)
}

// 휴가 기간 유형
public enum LeaveDurationType {
    FULL_DAY,    // 전일
    AM_HALF,     // 오전 반차
    PM_HALF      // 오후 반차
}

// 휴가 요청 상태
public enum LeaveStatus {
    PENDING,     // 대기 중
    APPROVED,    // 승인
    REJECTED,    // 거절
    CANCELED     // 취소 (본인)
}
```

---

## 3. DDL (Flyway Migrations)

### V60__create_organizations.sql

```sql
-- =============================================
-- V60: Organization Service - Core Tables
-- =============================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    owner_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_org_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX idx_org_owner ON organizations(owner_id);
CREATE INDEX idx_org_deleted ON organizations(deleted_at);

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    department_id VARCHAR(36),
    job_group_id VARCHAR(36),
    job_title VARCHAR(100),
    contract_type VARCHAR(20) DEFAULT 'FULL_TIME',
    work_status VARCHAR(20) DEFAULT 'ACTIVE',
    employee_id VARCHAR(50),
    phone VARCHAR(30),
    birth_date DATE,
    hire_date DATE,
    bio TEXT,
    joined_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    invited_by VARCHAR(36),
    display_order INT,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_orgmember_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_orgmember_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_orgmember_inviter FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id),
    CONSTRAINT chk_org_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    CONSTRAINT chk_contract_type CHECK (contract_type IN ('FULL_TIME', 'CONTRACT', 'INTERN', 'PART_TIME')),
    CONSTRAINT chk_work_status CHECK (work_status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED'))
);

CREATE INDEX idx_orgmember_org ON organization_members(organization_id);
CREATE INDEX idx_orgmember_user ON organization_members(user_id);
CREATE INDEX idx_orgmember_dept ON organization_members(organization_id, department_id);
CREATE INDEX idx_orgmember_status ON organization_members(organization_id, work_status);

-- 3. Organization Departments (configurable)
CREATE TABLE IF NOT EXISTS organization_departments (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    CONSTRAINT fk_orgdept_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT uq_orgdept_name UNIQUE (organization_id, name)
);

-- 4. Organization Job Groups (configurable)
CREATE TABLE IF NOT EXISTS organization_job_groups (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    CONSTRAINT fk_orgjob_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT uq_orgjob_name UNIQUE (organization_id, name)
);

-- 5. organization_members → departments / job_groups FK (테이블 생성 후 추가)
ALTER TABLE organization_members ADD CONSTRAINT fk_orgmember_dept
    FOREIGN KEY (department_id) REFERENCES organization_departments(id) ON DELETE SET NULL;
ALTER TABLE organization_members ADD CONSTRAINT fk_orgmember_jobgroup
    FOREIGN KEY (job_group_id) REFERENCES organization_job_groups(id) ON DELETE SET NULL;

-- 6. Add organization_id to boards (nullable FK)
-- Soft Delete 사용이므로 ON DELETE SET NULL 불필요 (실제 DELETE 발생 안 함)
ALTER TABLE boards ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);
ALTER TABLE boards ADD CONSTRAINT fk_board_org FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE boards ADD CONSTRAINT chk_org_board_type CHECK (organization_id IS NULL OR board_type = 'TEAM');
CREATE INDEX idx_board_org ON boards(organization_id);

-- 6. Organization Invite Links
CREATE TABLE IF NOT EXISTS organization_invite_links (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT fk_orginvite_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_orginvite_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_orginvite_role CHECK (role IN ('ADMIN', 'MEMBER'))
);

CREATE INDEX idx_orginvite_code ON organization_invite_links(code);
CREATE INDEX idx_orginvite_org ON organization_invite_links(organization_id);
```

### V61__create_leave_management.sql

```sql
-- =============================================
-- V61: Leave Management Tables
-- =============================================

-- 1. Leave Policies (조직별 휴가 유형 정의)
CREATE TABLE IF NOT EXISTS leave_policies (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    leave_category VARCHAR(20) NOT NULL,
    default_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavepolicy_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT chk_leave_category CHECK (leave_category IN ('ANNUAL', 'SICK', 'REFRESH', 'OTHER'))
);

CREATE INDEX idx_leavepolicy_org ON leave_policies(organization_id);

-- 2. Leave Balances (멤버별 연간 휴가 잔여)
CREATE TABLE IF NOT EXISTS leave_balances (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    member_id VARCHAR(36) NOT NULL,
    policy_id VARCHAR(36) NOT NULL,
    year INT NOT NULL,
    total_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    used_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavebal_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_leavebal_member FOREIGN KEY (member_id) REFERENCES organization_members(id) ON DELETE CASCADE,
    CONSTRAINT fk_leavebal_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id),
    CONSTRAINT uq_leave_balance UNIQUE (member_id, policy_id, year)
);

CREATE INDEX idx_leavebal_member ON leave_balances(member_id);
CREATE INDEX idx_leavebal_org_year ON leave_balances(organization_id, year);

-- 3. Leave Requests (휴가 신청)
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL,
    requester_id VARCHAR(36),
    policy_id VARCHAR(36) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration_type VARCHAR(20) NOT NULL DEFAULT 'FULL_DAY',
    total_days DECIMAL(4,1) NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewer_id VARCHAR(36),
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP,
    CONSTRAINT fk_leavereq_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_leavereq_requester FOREIGN KEY (requester_id) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT fk_leavereq_policy FOREIGN KEY (policy_id) REFERENCES leave_policies(id),
    CONSTRAINT fk_leavereq_reviewer FOREIGN KEY (reviewer_id) REFERENCES organization_members(id) ON DELETE SET NULL,
    CONSTRAINT chk_duration_type CHECK (duration_type IN ('FULL_DAY', 'AM_HALF', 'PM_HALF')),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    CONSTRAINT chk_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_leavereq_org_date ON leave_requests(organization_id, start_date);
CREATE INDEX idx_leavereq_requester ON leave_requests(requester_id);
CREATE INDEX idx_leavereq_status ON leave_requests(organization_id, status);
CREATE INDEX idx_leavereq_org_status_date ON leave_requests(organization_id, status, start_date, end_date);
CREATE INDEX idx_leavereq_reviewer ON leave_requests(reviewer_id);
```

---

## 4. JPA Entity Design

### Organization.java

```java
@Entity
@Table(name = "organizations")
@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Organization {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }
}
```

### OrganizationMember.java

```java
@Entity
@Table(name = "organization_members",
       uniqueConstraints = @UniqueConstraint(columnNames = {"organization_id", "user_id"}))
@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
public class OrganizationMember {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrgRole role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private OrganizationDepartment department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_group_id")
    private OrganizationJobGroup jobGroup;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Enumerated(EnumType.STRING)
    @Column(name = "contract_type", length = 20)
    @Builder.Default
    private ContractType contractType = ContractType.FULL_TIME;

    @Enumerated(EnumType.STRING)
    @Column(name = "work_status", length = 20)
    @Builder.Default
    private WorkStatus workStatus = WorkStatus.ACTIVE;

    @Column(name = "employee_id", length = 50)
    private String employeeId;

    @Column(length = 30)
    private String phone;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    private User invitedBy;

    @Column(name = "display_order")
    private Integer displayOrder;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.joinedAt == null) this.joinedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isOwner() { return this.role == OrgRole.OWNER; }
    public boolean isAdmin() { return this.role == OrgRole.ADMIN; }
    public boolean isAdminOrAbove() { return this.role == OrgRole.OWNER || this.role == OrgRole.ADMIN; }
}
```

### LeaveRequest.java

```java
@Entity
@Table(name = "leave_requests")
@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
public class LeaveRequest {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_id")
    private OrganizationMember requester;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "policy_id", nullable = false)
    private LeavePolicy policy;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "duration_type", nullable = false, length = 20)
    @Builder.Default
    private LeaveDurationType durationType = LeaveDurationType.FULL_DAY;

    @Column(name = "total_days", nullable = false, precision = 4, scale = 1)
    private BigDecimal totalDays;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private LeaveStatus status = LeaveStatus.PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id")
    private OrganizationMember reviewer;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "review_comment", columnDefinition = "TEXT")
    private String reviewComment;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
    }

    public void approve(OrganizationMember reviewer) {
        this.status = LeaveStatus.APPROVED;
        this.reviewer = reviewer;
        this.reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void reject(OrganizationMember reviewer, String comment) {
        this.status = LeaveStatus.REJECTED;
        this.reviewer = reviewer;
        this.reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.reviewComment = comment;
    }

    public void cancel() {
        this.status = LeaveStatus.CANCELED;
    }
}
```

---

## 5. Key Constraints & Business Rules

| 규칙 | 설명 |
|------|------|
| 1 Board : 0..1 Org | 보드는 최대 1개 조직에만 소속 (`boards.organization_id` nullable) |
| 1 Org : 1 Owner | 조직에는 반드시 1명의 Owner 존재 |
| Unique(org_id, user_id) | 같은 조직에 중복 가입 불가 |
| Unique(member_id, policy_id, year) | 멤버별/정책별/연도별 잔여 고유 |
| end_date >= start_date | 휴가 종료일은 시작일 이후 |
| OWNER 변경 불가 | Admin이 Owner 역할 변경/제거 불가 |
| Invite code UNIQUE | 초대 코드 글로벌 고유 |
| Soft Delete | Organization은 deleted_at으로 소프트 삭제 (실제 DELETE 없음) |
| FK 전략 | Soft Delete이므로 ON DELETE CASCADE/SET NULL 사용 안 함. 조직 삭제 시 서비스 레이어에서 처리: 1) boards.org_id = NULL, 2) org_members/policies/balances/invites 비활성화 또는 함께 soft delete |
| 멤버 제거 연쇄 | organization_members 물리 삭제 시 leave_balances ON DELETE CASCADE로 함께 삭제. leave_requests/invite_links는 ON DELETE SET NULL로 기록 보존 |
| 조직 보드 타입 제약 | `CHECK (organization_id IS NULL OR board_type = 'TEAM')` — 조직 소속 보드는 반드시 TEAM 타입이어야 함 |
| R3 보드 Owner 보호 | 서비스 레이어에서 멤버 제거 전, 해당 멤버가 조직 보드의 Owner인지 사전 검증. Owner이면 제거 차단 |
| R3 PENDING 휴가 자동 취소 | 멤버 제거 시 해당 멤버의 PENDING 상태 leave_requests를 CANCELED로 자동 전환 |
| 조직 Owner 비활성화 차단 | 서비스 레이어에서 계정 비활성화 전, 소유 조직 존재 시 차단 (소유권 이양 필수) |
| R2 보드 초대 검증 | 기존 InviteService에서 보드 초대 수락 시, 조직 보드이면 조직원 여부 추가 검증 |
