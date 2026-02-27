# v11.0 Organization Subscription — Workspace 통합 과금 모델

> **Status**: Draft (Reviewed)
> **Date**: 2026-02-27
> **Author**: Claude Opus 4.6 + Product Owner
> **Depends On**: v10.0 (Cross-Domain Integration)
> **Reviewed**: 2026-02-27 — 허점 점검 및 개선 포인트 반영
> **Updated**: 2026-02-27 — AI 크레딧 구독 유지, Seat 사전 구매 모델, Trial→Free 미처리 건 정책 반영

---

## 1. 배경 및 목표

### 현재 문제

| 구분 | 현재 상태 | 문제점 |
|------|-----------|--------|
| Board 구독 | $5/seat/월 (Board별 독립) | 보드 늘수록 비용 중복 (같은 멤버가 보드마다 seat 차지) |
| Organization | 무료 (HR 풀기능) | 풍부한 기능 대비 수익화 모델 없음 |

**예시: 12명 팀이 보드 3개 운영 시 (현재)**
```
Board A: 10 seats × $5 = $50/월
Board B: 8 seats × $5 = $40/월
Board C: 5 seats × $5 = $25/월
총: $115/월 (고유 멤버 12명인데 seat 23개 결제)
```

### 목표

1. **2-Track 과금 모델**: Board 단독($5/seat) + Organization($15/seat) 병행
2. Org는 **Free / Team ($15/seat)** 2티어 단순 구조
3. Team이면 Board 무제한 생성, 보드마다 추가 비용 없음 + HR 풀기능
4. Board Premium 유저가 Org 전환 시 무손실 마이그레이션
5. Board 단독 유저는 **강제 전환 없이** 기존 $5/seat 계속 사용

> **향후 확장**: 전환율이 낮을 경우, 중간 티어($8~10/seat, HR만 포함, Board 무제한 제외)
> 추가를 검토할 수 있음. 현 시점에서는 2티어로 시작하여 결정 피로도를 줄이고 관리 부담을 최소화.

---

## 2. 플랜 구조

### 2.1 Org 플랜 — 3단계 (HR Trial → Free → Team)

> **네이밍 구분**: Board에도 7일 Trial이 있으므로, Org Trial은 **"HR 체험판"**으로 구분합니다.
> Board Trial은 PM 기능 체험, Org Trial은 HR 기능 체험. UI에서 범위를 명확히 표시합니다.

| | **HR Trial (7일)** | **Free** | **Team** |
|---|---|---|---|
| **가격** | $0 (1회 제공) | $0 | **$15/seat/월** |
| **연간 가격** | — | $0 | **$150/seat/년** (17% 할인) |
| **멤버 제한** | 무제한 | 무제한 | 무제한 |
| **Org Board 생성/편입** | **불가** | **불가** | **무제한** |
| **기존 Board** | 개별 구독 유지 | 개별 구독 유지 | Org 편입 가능 (ORG_MANAGED) |
| | | | |
| **Board 프리미엄 기능** | | | |
| 칸반 (블록/피처/태스크) | — (Board 개별) | — (Board 개별) | O (ORG_MANAGED) |
| 일정/마일스톤 | — | — | O |
| 미팅 (녹음/AI) | — | — | O |
| 노트 (협업) | — | — | O |
| 일일 체크리스트 | — | — | O |
| 통계/AI 리포트 | — | — | O |
| Slack 연동 | — | — | O |
| | | | |
| **HR 기능** | | | |
| 멤버 관리 | O | O (유지) | O |
| 조직도 | O | O (유지) | O |
| 근태/휴가 | **O (체험)** | **읽기전용** | O |
| 온보딩 | **O (체험)** | **읽기전용** | O |
| 1:1 미팅 | **O (체험)** | **읽기전용** | O |
| 인사이트/분석 | **O (체험)** | **읽기전용** | O |
| 기념일 알림 | **O (체험)** | **읽기전용** | O |
| | | | |
| **AI 크레딧** | Board 개별 | Board 개별 | **Board 개별 (기존 유지)** |

> **HR Trial과 Board Trial의 관계**: 두 Trial은 독립적으로 운영됩니다.
> - Board Trial (7일): Board 생성 시 자동 부여 → PM 프리미엄 기능 체험
> - HR Trial (7일): Org 생성 시 자동 부여 → HR 풀기능 체험 (Org Board는 불가)
> UI에서 "Board 체험판" / "HR 체험판"으로 명확히 라벨링합니다.

### 2.2 핵심 원칙

```
1. 2-Track 과금 모델
   → Board 단독 유저: $5/seat/board (기존 방식, 계속 운영)
   → Org 소속 유저:   $15/seat/org (Board 무제한 + HR)
   → 두 모델은 독립적으로 공존, 강제 전환 없음

2. Org HR Trial → Free → Team 전환 구조
   → Org 생성 시 7일 HR Trial 자동 부여 (조직당 1회)
   → HR Trial 중 HR 풀기능 체험 가능, 단 Org Board 생성/편입 불가
   → HR Trial 만료 → Free 즉시 전환 (유예 기간 없음)
   → Free에서 HR 데이터 읽기전용 보존 (절대 삭제 안 함)
   → Team 결제 후에만 Org Board 생성/편입 가능

3. Org에 소속된 Board는 개별 구독이 없다 (Team 전용)
   → Board 생성/삭제가 비용에 영향 없음
   → "보드 자유롭게 만들어 쓰세요"
   → Trial/Free에서는 Board가 Org에 귀속되지 않음 (개별 구독 유지)

4. 과금 단위는 구매한 seat 수 (사전 구매 모델)
   → 10 seats 구매 시 10 × $15 = $150/월
   → 구매한 seat 수 만큼만 Org 멤버 초대 가능
   → seat 부족 시 추가 구매 (즉시 일할 결제)
   → 그 10명이 Board를 1개 쓰든 20개 쓰든 동일 비용

5. Board 멤버 ⊂ Org 멤버
   → Org에 속한 사람만 Org Board(ORG_MANAGED)에 참여 가능
   → ORG_MANAGED Board에서 Board 레벨 외부인 초대 차단
   → 새 사람 추가: Org에 먼저 초대 → 그 후 Board에 추가
   → Board 초대 UI: Org 멤버 풀에서만 선택 가능 (외부인 초대 입력 비활성화)
```

### 2.3 Board 단독 유저 (Individual Track)

```
Org 미사용 유저 — 기존 Board 구독 모델 계속 운영:
  STANDARD (무료) → 변화 없음
  PREMIUM ($5/seat/월) → 계속 운영 (신규 가입도 가능)
  → 칸반 + 일정 + 미팅 + 노트 + 체크리스트 + 통계 + Slack
  → HR 기능(근태, 휴가, 온보딩 등)은 Org 전용이므로 사용 불가

Org Trial/Free 유저 — Board는 개별 구독 유지:
  → Org Board 생성/편입 불가
  → Board는 기존 방식 그대로 (STANDARD/PREMIUM)
  → Org는 HR 체험(Trial) 또는 조직 관리(Free)만 사용

Org Team 유저 — Board가 Org 구독으로 관리:
  → Board 개별 구독 비활성화
  → Org.plan이 Board 기능 접근 제어
  → Board.tier = ORG_MANAGED
```

### 2.4 전환 손익분기점 (유저 관점)

```
Board 단독 ($5/seat/board) vs Org Team ($15/seat, Board 무제한)

  Board 1개, 10명: $5×10×1 = $50  vs  $15×10 = $150  → Board가 저렴
  Board 2개, 10명: $5×10×2 = $100 vs  $15×10 = $150  → Board가 저렴
  Board 3개, 10명: $5×10×3 = $150 vs  $15×10 = $150  → 동일 (+HR 무료)
  Board 4개, 10명: $5×10×4 = $200 vs  $15×10 = $150  → Org가 저렴

  ※ Org는 멤버 중복 제거됨 (Board 3개에 걸쳐 있어도 고유 멤버 수만 과금)
  ※ Board 단독은 보드마다 중복 멤버도 별도 seat 결제

손익분기: Board 3개부터 Org Team 전환이 합리적
  + HR 풀기능 (근태, 휴가, 온보딩, 1:1, 인사이트, 기념일)
  + Board 무제한 생성

→ UI에서 "보드 3개 이상이면 Org가 더 저렴합니다" 안내 배너 표시
```

