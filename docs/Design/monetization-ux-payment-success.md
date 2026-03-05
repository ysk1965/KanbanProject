# 수익화 UX 개선 #5: 결제 완료 UX 개선

> **우선순위**: 낮음 | **난이도**: 낮음 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### PaymentSuccessPage.tsx (현재)

**파일**: `frontend/src/app/pages/PaymentSuccessPage.tsx`

**현재 동작:**
1. URL 파라미터에서 `board_id` 추출
2. 2초 간격, 최대 30초 폴링 (`POLL_INTERVAL_MS=2000`, `POLL_MAX_MS=30000`)
3. 구독 상태가 `ACTIVE`가 되면 2초 후 보드 리다이렉트

**현재 UI 상태:**
```
[processing] → Loader2 스피너 + "결제 처리 중..."
[success]    → CheckCircle (teal) + "결제 완료!" → 2초 후 리다이렉트
[timeout]    → AlertCircle (amber) + Refresh/Go To Board 버튼
[error]      → AlertCircle (red) + 돌아가기 버튼
```

### PaymentFailPage.tsx (현재)

**파일**: `frontend/src/app/pages/PaymentFailPage.tsx`

**현재 동작:**
- URL에서 `code`, `message` 파라미터 추출
- XCircle (red) + 에러 메시지 표시
- [Try Again] → 홈으로 이동

### 문제점

1. **축하 경험 부재**: 결제 완료 후 단순 체크 아이콘 + "결제 완료!" 텍스트만 → 2초 후 사라짐
2. **프리미엄 가치 전달 없음**: 결제 후 어떤 기능이 활성화되었는지 안내 없음
3. **30초 타임아웃**: Polar 웹훅 지연 시 사용자가 결제 실패로 오해
4. **processing 상태 UX**: 단순 스피너만 → 진행 상태 불분명
5. **실패 페이지**: 에러 코드만 표시 → 사용자가 원인/해결 방법 모름

---

## 2. 개선 방안

### 2.1 결제 완료 축하 화면 (Success State 강화)

**현재:**
```
✅ 결제 완료!
(2초 후 자동 이동)
```

**개선 후:**
```
┌─────────────────────────────────────┐
│                                     │
│    🎉 (Confetti 애니메이션)          │
│                                     │
│    Welcome to Premium!              │
│    "Your board is now upgraded"     │
│                                     │
│    ┌─ 활성화된 기능 ──────────────┐  │
│    │ ✅ Weekly Schedule           │  │
│    │ ✅ Milestone Management     │  │
│    │ ✅ Slack Integration        │  │
│    │ ✅ Statistics Dashboard     │  │
│    │ ✅ AI Credits: 350/month    │  │
│    └─────────────────────────────┘  │
│                                     │
│    ┌─ 구독 요약 ─────────────────┐  │
│    │ Plan: Premium               │  │
│    │ Seats: 3                    │  │
│    │ Billing: $15/month          │  │
│    │ Next payment: Apr 4, 2026   │  │
│    └─────────────────────────────┘  │
│                                     │
│    [Go to Board →] (primary CTA)    │
│                                     │
│    자동 이동 5초 (프로그레스 바)      │
│                                     │
└─────────────────────────────────────┘
```

### 2.2 Processing 상태 개선

**현재:** 단순 Loader2 스피너

**개선 후:**
```
┌─────────────────────────────────┐
│                                 │
│    ⏳ Processing Payment...     │
│                                 │
│    ██████████░░░░░ 65%          │
│    "Activating your premium"    │
│                                 │
│    Step 1: ✅ Payment received  │
│    Step 2: ⏳ Activating...     │
│    Step 3: ○ Setting up AI      │
│                                 │
└─────────────────────────────────┘
```

**스텝 시뮬레이션 (실제 폴링과 별개로 UX 안정감 제공):**
```typescript
// 시간 기반 가상 진행률
const steps = [
  { label: 'Payment received', delay: 0 },
  { label: 'Activating premium features', delay: 3000 },
  { label: 'Setting up AI credits', delay: 8000 },
];
```

### 2.3 Timeout 상태 개선

**현재:**
```
⚠️ 처리 시간이 초과되었습니다
[Refresh] [Go to Board]
```

