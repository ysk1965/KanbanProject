# 수익화 UX 개선 #7: Pricing 페이지 강화

> **우선순위**: 높음 | **난이도**: 높음 | **작성일**: 2026-03-04

---

## 1. 현황 분석

### Landing Page Pricing 섹션

**파일**: `frontend/src/app/components/landing/LandingPage.tsx` (L899-1100+)

**현재 구조:**
```
<section id="pricing">
  ├─ "FREE TRIAL" 배지
  ├─ "Plans & Pricing / Starts from Free" 대형 타이틀
  └─ 3열 그리드 (md:grid-cols-3)
      ├─ Basic (Free) — $0, 기본 기능 4-6개
      ├─ Premium ($5/user) — RECOMMENDED 배지, scale[1.07], teal 강조
      └─ Team (Org) — 조직 플랜
```

### 문제점

1. **가격 정보 부족**:
   - Monthly/Yearly 토글 없음 (모달에는 있지만 랜딩에는 없음)
   - 할인율(17%) 미표시
   - 시트당 가격이 아닌 절대 가격만 표시
2. **Board vs Org 비교 부재**: 어떤 상황에서 어떤 플랜이 유리한지 가이드 없음
3. **AI 크레딧 정보 없음**: Premium의 핵심 가치인 AI 크레딧 언급 없음
4. **FAQ 없음**: "Trial 이후 어떻게 되나요?", "환불 가능한가요?" 등 자주 묻는 질문
5. **CTA 연결 약함**: "Get Started"/"Choose Plan" → 바로 회원가입으로 이동하지만 가격 선택 경험 없음
6. **Team(Org) 플랜 상세 부족**: 가격이 명시적이지 않음

---

## 2. 개선 방안

### 2.1 Monthly/Yearly 토글 추가

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Plans & Pricing                                │
│                                                 │
│  ┌──────────────────────────┐                   │
│  │ [Monthly] [Yearly ✨17%] │  ← 토글 스위치    │
│  └──────────────────────────┘                   │
│                                                 │
│  ┌──────────┬──────────────┬──────────────┐     │
│  │  Basic   │   Premium    │    Team      │     │
│  │  Free    │  $5/user/mo  │  $15/seat/mo │     │
│  │          │  or $50/yr   │  or $150/yr  │     │
│  └──────────┴──────────────┴──────────────┘     │
│                                                 │
└─────────────────────────────────────────────────┘
```

**토글 구현:**
```tsx
const [isYearly, setIsYearly] = useState(true); // 기본값: Yearly (전환율 높음)

<div className="flex items-center gap-3 bg-white/5 rounded-full p-1.5">
  <button
    className={cn(
      "px-6 py-2 rounded-full text-sm font-medium transition-all",
      !isYearly ? "bg-bridge-accent text-white" : "text-slate-400"
    )}
    onClick={() => setIsYearly(false)}
  >
    Monthly
  </button>
  <button
    className={cn(
      "px-6 py-2 rounded-full text-sm font-medium transition-all",
      isYearly ? "bg-bridge-accent text-white" : "text-slate-400"
    )}
    onClick={() => setIsYearly(true)}
  >
    Yearly
    <span className="ml-1.5 text-[10px] font-bold text-bridge-secondary">17% OFF</span>
  </button>
