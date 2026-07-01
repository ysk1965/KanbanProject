# 미니 칸반 (Mini Kanban) 뷰 — 구현 계획

> 제안서: `mini-kanban-view-proposals.html` (v2) 기준
> 기반 아키텍처: 마인드맵 서브뷰(`MindMapView` / React Flow / `board_mindmaps`) 클론

---

## 0. 확정 사양 (제안서 v2)

- **노드 = 태스크(Task)**. 블록에서 태스크가 마인드맵처럼 파생.
- **태스크 노드 내부 = TODO / DOING / DONE 3열 미니 칸반**, 카드 = **체크리스트 항목(ChecklistItem)**.
- **열 전이 규칙**
  - `completed = true` → **DONE** (최우선)
  - `start_date != null && start_date ≤ 오늘` → **DOING** (오늘 > due_date여도 미완료면 DOING 유지 + "지연" 강조)
  - 그 외(시작일 미래 or 일정 미등록) → **TODO**
- **TODO↔DOING = 오늘 날짜 기반 자동 파생** (저장값 아님, 매 렌더 계산)
- **DONE = 이동 시 완료 체크** (수동)
- **태스크 노드를 다른 블록으로 드래그 → 실제 보드 `block_id` 변경**

---

## 1. 선결 과제 — 체크리스트 `start_date` 파싱 버그 수정 ⚠️

**파일**: `frontend/src/app/hooks/useBoardDataLoader.ts` (`parseChecklistBatch`, L67-76)

현재 `id/title/completed/position/due_date/assignee`만 파싱하고 **`start_date`, `done_date` 누락**. 백엔드(`ChecklistResponse.Detail`)는 이미 `start_date/due_date/done_date` 반환 중. Mini Kanban의 TODO/DOING 분류가 `start_date`에 의존하므로 반드시 추가:

```ts
checklistMap[taskId] = group.items.map((item: any) => ({
  id: item.id,
  title: item.title,
  completed: item.completed,
  position: item.position,
  start_date: item.start_date ?? null,   // ← 추가
  due_date: item.due_date ?? null,
  done_date: item.done_date ?? null,     // ← 추가
  assignee: item.assignee
    ? { id: item.assignee.id, name: item.assignee.name }
    : null,
}));
```

> 부수효과 검토: 다른 뷰(리소스/캘린더)는 자체 by-assignee 응답을 쓰므로 이 맵의 필드 추가는 안전(추가만, 제거 없음).

---

## 2. 백엔드 — `board_minikanban` (mindmap 도메인 클론)

캔버스 레이아웃(노드 좌표·접힘 상태)만 저장. 태스크/체크리스트/블록은 저장하지 않음(파생). 이동은 **기존 API 재사용**이라 신규 로직 없음.

### 2.1 신규 패키지 `backend/.../domain/minikanban/`
| 파일 | mindmap 대응 | 변경점 |
|------|-------------|--------|
| `BoardMiniKanban.java` (entity) | `BoardMindMap` | 테이블명 `board_minikanban`, 인덱스/제약명 `*_minikanban_*` |
| `BoardMiniKanbanRepository.java` | 동일 | `findByBoardId` |
| `dto/MiniKanbanRequest.java` | `MindMapRequest.Save` | 필드: `nodes`(JsonNode[]), `collapsedBlocks`(String[]) |
| `dto/MiniKanbanResponse.java` | `MindMapResponse` | `nodes`, `collapsedBlocks` |
| `service/MiniKanbanService.java` | `MindMapService` | JSON 키 `nodes` / `collapsed_blocks`, `checkViewerOrAbove`(GET) / `checkMemberOrAbove`(PUT) |
| `controller/MiniKanbanController.java` | `MindMapController` | `@RequestMapping("/api/v1/boards/{boardId}/mini-kanban")` |

> 컨트롤러는 DTO 직접 반환(이 프로젝트 `{data}` 래퍼 없음). `edges`는 저장하지 않음 — 블록→태스크 엣지는 프론트에서 `block_id`로 라이브 파생.

