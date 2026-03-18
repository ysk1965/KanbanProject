# WebSocket Redis Pub/Sub 전환 계획

> BRIDGE 프로덕션 환경에서 SimpleBroker → Redis Pub/Sub 전환을 위한 기술 문서

## 인프라 현황 (2026-03-16 확인)

### ElastiCache 상태

- **실제 AWS**: ElastiCache Redis cache.t4g.micro **동작 중** (kanban-dev-redis-001)
- **Terraform**: dev/main.tf에서 ElastiCache 모듈 **주석 처리됨** (Drift 상태)
- **⚠️ 주의**: `terraform plan` 실행 시 ElastiCache 삭제를 시도할 수 있음
- **조치 필요**: 주석 해제 또는 `terraform import` 실행

### Phase 1 상태: **부분 완료**

| 항목 | 상태 | 비고 |
|------|------|------|
| ElastiCache Replication Group | ❌ 미완료 | 단일 클러스터 노드로 동작 중 (Replication Group 아님) |
| ALB Sticky Session | ✅ 완료 | lb_cookie, 3600초 (Terraform EB 모듈에 설정됨) |
| CACHE_TYPE=redis | ✅ 완료 | Terraform EB 모듈에서 조건부 주입 |
| WS_BROKER_TYPE=redis | ❌ 미완료 | Terraform EB 모듈에서 **미주입** — WebSocket이 SimpleBroker로 동작 중일 가능성 |

### 현재 위험

현재 EB가 1 instance로 동작 중이므로 SimpleBroker로도 정상 동작합니다. 하지만 Auto Scaling으로 2+ instances가 되면 WebSocket 실시간 동기화가 즉시 실패합니다. Phase 2~5 전환은 사용자 증가 전에 완료해야 합니다.

---

## 1. 현재 아키텍처 (As-Is)

### 구성

```
┌─────────────────────────────────────────────────────┐
│                    ALB (Public)                      │
│              Round-Robin, No Sticky                  │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
     ┌─────▼─────┐     ┌─────▼─────┐
     │  EB Inst A │     │  EB Inst B │
     │            │     │            │
     │ SimpleBrkr │     │ SimpleBrkr │    ← 각 인스턴스 독립된 메모리 브로커
     │ (in-mem)   │     │ (in-mem)   │
     │            │     │            │
     │ /ws-collab │     │ /ws-collab │    ← 노트 협업도 인스턴스 로컬
     │ (in-mem)   │     │ (in-mem)   │
     └────────────┘     └────────────┘
```

### 문제점

| 문제 | 설명 | 영향 |
|------|------|------|
| **메시지 격리** | SimpleBroker는 JVM 메모리 내 구독자에게만 전달. Inst A의 이벤트가 Inst B 클라이언트에 도달 불가 | 실시간 동기화 실패 (칸반, 체크리스트, 일정 등 40개 이벤트 타입 전체) |
| **Sticky Session 미설정** | ALB가 Round-Robin으로 분배. WebSocket 업그레이드 후에도 후속 요청이 다른 인스턴스로 갈 수 있음 | STOMP 세션 유실 가능 |
| **노트 협업 격리** | NoteCollabHandler가 인스턴스 로컬 메모리에 room 관리. 같은 노트를 편집해도 다른 인스턴스면 동기화 안 됨 | Yjs CRDT 충돌, 커서 안 보임 |
| **프레즌스 분리** | PRESENCE_JOINED/LEFT가 인스턴스 로컬. 온라인 유저 목록이 인스턴스별로 다름 | 유저가 오프라인으로 표시 |

### 현재 작동하는 이유

프로덕션에서 EB min=2지만, 트래픽이 낮아 대부분 같은 인스턴스에 연결되는 상황. 사용자가 늘어나거나 스케일링이 발생하면 즉시 문제가 드러남.

---

## 2. 목표 아키텍처 (To-Be)

### 구성

