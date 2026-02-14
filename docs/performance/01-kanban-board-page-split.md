# KanbanBoardPage 컴포넌트 분할 계획

> 현재 3,057줄 모놀리스 → 목표 ~1,600줄 (8개 모듈 분리)

---

## 1. 현재 구조 분석

### 1.1 State 선언 (31개 useState)

| 그룹 | 개수 | 변수 | 라인 |
|------|------|------|------|
| **Board 코어 데이터** | 12 | board, blocks, features, allFeatures, tasks, tags, inviteLinks, subscription, activities, activityCursor, hasMoreActivity, milestones | 134-146 |
| **체크리스트/스케줄** | 3 | checklistDataMap, scheduledTaskIds, expandedChecklistTaskIds | 149-151 |
| **티어/빌링** | 8 | tierInfo, boardLimits, isUpgradeModalOpen, upgradeTrigger, seatPurchaseModal, aiCredits, showCreditModal, creditModalMode | 154-170 |
| **모달 상태** | 15 | selectedFeature, selectedTask, isFeatureModalOpen, isTaskModalOpen, isAddBlockModalOpen, isAddFeatureModalOpen, isShareBoardModalOpen, isSubscriptionModalOpen, isPremiumBenefitsModalOpen, isInquiryModalOpen, isMilestoneModalOpen, selectedMilestone, isMilestoneOnboardingOpen 등 | 188-220 |
| **알림/WebSocket** | 4 | unreadNotificationCount, unreadInquiryCount, wsCommentEvent, wsChecklistEvent | 202-208 |
| **필터/뷰** | 4 | viewMode, filterOptions, selectedFeatureIds, kanbanSelectedMilestoneId | 93-220 |
| **기타 UI** | 4 | isLoading, alertModal, isEditingBoardName, editingBoardName | 129-226 |

### 1.2 useEffect (10개)

| 라인 | 목적 | 의존성 |
|------|------|--------|
| 94-98 | BE 커밋 해시 조회 | `[]` |
| 120-126 | URL 쿼리 파라미터 소비 | `[searchParams]` |
| **233-345** | **메인 보드 데이터 로드 (6+ API 호출)** | `[boardId, navigate]` |
| 348-354 | AI 크레딧 조회 | `[boardId]` |
| 357-364 | 크레딧 소진 이벤트 리스너 | `[]` |
| 373-388 | 결제 후 좌석 구매 처리 | `[boardId, isLoading]` |
| 391-411 | ShareBoard 모달 오픈 시 멤버 갱신 | `[isShareBoardModalOpen, boardId]` |
| 414-420 | 선택 마일스톤 동기화 | `[board?.selected_milestone_id]` |
| 616-628 | WebSocket 재연결 시 데이터 리페치 | `[connectionStatus, boardId]` |
| 631-698 | 알림 폴링/WS 구독 + 문의 구독 | `[boardId, currentUser]` |

### 1.3 핸들러 함수 (28+ useCallback)

| 도메인 | 개수 | 주요 함수 |
|--------|------|-----------|
| Block 관리 | 4 | handleAddBlock, handleDeleteBlock, handleMoveBlock, handleMoveBlockDrag |
| Feature 관리 | 5 | handleAddFeature, handleFeatureClick, handleToggleFeatureChip, handleUpdateFeature, handleDeleteFeature |
| Task 관리 | 7 | handleAddSubtask, handleTaskClick, handleUpdateTask, handleDeleteTask, handleMoveTask, handleMoveTaskToFeature, handleReorderTask |
| Member 관리 | 5 | handleAddMember, handleUpdateMemberRole, handleUpdateMemberColor, handleRemoveMember, handleReorderMembers |
| Milestone 관리 | 4 | handleOpenMilestoneWithCheck, handleOpenMilestoneModal, handleSaveMilestone, handleDeleteMilestone |
| WebSocket | 1 | **handleWebSocketEvent** (180줄 switch문) |
| 기타 | 6 | handleSaveBoardName, handleViewModeChange, handleSeatUpgrade, handleCreateTag, handleLoadMoreActivity 등 |

### 1.4 JSX 섹션

| 섹션 | 라인 | 줄 수 |
|------|------|-------|
| Header 네비게이션 | 1918-2172 | ~260줄 |
| 뷰 서브탭 바 | 2175-2229 | ~55줄 |
| 칸반 뷰 (검색+필터 툴바) | 2284-2611 | **~330줄** |
| 칸반 뷰 (Feature 칩 + Block 그리드) | 2613-2680 | ~70줄 |
| Schedule/Weekly/Meeting/Notes/Stats/AI 뷰 전환 | 2232-2770 | ~540줄 |
| 모바일 하단 탭바 | 2776-2864 | ~90줄 |
| 모달 13개 | 2867-3046 | ~180줄 |

---

## 2. 분할 계획

### 개요

