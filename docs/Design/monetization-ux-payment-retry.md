# 수익화 UX 개선 #8: 결제 실패 재시도 안내

> **우선순위**: 중간 | **난이도**: 중간 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### 결제 실패 상태 처리 (Backend)

**PolarWebhookService.java (L335-376):**
```
Polar Status    → BRIDGE Status     → 사용자 영향
─────────────────────────────────────────────────
active          → ACTIVE            → 정상
past_due        → SUSPENDED         → canPerformActions() = false
unpaid          → SUSPENDED         → canPerformActions() = false
canceled        → CANCELED          → Standard 다운그레이드
```

> **문제**: `past_due`와 `unpaid` 모두 `SUSPENDED`로 매핑. PAST_DUE 상태를 별도로 활용하지 않음.

**Subscription.canPerformActions():**
```java
public boolean canPerformActions() {
    return this.status != SubscriptionStatus.SUSPENDED;
}
```

### 현재 사용자 경험

1. **Polar에서 결제 실패** → 웹훅 `subscription.updated` (status: past_due)
2. **BRIDGE에서 SUSPENDED** → 보드 기능 제한
3. **사용자 인지 방법**: TrialBanner에서 SUSPENDED 메시지만 표시
4. **결제 수단 업데이트 방법**: **없음** (Polar 포털 직접 방문 필요)

### TrialBanner.tsx SUSPENDED 상태

```tsx
// 현재
<div className="bg-red-500/10 ...">
  🔒 "This board is currently suspended"
  "Subscribe to regain access"
  [Subscribe] [Export Data]
</div>
```

### 문제점

1. **결제 수단 업데이트 경로 없음**: PAST_DUE 시 카드 변경 방법 미안내
2. **알림 없음**: 결제 실패 시 이메일/푸시 알림 미발송
3. **Grace Period 불분명**: 즉시 SUSPENDED → 사용자 데이터 접근 차단
4. **PAST_DUE vs SUSPENDED 미구분**: 단계적 경고 없이 즉시 차단
5. **Export Data 버튼**: SUSPENDED 상태에서 데이터 내보내기 기능이 실제로 작동하는지 불분명

---

## 2. 개선 방안

### 2.1 PAST_DUE → SUSPENDED 단계적 전환

**현재:**
```
past_due → 즉시 SUSPENDED (기능 차단)
```

**개선 후:**
```
Day 0:  past_due → PAST_DUE (경고만, 기능 유지)
Day 3:  PAST_DUE 유지 (2차 경고)
Day 7:  PAST_DUE → SUSPENDED (기능 차단)
Day 14: SUSPENDED → CANCELED (완전 해지)
```

#### Backend 변경

**PolarWebhookService — 상태 매핑 수정:**
```java
// Before
case PAST_DUE -> {
    subscription.suspend();  // 즉시 SUSPENDED
}

// After
case PAST_DUE -> {
    subscription.markPastDue();  // PAST_DUE 상태 (기능 유지)
    log.info("Board subscription past_due: boardId={}", boardId);
}
case SUSPENDED -> {
    subscription.suspend();  // SUSPENDED (기능 차단)
    log.info("Board subscription suspended: boardId={}", boardId);
}
```

**Subscription.java — 새 메서드:**
```java
public void markPastDue() {
    this.status = SubscriptionStatus.PAST_DUE;
    this.pastDueSince = LocalDateTime.now(ZoneOffset.UTC);
}

// PAST_DUE에서는 기능 유지
public boolean canPerformActions() {
    return this.status != SubscriptionStatus.SUSPENDED
        && this.status != SubscriptionStatus.CANCELED;
}
```

**새 필드:**
```java
@Column(name = "past_due_since")
private LocalDateTime pastDueSince;
```

