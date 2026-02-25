# Organization Service - Overview

> **Version**: v1.0.0
> **Date**: 2026-02-25
> **Status**: Planning
> **Author**: BRIDGE Team

---

## 1. Project Summary

BRIDGE 칸반보드 SaaS에 **Organization(조직)** 계층을 추가하여, 소규모 팀(5~50명)이 칸반 + HR 관리를 하나의 플랫폼에서 수행할 수 있도록 확장합니다.

### 핵심 목표
- 조직 단위로 보드와 구성원을 통합 관리
- 구성원 디렉토리 및 프로필 관리
- 휴가 신청/승인 워크플로우 제공
- 기존 보드 시스템과의 유연한 연동 (편입/방출)

---

## 2. Scope

### Phase 1 (MVP) - 이번 기획 범위
| 기능 | 설명 |
|------|------|
| 조직 CRUD | 생성, 수정, 삭제, 목록 |
| 조직 멤버 관리 | 초대, 역할 변경, 프로필 관리, 제거 |
| 보드 연동 | 기존 보드 편입/방출 (1 Board : 0..1 Org) |
| 구성원 디렉토리 | 필터(부서/직무/계약/상태) + 검색 + 카드형 목록 |
| 구성원 프로필 | 개인정보, 자기소개, 탭(어바웃/히스토리) |
| 휴가 정책 설정 | 조직별 휴가 유형 및 기본 부여일 관리 |
| 휴가 잔여/부여 관리 | 멤버별 연간 휴가 잔여 현황 |
| 휴가 신청/승인 | 신청 → 승인/거절 워크플로우 |
| 일일 휴가 현황 | 날짜별 카테고리(연차/병가/리프레시/기타) 테이블 |

### Phase 2 (향후 확장)
| 기능 | 설명 |
|------|------|
| 조직 요금제 | 조직 단위 구독/결제 |
| 조직 대시보드 | 통계, 활동 요약, 보드 진행률 |
| 부서/팀 관리 | 하위 조직 구조 (팀 → 부서) |
| 근태 관리 | 출퇴근, 초과근무 |
| 인사 히스토리 | 부서 이동, 직급 변경 이력 |
| 조직 공지 | 조직 내 공지사항 |
| 조직 알림 | 휴가 승인/거절, 멤버 합류 등 알림 |

---

## 3. Core Concepts

### 3.1 Organization ↔ Board 관계
```
Organization (0..1) ←──── Board (*)
                    nullable FK
```
- **선택적 연동** (B안): 보드는 독립적으로 존재 가능
- 보드는 **최대 1개** 조직에만 소속 가능
- 조직에서 보드를 자유롭게 **편입/방출** 가능
- 보드 편입 시 기존 보드 멤버/데이터는 그대로 유지

### 3.2 Organization ↔ User 관계
```
Organization (1) ──→ (*) OrganizationMember (*) ←── (1) User
```
- 사용자는 여러 조직에 소속 가능
- 조직 멤버십 ≠ 보드 멤버십 (독립적)
- 조직 멤버에게 HR 정보 (부서, 직무, 계약형태 등) 부가

### 3.3 이중 권한 체계
```
시스템 레벨:  SystemRole (USER / TESTER / ADMIN)
조직 레벨:   OrgRole (OWNER / ADMIN / MEMBER)       ← NEW
보드 레벨:   BoardRole (OWNER / ADMIN / MEMBER / VIEWER)
```
- 조직 역할은 보드 역할에 영향을 주지 않음
- **조직 보드에는 조직원만 참여 가능** (3대 규칙 참조)
- 조직에 가입했다고 해서 조직 내 보드에 자동 접근되지 않음 (보드별 별도 초대)
- 독립 보드 (organization_id = NULL)는 기존과 동일하게 누구나 참여 가능

### 3.5 조직-보드 멤버 동기화 3대 규칙

> **원칙: "조직 보드 = 조직원만"**

| # | 규칙 | 시점 | 동작 |
|---|------|------|------|
| **R1** | 보드 편입 전제조건 | 보드를 조직에 편입할 때 | 보드의 **모든 멤버**가 조직원이어야 편입 가능. 비조직원 존재 시 차단 + "먼저 조직에 초대하세요" 안내 |
| **R2** | 조직 보드 멤버 추가 제한 | 조직 소속 보드에 멤버를 추가할 때 | 해당 유저가 **조직원인지 검증**. 비조직원 → 차단 + "먼저 조직에 초대하세요" 안내 |
| **R3** | 조직 멤버 제거 연쇄 | 조직에서 멤버를 제거할 때 | 해당 멤버가 속한 **조직 보드에서도 자동 제거** (경고 후 진행) |

