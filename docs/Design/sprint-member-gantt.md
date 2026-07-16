# 설계 문서 — 스프린트 구성원별 간트 & 업무 배치 모달

- 작성일: 2026-07-16
- 상태: 설계 (구현 전 승인 대기)
- 관련 목업: 구성원 간트 · 업무 배치 모달 (Artifact)
- 관련 메모리: `sprint-feature`, `sprint-realtime`, `sprint-jira-view`

---

## 1. 목표

스프린트 보드의 **구성원(member) 탭**에서 특정 구성원을 선택하면 모달이 열리고, 그 안에서
1. 해당 구성원에게 배정된 스프린트 업무(체크리스트 항목)를 **개인 간트차트**로 보고,
2. 미배치 업무를 **드래그앤드롭으로 타임라인에 배치**(시작일/마감일 설정)하고,
3. 배치된 바를 끌어 **일정 이동 / 기간 조절**한다.

두 가지 레이아웃 모드를 지원한다.
- **플렉서블**: Feature 단위 스윔레인 + 겹치지 않는 업무는 한 레인에 압축(lane packing).
- **업무별**: 1업무 = 1행 고정.

---

## 2. 핵심 결론 — 데이터 모델은 그대로 재사용

> 스프린트 카드는 곧 **체크리스트 항목(ChecklistItem)** 이며, 여기에는 이미 시작일과 마감일이 모두 있다. **새 필드·새 테이블 불필요.**

| 간트 개념 | 매핑되는 기존 데이터 |
|---|---|
| 업무(바) | `ChecklistItem` (스프린트에 담긴 항목) |
| 바 시작 | `checklist_items.start_date` |
| 바 끝 / 기간 | `checklist_items.due_date` (기간 = due − start + 1일) |
| 담당자(어느 구성원 간트인가) | `checklist_items.assignee_id` |
| 배치됨 vs 미배치 | `start_date`·`due_date` **둘 다 존재 → 배치됨**, 하나라도 null → 미배치(백로그) |
| 스윔레인(플렉서블) 그룹 | `feature_id` / `feature_title` / `feature_color` |
| 완료 상태 | `is_completed` (바 스타일 분기용) |

### 참조 위치
- 엔티티: `backend/.../domain/checklist/ChecklistItem.java`
  - `startDate`(`start_date`), `dueDate`(`due_date`), `assignee`(`assignee_id`), `isCompleted`, `sprint`(`sprint_id`), `sprintColumn`(`sprint_column_id`)
  - 도메인 메서드: `updateStartDate`, `updateDueDate`, `updateInfo(title, startDate, dueDate)`
- 스프린트 카드 표현: 별도 조인 테이블 없음. `checklist_items.sprint_id` + `sprint_column_id`로 표현 (`Sprint.java` 주석 확인).

---

## 3. 백엔드 — 신규 작업 최소

### 3.1 조회: 신규 API 불필요 (기존 응답 재사용)
`GET /api/v1/boards/{boardId}/milestones/{milestoneId}/sprint-board` 가 반환하는 `SprintResponse.Board` 에 이미 필요한 것이 전부 들어있다.
- `columns[].items[]`, `backlog[]` 의 각 `ItemCard` 는 `assignee`, `start_date`, `due_date`, `task_id`, `feature_id/title/color`, `completed` 를 포함(`SprintResponse.java` ItemCard).
- 프론트는 이미 `assignee.id` 로 구성원별 재그루핑(`SprintBoard.tsx` `memberColumns` useMemo)을 수행 중.
- **→ 간트 모달은 프론트에서 "선택된 구성원의 항목만 필터링"** 하면 되고 추가 조회가 필요 없다.

### 3.2 저장: 기존 PATCH 재사용
날짜 배치/이동/기간조절은 모두 아래 기존 엔드포인트로 커버된다.

```
PATCH /api/v1/boards/{boardId}/tasks/{taskId}/checklist/{itemId}
body: { start_date?: "YYYY-MM-DD" | null, due_date?: "YYYY-MM-DD" | null }
```
- `ChecklistController.java` PATCH `/{itemId}` (부분 업데이트).
- `ChecklistRequest.Patch` 는 `*_Present` 플래그로 "미전송 vs 명시적 null" 을 구분 → `start_date`/`due_date` 만 개별 수정 가능.
- 각 `ItemCard` 에 `task_id` 가 있어 프론트에서 경로 조합 가능.

