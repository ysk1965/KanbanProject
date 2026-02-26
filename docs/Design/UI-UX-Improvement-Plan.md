# BRIDGE 디자인 퀄리티 개선 기획서

> **버전**: v2.0 (2026-02-26)
> **목적**: Linear, Vercel, Notion, Attio 등 최상위 SaaS의 디자인 전략을 분석하고, BRIDGE에 맞게 적용하여 시각적 퀄리티와 인터랙션 품질을 끌어올린다.

---

## 1. 레퍼런스 SaaS 분석

### 왜 이 제품들인가

BRIDGE는 칸반보드(Board) + 조직관리(Organization) + 개인생산성(MySpace) 3가지를 합친 서비스. 각 영역의 최고 레퍼런스를 벤치마킹한다.

| BRIDGE 영역 | 레퍼런스 | 배울 점 |
|------------|---------|---------|
| Board (칸반) | **Linear** | 모노크롬 절제미, 200ms ease-out 호버, 키보드 퍼스트 |
| Board (칸반) | **Height** | 태스크 뷰 전환 모션, 컬럼 간 드래그 피드백 |
| Organization | **Attio** | "기능 = 아름다움" 철학, 서프라이즈 마이크로인터랙션 |
| Organization | **Notion** | 미니멀 크롬, 데이터베이스 뷰 전환, 따뜻한 뉴트럴 팔레트 |
| MySpace (개인) | **Things 3** | 보이지 않는 컨테이너 → 터치 시 카드로 떠오름, Progress Pie |
| MySpace (개인) | **Amie** | Spring 드래그, 여유로운 여백, 차분한 컬러 |
| 전체 시스템 | **Vercel (Geist)** | 10-step 그레이 스케일, 시맨틱 토큰 아키텍처 |
| 전체 시스템 | **Dub.co** | Cards/Rows 뷰 토글, 필터 UX |

---

### 1.1 Linear에서 배울 것

> "Boring and bettering UI" — 장식을 줄이고, 기능에 집중하되, 만지는 순간 프리미엄을 느끼게

**핵심 패턴**:
- **모노크롬 기본 + 한 가지 Accent**: UI 전체가 회색톤, 색상은 status와 accent에만 사용
- **호버 = 200ms ease-out**: 카드 호버 시 `scale(1.01) translateY(-4px)` + 테두리 밝아짐
- **링크 기본 투명도 0.6 → 호버 1.0**: 비활성 요소를 살짝 낮춰서 활성 요소가 돋보임
- **Cmd+K 커맨드 팔레트**: 모든 네비게이션의 중심
- **3-variable 테마**: base color + accent color + contrast(30~100)만으로 전체 테마 생성

**BRIDGE 적용**:
- 현재 BRIDGE는 색상 노이즈가 많음 (뱃지마다 다른 색, 버튼마다 다른 스타일)
- 기본 UI를 더 절제하고, **의미 있는 순간**에만 색상/모션 사용
- 사이드바 아이템, 비활성 탭에 `opacity-60 hover:opacity-100` 패턴 적용

---

### 1.2 Vercel Geist에서 배울 것

> 10-step 색상 스케일로 "이 테두리는 몇 단계?" 질문에 항상 답할 수 있는 시스템

**핵심 패턴**:
- **Gray 100~1000 스케일**: 100~300 = 배경, 400~600 = 테두리, 700~800 = 강조배경, 900~1000 = 텍스트
- **Alpha 변형**: `gray-alpha-100` 등으로 반투명 오버레이용 별도 스케일
- **두 단계 배경**: `background-100`(기본) / `background-200`(보조) — 그림자 없이 깊이 표현
- **브라우저 탭 아이콘**: 배포 상태(빌드중/에러/완료)에 따라 탭 아이콘 변경

**BRIDGE 적용**:
- 현재 `foreground/[0.05]`, `foreground/[0.08]`, `foreground/[0.12]` 등 ad-hoc → 4단계로 정리
- 다크모드에서 그림자보다 **배경 밝기 차이**로 깊이 표현 (Linear도 같은 전략)

---

### 1.3 Attio에서 배울 것

> "기능이 곧 아름다움" — 사용자가 기능을 발견했을 때 "당연히 그래야지"라고 느끼게

