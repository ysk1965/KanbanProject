# BRIDGE 대시보드 전면 개편 — 통합 홈 기획서

> **버전**: v1.0.0
> **작성일**: 2026-03-04
> **상태**: Draft
> **관련 파일**: `frontend/src/app/components/dashboard/Dashboard.tsx`

---

## 1. 배경 및 목적

### 1.1 현황 (As-Is)

BRIDGE는 **Board(칸반 보드)** 중심의 프로젝트 관리 서비스로, 상위로 **Organization**(조직), 개인 관리로 **MySpace**가 확장되었다.

현재 로그인 후 랜딩 페이지(`/boards`)는 **보드 갤러리**일 뿐이다:

```
┌──────────┬───────────────────────────────────────────┐
│ Sidebar  │  Header (Search + Profile + Logout)       │
│          │──────────────────────────────────────────│
│ All      │  [MySpace Strip — Desktop only]           │
│ Boards   │  Ring Gauges + Habits/Tasks/Events        │
│ Orgs     │──────────────────────────────────────────│
│ MySpace  │  ★ Starred Boards (Grid)                 │
│ Settings │  🏢 Organization Boards (Grid)            │
│          │  📋 Workspace Boards (Grid + Create)      │
│ Recent   │                                           │
│ Boards   │                                           │
└──────────┴───────────────────────────────────────────┘
```

### 1.2 문제점

| # | 문제 | 영향 |
|---|------|------|
| 1 | **대시보드 ≠ 보드 목록** | 로그인 후 "오늘 뭘 해야 하지?"에 즉시 답을 주지 못함 |
| 2 | **크로스보드 태스크 미노출** | MyTasksWidget이 존재하지만 Dashboard에 렌더링되지 않음 |
| 3 | **Organization 정보 부재** | Org 멤버인데 홈에서 Org 상태를 전혀 볼 수 없음 |
| 4 | **알림 미노출** | 읽지 않은 알림을 보드에 들어가야만 확인 가능 |
| 5 | **MySpace Strip 한계** | Desktop에서만 보이고, 클릭하면 MySpace로 이동할 뿐 |

### 1.3 개편 목적

> 로그인 후 **한 화면에서** 오늘의 할 일, 보드 현황, Org 상태를 파악하고 바로 행동할 수 있는 **통합 홈 대시보드**를 제공한다.

**핵심 원칙:**
- Board 중심성 유지 — 보드 갤러리는 메인 콘텐츠로 잔존
- MySpace 독립 유지 — 홈은 Board+Org 요약, MySpace는 순수 개인관리
- 기존 API 활용 — 백엔드 변경 없이 프론트엔드만 개편

---

## 2. 개편 방향 (To-Be)

### 2.1 핵심 변경

| 항목 | As-Is | To-Be |
|------|-------|-------|
| 랜딩 페이지 | `/boards` (보드 갤러리) | `/boards` → **통합 홈 대시보드** |
| Sidebar 첫 메뉴 | "All Boards" (LayoutGrid) | **"Home"** (Home 아이콘) |
| MySpace Strip | Desktop 전용, 클릭→이동 | **Today's Focus Strip**으로 대체 |
| 크로스보드 태스크 | 미노출 | **Right Sidebar — My Tasks Widget** |
| Org 정보 | 미노출 | **Right Sidebar — Org Summary Cards** |
| 알림 | 미노출 | **Header — Notification Badge** |

### 2.2 3-Zone 레이아웃 개념

```
┌────────────────────────────────────────────────────────────┐
│                  TODAY'S FOCUS STRIP                        │
│  "Good morning, 유영진" · 태스크 3건 · 미팅 1건 · 알림 5건  │
├────────────────────────────────────────┬───────────────────┤
│                                        │                   │
│         BOARD GALLERY (Main)           │  RIGHT SIDEBAR    │
│                                        │                   │
│  ★ Starred (가로 스크롤 or Grid)       │  My Tasks Widget  │
│  🏢 Org Boards (Grid by Org)          │  (Today/Week/     │
│  📋 Workspace Boards (Grid + Create)  │   Overdue)        │
│                                        │                   │
│  [Search] [Filter: All/Mine/Joined]    │  Org Summary      │
│  [View: Grid/List]                     │  Cards            │
│                                        │                   │
│                                        │  Celebrations     │
│                                        │  (조건부)          │
│                                        │                   │
└────────────────────────────────────────┴───────────────────┘
```