| 간트 동작 | 요청 |
|---|---|
| 미배치 → 배치(드롭) | `{ start_date: D, due_date: D+dur-1 }` |
| 바 이동 | `{ start_date: D', due_date: D'+dur-1 }` |
| 오른쪽 핸들 기간 조절 | `{ due_date: D2 }` |
| 왼쪽 핸들 기간 조절 | `{ start_date: D1 }` |
| 배치 해제(백로그로) | `{ start_date: null, due_date: null }` |

프론트 클라이언트: `checklistAPI.patchItem(boardId, taskId, itemId, { start_date, due_date })` (`api.ts`) 이미 존재.

### 3.3 실시간 동기화 — 검증 필요 포인트 ⚠️
- 간트에서 날짜를 바꾸면 스프린트 보드(같은 구성원 다른 뷰, 다른 접속자)에도 반영돼야 한다.
- **확인 필요**: `ChecklistService` 의 startDate/dueDate PATCH 가 스프린트 웹소켓 브로드캐스트(`useSprintRealtime` 대응 이벤트)를 발생시키는가?
  - 발생한다면 추가 작업 없음.
  - 안 한다면 PATCH 성공 후 스프린트 업데이트 이벤트를 publish 하도록 소폭 추가. (`sprint-realtime` 메모리의 "네이티브 드래그 미브로드캐스트" 갭과 동일 계열)
- 참고: `ChecklistService.java` 는 현재 git modified 상태 → 구현 착수 시 현재 로직 재확인.

### 3.4 (선택) 서버측 구성원 그루핑 DTO — 이번엔 보류
현재 구성원 그루핑은 프론트 클라이언트 사이드. 성능/일관성 이슈가 실측되면 그때 `SprintResponse` 에 member 축을 추가 고려. **1차 구현에는 불필요.**

---

## 4. 프론트엔드

### 4.1 진입점
- `SprintBoard.tsx` 구성원 탭 렌더: `groupBy === "member"` → `memberColumns.map(renderMemberColumn)` (`SprintBoard.tsx` :2693, 렌더 함수 :1493).
- **신규**: `renderMemberColumn` 의 컬럼 헤더(아바타/이름/진척바 영역)에 클릭 핸들러 추가 → `setGanttMember(mc.memberId)` → 모달 오픈.
  - 카드 클릭은 기존대로 태스크 모달(`onOpenChecklistItem`) 유지. 헤더 영역만 간트 진입으로 분리.
  - 접근성: 헤더를 `button`/`role` + `aria-label="{이름} 간트 열기"`, 44px 터치타겟.

### 4.2 신규 컴포넌트
```
frontend/src/app/components/sprint/
  MemberGanttModal.tsx      # 모달 셸 (MotionModal 기반) + 상태/저장 오케스트레이션
  GanttTimeline.tsx         # 날짜 헤더 + 그리드 + 오늘선 + 스윔레인/행 렌더
  GanttBar.tsx              # 바 (이동/좌우 리사이즈, pointer 이벤트)
  GanttBacklogList.tsx      # 미배치 업무 카드 목록 (HTML5 draggable)
  useGanttPlacement.ts      # 배치 상태·낙관적 업데이트·PATCH 디바운스 훅
```
- 모달은 CLAUDE.md 규칙에 따라 `MotionModal`(role=dialog, 포커스 트랩, padding 통일) 위에 구성.
- 디자인 토큰: bridge-obsidian 배경, 인디고/틸 액센트, `slate-` 회색톤, `border-foreground/[0.08]`, `custom-scrollbar`, `Loader2` 스피너 — 목업이 이미 이 시스템을 따름.

### 4.3 데이터 흐름
```
SprintBoard (이미 보유한 sprint board 데이터)
  └ 선택 구성원 id 로 items 필터 (assignee.id === memberId)
      ├ start_date && due_date 있음  → 간트 바 (배치됨)
      └ 없음                          → 백로그 카드 (미배치)
  ↓ 드래그/이동/리사이즈
useGanttPlacement: 낙관적 로컬 업데이트 → checklistAPI.patchItem(...)
  ↓ 성공
웹소켓 이벤트로 SprintBoard 재조회/패치 반영 (3.3 확인 후)
```
- **낙관적 업데이트 + 디바운스**: 드래그 중엔 로컬 state 만 갱신, pointerup(또는 300ms 디바운스) 시 1회 PATCH. 실패 시 롤백 + 토스트.