```
┌─────────────────────────────────────────────────────┐
│                    ALB (Public)                      │
│          Sticky Session (lb_cookie, 1~2h)             │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
     ┌─────▼─────┐     ┌─────▼─────┐
     │  EB Inst A │     │  EB Inst B │
     │            │     │            │
     │ StompRelay │◄───►│ StompRelay │    ← 외부 브로커 릴레이
     │            │     │            │
     │ /ws-collab │     │ /ws-collab │    ← Redis Pub/Sub으로 room 동기화
     │  (Redis)   │     │  (Redis)   │
     └─────┬──────┘     └──────┬─────┘
           │                   │
           └───────┬───────────┘
                   │
          ┌────────▼────────┐
          │  ElastiCache     │
          │  Redis 7.0       │
          │                  │
          │  Pub/Sub 채널:        │
          │  ws:board:{id}        │
          │  ws:user:{id}         │
          │  ws-collab:{noteId}   │
          │                  │
          │  Primary+Replica │
          │  Multi-AZ        │
          └──────────────────┘
```

### 메시지 흐름 (전환 후)

```
1. Client A → STOMP /app/board/123 → Inst A
2. Inst A → 비즈니스 로직 처리 → WebSocketEventService.sendBoardEvent()
3. SimpMessagingTemplate → /topic/board/123 → Redis Pub/Sub 채널
4. Redis → Inst A, Inst B 모두에게 메시지 브로드캐스트
5. Inst A → 로컬 구독자 (Client A, C) 에게 전달
6. Inst B → 로컬 구독자 (Client B, D) 에게 전달
```

---

## 3. 변경 범위

### 3-1. 방안 선택

#### 방안 A: Redis Pub/Sub 직접 구현 (권장)

SimpleBroker를 유지하면서, `WebSocketEventService` → Redis Pub/Sub → 각 인스턴스의 `SimpMessagingTemplate`으로 릴레이하는 커스텀 레이어.

**장점**: 추가 인프라 없이 기존 Redis 활용, SimpleBroker 유지로 기존 코드 변경 최소화
**단점**: 커스텀 코드 유지보수 필요

#### 방안 B: 외부 메시지 브로커 도입 (RabbitMQ)

Spring의 `StompBrokerRelay` + RabbitMQ STOMP Plugin 사용. `StompBrokerRelay`는 내부적으로 RabbitMQ/ActiveMQ의 STOMP 프로토콜을 사용하며, **Redis는 네이티브 STOMP를 지원하지 않으므로 이 방식에 사용 불가**.

```java
// 참고: 이 코드는 방안 B(RabbitMQ)에만 해당. Redis에서는 작동하지 않음.
config.enableStompBrokerRelay("/topic", "/queue")
      .setRelayHost(rabbitMqHost)    // RabbitMQ 필요
      .setRelayPort(61613);          // STOMP 포트
```

**장점**: Spring 공식 지원, 검증된 패턴
**단점**: RabbitMQ 인프라 추가 필요 (비용 + 운영 복잡도 증가)

#### 방안 비교

| 항목 | A: Redis Pub/Sub | B: RabbitMQ |
|------|-------------------|-------------|
| 추가 인프라 | 없음 (기존 Redis 활용) | RabbitMQ 클러스터 필요 |
| 월 비용 증가 | $0 (Redis 업그레이드만) | +$50~100 (AmazonMQ) |
| 코드 변경량 | 중간 (Bridge 클래스 + Config) | 적음 (Config만) |
| 메시지 보장 | At-most-once (Redis Pub/Sub) | At-least-once (ACK 가능) |
| 메시지 영속성 | 없음 (fire-and-forget) | 큐 영속화 가능 |
| Spring 공식 지원 | 비공식 (커스텀) | 공식 (`StompBrokerRelay`) |
| BRIDGE 적합성 | **높음** — 실시간 UI 동기화는 유실 허용 가능 | 과잉 — 메시지 큐 기능 불필요 |

> **권장: 방안 A**. BRIDGE의 WebSocket 용도는 UI 실시간 동기화이며, 메시지 유실 시 다음 API 호출이나 페이지 새로고침으로 복구됨. At-most-once 시맨틱으로 충분.

---

### 3-2. Backend 코드 변경 (방안 A 상세)

#### 인스턴스 ID 관리

EB 인스턴스는 오토스케일링/배포로 교체될 수 있으므로, 앱 시작 시 UUID를 생성하여 인스턴스를 식별한다.

```java
@Component
public class InstanceIdHolder {

    private final String instanceId = UUID.randomUUID().toString();

    public String getInstanceId() {
        return instanceId;
    }
}
```

> EB 인스턴스가 교체되면 새 UUID가 발급됨. Redis Pub/Sub의 자기 메시지 필터링은 "현재 살아있는 인스턴스의 메시지를 건너뛰는 것"이 목적이므로, 영속적 ID는 불필요. 앱 재시작 = 새 ID로 충분.

