# Feature: 워크로드 뷰 크로스 행 드래그 재배정

> 생성일: 2026-04-30
> 상태: 진행 전

---

## Feature Capsule

```
기능명: 워크로드 뷰 크로스 행 드래그 재배정
한줄 설명: 리소스(워크로드) 뷰에서 체크리스트 바를 다른 멤버 행으로 드래그하여 담당자+날짜를 동시 변경
해결하는 문제: 담당자 변경 시 체크리스트 아이템을 열어 수동으로 assignee를 변경해야 하는 번거로움
핵심 시나리오: 바를 잡고 → 다른 멤버 행으로 드래그 → 드롭하면 담당자+날짜 동시 변경
Scope: 단일 바의 크로스 행 드래그 재배정 (move 타입만), 미배정 행 지원
Non-scope: 멀티 선택 일괄 재배정, resize 중 행 변경, 되돌리기(undo)
성공 기준: 바를 다른 멤버 행에 드롭하면 담당자+날짜가 즉시 반영되고 API 호출 성공
영향받는 기존 코드: ScheduleResourceView.tsx (FE만)
주요 리스크: 동시 편집 충돌 (기존 옵티미스틱 UI 패턴과 동일 → 마지막 요청 승리)
```

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 드롭 시 날짜 처리 | 드롭 위치 날짜로 변경 | 사용자 요청 — 드래그로 담당자+날짜 동시 조정 | 날짜 유지 (X축 무시) |
| D-02 | 행 변경 대상 | move 타입만 | resize는 날짜 조정 목적이므로 행 변경 불필요 | 모든 드래그 타입 |
| D-03 | 미배정 행 | 지원 (담당자 → null) | 배정 해제 사용 케이스 존재 | 미배정 행 드롭 금지 |
| D-04 | BE 변경 | 불필요 | 기존 PUT API가 assignee_id 변경 지원 | 새 API 추가 |
| D-05 | 시각적 피드백 | 대상 행 하이라이트 + 고스트 바 | 드롭 위치를 명확히 표시 | 커서 변경만 |
| D-06 | 권한 | 기존 체크리스트 수정 권한 기준 | 일관성 유지 | 별도 재배정 권한 |

---

## Feature Spec

### 상세 요구사항

- **REQ-F01**: move 드래그 시 마우스 Y 위치로 대상 행(멤버) 실시간 감지
- **REQ-F02**: 드래그 중 대상 행이 현재 행과 다르면 행 전체 하이라이트 표시
- **REQ-F03**: 드래그 중 바가 대상 행 위치에 고스트(반투명)로 표시
- **REQ-F04**: 드롭 시 담당자(assignee_id) + 날짜(start_date, due_date) 동시 변경
- **REQ-F05**: 날짜 변경은 바의 기간(duration) 유지, 드롭 위치의 날짜가 start_date
- **REQ-F06**: 미배정(\_\_unassigned\_\_) 행으로 드롭 시 assignee_id = null
- **REQ-F07**: 옵티미스틱 UI — 원래 행에서 제거, 대상 행에 추가 후 API 호출
- **REQ-F08**: API 실패 시 fetchData()로 서버 상태 복원 (기존 패턴)
- **REQ-F09**: resize-left, resize-right 드래그는 기존 동작 유지 (행 변경 불가)

### UI/UX 명세

**드래그 중:**
- 커서: `grabbing` (기존 유지)
- 대상 행(마우스 Y 위치): `bg-bridge-accent/5` 하이라이트 + 좌측 라벨 영역 `ring-2 ring-bridge-accent/30`
- 바: 대상 행에서의 예상 위치에 고스트 바 표시 (opacity-50)
- 원래 행의 바: opacity-30으로 페이드 처리

**드롭 후:**
- 원래 행: 바 제거
- 대상 행: 바 추가 (새 날짜, 새 담당자)
- API 호출 → 성공 시 silent refresh, 실패 시 revert

