# 보드 탭 구조 개편 (Board Tab Restructure)

## Task Information
- **Task ID**: TASK-2026-0313-001
- **Date**: 2026-03-13
- **Classification**: 상
- **Domain**: fullstack (Frontend only)
- **Confidence**: 95%
- **Spec**: `docs/versions/feature/2026-03-13_board-tab-restructure.md`

## Summary
"칸반보드" 탭을 "보드"로 리네이밍하고, 기존 일정 탭에 분산되어 있던 간트/캘린더/마일스톤 뷰를
보드 서브뷰로 통합했습니다. 새로운 `BoardViewSwitcher` 컴포넌트로 칸반 / 리스트 / 간트 / 캘린더 / 마일스톤
5개 서브뷰를 전환할 수 있으며, 테이블 기반 `BoardListView` 컴포넌트를 신규 개발했습니다.

## Analysis Summary
- **Scope**: Frontend 12파일 (신규 2, 수정 10) + i18n 10개 언어 파일
- **Risk Areas**:
  - KanbanBoardPage.tsx 3,400줄+ 대형 파일의 다중 영역 수정 (ViewMode, 서브토글, 렌더 분기, 모바일 탭)
  - ViewMode 타입 변경에 따른 기존 6개 뷰 분기 영향
  - localStorage 마이그레이션 (scheduleSubMode → boardSubMode, weekly → gantt)
  - URL 하위 호환성 (?view=weekly → gantt)
- **Cross-cutting**: i18n 네임스페이스 정합성 (kanban.viewBoard* vs root-level listView*)

## Decisions & Trade-offs

| 결정 | 근거 |
|------|------|
| ViewMode에서 `weekly` 제거, `gantt`로 대체 | 간트 차트가 보드 서브뷰로 이동하면서 의미 명확화 |
| `BOARD_SUB_MODES` 상수 배열 도입 | 5개 서브뷰 판별 로직을 여러 곳에서 재사용 (헤더, 마일스톤바, 모바일탭) |
| localStorage 키 마이그레이션 useEffect | 기존 사용자의 저장된 뷰모드 설정 유지 |
| Expand/Collapse 기본값: 접힌 상태 | 사용자 피드백 반영 — 펼친 상태보다 접힌 상태가 초기 화면에서 유용 |
| Expand 상태 localStorage 영속화 | 새로고침 후에도 사용자가 펼쳐둔 Feature/Checklist 상태 유지 |
| 마일스톤 바: 모든 보드 서브뷰에서 표시 | milestone 뷰 제외 나머지 4개 서브뷰에서 스프린트/마일스톤 바 노출 |
| 서브탭 순서: 칸반 → 리스트 → 간트 → 캘린더 → 마일스톤 | 사용 빈도 기반 우선순위 (사용자 피드백) |

## SubAgent Summary

| ID | 모델 | 역할 | 상태 | 비고 |
|----|------|------|------|------|
| SA-001-001 | Opus | KanbanBoardPage + KanbanBoardHeader ViewMode 확장 | 완료 | 핵심 파일 수정 |
| SA-001-002 | Sonnet | BoardViewSwitcher 컴포넌트 신규 개발 | 완료 | 서브뷰 전환 바 |
| SA-001-003 | Opus | BoardListView 컴포넌트 신규 개발 | 완료 | 테이블 뷰 748줄 |
| SA-001-004 | Sonnet | i18n 10개 언어 키 추가 | 완료 | 19개 키 × 10언어 |

### 실행 그룹
- **Group A** (병렬): SA-001-001 + SA-001-004 → 파일 충돌 없음
- **Group B** (병렬, A 의존): SA-001-002 + SA-001-003 → SA-001의 ViewMode 타입에 의존

## Changes Made

### Frontend (2 new + 3 modified)

| 파일 | 변경 | 설명 |
|------|------|------|
| `BoardViewSwitcher.tsx` | **New** | 보드 서브뷰 전환 바 (칸반/리스트/간트/캘린더/마일스톤) |
| `BoardListView.tsx` | **New** | 테이블 기반 리스트 뷰 (그룹핑, 정렬, 검색) |
| `KanbanBoardPage.tsx` | Modified | ViewMode 확장, BOARD_SUB_MODES, localStorage 마이그레이션, 서브뷰 렌더 분기, 모바일 탭, Expand 기본값 변경 |
| `KanbanBoardHeader.tsx` | Modified | "보드" 탭 리네이밍, BOARD_SUB_MODES active 조건 |
| `KanbanFilterToolbar.tsx` | Modified | 패딩/폰트 사이즈 축소 (py-2→py-1.5, text-sm→text-xs) |

### i18n (10 files modified)

