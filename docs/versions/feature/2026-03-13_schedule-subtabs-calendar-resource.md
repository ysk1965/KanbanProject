# Feature: 일정 탭 서브뷰 확장 — 캘린더 + 리소스(사람 중심 간트)

> 생성일: 2026-03-13
> 상태: 📋 기획 완료

---

## Feature Capsule

```
기능명: 일정 탭 서브뷰 확장 (캘린더 + 리소스)
한줄 설명: 일정 탭에 월 캘린더와 사람 중심 간트차트(리소스 뷰)를 서브탭으로 추가하고,
          우측 패널의 체크리스트를 DnD로 배치할 수 있게 함

해결하는 문제:
- 현재 일정 탭은 "타임블록(일일 스케줄)" 하나만 존재하여,
  팀 전체의 워크로드를 한눈에 파악하기 어려움
- ChecklistItem(담당자 배정 단위)의 날짜 배분을 시각적으로 관리할 도구가 없음
- "누가 언제 무엇을 하는지" 사람 중심의 일정 뷰가 부재

핵심 컨셉:
- 일정 탭 = 인원 중심 (기존 "보드" 탭의 Feature/Task 중심 뷰와 차별화)
- 데이터 소스 = ChecklistItem (Feature > Task > ChecklistItem 계층에서 실제 담당자가 배정되는 단위)
- 3개 서브탭: 타임블록(기존) + 캘린더(NEW) + 리소스(NEW)
- 우측 패널에서 미배정 체크리스트를 DnD로 캘린더/리소스에 배치

핵심 시나리오:
1. PM이 "일정 > 캘린더" 탭에서 이번 달 팀원들의 체크리스트 일정을 월간 달력으로 확인
2. PM이 "일정 > 리소스" 탭에서 멤버별 행으로 워크로드 분포를 간트차트로 확인
3. 우측 패널의 미배정 체크리스트를 드래그하여 캘린더 날짜 셀에 드롭 → 날짜 자동 배정
4. 우측 패널의 체크리스트를 리소스 뷰의 특정 멤버 행에 드래그 → 날짜 + 담당자 동시 배정
5. 리소스 뷰에서 바를 드래그 리사이즈하여 일정 기간 조정

Scope (이번 구현):
- 일정 탭 서브탭 인프라 (타임블록 / 캘린더 / 리소스)
- ScheduleCalendarView: 월 캘린더 (ChecklistItem 바 표시)
- ScheduleResourceView: 사람 중심 간트 (멤버별 행 + 마일스톤 행)
- ChecklistItemPanel: 공유 우측 패널 (미배정 항목 목록 + DnD 소스)
- DnD: 우측 패널 → 캘린더/리소스 드롭
- Backend API: ChecklistItem by-assignee + 날짜 범위 조회 엔드포인트
- i18n 10개 언어

Non-scope (다음으로 미룸):
- 캘린더 뷰 인라인 체크리스트 생성 (날짜 셀 클릭으로 신규 생성)
- 리소스 뷰 의존성 화살표 (기존 간트의 DependencyArrows는 Feature>Task 전용)
- 멤버 가용성/근태 표시 (근무 가능 시간 오버레이)
- 바 간 충돌 감지 및 자동 배치
- 리소스 뷰 워크로드 히트맵 (과부하 시각화)
- 모바일 DnD (모바일에서는 조회만)

성공 기준:
- 일정 탭에서 3개 서브탭 1초 내 전환
- 캘린더 뷰에서 월간 ChecklistItem 배치 한눈에 파악
- 리소스 뷰에서 멤버별 워크로드 시각 확인
- DnD로 미배정 체크리스트 → 캘린더/리소스 배치 성공률 100%

영향받는 기존 코드:
- FE: KanbanBoardPage.tsx (서브탭 state + 렌더링 분기)
- FE: api.ts (신규 API 타입/함수)
- FE: i18n locales 10개
- FE 신규: ScheduleCalendarView, ScheduleResourceView, ChecklistItemPanel, ChecklistDragItem
- BE: BoardChecklistController, ChecklistService, ChecklistItemRepository, ChecklistResponse

주요 리스크:
- KanbanBoardPage.tsx가 대형 파일 → 신규 컴포넌트는 schedule/ 디렉토리로 분리
- DnD 성능: 많은 체크리스트 항목 시 렌더링 부하 → 가상 스크롤 또는 페이지네이션 고려
- 기존 보드 탭 Gantt/Calendar와 혼동 → 탭 라벨 및 설명으로 차별화 ("업무 중심" vs "인원 중심")
```

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 데이터 소스 | ChecklistItem | Feature>Task>ChecklistItem 계층에서 실제 담당자가 배정되는 최소 단위 | Task 카드 / DailyChecklist |
| D-02 | 캘린더 형태 | 일반 월 캘린더 (이미지 1) | 익숙한 UI, 날짜별 배치 직관적 | 사람 중심 행 캘린더 |
| D-03 | 간트 행 구성 | 사람 중심 (이미지 2) | "누가 언제 무엇을" 한눈에 파악, 일정 탭의 인원 중심 컨셉 | Feature>Task 계층 (기존 보드 간트와 동일) |
| D-04 | 기존 보드 Gantt/Calendar | 별도 유지 | 보드 탭 = 업무 중심 (Feature/Task), 일정 탭 = 인원 중심 (ChecklistItem) 으로 차별화 | 보드에서 제거하고 일정으로 통합 |
| D-05 | 우측 패널 데이터 | 미배정(날짜 없는) ChecklistItem | 날짜가 이미 있는 항목은 캘린더/리소스에 이미 표시됨 | 전체 ChecklistItem / 미완료만 |
| D-06 | DnD 방식 | 커스텀 mouse events | 기존 ScheduleBlock.tsx 패턴과 일관성 유지 | @dnd-kit 라이브러리 |
| D-07 | 신규 컴포넌트 위치 | `components/schedule/` 디렉토리 | 일정 관련 컴포넌트 그룹핑, 루트 components 폴더 정리 | 루트 components에 직접 배치 |