**핵심 패턴**:
- **서프라이즈 & 딜라이트**: 자동화 빌더가 "퍼즐 게임"처럼 느껴지는 만족감
- **텍스트 그라데이션 애니메이션**: 특정 순간 텍스트에 살짝 그라데이션 흐름
- **Cubic bezier 커브**: 모든 애니메이션에 커스텀 이징 (기본 ease가 아닌)
- **50/50 원칙**: 반은 유저 피드백, 반은 직감/취향/감각

**BRIDGE 적용**:
- Feature 100% 완료, Milestone 달성 등 **의미 있는 순간**에 집중적 마이크로인터랙션
- 현재 completion burst는 좋은 기반 — 더 정제하여 "브릿지 시그니처 모먼트"로

---

### 1.4 Things 3에서 배울 것

> "태스크가 평범한 텍스트로 있다가, 탭하면 카드로 떠오른다" — Progressive Disclosure의 정수

**핵심 패턴**:
- **보이지 않는 컨테이너**: 태스크가 기본 상태에서는 구분선 없는 텍스트 → 인터랙션 시 카드로 변환
- **Progress Pie**: 프로젝트 아이콘이 완료율에 따라 원형으로 채워짐
- **글래시 버튼**: 버튼이 터치에 반응하여 scale + glow
- **3.22 리디자인**: "더 넓은 간격과 시각적 투명성"

**BRIDGE 적용**:
- MySpace 태스크/습관 리스트에서 기본 상태를 더 미니멀하게
- Feature 카드 진행률 표시를 **원형 Progress Pie**로도 표현 가능 (현재는 bar만)
- 카드 탭/클릭 시 "종이에서 떠오르는" 느낌의 shared element transition

---

### 1.5 Amie에서 배울 것

> "차분한 팔레트 + 넉넉한 여백 = 인지부하 감소" — Product Hunt Golden Kitty 수상

**핵심 패턴**:
- **Spring 드래그**: 제스처 끝점의 속도를 이어받아 애니메이션이 자연스러움
- **시각적 무게 차등**: 중요 항목이 "소리치지 않으면서" 약간 더 무거운 시각적 존재감
- **여유로운 여백**: 밀도를 낮추되 정보량은 유지 — 스캔 효율 향상

**BRIDGE 적용**:
- Organization Dashboard 위젯 간 간격을 `gap-4` → `gap-5` 또는 `gap-6`으로 넓힘
- 핵심 지표(오늘 할 일, 진행 중 태스크)에 미세하게 더 큰 폰트/굵기 → "소리치지 않는 강조"

---

## 2. 현재 수준 진단

### 잘 되어 있는 것
- **랜딩 페이지**: per-character blur-in, glow halo CTA, `duration-700` 호버 — **프로덕션급**
- **MySpace 체크 파티클**: 8방향 radial burst + spring physics — Things 3 수준
- **Task 완료 burst**: `cardCompleteBurst`, `progressBarShine` — 의미 있는 순간에 집중 (Attio 철학과 일치)
- **WidgetCard 2-tone 구조**: 헤더 strip + 바디 — Vercel 위젯과 유사한 시각 위계

### 핵심 격차: "랜딩급 퀄리티가 앱 내부에 없다"

| 항목 | 랜딩 | 앱 내부 | Linear/Vercel 기준 |
|------|------|--------|------------------|
| 카드 호버 | `duration-700`, glow | 테두리만 변경 (150ms) | `200ms ease-out`, translateY(-4px) |
| 배경 깊이 | gradient blur orb | flat 단색 | 배경 밝기 2단계 분리 |
| 그림자 시스템 | 커스텀 glow | 없거나 `shadow-2xl` | 시맨틱 토큰 (`--shadow-card`) |
| 모달 백드롭 | — | `blur(2px)`, 20% 어둡기 | `blur(8-16px)`, 40-60% |
| 비활성 요소 | — | 100% 불투명 | `opacity-60`, 호버 시 1.0 |
| 로딩 경험 | — | 3가지 다른 구현 | shimmer skeleton |

---

## 3. 개선 제안

### 3.1 Surface Elevation — 그림자 대신 밝기 (Vercel/Linear 패턴)

> 다크모드에서 깊이감은 그림자가 아닌 **배경 밝기 단계**로 만든다.

**현재**: 모든 곳이 `bg-bridge-dark` 또는 `bg-bridge-obsidian` — 2단계뿐

**개선**: 4단계 Surface 시스템

