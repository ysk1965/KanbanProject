# WebSocket 안정성 점검 보고서

> **작성일**: 2025-02-15
> **대상**: BRIDGE 프로젝트 WebSocket/STOMP 구현 전체
> **목적**: 간헐적 연결 실패 원인 분석 및 개선 방안

---

## 1. 현황 요약

### 증상
- WebSocket 연결이 간헐적으로 작동/미작동
- 특정 사용자 행동 패턴(페이지 전환, 장시간 사용)에서 발생 빈도 증가
- 새로고침 시 정상 복구

### 분석 대상 파일

| 구분 | 파일 | 역할 |
|------|------|------|
| FE | `frontend/src/app/utils/websocket.ts` | WebSocketManager 싱글톤 |
| FE | `frontend/src/app/hooks/useBoardWebSocket.ts` | 보드별 구독 훅 |
| FE | `frontend/src/app/hooks/useNotificationManager.ts` | 알림 구독 훅 |
| FE | `frontend/src/app/utils/api.ts` | JWT 토큰 갱신 |
| FE | `frontend/src/app/contexts/AuthContext.tsx` | 인증 상태 관리 |
| BE | `backend/.../global/config/WebSocketConfig.java` | STOMP 설정 |
| BE | `backend/.../global/security/WebSocketAuthInterceptor.java` | JWT 인증 + Tier 검증 |
| BE | `backend/.../global/websocket/RedisWebSocketBridge.java` | Redis Pub/Sub 릴레이 |
| BE | `backend/.../global/websocket/NoteCollabHandler.java` | 노트 협업 WebSocket |
| BE | `backend/.../global/websocket/WebSocketEventService.java` | 이벤트 전송 |

---

## 2. 발견된 문제점

### 2.1 🔴 CRITICAL: 페이지 전환 시 의도치 않은 연결 끊김

**위치**: `useBoardWebSocket.ts` cleanup / `useNotificationManager.ts` cleanup

**현상**:
- cleanup 함수에서 `wsManager.disconnect()`를 무조건 호출
- WebSocketManager는 싱글톤이므로, 어떤 훅이든 cleanup 시 **전체 연결이 끊어짐**

**재현 시나리오**:
```
1. KanbanBoardPage 마운트 → WebSocket 연결 + 보드 구독
2. NotificationManager도 같은 WebSocket으로 알림 구독
3. 알림 드롭다운 닫힘 → useNotificationManager cleanup → wsManager.disconnect()
4. 보드 페이지의 구독도 같이 끊어짐 → 이벤트 수신 불가
5. 사용자는 보드 페이지에 있지만 실시간 업데이트 안 됨
```

**영향**: 가장 유력한 "간헐적" 원인. 사용자 행동 패턴에 따라 발생/미발생이 갈림.

**해결 방안**: 참조 카운팅(reference counting) 도입
```typescript
// WebSocketManager에 연결 참조 카운트 추가
private connectionCount = 0;

connect(): void {
  this.connectionCount++;
  if (this.client?.connected || this.isConnecting) return;
  // ... 기존 연결 로직
}

disconnect(): void {
  this.connectionCount--;
  if (this.connectionCount <= 0) {
    this.connectionCount = 0;
    // ... 실제 연결 종료
  }
}
```

---

### 2.2 🔴 CRITICAL: JWT 토큰 만료 후 WebSocket 미갱신

**위치**: `websocket.ts:43-48`

**현상**:
- STOMP 클라이언트 생성 시 `localStorage.getItem('access_token')`을 **한 번만** 읽음
- 이후 토큰이 갱신되어도 WebSocket CONNECT 헤더는 만료된 토큰 유지

```typescript
// websocket.ts - 현재 코드
const token = localStorage.getItem('access_token');
this.client = new Client({
  connectHeaders: {
    Authorization: token ? `Bearer ${token}` : '',  // 생성 시점의 토큰 고정
  },
});
```

**재현 시나리오**:
```
1. 로그인 → Token A 발급, WebSocket 연결 (Token A)
2. 45분+ 경과 → API 호출로 Token B 갱신 (api.ts의 자동 갱신)
3. HTTP 요청은 정상 (Token B 사용)
4. WebSocket 재연결 시도 → 만료된 Token A 전송 → 인증 실패
5. 백엔드 로그: "WebSocket CONNECT failed: invalid or missing JWT token"
```

**영향**: 장시간 사용 시 (1시간+) 재연결 불가.