---

## 3. 정보 구조 (IA)

### 3.1 우선순위별 위젯 정의

| 우선순위 | 위젯 | 위치 | 역할 |
|----------|------|------|------|
| **P0** | Today's Focus Strip | 상단 전체폭 | 오늘의 핵심 지표 (태스크, 미팅, 지연, 알림) |
| **P0** | Board Gallery | 메인 좌측 영역 | 보드 목록 (기존 기능 100% 유지) |
| **P0** | My Tasks Widget | 우측 사이드바 상단 | 크로스보드 태스크 (Today/Week/Overdue 필터) |
| **P1** | Org Summary Cards | 우측 사이드바 중간 | 소속 Org별 요약 카드 |
| **P1** | Notification Badge | 헤더 우측 | 읽지 않은 알림 수 뱃지 |
| **P2** | Celebrations Widget | 우측 사이드바 하단 | 생일/입사기념일 (Org 소속 시만) |
| **P2** | Quick Actions | Focus Strip 하단 or Inline | 보드 생성, 빠른 태스크 추가 |

### 3.2 데이터 소스 매핑

모든 위젯은 **기존 API**로 구동 가능 (백엔드 변경 불필요):

| 위젯 | API | 현재 사용처 |
|------|-----|------------|
| Today's Focus Strip | `personalDashboardAPI.getToday(date)` | Dashboard.tsx (MySpace Strip) |
| Board Gallery | `boardService.getBoards()` | App.tsx (BoardsRoute) |
| My Tasks Widget | `userAPI.getMyTasks(filter)` | MyTasksWidget.tsx (미렌더링) |
| Org Summary Cards | `organizationAPI.list()` | OrganizationPage.tsx |
| Notification Badge | `notificationAPI.getUnreadCounts()` | KanbanBoardPage.tsx |
| Celebrations | `personalDashboardAPI.getCelebrations()` | CelebrationsWidget.tsx |

---

## 4. 레이아웃 와이어프레임

### 4.1 Desktop (lg+, 1024px~)

```
┌────────┬──────────────────────────────────────────────────────────┐
│        │  HEADER                                                  │
│ SIDE   │  [☰ Mobile] [🔍 Search ............] [🔔 3] [👤 유영진]  │
│ BAR    │──────────────────────────────────────────────────────────│
│ (w-60) │                                                          │
│        │  ┌──────────────────────────────────────────────────────┐│
│ 🏠 Home│  │  TODAY'S FOCUS STRIP                                 ││
│ 🏢 Orgs│  │  ☀️ Good morning, 유영진                              ││
│ 👤 My  │  │  [📋 태스크 3건] [📅 미팅 1건] [⚠️ 지연 2건]          ││
│ ⚙ Set  │  └──────────────────────────────────────────────────────┘│
│        │                                                          │
│ ───── │  ┌──────────────────────────────┐  ┌──────────────────┐ │
│ Recent │  │  BOARD GALLERY               │  │  MY TASKS        │ │
│ ├ Bd A │  │                              │  │  [Today][Week]   │ │
│ ├ Bd B │  │  ★ STARRED                  │  │  [Overdue]       │ │
│ └ Bd C │  │  ┌────┐ ┌────┐ ┌────┐      │  │                  │ │
│        │  │  │ Bd │ │ Bd │ │ Bd │ →    │  │  ▸ Board A (2)   │ │
│ [◁ ▷] │  │  └────┘ └────┘ └────┘      │  │    □ Task 1      │ │
│        │  │                              │  │    □ Task 2      │ │
│        │  │  🏢 ORG BOARDS              │  │  ▸ Board B (1)   │ │
│        │  │  ┌────┐ ┌────┐ ┌────┐      │  │    □ Task 3      │ │
│        │  │  │ Bd │ │ Bd │ │ Bd │      │  │                  │ │
│        │  │  └────┘ └────┘ └────┘      │  ├──────────────────┤ │
│        │  │                              │  │  ORG SUMMARY     │ │
│        │  │  📋 WORKSPACE BOARDS        │  │  ┌──────────────┐│ │
│        │  │  ┌────┐ ┌────┐ ┌─ + ─┐     │  │  │ [🏢] Acme    ││ │
│        │  │  │ Bd │ │ Bd │ │ New │     │  │  │ 12명 · 5보드 ││ │
│        │  │  └────┘ └────┘ └─────┘     │  │  │ TEAM Plan    ││ │
│        │  │                              │  │  └──────────────┘│ │
│        │  │  [All ▾] [Mine] [Joined]    │  │                  │ │
│        │  │  [Grid 🟦] [List ☰]         │  │  🎂 축하         │ │
│        │  └──────────────────────────────┘  │  김미영 생일🎉   │ │
│        │                                    └──────────────────┘ │
└────────┴──────────────────────────────────────────────────────────┘
```

