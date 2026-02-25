# Organization Service - API Specification

> **Version**: v1.0.0 | **Date**: 2026-02-25
> **Base URL**: `/api/v1`
> **JSON 필드**: `snake_case` (Jackson SNAKE_CASE 전략)

---

## 1. Organization CRUD

### 1.1 조직 생성
```
POST /api/v1/organizations
Auth: User
```

**Request:**
```json
{
  "name": "CookApps",
  "description": "게임 개발 스튜디오"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "CookApps",
    "description": "게임 개발 스튜디오",
    "logo_url": null,
    "owner": {
      "id": "uuid",
      "name": "Admin",
      "email": "admin@cookapps.com",
      "profile_image": null
    },
    "member_count": 1,
    "board_count": 0,
    "my_role": "OWNER",
    "created_at": "2026-02-25T10:00:00"
  }
}
```

**로직:**
1. Organization 생성
2. 요청자를 OrgRole.OWNER로 OrganizationMember 추가
3. 기본 휴가 정책 4개 자동 생성 (연차 15일, 병가 10일, 리프레시 5일, 기타 0일)

---

### 1.2 내 조직 목록
```
GET /api/v1/organizations
Auth: User
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "CookApps",
      "description": "게임 개발 스튜디오",
      "logo_url": "https://cdn.example.com/logo.png",
      "owner": { "id": "uuid", "name": "Admin" },
      "member_count": 12,
      "board_count": 3,
      "my_role": "ADMIN",
      "created_at": "2026-02-25T10:00:00"
    }
  ]
}
```

---

### 1.3 조직 상세 조회
```
GET /api/v1/organizations/{orgId}
Auth: OrgMember+
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "CookApps",
    "description": "게임 개발 스튜디오",
    "logo_url": "https://cdn.example.com/logo.png",
    "owner": {
      "id": "uuid",
      "name": "Admin",
      "email": "admin@cookapps.com",
      "profile_image": null
    },
    "member_count": 12,
    "board_count": 3,
    "my_role": "ADMIN",
    "departments": [
      { "id": "dept-uuid-1", "name": "Rabbit Hole" },
      { "id": "dept-uuid-2", "name": "Business" },
      { "id": "dept-uuid-3", "name": "Marketing" }
    ],
    "job_groups": [
      { "id": "jg-uuid-1", "name": "개발" },
      { "id": "jg-uuid-2", "name": "기획" },
      { "id": "jg-uuid-3", "name": "디자인" },
      { "id": "jg-uuid-4", "name": "마케팅" }
    ],
    "today_leave_count": 2,
    "created_at": "2026-02-25T10:00:00",
    "updated_at": "2026-02-25T10:00:00"
  }
}
```

---

### 1.4 조직 수정
```
PUT /api/v1/organizations/{orgId}
Auth: OrgAdmin+
```

**Request:**
```json
{
  "name": "CookApps Studio",
  "description": "Updated description"
}
```

---

### 1.5 조직 로고 업로드
```
POST /api/v1/organizations/{orgId}/logo
Auth: OrgAdmin+
Content-Type: multipart/form-data
```

**Request:** `file` (이미지 파일)

**Response (200):**
```json
{
  "data": {
    "logo_url": "https://cdn.example.com/orgs/uuid/logo.png"
  }
}
```

---

### 1.6 조직 삭제
```
DELETE /api/v1/organizations/{orgId}
Auth: OrgOwner
```

**Response (204):** No Content

**로직:** Soft delete (deleted_at 설정). 소속 보드의 organization_id는 NULL로.

---

## 2. Organization Members

### 2.1 구성원 목록 조회
```
GET /api/v1/organizations/{orgId}/members
Auth: OrgMember+
```

