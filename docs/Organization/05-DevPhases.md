# Organization Service - Development Phases

> **Version**: v1.2.0
> **Date**: 2026-02-26
> **Author**: PM
> **총 예상 API**: 48개 엔드포인트 | **신규 테이블**: 10개 | **기존 수정**: 3개 서비스

---

## Overview

Organization 서비스 개발을 **6개 Phase**로 나누어 진행합니다.
각 Phase는 독립적으로 배포 가능하며, 이전 Phase의 완료를 전제로 합니다.

```
Phase 1: 기반 구축 (DB + 엔티티 + 조직 CRUD)
    ↓
Phase 2: 멤버 관리 (초대 + 역할 + 프로필 + 소유권 이양)
    ↓
Phase 3: 보드 연동 (편입/방출 + R1/R2/R3 규칙)
    ↓
Phase 4: 휴가 시스템 (정책 + 잔여 + 신청/승인)
    ↓
Phase 5: 프론트엔드 (전체 UI 구현)
    ↓
Phase 6: 통합 & 안정화 (기존 시스템 연동 + 엣지케이스 + QA)
```

---

## Phase 1: 기반 구축

> **목표**: Organization 도메인의 DB 스키마와 핵심 CRUD를 구축한다.

### 1.1 Backend - DB 마이그레이션

| Task | 설명 | 파일 |
|------|------|------|
| V60 마이그레이션 작성 | organizations, organization_members, departments, job_groups, invite_links 테이블 생성 | `V60__create_organizations.sql` |
| boards 테이블 수정 | `organization_id` nullable FK 추가 + CHECK 제약 | V60 내 포함 |
| Enum 클래스 생성 | OrgRole, ContractType, WorkStatus | `domain/organization/` |

### 1.2 Backend - 엔티티 & 레포지토리

| Task | 설명 |
|------|------|
| Organization 엔티티 | id, name, description, logoUrl, owner(User), deletedAt, soft delete 메서드 |
| OrganizationMember 엔티티 | role, department, jobGroup, jobTitle, contractType, workStatus, employeeId, phone, birthDate, hireDate, bio |
| OrganizationDepartment 엔티티 | id, organization, name, displayOrder |
| OrganizationJobGroup 엔티티 | id, organization, name, displayOrder |
| OrganizationInviteLink 엔티티 | code, role, maxUses, usedCount, expiresAt, isActive |
| Repository 5개 | Organization, OrgMember, OrgDepartment, OrgJobGroup, OrgInviteLink |

### 1.3 Backend - 조직 CRUD API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 1 | 조직 생성 | POST | `/organizations` | Owner 자동 등록 + 기본 휴가정책 4개는 Phase 4에서 추가 |
| 2 | 내 조직 목록 | GET | `/organizations` | soft delete 필터 |
| 3 | 조직 상세 | GET | `/organizations/{orgId}` | member_count, board_count 포함 |
| 4 | 조직 수정 | PUT | `/organizations/{orgId}` | OrgAdmin+ |
| 5 | 로고 업로드 | POST | `/organizations/{orgId}/logo` | 기존 FileUpload 패턴 활용 |
| 6 | 조직 삭제 | DELETE | `/organizations/{orgId}` | OrgOwner, soft delete. 연쇄 처리는 Phase 3, 4 완료 후 보강 |

### 1.4 Backend - 부서/직무 관리 API

| # | API | Method | Path |
|---|-----|--------|------|
| 23 | 부서 목록 | GET | `/organizations/{orgId}/departments` |
| 24 | 부서 생성 | POST | `/organizations/{orgId}/departments` |
| 25 | 부서 수정 | PUT | `/organizations/{orgId}/departments/{id}` |
| 26 | 부서 삭제 | DELETE | `/organizations/{orgId}/departments/{id}` |
| 27 | 직무 목록 | GET | `/organizations/{orgId}/job-groups` |
| 28 | 직무 생성 | POST | `/organizations/{orgId}/job-groups` |
| 29 | 직무 수정 | PUT | `/organizations/{orgId}/job-groups/{id}` |
| 30 | 직무 삭제 | DELETE | `/organizations/{orgId}/job-groups/{id}` |

### 1.5 권한 체크 공통 모듈