---

## 3. 마이그레이션 플로우

### 3.1 Scenario A: Premium Board 보유 유저 → Org 전환 (핵심 시나리오)

```
Before: Board A (Premium, 10 seats, $50/월)
```

**Step 1 — 조직 생성 → HR Trial 자동 부여**
```
[Dashboard] → "조직 만들기"
→ 조직 이름, 설명 입력
→ Org HR Trial (7일) 자동 시작 — HR 풀기능 체험 가능
→ 이 시점에서는 Board 편입 불가 (Trial 중에는 Org Board 불가)
→ 기존 Board A는 개별 Premium 구독 유지
```

**Step 1.5 — HR Trial 기간 (7일)**
```
HR Trial 중:
  ✓ HR 기능 체험 (근태, 휴가, 온보딩, 1:1, 인사이트, 기념일)
  ✓ 조직도, 멤버 관리
  ✗ Org Board 생성/편입 불가
  → Board A는 개별 Premium 구독으로 계속 운영

HR Trial 만료 알림:
  D-3: "HR 체험판 3일 남았습니다. Team으로 업그레이드하면 계속 사용 가능"
  D-1: "내일 HR 체험판이 만료됩니다. 쌓인 데이터: 근태 N건, 휴가 N건..."
  D-0: 즉시 Free 전환 (유예 기간 없음)
       HR 데이터 읽기전용 보존 (절대 삭제 안 함)
```

**Step 2 — Team 플랜 결제 + Board 선택 + 비용 비교**

> 기존 5단계 위자드를 3단계로 간소화하여 전환 이탈을 최소화합니다.

```
┌─────────────────────────────────────────┐
│  Step 1/3 — Board 선택 + 비용 비교       │
│                                          │
│  기존 보드를 조직에 연결하시겠습니까?      │
│                                          │
│  ☑ Board A (Premium · 10 seats · $50/월) │
│  ☑ Board B (Standard · 무료)             │
│                                          │
│  ─── 비용 비교 ───                       │
│                                          │
│  현재:  Board A $50/월                   │
│  전환 후: 10명 × $15 = $150/월           │
│  잔여분 크레딧: -$25                     │
│  첫 결제: $125                           │
│                                          │
│  포함:                                   │
│  ✓ Board 무제한  ✓ HR 풀기능             │
│                                          │
│                      [다음: 결제 →]       │
└─────────────────────────────────────────┘
```

**Step 3 — 결제 (Toss Payments)**
```
┌─────────────────────────────────────────┐
│  Step 2/3 — 결제                         │
│                                          │
│  Team — $15/seat/월                      │
│  10 seats × $15 = $150/월               │
│  크레딧 적용: -$25                       │
│  이번 달 결제: $125                      │
│                                          │
│  [Toss Payments 결제 위젯]               │
│                                          │
│                  [결제하기]               │
└─────────────────────────────────────────┘
```

**Step 4 — 완료**
```
┌──────────────────────────────────────────┐
│  Step 3/3 — 전환 완료                     │
│                                           │
│  My Organization · Team 플랜              │
│                                           │
│  • Board A, B → 조직 소속으로 통합         │
│  • 10 seats ($150/월)                     │
│  • Board 무제한 생성 가능                  │
│  • Board B도 프리미엄 기능 사용 가능       │
│  • 기존 크레딧 $25 적용, 이번 달 $125 청구 │
│                                           │
│  다음 결제일: 3월 27일 · $150/월           │
│                                           │
│                  [조직 대시보드로 이동]     │
└──────────────────────────────────────────┘
```

**내부 전환 처리**
```
1. Board A 구독 → Org 위임 (취소하지 않음)
   → 잔여 기간 일할 계산 → 결제 크레딧으로 전환
   → Subscription.markMigratedToOrg(orgId)
   → status는 ACTIVE 유지 (AI 크레딧 계속 사용 위해)
   → 개별 결제만 중단 (billingPausedForOrg = true)

2. Org Team 구독 생성
   → seat_count = 구매한 seat 수
   → 첫 결제 = (seats × $15) - 전환 크레딧

3. Board 상태 변경
   → Board A: tier = ORG_MANAGED (기존 Premium → Org 귀속)
   → Board B: tier = ORG_MANAGED (기존 Standard → Org 귀속, 기능 업그레이드)

4. 알림 발송
   → Board A/B의 모든 멤버에게 "Board가 [조직명] 소속으로 전환되었습니다" 알림
```

### 3.2 Scenario B: Premium Board 여러 개 보유

```
Before:
  Board A: 10 seats × $5 = $50/월
  Board B: 8 seats × $5 = $40/월
  Board C: 5 seats × $5 = $25/월
  총: $115/월 (고유 멤버 12명, 실제 seat 23개)

After (Org Team):
  고유 멤버: 12명
  Org: 12 seats × $15 = $180/월
  Board 무제한 생성 가능 + HR 풀기능

비용 변화: $115 → $180 (+$65)
하지만: PM 풀기능 + HR 풀기능 + Board 무제한
```

**Seat 중복 제거 (핵심 가치):**
```java
// 조직 연결 시 고유 멤버 수 계산
Set<String> uniqueUserIds = new HashSet<>();
for (Board board : selectedBoards) {
    board.getMembers().forEach(m -> uniqueUserIds.add(m.getUserId()));
}
int requiredSeats = uniqueUserIds.size();
// 23 seats (보드별) → 12 seats (고유 멤버) 로 정리
```

### 3.3 Scenario C: Standard Board만 보유 (무과금 유저)

```
[1] 조직 생성 → Org HR Trial (7일) 자동 시작
[2] HR Trial 중: HR 풀기능 체험, Org Board 생성 불가
    → Board는 개별 Standard 유지
[3] HR Trial 만료 → Free 즉시 전환
    → 조직도 + 멤버관리만, HR 데이터 읽기전용
[4] Team 결제 시: Board 편입/생성 가능 + HR 풀기능 활성화
```

### 3.4 Scenario D: Org 없이 Board만 계속 사용 (Individual Track)

```
- 강제 전환 없음 — Board 단독 유저는 기존 방식 그대로
- Board 구독 ($5/seat/board) 계속 운영 (신규 가입도 가능)

신규 유저 경로 2가지:
  경로 A (개인/소규모): Board Free → Board Premium ($5/seat)
  경로 B (팀/조직):     Board Free → Org 생성 → HR Trial (7일) → Free → Team ($15/seat)

Board Premium으로 충분한 유저:
  ✓ Board 1~2개, 소규모 팀
  ✓ 칸반 + 일정 + 미팅 + 노트면 충분
  ✓ HR 기능 불필요

Org Team이 이득인 유저:
  ✓ Board 3개 이상 (손익분기)
  ✓ 멤버 중복이 많음 (Board마다 같은 사람이 seat 차지)
  ✓ HR 기능 필요 (근태, 휴가, 온보딩, 1:1, 인사이트)

전환 유도:
  - Board 3개 이상 보유 시 "Org로 전환하면 더 저렴합니다" 배너
  - Board Premium 결제 화면에서 Org Team 비교 안내
  - Org 기능(HR) 탐색 시 Org 생성 유도
  - HR Trial 만료 후 잠긴 HR 기능 접근 시 "Team 플랜에서 사용 가능" CTA
```

### 3.5 크레딧 전환 공식

**결제 크레딧 (잔여 구독료):**
```
잔여 크레딧 = 기존_월액 × (잔여_일수 / 해당_월_총_일수)

예시 (월간 구독자):
  Board A: $50/월, 구독 잔여 15일/30일
  크레딧 = $50 × (15/30) = $25

  Org Team 10 seats = $150/월
  첫 결제: $150 - $25 = $125
  다음 달부터: $150/월

예시 (연간 구독자):
  Board A: $500/년 (10 seats), 잔여 200일/365일
  크레딧 = $500 × (200/365) = $273.97

  Org Team 10 seats 연간 = $1,500/년
  첫 결제: $1,500 - $273.97 = $1,226.03
```

