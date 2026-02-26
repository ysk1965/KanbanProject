# BRIDGE UI/UX 현황 비교 분석 (2026-02-26)

> **목적**: Organization, Board, MySpace 3대 핵심 서비스의 UI/UX 패턴을 비교하고, 통일성 부족 지점과 개선 방향을 도출한다.

---

## 1. 전체 구조 비교

| 항목 | Organization | Board (Kanban) | MySpace (Personal) |
|------|-------------|----------------|-------------------|
| **페이지 컨테이너** | `max-w-6xl mx-auto px-6 py-6` | `h-dvh flex flex-col overflow-hidden` | `h-dvh flex flex-col overflow-hidden` |
| **배경** | `bg-bridge-dark` | `bg-bridge-dark` | `bg-bridge-dark` |
| **레이아웃** | 단일 컬럼, 스크롤 | 고정 높이, 수평 스크롤 블록 | 탭 기반, 세로 스크롤 |
| **최대 너비** | `max-w-6xl` (1152px) | 없음 (전체 폭) | `max-w-5xl` / `max-w-3xl` |
| **콘텐츠 영역 max-width** | 고정 | 유동 | 고정 |
| **데스크톱 사이드바** | 모달 내 260px | 없음 | 없음 |
| **모바일 하단 탭바** | 없음 | 없음 | 있음 (`md:hidden`) |

### 불일치 포인트
- Organization만 `max-w-6xl`, MySpace는 `max-w-5xl` — 페이지 최대 너비가 다름
- Board/MySpace는 `h-dvh` 풀 뷰포트이지만 Organization은 일반 스크롤 페이지
- 모바일 하단 탭바는 MySpace에만 존재

---

## 2. 색상 체계 (Color System)

### 2.1 배경색 사용

| 용도 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 페이지 배경 | `bg-bridge-dark` | `bg-bridge-dark` | `bg-bridge-dark` |
| 카드 배경 | `bg-bridge-obsidian` | `bg-bridge-surface-hover` | `bg-bridge-obsidian` |
| 블록/컬럼 배경 | — | `bg-bridge-surface` | — |
| 위젯 헤더 | — | — | `bg-foreground/[0.06]` |
| 인풋 배경 | `bg-foreground/[0.03]` | `bg-foreground/5`, `bg-bridge-obsidian` | `bg-foreground/[0.03]` |
| 모달 배경 | `bg-bridge-obsidian` | `bg-bridge-surface` / `bg-bridge-dark` | `bg-bridge-obsidian` |

### 2.2 테두리 패턴 (가장 큰 불일치)

| 용도 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 카드 테두리 | `border-foreground/[0.05]` | `border-bridge-border` | `border-foreground/[0.08]` ~ `border-foreground/[0.12]` |
| 모달 내부 패널 | `border-black/5 dark:border-white/5` | `border-bridge-border/30` | `border-foreground/[0.08]` |
| 모달 구분선 | `border-foreground/[0.08]` | `border-bridge-border/30` | `border-foreground/[0.08]` |
| 헤더 하단선 | `border-foreground/[0.08]` (모달) | `border-bridge-border` | `border-bridge-border` |
| 호버 테두리 | `hover:border-foreground/[0.08]` | `hover:border-bridge-secondary/40` | `hover:border-foreground/10` |

### 2.3 텍스트 색상 패턴

| 패턴 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| **기본 방식** | `dark:` prefix 혼용 | Bridge 토큰 전용 | foreground 전용 |
| 기본 텍스트 | `text-slate-900 dark:text-white` | `text-foreground` | `text-foreground` |
| 보조 텍스트 | `text-muted-foreground` | `text-zinc-400` | `text-muted-foreground` |
| 힌트 | `text-slate-500` | `text-slate-500` / `text-zinc-500` | `text-slate-500` / `text-slate-600` |
| placeholder | `placeholder-muted-foreground` | `placeholder-zinc-500` / `placeholder-slate-500` | `placeholder-slate-600` |

### 불일치 포인트
- **테두리 체계가 3가지**: Organization = `foreground/[0.05]`, Board = `bridge-border`, MySpace = `foreground/[0.08~0.12]`
- **텍스트 방식이 3가지**: Org = `dark:` prefix, Board = Bridge/zinc, MySpace = foreground
- Organization만 `dark:` prefix를 적극 사용 → 라이트모드 대응은 되지만 일관성 부족
- Board는 `zinc-` 계열, Org/MySpace는 `slate-` 계열로 회색톤이 다름
- 카드 배경이 Org/MySpace는 `obsidian`이지만 Board만 `surface-hover`