| Task | 설명 |
|------|------|
| OrgPermissionChecker | OrgMember+, OrgAdmin+, OrgOwner 권한 검증 유틸 |
| ErrorCode 추가 | ORG_NOT_FOUND, ORG_ACCESS_DENIED, ORG_ADMIN_REQUIRED, ORG_OWNER_REQUIRED |

### Deliverable

- 조직 생성/수정/삭제/목록/상세 API 동작
- 부서/직무 CRUD 동작
- 조직 권한 체크 동작
- **API 14개 완료** (조직 6 + 부서 4 + 직무 4)

### Acceptance Criteria

- [ ] `POST /organizations` 호출 시 조직이 생성되고 요청자가 OWNER로 등록
- [ ] `GET /organizations` 호출 시 본인이 소속된 조직만 반환 (soft delete 제외)
- [ ] `DELETE /organizations/{orgId}` 호출 시 deleted_at 설정 (soft delete)
- [ ] OrgMember가 아닌 사용자가 조직 상세 접근 시 403
- [ ] 부서/직무 삭제 시 해당 멤버의 FK가 NULL로 변경
- [ ] H2 로컬 환경에서 전체 API 정상 동작

---

## Phase 2: 멤버 관리

> **목표**: 조직 멤버 초대, 역할 관리, 프로필 관리, 소유권 이양을 구현한다.

### 의존성

- Phase 1 완료 필수 (Organization, OrgMember 엔티티)

### 2.1 Backend - 멤버 CRUD API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 8 | 구성원 목록 | GET | `/organizations/{orgId}/members` | 필터(부서/직무/계약/상태) + 검색 + 정렬 + 페이징 |
| 9 | 멤버 초대 | POST | `/organizations/{orgId}/members` | 이메일 직접 추가 or 이메일 발송 |
| 10 | 프로필 상세 | GET | `/organizations/{orgId}/members/{id}` | tenure_months 계산 포함 |
| 11 | 정보 수정 | PUT | `/organizations/{orgId}/members/{id}` | 본인: 제한 필드, Admin: 전체 |
| 12 | 역할 변경 | PUT | `/organizations/{orgId}/members/{id}/role` | OWNER 변경 불가 |
| 13 | 멤버 제거 | DELETE | `/organizations/{orgId}/members/{id}` | OWNER 제거 불가. R3 연쇄는 Phase 3에서 보강 |

### 2.2 Backend - 초대 시스템 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 18 | 초대 링크 생성 | POST | `/organizations/{orgId}/invites` | code 자동 생성, 만료/횟수 설정 |
| 19 | 초대 목록 | GET | `/organizations/{orgId}/invites` | |
| 20 | 초대 삭제 | DELETE | `/organizations/{orgId}/invites/{id}` | |
| 21 | 초대 정보 (Public) | GET | `/org-invites/{code}` | 인증 불필요 |
| 22 | 초대 수락 | POST | `/org-invites/{code}/accept` | 검증: 만료/비활성/사용초과/이미멤버 |

### 2.3 Backend - 소유권 이양 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 7 | 소유권 이양 | PUT | `/organizations/{orgId}/transfer-ownership` | 기존 Owner → ADMIN, 대상 → OWNER |

### 2.4 ErrorCode 추가

```
ALREADY_ORG_MEMBER, ORG_MEMBER_NOT_FOUND,
CANNOT_REMOVE_ORG_OWNER, CANNOT_CHANGE_ORG_OWNER_ROLE,
CANNOT_TRANSFER_TO_SELF,
ORG_INVITE_NOT_FOUND, ORG_INVITE_INVALID
```

### 2.5 기본 필터 동작

- 구성원 목록 `work_status` 기본값: `ACTIVE,ON_LEAVE` (RESIGNED 제외)
- RESIGNED 변경 시 PENDING 휴가 자동 CANCELED (Phase 4 완료 후 보강)

### Deliverable

- 멤버 초대(이메일/링크) 동작
- 역할 변경, 소유권 이양 동작
- 구성원 목록 필터/검색/정렬 동작
- **누적 API 25개 완료** (+11: 멤버 6 + 초대 5)

### Acceptance Criteria

- [ ] 이메일로 기존 유저 초대 시 즉시 멤버 추가
- [ ] 미가입 이메일 초대 시 1회용 초대 링크 생성 + 이메일 발송
- [ ] 초대 링크 수락 시 OrganizationMember 생성, usedCount 증가
- [ ] 만료/비활성/사용초과 링크 수락 시 400 에러
- [ ] `work_status` 기본 필터 동작 (RESIGNED 기본 제외)
- [ ] 소유권 이양 시 기존 Owner → ADMIN, 대상 → OWNER 변경
- [ ] OWNER 역할 변경/제거 시도 시 400 에러

