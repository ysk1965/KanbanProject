# BRIDGE 결제 시스템 개편: Toss Payments → Polar.sh

> **작성일**: 2026-03-03
> **목적**: 사업자 등록 없이 결제 수익화를 위한 Polar.sh(MoR) 전면 전환

---

## 1. 현재 결제 시스템 현황

### 1.1 구독 모델 (2개)

| 구분 | Board Subscription | Org Subscription |
|------|-------------------|-----------------|
| 단위 | 보드별 | 조직별 |
| 통화 | USD (센트) | KRW (원) |
| 시트 가격 (월) | $5/seat | ₩1,500/seat |
| 시트 가격 (연) | $50/seat | ₩15,000/seat |
| Trial | 7일 | 7일 |
| 상태 머신 | TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELED | 동일 |

### 1.2 AI 크레딧 시스템

| 항목 | 값 |
|------|-----|
| 단가 | ₩10/credit (100단위 구매) |
| TRIAL 할당 | 100/월 |
| STANDARD 할당 | 30/월 |
| PREMIUM 할당 | 200 + (seats × 50)/월 |
| 소비 순서 | 월간 무료 → 구매 크레딧 (FIFO) |
| 동시성 제어 | Pessimistic Lock |

### 1.3 토스페이먼츠 연동 현황

**Backend (교체 대상)**

| 파일 | 역할 |
|------|------|
| `TossPaymentsConfig.java` | clientKey, secretKey, confirmUrl 설정 |
| `TossPaymentsService.java` | Basic Auth → POST /v1/payments/confirm |
| `TossPaymentResponse.java` | 응답 DTO (paymentKey, status, totalAmount) |
| `SubscriptionService.java` | confirmAndStartSubscription(), confirmAndPurchaseSeats() |
| `OrgSubscriptionService.java` | confirmAndActivateTeam() |
| `AiCreditService.java` | purchaseCredits() 내 Toss 결제 확인 |

**Frontend (교체 대상)**

| 파일 | 역할 |
|------|------|
| `@tosspayments/tosspayments-sdk` | npm 패키지 (동적 import) |
| `services.ts` | startSeatSubscription(), purchaseSeats() → Toss SDK 호출 |
| `api.ts` | confirmSubscriptionPayment(), confirmSeatPurchasePayment() |
| `PaymentSuccessPage.tsx` | Toss 리다이렉트 후 백엔드 확인 API 호출 |
| `PaymentFailPage.tsx` | 결제 실패 처리 |
| `UpgradeModal.tsx` | Toss 결제 트리거 |
| `SeatPurchaseModal.tsx` | 시트 추가 → Toss 결제 |
| `AiCreditPurchaseModal.tsx` | 크레딧 구매 |
| `SubscriptionModal.tsx` | 구독 관리 UI |

### 1.4 결제 플로우 (현재)

```
[Frontend]                    [Toss Payments]              [Backend]
    │                              │                          │
    ├─ loadTossPayments(clientKey)─▶│                          │
    ├─ requestPayment({amount})───▶│                          │
    │                              ├─ 결제창 표시 ──▶ 사용자 결제 │
    │                              ├─ paymentKey 발급 ────────▶│
    │◀─ successUrl 리다이렉트──────│                          │
    ├─ confirmPayment(paymentKey) ─────────────────────────▶│
    │                              │   ◀─ POST /confirm ─────│
    │                              │   ─── 승인 응답 ────────▶│
    │◀──────── 구독 활성화 응답 ──────────────────────────────│
```

---

## 2. Polar.sh 전환 이유

| 항목 | Toss Payments | Polar.sh |
|------|--------------|----------|
| **사업자 등록** | **필수** | **불필요** (MoR) |
| 세금/VAT 처리 | 직접 신고 | Polar 대행 |
| 환불 처리 | 직접 구현 | Polar 대시보드 |
| 구독 관리 | 직접 구현 | 내장 (갱신/dunning) |
| 글로벌 결제 | 한국 중심 | 글로벌 (Stripe 기반) |
| 수수료 | ~3.5% | 4% + $0.40 |
| 한국 간편결제 | 지원 | 미지원 (카드만) |
| SDK | JS SDK | JS/TS SDK + REST API |

**결정**: 사업자 등록 불가 → Polar.sh 전면 전환 (한국 사용자도 해외 카드 결제)

