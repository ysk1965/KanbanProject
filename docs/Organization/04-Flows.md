# Organization Service - Core Flows

> **Version**: v1.0.0 | **Date**: 2026-02-25

---

## 1. 조직 생성 플로우

```
[사용자] ── 조직 생성 클릭 ──→ [CreateOrgModal]
                                     │
                                     ▼
                          이름/설명 입력 → [생성]
                                     │
                                     ▼
                          POST /organizations
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
              Organization 생성  OrgMember 생성   기본 휴가정책 4개
              (owner = 요청자)  (role = OWNER)    (연차/병가/리프레시/기타)
                                     │
                                     ▼
                          조직 상세 페이지로 이동
```

---

## 2. 멤버 초대 플로우

### 2.1 이메일 초대 (기존 유저)

```
[OrgAdmin] ── 멤버 초대 ──→ [InviteOrgMemberModal]
                                     │
                                     ▼
                          이메일 + 역할 + 부서 입력
                                     │
                                     ▼
                          POST /organizations/{orgId}/members
                                     │
                              [이메일로 User 검색]
                                     │
                           ┌─── 존재? ───┐
                           ▼ YES         ▼ NO
                    OrganizationMember   InviteLink 생성
                    직접 추가            (1회용, 7일 만료)
                           │                    │
                           │              이메일 발송
                           │             "CookApps에서 초대"
                           ▼                    │
                    즉시 멤버 됨         ▼ [수신자 클릭]
                                              │
                                     GET /org-invites/{code}
                                     (미가입 → 가입 유도)
                                     (가입됨 → 수락 페이지)
                                              │
                                     POST /org-invites/{code}/accept
                                              │
                                     OrganizationMember 생성
```

### 2.2 링크 초대

```
[OrgAdmin] ── 초대 링크 생성 ──→ POST /organizations/{orgId}/invites
                                        │
                                        ▼
                                 code: "a1b2c3d4e5f6"
                                 URL: bridge.app/org-invite/a1b2c3d4e5f6
                                        │
                                   링크 공유 (복사)
                                        │
                           ▼ [수신자 접속]
                                        │
                              GET /org-invites/{code}
                              (조직명, 멤버수, 역할 표시)
                                        │
                                   [수락 버튼]
                                        │
                              POST /org-invites/{code}/accept
                                        │
                              ┌─── 검증 ───┐
                              ▼            ▼
                          isValid?    이미 멤버?
                          isActive?
                          expired?
                          maxUses?
                              │            │
                              ▼ PASS       ▼ FAIL
                        OrganizationMember  에러 메시지
                        생성                표시
                        usedCount++
```

---

## 3. 보드 편입/방출 플로우 (R1 규칙 적용)

### 3.1 보드 편입 (R1: 전원 조직원 검증)

```
[OrgAdmin] ── 보드 편입 ──→ [AddBoardToOrgModal]
                                     │
                                     ▼
                          내가 Owner인 미연동 보드 목록 표시
                          (boards WHERE owner_id = me
                           AND organization_id IS NULL
                           AND board_type = 'TEAM')
                                     │
                                     ▼
                          각 보드에 대해 적격성 확인 (R1)
                          GET /organizations/{orgId}/boards/check-eligibility
                                     │
                              ┌──── 결과 표시 ────┐
                              ▼                   ▼
                        ✅ 전원 조직원         ⚠️ 비조직원 존재
                        [편입 →] 활성화        [편입 불가] 비활성화
                              │                   │
                              │            비조직원 목록 표시
                              │            "먼저 조직에 초대하세요"
                              │
                              ▼ 보드 선택
                          POST /organizations/{orgId}/boards
                                     │
                              ┌──── 서버 검증 (R1) ────────┐
                              ▼                            ▼
                     보드 멤버 전원이 조직원?            기존 검증
                              │                    (이미 소속? PERSONAL?)
                              │
                     ┌── YES ──┴── NO ──┐
                     ▼                  ▼
              boards.org_id = orgId   400 BOARD_HAS_NON_ORG_MEMBERS
                     │                  │
                     ▼                  ▼
              보드 목록에 표시     에러 + 비조직원 목록 반환
```

