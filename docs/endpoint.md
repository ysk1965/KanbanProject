# 🔌 API 엔드포인트 설계

## Base URL
```
https://api.kanban.app/v1
```

---

## 1. 인증 (Auth)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| POST | `/auth/signup` | 회원가입 | Public |
| POST | `/auth/login` | 로그인 | Public |
| POST | `/auth/logout` | 로그아웃 | User |
| POST | `/auth/refresh` | 토큰 갱신 | User |
| POST | `/auth/oauth/{provider}` | 소셜 로그인 (google, github) | Public |
| POST | `/auth/password/reset` | 비밀번호 재설정 요청 | Public |
| PUT | `/auth/password/reset/{token}` | 비밀번호 재설정 | Public |

### Request/Response 예시

```json
// POST /auth/signup
Request:
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "홍길동"
}

Response: 201 Created
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동"
  },
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG..."
}
```

---

## 2. 사용자 (Users)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/users/me` | 내 정보 조회 | User |
| PUT | `/users/me` | 내 정보 수정 | User |
| PUT | `/users/me/password` | 비밀번호 변경 | User |
| DELETE | `/users/me` | 회원 탈퇴 | User |
| GET | `/users/me/boards` | 내 보드 목록 | User |

```json
// GET /users/me/boards
Response: 200 OK
{
  "owned": [
    {
      "id": "board_001",
      "name": "개발팀 칸반",
      "role": "owner",
      "subscription": { "status": "active", "plan": "team_10" },
      "memberCount": 8
    }
  ],
  "joined": [
    {
      "id": "board_002",
      "name": "마케팅팀",
      "role": "member",
      "memberCount": 5
    }
  ]
}
```

---

## 3. 보드 (Boards)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards` | 내 보드 목록 | User |
| POST | `/boards` | 보드 생성 | User |
| GET | `/boards/{boardId}` | 보드 상세 조회 | Board.Viewer+ |
| PUT | `/boards/{boardId}` | 보드 수정 | Board.Admin+ |
| DELETE | `/boards/{boardId}` | 보드 삭제 | Board.Owner |
| PATCH | `/boards/{boardId}/star` | 즐겨찾기 토글 | Board.Viewer+ |
| GET | `/boards/{boardId}/export` | 데이터 내보내기 | Board.Viewer+ |

```json
// POST /boards
Request:
{
  "name": "새 프로젝트",
  "description": "프로젝트 설명"
}

Response: 201 Created
{
  "id": "board_003",
  "name": "새 프로젝트",
  "description": "프로젝트 설명",
  "ownerId": "user_001",
  "subscription": {
    "status": "trial",
    "trialEndsAt": "2025-01-15T00:00:00Z"
  },
  "blocks": [
    { "id": "blk_001", "name": "Feature", "type": "fixed", "fixedType": "feature" },
    { "id": "blk_002", "name": "Task", "type": "fixed", "fixedType": "task" },
    { "id": "blk_003", "name": "Done", "type": "fixed", "fixedType": "done" }
  ],
  "createdAt": "2025-01-08T00:00:00Z"
}
```

---

## 4. 멤버 (Members)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/members` | 멤버 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/members/invite` | 이메일 초대 | Board.Admin+ |
| PUT | `/boards/{boardId}/members/{userId}` | 역할 변경 | Board.Admin+ |
| DELETE | `/boards/{boardId}/members/{userId}` | 멤버 내보내기 | Board.Admin+ |
| POST | `/boards/{boardId}/members/leave` | 보드 나가기 | Board.Member+ |

```json
// POST /boards/{boardId}/members/invite
Request:
{
  "email": "newmember@example.com",
  "role": "member"
}

Response: 201 Created
{
  "message": "초대 이메일을 발송했습니다.",
  "invitedEmail": "newmember@example.com",
  "role": "member"
}
```

---

## 5. 초대 링크 (Invite Links)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/invite-links` | 초대 링크 목록 | Board.Admin+ |
| POST | `/boards/{boardId}/invite-links` | 초대 링크 생성 | Board.Admin+ |
| DELETE | `/boards/{boardId}/invite-links/{linkId}` | 링크 비활성화 | Board.Admin+ |
| GET | `/invite/{code}` | 초대 링크 정보 조회 | Public |
| POST | `/invite/{code}/accept` | 초대 수락 | User |

```json
// POST /boards/{boardId}/invite-links
Request:
{
  "role": "member",
  "maxUses": 10,
  "expiresIn": "7d"
}

Response: 201 Created
{
  "id": "link_001",
  "code": "abc123xyz",
  "url": "https://kanban.app/invite/abc123xyz",
  "role": "member",
  "maxUses": 10,
  "usedCount": 0,
  "expiresAt": "2025-01-15T00:00:00Z"
}
```

---

## 6. 블록 (Blocks)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/blocks` | 블록 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/blocks` | 커스텀 블록 생성 | Board.Admin+ |
| PUT | `/boards/{boardId}/blocks/{blockId}` | 블록 수정 | Board.Admin+ |
| DELETE | `/boards/{boardId}/blocks/{blockId}` | 블록 삭제 | Board.Admin+ |
| PUT | `/boards/{boardId}/blocks/reorder` | 블록 순서 변경 | Board.Admin+ |