**레이아웃 CSS:**
```
Main Content: grid grid-cols-[1fr_320px] gap-6 max-w-7xl mx-auto
Board Gallery: 좌측 칼럼 (자연 너비)
Right Sidebar: 우측 320px 고정폭, sticky top
```

### 4.2 Mobile (<1024px)

```
┌──────────────────────────────────────┐
│  HEADER [☰] [🔍] [🔔 3] [👤]       │
├──────────────────────────────────────┤
│  TODAY'S FOCUS (가로 스크롤 칩)       │
│  [📋 3건] [📅 1건] [⚠️ 2건]         │
├──────────────────────────────────────┤
│  TAB BAR                             │
│  [● Boards] [ Tasks ] [ Orgs ]      │
├──────────────────────────────────────┤
│                                      │
│  (탭 콘텐츠)                          │
│                                      │
│  [Boards 탭 선택 시]:                 │
│  ★ Starred → 가로 스크롤             │
│  🏢 Org Boards → 1열 카드            │
│  📋 Workspace → 1열 카드 + Create    │
│                                      │
│  [Tasks 탭 선택 시]:                  │
│  My Tasks Widget (전체폭)             │
│                                      │
│  [Orgs 탭 선택 시]:                   │
│  Org Cards + Celebrations             │
│                                      │
├──────────────────────────────────────┤
│  [MySpace 바텀 바 — 기존 유지]        │
└──────────────────────────────────────┘
```

**핵심 모바일 결정:**
- Desktop의 2-column을 **탭 기반**으로 전환 (수직 스크롤 과부하 방지)
- Boards 탭이 기본 선택 (현재 동작과 동일한 랜딩 경험)
- MySpace 바텀 바는 기존 그대로 유지 (`hasPersonalSpace` 조건부)

### 4.3 Tablet (md: 768px ~ 1023px)

모바일 레이아웃 사용, 단 보드 그리드를 `sm:grid-cols-2`로 확장.

---

## 5. 위젯 상세 스펙

### 5.1 Today's Focus Strip (P0)

**목적:** 로그인 직후 "오늘 내 상황"을 3초 안에 파악

**데이터 소스:**
- `personalDashboardAPI.getToday(date)` → 태스크 수, 이벤트 수, 습관 완료율
- `notificationAPI.getUnreadCounts()` → 읽지 않은 알림 수

