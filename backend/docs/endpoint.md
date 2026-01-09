# API 엔드포인트 명세

## Base URL
```
http://localhost:8080/api/v1
```

---

## 공통 사항

### 인증 헤더
```
Authorization: Bearer {access_token}
```

### 에러 응답 형식
```json
{
  "code": "A002",
  "message": "이메일 또는 비밀번호가 올바르지 않습니다",
  "timestamp": "2025-01-08T12:00:00.000000"
}
```

### 에러 코드
| 코드 | HTTP | 설명 |
|------|------|------|
| C001 | 400 | 잘못된 입력값 |
| C002 | 500 | 서버 오류 |
| A001 | 409 | 이미 사용 중인 이메일 |
| A002 | 401 | 이메일/비밀번호 불일치 |
| A003 | 401 | 유효하지 않은 토큰 |
| A004 | 401 | 만료된 토큰 |
| A005 | 401 | 인증 필요 |
| U001 | 404 | 사용자 없음 |
| B001 | 404 | 보드 없음 |
| B002 | 403 | 보드 접근 권한 없음 |
| B003 | 403 | 보드 정지 상태 |
| BL001 | 404 | 블록 없음 |
| BL002 | 400 | 고정 블록 삭제 불가 |
| BL003 | 400 | 고정 블록 수정 불가 |
| F001 | 404 | Feature 없음 |
| T001 | 404 | Task 없음 |
| T002 | 400 | Task 이동 불가 블록 |
| TG001 | 404 | 태그 없음 |
| TG002 | 409 | 이미 존재하는 태그 |
| CL001 | 404 | 체크리스트 항목 없음 |
| M001 | 404 | 멤버 없음 |
| M002 | 409 | 이미 멤버임 |
| M003 | 400 | Owner 내보내기 불가 |
| M004 | 400 | Owner 역할 변경 불가 |
| I001 | 404 | 초대 링크 없음 |
| I002 | 400 | 만료된 초대 링크 |
| I003 | 400 | 유효하지 않은 초대 링크 |
| S001 | 404 | 구독 정보 없음 |
| S002 | 403 | 체험 기간 만료 |
| S003 | 402 | 결제 필요 |
| S004 | 400 | 멤버 수 제한 초과 |

### 권한 레벨
| 권한 | 설명 |
|------|------|
| Public | 누구나 |
| User | 로그인 사용자 |
| Viewer+ | Viewer 이상 |
| Member+ | Member 이상 |
| Admin+ | Admin 이상 |
| Owner | Owner만 |

---

## 1. 인증 (Auth)

### POST /auth/signup - 회원가입
**권한**: Public

**Request**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "홍길동"
}
```

**Response** `201 Created`
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "Bearer",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "홍길동"
  }
}
```

### POST /auth/login - 로그인
**권한**: Public

**Request**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** `200 OK`
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "Bearer",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "홍길동"
  }
}
```

### POST /auth/logout - 로그아웃
**권한**: User

**Request Header**
```
Authorization: Bearer {access_token}
```

**Response** `200 OK`
```json
{
  "message": "로그아웃 되었습니다"
}
```

### GET /auth/me - 현재 사용자 정보
**권한**: User

**Response** `200 OK`
```json
{
  "userId": "uuid-string",
  "email": "user@example.com"
}
```

### POST /auth/refresh - 토큰 갱신
**권한**: Public

**Request**
```json
{
  "refresh_token": "eyJhbG..."
}
```

**Response** `200 OK`
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "Bearer"
}
```

---

## 2. 보드 (Boards)

### GET /boards - 내 보드 목록
**권한**: User

**Response** `200 OK`
```json
[
  {
    "id": "board-uuid",
    "name": "개발팀 칸반",
    "description": "개발팀 프로젝트 관리",
    "role": "OWNER",
    "is_starred": true,
    "member_count": 8,
    "subscription": {
      "status": "TRIAL",
      "plan": null,
      "trial_ends_at": "2025-01-15T00:00:00",
      "current_period_end": null
    },
    "created_at": "2025-01-08T00:00:00"
  }
]
```

### POST /boards - 보드 생성
**권한**: User

**Request**
```json
{
  "name": "새 프로젝트",
  "description": "프로젝트 설명"
}
```

