# Feature: 데일리 체크리스트 관리 시스템

> 생성일: 2026-01-16
> 상태: ✅ 구현 완료

---

## Feature Capsule

```
기능명: 데일리 체크리스트 관리 시스템
한줄 설명: 데일리 스크럼에서 인원별로 오늘 할 체크리스트를 가볍게 할당/관리하는 기능

해결하는 문제:
- 기존 타임블록은 30분 단위로 너무 세세하고 부담됨
- 업무 중 변경이 잦아 세밀한 스케줄링이 무의미
- 스크럼 때 러프하게 "오늘 이거 할 예정" 정도만 공유하고 싶음

핵심 시나리오:
1. 데일리스크럼 탭 진입 → "체크리스트" 세부 탭 선택
2. 인원별 컬럼에서 각자의 오늘 할 일 확인
3. 기존 Task 체크리스트에서 선택하거나 새로 추가
4. 우선순위 드래그로 순서 조정
5. 다음날은 빈 화면으로 새로 시작

Scope (이번 구현):
- 데일리스크럼 탭 내 "체크리스트" 세부 탭 추가
- 인원별 컬럼 뷰 (멤버별 체크리스트 표시)
- 기존 체크리스트 선택 모달 (Feature→Task→Checklist)
- 새 체크리스트 추가 기능
- 우선순위 드래그 정렬
- 기록 보관 (히스토리)

Non-scope (다음으로 미룸):
- 완료 상태 동기화 (원본 체크리스트와)
- 반복 체크리스트 자동 생성
- 알림 기능
- 통계/분석

성공 기준:
- 데일리스크럼에서 1분 내로 오늘 할 일 할당 완료
- 타임블록보다 가볍고 빠른 UX

영향받는 기존 코드:
- FE: KanbanBoardPage, DailyScheduleView, api.ts, types
- BE: 새 Entity/Service/Controller 추가 (기존 코드 수정 최소화)

주요 리스크: 없음 (단순 구조)
```

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 데이터 소스 | 기존 Task 체크리스트 + 새 추가 | Feature→Task→Checklist 연결 유지 | 독립 체크리스트 |
| D-02 | 시간 설정 | 없음 (우선순위만) | 러프한 관리가 목적 | 오전/오후 구분 |
| D-03 | 완료 처리 | 기록 보관만 | 중요 데이터 아님, 즐겨찾기 성격 | 완료 시 제거 |
| D-04 | 날짜 변경 | 빈 화면으로 시작 | 매일 새로 할당하는 컨셉 | 미완료 이월 |
| D-05 | UI 위치 | 데일리스크럼 탭 내 세부 탭 | 기존 타임블록과 분리 | 별도 메뉴 |

---

## Feature Spec: 데일리 체크리스트

### 상세 요구사항

- **REQ-F01**: 데일리스크럼 탭에 "타임블록" / "체크리스트" 세부 탭 추가
- **REQ-F02**: 체크리스트 탭에서 인원별 컬럼으로 오늘 할당된 체크리스트 표시
- **REQ-F03**: 기존 Task 체크리스트에서 선택하여 오늘 할 일로 추가
- **REQ-F04**: 새 체크리스트 항목 생성 (Feature→Task 선택 후 제목 입력)
- **REQ-F05**: 드래그로 우선순위 순서 변경
- **REQ-F06**: 체크리스트 항목 제거 (오늘 목록에서만, 원본 유지)
- **REQ-F07**: 날짜별 기록 보관 (히스토리 조회 가능)
- **REQ-F08**: 다음날은 빈 화면으로 시작 (자동 이월 없음)

### UI/UX 명세

#### 화면 구성