### 2.2 마이그레이션 (타임스탬프 버전, 멱등)
`backend/src/main/resources/db/migration/V{YYYYMMDD_HHmmss}__create_board_minikanban.sql`
```sql
CREATE TABLE IF NOT EXISTS board_minikanban (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    data TEXT,
    updated_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_board_minikanban_board') THEN
        ALTER TABLE board_minikanban ADD CONSTRAINT uk_board_minikanban_board UNIQUE (board_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_minikanban_board') THEN
        ALTER TABLE board_minikanban ADD CONSTRAINT fk_board_minikanban_board
            FOREIGN KEY (board_id) REFERENCES boards(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_board_minikanban_board ON board_minikanban(board_id);
```
> 생성 시각은 `date -u +%Y%m%d_%H%M%S`로 실제 발급.

---

## 3. 저장 문서 스키마 (프론트)

`frontend/src/app/types/index.ts` 에 추가:
```ts
export interface MiniKanbanNode {
  id: string;
  kind: "block" | "task";
  x: number;
  y: number;
  block_id?: string;   // kind="block"
  task_id?: string;    // kind="task"
}
export interface MiniKanbanDocument {
  nodes: MiniKanbanNode[];
  collapsed_blocks?: string[]; // 접힌 블록 hub id 목록
}
```
- 노드는 **참조 id + 좌표만** 저장. 제목/색/진행률/체크리스트는 context로 라이브 주입(마인드맵 불변식 동일 — node.data에 넣으면 autosave 폭주).
- 블록→태스크 엣지, 3열 카드는 **파생**(저장 문서 제외).
- orphan prune: 로드 시 존재하지 않는 block_id/task_id 노드 제거.
- **미배치 태스크 auto-layout**: 저장 좌표 없는 태스크는 소속 블록 hub 주변으로 자동 방사 배치(첫 진입 UX).

---

## 4. 프론트엔드 API 클라이언트

`frontend/src/app/utils/api.ts` — `mindMapAPI` 옆에 추가:
```ts
export const miniKanbanAPI = {
  get: (boardId: string) =>
    apiClient.get<MiniKanbanDocument>(`/boards/${boardId}/mini-kanban`),
  save: (boardId: string, doc: MiniKanbanDocument) =>
    apiClient.put<MiniKanbanDocument>(`/boards/${boardId}/mini-kanban`, doc),
};
```

---

## 5. 프론트엔드 — `views/MiniKanbanView.tsx` (핵심)

`MindMapView.tsx` 구조 복제(ReactFlowProvider · useNodesState/useEdgesState · context 주입 · 디바운스 autosave · 언마운트 flush).

### 5.1 Props
```ts
interface MiniKanbanViewProps {
  boardId: string;
  blocks: Block[];
  tasks: Task[];
  checklistByTask: Record<string, ChecklistItem[]>; // = checklistDataMap
  featureMilestonesMap?: Record<string, FeatureMilestoneRef[]>;
  canEdit: boolean;
  memberColorMap: Record<string, string | null>;
  onTaskClick: (task: Task) => void;
  onMoveTask: (taskId: string, targetBlockId: string) => void;      // block_id 변경
  onPatchChecklist: (taskId: string, itemId: string, patch: { start_date?: string | null }) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
}
```

### 5.2 노드 타입
- `blockHubNode`: 블록명 + 태스크 수 + 접기/펼치기. 파생 태스크 노드로 엣지.
- `taskNode`: 헤더(태스크명·피처색·진행률·담당자) + **3열(TODO/DOING/DONE)** 체크리스트 카드.

### 5.3 열 파생 로직 (매 렌더)
```ts
type Col = "todo" | "doing" | "done";
function resolveColumn(item: ChecklistItem, today: string): Col {
  if (item.completed) return "done";
  if (item.start_date && item.start_date <= today) return "doing"; // 지연도 doing
  return "todo";
}
const isOverdue = (i: ChecklistItem) =>
  !i.completed && i.due_date != null && i.due_date < today; // DOING 내 "지연" 강조
```
> `today` = `getTodayDateString()` (dateUtils, 로컬 타임존). 날짜는 `yyyy-MM-dd` 문자열 비교.

### 5.4 드래그 → 실제 mutation
| 동작 | 호출 | 결과 |
|------|------|------|
| 카드 TODO→DOING | `onPatchChecklist(t,i,{start_date: 오늘})` | 즉시 DOING |
| 카드 DOING→TODO | `onPatchChecklist(t,i,{start_date: null})` | TODO 복귀 |
| 카드 →DONE | `onToggleChecklist(t,i)` (미완료→완료) | 완료 체크 |
| 카드 DONE→밖 | `onToggleChecklist(t,i)` (완료→미완료) | 날짜 기준 복귀 |
| 태스크 노드→다른 블록 hub | `onMoveTask(t, blockId)` | `Task.block_id` 변경 |

