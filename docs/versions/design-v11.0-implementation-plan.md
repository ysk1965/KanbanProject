# v11.0 Organization Subscription — 구현 절차서

> **Status**: Active
> **Date**: 2026-02-27
> **Based On**: design-v11.0-org-subscription.md
> **코드베이스 분석 기준**: 2026-02-27 (V81 마이그레이션, 현재 코드 기반)

---

## 현재 코드베이스 현황 요약

| 영역 | 현재 상태 | v11.0 변경 사항 |
|------|-----------|----------------|
| **Flyway** | V81 (최신) | V82~V84 추가 |
| **BoardTier** | TRIAL, STANDARD, PREMIUM | + `ORG_MANAGED` 추가 |
| **Board↔Org** | `organization_id` FK 존재, `setOrganization()`/`removeOrganization()` 이미 구현 | ORG_MANAGED 티어 연동 |
| **Subscription** | Board 1:1, seat-based ($5/seat) | + 마이그레이션 추적 필드 |
| **Organization** | subscription/trial 필드 없음 | + `trial_used`, `OrgSubscription` 1:1 관계 |
| **Toss Payments** | `confirmPayment()` 플로우 완성 | Org용 결제 플로우 복제 |
| **SchedulerSubscription** | Trial 만료(매시간) + 크레딧 리셋 | + Org Trial 만료 로직 |
| **Feature Access** | 9개 `canAccess*()` → `isEffectivelyPremium()` 위임 | ORG_MANAGED 분기 추가 (서비스 무변경) |
| **Frontend Org** | 44개 컴포넌트, 4개 Settings 서브탭 | + subscription 서브탭, 신규 컴포넌트 5개 |
| **Frontend Types** | Org에 subscription 타입 없음 | + `OrgSubscription`, `OrgPlan`, `MigrationPreview` |

---

## 의존성 그래프

```
Step 1 (DB Schema)
  ↓
Step 2 (Enums + Entities) ← Step 1 필수
  ↓
Step 3 (Repositories) ← Step 2 필수
  ↓
Step 4 (Core Service) ← Step 3 필수
  ├──→ Step 5 (Org Integration) ← Step 4 필수
  ├──→ Step 6 (API Layer) ← Step 4 필수
  └──→ Step 7 (Board Migration) ← Step 4 필수
         ↓
Step 8 (HR Access Control) ← Step 4 필수 (Step 5~7과 병렬 가능)
  ↓
Step 9 (Payment Integration) ← Step 6, 7 필수
  ↓
Step 10 (FE Types & API) ← Step 6 필수
  ↓
Step 11 (FE Components) ← Step 10 필수
  ↓
Step 12 (FE i18n & Polish) ← Step 11 필수
  ↓
Step 13 (Stabilization) ← 전체 완료 후
```

---

## Step 1: DB Schema (Flyway V82~V84)

**목표**: 신규 테이블 생성 + 기존 테이블 컬럼 추가
**테스트**: 마이그레이션 실행 성공, 기존 데이터 무손실

### V82: org_subscriptions + org_payment_history 테이블

**파일**: `backend/src/main/resources/db/migration/V82__create_org_subscriptions.sql`

```sql
-- 1. OrgSubscription 테이블
CREATE TABLE org_subscriptions (
    id              VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    plan            VARCHAR(20) NOT NULL DEFAULT 'FREE',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    billing_cycle   VARCHAR(10),
    seat_count          INT NOT NULL DEFAULT 0,
    active_member_count INT NOT NULL DEFAULT 0,
    price_per_seat      INT NOT NULL DEFAULT 0,
    total_price         INT NOT NULL DEFAULT 0,
    current_period_start TIMESTAMP,
    current_period_end   TIMESTAMP,
    next_payment_at      TIMESTAMP,
    payment_method_id    VARCHAR(100),
    trial_ends_at TIMESTAMP,
    board_limit INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    canceled_at TIMESTAMP
);

CREATE INDEX idx_org_sub_org_id ON org_subscriptions(organization_id);
CREATE INDEX idx_org_sub_status ON org_subscriptions(status);
CREATE INDEX idx_org_sub_next_payment ON org_subscriptions(next_payment_at);

-- 2. OrgPaymentHistory 테이블
CREATE TABLE org_payment_history (
    id                  VARCHAR(36) PRIMARY KEY,
    org_subscription_id VARCHAR(36) NOT NULL REFERENCES org_subscriptions(id),
    amount          INT NOT NULL,
    credit_applied  INT NOT NULL DEFAULT 0,
    billing_cycle   VARCHAR(10),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_type    VARCHAR(20) NOT NULL,
    pg_provider       VARCHAR(50),
    pg_transaction_id VARCHAR(100),
    period_start TIMESTAMP NOT NULL,
    period_end   TIMESTAMP NOT NULL,
    member_count INT NOT NULL,
    paid_at    TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_org_pay_sub_id ON org_payment_history(org_subscription_id);
CREATE INDEX idx_org_pay_status ON org_payment_history(status);

-- 3. 기존 Organization에 FREE 구독 자동 생성
INSERT INTO org_subscriptions (id, organization_id, plan, status, board_limit, created_at, updated_at)
SELECT gen_random_uuid()::VARCHAR, o.id, 'FREE', 'ACTIVE', 0, NOW(), NOW()
FROM organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM org_subscriptions os WHERE os.organization_id = o.id);
```