```
┌─────────────────────────────────────────────────────────────┐
│  데일리 스크럼        [타임블록] [체크리스트]    < 2026-01-16 >  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  홍길동   │  │  김철수   │  │  이영희   │  │  박민수   │    │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤    │
│  │ □ API 개발│  │ □ UI 수정 │  │ □ 테스트  │  │ □ 문서화  │    │
│  │ □ 코드리뷰│  │ □ 버그fix │  │          │  │          │    │
│  │ □ 회의   │  │          │  │          │  │          │    │
│  │          │  │          │  │          │  │          │    │
│  │  [+ 추가] │  │  [+ 추가] │  │  [+ 추가] │  │  [+ 추가] │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 사용자 플로우

1. **조회**: 데일리스크럼 탭 → 체크리스트 세부탭 → 오늘 날짜의 인원별 체크리스트 표시
2. **추가 (기존 선택)**: [+ 추가] 클릭 → 모달에서 Feature 선택 → Task 선택 → 체크리스트 항목 선택
3. **추가 (새로 생성)**: [+ 추가] 클릭 → 모달에서 Feature/Task 선택 → "새 항목 추가" → 제목 입력
4. **순서 변경**: 항목 드래그 → 다른 위치에 드롭 → 우선순위 업데이트
5. **제거**: 항목 hover → X 버튼 클릭 → 오늘 목록에서 제거 (원본 체크리스트는 유지)
6. **날짜 이동**: 날짜 선택 → 해당 날짜의 기록 조회 (과거는 읽기 전용)

#### 상태별 UI

| 상태 | UI 표시 |
|------|---------|
| 로딩 | 스켈레톤 카드 표시 |
| 빈 상태 | "오늘 할 일을 추가해보세요" + 추가 버튼 |
| 에러 | 토스트 메시지 + 재시도 버튼 |
| 과거 날짜 | 읽기 전용 모드 (수정 불가, 회색 처리) |

### 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 같은 체크리스트 중복 추가 시도 | "이미 추가된 항목입니다" 토스트, 추가 차단 |
| 원본 체크리스트가 삭제된 경우 | 데일리 목록에서도 자동 제거 (soft delete) |
| 원본 Task가 삭제된 경우 | 데일리 목록에서 해당 항목 표시 유지 (고아 상태 허용) |
| 멤버가 보드에서 제거된 경우 | 해당 멤버 컬럼 숨김, 기존 기록은 유지 |

---

## Implementation Plan: 데일리 체크리스트

### 변경 범위

#### Frontend

**수정 파일:**
| 파일 | 변경 내용 |
|------|----------|
| `KanbanBoardPage.tsx` | 세부 탭 상태 관리 추가 (`scheduleSubTab: 'timeblock' \| 'checklist'`) |
| `DailyScheduleView.tsx` | 탭 전환 UI 추가, 조건부 렌더링 |
| `api.ts` | `dailyChecklistAPI` 추가 |
| `types/index.ts` | `DailyChecklistItem`, `DailyChecklistColumn` 타입 추가 |

**추가 파일:**
| 파일 | 설명 |
|------|------|
| `DailyChecklistView.tsx` | 데일리 체크리스트 메인 뷰 컴포넌트 |
| `DailyChecklistColumn.tsx` | 멤버별 컬럼 컴포넌트 |
| `DailyChecklistItem.tsx` | 개별 체크리스트 항목 컴포넌트 |
| `AddDailyChecklistModal.tsx` | 체크리스트 추가 모달 (Feature→Task→Checklist 선택) |

#### Backend

**추가 파일:**
| 파일 | 설명 |
|------|------|
| `DailyChecklist.java` | Entity - 데일리 체크리스트 할당 |
| `DailyChecklistRepository.java` | Repository |
| `DailyChecklistService.java` | Service |
| `DailyChecklistController.java` | Controller |
| `DailyChecklistDto.java` | Request/Response DTO |

### API 변경

| Method | Endpoint | 설명 | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/boards/{boardId}/daily-checklists` | 일일 체크리스트 조회 | `?date=2026-01-16` | `DailyChecklistResponse` |
| POST | `/boards/{boardId}/daily-checklists` | 체크리스트 할당 | `{ checklistItemId, assigneeId, date }` | `DailyChecklistItemResponse` |
| POST | `/boards/{boardId}/daily-checklists/with-item` | 새 체크리스트 생성 + 할당 | `{ taskId, title, assigneeId, date }` | `DailyChecklistItemResponse` |
| PUT | `/boards/{boardId}/daily-checklists/{id}/position` | 순서 변경 | `{ position }` | `DailyChecklistItemResponse` |
| DELETE | `/boards/{boardId}/daily-checklists/{id}` | 할당 제거 | - | `{ message }` |