---

## 1. 서브탭 구조

### 변경 전 (현재)

```
┌──────────────────────────────────────────────┐
│   [일일]                                      │  ← 버튼 1개 (placeholder)
└──────────────────────────────────────────────┘
```

### 변경 후

```
┌──────────────────────────────────────────────┐
│   [🕐 타임블록]  [📅 캘린더]  [👥 리소스]     │  ← 3개 서브탭
└──────────────────────────────────────────────┘
```

### 서브탭 상세

| 서브탭 | 아이콘 | 데이터 소스 | 설명 | 기존/신규 |
|--------|--------|------------|------|----------|
| 타임블록 | `Clock` | ScheduleBlock (시간 블록) | 일일/주간 시간 배분 관리 | 기존 (default) |
| 캘린더 | `Calendar` | ChecklistItem (날짜 기반) | 월간 달력에 체크리스트 배치 | **신규** |
| 리소스 | `Users` | ChecklistItem (담당자 기반) | 멤버별 간트차트 워크로드 뷰 | **신규** |

### 동작 사양

- **초기 진입**: 마지막 사용 서브탭 복원 (localStorage: `scheduleSubTab_{boardId}`)
- **전환 시**: 선택한 서브탭 저장 + 즉시 렌더링
- **URL 지원**: `?view=schedule&tab=calendar` / `?view=schedule&tab=resource`
- **모바일**: 아이콘만 표시 (라벨 숨김)

---

## 2. 캘린더 뷰 (ScheduleCalendarView)

### 2.1 개요

ChecklistItem을 **월간 달력**에 날짜 바로 시각화하는 뷰. 우측 패널의 미배정 항목을 드래그하여 날짜 셀에 드롭하면 자동으로 날짜가 배정됨.

### 2.2 와이어프레임

