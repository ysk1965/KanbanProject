# Monetization ON/OFF Toggle 기획서 (최종)

> **작성일**: 2026-03-13
> **최종 수정**: 2026-03-13
> **목표**: Admin 시스템 설정에서 수익화를 ON/OFF할 수 있는 토글 추가. OFF 시 모든 결제/구독 UI가 숨겨지고, 새 보드/조직이 최상위 플랜으로 생성됨.

---

## 0. 확정된 정책

| 항목 | 결정 |
|------|------|
| ON 재전환 시 기존 보드 | **(A) PREMIUM 유지** — 신규 보드만 TRIAL로 생성 |
| AI 크레딧 OFF 시 | **(A) 차감 스킵** — 사용량 추적 안 함 (심플) |
| Admin 구독 탭 OFF 시 | **(A) 완전 숨김** — 탭 자체 안 보임 |
| 공개 API 보안 | **(A) 비인증 공개** — 로그인 전에도 상태 조회 가능 |
| 기본값 | **(B) ON** — 배포 후 Admin에서 수동으로 OFF 전환 |
| Checkout API 방어 | **FE UI만 숨김** — 백엔드 API 그대로 유지 (심플) |
| Polar 웹훅 처리 | **그대로 처리** — FE 결제 경로 차단으로 충분 |

---

## 1. 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **단일 플래그** | `SystemConfig` 테이블의 `MONETIZATION_ENABLED` 키 하나로 전체 제어 |
| **기존 코드 최소 침습** | 기존 로직을 삭제/변경하지 않고, 분기 조건만 추가 |
| **즉시 복원 가능** | ON으로 전환하면 모든 결제 시스템이 즉시 복원 |
| **기존 데이터 보존** | OFF 전환 시 기존 구독 데이터를 삭제하지 않음 (향후 ON 시 활용) |
| **FE 차단 중심** | Checkout/Polar 등 결제 API는 그대로 두고, FE 진입점만 차단 |

---

## 2. Backend 변경

### 2.1 MonetizationService (신규)

**파일**: `backend/src/main/java/com/kanban/domain/system/MonetizationService.java`

```java
@Service
@RequiredArgsConstructor
public class MonetizationService {
    private final SystemConfigRepository systemConfigRepository;

    private static final String KEY = "MONETIZATION_ENABLED";
    private static final boolean DEFAULT_VALUE = true; // 기본값: ON

    public boolean isMonetizationEnabled() {
        return systemConfigRepository.findById(KEY)
            .map(c -> Boolean.parseBoolean(c.getValue()))
            .orElse(DEFAULT_VALUE);
    }

    @Transactional
    public void setMonetizationEnabled(boolean enabled) {
        SystemConfig config = systemConfigRepository.findById(KEY)
            .orElseGet(() -> SystemConfig.builder()
                .key(KEY)
                .value(String.valueOf(enabled))
                .build());
        config.updateValue(String.valueOf(enabled));
        systemConfigRepository.save(config);

        if (!enabled) {
            upgradeAllExistingEntities();
        }
    }
}
```

**참고**: `SystemConfig`는 `@Id`가 `key` 필드, `findById()` 사용. `SystemConfig.builder()` 로 생성.

---

### 2.2 Board 생성 분기

**파일**: `BoardService.java` → `createBoard()` (line ~125)

```
현재: skipBilling(TESTER) → PREMIUM, 나머지 → TRIAL
변경: monetization OFF → PREMIUM + ACTIVE 구독 (크레딧 초기화 포함)
```

```java
// 변경 후 흐름
boolean skipBilling = user.getSystemRole() == SystemRole.TESTER
    || !monetizationService.isMonetizationEnabled();  // ← 이 조건만 추가

Board board = Board.builder()
    .tier(skipBilling ? BoardTier.PREMIUM : BoardTier.TRIAL)
    .build();
boardRepository.save(board);

Subscription subscription = skipBilling
    ? Subscription.createPremium(board)
    : Subscription.createTrial(board);
subscriptionRepository.save(subscription);
```

**핵심**: 기존 `skipBilling` 분기에 monetization 조건만 합산. 코드 변경 1줄.

> **주의**: `Subscription.createPremium()`은 `monthlyAiCredits`를 초기화하지 않음 (기본 0).
> 하지만 크레딧 소비 자체를 바이패스하므로 (2.4 참조) 문제 없음.