**Query Parameters:**
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `department_id` | string (UUID) | 부서 ID 필터 |
| `job_group_id` | string (UUID) | 직무 그룹 ID 필터 |
| `contract_type` | string | 계약 형태 필터 (FULL_TIME/CONTRACT/INTERN/PART_TIME) |
| `work_status` | string | 근무 상태 필터 (ACTIVE/ON_LEAVE/RESIGNED) |
| `search` | string | 이름/이메일 검색 |
| `sort` | string | 정렬 (hire_date_desc, hire_date_asc, name_asc) |
| `page` | int | 페이지 (0-based, default: 0) |
| `size` | int | 페이지 크기 (default: 20) |

**Response (200):**
```json
{
  "data": {
    "content": [
      {
        "id": "member-uuid",
        "user": {
          "id": "user-uuid",
          "name": "최성섭",
          "email": "ss@cookapps.com",
          "profile_image": "https://..."
        },
        "role": "MEMBER",
        "department": { "id": "dept-uuid", "name": "Rabbit Hole" },
        "job_group": { "id": "jobgroup-uuid", "name": "개발" },
        "job_title": "게임 클라이언트 개발",
        "contract_type": "FULL_TIME",
        "work_status": "ACTIVE",
        "hire_date": "2026-02-11",
        "joined_at": "2026-02-11T00:00:00"
      }
    ],
    "total_elements": 12,
    "total_pages": 1,
    "page": 0,
    "size": 20
  }
}
```

---

### 2.2 구성원 프로필 상세
```
GET /api/v1/organizations/{orgId}/members/{memberId}
Auth: OrgMember+
```

**Response (200):**
```json
{
  "data": {
    "id": "member-uuid",
    "user": {
      "id": "user-uuid",
      "name": "최성섭",
      "email": "ss@cookapps.com",
      "profile_image": "https://..."
    },
    "role": "MEMBER",
    "department": { "id": "dept-uuid", "name": "Rabbit Hole" },
    "job_group": { "id": "jobgroup-uuid", "name": "개발" },
    "job_title": "게임 클라이언트 개발",
    "contract_type": "FULL_TIME",
    "work_status": "ACTIVE",
    "employee_id": "CA00419",
    "phone": "010-4080-2491",
    "birth_date": "1995-05-16",
    "hire_date": "2026-02-11",
    "bio": "• 나의 취미: 게임 플레이\n• MBTI: INTJ",
    "tenure_months": 0,
    "leave_summary": {
      "annual": { "total": 15.0, "used": 3.0, "remaining": 12.0 },
      "sick": { "total": 10.0, "used": 0.0, "remaining": 10.0 },
      "refresh": { "total": 5.0, "used": 0.0, "remaining": 5.0 }
    },
    "joined_at": "2026-02-11T00:00:00"
  }
}
```

---