```css
/* theme.css — Surface Elevation Scale */
:root {
  /* Dark mode (기본) */
  --surface-base:     #0F1420;   /* 페이지 배경 — 가장 어두움 */
  --surface-raised:   #151B28;   /* 카드, 사이드바 — 한 단계 밝음 */
  --surface-overlay:  #1A2235;   /* 모달, 드롭다운 — 두 단계 밝음 */
  --surface-hover:    #1E2A42;   /* 호버 상태 — 세 단계 밝음 */

  /* Shadow (dark에서는 미세하게만) */
  --shadow-card: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-card-hover: 0 4px 16px rgba(0,0,0,0.3);
  --shadow-modal: 0 16px 48px rgba(0,0,0,0.5);
  --shadow-dropdown: 0 8px 24px rgba(0,0,0,0.4);
  --shadow-glow-accent: 0 0 20px rgba(99,102,241,0.2);
}

.light {
  --surface-base:     #FFFCF8;
  --surface-raised:   #F8F2EB;
  --surface-overlay:  #FFFFFF;
  --surface-hover:    #F0E9E0;

  --shadow-card: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-card-hover: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-modal: 0 16px 48px rgba(0,0,0,0.12);
  --shadow-dropdown: 0 8px 24px rgba(0,0,0,0.1);
  --shadow-glow-accent: 0 0 20px rgba(99,102,241,0.12);
}
```

**Tailwind 매핑**:
```
bg-surface-base     → 페이지 배경
bg-surface-raised   → 카드, 위젯, 사이드바
bg-surface-overlay  → 모달, 드롭다운, 팝오버
bg-surface-hover    → 호버 배경 tint
```

**기존 변수와의 관계**:
```
bg-bridge-dark       → bg-surface-base (교체)
bg-bridge-obsidian   → bg-surface-raised (교체)
bg-bridge-surface    → bg-surface-hover (교체)
```

---

### 3.2 테두리 4단계 스케일 (Vercel 패턴)

**현재**: `foreground/[0.05]`, `bridge-border`, `foreground/[0.08~12]` 혼용

**개선**: 의미 기반 4단계

```css
:root {
  --border-subtle:    rgba(255,255,255,0.05);  /* 섹션 내부 구분 */
  --border-default:   rgba(255,255,255,0.08);  /* 카드, 인풋 기본 */
  --border-hover:     rgba(255,255,255,0.15);  /* 호버 상태 */
  --border-accent:    rgba(99,102,241,0.4);    /* 포커스, 선택 */
}

.light {
  --border-subtle:    rgba(0,0,0,0.05);
  --border-default:   rgba(0,0,0,0.08);
  --border-hover:     rgba(0,0,0,0.15);
  --border-accent:    rgba(99,102,241,0.4);
}
```

**Tailwind 매핑**:
```
border-border-subtle    → 리스트 내 divide
border-border-default   → 카드, 인풋, 위젯
border-border-hover     → hover:border-border-hover
border-border-accent    → focus:border-border-accent
```

**이전 bridge-border 변수**: `--border-default`로 대체. 기존 `border-bridge-border` 사용처가 자동으로 통일됨.

---

### 3.3 비활성 요소 Dimming (Linear 패턴)

> Linear의 핵심 트릭: 비활성 요소를 `opacity: 0.6`으로 살짝 낮추면, 활성 요소가 별도 강조 없이도 돋보인다.

**적용 대상**:
```tsx
// 사이드바 / 탭바 비활성 아이템
className="text-slate-400 opacity-60 hover:opacity-100 transition-opacity duration-150"

// 칸반 블록의 비활성 카드 (다른 필터에 해당하지 않는 카드)
className="... opacity-50 hover:opacity-100 transition-opacity duration-200"

// 리스트의 보조 정보 (이메일, 날짜 등)
className="text-xs text-muted-foreground opacity-70"
```

**효과**: UI 전체의 "신호 대 잡음 비율"이 개선됨. 중요한 게 자연스럽게 먼저 보임.

---

### 3.4 카드 호버 — Linear 200ms 패턴

**현재 문제**: 호버 시 테두리 색상만 바뀌고, 배경/그림자/위치 변화 없음

**개선**: 3-layer 호버 (200ms ease-out)

