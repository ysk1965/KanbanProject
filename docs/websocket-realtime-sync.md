# WebSocket 실시간 동기화 구현 리뷰

## 개요

칸반 보드에 WebSocket(STOMP) 기반 실시간 동기화를 추가하여, 같은 보드를 보고 있는 팀원들이 새로고침 없이 변경사항을 즉시 확인할 수 있도록 합니다.

### 핵심 변경
- **백엔드**: Spring WebSocket + STOMP 인프라 구축, 6개 서비스에 24개 이벤트 전송 추가
- **프론트엔드**: STOMP 클라이언트 + 보드 구독 훅, KanbanBoardPage 실시간 상태 반영
- **Tier 기반 활성화**: PREMIUM/TRIAL만 실시간, STANDARD는 기존 동작 유지

---

## 아키텍처

```
[사용자 A] ──→ REST API ──→ Backend Service
                              ├── 1. DB 저장 (기존 로직 그대로)
                              └── 2. WebSocketEventService.sendBoardEvent()
                                      └── SimpMessagingTemplate
                                           └── /topic/board/{boardId}
                                                    ↓ STOMP 메시지
                                     [사용자 B, C, D...] (같은 보드 구독 중)
                                     → useBoardWebSocket 훅
                                     → handleWebSocketEvent
                                     → React state 업데이트
                                     → UI 즉시 반영
```

### 설계 원칙

| 원칙 | 설명 |
|------|------|
| **낙관적 업데이트 유지** | 본인 액션은 기존처럼 즉시 UI 반영, WS 이벤트는 스킵 |
| **Self-event 필터링** | `event.user_id === currentUser.id` → 본인 이벤트 무시 |
| **실패 안전** | WS 이벤트 전송 실패해도 비즈니스 로직에 영향 없음 (try-catch) |
| **기존 기능 무영향** | REST API 동작은 완전 동일, WS는 추가 레이어 |
| **Tier 기반 제어** | STANDARD는 WS 연결 안 함, PREMIUM/TRIAL만 실시간 |

---

## Tier별 기능 차이

실시간 동기화는 **PREMIUM / TRIAL 보드 전용** 기능입니다.
STANDARD 보드는 기존과 완전히 동일하게 동작합니다.

### 사용자 체감 비교

| 기능 | STANDARD (기존 동작) | PREMIUM / TRIAL (실시간) |
|------|---------------------|------------------------|
| **카드 이동** (다른 팀원) | 새로고침해야 보임 | 즉시 반영 |
| **태스크 생성/수정/삭제** | 새로고침해야 보임 | 즉시 반영 |
| **Feature 생성/수정/삭제** | 새로고침해야 보임 | 즉시 반영 |
| **블록 추가/이동/삭제** | 새로고침해야 보임 | 즉시 반영 |
| **진행률 변경** | 새로고침해야 보임 | 즉시 반영 |
| **댓글 작성/수정/삭제** | 수동 새로고침 버튼 | 자동 갱신 |
| **이모지 리액션** | 수동 새로고침 버튼 | 즉시 반영 |
| **체크리스트 변경** | 새로고침해야 보임 | 즉시 반영 |
| **알림 뱃지** | 30초 폴링 | 즉시 반영 |
| **온라인 사용자 표시** | 불가 | 가능 (UI 추가 시) |
| **WebSocket 연결** | 연결 안 함 | 연결 |
| **추가 서버 비용** | $0 | 미미 |

### 구현 방식

프론트엔드 `KanbanBoardPage.tsx`에서 Tier 기반으로 분기합니다:

```typescript
// PREMIUM/TRIAL만 실시간 WebSocket 활성화, STANDARD는 기존 폴링 유지
const isRealtimeEnabled = tierInfo?.tier !== 'STANDARD';

// WebSocket 훅 - STANDARD면 연결 자체를 안 함
const { connectionStatus, onlineUsers } = useBoardWebSocket({
  boardId: boardId || null,
  onEvent: handleWebSocketEvent,
  enabled: isRealtimeEnabled,
});

// 알림: PREMIUM은 WebSocket으로 실시간, STANDARD는 30초 폴링 유지
useEffect(() => {
  fetchUnreadCount();          // 초기 로드는 공통
  if (!isRealtimeEnabled) {
    const interval = setInterval(fetchUnreadCount, 30000);  // STANDARD만 폴링
    return () => clearInterval(interval);
  }
}, [boardId, currentUser, isRealtimeEnabled]);
```