---

## 3. 탭 네비게이션

### 3.1 데스크톱 탭 스타일

| 서비스 | 위치 | 활성 스타일 | 비활성 스타일 | 형태 |
|--------|------|-----------|-------------|------|
| Organization | 페이지 상단 (inline) | `bg-bridge-accent/10 text-bridge-accent` | `text-muted-foreground hover:bg-foreground/[0.03]` | Pill (rounded-xl) |
| Board | 헤더 중앙 (절대위치) | `bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg` | `text-zinc-400 hover:bg-bridge-surface-hover` | Pill in container (`bg-bridge-surface p-1 rounded-xl`) |
| MySpace | 헤더 중앙 (절대위치) | Board와 동일 (gradient) | Board와 동일 | Board와 동일 |

### 3.2 서브탭 / 모달 내 탭

| 서비스 | 스타일 |
|--------|--------|
| Organization (모달) | 밑줄 인디케이터 (`layoutId` spring 애니메이션) |
| Organization (Insights) | Filled pill (`bg-bridge-accent text-white`) |
| Board (sub-toggle) | 미니 pill in container (`bg-foreground/10 text-foreground`) |
| MySpace | 서브탭 없음 |

### 불일치 포인트
- Organization 페이지 탭만 다른 스타일 (gradient가 아닌 accent/10 배경)
- Organization 내부에서도 3가지 탭 스타일 혼용 (페이지 pill, 모달 underline, Insights filled)
- Board/MySpace는 동일한 gradient 탭 사용 → 통일됨

---

## 4. 카드 & 컨테이너

### 4.1 카드 라운딩

| 서비스 | 섹션/외부 카드 | 아이템/내부 카드 | 모달 |
|--------|-------------|---------------|------|
| Organization | `rounded-2xl` | `rounded-xl` | `rounded-t-2xl sm:rounded-2xl` |
| Board | `rounded-2xl` (블록) | `rounded-xl` (태스크 카드) | `rounded-t-2xl sm:rounded-2xl` |
| MySpace | `rounded-2xl` (위젯) | `rounded-xl` (아이템) | `rounded-t-2xl sm:rounded-2xl` |

> 라운딩은 **통일됨** — 외부 `rounded-2xl`, 내부 `rounded-xl`

### 4.2 카드 패딩

| 서비스 | 섹션 카드 | 아이템 카드 |
|--------|---------|-----------|
| Organization | `p-5` | `p-4` |
| Board | `px-4 py-3` (블록 헤더) | `px-3 py-2.5` (태스크) |
| MySpace | `p-3 md:p-5` (위젯 바디) | `p-3.5` (습관), `px-2.5 py-2` (태스크) |

### 4.3 카드 호버 효과

| 서비스 | 호버 효과 |
|--------|----------|
| Organization | `hover:border-foreground/[0.08]` 또는 `hover:border-bridge-accent/30` |
| Board | `hover:border-bridge-secondary/40 hover:shadow-2xl hover:shadow-bridge-secondary/10` |
| MySpace | `hover:border-foreground/10` 또는 `hover:bg-foreground/[0.06]` |

### 불일치 포인트
- Board만 shadow glow 호버 효과 사용
- 호버 테두리 색상이 모두 다름
- 아이템 패딩이 서비스마다 다름 — 밀도(density) 기준이 없음

---

## 5. 버튼 스타일

### 5.1 Primary 버튼

| 서비스 | 스타일 |
|--------|--------|
| Organization | `px-4 py-2 bg-bridge-accent text-white rounded-xl font-bold text-sm` |
| Board | `bg-bridge-accent text-white rounded-xl font-bold hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]` |
| MySpace | `px-4 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold` |
| MySpace (습관) | `px-5 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-bold` |
| MySpace (일기) | `bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-xl` |

### 5.2 모달 확인 버튼

| 서비스 | 스타일 |
|--------|--------|
| Organization | `px-4 py-1.5 rounded-lg text-xs font-bold` |
| Board | `px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg` (QuickAdd) |
| MySpace | `px-4 py-1.5 rounded-lg text-xs font-bold` |

### 5.3 Ghost / Icon 버튼