**Response** `201 Created`
```json
{
  "id": "board-uuid",
  "name": "새 프로젝트",
  "description": "프로젝트 설명",
  "owner": {
    "id": "user-uuid",
    "name": "홍길동",
    "email": "user@example.com",
    "profile_image": null
  },
  "my_role": "OWNER",
  "is_starred": false,
  "member_count": 1,
  "subscription": {
    "status": "TRIAL",
    "plan": null,
    "trial_ends_at": "2025-01-15T00:00:00",
    "current_period_end": null
  },
  "created_at": "2025-01-08T00:00:00",
  "updated_at": "2025-01-08T00:00:00"
}
```

### GET /boards/{boardId} - 보드 상세
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "id": "board-uuid",
  "name": "새 프로젝트",
  "description": "프로젝트 설명",
  "owner": {
    "id": "user-uuid",
    "name": "홍길동",
    "email": "user@example.com",
    "profile_image": null
  },
  "my_role": "OWNER",
  "is_starred": false,
  "member_count": 1,
  "subscription": {
    "status": "TRIAL",
    "plan": null,
    "trial_ends_at": "2025-01-15T00:00:00",
    "current_period_end": null
  },
  "created_at": "2025-01-08T00:00:00",
  "updated_at": "2025-01-08T00:00:00"
}
```

### PUT /boards/{boardId} - 보드 수정
**권한**: Admin+

**Request**
```json
{
  "name": "수정된 이름",
  "description": "수정된 설명"
}
```

**Response** `200 OK` - 보드 상세와 동일

### DELETE /boards/{boardId} - 보드 삭제
**권한**: Owner

**Response** `200 OK`
```json
{
  "message": "보드가 삭제되었습니다"
}
```

### PATCH /boards/{boardId}/star - 즐겨찾기 토글
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "board_id": "board-uuid",
  "is_starred": true
}
```

---

## 3. 블록 (Blocks)

### GET /boards/{boardId}/blocks - 블록 목록
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "blocks": [
    {
      "id": "block-uuid",
      "name": "Feature",
      "type": "FIXED",
      "fixed_type": "FEATURE",
      "color": null,
      "position": 0
    },
    {
      "id": "block-uuid",
      "name": "Task",
      "type": "FIXED",
      "fixed_type": "TASK",
      "color": null,
      "position": 1
    },
    {
      "id": "block-uuid",
      "name": "In Progress",
      "type": "CUSTOM",
      "fixed_type": null,
      "color": "#3B82F6",
      "position": 2
    },
    {
      "id": "block-uuid",
      "name": "Done",
      "type": "FIXED",
      "fixed_type": "DONE",
      "color": null,
      "position": 999
    }
  ]
}
```

### POST /boards/{boardId}/blocks - 커스텀 블록 생성
**권한**: Admin+

> 커스텀 블록은 Task와 Done 블록 사이에 생성됩니다.

**Request**
```json
{
  "name": "In Progress",
  "color": "#3B82F6"
}
```

**Response** `201 Created`
```json
{
  "id": "block-uuid",
  "name": "In Progress",
  "type": "CUSTOM",
  "fixed_type": null,
  "color": "#3B82F6",
  "position": 2
}
```

### PUT /boards/{boardId}/blocks/{blockId} - 블록 수정
**권한**: Admin+

> 고정 블록(Feature, Task, Done)은 수정 불가

**Request**
```json
{
  "name": "진행 중",
  "color": "#10B981"
}
```

**Response** `200 OK` - 블록 상세

### DELETE /boards/{boardId}/blocks/{blockId} - 블록 삭제
**권한**: Admin+

> 고정 블록(Feature, Task, Done)은 삭제 불가

**Response** `200 OK`
```json
{
  "message": "블록이 삭제되었습니다"
}
```

### PUT /boards/{boardId}/blocks/reorder - 블록 순서 변경
**권한**: Admin+

> Feature(0), Task(1)는 항상 처음, Done은 항상 마지막이어야 함

**Request**
```json
{
  "block_ids": ["feature-block-id", "task-block-id", "custom-block-id", "done-block-id"]
}
```

**Response** `200 OK` - 블록 목록

---

## 4. Feature

### GET /boards/{boardId}/features - Feature 목록
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "features": [
    {
      "id": "feature-uuid",
      "title": "로그인 기능",
      "color": "#3B82F6",
      "assignee": {
        "id": "user-uuid",
        "name": "김개발",
        "email": "kim@example.com",
        "profile_image": null
      },
      "priority": "HIGH",
      "due_date": "2025-01-20",
      "status": "ACTIVE",
      "total_tasks": 5,
      "completed_tasks": 2,
      "progress_percentage": 40,
      "position": 0,
      "tags": [
        { "id": "tag-uuid", "name": "버그", "color": "#EF4444" }
      ]
    }
  ]
}
```

