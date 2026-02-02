---
title: API Documentation
version: 1.1.0
updated: 2026-02-02
history:
  - v1.1.0: 2026-02-02
  - v1.0.0: 2026-02-02
---

# API Documentation

## Base URL

```
http://localhost:8080/api/v1
```

## Authentication

- JWT Access Token (Bearer) in Authorization header
- Access Token 만료: 1시간 (3,600,000ms)
- Refresh Token 만료: 7일 (604,800,000ms)
- 알고리즘: HMAC SHA256

## 응답 형식

```json
// 성공
{
  "data": { ... }
}

// 에러
{
  "error": {
    "code": "FORBIDDEN",
    "message": "권한이 없습니다.",
    "details": { ... }
  }
}
```

## 권한 표기

| 표기 | 의미 |
|------|------|
| Public | 누구나 |
| User | 로그인 필요 |
| Board.Viewer+ | Viewer 이상 |
| Board.Member+ | Member 이상 |
| Board.Admin+ | Admin 이상 |
| Board.Owner | Owner만 |

---

## Endpoints

### 1. Authentication (`/api/v1/auth`)

#### POST /auth/signup
사용자 회원가입

**Auth:** Public

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| email | string | O | 이메일 |
| password | string | O | 비밀번호 (8자 이상, 대/소문자, 숫자, 특수문자 포함) |
| name | string | O | 이름 |