---

## Phase 3: 보드 연동 (R1/R2/R3)

> **목표**: 기존 보드 시스템과 조직을 연동하고, 3대 규칙을 적용한다.

### 의존성

- Phase 2 완료 필수 (멤버 관리 + 소유권 이양)

### 3.1 Backend - 보드 편입/방출 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 14 | 조직 보드 목록 | GET | `/organizations/{orgId}/boards` | task_progress 포함 |
| 15 | 편입 적격성 확인 | GET | `/organizations/{orgId}/boards/check-eligibility` | R1 사전 검증 |
| 16 | 보드 편입 | POST | `/organizations/{orgId}/boards` | R1 서버 검증 + 비관적 락 |
| 17 | 보드 방출 | DELETE | `/organizations/{orgId}/boards/{boardId}` | org_id = NULL |

### 3.2 Backend - OrganizationFacadeService

| Task | 설명 |
|------|------|
| OrganizationFacadeService | 이중 권한 검증 (OrgAdmin+ AND BoardOwner) |
| R1 검증 로직 | 보드 멤버 전원이 조직원인지 검증 |
| 편입 시 비관적 락 | Organization에 `@Lock(PESSIMISTIC_WRITE)` 적용 (R1 ↔ R3 Race Condition 방지) |

### 3.3 Backend - R2 기존 시스템 수정 (CRITICAL)

| Task | 수정 대상 | 설명 |
|------|----------|------|
| R2-a | `MemberService.addMember()` | 조직 보드인 경우 조직원 검증 추가 |
| R2-b | `InviteService.acceptBoardInvite()` | 조직 보드 초대 수락 시 조직원 검증 추가 |

### 3.4 Backend - R3 멤버 제거 연쇄 보강

| Task | 설명 |
|------|------|
| R3 보드 Owner 사전 검증 | 해당 멤버가 조직 보드 Owner이면 제거 차단 (400 CANNOT_REMOVE_BOARD_OWNER) |
| R3 조직 보드 자동 제거 | 해당 멤버를 조직 보드의 board_members에서 자동 삭제 |
| R3 응답 | 영향받은 보드 목록 포함 |

### 3.5 Backend - 기존 시스템 추가 수정

| Task | 수정 대상 | 설명 |
|------|----------|------|
| UserService 수정 | `UserService.deleteAccount()` | Organization Owner 검증 추가 (CANNOT_DEACTIVATE_ORG_OWNER) |
| 조직 삭제 보강 | `OrganizationService.delete()` | boards.org_id = NULL, invite_links 비활성화 |

### 3.6 ErrorCode 추가

```
BOARD_ALREADY_IN_ORGANIZATION, BOARD_OWNER_REQUIRED,
PERSONAL_BOARD_NOT_ALLOWED, BOARD_HAS_NON_ORG_MEMBERS,
NOT_ORG_MEMBER_FOR_BOARD, CANNOT_REMOVE_BOARD_OWNER,
CANNOT_DEACTIVATE_ORG_OWNER
```

### Deliverable

- 보드 편입/방출 동작
- R1/R2/R3 규칙 전체 적용
- 기존 MemberService, InviteService, UserService 수정 완료
- **누적 API 29개 완료** (+4: 보드 4)

### Acceptance Criteria

- [ ] 비조직원이 포함된 보드 편입 시도 → 400 BOARD_HAS_NON_ORG_MEMBERS + 비조직원 목록
- [ ] 조직 보드에 비조직원 추가 시도 → 403 NOT_ORG_MEMBER_FOR_BOARD
- [ ] 기존 보드 초대 링크로 비조직원이 조직 보드 합류 시도 → 403
- [ ] 조직 보드 Owner인 멤버 제거 시도 → 400 CANNOT_REMOVE_BOARD_OWNER
- [ ] 멤버 제거 시 조직 보드에서도 자동 제거 + 영향 보드 목록 응답
- [ ] 보드 방출 시 org_id = NULL, 보드 데이터 유지
- [ ] Organization Owner인 사용자 계정 비활성화 시도 → 400
- [ ] R1 ↔ R3 동시 실행 시 비관적 락으로 무결성 보장