| 파일 | 추가 키 수 | 설명 |
|------|-----------|------|
| `ko.json` ~ `hi.json` (10개) | 19개/파일 | `kanban.viewBoard*` 7개 + `listView*` 12개 |

**주요 i18n 키:**
- `kanban.viewBoard` — 보드 서브뷰 (ARIA label)
- `kanban.viewBoardKanban/List/Gantt/Calendar/Milestone` — 각 서브뷰 라벨
- `listViewGroupBy/SortBy/Search` — 리스트 뷰 기능
- `listViewGroupFeature/Block/Assignee/Status/None` — 그룹핑 옵션
- `listViewSortTitle/DueDate/Status/Created` — 정렬 옵션

## Test Summary

| 항목 | 결과 | 비고 |
|------|------|------|
| `npm run build` | PASS | 타입체크 + 프로덕션 빌드 성공 |
| Data Contract 검증 | PASS (3건 수정) | Props 불일치, i18n 네임스페이스 |
| 코드 품질 | PASS_WITH_WARNINGS | hi.json/pt-BR.json 포맷 변경 (compact→expanded), 기능 무영향 |

### Phase 4에서 발견/수정한 이슈

| 이슈 | 원인 | 수정 |
|------|------|------|
| BoardViewSwitcher props 불일치 | SA-001 caller와 SA-002 component 인터페이스 불일치 | activeMode→viewMode, onModeChange→onViewModeChange, canAccessSchedule→canAccessGantt |
| KanbanBoardPage duplicate JSX attribute | SA-001이 isAdminOrOwner를 중복 추가 | 중복 attribute 제거 |
| i18n viewBoard* 네임스페이스 | SA-004가 root에 배치, SA-002는 kanban.* 참조 | root → kanban 네임스페이스로 이동 (10개 파일) |

### Phase 5 사용자 피드백 반영

| 피드백 | 수정 |
|--------|------|
| 마일스톤 바가 칸반에서만 보임 | `BOARD_SUB_MODES.includes(viewMode) && viewMode !== "milestone"` 조건으로 변경 |
| 서브탭이 마일스톤 바 아래에 위치 | BoardViewSwitcher를 마일스톤 바 위로 이동 |
| 필터 툴바가 너무 두꺼움 | padding/font-size 축소 (py-2→py-1.5, text-sm→text-xs) |
| 서브탭 순서 변경 | 칸반→리스트→간트→캘린더→마일스톤 순서로 재배열 |
| Expand 기본값 + 영속화 | 기본 접힌 상태 + localStorage 저장/복원 |

## Architecture Impact

### ViewMode 시스템
```
Before: kanban | weekly | schedule | calendar | milestone | meeting | notes | statistics | ai_report
After:  kanban | gantt | schedule | calendar | milestone | meeting | notes | statistics | ai_report | list
```
- `weekly` → `gantt`로 리네이밍 (하위 호환: URL `?view=weekly` → gantt 매핑)
- `list` 신규 추가

### 보드 서브뷰 구조
```
보드 탭 (BOARD_SUB_MODES)
├── 칸반 (kanban) — 기존
├── 리스트 (list) — 신규
├── 간트 (gantt) — 기존 weekly에서 이동
├── 캘린더 (calendar) — 기존
└── 마일스톤 (milestone) — 기존
```

### localStorage 키 변경
| Before | After |
|--------|-------|
| `scheduleSubMode_{boardId}` | `boardSubMode_{boardId}` |
| 값: `weekly` | 값: `gantt` |
| (없음) | `expandedFeatures_{boardId}` |
| (없음) | `expandedChecklist_{boardId}` |

### 컴포넌트 의존 관계
```
KanbanBoardPage
├── KanbanBoardHeader (탭 바: 보드, 일정, 미팅, 노트, 통계, AI 리포트)
├── BoardViewSwitcher (서브뷰 바: 칸반/리스트/간트/캘린더/마일스톤) ← NEW
├── BoardListView ← NEW
├── KanbanFilterToolbar (필터 + 검색)
└── (기존 뷰: KanbanBlock, WeeklyScheduleView, CalendarView, MilestoneView)
```

## Future Considerations
- **BoardListView 기능 확장**: 인라인 편집, 다중 선택, 벌크 액션 추가 가능
- **서브뷰 간 상태 공유**: 필터/검색 상태를 서브뷰 간 공유하여 전환 시 유지
- **간트 차트 개선**: 현재 WeeklyScheduleView 기반 → 전용 간트 차트 컴포넌트로 발전 가능
- **서브뷰 순서 커스터마이징**: 사용자별 서브탭 순서 변경 기능

## Tags
`board` `view-mode` `sub-views` `list-view` `i18n` `localStorage` `ux-improvement`