---

### 2.3 Organization 생성 분기

**파일**: `OrganizationService.java` → `createOrganization()` (line ~77)

```java
// 변경 후 흐름
if (!monetizationService.isMonetizationEnabled()) {
    OrgSubscription sub = OrgSubscription.createActive(org); // 신규 팩토리 메서드
    orgSubscriptionRepository.save(sub);
} else {
    OrgSubscription sub = OrgSubscription.createTrial(org);
    orgSubscriptionRepository.save(sub);
    org.markTrialUsed();
}
```

**OrgSubscription에 팩토리 메서드 추가**:
```java
public static OrgSubscription createActive(Organization org) {
    OrgSubscription sub = new OrgSubscription();
    sub.organization = org;
    sub.plan = OrgPlan.TEAM;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.boardLimit = Integer.MAX_VALUE;
    sub.initializeCredits(ORG_MONTHLY_CREDITS);
    return sub;
}
```

---

### 2.4 AI 크레딧 바이패스 (3개 메서드 전부)

**파일**: `AiCreditService.java`

크레딧 소비 메서드가 **3개** 존재. 전부 바이패스:

```java
// 1. 보드 크레딧 (line 44)
public void consumeCredit(String boardId, String userId, String featureType, int creditCost) {
    if (!monetizationService.isMonetizationEnabled()) return; // ← 추가
    // 기존 로직...
}

// 2. 조직 크레딧 (line 73)
public void consumeOrgCredit(String orgId, String boardId, String userId, String featureType, int creditCost) {
    if (!monetizationService.isMonetizationEnabled()) return; // ← 추가
    // 기존 로직...
}

// 3. 개인(유저) 크레딧 (line 114)
public void consumeUserCredit(String userId, String featureType, int creditCost) {
    if (!monetizationService.isMonetizationEnabled()) return; // ← 추가
    // 기존 로직...
}
```

---

### 2.5 스케줄러 바이패스 (7개 전부)

**파일**: `SubscriptionScheduler.java`

모든 구독 관련 스케줄러에 early return 추가:

| 메서드 | 주기 | 이유 |
|--------|------|------|
| `expireTrials()` | 매시 :00 | Trial→STANDARD 다운그레이드 방지 |
| `expireOrgTrials()` | 매시 :15 | Org Trial→FREE 다운그레이드 방지 |
| `processCancellationRequests()` | 매시 :20 | 취소 요청 처리 방지 |
| `escalatePastDueSubscriptions()` | 매시 :25 | 미결제 에스컬레이션 방지 |
| `resetMonthlyAiCredits()` | 매시 :05 | 크레딧 리셋 불필요 (소비 안 함) |
| `resetOrgMonthlyAiCredits()` | 매시 :08 | Org 크레딧 리셋 불필요 |
| `resetUserPersonalAiCredits()` | 매시 :10 | 개인 크레딧 리셋 불필요 |

```java
@Scheduled(cron = "...")
public void expireTrials() {
    if (!monetizationService.isMonetizationEnabled()) return;
    // 기존 로직...
}
// 나머지 6개도 동일 패턴
```

---

### 2.6 Premium 기능 게이팅 — BoardPermissionChecker 불필요

**기존 계획에서 삭제**: `BoardPermissionChecker` 래퍼는 만들지 않음.

**이유**: 보드가 PREMIUM tier로 생성/업그레이드되면, `Board.isEffectivelyPremium()` → `true` → 모든 `canAccess*()` 자동 통과.

백엔드 18개 권한 체크 지점 (ScheduleService, MilestoneService, StatisticsService 등)이 **코드 변경 없이** 자동으로 통과됨.
WebSocket 인터셉터의 STANDARD 차단도 PREMIUM이면 자동 해제.

**TierInfo DTO만 보강** (기존 보드가 아직 STANDARD인 과도기 대응):

**파일**: `BoardResponse.java`

```java
// TierInfo에 팩토리 메서드 추가 (실제 필드는 3개만)
public static TierInfo allFeaturesEnabled(Board board) {
    return TierInfo.builder()
        .tier(BoardTier.PREMIUM)
        .canAccessSchedule(true)
        .canAccessMilestone(true)
        .canAccessSlack(true)
        .build();
}
```