**구성:**
```
┌──────────────────────────────────────────────────────────────┐
│  ☀️ Good morning, 유영진                                      │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ 📋 태스크 │ │ 📅 미팅   │ │ ⚠️ 지연  │ │ 🔔 알림 5    │   │
│  │   3건     │ │   1건    │ │   2건    │ │   읽지 않음   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**인터랙션:**
- 태스크 칩 클릭 → Right Sidebar My Tasks 스크롤 (Desktop) / Tasks 탭 전환 (Mobile)
- 미팅 칩 클릭 → 첫 번째 미팅 보드로 이동 (또는 MySpace Schedule)
- 지연 칩 클릭 → My Tasks Overdue 필터 활성화
- 알림 칩 클릭 → 알림 드롭다운 또는 알림 페이지 (Phase 2)

**인사말 로직:**
```typescript
const getGreeting = (hour: number): string => {
  if (hour < 6) return 'Good night';      // 새벽
  if (hour < 12) return 'Good morning';   // 오전
  if (hour < 18) return 'Good afternoon'; // 오후
  return 'Good evening';                  // 저녁
};
// 이미 PersonalOverview.tsx에 동일 로직 존재 → 재사용
```

**Empty State:**
```
"All clear! 오늘 일정이 없습니다." + ✓ 체크 아이콘
```

**디자인 토큰:**
```tsx
// 컨테이너
<div className="w-full bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 md:p-5">

// 인사말
<h2 className="text-sm md:text-base font-bold text-foreground font-jakarta">
<p className="text-[11px] text-slate-500 mt-0.5">

// 메트릭 칩
<div className="flex items-center gap-3 mt-3 overflow-x-auto custom-scrollbar pb-1">
  <div className="px-3 py-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06]
    flex items-center gap-2 shrink-0 hover:bg-foreground/[0.06] cursor-pointer transition-colors">
    <Icon size={14} className="text-{color}" />
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-bold text-foreground block -mt-0.5">{count}건</span>
    </div>
  </div>
```

### 5.2 Board Gallery (P0)

**현재 코드 100% 유지.** Dashboard.tsx 내 Starred / Org Boards / Workspace Boards 섹션을 별도 컴포넌트로 추출.

**변경점:**
- Grid 열 수 조정: Desktop에서 `xl:grid-cols-4` → `xl:grid-cols-3` (Right Sidebar 공간 확보)
- Starred 섹션: 보드 6개 초과 시 가로 스크롤 (선택적 P2)
- 검색/필터/뷰모드 전부 유지

**추출 컴포넌트:** `BoardGallery.tsx`
```typescript
interface BoardGalleryProps {
  boards: Board[];
  starredBoards: Board[];
  searchQuery: string;
  boardFilter: BoardFilter;
  viewMode: ViewMode;
  onSelectBoard: (boardId: string) => void;
  onToggleStar: (boardId: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  onEditBoard?: (board: Board) => void;
  onCreateBoard: () => void;
}
```

### 5.3 My Tasks Widget (P0)

**기존 컴포넌트 재사용:** `frontend/src/app/components/dashboard/MyTasksWidget.tsx`

이미 완전 구현되어 있으나 현재 Dashboard에 렌더링되지 않는 상태. Right Sidebar에 배치만 하면 됨.

**기존 기능:**
- 필터 탭: Today / This Week / Overdue
- 보드별 그룹핑 (접기/펼치기)
- 보드 클릭 → `/boards/:boardId` 이동
- Empty State 일러스트
- Collapsible 헤더

**배치:**
- Desktop: Right Sidebar 최상단
- Mobile: "Tasks" 탭 콘텐츠 (전체폭)

### 5.4 Org Summary Cards (P1)

**신규 컴포넌트:** `OrgSummaryCard.tsx`

**데이터 소스:** `organizationAPI.list()` → `OrganizationSimple[]`

**카드 디자인:**
```
┌──────────────────────────────────┐
│  [🏢 Logo]  Acme Corp           │
│             12명 · 5 보드        │
│  ┌──────┐  ┌──────┐             │
│  │ TEAM │  │ADMIN │             │
│  └──────┘  └──────┘             │
└──────────────────────────────────┘
```

```tsx
// Org Card
<div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08]
  hover:border-foreground/[0.12] p-4 cursor-pointer transition-colors"
  onClick={() => navigate(`/organizations/${org.id}`)}>

  <div className="flex items-center gap-3">
    {/* Logo */}
    <div className="w-10 h-10 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
      {org.logo_url
        ? <img src={resolveFileUrl(org.logo_url)} className="w-full h-full rounded-lg object-cover" />
        : <Building2 size={18} className="text-bridge-accent" />}
    </div>

    {/* Info */}
    <div className="min-w-0 flex-1">
      <h4 className="text-sm font-bold text-foreground truncate">{org.name}</h4>
      <p className="text-[11px] text-slate-500">
        {org.member_count}명 · {org.board_count} 보드
      </p>
    </div>
  </div>

  {/* Badges */}
  <div className="flex items-center gap-2 mt-3">
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
      bg-bridge-accent/15 text-bridge-accent">{org.current_plan}</span>
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
      bg-bridge-secondary/15 text-bridge-secondary">{org.my_role}</span>
  </div>