**스케줄러 — PAST_DUE → SUSPENDED 자동 전환:**
```java
@Scheduled(cron = "0 25 * * * *") // 매시간 :25분
public void escalatePastDueSubscriptions() {
    LocalDateTime threshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(7);
    List<Subscription> pastDues = subscriptionRepository
        .findByStatusAndPastDueSinceBefore(SubscriptionStatus.PAST_DUE, threshold);

    for (Subscription sub : pastDues) {
        sub.suspend();
        log.info("Past-due subscription escalated to SUSPENDED: boardId={}", sub.getBoard().getId());
    }
}
```

### 2.2 결제 수단 업데이트 경로

**Polar Customer Portal 연동:**

Polar는 Customer Portal URL을 제공하여 사용자가 결제 수단을 관리할 수 있음.

#### Backend API 추가

```java
// SubscriptionController.java
@GetMapping("/api/v1/boards/{boardId}/subscription/billing-portal")
public ResponseEntity<Map<String, String>> getBillingPortalUrl(
        @PathVariable String boardId,
        @AuthenticationPrincipal String userId) {
    boardService.checkOwner(boardId, userId);
    String portalUrl = polarApiClient.createCustomerPortalSession(boardId);
    return ResponseEntity.ok(Map.of("url", portalUrl));
}
```

#### Frontend — 결제 수단 업데이트 버튼

**SubscriptionModal Billing 탭:**
```tsx
<button
  onClick={async () => {
    const { url } = await subscriptionAPI.getBillingPortalUrl(boardId);
    window.open(url, '_blank');
  }}
  className="px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-xl
    text-sm text-foreground hover:bg-foreground/10 transition-all"
>
  <CreditCard className="w-4 h-4 mr-2" />
  {t('subscription.updatePaymentMethod')}
</button>
```

### 2.3 PAST_DUE 배너 (단계적 경고)

**TrialBanner.tsx — PAST_DUE 상태 추가:**

**Day 0-3 (부드러운 경고):**
```
┌─ 🟡 ──────────────────────────────────────────────┐
│  ⚠️ Payment failed — Please update your payment   │
│     method to avoid service interruption.          │
│                                 [Update Payment →] │
└────────────────────────────────────────────────────┘
```

```tsx
// amber 배경
<div className="bg-amber-500/10 border border-amber-500/20 ...">
  <AlertTriangle className="text-amber-400" />
  <span>{t('subscription.pastDueWarning')}</span>
  <button className="bg-amber-500/20 text-amber-400">
    {t('subscription.updatePayment')}
  </button>
</div>
```

**Day 4-6 (긴급 경고):**
```
┌─ 🟠 ──────────────────────────────────────────────┐
│  ⚠️ Payment overdue — Your premium features will  │
│     be suspended in {N} days.                      │
│                                 [Update Payment →] │
└────────────────────────────────────────────────────┘
```

```tsx
// orange/red 배경
<div className="bg-red-500/10 border border-red-500/20 ...">
  <AlertTriangle className="text-red-400" />
  <span>{t('subscription.pastDueUrgent', { days: remainingDays })}</span>
  <button className="bg-red-500/20 text-red-400">
    {t('subscription.updatePaymentNow')}
  </button>
</div>
```

**Day 7+ (SUSPENDED):**
```
┌─ 🔴 ──────────────────────────────────────────────┐
│  🔒 Board suspended — Premium features are locked. │
│     Update your payment to restore access.          │
│                    [Update Payment] [Export Data]    │
└────────────────────────────────────────────────────┘
```

### 2.4 알림 발송 (FCM 푸시 + 인앱)

**결제 실패 시 알림 트리거:**

```java
// PolarWebhookService — past_due 처리 시
case PAST_DUE -> {
    subscription.markPastDue();

    // 보드 소유자에게 푸시 알림
    notificationService.sendPaymentFailedNotification(
        subscription.getBoard().getCreatedBy(),
        subscription.getBoard().getId(),
        subscription.getBoard().getTitle()
    );
}
```