**해결 방안**: 토큰 갱신 이벤트에 WebSocket 재연결 연동
```typescript
// WebSocketManager에 토큰 업데이트 메서드 추가
updateToken(): void {
  const newToken = localStorage.getItem('access_token');
  if (this.client?.connected) {
    this.client.deactivate();
    this.client.connectHeaders = {
      Authorization: newToken ? `Bearer ${newToken}` : '',
    };
    this.client.activate();
  }
}

// api.ts 토큰 갱신 후 호출
if (refreshed) {
  WebSocketManager.getInstance().updateToken();
}
```

---

### 2.3 🟠 HIGH: 하트비트 설정 불일치

**위치**: `websocket.ts:56-57` vs `WebSocketConfig.java`

| 구분 | 설정 | 값 |
|------|------|-----|
| 프론트엔드 | `heartbeatIncoming` | 4000ms (4초) |
| 프론트엔드 | `heartbeatOutgoing` | 4000ms (4초) |
| 백엔드 | heartbeat 설정 | **없음** (Spring 기본값 = 0, 비활성화) |

**문제**:
- 클라이언트는 4초마다 서버 heartbeat를 기대
- 서버는 heartbeat를 보내지 않음 (비활성화)
- 방화벽/로드밸런서가 유휴 연결을 끊을 수 있음 (AWS ALB 기본 60초)
- 클라이언트가 연결 끊김으로 오판할 수 있음

**해결 방안**: 백엔드에 heartbeat 설정 추가
```java
// WebSocketConfig.java
@Override
public void configureMessageBroker(MessageBrokerRegistry config) {
    config.enableSimpleBroker("/topic", "/queue")
          .setHeartbeatValue(new long[]{10000, 10000})  // 10초 heartbeat
          .setTaskScheduler(taskScheduler());
}
```

---

### 2.4 🟠 HIGH: Redis Pub/Sub 구독 전 메시지 손실

**위치**: `RedisWebSocketBridge.java:77-86`

**문제**:
- 클라이언트 연결 → STOMP 구독 → Redis 채널 구독까지 시간차 존재
- Redis Pub/Sub는 구독자 부재 시 메시지를 보관하지 않음 (fire-and-forget)
- 구독 완료 전에 발행된 메시지는 영구 손실

```
시간 →
Client A: 연결 시작 ─── STOMP 구독 ─── Redis 구독 시작 ─── Redis 구독 완료
                                        ↑                    ↑
                          이 구간의 메시지 손실 ─────────────────┘
```

**해결 방안**:
- 단기: 클라이언트 구독 완료 후 최신 보드 상태를 HTTP로 한 번 fetch
- 장기: Redis Stream 도입 (메시지 히스토리 보관)

---

### 2.5 🟡 MEDIUM: 재연결 전략 미흡

**위치**: `websocket.ts:55`

**현상**:
```typescript
reconnectDelay: 5000,  // 고정 5초
```

- Exponential backoff 없음 → 서버 장애 시 5초 간격으로 무한 재시도
- 서버 복구 시점에 모든 클라이언트가 동시 재연결 → thundering herd
- 에러 후 상태가 'error'에 머물면 수동 재연결 불가

**해결 방안**:
```typescript
// Exponential backoff + jitter
reconnectDelay: (attempt: number) => {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000); // 1s → 2s → 4s → ... → 30s max
  const jitter = Math.random() * 1000;
  return base + jitter;
},
```

---

### 2.6 🟡 MEDIUM: 동일 destination 구독 덮어쓰기

**위치**: `websocket.ts:29`

**현상**:
```typescript
private subscriptions: Map<string, StompSubscription> = new Map();
```

- `Map`은 key당 하나의 value만 저장
- 같은 destination에 여러 구독 시 이전 구독이 덮어써짐
- 첫 번째 구독 해제 시 Map에서 제거, 실제 STOMP 구독은 남음 → 메모리 누수

**해결 방안**: Map value를 배열로 변경하거나 unique subscription ID 사용

---

### 2.7 🟡 MEDIUM: Tier 캐시 불일치

**위치**: `WebSocketAuthInterceptor.java:86-113`

**현상**:
```java
private static final long TIER_CACHE_TTL_MS = 5 * 60 * 1000L; // 5분 캐시
```

- 보드 Tier 변경 후 최대 5분간 이전 상태로 판단
- PREMIUM → STANDARD 다운그레이드 시: 5분간 WebSocket 유지 (의도하지 않은 접근)
- STANDARD → PREMIUM 업그레이드 시: 5분간 WebSocket 차단 (사용자 불만)

**해결 방안**: 보드 Tier 변경 이벤트 시 캐시 즉시 무효화

---