### 3.2 보드 방출

```
[OrgAdmin] ── 보드 방출 (✕) ──→ 확인 다이얼로그
                                    "이 보드를 조직에서 방출하시겠습니까?"
                                    "보드 데이터는 유지됩니다."
                                    "⚠️ 방출 후 비조직원도 이 보드에 참여할 수 있습니다."
                                         │
                                    [방출 확인]
                                         │
                              DELETE /organizations/{orgId}/boards/{boardId}
                                         │
                              boards.organization_id = NULL
                                         │
                              보드 목록에서 제거
                              (보드 자체는 독립 보드로 존속)
```

### 3.3 조직 보드 멤버 추가 제한 (R2)

> **기존 MemberService 수정**: 보드에 멤버를 추가할 때 조직 보드인 경우 추가 검증

```
[보드 관리자] ── 멤버 추가 ──→ MemberService.addMember()
                                       │
                                       ▼
                              board.organization_id 확인
                                       │
                              ┌── NULL ──┴── 존재 ──┐
                              ▼                     ▼
                        독립 보드                조직 보드 (R2 적용)
                        (기존 로직 유지)               │
                                               추가 대상이 조직원?
                                                       │
                                              ┌── YES ──┴── NO ──┐
                                              ▼                  ▼
                                        보드 멤버 추가      403 NOT_ORG_MEMBER_FOR_BOARD
                                                             "먼저 조직에 초대하세요"
```

### 3.4 기존 보드 초대 링크 R2 검증

> **기존 InviteService 수정**: 보드 초대 링크 수락 시 조직 보드이면 조직원 검증

```
[사용자] ── 보드 초대 링크 수락 ──→ InviteService.acceptBoardInvite()
                                           │
                                           ▼
                                  board.organization_id 확인
                                           │
                                  ┌── NULL ──┴── 존재 ──┐
                                  ▼                     ▼
                            독립 보드                조직 보드
                            (기존 로직 유지)               │
                                                   수락자가 조직원?
                                                           │
                                                  ┌── YES ──┴── NO ──┐
                                                  ▼                  ▼
                                            정상 합류      403 NOT_ORG_MEMBER_FOR_BOARD
                                                             "조직원만 참여 가능합니다.
                                                              먼저 조직에 초대받으세요."
```

> **주의**: 편입 전에 생성된 보드 초대 링크가 편입 후에도 유효하므로, 이 검증이 없으면 R2 규칙이 우회됨.

---

## 4. 휴가 신청/승인 플로우

### 4.1 상태 머신

```
                    ┌──────────┐
                    │ PENDING  │ (신청 직후)
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ APPROVED │ │ REJECTED │ │ CANCELED │
        │ (승인)   │ │ (거절)   │ │ (본인취소)│
        └────┬─────┘ └──────────┘ └──────────┘
             │
             ▼
        ┌──────────┐
        │ CANCELED │ (승인 후 취소 가능)
        │ (잔여복원)│
        └──────────┘
```

**상태 전이 규칙:**
| From | To | Who | 잔여 변동 |
|------|----|-----|----------|
| PENDING | APPROVED | OrgAdmin+ | used_days += total_days |
| PENDING | REJECTED | OrgAdmin+ | 없음 |
| PENDING | CANCELED | 신청자 본인 | 없음 |
| APPROVED | CANCELED | 신청자 본인 | used_days -= total_days (복원). **단, end_date < 오늘이면 취소 불가** |
| REJECTED | - | (종결 상태) | - |
| CANCELED | - | (종결 상태) | - |

### 4.2 휴가 신청 플로우