### 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 같은 행에 드롭 | 기존 동작 (날짜만 변경) |
| 바 기간이 0일 (start=due) | 드롭 위치 날짜로 start=due 동일 설정 |
| 타임라인 밖으로 드래그 | 가장 가까운 유효 날짜로 클램프 |
| 접힌 행(collapse)에 드롭 | 행 자동 펼침 후 추가 |

---

## Implementation Plan

### 변경 범위

#### Frontend
- **수정**: `frontend/src/app/components/schedule/ScheduleResourceView.tsx`
  - DragState 인터페이스에 크로스 행 관련 필드 추가
  - handleResizeStart의 handleMouseMove에 Y축 행 감지 로직 추가
  - handleMouseUp에 크로스 행 옵티미스틱 UI + API 호출 로직 추가
  - 렌더링 영역에 대상 행 하이라이트 + 고스트 바 추가

#### Backend
- 변경 없음

### API 변경
- 없음 (기존 `PUT /api/v1/boards/{boardId}/tasks/{taskId}/checklist/{itemId}` 사용)

### DB 변경
- 없음

---

## TASKS

### 실행 전략 요약

| Phase | 유형 | 태스크 | 병렬 가능 |
|-------|------|--------|-----------|
| 1 | 단일 | TASK-001: 전체 구현 | - |

> 단일 파일(ScheduleResourceView.tsx)만 수정하므로 병렬화 불필요. 순차 구현.

### Phase 1: 단일 작업

#### [TASK-001] 워크로드 뷰 크로스 행 드래그 재배정 구현

- **Context**: REQ-F01~F09 구현
- **File**: `frontend/src/app/components/schedule/ScheduleResourceView.tsx`
- **Subtasks**:
  - [ ] 1-1. DragState 인터페이스 확장
    - `targetRowIndex: number` (드래그 중 대상 행 인덱스)
    - `targetAssigneeId: string | null` (대상 행의 멤버 ID)
    - `originRowIndex: number` (원래 행 인덱스, 비교용)
  - [ ] 1-2. handleResizeStart → handleMouseMove 수정
    - move 타입일 때만 Y축 감지 활성화
    - 마우스 Y 위치로 대상 행 계산: `scrollContainerRef`의 각 행 누적 높이와 비교
    - `data-resource-row-index` 속성 활용 또는 행 높이 누적 계산
    - DragState의 targetRowIndex/targetAssigneeId 업데이트
  - [ ] 1-3. handleMouseUp 수정 (크로스 행 드롭 처리)
    - targetRowIndex !== originRowIndex일 때:
      - 새 assigneeId = rows[targetRowIndex].id (\_\_unassigned\_\_이면 null)
      - 날짜 계산: 드롭 위치의 dayIndex 기준 start_date 설정, duration 유지
      - 옵티미스틱 UI: 원래 행에서 아이템 제거, 대상 행에 아이템 추가
      - API: `checklistAPI.updateItem(boardId, taskId, itemId, { start_date, due_date, assignee_id })`
    - targetRowIndex === originRowIndex일 때: 기존 동작 유지
  - [ ] 1-4. 대상 행 하이라이트 렌더링
    - dragState?.targetRowIndex가 현재 rowIndex와 같으면 행에 `bg-bridge-accent/5` 적용
    - 좌측 라벨 영역에도 `ring-2 ring-bridge-accent/30` 표시
  - [ ] 1-5. 고스트 바 렌더링
    - 크로스 행 드래그 중: 원래 행의 바를 opacity-30 처리
    - 대상 행에 고스트 바(opacity-50) 표시 (예상 위치)
  - [ ] 1-6. 접힌 행 자동 펼침
    - 대상 행이 needsCollapse && !isExpanded일 때 expandedRows에 추가
- **완료 기준**: 바를 다른 멤버 행에 드롭하면 담당자+날짜가 변경되고, API 성공 후 UI 반영

---

## 진행 로그

| 일시 | 상태 | 내용 |
|------|------|------|
| 2026-04-30 | 설계 완료 | Feature Spec + Implementation Plan + TASKS 작성 |