**AI 크레딧**: Board 개별 구독에서 기존 방식 그대로 유지. Org 전환 시에도 각 Board의 AI 크레딧은 해당 Board에서 계속 관리됩니다.

---

## 4. 엔티티 설계

### 4.1 신규 엔티티

#### OrgSubscription

```java
@Entity
@Table(name = "org_subscriptions")
public class OrgSubscription {

    @Id
    private String id;                          // UUID

    @OneToOne(fetch = LAZY)
    @JoinColumn(name = "organization_id", unique = true)
    private Organization organization;

    // --- 플랜 & 상태 ---
    @Enumerated(EnumType.STRING)
    private OrgPlan plan;                       // FREE, TEAM

    @Enumerated(EnumType.STRING)
    private SubscriptionStatus status;          // TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELED

    @Enumerated(EnumType.STRING)
    private BillingCycle billingCycle;           // MONTHLY, YEARLY

    // --- Seat 관리 ---
    private int seatCount;                      // 구매한 seat 수
    private int activeMemberCount;              // 실제 활성 멤버 수 (Org 전체)
    private int pricePerSeat;                   // 단가 (cents): $15 = 1500
    private int totalPrice;                     // seatCount × pricePerSeat

    // --- Billing Period ---
    private LocalDateTime currentPeriodStart;
    private LocalDateTime currentPeriodEnd;
    private LocalDateTime nextPaymentAt;
    private String paymentMethodId;

    // --- Trial ---
    private LocalDateTime trialEndsAt;          // 7일 HR Trial

    // --- Board 제한 ---
    private int boardLimit;                     // FREE/TRIAL=0 (Org Board 불가), TEAM=MAX_VALUE

    // --- 감사 ---
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime canceledAt;

    // ===== 상수 =====
    public static final int MONTHLY_PRICE_PER_SEAT = 1500;  // $15.00
    public static final int YEARLY_PRICE_PER_SEAT = 15000;  // $150.00
    public static final int TRIAL_DAYS = 7;

    // ===== 팩토리 메서드 =====

    public static OrgSubscription createFree(Organization org) {
        OrgSubscription sub = new OrgSubscription();
        sub.id = UUID.randomUUID().toString();
        sub.organization = org;
        sub.plan = OrgPlan.FREE;
        sub.status = SubscriptionStatus.ACTIVE;
        sub.seatCount = 0;
        sub.activeMemberCount = 0;
        sub.pricePerSeat = 0;
        sub.totalPrice = 0;
        sub.boardLimit = 0;  // Free: Org Board 생성 불가
        sub.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        sub.updatedAt = sub.createdAt;
        return sub;
    }

    /** Org 생성 시 자동 호출 — 7일 HR Trial 부여 (조직당 1회) */
    public static OrgSubscription createTrial(Organization org) {
        OrgSubscription sub = createFree(org);
        sub.status = SubscriptionStatus.TRIAL;
        sub.trialEndsAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(TRIAL_DAYS);
        // HR Trial 중 HR 풀기능 체험 가능, 단 Org Board 생성/편입은 불가
        sub.boardLimit = 0;  // Trial에서도 Org Board 불가
        return sub;
    }

    /** HR Trial 만료 → Free 즉시 전환 (스케줄러에서 호출) */
    public void expireTrialToFree() {
        this.status = SubscriptionStatus.ACTIVE;
        this.plan = OrgPlan.FREE;
        this.boardLimit = 0;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ===== 플랜 활성화 =====

    public void activateTeam(BillingCycle cycle, int seats, String paymentMethodId) {
        this.plan = OrgPlan.TEAM;
        this.status = SubscriptionStatus.ACTIVE;
        this.billingCycle = cycle;
        this.seatCount = seats;
        this.pricePerSeat = (cycle == BillingCycle.YEARLY)
            ? YEARLY_PRICE_PER_SEAT : MONTHLY_PRICE_PER_SEAT;
        this.totalPrice = seats * this.pricePerSeat;
        this.boardLimit = Integer.MAX_VALUE;
        this.paymentMethodId = paymentMethodId;
        this.trialEndsAt = null;
        initializePeriod();
    }

    // ===== 기능 접근 =====

    /** Board 프리미엄 기능 — Team 전용 (Trial/Free에서는 Board가 Org에 귀속되지 않음) */
    public boolean canAccessPremiumBoardFeatures() {
        return plan == OrgPlan.TEAM;
    }

    /** HR 기능 쓰기 (생성/수정) — Team 또는 HR Trial 중에만 */
    public boolean canAccessHrFeatures() {
        return plan == OrgPlan.TEAM || isTrialActive();
    }

    /** HR 기능 읽기 (조회) — Free에서도 Trial 데이터 열람 가능 */
    public boolean canReadHrData() {
        return true;  // 모든 플랜에서 읽기전용 허용
    }

    /** Org Board 생성/편입 가능 여부 — Team 전용 */
    public boolean canCreateOrgBoard() {
        return plan == OrgPlan.TEAM;
    }

    // ===== 제한 =====

    public int getMemberLimit() {
        // 모든 플랜에서 멤버 수 제한 없음
        return Integer.MAX_VALUE;
    }

    public int getBoardLimit() {
        // Trial/Free: Org Board 불가 (0), Team: 무제한
        if (plan == OrgPlan.TEAM) return Integer.MAX_VALUE;
        return 0;
    }

    // ===== Seat 관리 (사전 구매 모델) =====

    /** seat 수 변경 (구매/축소 시 호출) */
    public void updateSeatCount(int newSeatCount) {
        this.seatCount = newSeatCount;
        this.totalPrice = newSeatCount * this.pricePerSeat;
    }

    /** 멤버 초대 가능 여부 — 구매한 seat 내에서만 허용 */
    public boolean canInviteMember() {
        return plan == OrgPlan.TEAM && activeMemberCount < seatCount;
    }

    /** 남은 seat 수 */
    public int getAvailableSeats() {
        return Math.max(0, seatCount - activeMemberCount);
    }

    // ===== 상태 =====

    public boolean isActive() { return status == SubscriptionStatus.ACTIVE; }
    public boolean isTrial() { return status == SubscriptionStatus.TRIAL; }

    public boolean isTrialActive() {
        return isTrial() && trialEndsAt != null
            && trialEndsAt.isAfter(LocalDateTime.now(ZoneOffset.UTC));
    }

    public void cancel() {
        this.status = SubscriptionStatus.CANCELED;
        this.canceledAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void suspend() {
        this.status = SubscriptionStatus.SUSPENDED;
    }

    private void initializePeriod() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        this.currentPeriodStart = now;
        this.currentPeriodEnd = (billingCycle == BillingCycle.YEARLY)
            ? now.plusYears(1) : now.plusMonths(1);
        this.nextPaymentAt = this.currentPeriodEnd;
        this.updatedAt = now;
    }
}
```

#### OrgPlan (Enum)

```java
public enum OrgPlan {
    FREE,       // 무료 — 조직도 + 멤버관리만, HR 읽기전용, Org Board 불가
    TEAM        // $15/seat — PM 풀기능 + HR 풀기능 + Board 무제한 생성/편입
}
// Note: Trial은 별도 Enum이 아니라 SubscriptionStatus.TRIAL + OrgPlan.FREE 조합으로 표현
// Trial 만료 → status = ACTIVE, plan = FREE 로 전환
```

#### OrgPaymentHistory