### V83: 기존 테이블 컬럼 추가

**파일**: `backend/src/main/resources/db/migration/V83__add_org_subscription_fields.sql`

```sql
-- 1. Organization에 trial_used 필드
ALTER TABLE organizations ADD COLUMN trial_used BOOLEAN DEFAULT FALSE;

-- 2. Subscription(기존 Board)에 마이그레이션 추적 필드
ALTER TABLE subscriptions ADD COLUMN migrated_to_org BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN migrated_to_org_id VARCHAR(36);
ALTER TABLE subscriptions ADD COLUMN migrated_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN billing_paused_for_org BOOLEAN DEFAULT FALSE;
```

### V84: BoardTier CHECK 제약조건 변경

**파일**: `backend/src/main/resources/db/migration/V84__add_org_managed_board_tier.sql`

```sql
-- boards.tier CHECK 제약조건에 ORG_MANAGED 추가
-- PostgreSQL: ALTER TABLE으로 CHECK 제약 교체
ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_tier_check;
ALTER TABLE boards ADD CONSTRAINT boards_tier_check
    CHECK (tier IN ('TRIAL', 'STANDARD', 'PREMIUM', 'ORG_MANAGED'));
```

**확인 포인트**:
- [ ] `./gradlew build` 성공 (마이그레이션 실행)
- [ ] 기존 Organization에 FREE OrgSubscription 자동 생성 확인
- [ ] 기존 Board 데이터 영향 없음

---

## Step 2: Enums + Entities

**목표**: 신규 Enum/Entity 생성 + 기존 Entity 변경
**테스트**: 컴파일 성공, JPA 매핑 정상

### 2-1. 신규 Enum (2개)

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgPlan.java`
```java
public enum OrgPlan { FREE, TEAM }
```

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgPaymentType.java`
```java
public enum OrgPaymentType { SUBSCRIPTION, MIGRATION }
```

### 2-2. 신규 Entity: OrgSubscription

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgSubscription.java`

핵심 메서드:
- `createFree(org)`, `createTrial(org)` — 팩토리
- `activateTeam(cycle, seats, paymentMethodId)` — Team 활성화
- `expireTrialToFree()` — Trial → Free 전환
- `canAccessPremiumBoardFeatures()` — Team only
- `canAccessHrFeatures()` — Team or Trial
- `canReadHrData()` — 모든 플랜
- `canCreateOrgBoard()` — Team only
- `updateSeatCount(newCount)` — seat 조정

> 전체 구현: design-v11.0-org-subscription.md § 4.1 참조

### 2-3. 신규 Entity: OrgPaymentHistory

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgPaymentHistory.java`

> 기존 PaymentHistory 패턴 복제 + `creditApplied`, `paymentType` 추가

### 2-4. 기존 Entity 변경: BoardTier

**파일**: `backend/src/main/java/com/kanban/domain/board/BoardTier.java`

```java
// 변경 전
public enum BoardTier { TRIAL, STANDARD, PREMIUM }

// 변경 후
public enum BoardTier { TRIAL, STANDARD, PREMIUM, ORG_MANAGED }
```

### 2-5. 기존 Entity 변경: Board

**파일**: `backend/src/main/java/com/kanban/domain/board/Board.java`

변경 메서드:
```java
// isEffectivelyPremium() 수정 — ORG_MANAGED 분기 추가
public boolean isEffectivelyPremium() {
    if (tier == BoardTier.ORG_MANAGED) return true;  // ← 추가
    if (tier == BoardTier.PREMIUM) return true;
    if (tier == BoardTier.TRIAL) {
        return trialEndsAt != null && LocalDateTime.now(ZoneOffset.UTC).isBefore(trialEndsAt);
    }
    return false;
}

// 신규 메서드
public boolean isOrgManaged() {
    return tier == BoardTier.ORG_MANAGED && organization != null;
}
```

> **핵심**: 이 한 줄 추가로 기존 9개 canAccess 메서드 + 8개 서비스의 validateXxxAccess() 전부 자동 적용