```tsx
// === 칸반 태스크 카드 (DraggableCard) ===
<div className="group relative
  bg-surface-raised rounded-xl
  border border-border-default
  hover:border-border-hover
  shadow-card hover:shadow-card-hover
  hover:-translate-y-0.5
  transition-all duration-200 ease-out
  cursor-pointer overflow-hidden
">
  {/* 호버 시 상단 accent 라인 fade-in */}
  <div className="absolute top-0 inset-x-0 h-[1.5px] rounded-t-xl
    bg-gradient-to-r from-transparent via-bridge-accent/50 to-transparent
    opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

  {/* 호버 시 액션 버튼 reveal */}
  <div className="absolute top-2 right-2
    opacity-0 group-hover:opacity-100
    translate-y-0.5 group-hover:translate-y-0
    transition-all duration-200">
    <button className="p-1 rounded-md bg-foreground/5
      hover:bg-foreground/10 text-slate-500
      hover:text-foreground transition-colors">
      <MoreHorizontal size={12} />
    </button>
  </div>

  {/* 콘텐츠 */}
  <div className="px-3 py-2.5">
    <span className="font-bold text-foreground text-[13px]
      group-hover:text-white transition-colors duration-200">
      {title}
    </span>
  </div>
</div>
```

```tsx
// === Organization 멤버/보드 카드 ===
<div className="group
  bg-surface-raised rounded-xl
  border border-border-default
  hover:border-border-hover
  shadow-card hover:shadow-card-hover
  hover:-translate-y-0.5
  transition-all duration-200 ease-out
  cursor-pointer p-4
">
```

**핵심**: `duration-200 ease-out` 통일. `transition-all`이 아닌 `transition-[border-color,box-shadow,transform,background-color]`로 필요한 속성만 트랜지션하면 더 정밀.

---

### 3.5 모달 — Frosted Glass + Spring Entry

**현재**: `blur(2px)`, `rgba(0,0,0,0.2)`, linear tween — "뚝" 나타남

**개선** (Attio 느낌의 만족스러운 진입):

```tsx
// MotionModal.tsx 개선

// 1. 백드롭 — 충분한 blur + 어둡기
initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
animate={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}
exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
transition={{ duration: 0.2 }}

// 2. 콘텐츠 패널 — spring 진입 (기계적이지 않게)
initial={{ opacity: 0, y: 24, scale: 0.97 }}
animate={{ opacity: 1, y: 0, scale: 1 }}
exit={{ opacity: 0, y: 12, scale: 0.98 }}
transition={{ type: 'spring', stiffness: 400, damping: 30 }}

// 3. 패널 스타일 — glass 질감
className="...
  bg-surface-overlay/90 backdrop-blur-xl
  shadow-modal
  ring-1 ring-inset ring-white/[0.06]
  ..."

// 4. 상단 shimmer 라인 (빛 굴절 시뮬레이션)
<div className="absolute inset-x-0 top-0 h-px
  bg-gradient-to-r from-transparent via-white/15 to-transparent
  rounded-t-2xl pointer-events-none" />
```

**accentColor prop 내장**:
```tsx
// MotionModal에 prop 추가 — 호출처에서 매번 수동 추가할 필요 없음
<MotionModal accentColor="accent" ...>   {/* 인디고 gradient */}
<MotionModal accentColor="#ef4444" ...>   {/* 빨간색 (삭제 확인 등) */}
<MotionModal accentColor={featureColor}> {/* 피처 색상 */}
```

---

### 3.6 Ambient Depth — 배경 깊이감

**현재**: flat `bg-bridge-dark` 단색 → 생동감 없음

**개선**: Dashboard 페이지에 은은한 accent orb (Notion/Vercel 대시보드 참고)

```tsx
function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true">
      <div className="absolute top-[-15%] left-[8%]
        w-[500px] h-[500px] rounded-full
        bg-bridge-accent/[0.03] blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[5%]
        w-[400px] h-[400px] rounded-full
        bg-bridge-secondary/[0.04] blur-[100px]" />
    </div>
  );
}
```

**적용 위치**: Organization Dashboard, MySpace Overview, 랜딩 페이지 (이미 있음)

**효과**: 투명도 3~4%라 의식적으로 인지되진 않지만, 제거하면 확실히 밋밋해짐. Linear, Vercel 모두 이 테크닉 사용.

---

### 3.7 헤더 Glass (Things 3 "시각적 투명성")

**현재**: `bg-bridge-dark` flat — `.glass` 클래스가 theme.css에 있지만 미사용

**개선**:
```tsx
// Board, MySpace 헤더에 적용
className="...
  bg-surface-raised/80 backdrop-blur-xl
  border-b border-border-subtle
  ..."
```

