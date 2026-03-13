# TASK-2026-0313-002: 일정 탭 캘린더/리소스 서브탭 추가

## Summary

일정 탭에 캘린더(월 캘린더) + 리소스(사람 중심 간트차트) 서브탭을 추가하고, 우측 ChecklistItemPanel에서 미배정 항목을 DnD로 배치할 수 있는 기능을 구현했다.

- **등급**: 상
- **도메인**: fullstack (Spring Boot + React)
- **날짜**: 2026-03-13
- **SubAgent**: 7개 (4개 그룹, 병렬 실행)

## Background & Motivation

기존 일정 탭은 타임블록 하나만 존재하여 팀 전체 워크로드를 한눈에 파악할 수 없었다. ChecklistItem 담당자 배정 단위의 시각적 관리 도구가 부재하여, 월 캘린더 뷰와 사람 중심 리소스 간트차트를 추가하기로 결정했다.

## Architecture Decisions

### 1. 서브탭 인프라 설계
- 일정 탭 내부에 `scheduleSubTab` state 추가 (`timeblock | calendar | resource`)
- `localStorage` 키 `scheduleSubTab_{boardId}`로 영속화
- `lazyWithRetry`로 각 뷰 컴포넌트 lazy loading (번들 분리)

### 2. DnD 방식: 커스텀 mouse events
- `@dnd-kit` 대신 기존 `ScheduleBlock.tsx` 패턴을 따라 `document.addEventListener('mousemove'/'mouseup')` 사용
- `PanelDragState` 인터페이스로 드래그 상태 공유
- 장점: 기존 코드 패턴 일관성, 외부 라이브러리 추가 불필요

### 3. API 설계: by-assignee 엔드포인트
- `GET /api/v1/boards/{boardId}/checklist-items/by-assignee?startDate=&endDate=`
- 담당자 기준 그룹핑을 서버 사이드에서 처리 (프론트에서 재그룹핑 불필요)
- `JOIN FETCH`로 N+1 문제 방지

### 4. 컴포넌트 디렉토리 분리
- 신규 컴포넌트는 `components/schedule/` 디렉토리에 배치
- KanbanBoardPage.tsx (~3600줄) 비대화 방지

## SubAgent Summary

| ID | 역할 | 모델 | 결과 |
|----|------|------|------|
| SA-002-001 | Backend API (Repository+DTO+Service+Controller) | Sonnet | ✓ |
| SA-002-002 | Frontend API 타입 + 함수 | Sonnet | ✓ |
| SA-002-003 | KanbanBoardPage 서브탭 인프라 | Sonnet | ✓ |
| SA-002-004 | ScheduleCalendarView (월 캘린더 + DnD) | Opus | ✓ |
| SA-002-005 | ScheduleResourceView (리소스 간트 + 리사이즈) | Opus | ✓ |
| SA-002-006 | ChecklistItemPanel + ChecklistDragItem | Sonnet | ✓ |
| SA-002-007 | i18n 10개 언어 키 추가 | Sonnet | ✓ |

**실행 전략**: Group A(BE) + B(FE API, 서브탭) 병렬 → Group C(3개 뷰 컴포넌트) 병렬 → Group D(i18n) 순차

## Changes

### Backend (4 files modified)

| 파일 | 변경 |
|------|------|
| `ChecklistItemRepository.java` | `findByBoardIdAndDateRange` JPQL 쿼리 (JOIN FETCH, 날짜 범위 필터) |
| `ChecklistResponse.java` | `ByAssigneeResponse`, `AssigneeGroup`, `AssigneeItemResponse` record (+112줄) |
| `ChecklistService.java` | `getChecklistItemsByAssignee()` 메서드 (Viewer+ 권한 체크) |
| `BoardChecklistController.java` | `GET /by-assignee` 엔드포인트 (@DateTimeFormat 파라미터) |

### Frontend (6 files created/modified)

| 파일 | 변경 | 줄 수 |
|------|------|-------|
| `api.ts` | 3개 인터페이스 + `getItemsByAssignee()` 함수 | +42 |
| `KanbanBoardPage.tsx` | scheduleSubTab state, 서브탭 바, ChecklistItemPanel 통합 | +180 |
| `schedule/ScheduleCalendarView.tsx` | 월 캘린더 (멀티데이 바, DnD 드롭 타겟) | ~621 |
| `schedule/ScheduleResourceView.tsx` | 리소스 간트 (바 리사이즈/이동, DnD) | ~865 |
| `schedule/ChecklistItemPanel.tsx` | 우측 패널 (검색, 그룹핑, DnD 소스) | ~487 |
| `schedule/ChecklistDragItem.tsx` | 드래그 카드 (Feature color bar) | ~137 |

### i18n (10 files × 16 keys)

- `schedule.subTab.*` (3키): timeblock, calendar, resource
- `schedule.calendar.*` (5키): today, prevMonth, nextMonth, noItems, allCards
- `schedule.resource.*` (4키): milestone, unassigned, noItems, completed
- `schedule.panel.*` (4키): title, search, noUnscheduled, dragHint

## Test Summary

| 항목 | 결과 |
|------|------|
| Frontend build (타입체크 포함) | PASS (14.8s) |
| Backend build | PASS (3s) |
| UC-001 계약 정합성 | PASS |
| Import 호환성 | PASS |
| Props 정합성 | PASS |
| 디자인 시스템 준수 | PASS |
| API snake_case | PASS |
| 보안 (XSS, SQL Injection, Auth) | PASS |

## Key Components

### ScheduleCalendarView (월 캘린더)
- 7열 × 최대 6행 월 그리드
- `computeBarSegments()`: 주 경계 클리핑 + 행 스태킹 알고리즘
- 멀티데이 바: Feature color 배경, 담당자 아바타
- 단일 날짜 항목: 컬러 점 인디케이터
- DnD 드롭 타겟: `bg-bridge-accent/10` 하이라이트

### ScheduleResourceView (리소스 간트차트)
- 좌측 고정: 멤버별 행 (아바타 + 이름)
- 타임라인: 일 단위 컬럼 (DAY_WIDTH=60px)
- 바 리사이즈: 좌측/우측 핸들 (cursor-ew-resize)
- 바 이동: 중앙 드래그로 start+due 동시 이동
- 오늘 라인: 빨간 세로 점선
- `computeBarLanes()`: 바 겹침 방지 레인 할당

### ChecklistItemPanel (우측 패널)
- 280px 너비, 접기/펼치기 토글
- 검색 필터링 + Feature > Task 계층 그룹핑
- 상태 그룹: To-do / In progress / Done (접기/펼치기)
- `PanelDragState`: 3px 이동 임계값 + Ghost element

## Future Considerations

1. **DnD 성능 최적화**: 많은 ChecklistItem 시 캘린더/리소스 뷰 렌더링 부하 → 가상화 고려
2. **바 충돌 해결**: 리소스 뷰에서 같은 멤버/날짜에 많은 바 겹침 시 UI 개선
3. **모바일 대응**: 캘린더/리소스 뷰의 터치 DnD 지원
4. **ChecklistItem 날짜 변경 API**: 드롭 시 실제 API 호출 연결 (현재 콜백 구조만 완성)

## Tags

`schedule` `calendar` `resource-view` `gantt` `dnd` `checklist` `fullstack` `i18n`