```
[멤버] ── 휴가 신청 ──→ [LeaveRequestModal]
                              │
                              ▼
                    ┌─ 입력 항목 ─────────────┐
                    │ 1. 휴가 유형 (select)    │
                    │ 2. 기간 유형 (radio)      │
                    │    전일 / 오전반차 / 오후반차│
                    │ 3. 시작일 (date picker)   │
                    │ 4. 종료일 (date picker)   │
                    │ 5. 사유 (textarea)        │
                    └──────────────────────────┘
                              │
                       total_days 자동 계산
                       잔여 표시: "16일 → 15일"
                              │
                         [신청하기]
                              │
                  POST /organizations/{orgId}/leave-requests
                              │
                    ┌─── 검증 ───────────────┐
                    │ 잔여 >= total_days?     │
                    │ 중복 기간 없음?          │
                    │ 정책 활성 상태?          │
                    └─────────┬───────────────┘
                              │
                      ┌───── PASS ─────┐
                      ▼                ▼ FAIL
                LeaveRequest 생성    에러 메시지
                status = PENDING     ("잔여 휴가 부족")
                      │
                      ▼
                목록에 PENDING 표시
```

### 4.3 휴가 승인/거절 플로우

```
[OrgAdmin] ── 휴가 현황 페이지 ──→ PENDING 요청 확인
                                         │
                              ┌─── Actions ───┐
                              ▼               ▼
                         [✓ 승인]         [✕ 거절]
                              │               │
                              │          사유 입력 모달
                              │               │
                              ▼               ▼
                PUT .../approve      PUT .../reject
                              │               │
                              ▼               ▼
                ┌── 승인 처리 (트랜잭션) ──┐  status = REJECTED
                │ 1. status == PENDING?    │  (변동 없음)
                │ 2. Pessimistic Lock      │
                │    leave_balances 행 잠금 │
                │ 3. 잔여 재검증           │
                │    remaining >= total?   │
                │    ├─ NO → 400 에러     │
                │    └─ YES ↓             │
                │ 4. used_days += N        │
                │ 5. status = APPROVED     │
                └─────────────────────────┘
                              │
                              ▼
                   잔여 업데이트 반영
```

> **동시성 제어**: `@Lock(PESSIMISTIC_WRITE)` + `findByMemberIdAndPolicyIdAndYearForUpdate()`로 같은 멤버의 동시 승인 시 잔여 마이너스 방지. 기존 `AiCreditService.consumeCredit()` 패턴과 동일.

### 4.4 total_days 계산 로직

```java
public BigDecimal calculateTotalDays(LocalDate startDate, LocalDate endDate,
                                      LeaveDurationType durationType) {
    long daysBetween = ChronoUnit.DAYS.between(startDate, endDate) + 1;

    switch (durationType) {
        case FULL_DAY:
            return BigDecimal.valueOf(daysBetween);
        case AM_HALF:
        case PM_HALF:
            return BigDecimal.valueOf(daysBetween).multiply(BigDecimal.valueOf(0.5));
    }
}
```

**예시:**
| 시작일 | 종료일 | 유형 | total_days |
|--------|--------|------|-----------|
| 03-01 | 03-01 | FULL_DAY | 1.0 |
| 03-01 | 03-03 | FULL_DAY | 3.0 |
| 03-01 | 03-01 | AM_HALF | 0.5 |
| 03-01 | 03-02 | PM_HALF | 1.0 |

---

## 5. 조직 멤버 제거 연쇄 플로우 (R3)

> **원칙**: 조직에서 멤버를 제거하면, 해당 멤버가 속한 조직 보드에서도 자동 제거

