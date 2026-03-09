# 수익화 UX 개선 #6: 모바일 반응형 개선

> **우선순위**: 낮음 | **난이도**: 낮음 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### MotionModal 기본 반응형 (잘 되어있음)

**파일**: `frontend/src/app/components/ui/MotionModal.tsx`

```
모바일: items-end (하단 시트), rounded-t-2xl
sm+:    items-center (중앙 모달), rounded-2xl
Safe area: paddingBottom: env(safe-area-inset-bottom)
```

### 문제가 있는 컴포넌트

#### 1. SubscriptionModal.tsx — 그리드 고정

**파일**: `frontend/src/app/components/SubscriptionModal.tsx`

| 위치 | 현재 클래스 | 문제 |
|------|-----------|------|
| L164 (Overview 정보) | `grid grid-cols-2 gap-4` | 375px 이하에서 텍스트 잘림 |
| L206 (Seats 정보) | `grid grid-cols-2 gap-4` | 동일 |
| L356 (Billing Cycle) | `grid grid-cols-2 gap-3` | 동일 |

**375px 화면에서:**
```
모달 폭: 375px
- padding: px-5 × 2 = 40px
- gap: 16px
= 남은 공간: 319px / 2 = 159.5px per cell

→ "Billing Cycle", "Next Payment" 같은 라벨이 잘림
→ 날짜 "Mar 4, 2026" 같은 값이 줄바꿈
```

#### 2. UpgradeModal.tsx — 패딩

**파일**: `frontend/src/app/components/UpgradeModal.tsx`

```
헤더/본문: px-6 (24px × 2 = 48px)
모바일 375px: 375 - 48 = 327px 유효 폭
→ 시트 선택 UI와 가격 선택 UI가 빠듯함
```

#### 3. PremiumBenefitsModal.tsx — 테이블 폭

**파일**: `frontend/src/app/components/PremiumBenefitsModal.tsx`

```
sm:max-w-2xl (672px) — 2열 비교 테이블
모바일: 테이블이 좁아져 "Standard"/"Premium" 헤더 + 체크 아이콘 겹침 위험
```

#### 4. 버튼 터치 영역

```
현재: py-2 ~ py-3 (8~12px vertical padding)
권장: 최소 44px × 44px (Apple HIG) / 48px × 48px (Material Design)
```

---

## 2. 개선 방안

### 2.1 SubscriptionModal 그리드 반응형

**Before:**
```tsx
<div className="grid grid-cols-2 gap-4">
```

**After:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

모바일에서 1열 스택, sm 이상에서 2열 그리드.

### 2.2 UpgradeModal 패딩 조정

**Before:**
```tsx
<div className="px-6 ...">
```

**After:**
```tsx
<div className="px-4 sm:px-6 ...">
```

모바일에서 16px, sm 이상에서 24px.

### 2.3 PremiumBenefitsModal 테이블 반응형

**Before:** 2열 고정 비교 테이블

**After:**
```tsx
// 모바일: 카드 스택
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {/* Standard Card */}
  <div>...</div>
  {/* Premium Card */}
  <div>...</div>
</div>

// 모바일에서 비교 테이블 → 각 플랜 카드로 분리
```

### 2.4 버튼 터치 영역 확대

**CTA 버튼:**
```tsx
// Before
<button className="px-5 py-2.5 ...">

// After
<button className="px-5 py-3 sm:py-2.5 min-h-[44px] ...">
```

**취소/위험 버튼:**
```tsx
// Before
<button className="px-3 py-1.5 ...">

// After
<button className="px-3 py-2 sm:py-1.5 min-h-[40px] ...">
```

### 2.5 가격 표시 텍스트 크기

```tsx
// 가격 숫자: 모바일에서 약간 축소
<p className="text-lg sm:text-xl font-bold">$50</p>

// 라벨: 모바일에서 축약
<span className="hidden sm:inline">/seat/month</span>
<span className="sm:hidden">/mo</span>
```

### 2.6 Billing Cycle 선택 카드

**현재:**
```
[Monthly $5/mo] [Yearly $50/yr 17% off]
```

**모바일 개선:**
```tsx
// 2열 → 스택, 각 카드 풀 너비
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
  <button className="w-full p-3 ...">
    <span>Monthly</span>
    <span className="font-bold">$5/seat/mo</span>
  </button>
  <button className="w-full p-3 ...">
    <span>Yearly</span>
    <span className="font-bold">$50/seat/yr</span>
    <span className="text-bridge-secondary text-[10px]">17% off</span>
  </button>
</div>
```

---

## 3. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `frontend/.../components/SubscriptionModal.tsx` | grid-cols-2 → grid-cols-1 sm:grid-cols-2 (3곳) |
| `frontend/.../components/UpgradeModal.tsx` | px-6 → px-4 sm:px-6, 버튼 min-h |
| `frontend/.../components/PremiumBenefitsModal.tsx` | 테이블 → 카드 스택 (모바일) |
| `frontend/.../components/organization/subscription/OrgBillingSection.tsx` | 확인 (이미 sm:grid-cols-4 적용) |
| `frontend/.../components/organization/subscription/OrgPlanSelector.tsx` | 확인 (이미 sm:grid-cols-2 적용) |

---

## 4. 검증 방법

1. **375px (iPhone SE)**: 모든 구독 모달에서 텍스트 잘림 없음 확인
2. **320px (극소 화면)**: 1열 레이아웃으로 정상 전환 확인
3. **414px (iPhone Plus)**: 2열 그리드 정상 표시 확인
4. **768px (태블릿)**: 기존 레이아웃 유지 확인
5. 터치 영역: 모든 버튼이 최소 44px 높이 확인
6. Capacitor 앱: iOS/Android 시뮬레이터에서 동작 확인
7. Safe area (노치 기기): 하단 여백 정상 확인