### DB 변경

**새 테이블: `daily_checklists`**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) | PK, UUID |
| board_id | VARCHAR(36) | FK → boards |
| checklist_item_id | VARCHAR(36) | FK → checklist_items (nullable) |
| assignee_id | VARCHAR(36) | FK → users |
| assigned_date | DATE | 할당 날짜 |
| position | INT | 우선순위 순서 |
| title | VARCHAR(200) | 제목 (원본 삭제 시 백업) |
| created_at | DATETIME | 생성 시각 |

**인덱스:**
- `idx_daily_checklist_board_date`: (board_id, assigned_date)
- `idx_daily_checklist_assignee_date`: (assignee_id, assigned_date)

### 의존성

- **선행 작업**: 없음 (독립적)
- **후행 작업**: 완료 상태 동기화 (Non-scope, 추후)

---

## TASKS: 데일리 체크리스트

### 실행 전략 요약

| Phase | 유형 | 태스크 | 병렬 가능 |
|-------|------|--------|-----------|
| 1 | 선행 | TASK-001 (타입 정의) | - |
| 2 | 병렬 | TASK-002 (BE), TASK-003 (FE 컴포넌트) | ✅ BE/FE 동시 |
| 3 | 통합 | TASK-004 (연동), TASK-005 (탭 통합) | - |

---

## Phase 1: 선행 작업 (Sequential)

### [TASK-001] 타입 및 API 인터페이스 정의
- **Context**: REQ-F01~F08 기반 데이터 구조 설계
- **Files**:
  - `frontend/src/app/types/index.ts`
  - `frontend/src/app/utils/api.ts`
- **Subtasks**:
  - [ ] 1-1. `DailyChecklistItem` 타입 정의
  - [ ] 1-2. `DailyChecklistColumn` 타입 정의
  - [ ] 1-3. `DailyChecklistResponse` 타입 정의
  - [ ] 1-4. `dailyChecklistAPI` 인터페이스 정의 (Mock 반환)
- **완료 기준**: 타입 컴파일 에러 없음
- **후속 태스크**: TASK-002, TASK-003 (이 태스크 완료 후 병렬 실행 가능)

---

## Phase 2: 병렬 작업 (Parallel)

> 아래 태스크들은 **동시에 실행 가능**합니다.
> Claude Code 실행 지침: `Task tool로 다음 태스크들을 병렬 에이전트로 실행`

### 🔀 Parallel Group A: Backend + Frontend 동시 작업

#### [TASK-002] [BE] 데일리 체크리스트 API 구현
- **Context**: REQ-F02~F07 백엔드 구현
- **Subtasks**:
  - [ ] 2-1. `DailyChecklist.java` Entity 생성
  - [ ] 2-2. `DailyChecklistRepository.java` Repository 생성
  - [ ] 2-3. `DailyChecklistDto.java` DTO 생성
  - [ ] 2-4. `DailyChecklistService.java` Service 구현
  - [ ] 2-5. `DailyChecklistController.java` Controller 구현
- **Files**:
  - `backend/src/main/java/com/kanban/domain/dailychecklist/`
- **완료 기준**: API 테스트 통과 (Postman/curl)
- **병렬 대상**: TASK-003과 동시 실행 가능