```
┌────────────────────────────────────────────────────────────┬─────────────────────┐
│  < Today >   Mar 2026 ▾     Month ▾   ☑ All cards  View ▾ │  ⓘ                  │
├────────────────────────────────────────────────────────────┤                     │
│  Mon    │ Tue    │ Wed    │ Thu    │ Fri    │ Sat   │ Sun  │  > To-do  6         │
├─────────┼────────┼────────┼────────┼────────┼───────┼──────┤                     │
│         │        │        │        │        │       │ 1    │  v In progress  7   │
│         │        │        │        │        │       │      │                     │
│ 2       │ 3      │ 4      │ 5      │ 6      │ 7     │ 8    │  ┌─────────────────┐│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (UI 디자인 - 홍길동)              │  │ 🟣 소셜 로그인   ││
│ ▓▓▓▓▓▓▓▓▓ (API 연동 - 김철수)     │        │       │      │  │   김철수 · 03/15 ││
│ 9       │ 10     │ 11     │ 12     │ 13     │ 14    │ 15   │  ├─────────────────┤│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (테스트 작성 - 이영희)     │       │      │  │ 🔵 차트 구현    ││
│         │ ▓▓▓▓▓▓▓▓▓▓▓ (디자인 와이어프레임)  │       │      │  │   이영희 · 03/22 ││
│ 16      │ 17     │ 18     │ 19     │ 20     │ 21    │ 22   │  ├─────────────────┤│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (게이트웨이 수정 - 박민수)  │  │ 🟢 에러 핸들링  ││
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (인증 플로우 - 홍길동)   │       │      │  │   —  · —        ││
│ 23      │ 24     │ 25     │ 26     │ 27     │ 28    │ 29   │  │  ⠿ drag to cal  ││
│         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓ (CSV 내보내기 - 김철수)         │  └─────────────────┘│
│         │        │        │ ▓▓▓▓▓▓▓▓ (Feature Release)    │                     │
│ 30      │ 31     │ 1      │ 2      │ 3      │       │      │  > Done  3          │
│         │        │        │        │        │       │      │                     │
└────────────────────────────────────────────────────────────┴─────────────────────┘
```

### 2.3 상단 툴바

| 요소 | 설명 |
|------|------|
| `< Today >` | 이전/다음 월 이동 + 오늘로 돌아가기 |
| `Mar 2026 ▾` | 월/연 선택기 |
| `All cards` | 완료된 항목 포함/제외 필터 |
| `View ▾` | 뷰 옵션 (컴팩트/확장 모드) |

### 2.4 캘린더 그리드

| 요소 | 스타일 | 설명 |
|------|--------|------|
| 날짜 셀 | 7열 그리드, 고정 높이 | 요일별 컬럼 |
| 바 | Feature color 배경, 둥근 모서리 | start_date~due_date 범위 렌더링 |
| 바 라벨 | 제목 + 담당자 아바타 | 바 안에 표시 (공간 있을 때) |
| 오늘 표시 | bridge-accent 원형 뱃지 | 오늘 날짜 숫자에 표시 |
| DnD 드롭존 | `bg-bridge-accent/10` | 드래그 중 호버된 셀 하이라이트 |

### 2.5 바 렌더링 규칙

```
ChecklistItem의 날짜에 따라:
- start_date + due_date 모두 있음 → start ~ due 범위 바
- start_date만 있음 → 해당 날짜에 점 표시
- due_date만 있음 → 해당 날짜에 점 표시
- 둘 다 없음 → 캘린더에 미표시 (우측 패널에만 존재)

바 색상 = 부모 Feature.color
바 내 아바타 = ChecklistItem.assignee.profile_image
바 내 텍스트 = ChecklistItem.title (공간 부족 시 말줄임)
완료 항목 = 흐린 색상 + 취소선
```

---

## 3. 리소스 뷰 (ScheduleResourceView)

### 3.1 개요

**사람 중심 간트차트**. 행 = 보드 멤버 (+ 마일스톤 행), 열 = 날짜. 각 멤버의 ChecklistItem이 수평 바로 표시됨. 우측 패널에서 드래그하여 특정 멤버 + 날짜에 배치 가능.