---

## Phase 4: 휴가 시스템

> **목표**: 휴가 정책, 잔여 관리, 신청/승인 워크플로우를 구현한다.

### 의존성

- Phase 2 완료 필수 (멤버 관리)
- Phase 3 완료 시 R3 + 조직 삭제 연쇄에 휴가 처리 보강 가능

### 4.1 Backend - DB 마이그레이션

| Task | 파일 |
|------|------|
| V61 마이그레이션 | leave_policies, leave_balances, leave_requests 테이블 생성 |
| Enum 클래스 | LeaveCategory, LeaveDurationType, LeaveStatus |

### 4.2 Backend - 엔티티 & 레포지토리

| Task | 설명 |
|------|------|
| LeavePolicy 엔티티 | organization, name, leaveCategory, defaultDays, isPaid, requiresApproval, isActive |
| LeaveBalance 엔티티 | organization, member, policy, year, totalDays, usedDays |
| LeaveRequest 엔티티 | requester, policy, startDate, endDate, durationType, totalDays, status, reviewer |
| Repository 3개 | LeavePolicy, LeaveBalance, LeaveRequest |
| LeaveBalance 비관적 락 쿼리 | `findByMemberIdAndPolicyIdAndYearForUpdate()` (PESSIMISTIC_WRITE) |

### 4.3 Backend - 휴가 정책 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 31 | 정책 목록 | GET | `/organizations/{orgId}/leave-policies` | |
| 32 | 정책 생성 | POST | `/organizations/{orgId}/leave-policies` | 활성 멤버 전원 leave_balance 자동 생성 |
| 33 | 정책 수정 | PUT | `/organizations/{orgId}/leave-policies/{id}` | 비활성화 시 PENDING 요청 자동 CANCELED |

### 4.4 Backend - 잔여 관리 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 34 | 내 잔여 조회 | GET | `/organizations/{orgId}/my-leave-balance` | |
| 35 | 멤버 잔여 조회 | GET | `/organizations/{orgId}/members/{id}/leave-balance` | OrgAdmin+ |
| 36 | 잔여 수정 | PUT | `/organizations/{orgId}/members/{id}/leave-balance` | OrgAdmin+, 감사 로그 기록 |

### 4.5 Backend - 휴가 신청/승인 API

| # | API | Method | Path | 비고 |
|---|-----|--------|------|------|
| 37 | 휴가 신청 | POST | `/organizations/{orgId}/leave-requests` | 반차 단일일 검증, 중복 기간 검증, 잔여 확인 |
| 38 | 휴가 목록 | GET | `/organizations/{orgId}/leave-requests` | 날짜/상태/카테고리 필터 |
| 39 | 승인 | PUT | `.../{id}/approve` | 비관적 락 + 잔여 재검증 |
| 40 | 거절 | PUT | `.../{id}/reject` | 사유 입력 |
| 41 | 취소 (본인) | PUT | `.../{id}/cancel` | PENDING→무변동, APPROVED→잔여 복원 (end_date >= 오늘만) |

### 4.6 Backend - 기존 로직 보강

| Task | 설명 |
|------|------|
| 조직 생성 시 기본 정책 | `POST /organizations` 에서 기본 휴가정책 4개 자동 생성 (연차 15일, 병가 10일, 리프레시 5일, 기타 0일) |
| 멤버 합류 시 balance 생성 | 초대 수락/직접 추가 시 각 활성 정책에 대해 leave_balance 자동 생성 |
| R3 연쇄 보강 | 멤버 제거 시 PENDING 휴가 자동 CANCELED |
| RESIGNED 변경 보강 | work_status RESIGNED 변경 시 PENDING 휴가 자동 CANCELED |
| 조직 삭제 보강 | PENDING → CANCELED + APPROVED 미래 휴가 → CANCELED + 잔여 복원 |

### 4.7 핵심 비즈니스 로직

| 로직 | 설명 |
|------|------|
| total_days 자동 계산 | FULL_DAY: 캘린더 일수, HALF: 0.5일 (주말/공휴일 포함) |
| 반차 단일일 검증 | AM_HALF/PM_HALF → start_date == end_date 필수 |
| 중복 기간 검증 | 같은 날 FULL_DAY 충돌, AM+PM 조합 허용, 동일 타입 충돌 |
| 승인 동시성 제어 | 비관적 락으로 잔여 마이너스 방지 |
| 잔여 수동 변경 감사 | activity_log 기록 (LEAVE_BALANCE_ADJUSTED) |

