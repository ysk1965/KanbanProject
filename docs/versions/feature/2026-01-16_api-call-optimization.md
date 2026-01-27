# Feature: API 호출 최적화

> 생성일: 2026-01-16
> 상태: ✅ 완료

---

## Feature Capsule

```
기능명: API 호출 최적화
한줄 설명: 과도한 API 호출로 인한 429 에러 해결 및 전반적인 API 콜 수 감소
해결하는 문제: 보드 진입 시 과다 API 호출, 체크리스트 N+1 쿼리, 마일스톤 N+1 쿼리로 인한 Rate Limit 초과
핵심 시나리오: 보드 진입 시 최적화된 API 호출로 빠른 로딩 및 429 에러 방지
Scope: 체크리스트 배치 API, 마일스톤 N+1 해결, Rate Limit 증가, DraggableCard 최적화
Non-scope: 전체 캐싱 시스템 구축, Schedule 뷰 주간 API, Pricing Plans 캐싱
성공 기준: 보드 진입 시 API 호출 50% 감소, 429 에러 0건
영향받는 기존 코드: DraggableCard.tsx, KanbanBoardPage.tsx, services.ts, api.ts, RateLimitingFilter.java, MilestoneService.java
주요 리스크: BE/FE 동시 작업 필요 - 배치 API 완료 전까지 FE는 기존 로직 유지
```

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 체크리스트 배치 API | BE 추가 | FE만 최적화로는 N+1 문제 근본 해결 불가 | FE 캐싱만 적용 |
| D-02 | Rate Limit 값 | 분당 300회 | 여유롭게 5배 증가, 서버 부하 허용 범위 | 분당 120회, 200회 |
| D-03 | 마일스톤 N+1 | 함께 해결 | 초기 로드 시 동일한 문제 패턴 | 다음으로 미룸 |

---

## Feature Spec: API 호출 최적화

### 상세 요구사항

- **REQ-F01**: 체크리스트 배치 조회 API 구현 (여러 Task ID로 한 번에 조회)
- **REQ-F02**: DraggableCard의 중복 useEffect 제거 및 최적화
- **REQ-F03**: 마일스톤 목록 조회 시 상세 정보 포함하여 N+1 제거
- **REQ-F04**: Rate Limit을 분당 60회 → 300회로 증가
- **REQ-F05**: Task 이동 후 전체 재조회 제거 (응답 데이터 활용)

### 현재 문제점 상세

#### 1. DraggableCard 체크리스트 호출 (가장 심각)
- **위치**: `DraggableCard.tsx:224-260`
- **문제**: 4개의 useEffect가 각각 체크리스트 API 호출 트리거
- **영향**: 20개 카드 × 최대 4번 = 80개 API 요청 가능

```typescript
// 문제 코드 (현재)
useEffect(() => { loadChecklist(); }, [task.checklist_total, boardId]);
useEffect(() => { loadChecklist(); }, [isChecklistExpanded, boardId]);
useEffect(() => { checklistAPI.getChecklist(); }, [task.checklist_completed, task.checklist_total]);
useEffect(() => { checklistAPI.getChecklist(); }, [task.checklist_version]);
```

#### 2. 마일스톤 N+1 쿼리
- **위치**: `services.ts:1347-1375`
- **문제**: getMilestones() 1회 + getMilestone() N회
- **영향**: 5개 마일스톤 = 6개 API 호출

```typescript
// 문제 코드 (현재)
const milestonesWithDetails = await Promise.all(
  response.milestones.map(async (m) => {
    const detail = await milestoneAPI.getMilestone(boardId, m.id); // N번 호출
    return detail;
  })
);
```

#### 3. Task 이동 후 전체 재조회
- **위치**: `KanbanBoardPage.tsx:873-876`
- **문제**: 이동 완료된 Task 응답을 무시하고 전체 목록 재조회

### 엣지 케이스

| 케이스 | 처리 방법 |
|--------|----------|
| 배치 API에 일부 Task ID가 유효하지 않음 | 유효한 것만 반환, 에러 무시 |
| 체크리스트가 없는 Task | 빈 배열 반환 |
| 동시에 같은 체크리스트 요청 | 요청 디바운싱으로 중복 제거 |