**적용 위치**: TierInfo를 조립하는 서비스에서 분기:
```java
TierInfo tierInfo = monetizationService.isMonetizationEnabled()
    ? TierInfo.of(board)
    : TierInfo.allFeaturesEnabled(board);
```

---

### 2.7 기존 Board/Org 일괄 업그레이드 (OFF 전환 시)

**MonetizationService.setMonetizationEnabled(false) 호출 시 자동 실행**:

```java
@Transactional
private void upgradeAllExistingEntities() {
    // 1. TRIAL/STANDARD 보드 → PREMIUM + Subscription ACTIVE
    List<Board> boards = boardRepository.findByTierIn(
        List.of(BoardTier.TRIAL, BoardTier.STANDARD));
    for (Board board : boards) {
        board.changeTier(BoardTier.PREMIUM);
        subscriptionRepository.findByBoardId(board.getId())
            .ifPresent(sub -> sub.upgradeByAdmin()); // status=ACTIVE, plan=PREMIUM
    }
    // WebSocket tier cache 일괄 무효화
    boards.forEach(b -> webSocketAuthInterceptor.evictTierCache(b.getId()));

    // 2. FREE/TRIAL 조직 구독 → TEAM + ACTIVE
    List<OrgSubscription> orgSubs = orgSubscriptionRepository.findByPlanOrStatus(
        OrgPlan.FREE, SubscriptionStatus.TRIAL);
    for (OrgSubscription sub : orgSubs) {
        sub.setPlan(OrgPlan.TEAM);
        sub.setStatus(SubscriptionStatus.ACTIVE);
        sub.setBoardLimit(Integer.MAX_VALUE);
        if (sub.getMonthlyAiCredits() == 0) {
            sub.initializeCredits(OrgSubscription.ORG_MONTHLY_CREDITS);
        }
    }
}
```

> **ORG_MANAGED 보드**: 건드리지 않음 (이미 최상위).
> **ON 재전환 시**: 기존 PREMIUM 보드 유지, 신규 보드만 TRIAL로 생성.

---

### 2.8 API 엔드포인트

#### Admin 전용 (인증 필요)

**파일**: `AdminController.java`

```java
// GET /api/v1/admin/system/monetization
@GetMapping("/system/monetization")
public ResponseEntity<Map<String, Boolean>> getMonetizationStatus() {
    return ResponseEntity.ok(Map.of(
        "monetization_enabled", monetizationService.isMonetizationEnabled()
    ));
}

// PUT /api/v1/admin/system/monetization
@PutMapping("/system/monetization")
public ResponseEntity<Map<String, Boolean>> setMonetizationStatus(
    @RequestBody Map<String, Boolean> request
) {
    boolean enabled = request.getOrDefault("monetization_enabled", false);
    monetizationService.setMonetizationEnabled(enabled);
    return ResponseEntity.ok(Map.of("monetization_enabled", enabled));
}
```

#### 공개 API (비인증 — FE 초기 로드용)

**파일**: 기존 컨트롤러 활용 또는 `SystemController` 신규

```java
// GET /api/v1/system/monetization
@GetMapping("/monetization")
public ResponseEntity<Map<String, Boolean>> getMonetizationStatus() {
    return ResponseEntity.ok(Map.of(
        "monetization_enabled", monetizationService.isMonetizationEnabled()
    ));
}
```

**SecurityConfig.java**: `/api/v1/system/monetization` → `permitAll()` 추가

---

## 3. Frontend 변경

### 3.1 Monetization 상태 관리

**파일**: `utils/services.ts`

```typescript
export const getMonetizationStatus = async (): Promise<{ monetization_enabled: boolean }> => {
  const response = await api.get('/system/monetization');
  return response.data;
};
```

**파일**: `contexts/AuthContext.tsx`

```typescript
// 1. 상태 추가
const [monetizationEnabled, setMonetizationEnabled] = useState<boolean>(true); // 기본 ON (안전)

// 2. 앱 로드 시 fetch
useEffect(() => {
  getMonetizationStatus().then(data => {
    setMonetizationEnabled(data.monetization_enabled);
  });
}, []);

// 3. 기존 hideBilling 계산에 합산
const hideBilling = !monetizationEnabled || isTester || isAdmin || isRestricted;

// 4. Context value에 monetizationEnabled 포함
<AuthContext.Provider value={{ ...existing, monetizationEnabled }}>
```