**NotificationService 확장:**
```java
public void sendPaymentFailedNotification(String userId, String boardId, String boardTitle) {
    // 인앱 알림 생성
    Notification notification = Notification.builder()
        .userId(userId)
        .type(NotificationType.PAYMENT_FAILED)
        .message("Payment failed for board: " + boardTitle)
        .boardId(boardId)
        .build();
    notificationRepository.save(notification);

    // FCM 푸시 (비동기)
    pushNotificationService.sendPaymentAlert(userId, boardId, boardTitle);
}
```

### 2.5 SubscriptionResponse에 상태 정보 추가

```java
// SubscriptionResponse.Detail에 추가
private String pastDueSince;         // PAST_DUE 시작일
private Integer daysPastDue;         // PAST_DUE 경과 일수
private Integer daysUntilSuspension; // SUSPENDED까지 남은 일수
```

### 2.6 Flyway 마이그레이션

```sql
-- V92__add_past_due_tracking.sql
ALTER TABLE subscriptions ADD COLUMN past_due_since TIMESTAMP;
ALTER TABLE org_subscriptions ADD COLUMN past_due_since TIMESTAMP;
```

---

## 3. 상태별 사용자 경험 요약

| 상태 | 기능 | 배너 | 알림 | 결제 안내 |
|------|------|------|------|----------|
| ACTIVE | 전체 사용 | 없음 | 없음 | 불필요 |
| PAST_DUE (Day 0-3) | **전체 사용** | 노란색 경고 | 1회 푸시 | [Update Payment] |
| PAST_DUE (Day 4-6) | **전체 사용** | 빨간색 긴급 | 재알림 | [Update Payment Now] |
| SUSPENDED (Day 7+) | **읽기 전용** | 빨간색 차단 | 최종 알림 | [Update Payment] + [Export] |
| CANCELED (Day 14+) | Standard | 업그레이드 유도 | 없음 | [Re-subscribe] |

---

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/.../subscription/Subscription.java` | pastDueSince 필드, markPastDue(), canPerformActions 수정 |
| `backend/.../subscription/OrgSubscription.java` | pastDueSince 필드 동일 |
| `backend/.../subscription/service/PolarWebhookService.java` | PAST_DUE 별도 처리 |
| `backend/.../global/scheduler/SubscriptionScheduler.java` | escalatePastDueSubscriptions() 추가 |
| `backend/.../subscription/controller/SubscriptionController.java` | billing-portal URL 엔드포인트 |
| `backend/.../subscription/dto/SubscriptionResponse.java` | pastDueSince, daysPastDue 필드 |
| `backend/.../notification/service/NotificationService.java` | sendPaymentFailedNotification() |
| `backend/src/main/resources/db/migration/V92__*.sql` | past_due_since 컬럼 |
| `frontend/.../components/TrialBanner.tsx` | PAST_DUE 단계별 배너 추가 |
| `frontend/.../components/SubscriptionModal.tsx` | [Update Payment Method] 버튼 추가 |
| `frontend/.../i18n/locales/*/translation.json` (10개) | 결제 실패 관련 키 추가 |

---

## 5. 검증 방법

1. Polar 웹훅 시뮬레이션 (past_due) → PAST_DUE 상태 전환 확인
2. PAST_DUE 상태에서 보드 기능 정상 사용 가능 확인
3. TrialBanner: Day 0-3 → 노란색 경고 표시 확인
4. TrialBanner: Day 4-6 → 빨간색 긴급 표시 + 남은 일수 확인
5. 7일 경과 후 → 스케줄러에 의해 SUSPENDED 전환 확인
6. SUSPENDED → canPerformActions() = false → 기능 차단 확인
7. [Update Payment] → Polar 포털 새 탭 열기 확인
8. 결제 수단 업데이트 후 → Polar 웹훅 (active) → ACTIVE 복원 확인
9. 푸시 알림 수신 확인 (FCM)
10. 모바일 배너 레이아웃 확인