### POST /boards/{boardId}/features - Feature 생성
**권한**: Member+

**Request**
```json
{
  "title": "로그인 기능 구현",
  "description": "소셜 로그인 포함",
  "color": "#3B82F6",
  "assignee_id": "user-uuid",
  "priority": "HIGH",
  "due_date": "2025-01-20"
}
```

> priority: `HIGH`, `MEDIUM`, `LOW` 또는 null

**Response** `201 Created`
```json
{
  "id": "feature-uuid",
  "title": "로그인 기능 구현",
  "description": "소셜 로그인 포함",
  "color": "#3B82F6",
  "assignee": {
    "id": "user-uuid",
    "name": "김개발",
    "email": "kim@example.com",
    "profile_image": null
  },
  "priority": "HIGH",
  "due_date": "2025-01-20",
  "status": "ACTIVE",
  "total_tasks": 0,
  "completed_tasks": 0,
  "progress_percentage": 0,
  "position": 0,
  "tags": [],
  "created_by": {
    "id": "user-uuid",
    "name": "홍길동"
  },
  "created_at": "2025-01-08T00:00:00",
  "updated_at": "2025-01-08T00:00:00",
  "completed_at": null
}
```

### GET /boards/{boardId}/features/{featureId} - Feature 상세
**권한**: Viewer+

**Response** `200 OK` - Feature 생성 응답과 동일

### PUT /boards/{boardId}/features/{featureId} - Feature 수정
**권한**: Member+

**Request**
```json
{
  "title": "수정된 제목",
  "description": "수정된 설명",
  "color": "#10B981",
  "assignee_id": "user-uuid",
  "priority": "MEDIUM",
  "due_date": "2025-01-25"
}
```

**Response** `200 OK` - Feature 상세

### DELETE /boards/{boardId}/features/{featureId} - Feature 삭제
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "Feature가 삭제되었습니다"
}
```

### PUT /boards/{boardId}/features/reorder - Feature 순서 변경
**권한**: Member+

**Request**
```json
{
  "feature_ids": ["feature-uuid-1", "feature-uuid-2", "feature-uuid-3"]
}
```

**Response** `200 OK` - Feature 목록

---

## 5. Task

### GET /boards/{boardId}/tasks - Task 목록
**권한**: Viewer+

**Query Parameters**
- `block_id` (optional): 특정 블록의 Task만 조회
- `feature_id` (optional): 특정 Feature의 Task만 조회

**Response** `200 OK`
```json
{
  "tasks": [
    {
      "id": "task-uuid",
      "feature_id": "feature-uuid",
      "feature_title": "로그인 기능",
      "feature_color": "#3B82F6",
      "block_id": "block-uuid",
      "title": "로그인 API 개발",
      "assignee": {
        "id": "user-uuid",
        "name": "박개발",
        "email": "park@example.com",
        "profile_image": null
      },
      "due_date": "2025-01-15",
      "estimated_minutes": 240,
      "is_completed": false,
      "position": 0,
      "tags": [],
      "checklist_total": 3,
      "checklist_completed": 1
    }
  ]
}
```

### POST /boards/{boardId}/features/{featureId}/tasks - Task 생성
**권한**: Member+

**Request**
```json
{
  "title": "로그인 API 개발",
  "description": "JWT 기반 인증",
  "assignee_id": "user-uuid",
  "due_date": "2025-01-15",
  "estimated_minutes": 240
}
```

**Response** `201 Created`
```json
{
  "id": "task-uuid",
  "feature_id": "feature-uuid",
  "feature_title": "로그인 기능",
  "feature_color": "#3B82F6",
  "block_id": "task-block-uuid",
  "block_name": "Task",
  "title": "로그인 API 개발",
  "description": "JWT 기반 인증",
  "assignee": {
    "id": "user-uuid",
    "name": "박개발",
    "email": "park@example.com",
    "profile_image": null
  },
  "due_date": "2025-01-15",
  "estimated_minutes": 240,
  "is_completed": false,
  "position": 0,
  "tags": [],
  "created_by": {
    "id": "user-uuid",
    "name": "홍길동"
  },
  "created_at": "2025-01-08T00:00:00",
  "updated_at": "2025-01-08T00:00:00",
  "completed_at": null
}
```

### GET /boards/{boardId}/tasks/{taskId} - Task 상세
**권한**: Viewer+

**Response** `200 OK` - Task 생성 응답과 동일

### PUT /boards/{boardId}/tasks/{taskId} - Task 수정
**권한**: Member+

**Request**
```json
{
  "title": "수정된 제목",
  "description": "수정된 설명",
  "assignee_id": "user-uuid",
  "due_date": "2025-01-20",
  "estimated_minutes": 480
}
```

**Response** `200 OK` - Task 상세

### DELETE /boards/{boardId}/tasks/{taskId} - Task 삭제
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "Task가 삭제되었습니다"
}
```

