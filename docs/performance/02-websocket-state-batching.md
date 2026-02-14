# WebSocket 상태 배칭 최적화 계획

> 현재: 이벤트당 최대 4회 setState → 목표: 2회 이하 + 불필요 API 콜 제거

---

## 1. 현재 아키텍처

### 1.1 이벤트 플로우

```
STOMP Broker
    ↓
/topic/board/{boardId}         ← 보드 브로드캐스트 (Feature, Task, Block, Checklist, Schedule, Meeting)
/topic/board/{boardId}/user/{userId}  ← 개인 알림 (Notification)
/topic/user/{userId}           ← 글로벌 (INQUIRY_REPLIED)
    ↓
useBoardWebSocket Hook
    ├─ JSON 파싱
    ├─ 자기 이벤트 필터링 (user_id === currentUser.id → skip)
    └─ onEvent 콜백 호출
    ↓
handleWebSocketEvent (KanbanBoardPage lines 423-603)
    ├─ switch (event.type) — 30+ 이벤트 타입
    └─ 1~4회 setState 호출
    ↓
React 리렌더
    ├─ KanbanBlock × N개 (tasks, checklistDataMap 변경 시)
    ├─ DailyScheduleView (scheduleRefreshKey 변경 시 → API 재호출)
    ├─ TaskDetailModal (wsCommentEvent, wsChecklistEvent 변경 시)
    └─ 기타 하위 컴포넌트
```

### 1.2 이벤트별 상태 업데이트 맵

| 이벤트 타입 | setState 횟수 | 대상 State | 문제 |
|---|---|---|---|
| FEATURE_CREATED | 2 | features, allFeatures | 동일 데이터 이중 저장 |
| FEATURE_UPDATED | 2 | features, allFeatures | 동일 데이터 이중 저장 |
| FEATURE_DELETED | 3 | features, allFeatures, tasks | tasks 필터링 필요 |
| TASK_CREATED | 2 | tasks, features (카운트) | 적정 |
| TASK_UPDATED | 1 | tasks | 적정 |
| TASK_DELETED | 2 | tasks, features (카운트) | 적정 |
| TASK_MOVED | 2 | tasks, features (카운트) | 적정 |
| BLOCK_CREATED/UPDATED/DELETED | 1 | blocks | 적정 |
| **CHECKLIST_CREATED** | **4** | checklistDataMap, tasks, scheduleRefreshKey, wsChecklistEvent | **과도** |
| **CHECKLIST_UPDATED** | **3** | checklistDataMap, scheduleRefreshKey, wsChecklistEvent | **과도** |
| **CHECKLIST_DELETED** | **4** | checklistDataMap, tasks, scheduleRefreshKey, wsChecklistEvent | **과도** |
| **CHECKLIST_TOGGLED** | **4** | checklistDataMap, tasks, scheduleRefreshKey, wsChecklistEvent | **과도** |
| COMMENT_* | 1 | wsCommentEvent | 적정 |
| SCHEDULE_* | 1 | scheduleRefreshKey | 적정 |
| MEETING_* | 1 | meetingRefreshKey | 적정 |
| MEMBER_UPDATED | 1 | boardMembersData | 적정 |

---

## 2. 핵심 문제 분석

### 2.1 체크리스트 이벤트 캐스케이딩

**가장 심각한 병목**: 체크리스트 이벤트 하나에 4회 setState + 불필요 API 콜

```
CHECKLIST_TOGGLED 이벤트 수신
  ↓
T+0ms  setChecklistDataMap(...)     → TaskDetailModal 리렌더
T+1ms  setTasks(prev.map(...))      → KanbanBlock 전체 리렌더
T+2ms  setScheduleRefreshKey(+1)    → DailyScheduleView useEffect 트리거
T+3ms  setWsChecklistEvent(event)   → TaskDetailModal 다시 리렌더
  ↓
T+50ms DailyScheduleView → API 호출 (전체 스케줄 블록 재조회)
```