---

## Implementation Plan: API 호출 최적화

### 변경 범위

#### Backend
- **수정**:
  - `RateLimitingFilter.java` (Rate Limit 값 변경)
  - `MilestoneService.java` (상세 정보 포함 조회)
  - `MilestoneController.java` (응답 형식 변경)
- **추가**:
  - `ChecklistController.java` (배치 조회 엔드포인트)
  - `ChecklistService.java` (배치 조회 로직)

#### Frontend
- **수정**:
  - `DraggableCard.tsx` (useEffect 최적화)
  - `KanbanBoardPage.tsx` (배치 체크리스트 로딩, Task 이동 최적화)
  - `services.ts` (마일스톤 N+1 제거, 배치 체크리스트 서비스)
  - `api.ts` (배치 체크리스트 API 함수)

### API 변경

| Method | Endpoint | 설명 | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/api/v1/boards/{boardId}/checklists/batch` | 여러 Task의 체크리스트 일괄 조회 | `{ taskIds: string[] }` | `{ checklists: { taskId: string, items: ChecklistItem[] }[] }` |
| GET | `/api/v1/boards/{boardId}/milestones` | 마일스톤 목록 (상세 포함) | - | 기존 + `features`, `tasks_count` 포함 |

### DB 변경

없음 (기존 스키마 활용)

### 의존성

- **선행 작업**: 없음
- **후행 작업**: E2E 테스트, 모니터링 설정

---

## TASKS: API 호출 최적화

### 실행 전략 요약

| Phase | 유형 | 태스크 | 병렬 가능 |
|-------|------|--------|-----------|
| 1 | 병렬 | TASK-001, TASK-002, TASK-003, TASK-004 | ✅ BE/FE 동시 |
| 2 | 통합 | TASK-005 | - |

---

## Phase 1: 병렬 작업 (Parallel)

> 아래 태스크들은 **동시에 실행 가능**합니다.
> Claude Code 실행 지침: `Task tool로 다음 태스크들을 병렬 에이전트로 실행`

### 🔀 Parallel Group A: Backend 작업

#### [TASK-001] [BE] Rate Limit 증가
- **Context**: REQ-F04 구현
- **Files**: `backend/src/main/java/com/kanban/global/security/RateLimitingFilter.java`
- **Subtasks**:
  - [ ] 1-1. createStandardBucket 메서드에서 분당 60 → 300으로 변경
  - [ ] 1-2. 시간당 1000 → 3000으로 변경 (비례 증가)
- **변경사항**:
  ```java
  // 변경 전
  Bandwidth.classic(60, Refill.greedy(60, Duration.ofMinutes(1)))
  Bandwidth.classic(1000, Refill.greedy(1000, Duration.ofHours(1)))

  // 변경 후
  Bandwidth.classic(300, Refill.greedy(300, Duration.ofMinutes(1)))
  Bandwidth.classic(3000, Refill.greedy(3000, Duration.ofHours(1)))
  ```
- **완료 기준**: 서버 재시작 후 분당 300회 요청 허용 확인

#### [TASK-002] [BE] 체크리스트 배치 조회 API
- **Context**: REQ-F01 구현
- **Files**:
  - `backend/src/main/java/com/kanban/domain/checklist/controller/ChecklistController.java`
  - `backend/src/main/java/com/kanban/domain/checklist/service/ChecklistService.java`
  - `backend/src/main/java/com/kanban/domain/checklist/dto/ChecklistBatchRequest.java` (신규)
  - `backend/src/main/java/com/kanban/domain/checklist/dto/ChecklistBatchResponse.java` (신규)
- **Subtasks**:
  - [ ] 2-1. ChecklistBatchRequest DTO 생성 (taskIds: List<Long>)
  - [ ] 2-2. ChecklistBatchResponse DTO 생성
  - [ ] 2-3. ChecklistService에 getBatchChecklists 메서드 추가
  - [ ] 2-4. ChecklistController에 POST /batch 엔드포인트 추가
- **완료 기준**: `POST /api/v1/boards/{boardId}/checklists/batch` 정상 응답

#### [TASK-003] [BE] 마일스톤 N+1 해결
- **Context**: REQ-F03 구현
- **Files**:
  - `backend/src/main/java/com/kanban/domain/milestone/service/MilestoneService.java`
  - `backend/src/main/java/com/kanban/domain/milestone/dto/MilestoneResponse.java`
- **Subtasks**:
  - [ ] 3-1. getMilestones 메서드에서 features, tasks_count 함께 조회
  - [ ] 3-2. MilestoneResponse에 features 필드 추가 (이미 있으면 확인)
  - [ ] 3-3. Repository에 @EntityGraph 또는 JOIN FETCH 적용
- **완료 기준**: GET /milestones 응답에 features 포함, 쿼리 1회로 감소

---

### 🔀 Parallel Group B: Frontend 작업

#### [TASK-004] [FE] DraggableCard useEffect 최적화 + API 연동 준비
- **Context**: REQ-F02 구현
- **Files**:
  - `frontend/src/app/components/DraggableCard.tsx`
  - `frontend/src/app/utils/api.ts`
  - `frontend/src/app/utils/services.ts`
  - `frontend/src/app/pages/KanbanBoardPage.tsx`
- **Subtasks**:
  - [ ] 4-1. api.ts에 checklistAPI.getBatchChecklists 함수 추가
  - [ ] 4-2. services.ts에 checklistService.getBatchChecklists 서비스 추가
  - [ ] 4-3. DraggableCard.tsx에서 중복 useEffect 제거 (4개 → 1개로 통합)
  - [ ] 4-4. KanbanBoardPage.tsx에서 초기 로드 시 배치 체크리스트 호출 추가
  - [ ] 4-5. services.ts의 milestoneService.getMilestones에서 N+1 로직 제거
  - [ ] 4-6. Task 이동 후 전체 재조회 제거 (응답 데이터 활용)
- **완료 기준**:
  - 보드 진입 시 체크리스트 API 호출 1회로 감소
  - DraggableCard에서 개별 API 호출 제거
- **Mock 필요**: BE 완료 전까지 기존 개별 호출 유지 (BE 완료 후 전환)

---

## Phase 2: 통합 작업 (Sequential)

> Phase 1 완료 후 진행. BE/FE 연동 및 테스트.

### [TASK-005] 통합 테스트 및 검증
- **선행 조건**: TASK-001, TASK-002, TASK-003, TASK-004 완료
- **Subtasks**:
  - [ ] 5-1. 백엔드 서버 재시작 및 Rate Limit 확인
  - [ ] 5-2. 배치 체크리스트 API 연동 테스트
  - [ ] 5-3. 마일스톤 조회 쿼리 확인 (N+1 해결)
  - [ ] 5-4. 보드 진입 시 Network 탭에서 API 호출 수 확인
  - [ ] 5-5. 429 에러 발생 여부 확인
- **완료 기준**:
  - API 호출 50% 이상 감소
  - 429 에러 0건
  - 정상 기능 동작

---

## 병렬 실행 가이드 (Claude Code용)

**Phase 1 실행 시:**
```
Task tool로 다음을 병렬 실행:
- TASK-001 (BE Rate Limit)
- TASK-002 (BE 배치 API)
- TASK-003 (BE 마일스톤 N+1)
- TASK-004 (FE 최적화)

4개 에이전트를 "병렬로" 동시에 실행
```

**Phase 2 실행 시:**
```
Phase 1의 모든 태스크 완료 확인 후
TASK-005 순차 실행
```

---

## 진행 로그

| 일시 | 상태 | 내용 |
|------|------|------|
| 2026-01-16 | 설계 완료 | Feature Spec, Implementation Plan, TASKS 작성 |
| 2026-01-16 | 구현 완료 | Phase 1 병렬 작업 4개 완료 (BE: Rate Limit, 배치 API, N+1 해결 / FE: DraggableCard 최적화) |
| 2026-01-16 | 빌드 검증 | FE/BE 빌드 성공 확인 |