---

## 3. Polar.sh 핵심 개념

### 3.1 Merchant of Record (MoR)

```
[사용자] ──결제──▶ [Polar (법적 판매자)] ──정산──▶ [개발자 계좌]
                       │
                  세금/VAT/환불 처리
```

- Polar가 법적 판매자 → 개발자는 사업자 등록 불필요
- 글로벌 세금 자동 처리
- Stripe Connect로 개발자 계좌에 정산

### 3.2 Polar Product 구조

```
Organization (Polar 계정)
  └── Products
       ├── BRIDGE Board Premium (Monthly)  ← 구독 상품
       ├── BRIDGE Board Premium (Yearly)   ← 구독 상품
       ├── BRIDGE Org Team (Monthly)       ← 구독 상품
       ├── BRIDGE Org Team (Yearly)        ← 구독 상품
       └── AI Credit Pack (100)            ← 단건 상품
```

### 3.3 Polar 결제 플로우

```
[Frontend]              [Polar]                    [Backend]
    │                      │                          │
    ├─ Checkout 생성 ─────▶│                          │
    │◀─ checkout URL ──────│                          │
    ├─ 리다이렉트/임베드 ──▶│                          │
    │                      ├─ 결제 처리                │
    │                      ├─ Webhook 전송 ──────────▶│
    │                      │                   구독 활성화
    │◀─ success 리다이렉트──│                          │
    ├─ 구독 상태 조회 ──────────────────────────────▶│
    │◀─ 업데이트된 상태 ──────────────────────────────│
```

---

## 4. 가격 체계 통일

### 4.1 현재 → 개편

현재 Board(USD)와 Org(KRW) 통화가 분리되어 있습니다.
Polar는 **USD 기본**이므로 통화를 통일합니다.

| 상품 | 현재 | 개편 (USD) |
|------|------|-----------|
| Board Premium (월) | $5/seat | $5/seat |
| Board Premium (연) | $50/seat | $50/seat |
| Org Team (월) | ₩1,500/seat | $1.5/seat (또는 $2/seat 재조정) |
| Org Team (연) | ₩15,000/seat | $15/seat (또는 $20/seat 재조정) |
| AI Credit 100개 | ₩1,000 | $1 |

> **참고**: Org 가격이 Board 대비 매우 저렴한데, 이 기회에 가격 체계를 재조정할 수 있음

### 4.2 Polar Product 설계

```
Products:
  1. "Board Premium Monthly" - Recurring, $5/seat
  2. "Board Premium Yearly"  - Recurring, $50/seat (17% off)
  3. "Org Team Monthly"      - Recurring, $2/seat
  4. "Org Team Yearly"       - Recurring, $20/seat
  5. "AI Credits 100"        - One-time, $1
  6. "AI Credits 500"        - One-time, $5
  7. "AI Credits 1000"       - One-time, $10
```

---

## 5. 개편 아키텍처

### 5.1 Backend 변경

#### 삭제 대상

| 파일 | 이유 |
|------|------|
| `TossPaymentsConfig.java` | Polar 설정으로 대체 |
| `TossPaymentsService.java` | Polar Webhook으로 대체 |
| `TossPaymentResponse.java` | Polar Webhook DTO로 대체 |

#### 신규 생성

| 파일 | 역할 |
|------|------|
| `PolarConfig.java` | Polar API Key, Webhook Secret 설정 |
| `PolarWebhookController.java` | Webhook 수신 엔드포인트 |
| `PolarWebhookService.java` | Webhook 이벤트 처리 로직 |
| `PolarApiClient.java` | Polar REST API 호출 (Checkout 생성 등) |
| `PolarCheckoutRequest.java` | Checkout 요청 DTO |
| `PolarWebhookEvent.java` | Webhook 이벤트 DTO |

#### 수정 대상

| 파일 | 변경 내용 |
|------|----------|
| `SubscriptionService.java` | Toss confirm → Polar Webhook 기반 활성화 |
| `OrgSubscriptionService.java` | 동일 |
| `AiCreditService.java` | 크레딧 구매 시 Polar Checkout 생성 |
| `SubscriptionController.java` | confirm 엔드포인트 제거, checkout 생성 추가 |
| `OrgSubscriptionController.java` | 동일 |
| `PaymentHistory.java` | pgProvider: "POLAR" 추가 |
| `OrgPaymentHistory.java` | 동일 |