### 2-6. 기존 Entity 변경: Organization

**파일**: `backend/src/main/java/com/kanban/domain/organization/Organization.java`

추가 필드/메서드:
```java
@OneToOne(mappedBy = "organization", fetch = LAZY)
private OrgSubscription subscription;

private boolean trialUsed;

public boolean hasActiveSubscription() { ... }
public OrgPlan getCurrentPlan() { ... }
public boolean isTrialAvailable() { return !trialUsed; }
```

### 2-7. 기존 Entity 변경: Subscription (Board용)

**파일**: `backend/src/main/java/com/kanban/domain/subscription/Subscription.java`

추가 필드/메서드:
```java
private boolean migratedToOrg;
private String migratedToOrgId;
private LocalDateTime migratedAt;
private boolean billingPausedForOrg;

public void markMigratedToOrg(String orgId) { ... }
public void restoreFromOrg() { ... }
```

### 2-8. ErrorCode 추가

**파일**: `backend/src/main/java/com/kanban/global/exception/ErrorCode.java`

```java
// Org Subscription
ORG_SUBSCRIPTION_NOT_FOUND(HttpStatus.NOT_FOUND, "OS001", "Org subscription not found"),
ORG_TEAM_REQUIRED(HttpStatus.FORBIDDEN, "OS002", "Team plan required"),
ORG_SEAT_LIMIT_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "OS003", "Org seat limit exceeded"),
ORG_BOARD_REQUIRES_TEAM(HttpStatus.FORBIDDEN, "OS004", "Org board requires Team plan"),
HR_FEATURE_REQUIRES_TEAM(HttpStatus.FORBIDDEN, "OS005", "HR feature requires Team plan"),
ORG_TRIAL_ALREADY_USED(HttpStatus.CONFLICT, "OS006", "HR trial already used"),
```

**확인 포인트**:
- [ ] `./gradlew build` 컴파일 성공
- [ ] 기존 isEffectivelyPremium() 기반 코드 전부 정상 동작

---

## Step 3: Repositories

**목표**: 신규 Repository 생성
**테스트**: 기본 CRUD 동작