**개선 후:**
```
┌─────────────────────────────────┐
│                                 │
│    ⏳ Still processing...       │
│                                 │
│    "Payment was received but    │
│     activation is taking        │
│     longer than usual."         │
│                                 │
│    "Your premium features will  │
│     be available within a few   │
│     minutes."                   │
│                                 │
│    [Go to Board] (primary)      │
│    [Check Status] (secondary)   │
│                                 │
└─────────────────────────────────┘
```

> 타임아웃을 "실패"가 아닌 "지연"으로 표현 → 불안감 감소

### 2.4 실패 페이지 개선

**현재:** 에러 코드 + "Try Again" 버튼

**개선 후:**
```
┌─────────────────────────────────┐
│                                 │
│    ❌ Payment Failed            │
│                                 │
│    에러별 안내 메시지:            │
│    ├─ card_declined:            │
│    │  "카드 결제가 거절됨.       │
│    │   다른 카드를 사용하거나    │
│    │   카드사에 문의하세요."     │
│    ├─ insufficient_funds:       │
│    │  "잔액이 부족합니다."       │
│    └─ default:                  │
│       "일시적 오류입니다.        │
│        잠시 후 다시 시도해주세요."│
│                                 │
│    [Try Again] (primary)        │
│    [Contact Support] (ghost)    │
│                                 │
└─────────────────────────────────┘
```

### 2.5 자동 리다이렉트 시간 연장

```typescript
// Before: 2초 (너무 짧아 축하 화면을 볼 수 없음)
setTimeout(() => navigate(`/boards/${boardId}`), 2000);

// After: 5초 + 프로그레스 바
const REDIRECT_DELAY = 5000;
// 프로그레스 바로 남은 시간 시각화
// [Go to Board] 클릭 시 즉시 이동 가능
```

---

## 3. 구현 세부사항

### Confetti 애니메이션

```typescript
// canvas-confetti 라이브러리 (가벼움, ~5KB)
import confetti from 'canvas-confetti';

// 결제 완료 시 1회 실행
confetti({
  particleCount: 100,
  spread: 70,
  origin: { y: 0.6 },
  colors: ['#6366F1', '#2DD4BF', '#F59E0B'],  // bridge-accent, bridge-secondary, amber
});
```

> 또는 CSS-only confetti로 외부 의존성 없이 구현 가능

### i18n 키 추가

```json
{
  "payment": {
    "successTitle": "Welcome to Premium!",
    "successDesc": "Your board is now upgraded",
    "activatedFeatures": "Activated Features",
    "subscriptionSummary": "Subscription Summary",
    "goToBoard": "Go to Board",
    "autoRedirect": "Redirecting in {{seconds}}s...",
    "stillProcessing": "Still processing...",
    "processingDelayDesc": "Payment received but activation is taking longer than usual.",
    "willBeAvailable": "Premium features will be available within minutes.",
    "checkStatus": "Check Status",
    "failedCardDeclined": "Your card was declined. Try a different card.",
    "failedInsufficientFunds": "Insufficient funds. Please check your balance.",
    "failedDefault": "A temporary error occurred. Please try again.",
    "contactSupport": "Contact Support"
  }
}
```

---

## 4. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/app/pages/PaymentSuccessPage.tsx` | 축하 화면, 진행 스텝, 프로그레스 바 |
| `frontend/src/app/pages/PaymentFailPage.tsx` | 에러별 안내 메시지, 지원 링크 |
| `frontend/src/app/i18n/locales/*/translation.json` (10개) | payment 키 ~15개 추가 |
| `frontend/package.json` | canvas-confetti 추가 (선택사항) |

---

## 5. 검증 방법

1. Polar 체크아웃 완료 → PaymentSuccessPage 축하 화면 표시 확인
2. 활성화된 기능 목록 + 구독 요약 정보 정확성 확인
3. 5초 카운트다운 프로그레스 바 동작 확인
4. [Go to Board] 클릭 시 즉시 이동 확인
5. 30초 타임아웃 → "Still processing" 메시지 (실패 아님) 확인
6. 결제 실패 → 에러 코드별 안내 메시지 확인
7. 모바일 375px에서 레이아웃 확인
8. 다크/라이트 모드 확인
