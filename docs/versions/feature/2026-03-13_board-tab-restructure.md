# Feature: 협업 보드 탭 구조 개편 — "보드" 뷰 통합 + 리스트 뷰

> 생성일: 2026-03-13
> 상태: 📋 기획 완료

---

## Feature Capsule

```
기능명: 협업 보드 탭 구조 개편
한줄 설명: 칸반보드를 "보드"로 리네이밍하고, 간트·캘린더·리스트뷰·마일스톤을 보드의 서브뷰로 통합

해결하는 문제:
- 간트 차트, 캘린더, 마일스톤은 "업무 데이터(피처/태스크)"를 시각화하는 뷰인데,
  "일정(인원 기준)" 탭 안에 있어 개념적으로 맞지 않음
- 칸반 뷰 하나만으로는 업무 전체 파악이 어려움 (리스트 뷰 부재)
- 탭 구조가 직관적이지 않아 사용자가 원하는 뷰를 찾기 어려움

핵심 컨셉:
- 보드 탭 = 업무 중심 (같은 피처/태스크 데이터를 다양한 뷰로 시각화)
- 일정 탭 = 인원 중심 (시간 블록 기반 일일 스케줄, 향후 확장 예정)

핵심 시나리오:
1. 사용자가 "보드" 탭 클릭 → 마지막 사용한 서브뷰(칸반/간트/캘린더/리스트/마일스톤) 복원
2. 서브뷰 전환 바에서 아이콘 클릭으로 뷰 모드 변경
3. 리스트 뷰에서 피처별로 그룹핑된 태스크를 테이블 형태로 확인
4. 일정 탭 클릭 → 일일 스케줄 뷰 (인원별 시간 블록)

Scope (이번 구현):
- "칸반" 탭 → "보드" 리네이밍
- 간트 차트, 캘린더, 마일스톤을 보드 탭의 서브뷰로 이동
- 리스트 뷰(NEW) 신규 개발
- 보드 서브뷰 전환 바 컴포넌트 신규 개발
- 일정 탭은 서브탭 구조 유지 (현재 일일 스케줄만, 향후 확장 대비)
- i18n 10개 언어 키 추가
- localStorage 마이그레이션 (기존 사용자 호환)

Non-scope (다음으로 미룸):
- 일정 탭 신규 서브뷰 추가 (향후 인원 중심 뷰 추가 예정)
- 리스트 뷰 인라인 편집 (클릭하면 상세 모달로 이동)
- 리스트 뷰 드래그앤드롭 (블록 간 이동)
- 리스트 뷰 컬럼 커스터마이징
- 백엔드 API 변경 (프론트엔드 뷰 레이어 변경만)

성공 기준:
- 보드 탭에서 칸반↔간트↔캘린더↔리스트↔마일스톤 1초 내 전환
- 리스트 뷰에서 전체 태스크를 한눈에 파악 가능
- 기존 사용자의 뷰 모드 설정 자동 마이그레이션

영향받는 기존 코드:
- FE: KanbanBoardPage.tsx, KanbanBoardHeader.tsx, i18n locales (10개)
- FE 신규: BoardViewSwitcher.tsx, BoardListView.tsx
- BE: 변경 없음 (프론트엔드 뷰 레이어만 변경)

주요 리스크:
- KanbanBoardPage.tsx가 3,400줄로 대형 파일 → 신규 컴포넌트는 별도 파일로 분리
- "weekly" → "gantt" 리네이밍 시 URL 딥링크 하위호환 필요
```

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 마일스톤 위치 | 보드 서브뷰로 이동 | 마일스톤은 피처/태스크(업무) 데이터를 조직하는 뷰 | 일정 탭 유지 / 독립 탭 |
| D-02 | 리스트 뷰 주요 단위 | 피처 + 태스크 | 피처별 그룹핑으로 업무 맥락 유지 + 태스크 단위 상세 확인 | 태스크만 / 피처만 |
| D-03 | 일정 탭 구성 | 서브탭 구조 유지 (현재 일일만) | 향후 인원 중심 뷰 추가 대비 | 서브탭 제거 후 단일 뷰 |
| D-04 | ViewMode 리네이밍 | "weekly" → "gantt" | 기능명과 일치, 직관적 | "weekly" 유지 |
| D-05 | 보드 서브뷰 전환 UI | 아이콘 토글 바 (현재 일정 서브탭과 동일 패턴) | 일관된 UX, 기존 패턴 재사용 | 드롭다운 / 탭 |
| D-06 | 리스트 뷰 그룹핑 | 피처 기본, 블록/담당자/상태 전환 가능 | 다양한 관점 제공 | 고정 그룹핑 |