### 백엔드 Tier 체크 (2중 방어)

프론트엔드에서 `enabled: false`로 연결을 안 하지만, 브라우저 콘솔 등으로 직접 STOMP 연결을 시도하는 경우를 대비하여 **백엔드에서도 SUBSCRIBE 시점에 Tier를 체크**합니다.

```
STOMP CONNECT  → JWT 인증 (기존)
STOMP SUBSCRIBE /topic/board/{boardId}  → Board Tier 체크 (추가)
  └── STANDARD → MessageDeliveryException 발생, 구독 차단
  └── PREMIUM/TRIAL → 구독 허용
```

`WebSocketAuthInterceptor`에서 SUBSCRIBE 커맨드를 가로채고, destination에서 boardId를 추출하여 `board.isStandard()`를 확인합니다. STANDARD면 구독을 거부합니다.

**구독 거부 = 서비스 차단이 아닙니다.** 영향 범위는 실시간 이벤트 수신에만 한정됩니다:

```
CONNECT  → JWT 유효하면 성공 ✅
SUBSCRIBE /topic/board/{boardId} → STANDARD면 거부 ❌
                                 → 실시간 이벤트만 못 받음

REST API → 항상 정상 동작 ✅
         → 카드 이동, 댓글 작성, 태스크 생성 등 모든 기능 사용 가능
         → 다만 다른 팀원의 변경사항은 새로고침해야 보임
```

즉 STANDARD 사용자는 기존과 완전히 동일하게 서비스를 이용하며, "실시간 반영"만 안 되는 것입니다.

이벤트 발행(sendBoardEvent) 자체는 Tier와 무관하게 항상 동작합니다. 구독자가 0명이면 SimpleBroker가 메시지를 즉시 폐기하므로 비용은 0이고, 6개 서비스에 Tier 조회 로직을 넣는 것보다 구독 시점에서 한 번 차단하는 것이 깔끔합니다.

### 전체 활성화 전환

모든 Tier에 실시간을 열고 싶을 때는 한 줄만 변경:

```typescript
const isRealtimeEnabled = true;  // 전 Tier 실시간 활성화
```

---

## 변경 파일 목록

### Backend - 신규 파일 (5개)

#### 1. `global/config/WebSocketConfig.java`
- STOMP 메시지 브로커 설정
- SimpleBroker: `/topic`, `/queue` 구독 prefix
- App destination prefix: `/app`
- 엔드포인트: `/ws` (SockJS fallback 포함)
- CORS 설정: 프로덕션/개발 도메인 허용
- `WebSocketAuthInterceptor`를 inbound channel에 등록

#### 2. `global/security/WebSocketAuthInterceptor.java`
- `ChannelInterceptor` 구현, 2단계 검증:
  - **CONNECT**: JWT 토큰 추출 (`Authorization: Bearer {token}` → `token` 헤더) → `UserPrincipal` 생성
  - **SUBSCRIBE**: destination에서 boardId 추출 → `board.isStandard()` 체크 → STANDARD면 구독 차단
- 인증 실패 시 연결 거부, STANDARD 구독 시 `MessageDeliveryException`

#### 3. `global/websocket/dto/BoardEventType.java`
- 30개 이벤트 타입 enum