### 3-1. OrgSubscriptionRepository

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgSubscriptionRepository.java`

```java
public interface OrgSubscriptionRepository extends JpaRepository<OrgSubscription, String> {
    Optional<OrgSubscription> findByOrganizationId(String organizationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT os FROM OrgSubscription os WHERE os.organization.id = :orgId")
    Optional<OrgSubscription> findByOrganizationIdForUpdate(@Param("orgId") String orgId);

    List<OrgSubscription> findByStatusAndTrialEndsAtBefore(
        SubscriptionStatus status, LocalDateTime now);

    List<OrgSubscription> findByStatusAndNextPaymentAtBefore(
        SubscriptionStatus status, LocalDateTime now);
}
```

### 3-2. OrgPaymentHistoryRepository

**파일**: `backend/src/main/java/com/kanban/domain/subscription/OrgPaymentHistoryRepository.java`

```java
public interface OrgPaymentHistoryRepository extends JpaRepository<OrgPaymentHistory, String> {
    List<OrgPaymentHistory> findByOrgSubscriptionIdOrderByCreatedAtDesc(String subId);
}
```

**확인 포인트**:
- [ ] `./gradlew build` 성공

---

## Step 4: Core Service — OrgSubscriptionService

**목표**: Org 구독 핵심 비즈니스 로직
**테스트**: 각 메서드 단위 동작 확인
**의존**: Step 3

**파일**: `backend/src/main/java/com/kanban/domain/subscription/service/OrgSubscriptionService.java`

### 핵심 메서드 목록

| 메서드 | 용도 | 우선순위 |
|--------|------|---------|
| `getSubscription(orgId)` | 구독 조회 | P0 |
| `createTrialForOrg(org)` | Org 생성 시 Trial 자동 부여 | P0 |
| `activateTeam(orgId, cycle, seats, paymentMethodId)` | Team 플랜 활성화 | P0 |
| `expireTrials()` | 만료 Trial → Free 전환 (스케줄러) | P0 |
| `cancel(orgId)` | Team 취소 → Board STANDARD 복원 | P0 |
| `downgradeToFree(orgId)` | Team → Free 다운그레이드 | P1 |
| `canAccessHrFeatures(orgId)` | HR 쓰기 접근 체크 | P1 |
| `canReadHrData(orgId)` | HR 읽기 접근 체크 | P1 |
| `canCreateOrgBoard(orgId)` | Org Board 생성 가능 여부 | P1 |
| `canInviteMember(orgId)` | seat 여유분 체크 | P1 |
| `purchaseAdditionalSeats(orgId, count)` | 추가 seat 구매 | P2 |
| `previewMigration(orgId, cycle, boardIds)` | 마이그레이션 미리보기 | P2 |
| `migrateFromBoardSubscriptions(orgId, cycle, boardIds, paymentMethodId)` | 실제 마이그레이션 | P2 |

> 전체 구현: design-v11.0-org-subscription.md § 5.1 참조

**확인 포인트**:
- [ ] `activateTeam()` → OrgSubscription plan=TEAM, boardLimit=MAX
- [ ] `expireTrials()` → TRIAL → FREE 전환, HR 데이터 보존
- [ ] `cancel()` → 소속 Board 전부 STANDARD로 복원

---

## Step 5: Organization Integration

**목표**: Org 생성 플로우에 Trial 자동 부여 연동
**테스트**: Org 생성 → OrgSubscription(TRIAL) 자동 생성 확인
**의존**: Step 4

### 5-1. OrganizationService 변경

**파일**: `backend/src/main/java/com/kanban/domain/organization/service/OrganizationService.java`

변경 지점: `createOrganization()` 메서드
```java
// 기존 코드 끝에 추가
OrgSubscription trial = OrgSubscription.createTrial(organization);
orgSubscriptionRepository.save(trial);
organization.setTrialUsed(true);
```

### 5-2. OrganizationFacadeService 변경

**파일**: `backend/src/main/java/com/kanban/domain/organization/service/OrganizationFacadeService.java`

변경 지점: `addBoardToOrg()`, `createBoardForOrg()` 메서드
```java
// Board 편입/생성 시 Team 플랜 체크 추가
if (!orgSubscriptionService.canCreateOrgBoard(orgId)) {
    throw new BusinessException(ErrorCode.ORG_BOARD_REQUIRES_TEAM);
}
// 편입 시 board.setTier(BoardTier.ORG_MANAGED) 추가
```

변경 지점: `removeBoardFromOrg()` 메서드
```java
// Board 분리 시 tier 복원
board.setTier(BoardTier.STANDARD);
```

### 5-3. OrgSubscriptionScheduler 추가 (또는 기존 SubscriptionScheduler 확장)

**파일**: `backend/src/main/java/com/kanban/global/scheduler/SubscriptionScheduler.java`

기존 스케줄러에 메서드 추가:
```java
@Scheduled(cron = "0 15 * * * *")  // 매시간 15분
public void expireOrgTrials() {
    orgSubscriptionService.expireTrials();
}
```

### 5-4. OrganizationResponse DTO 변경

**파일**: `backend/src/main/java/com/kanban/domain/organization/dto/OrganizationResponse.java`

Simple/Detail에 추가:
```java
private String currentPlan;           // "FREE" | "TEAM"
private String subscriptionStatus;    // "TRIAL" | "ACTIVE" | ...
private String trialEndsAt;           // Trial 만료일 (nullable)
private boolean canCreateOrgBoard;    // Team only
private boolean canAccessHrFeatures;  // Team or Trial
```

**확인 포인트**:
- [ ] Org 생성 → OrgSubscription(TRIAL, 7일) 자동 생성
- [ ] Trial Org에서 Board 편입 시도 → `ORG_BOARD_REQUIRES_TEAM` 에러
- [ ] 스케줄러 동작 → 만료 Trial → Free 전환
- [ ] OrganizationResponse에 플랜 정보 포함

---

## Step 6: API Layer

**목표**: Org 구독 REST API 엔드포인트
**테스트**: API 호출 → 정상 응답
**의존**: Step 4

### 6-1. OrgSubscriptionController

**파일**: `backend/src/main/java/com/kanban/domain/subscription/controller/OrgSubscriptionController.java`

| Endpoint | Method | 용도 |
|----------|--------|------|
| `/api/v1/organizations/{orgId}/subscription` | GET | 구독 조회 |
| `/api/v1/organizations/{orgId}/subscription/activate` | POST | Team 활성화 |
| `/api/v1/organizations/{orgId}/subscription/migrate/preview` | POST | 마이그레이션 미리보기 |
| `/api/v1/organizations/{orgId}/subscription/migrate` | POST | 마이그레이션 실행 |
| `/api/v1/organizations/{orgId}/subscription/downgrade` | POST | Team → Free |
| `/api/v1/organizations/{orgId}/subscription` | DELETE | 취소 |
| `/api/v1/organizations/{orgId}/subscription/payments` | GET | 결제 내역 |
| `/api/v1/payments/confirm/org-subscription` | POST | Toss 결제 확인 |

### 6-2. Response DTO

**파일**: `backend/src/main/java/com/kanban/domain/subscription/dto/OrgSubscriptionResponse.java`

```java
public record OrgSubscriptionResponse(
    String id, String organization_id,
    String plan, String status, String billing_cycle,
    int seat_count, int active_member_count,
    int price_per_seat, int total_price,
    String current_period_start, String current_period_end,
    String next_payment_at, String trial_ends_at,
    int board_limit, int board_count, int member_limit,
    boolean can_access_premium_board_features,
    boolean can_access_hr_features,
    boolean can_read_hr_data,
    boolean can_create_org_board,
    boolean trial_used
) {}
```

**파일**: `backend/src/main/java/com/kanban/domain/subscription/dto/MigrationPreviewResponse.java`

```java
public record MigrationPreviewResponse(
    int current_total_monthly, int new_monthly,
    int credit_from_existing, int first_payment,
    int unique_members
) {}
```

**확인 포인트**:
- [ ] `GET /organizations/{orgId}/subscription` → OrgSubscriptionResponse 반환
- [ ] `POST .../activate` → Team 활성화 성공
- [ ] `POST .../migrate/preview` → 비용 계산 정확

---

## Step 7: Board Migration Service

**목표**: Board 개별 구독 → Org 통합 구독 전환 로직
**테스트**: 마이그레이션 시뮬레이션 정확, 실제 전환 정상
**의존**: Step 4

### 핵심 로직 (OrgSubscriptionService에 추가)

#### 7-1. previewMigration()

```
Input: orgId, billingCycle, List<boardId>
Process:
  1. 고유 멤버 수 계산 (boardMemberRepository, Set으로 중복 제거)
  2. 기존 Board 구독 총 월액 계산
  3. 잔여 크레딧 일할 계산 (remainingDays / totalDays × price)
  4. 신규 Org 가격 = uniqueMembers × pricePerSeat
  5. 첫 결제 = max(0, newPrice - totalCredit)
Output: MigrationPreview
```

#### 7-2. migrateFromBoardSubscriptions()

```
Input: orgId, billingCycle, List<boardId>, paymentMethodId
Process:
  1. previewMigration() 호출
  2. activateTeam() → Org Team 구독 생성
  3. 각 Board:
     a. board.setTier(ORG_MANAGED)
     b. subscription.markMigratedToOrg(orgId)
     c. Board 멤버에게 전환 알림
  4. OrgPaymentHistory 기록 (MIGRATION 타입)
Output: MigrationResult
```

#### 7-3. SubscriptionScheduler 변경

```java
// 기존 결제 갱신 로직에서 billingPausedForOrg 체크 추가
if (subscription.isBillingPausedForOrg()) {
    continue; // 개별 결제 스킵 (Org에서 대납)
}
```

**확인 포인트**:
- [ ] 3개 Board (10+8+5 seats) → 고유 멤버 12명 정확 계산
- [ ] 크레딧 일할 계산 정확
- [ ] 마이그레이션 후 Board.tier = ORG_MANAGED
- [ ] Board Subscription status = ACTIVE 유지 (AI 크레딧)
- [ ] Board Subscription billingPausedForOrg = true

---

## Step 8: HR Feature Access Control

**목표**: HR 서비스에 읽기/쓰기 분리 적용
**테스트**: Free에서 HR 쓰기 차단, 읽기 허용
**의존**: Step 4 (Step 5~7과 병렬 가능)

### 변경 대상 서비스 (6개)

| 서비스 | 파일 | 변경 내용 |
|--------|------|----------|
| **OrgAttendanceService** | `organization/service/OrgAttendanceService.java` | 출퇴근 기록 쓰기에 `canAccessHrFeatures` 체크 |
| **LeaveService** | `organization/leave/service/LeaveService.java` | 휴가 신청/승인에 `canAccessHrFeatures` 체크 |
| (향후) OnboardingService | — | 온보딩 쓰기에 체크 추가 |
| (향후) OneOnOneService | — | 1:1 미팅 생성에 체크 추가 |
| (향후) OrgInsightService | — | 인사이트 생성에 체크 추가 |
| (향후) AnniversaryService | — | 기념일 등록에 체크 추가 |

### 변경 패턴

```java
// 쓰기 작업 (생성/수정/삭제)에 추가
if (!orgSubscriptionService.canAccessHrFeatures(orgId)) {
    throw new BusinessException(ErrorCode.HR_FEATURE_REQUIRES_TEAM);
}

// 읽기 작업은 제한 없음 (canReadHrData = 항상 true)
```

> **참고**: 현재 구현된 HR 서비스는 OrgAttendanceService, LeaveService 2개.
> 나머지 4개(Onboarding, OneOnOne, Insight, Anniversary)는 향후 구현 시 동일 패턴 적용.

**확인 포인트**:
- [ ] Trial Org → HR 쓰기 가능
- [ ] Free Org → HR 쓰기 차단 (`HR_FEATURE_REQUIRES_TEAM`)
- [ ] Free Org → HR 읽기 정상
- [ ] Team Org → HR 쓰기/읽기 모두 정상

---

## Step 9: Payment Integration

**목표**: Toss Payments Org 구독 결제 플로우
**테스트**: 결제 → 구독 활성화 → 기록
**의존**: Step 6, 7

### 9-1. 결제 확인 플로우 (기존 패턴 복제)

**파일**: `backend/src/main/java/com/kanban/domain/subscription/service/OrgSubscriptionService.java`

```java
public OrgSubscription confirmAndActivateTeam(String userId, OrgPaymentConfirmRequest request) {
    // 1. 금액 검증
    int expectedAmount = request.seatCount() * pricePerSeat(request.billingCycle());
    if (expectedAmount != request.amount()) {
        throw new BusinessException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
    }

    // 2. Toss 결제 확인
    tossPaymentsService.confirmPayment(
        request.paymentKey(), request.orderId(), request.amount());

    // 3. 구독 활성화
    OrgSubscription sub = activateTeam(request.orgId(), ...);

    // 4. 결제 기록
    OrgPaymentHistory.create(sub, request.amount(), OrgPaymentType.SUBSCRIPTION);

    return sub;
}
```

### 9-2. Seat 추가 구매 (일할 계산)

```java
public OrgSubscription confirmAndPurchaseSeats(String userId, OrgSeatPurchaseRequest request) {
    // 1. 일할 계산
    int proratedAmount = calculateProratedAmount(sub, additionalCost);
    // 2. Toss 확인
    // 3. seat 업데이트
    // 4. 결제 기록
}
```

### 9-3. 결제 실패 스케줄러

**파일**: `backend/src/main/java/com/kanban/global/scheduler/SubscriptionScheduler.java`

```java
@Scheduled(cron = "0 30 * * * *")
public void handleOrgPaymentFailures() {
    // Day 0: 실패 → PAST_DUE + 알림
    // Day 3: 재시도 → 실패 시 SUSPENDED
    // Day 14: CANCELED → Free 다운그레이드
}
```

**확인 포인트**:
- [ ] Toss 결제 확인 → Team 활성화
- [ ] 금액 불일치 → `PAYMENT_AMOUNT_MISMATCH` 에러
- [ ] 결제 실패 → SUSPENDED → CANCELED 플로우

---

## Step 10: Frontend — Types & API

**목표**: TypeScript 타입 정의 + API 클라이언트
**테스트**: 타입 컴파일 성공, API 호출 정상
**의존**: Step 6 (백엔드 API 완성)

### 10-1. 타입 정의

**파일**: `frontend/src/app/types/index.ts`

```typescript
// 추가
export type OrgPlan = 'FREE' | 'TEAM';

export interface OrgSubscription {
    id: string;
    organization_id: string;
    plan: OrgPlan;
    status: string;
    billing_cycle: string | null;
    seat_count: number;
    active_member_count: number;
    price_per_seat: number;
    total_price: number;
    current_period_start: string | null;
    current_period_end: string | null;
    next_payment_at: string | null;
    trial_ends_at: string | null;
    board_limit: number;
    board_count: number;
    member_limit: number;
    can_access_premium_board_features: boolean;
    can_access_hr_features: boolean;
    can_read_hr_data: boolean;
    can_create_org_board: boolean;
    trial_used: boolean;
}

export interface MigrationPreview {
    current_total_monthly: number;
    new_monthly: number;
    credit_from_existing: number;
    first_payment: number;
    unique_members: number;
}

// OrganizationSimple 확장
// + current_plan: OrgPlan
// + subscription_status: string
// + trial_ends_at: string | null
```

### 10-2. API 클라이언트

**파일**: `frontend/src/app/utils/api.ts`

```typescript
export const orgSubscriptionAPI = {
    get: (orgId: string) =>
        apiClient.get<OrgSubscription>(`/organizations/${orgId}/subscription`),
    activate: (orgId: string, data: { billing_cycle: string; seat_count: number }) =>
        apiClient.post<OrgSubscription>(`/organizations/${orgId}/subscription/activate`, data),
    migratePreview: (orgId: string, data: { billing_cycle: string; board_ids: string[] }) =>
        apiClient.post<MigrationPreview>(`/organizations/${orgId}/subscription/migrate/preview`, data),
    migrate: (orgId: string, data: { billing_cycle: string; board_ids: string[] }) =>
        apiClient.post<OrgSubscription>(`/organizations/${orgId}/subscription/migrate`, data),
    downgrade: (orgId: string) =>
        apiClient.post(`/organizations/${orgId}/subscription/downgrade`),
    cancel: (orgId: string) =>
        apiClient.delete(`/organizations/${orgId}/subscription`),
    getPayments: (orgId: string) =>
        apiClient.get(`/organizations/${orgId}/subscription/payments`),
    confirmPayment: (data: { payment_key: string; order_id: string; amount: number }) =>
        apiClient.post('/payments/confirm/org-subscription', data),
};
```

### 10-3. 서비스 레이어

**파일**: `frontend/src/app/utils/services.ts`

```typescript
// organizationService에 추가
subscription: orgSubscriptionAPI,
```

**확인 포인트**:
- [ ] `npm run build` 타입 에러 없음
- [ ] API 호출 → 백엔드 응답 정상 수신

---

## Step 11: Frontend — Components

**목표**: Org 구독 관련 UI 컴포넌트
**테스트**: 화면 렌더링 정상, 사용자 플로우 동작
**의존**: Step 10

### 11-1. 신규 컴포넌트 (4개)

| 컴포넌트 | 파일 경로 | 용도 |
|----------|----------|------|
| **OrgSubscriptionBadge** | `components/organization/subscription/OrgSubscriptionBadge.tsx` | 현재 플랜 뱃지 (Free/Team/HR Trial) |
| **OrgPlanSelector** | `components/organization/subscription/OrgPlanSelector.tsx` | Free vs Team 비교 카드 |
| **OrgMigrationWizard** | `components/organization/subscription/OrgMigrationWizard.tsx` | Board→Org 전환 3단계 위자드 |
| **OrgBillingSection** | `components/organization/subscription/OrgBillingSection.tsx` | 결제 정보, 내역, Seat 관리 |

### 11-2. 기존 컴포넌트 변경 (4개)

| 컴포넌트 | 변경 내용 |
|----------|----------|
| **OrgSettingsTab** | "subscription" 서브탭 추가 → OrgBillingSection 렌더 |
| **OrgDashboardTab** | OrgSubscriptionBadge 표시 |
| **Sidebar** | Org 플랜 표시 (Free/Team) |
| **OrgBoardsTab** | Board 생성/편입 시 Team 체크, ORG_MANAGED 뱃지 |

### 11-3. HR 읽기전용 UI

Trial/Free Org에서 HR 기능 접근 시:
```tsx
// HR 쓰기 작업 버튼에 조건부 렌더링
{orgSubscription?.can_access_hr_features ? (
    <Button onClick={handleCreate}>생성</Button>
) : (
    <div className="text-sm text-slate-500">
        Team 플랜에서 사용할 수 있습니다
        <Button onClick={handleUpgrade}>업그레이드</Button>
    </div>
)}
```

**확인 포인트**:
- [ ] OrgSettingsTab → subscription 서브탭 정상 표시
- [ ] Free Org → "Team 업그레이드" CTA 표시
- [ ] Team Org → 결제 정보, seat 관리 표시
- [ ] Board→Org 마이그레이션 위자드 3단계 동작

---

## Step 12: Frontend — i18n & Polish

**목표**: 다국어 지원 + 전환 유도 UI
**테스트**: 각 언어 전환 시 정상 표시
**의존**: Step 11

### 12-1. i18n 키 추가 (10개 언어)

**대상 파일**: `frontend/src/app/i18n/locales/{ko,en,ja,zh,zh-TW,vi,th,es,pt-BR,hi}.json`

```json
"orgSubscription": {
    "title": "구독 & 결제",
    "currentPlan": "현재 플랜",
    "free": "Free",
    "team": "Team",
    "hrTrial": "HR 체험판",
    "trialEndsAt": "체험판 만료",
    "daysLeft": "{days}일 남음",
    "seatsUsed": "{used}/{total} seats 사용 중",
    "upgrade": "Team으로 업그레이드",
    "downgrade": "Free로 다운그레이드",
    "cancel": "구독 취소",
    "billingHistory": "결제 내역",
    "migrationWizard": "구독 통합",
    "boardSelection": "Board 선택",
    "costComparison": "비용 비교",
    "currentCost": "현재 비용",
    "newCost": "전환 후 비용",
    "credit": "크레딧",
    "firstPayment": "첫 결제",
    "hrFeatureRequiresTeam": "이 기능은 Team 플랜에서 사용할 수 있습니다",
    "orgBoardRequiresTeam": "Board를 조직에 연결하려면 Team 플랜이 필요합니다",
    "conversionBanner": "보드 3개 이상이면 Org가 더 저렴합니다"
}
```

### 12-2. 전환 유도 배너

- Board 3개+ 보유 시 대시보드에 "Org로 전환하면 저렴합니다" 배너
- Board Premium 결제 화면에서 Org Team 비교 안내
- HR Trial 만료 후 잠긴 HR 기능 → "Team 플랜에서 사용 가능" CTA

**확인 포인트**:
- [ ] 10개 언어 전환 시 키 누락 없음
- [ ] 전환 배너 조건부 표시 정상

---

## Step 13: Stabilization

**목표**: 엣지 케이스 처리, 알림, 관리자 도구
**테스트**: E2E 시나리오 전체 통과
**의존**: Step 1~12 전체

### 13-1. 알림

| 이벤트 | 알림 대상 | 내용 |
|--------|----------|------|
| HR Trial D-3 | Org Owner | "HR 체험판 3일 남았습니다" |
| HR Trial D-1 | Org Owner | "내일 HR 체험판이 만료됩니다. 쌓인 데이터: N건" |
| HR Trial D-0 | Org Owner | "HR 체험판이 만료되었습니다. 데이터는 보존됩니다" |
| Board→Org 전환 | Board 멤버 전원 | "Board가 [조직명] 소속으로 전환되었습니다" |
| 결제 실패 | Org Owner | "결제 수단을 확인해주세요" |
| SUSPENDED | Org Owner | "읽기 전용 모드로 전환되었습니다" |

### 13-2. Admin 대시보드

**파일**: `backend/src/main/java/com/kanban/domain/admin/AdminService.java`

추가 기능:
- Org 구독 현황 조회 (전체/플랜별 통계)
- Org 구독 수동 조정 (seat, 플랜, Trial 연장)

### 13-3. E2E 테스트 시나리오

| # | 시나리오 | 검증 |
|---|---------|------|
| 1 | Org 생성 → Trial → Free 전환 | Trial 7일 → Free, HR 읽기전용 |
| 2 | Free → Team 결제 | 결제 → Board 편입 가능 |
| 3 | Board 3개 마이그레이션 | 고유 멤버 계산, 크레딧, ORG_MANAGED |
| 4 | Team 취소 | Board → STANDARD, HR 읽기전용 |
| 5 | 결제 실패 → SUSPENDED → CANCELED | 14일 후 자동 다운그레이드 |
| 6 | ORG_MANAGED Board 외부인 초대 | 차단 + Org 초대 안내 |
| 7 | 1인 1조직 + 외부인 초대 충돌 | 에러 메시지 표시 |

---

## 실행 일정 (예상)

| Step | 내용 | 예상 소요 | 병렬 가능 |
|------|------|----------|----------|
| 1 | DB Schema (V82~V84) | 0.5일 | — |
| 2 | Enums + Entities | 1일 | — |
| 3 | Repositories | 0.5일 | — |
| 4 | Core Service | 2일 | — |
| 5 | Org Integration | 1일 | Step 6, 7, 8과 병렬 |
| 6 | API Layer | 1일 | Step 5, 7, 8과 병렬 |
| 7 | Board Migration | 1.5일 | Step 5, 6, 8과 병렬 |
| 8 | HR Access Control | 1일 | Step 5, 6, 7과 병렬 |
| 9 | Payment Integration | 1.5일 | — |
| 10 | FE Types & API | 0.5일 | — |
| 11 | FE Components | 2일 | — |
| 12 | FE i18n & Polish | 1일 | — |
| 13 | Stabilization | 2일 | — |
| **합계** | | **~15일** (병렬 시 ~11일) | |

---

## 리스크 체크리스트

| 리스크 | 영향 | 완화 |
|--------|------|------|
| V84 CHECK 제약 변경 실패 | 높음 | 로컬 H2에서는 CHECK 미적용, PostgreSQL에서 테스트 필수 |
| isEffectivelyPremium() 변경 부작용 | 높음 | 기존 9개 canAccess + 8개 서비스 전수 확인 |
| Board Subscription ACTIVE 유지 + billingPaused | 중간 | SubscriptionScheduler에서 billingPaused 체크 누락 방지 |
| AI 크레딧 ORG_MANAGED Board에서 소비 | 중간 | Subscription ACTIVE 유지 확인 (consumeCredits 정상 동작) |
| 마이그레이션 크레딧 계산 오류 | 높음 | previewMigration API로 사전 검증 필수 |
| 1인 1조직 + Org 초대 충돌 | 낮음 | 기존 `ALREADY_IN_ORGANIZATION` 에러 활용 |
| TierInfo DTO에 ORG_MANAGED 미반영 | 낮음 | BoardResponse.TierInfo에 ORG_MANAGED 추가 |