**문제점**:
- `setScheduleRefreshKey`가 DailyScheduleView에서 **전체 스케줄 데이터 API 재호출** 유발
- 체크리스트 완료/해제는 스케줄 구조 변경이 아님 → API 콜 불필요
- 5개 체크리스트 연속 토글 시: **20회 setState + 5회 API 호출** 발생

### 2.2 features / allFeatures 이중 관리

```typescript
// FEATURE_CREATED 핸들러 (line 430-431)
setFeatures(prev => prev.some(f => f.id === feature.id) ? prev : [...prev, feature]);
setAllFeatures(prev => prev.some(f => f.id === feature.id) ? prev : [...prev, feature]);
```

- `features`: 현재 마일스톤 필터 적용된 목록
- `allFeatures`: 전체 Feature (마일스톤 모달에서 사용)
- 두 배열이 거의 동일한 데이터 → 매번 2회 업데이트

### 2.3 Refresh Key 패턴의 한계

```typescript
// 현재 패턴
setScheduleRefreshKey(prev => prev + 1);

// DailyScheduleView에서
useEffect(() => {
  fetchScheduleData(); // 전체 데이터 API 재호출
}, [refreshTrigger]);
```

- "무엇이 변경되었는지" 정보 없이 전체 리페치
- 체크리스트 변경, 스케줄 변경, Task 변경 모두 동일하게 전체 리페치
- 변경된 항목만 업데이트하는 것이 불가능

---

## 3. 최적화 방안

### 3.1 Optimization A: 체크리스트 이벤트 배칭 (HIGH 우선순위)

**목표**: 이벤트당 4회 → 2회 setState, scheduleRefreshKey 제거

**현재 코드** (lines 506-542):
```typescript
case 'CHECKLIST_CREATED': {
  setChecklistDataMap(prev => ({...}));        // 업데이트 1
  setTasks(prev => prev.map(...));              // 업데이트 2
  setScheduleRefreshKey(prev => prev + 1);      // 업데이트 3 ← 제거 대상
  setWsChecklistEvent(event);                   // 업데이트 4
  break;
}
```

**수정 후**:
```typescript
case 'CHECKLIST_CREATED':
case 'CHECKLIST_UPDATED':
case 'CHECKLIST_DELETED':
case 'CHECKLIST_TOGGLED': {
  // 1) checklistDataMap 업데이트 (이벤트 타입별 분기)
  setChecklistDataMap(prev => {
    const newMap = { ...prev };
    switch (event.type) {
      case 'CHECKLIST_CREATED':
        newMap[taskId] = [...(prev[taskId] || []), item];
        break;
      case 'CHECKLIST_UPDATED':
      case 'CHECKLIST_TOGGLED':
        newMap[taskId] = prev[taskId]?.map(i => i.id === item.id ? item : i) || [];
        break;
      case 'CHECKLIST_DELETED':
        newMap[taskId] = prev[taskId]?.filter(i => i.id !== item.id) || [];
        break;
    }
    return newMap;
  });

  // 2) tasks 카운트 업데이트 (필요한 경우만)
  if (event.type === 'CHECKLIST_CREATED' || event.type === 'CHECKLIST_DELETED' || event.type === 'CHECKLIST_TOGGLED') {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, /* 카운트 조정 */ } : t));
  }

  // 3) TaskDetailModal에 이벤트 전달
  setWsChecklistEvent(event);

  // ❌ setScheduleRefreshKey 제거
  // DailyScheduleView는 wsChecklistEvent를 직접 구독하도록 변경
  break;
}
```

**효과**:
- 이벤트당 4회 → 2~3회 setState
- DailyScheduleView 불필요 API 호출 제거
- 5개 연속 토글: 20회 → 10~15회 (50% 감소)

**예상 시간**: 30분 | **리스크**: Low

---

### 3.2 Optimization B: 스마트 스케줄 리프레시 (HIGH 우선순위)

**목표**: 전체 리페치 → 이벤트 기반 선택적 업데이트