| 서비스 | 스타일 |
|--------|--------|
| Organization | `p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5` |
| Board | `p-2 hover:bg-bridge-surface-hover rounded-lg text-zinc-400 hover:text-foreground` |
| MySpace | `p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5` |

### 5.3 Empty State CTA 버튼

| 서비스 | 스타일 |
|--------|--------|
| Organization | `px-5 py-2.5 bg-bridge-accent text-white rounded-xl hover:shadow-glow` |
| Board | gradient glow 버튼 (매우 화려) |
| MySpace | `px-3 py-1.5 text-[11px] bg-{color}/10 text-{color} rounded-xl` (컬러별 소프트) |

### 불일치 포인트
- **Primary 버튼 라운딩 불일치**: Org/Board = `rounded-xl`, MySpace 일부 = `rounded-lg`
- **Primary 버튼 패딩 불일치**: `py-2` vs `py-2.5` vs `py-1.5`
- **폰트 크기 불일치**: `text-sm` vs `text-xs` vs `text-[11px]`
- MySpace 습관 도메인만 `purple-500` 별도 브랜드 컬러 사용
- Board QuickAdd 버튼이 독특한 반전 스타일 (`bg-white text-black`)
- Empty state CTA가 3가지 모두 다른 접근

---

## 6. 타이포그래피

### 6.1 제목 체계

| 레벨 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 페이지 제목 | `text-xl font-bold tracking-tight` | `text-sm md:text-lg font-bold tracking-tight` | `text-sm md:text-lg font-bold tracking-tight` |
| 모달 제목 | `text-lg font-bold` | `text-lg font-semibold` | `text-sm font-bold` |
| 섹션 제목 | `text-sm font-bold` | `font-bold text-sm tracking-tight` | `text-[13px] md:text-sm font-bold` |
| 라벨 (uppercase) | `text-[11px] font-bold uppercase tracking-widest text-muted-foreground` | `text-[11px] font-bold uppercase tracking-widest text-slate-400` | `text-[11px] font-bold uppercase tracking-widest text-slate-400` |

### 6.2 본문/보조 텍스트

| 용도 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 리스트 아이템 제목 | `text-sm text-foreground font-medium` | `text-[13px] font-bold text-foreground` | `text-xs font-bold` ~ `text-sm font-medium` |
| 부제목 | `text-xs text-muted-foreground` | `text-[10px] font-medium text-zinc-400` | `text-[11px] text-slate-500` |
| 타임스탬프 | `text-[10px] text-slate-500` | `text-[11px] font-bold text-amber-300` | `text-[10px] text-slate-600` |
| 뱃지 텍스트 | `text-[9px]` ~ `text-[10px] font-bold` | `text-[9px]` ~ `text-[10px] font-bold` | `text-[10px] font-bold` |

### 불일치 포인트
- **모달 제목**: `font-bold` vs `font-semibold` vs 크기 차이 (`text-lg` vs `text-sm`)
- **아이템 제목 크기**: `text-sm` vs `text-[13px]` vs `text-xs` — 밀도 기준 없음
- Organization 페이지 제목만 `text-xl` (Board/MySpace는 반응형 `text-sm md:text-lg`)
- 라벨(uppercase)은 **거의 통일** — 좋은 패턴

---

## 7. 폼 입력 필드

| 항목 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 배경 | `bg-foreground/[0.03]` | `bg-foreground/5` / `bg-bridge-obsidian` | `bg-foreground/[0.03]` |
| 테두리 | `border-foreground/[0.08]` | `border-foreground/10` / `border-bridge-border` | `border-foreground/10` |
| 라운딩 | `rounded-xl` | `rounded-xl` / `rounded-lg` | `rounded-xl` / `rounded-lg` |
| 포커스 | `focus:ring-2 focus:ring-bridge-accent/50` | `focus:ring-1 focus:ring-bridge-secondary/40` | `focus:ring-1 focus:ring-bridge-accent/10` |
| placeholder | `placeholder-muted-foreground` | `placeholder-zinc-500` / `placeholder-slate-500` | `placeholder-slate-600` |
| 패딩 | `py-3 px-4` | `px-4 py-3` / `p-3` | `p-3` |