```java
// Feature (4)
FEATURE_CREATED, FEATURE_UPDATED, FEATURE_DELETED, FEATURES_REORDERED

// Task (4)
TASK_CREATED, TASK_UPDATED, TASK_DELETED, TASK_MOVED

// Block (4)
BLOCK_CREATED, BLOCK_UPDATED, BLOCK_DELETED, BLOCKS_REORDERED

// Comment (4)
COMMENT_CREATED, COMMENT_UPDATED, COMMENT_DELETED, COMMENT_REACTION_TOGGLED

// Checklist (4)
CHECKLIST_CREATED, CHECKLIST_UPDATED, CHECKLIST_DELETED, CHECKLIST_TOGGLED

// Board/Member (4)
BOARD_UPDATED, MEMBER_JOINED, MEMBER_LEFT, MEMBER_UPDATED

// Notification (1)
NOTIFICATION_CREATED

// Presence (2)
PRESENCE_JOINED, PRESENCE_LEFT
```

#### 4. `global/websocket/dto/WebSocketEvent.java`
- Java record (불변 DTO)

```java
public record WebSocketEvent(
    BoardEventType type,
    String boardId,
    String userId,
    String userName,
    LocalDateTime timestamp,  // UTC
    Object data               // 각 서비스의 기존 Response DTO 재사용
)
```

#### 5. `global/websocket/WebSocketEventService.java`
- `SimpMessagingTemplate` 주입
- 두 가지 전송 메서드:

```java
// 보드 전체 브로드캐스트 (Feature, Task, Block, Comment, Checklist)
sendBoardEvent(boardId, type, userId, userName, data)
  → /topic/board/{boardId}

// 특정 사용자에게만 (Notification)
sendUserEvent(boardId, userId, type, data)
  → /topic/board/{boardId}/user/{userId}
```

---

### Backend - 수정 파일 (8개)

#### 6. `build.gradle`
```groovy
implementation 'org.springframework.boot:spring-boot-starter-websocket'
```

#### 7. `global/config/SecurityConfig.java`
```java
.requestMatchers("/ws/**").permitAll()  // WebSocket 핸드셰이크 허용
```
> WS 인증은 SecurityConfig이 아닌 WebSocketAuthInterceptor에서 STOMP 레벨로 처리

#### 8~13. 서비스 레이어 (6개 파일)

각 서비스에 `WebSocketEventService` 주입 후 기존 메서드 끝에 이벤트 전송 추가:

| 서비스 | 이벤트 | 전송 방식 | data 내용 |
|--------|--------|-----------|-----------|
| **FeatureService** | FEATURE_CREATED | broadcast | FeatureResponse (전체) |
| | FEATURE_UPDATED | broadcast | FeatureResponse (전체) |
| | FEATURE_DELETED | broadcast | `{ id: featureId }` |
| | FEATURES_REORDERED | broadcast | List<FeatureResponse> |
| **TaskService** | TASK_CREATED | broadcast | TaskResponse (전체) |
| | TASK_UPDATED | broadcast | TaskResponse (전체) |
| | TASK_DELETED | broadcast | `{ id: taskId }` |
| | TASK_MOVED | broadcast | TaskResponse (이동 후) |
| **BlockService** | BLOCK_CREATED | broadcast | BlockResponse (전체) |
| | BLOCK_UPDATED | broadcast | BlockResponse (전체) |
| | BLOCK_DELETED | broadcast | `{ id: blockId }` |
| | BLOCKS_REORDERED | broadcast | List<BlockResponse> |
| **CommentService** | COMMENT_CREATED | broadcast | CommentResponse (전체) |
| | COMMENT_UPDATED | broadcast | CommentResponse (전체) |
| | COMMENT_DELETED | broadcast | `{ id: commentId }` |
| | COMMENT_REACTION_TOGGLED | broadcast | ReactionResponse |
| **ChecklistService** | CHECKLIST_CREATED | broadcast | ChecklistItemResponse |
| | CHECKLIST_UPDATED | broadcast | ChecklistItemResponse |
| | CHECKLIST_DELETED | broadcast | `{ id: itemId }` |
| | CHECKLIST_TOGGLED | broadcast | ChecklistItemResponse |
| **NotificationService** | NOTIFICATION_CREATED | **user 전용** | NotificationResponse |

> NotificationService만 `sendUserEvent()` 사용 (수신자 개인에게만 전달)

---

### Frontend - 신규 파일 (2개)