</div>
```

### 2.2 플랜 카드 강화

#### Basic (Free) 카드

```
┌─ Basic ─────────────────────┐
│                             │
│  $0                         │
│  Free forever               │
│                             │
│  ✅ Kanban Board (1 board)  │
│  ✅ Task & Feature Cards    │
│  ✅ Team Collaboration      │
│  ✅ Daily Checklist         │
│  ✅ AI Credits: 30/month    │
│  ✅ Meeting Notes           │
│  ❌ Weekly Schedule         │
│  ❌ Milestone               │
│  ❌ Slack Integration       │
│  ❌ Statistics              │
│                             │
│  [Get Started Free]         │
│                             │
└─────────────────────────────┘
```

#### Premium 카드 (RECOMMENDED)

```
┌─ Premium ── RECOMMENDED ────┐
│  (teal border, scale 1.07)  │
│                             │
│  $5 /user/mo                │
│  or $4.17/mo (billed yearly)│
│                             │
│  Everything in Basic, plus: │
│  ✅ Unlimited Boards        │
│  ✅ Weekly Schedule (Gantt) │
│  ✅ Milestone Management    │
│  ✅ Slack Integration       │
│  ✅ Statistics Dashboard    │
│  ✅ AI Report               │
│  ✅ AI Credits: 200+50/seat │
│                             │
│  [Start Free Trial]         │
│  "7 days free, cancel anytime"│
│                             │
└─────────────────────────────┘
```

#### Team (Organization) 카드

```
┌─ Team ──────────────────────┐
│                             │
│  $15 /seat/mo               │
│  or $12.50/mo (yearly)      │
│                             │
│  Everything in Premium, plus:│
│  ✅ Organization Management │
│  ✅ HR Features (Full)      │
│  ✅ Attendance Tracking     │
│  ✅ Leave Management        │
│  ✅ Unlimited Boards        │
│  ✅ Unlimited Members       │
│  ✅ Cross-board Scheduling  │
│                             │
│  "Best for organizations    │
│   with 5+ members"          │
│                             │
│  [Upgrade to Team]          │
│                             │
└─────────────────────────────┘
```

### 2.3 비용 계산기 추가

플랜 카드 아래에 인터랙티브 계산기 섹션:

```
┌─ 💰 Calculate Your Cost ──────────────────────────┐
│                                                   │
│  Team size: [━━━━━●━━━━━━━━━━━━━] 8 members      │
│                                                   │
│  ┌──────────────────┬──────────────────┐          │
│  │ 💎 Premium       │ 🏢 Team          │          │
│  │                  │                  │          │
│  │ $40/mo           │ $120/mo          │          │
│  │ ($480/yr)        │ ($1,440/yr)      │          │
│  │                  │                  │          │
│  │ 8 boards 별도    │ All boards 포함   │          │
│  │ HR ❌            │ HR ✅            │          │
│  └──────────────────┴──────────────────┘          │
│                                                   │
│  💡 "With 8 members, Team plan saves you          │
│      $X/mo compared to 3+ Premium boards"         │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 2.4 FAQ 섹션 추가

```
┌─ Frequently Asked Questions ──────────────────────┐
│                                                   │
│  ▼ What happens after the free trial?             │
│    "After 7 days, your board reverts to the       │
│     Standard plan. No charge unless you upgrade." │
│                                                   │
│  ▼ Can I cancel anytime?                          │
│    "Yes. Cancel anytime and keep access until     │
│     the end of your billing period."              │
│                                                   │
│  ▼ What are AI Credits?                           │
│    "AI Credits power features like meeting        │
│     summaries, task decomposition, and weekly     │
│     reports. Credits reset monthly."              │
│                                                   │
│  ▼ Board Premium vs Team plan?                    │
│    "Board Premium is per-board. Team plan covers  │
│     all boards in your organization with HR."     │
│                                                   │
│  ▼ Can I upgrade from Board to Organization?      │
│    "Yes. We prorate your remaining balance when   │
│     migrating to an Organization plan."           │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 2.5 구현 구조

```
LandingPage.tsx Pricing 섹션 리팩토링:

<section id="pricing">
  <PricingHeader />           // 타이틀 + Monthly/Yearly 토글
  <PricingCards />            // 3개 플랜 카드 (isYearly prop)
  <PricingCalculator />       // 비용 계산기 (선택사항, Phase 2)
  <PricingFAQ />              // FAQ 아코디언
</section>
```

> 랜딩 페이지 파일이 이미 매우 크므로 (1100+ lines),
> Pricing 관련 컴포넌트를 `components/landing/` 하위에 분리 권장:
> - `PricingSection.tsx` (메인 래퍼)
> - `PricingCards.tsx` (3개 카드)
> - `PricingFAQ.tsx` (FAQ 아코디언)

---

## 3. 디자인 스펙

### 토글 스위치

```
배경: bg-white/5 (다크), bg-slate-100 (라이트)
활성: bg-bridge-accent text-white
비활성: text-slate-400
할인 배지: text-bridge-secondary text-[10px] font-bold
```

### 플랜 카드

```
기본 카드:
  bg-white/[0.03] border border-white/10 rounded-2xl p-8

추천 카드 (Premium):
  border-2 border-bridge-secondary/60
  shadow-[0_0_160px_rgba(45,212,191,0.25)]
  md:scale-[1.07]