### 불일치 포인트
- **포커스 링 색상이 3가지**: Org = `accent/50`, Board = `secondary/40`, MySpace = `accent/10`
- **포커스 링 두께**: Org = `ring-2`, Board/MySpace = `ring-1`
- placeholder 색상이 모두 다름
- Board만 일부 입력에 `bridge-secondary` 포커스 사용 (드래그 테마와 맞추려는 의도?)

---

## 8. 뱃지 & 상태 표시

### 8.1 기본 뱃지

| 서비스 | 패턴 |
|--------|------|
| Organization | `text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-{color}/20 text-{color}-600 dark:text-{color}-400` |
| Board | `text-[10px] font-bold px-2 py-0.5 rounded-full border` + inline `style={{ bg: color+'15', border: color+'44', color }}` |
| MySpace | `text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-{color}/10 text-{color}` |

### 8.2 뱃지 배경 투명도

| 서비스 | 투명도 |
|--------|--------|
| Organization | `/20` |
| Board | `15` (hex, inline style) |
| MySpace | `/10` |

### 불일치 포인트
- **뱃지 배경 투명도가 3가지**: `/20`, `/15`(hex), `/10`
- Organization만 `dark:` prefix로 텍스트 분기 (`text-amber-600 dark:text-amber-400`)
- Board만 inline style로 뱃지 색상 처리 (동적 feature color 때문)
- 텍스트 크기: Org는 `text-[9px]`, Board/MySpace는 `text-[10px]`

---

## 9. 모달 패턴

### 9.1 공통 구조 (MotionModal 기반)

| 항목 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 최대 너비 | `sm:max-w-4xl` (멤버상세) | `sm:max-w-[1100px]` (태스크), `sm:max-w-md` | `sm:max-w-md` |
| 배경색 | `bg-bridge-obsidian` | `bg-bridge-surface` / `bg-bridge-dark` | `bg-bridge-obsidian` |
| 상단 악센트 라인 | `h-[2px] gradient accent→secondary` | `h-[3px]` + feature color | `h-[2px] gradient accent→secondary` |
| 헤더 패딩 | `px-6 pt-5 pb-4` | `px-6 py-4` | `px-5 pt-4 pb-3` |
| 바디 패딩 | `px-6 py-5` | `p-6` | `px-5 pb-5 pt-4` |
| 푸터 | `px-6 py-4 border-t` | `px-6 py-5 border-t` | `pt-3 border-t` (바디 내부) |
| 스크롤바 | `custom-scrollbar` | `kanban-scrollbar` | `custom-scrollbar` |

### 9.2 모달 아이콘 컨테이너

| 서비스 | 아이콘 컨테이너 |
|--------|-------------|
| Organization | `w-8 h-8 rounded-lg bg-bridge-accent/20` |
| Board | 없음 (인라인 아이콘) |
| MySpace | `w-8 h-8 rounded-lg bg-bridge-accent/10` |

### 불일치 포인트
- **모달 배경색**: Org/MySpace = `obsidian`, Board = `surface` / `dark` — 색상 다름
- **상단 악센트 라인 높이**: `h-[2px]` vs `h-[3px]`
- **헤더/바디/푸터 패딩**: `px-6` vs `px-5`, `py-5` vs `py-4` — 미세하게 다름
- **스크롤바 클래스명**: `custom-scrollbar` vs `kanban-scrollbar` — 실제 CSS도 다를 수 있음
- **아이콘 컨테이너 배경 투명도**: `/20` vs `/10`
- 푸터 위치가 다름: Org/Board = 별도 영역, MySpace = 바디 내 `border-t`

---

## 10. 애니메이션

### 10.1 진입 애니메이션

| 서비스 | 기본 진입 | 리스트 스태거 딜레이 |
|--------|---------|-------------------|
| Organization | `opacity:0, y:8` → `opacity:1, y:0` | `index * 0.03` ~ `0.06` |
| Board | `opacity:0, y:20` → `opacity:1, y:0` | `index * 0.15` (EmptyBoard) |
| MySpace | `opacity:0, y:16` → `opacity:1, y:0` | `index * 0.03` |

### 10.2 탭 전환

| 서비스 | 방식 |
|--------|------|
| Organization | `AnimatePresence mode="wait"` — fade + y:6 (0.15s) |
| Board | 없음 (탭 = 뷰 전환, 페이지 리로드) |
| MySpace | `AnimatePresence mode="wait"` — 방향 인식 슬라이드 x:40% (0.2s) |

### 10.3 로딩 상태