### PUT /boards/{boardId}/tasks/{taskId}/move - Task 블록 이동
**권한**: Member+

> Done 블록으로 이동 시 자동으로 완료 처리됨

**Request**
```json
{
  "target_block_id": "done-block-uuid",
  "position": 0
}
```

**Response** `200 OK` - Task 상세

---

## 6. 태그 (Tags)

### GET /boards/{boardId}/tags - 태그 목록
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "tags": [
    {
      "id": "tag-uuid",
      "name": "버그",
      "color": "#EF4444",
      "created_at": "2025-01-08T00:00:00"
    }
  ]
}
```

### POST /boards/{boardId}/tags - 태그 생성
**권한**: Member+

**Request**
```json
{
  "name": "버그",
  "color": "#EF4444"
}
```

**Response** `201 Created`
```json
{
  "id": "tag-uuid",
  "name": "버그",
  "color": "#EF4444",
  "created_at": "2025-01-08T00:00:00"
}
```

### PUT /boards/{boardId}/tags/{tagId} - 태그 수정
**권한**: Member+

**Request**
```json
{
  "name": "긴급 버그",
  "color": "#DC2626"
}
```

**Response** `200 OK` - 태그 상세

### DELETE /boards/{boardId}/tags/{tagId} - 태그 삭제
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "태그가 삭제되었습니다"
}
```

### POST /boards/{boardId}/features/{featureId}/tags - Feature에 태그 추가
**권한**: Member+

**Request**
```json
{
  "tag_id": "tag-uuid"
}
```

**Response** `200 OK` - 태그 목록

### DELETE /boards/{boardId}/features/{featureId}/tags/{tagId} - Feature에서 태그 제거
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "태그가 제거되었습니다"
}
```

### POST /boards/{boardId}/tasks/{taskId}/tags - Task에 태그 추가
**권한**: Member+

**Request**
```json
{
  "tag_id": "tag-uuid"
}
```

**Response** `200 OK` - 태그 목록

### DELETE /boards/{boardId}/tasks/{taskId}/tags/{tagId} - Task에서 태그 제거
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "태그가 제거되었습니다"
}
```

---

## 7. 체크리스트 (Checklist)

### GET /boards/{boardId}/tasks/{taskId}/checklist - 체크리스트 조회
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "total": 3,
  "completed": 1,
  "items": [
    {
      "id": "item-uuid",
      "title": "API 테스트 작성",
      "is_completed": true,
      "assignee": {
        "id": "user-uuid",
        "name": "김개발",
        "profile_image": null
      },
      "due_date": "2025-01-15",
      "position": 0,
      "created_at": "2025-01-08T00:00:00",
      "completed_at": "2025-01-10T00:00:00"
    }
  ]
}
```

### POST /boards/{boardId}/tasks/{taskId}/checklist - 항목 추가
**권한**: Member+

**Request**
```json
{
  "title": "API 테스트 작성",
  "assignee_id": "user-uuid",
  "due_date": "2025-01-15"
}
```

**Response** `201 Created`
```json
{
  "id": "item-uuid",
  "title": "API 테스트 작성",
  "is_completed": false,
  "assignee": {
    "id": "user-uuid",
    "name": "김개발",
    "profile_image": null
  },
  "due_date": "2025-01-15",
  "position": 0,
  "created_at": "2025-01-08T00:00:00",
  "completed_at": null
}
```

### PUT /boards/{boardId}/tasks/{taskId}/checklist/{itemId} - 항목 수정
**권한**: Member+

**Request**
```json
{
  "title": "수정된 항목",
  "assignee_id": "user-uuid",
  "due_date": "2025-01-20"
}
```

**Response** `200 OK` - 항목 상세

### DELETE /boards/{boardId}/tasks/{taskId}/checklist/{itemId} - 항목 삭제
**권한**: Member+

**Response** `200 OK`
```json
{
  "message": "체크리스트 항목이 삭제되었습니다"
}
```

### PATCH /boards/{boardId}/tasks/{taskId}/checklist/{itemId}/toggle - 완료 토글
**권한**: Member+

**Response** `200 OK` - 항목 상세 (is_completed 변경됨)

---

## 8. 멤버 (Members)

### GET /boards/{boardId}/members - 멤버 목록
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "total": 8,
  "billable": 7,
  "members": [
    {
      "id": "member-uuid",
      "user": {
        "id": "user-uuid",
        "name": "홍길동",
        "email": "hong@example.com",
        "profile_image": null
      },
      "role": "OWNER",
      "joined_at": "2025-01-08T00:00:00",
      "invited_by": null
    },
    {
      "id": "member-uuid",
      "user": {
        "id": "user-uuid",
        "name": "김개발",
        "email": "kim@example.com",
        "profile_image": null
      },
      "role": "MEMBER",
      "joined_at": "2025-01-09T00:00:00",
      "invited_by": {
        "id": "user-uuid",
        "name": "홍길동"
      }
    }
  ]
}
```