**새로운 이벤트 기반 패턴**:
```typescript
// KanbanBoardPage
type ScheduleChangeEvent = {
  eventType: 'checklist' | 'schedule' | 'task' | 'meeting';
  taskId?: string;
  scheduleId?: string;
  action: 'created' | 'updated' | 'deleted';
  data: any;
};

const [scheduleChangeEvent, setScheduleChangeEvent] = useState<ScheduleChangeEvent | null>(null);

// WebSocket 핸들러에서
case 'CHECKLIST_TOGGLED':
  setScheduleChangeEvent({
    eventType: 'checklist',
    taskId: data.task_id,
    action: 'updated',
    data: data.item,
  });
  break;

case 'SCHEDULE_CREATED':
  setScheduleChangeEvent({
    eventType: 'schedule',
    action: 'created',
    data: data,
  });
  break;
```

```typescript
// DailyScheduleView에서
useEffect(() => {
  if (!scheduleChangeEvent) return;

  if (scheduleChangeEvent.eventType === 'checklist') {
    // 체크리스트 변경 → 로컬 UI만 업데이트 (API 호출 없음)
    setScheduleBlocks(prev => prev.map(block =>
      block.checklist_item_id === scheduleChangeEvent.data.id
        ? { ...block, is_completed: scheduleChangeEvent.data.is_completed }
        : block
    ));
  } else {
    // 스케줄/미팅 변경 → 실제 API 리페치
    fetchScheduleData();
  }
}, [scheduleChangeEvent]);
```

**효과**:
- 체크리스트 이벤트 시 API 호출 100% 제거
- 스케줄/미팅 이벤트만 리페치 (필요한 경우)
- 체감 응답속도: 300-500ms → 50ms 이하

**예상 시간**: 2시간 | **리스크**: Medium (DailyScheduleView 컴포넌트 수정 필요)

---

### 3.3 Optimization C: KanbanBlock 메모이제이션 (MEDIUM 우선순위)

**목표**: 무관한 상태 변경 시 KanbanBlock 리렌더 방지

**현재 문제** (lines 2626-2670):
```tsx
{sortedBlocks.map(block => (
  <KanbanBlock
    tasks={getTasksForBlock(block.id).map(task => ({
      ...task,
      onClick: () => handleTaskClick(task),  // ← 매 렌더마다 새 함수 생성
    }))}
  />
))}
```

**수정**:
```tsx
// 1) blockTasksMap 캐시
const blockTasksMap = useMemo(() => {
  const map: Record<string, Task[]> = {};
  sortedBlocks.forEach(block => {
    map[block.id] = getTasksForBlock(block.id);
  });
  return map;
}, [filteredTasks, sortedBlocks]);

// 2) onClick을 KanbanBlock 내부에서 처리
<MemoizedKanbanBlock
  tasks={blockTasksMap[block.id]}  // 안정적 참조
  onTaskClick={handleTaskClick}     // useCallback으로 안정적
/>

// 3) React.memo 적용
const MemoizedKanbanBlock = React.memo(KanbanBlock);
```

**효과**: Feature 업데이트 시 해당 Feature의 Block만 리렌더 (현재는 전체 Block 리렌더)

**예상 시간**: 1시간 | **리스크**: Low

---

### 3.4 Optimization D: useReducer 전환 (LONG-TERM)

**목표**: 73+ setState → 단일 dispatch로 상태 관리 일원화

```typescript
type BoardState = {
  board: Board | null;
  blocks: Block[];
  features: Feature[];
  allFeatures: Feature[];
  tasks: Task[];
  checklistDataMap: Record<string, ChecklistItem[]>;
  boardMembersData: ShareBoardMember[];
  // ...
};

type BoardAction =
  | { type: 'LOAD_DATA'; payload: BoardFullData }
  | { type: 'WS_EVENT'; payload: BoardWebSocketEvent }
  | { type: 'UPDATE_FILTER'; payload: FilterOptions }
  // ...

function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'WS_EVENT': {
      const event = action.payload;
      switch (event.type) {
        case 'CHECKLIST_TOGGLED':
          return {
            ...state,
            checklistDataMap: { /* 업데이트 */ },
            tasks: state.tasks.map(/* 카운트 조정 */),
            wsChecklistEvent: event,
          };  // ← 단일 상태 전이, 1회 리렌더
      }
    }
  }
}
```