#### Redis Pub/Sub 채널 전략

```
AS-IS (초기안):
  단일 채널 ws:broadcast → 모든 메시지가 모든 인스턴스에 도달 → 로컬 필터링

TO-BE (보드별 채널):
  ws:board:{boardId}           → 해당 보드 이벤트만 구독하는 인스턴스에 전달
  ws:user:{userId}             → 유저별 알림/글로벌 이벤트
  ws-collab:{noteId}           → 노트 협업 바이너리 메시지
```

**보드별 채널을 채택하는 이유:**

단일 채널(`ws:broadcast`)은 모든 인스턴스가 모든 보드의 메시지를 수신하고 로컬에서 라우팅해야 한다. 현재 규모에선 문제없지만, 활성 보드가 수백 개로 늘면 불필요한 메시지 처리량이 인스턴스 수 × 보드 수에 비례하여 증가한다.

보드별 채널(`ws:board:{boardId}`)은 해당 보드에 구독자가 있는 인스턴스만 메시지를 수신하므로 확장성이 높다.

**트레이드오프: Redis 구독 관리 복잡도 증가**

- 클라이언트가 보드에 접속하면 해당 인스턴스가 `ws:board:{boardId}` 채널을 `SUBSCRIBE`
- 해당 보드의 마지막 클라이언트가 나가면 `UNSUBSCRIBE`
- 인스턴스별 구독 채널 수를 추적하는 reference counting 필요

```java
@Service
@RequiredArgsConstructor
public class RedisWebSocketBridge {

    private final SimpMessagingTemplate messagingTemplate;
    private final StringRedisTemplate redisTemplate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ObjectMapper objectMapper;
    private final InstanceIdHolder instanceIdHolder;

    // 보드별 구독 reference count: boardId → 로컬 구독자 수
    private final ConcurrentHashMap<String, AtomicInteger> boardSubscriptions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, MessageListener> activeListeners = new ConcurrentHashMap<>();

    /**
     * 보드 이벤트 발행: ws:board:{boardId} 채널에 publish
     */
    public void publishBoardEvent(String boardId, String destination, Object payload) {
        RedisWsMessage msg = new RedisWsMessage(
            instanceIdHolder.getInstanceId(), destination, serialize(payload)
        );
        redisTemplate.convertAndSend("ws:board:" + boardId, serialize(msg));
    }

    /**
     * 유저 이벤트 발행: ws:user:{userId} 채널에 publish
     */
    public void publishUserEvent(String userId, String destination, Object payload) {
        RedisWsMessage msg = new RedisWsMessage(
            instanceIdHolder.getInstanceId(), destination, serialize(payload)
        );
        redisTemplate.convertAndSend("ws:user:" + userId, serialize(msg));
    }

    /**
     * 보드 구독 등록 (클라이언트가 보드 WebSocket 연결 시)
     */
    public void subscribeBoardChannel(String boardId) {
        boardSubscriptions.computeIfAbsent(boardId, k -> new AtomicInteger(0));
        if (boardSubscriptions.get(boardId).incrementAndGet() == 1) {
            // 이 인스턴스에서 첫 구독자 → Redis 채널 구독 시작
            MessageListener listener = (message, pattern) -> {
                RedisWsMessage msg = deserialize(message.getBody());
                if (msg.instanceId().equals(instanceIdHolder.getInstanceId())) return;
                messagingTemplate.convertAndSend(msg.destination(), msg.payload());
            };
            listenerContainer.addMessageListener(listener, new ChannelTopic("ws:board:" + boardId));
            activeListeners.put(boardId, listener);
        }
    }

    /**
     * 보드 구독 해제 (클라이언트가 보드에서 나갈 때)
     */
    public void unsubscribeBoardChannel(String boardId) {
        AtomicInteger count = boardSubscriptions.get(boardId);
        if (count != null && count.decrementAndGet() <= 0) {
            // 이 인스턴스에서 마지막 구독자 → Redis 채널 구독 해제
            MessageListener listener = activeListeners.remove(boardId);
            if (listener != null) {
                listenerContainer.removeMessageListener(listener, new ChannelTopic("ws:board:" + boardId));
            }
            boardSubscriptions.remove(boardId);
        }
    }
}
```

#### WebSocketConfig.java — SimpleBroker 유지

