# 수익화 UX 개선 #2: 통화 통일

> **우선순위**: 높음 | **난이도**: 중간 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### 현재 통화 체계

| 영역 | 백엔드 단위 | 프론트엔드 표시 | 실제 통화 |
|------|-----------|---------------|----------|
| Board Subscription | 센트 (500, 5000) | `$5`, `$50` | **USD** |
| Org Subscription | 원 (1500, 15000) | `$15` | **KRW** (하지만 $ 표시) |
| AI Credits | 원 (1000/100 credits) | - | **KRW** |
| Pricing API | DB 값 | - | currency: "KRW" 하드코딩 |

### 코드 위치

**Backend 가격 상수:**
```java
// Subscription.java (Board) — USD 센트
MONTHLY_PRICE_PER_SEAT = 500    // $5.00
YEARLY_PRICE_PER_SEAT = 5000    // $50.00

// OrgSubscription.java (Org) — KRW
MONTHLY_PRICE_PER_SEAT = 1500   // ₩1,500
YEARLY_PRICE_PER_SEAT = 15000   // ₩15,000
```

**Frontend 가격 상수:**
```typescript
// UpgradeModal.tsx:28-31 — USD (달러 단위)
PRICE_PER_SEAT = { monthly: 5, yearly: 50 }

// OrgPlanSelector.tsx:87,98 — "$15" (달러 표기지만 실제 KRW)
price: '$15', priceUnit: '/seat/mo'

// OrgBillingSection.tsx:110-112
formatCurrency = (amount) => `$${amount.toLocaleString()}`
```

**Pricing API 응답:**
```java
// SubscriptionResponse.java:96
.currency("KRW")  // ← 하드코딩, Board는 실제 USD인데 KRW 표시
```

### 문제점

1. **Board(USD) vs Org(KRW) 통화 혼재**: 같은 서비스에서 두 통화 사용
2. **Org 가격 `$15` 표기**: 실제 ₩1,500인데 달러 기호 사용 → 사용자 오해
3. **Pricing API `currency: "KRW"`**: Board 가격도 KRW로 반환 → 불일치
4. **마이그레이션 프로레이션**: Board(USD) → Org(KRW) 전환 시 환율 처리 없음

---

## 2. 개선 방안

### 방향: USD 통일

글로벌 SaaS 서비스 특성상 **USD 통일**이 적합.
- 다국어 10개 언어 지원 중 → 글로벌 사용자 대상
- Polar.sh 결제 플랫폼이 USD 기반
- KRW 가격은 Polar 측에서 자동 환율 적용

### 2.1 Backend 변경

#### OrgSubscription.java 가격 상수 변경

```java
// Before (KRW)
private static final int MONTHLY_PRICE_PER_SEAT = 1500;
private static final int YEARLY_PRICE_PER_SEAT = 15000;

// After (USD cents)
private static final int MONTHLY_PRICE_PER_SEAT = 1500;  // $15.00
private static final int YEARLY_PRICE_PER_SEAT = 15000;   // $150.00
```

> **주의**: 숫자 값은 동일하지만 **단위가 KRW → USD 센트로 변경**.
> Org 플랜이 $15/seat/month, $150/seat/year가 됨.

#### SubscriptionResponse.java Pricing API 수정

```java
// Before
.currency("KRW")

// After
.currency("USD")
```

#### Response DTO에 currency 필드 추가

```java
// SubscriptionResponse.Detail에 추가
private String currency = "USD";

// OrgSubscriptionResponse에 추가
String currency  // "USD"
```

### 2.2 Frontend 변경

#### OrgPlanSelector.tsx 가격 표시

```typescript
// Before
price: '$15', priceUnit: '/seat/mo'

// After (센트 → 달러 변환)
price: `$${subscription.price_per_seat / 100}`,
priceUnit: '/seat/mo'
```

#### OrgBillingSection.tsx formatCurrency 함수

```typescript
// Before — 원 단위 그대로 표시
const formatCurrency = (amount: number) => {
  return `$${amount.toLocaleString()}`;
};

// After — 센트 → 달러 변환
const formatCurrency = (amountInCents: number) => {
  return `$${(amountInCents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
};
```

#### UpgradeModal.tsx — 이미 올바름 (달러 단위)

```typescript
// 현재 상태 유지 (Board 구독은 이미 USD 달러 단위)
PRICE_PER_SEAT = { monthly: 5, yearly: 50 }
```

### 2.3 Landing Page 가격 표시 통일

```
LandingPage.tsx Pricing 섹션:
- Basic: $0 (유지)
- Premium: $5/user/mo (유지)
- Team(Org): $15/seat/mo (USD로 명시)
```

---

## 3. 마이그레이션 고려사항

### 기존 Org 구독자 가격 처리

- 현재 Org 구독자가 없거나 극소수라면: **즉시 전환** (기존 KRW 가격 무효화)
- 기존 구독자가 있다면:
  - DB의 `price_per_seat`, `total_price` 값을 USD 센트로 마이그레이션
  - Flyway 마이그레이션 스크립트 추가 (V91)

### Polar 상품 정리

```
Board Monthly: $5/seat  (기존 유지)
Board Yearly:  $50/seat (기존 유지)
Org Monthly:   $15/seat (신규 생성 or 수정)
Org Yearly:    $150/seat (신규 생성 or 수정)
```

---

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/.../subscription/OrgSubscription.java` | 가격 상수 주석 변경 (센트 단위 명시) |
| `backend/.../subscription/dto/SubscriptionResponse.java` | currency "KRW" → "USD" |
| `backend/.../subscription/dto/OrgSubscriptionResponse.java` | currency 필드 추가 |
| `frontend/.../components/UpgradeModal.tsx` | 변경 없음 (이미 USD) |
| `frontend/.../components/organization/subscription/OrgBillingSection.tsx` | formatCurrency 센트→달러 변환 |
| `frontend/.../components/organization/subscription/OrgPlanSelector.tsx` | 가격 표시 수정 |
| `frontend/.../components/landing/LandingPage.tsx` | Org 가격 표시 USD 명시 |
| `frontend/.../i18n/locales/*/translation.json` | 가격 관련 문구 업데이트 |

---

## 5. 검증 방법

1. Board 구독 모달: 가격이 `$5/month`, `$50/year`로 표시 확인
2. Org 플랜 선택: 가격이 `$15/seat/month`로 표시 확인
3. Org 청구 섹션: `formatCurrency()` 결과가 달러 단위인지 확인
4. Pricing API (`GET /api/v1/pricing`): `currency: "USD"` 응답 확인
5. Landing 페이지 Pricing 섹션: 3개 플랜 가격 USD 통일 확인
6. Board→Org 마이그레이션 미리보기: 동일 통화 비교 가능 확인