---

## 1. 탭 구조 변경 개요

### 변경 전 (현재)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [칸반]   [일정 ▾]          [미팅]   [노트]   [AI 분석 ▾]          │
│           ├─ 일일                                                   │
│           ├─ 간트 🔒                                                │
│           ├─ 캘린더                                                  │
│           └─ 마일스톤 🔒                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 변경 후

```
┌─────────────────────────────────────────────────────────────────────┐
│  [보드 ▾]   [일정 ▾]       [미팅]   [노트]   [AI 분석 ▾]          │
│  ├─ 칸반              ├─ 일일                                       │
│  ├─ 간트 🔒           └─ (향후 확장)                                │
│  ├─ 캘린더                                                          │
│  ├─ 리스트 ← NEW                                                   │
│  └─ 마일스톤 🔒                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 핵심 원칙

| 탭 | 관점 | 데이터 소스 | 설명 |
|----|------|------------|------|
| **보드** | 업무 중심 | features, tasks, dependencies | 피처/태스크를 다양한 형태로 시각화 |
| **일정** | 인원 중심 | schedule_blocks (시간 블록) | 인원별 시간 배분 관리 |
| **미팅** | 이벤트 중심 | meetings | 미팅 일정/전사/요약 |
| **노트** | 문서 중심 | notes | 공유 문서/화이트보드 |
| **AI 분석** | 인사이트 중심 | 통계/AI 리포트 | 팀 성과 분석 |

---

## 2. 보드 서브뷰 전환 바 (BoardViewSwitcher)

### 와이어프레임

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← 보드 이름                    [보드] [일정] [미팅] [노트] [AI]    │  ← 메인 탭
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│         ┌──────────────────────────────────────────────┐           │  ← 서브뷰 전환 바
│         │ [≡ 칸반] [⊞ 간트🔒] [📅 캘린더] [☰ 리스트] [🏁 마일스톤🔒] │           │
│         └──────────────────────────────────────────────┘           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │  ← 선택된 뷰 콘텐츠
│  │                                                              │  │
│  │              (칸반 / 간트 / 캘린더 / 리스트 / 마일스톤)         │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 서브뷰 상세

| 서브뷰 | 아이콘 | 설명 | 프리미엄 | 기존/신규 |
|--------|--------|------|---------|----------|
| 칸반 | `LayoutGrid` | 블록별 카드 드래그앤드롭 | - | 기존 (default) |
| 간트 | `GanttChart` | 피처/태스크 타임라인 바 차트 | 🔒 | 기존 (일정→이동) |
| 캘린더 | `Calendar` | 월별 달력에 피처/태스크 표시 | - | 기존 (일정→이동) |
| 리스트 | `List` | 피처+태스크 테이블/리스트 뷰 | - | **신규** |
| 마일스톤 | `Flag` | 마일스톤별 피처/태스크 관리 | 🔒 | 기존 (일정→이동) |

### 동작 사양

- **초기 진입**: 마지막 사용 서브뷰 복원 (localStorage: `boardSubMode_{boardId}`)
- **전환 시**: 선택한 서브뷰 저장 + 즉시 렌더링 (같은 데이터, 다른 시각화)
- **프리미엄 잠금**: 🔒 아이콘 표시, 클릭 시 업그레이드 안내
- **모바일**: 아이콘만 표시 (라벨 숨김), 좌우 스크롤 가능

---

## 3. 리스트 뷰 (신규)

### 3.1 개요

피처와 태스크를 **테이블/리스트 형태**로 표시하는 뷰. 칸반 보드의 시각적 제약(블록별 분리, 카드 크기 제한) 없이 전체 업무를 한눈에 파악할 수 있음.

### 3.2 와이어프레임

```
┌─────────────────────────────────────────────────────────────────────────┐
│  그룹: [피처 ▾]   정렬: [마감일 ▾] [↑↓]                   🔍 검색...   │  ← 툴바
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ▼ 🟣 로그인 기능 구현                                   3/5 태스크     │  ← 피처 그룹 헤더
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │  ☐  │ 🟣│ 소셜 로그인 API 연동    │ Task  │ 홍길동 │ 03/15 │ 2/3 │  │  ← 태스크 행
│  │  ☑  │ 🟣│ JWT 토큰 관리           │ Done  │ 김철수 │ 03/12 │ 4/4 │  │
│  │  ☐  │ 🟣│ 비밀번호 재설정 화면    │ Task  │ 이영희 │ 03/18 │ 0/2 │  │
│  │  ☐  │ 🟣│ 이메일 인증 플로우      │ Code  │  —    │  —   │  —  │  │  ← 커스텀 블록
│  │  ☐  │ 🟣│ 로그인 에러 핸들링      │ Task  │ 박민수 │ 03/20 │ 1/3 │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│                                                                         │
│  ▼ 🔵 대시보드 UI 개발                                   1/3 태스크     │  ← 다음 피처 그룹
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │  ☐  │ 🔵│ 차트 컴포넌트 구현      │ Task  │ 홍길동 │ 03/22 │ 0/5 │  │
│  │  ☐  │ 🔵│ 데이터 바인딩           │ Task  │ 이영희 │ 03/25 │ 0/2 │  │
│  │  ☑  │ 🔵│ 위젯 레이아웃           │ Done  │ 김철수 │ 03/20 │ 3/3 │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│                                                                         │
│  ▶ 📦 미할당 태스크                                       2 태스크      │  ← 접힌 그룹
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 컬럼 구성