- 카드 DnD: 마인드맵이 `@dnd-kit` 미사용이듯, 노드 내부 3열 이동은 **커스텀 mouse 이벤트** 또는 경량 클릭 메뉴로 시작(리소스뷰 `PanelDragState` 선례 참고). MVP는 **카드 좌/우 화살표 or 컨텍스트 액션**으로 열 이동 → Phase 3에서 실 DnD.
- 낙관적 업데이트는 상위(KanbanBoardPage) 상태에서 처리, 실패 시 롤백. WebSocket 이벤트(`CHECKLIST_TOGGLED`/`CHECKLIST_UPDATED`/`TASK_MOVED`)가 이미 상태 동기화하므로 재사용.

### 5.5 스타일
제안서 HTML 그대로: 3열 그리드, TODO(slate)/DOING(amber)/DONE(emerald) dot, 날짜 칩(future/active/done), 완료 체크+취소선, 지연 rose 강조. 디자인 토큰 준수(`bg-bridge-obsidian`, `border-foreground/[0.08]`, `Loader2` 스피너, `custom-scrollbar`).

---

## 6. KanbanBoardPage 통합 (`pages/KanbanBoardPage.tsx`)

### 6.1 상위 핸들러 추가
```ts
const handleMiniMoveTask = useCallback((taskId, targetBlockId) => {
  // 기존 카드 이동 로직 재사용: taskAPI.moveTask(boardId, taskId, {target_block_id, position})
}, [...]);
const handlePatchChecklist = useCallback((taskId, itemId, patch) => {
  // checklistAPI.patchItem(boardId, taskId, itemId, patch) + 낙관적 업데이트
}, [...]);
const handleToggleChecklist = useCallback((taskId, itemId) => {
  // checklistAPI.toggleItem(boardId, taskId, itemId) + 낙관적 업데이트
}, [...]);
```
> `handleMiniMoveTask`/toggle은 기존 칸반 카드 이동·체크 로직이 이미 있으면 그대로 위임.

### 6.2 렌더 블록 (mindmap 블록 옆, L3039 패턴)
```tsx
) : viewMode === "minikanban" ? (
  <main className="flex-1 flex flex-col overflow-hidden">
    <Suspense fallback={<Spinner/>}>
      <MiniKanbanView
        boardId={boardId || ""}
        blocks={blocks}
        tasks={tasks}
        checklistByTask={checklistDataMap}
        featureMilestonesMap={featureMilestonesMap}
        canEdit={canEdit}
        memberColorMap={memberColorMap}
        onTaskClick={handleTaskClick}
        onMoveTask={handleMiniMoveTask}
        onPatchChecklist={handlePatchChecklist}
        onToggleChecklist={handleToggleChecklist}
      />
    </Suspense>
  </main>
```
- lazy import 추가(`lazyWithRetry(() => import("../views/MiniKanbanView")...)`).

### 6.3 ViewMode union 동기화 (3곳 — 불일치 = 타입에러)
- `pages/KanbanBoardPage.tsx`: `ViewMode` union(L33-44) + `BOARD_SUB_MODES`(L47-54) + `getBoardSubMode`(L307-316) 반환 타입/분기에 `"minikanban"` 추가.
- `components/BoardSubTabs.tsx`: `ViewMode` union(L4-15) + TABS 배열에 minikanban 탭 추가(아이콘 후보 `LayoutGrid`/`Columns3`, `labelKey: "kanban.viewBoardMiniKanban"`, `isPremium: false`).
- `components/FloatingViewSwitcher.tsx`: `ViewMode` union(L14-25)에 추가(BOARD_VIEWS 목록엔 넣지 않음 — 마인드맵처럼 상단 서브탭에만 노출).

### 6.4 가드 (mindmap과 동일하게 minikanban도 제외)
- MilestoneTabBar/구분선(L2708-2728), FloatingViewSwitcher(L3424-3432)의 `viewMode !== "mindmap"` 옆에 `&& viewMode !== "minikanban"` 추가.
- BoardSubTabs 칸반 active 조건(L92-95)에 `&& viewMode !== "minikanban"` 추가.