**효과**: 칸반 보드에서 수평 스크롤할 때 카드가 헤더 아래로 비치면서 레이어 분리. Things 3의 "더 넓은 간격과 시각적 투명성" 철학과 일치.

---

### 3.8 Motion 표준화

**현재**: 파일마다 다른 spring 값, duration, 스태거 딜레이

**개선**: `constants/motion.ts` 도입 (Attio의 "통일된 cubic bezier" 접근)

```typescript
// frontend/src/app/constants/motion.ts

export const SPRING = {
  /** UI 반응 (버튼, 토글, 체크) — Linear처럼 빠르고 단단 */
  snappy:  { type: 'spring' as const, stiffness: 500, damping: 35 },
  /** 카드 호버, 리스트 아이템 — 자연스러운 감속 */
  smooth:  { type: 'spring' as const, stiffness: 350, damping: 30 },
  /** 모달, 패널 진입 — 무게감 있는 등장 */
  modal:   { type: 'spring' as const, stiffness: 400, damping: 30 },
  /** 탭 인디케이터, 레이아웃 전환 — Amie 느낌의 느긋함 */
  gentle:  { type: 'spring' as const, stiffness: 250, damping: 28 },
} as const;

export const DURATION = {
  fast: 0.15,    // 호버 색상, 토글
  normal: 0.2,   // 카드 호버 (Linear 기준)
  slow: 0.3,     // 탭 전환, reveal
} as const;

export const STAGGER = {
  fast: 0.03,    // 카드 리스트
  normal: 0.05,  // 위젯, 섹션
  slow: 0.08,    // 온보딩 스텝
} as const;

// 재사용 프리셋
export const FADE_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.96 },
};
```

---

### 3.9 Shimmer Skeleton (Vercel 패턴)

**현재**: 로딩 3종류 혼용 (div spinner, 텍스트, Lucide 아이콘) + 스켈레톤은 `animate-pulse`

**개선**: 흐르는 shimmer + 콘텐츠 형태 모사

```css
/* theme.css */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.03) 25%,
    rgba(255,255,255,0.07) 50%,
    rgba(255,255,255,0.03) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 8px;
}

.light .skeleton {
  background: linear-gradient(
    90deg,
    rgba(0,0,0,0.04) 25%,
    rgba(0,0,0,0.08) 50%,
    rgba(0,0,0,0.04) 75%
  );
  background-size: 800px 100%;
}
```

```tsx
// 카드 형태를 모사하는 스켈레톤
function TaskCardSkeleton() {
  return (
    <div className="bg-surface-raised rounded-xl border border-border-default p-3 space-y-2.5">
      <div className="h-3.5 skeleton w-3/4" />
      <div className="flex gap-2">
        <div className="h-5 w-5 skeleton rounded-full" />
        <div className="h-5 w-5 skeleton rounded-full" />
      </div>
      <div className="flex justify-between">
        <div className="h-2.5 skeleton w-16" />
        <div className="h-4 w-10 skeleton rounded-full" />
      </div>
    </div>
  );
}

// 통일 페이지 로딩
function PageLoading() {
  return (
    <div className="flex items-center justify-center h-dvh bg-surface-base">
      <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
    </div>
  );
}
```

---

### 3.10 Hover-Reveal 액션 (Linear 패턴)

**현재**: 리스트 행에 액션 버튼이 항상 노출 → 시각 노이즈

**개선**: 호버 시에만 등장

```tsx
// Organization 멤버 행, Board 리스트 등
<div className="group flex items-center gap-3 px-4 py-3 rounded-xl
  hover:bg-surface-hover transition-colors duration-150 cursor-pointer">

  {/* 항상 보이는 콘텐츠 */}
  <Avatar />
  <div className="flex-1 min-w-0">
    <span className="text-sm font-medium text-foreground">{name}</span>
    <span className="text-xs text-muted-foreground opacity-70">{email}</span>
  </div>
  <RoleBadge />

  {/* 호버 시에만 등장 — slide-in 느낌 */}
  <div className="flex gap-1
    opacity-0 group-hover:opacity-100
    translate-x-1 group-hover:translate-x-0
    transition-all duration-200">
    <button className="p-1.5 rounded-lg text-slate-500
      hover:text-foreground hover:bg-foreground/5 transition-colors">
      <MoreHorizontal size={14} />
    </button>
  </div>
</div>
```

---