### 4.8 ErrorCode 추가

```
LEAVE_POLICY_NOT_FOUND, LEAVE_POLICY_INACTIVE,
INSUFFICIENT_LEAVE_BALANCE, LEAVE_DATE_CONFLICT,
HALF_DAY_SINGLE_DATE_ONLY, LEAVE_REQUEST_NOT_FOUND,
LEAVE_ALREADY_PROCESSED, LEAVE_CANCEL_NOT_ALLOWED
```

### Deliverable

- 휴가 정책 CRUD + 자동 balance 생성
- 휴가 신청/승인/거절/취소 워크플로우 전체 동작
- 동시성 제어 (비관적 락)
- 조직 삭제/멤버 제거/RESIGNED 시 휴가 연쇄 처리
- **누적 API 41개 완료** (+12: 정책 3 + 잔여 3 + 신청/승인 5 + Phase 1 조직생성 보강 1)

### Acceptance Criteria

- [ ] 조직 생성 시 기본 휴가정책 4개 자동 생성
- [ ] 멤버 합류 시 각 활성 정책에 대해 leave_balance 자동 생성
- [ ] 정책 생성 시 기존 활성 멤버 전원에게 balance 자동 생성
- [ ] 반차 복수일 신청 시 400 HALF_DAY_SINGLE_DATE_ONLY
- [ ] 같은 날 AM_HALF + PM_HALF 신청 허용 (합산 1.0일)
- [ ] 잔여 부족 시 400 INSUFFICIENT_LEAVE_BALANCE
- [ ] 동시 승인 시 비관적 락으로 잔여 마이너스 방지
- [ ] 승인 후 취소 시 잔여 복원 (end_date >= 오늘인 경우만)
- [ ] 조직 삭제 시 APPROVED 미래 휴가 CANCELED + 잔여 복원
- [ ] 정책 비활성화 시 해당 PENDING 요청 자동 CANCELED
- [ ] 잔여 수동 변경 시 activity_log 기록

---

## Phase 5: 프론트엔드

> **목표**: Organization 서비스의 전체 UI를 구현한다.

### 의존성

- Phase 1~4 Backend API 완료 (또는 병렬 진행 시 API 스펙 확정)

### 5.1 라우팅 & 네비게이션

| Task | 설명 |
|------|------|
| 라우팅 추가 | `/organizations`, `/organizations/:orgId`, `/organizations/:orgId/members/:memberId`, `/org-invite/:code` |
| 사이드바 수정 | "조직 관리" 메뉴 아이템 추가 |
| types/index.ts 확장 | Organization, OrgMember, LeavePolicy, LeaveBalance, LeaveRequest 등 타입 추가 |
| services.ts 확장 | Organization 관련 API 서비스 함수 추가 |

### 5.2 조직 목록 페이지 (O-01)

| 컴포넌트 | 설명 |
|----------|------|
| OrganizationListPage | 페이지 컨테이너 |
| OrgCard | 조직 카드 (그라디언트 배경, 멤버수, 보드수, 내 역할) |
| CreateOrgModal (M-01) | 조직 생성 모달 (이름, 설명) |

### 5.3 조직 상세 페이지 (O-02 ~ O-07)

| 컴포넌트 | 화면 | 설명 |
|----------|------|------|
| OrganizationDetailPage | O-02 | 탭 컨테이너 (대시보드/구성원/보드/휴가관리/설정) |
| OrgHeader | 공통 | 조직명 + 멤버수 + 보드수 |
| OrgDashboardTab | O-02 | 요약 카드 4개 + 연동 보드 + 오늘 휴가 |
| OrgMembersTab | O-03 | 필터/검색 + 멤버 카드 그리드 |
| OrgMemberCard | O-03 | 개별 멤버 카드 (아바타, 이름, 부서, 직무) |
| OrgBoardsTab | O-05 | 연동 보드 리스트 + 편입/방출 |
| OrgLeaveTab | O-06 | 날짜별 휴가 현황 + 내 잔여 바 |
| OrgSettingsTab | O-07 | 기본정보, 부서/직무, 휴가정책, 초대링크, 소유권이양, 삭제 |