</div>
```

**인터랙션:**
- 클릭 → `/organizations/:orgId` 이동
- Org 없는 사용자: 위젯 자체를 숨김 (조건부 렌더링)

**Empty State:** 렌더링하지 않음 (Org 없으면 섹션 전체 비노출)

### 5.5 Notification Badge (P1)

**헤더 변경만.** 별도 위젯 아님.

현재 헤더에 Search + Logout + Profile만 있음 → **알림 벨 아이콘 + 카운트 뱃지** 추가.

```tsx
// Header 우측 영역에 추가
<button className="relative p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5
  rounded-xl transition-colors">
  <Bell size={18} />
  {unreadCount > 0 && (
    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1
      bg-rose-500 text-white text-[10px] font-bold rounded-full
      flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>
  )}
</button>
```

**클릭 동작 (Phase 1):** `navigate('/boards/' + firstBoardId)` (임시, 보드 내 알림으로 이동)
**클릭 동작 (Phase 2):** 알림 드롭다운 패널 (미래 확장)

### 5.6 Celebrations Widget (P2)

**기존 컴포넌트 재사용:** `frontend/src/app/components/personal/CelebrationsWidget.tsx`

**조건:** `user.organizations.length > 0 && celebrations.length > 0`일 때만 렌더링.

**배치:**
- Desktop: Right Sidebar 하단 (Org Cards 아래)
- Mobile: "Orgs" 탭 하단

---

## 6. 네비게이션 변경

### 6.1 사이드바 메뉴

| 순서 | As-Is | To-Be |
|------|-------|-------|
| 1 | `All Boards` (LayoutGrid) → `/boards` | **`Home`** (Home) → `/boards` |
| 2 | `Organizations` (Building2) | 변경 없음 |
| 3 | `My Space` (User) | 변경 없음 |
| 4 | `Settings` (Settings) | 변경 없음 |

```typescript
// Sidebar.tsx menuItems 변경
const menuItems = [
  { key: 'home', icon: <Home size={18} />, label: t('dashboard.sidebar.home', 'Home'), path: '/boards' },
  // ... 나머지 동일
];
```

**Active 판정:** `location.pathname === '/boards'` 또는 `location.pathname === '/'` → `home` 활성화

### 6.2 라우팅

| Route | 변경 |
|-------|------|
| `/` (authenticated) | → `/boards` 리다이렉트 (기존 유지) |
| `/boards` | Dashboard → **HomeDashboard** 컴포넌트 렌더링 |
| `/boards/:boardId` | 변경 없음 (KanbanBoardPage) |

실질적으로 URL은 변경 없이 **컴포넌트만 교체**. 기존 `/boards` URL의 하위 호환성 완벽 유지.

---

## 7. 사용자 시나리오

### 시나리오 1: 신규 유저 (보드 0개)

```
1. 로그인 → /boards (HomeDashboard)
2. Today's Focus Strip: "Welcome to BRIDGE! 첫 보드를 만들어보세요"
3. Board Gallery: Empty State + "Create your first board" CTA
4. Right Sidebar: 미노출 (태스크 없음, Org 없음)
5. CreateBoardModal 자동 오픈 (기존 동작 유지)
6. Onboarding Modal 표시 (localStorage 플래그)
```

### 시나리오 2: 개인 유저 (보드 3개, Org 없음)

```
1. 로그인 → HomeDashboard
2. Today's Focus Strip: "Good afternoon, 유영진 · 태스크 2건 · 지연 1건"
3. Board Gallery:
   - Starred: Board A (1개 즐겨찾기)
   - Workspace: Board B, Board C + Create 카드