### 4.4 레이아웃 모드
- 플렉서블: `feature_id` 로 그룹 → 각 그룹 greedy lane packing(겹치지 않으면 같은 행). 미분류(feature 없음) 그룹은 맨 뒤.
- 업무별: 1항목 1행, 왼쪽 라벨에 제목.
- 토글 상태는 localStorage(`bridge:sprint-gantt-mode`)에 저장.

### 4.5 타임라인 범위 / 줌
- 기본 범위 = 스프린트 `start_date ~ end_date` (`SprintInfo`).
- 스프린트가 길면(예 8주) 가로 스크롤 + 일/주 줌 토글. 1차는 **일(day) 단위 + 가로 스크롤**, "오늘" 세로선. (주 단위 줌은 2차.)
- 스프린트 기간 밖 날짜로의 배치 정책 결정 필요 → §6.

### 4.6 프론트 타입
- 기존 `SprintItemCard`(`types/index.ts` :594) 재사용 — `start_date`, `due_date`, `task_id`, `assignee`, `feature_*` 이미 포함. 신규 타입 최소.

---

## 5. 태스크 분해 (구현 단계, 승인 후)

**Phase A — 프론트 뼈대 (BE 무변경)**
1. 구성원 헤더 클릭 → 모달 오픈 배선 (`SprintBoard.tsx`).
2. `MemberGanttModal` + `GanttTimeline` + `GanttBacklogList` + `GanttBar` 구현 (목업 로직 이식).
3. `useGanttPlacement` — 배치 상태 파생 + `patchItem` 저장(낙관적+디바운스).
4. 플렉서블/업무별 모드, 일 단위 타임라인, 오늘선, 자동 배치(선택).

**Phase B — 실시간 동기화**
5. §3.3 검증: startDate/dueDate PATCH 의 스프린트 브로드캐스트 여부 확인, 없으면 이벤트 추가.
6. 간트 저장 → 보드/타 접속자 반영 E2E 확인.

**Phase C — 마감/폴리시**
7. 스프린트 기간 밖 배치 정책, 완료 항목 표시, 권한(`canEdit`) 가드, i18n, 반응형/모바일.

---

## 6. 결정 사항 (확정)

1. **스프린트 기간 밖 배치** — ✅ **스프린트 `start_date ~ end_date` 로 클램프.** 바 이동/리사이즈/드롭 모두 이 범위를 벗어나지 못하게 강제. 타임라인 범위도 스프린트 기간과 동일.
2. **드롭 시 기본 기간** — ✅ **1일** (`due_date = start_date`). 이후 오른쪽 핸들로 늘림.
3. **드래그 저장 시점** — ✅ **드래그 놓는 즉시(pointerup) 낙관적 저장.** 별도 "배치 저장" 버튼 없음(목업의 저장 버튼은 제거). 실패 시 로컬 롤백 + 토스트.
4. **플렉서블 스윔레인 그룹 축** — ✅ **Feature 기준** (`feature_id`). feature 없는 항목은 "미분류" 그룹으로 맨 뒤.
5. **권한** — ✅ **`canEdit` 기준** (기존 스프린트 카드 드래그 권한과 동일). `canEdit === false` 면 간트는 읽기 전용(바 이동/리사이즈/드롭 비활성, 조회만).

> 위 결정으로 §5 태스크 분해의 Phase C 항목 대부분이 Phase A 로 흡수됨(즉시 저장·클램프·기본 1일은 A 에서 바로 구현).

---

## 7. 리스크 / 주의

- `ChecklistService.java`, `SprintResponse.java`, `SprintBoard.tsx`, `types/index.ts`, `api.ts` 가 현재 **git modified** 상태 → 착수 시 최신 로컬 변경과 충돌/중복 확인 필요.
- 같은 체크리스트 항목이 여러 스프린트에 걸치는 경우는 없음(스프린트 카드 = sprint_id 단일) → 간트는 항상 단일 스프린트 컨텍스트.
- `start_date/due_date` 는 `LocalDate`(시분 없음) → 타임존 이슈 없음. 프론트 `dateUtils` 로 표시.
- 완료(`is_completed`) 항목의 바는 시각적으로 구분(체크/감산 채도)하되 이동 가능 여부는 §6.5 권한과 함께 결정.