```
[OrgAdmin] ── 멤버 제거 ──→ 사전 검증
                                     │
                          ┌──── 보드 Owner 검증 ────┐
                          │ 해당 멤버가 조직 보드의    │
                          │ Owner(board.owner_id)인지? │
                          └───────────┬──────────────┘
                                      │
                              ┌── YES ──┴── NO ──┐
                              ▼                  ▼
                        ⚠️ 차단               영향 범위 조회
                        "다음 보드의 소유권을         │
                         먼저 이양하세요:         조직 보드 목록 조회
                         • Board1               (board_members bm
                         • Board2"               JOIN boards b ...)
                                                     │
                                              ┌──── 결과 ────┐
                                              ▼              ▼
                                         보드 없음      N개 보드 소속
                                              │              │
                                              │         경고 다이얼로그 표시
                                              │         "이 멤버를 제거하면 다음 보드에서도
                                              │          자동 제거됩니다:
                                              │          • BRIDGE 프로덕트
                                              │          • Marketing Board"
                                              │              │
                                              └───┬──────────┘
                                                  ▼
                                          [제거 확인] 또는 [취소]
                                                  │
                                          DELETE /organizations/{orgId}/members/{memberId}
                                                  │
                          ┌──── 서버 처리 순서 (@Transactional) ────┐
                          │ 1. 보드 Owner 재검증 (비관적 락)         │
                          │ 2. PENDING 휴가 요청 → CANCELED 처리    │
                          │ 3. 조직 보드에서 board_member 제거       │
                          │ 4. OrganizationMember 삭제              │
                          │    (leave_balances ON DELETE CASCADE)   │
                          │ 5. 영향받은 보드 목록 응답 반환           │
                          └────────────────────────────────────────┘
                                  │
                                  ▼
                          응답: { removed_member, cascade_removed_from_boards,
                                  canceled_leave_requests }
```

**구현 주의사항:**
- 전체 R3 작업을 단일 `@Transactional`로 원자성 보장
- Organization에 비관적 락 적용 (R1 ↔ R3 동시 실행 Race Condition 방지)
- Owner인 보드가 있으면 → 400 `CANNOT_REMOVE_BOARD_OWNER` (보드 소유권 이양 필수)
- PENDING 휴가 요청은 자동 CANCELED 처리 (잔여 변동 없음)

---

## 6. 구성원 프로필 수정 플로우

### 6.1 본인 프로필 수정

```
[멤버] ── 내 프로필 ──→ 프로필 상세 (O-04)
                              │
                         [편집 버튼]
                              │
                    ┌─── 수정 가능 필드 ───┐
                    │ phone                │
                    │ birth_date           │
                    │ bio (자기소개)         │
                    │ profile_image (User)  │
                    └──────────────────────┘
                              │
                PUT /organizations/{orgId}/members/{memberId}
```

### 6.2 관리자 정보 수정 (OrgAdmin+)

```
[OrgAdmin] ── 구성원 프로필 ──→ 프로필 상세
                                     │
                                [편집 버튼]
                                     │
                    ┌─── 수정 가능 필드 (전체) ───┐
                    │ department_id              │
                    │ job_group_id               │
                    │ job_title                  │
                    │ contract_type              │
                    │ work_status                │
                    │ employee_id                │
                    │ hire_date                  │
                    │ phone, birth_date, bio     │
                    └────────────────────────────┘
```

---

## 7. 조직 삭제 플로우

```
[OrgOwner] ── 조직 설정 ──→ 위험 영역
                                 │
                          [조직 삭제 버튼]
                                 │
                    ┌─── 확인 다이얼로그 ───────────┐
                    │ "이 작업은 되돌릴 수 없습니다."  │
                    │ "조직명을 입력해주세요: [     ]" │
                    │         [삭제]  [취소]         │
                    └───────────────────────────────┘
                                 │
                    DELETE /organizations/{orgId}
                                 │
                    ┌──── 처리 순서 (서비스 레이어) ──────────────┐
                    │ 1. boards.organization_id = NULL (방출)     │
                    │ 2. invite_links.is_active = false (비활성화)  │
                    │ 3. leave_requests (PENDING) → CANCELED       │
                    │ 4. org.softDelete() (deleted_at 설정)        │
                    │ ⚠️ Soft Delete이므로 ON DELETE CASCADE 미발동  │
                    │ 멤버/정책/잔여는 org.deleted_at으로 논리적 삭제 │
                    └─────────────────────────────────────────────┘
                                 │
                    조직 목록 페이지로 이동
```