4. Right Sidebar:
   - My Tasks: Board A(1건), Board B(1건), Overdue Board C(1건)
   - Org Cards: 미노출
   - Celebrations: 미노출
```

### 시나리오 3: Org 멤버 (보드 5개, Org 2개)

```
1. 로그인 → HomeDashboard
2. Today's Focus Strip: "Good morning, 유영진 · 태스크 4건 · 미팅 1건 · 알림 7"
3. Board Gallery:
   - Starred: 2개 (가로 표시)
   - Org Boards: Acme(3보드), Beta(1보드)
   - Workspace: 1보드 + Create
4. Right Sidebar:
   - My Tasks: 4개 보드에서 태스크 분포
   - Org Cards: [Acme Corp — 15명·3보드·TEAM] [Beta Inc — 8명·1보드·FREE]
   - Celebrations: "김미영 생일 🎂" (Acme)
5. 알림 뱃지: 🔔 7
```

### 시나리오 4: 파워 유저 (보드 15+)

```
1. Today's Focus Strip: 태스크/미팅 수치 높을 수 있음
2. Board Gallery:
   - Starred: 가로 스크롤 (6개 초과 시)
   - Org Boards: 다수 그리드
   - Workspace Boards: "Show more" 또는 전체 그리드
3. 검색이 핵심 — 헤더 Search 크게 활용
4. My Tasks Widget: Collapsible per-board 필수 (많은 태스크)
5. 성능: Board list 먼저 로드, 우측 위젯 병렬 로딩
```

### 시나리오 5: Org-only 유저 (개인 보드 없음)

```
1. Board Gallery:
   - Org Boards: 모든 보드 표시
   - Workspace: Create 카드만 표시
2. Org Cards: 소속 Org 1개 카드
3. MySpace 미노출 (personal_space_enabled = false면)
```

---

## 8. 디자인 토큰 & 스타일 가이드

### 8.1 BRIDGE 디자인 시스템 준수

| 요소 | 토큰 |
|------|------|
| 배경 | `bg-bridge-dark` (페이지), `bg-bridge-obsidian` (카드/위젯) |
| 테두리 | `border-foreground/[0.08]` (기본), `hover:border-foreground/[0.12]` (호버) |
| 텍스트 | `text-foreground` (본문), `text-slate-400` (보조), `text-slate-500` (힌트) |
| 액센트 | `text-bridge-accent` (인디고), `text-bridge-secondary` (틸) |
| 라운드 | 카드 `rounded-2xl`, 버튼/인풋 `rounded-xl`, 칩 `rounded-xl`, 뱃지 `rounded-full` |
| 애니메이션 | `initial={{ opacity: 0, y: 8 }}`, `delay: index * 0.04` |
| 로딩 | `<Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />` |
| 스크롤바 | `custom-scrollbar` |

### 8.2 재사용 컴포넌트

| 컴포넌트 | 파일 | 재사용 방식 |
|----------|------|------------|
| BoardCard | `dashboard/BoardCard.tsx` | 그대로 사용 |
| CreateBoardCard | `dashboard/BoardCard.tsx` | 그대로 사용 |
| MyTasksWidget | `dashboard/MyTasksWidget.tsx` | Right Sidebar에 배치 |
| CelebrationsWidget | `personal/CelebrationsWidget.tsx` | 조건부 Right Sidebar |
| CreateBoardModal | `dashboard/CreateBoardModal.tsx` | 그대로 사용 |
| EditBoardModal | `dashboard/EditBoardModal.tsx` | 그대로 사용 |
| DeleteConfirmModal | `dashboard/Dashboard.tsx` (내부) | 추출 또는 유지 |

### 8.3 신규 컴포넌트

| 컴포넌트 | 파일 (예정) | 설명 |
|----------|------------|------|
| HomeDashboard | `dashboard/HomeDashboard.tsx` | 메인 오케스트레이터 (3-Zone 레이아웃) |
| TodayFocusStrip | `dashboard/TodayFocusStrip.tsx` | 상단 포커스 스트립 |
| BoardGallery | `dashboard/BoardGallery.tsx` | Board Gallery 추출 (기존 로직 이동) |
| OrgSummaryCard | `dashboard/OrgSummaryCard.tsx` | Org 요약 카드 |
| HomeRightSidebar | `dashboard/HomeRightSidebar.tsx` | 우측 사이드바 래퍼 |
| HomeMobileTabs | `dashboard/HomeMobileTabs.tsx` | 모바일 탭 네비게이션 |

---

## 9. 성능 전략

### 9.1 로딩 우선순위

```
Immediate (blocking):
  ① boardService.getBoards() — 보드 목록 (메인 콘텐츠)