```java
// SimpleBroker는 그대로 유지. 변경 없음.
// Redis Pub/Sub은 WebSocketEventService → RedisWebSocketBridge를 통해 처리.
@Override
public void configureMessageBroker(MessageBrokerRegistry config) {
    config.enableSimpleBroker("/topic", "/queue");
    config.setApplicationDestinationPrefixes("/app");
}
```

#### WebSocketEventService.java — Bridge 분기

```java
@Service
@RequiredArgsConstructor
public class WebSocketEventService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Optional<RedisWebSocketBridge> redisBridge; // prod에서만 주입

    public void sendBoardEvent(String boardId, BoardEventType type,
                               String userId, String userName, Object data) {
        WebSocketEvent event = new WebSocketEvent(type, boardId, userId, userName,
            LocalDateTime.now(ZoneOffset.UTC), data);
        String destination = "/topic/board/" + boardId;

        // 로컬 구독자에게 즉시 전달
        messagingTemplate.convertAndSend(destination, event);

        // Redis Pub/Sub으로 다른 인스턴스에 전파 (prod만)
        redisBridge.ifPresent(bridge -> bridge.publishBoardEvent(boardId, destination, event));
    }

    public void sendUserEvent(String boardId, String userId,
                              BoardEventType type, Object data) {
        WebSocketEvent event = new WebSocketEvent(type, boardId, userId, null,
            LocalDateTime.now(ZoneOffset.UTC), data);
        String destination = "/topic/board/" + boardId + "/user/" + userId;

        messagingTemplate.convertAndSend(destination, event);
        redisBridge.ifPresent(bridge -> bridge.publishUserEvent(userId, destination, event));
    }
}
```

#### NoteCollabHandler.java — 협업 노트 동기화

현재 인스턴스 로컬 `Map<String, Set<WebSocketSession>>`으로 room 관리.

```java
// AS-IS: 로컬 메모리 room
private final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

// TO-BE: Redis Pub/Sub으로 인스턴스 간 릴레이
@RequiredArgsConstructor
public class NoteCollabHandler extends BinaryWebSocketHandler {

    private final RedisTemplate<String, byte[]> redisBinaryTemplate;
    private final InstanceIdHolder instanceIdHolder;
    private final Map<String, Set<WebSocketSession>> localSessions = new ConcurrentHashMap<>();

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        String noteId = extractNoteId(session);
        byte[] payload = message.getPayload().array();

        // 1. 로컬 세션에 전달
        relayToLocalPeers(noteId, session, payload);

        // 2. Redis로 다른 인스턴스에 전파
        redisBinaryTemplate.convertAndSend(
            "ws-collab:" + noteId,
            wrapMessage(instanceIdHolder.getInstanceId(), session.getId(), payload)
        );
    }

    // Redis 수신: 다른 인스턴스에서 온 메시지를 로컬 세션에 전달
    public void onRedisMessage(String noteId, byte[] wrappedPayload) {
        CollabMessage msg = unwrap(wrappedPayload);
        if (msg.instanceId().equals(instanceIdHolder.getInstanceId())) return; // 자기 인스턴스 무시

        localSessions.getOrDefault(noteId, Set.of())
            .forEach(s -> s.sendMessage(new BinaryMessage(msg.payload())));
    }
}
```

### 3-3. 인프라 변경 (Terraform)

#### ElastiCache 마이그레이션 (단일 노드 → Replication Group)

> **중요**: `aws_elasticache_cluster` → `aws_elasticache_replication_group`은 in-place 전환이 불가능하다. Terraform이 기존 리소스를 삭제하고 새로 생성하므로, 아래 절차를 따라야 한다.

**마이그레이션 절차:**

```
1. 새 Replication Group 생성 (기존 클러스터와 병행)
   - 리소스 이름 변경: aws_elasticache_cluster → aws_elasticache_replication_group
   - 새 엔드포인트 발급됨

2. 기존 캐시 데이터 유실 허용 여부 판단
   - 현재 캐시 대상: boards(5분), blocks(30분), members(10분), features(5분)
   - 모두 TTL 기반이므로 유실 허용 가능. DB 조회 일시 증가 후 자동 복구.
   - Pub/Sub은 fire-and-forget이므로 마이그레이션 대상 아님.

3. EB 환경 변수에서 REDIS_HOST를 새 Replication Group의 Primary Endpoint로 교체
   - 기존: aws_elasticache_cluster.redis.cache_nodes[0].address
   - 변경: aws_elasticache_replication_group.redis.primary_endpoint_address

4. Rolling deployment로 EB 인스턴스가 새 Redis 엔드포인트로 연결

5. 기존 aws_elasticache_cluster 리소스 삭제 (terraform state rm 또는 코드에서 제거)
```