```
[R1] 보드 편입
     보드 멤버 전원이 조직원? ── YES → 편입 완료
                              └── NO → ⚠️ 차단 (비조직원 목록 표시)

[R2] 조직 보드에 멤버 추가
     추가 대상이 조직원? ── YES → 보드 멤버 추가
                         └── NO → ⚠️ 차단 ("먼저 조직에 초대하세요")

[R3] 조직에서 멤버 제거
     조직 보드에 속해있음? ── YES → 해당 보드에서도 제거 (경고 표시)
                           └── NO → 조직에서만 제거
```

### 3.4 가입 ↔ 조직 초대 플로우
```
기존: 회원가입 → 보드 초대/생성 → 사용
확장: 회원가입 → 조직 초대 → 조직 내 보드 접근/생성 → 사용
                  또는
     회원가입 → 독립 보드 생성 → (나중에 조직에 편입)
```
- 기존 가입 시스템 **변경 없음**
- 조직 합류는 **초대 방식** (이메일/링크)

---

## 4. Permission Matrix

### 조직 권한
| 기능 | ORG_OWNER | ORG_ADMIN | ORG_MEMBER |
|------|:---------:|:---------:|:----------:|
| 조직 삭제 | O | X | X |
| 조직 설정 수정 | O | O | X |
| 멤버 초대 | O | O | X |
| 멤버 역할 변경 | O | O* | X |
| 멤버 제거 | O | O* | X |
| 멤버 정보 수정 | O | O | 본인만 |
| 보드 편입/방출 | O | O | X |
| 부서/직무 관리 | O | O | X |
| 휴가 정책 설정 | O | O | X |
| 휴가 승인/거절 | O | O | X |
| 휴가 신청 | O | O | O |
| 구성원 조회 | O | O | O |
| 휴가 현황 조회 | O | O | O |
| 본인 프로필 수정 | O | O | O |

> *ORG_ADMIN은 OWNER 역할 변경/제거 불가

---

## 5. Technical Integration

### 기존 시스템 영향 최소화
| 영역 | 변경 내용 |
|------|----------|
| `boards` 테이블 | `organization_id` nullable FK 추가 (Flyway) |
| `MemberService` (보드 멤버 추가) | 조직 보드인 경우 조직원 검증 로직 추가 (R2) |
| `InviteService` (보드 초대 수락) | 조직 보드인 경우 조직원 검증 추가 (R2 우회 방지) |
| `UserService` (계정 비활성화) | 소유 조직 검증 차단 + 소속 조직 자동 탈퇴 (R3 연쇄) |
| `BoardService` (보드 타입 변경) | 조직 소속 보드 PERSONAL 전환 차단 |
| Sidebar | "조직" 메뉴 아이템 추가 |
| 라우팅 | `/organizations/*` 경로 추가 |
| 기존 보드 기능 | **변경 없음** (독립 보드는 기존 동작 유지) |
| 기존 인증 | **변경 없음** |

### 신규 도메인 패키지 (Backend)
```
com.kanban.domain.organization/
├── Organization.java
├── OrganizationMember.java
├── OrgRole.java
├── controller/
│   ├── OrganizationController.java
│   ├── OrgMemberController.java
│   └── OrgBoardController.java
├── dto/
├── repository/
└── service/
    └── OrganizationService.java

com.kanban.domain.leave/
├── LeavePolicy.java
├── LeaveBalance.java
├── LeaveRequest.java
├── LeaveType.java
├── controller/
│   └── LeaveController.java
├── dto/
├── repository/
└── service/
    └── LeaveService.java
```

### 신규 프론트엔드 구조
```
frontend/src/app/
├── pages/
│   ├── OrganizationListPage.tsx
│   └── OrganizationDetailPage.tsx
├── components/
│   └── organization/
│       ├── OrgCard.tsx
│       ├── OrgHeader.tsx
│       ├── OrgMembersTab.tsx
│       ├── OrgMemberCard.tsx
│       ├── OrgMemberProfileModal.tsx
│       ├── OrgBoardsTab.tsx
│       ├── OrgLeaveTab.tsx
│       ├── OrgLeaveRequestModal.tsx
│       ├── OrgSettingsTab.tsx
│       ├── CreateOrgModal.tsx
│       ├── InviteOrgMemberModal.tsx
│       └── AddBoardToOrgModal.tsx
└── types/index.ts  (Organization 관련 타입 추가)
```