---

## 8. 사용자 계정 비활성화 시 조직 연쇄 처리

> **기존 UserService 수정**: 계정 비활성화 시 소유 조직 검증 + 소속 조직 자동 탈퇴

```
[사용자] ── 계정 비활성화 ──→ UserService.deactivate()
                                     │
                          ┌──── 소유 조직 검증 ────┐
                          │ organizations WHERE     │
                          │ owner_id = userId       │
                          │ AND deleted_at IS NULL   │
                          └───────────┬─────────────┘
                                      │
                              ┌── 존재 ──┴── 없음 ──┐
                              ▼                     ▼
                        ⚠️ 차단                소속 조직 자동 탈퇴
                        "N개 조직의 소유권을          │
                         먼저 이양하세요:         ┌─── 각 소속 조직 ───┐
                         • CookApps             │ R3 연쇄 적용:       │
                         • Side Project"        │ 1. 보드 Owner 검증   │
                                                │ 2. PENDING 휴가 취소 │
                                                │ 3. 조직 보드에서 제거 │
                                                │ 4. OrgMember 삭제   │
                                                └──────────────────┘
                                                         │
                                                         ▼
                                                user.isActive = false
                                                user.deactivatedAt = now
```

**구현 위치**: `UserService.deactivateAccount()` 또는 별도 `UserDeactivationHandler`

---

## 9. 멤버 합류 시 초기 설정 플로우

```
[새 멤버 합류] (초대 수락 또는 직접 추가)
        │
        ▼
  OrganizationMember 생성
  (role, department, job_title 설정됨)
        │
        ▼
  Leave Balances 자동 생성
  ┌─── 각 활성 휴가 정책에 대해 ───┐
  │ policy: 연차  → 15일 부여       │
  │ policy: 병가  → 10일 부여       │
  │ policy: 리프레시 → 5일 부여     │
  │ policy: 기타  → 0일 부여        │
  │ (입사월 기준 비례 배분 옵션)     │
  └─────────────────────────────┘
        │
        ▼
  멤버 목록에 표시
```

**비례 배분 로직 (선택적):**
```java
// 7월 입사 → 연차 15일의 6/12 = 7.5일
BigDecimal prorated = defaultDays
    .multiply(BigDecimal.valueOf(remainingMonths))
    .divide(BigDecimal.valueOf(12), 1, RoundingMode.HALF_UP);
```

---

## 10. 연간 휴가 리셋 플로우

```
[Scheduler] ── 매년 1월 1일 00:00 UTC ──→ 전 조직 대상 리셋
                                              │
                           ┌─── 각 Organization ───┐
                           │ 각 활성 멤버 대상       │
                           │ 각 활성 정책 대상       │
                           └───────┬───────────────┘
                                   │
                           ┌─ 리셋 로직 ─────────────┐
                           │ 1. 신규 year의 balance 생성 │
                           │ 2. total_days = policy.default │
                           │ 3. used_days = 0              │
                           │ (이월 정책 적용 가능 - Phase 2) │
                           └───────────────────────────┘
```

---

## 11. Frontend 라우팅 통합

```tsx
// App.tsx에 추가
<Route path="/organizations" element={<PrivateRoute><OrganizationListPage /></PrivateRoute>} />
<Route path="/organizations/:orgId" element={<PrivateRoute><OrganizationDetailPage /></PrivateRoute>}>
  {/* 탭 라우팅 (query param 또는 중첩 route) */}
</Route>
<Route path="/organizations/:orgId/members/:memberId" element={<PrivateRoute><MemberProfilePage /></PrivateRoute>} />
<Route path="/org-invite/:code" element={<OrgInviteAcceptPage />} />
```