### 5.4 구성원 프로필 (O-04)

| 컴포넌트 | 설명 |
|----------|------|
| MemberProfilePage (또는 Modal) | 프로필 상세 (어바웃/히스토리 탭) |
| 어바웃 탭 | 개인정보 사이드바 + 자기소개 + 뱃지(향후) |
| 히스토리 탭 | Phase 2 예정 (placeholder) |

### 5.5 모달 컴포넌트

| 컴포넌트 | 코드 | 설명 |
|----------|------|------|
| InviteOrgMemberModal | M-02 | 이메일/링크 초대 |
| OrgMemberProfileModal | M-03 | 간략 프로필 (카드 클릭) |
| LeaveRequestModal | M-04 | 휴가 신청 (유형/기간/사유) |
| AddBoardToOrgModal | M-05 | 보드 편입 (R1 검증 표시) |
| LeaveReviewModal | M-06 | 승인/거절 모달 |
| TransferOwnershipModal | M-07 | 소유권 이양 |

### 5.6 초대 수락 페이지

| 컴포넌트 | 설명 |
|----------|------|
| OrgInviteAcceptPage | `/org-invite/:code` → 조직 정보 표시 + 수락 버튼 |

### 5.7 반응형 디자인

| 화면 | Desktop (md+) | Mobile |
|------|:------------:|:------:|
| 조직 목록 | 3열 카드 그리드 | 1열 스택 |
| 구성원 목록 | 2열 카드 그리드 | 1열 스택, 필터 접이식 |
| 구성원 프로필 | 2컬럼 (콘텐츠 + 사이드바) | 1컬럼 스택 |
| 휴가 현황 | 풀 테이블 | 가로 스크롤 |
| 조직 설정 | 중앙 정렬 max-w-3xl | 풀 너비 |

### Deliverable

- 전체 7개 화면 + 7개 모달 구현
- Bridge 디자인 시스템 적용
- 반응형 레이아웃
- API 연동 완료

### Acceptance Criteria

- [ ] 조직 목록 → 카드 클릭 → 조직 상세 (탭 이동) 동작
- [ ] 구성원 목록 필터/검색/정렬 동작
- [ ] 보드 편입 모달에서 R1 검증 결과 실시간 표시
- [ ] 휴가 신청 모달: 반차 선택 시 종료일 비활성화, total_days 자동 계산
- [ ] 휴가 현황: 날짜별 카테고리 테이블 정상 표시
- [ ] 소유권 이양 모달 정상 동작
- [ ] 초대 링크 수락 페이지 정상 동작
- [ ] 모바일 반응형 레이아웃 정상
- [ ] `npm run build` 타입 에러 없음

---

## Phase 6: 통합 & 안정화

> **목표**: 전체 시스템 통합, 엣지케이스 처리, QA를 수행한다.

### 의존성

- Phase 1~5 전체 완료

### 6.1 엣지케이스 검증 & 보강

| # | 항목 | 우선순위 | 설명 |
|---|------|----------|------|
| 6.1 | R3 보드 Owner 충돌 | CRITICAL | 조직 보드 Owner 제거 차단 검증 |
| 6.2 | Org Owner 계정 비활성화 | CRITICAL | 소유 조직 존재 시 계정 비활성화 차단 |
| 6.3 | 보드 초대 링크 R2 우회 | HIGH | 편입 전 생성된 보드 초대 링크 검증 |
| 6.4 | R1 ↔ R3 Race Condition | HIGH | 비관적 락 동시 실행 테스트 |
| 6.9 | 반차 복수일 제약 | CRITICAL | DB CHECK + 서비스 레이어 이중 검증 |
| 6.10 | AM_HALF + PM_HALF 중복 | HIGH | 같은 날 조합 허용, 동일 타입 차단 |
| 6.11 | 주말/공휴일 안내 | HIGH | UI에 "(주말/공휴일 포함)" 안내 문구 |
| 6.12 | 정책 생성 시 Balance 자동 생성 | HIGH | 기존 멤버 전원 balance 생성 검증 |
| 6.13 | 조직 삭제 시 APPROVED 미래 휴가 | HIGH | CANCELED + 잔여 복원 검증 |
| 6.14 | 정책 비활성화 시 PENDING | MEDIUM | 자동 CANCELED 검증 |
| 6.15 | RESIGNED 멤버 처리 | MEDIUM | 기본 필터 제외, PENDING 휴가 취소 |
| 6.6 | board_type 변경 방지 | MEDIUM | CHECK 제약 동작 검증 |
| 6.7 | 멤버 제거 시 PENDING 휴가 | MEDIUM | 자동 CANCELED 검증 |
| 6.8 | 보드 방출 안내 | LOW | 확인 다이얼로그 문구 검증 |
| 6.17 | 잔여 수동 변경 감사 | MEDIUM | activity_log 기록 검증 |