```json
// POST /boards/{boardId}/blocks
Request:
{
  "name": "In Progress",
  "color": "#3B82F6",
  "position": 2
}

Response: 201 Created
{
  "id": "blk_004",
  "name": "In Progress",
  "type": "custom",
  "color": "#3B82F6",
  "position": 2
}

// DELETE /boards/{boardId}/blocks/{blockId}
Request:
{
  "cardAction": "moveToTask"  // moveToTask | moveToDone | delete
}
```

---

## 7. Feature 카드 (Features)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/features` | Feature 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/features` | Feature 생성 | Board.Member+ |
| GET | `/boards/{boardId}/features/{featureId}` | Feature 상세 | Board.Viewer+ |
| PUT | `/boards/{boardId}/features/{featureId}` | Feature 수정 | Board.Member+ |
| DELETE | `/boards/{boardId}/features/{featureId}` | Feature 삭제 | Board.Member+ |
| PUT | `/boards/{boardId}/features/reorder` | Feature 순서 변경 | Board.Member+ |

```json
// POST /boards/{boardId}/features
Request:
{
  "title": "로그인 기능 구현",
  "description": "소셜 로그인 포함",
  "assigneeId": "user_002",
  "priority": "high",
  "dueDate": "2025-01-20"
}

Response: 201 Created
{
  "id": "feat_001",
  "title": "로그인 기능 구현",
  "description": "소셜 로그인 포함",
  "assignee": { "id": "user_002", "name": "김개발" },
  "priority": "high",
  "dueDate": "2025-01-20",
  "status": "active",
  "totalTasks": 0,
  "completedTasks": 0,
  "createdBy": { "id": "user_001", "name": "홍길동" },
  "createdAt": "2025-01-08T00:00:00Z"
}
```

---

## 8. Task 카드 (Tasks)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/tasks` | 전체 Task 목록 | Board.Viewer+ |
| GET | `/boards/{boardId}/features/{featureId}/tasks` | Feature의 Task 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/features/{featureId}/tasks` | Task 생성 (서브태스크) | Board.Member+ |
| GET | `/boards/{boardId}/tasks/{taskId}` | Task 상세 | Board.Viewer+ |
| PUT | `/boards/{boardId}/tasks/{taskId}` | Task 수정 | Board.Member+ |
| DELETE | `/boards/{boardId}/tasks/{taskId}` | Task 삭제 | Board.Member+ |
| PUT | `/boards/{boardId}/tasks/{taskId}/move` | Task 블록 이동 | Board.Member+ |
| PUT | `/boards/{boardId}/tasks/reorder` | Task 순서 변경 | Board.Member+ |

```json
// POST /boards/{boardId}/features/{featureId}/tasks
Request:
{
  "title": "로그인 API 개발",
  "description": "JWT 기반 인증",
  "assigneeId": "user_003",
  "estimatedMinutes": 240
}

Response: 201 Created
{
  "id": "task_001",
  "title": "로그인 API 개발",
  "feature": { "id": "feat_001", "title": "로그인 기능 구현" },
  "block": { "id": "blk_002", "name": "Task" },
  "assignee": { "id": "user_003", "name": "박개발" },
  "estimatedMinutes": 240,
  "isCompleted": false,
  "createdAt": "2025-01-08T00:00:00Z"
}

// PUT /boards/{boardId}/tasks/{taskId}/move
Request:
{
  "blockId": "blk_003",
  "position": 0
}

Response: 200 OK
{
  "id": "task_001",
  "block": { "id": "blk_003", "name": "Done" },
  "isCompleted": true,
  "completedAt": "2025-01-08T12:00:00Z",
  "feature": {
    "id": "feat_001",
    "totalTasks": 4,
    "completedTasks": 2
  }
}
```

---

## 9. 구독 (Subscriptions)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/subscription` | 구독 정보 조회 | Board.Admin+ |
| POST | `/boards/{boardId}/subscription/subscribe` | 구독 시작 | Board.Owner |
| PUT | `/boards/{boardId}/subscription/plan` | 플랜/주기 변경 | Board.Owner |
| POST | `/boards/{boardId}/subscription/cancel` | 구독 취소 | Board.Owner |
| GET | `/boards/{boardId}/subscription/invoices` | 결제 내역 | Board.Owner |

```json
// GET /boards/{boardId}/subscription
Response: 200 OK
{
  "status": "active",
  "plan": {
    "id": "team_10",
    "name": "팀 10",
    "minMembers": 4,
    "maxMembers": 10
  },
  "billingCycle": "monthly",
  "price": 29000,
  "billableMemberCount": 8,
  "currentPeriodStart": "2025-01-08T00:00:00Z",
  "currentPeriodEnd": "2025-02-08T00:00:00Z",
  "nextPaymentAt": "2025-02-08T00:00:00Z"
}

// POST /boards/{boardId}/subscription/subscribe
Request:
{
  "billingCycle": "yearly",
  "paymentMethodId": "pm_xxx"
}

Response: 200 OK
{
  "status": "active",
  "plan": "team_10",
  "billingCycle": "yearly",
  "price": 290000,
  "currentPeriodEnd": "2026-01-08T00:00:00Z"
}
```