```java
@Entity
@Table(name = "org_payment_history")
public class OrgPaymentHistory {

    @Id
    private String id;                          // UUID

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "org_subscription_id")
    private OrgSubscription orgSubscription;

    private int amount;                         // 실제 결제 금액 (cents)
    private int creditApplied;                  // 전환 크레딧 차감액

    @Enumerated(EnumType.STRING)
    private BillingCycle billingCycle;

    @Enumerated(EnumType.STRING)
    private PaymentStatus status;               // PENDING, PAID, FAILED, REFUNDED

    @Enumerated(EnumType.STRING)
    private OrgPaymentType paymentType;

    private String pgProvider;                  // "TOSSPAYMENTS"
    private String pgTransactionId;

    private LocalDateTime periodStart;
    private LocalDateTime periodEnd;
    private int memberCount;                    // 결제 시점 멤버 수
    private LocalDateTime paidAt;
    private LocalDateTime createdAt;
}
```

#### OrgPaymentType (Enum)

```java
public enum OrgPaymentType {
    SUBSCRIPTION,       // 정기 구독 결제 (갱신 시 seat 자동 조정 포함)
    MIGRATION           // Board 구독 → Org 전환 (크레딧 차감 기록)
}
```

### 4.2 기존 엔티티 변경

#### BoardTier 변경

```java
public enum BoardTier {
    TRIAL,          // 7일 체험
    STANDARD,       // 무료 (기본 칸반만)
    PREMIUM,        // Board 단독 유료 ($5/seat — Individual Track)
    ORG_MANAGED     // Org 구독에 의해 관리됨 ($15/seat — Organization Track)
}
```

#### Board 엔티티 변경

> **설계 원칙**: 기존 `canAccessSchedule()` 등 8개 메서드의 호출부를 변경하지 않기 위해,
> `isEffectivelyPremium()` 에서 ORG_MANAGED를 처리합니다.
> OrgSubscription 유효성 검증은 Board 편입/생성 시점에서만 수행합니다.

```java
public class Board {
    // 기존 필드 유지

    // 신규 메서드
    public boolean isOrgManaged() {
        return tier == BoardTier.ORG_MANAGED && organization != null;
    }

    /**
     * ORG_MANAGED Board는 항상 Premium으로 취급.
     * → 기존 canAccessSchedule(), canAccessMeeting() 등 8개 메서드가
     *   isEffectivelyPremium()을 호출하므로, 여기서 분기 처리하면
     *   호출부 변경이 필요 없음.
     * → OrgSubscription 유효성은 Board 편입/생성 시점에서 이미 검증됨.
     *   (Team 플랜이 아니면 ORG_MANAGED 자체가 될 수 없으므로)
     * → Org Team 취소 시 cancel()에서 Board.tier → STANDARD로 변경하므로
     *   ORG_MANAGED인 Board는 항상 유효한 Org Team 구독이 있음이 보장됨.
     */
    public boolean isEffectivelyPremium() {
        if (tier == BoardTier.ORG_MANAGED) {
            return true;
        }
        return tier == BoardTier.PREMIUM
            || (tier == BoardTier.TRIAL && trialEndsAt != null
                && trialEndsAt.isAfter(LocalDateTime.now(ZoneOffset.UTC)));
    }
}
```

#### Organization 엔티티 변경

```java
public class Organization {
    // 기존 필드 유지

    @OneToOne(mappedBy = "organization", fetch = LAZY)
    private OrgSubscription subscription;

    // Trial 사용 여부 (조직당 1회 제한)
    private boolean trialUsed;

    public boolean hasActiveSubscription() {
        return subscription != null
            && (subscription.isActive() || subscription.isTrialActive());
    }

    public OrgPlan getCurrentPlan() {
        return subscription != null ? subscription.getPlan() : OrgPlan.FREE;
    }

    public boolean isTrialAvailable() {
        return !trialUsed;
    }
}
```

#### Subscription (기존 Board 구독) 변경

```java
public class Subscription {
    // 기존 필드 유지

    // Org 마이그레이션 추적
    private boolean migratedToOrg;
    private String migratedToOrgId;
    private LocalDateTime migratedAt;
    private boolean billingPausedForOrg;       // true면 개별 결제 중단 (Org에서 대납)

    /**
     * Board → Org 전환 시 호출.
     * → status를 CANCELED하지 않음 (ACTIVE 유지)
     * → AI 크레딧 월간 리셋 + 소비가 계속 작동하려면 ACTIVE여야 함
     * → 개별 결제만 중단 (billingPausedForOrg = true)
     * → SubscriptionScheduler에서 billingPausedForOrg인 구독은 결제 스킵
     */
    public void markMigratedToOrg(String orgId) {
        this.migratedToOrg = true;
        this.migratedToOrgId = orgId;
        this.migratedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.billingPausedForOrg = true;
        // status는 ACTIVE 유지 — AI 크레딧 계속 사용
    }

    /** Org 취소/다운그레이드 시 개별 결제 복원 */
    public void restoreFromOrg() {
        this.migratedToOrg = false;
        this.migratedToOrgId = null;
        this.billingPausedForOrg = false;
        // status는 ACTIVE 유지, 기존 Board 구독으로 복귀
    }
}
```

### 4.3 DB 마이그레이션 (Flyway)

> **주의**: V80, V81은 이미 사용 중 (announcement comments/attachments).
> 이 마이그레이션은 **V82**부터 시작합니다.

```sql
-- V82__create_org_subscriptions.sql

-- 1. OrgSubscription 테이블
CREATE TABLE org_subscriptions (
    id              VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),

    -- Plan & Status
    plan            VARCHAR(20) NOT NULL DEFAULT 'FREE',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    billing_cycle   VARCHAR(10),

    -- Seats
    seat_count          INT NOT NULL DEFAULT 0,
    active_member_count INT NOT NULL DEFAULT 0,
    price_per_seat      INT NOT NULL DEFAULT 0,
    total_price         INT NOT NULL DEFAULT 0,

    -- Billing Period
    current_period_start TIMESTAMP,
    current_period_end   TIMESTAMP,
    next_payment_at      TIMESTAMP,
    payment_method_id    VARCHAR(100),

    -- Trial
    trial_ends_at TIMESTAMP,

    -- Board Limit (Trial/Free=0, Team=MAX)
    board_limit INT NOT NULL DEFAULT 0,

    -- Audit
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

-- 3. Subscription(기존)에 마이그레이션 추적 필드 추가
ALTER TABLE subscriptions ADD COLUMN migrated_to_org BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN migrated_to_org_id VARCHAR(36);
ALTER TABLE subscriptions ADD COLUMN migrated_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN billing_paused_for_org BOOLEAN DEFAULT FALSE;

-- 4. Organization에 trial_used 필드 추가
ALTER TABLE organizations ADD COLUMN trial_used BOOLEAN DEFAULT FALSE;

-- 5. 기존 Organization에 FREE 구독 자동 생성 (Org Board 불가)
INSERT INTO org_subscriptions (id, organization_id, plan, status,
    board_limit, created_at, updated_at)
SELECT
    gen_random_uuid()::VARCHAR,
    o.id,
    'FREE',
    'ACTIVE',
    0,          -- Free: Org Board 생성 불가
    NOW(),
    NOW()
FROM organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM org_subscriptions os WHERE os.organization_id = o.id
  );
```

---

## 5. 서비스 레이어 설계

### 5.1 OrgSubscriptionService