```
KanbanBoardPage.tsx (3,057줄)
  ↓ 분할 후
KanbanBoardPage.tsx (~1,600줄) — 오케스트레이터 역할
  ├── hooks/useBoardDataLoader.ts     (-110줄) — API 데이터 로딩
  ├── hooks/useBoardFilters.ts        (-65줄)  — 필터/정렬 로직
  ├── hooks/useBoardPermissions.ts    (-30줄)  — 권한 체크
  ├── hooks/useWebSocketManager.ts    (-90줄)  — WS 연결/재연결
  ├── components/KanbanBoardHeader.tsx    (-260줄) — 헤더 UI
  ├── components/KanbanFilterToolbar.tsx  (-330줄) — 검색+필터 UI
  ├── components/KanbanViewContent.tsx    (-400줄) — 칸반 보드 렌더링
  └── components/BoardModalManager.tsx    (-180줄) — 모달 13개
                                      ─────────
                                      -1,465줄 감소
```

### 2.1 커스텀 Hook 추출 (Phase 1 — Low Risk)

#### `useBoardDataLoader` (lines 233-345)

```typescript
// hooks/useBoardDataLoader.ts
interface BoardFullData {
  board: Board;
  blocks: Block[];
  features: Feature[];
  allFeatures: Feature[];
  tasks: Task[];
  tags: Tag[];
  inviteLinks: InviteLink[];
  subscription: Subscription | null;
  activities: ActivityLog[];
  milestones: Milestone[];
  tierInfo: BoardTierInfo | null;
  boardLimits: BoardLimits | null;
  checklistDataMap: Record<string, ChecklistItem[]>;
  scheduledTaskIds: Set<string>;
  boardMembersData: ShareBoardMember[];
}

export function useBoardDataLoader(
  boardId: string | undefined,
  selectedMilestoneId: string
): {
  data: BoardFullData | null;
  isLoading: boolean;
  reload: () => void;
}
```

**이동 대상**: 메인 데이터 로딩 useEffect + 관련 API 호출 로직

#### `useBoardFilters` (lines 1831-1895)

```typescript
// hooks/useBoardFilters.ts
export function useBoardFilters(
  features: Feature[],
  tasks: Task[],
  filterOptions: FilterOptions,
  checklistDataMap: Record<string, ChecklistItem[]>
): {
  filteredFeatures: Feature[];
  filteredTasks: Task[];
  getTasksForBlock: (blockId: string) => Task[];
}
```

**이동 대상**: filteredFeatures, filteredTasks useMemo + getTasksForBlock 함수

#### `useBoardPermissions` (lines 725-756)

```typescript
// hooks/useBoardPermissions.ts
export function useBoardPermissions(
  tierInfo: BoardTierInfo | null,
  boardMembersData: ShareBoardMember[],
  currentUser: User | null,
  board: Board | null
): {
  canAccessSchedule: boolean;
  canAccessMilestone: boolean;
  canAccessStatistics: boolean;
  currentUserRole?: MemberRole;
  isViewer: boolean;
  isOwner: boolean;
  canEdit: boolean;
}
```

#### `useWebSocketManager` (lines 608-698)

```typescript
// hooks/useWebSocketManager.ts
export function useWebSocketManager(
  boardId: string | undefined,
  currentUser: User | null,
  tierInfo: BoardTierInfo | null
): {
  connectionStatus: string;
  onlineUsers: string[];
  unreadNotificationCount: number;
}
```

**이동 대상**: WS 재연결 useEffect, 알림 폴링, 문의 구독 로직

### 2.2 컴포넌트 추출 (Phase 2 — Medium Risk)

#### `KanbanBoardHeader` (lines 1918-2172)

헤더 영역 전체: 보드 이름, 뷰 모드 탭, 마일스톤 선택, 멤버 아바타, 알림, 설정 버튼

```typescript
interface KanbanBoardHeaderProps {
  board: Board | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  milestones: Milestone[];
  kanbanSelectedMilestoneId: string;
  onMilestoneSelect: (id: string) => void;
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  unreadNotificationCount: number;
  // ... 15+ props
}
```

#### `KanbanFilterToolbar` (lines 2284-2611)

검색바 + 5개 필터 Popover (멤버, Feature, 태그, 상태, 완료) + 체크리스트 확장/축소

```typescript
interface KanbanFilterToolbarProps {
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  features: Feature[];
  tags: Tag[];
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  // 확장/축소 상태
  expandedChecklistTaskIds: Set<string>;
  onToggleAllChecklists: (expanded: boolean) => void;
}
```

#### `BoardModalManager` (lines 2867-3046)

13개 모달을 props만 받아 렌더링하는 순수 프레젠테이션 컴포넌트

```typescript
// 모달 상태는 KanbanBoardPage에 유지
// BoardModalManager는 열린 모달만 렌더링
interface BoardModalManagerProps {
  // Feature/Task 모달
  selectedFeature: Feature | null;
  isFeatureModalOpen: boolean;
  onCloseFeature: () => void;
  // ... 13개 모달의 open/close + 콜백
}
```