### 3.2 와이어프레임

```
┌──────────────┬────────────────────────────────────────────────┬─────────────────────┐
│              │ Mon 9  Tue 10  Wed 11  Thu 12  Fri 13  Mon 14 │  ⓘ                  │
├──────────────┼────────────────────────────────────────────────┤                     │
│              │              │                                 │  v To-do  6         │
│  🏁 Milestone│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           │                     │
│              │              │  Product Demo                   │  ┌─────────────────┐│
├──────────────┼────────────────────────────────────────────────┤  │ 🟣 MFA 통합     ││
│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓        │  │   — · —         ││
│  😀 Molly   │  Website design                                │  │  ⠿ drag here    ││
│              │ ▓▓▓▓▓▓▓▓▓▓▓                                   │  ├─────────────────┤│
│              │  Mobile app prototype  ☑                       │  │ 🔵 로그인 추적  ││
├──────────────┼────────────────────────────────────────────────┤  │   — · —         ││
│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            │  ├─────────────────┤│
│  😀 Diana   │  워크숍 설명서 작성                              │  │ 🟢 온보딩 개선  ││
│              │                                                │  │   — · —         ││
├──────────────┼────────────────────────────────────────────────┤  └─────────────────┘│
│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓                    ▓▓▓▓▓▓▓▓▓▓▓ │                     │
│  😀 Brandon │  Feature 우선순위            로그인 활동 추적    │  > Done  3          │
│              │                                                │                     │
├──────────────┼────────────────────────────────────────────────┤                     │
│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                     │
│  😀 Mark    │  Feature 페이지 업데이트    UI 디자인 최적화     │                     │
│              │                    ▓▓▓▓▓▓▓▓▓▓▓                │                     │
│              │                     User interviews            │                     │
├──────────────┼────────────────────────────────────────────────┤                     │
│              │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓▓│                     │
│  😀 Ray     │  사용자 스토리 리뷰              CSV 내보내기   │                     │
│              │ ▓▓▓▓▓▓▓▓                                       │                     │
│              │  New user flow                                 │                     │
└──────────────┴────────────────────────────────────────────────┴─────────────────────┘
```

### 3.3 좌측 고정 컬럼

| 행 | 표시 내용 | 설명 |
|----|---------|------|
| 마일스톤 | 🏁 + "Milestone" | 보드 마일스톤 바 표시 (start_date ~ end_date) |
| 멤버 N | 아바타 + 이름 | 보드 멤버별 행 (Viewer 제외) |

### 3.4 타임라인 영역

| 요소 | 스타일 | 설명 |
|------|--------|------|
| 헤더 | 요일 + 날짜 | 일 단위 컬럼 (DAY_WIDTH = 60px) |
| 바 | Feature color 배경 | start_date ~ due_date 범위의 수평 바 |
| 바 라벨 | 제목 (공간 있을 때) | 바 안에 표시 |
| 완료 표시 | ☑ 아이콘 + 흐린 색상 | 완료된 체크리스트 |
| 오늘 라인 | 빨간 세로 점선 | 현재 날짜 위치 |
| DnD 드롭존 | 행 + 날짜 범위 하이라이트 | 드래그 중 타겟 영역 표시 |
| 주말 | `bg-foreground/[0.02]` | 토/일 컬럼 배경 |

### 3.5 바 상호작용

| 액션 | 동작 | API 호출 |
|------|------|---------|
| 바 클릭 | TaskDetailModal 열기 | - |
| 바 좌측 드래그 | start_date 변경 (리사이즈) | `PUT /checklist/{id}` |
| 바 우측 드래그 | due_date 변경 (리사이즈) | `PUT /checklist/{id}` |
| 바 중앙 드래그 | start_date + due_date 동시 이동 | `PUT /checklist/{id}` |
| 바 호버 | Tooltip (제목, 날짜 범위, Feature명, 완료 상태) | - |

---

## 4. 우측 패널 (ChecklistItemPanel)