**예상 다운타임: 캐시 cold start 약 5~10분** (DB 직접 조회). WebSocket 기능은 이 시점에서 아직 SimpleBroker이므로 영향 없음.

```terraform
# modules/elasticache/main.tf — TO-BE

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis for cache + WebSocket Pub/Sub"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t4g.small"      # micro → small (Pub/Sub 부하 대응)
  num_cache_clusters   = 2                       # Primary + 1 Replica

  multi_az_enabled           = true
  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false             # 성능 우선 (VPC 내부 통신)

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [var.security_group_id]

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-04:00"
  maintenance_window       = "sun:05:00-sun:06:00"

  parameter_group_name = aws_elasticache_parameter_group.redis.name
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.project_name}-${var.environment}-redis-params"
  family = "redis7"

  parameter {
    name  = "notify-keyspace-events"
    value = ""
  }
}

# Output 변경
output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
```

#### ALB Sticky Session 추가

> **Sticky Session 기간: 1~2시간으로 설정.** WebSocket 자체는 한번 연결되면 ALB가 동일 인스턴스로 유지한다 (TCP persistent connection). Sticky Session은 HTTP 요청(API 호출, WebSocket 재연결)에 대한 것으로, Redis Pub/Sub이 인스턴스 간 메시지를 전파하므로 다른 인스턴스에 재연결되어도 정상 동작한다. 24시간으로 설정하면 스케일 다운이나 인스턴스 교체 시 트래픽이 한쪽에 쏠리는 문제가 발생한다.

```terraform
# modules/elastic-beanstalk/main.tf에 추가

setting {
  namespace = "aws:elasticbeanstalk:environment:process:default"
  name      = "StickinessEnabled"
  value     = "true"
}

setting {
  namespace = "aws:elasticbeanstalk:environment:process:default"
  name      = "StickinessType"
  value     = "lb_cookie"
}

setting {
  namespace = "aws:elasticbeanstalk:environment:process:default"
  name      = "StickinessLBCookieDuration"
  value     = "3600"     # 1시간. Redis Pub/Sub이 있으므로 짧아도 무방.
}
```

### 3-3. Gradle 의존성 추가

```gradle
// 이미 있음
implementation 'org.springframework.boot:spring-boot-starter-data-redis'

// 추가 필요 (Redis MessageListener)
// → spring-boot-starter-data-redis에 이미 포함. 별도 추가 불필요.
```

### 3-4. application.yml 프로파일 분기

```yaml
# 기존 유지 (local/dev)
---
spring.config.activate.on-profile: local
app:
  websocket:
    broker-type: simple        # SimpleBroker 유지

# prod 추가
---
spring.config.activate.on-profile: prod
app:
  websocket:
    broker-type: redis         # Redis Pub/Sub
  redis:
    host: ${REDIS_HOST}
    port: ${REDIS_PORT:6379}
```

---

## 4. 마이그레이션 단계

### Phase 1: ElastiCache 마이그레이션 (Day 1-2)

1. 새 `aws_elasticache_replication_group` Terraform 리소스 작성
2. `terraform apply` — 새 Replication Group 생성 (기존 클러스터와 병행)
3. EB 환경 변수 `REDIS_HOST`를 새 Primary Endpoint로 교체
4. Rolling deployment — 새 Redis 연결 확인
5. 기존 `aws_elasticache_cluster` 리소스 삭제
6. 캐시 cold start 모니터링 (5~10분간 DB 부하 증가 예상)

### Phase 2: ALB Sticky Session + InstanceId (Day 3)

1. ALB Sticky Session 활성화 (1시간)
2. `InstanceIdHolder` 컴포넌트 추가
3. 배포 후 Sticky Session 동작 확인

### Phase 3: STOMP 브로커 전환 (Day 4-6)

1. `RedisWebSocketBridge` 구현 (보드별 채널 + reference counting)
2. `WebSocketEventService`에서 Bridge 사용하도록 전환
3. 프로파일별 분기 — `@ConditionalOnProperty` 또는 `Optional<RedisWebSocketBridge>`
4. local 프로파일에서 통합 테스트 (SimpleBroker 단독 동작 확인)
5. Testcontainers Redis로 멀티 인스턴스 시뮬레이션 테스트

