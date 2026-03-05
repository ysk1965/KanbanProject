# 수익화 UX 개선 #1: 에러 핸들링 통일

> **우선순위**: 높음 | **난이도**: 낮음 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### 현재 에러 핸들링 방식 (컴포넌트별 불일치)

| 컴포넌트 | 파일 | 방식 | 사용자 피드백 |
|---------|------|------|-------------|
| UpgradeModal | `components/UpgradeModal.tsx:57` | `alert(t('upgrade.upgradeFailed'))` | 브라우저 기본 alert |
| SubscriptionModal | `components/SubscriptionModal.tsx:72,85,97` | `console.error()` | **없음** |
| OrgBillingSection | `components/organization/subscription/OrgBillingSection.tsx:14` | `toast()` (sonner) | 토스트 알림 |

### 문제점

1. **UpgradeModal**: 브라우저 `alert()`은 디자인 시스템 무시, 블로킹 UI, 모바일에서 비정상적 표시
2. **SubscriptionModal**: 시트 구매 실패, 청구 주기 변경 실패, 구독 취소 실패 시 **사용자에게 아무 피드백 없음**
   - `handleChangeBillingCycle` (L72): catch → console.error만
   - `handlePurchaseSeats` (L85): catch → console.error만
   - `handleCancel` (L97): catch → console.error만
3. **성공 피드백 부재**: 시트 구매 성공, 청구 주기 변경 성공 시에도 별도 확인 메시지 없음

---

## 2. 개선 방안

### 2.1 통일 패턴: Sonner Toast

프로젝트에 이미 `sonner` 라이브러리가 설치되어 있고, OrgBillingSection에서 사용 중.
모든 구독/결제 컴포넌트에 동일 패턴 적용.

```typescript
import { toast } from 'sonner';

// 성공
toast.success(t('subscription.changeBillingSuccess'));

// 실패
toast.error(t('subscription.changeBillingFailed'));
```

### 2.2 수정 대상

#### UpgradeModal.tsx (L55-60)

**Before:**
```typescript
} catch (error: any) {
  console.error('Upgrade failed:', error);
  alert(t('upgrade.upgradeFailed'));
}
```

**After:**
```typescript
import { toast } from 'sonner';

} catch (error: any) {
  console.error('Upgrade failed:', error);
  toast.error(t('upgrade.upgradeFailed'));
}
```

#### SubscriptionModal.tsx (L66-101)

**handleChangeBillingCycle — Before:**
```typescript
} catch (error) {
  console.error('Change billing cycle failed:', error);
}
```

**After:**
```typescript
import { toast } from 'sonner';

// 성공 시 (try 블록 끝)
toast.success(t('subscription.changeBillingSuccess'));

// 실패 시
} catch (error) {
  console.error('Change billing cycle failed:', error);
  toast.error(t('subscription.changeBillingFailed'));
}
```

**handlePurchaseSeats — After:**
```typescript
// 성공 시
toast.success(t('subscription.purchaseSeatsSuccess', { count: additionalSeats }));

// 실패 시
} catch (error) {
  console.error('Purchase seats failed:', error);
  toast.error(t('subscription.purchaseSeatsFailed'));
}
```

**handleCancel — After:**
```typescript
// 성공 시
toast.success(t('subscription.cancelSuccess'));

// 실패 시
} catch (error) {
  console.error('Cancel subscription failed:', error);
  toast.error(t('subscription.cancelFailed'));
}
```

### 2.3 i18n 키 추가

```json
// 10개 언어 모두에 추가
{
  "subscription": {
    "changeBillingSuccess": "Billing cycle updated successfully",
    "changeBillingFailed": "Failed to update billing cycle. Please try again.",
    "purchaseSeatsSuccess": "{{count}} seat(s) purchased successfully",
    "purchaseSeatsFailed": "Failed to purchase seats. Please try again.",
    "cancelSuccess": "Subscription cancelled successfully",
    "cancelFailed": "Failed to cancel subscription. Please try again."
  }
}
```

---

## 3. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/app/components/UpgradeModal.tsx` | alert → toast.error |
| `frontend/src/app/components/SubscriptionModal.tsx` | console.error → toast + 성공 토스트 추가 |
| `frontend/src/app/i18n/locales/*/translation.json` (10개) | subscription 키 6개 추가 |

---

## 4. 검증 방법

1. UpgradeModal에서 결제 실패 시뮬레이션 → toast.error 표시 확인
2. SubscriptionModal에서 시트 구매 성공 → toast.success 표시 확인
3. SubscriptionModal에서 API 에러 응답 시 → toast.error 표시 확인
4. 다크/라이트 모드에서 토스트 색상 확인
5. 모바일(375px)에서 토스트 위치/크기 확인