### 6.2 i18n (국제화)

| Task | 설명 |
|------|------|
| 한국어 (ko) | 조직 관련 번역 키 추가 (1순위) |
| 영어 (en) | 조직 관련 번역 키 추가 (1순위) |
| 나머지 8개 언어 | 조직 관련 번역 키 추가 (2순위) |

### 6.3 빌드 검증

```bash
# Frontend 타입 체크 + 빌드
cd frontend && npm run build

# Backend 빌드 + 테스트
cd backend && ./gradlew build --no-daemon
```

### 6.4 QA 체크리스트

| 카테고리 | 항목 |
|----------|------|
| **조직 CRUD** | 생성/수정/삭제 정상, soft delete 동작 |
| **멤버 관리** | 초대(이메일/링크), 역할 변경, 제거(R3), 소유권 이양 |
| **보드 연동** | 편입(R1), 방출, R2(MemberService + InviteService) |
| **휴가** | 신청/승인/거절/취소, 반차 검증, 중복 검증, 동시성 |
| **권한** | OrgMember/OrgAdmin/OrgOwner 각 레벨 접근 제어 |
| **에러 처리** | 모든 ErrorCode 응답 정상, FE 에러 메시지 표시 |
| **반응형** | 모바일/태블릿/데스크탑 레이아웃 |
| **기존 시스템** | 독립 보드 기존 동작 유지, 기존 멤버 초대 정상 |

### Deliverable

- 전체 엣지케이스 검증 완료
- i18n 번역 완료
- 빌드 성공 (FE + BE)
- QA 통과

### Acceptance Criteria

- [ ] 6.1~6.17 전체 엣지케이스 시나리오 통과
- [ ] 기존 독립 보드 기능 100% 정상 동작 (리그레션 없음)
- [ ] `npm run build` 성공
- [ ] `./gradlew build --no-daemon` 성공
- [ ] Flyway V60, V61 마이그레이션 dev 환경 정상 적용
- [ ] 10개 언어 번역 키 누락 없음

---

## HR Extension Phases

> HR Extension은 Core Phase 1~6 완료 후 별도 Phase로 진행합니다.
> 기획서: `docs/Organization/06-HR-Extension.md`

### HR-P1: Anniversary & Celebrations ✅ Implemented

> **목표**: 기념일(생일/입사일) 알림 + 축하 메시지 기능 구현
> **Flyway**: V65 | **신규 테이블**: 2개 | **신규 API**: 7개

**Backend:**
| Task | 설명 | 상태 |
|------|------|------|
| V65 마이그레이션 | org_anniversary_settings, org_celebration_messages 테이블 + timezone 컬럼 | ✅ |
| Enum 클래스 | AnniversaryType, NotifyTiming, DashboardRange | ✅ |
| OrgAnniversarySetting 엔티티 | 1:1 조직 설정 (birthday/hire 토글, notify timing, dashboard range) | ✅ |
| OrgCelebrationMessage 엔티티 | 축하 메시지 (author → target, UNIQUE 중복 방지) | ✅ |
| OrgAnniversaryService | upcoming 조회, 메시지 CRUD, 설정 CRUD (7 메서드) | ✅ |
| OrgAnniversaryController | 7개 REST 엔드포인트 | ✅ |
| AnniversaryNotificationScheduler | 매 시간 cron, 멤버별 timezone 09:00 체크, 윤년 처리 | ✅ |
| ErrorCode 추가 | CELEBRATION_MESSAGE_ALREADY_EXISTS (409), NOT_FOUND (404), FORBIDDEN (403) | ✅ |
| OrgActivityType 확장 | ANNIVERSARY_CELEBRATED 추가 | ✅ |