**핵심**: 기존 `hideBilling` 흐름에 `!monetizationEnabled`만 합산.
→ `useBoardPermissions` 훅이 이미 `hideBilling`으로 모든 기능 해제하므로 **추가 변경 불필요**.

```typescript
// useBoardPermissions.ts — 이미 호환됨 (변경 없음)
const canAccessSchedule = hideBilling || (tierInfo?.can_access_schedule ?? true);
const canAccessMilestone = hideBilling || (tierInfo?.can_access_milestone ?? true);
const canAccessSlack = hideBilling || (tierInfo?.can_access_slack ?? true);
const hideBillingForUser = hideBilling || !isOwner;
```

---

### 3.2 숨길 컴포넌트 목록 (monetization OFF 시)

**기존 `hideBilling` / `hideBillingForUser` 흐름에 의해 자동 처리되는 항목**:

| 컴포넌트 | 현재 가드 | 추가 작업 |
|----------|----------|----------|
| **TrialBanner** | `if (hideBilling) return null` (line 23) | 없음 (자동) |
| **ShareBoardModal 결제 섹션** | `!hideBillingForUser && ...` | 없음 (자동) |

**추가 가드가 필요한 항목**:

| 컴포넌트 | 파일 | 처리 방식 |
|----------|------|----------|
| **SubscriptionModal** | `KanbanBoardPage.tsx` | 열기 콜백에 `if (hideBilling) return` 추가 |
| **PremiumBenefitsModal** | `KanbanBoardPage.tsx` (line 1134) | 자동 열기 useEffect에 이미 `hideBilling` 체크 있음 — 수동 트리거도 가드 |
| **UpgradeModal** | `KanbanBoardPage.tsx` | `openUpgradeModal()`에 `if (hideBilling) return` 추가 |
| **OrgBillingSection** | `OrganizationSettings.tsx` | `{monetizationEnabled && <OrgBillingSection />}` |
| **OrgPlanSelector** | 조직 설정 내 | `{monetizationEnabled && ...}` |
| **OrgMigrationWizard** | 조직 설정 내 | `{monetizationEnabled && ...}` |
| **OrgSubscriptionBadge** | 조직 헤더 | `{monetizationEnabled && ...}` |
| **AdminSubscriptionsTab** | `AdminPage.tsx` | 탭 목록에서 제거 |
| **PersonalCreditModal** | 개인 다이어리 | 트리거 숨김 |
| **UserMenu 구독 항목** | `KanbanBoardHeader.tsx` | `{!hideBillingForUser && ...}` (이미 있을 가능성 확인 필요) |
| **BoardCard Trial 뱃지** | `BoardCard.tsx` (line 48) | `{monetizationEnabled && isTrial && ...}` |

### 3.3 Premium 잠금 아이콘 제거

**파일**: `components/BoardViewSwitcher.tsx`

```typescript
// hideBilling이 true이면 canAccess*도 true → 잠금 아이콘 자동 해제
// 추가 변경 불필요 (useBoardPermissions 훅이 처리)
```

### 3.4 402 에러 핸들링

**파일**: `utils/api.ts`

백엔드에서 `consumeCredit()` 자체가 바이패스되므로 402가 발생하지 않음.
추가 변경 불필요 (안전장치로 넣어도 됨).

### 3.5 PaymentSuccessPage / PaymentFailPage

Polar 결제 경로(FE)가 차단되므로 이 페이지에 도달할 경로 없음.
추가 변경 불필요 (직접 URL 접근은 무해 — 단순 확인 페이지).

### 3.6 Admin 시스템 탭 UI

**파일**: `components/admin/AdminSystemTab.tsx` (기존 확장)

기존 유지보수 모드 섹션 아래에 수익화 토글 추가:

```
┌─────────────────────────────────────────────┐
│  수익화 설정                                  │
│                                             │
│  수익화 모드    [━━━━━ ON ━━━━━]             │
│                                             │
│  ℹ️ OFF 전환 시:                             │
│  · 모든 보드/조직이 최상위 플랜으로 생성        │
│  · 기존 TRIAL/STANDARD 보드 자동 업그레이드    │
│  · 결제 관련 UI 숨김                          │
│  · AI 크레딧 무제한                           │
│                                             │
│  ⚠️ ON 재전환 시:                            │
│  · 기존 PREMIUM 보드는 유지됩니다              │
│  · 신규 보드만 TRIAL로 생성됩니다              │
└─────────────────────────────────────────────┘
```