### 4.1 개요

캘린더/리소스 뷰 공통으로 사용하는 **미배정 체크리스트 패널**. 날짜가 없는(미배정) ChecklistItem을 Feature > Task 계층으로 그룹핑하여 보여주고, 각 항목을 드래그 소스로 제공.

### 4.2 와이어프레임

```
┌─────────────────────┐
│ ⓘ  체크리스트        │  ← 패널 헤더 (접기/펼치기)
│ 🔍 검색...           │  ← 검색 필터
├─────────────────────┤
│                     │
│ v To-do  6          │  ← 상태 그룹 (접기/펼치기)
│                     │
│ ┌─────────────────┐ │
│ │ 🟣 소셜 로그인   │ │  ← ChecklistDragItem
│ │   김철수 · 03/15 │ │     Feature color + 제목 + 담당자 + 날짜
│ │   ⠿ drag        │ │     드래그 핸들
│ ├─────────────────┤ │
│ │ 🔵 차트 구현    │ │
│ │   이영희         │ │
│ ├─────────────────┤ │
│ │ 🟢 에러 핸들링  │ │
│ │   — (미배정)     │ │
│ └─────────────────┘ │
│                     │
│ v In progress  4    │
│ ┌─────────────────┐ │
│ │ ...              │ │
│ └─────────────────┘ │
│                     │
│ > Done  3           │  ← 접힌 상태
│                     │
│ ─────────────────── │
│ 💡 드래그하여        │  ← 힌트 텍스트
│    캘린더/리소스에   │
│    배치하세요        │
└─────────────────────┘
```

### 4.3 패널 동작

| 기능 | 설명 |
|------|------|
| 접기/펼치기 | 패널 너비 토글 (열림: 280px, 닫힘: 0px + 토글 버튼) |
| 검색 | 제목 기준 필터링 |
| 그룹핑 | Feature > Task 계층으로 자동 그룹핑 |
| 상태 그룹 | To-do / In progress / Done 접기/펼치기 |
| 드래그 | 각 항목 `onMouseDown` → ghost element 생성 |
| 갱신 | DnD 성공 시 목록에서 제거 (날짜 배정됨 → 캘린더/리소스로 이동) |

### 4.4 ChecklistDragItem 스펙

```
┌─ Feature color bar (4px) ──────────────────────┐
│  ⠿  ChecklistItem 제목                    😀   │
│      Feature명 > Task명                         │
│      📅 03/15 ~ 03/20  (날짜 있으면)             │
└─────────────────────────────────────────────────┘
```

| 요소 | 설명 |
|------|------|
| 좌측 컬러 바 | Feature.color (4px 세로 바) |
| 드래그 핸들 | `⠿` GripVertical 아이콘 |
| 제목 | ChecklistItem.title |
| 부제목 | Feature명 > Task명 (text-slate-500) |
| 담당자 아바타 | 우측 상단 (없으면 미표시) |
| 날짜 범위 | 있으면 표시, 없으면 미표시 |

---

## 5. DnD (Drag and Drop) 명세

### 5.1 구현 방식

**커스텀 mouse events** 사용 (기존 `ScheduleBlock.tsx` 패턴 준수, `@dnd-kit` 미사용)

### 5.2 DnD 상태

```typescript
interface PanelDragState {
  item: BoardChecklistItemResponse;  // 드래그 중인 항목
  startX: number;                    // 드래그 시작 X
  startY: number;                    // 드래그 시작 Y
  currentX: number;                  // 현재 커서 X
  currentY: number;                  // 현재 커서 Y
  isActive: boolean;                 // 3px 이상 이동 시 활성화
}
```

### 5.3 DnD 플로우