체크 아이콘: text-bridge-secondary (✅), text-slate-600 (❌)
```

### FAQ 아코디언

```
배경: bg-white/[0.03]
테두리: border border-white/[0.08]
열림 애니메이션: Framer Motion (height: "auto")
아이콘: ChevronDown (회전 180°)
```

---

## 4. i18n 키 추가

```json
{
  "landing": {
    "pricing": {
      "toggle": {
        "monthly": "Monthly",
        "yearly": "Yearly",
        "discount": "{{percent}}% OFF"
      },
      "basic": {
        "name": "Basic",
        "price": "$0",
        "tagline": "Free forever",
        "feature1": "1 Kanban Board",
        "feature2": "Task & Feature Cards",
        "feature3": "Team Collaboration",
        "feature4": "Daily Checklist",
        "feature5": "30 AI Credits/month",
        "feature6": "Meeting Notes",
        "cta": "Get Started Free"
      },
      "premium": {
        "name": "Premium",
        "recommended": "RECOMMENDED",
        "monthlyPrice": "$5",
        "yearlyPrice": "$50",
        "yearlyMonthly": "$4.17",
        "tagline": "Everything in Basic, plus:",
        "feature1": "Unlimited Boards",
        "feature2": "Weekly Schedule (Gantt)",
        "feature3": "Milestone Management",
        "feature4": "Slack Integration",
        "feature5": "Statistics Dashboard",
        "feature6": "AI Report",
        "feature7": "200+50/seat AI Credits",
        "cta": "Start Free Trial",
        "trialNote": "7 days free, cancel anytime"
      },
      "team": {
        "name": "Team",
        "monthlyPrice": "$15",
        "yearlyPrice": "$150",
        "yearlyMonthly": "$12.50",
        "tagline": "Everything in Premium, plus:",
        "feature1": "Organization Management",
        "feature2": "HR Features (Full Access)",
        "feature3": "Attendance Tracking",
        "feature4": "Leave Management",
        "feature5": "Unlimited Members",
        "feature6": "Cross-board Scheduling",
        "bestFor": "Best for organizations with 5+ members",
        "cta": "Upgrade to Team"
      },
      "faq": {
        "title": "Frequently Asked Questions",
        "q1": "What happens after the free trial?",
        "a1": "After 7 days, your board reverts to Standard plan. No charge unless you upgrade.",
        "q2": "Can I cancel anytime?",
        "a2": "Yes. Cancel anytime and keep access until the end of your billing period.",
        "q3": "What are AI Credits?",
        "a3": "AI Credits power features like meeting summaries, task decomposition, and reports. Credits reset monthly.",
        "q4": "Board Premium vs Team plan?",
        "a4": "Board Premium is per-board pricing. Team plan covers all boards with HR features.",
        "q5": "Can I migrate from Board to Organization?",
        "a5": "Yes. We prorate your remaining balance when migrating."
      }
    }
  }
}
```

---

## 5. 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `frontend/.../components/landing/LandingPage.tsx` | Pricing 섹션 리팩토링 |
| `frontend/.../components/landing/PricingSection.tsx` | **신규** — Pricing 래퍼 |
| `frontend/.../components/landing/PricingCards.tsx` | **신규** — 3개 플랜 카드 |
| `frontend/.../components/landing/PricingFAQ.tsx` | **신규** — FAQ 아코디언 |
| `frontend/.../i18n/locales/*/translation.json` (10개) | pricing 키 ~50개 추가 |

---

## 6. 검증 방법

1. Monthly/Yearly 토글 → 가격이 실시간 전환되는지 확인
2. Yearly 선택 시 → "17% OFF" 배지 + 월 환산가 표시 확인
3. 3개 플랜 카드 → 기능 목록이 정확한지 확인
4. Premium 카드 → RECOMMENDED 배지 + 스케일 업 확인
5. FAQ → 아코디언 열기/닫기 애니메이션 확인
6. 모바일 반응형 → 1열 스택 레이아웃 확인
7. CTA 버튼 → 회원가입/업그레이드 흐름 연결 확인
8. 다크/라이트 모드 전환 확인
9. 10개 언어 전환 시 레이아웃 깨짐 없음 확인