| 컬럼 | 너비 | 내용 | 비고 |
|------|------|------|------|
| 완료 | 24px | 체크 아이콘 (Done 블록 여부) | 클릭 시 Done 블록으로 이동 |
| 컬러 | 4px | 피처 컬러 바 | `getAssigneeHex` 또는 피처 컬러 |
| 제목 | flex | 태스크 제목 | 클릭 시 TaskDetailModal 열기 |
| 블록 | 60px | 현재 위치 블록명 뱃지 | Task, Done, 커스텀 블록명 |
| 담당자 | 80px | 아바타(들) | 멤버 컬러맵 적용 |
| 마감일 | 60px | 마감 날짜 | 오버듀: 빨강, 임박: 주황 |
| 체크리스트 | 40px | 완료/전체 (e.g., 2/5) | 없으면 — |

### 3.4 그룹핑 옵션

| 그룹 기준 | 그룹 헤더 | 설명 |
|----------|---------|------|
| **피처** (기본) | 피처명 + 컬러 + 진행률 | 피처별로 하위 태스크 묶음 |
| **블록** | 블록명 (Feature, Task, Done, 커스텀) | 칸반 블록 기준 |
| **담당자** | 담당자 이름 + 아바타 | 인원별 할당 태스크 |
| **상태** | 완료/진행중/미시작 | 태스크 상태 기준 |
| **없음** | (그룹 없이 플랫 리스트) | 전체 태스크 한 줄씩 |

### 3.5 정렬 옵션

| 정렬 기준 | 오름차순 | 내림차순 |
|----------|---------|---------|
| 제목 | A→Z | Z→A |
| 마감일 | 가까운 순 | 먼 순 |
| 상태 | 미완료→완료 | 완료→미완료 |
| 생성일 | 오래된 순 | 최신 순 |

### 3.6 사용자 플로우

1. **조회**: 보드 탭 → 리스트 서브뷰 선택 → 피처별 그룹핑된 태스크 목록 표시
2. **그룹 변경**: 툴바 "그룹" 드롭다운 → 블록/담당자/상태 선택 → 즉시 재그룹핑
3. **정렬 변경**: 툴바 "정렬" 드롭다운 → 마감일/제목/상태 선택 → 그룹 내 정렬 변경
4. **그룹 접기/펼치기**: 그룹 헤더 클릭 → 토글
5. **태스크 상세**: 태스크 행 클릭 → TaskDetailModal 열기
6. **피처 상세**: 그룹 헤더의 피처명 클릭 → FeatureDetailModal 열기
7. **필터**: 기존 KanbanFilterToolbar 재사용 (담당자, 태그, 마감일 필터)

---

## 4. 일정 탭 변경

### 변경 사항

- **탭 이름**: "일정" 유지
- **서브탭 구조**: 유지 (현재는 "일일" 1개, 향후 추가 예정)
- **제거**: 간트, 캘린더, 마일스톤 서브탭 → 보드로 이동
- **향후**: 인원 중심의 새로운 뷰 추가 예정 (예: 인원별 워크로드, 근태 등)

### 변경 전

```
┌──────────────────────────────────────────────┐
│   [일일]  [간트🔒]  [캘린더]  [마일스톤🔒]    │
└──────────────────────────────────────────────┘
```

### 변경 후

```
┌──────────────────────────────────────────────┐
│   [일일]  [(향후 추가 예정)]                  │
└──────────────────────────────────────────────┘
```

---