### 3.11 폼 입력 통일 (Glow Focus)

**현재**: 포커스 링 3가지 (accent/50, secondary/40, accent/10), 두께도 다름

**개선**: 통일된 "은은한 glow" 포커스

```tsx
const INPUT_CLASSES = `
  w-full bg-foreground/[0.03]
  border border-border-default rounded-xl
  px-4 py-3 text-sm text-foreground
  placeholder-slate-500
  outline-none
  transition-all duration-200
  focus:border-border-accent
  focus:ring-2 focus:ring-bridge-accent/10
  focus:bg-foreground/[0.05]
`;
```

**포인트**:
- `focus:ring-bridge-accent/10` — 링이 은은한 glow (강하지 않게)
- `focus:bg-foreground/[0.05]` — 배경도 살짝 밝아짐 → "포커스 영역" 인지
- 모든 서비스에서 동일한 경험

---

### 3.12 Empty State 통일 (Notion 미니멀 + CTA)

**현재**: Board는 과도하게 화려, Org는 적당, MySpace는 컬러별 소프트 — 3가지 다른 스케일

**개선**: 공통 EmptyState 컴포넌트

```tsx
interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  color?: 'accent' | 'secondary' | 'purple' | 'amber';
  size?: 'compact' | 'default';
}

// 사용 예시
<EmptyState
  icon={LayoutGrid}
  title="No boards yet"
  description="Create your first board to organize your team's work."
  action={{ label: 'Create Board', onClick: handleCreate }}
  color="accent"
/>
```

**디자인 규칙**:
- 아이콘: `w-14 h-14 rounded-2xl bg-{color}/10` + 뒤에 미세 glow (`blur-xl`)
- 제목: `text-base font-bold` (과하지 않게)
- 설명: `text-sm text-slate-500 max-w-xs`
- CTA: `bg-bridge-accent rounded-xl text-sm font-bold` + `shadow-glow-accent`
- Board의 gradient glow 버튼은 제거 — EmptyBoardGuide만의 특수 케이스로 유지 가능

---

### 3.13 숫자 Tabular Nums (Vercel 패턴)

```css
/* theme.css */
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
```

모든 통계, 카운터, 진행률, 타이머에 적용 → 숫자 업데이트 시 레이아웃 안정

---

### 3.14 커맨드 팔레트 ⌘K (Linear/Raycast 패턴)

> Linear의 가장 큰 UX 차별점. "모든 네비게이션은 ⌘K에서 시작"

```tsx
// 전역 키보드 핸들러
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen(true);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);

// UI
<motion.div
  {...FADE_SCALE}
  transition={SPRING.snappy}
  className="w-full max-w-lg bg-surface-overlay rounded-2xl
    border border-border-default shadow-modal
    ring-1 ring-bridge-accent/10 overflow-hidden"
>
  <input
    autoFocus
    placeholder="Search boards, tasks, members..."
    className="w-full bg-transparent px-5 py-4
      text-sm text-foreground placeholder-slate-500
      border-b border-border-subtle outline-none"
  />
  <div className="max-h-72 overflow-y-auto py-2">
    {results.map(item => (
      <button className="w-full flex items-center gap-3 px-4 py-2.5
        text-sm text-foreground hover:bg-surface-hover
        transition-colors duration-100">
        <item.icon size={16} className="text-slate-500 shrink-0" />
        <span>{item.label}</span>
        <span className="ml-auto text-xs text-slate-600">{item.hint}</span>
      </button>
    ))}
  </div>
  <div className="flex gap-4 px-4 py-2.5
    border-t border-border-subtle text-[10px] text-slate-600">
    <span><kbd className="font-mono">↑↓</kbd> navigate</span>
    <span><kbd className="font-mono">↵</kbd> open</span>
    <span><kbd className="font-mono">Esc</kbd> close</span>
  </div>
</motion.div>
```

**검색 대상**: 보드, 피처, 태스크, 멤버, 설정 페이지, 개인 이벤트/습관

---

### 3.15 Signature Moments — 의미 있는 순간의 마이크로인터랙션 (Attio/Things 3)

> "모든 곳에 애니메이션을 넣지 마라. 의미 있는 순간에만." — Attio 디자인 원칙

**현재 잘 되어 있는 것 (유지)**:
- Task → Done 이동 시 `cardCompleteBurst` + 파티클
- Feature 100% 달성 시 `featureCompletePulse` + progress shimmer
- MySpace 습관 체크 시 radial burst