### 2.8 🟡 MEDIUM: NoteCollab Redis 레이스 조건

**위치**: `NoteCollabHandler.java:98-103`

**현상**:
```java
if (room.sessions.size() == 1 && room.storedState == null) {
    noteCollabService.loadState(noteId).ifPresent(state -> room.storedState = state);
    subscribeRedisChannel(noteId);  // 첫 세션일 때만 구독
}
```

- 멀티 인스턴스 환경에서 Instance 1이 Redis 구독 완료 전 Instance 2가 메시지 발행 시 손실
- 단일 인스턴스에서는 발생하지 않음 (dev 환경에서 재현 어려움)

---

## 3. 간헐적 실패 시나리오 정리

### 시나리오 A: 페이지 내 UI 조작으로 끊김
```
사용자가 보드 보는 중
→ 알림 드롭다운 열기/닫기
→ NotificationManager cleanup → disconnect()
→ 보드 구독도 끊어짐
→ 실시간 업데이트 안 됨 (새로고침 전까지)
```

### 시나리오 B: 장시간 사용 후 끊김
```
1시간+ 사용
→ API 호출로 토큰 갱신
→ WebSocket은 만료된 토큰 유지
→ 네트워크 순간 끊김 → 재연결 시도 → 인증 실패
→ 연결 불가 (새로고침 전까지)
```

### 시나리오 C: 네트워크 불안정
```
Wi-Fi 전환 또는 모바일 네트워크
→ WebSocket 끊김
→ 5초 후 재연결 시도 → 서버 heartbeat 없음 → 연결 확인 불가
→ 방화벽이 유휴 연결 종료
→ 반복 실패
```

### 시나리오 D: 멀티 인스턴스 메시지 손실
```
사용자 A가 보드 접속
→ Redis 채널 구독 시작 (아직 완료 안 됨)
→ 다른 인스턴스에서 이벤트 발행
→ 구독 완료 전이라 메시지 수신 못 함
→ 사용자 A는 해당 변경사항 못 봄
```

---

## 4. 개선 우선순위

### Phase 1: 즉시 조치 (간헐적 끊김 해결)

| # | 항목 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 1 | `wsManager.disconnect()` 참조 카운팅 | 페이지 내 조작으로 인한 끊김 해결 | 낮음 |
| 2 | 토큰 갱신 시 WebSocket 재연결 | 장시간 사용 안정성 확보 | 중간 |

### Phase 2: 단기 개선 (연결 안정성 강화)

| # | 항목 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 3 | 백엔드 heartbeat 설정 추가 | 유휴 연결 유지, LB 타임아웃 방지 | 낮음 |
| 4 | Exponential backoff 재연결 | 네트워크 복구 안정성, 서버 부하 감소 | 낮음 |
| 5 | 구독 복구 로직 (재연결 후 자동 재구독) | 재연결 후 즉시 이벤트 수신 | 중간 |

### Phase 3: 중기 개선 (구조적 안정성)

| # | 항목 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 6 | Redis 구독 전 메시지 손실 대응 | 멀티 인스턴스 안정성 | 중간 |
| 7 | Tier 캐시 이벤트 기반 무효화 | 플랜 변경 즉시 반영 | 낮음 |
| 8 | 구독 Map 구조 개선 | 메모리 누수 방지 | 낮음 |
| 9 | WebSocket 상태 중앙화 (Zustand 등) | 상태 관리 일관성 | 높음 |

---

## 5. 참고: 현재 아키텍처

```
┌─────────────┐     STOMP/WS      ┌──────────────────┐
│  Browser     │ ←───────────────→ │  Spring Boot     │
│              │                   │                  │
│ WebSocket    │   JWT Auth        │ WebSocketConfig  │
│ Manager      │ ←── CONNECT ────→ │ AuthInterceptor  │
│ (싱글톤)     │                   │                  │
│              │   /topic/board/*  │ EventService     │
│ useBoardWS   │ ←── SUBSCRIBE ──→ │   ↓              │
│ useNotifMgr  │                   │ SimpleBroker     │
└─────────────┘                   │   (local)        │
                                  │   or             │
                                  │ RedisWSBridge    │
                                  │   (prod)         │
                                  └──────────────────┘
```

### 환경별 WebSocket 인프라

| 환경 | 브로커 | 특이사항 |
|------|--------|---------|
| local | SimpleBroker (in-memory) | 단일 인스턴스 |
| dev | SimpleBroker (in-memory) | 단일 인스턴스 |
| prod | Redis Pub/Sub + SimpleBroker | 멀티 인스턴스, RedisWebSocketBridge |