#### Webhook 이벤트 처리

```java
@RestController
@RequestMapping("/api/v1/webhooks/polar")
public class PolarWebhookController {

    @PostMapping
    public ResponseEntity<Void> handleWebhook(
            @RequestHeader("webhook-id") String webhookId,
            @RequestHeader("webhook-signature") String signature,
            @RequestBody String payload) {

        // 1. 서명 검증
        polarWebhookService.verifySignature(payload, signature);

        // 2. 이벤트 파싱
        PolarWebhookEvent event = parseEvent(payload);

        // 3. 이벤트별 처리
        switch (event.type()) {
            case "checkout.created" -> handleCheckoutCreated(event);
            case "subscription.created" -> handleSubscriptionCreated(event);
            case "subscription.updated" -> handleSubscriptionUpdated(event);
            case "subscription.canceled" -> handleSubscriptionCanceled(event);
            case "order.created" -> handleOrderCreated(event);  // 단건 구매 (AI Credit)
        }

        return ResponseEntity.ok().build();
    }
}
```

#### 설정 (application.yml)

```yaml
# 기존 (삭제)
toss:
  payments:
    client-key: ${TOSS_CLIENT_KEY}
    secret-key: ${TOSS_SECRET_KEY}
    confirm-url: https://api.tosspayments.com/v1/payments/confirm

# 신규 (추가)
polar:
  api-key: ${POLAR_API_KEY}
  webhook-secret: ${POLAR_WEBHOOK_SECRET}
  organization-id: ${POLAR_ORG_ID}
  base-url: https://api.polar.sh
```

### 5.2 Frontend 변경

#### 삭제 대상

| 파일/항목 | 이유 |
|----------|------|
| `@tosspayments/tosspayments-sdk` | npm 제거 |
| `PaymentSuccessPage.tsx` | Polar 성공 페이지로 대체 |
| `PaymentFailPage.tsx` | Polar 실패 처리로 대체 |
| `services.ts` 내 Toss SDK 호출 코드 | Polar Checkout으로 대체 |
| `api.ts` 내 confirm 엔드포인트 | Webhook 기반이므로 불필요 |

#### 신규/수정

| 파일 | 변경 내용 |
|------|----------|
| `api.ts` | `createCheckout()` API 추가, confirm 엔드포인트 제거 |
| `services.ts` | Toss SDK → `createCheckout()` 호출 후 Polar URL 리다이렉트 |
| `UpgradeModal.tsx` | Polar Checkout URL로 리다이렉트 |
| `SeatPurchaseModal.tsx` | 동일 |
| `AiCreditPurchaseModal.tsx` | 동일 |
| `SubscriptionModal.tsx` | 구독 관리 (Polar Customer Portal 링크 추가 가능) |
| `PaymentCallbackPage.tsx` (신규) | Polar 결제 완료 후 콜백 처리 |

#### 결제 플로우 (개편 후)

```
[Frontend]                     [Backend]                    [Polar]
    │                              │                          │
    ├─ POST /checkout/create ────▶│                          │
    │   { product_id, metadata }   ├─ Polar API 호출 ────────▶│
    │                              │◀─ checkout URL ──────────│
    │◀─ { checkout_url } ─────────│                          │
    │                              │                          │
    ├─ window.open(checkout_url) ─────────────────────────▶│
    │                              │                    결제 처리
    │                              │◀──── Webhook ────────────│
    │                              │   구독/크레딧 업데이트      │
    │◀─ success_url 리다이렉트 ────────────────────────────────│
    │                              │                          │
    ├─ GET /subscription ────────▶│                          │
    │◀─ 업데이트된 상태 ──────────│                          │
```

### 5.3 Metadata 활용

Polar Checkout 생성 시 `metadata`에 BRIDGE 내부 정보를 담아 Webhook에서 활용:

```json
{
  "metadata": {
    "bridge_type": "board_subscription",
    "board_id": "board-uuid",
    "user_id": "user-uuid",
    "billing_cycle": "MONTHLY",
    "seat_count": 5
  }
}
```

```json
{
  "metadata": {
    "bridge_type": "ai_credit",
    "board_id": "board-uuid",
    "user_id": "user-uuid",
    "credit_amount": 100
  }
}
```