```java
@Service
@Transactional
public class OrgSubscriptionService {

    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final NotificationService notificationService;

    // ===== 플랜 활성화 =====

    public OrgSubscription activateTeam(String orgId, BillingCycle cycle,
                                         int seatCount, String paymentMethodId) {
        OrgSubscription sub = orgSubscriptionRepository
            .findByOrganizationIdForUpdate(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));

        sub.activateTeam(cycle, seatCount, paymentMethodId);
        return orgSubscriptionRepository.save(sub);
    }

    // ===== Board → Org 마이그레이션 =====

    /** 마이그레이션 미리보기 (결제 전 시뮬레이션) */
    public MigrationPreview previewMigration(String orgId, BillingCycle cycle,
                                              List<String> boardIds) {
        // 1. 고유 멤버 수 계산
        int uniqueMembers = calculateUniqueMembers(boardIds);

        // 2. 기존 Board 구독 총 월액
        int currentTotalMonthly = 0;
        int totalCredit = 0;

        for (String boardId : boardIds) {
            Subscription sub = subscriptionRepository.findByBoardId(boardId).orElse(null);
            if (sub != null && sub.isActive()) {
                currentTotalMonthly += sub.getPrice();
                totalCredit += calculateRemainingCredit(sub);
            }
        }

        // 3. 신규 Org 구독 가격
        int pricePerSeat = (cycle == BillingCycle.YEARLY)
            ? OrgSubscription.YEARLY_PRICE_PER_SEAT
            : OrgSubscription.MONTHLY_PRICE_PER_SEAT;
        int newPrice = uniqueMembers * pricePerSeat;
        int firstPayment = Math.max(0, newPrice - totalCredit);

        return new MigrationPreview(
            currentTotalMonthly,
            newPrice,
            totalCredit,
            firstPayment,
            uniqueMembers
        );
    }

    /** 실제 마이그레이션 실행 */
    public MigrationResult migrateFromBoardSubscriptions(
            String orgId, BillingCycle cycle,
            List<String> boardIds, String paymentMethodId) {

        MigrationPreview preview = previewMigration(orgId, cycle, boardIds);

        // 1. Org Team 구독 활성화
        OrgSubscription orgSub = activateTeam(orgId, cycle,
            preview.uniqueMembers(), paymentMethodId);

        // 2. Board 구독 마이그레이션
        for (String boardId : boardIds) {
            Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            board.setTier(BoardTier.ORG_MANAGED);

            subscriptionRepository.findByBoardId(boardId)
                .ifPresent(sub -> sub.markMigratedToOrg(orgId));

            // 3. Board 멤버들에게 전환 알림
            notifyBoardMembersOfMigration(board, orgSub.getOrganization());
        }

        // 4. 결제 기록
        OrgPaymentHistory payment = OrgPaymentHistory.create(
            orgSub,
            preview.firstPayment(),
            preview.creditFromExisting(),
            OrgPaymentType.MIGRATION
        );

        return new MigrationResult(orgSub, preview, payment);
    }

    // ===== 기능 접근 제어 =====

    /** Org HR 기능 쓰기 접근 여부 (생성/수정) */
    public boolean canAccessHrFeatures(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository
            .findByOrganizationId(orgId).orElse(null);
        return orgSub != null && orgSub.canAccessHrFeatures();
    }

    /** Org HR 기능 읽기 접근 여부 (조회) — Free에서도 Trial 데이터 열람 */
    public boolean canReadHrData(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository
            .findByOrganizationId(orgId).orElse(null);
        return orgSub != null && orgSub.canReadHrData();
    }

    /** Org Board 생성/편입 가능 여부 — Team 전용 */
    public boolean canCreateOrgBoard(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository
            .findByOrganizationId(orgId).orElse(null);
        return orgSub != null && orgSub.canCreateOrgBoard();
    }

    // ===== HR Trial 만료 처리 (스케줄러에서 호출) =====

    /** 만료된 HR Trial → Free 즉시 전환 */
    public void expireTrials() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<OrgSubscription> expiredTrials = orgSubscriptionRepository
            .findByStatusAndTrialEndsAtBefore(SubscriptionStatus.TRIAL, now);
        for (OrgSubscription sub : expiredTrials) {
            sub.expireTrialToFree();
            // HR 데이터는 삭제하지 않음 (읽기전용 보존)
        }
    }

    // ===== Seat 관리 (사전 구매 모델) =====

    /**
     * Seat 추가 구매
     * 정책: 기존 Board 구독과 동일 — seat을 먼저 구매해야 멤버 초대 가능
     * → 구매한 seat 수 만큼만 Org 멤버 초대 허용
     * → seat 초과 시 추가 구매 유도 (즉시 결제)
     * → 멤버 제거 시 seat 자동 축소 없음 (수동으로 seat 조정 가능)
     */
    public OrgSubscription purchaseAdditionalSeats(String orgId, int additionalSeats) {
        OrgSubscription sub = orgSubscriptionRepository
            .findByOrganizationIdForUpdate(orgId)
            .orElseThrow();

        if (sub.getPlan() != OrgPlan.TEAM) {
            throw new BusinessException(ErrorCode.ORG_TEAM_REQUIRED);
        }

        int newSeatCount = sub.getSeatCount() + additionalSeats;
        int additionalCost = additionalSeats * sub.getPricePerSeat();

        // 잔여 기간 일할 계산하여 즉시 결제
        int proratedAmount = calculateProratedAmount(sub, additionalCost);
        // TODO: Toss Payments 즉시 결제 처리

        sub.updateSeatCount(newSeatCount);
        return orgSubscriptionRepository.save(sub);
    }

    /** Org 멤버 초대 가능 여부 — seat 여유분 체크 */
    public boolean canInviteMember(String orgId) {
        OrgSubscription sub = getSubscription(orgId);
        return sub.getActiveMemberCount() < sub.getSeatCount();
    }

    // ===== Board 생성 제한 =====

    /** Org Board 생성 가능 여부 — Team 전용 */
    public boolean canCreateBoard(String orgId) {
        OrgSubscription sub = getSubscription(orgId);
        if (!sub.canCreateOrgBoard()) {
            return false;  // Trial/Free: Org Board 생성 불가
        }
        return true;  // Team: 무제한
    }

    // ===== 취소 =====

    /**
     * Org Team 구독 취소
     * → 소속 Board의 tier를 STANDARD로 변경 + Org 관계 해제
     * → 기존 Board Subscription의 billingPausedForOrg 해제 → 개별 결제 복원
     * → Board가 원래 Premium이었으면 개별 구독이 ACTIVE 상태이므로 Premium 기능 유지
     */
    public void cancel(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository
            .findByOrganizationIdForUpdate(orgId).orElseThrow();
        orgSub.cancel();

        boardRepository.findByOrganizationId(orgId).forEach(board -> {
            board.removeOrganization();
            board.setTier(BoardTier.STANDARD);

            // Board Subscription 개별 결제 복원
            subscriptionRepository.findByBoardId(board.getId())
                .ifPresent(Subscription::restoreFromOrg);
        });
    }

    /**
     * 다운그레이드 (Team → Free) — Org Board 일괄 분리
     * → 소속 Board를 모두 STANDARD로 전환 + 개별 구독 결제 복원
     */
    public void downgradeToFree(String orgId) {
        List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);

        // 일괄 분리 + 개별 결제 복원
        orgBoards.forEach(board -> {
            board.removeOrganization();
            board.setTier(BoardTier.STANDARD);

            subscriptionRepository.findByBoardId(board.getId())
                .ifPresent(Subscription::restoreFromOrg);
        });

        OrgSubscription orgSub = orgSubscriptionRepository
            .findByOrganizationIdForUpdate(orgId).orElseThrow();
        orgSub.expireTrialToFree();  // plan=FREE, status=ACTIVE
    }

    // ===== 내부 유틸 =====

    private int calculateUniqueMembers(List<String> boardIds) {
        Set<String> uniqueUserIds = new HashSet<>();
        for (String boardId : boardIds) {
            boardMemberRepository.findByBoardId(boardId)
                .forEach(m -> uniqueUserIds.add(m.getUserId()));
        }
        return uniqueUserIds.size();
    }

    private int calculateRemainingCredit(Subscription sub) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        long totalDays = ChronoUnit.DAYS.between(
            sub.getCurrentPeriodStart(), sub.getCurrentPeriodEnd());
        long remainingDays = ChronoUnit.DAYS.between(now, sub.getCurrentPeriodEnd());
        if (remainingDays <= 0 || totalDays <= 0) return 0;
        return (int)(sub.getPrice() * remainingDays / totalDays);
    }

    /** Board 멤버들에게 Org 전환 알림 */
    private void notifyBoardMembersOfMigration(Board board, Organization org) {
        boardMemberRepository.findByBoardId(board.getId()).forEach(member -> {
            notificationService.createSystemNotification(
                member.getUserId(),
                "Board '" + board.getName() + "'이(가) '" + org.getName() + "' 조직 소속으로 전환되었습니다."
            );
        });
    }
}
```