```
1. 패널 항목 onMouseDown
   → dragState 초기화 (item, startX, startY)

2. document onMouseMove
   → currentX, currentY 업데이트
   → 3px 이상 이동 시 isActive = true
   → Ghost element 렌더링 (position: fixed, pointer-events: none)
   → 타겟 영역 하이라이트 계산

3. document onMouseUp
   ├─ 캘린더 셀 위 → computeTargetDate(cellPosition)
   │  → API: PUT /checklist/{id} { start_date: targetDate, due_date: targetDate }
   │  → 데이터 리프레시
   │
   ├─ 리소스 멤버 행 위 → computeDateRange(x) + computeAssignee(rowIndex)
   │  → API: PUT /checklist/{id} { start_date, due_date, assignee_id }
   │  → 데이터 리프레시
   │
   └─ 유효하지 않은 영역 → 취소 (dragState = null)

4. ESC 키 → 취소
```

### 5.4 시각적 피드백

| 상태 | 피드백 |
|------|--------|
| 드래그 시작 | 원본 항목 opacity: 0.5 |
| Ghost element | 반투명 카드 (bg-bridge-accent/20, border-bridge-accent) |
| 유효한 드롭 타겟 | `bg-bridge-accent/10` 하이라이트 |
| 무효한 영역 | Ghost에 빨간 X 표시 (not-allowed 커서) |
| 드롭 성공 | 항목이 패널에서 사라지고 캘린더/리소스에 바로 표시 |

---

## 6. Backend API 변경

### 6.1 신규 엔드포인트

```
GET /api/v1/boards/{boardId}/checklist-items/by-assignee
  ?startDate=2026-03-01
  &endDate=2026-03-31
```

**Request**: Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `startDate` | LocalDate | N | 날짜 범위 시작 (없으면 전체) |
| `endDate` | LocalDate | N | 날짜 범위 끝 (없으면 전체) |

**Response**: (snake_case)

```json
{
  "assignees": [
    {
      "assignee": {
        "id": "user-1",
        "name": "홍길동",
        "profile_image": "https://..."
      },
      "items": [
        {
          "id": "ci-1",
          "title": "소셜 로그인 API 연동",
          "completed": false,
          "start_date": "2026-03-10",
          "due_date": "2026-03-15",
          "task": { "id": "task-1", "title": "로그인 구현" },
          "feature": { "id": "feat-1", "title": "인증 시스템", "color": "#8B5CF6" }
        }
      ]
    }
  ],
  "unassigned": [
    {
      "id": "ci-5",
      "title": "에러 핸들링",
      "completed": false,
      "start_date": null,
      "due_date": null,
      "task": { "id": "task-2", "title": "예외처리" },
      "feature": { "id": "feat-1", "title": "인증 시스템", "color": "#8B5CF6" }
    }
  ]
}
```

### 6.2 기존 API 활용

| 용도 | 엔드포인트 | 비고 |
|------|-----------|------|
| 우측 패널 (미배정) | `GET /checklist-items?isScheduled=false` | 이미 존재 |
| 날짜/담당자 업데이트 | `PUT /tasks/{taskId}/checklist/{itemId}` | 이미 존재 |
| 마일스톤 목록 | `GET /milestones` | 이미 존재 |
| 보드 멤버 | `GET /boards/{boardId}/members` | 이미 존재 |

### 6.3 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `ChecklistItemRepository.java` | `findByBoardIdAndDateRange` 쿼리 추가 |
| `ChecklistResponse.java` | `ByAssigneeResponse`, `AssigneeGroup` DTO 추가 |
| `ChecklistService.java` | `getChecklistItemsByAssignee()` 메서드 추가 |
| `BoardChecklistController.java` | `GET /by-assignee` 엔드포인트 추가 |

---

## 7. 데이터 흐름

### 7.1 캘린더 뷰

```
boardChecklistAPI.getItemsByAssignee(boardId, { start_date, end_date })
  → assignees[].items[] 전체를 flat하게 합침
  → 날짜별로 그룹핑 (Map<dateString, ChecklistItem[]>)
  → 캘린더 그리드의 각 셀에 해당 날짜의 항목 렌더링
  → 멀티데이 바: start_date ~ due_date가 여러 날에 걸치면 연속 바로 표시
```

### 7.2 리소스 뷰