**장점**:
- WebSocket 이벤트 → 단일 dispatch → 1회 리렌더 (현재 최대 4회)
- 상태 전이 로직 테스트 가능
- 디버깅 용이 (action 로그)
- undo/redo 기반 준비

**단점**:
- 73+ setState 전부 리팩토링 필요
- 리듀서 파일이 거대해질 수 있음

**예상 시간**: 8-10시간 | **리스크**: High

---

## 4. 성능 임팩트 시뮬레이션

### Before (현재)

```
시나리오: 체크리스트 5개 연속 토글 (2초 내)

이벤트     setState 횟수    API 호출    컴포넌트 리렌더
─────────────────────────────────────────────────────
Toggle 1     4              1          KanbanBlock×N + DailyScheduleView + TaskDetailModal
Toggle 2     4              1          (동일)
Toggle 3     4              1          (동일)
Toggle 4     4              1          (동일)
Toggle 5     4              1          (동일)
─────────────────────────────────────────────────────
합계         20             5          15+ 컴포넌트 리렌더 사이클
예상 지연    ~300-500ms (DailyScheduleView API 대기 포함)
```

### After (Optimization A + B + C 적용 후)

```
이벤트     setState 횟수    API 호출    컴포넌트 리렌더
─────────────────────────────────────────────────────
Toggle 1     2              0          TaskDetailModal + 해당 KanbanBlock 1개
Toggle 2     2              0          (동일)
Toggle 3     2              0          (동일)
Toggle 4     2              0          (동일)
Toggle 5     2              0          (동일)
─────────────────────────────────────────────────────
합계         10             0          5 컴포넌트 리렌더 사이클
예상 지연    ~50ms 이하
```

**개선율**:
- setState 호출: 20 → 10 (**50% 감소**)
- API 호출: 5 → 0 (**100% 제거**)
- 컴포넌트 리렌더: 15+ → 5 (**67% 감소**)
- 체감 지연: 300-500ms → 50ms (**80-90% 개선**)

---

## 5. 구현 로드맵

| Phase | 작업 | 시간 | 리스크 | 기대 효과 |
|-------|------|------|--------|-----------|
| **1 (즉시)** | A: 체크리스트 이벤트 배칭 | 30min | Low | setState 50% 감소 |
| **1 (즉시)** | C: KanbanBlock 메모이제이션 | 1h | Low | 리렌더 67% 감소 |
| **2 (1주 내)** | B: 스마트 스케줄 리프레시 | 2h | Medium | API 호출 100% 제거 |
| **3 (장기)** | D: useReducer 전환 | 8-10h | High | 아키텍처 개선 |

### Phase 1 예상 결과
- 총 작업 시간: 1.5시간
- 체크리스트 이벤트 성능 **80% 개선**
- Breaking change 없음

### Phase 2 예상 결과
- DailyScheduleView props 변경 필요
- 스케줄 뷰 응답속도 **5-10배 개선**

---

## 6. 호환성 체크리스트

| 최적화 | Breaking Change | 영향 범위 | 대응 |
|--------|----------------|-----------|------|
| A: 배칭 | ❌ None | KanbanBoardPage만 | 내부 리팩토링 |
| B: 스마트 리프레시 | ⚠️ DailyScheduleView props | DailyScheduleView | refreshTrigger → scheduleChangeEvent로 전환 |
| C: 메모이제이션 | ❌ None | KanbanBlock | React.memo 추가만 |
| D: useReducer | ⚠️ 전체 상태 관리 | KanbanBoardPage + 하위 전체 | 전면 리팩토링 필요 |