### 5.2 기존 서비스 변경 패턴

> **설계 결정**: 기존 `board.canAccessSchedule()` 등 8개 메서드 호출부를 서비스 위임으로
> 전부 변경하는 대신, `Board.isEffectivelyPremium()`에서 `ORG_MANAGED → true` 분기를
> 처리합니다. 이 방식의 근거:
>
> 1. ORG_MANAGED tier는 Team 플랜 활성화 시에만 설정됨
> 2. Team 취소 시 cancel()에서 Board.tier → STANDARD로 변경됨
> 3. 따라서 ORG_MANAGED인 Board는 항상 유효한 Org Team 구독이 있음이 보장됨
> 4. 기존 서비스 코드(ScheduleService, MeetingService 등) 변경 불필요

```java
// === 기존 코드 — 변경 없음 ===
// ScheduleService, MeetingService, NoteService 등
if (!board.canAccessSchedule()) {
    throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
}
// → board.canAccessSchedule() → board.isEffectivelyPremium()
// → ORG_MANAGED면 true 반환 → 기존 로직 그대로 통과

// === 변경 필요한 곳: HR 서비스만 ===
// OrgAttendanceService, LeaveService, OnboardingService, OneOnOneService 등
// 쓰기 작업에 HR 접근 체크 추가
if (!orgSubscriptionService.canAccessHrFeatures(orgId)) {
    throw new BusinessException(ErrorCode.HR_FEATURE_REQUIRES_TEAM);
}
```

### 5.3 AI 크레딧 — Board 구독 ACTIVE 유지

AI 크레딧은 Org 수준에서 관리하지 않습니다. ORG_MANAGED Board도 **기존 Board 구독(Subscription)의 AI 크레딧을 그대로 사용**합니다.

**핵심**: Board→Org 마이그레이션 시 Board Subscription을 CANCELED하지 않고 **ACTIVE 유지**.
개별 결제만 중단(`billingPausedForOrg = true`)하여, AI 크레딧 월간 리셋과 소비가 기존과 동일하게 작동합니다.

```java
// 변경 없음 — 기존 코드 그대로
Subscription sub = subscriptionRepository.findByBoardIdForUpdate(boardId);
sub.consumeCredits(amount);
// → ORG_MANAGED Board도 Subscription이 ACTIVE이므로 크레딧 소비 정상 작동
// → 월간 리셋(MonitoringScheduler)도 ACTIVE 구독만 대상이므로 정상 리셋
```

```
SubscriptionScheduler 변경:
  → 결제 시점에 billingPausedForOrg == true인 구독은 결제 스킵
  → 크레딧 리셋은 정상 수행 (ACTIVE 상태이므로)
```

---

## 6. API 설계

### 6.1 Org 구독 API

```
# 구독 조회
GET    /api/v1/organizations/{orgId}/subscription

# Team 플랜 활성화 (신규)
POST   /api/v1/organizations/{orgId}/subscription/activate
Body:  { "billing_cycle": "MONTHLY", "seat_count": 10 }

# Board→Org 마이그레이션 미리보기
POST   /api/v1/organizations/{orgId}/subscription/migrate/preview
Body:  { "billing_cycle": "MONTHLY", "board_ids": ["board-a", "board-b"] }
Response: {
    "current_total_monthly": 11500,
    "new_monthly": 18000,
    "credit_from_existing": 2500,
    "first_payment": 15500,
    "unique_members": 12
}

# Board→Org 마이그레이션 실행
POST   /api/v1/organizations/{orgId}/subscription/migrate
Body:  { "billing_cycle": "MONTHLY", "board_ids": ["board-a", "board-b"] }

# 결제 확인 (Toss Payments 콜백)
POST   /api/v1/payments/confirm/org-subscription
Body:  { "payment_key": "...", "order_id": "...", "amount": 15500 }

# 다운그레이드 (Team → Free, Org Board 일괄 분리)
POST   /api/v1/organizations/{orgId}/subscription/downgrade

# 취소
DELETE /api/v1/organizations/{orgId}/subscription

# 결제 내역
GET    /api/v1/organizations/{orgId}/subscription/payments
```

### 6.2 Response DTO

```java
public record OrgSubscriptionResponse(
    String id,
    String organization_id,
    String plan,                    // "FREE" or "TEAM"
    String status,                  // "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"
    String billing_cycle,
    int seat_count,
    int active_member_count,
    int price_per_seat,
    int total_price,
    String current_period_start,
    String current_period_end,
    String next_payment_at,
    String trial_ends_at,
    // Limits
    int board_limit,
    int board_count,
    int member_limit,
    // Feature flags
    boolean can_access_premium_board_features,  // Team only
    boolean can_access_hr_features,             // Team or Trial (쓰기)
    boolean can_read_hr_data,                   // All plans (읽기전용)
    boolean can_create_org_board,               // Team only
    boolean trial_used                          // 조직당 1회 제한 여부
) {}
```

---

## 7. Frontend 변경

### 7.1 신규 컴포넌트

```
frontend/src/app/components/organization/subscription/
├── OrgPlanSelector.tsx           # Free vs Team 비교 카드
├── OrgSubscriptionBadge.tsx      # 현재 플랜 뱃지 (Free/Team/HR Trial)
├── OrgMigrationWizard.tsx        # Board→Org 전환 위자드 (3 Step)
└── OrgBillingSection.tsx         # 결제 정보, 내역, Seat 관리
```

### 7.2 기존 컴포넌트 변경

```
OrgSettingsTab.tsx       → "구독 & 결제" 서브탭 추가
OrgDashboardTab.tsx      → 플랜 뱃지
Sidebar.tsx              → Org 플랜 표시
KanbanBoardPage.tsx      → ORG_MANAGED Board 구독 체크 변경
BoardSubscription 관련   → Board 3개+ 보유 시 "Org로 전환하면 저렴합니다" 배너
```

### 7.3 타입 정의

```typescript
// frontend/src/app/types/index.ts

export type OrgPlan = 'FREE' | 'TEAM';

export interface OrgSubscription {
    id: string;
    organization_id: string;
    plan: OrgPlan;
    status: string;                 // TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELED
    billing_cycle: string | null;   // MONTHLY, YEARLY
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
    // Feature flags
    can_access_premium_board_features: boolean;  // Team only
    can_access_hr_features: boolean;             // Team or Trial
    can_read_hr_data: boolean;                   // All plans (read-only)
    can_create_org_board: boolean;               // Team only
    trial_used: boolean;                         // 조직당 1회 제한 여부
}

export interface MigrationPreview {
    current_total_monthly: number;
    new_monthly: number;
    credit_from_existing: number;
    first_payment: number;
    unique_members: number;
}
```

---

## 8. 엣지 케이스 & 정책

### 8.1 Board ↔ Org 관계

| 상황 | 처리 |
|------|------|
| Org Team에서 Board 새로 생성 | 바로 생성 (추가 비용 없음), tier = ORG_MANAGED |
| Org Trial/Free에서 Org Board 생성 시도 | "Board를 조직에 연결하려면 Team 플랜이 필요합니다" 안내 |
| Org Trial/Free에서 기존 Board 편입 시도 | "Team 플랜에서 기존 Board를 조직에 편입할 수 있습니다" 안내 |
| Org에서 Board 분리 | Board.tier → STANDARD (다운그레이드), Org 관계 해제 |
| Org 삭제 | 모든 Board → STANDARD + Org 관계 해제, OrgSubscription 취소 |
| Board Owner ≠ Org Owner | Board 연결 시 Board Owner 동의 필요 |
| **Board 전환 알림** | ORG_MANAGED 전환 시 해당 Board 모든 멤버에게 알림 발송 |

### 8.2 Seat 정책 (사전 구매 모델)

> **핵심**: 기존 Board 구독과 동일한 사전 구매 방식. seat을 먼저 구매 → 구매 수 만큼 초대 가능 → 초과 시 추가 구매.