### 2.3 멤버 초대 (이메일)
```
POST /api/v1/organizations/{orgId}/members
Auth: OrgAdmin+
```

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "MEMBER",
  "department_id": "dept-uuid",
  "job_title": "기획자"
}
```

**Response (201):**
```json
{
  "data": {
    "type": "direct_add",
    "member": { "id": "uuid", "user": { "name": "...", "email": "..." }, "role": "MEMBER" }
  }
}
```
또는 (미가입 유저):
```json
{
  "data": {
    "type": "email_sent",
    "email": "newuser@example.com",
    "role": "MEMBER"
  }
}
```

**로직:**
1. 이메일로 User 검색
2. 존재 → 직접 OrganizationMember 추가
3. 미존재 → OrganizationInviteLink 생성 (1회용, 7일) + 이메일 발송

---

### 2.4 멤버 정보 수정
```
PUT /api/v1/organizations/{orgId}/members/{memberId}
Auth: OrgAdmin+ 또는 본인
```

**Request:**
```json
{
  "department_id": "dept-uuid",
  "job_group_id": "jobgroup-uuid",
  "job_title": "UA 마케팅",
  "contract_type": "CONTRACT",
  "phone": "010-1234-5678",
  "birth_date": "1995-05-16",
  "bio": "자기소개 텍스트"
}
```

> 본인 수정 시: `department_id`, `job_group_id`, `contract_type`, `work_status`, `employee_id`, `hire_date` 수정 불가 (Admin+ only)

---

### 2.5 멤버 역할 변경
```
PUT /api/v1/organizations/{orgId}/members/{memberId}/role
Auth: OrgAdmin+
```

**Request:**
```json
{
  "role": "ADMIN"
}
```

**제약:** OWNER 역할 변경 불가. OWNER 이양은 별도 API.

---

### 2.6 멤버 제거
```
DELETE /api/v1/organizations/{orgId}/members/{memberId}
Auth: OrgAdmin+
```

**제약:** OWNER 제거 불가. 본인 탈퇴는 허용.

**[R3] 연쇄 제거 로직:**
1. **보드 Owner 사전 검증**: 해당 멤버가 조직 보드의 Owner인지 확인 → Owner이면 400 `CANNOT_REMOVE_BOARD_OWNER` (보드 소유권 이양 필요)
2. **PENDING 휴가 자동 취소**: 해당 멤버의 PENDING 상태 leave_requests → CANCELED 처리
3. 해당 멤버가 소속된 **조직 보드** 목록 조회 (`boards WHERE organization_id = orgId`)
4. 해당 보드들에서 이 유저를 **board_members에서 자동 제거**
5. OrganizationMember 삭제 (leave_balances ON DELETE CASCADE)
6. 응답에 영향받은 보드 목록 포함

**Response (200):**
```json
{
  "data": {
    "removed_member": {
      "id": "member-uuid",
      "name": "김철수"
    },
    "cascade_removed_from_boards": [
      { "board_id": "board-uuid-1", "board_name": "BRIDGE 프로덕트" },
      { "board_id": "board-uuid-2", "board_name": "Marketing Board" }
    ]
  }
}
```

> **주의**: 제거 전 확인 다이얼로그에서 영향받는 보드 목록을 표시해야 함.

---

## 3. Organization Boards

### 3.1 조직 보드 목록
```
GET /api/v1/organizations/{orgId}/boards
Auth: OrgMember+
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "board-uuid",
      "name": "BRIDGE 프로덕트",
      "description": "...",
      "owner": { "id": "uuid", "name": "Admin" },
      "member_count": 6,
      "task_progress": { "total": 10, "completed": 2 },
      "tier": "PREMIUM",
      "created_at": "2025-01-01T00:00:00"
    }
  ]
}
```

---

### 3.2 보드 편입 적격성 확인

```
GET /api/v1/organizations/{orgId}/boards/check-eligibility
Auth: OrgAdmin+ AND BoardOwner
```

**Query Parameters:**
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `board_id` | string (UUID) | 편입 대상 보드 ID |

**Response (200):**
```json
{
  "data": {
    "board_id": "board-uuid",
    "board_name": "Design Board",
    "is_eligible": true,
    "total_members": 4,
    "non_org_members": []
  }
}
```

또는 (비조직원 존재 시):
```json
{
  "data": {
    "board_id": "board-uuid",
    "board_name": "Side Project Board",
    "is_eligible": false,
    "total_members": 3,
    "non_org_members": [
      {
        "user_id": "user-uuid",
        "name": "Guest User",
        "email": "guest@email.com"
      }
    ]
  }
}
```

---

### 3.3 보드 편입 (조직에 추가)
```
POST /api/v1/organizations/{orgId}/boards
Auth: OrgAdmin+ AND BoardOwner
```

**Request:**
```json
{
  "board_id": "board-uuid"
}
```

**Validation (R1 규칙 적용):**
- **[R1] 보드 멤버 전원이 조직원인지 검증** → 비조직원 존재 시 400 `BOARD_HAS_NON_ORG_MEMBERS`
- 보드가 이미 다른 조직에 소속 → 400 `BOARD_ALREADY_IN_ORGANIZATION`
- 보드의 Owner가 요청자가 아님 → 403 `BOARD_OWNER_REQUIRED`
- PERSONAL 타입 보드 → 400 `PERSONAL_BOARD_NOT_ALLOWED`

> **구현 노트**: OrgAdmin+ AND BoardOwner 이중 권한 검증이 필요하므로 `OrganizationFacadeService`에서 `OrganizationService` + `BoardService` 양쪽을 호출하여 처리. 기존 `BoardFacadeService` 패턴 참조.

**Error Response (R1 위반 시):**
```json
{
  "error": {
    "code": "BOARD_HAS_NON_ORG_MEMBERS",
    "message": "보드에 조직원이 아닌 멤버가 있습니다. 먼저 조직에 초대하세요.",
    "details": {
      "non_org_members": [
        { "user_id": "uuid", "name": "Guest User", "email": "guest@email.com" }
      ]
    }
  }
}
```

---

### 3.4 보드 방출 (조직에서 제거)
```
DELETE /api/v1/organizations/{orgId}/boards/{boardId}
Auth: OrgAdmin+
```

**로직:** `boards.organization_id = NULL` 설정. 보드 자체는 삭제하지 않음.

> **UX 안내**: 방출 확인 다이얼로그에 "방출 후 비조직원도 이 보드에 참여할 수 있습니다" 문구 표시.

---

## 4. Organization Invites

### 4.1 초대 링크 생성
```
POST /api/v1/organizations/{orgId}/invites
Auth: OrgAdmin+
```

**Request:**
```json
{
  "role": "MEMBER",
  "max_uses": null,
  "expires_in_hours": 168
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "code": "a1b2c3d4e5f6",
    "role": "MEMBER",
    "max_uses": null,
    "used_count": 0,
    "expires_at": "2026-03-04T10:00:00",
    "invite_url": "https://bridge.app/org-invite/a1b2c3d4e5f6"
  }
}
```

---

### 4.2 초대 링크 목록
```
GET /api/v1/organizations/{orgId}/invites
Auth: OrgAdmin+
```

---

### 4.3 초대 링크 삭제
```
DELETE /api/v1/organizations/{orgId}/invites/{inviteId}
Auth: OrgAdmin+
```

---

### 4.4 초대 정보 조회 (Public)
```
GET /api/v1/org-invites/{code}
Auth: Public (인증 불필요)
```

**Response (200):**
```json
{
  "data": {
    "organization_name": "CookApps",
    "organization_logo": "https://...",
    "role": "MEMBER",
    "member_count": 12,
    "is_valid": true
  }
}
```

---

### 4.5 초대 수락
```
POST /api/v1/org-invites/{code}/accept
Auth: User (로그인 필수)
```

**Response (200):**
```json
{
  "data": {
    "organization_id": "uuid",
    "organization_name": "CookApps",
    "role": "MEMBER",
    "message": "CookApps 조직에 합류했습니다."
  }
}
```

**Validation:**
- 이미 멤버 → 400 `ALREADY_ORG_MEMBER`
- 링크 만료/비활성/사용초과 → 400 `ORG_INVITE_INVALID`

> **R2 확장 (기존 보드 초대)**: 기존 보드 초대 링크 수락 시(`InviteService.acceptBoardInvite()`) 해당 보드가 조직 보드인 경우, 수락자가 조직원인지 추가 검증. 비조직원이면 403 `NOT_ORG_MEMBER_FOR_BOARD`.

---

## 5. Department & Job Group Management

### 5.1 부서 목록 / 생성 / 삭제
```
GET    /api/v1/organizations/{orgId}/departments        Auth: OrgMember+
POST   /api/v1/organizations/{orgId}/departments        Auth: OrgAdmin+
PUT    /api/v1/organizations/{orgId}/departments/{id}   Auth: OrgAdmin+
DELETE /api/v1/organizations/{orgId}/departments/{id}   Auth: OrgAdmin+
```

### 5.2 직무 그룹 목록 / 생성 / 삭제
```
GET    /api/v1/organizations/{orgId}/job-groups          Auth: OrgMember+
POST   /api/v1/organizations/{orgId}/job-groups          Auth: OrgAdmin+
PUT    /api/v1/organizations/{orgId}/job-groups/{id}     Auth: OrgAdmin+
DELETE /api/v1/organizations/{orgId}/job-groups/{id}     Auth: OrgAdmin+
```

---

## 6. Leave Management

### 6.1 휴가 정책 목록
```
GET /api/v1/organizations/{orgId}/leave-policies
Auth: OrgMember+
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "연차",
      "leave_category": "ANNUAL",
      "default_days": 15.0,
      "is_paid": true,
      "requires_approval": true,
      "description": null,
      "is_active": true
    },
    {
      "id": "uuid",
      "name": "병가",
      "leave_category": "SICK",
      "default_days": 10.0,
      "is_paid": true,
      "requires_approval": true
    },
    {
      "id": "uuid",
      "name": "리프레시 휴가",
      "leave_category": "REFRESH",
      "default_days": 5.0,
      "is_paid": true,
      "requires_approval": true
    },
    {
      "id": "uuid",
      "name": "경조 휴가",
      "leave_category": "OTHER",
      "default_days": 0,
      "is_paid": true,
      "requires_approval": true
    }
  ]
}
```

---

### 6.2 휴가 정책 생성/수정
```
POST /api/v1/organizations/{orgId}/leave-policies        Auth: OrgAdmin+
PUT  /api/v1/organizations/{orgId}/leave-policies/{id}   Auth: OrgAdmin+
```

**Request:**
```json
{
  "name": "장기근속 휴가",
  "leave_category": "OTHER",
  "default_days": 3.0,
  "is_paid": true,
  "requires_approval": true,
  "description": "5년 이상 근무자 대상"
}
```

---

### 6.3 내 휴가 잔여 조회
```
GET /api/v1/organizations/{orgId}/my-leave-balance
Auth: OrgMember+
Query: year (default: current year)
```

**Response (200):**
```json
{
  "data": {
    "year": 2026,
    "balances": [
      {
        "policy_id": "uuid",
        "policy_name": "연차",
        "leave_category": "ANNUAL",
        "total_days": 16.0,
        "used_days": 3.0,
        "remaining_days": 13.0
      },
      {
        "policy_id": "uuid",
        "policy_name": "병가",
        "leave_category": "SICK",
        "total_days": 5.0,
        "used_days": 0.0,
        "remaining_days": 5.0
      }
    ]
  }
}
```

---

### 6.4 멤버 휴가 잔여 조회/수정 (Admin)
```
GET /api/v1/organizations/{orgId}/members/{memberId}/leave-balance
Auth: OrgAdmin+
Query: year (default: current year)
```

```
PUT /api/v1/organizations/{orgId}/members/{memberId}/leave-balance
Auth: OrgAdmin+
```

**Request:**
```json
{
  "policy_id": "uuid",
  "year": 2026,
  "total_days": 18.0
}
```

---

### 6.5 휴가 신청
```
POST /api/v1/organizations/{orgId}/leave-requests
Auth: OrgMember+
```

**Request:**
```json
{
  "policy_id": "uuid",
  "start_date": "2026-03-01",
  "end_date": "2026-03-01",
  "duration_type": "FULL_DAY",
  "reason": "개인 사유"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "policy": { "id": "uuid", "name": "연차", "leave_category": "ANNUAL" },
    "start_date": "2026-03-01",
    "end_date": "2026-03-01",
    "duration_type": "FULL_DAY",
    "total_days": 1.0,
    "reason": "개인 사유",
    "status": "PENDING",
    "created_at": "2026-02-25T10:00:00"
  }
}
```

**로직:**
1. `total_days` 자동 계산 (FULL_DAY: 일수, HALF: 0.5 * 일수)
2. 잔여 확인 (`leave_balances.remaining >= total_days`)
3. 잔여 부족 → 400 `INSUFFICIENT_LEAVE_BALANCE`
4. 중복 기간 확인 → 400 `LEAVE_DATE_CONFLICT`
5. status = PENDING으로 생성

---

### 6.6 휴가 목록 조회 (일일 현황)
```
GET /api/v1/organizations/{orgId}/leave-requests
Auth: OrgMember+
```

**Query Parameters:**
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `date` | string (yyyy-MM-dd) | 특정 날짜의 휴가 (default: today) |
| `start_date` | string | 기간 시작 |
| `end_date` | string | 기간 끝 |
| `status` | string | 상태 필터 (PENDING/APPROVED/REJECTED/CANCELED) |
| `requester_id` | string | 특정 멤버 필터 |
| `leave_category` | string | 카테고리 필터 (ANNUAL/SICK/REFRESH/OTHER) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "requester": {
        "id": "member-uuid",
        "name": "이종서",
        "department": { "id": "dept-uuid", "name": "Business" },
        "profile_image": null
      },
      "policy": {
        "id": "uuid",
        "name": "연차",
        "leave_category": "ANNUAL"
      },
      "start_date": "2026-02-25",
      "end_date": "2026-02-25",
      "duration_type": "FULL_DAY",
      "total_days": 1.0,
      "reason": null,
      "status": "APPROVED",
      "reviewer": { "id": "uuid", "name": "Admin" },
      "reviewed_at": "2026-02-24T15:00:00",
      "created_at": "2026-02-24T10:00:00"
    }
  ]
}
```