Parallel (non-blocking):
  ② personalDashboardAPI.getToday() — Focus Strip 데이터
  ③ userAPI.getMyTasks('today') — My Tasks Widget
  ④ organizationAPI.list() — Org Cards
  ⑤ notificationAPI.getUnreadCounts() — 알림 뱃지

Deferred (lazy):
  ⑥ personalDashboardAPI.getCelebrations() — Celebrations (Org 소속 시만)
```

### 9.2 스켈레톤 로딩

각 위젯은 독립적으로 로딩 상태를 관리:
- Focus Strip: 칩 자리에 shimmer placeholder
- Board Gallery: 기존 BoardCard 스켈레톤 유지
- My Tasks: 기존 Loader2 스피너
- Org Cards: 카드 크기 shimmer
- Celebrations: 숨김 (데이터 로드 후 fade-in)

### 9.3 캐싱

- Board list: `BoardsRoute`에서 이미 로딩 후 props 전달 (기존 패턴 유지)
- Today 데이터: `useEffect` 1회 호출 (기존 패턴)
- Org list: `useEffect` 1회 호출 (신규)
- 알림: `useEffect` 1회 + 보드 진입 시 갱신

---

## 10. 구현 Phase 로드맵

### Phase 1: 핵심 레이아웃 (P0)

**범위:** HomeDashboard 3-Zone 레이아웃 + TodayFocusStrip + BoardGallery 분리

**작업:**
1. `Dashboard.tsx`에서 Board Gallery 로직을 `BoardGallery.tsx`로 추출
2. `HomeDashboard.tsx` 생성 — 3-Zone Desktop 레이아웃
3. `TodayFocusStrip.tsx` 생성 — 인사말 + 메트릭 칩
4. `App.tsx` — `BoardsRoute`에서 Dashboard → HomeDashboard 교체
5. `Sidebar.tsx` — "All Boards" → "Home" 라벨 변경

**예상 파일 변경:** ~6개 파일

### Phase 2: Right Sidebar (P0 + P1)

**범위:** MyTasksWidget 통합 + OrgSummaryCard 신규 + Notification Badge

**작업:**
1. `HomeRightSidebar.tsx` 생성 — 우측 사이드바 래퍼
2. MyTasksWidget을 Right Sidebar에 배치
3. `OrgSummaryCard.tsx` 생성
4. 헤더에 알림 벨 아이콘 + 카운트 뱃지 추가

**예상 파일 변경:** ~4개 파일

### Phase 3: Mobile + Celebrations (P1 + P2)

**범위:** 모바일 탭 레이아웃 + CelebrationsWidget 통합

**작업:**
1. `HomeMobileTabs.tsx` 생성 — 모바일 탭 바
2. 탭 전환 로직 (Boards / Tasks / Orgs)
3. CelebrationsWidget 조건부 렌더링 (Right Sidebar / Orgs 탭)
4. 기존 MySpace 모바일 바텀 바 유지

**예상 파일 변경:** ~3개 파일

### Phase 4: i18n + 마무리

**범위:** 10개 언어 번역 키 추가 + 폴리시

**작업:**
1. 신규 i18n 키 정의 (약 15~20키)
2. 10개 언어 파일 업데이트
3. 애니메이션 튜닝, Empty State 마무리
4. QA (Desktop/Mobile/Tablet)

**예상 파일 변경:** ~10개 파일 (i18n)

---

## 11. i18n 키 (예정)

```json
{
  "home": {
    "greeting": {
      "morning": "Good morning",
      "afternoon": "Good afternoon",
      "evening": "Good evening",
      "night": "Good night"
    },
    "focus": {
      "tasks": "Tasks",
      "meetings": "Meetings",
      "overdue": "Overdue",
      "notifications": "Unread",
      "allClear": "All clear! No tasks due today.",
      "welcome": "Welcome to BRIDGE! Create your first board."
    },
    "tabs": {
      "boards": "Boards",
      "tasks": "Tasks",
      "orgs": "Orgs"
    },
    "orgCard": {
      "members": "members",
      "boards": "boards"
    }
  },
  "dashboard": {
    "sidebar": {
      "home": "Home"
    }
  }
}
```

---

## 12. 리스크 & 의사결정 로그

| # | 의사결정 | 근거 |
|---|---------|------|
| D1 | Board Gallery를 별도 페이지가 아닌 **인라인 유지** | 사용자 랜딩 경험 유지, 추가 네비게이션 홉 방지 |
| D2 | MySpace 독립 유지, 홈에 **통합하지 않음** | 역할 분리: 홈=요약+행동, MySpace=깊은 개인관리 |
| D3 | v1에서 **커스터마이징 없음** (위젯 토글/드래그) | 스코프 관리, 고정 레이아웃이 더 명확한 UX |
| D4 | **백엔드 변경 없음** | 모든 데이터 소스 이미 존재, FE 리팩토링만으로 충분 |
| D5 | 모바일은 **탭 전환** (스크롤이 아닌) | 수직 스크롤 과부하 방지, 명확한 컨텍스트 분리 |
| D6 | Starred 섹션 **가로 스크롤 옵션** (P2) | 파워 유저 대응, 즐겨찾기 많을 때 화면 절약 |

---

## 부록: 기존 코드 참조

### Dashboard.tsx 현재 구조 (940줄)
```
Dashboard.tsx
├── DeleteConfirmModal (내부 컴포넌트)
├── Dashboard (메인)
│   ├── State: boards, search, filter, viewMode, todayData, modals
│   ├── Effects: personalDashboardAPI.getToday(), auto-create modal
│   ├── Render:
│   │   ├── Cosmic Background (dark mode)
│   │   ├── Sidebar (with boards data)
│   │   ├── Header (search + profile + logout)
│   │   ├── Mobile Search Bar
│   │   ├── Main Content:
│   │   │   ├── MySpace Strip (Desktop, hasPersonalSpace)
│   │   │   ├── Section Header (title + filter + view toggle)
│   │   │   ├── Empty States
│   │   │   ├── Starred Section (grid/list)
│   │   │   ├── Org Boards Section (grid/list)
│   │   │   └── Workspace Boards Section (grid/list + create)
│   │   ├── Modals (Create, Edit, Delete, Onboarding)
│   │   ├── Mobile Bottom Bar (MySpace quick access)
│   │   └── Admin Test Buttons
│   └── Styles (star-bg CSS)
└── BoardListItem (리스트 뷰 아이템)
```

### 유지해야 할 기능 체크리스트
- [x] 보드 검색
- [x] 보드 필터 (All/Owned/Joined)
- [x] 뷰 모드 (Grid/List)
- [x] 보드 즐겨찾기 (Star toggle)
- [x] 보드 생성/수정/삭제 모달
- [x] Onboarding 모달
- [x] 빈 보드 시 자동 생성 모달
- [x] Cosmic Background (dark mode)
- [x] Mobile Search Bar
- [x] Mobile Bottom Bar (MySpace)
- [x] Admin Test Buttons
- [x] Sidebar with Recent Boards