| 상황 | 처리 |
|------|------|
| Org 멤버 추가 → seat 여유 있음 | 즉시 초대 허용 (activeMemberCount < seatCount) |
| Org 멤버 추가 → **seat 부족** | **차단** → "seat이 부족합니다. 추가 seat을 구매해주세요" + 즉시 구매 CTA |
| Seat 추가 구매 | 즉시 결제 (잔여 기간 일할 계산) → seat 확보 → 초대 가능 |
| Org 멤버 제거 → seat 여유 | seat 자동 축소 없음 (수동 조정 가능, 남은 seat은 유지) |
| Seat 축소 요청 | 다음 갱신부터 적용 (현재 멤버 수 이하로는 축소 불가) |
| ORG_MANAGED Board에 멤버 추가 | **Org 멤버 풀에서만 선택 가능** (외부인 직접 초대 차단) |
| ORG_MANAGED Board에 외부인 초대 시도 | 차단 → "먼저 조직에 초대한 후 Board에 추가해주세요" 안내 |
| Org에 외부인 초대 + **이미 다른 Org 소속** | 1인 1조직 정책(V79) 충돌 → 에러: "해당 사용자는 다른 조직에 소속되어 있어 초대할 수 없습니다" |

### 8.3 HR Trial → Free 전환 정책

```
HR Trial (7일) → Free 즉시 전환:
  - 유예 기간 없음 (즉시 전환)
  - HR 데이터 절대 삭제 안 함 (읽기전용 보존)
  - HR Trial은 조직당 1회 (1인 1조직 정책으로 사실상 유저당 1회)

Free에서의 접근:
  - 조직도 + 멤버관리: 정상 사용
  - HR 기능 (근태/휴가/온보딩/1:1/인사이트/기념일): 읽기전용
    → "이 기능은 Team 플랜에서 사용할 수 있습니다" + 업그레이드 CTA
  - Org Board 생성/편입: 불가
    → "Board를 조직에 연결하려면 Team 플랜이 필요합니다"

미처리 건 정책 (Trial 중 생성된 대기/예약 건):
  - 승인 대기 중인 근태/휴가 건: 읽기전용 동결 (승인/반려 불가)
    → "Team 플랜에서 처리할 수 있습니다" 안내
  - 미래 날짜 휴가 예약 건: 자동 취소하지 않음 (읽기전용 보존)
    → 수정/취소하려면 Team 구독 필요
  - 반복 1:1 미팅: 신규 인스턴스 생성 차단 (기존 기록은 읽기전용 보존)
  → 미처리 건이 Team 전환의 자연스러운 동기 부여 역할

만료 알림:
  D-3: "HR 체험판 3일 남았습니다"
  D-1: "내일 HR 체험판이 만료됩니다. 쌓인 데이터 요약: 근태 N건..."
  D-0: "HR 체험판이 만료되었습니다. 데이터는 보존됩니다."
```

### 8.4 다운그레이드 (Team → Free)

```
Team → Free 전환 시:
  - 소속 Org Board 전부 일괄 분리 → STANDARD로 전환 + Org 관계 해제
  - 개별 분리 옵션 없음 (단순화)

다운그레이드 완료 시:
  - 분리된 Board → 개별 STANDARD Board로 전환
  - HR 기능 읽기전용 (Trial→Free와 동일 패턴)
  - 기존 데이터 유지 (삭제 안 함)
```

### 8.5 결제 실패

```
Day 0:  결제 실패 → 이메일/푸시 알림 "결제 수단을 확인해주세요"
Day 3:  자동 재시도 → 실패 시 SUSPENDED (읽기 전용 모드)
Day 14: CANCELED → Free로 다운그레이드 (Board → STANDARD, HR 읽기전용)
```

### 8.6 Board Premium ↔ Org Team 공존 정책

```
Board Premium ($5/seat/board) — Individual Track:
  - 신규/기존 유저 모두 가입 가능 (계속 운영)
  - PM 풀기능 (칸반, 일정, 미팅, 노트, 체크리스트, 통계, Slack)
  - HR 기능 없음 (Org 전용)

Org Team ($15/seat) — Organization Track:
  - Org 생성 후 Board 연결/생성 시 적용
  - PM 풀기능 + HR 풀기능 + Board 무제한

전환 유도:
  - Board 3개 이상 보유 시 "Org가 더 저렴합니다" 배너
  - Board Premium 유저가 Org 전환 시: 잔여분 크레딧 적용
  - Org 생성 시 기존 Board 연결 → "구독 통합" 위자드

공존 원칙:
  - Board Premium은 폐지하지 않음 (소규모 팀의 핵심 수익원)
  - 두 구독이 동시에 존재 가능 (Org Board + 개인 Board 별도)
  - Org에 연결된 Board만 ORG_MANAGED, 연결 안 한 Board는 PREMIUM 유지
```

### 8.7 세금 & 인보이스 (향후)

> Org 구독은 B2B 성격이 강하므로, 세금계산서/인보이스 기능이 필요합니다.
> v11.0 MVP에서는 Toss Payments 기본 영수증으로 운영하고,
> 후속 버전에서 사업자 정보 입력, 세금계산서 발행, 인보이스 PDF 다운로드를 추가합니다.

```
향후 추가 필드 (OrgSubscription):
  - billingName: String          // 사업자명
  - billingEmail: String         // 인보이스 수신 이메일
  - businessNumber: String       // 사업자등록번호
  - billingAddress: String       // 주소

향후 API:
  PUT  /api/v1/organizations/{orgId}/subscription/billing-info
  GET  /api/v1/organizations/{orgId}/subscription/invoices
  GET  /api/v1/organizations/{orgId}/subscription/invoices/{invoiceId}/pdf
```

---

## 9. 구현 우선순위

### Phase 1: 엔티티 & 기반 API (Week 1-2)

- [ ] Flyway V82: `org_subscriptions`, `org_payment_history` 테이블
- [ ] `OrgSubscription`, `OrgPaymentHistory` 엔티티
- [ ] `OrgPlan`, `OrgPaymentType` Enum
- [ ] `OrgSubscriptionRepository` (findByOrganizationId, findForUpdate, findExpiredTrials 등)
- [ ] `OrgSubscriptionService` (CRUD, activateTeam, cancel, expireTrials)
- [ ] `OrgSubscriptionController` (GET/POST/DELETE)
- [ ] 기존 Organization 생성 시 OrgSubscription(HR Trial, 7일) 자동 생성
- [ ] HR Trial 만료 스케줄러 (매일 UTC 00:00, expireTrials 호출)
- [ ] HR Trial 만료 알림 (D-3, D-1, D-0)

### Phase 2: Board 마이그레이션 (Week 2-3)

- [ ] `migrateFromBoardSubscriptions()` — Board→Org 전환 로직
- [ ] `previewMigration()` — 미리보기 API
- [ ] Seat 중복 제거 (고유 멤버 계산)
- [ ] 결제 크레딧 전환 (일할 계산)
- [ ] Board.tier = ORG_MANAGED 처리
- [ ] Board 전환 시 멤버 알림 발송

### Phase 3: 기능 접근 제어 통합 (Week 3-4)

> 이전 추정(1주)에서 상향 조정. Board.isEffectivelyPremium() 엔티티 분기로 PM 서비스는
> 변경 불필요하지만, HR 서비스(근태/휴가/온보딩/1:1/인사이트/기념일)에 읽기/쓰기 분리를
> 적용해야 하며, 이는 6개 도메인의 서비스/컨트롤러 수정을 포함합니다.

- [ ] `Board.isEffectivelyPremium()` — ORG_MANAGED → true 분기 추가
- [ ] `BoardTier` Enum에 `ORG_MANAGED` 추가 + DB migration
- [ ] `canAccessHrFeatures()` / `canReadHrData()` — 쓰기/읽기 분리
- [ ] HR 서비스 6개 도메인에 읽기전용 분기 적용:
  - OrgAttendanceService (근태)
  - LeaveService (휴가)
  - OnboardingService (온보딩)
  - OneOnOneService (1:1 미팅)
  - OrgInsightService (인사이트)
  - AnniversaryService (기념일)