**추가할 Signature Moment**:

```tsx
// 1. 마일스톤 달성 — 화면 상단에서 subtle confetti
import confetti from 'canvas-confetti';
const celebrateMilestone = () => {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.3 },
    colors: ['#6366F1', '#2DD4BF', '#a78bfa'],
    ticks: 120,
  });
};

// 2. 버튼 로딩 → 성공 전환 (Attio "서프라이즈")
<AnimatePresence mode="wait">
  {status === 'loading' ? (
    <motion.span key="loading" initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}>
      <Loader2 className="w-4 h-4 animate-spin" />
    </motion.span>
  ) : status === 'success' ? (
    <motion.span key="success" initial={{ scale: 0 }}
      animate={{ scale: 1 }} transition={SPRING.snappy}>
      <Check className="w-4 h-4 text-emerald-400" />
    </motion.span>
  ) : (
    <motion.span key="idle" initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}>
      Save
    </motion.span>
  )}
</AnimatePresence>

// 3. 카드 → 모달 shared element (Things 3 "떠오르는" 느낌)
// Feature 카드 클릭 시 카드가 확장되어 모달이 되는 느낌
<motion.div layoutId={`feature-${id}`}>  {/* 카드에 */}
<motion.div layoutId={`feature-${id}`}>  {/* 모달에 */}
```

---

### 3.16 뷰 토글 — Cards / Rows (Dub.co 패턴)

> Dub.co의 핵심 UX: 같은 데이터를 카드 뷰(풍부한 정보) ↔ 로우 뷰(고밀도)로 전환

**적용 대상**: Organization 멤버 리스트, 보드 리스트, MySpace 태스크 리스트

```tsx
// Segmented Control로 뷰 전환
<div className="flex gap-0.5 p-0.5 bg-foreground/[0.04] rounded-lg
  border border-border-subtle">
  <button className={`relative p-1.5 rounded-md transition-all ${
    view === 'cards'
      ? 'text-foreground'
      : 'text-slate-500 hover:text-foreground'
  }`}>
    {view === 'cards' && (
      <motion.div
        layoutId="view-toggle"
        className="absolute inset-0 bg-surface-hover rounded-md"
        transition={SPRING.snappy}
      />
    )}
    <LayoutGrid size={14} className="relative z-10" />
  </button>
  <button className={`relative p-1.5 rounded-md transition-all ${
    view === 'rows'
      ? 'text-foreground'
      : 'text-slate-500 hover:text-foreground'
  }`}>
    {view === 'rows' && (
      <motion.div
        layoutId="view-toggle"
        className="absolute inset-0 bg-surface-hover rounded-md"
        transition={SPRING.snappy}
      />
    )}
    <List size={14} className="relative z-10" />
  </button>
</div>
```

---

### 3.17 Noise Texture (선택적 — Raycast 시그니처)

> Raycast의 시각적 특징: 표면에 미세한 노이즈 텍스처 → 디지털 평면감 제거

```css
/* theme.css — 선택적 적용 */
.noise::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: overlay;
}
```

**적용**: 헤더, 사이드바, 모달 배경에 `.noise` 클래스 추가 — 미세한 질감이 더해져 "인쇄물" 느낌

---

## 4. 실행 로드맵

### Phase 1: Design Tokens (1~2일)

디자인 토큰만 깔면 이후 모든 작업이 빨라짐.

| # | 작업 | 파일 |
|---|------|------|
| 1 | Surface 4단계 변수 추가 | `theme.css` |
| 2 | Border 4단계 변수 추가 | `theme.css` |
| 3 | Shadow 토큰 추가 | `theme.css` |
| 4 | Shimmer skeleton CSS 추가 | `theme.css` |
| 5 | `tabular-nums` 유틸 추가 | `theme.css` |
| 6 | Tailwind config에 토큰 매핑 | `tailwind.config` |
| 7 | Motion constants 생성 | `constants/motion.ts` |

### Phase 2: Core Polish (3~5일)

사용자가 즉시 체감할 수 있는 변화.