Webhook 수신 시 metadata를 파싱하여 구독 활성화 / 크레딧 충전 처리.

---

## 6. 유지되는 것들 (변경 없음)

| 항목 | 이유 |
|------|------|
| `Subscription.java` Entity | 상태 관리 로직 유지 (Polar 결제 결과를 반영) |
| `OrgSubscription.java` Entity | 동일 |
| `AiCreditService.java` 크레딧 소비 로직 | PG사와 무관 (내부 로직) |
| AI 크레딧 Pessimistic Lock | 동시성 제어 유지 |
| 구독 상태 머신 (TRIAL→ACTIVE→...) | 내부 비즈니스 로직 유지 |
| 월간 크레딧 리셋 (Scheduler) | 내부 로직 |
| Board → Org 마이그레이션 로직 | 결제만 Polar로 변경 |
| `SubscriptionModal.tsx` (UI 구조) | 스타일 유지, 결제 트리거만 변경 |
| `UpgradeModal.tsx` (UI 구조) | 동일 |
| i18n 키 구조 | 일부 문구만 수정 |
| 402 AI Credit Exhausted 흐름 | 유지 |

---

## 7. 마이그레이션 단계

### Phase 1: Polar 설정 (1일)

- [ ] Polar.sh 계정 생성
- [ ] Stripe Connect 연결 (정산 계좌)
- [ ] Product 생성 (구독 4개 + 크레딧 3개)
- [ ] Webhook URL 설정 (`https://api.bridge.app/api/v1/webhooks/polar`)
- [ ] API Key, Webhook Secret 발급

### Phase 2: Backend 개편 (2~3일)

- [ ] `PolarConfig.java` 생성
- [ ] `PolarApiClient.java` 생성 (Checkout 생성 API)
- [ ] `PolarWebhookController.java` 생성
- [ ] `PolarWebhookService.java` 생성 (이벤트별 처리)
- [ ] `SubscriptionController.java` 수정 (checkout 엔드포인트 추가)
- [ ] `SubscriptionService.java` 수정 (Toss confirm → Webhook 기반)
- [ ] `OrgSubscriptionController.java` 수정
- [ ] `OrgSubscriptionService.java` 수정
- [ ] `AiCreditController.java` 수정 (크레딧 구매 checkout)
- [ ] `PaymentHistory` pgProvider에 "POLAR" 추가
- [ ] `TossPaymentsService.java` 삭제
- [ ] `TossPaymentsConfig.java` 삭제
- [ ] `TossPaymentResponse.java` 삭제
- [ ] 환경 변수 업데이트 (TOSS_* → POLAR_*)

### Phase 3: Frontend 개편 (2~3일)

- [ ] `@tosspayments/tosspayments-sdk` npm 제거
- [ ] `api.ts` 수정 (confirm 제거, checkout 추가)
- [ ] `services.ts` 수정 (Toss SDK → Polar Checkout 리다이렉트)
- [ ] `PaymentCallbackPage.tsx` 생성 (Polar 결제 후 콜백)
- [ ] `UpgradeModal.tsx` 수정 (Polar Checkout 호출)
- [ ] `SeatPurchaseModal.tsx` 수정
- [ ] `AiCreditPurchaseModal.tsx` 수정
- [ ] `SubscriptionModal.tsx` 수정
- [ ] `PaymentSuccessPage.tsx` → `PaymentCallbackPage.tsx` 전환
- [ ] `PaymentFailPage.tsx` 수정
- [ ] 라우터 업데이트
- [ ] i18n 결제 관련 문구 업데이트
- [ ] `VITE_TOSS_CLIENT_KEY` 환경 변수 제거

### Phase 4: 테스트 (1~2일)

- [ ] Polar Sandbox 환경 테스트
- [ ] Board 구독 플로우 (Trial → 결제 → Active)
- [ ] Org 구독 플로우
- [ ] AI 크레딧 구매 플로우
- [ ] 시트 추가 구매 플로우
- [ ] 구독 취소 플로우
- [ ] Webhook 수신/처리 검증
- [ ] 환불 처리 테스트
- [ ] Board → Org 마이그레이션 테스트

### Phase 5: 배포 (1일)