---

## 4. 데이터 흐름 다이어그램

```
Admin toggles OFF
       │
       ▼
┌─────────────────────┐
│ SystemConfig DB      │  MONETIZATION_ENABLED = "false"
│ (key-value store)    │
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Backend    Frontend
    │         │
    │         ▼
    │    GET /api/v1/system/monetization (비인증)
    │         │
    │         ▼
    │    AuthContext: hideBilling = true (모든 유저)
    │         │
    │    ┌────┴──────────────────────┐
    │    │ TrialBanner: return null  │
    │    │ UpgradeModal: 열기 방지   │
    │    │ 구독 탭/모달: 숨김         │
    │    │ 잠금 아이콘: 해제          │
    │    │ Org Billing: 숨김         │
    │    └───────────────────────────┘
    │
    ├─→ Board 생성 → PREMIUM + ACTIVE (skipBilling=true)
    ├─→ Org 생성 → TEAM + ACTIVE (createActive)
    ├─→ TierInfo → allFeaturesEnabled()
    ├─→ AI Credit → 3개 consume 메서드 스킵
    ├─→ Schedulers → 7개 전부 스킵
    └─→ 기존 TRIAL/STANDARD → 일괄 PREMIUM 업그레이드
```

---

## 5. 파일 변경 목록

### Backend (신규 1개)
| 파일 | 설명 |
|------|------|
| `domain/system/MonetizationService.java` | 수익화 상태 조회/변경 + 일괄 업그레이드 |

### Backend (수정)
| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `domain/board/service/BoardService.java` | `createBoard()` skipBilling 조건에 monetization 추가 | 1줄 |
| `domain/organization/service/OrganizationService.java` | `createOrganization()` 분기 추가 | ~10줄 |
| `domain/subscription/OrgSubscription.java` | `createActive()` 팩토리 메서드 추가 | ~10줄 |
| `domain/subscription/service/AiCreditService.java` | `consumeCredit/Org/User` 3개 바이패스 | 3줄 |
| `domain/board/dto/BoardResponse.java` | `TierInfo.allFeaturesEnabled()` 추가 | ~10줄 |
| `domain/admin/controller/AdminController.java` | monetization GET/PUT 엔드포인트 | ~20줄 |
| `global/config/SecurityConfig.java` | `/api/v1/system/monetization` 공개 허용 | 1줄 |
| `global/scheduler/SubscriptionScheduler.java` | 7개 스케줄러 early return | 7줄 |
| TierInfo 조립 서비스 (BoardService/BoardFacadeService) | monetization 분기 | ~5줄 |
| SystemController 또는 신규 | 공개 API 엔드포인트 | ~10줄 |

### Frontend (수정)
| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `utils/services.ts` | `getMonetizationStatus()` 추가 | ~5줄 |
| `contexts/AuthContext.tsx` | `monetizationEnabled` 상태 + `hideBilling` 합산 | ~10줄 |
| `pages/KanbanBoardPage.tsx` | 모달 열기 가드 (SubscriptionModal, UpgradeModal) | ~5줄 |
| `components/admin/AdminSystemTab.tsx` | 토글 UI 추가 | ~60줄 |
| `components/admin/AdminPage.tsx` | 구독 탭 조건부 렌더링 | ~3줄 |
| `components/organization/OrganizationSettings.tsx` | OrgBilling 관련 숨김 | ~5줄 |
| `components/dashboard/BoardCard.tsx` | Trial 뱃지 조건부 | ~2줄 |
| `types/index.ts` | AuthContext 타입 확장 | ~2줄 |

---

## 6. ON/OFF 전환 시 동작 비교

