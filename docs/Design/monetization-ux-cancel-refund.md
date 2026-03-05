# 수익화 UX 개선 #3: 취소/환불 플로우 완성

> **우선순위**: 높음 | **난이도**: 중간 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### 현재 취소 플로우

#### Board 구독 취소 (SubscriptionService.java:160-176)
```
사용자 [Cancel] 클릭
  → SubscriptionModal 확인 모달 (빨간 경고박스)
  → handleCancel() → DELETE /boards/{boardId}/subscription
  → subscription.cancel() → status = CANCELED
  → board.downgradeToStandard()
```

#### Org 구독 취소 (OrgSubscriptionService.java:201-229)
```
사용자 [Cancel Subscription] 클릭
  → OrgBillingSection 확인 모달 (MotionModal)
  → handleCancel() → DELETE /organizations/{orgId}/subscription
  → orgSub.cancel() → status = CANCELED, canceledAt 기록
  → 모든 Board tier → STANDARD 복원
```

### 문제점

1. **즉시 다운그레이드**: 취소 즉시 Premium → Standard. 남은 기간에 대한 안내 없음
   - Polar 구독은 `current_period_end`까지 유효할 수 있으나, BRIDGE에서 즉시 차단
2. **환불 정보 부재**: 취소 시 "환불 가능 여부/금액" 안내 없음
3. **확인 모달 정보 부족**:
   - SubscriptionModal: 간단한 경고 텍스트만 (`cancelConfirmDesc`)
   - 잃게 되는 기능 목록 미표시
   - 남은 구독 기간 미표시
   - AI 크레딧 잔액 미표시
4. **환불 웹훅 미처리**: `PaymentStatus.REFUNDED` 상태는 있으나, Polar `refund.created` 이벤트 핸들러 없음
5. **Polar 구독 연동 부재**: BRIDGE에서 취소해도 Polar 측 구독이 자동 취소되지 않을 수 있음

---

## 2. 개선 방안

### 2.1 취소 = 기간 만료 후 다운그레이드 (Grace Period)

**원칙**: 취소 요청 시 즉시 다운그레이드하지 않고, `current_period_end`까지 Premium 유지.

#### Backend 변경

**Subscription.java — 새 메서드 추가:**
```java
public void requestCancellation() {
    this.cancelRequestedAt = LocalDateTime.now(ZoneOffset.UTC);
    // status는 ACTIVE 유지 → current_period_end에 CANCELED 전환
}

public boolean isCancellationRequested() {
    return this.cancelRequestedAt != null;
}
```

**새 필드:**
```java
@Column(name = "cancel_requested_at")
private LocalDateTime cancelRequestedAt;
```

**SubscriptionService.cancelSubscription() 수정:**
```java
// Before: 즉시 취소
subscription.cancel();
board.downgradeToStandard();

// After: 취소 예약 (기간 만료 시 다운그레이드)
subscription.requestCancellation();
// → 스케줄러가 current_period_end 시점에 실제 cancel() 실행
```

**SubscriptionScheduler — 기간 만료 취소 처리 추가:**
```java
@Scheduled(cron = "0 20 * * * *") // 매시간 :20분
public void processCancellationRequests() {
    List<Subscription> pendingCancels = subscriptionRepository
        .findByCancelRequestedAtNotNullAndCurrentPeriodEndBefore(LocalDateTime.now(ZoneOffset.UTC));

    for (Subscription sub : pendingCancels) {
        sub.cancel();
        Board board = boardRepository.findById(sub.getBoard().getId()).orElse(null);
        if (board != null) board.downgradeToStandard();
    }
}
```

#### Frontend 변경

**SubscriptionModal — Billing 탭 취소 UI 강화:**
```
┌─ [Cancel Subscription] 클릭 시:
│
├─ 확인 모달 (강화 버전)
│  ├─ ⚠️ "Your subscription will remain active until {period_end}"
│  ├─ 잃게 되는 기능 목록:
│  │   ├─ ❌ Weekly Schedule
│  │   ├─ ❌ Milestone Management
│  │   ├─ ❌ Slack Integration
│  │   └─ ❌ Statistics Dashboard
│  ├─ AI 크레딧 잔액: "Remaining {N} credits will expire"
│  ├─ 다음 결제일: "Next payment on {date} will not be charged"
│  │
│  ├─ [Keep Subscription] (primary, 강조)
│  └─ [Cancel Anyway] (ghost, 약한 스타일)
```