### POST /boards/{boardId}/members/invite - 멤버 초대
**권한**: Admin+

> 이미 가입된 사용자를 이메일로 직접 초대

**Request**
```json
{
  "email": "newmember@example.com",
  "role": "MEMBER"
}
```

> role: `ADMIN`, `MEMBER`, `VIEWER` (OWNER 불가)

**Response** `201 Created` - 멤버 상세

### PUT /boards/{boardId}/members/{memberId}/role - 역할 변경
**권한**: Admin+

> Owner의 역할은 변경 불가

**Request**
```json
{
  "role": "ADMIN"
}
```

**Response** `200 OK` - 멤버 상세

### DELETE /boards/{boardId}/members/{memberId} - 멤버 내보내기
**권한**: Admin+

> Owner는 내보낼 수 없음

**Response** `200 OK`
```json
{
  "message": "멤버가 내보내졌습니다"
}
```

---

## 9. 초대 링크 (Invite Links)

### GET /boards/{boardId}/invites - 초대 링크 목록
**권한**: Admin+

**Response** `200 OK`
```json
{
  "invites": [
    {
      "id": "invite-uuid",
      "code": "abc123xyz789",
      "role": "MEMBER",
      "max_uses": 10,
      "used_count": 3,
      "expires_at": "2025-01-15T00:00:00",
      "is_active": true,
      "created_by": {
        "id": "user-uuid",
        "name": "홍길동"
      },
      "created_at": "2025-01-08T00:00:00"
    }
  ]
}
```

### POST /boards/{boardId}/invites - 초대 링크 생성
**권한**: Admin+

**Request**
```json
{
  "role": "MEMBER",
  "max_uses": 10,
  "expires_in_hours": 168
}
```

> role: `ADMIN`, `MEMBER`, `VIEWER` (OWNER 불가)
> max_uses: null이면 무제한
> expires_in_hours: null이면 만료 없음

**Response** `201 Created` - 초대 링크 상세

### DELETE /boards/{boardId}/invites/{inviteId} - 초대 링크 비활성화
**권한**: Admin+

**Response** `200 OK`
```json
{
  "message": "초대 링크가 비활성화되었습니다"
}
```

### GET /invites/{code} - 초대 링크 정보 (공개)
**권한**: Public

**Response** `200 OK`
```json
{
  "board_id": "board-uuid",
  "board_name": "개발팀 칸반",
  "role": "MEMBER",
  "is_valid": true,
  "message": "유효한 초대 링크입니다"
}
```

### POST /invites/{code}/accept - 초대 수락
**권한**: User

**Response** `200 OK`
```json
{
  "board_id": "board-uuid",
  "board_name": "개발팀 칸반",
  "role": "MEMBER",
  "message": "보드에 성공적으로 참가했습니다"
}
```

---

## 10. 활동 로그 (Activities)

### GET /boards/{boardId}/activities - 활동 로그 조회
**권한**: Viewer+

**Query Parameters**
- `cursor` (optional): ISO 8601 datetime, 페이지네이션용
- `limit` (optional): 기본값 20