---

### 6.7 휴가 승인
```
PUT /api/v1/organizations/{orgId}/leave-requests/{requestId}/approve
Auth: OrgAdmin+
```

**로직:**
1. status가 PENDING인지 확인 → 아니면 400 `LEAVE_ALREADY_PROCESSED`
2. **Pessimistic Lock**: `leave_balances` 행 잠금 (`@Lock(PESSIMISTIC_WRITE)` + `findByMemberIdAndPolicyIdAndYearForUpdate`)
3. 잔여 재검증: `balance.remaining >= request.total_days` → 부족 시 400 `INSUFFICIENT_LEAVE_BALANCE`
4. `leave_balances.used_days += total_days`
5. status = APPROVED, reviewer/reviewed_at 설정
6. 알림 생성 (향후)

> **동시성 제어**: 같은 멤버의 여러 휴가 요청이 동시에 승인될 때 잔여가 마이너스가 되는 Race Condition 방지. 기존 `AiCreditService.consumeCredit()` 패턴 참조.

---

### 6.8 휴가 거절
```
PUT /api/v1/organizations/{orgId}/leave-requests/{requestId}/reject
Auth: OrgAdmin+
```

**Request:**
```json
{
  "comment": "해당 기간에 팀 미팅이 있습니다."
}
```