## 5. ViewMode 변경 명세

### 타입 변경

```
변경 전: "kanban" | "weekly"   | "schedule" | "calendar" | "milestone" | "meeting" | "notes" | "statistics" | "ai_report"
변경 후: "kanban" | "gantt"    | "schedule" | "calendar" | "milestone" | "meeting" | "notes" | "statistics" | "ai_report" | "list"
                    ^^^^^^^^                                                                                                ^^^^^^
                    리네이밍                                                                                                 신규
```

### 뷰 그룹핑

| 그룹 | ViewMode 값 | localStorage 키 |
|------|------------|----------------|
| 보드 | `kanban`, `gantt`, `calendar`, `list`, `milestone` | `boardSubMode_{boardId}` |
| 일정 | `schedule` (+ 향후 추가) | `scheduleSubMode_{boardId}` (유지) |
| AI 분석 | `statistics`, `ai_report` | `aiSubMode_{boardId}` (유지) |
| 독립 | `meeting`, `notes` | — |

### URL 하위호환

| URL 파라미터 | 동작 |
|-------------|------|
| `?view=kanban` | 칸반 뷰 (기존과 동일) |
| `?view=weekly` | **간트 뷰로 매핑** (하위호환) |
| `?view=gantt` | 간트 뷰 (신규 URL) |
| `?view=calendar` | 캘린더 뷰 (기존과 동일) |
| `?view=list` | 리스트 뷰 (신규 URL) |
| `?view=milestone` | 마일스톤 뷰 (기존과 동일) |
| `?view=schedule` | 일일 스케줄 (기존과 동일) |

### localStorage 마이그레이션

| 기존 키 | 신규 키 | 값 매핑 |
|---------|--------|--------|
| `scheduleSubMode_{boardId}` = "weekly" | `boardSubMode_{boardId}` = "gantt" | weekly→gantt |
| `scheduleSubMode_{boardId}` = "calendar" | `boardSubMode_{boardId}` = "calendar" | 그대로 |
| `scheduleSubMode_{boardId}` = "milestone" | `boardSubMode_{boardId}` = "milestone" | 그대로 |
| `scheduleSubMode_{boardId}` = "schedule" | (삭제, 보드 서브뷰에 해당 안됨) | — |
| `viewMode_{boardId}` = "weekly" | `viewMode_{boardId}` = "gantt" | weekly→gantt |

---

## 6. 모바일 대응

### 하단 탭 바

```
변경 전: [칸반] [일정] [미팅] [노트] [AI]
변경 후: [보드] [일정] [미팅] [노트] [AI]
```

### 보드 서브뷰 전환

- 모바일에서는 아이콘만 표시 (라벨 숨김)
- 좌우 스크롤 가능한 pill 토글

### 리스트 뷰 모바일 레이아웃

```
┌──────────────────────────────┐
│ [그룹▾] [정렬▾]     🔍       │
├──────────────────────────────┤
│ ▼ 🟣 로그인 기능 구현  3/5   │
│ ┌────────────────────────┐   │
│ │ ☐ 소셜 로그인 API 연동 │   │
│ │    홍길동 · 03/15 · 2/3│   │
│ ├────────────────────────┤   │
│ │ ☑ JWT 토큰 관리        │   │
│ │    김철수 · 03/12 · 4/4│   │
│ └────────────────────────┘   │
└──────────────────────────────┘
```

- 모바일: 카드형 레이아웃 (컬럼 축소, 메타 정보 아래 표시)
- 태블릿: 테이블 레이아웃 유지 (일부 컬럼 숨김)

---

## 7. i18n 키 (10개 언어)

### 신규 키

| 키 | ko | en |
|----|----|----|
| `viewBoard` | 보드 | Board |
| `viewBoardKanban` | 칸반 | Kanban |
| `viewBoardGantt` | 간트 | Gantt |
| `viewBoardCalendar` | 캘린더 | Calendar |
| `viewBoardList` | 리스트 | List |
| `viewBoardMilestone` | 마일스톤 | Milestone |
| `listViewGroupBy` | 그룹 | Group by |
| `listViewSortBy` | 정렬 | Sort by |
| `listViewGroupFeature` | 피처 | Feature |
| `listViewGroupBlock` | 블록 | Block |
| `listViewGroupAssignee` | 담당자 | Assignee |
| `listViewGroupStatus` | 상태 | Status |
| `listViewGroupNone` | 없음 | None |
| `listViewSortTitle` | 제목 | Title |
| `listViewSortDueDate` | 마감일 | Due Date |
| `listViewSortStatus` | 상태 | Status |
| `listViewSortCreated` | 생성일 | Created |
| `listViewNoTasks` | 표시할 태스크가 없습니다 | No tasks to display |
| `listViewTaskCount` | {{count}}개 태스크 | {{count}} tasks |