#### 14. `utils/websocket.ts`
- `WebSocketManager` 싱글톤 클래스
- STOMP URL 자동 생성: `VITE_API_BASE_URL`에서 `/api/v1` 제거 + http→ws 변환
- JWT 인증: STOMP CONNECT 헤더에 `Authorization: Bearer {token}` 전달
- 자동 재연결: 5초 간격
- 연결 상태 관리: `connecting | connected | disconnected | error`
- 개발 환경에서만 디버그 로그 출력

#### 15. `hooks/useBoardWebSocket.ts`
- `useBoardWebSocket({ boardId, onEvent, enabled })` 훅
- 구독 토픽:
  - `/topic/board/{boardId}` — 보드 전체 이벤트
  - `/topic/board/{boardId}/user/{userId}` — 개인 이벤트 (알림)
- Self-event 필터링: 보드 이벤트에서 `event.user_id === currentUser.id` → 스킵
- 개인 이벤트는 항상 처리 (알림은 본인에게 온 것이므로)
- Presence 트래킹: PRESENCE_JOINED/LEFT → `onlineUsers: Set<string>`
- 반환값: `{ connectionStatus, onlineUsers }`
- 클린업: unmount 시 구독 해제 + disconnect

---

### Frontend - 수정 파일 (4개)

#### 16. `types/index.ts`
```typescript
// +28줄 추가
export type BoardEventType =
  | 'FEATURE_CREATED' | 'FEATURE_UPDATED' | 'FEATURE_DELETED' | 'FEATURES_REORDERED'
  | 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_DELETED' | 'TASK_MOVED'
  | 'BLOCK_CREATED' | 'BLOCK_UPDATED' | 'BLOCK_DELETED' | 'BLOCKS_REORDERED'
  | 'COMMENT_CREATED' | 'COMMENT_UPDATED' | 'COMMENT_DELETED' | 'COMMENT_REACTION_TOGGLED'
  | 'CHECKLIST_CREATED' | 'CHECKLIST_UPDATED' | 'CHECKLIST_DELETED' | 'CHECKLIST_TOGGLED'
  | 'BOARD_UPDATED'
  | 'MEMBER_JOINED' | 'MEMBER_LEFT' | 'MEMBER_UPDATED'
  | 'NOTIFICATION_CREATED'
  | 'PRESENCE_JOINED' | 'PRESENCE_LEFT';

export interface BoardWebSocketEvent {
  type: BoardEventType;
  board_id: string;   // snake_case (Jackson SNAKE_CASE 전략)
  user_id: string;
  user_name: string;
  timestamp: string;
  data: unknown;
}
```

#### 17. `pages/KanbanBoardPage.tsx`
- import 추가: `useCallback`, `BoardWebSocketEvent`, `useBoardWebSocket`
- 상태 추가: `wsCommentRefreshKey`
- **`handleWebSocketEvent` 콜백** (핵심 로직):

```
FEATURE_CREATED  → setFeatures([...prev, feature]) + setAllFeatures
FEATURE_UPDATED  → setFeatures(map replace) + setAllFeatures
FEATURE_DELETED  → setFeatures(filter) + setAllFeatures + setTasks(filter)

TASK_CREATED     → setTasks([...prev, task]) + Feature total_tasks +1
TASK_UPDATED     → setTasks(map replace)
TASK_DELETED     → setTasks(filter) + Feature total/completed 감소 + progress 재계산
TASK_MOVED       → setTasks(map replace) + Done 블록 이동 시 Feature completed 조정

BLOCK_CREATED    → setBlocks([...prev, block])
BLOCK_UPDATED    → setBlocks(map replace)
BLOCK_DELETED    → setBlocks(filter)
BLOCKS_REORDERED → setBlocks(전체 교체)

COMMENT_*        → setWsCommentRefreshKey +1 (CommentPanel 자동 갱신)
NOTIFICATION_*   → setUnreadNotificationCount +1 (뱃지 즉시 반영)
```