---

## 10. 결제 수단 (Payment Methods)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/users/me/payment-methods` | 결제 수단 목록 | User |
| POST | `/users/me/payment-methods` | 결제 수단 등록 | User |
| DELETE | `/users/me/payment-methods/{methodId}` | 결제 수단 삭제 | User |
| PUT | `/users/me/payment-methods/{methodId}/default` | 기본 결제 수단 설정 | User |

---

## 11. 활동 로그 (Activity)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/activity` | 활동 로그 조회 | Board.Viewer+ |

```json
// GET /boards/{boardId}/activity?limit=20&cursor=xxx
Response: 200 OK
{
  "items": [
    {
      "id": "log_001",
      "action": "task_moved",
      "user": { "id": "user_002", "name": "김개발" },
      "targetType": "task",
      "targetId": "task_001",
      "metadata": {
        "taskTitle": "로그인 API 개발",
        "fromBlock": "In Progress",
        "toBlock": "Done"
      },
      "createdAt": "2025-01-08T12:00:00Z"
    }
  ],
  "nextCursor": "yyy",
  "hasMore": true
}
```

---

## 12. 태그 (Tags)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/tags` | 태그 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/tags` | 태그 생성 | Board.Admin+ |
| PUT | `/boards/{boardId}/tags/{tagId}` | 태그 수정 | Board.Admin+ |
| DELETE | `/boards/{boardId}/tags/{tagId}` | 태그 삭제 | Board.Admin+ |

```json
// POST /boards/{boardId}/tags
Request:
{
  "name": "버그",
  "color": "#EF4444"
}

Response: 201 Created
{
  "id": "tag_001",
  "name": "버그",
  "color": "#EF4444",
  "createdAt": "2025-01-08T00:00:00Z"
}
```

---

## 13. 체크리스트 (Checklist Items)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/boards/{boardId}/tasks/{taskId}/checklist` | 체크리스트 목록 | Board.Viewer+ |
| POST | `/boards/{boardId}/tasks/{taskId}/checklist` | 항목 추가 | Board.Member+ |
| PUT | `/boards/{boardId}/tasks/{taskId}/checklist/{itemId}` | 항목 수정 | Board.Member+ |
| DELETE | `/boards/{boardId}/tasks/{taskId}/checklist/{itemId}` | 항목 삭제 | Board.Member+ |
| PUT | `/boards/{boardId}/tasks/{taskId}/checklist/reorder` | 순서 변경 | Board.Member+ |

```json
// POST /boards/{boardId}/tasks/{taskId}/checklist
Request:
{
  "title": "API 테스트 작성",
  "assigneeId": "user_002",
  "dueDate": "2025-01-15"
}

Response: 201 Created
{
  "id": "check_001",
  "title": "API 테스트 작성",
  "isCompleted": false,
  "assignee": { "id": "user_002", "name": "김개발" },
  "dueDate": "2025-01-15",
  "position": 0,
  "createdAt": "2025-01-08T00:00:00Z"
}
```

---

## 14. 요금제 (Pricing)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/pricing/plans` | 요금제 목록 | Public |

```json
// GET /pricing/plans
Response: 200 OK
{
  "plans": [
    { "id": "free", "name": "무료", "minMembers": 1, "maxMembers": 3, "monthlyPrice": 0, "yearlyPrice": 0 },
    { "id": "team_10", "name": "팀 10", "minMembers": 4, "maxMembers": 10, "monthlyPrice": 29000, "yearlyPrice": 290000 },
    { "id": "team_25", "name": "팀 25", "minMembers": 11, "maxMembers": 25, "monthlyPrice": 69000, "yearlyPrice": 660000 },
    { "id": "team_50", "name": "팀 50", "minMembers": 26, "maxMembers": 50, "monthlyPrice": 129000, "yearlyPrice": 1190000 }
  ]
}
```

---

## 에러 응답 형식

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "이 작업을 수행할 권한이 없습니다.",
    "details": {
      "requiredRole": "admin",
      "currentRole": "member"
    }
  }
}
```

### 주요 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| `UNAUTHORIZED` | 401 | 인증 필요 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `BOARD_SUSPENDED` | 403 | 보드 정지 상태 |
| `TRIAL_EXPIRED` | 403 | 체험 기간 만료 |
| `PAYMENT_REQUIRED` | 402 | 결제 필요 |
| `MEMBER_LIMIT_EXCEEDED` | 400 | 멤버 수 초과 |

---

## 권한 레벨 참조

| 표기 | 의미 |
|------|------|
| Public | 누구나 |
| User | 로그인한 사용자 |
| Board.Viewer+ | Viewer 이상 |
| Board.Member+ | Member 이상 |
| Board.Admin+ | Admin 이상 |
| Board.Owner | Owner만 |