#### [TASK-003] [FE] 데일리 체크리스트 UI 컴포넌트 구현
- **Context**: REQ-F01~F06 프론트엔드 구현
- **Subtasks**:
  - [ ] 3-1. `DailyChecklistView.tsx` 메인 뷰 컴포넌트
  - [ ] 3-2. `DailyChecklistColumn.tsx` 멤버별 컬럼 컴포넌트
  - [ ] 3-3. `DailyChecklistItem.tsx` 개별 항목 컴포넌트
  - [ ] 3-4. `AddDailyChecklistModal.tsx` 추가 모달 컴포넌트
  - [ ] 3-5. 드래그 앤 드롭 순서 변경 기능
- **Files**:
  - `frontend/src/app/components/DailyChecklistView.tsx`
  - `frontend/src/app/components/DailyChecklistColumn.tsx`
  - `frontend/src/app/components/DailyChecklistItem.tsx`
  - `frontend/src/app/components/AddDailyChecklistModal.tsx`
- **완료 기준**: Mock 데이터로 UI 렌더링 확인
- **병렬 대상**: TASK-002와 동시 실행 가능
- **Mock 필요**: BE 완료 전까지 Mock 데이터 사용

---

## Phase 3: 통합 작업 (Sequential)

> Phase 2 완료 후 진행. BE/FE 연동 및 탭 통합.

### [TASK-004] BE-FE API 연동
- **선행 조건**: TASK-002, TASK-003 완료
- **Subtasks**:
  - [ ] 4-1. `api.ts` Mock 제거, 실제 API 연결
  - [ ] 4-2. 조회 API 연동 테스트
  - [ ] 4-3. 추가/삭제 API 연동 테스트
  - [ ] 4-4. 순서 변경 API 연동 테스트
  - [ ] 4-5. 에러 핸들링 확인
- **Files**:
  - `frontend/src/app/utils/api.ts`
  - `frontend/src/app/components/DailyChecklistView.tsx`
- **완료 기준**: 모든 CRUD 동작 정상

### [TASK-005] 데일리스크럼 탭 통합
- **선행 조건**: TASK-004 완료
- **Subtasks**:
  - [ ] 5-1. `DailyScheduleView.tsx`에 세부 탭 UI 추가
  - [ ] 5-2. 탭 상태에 따른 조건부 렌더링
  - [ ] 5-3. `KanbanBoardPage.tsx` 상태 관리 연동
  - [ ] 5-4. 날짜 선택 공유 (타임블록 ↔ 체크리스트)
  - [ ] 5-5. 최종 UI/UX 점검
- **Files**:
  - `frontend/src/app/components/DailyScheduleView.tsx`
  - `frontend/src/app/pages/KanbanBoardPage.tsx`
- **완료 기준**: 탭 전환 및 전체 플로우 정상 동작

---

## 병렬 실행 가이드 (Claude Code용)

**Phase 2 실행 명령:**
```
Task tool로 다음 태스크들을 병렬 에이전트로 실행:
- TASK-002: [BE] 데일리 체크리스트 API 구현
- TASK-003: [FE] 데일리 체크리스트 UI 컴포넌트 구현
```

**실행 순서:**
```
TASK-001 (선행)
    ↓
TASK-002 ──┬── TASK-003  (병렬)
           ↓
      TASK-004 (통합)
           ↓
      TASK-005 (최종)
```

---

## 진행 로그

| 일시 | 작업 | 상태 |
|------|------|------|
| 2026-01-16 | Feature 설계 완료 | ✅ |
| 2026-01-16 | 문서 생성 | ✅ |
| 2026-01-16 | TASK-001 타입 및 API 인터페이스 정의 | ✅ |
| 2026-01-16 | TASK-002 [BE] 데일리 체크리스트 API 구현 | ✅ |
| 2026-01-16 | TASK-003 [FE] 데일리 체크리스트 UI 컴포넌트 구현 | ✅ |
| 2026-01-16 | TASK-004 BE-FE API 연동 | ✅ |
| 2026-01-16 | TASK-005 데일리스크럼 탭 통합 | ✅ |
| 2026-01-16 | 전체 구현 완료 | ✅ |