**Response:** `TokenResponse`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "profile_image": null,
    "email_verified": false,
    "provider": "email",
    "system_role": "USER"
  }
}
```

#### POST /auth/login
이메일/비밀번호 로그인

**Auth:** Public

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| email | string | O | 이메일 |
| password | string | O | 비밀번호 |

**Response:** `TokenResponse`

#### POST /auth/google
Google OAuth 로그인

**Auth:** Public

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| token | string | O | Google ID Token |

**Response:** `TokenResponse`

#### POST /auth/refresh
Access Token 갱신

**Auth:** Public

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| refreshToken | string | O | Refresh Token |

**Response:** `TokenResponse`

#### POST /auth/logout
로그아웃 (Refresh Token 무효화)

**Auth:** User

**Response:**
```json
{ "message": "로그아웃 되었습니다." }
```

#### GET /auth/me
현재 사용자 정보

**Auth:** User

**Response:**
```json
{ "user_id": "uuid", "email": "user@example.com" }
```

#### GET /auth/verify-email?token={token}
이메일 인증

**Auth:** Public

#### POST /auth/resend-verification
인증 이메일 재전송

**Auth:** Public

**Request:** `{ "email": "user@example.com" }`

#### POST /auth/forgot-password
비밀번호 재설정 요청

**Auth:** Public

**Request:** `{ "email": "user@example.com" }`

#### POST /auth/reset-password
비밀번호 재설정

**Auth:** Public

**Request:** `{ "token": "reset-token", "newPassword": "newPass123!" }`

---

### 2. Users (`/api/v1/users`)

#### GET /users/me
현재 사용자 프로필 조회

**Auth:** User

**Response:** `User` 객체

#### PATCH /users/me
사용자 프로필 수정

**Auth:** User

**Request:** `UpdateProfileRequest`
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| name | string | X | 이름 |
| profileImage | string | X | 프로필 이미지 URL |
| theme | string | X | 테마 (dark, light) |

#### POST /users/me/password
비밀번호 변경

**Auth:** User

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| currentPassword | string | O | 현재 비밀번호 |
| newPassword | string | O | 새 비밀번호 |

#### DELETE /users/me
계정 삭제

**Auth:** User

---

### 3. Boards (`/api/v1/boards`)

#### POST /boards
보드 생성

**Auth:** User

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| name | string | O | 보드 이름 (max 100) |
| description | string | X | 설명 |

**Response:** `BoardResponse.Detail`

#### GET /boards
내 보드 목록 조회

**Auth:** User

**Response:** `List<BoardResponse.Simple>`

#### GET /boards/{boardId}
보드 상세 조회

**Auth:** Board.Viewer+

**Response:** `BoardResponse.Detail`

#### PUT /boards/{boardId}
보드 정보 수정

**Auth:** Board.Admin+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| name | string | X | 보드 이름 |
| description | string | X | 설명 |
| workHoursPerDay | int | X | 일일 근무시간 |
| workStartTime | string | X | 근무 시작 시간 (HH:mm) |
| scheduleDisplayMode | string | X | 스케줄 표시 모드 |

#### DELETE /boards/{boardId}
보드 삭제

**Auth:** Board.Owner

#### PATCH /boards/{boardId}/star
보드 즐겨찾기 토글

**Auth:** Board.Viewer+

#### PATCH /boards/{boardId}/selected-milestone
선택 마일스톤 변경

**Auth:** Board.Admin+

**Request:** `{ "milestoneId": "uuid" }`

#### GET /boards/{boardId}/tier
보드 티어 정보 조회

**Auth:** Board.Viewer+

**Response:** `BoardResponse.TierInfo`

#### GET /boards/{boardId}/limits
보드 제한 사항 조회

**Auth:** Board.Viewer+

**Response:** `BoardResponse.Limits`

---

### 4. Blocks (`/api/v1/boards/{boardId}/blocks`)

#### GET /boards/{boardId}/blocks
블록 목록 조회

**Auth:** Board.Viewer+

**Response:** `BlockResponse.ListResponse`

#### POST /boards/{boardId}/blocks
커스텀 블록 생성

**Auth:** Board.Admin+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| name | string | O | 블록 이름 (max 50) |
| color | string | X | 색상 |

#### PUT /boards/{boardId}/blocks/{blockId}
커스텀 블록 수정

**Auth:** Board.Admin+

#### DELETE /boards/{boardId}/blocks/{blockId}
커스텀 블록 삭제

**Auth:** Board.Admin+

#### PUT /boards/{boardId}/blocks/reorder
블록 순서 변경

**Auth:** Board.Admin+

**Request:** `{ "blockIds": ["id1", "id2", ...] }`

---

### 5. Features (`/api/v1/boards/{boardId}/features`)

#### GET /boards/{boardId}/features
Feature 목록 조회

**Auth:** Board.Viewer+

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| milestoneId | string | 마일스톤별 필터 (선택) |

**Response:** `FeatureResponse.ListResponse`

#### GET /boards/{boardId}/features/{featureId}
Feature 상세 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/features
Feature 생성

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| title | string | O | 제목 (max 200) |
| description | string | X | 설명 |
| color | string | X | 색상 |
| assigneeId | string | X | 담당자 ID |
| priority | string | X | 우선순위 (HIGH, MEDIUM, LOW) |
| dueDate | string | X | 마감일 (YYYY-MM-DD) |

#### PUT /boards/{boardId}/features/{featureId}
Feature 수정

**Auth:** Board.Member+

#### DELETE /boards/{boardId}/features/{featureId}
Feature 삭제

**Auth:** Board.Member+

#### PUT /boards/{boardId}/features/reorder
Feature 순서 변경

**Auth:** Board.Member+

---

### 6. Tasks (`/api/v1/boards/{boardId}`)

#### GET /boards/{boardId}/tasks
Task 목록 조회

**Auth:** Board.Viewer+

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| blockId | string | 블록별 필터 |
| featureId | string | Feature별 필터 |
| milestoneId | string | 마일스톤별 필터 |

#### GET /boards/{boardId}/tasks/{taskId}
Task 상세 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/features/{featureId}/tasks
Task 생성 (Feature 하위)

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| title | string | O | 제목 (max 200) |
| description | string | X | 설명 |
| startDate | string | X | 시작일 |
| dueDate | string | X | 마감일 |
| estimatedMinutes | int | X | 예상 소요시간(분) |

> Standard 보드: Task 10개 제한

#### PUT /boards/{boardId}/tasks/{taskId}
Task 수정

**Auth:** Board.Member+

#### DELETE /boards/{boardId}/tasks/{taskId}
Task 삭제

**Auth:** Board.Member+

#### PUT /boards/{boardId}/tasks/{taskId}/move
Task 블록 이동

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| blockId | string | O | 대상 블록 ID |
| position | int | X | 위치 |

> Done 블록 이동 시 자동 완료, Feature 진행률 업데이트

#### PUT /boards/{boardId}/tasks/{taskId}/dates
Task 날짜 수정

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| startDate | string | X | 시작일 |
| dueDate | string | X | 마감일 |

---

### 7. Tags (`/api/v1/boards/{boardId}/tags`)

#### GET /boards/{boardId}/tags
태그 목록 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/tags
태그 생성

**Auth:** Board.Admin+

**Request:** `{ "name": "태그명", "color": "#FF0000" }`

#### PUT /boards/{boardId}/tags/{tagId}
태그 수정

**Auth:** Board.Admin+

#### DELETE /boards/{boardId}/tags/{tagId}
태그 삭제

**Auth:** Board.Admin+

---

### 8. Checklists (`/api/v1/boards/{boardId}/tasks/{taskId}/checklists`)

#### GET /boards/{boardId}/tasks/{taskId}/checklists
체크리스트 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/tasks/{taskId}/checklists
체크리스트 항목 추가

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| title | string | O | 항목 제목 |
| assigneeId | string | X | 담당자 ID |
| startDate | string | X | 시작일 |
| dueDate | string | X | 마감일 |

#### PUT /boards/{boardId}/tasks/{taskId}/checklists/{itemId}
체크리스트 항목 수정

**Auth:** Board.Member+

#### DELETE /boards/{boardId}/tasks/{taskId}/checklists/{itemId}
체크리스트 항목 삭제

**Auth:** Board.Member+

#### PATCH /boards/{boardId}/tasks/{taskId}/checklists/{itemId}/toggle
체크리스트 완료 토글

**Auth:** Board.Member+

---

### 9. Comments (`/api/v1/boards/{boardId}/tasks/{taskId}/comments`)

#### GET /boards/{boardId}/tasks/{taskId}/comments
태스크 댓글 목록 조회

**Auth:** Board.Viewer+

**Response:**
```json
{
  "comments": [
    {
      "id": "uuid",
      "task_id": "uuid",
      "author": { "id": "uuid", "name": "홍길동", "profile_image": null },
      "content": "댓글 내용",
      "mentions": ["userId1", "userId2"],
      "created_at": "2026-02-02T12:00:00",
      "updated_at": "2026-02-02T12:00:00"
    }
  ],
  "total_count": 1
}
```

#### POST /boards/{boardId}/tasks/{taskId}/comments
댓글 작성

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| content | string | O | 댓글 내용 |
| mentions | string[] | X | 멘션할 사용자 ID 목록 |

**Response:** `CommentDetailResponse`

> 멘션된 사용자에게 Notification 자동 생성

#### PUT /boards/{boardId}/tasks/{taskId}/comments/{commentId}
댓글 수정 (본인만)

**Auth:** Board.Member+ (작성자 본인)

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| content | string | O | 수정할 내용 |
| mentions | string[] | X | 멘션할 사용자 ID 목록 |

#### DELETE /boards/{boardId}/tasks/{taskId}/comments/{commentId}
댓글 삭제 (본인만)

**Auth:** Board.Member+ (작성자 본인)

---

### 10. Members (`/api/v1/boards/{boardId}/members`)

#### GET /boards/{boardId}/members
멤버 목록 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/members/invite
이메일로 멤버 초대

**Auth:** Board.Admin+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| email | string | O | 초대할 이메일 |
| role | string | O | 역할 (ADMIN, MEMBER, VIEWER) |

#### PUT /boards/{boardId}/members/{memberId}/role
멤버 역할 변경

**Auth:** Board.Admin+

**Request:** `{ "role": "MEMBER" }`

#### DELETE /boards/{boardId}/members/{memberId}
멤버 제거

**Auth:** Board.Admin+

---

### 11. Invite Links

#### GET /boards/{boardId}/invites
초대 링크 목록 조회

**Auth:** Board.Admin+

#### POST /boards/{boardId}/invites
초대 링크 생성

**Auth:** Board.Admin+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| role | string | O | 초대 역할 |
| maxUses | int | X | 최대 사용 횟수 |
| expiresAt | string | X | 만료일 |

#### DELETE /boards/{boardId}/invites/{inviteId}
초대 링크 비활성화

**Auth:** Board.Admin+

#### GET /invites/{code}
초대 링크 정보 조회

**Auth:** Public

#### POST /invites/{code}/accept
초대 수락

**Auth:** User

---

### 12. Milestones (`/api/v1/boards/{boardId}/milestones`)

#### GET /boards/{boardId}/milestones
마일스톤 목록 조회

**Auth:** Board.Viewer+

#### GET /boards/{boardId}/milestones/{milestoneId}
마일스톤 상세 조회

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/milestones
마일스톤 생성

**Auth:** Board.Member+

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| title | string | O | 제목 |
| description | string | X | 설명 |
| startDate | string | O | 시작일 |
| endDate | string | O | 종료일 |

#### PUT /boards/{boardId}/milestones/{milestoneId}
마일스톤 수정

**Auth:** Board.Member+

#### DELETE /boards/{boardId}/milestones/{milestoneId}
마일스톤 삭제

**Auth:** Board.Member+

#### POST /boards/{boardId}/milestones/{milestoneId}/features
마일스톤에 Feature 추가

**Auth:** Board.Member+

**Request:** `{ "featureIds": ["id1", "id2"] }`

#### DELETE /boards/{boardId}/milestones/{milestoneId}/features/{featureId}
마일스톤에서 Feature 제거

**Auth:** Board.Member+

#### GET /boards/{boardId}/milestones/{milestoneId}/allocations
마일스톤 할당 목록

**Auth:** Board.Viewer+

#### POST /boards/{boardId}/milestones/{milestoneId}/allocations
마일스톤 할당 생성

**Auth:** Board.Member+

#### PUT /boards/{boardId}/milestones/{milestoneId}/allocations/{allocationId}
마일스톤 할당 수정

**Auth:** Board.Member+

#### DELETE /boards/{boardId}/milestones/{milestoneId}/allocations/{allocationId}
마일스톤 할당 삭제

**Auth:** Board.Member+

---

### 13. Schedule (`/api/v1/boards/{boardId}/schedules`)

> Premium 전용

#### GET /boards/{boardId}/schedules
데일리 스케줄 조회

**Auth:** Board.Viewer+ (Premium)

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| date | string | 날짜 (YYYY-MM-DD, 필수) |
| assigneeIds | string[] | 담당자 ID 목록 (선택) |

**Response:** `ScheduleResponse.DailySchedule`

#### POST /boards/{boardId}/schedules
스케줄 블록 생성

**Auth:** Board.Member+ (Premium)

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| assigneeId | string | O | 담당자 ID |
| scheduledDate | string | O | 날짜 (YYYY-MM-DD) |
| startTime | string | O | 시작 시간 (HH:mm) |
| endTime | string | O | 종료 시간 (HH:mm) |
| checklistItemId | string | X | 체크리스트 항목 ID |

**Response:** `ScheduleResponse.BlockDetail`

#### POST /boards/{boardId}/schedules/with-checklist-item
체크리스트 항목 생성과 함께 스케줄 블록 생성

**Auth:** Board.Member+ (Premium)

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| assigneeId | string | O | 담당자 ID |
| scheduledDate | string | O | 날짜 (YYYY-MM-DD) |
| startTime | string | O | 시작 시간 (HH:mm) |
| endTime | string | O | 종료 시간 (HH:mm) |
| checklistItem | object | O | 체크리스트 항목 정보 |
| checklistItem.taskId | string | O | Task ID |
| checklistItem.title | string | O | 제목 (max 200) |
| checklistItem.startDate | string | X | 시작일 |
| checklistItem.dueDate | string | X | 마감일 |

**Response:** `ScheduleResponse.BlockDetail`

#### PUT /boards/{boardId}/schedules/{blockId}
스케줄 블록 수정

**Auth:** Board.Member+ (Premium)

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| startTime | string | X | 시작 시간 (HH:mm) |
| endTime | string | X | 종료 시간 (HH:mm) |

**Response:** `ScheduleResponse.BlockDetail`

#### DELETE /boards/{boardId}/schedules/{blockId}
스케줄 블록 삭제

**Auth:** Board.Member+ (Premium)

#### GET /boards/{boardId}/schedules/settings
스케줄 설정 조회

**Auth:** Board.Viewer+ (Premium)

**Response:** `ScheduleResponse.SettingsInfo`

#### PUT /boards/{boardId}/schedules/settings
스케줄 설정 수정

**Auth:** Board.Admin+ (Premium)

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| workHoursPerDay | int | X | 일일 근무시간 |
| workStartTime | string | X | 근무 시작 시간 (HH:mm) |
| scheduleDisplayMode | string | X | 스케줄 표시 모드 |

**Response:** `ScheduleResponse.SettingsInfo`

#### GET /boards/{boardId}/schedules/checklist-item/{checklistItemId}
특정 체크리스트 항목의 스케줄 블록 조회

**Auth:** Board.Viewer+ (Premium)

**Response:** `List<ScheduleResponse.BlockDetail>`

---

### 14. Activity Log (`/api/v1/boards/{boardId}/activities`)

#### GET /boards/{boardId}/activities
활동 로그 조회

**Auth:** Board.Viewer+

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| cursor | string | 커서 (페이지네이션) |
| limit | int | 조회 수 (기본 20) |

#### GET /boards/{boardId}/activities/target/{targetType}/{targetId}
특정 대상의 활동 로그

**Auth:** Board.Viewer+

---

### 15. Subscription (`/api/v1/boards/{boardId}/subscription`)

#### GET /pricing
요금제 목록 조회

**Auth:** Public

#### GET /boards/{boardId}/subscription
구독 상태 조회

**Auth:** Board.Admin+

#### POST /boards/{boardId}/subscription/start
구독 시작 (Premium 전환)

**Auth:** Board.Owner

**Request:**
| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| billingCycle | string | O | 결제 주기 (MONTHLY, YEARLY) |
| paymentMethodId | string | X | 결제 수단 ID |

#### PUT /boards/{boardId}/subscription/plan
구독 플랜 변경

**Auth:** Board.Owner

**Request:** `{ "billingCycle": "YEARLY" }`

#### DELETE /boards/{boardId}/subscription
구독 취소

**Auth:** Board.Owner

---

### 15. Statistics

#### GET /boards/{boardId}/statistics
보드 통계 조회

**Auth:** Board.Viewer+

#### GET /boards/{boardId}/statistics/personal
개인 통계 조회

**Auth:** Board.Viewer+

#### GET /boards/{boardId}/statistics/management
관리 통계 조회

**Auth:** Board.Admin+

#### GET /boards/{boardId}/statistics/weight-settings
가중치 설정 조회

**Auth:** Board.Viewer+

#### PUT /boards/{boardId}/statistics/weight-settings
가중치 설정 수정

**Auth:** Board.Admin+

---

### 16. Health & System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | 헬스체크 | Public |
| GET | `/actuator/**` | Actuator 엔드포인트 | Public |

---

## 에러 코드

| 코드 | 설명 |
|------|------|
| C001 | 공통 - 잘못된 요청 |
| C002 | 공통 - 내부 서버 오류 |
| A001 | 인증 - 잘못된 자격 증명 |
| A002 | 인증 - 만료된 토큰 |
| A003 | 인증 - 유효하지 않은 토큰 |
| A004 | 인증 - 이미 등록된 이메일 |
| A005 | 인증 - 이메일 미인증 |
| U001 | 사용자 - 사용자 없음 |
| B001 | 보드 - 보드 없음 |
| B002 | 보드 - 권한 없음 |
| B003 | 보드 - 멤버 아님 |
| B004 | 보드 - Task 제한 초과 |
| BL001 | 블록 - 블록 없음 |
| BL002 | 블록 - 고정 블록 수정 불가 |
| BL003 | 블록 - 고정 블록 삭제 불가 |
| F001 | Feature - Feature 없음 |
| T001 | Task - Task 없음 |
| T002 | Task - 이동 불가 |
| T003 | Task - Standard 보드 제한 |
| TG001 | 태그 - 태그 없음 |
| TG002 | 태그 - 중복 이름 |
| CL001 | 체크리스트 - 항목 없음 |
| M001 | 멤버 - 멤버 없음 |
| M002 | 멤버 - 이미 멤버 |
| M003 | 멤버 - Owner 제거 불가 |
| M004 | 멤버 - 역할 변경 불가 |
| I001 | 초대 - 초대 링크 없음 |
| I002 | 초대 - 만료된 링크 |
| I003 | 초대 - 사용 한도 초과 |
| S001 | 구독 - 구독 없음 |
| S002 | 구독 - 이미 활성 |
| S003 | 구독 - 결제 실패 |
| S004 | 구독 - Premium 전용 기능 |