- [ ] 환경 변수 배포 (dev → prod)
- [ ] Polar Webhook URL 프로덕션 설정
- [ ] Polar Product ID 프로덕션 매핑
- [ ] 기존 구독자 마이그레이션 계획 (해당 시)

---

## 8. 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| 한국 사용자 결제 마찰 | 간편결제 불가, 해외결제 카드 필요 | 결제 안내 문구 추가, FAQ |
| Polar 서비스 장애 | 결제 불가 | Webhook 재시도 메커니즘, 수동 복구 |
| 환율 변동 | KRW 사용자 가격 변동 | USD 고정 가격으로 통일 |
| 기존 구독자 전환 | 결제 수단 재등록 필요 | 안내 이메일, 유예 기간 |
| Webhook 유실 | 구독 미활성화 | Webhook 수신 로그 + 주기적 Polar API 동기화 |

---

## 9. 환경 변수 변경

### 삭제

```bash
TOSS_CLIENT_KEY=pk_test_...
TOSS_SECRET_KEY=sk_test_...
VITE_TOSS_CLIENT_KEY=pk_test_...
```

### 추가

```bash
POLAR_API_KEY=polar_sk_...
POLAR_WEBHOOK_SECRET=whsec_...
POLAR_ORG_ID=org_...

# Product IDs (Polar 대시보드에서 생성 후 매핑)
POLAR_PRODUCT_BOARD_MONTHLY=prod_...
POLAR_PRODUCT_BOARD_YEARLY=prod_...
POLAR_PRODUCT_ORG_MONTHLY=prod_...
POLAR_PRODUCT_ORG_YEARLY=prod_...
POLAR_PRODUCT_CREDIT_100=prod_...
POLAR_PRODUCT_CREDIT_500=prod_...
POLAR_PRODUCT_CREDIT_1000=prod_...
```

---

## 10. API 엔드포인트 변경 요약

### 삭제

| 엔드포인트 | 이유 |
|-----------|------|
| `POST /api/v1/payments/confirm/subscription` | Webhook 대체 |
| `POST /api/v1/payments/confirm/seats` | Webhook 대체 |
| `POST /api/v1/payments/confirm/org-subscription` | Webhook 대체 |

### 추가

| 엔드포인트 | 역할 |
|-----------|------|
| `POST /api/v1/checkout/board-subscription` | Board 구독 Checkout 생성 |
| `POST /api/v1/checkout/org-subscription` | Org 구독 Checkout 생성 |
| `POST /api/v1/checkout/ai-credits` | AI 크레딧 Checkout 생성 |
| `POST /api/v1/checkout/seats` | 시트 추가 Checkout 생성 |
| `POST /api/v1/webhooks/polar` | Polar Webhook 수신 |

### 유지

| 엔드포인트 | 비고 |
|-----------|------|
| `GET /api/v1/boards/{boardId}/subscription` | 그대로 유지 |
| `PUT /api/v1/boards/{boardId}/subscription/plan` | 유지 (내부 로직) |
| `DELETE /api/v1/boards/{boardId}/subscription` | 유지 + Polar 취소 API 호출 추가 |
| `GET /api/v1/boards/{boardId}/ai-credits` | 그대로 유지 |
| `GET /api/v1/boards/{boardId}/ai-credits/purchases` | 그대로 유지 |
| `GET /api/v1/boards/{boardId}/ai-credits/usage` | 그대로 유지 |
| `GET /api/v1/pricing` | 그대로 유지 |

---

## 11. 예상 작업량

| Phase | 작업 | 일수 |
|-------|------|------|
| 1 | Polar 설정 | 1일 |
| 2 | Backend 개편 | 2~3일 |
| 3 | Frontend 개편 | 2~3일 |
| 4 | 테스트 | 1~2일 |
| 5 | 배포 | 1일 |
| **합계** | | **7~10일** |

---

## 12. 참고 자료

- [Polar.sh 공식 문서](https://polar.sh/docs)
- [Polar MoR 설명](https://polar.sh/docs/merchant-of-record/introduction)
- [Polar SDK (npm)](https://www.npmjs.com/package/@polar-sh/sdk)
- [Polar Webhook 문서](https://polar.sh/docs/integrate/webhooks)
- [Polar Checkout 문서](https://polar.sh/docs/integrate/checkout)
- [Polar API Reference](https://polar.sh/docs/api)