**Response** `200 OK`
```json
{
  "activities": [
    {
      "id": "log-uuid",
      "user": {
        "id": "user-uuid",
        "name": "김개발",
        "profile_image": null
      },
      "action": "TASK_MOVED",
      "target_type": "TASK",
      "target_id": "task-uuid",
      "metadata": {
        "task_title": "로그인 API 개발",
        "from_block": "In Progress",
        "to_block": "Done"
      },
      "created_at": "2025-01-08T12:00:00"
    }
  ],
  "has_more": true,
  "next_cursor": "2025-01-08T11:00:00"
}
```

**Action 종류**
- `BOARD_CREATED`, `BOARD_UPDATED`
- `BLOCK_CREATED`, `BLOCK_UPDATED`, `BLOCK_DELETED`, `BLOCK_REORDERED`
- `FEATURE_CREATED`, `FEATURE_UPDATED`, `FEATURE_DELETED`, `FEATURE_COMPLETED`
- `TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `TASK_MOVED`, `TASK_COMPLETED`, `TASK_REOPENED`
- `TAG_CREATED`, `TAG_DELETED`
- `MEMBER_INVITED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `MEMBER_REMOVED`, `MEMBER_ROLE_CHANGED`
- `SUBSCRIPTION_STARTED`, `SUBSCRIPTION_PLAN_CHANGED`, `SUBSCRIPTION_CANCELED`

### GET /boards/{boardId}/activities/target/{targetType}/{targetId} - 특정 대상 활동 로그
**권한**: Viewer+

> 특정 Feature나 Task의 활동 로그만 조회

**Path Parameters**
- `targetType`: `BOARD`, `BLOCK`, `FEATURE`, `TASK`, `TAG`, `MEMBER`, `SUBSCRIPTION`
- `targetId`: 대상 ID

**Response** `200 OK`
```json
[
  {
    "id": "log-uuid",
    "user": {
      "id": "user-uuid",
      "name": "김개발",
      "profile_image": null
    },
    "action": "TASK_UPDATED",
    "target_type": "TASK",
    "target_id": "task-uuid",
    "metadata": {
      "task_title": "로그인 API 개발",
      "changes": ["title", "description"]
    },
    "created_at": "2025-01-08T12:00:00"
  }
]
```

---

## 11. 구독 (Subscription)

### GET /pricing - 요금제 목록 (공개)
**권한**: Public

**Response** `200 OK`
```json
{
  "plans": [
    {
      "id": "team_10",
      "name": "팀 10",
      "min_members": 4,
      "max_members": 10,
      "monthly_price": 29000,
      "yearly_price": 290000,
      "yearly_monthly_price": 24166,
      "discount_percentage": 16
    }
  ],
  "currency": "KRW",
  "trial_days": "7"
}
```

### GET /boards/{boardId}/subscription - 구독 정보
**권한**: Viewer+

**Response** `200 OK`
```json
{
  "id": "subscription-uuid",
  "status": "TRIAL",
  "plan": null,
  "billing_cycle": null,
  "price": null,
  "trial_ends_at": "2025-01-15T00:00:00",
  "grace_ends_at": null,
  "current_period_start": null,
  "current_period_end": null,
  "billable_member_count": 5,
  "member_limit": 5,
  "next_payment_at": null,
  "created_at": "2025-01-08T00:00:00"
}
```

**Status 종류**
- `TRIAL`: 체험 기간 (7일)
- `ACTIVE`: 정상 구독 중
- `GRACE`: 유예 기간 (3일)
- `SUSPENDED`: 정지됨
- `CANCELED`: 취소됨

### POST /boards/{boardId}/subscription/start - 구독 시작
**권한**: Owner

**Request**
```json
{
  "plan_id": "team_10",
  "billing_cycle": "YEARLY",
  "payment_method_id": "pm_xxx"
}
```

> billing_cycle: `MONTHLY`, `YEARLY`

**Response** `200 OK` - 구독 정보

### PUT /boards/{boardId}/subscription/plan - 플랜 변경
**권한**: Owner

**Request**
```json
{
  "plan_id": "team_25",
  "billing_cycle": "YEARLY"
}
```

**Response** `200 OK` - 구독 정보

### DELETE /boards/{boardId}/subscription - 구독 취소
**권한**: Owner

**Response** `200 OK`
```json
{
  "message": "구독이 취소되었습니다"
}
```