### Phase 4: 노트 협업 전환 (Day 7-8)

1. `NoteCollabHandler`에 Redis Pub/Sub 릴레이 추가
2. 바이너리 메시지 직렬화/역직렬화 구현 (instanceId 포함)
3. 멀티 인스턴스 환경에서 Yjs CRDT 동기화 검증

### Phase 5: 프로덕션 배포 + 검증 (Day 9-10)

1. Rolling deployment (50% batch)
2. 모니터링: Redis Pub/Sub 채널 수, 메모리 사용량, 메시지 처리량
3. 멀티 브라우저 테스트 (다른 인스턴스 연결 확인)
4. 체크리스트 토글, 피처 이동, 댓글 작성 실시간 동기화 검증
5. 노트 동시 편집 검증 (커서 표시, CRDT 병합)
6. 스케일링 테스트 (EB 인스턴스 2→4 확장 시 동작 확인)

---

## 5. 트레이드오프 분석

### 5-1. 비용

| 항목 | 현재 | 전환 후 | 차이 |
|------|------|---------|------|
| ElastiCache | t4g.micro × 1 ($12/월) | t4g.small × 2 ($48/월) | **+$36/월** |
| 네트워크 | - | Redis Pub/Sub 트래픽 | 무시 가능 (VPC 내부) |
| 합계 | $12/월 | $48/월 | **+$36/월** |

> RabbitMQ(AmazonMQ) 대비 $50~100/월 절감. 전체 인프라 비용($175~320/월) 대비 약 11~20% 증가.

### 5-2. 성능

| 항목 | 영향 | 설명 |
|------|------|------|
| **메시지 지연** | +1~3ms | Redis 네트워크 hop 추가 (VPC 내부, sub-millisecond ~ 수 ms) |
| **Redis CPU** | 증가 | Pub/Sub 채널당 O(N) 브로드캐스트. 활성 보드 수 × 인스턴스 수 비례 |
| **Redis 메모리** | 미미 | Pub/Sub은 메시지를 저장하지 않음 (fire-and-forget) |
| **EB 인스턴스 CPU** | 소폭 감소 | SimpleBroker의 인메모리 라우팅 오버헤드 제거, 대신 Redis 직렬화 추가 |
| **노트 협업 지연** | +2~5ms | 바이너리 메시지 Redis 경유. Yjs는 CRDT이므로 지연에 내성이 있음 |

> 실시간 UI 동기화 관점에서 1~5ms 추가 지연은 사용자가 인지할 수 없는 수준.

### 5-3. 안정성

| 리스크 | 확률 | 영향 | 완화 방안 |
|--------|------|------|-----------|
| **Redis 장애 시 WS 불능** | 낮음 (Multi-AZ) | 높음 — 실시간 동기화 전면 중단 | Multi-AZ Replica + Failover (자동 30초 이내) |
| **Failover 중 메시지 유실** | 중간 | 낮음 — 유실된 이벤트는 새로고침으로 복구 | 프론트엔드에 reconnect + full state reload 로직 이미 존재 |
| **Redis 메모리 부족** | 매우 낮음 | 높음 — 캐시 + Pub/Sub 모두 영향 | 캐시 TTL 관리 + CloudWatch 메모리 알람 |
| **직렬화 불일치** | 낮음 | 중간 — 특정 이벤트 타입 동기화 실패 | 통합 테스트로 40개 이벤트 타입 전수 검증 |
| **SimpleBroker 폴백 실패** | 낮음 | 중간 — local/dev 환경에서만 | 프로파일 분기로 환경별 독립 동작 보장 |

### 5-4. 운영 복잡도

| 항목 | 변화 |
|------|------|
| **모니터링 포인트** | +3 (Redis Pub/Sub 채널 수, 메시지 처리량, 구독자 수) |
| **장애 디버깅** | 복잡도 증가 — 메시지 미전달 시 "Redis 문제인가, 인스턴스 문제인가" 판별 필요 |
| **배포 주의점** | Rolling 배포 중 구버전/신버전 인스턴스가 공존. Redis 메시지 포맷 하위 호환 필수 |
| **로컬 개발** | 변화 없음 — `simple` 프로파일로 Redis 없이 개발 가능 |
| **테스트** | 통합 테스트 시 Embedded Redis 또는 Testcontainers 필요 |