---

## 6. Edge Cases & Business Rules

### 6.1 R3 보드 Owner 충돌 (CRITICAL)

조직에서 멤버를 제거할 때, 해당 멤버가 **조직 보드의 Owner**인 경우 `board.owner_id`가 NOT NULL이므로 데이터 무결성이 깨짐.

**규칙**: 조직 보드의 Owner인 멤버는 제거할 수 없음. 먼저 보드 소유권을 이양하거나 보드를 방출해야 함.

```
[R3 확장] 조직 멤버 제거 전
     해당 멤버가 조직 보드 Owner? ── YES → ⚠️ 차단
                                          "보드 소유권을 먼저 이양하세요"
                                          (대상 보드 목록 표시)
                                  └── NO → R3 정상 진행
```

### 6.2 조직 Owner 계정 비활성화 (CRITICAL)

사용자가 계정을 비활성화할 때, 소유한 조직이 있으면 조직이 관리 불가 상태가 됨.

**규칙**: 조직을 소유한 사용자는 계정 비활성화 전 **모든 조직의 소유권을 이양**해야 함.

```
[계정 비활성화]
     소유한 조직 존재? ── YES → ⚠️ 차단
                              "N개 조직의 소유권을 먼저 이양하세요"
                       └── NO → 정상 비활성화
                              └→ 소속 조직에서 자동 제거 (R3 연쇄 적용)
```

### 6.3 보드 초대 링크 R2 우회 방지 (HIGH)

보드를 조직에 편입한 후, 편입 전에 생성된 보드 초대 링크로 비조직원이 합류 가능.

**규칙**: 기존 `InviteService.acceptBoardInvite()`에서 **조직 보드인 경우 조직원 검증** 추가.

```
[보드 초대 수락 시]
     board.organization_id 존재? ── YES → 수락자가 조직원?
                                           ├─ YES → 정상 합류
                                           └─ NO → 403 NOT_ORG_MEMBER_FOR_BOARD
                                └── NULL → 기존 로직 (누구나 합류 가능)
```

### 6.4 R1 ↔ R3 Race Condition (HIGH)

보드 편입(R1)과 멤버 제거(R3)가 동시 실행되면 R1 검증 통과 후 실제 편입 시점에 비조직원 발생 가능.

**규칙**: 보드 편입 시 `Organization`에 **비관적 락** 적용 (`@Lock(PESSIMISTIC_WRITE)`).

### 6.5 구독/요금제 (Phase 1 한계)

Phase 1에서는 **보드별 독립 구독**을 유지. 조직 멤버가 여러 보드에 중복 과금될 수 있으나, Phase 2에서 조직 단위 통합 결제로 해결.

### 6.6 board_type 변경 방지 (MEDIUM)

조직에 소속된 보드의 타입을 PERSONAL로 변경하면 모순 발생.

**규칙**: DB 체크 제약 + 서비스 레이어 검증
```sql
CHECK (organization_id IS NULL OR board_type = 'TEAM')
```

### 6.7 멤버 제거 시 PENDING 휴가 처리 (MEDIUM)

조직에서 멤버를 제거할 때, 해당 멤버의 PENDING 상태 휴가 요청이 남아있으면 처리 불가.

**규칙**: R3 연쇄 제거 시 해당 멤버의 **PENDING 휴가 요청을 자동 CANCELED** 처리.

### 6.8 보드 방출 안내 (LOW)

조직에서 보드를 방출하면 독립 보드가 되어 비조직원도 참여 가능해짐.

**규칙**: 방출 확인 다이얼로그에 "방출 후 비조직원도 이 보드에 참여할 수 있습니다" 안내 문구 표시.

---

## 7. Related Documents

| 문서 | 경로 | 설명 |
|------|------|------|
| IA | `docs/Organization/01-IA.md` | 화면 구조, 네비게이션, 화면 목록 |
| ERD | `docs/Organization/02-ERD.md` | 엔티티 설계, 테이블 DDL, 마이그레이션 |
| API | `docs/Organization/03-API.md` | 전체 API 엔드포인트 명세 |
| Flows | `docs/Organization/04-Flows.md` | 핵심 사용자 플로우, 상태 머신 |