```
boardChecklistAPI.getItemsByAssignee(boardId, { start_date, end_date })
  → assignees[] 배열 그대로 사용 (이미 담당자별 그룹핑)
  → 각 assignee → 간트 행 하나
  → items[] → 수평 바들 (start_date ~ due_date)
  → unassigned[] → 별도 "미배정" 행 (하단)

milestoneAPI.getMilestones(boardId)
  → 마일스톤 행 (상단 고정)
  → 각 마일스톤 → start_date ~ end_date 수평 바
```

### 7.3 우측 패널

```
boardChecklistAPI.getItems(boardId, { is_scheduled: false })
  → items[]를 Feature > Task 계층으로 트리 구성
  → DnD 성공 시 → 해당 항목 목록에서 제거 + 메인 뷰 리프레시
```

---

## 8. 디자인 토큰 (BRIDGE 디자인 시스템 준수)

### 서브탭 전환 바

```tsx
// 컨테이너 (기존 placeholder 확장)
<div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-foreground/5">
  <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
    {/* 서브탭 버튼 */}
  </div>
</div>

// 비활성 버튼
<button className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-slate-400
  hover:text-foreground hover:bg-foreground/5 transition-colors">
  <Icon size={14} />
  <span className="hidden md:inline">{label}</span>
</button>

// 활성 버튼
<button className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
  bg-foreground/10 text-foreground transition-all">
  <Icon size={14} />
  <span className="hidden md:inline">{label}</span>
</button>
```

### 캘린더 바

```tsx
// 바 (Feature color 기반)
<div
  className="h-6 rounded-md px-1.5 flex items-center gap-1 text-[10px] font-medium
    text-white truncate cursor-pointer hover:brightness-110 transition-all"
  style={{ backgroundColor: feature.color }}
>
  <img src={assignee.profile_image} className="w-4 h-4 rounded-full" />
  <span className="truncate">{title}</span>
</div>

// 완료된 바
<div className="opacity-50 line-through" />

// DnD 드롭 타겟 하이라이트
<td className="bg-bridge-accent/10 ring-2 ring-bridge-accent/30 ring-inset" />
```

### 리소스 간트 바

```tsx
// 바 (Feature color 기반)
<div
  className="absolute h-8 rounded-lg flex items-center px-2 text-[11px] font-medium
    text-white cursor-pointer hover:brightness-110 hover:shadow-lg transition-all"
  style={{
    left: `${startOffset}px`,
    width: `${barWidth}px`,
    backgroundColor: feature.color,
  }}
>
  <span className="truncate">{title}</span>
  {completed && <CheckCircle2 size={12} className="ml-1 shrink-0" />}
</div>

// 리사이즈 핸들
<div className="absolute top-0 right-0 w-2 h-full cursor-ew-resize
  hover:bg-white/30 rounded-r-lg" />

// 오늘 라인
<div className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
  style={{ left: `${todayOffset}px` }} />

// 멤버 행 좌측
<div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08]
  bg-bridge-obsidian sticky left-0 z-10 min-w-[200px]">
  <img src={member.profile_image} className="w-7 h-7 rounded-full" />
  <span className="text-sm font-medium text-foreground">{member.name}</span>
</div>
```

### 우측 패널

```tsx
// 패널 컨테이너
<div className="w-[280px] border-l border-foreground/[0.08] bg-bridge-obsidian
  flex flex-col overflow-hidden shrink-0">

// 패널 헤더
<div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.08]">
  <span className="text-[13px] font-bold text-foreground">{t('schedule.panel.title')}</span>
  <button className="p-1 rounded-lg text-slate-500 hover:text-foreground
    hover:bg-foreground/5 transition-colors">
    <PanelRightClose size={16} />
  </button>
</div>

// 검색
<div className="px-3 py-2 border-b border-foreground/[0.08]">
  <input className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg
    py-1.5 px-3 text-xs text-foreground placeholder-slate-500
    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50" />
</div>

// 항목 목록
<div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1">

// Ghost element (드래그 중)
<div className="fixed pointer-events-none z-50 w-[240px]
  bg-bridge-accent/20 border border-bridge-accent rounded-lg px-3 py-2
  shadow-lg shadow-bridge-accent/20">
  <span className="text-xs font-medium text-foreground">{item.title}</span>
</div>
```