---

### 6.9 휴가 취소 (본인)
```
PUT /api/v1/organizations/{orgId}/leave-requests/{requestId}/cancel
Auth: 신청자 본인
```

**로직:**
1. PENDING → CANCELED: 잔여 변동 없음
2. APPROVED → CANCELED: `leave_balances.used_days -= total_days` (잔여 복원)
   - **단, end_date < 오늘인 경우 취소 불가** → 400 `LEAVE_CANCEL_NOT_ALLOWED` ("이미 사용한 휴가는 취소할 수 없습니다")
3. REJECTED/CANCELED → 취소 불가 → 400 `LEAVE_ALREADY_PROCESSED`

---

## 7. Error Codes (신규)

| 코드 | HTTP | 설명 |
|------|------|------|
| `ORG_NOT_FOUND` | 404 | 조직을 찾을 수 없음 |
| `ORG_ACCESS_DENIED` | 403 | 조직 접근 권한 없음 |
| `ORG_ADMIN_REQUIRED` | 403 | 관리자 권한 필요 |
| `ORG_OWNER_REQUIRED` | 403 | 소유자 권한 필요 |
| `ALREADY_ORG_MEMBER` | 400 | 이미 조직 구성원 |
| `ORG_MEMBER_NOT_FOUND` | 404 | 조직 구성원을 찾을 수 없음 |
| `CANNOT_REMOVE_ORG_OWNER` | 400 | Owner 제거 불가 |
| `CANNOT_CHANGE_ORG_OWNER_ROLE` | 400 | Owner 역할 변경 불가 |
| `BOARD_ALREADY_IN_ORGANIZATION` | 400 | 보드가 이미 다른 조직에 소속 |
| `BOARD_OWNER_REQUIRED` | 403 | 보드 Owner만 편입 가능 |
| `PERSONAL_BOARD_NOT_ALLOWED` | 400 | 개인 보드는 조직에 편입 불가 |
| `BOARD_HAS_NON_ORG_MEMBERS` | 400 | 보드에 비조직원이 있어 편입 불가 (R1) |
| `NOT_ORG_MEMBER_FOR_BOARD` | 403 | 조직원만 조직 보드에 참여 가능 (R2) |
| `CANNOT_REMOVE_BOARD_OWNER` | 400 | 조직 보드 Owner는 소유권 이양 후 제거 가능 (R3) |
| `CANNOT_DEACTIVATE_ORG_OWNER` | 400 | 조직 소유자는 소유권 이양 후 비활성화 가능 |
| `ORG_INVITE_NOT_FOUND` | 404 | 초대 링크를 찾을 수 없음 |
| `ORG_INVITE_INVALID` | 400 | 초대 링크가 만료/비활성/초과 |
| `LEAVE_POLICY_NOT_FOUND` | 404 | 휴가 정책을 찾을 수 없음 |
| `INSUFFICIENT_LEAVE_BALANCE` | 400 | 잔여 휴가 부족 |
| `LEAVE_DATE_CONFLICT` | 400 | 중복 휴가 기간 |
| `LEAVE_REQUEST_NOT_FOUND` | 404 | 휴가 요청을 찾을 수 없음 |
| `LEAVE_ALREADY_PROCESSED` | 400 | 이미 처리된 휴가 요청 |
| `LEAVE_CANCEL_NOT_ALLOWED` | 400 | 취소 불가 (이미 사용한 휴가 또는 종결 상태) |