- **Tier 분기**: `isRealtimeEnabled = tierInfo?.tier !== 'STANDARD'`
- `useBoardWebSocket` 훅 호출 (`enabled: isRealtimeEnabled`)
- **PREMIUM/TRIAL**: 30초 폴링 제거, WebSocket으로 실시간 알림
- **STANDARD**: 기존 30초 폴링 유지, WebSocket 연결 안 함
- `wsCommentRefreshKey`를 TaskDetailModal에 prop으로 전달

#### 18. `components/TaskDetailModal.tsx`
- props에 `wsCommentRefreshKey?: number` 추가
- CommentPanel에 `wsRefreshTrigger={wsCommentRefreshKey}` 전달

#### 19. `components/CommentPanel.tsx`
- props에 `wsRefreshTrigger?: number` 추가
- useEffect 추가: `wsRefreshTrigger` 변경 시 `loadComments(false)` 호출 (스피너 없이 조용한 갱신)

---

## 데이터 흐름 예시

### 시나리오: 사용자 B가 태스크를 Done 블록으로 이동

```
1. [사용자 B] 카드 드래그 → handleMoveTask() → 낙관적 UI 업데이트
2. [사용자 B] → POST /api/v1/boards/{id}/tasks/{id}/move → TaskService.moveTask()
3. [Backend]  DB 업데이트 + Feature 카운트 갱신 + webSocketEventService.sendBoardEvent(
                boardId, TASK_MOVED, userId, userName, { task, feature: { id, total_tasks, completed_tasks, progress_percentage } })
4. [Backend]  SimpMessagingTemplate → /topic/board/{boardId} 브로드캐스트
5. [사용자 A] STOMP 메시지 수신 → useBoardWebSocket → onEvent 콜백
6. [사용자 A] event.user_id !== currentUser.id → 필터링 통과
7. [사용자 A] handleWebSocketEvent → case 'TASK_MOVED':
             → setTasks(map replace) + setFeatures(서버 계산값으로 교체, 산술 연산 없음)
8. [사용자 A] UI 자동 반영 (카드가 Done 블록으로 이동, 진행률 변경)
9. [사용자 B] event.user_id === currentUser.id → 본인 이벤트 스킵 (이미 낙관적 반영됨)
```

### 시나리오: 사용자 A가 댓글 작성 → 사용자 B의 태스크 모달에 실시간 표시

```
1. [사용자 A] 댓글 작성 → CommentPanel → commentAPI.createComment()
2. [Backend]  CommentService.createComment() → DB 저장
             + sendBoardEvent(COMMENT_CREATED, CommentResponse.Detail)
             + NotificationService → sendUserEvent(NOTIFICATION_CREATED) to 사용자 B
3. [사용자 B - 보드 이벤트] COMMENT_CREATED 수신
             → KanbanBoardPage: setWsCommentEvent(event)
             → TaskDetailModal: wsCommentEvent prop 전달
             → CommentPanel: task_id 필터링 후 직접 상태 업데이트
             → setComments([...prev, newComment]) (REST 재호출 없음)
4. [사용자 B - 개인 이벤트] NOTIFICATION_CREATED 수신
             → setUnreadNotificationCount +1
             → 알림 뱃지 숫자 증가
```

---

## 비용 영향 분석

### PREMIUM / TRIAL 보드 (실시간 활성화)

| 항목 | Before | After | 차이 |
|------|--------|-------|------|
| 알림 폴링 | 유저당 2,880회/일 API 호출 | 0회 (WS 이벤트) | **-2,880회/일** |
| WebSocket 연결 | 없음 | 유저당 1개 STOMP 연결 | +1 커넥션 |
| 메시지 브로커 | 없음 | SimpleBroker (인메모리) | **$0 추가** |
| ALB 비용 | - | LCU 미미한 증가 | ~$1-2/월 |
| **순 비용** | | | **$0 ~ -$5/월 (절감)** |

### STANDARD 보드 (기존 동작)

| 항목 | Before | After | 차이 |
|------|--------|-------|------|
| 알림 폴링 | 30초 간격 | 30초 간격 (동일) | 0 |
| WebSocket 연결 | 없음 | 없음 (연결 안 함) | 0 |
| **순 비용** | | | **$0 (변동 없음)** |

### 인프라