---

## 9. i18n 키 (10개 언어)

### 신규 키

| 키 | ko | en |
|----|----|----|
| `schedule.subTab.timeblock` | 타임블록 | Time Block |
| `schedule.subTab.calendar` | 캘린더 | Calendar |
| `schedule.subTab.resource` | 리소스 | Resource |
| `schedule.calendar.today` | 오늘 | Today |
| `schedule.calendar.noItems` | 이 날에 배정된 항목이 없습니다 | No items assigned to this date |
| `schedule.calendar.allCards` | 전체 카드 | All cards |
| `schedule.resource.milestone` | 마일스톤 | Milestone |
| `schedule.resource.unassigned` | 미배정 | Unassigned |
| `schedule.resource.noItems` | 배정된 항목이 없습니다 | No items assigned |
| `schedule.panel.title` | 체크리스트 | Checklist |
| `schedule.panel.search` | 검색... | Search... |
| `schedule.panel.noUnscheduled` | 모든 항목이 배정되었습니다 | All items are scheduled |
| `schedule.panel.dragHint` | 드래그하여 캘린더/리소스에 배치 | Drag to place on calendar/resource |

---

## 10. 영향받는 파일 및 변경 범위

| 파일 | 변경 유형 | 주요 변경 |
|------|----------|----------|
| `KanbanBoardPage.tsx` | 수정 | scheduleSubTab state, 서브탭 바 확장 (3개 버튼), 조건부 렌더링 분기 |
| `api.ts` | 수정 | `ChecklistByAssigneeResponse` 인터페이스, `boardChecklistAPI.getItemsByAssignee()` |
| `i18n/locales/*.json` (10개) | 수정 | schedule.subTab, calendar, resource, panel 키 추가 |
| `ChecklistItemRepository.java` | 수정 | `findByBoardIdAndDateRange` 쿼리 추가 |
| `ChecklistResponse.java` | 수정 | `ByAssigneeResponse`, `AssigneeGroup` DTO 추가 |
| `ChecklistService.java` | 수정 | `getChecklistItemsByAssignee()` 메서드 추가 |
| `BoardChecklistController.java` | 수정 | `GET /by-assignee` 엔드포인트 추가 |
| `schedule/ScheduleCalendarView.tsx` | **신규** | 월 캘린더 뷰 (~600줄) |
| `schedule/ScheduleResourceView.tsx` | **신규** | 사람 중심 간트 (~800줄) |
| `schedule/ChecklistItemPanel.tsx` | **신규** | 공유 우측 체크리스트 패널 (~250줄) |
| `schedule/ChecklistDragItem.tsx` | **신규** | 드래그 가능 항목 (~80줄) |

---

## 11. 구현 순서 (권장)

| 순서 | 작업 | 복잡도 | 의존성 |
|------|------|--------|--------|
| 1 | KanbanBoardPage 서브탭 인프라 | 낮음 | - |
| 2 | Backend API (Repository + DTO + Service + Controller) | 중간 | - |
| 3 | Frontend API 타입 + 함수 (`api.ts`) | 낮음 | Step 2 |
| 4 | ChecklistDragItem 컴포넌트 | 낮음 | - |
| 5 | ChecklistItemPanel 컴포넌트 | 중간 | Step 3, 4 |
| 6 | ScheduleCalendarView (캘린더 + DnD) | 높음 | Step 3, 5 |
| 7 | ScheduleResourceView (간트 + DnD) | 높음 | Step 3, 5 |
| 8 | i18n 키 추가 (10개 언어) | 낮음 (반복) | Step 1, 5, 6, 7 |
| 9 | 통합 테스트 + 빌드 검증 | - | 전체 |