| # | 작업 | 효과 |
|---|------|------|
| 8 | MotionModal 백드롭 blur↑ + spring 진입 + glass | 모든 모달이 한 번에 프리미엄 |
| 9 | MotionModal `accentColor` prop 내장 | 모달 일관성 |
| 10 | 헤더 glass 적용 (Board, MySpace) | 스크롤 시 레이어 분리 |
| 11 | DraggableCard 3-layer 호버 | 카드 인터랙션 품질 |
| 12 | DraggableCard group-hover 자식 연출 | 카드 활성화 느낌 |
| 13 | 인풋 포커스 통일 (glow focus) | 폼 경험 통일 |
| 14 | 로딩 스피너 통일 (`PageLoading`) | 로딩 경험 통일 |

### Phase 3: Components & Patterns (1주)

공통 컴포넌트 추출 + 패턴 적용.

| # | 작업 | 효과 |
|---|------|------|
| 15 | `EmptyState` 공통 컴포넌트 + 전체 교체 | 빈 상태 통일 |
| 16 | Content-shaped skeleton 컴포넌트 | 로딩 UX |
| 17 | `AmbientBackground` + Dashboard 적용 | 배경 깊이감 |
| 18 | Hover-reveal 패턴 (Org 멤버, Board 리스트) | 시각 노이즈 감소 |
| 19 | 비활성 요소 dimming 적용 | 신호/잡음 비율 개선 |
| 20 | motion constants 마이그레이션 | 모션 일관성 |
| 21 | 뷰 토글 (Cards/Rows) SegmentedControl | UX 유연성 |

### Phase 4: Differentiators (2~3주)

BRIDGE만의 차별화 요소.

| # | 작업 | 효과 |
|---|------|------|
| 22 | **커맨드 팔레트 (⌘K)** | 파워유저 네비게이션 — 임팩트 가장 큼 |
| 23 | Feature Card → Modal `layoutId` transition | Things 3 "떠오르는" 느낌 |
| 24 | 버튼 로딩→성공 상태 전환 | Attio "서프라이즈" |
| 25 | Milestone 달성 confetti | Signature moment |
| 26 | Org `dark:` → foreground 마이그레이션 | 색상 체계 통일 |
| 27 | Noise texture (선택적) | 표면 질감 |

---

## 5. 디자인 원칙 (레퍼런스에서 추출)

이 개선 작업 전체를 관통하는 원칙:

| # | 원칙 | 출처 | BRIDGE 적용 |
|---|------|------|-----------|
| 1 | **절제가 고급이다** | Linear "boring UI" | 색상은 status/accent에만. UI 크롬 최소화 |
| 2 | **기능이 곧 아름다움** | Attio | 예쁘기만 한 장식 금지. 모든 시각 요소가 정보 전달 |
| 3 | **의미 있는 순간에만 모션** | Attio + Things 3 | 일상 동작은 200ms. 완료/달성 시에만 rich animation |
| 4 | **밝기로 깊이를 만든다** | Vercel + Linear | 다크모드에서 그림자 대신 surface 단계로 elevation |
| 5 | **여백이 곧 디자인** | Amie | 밀도를 낮추되 정보량 유지. 스캔 효율 우선 |
| 6 | **호버는 3-layer** | Linear | border + shadow + translate 동시 변화 = 프리미엄 |
| 7 | **비활성을 낮추면 활성이 빛난다** | Linear | opacity dimming으로 자연스러운 시각 위계 |

---

## 6. 레퍼런스 링크

| 제품 | 링크 |
|------|------|
| Linear 디자인 리디자인 | https://linear.app/now/how-we-redesigned-the-linear-ui |
| Linear 테마 컬러 인덱스 | https://linear.style/ |
| Vercel Geist 디자인 시스템 | https://vercel.com/geist/introduction |
| Geist Colors 상세 | https://vercel.com/geist/colors |
| Attio 디자인 철학 | https://strategybreakdowns.com/p/how-attio-does-design |
| Attio 디자인 가이드라인 | https://docs.attio.com/sdk/guides/design-guidelines |
| Notion 컬러 팔레트 | https://www.notionavenue.co/post/notion-color-code-hex-palette |
| Things 3 리디자인 | https://www.macrumors.com/2025/09/16/things-3-22-refreshed-interface-and-more/ |
| Amie 리뷰 | https://skywork.ai/blog/amie-review-2025-calendar-tasks-ai-meeting-notes/ |
| Dub.co 대시보드 | https://dub.co/blog/new-links-dashboard |
| SaaSUI 갤러리 | https://www.saasui.design/ |
| SaaS Interface 갤러리 | https://saasinterface.com/ |

---

*BRIDGE Design Quality Improvement Plan v2.0*