- **local/dev**: SimpleBroker 사용 → 추가 인프라 $0
- **prod**: 단일 인스턴스라면 SimpleBroker로 충분. 다중 인스턴스 시 기존 Redis(ElastiCache)를 Pub/Sub 브로커로 전환 가능
- STANDARD 보드는 WebSocket을 사용하지 않으므로 Tier 구성 비율에 따라 실제 WS 커넥션 수가 제한됨

---

## 검토 포인트

### 안전성
- [ ] WS 이벤트 전송 실패가 비즈니스 로직에 영향을 주지 않는가? → `try-catch`로 감싸짐
- [ ] Self-event 필터링이 정확한가? → `useBoardWebSocket`에서 `user_id` 비교
- [ ] 인증되지 않은 WS 연결이 차단되는가? → `WebSocketAuthInterceptor`에서 JWT 검증
- [ ] WS 연결 끊김 시 기존 기능이 정상 동작하는가? → REST API는 독립적으로 동작

### 상태 일관성
- [ ] TASK_CREATED 시 Feature.total_tasks가 정확히 +1 되는가?
- [ ] TASK_DELETED 시 completed 여부에 따라 Feature 카운트가 정확히 감소하는가?
- [ ] TASK_MOVED로 Done 블록 이동 시 Feature.completed_tasks가 정확히 반영되는가?
- [ ] 중복 이벤트 수신 시 데이터가 깨지지 않는가? → `prev.some(f => f.id === id)` 중복 방지

### 미구현 사항 (추후 확장)
- [ ] 온라인 사용자 표시 UI (onlineUsers 데이터는 훅에서 제공 중)
- [ ] Checklist 이벤트의 checklistDataMap 직접 반영 (현재는 미처리)
- [ ] MEMBER_JOINED/LEFT/UPDATED 이벤트 핸들링
- [ ] BOARD_UPDATED 이벤트 핸들링
- [ ] Prod 다중 인스턴스 시 Redis Pub/Sub 브로커 전환
- [ ] WebSocket 연결 상태 UI 표시 (connectionStatus 데이터는 훅에서 제공 중)

---

## 후속 수정 사항 (3건)

초기 구현 이후 발견된 3가지 이슈를 수정했습니다.

### 1. 재연결 시 데이터 갭 복구

**문제**: WebSocket 연결이 끊겼다 재연결될 때, 끊겨 있던 동안의 이벤트가 누락됨.

**해결**: `KanbanBoardPage`에 `hasConnectedBefore` ref를 추가하여 재연결 감지 시 Features, Tasks, Blocks, 알림 카운트를 silent refetch.

```typescript
// KanbanBoardPage.tsx
const hasConnectedBefore = useRef(false);
useEffect(() => {
  if (connectionStatus === 'connected') {
    if (hasConnectedBefore.current && boardId) {
      reloadFeaturesAndTasks(milestoneId);
      blockService.getBlocks(boardId).then(setBlocks).catch(() => {});
      notificationAPI.getUnreadCount(boardId)
        .then(res => setUnreadNotificationCount(res.unread_count))
        .catch(() => {});
    }
    hasConnectedBefore.current = true;
  }
}, [connectionStatus, boardId]);
```

### 2. 댓글 이벤트 이중 호출 제거

**문제**: WS로 `CommentResponse.Detail` 전체 데이터를 받아놓고도, `wsCommentRefreshKey`를 +1하여 `loadComments(false)` REST 재호출을 트리거함. 데이터를 두 번 가져오는 낭비.

**해결**: `wsCommentEvent` (BoardWebSocketEvent 객체)를 직접 CommentPanel까지 전달하고, CommentPanel에서 타입별 직접 상태 업데이트:

| 이벤트 | 처리 | REST 호출 |
|--------|------|-----------|
| COMMENT_CREATED | `setComments([...prev, newComment])` + task_id 필터 | 없음 |
| COMMENT_UPDATED | `setComments(prev.map(c => c.id === id ? updated : c))` | 없음 |
| COMMENT_DELETED | `setComments(prev.filter(c => c.id !== id))` | 없음 |
| COMMENT_REACTION_TOGGLED | `setComments(prev.map(c => c.id === id ? updated : c))` | 없음 |