| 서비스 | 방식 |
|--------|------|
| Organization | `border-2 border-bridge-accent border-t-transparent rounded-full animate-spin` (커스텀 div) |
| Board | `text-foreground text-lg font-light` (텍스트만) |
| MySpace | `Loader2 w-8 h-8 animate-spin text-bridge-accent` (Lucide 아이콘) |

### 불일치 포인트
- **로딩 스피너가 3가지 다른 구현** — 가장 눈에 띄는 불일치
- 진입 애니메이션 y값이 다름 (8, 16, 20)
- 탭 전환 애니메이션이 모두 다름
- Board만 스켈레톤/스피너 없이 텍스트 로딩

---

## 11. Empty State

| 항목 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 아이콘 컨테이너 (큰) | `w-16 h-16 rounded-2xl bg-accent/10` | `w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20` | `w-16 h-16 rounded-2xl bg-{color}/10` |
| 제목 | `text-base font-bold` | `text-2xl md:text-3xl font-bold font-jakarta` | `text-lg font-bold` |
| 설명 | `text-sm text-muted-foreground max-w-xs` | `text-slate-400 font-light text-sm md:text-base` | `text-sm text-slate-400 max-w-xs` |
| CTA | `bg-bridge-accent rounded-xl` | gradient glow 효과 | `bg-{color} rounded-xl` |
| 여백 | `py-16` | 화면 전체 (flex center) | `py-16` |

### 불일치 포인트
- Board의 empty state가 매우 화려 (3D-like gradient glow) vs Org/MySpace는 미니멀
- 제목 크기가 극단적으로 다름 (`text-base` vs `text-2xl~3xl` vs `text-lg`)
- Board만 `font-jakarta` 별도 폰트 사용
- 아이콘 컨테이너 border 유무가 다름

---

## 12. 반응형 (Mobile)

| 항목 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 주요 breakpoint | `sm:` (640px) | `md:` (768px) | `md:` (768px) |
| 헤더 높이 | 고정 (auto) | `min-h-[3.5rem] md:h-16` | `min-h-[3.5rem] md:h-16` |
| 모바일 탭 | 수평 스크롤 | hidden (데스크톱만) | 하단 탭바 |
| 모바일 내비게이션 | 탭 스크롤 | — | FAB + 하단 탭바 |
| safe-area | 없음 | `safe-top` | `safe-top` + `env(safe-area-inset-bottom)` |
| DVH 사용 | 없음 (`min-h-screen`) | `h-dvh`, `max-h-[85dvh]` | `h-dvh` |

### 불일치 포인트
- **Organization은 safe-area 미대응** — iOS 노치/하단 바 대응 없음
- **주요 breakpoint 불일치**: Org = `sm:`, Board/MySpace = `md:`
- Organization만 DVH 미사용 — 모바일에서 주소바 문제 가능
- 모바일 내비게이션 전략이 3가지 모두 다름

---

## 13. 드롭다운 / 컨텍스트 메뉴

| 항목 | Organization | Board | MySpace |
|------|-------------|-------|---------|
| 배경 | `bg-bridge-obsidian border-black/5 dark:border-white/5` | — (ShadCN DropdownMenu) | `bg-bridge-obsidian border-foreground/10` |
| 라운딩 | `rounded-xl` | — | `rounded-xl` |
| 아이템 패딩 | `px-4 py-2.5` | — | 커스텀 |
| 진입 애니메이션 | `scale: 0.95 → 1` (0.15s) | — | — |
| 구분선 | `border-black/5 dark:border-white/5` | — | `border-foreground/10` |

### 불일치 포인트
- 테두리 방식이 다름 (`dark:` vs `foreground`)
- Board는 ShadCN 기본 DropdownMenu 사용, 나머지는 커스텀

---

## 14. 핵심 불일치 요약 (Priority)

### P0: 즉시 통일 필요