**Frontend:**
| Task | 설명 | 상태 |
|------|------|------|
| AnniversaryWidget | 대시보드 위젯 (today/week/month 그룹, 범위 드롭다운) | ✅ |
| CelebrationModal | MotionModal 기반 축하 메시지 작성/조회 (409 중복 핸들링) | ✅ |
| OrgSettingsTab 확장 | 기념일 설정 섹션 (토글, 라디오 그룹) | ✅ |
| OrgDashboardTab 통합 | AnniversaryWidget + CelebrationModal 연동 | ✅ |
| types/index.ts | AnniversaryItem, CelebrationMessage, AnniversarySettings 타입 | ✅ |
| services.ts + api.ts | anniversaryService / anniversaryAPI (7 메서드) | ✅ |
| i18n 10개 언어 | org.anniversary.* 키 28개 (ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi) | ✅ |

**핵심 구현 사항:**
- **NotifyTiming 동작**: SAME_DAY=당일만, DAY_BEFORE=전날+당일, THREE_DAYS_BEFORE=3일전~당일 매일
- **윤년 처리**: 2/29 생일 → 비윤년에는 2/28로 매칭
- **Timezone 스케줄러**: 매 시간 cron, 각 멤버의 timezone 기준 09:00 체크
- **Cursor Pagination**: fetch limit+1, nextCursor 방식
- **축하 메시지 중복 방지**: UNIQUE(author, target, type, date) → 409 에러

---

### HR-P2: Org Chart & Hierarchy (예정)

> **Flyway**: V66 | Phase 2 기획서 참조

### HR-P3: Onboarding (예정)

> **Flyway**: V67~V68 | Phase 3 기획서 참조

### HR-P4: 1:1 Meetings (예정)

> **Flyway**: V69~V70 | Phase 4 기획서 참조

### HR-P5: Attendance (예정)

> **Flyway**: V71 | Phase 5 기획서 참조

---

## Phase 진행 요약

| Phase | 내용 | Backend API | 누적 API | 핵심 리스크 |
|-------|------|-------------|---------|------------|
| **1** | 기반 구축 | 14개 | 14 | DB 스키마 설계 |
| **2** | 멤버 관리 | 11개 | 25 | 초대 시스템, 소유권 이양 |
| **3** | 보드 연동 | 4개 | 29 | R1/R2/R3 규칙, **기존 코드 수정** |
| **4** | 휴가 시스템 | 12개 | 41 | 동시성 제어, 상태 머신, 연쇄 처리 |
| **5** | 프론트엔드 | - | 41 | 7화면 + 7모달, Bridge 디자인 시스템 |
| **6** | 통합 & 안정화 | - | 41 | 17개 엣지케이스, 리그레션 방지 |
| **HR-P1** | Anniversary & Celebrations ✅ | 7개 | 48 | 스케줄러 타임존, 윤년, 중복 방지 |

---

## 병렬 진행 가능 영역

Phase 5(프론트엔드)는 API 스펙이 확정된 시점부터 **Backend와 병렬 진행 가능**합니다.

```
Timeline:
──────────────────────────────────────────────────────
Phase 1 ████████
Phase 2          ████████
Phase 3                   ████████
Phase 4                   ████████  (Phase 3과 부분 병렬 가능)
Phase 5          ░░░░░░░░████████████████  (API 스펙 확정 후 UI 선행)
Phase 6                                  ████████
──────────────────────────────────────────────────────
         BE 기반    멤버    보드+휴가       FE      통합
```

**병렬 가능 조합:**
- Phase 3 + Phase 4: 보드 연동과 휴가 시스템은 상호 독립적 (단, Phase 4의 연쇄 처리 일부는 Phase 3 완료 후)
- Phase 5 (FE 라우팅/타입/기본 레이아웃) → Phase 2 완료 시점부터 시작 가능
- Phase 5 (FE 휴가 UI) → Phase 4 API 스펙 확정 후 시작 가능

---

## 관련 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| Overview | `docs/Organization/00-Overview.md` | 프로젝트 개요, 핵심 컨셉, 엣지케이스 |
| IA | `docs/Organization/01-IA.md` | 화면 구조, 와이어프레임 |
| ERD | `docs/Organization/02-ERD.md` | 엔티티 설계, DDL, JPA |
| API | `docs/Organization/03-API.md` | 전체 41개 API 명세 |
| Flows | `docs/Organization/04-Flows.md` | 핵심 사용자 플로우, 상태 머신 |