| 항목 | Monetization ON (기본) | Monetization OFF |
|------|----------------------|------------------|
| 보드 생성 | TRIAL (7일) → STANDARD | PREMIUM + ACTIVE |
| 조직 생성 | TRIAL (7일) → FREE | TEAM + ACTIVE |
| 기존 TRIAL/STANDARD | 유지 | → PREMIUM 일괄 업그레이드 |
| 기능 잠금 | Tier별 게이팅 | 모든 기능 해제 |
| AI 크레딧 (Board) | Tier별 제한 | 차감 스킵 (무제한) |
| AI 크레딧 (Org) | 월 200 고정 | 차감 스킵 (무제한) |
| AI 크레딧 (Personal) | 유저별 제한 | 차감 스킵 (무제한) |
| 스케줄러 7개 | 동작 | 전부 스킵 |
| TrialBanner | 표시 | 숨김 (hideBilling) |
| 구독/업그레이드 모달 | 접근 가능 | 열기 차단 |
| Admin 구독 탭 | 표시 | 완전 숨김 |
| BoardViewSwitcher 잠금 | Tier별 | 전부 해제 |
| Org Billing 섹션 | 표시 | 숨김 |
| Checkout API | 정상 동작 | 그대로 (FE 차단) |
| Polar 웹훅 | 정상 처리 | 그대로 (FE 차단) |
| ON 재전환 시 기존 보드 | — | PREMIUM 유지 |

---

## 7. 확장성 고려

### 향후 부분 수익화
현재는 단순 ON/OFF지만, `SystemConfig`에 추가 키로 세분화 가능:
```
MONETIZATION_ENABLED       = true/false    ← 현재 구현
BILLING_UI_VISIBLE         = true/false    ← 향후: UI만 숨기고 내부 tier는 유지
AI_CREDITS_UNLIMITED       = true/false    ← 향후: 크레딧만 무제한
TRIAL_DURATION_DAYS        = 7/14/30       ← 향후: Trial 기간 조정
DEFAULT_BOARD_TIER         = TRIAL/PREMIUM ← 향후: 기본 tier 설정
```

### DB 마이그레이션
- **불필요**: `SystemConfig` 테이블 이미 존재, 키-값 추가만으로 충족
- 첫 조회 시 키가 없으면 기본값 `true` (ON) 반환

---

## 8. 구현 순서 (권장)

```
Phase 1: Backend 핵심 (신규 서비스 + 분기 추가)
  1. MonetizationService 생성
  2. Admin API 엔드포인트 (GET/PUT)
  3. 공개 API 엔드포인트 + SecurityConfig
  4. Board 생성 분기 (skipBilling 조건 합산)
  5. Org 생성 분기 + OrgSubscription.createActive()
  6. AI 크레딧 바이패스 (3개 메서드)
  7. 스케줄러 바이패스 (7개 메서드)
  8. TierInfo.allFeaturesEnabled() + 조립 분기
  9. 일괄 업그레이드 로직

Phase 2: Frontend
  10. services.ts API 추가
  11. AuthContext monetizationEnabled + hideBilling 합산
  12. Admin 시스템 탭 토글 UI
  13. 모달 열기 가드 (Subscription, Upgrade)
  14. Org Billing 섹션 숨김
  15. Admin 구독 탭 숨김
  16. BoardCard Trial 뱃지 조건부

Phase 3: 검증
  17. OFF 상태에서 보드/조직 생성 → PREMIUM/TEAM 확인
  18. 모든 기능 접근 테스트 (Schedule, Milestone, Statistics, Slack, Discord)
  19. AI 기능 사용 시 크레딧 차감 안 됨 확인
  20. 결제 UI 전체 숨김 확인
  21. ON 재전환 → 기존 PREMIUM 유지, 신규 TRIAL 확인
  22. 스케줄러 로그 확인 (OFF 시 스킵 로그)
```

---

## 9. 리스크 및 주의사항

| 리스크 | 대응 |
|--------|------|
| 기본값 ON → 배포 직후 수동 전환 필요 | Admin 가이드 공유, 최초 1회만 |
| OFF 전환 시 기존 보드 대량 업데이트 | @Transactional로 원자성 보장, 보드 수 적으면 무시 가능 |
| ON 재전환 시 기존 PREMIUM 유지 | 의도된 정책 (확정), 향후 일괄 다운그레이드 옵션 추가 가능 |
| Polar 웹훅 OFF 상태에서 도착 | 처리해도 무방 (FE 차단으로 결제 자체가 없음) |
| FE 새로고침 전 상태 불일치 | AuthContext에서 앱 로드 시 최신 상태 fetch |
| `consumeCredit` 바이패스 시 사용량 미추적 | 의도된 정책 (확정) — ON 전환 시 크레딧 새로 초기화 |