---

## 8. 디자인 토큰 (BRIDGE 디자인 시스템 준수)

### 서브뷰 전환 바

```tsx
// 컨테이너
<div className="flex items-center justify-center py-1.5">
  <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
    {/* 서브뷰 버튼 */}
  </div>
</div>

// 비활성 버튼
<button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-slate-400
  hover:text-foreground hover:bg-foreground/5 transition-colors">
  <Icon size={14} />
  <span className="hidden md:inline">{label}</span>
</button>

// 활성 버튼
<button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold
  bg-foreground/10 text-foreground">
  <Icon size={14} />
  <span className="hidden md:inline">{label}</span>
</button>

// 잠금 아이콘
<Lock size={10} className="text-slate-500" />
```

### 리스트 뷰

```tsx
// 툴바
<div className="flex items-center gap-3 px-4 py-2 border-b border-foreground/[0.08]">

// 그룹 헤더
<div className="flex items-center gap-2 px-4 py-2.5 bg-foreground/[0.03]
  border-b border-foreground/[0.08] cursor-pointer">
  <ChevronRight size={14} className={expanded ? 'rotate-90' : ''} />
  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: featureColor }} />
  <span className="text-[13px] font-bold text-foreground">{groupName}</span>
  <span className="text-[10px] text-slate-500 ml-auto">{count}개 태스크</span>
</div>

// 태스크 행
<div className="flex items-center gap-3 px-4 py-2.5 border-b border-foreground/[0.08]
  hover:bg-foreground/[0.03] transition-colors cursor-pointer group">

// 완료 체크
<CheckCircle2 size={16} className={completed ? 'text-emerald-500' : 'text-slate-400'} />

// 블록 뱃지
<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
  bg-foreground/5 text-slate-400">{blockName}</span>

// 마감일 (오버듀)
<span className="text-xs text-red-400">{overdueDate}</span>

// 마감일 (임박)
<span className="text-xs text-amber-400">{soonDate}</span>

// 마감일 (일반)
<span className="text-xs text-slate-400">{normalDate}</span>
```

---

## 9. 영향받는 파일 및 변경 범위

| 파일 | 변경 유형 | 주요 변경 |
|------|----------|----------|
| `KanbanBoardPage.tsx` | 수정 | ViewMode 타입, 상태 초기화, handleViewModeChange, 렌더링 분기, 모바일 탭, localStorage 마이그레이션 |
| `KanbanBoardHeader.tsx` | 수정 | 메인 탭 라벨(칸반→보드), 활성 조건, getScheduleSubMode→getBoardSubMode |
| `BoardViewSwitcher.tsx` | **신규** | 보드 서브뷰 전환 바 (~100줄) |
| `BoardListView.tsx` | **신규** | 리스트 뷰 컴포넌트 (~500줄) |
| `i18n/locales/*.json` (10개) | 수정 | 신규 i18n 키 추가 |
| `WeeklyScheduleView.tsx` | 미변경 | props 동일, viewMode 조건만 변경 |
| `CalendarView.tsx` | 미변경 | props 동일 |
| `MilestoneView.tsx` | 미변경 | props 동일 |
| `DailyScheduleView.tsx` | 미변경 | 일정 탭 유지 |
| 백엔드 전체 | **미변경** | 프론트엔드 뷰 레이어만 변경 |

---

## 10. 구현 순서 (권장)

| 순서 | 작업 | 복잡도 | 의존성 |
|------|------|--------|--------|
| 1 | ViewMode 타입 변경 + 헬퍼 상수 | 낮음 | - |
| 2 | BoardViewSwitcher 컴포넌트 | 중간 | Step 1 |
| 3 | KanbanBoardHeader 메인 탭 수정 | 중간 | Step 1 |
| 4 | KanbanBoardPage 상태/렌더링 수정 | 높음 | Step 1, 2, 3 |
| 5 | BoardListView 컴포넌트 | 높음 | Step 1 |
| 6 | localStorage 마이그레이션 | 낮음 | Step 4 |
| 7 | i18n 키 추가 (10개 언어) | 낮음 (반복) | Step 2, 3, 5 |
| 8 | 모바일 탭/레이아웃 대응 | 중간 | Step 4, 5 |
| 9 | 통합 테스트 | - | 전체 |