- [ ] `canCreateOrgBoard()` — Trial/Free 차단, Team만 허용

### Phase 4: 결제 연동 (Week 4-5)

- [ ] Toss Payments Org 구독 결제 플로우
- [ ] Seat 추가 구매 즉시 결제 (일할 계산) + Seat 축소 (다음 갱신 반영)
- [ ] 결제 실패 → SUSPENDED → CANCELED 스케줄러
- [ ] OrgPaymentHistory 기록

### Phase 5: Frontend (Week 5-6)

- [ ] `OrgPlanSelector` — Free vs Team 비교 카드
- [ ] `OrgMigrationWizard` — 3단계 전환 위자드
- [ ] `OrgBillingSection` — 결제 정보/내역/Seat 관리
- [ ] OrgSettingsTab 서브탭 추가
- [ ] Board Premium 유저용 "Org 전환" 손익분기 비교 배너
- [ ] HR Trial/Free 읽기전용 UI + 업그레이드 CTA

### Phase 6: 안정화 (Week 6-7)

- [ ] 엣지 케이스 처리 (다운그레이드 Board 일괄 분리, 결제 실패)
- [ ] 이메일/푸시 알림 (결제, 플랜 변경, HR Trial D-3/D-1/만료, 제한 경고)
- [ ] Admin 대시보드: Org 구독 현황
- [ ] Board Premium → Org 전환 유도 배너 (Board 3개+ 보유 시)
- [ ] HR Trial 만료 후 잠긴 HR 기능 → 읽기전용 UI + 업그레이드 CTA
- [ ] Trial/Free에서 Org Board 생성 시도 → "Team 플랜 필요" 안내
- [ ] ORG_MANAGED Board 외부인 초대 차단 + Org 초대 → Board 추가 플로우
- [ ] 1인 1조직 + Org 외부인 초대 충돌 에러 처리
- [ ] Board 전환 알림 E2E 테스트
- [ ] E2E 테스트

---

## 10. 리스크 & 완화

| 리스크 | 영향 | 완화 방안 |
|--------|------|-----------|
| 2-Track 과금 체계 혼란 (Board $5 + Org $15) | 중간 | 명확한 비교 UI + 손익분기점 안내 ("보드 3개부터 Org가 저렴") |
| Board Premium 유저가 Org로 안 넘어감 | 중간 | Board 3개+ 보유 시 전환 배너, Org HR Trial 7일 무료 제공 |
| HR Trial 만료 후 이탈 (Free에서 쓸 게 없다) | 중간 | HR 데이터+미처리 건 읽기전용 보존 → "쌓인 데이터 처리하려면 Team" 동기 유지 |
| HR Trial 중 Org Board 불가에 대한 혼란 | 낮음 | 명확한 안내: "Board는 Team 플랜에서 조직에 연결할 수 있습니다" |
| Board Trial과 HR Trial 이중 구조 혼란 | 중간 | UI 라벨 구분: "Board 체험판" (PM) vs "HR 체험판" (HR) + 범위 표시 |
| 마이그레이션 정산 버그 (Board→Org 전환 시) | 높음 | 미리보기 API로 사전 확인 + Admin 수동 정산 도구 |
| 1인 1조직 + Org 외부인 초대 충돌 | 중간 | ORG_MANAGED Board에서 외부인 직접 초대 차단. Org 초대 시 1인1조직 충돌 에러 안내 |
| Board Premium과 Org Team 사이 기능 차이 없음 (PM) | 낮음 | Org만의 가치 = HR 기능 + Board 무제한 + 멤버 중복 제거 |
| Phase 3 기능 접근 제어 변경 범위 과소평가 | 중간 | HR 6개 도메인 서비스 수정 필요. 엔티티 분기로 PM 서비스는 무변경 |
| ~~AI 크레딧 — CANCELED 구독에서 소비 불가~~ | ~~Critical~~ | **해결됨**: Board 구독 ACTIVE 유지 + billingPausedForOrg로 결제만 중단 |
| ~~Seat 악용 (무제한 초대 후 다음 갱신 정산)~~ | ~~중간~~ | **해결됨**: 사전 구매 모델로 변경 (seat 부족 시 추가 구매 필요) |

---

## Appendix A. 경쟁사 가격 비교 (10인 팀 기준, 연간)

> 이 섹션은 제품 기획/마케팅 참고용입니다. 기술 설계와는 분리된 비즈니스 분석입니다.

| 서비스 | 연간 비용 | 포함 기능 | BRIDGE 대비 |
|--------|-----------|-----------|------------|
| Notion (Team) | $1,200 | PM만 | 0.8x |
| Jira (Standard) | $840 | PM만 | 0.56x |
| Linear (Standard) | $960 | PM만 | 0.64x |
| ClickUp (Business) | $1,440 | PM만 | 0.96x |
| monday.com (Pro) | $1,920 | PM만 | 1.28x |
| BambooHR | $6,000+ | HR만 | 4x |
| Gusto | $5,280+ | HR만 | 3.5x |
| **BRIDGE Board** | **$600** | **PM만** | **0.4x** |
| **BRIDGE Team** | **$1,500** | **PM + HR 통합** | **baseline** |

**포지셔닝**:
- **Board 단독 ($5/seat)**: 순수 PM 도구 중 최저가 수준 — Jira보다 저렴
- **Org Team ($15/seat)**: PM + HR 통합 가치 대비 압도적 가성비 — BambooHR/Gusto의 1/3~1/4 가격에 PM까지 포함

---

## Appendix B. 수익 영향 시뮬레이션

> 이 섹션은 비즈니스 의사결정 참고용입니다. 기술 설계와는 분리된 수익 분석입니다.

### B.1 시나리오: 100개 팀, 평균 8명

```
현재 (Board 과금만):
  평균 Board 1.5개/팀 × 8 seats × $5 = $60/팀/월
  총 MRR: $6,000/월

2-Track 도입 후 (현실적 시나리오):
  40팀 → Org Team 전환 (Board 3개+ 또는 HR 필요): 40 × 8 × $15 = $4,800
  30팀 → Board Premium 유지 (Board 1~2개, 소규모):  30 × $60 = $1,800
  20팀 → Org Free (무과금, 아직 업그레이드 안 함):   20 × $0 = $0
  10팀 → Board Free (무과금):                        10 × $0 = $0
  총 MRR: $6,600/월 → +10% (보수적)

낙관적 시나리오 (Org 전환율 60%):
  60팀 × 8 × $15 = $7,200
  25팀 × $60 (Board Premium 유지) = $1,500
  15팀 × $0 (Free) = $0
  총 MRR: $8,700/월 → +45% 증가

핵심: Board Premium을 유지하므로 기존 수익이 보존되면서
      Org Team이 순수 증분(incremental) 수익을 창출
```

### B.2 ARPU 변화

| 지표 | Board Premium | Org Team | 비고 |
|------|---------------|----------|------|
| ARPU/seat | $5 | $15 | 3x |
| ARPU/팀 (8명) | $60 | $120 | Board 1.5개 평균 vs Org |
| LTV (12개월) | $720 | $1,440 | |
| Board 추가 시 비용 | +$40~50/보드 | $0 | Org 핵심 가치 |
| HR 기능 | 없음 | 포함 | Org 전용 |

### B.3 핵심 가치 제안

```
Board Premium 유저 관점 (소규모):
  "Board 1개 × 10명 = $50/월로 PM 풀기능"
  → Jira ($8/seat)보다 저렴, HR 불필요

Org 전환 유저 관점 (Board 3개+):
  "Board 3개 × 8명 = $115/월 → Org Team 8명 = $120/월"
  → 거의 동일 비용에 Board 무제한 + HR 풀기능 추가

신규 유저 관점:
  "$15/seat에 PM + HR 올인원"
  → BambooHR ($50+/seat) + Jira ($8/seat) = $58 vs BRIDGE $15
```