**탭 관리:**
- OrganizationDetailPage 내에서 `tab` state (또는 searchParams)
- 탭: dashboard / members / boards / leaves / settings
- 설정 탭은 OrgAdmin+ 일 때만 표시

---

## 12. Backend 패키지 의존성

```
organization/
├── controller/
│   ├── OrganizationController.java      (조직 CRUD)
│   ├── OrgMemberController.java         (멤버 관리)
│   ├── OrgBoardController.java          (보드 편입/방출)
│   └── OrgInviteController.java         (초대 링크)
├── service/
│   ├── OrganizationService.java         (조직 CRUD + 권한 체크)
│   ├── OrganizationFacadeService.java   (이중 권한 검증: Org + Board 도메인 조합)
│   ├── OrgMemberService.java            (멤버 초대/수정/제거)
│   └── OrgInviteService.java            (초대 링크 관리)
├── repository/
│   ├── OrganizationRepository.java
│   ├── OrgMemberRepository.java
│   ├── OrgDepartmentRepository.java
│   ├── OrgJobGroupRepository.java
│   └── OrgInviteLinkRepository.java
└── dto/
    ├── request/  (CreateOrgRequest, InviteMemberRequest, ...)
    └── response/ (OrgResponse, OrgMemberResponse, ...)

leave/
├── controller/
│   └── LeaveController.java             (정책/잔여/신청/승인)
├── service/
│   └── LeaveService.java               (휴가 비즈니스 로직)
├── repository/
│   ├── LeavePolicyRepository.java
│   ├── LeaveBalanceRepository.java
│   └── LeaveRequestRepository.java
└── dto/
    ├── request/  (LeaveRequestDto, PolicyRequest, ...)
    └── response/ (LeaveRequestResponse, BalanceResponse, ...)
```

**의존성:**
- `OrganizationService` → `UserRepository`, `BoardRepository`
- `OrganizationFacadeService` → `OrganizationService`, `BoardService`, `MemberService` (보드 편입/방출 이중 권한)
- `OrgMemberService` → `UserRepository`, `OrganizationRepository`, `BoardMemberRepository` (R3 연쇄 제거)
- `OrgBoardService` → `BoardMemberRepository`, `OrgMemberRepository` (R1 적격성 검증)
- `LeaveService` → `OrgMemberRepository`, `LeavePolicyRepository`, `LeaveBalanceRepository` (`@Lock(PESSIMISTIC_WRITE)` 승인 동시성 제어)
- `BoardService` → 기존 코드에 `organization_id` 관련 쿼리 추가
- `MemberService` (기존) → `OrgMemberRepository` 추가 (R2: 조직 보드 멤버 추가 시 조직원 검증)
- `InviteService` (기존) → `OrgMemberRepository` 추가 (R2: 보드 초대 수락 시 조직원 검증)
- `UserService` (기존) → `OrganizationRepository` 추가 (계정 비활성화 시 소유 조직 검증 + 소속 조직 탈퇴)

---

## 13. 구현 우선순위 (추천)

| 순서 | 기능 | 이유 |
|------|------|------|
| 1 | Organization + OrgMember 엔티티/CRUD | 핵심 도메인 |
| 2 | Organization 초대 시스템 | 멤버 합류 필수 |
| 3 | 보드 편입/방출 | 기존 시스템 연동 |
| 4 | 구성원 디렉토리 + 프로필 | 주요 화면 |
| 5 | 부서/직무 그룹 관리 | 필터링 기반 |
| 6 | 휴가 정책 + 잔여 관리 | 휴가 기반 |
| 7 | 휴가 신청/승인 | 핵심 워크플로우 |
| 8 | 일일 휴가 현황 | 대시보드 |
| 9 | FE 조직 목록/상세 페이지 | UI |
| 10 | FE 구성원/휴가 탭 | UI |