| # | 항목 | 현재 상태 | 통일 방향 제안 |
|---|------|---------|-------------|
| 1 | **테두리 체계** | 3가지 혼용 (`foreground/[0.05]`, `bridge-border`, `foreground/[0.08~12]`) | `foreground/[0.08]` 또는 `bridge-border` 하나로 통일 |
| 2 | **로딩 스피너** | 3가지 구현 (div 커스텀, 텍스트, Lucide 아이콘) | `Loader2` 아이콘 + `animate-spin` 통일 |
| 3 | **폼 포커스 링** | 3가지 (`ring-2 accent/50`, `ring-1 secondary/40`, `ring-1 accent/10`) | `focus:ring-2 focus:ring-bridge-accent/50` 통일 |
| 4 | **placeholder 색상** | `muted-foreground`, `zinc-500`, `slate-500`, `slate-600` | `placeholder-slate-500` 통일 |
| 5 | **모달 내부 패딩** | `px-5` vs `px-6`, `py-4` vs `py-5` | `px-5 pt-4 pb-4` / `px-5 pb-5 pt-4` 통일 |

### P1: 단계적 개선

| # | 항목 | 현재 상태 | 통일 방향 제안 |
|---|------|---------|-------------|
| 6 | **회색톤** | `zinc-` vs `slate-` 혼용 | `slate-` 통일 (더 따뜻한 톤, Bridge 브랜드에 적합) |
| 7 | **뱃지 배경 투명도** | `/10`, `/15`, `/20` | `/15` 통일 |
| 8 | **Org 탭 스타일** | 페이지 탭만 accent/10 pill (Board/MySpace와 다름) | gradient 스타일로 통일 또는 의도적 차별화 유지 |
| 9 | **모달 배경** | `obsidian` vs `surface` vs `dark` | `bg-bridge-obsidian` 통일 (단, Board 디테일은 `surface` 유지 가능) |
| 10 | **진입 애니메이션 y값** | 8, 16, 20 혼용 | 카드 `y:12`, 페이지 `y:20` 통일 |

### P2: 장기 개선

| # | 항목 | 현재 상태 | 통일 방향 제안 |
|---|------|---------|-------------|
| 11 | **Org `dark:` 제거** | Organization만 `dark:` prefix 사용 | foreground 기반으로 마이그레이션 |
| 12 | **모바일 breakpoint** | Org = `sm:`, Board/MySpace = `md:` | `md:` 통일 |
| 13 | **모바일 내비게이션** | 3가지 다른 전략 | Org에도 하단 탭바 또는 통일된 내비게이션 패턴 |
| 14 | **Org safe-area** | 미대응 | `safe-top`, `h-dvh` 적용 |
| 15 | **Empty state 통일** | 3가지 다른 스케일 | 공통 EmptyState 컴포넌트 추출 |

---

## 15. 통일 디자인 토큰 제안 (Design Token Proposal)

아래는 3개 서비스에 공통 적용할 수 있는 통일 토큰입니다:

```tsx
// === Borders ===
// 카드 기본 테두리
"border-foreground/[0.08]"
// 카드 호버 테두리
"hover:border-foreground/[0.12]"
// 모달 내부 구분선
"border-foreground/[0.08]"
// 인풋 테두리
"border-foreground/10"

// === Backgrounds ===
// 페이지 배경: bg-bridge-dark (통일됨)
// 카드/패널 배경: bg-bridge-obsidian
// 인풋/서피스: bg-foreground/[0.03]
// 호버 tint: hover:bg-foreground/5

// === Text ===
// 기본: text-foreground
// 보조: text-muted-foreground
// 힌트: text-slate-500
// placeholder: placeholder-slate-500

// === Badges ===
// 배경 투명도: /15 통일
// 텍스트: text-{color}-500 (중간톤, dark:/light 모두 가독성 확보)
// 크기: text-[10px] font-bold

// === Buttons ===
// Primary: px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-bold
// Ghost icon: p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5
// Modal confirm: px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white

// === Focus Ring ===
// focus:outline-none focus:ring-2 focus:ring-bridge-accent/50

// === Loading ===
// <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />

// === Entry Animation ===
// initial={{ opacity: 0, y: 12 }}
// animate={{ opacity: 1, y: 0 }}
// transition={{ delay: index * 0.04 }}
```

---

## 16. 다음 단계

1. **디자인 토큰 합의** — 위 제안을 기반으로 최종 토큰 확정
2. **공통 컴포넌트 추출** — `EmptyState`, `LoadingSpinner`, `Badge`, `FormInput` 등
3. **Organization `dark:` 마이그레이션** — foreground 기반으로 전환
4. **Board 색상 토큰 정리** — `bridge-surface-hover` 등 Board 전용 토큰 재정의
5. **Storybook / 디자인 시스템 문서** — 통일된 패턴 시각화

---

*Generated by BRIDGE UI/UX Audit — v1.0*