**취소 예약 상태 표시 (SubscriptionModal Overview):**
```
Status: ACTIVE (Cancelling on {period_end})
┌─ 노란색 배너
│  ├─ "Your subscription will end on {date}"
│  └─ [Undo Cancellation] 버튼
```

### 2.2 OrgBillingSection 취소 모달 강화

**현재 모달 내용:**
```
"Your subscription will be cancelled..."
[Cancel] [Cancel Subscription]
```

**개선 후:**
```
┌─ 상단 그라데이션 바 (red)
├─ ⚠️ Cancel Organization Subscription?
│
├─ 영향 요약:
│  ├─ "Active until: {period_end}"
│  ├─ "{N} boards will lose Premium features"
│  ├─ "{N} members will be affected"
│  └─ "HR features will become read-only"
│
├─ [Keep Subscription] (primary)
└─ [Cancel Subscription] (red ghost)
```

### 2.3 Polar 웹훅 환불 처리 (향후)

**PolarWebhookService에 추가:**
```java
case "refund.created" -> processRefund(metadata);

private void processRefund(Map<String, String> metadata) {
    String boardId = metadata.get("board_id");
    // PaymentHistory 상태 → REFUNDED 업데이트
    paymentHistoryRepository.findByPgTransactionId(metadata.get("order_id"))
        .ifPresent(ph -> ph.updateStatus(PaymentStatus.REFUNDED));
}
```

### 2.4 Flyway 마이그레이션

```sql
-- V91__add_cancel_requested_at.sql
ALTER TABLE subscriptions ADD COLUMN cancel_requested_at TIMESTAMP;
ALTER TABLE org_subscriptions ADD COLUMN cancel_requested_at TIMESTAMP;
```

---

## 3. 취소 플로우 시퀀스 (개선 후)

```
사용자 [Cancel] 클릭
  → 강화된 확인 모달 (잃는 기능, 남은 기간, 크레딧 표시)
  → [Cancel Anyway] 클릭
  → API: DELETE /boards/{boardId}/subscription
  → Backend: subscription.requestCancellation()
  → 상태: ACTIVE (cancel_requested_at 설정)
  → FE: "Active until {date}" 배너 표시 + [Undo] 버튼

  ... {date} 도래 ...

  → Scheduler: subscription.cancel() + board.downgradeToStandard()
  → 상태: CANCELED
```

---

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/.../subscription/Subscription.java` | cancelRequestedAt 필드, requestCancellation(), isCancellationRequested() |
| `backend/.../subscription/OrgSubscription.java` | cancelRequestedAt 필드 동일 |
| `backend/.../subscription/service/SubscriptionService.java` | cancelSubscription → requestCancellation 방식 변경 |
| `backend/.../subscription/service/OrgSubscriptionService.java` | cancel → requestCancellation 방식 변경 |
| `backend/.../global/scheduler/SubscriptionScheduler.java` | processCancellationRequests() 추가 |
| `backend/.../subscription/service/PolarWebhookService.java` | refund.created 이벤트 핸들러 추가 |
| `backend/.../subscription/dto/SubscriptionResponse.java` | cancelRequestedAt 필드 노출 |
| `backend/src/main/resources/db/migration/V91__*.sql` | cancel_requested_at 컬럼 추가 |
| `frontend/.../components/SubscriptionModal.tsx` | 확인 모달 강화, 취소 예약 배너 추가 |
| `frontend/.../components/organization/subscription/OrgBillingSection.tsx` | 취소 모달 강화 |
| `frontend/.../i18n/locales/*/translation.json` | 취소 관련 키 추가 |

---

## 5. 검증 방법

1. Board 구독 취소 → "Active until {date}" 배너 확인 → Premium 기능 계속 사용 가능
2. [Undo Cancellation] 클릭 → 취소 예약 해제 확인
3. `current_period_end` 경과 후 → 스케줄러에 의해 CANCELED + STANDARD 전환 확인
4. Org 취소 → 영향받는 보드/멤버 수 표시 확인
5. 모바일에서 확인 모달 레이아웃 정상 확인