**prop 체인**: `KanbanBoardPage.wsCommentEvent` → `TaskDetailModal.wsCommentEvent` → `CommentPanel.wsCommentEvent`

### 3. SUBSCRIBE 시 DB 쿼리 캐싱

**문제**: `WebSocketAuthInterceptor.handleSubscribe()`에서 매 SUBSCRIBE마다 `boardRepository.findById(boardId)`를 호출하여 DB 부하 발생.

**해결**: `ConcurrentHashMap<String, TierCacheEntry>` 기반 5분 TTL 인메모리 캐시 추가.

```java
// WebSocketAuthInterceptor.java
private record TierCacheEntry(boolean isStandard, long cachedAt) {
    boolean isExpired() {
        return System.currentTimeMillis() - cachedAt > 5 * 60 * 1000L;
    }
}

private boolean isBoardStandard(String boardId) {
    TierCacheEntry cached = tierCache.get(boardId);
    if (cached != null && !cached.isExpired()) return cached.isStandard();
    boolean isStandard = boardRepository.findById(boardId)
            .map(Board::isStandard).orElse(false);
    tierCache.put(boardId, new TierCacheEntry(isStandard, System.currentTimeMillis()));
    return isStandard;
}
```

**참고**: 보드 Tier가 변경되면 최대 5분간 이전 Tier 캐시가 유지됨. Tier 변경은 드문 이벤트이므로 허용 가능한 수준.

### 4. Task 이벤트에 서버 계산 Feature 카운트 포함

**문제**: TASK_CREATED/DELETED/MOVED 이벤트 수신 시 프론트엔드가 `total_tasks`, `completed_tasks`, `progress_percentage`를 **직접 산술 연산**으로 계산. 백엔드 로직과 미묘하게 다르거나, 동시 조작/이벤트 순서 역전 시 일관성 깨짐 가능.

**해결**: 백엔드 TaskService에서 Feature 카운트 업데이트 후, 서버가 계산한 Feature 요약을 이벤트 데이터에 포함.

```java
// TaskService.java - 모든 Task 이벤트에 Feature 요약 포함
private Map<String, Object> buildFeatureSummary(Feature feature) {
    return Map.of(
        "id", feature.getId(),
        "total_tasks", feature.getTotalTasks(),
        "completed_tasks", feature.getCompletedTasks(),
        "progress_percentage", feature.getProgressPercentage()
    );
}

// TASK_CREATED: Map.of("task", response, "feature", buildFeatureSummary(feature))
// TASK_DELETED: Map.of("id", taskId, "feature", buildFeatureSummary(feature))
// TASK_MOVED:   Map.of("task", response, "feature", buildFeatureSummary(task.getFeature()))
```

프론트엔드에서는 산술 연산을 모두 제거하고 서버 값으로 교체:

```typescript
// Before (위험: 프론트 산술 → 백엔드와 불일치 가능)
setFeatures(prev => prev.map(f => f.id === task.feature_id
  ? { ...f, total_tasks: f.total_tasks + 1 } : f));

// After (안전: 서버 계산값 그대로 사용)
const { task, feature } = data as { task: Task; feature: {...} };
setFeatures(prev => prev.map(f => f.id === feature.id ? { ...f, ...feature } : f));
```

**변경 이벤트 포맷:**

| 이벤트 | Before | After |
|--------|--------|-------|
| TASK_CREATED | `TaskResponse.Detail` | `{ task: TaskResponse.Detail, feature: { id, total_tasks, completed_tasks, progress_percentage } }` |
| TASK_DELETED | `{ id }` | `{ id, feature: { id, total_tasks, completed_tasks, progress_percentage } }` |
| TASK_MOVED | `TaskResponse.Detail` | `{ task: TaskResponse.Detail, feature: { id, total_tasks, completed_tasks, progress_percentage } }` |

---

## 빌드 검증

```
Frontend: npm run build      → SUCCESS
Backend:  ./gradlew build    → SUCCESS
```