### 6.5 i18n
10개 로케일(`i18n/locales/*.json`)의 `kanban.viewBoardMindMap` 옆에 `viewBoardMiniKanban` 추가. `minikanban.*`(TODO/DOING/DONE 라벨, 빈 상태 등)는 ko/en 우선 + `t()` 인라인 fallback.

---

## 7. 재사용 API 매핑 (신규 백엔드 로직 없음)

| 기능 | 엔드포인트 | 프론트 |
|------|-----------|--------|
| 레이아웃 조회/저장 | `GET/PUT /boards/{id}/mini-kanban` | `miniKanbanAPI` (신규) |
| 체크리스트 날짜 patch | `PATCH /boards/{id}/tasks/{tid}/checklist/{iid}` | `checklistAPI.patchItem` |
| 체크리스트 완료 토글 | `PATCH .../checklist/{iid}/toggle` | `checklistAPI.toggleItem` |
| 태스크 블록 이동 | `PUT /boards/{id}/tasks/{tid}/move` | `taskAPI.moveTask` |
| 초기 체크리스트 데이터 | (이미 로드됨) | `checklistDataMap` |

---

## 8. 불변식 / 주의사항

1. **노드 data엔 참조 id만** — task/checklist/block 실데이터는 context 라이브 주입(autosave 폭주 방지).
2. **파생물 저장 금지** — 블록→태스크 엣지, 3열 카드는 저장 문서에서 제외.
3. **TODO/DOING은 저장값 아님** — 오늘 날짜로 매 렌더 계산(시간 경과 시 새로고침만으로 이동).
4. **orphan prune** — 로드 시 삭제된 block_id/task_id 노드 정리.
5. **ViewMode union 3곳 동기화** 필수.
6. **React Hooks 규칙** — 모든 hook은 early return 위(큰 노드 컴포넌트 주의).
7. **타임존** — 날짜 비교는 `getTodayDateString()`/`yyyy-MM-dd` 문자열, UTC 저장 원칙 유지.
8. **autosave** — `serialize` JSON diff로 변경 시에만 1s 디바운스 PUT, 언마운트 flush(마인드맵 동일).

---

## 9. Phase 로드맵

| Phase | 내용 | 산출물 |
|-------|------|--------|
| **1** | BE 클론(entity~controller) + 마이그레이션 · FE 캔버스 골격(블록 hub + 태스크 노드 방사, 좌표 저장) · start_date 파싱 수정 · ViewMode 3곳/탭/가드/렌더/i18n 결선 | 읽기 전용 뷰 동작 |
| **2** | 날짜 파생 3열(`resolveColumn`) + 지연 강조 + 진행률/담당자/마일스톤 칩 | 이미지 #4 완성도 |
| **3** | 열 간 드래그 편집(`patchItem`/`toggle`) + 낙관적 업데이트 + WS 동기화 | 카드 상호작용 |
| **4** | 태스크 노드→블록 이동(`moveTask`) + 블록 접기/펼치기 + 담당자/마일스톤 필터 | 완성 |

---

## 10. 검증

- FE: `cd frontend && npm run build` (타입체크 — ViewMode union 3곳 일치 확인)
- BE: `cd backend && ./gradlew build --no-daemon`
- 수동: 로컬(H2)에서 보드 → 미니 칸반 탭 → 태스크 노드 3열 표시, 날짜 넘긴 항목 DOING 이동, DONE 드롭 시 실칸반에도 완료 반영, 태스크 다른 블록 이동 시 칸반/미니칸반 동기화.

---

## 11. 신규/수정 파일 체크리스트

**신규 (BE 6)**: `BoardMiniKanban.java` · `BoardMiniKanbanRepository.java` · `dto/MiniKanbanRequest.java` · `dto/MiniKanbanResponse.java` · `service/MiniKanbanService.java` · `controller/MiniKanbanController.java` · 마이그레이션 1
**신규 (FE 1)**: `views/MiniKanbanView.tsx`
**수정 (FE)**: `utils/api.ts`(miniKanbanAPI) · `types/index.ts`(MiniKanban* 타입) · `hooks/useBoardDataLoader.ts`(start_date/done_date 파싱) · `pages/KanbanBoardPage.tsx`(union/import/render/핸들러/가드) · `components/BoardSubTabs.tsx` · `components/FloatingViewSwitcher.tsx` · `i18n/locales/*.json`(10개)