### 5-5. 메시지 전달 보장 수준

```
SimpleBroker (현재)           Redis Pub/Sub (전환 후)
────────────────────          ────────────────────────
- At-most-once (로컬)         - At-most-once (분산)
- 구독자 없으면 유실           - 구독자 없으면 유실
- 인스턴스 간 전달 불가         - 인스턴스 간 전달 가능
- 순서 보장 (단일 스레드)       - 순서 보장 (Redis 단일 스레드)
```

> BRIDGE의 WebSocket 용도(UI 동기화)에서 at-most-once는 허용 가능.
> 이유: 유실 시 (1) 다음 사용자 액션의 API 응답으로 최신 상태 복구, (2) 페이지 새로고침으로 전체 복구.
> 결제/주문 같은 크리티컬 메시지가 아님.

### 5-6. 전환하지 않을 경우의 리스크

| 시나리오 | 발생 조건 | 결과 |
|----------|-----------|------|
| 동시 편집자 증가 | 같은 보드에 5명+ 접속 | 일부 유저의 변경사항이 다른 유저에게 안 보임 |
| 오토스케일링 발동 | 트래픽 증가로 EB 3~4대 | 실시간 기능 신뢰도 급감 (인스턴스 분산 비율에 비례) |
| 노트 동시 편집 | 2명이 다른 인스턴스에서 편집 | Yjs 동기화 실패, 데이터 분기 (마지막 저장이 승리) |
| 배포 중 | Rolling 배포로 인스턴스 교체 | 기존 WS 세션 끊김 + 새 인스턴스로 재연결 시 상태 불일치 |

---

## 6. 결정이 필요한 사항

| # | 질문 | 권장 |
|---|------|------|
| 1 | 방안 A(Redis Pub/Sub) vs 방안 B(RabbitMQ)? | **A** — 인프라 추가 없이 기존 Redis 활용 |
| 2 | Redis 노드 타입: t4g.small vs r6g.large? | **t4g.small** — 현재 트래픽 규모에 충분. 추후 업그레이드 용이 |
| 3 | Transit Encryption(TLS) 활성화? | **No** — VPC 내부 통신이고 1~2ms 지연 추가됨. 규제 요건 없으면 불필요 |
| 4 | 노트 협업도 동시 전환? | **Yes** — 같은 Redis를 쓰므로 한 번에 전환이 효율적 |
| 5 | Sticky Session 기간: 1시간 vs 24시간? | **1시간** — WS는 TCP persistent로 별도 유지됨. Redis Pub/Sub이 있으므로 재연결 시 다른 인스턴스여도 무방. 길면 스케일 다운 시 트래픽 편중 |
| 6 | Redis Pub/Sub 채널 전략: 단일 vs 보드별? | **보드별** (`ws:board:{boardId}`) — 확장성 우선. 단일 채널은 보드 수 증가 시 불필요한 메시지 처리 급증 |
| 7 | ElastiCache 마이그레이션 다운타임 허용? | **Yes** — 캐시 cold start 5~10분. WS는 이 시점에서 아직 SimpleBroker이므로 무관 |

---

## 7. 모니터링 체크리스트 (전환 후)

```
□ CloudWatch: ElastiCache CPUUtilization < 65%
□ CloudWatch: ElastiCache EngineCPUUtilization < 80%
□ CloudWatch: ElastiCache DatabaseMemoryUsagePercentage < 80%
□ CloudWatch: ElastiCache CurrConnections 정상 범위
□ CloudWatch: ElastiCache PublishCommands / SubscribeCommands 추이
□ Application: WebSocket 연결 수 (인스턴스별)
□ Application: Redis Pub/Sub 메시지 전달 성공률
□ Application: 노트 협업 동시 편집자 수
□ User-facing: 실시간 동기화 지연 체감 여부
```

---

## 참고

- **현재 WebSocket 이벤트 타입**: 40종 (`BoardEventType` enum)
- **현재 토픽 구조**: `/topic/board/{boardId}`, `/topic/board/{boardId}/user/{userId}`, `/topic/user/{userId}`
- **노트 협업**: `/ws-collab/{noteId}` (바이너리 Yjs CRDT, STOMP과 별도)
- **티어 제한**: STANDARD 보드는 WebSocket 구독 차단 (TRIAL/PREMIUM만 허용)
- **프론트엔드 reconnect**: 5초 간격 자동 재연결 + 4초 heartbeat (변경 불필요)