---

## 8. API Summary Table

| # | Method | Path | Auth | 설명 |
|---|--------|------|------|------|
| 1 | POST | `/organizations` | User | 조직 생성 |
| 2 | GET | `/organizations` | User | 내 조직 목록 |
| 3 | GET | `/organizations/{orgId}` | OrgMember+ | 조직 상세 |
| 4 | PUT | `/organizations/{orgId}` | OrgAdmin+ | 조직 수정 |
| 5 | POST | `/organizations/{orgId}/logo` | OrgAdmin+ | 로고 업로드 |
| 6 | DELETE | `/organizations/{orgId}` | OrgOwner | 조직 삭제 |
| 7 | GET | `/organizations/{orgId}/members` | OrgMember+ | 구성원 목록 |
| 8 | POST | `/organizations/{orgId}/members` | OrgAdmin+ | 멤버 초대 |
| 9 | GET | `/organizations/{orgId}/members/{id}` | OrgMember+ | 프로필 상세 |
| 10 | PUT | `/organizations/{orgId}/members/{id}` | OrgAdmin+/본인 | 정보 수정 |
| 11 | PUT | `/organizations/{orgId}/members/{id}/role` | OrgAdmin+ | 역할 변경 |
| 12 | DELETE | `/organizations/{orgId}/members/{id}` | OrgAdmin+ | 멤버 제거 |
| 13 | GET | `/organizations/{orgId}/boards` | OrgMember+ | 보드 목록 |
| 14 | GET | `/organizations/{orgId}/boards/check-eligibility` | OrgAdmin+BoardOwner | 보드 편입 적격성 확인 (R1) |
| 15 | POST | `/organizations/{orgId}/boards` | OrgAdmin+BoardOwner | 보드 편입 (R1 검증) |
| 16 | DELETE | `/organizations/{orgId}/boards/{boardId}` | OrgAdmin+ | 보드 방출 |
| 17 | POST | `/organizations/{orgId}/invites` | OrgAdmin+ | 초대 링크 생성 |
| 18 | GET | `/organizations/{orgId}/invites` | OrgAdmin+ | 초대 목록 |
| 19 | DELETE | `/organizations/{orgId}/invites/{id}` | OrgAdmin+ | 초대 삭제 |
| 20 | GET | `/org-invites/{code}` | Public | 초대 정보 |
| 21 | POST | `/org-invites/{code}/accept` | User | 초대 수락 |
| 22 | GET | `/organizations/{orgId}/departments` | OrgMember+ | 부서 목록 |
| 23 | POST | `/organizations/{orgId}/departments` | OrgAdmin+ | 부서 생성 |
| 24 | PUT | `/organizations/{orgId}/departments/{id}` | OrgAdmin+ | 부서 수정 |
| 25 | DELETE | `/organizations/{orgId}/departments/{id}` | OrgAdmin+ | 부서 삭제 |
| 26 | GET | `/organizations/{orgId}/job-groups` | OrgMember+ | 직무 목록 |
| 27 | POST | `/organizations/{orgId}/job-groups` | OrgAdmin+ | 직무 생성 |
| 28 | PUT | `/organizations/{orgId}/job-groups/{id}` | OrgAdmin+ | 직무 수정 |
| 29 | DELETE | `/organizations/{orgId}/job-groups/{id}` | OrgAdmin+ | 직무 삭제 |
| 30 | GET | `/organizations/{orgId}/leave-policies` | OrgMember+ | 휴가 정책 목록 |
| 31 | POST | `/organizations/{orgId}/leave-policies` | OrgAdmin+ | 휴가 정책 생성 |
| 32 | PUT | `/organizations/{orgId}/leave-policies/{id}` | OrgAdmin+ | 휴가 정책 수정 |
| 33 | GET | `/organizations/{orgId}/my-leave-balance` | OrgMember+ | 내 잔여 조회 |
| 34 | GET | `/organizations/{orgId}/members/{id}/leave-balance` | OrgAdmin+ | 멤버 잔여 조회 |
| 35 | PUT | `/organizations/{orgId}/members/{id}/leave-balance` | OrgAdmin+ | 잔여 수정 |
| 36 | POST | `/organizations/{orgId}/leave-requests` | OrgMember+ | 휴가 신청 |
| 37 | GET | `/organizations/{orgId}/leave-requests` | OrgMember+ | 휴가 목록 |
| 38 | PUT | `/organizations/{orgId}/leave-requests/{id}/approve` | OrgAdmin+ | 승인 |
| 39 | PUT | `/organizations/{orgId}/leave-requests/{id}/reject` | OrgAdmin+ | 거절 |
| 40 | PUT | `/organizations/{orgId}/leave-requests/{id}/cancel` | 신청자 본인 | 취소 |

> **총 40개 엔드포인트** (Phase 1)
>
> **3대 규칙 관련 API:**
> - R1: #14 (적격성 확인) + #15 (편입 시 검증)
> - R2: 기존 `MemberService.addMember()` 에서 조직 보드인 경우 조직원 검증 추가 (별도 API 아님)
> - R3: #12 (멤버 제거 시 조직 보드에서 연쇄 제거)