### 2.3 칸반 뷰 추출 (Phase 3 — High Risk)

#### `KanbanViewContent` (lines 2277-2682)

```typescript
interface KanbanViewContentProps {
  features: Feature[];
  filteredTasks: Task[];
  sortedBlocks: Block[];
  // 핸들러
  onTaskClick: (task: Task) => void;
  onMoveTask: (taskId: string, blockId: string, position: number) => void;
  onReorderTask: (taskId: string, blockId: string, position: number) => void;
  // 체크리스트
  checklistDataMap: Record<string, ChecklistItem[]>;
  expandedChecklistTaskIds: Set<string>;
  // 기타
  memberColorMap: Record<string, string | null>;
  scheduledTaskIds: Set<string>;
}
```

**핵심**: `React.memo()`로 감싸서 무관한 상태 변경 시 리렌더 방지

---

## 3. State 의존성 그래프

```
boardId (URL)
  └→ useBoardDataLoader
       ├→ board, blocks, features, tasks, tags, milestones
       ├→ boardMembersData → memberColorMap (useMemo)
       ├→ checklistDataMap
       └→ scheduledTaskIds

features + tasks + filterOptions + checklistDataMap
  └→ useBoardFilters
       ├→ filteredFeatures
       ├→ filteredTasks
       └→ getTasksForBlock()

tierInfo + boardMembersData + currentUser
  └→ useBoardPermissions
       └→ canEdit, isAdminOrOwner, canAccessSchedule ...

handleWebSocketEvent (유지 — 분할 안 함)
  ├→ setFeatures, setAllFeatures
  ├→ setTasks
  ├→ setBlocks
  ├→ setChecklistDataMap
  ├→ setScheduleRefreshKey
  └→ setWsChecklistEvent, setWsCommentEvent
```

---

## 4. 분할 후 KanbanBoardPage 구조

```tsx
export function KanbanBoardPage() {
  // ===== Hooks =====
  const { data, isLoading, reload } = useBoardDataLoader(boardId, milestoneId);
  const permissions = useBoardPermissions(tierInfo, members, currentUser, board);
  const { filteredFeatures, filteredTasks } = useBoardFilters(features, tasks, filterOptions, checklistDataMap);
  const wsManager = useWebSocketManager(boardId, currentUser, tierInfo);
  const boardWs = useBoardWebSocket({ boardId, onEvent: handleWebSocketEvent });

  // ===== 모달/UI State (여기 유지) =====
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  // ... (모달 open/close 상태들)

  // ===== 핸들러 (여기 유지) =====
  const handleWebSocketEvent = useCallback(...);
  const handleUpdateTask = useCallback(...);
  // ...

  // ===== Render =====
  return (
    <DragProvider>
      <KanbanBoardHeader {...headerProps} />

      {viewMode === 'kanban' && (
        <>
          <KanbanFilterToolbar {...filterProps} />
          <KanbanViewContent {...contentProps} />
        </>
      )}
      {viewMode === 'schedule' && (
        <Suspense fallback={<Spinner />}>
          <DailyScheduleView {...} />
        </Suspense>
      )}
      {/* ... 다른 뷰 모드 */}

      <BoardModalManager {...modalProps} />
    </DragProvider>
  );
}
```

---

## 5. 리스크 & 대응

| 리스크 | 설명 | 대응 |
|--------|------|------|
| **WebSocket 이벤트 분배** | handleWebSocketEvent가 7+ state 업데이트 → 분할 시 props 전달 복잡 | handleWebSocketEvent는 메인에 유지, 분할 안 함 |
| **모달 상태 폭발** | 13개 모달 상호의존 (마일스톤 저장 → Feature 리로드) | 모달 state는 메인에 유지, BoardModalManager는 순수 렌더링만 |
| **필터 stale 데이터** | checklistDataMap 갱신 전 필터 실행 시 불일치 | useBoardFilters의 deps에 checklistDataMap 포함하여 자동 재계산 |
| **KanbanViewContent 메모이제이션** | React.memo의 shallow compare가 tasks 배열 참조 변경 감지 못 함 | blockTasksMap useMemo로 안정적 참조 생성 후 전달 |

---

## 6. 구현 로드맵

| Phase | 작업 | 예상 시간 | 리스크 |
|-------|------|-----------|--------|
| **1** | useBoardDataLoader 추출 | 1-2h | Low |
| **1** | useBoardFilters 추출 | 1h | Low |
| **1** | useBoardPermissions 추출 | 30min | Low |
| **1** | useWebSocketManager 추출 | 1h | Low |
| **2** | KanbanBoardHeader 추출 | 2h | Medium |
| **2** | KanbanFilterToolbar 추출 | 2h | Medium |
| **2** | BoardModalManager 추출 | 1h | Low |
| **3** | KanbanViewContent 추출 + React.memo | 3h | High |
| **4** | 통합 테스트 & 프로파일링 | 2h | — |
| | **합계** | **~15-18h** | |
