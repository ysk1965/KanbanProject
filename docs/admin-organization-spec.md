# Admin Organization 관리 명세서

> 작성일: 2026-03-03
> 상태: Draft

## 현황 분석

현재 Admin 패널은 **9개 탭**으로 구성되어 있으며, Organization 관리 기능이 **전혀 없음**.

| 현재 Admin 탭 | 관리 대상 |
|---------------|-----------|
| Dashboard | 통계 (사용자, 보드, 구독) |
| Analytics | 가입 추이, DAU/WAU/MAU, 전환율 |
| Users | 사용자 CRUD, 역할 변경, 비활성화 |
| Boards | 보드 CRUD, Tier 변경, 소유권 이전 |
| Subscriptions | Board 구독 목록 |
| Announcements | 시스템 공지사항 |
| System | 유지보수 모드 |
| Monitoring | 시스템 상태 |
| Inquiries | 문의 관리 |

**문제점**: Organization은 독립 도메인(`OrganizationController`)으로만 관리되며, 시스템 관리자(ADMIN)가 전체 조직을 조회·관리할 수 없는 상태.

---

## 목차

1. [Organization 목록 관리](#1-organization-목록-관리)
2. [Organization 상세 모달](#2-organization-상세-모달)
3. [구독 관리](#3-구독-관리)
4. [Dashboard 통계 통합](#4-dashboard-통계-통합)
5. [삭제된 조직 관리](#5-삭제된-조직-관리)
6. [우선순위 정리](#6-우선순위-정리)

---

## 1. Organization 목록 관리

### 기능 설명
- 전체 Organization 목록을 페이지네이션으로 조회
- 이름 / Owner 이메일로 검색
- Plan(FREE/TEAM), 구독 상태(ACTIVE/TRIAL/CANCELED/SUSPENDED)로 필터
- Active / Deleted 토글 (AdminBoardsTab 패턴)

### Backend API

```
GET /api/v1/admin/organizations?page=0&size=20&search=keyword&plan=TEAM&status=ACTIVE
GET /api/v1/admin/organizations/deleted?page=0&size=20&search=keyword
```

### Response DTO

```java
// AdminResponse.java 내부 record 추가

public record OrgList(
    List<OrgSummary> organizations,
    long total,
    int page,
    int size
) {}

public record OrgSummary(
    String id,
    String name,
    String description,
    String logoUrl,
    OwnerInfo owner,              // 기존 OwnerInfo 재사용
    String plan,                  // FREE / TEAM
    String subscriptionStatus,    // ACTIVE / TRIAL / PAST_DUE / SUSPENDED / CANCELED
    int memberCount,
    int boardCount,
    int seatCount,
    LocalDateTime trialEndsAt,
    LocalDateTime createdAt,
    LocalDateTime deletedAt
) {
    public static OrgSummary of(Organization org, int memberCount, int boardCount) { ... }
}
```

### Repository 쿼리

```java
// OrganizationRepository에 추가
@Query("SELECT o FROM Organization o " +
       "LEFT JOIN FETCH o.owner " +
       "LEFT JOIN FETCH o.subscription " +
       "WHERE (:search IS NULL OR o.name LIKE %:search% OR o.owner.email LIKE %:search%) " +
       "AND (:deletedOnly = false OR o.deletedAt IS NOT NULL) " +
       "AND (:deletedOnly = true OR o.deletedAt IS NULL)")
Page<Organization> findAllForAdmin(@Param("search") String search,
                                    @Param("deletedOnly") boolean deletedOnly,
                                    Pageable pageable);
```

### Frontend 컴포넌트

- **`AdminOrganizationsTab.tsx`** 신규 생성
- `AdminBoardsTab.tsx` 패턴 그대로 적용 (검색바 + 필터 드롭다운 + 테이블 + 페이지네이션)

#### 테이블 컬럼

| 컬럼 | 내용 |
|------|------|
| Organization | 로고 + 이름 |
| Owner | 이름 + 이메일 |
| Plan | FREE / TEAM 뱃지 |
| Status | ACTIVE / TRIAL / CANCELED 뱃지 |
| Members | 멤버 수 |
| Boards | 연결 보드 수 |
| Seats | 구매 시트 수 |
| Created | 생성일 |

---

## 2. Organization 상세 모달

### 기능 설명
- Organization 클릭 시 상세 모달 오픈
- 기본 정보, 구독 현황, 멤버 목록, 연결 보드, 구조 설정 표시
- 관리 액션: 정보 수정, 소유권 이전, 소프트 삭제, 영구 삭제

### Backend API

```
GET    /api/v1/admin/organizations/{orgId}               -- 상세 조회
PATCH  /api/v1/admin/organizations/{orgId}               -- 정보 수정 (이름, 설명)
DELETE /api/v1/admin/organizations/{orgId}               -- 소프트 삭제
POST   /api/v1/admin/organizations/{orgId}/restore       -- 복구
DELETE /api/v1/admin/organizations/{orgId}/permanent     -- 영구 삭제
POST   /api/v1/admin/organizations/{orgId}/transfer-ownership  -- 소유권 이전
```

### Request DTOs

```java
// AdminRequest.java 내부 record 추가

public record UpdateOrganization(
    String name,
    String description
) {}

public record TransferOrgOwnership(
    @NotBlank String newOwnerMemberId    // OrganizationMember ID
) {}
```

### Response DTO

```java
public record OrgDetail(
    // 기본 정보
    String id,
    String name,
    String description,
    String logoUrl,
    OwnerInfo owner,
    // 구독 정보
    String plan,
    String subscriptionStatus,
    String billingCycle,          // MONTHLY / YEARLY
    int seatCount,
    int activeMemberCount,
    Integer pricePerSeat,
    Integer totalPrice,
    LocalDateTime trialEndsAt,
    LocalDateTime currentPeriodEnd,
    Boolean trialUsed,
    // 구조 토글
    Boolean departmentsEnabled,
    Boolean jobGroupsEnabled,
    Boolean positionsEnabled,
    Boolean titlesEnabled,
    Boolean gradesEnabled,
    // 카운트
    int memberCount,
    int boardCount,
    // 중첩 데이터
    List<OrgMemberInfo> members,
    List<BoardSummary> boards,    // 기존 BoardSummary 재사용
    // 날짜
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    LocalDateTime deletedAt
) {
    public static OrgDetail of(Organization org, List<OrganizationMember> members,
                                List<Board> boards) { ... }
}

public record OrgMemberInfo(
    String id,
    String userId,
    String name,
    String email,
    String profileImage,
    String role,                  // OWNER / ADMIN / MEMBER
    String departmentName,
    String positionName,
    String titleName,
    String contractType,
    String workStatus,
    LocalDateTime joinedAt
) {
    public static OrgMemberInfo of(OrganizationMember member) { ... }
}
```

### Frontend 컴포넌트

- **`AdminOrgDetailModal.tsx`** 신규 생성
- `AdminBoardDetailModal.tsx` 패턴 (MotionModal + 섹션 구성)

#### 모달 구성

```
┌─────────────────────────────────────────────┐
│ ▬ Top Accent Line (gradient)                │
├─────────────────────────────────────────────┤
│ Header: 로고 + 조직명 + Plan 뱃지 + Status 뱃지 │
│         설명 텍스트                            │
├─────────────────────────────────────────────┤
│ Owner 섹션                                   │
│   아바타 + 이름 + 이메일                        │
│   [소유권 이전] 버튼                            │
├─────────────────────────────────────────────┤
│ 구독 섹션                                     │
│   Plan | Status | Billing | Seats | Price    │
│   Trial 종료일 | 현재 구독 기간                  │
│   [Plan 변경] [시트 조정] [Trial 연장]          │
│   [Cancel] [Suspend] [Activate]              │
├─────────────────────────────────────────────┤
│ 멤버 목록 (접기/펼치기)                         │
│   역할 | 이름 | 부서 | 직책 | 근무상태           │
├─────────────────────────────────────────────┤
│ 연결 보드 (접기/펼치기)                         │
│   보드명 | Tier | 멤버 수                       │
├─────────────────────────────────────────────┤
│ 구조 설정 (읽기 전용 뱃지)                      │
│   부서 ✓ | 직군 ✓ | 직책 ✓ | 호칭 ✗ | 직급 ✓   │
├─────────────────────────────────────────────┤
│ Danger Zone                                  │
│   [정보 수정] [소프트 삭제] [영구 삭제]           │
├─────────────────────────────────────────────┤
│ Footer: "Esc 닫기"                            │
└─────────────────────────────────────────────┘
```

---

## 3. 구독 관리

### 기능 설명
- Admin이 Organization 구독을 직접 수정 (Polar.sh 결제 bypass)
- Plan 변경 (FREE ↔ TEAM)
- 시트 수 조정
- Trial 연장
- 상태 변경 (Cancel / Suspend / Activate)

### Backend API

```
PATCH /api/v1/admin/organizations/{orgId}/subscription              -- 구독 수정
PATCH /api/v1/admin/organizations/{orgId}/subscription/extend-trial -- Trial 연장
```

### Request DTOs

```java
public record UpdateOrgSubscription(
    String plan,              // FREE / TEAM
    String status,            // ACTIVE / CANCELED / SUSPENDED
    String billingCycle,      // MONTHLY / YEARLY
    Integer seatCount
) {}

public record ExtendOrgTrial(
    @Min(1) Integer extendDays
) {}
```

### AdminService 메서드

```java
public OrgDetail updateOrgSubscription(String orgId, UpdateOrgSubscription request) {
    Organization org = getActiveOrgOrThrow(orgId);
    OrgSubscription sub = org.getSubscription();

    if (request.plan() != null) {
        // Plan 변경 로직 (FREE→TEAM: activateTeam, TEAM→FREE: downgradeToFree)
    }
    if (request.seatCount() != null) {
        sub.updateSeatCount(request.seatCount());
    }
    if (request.status() != null) {
        // 상태 변경: cancel(), suspend(), reactivate()
    }
    // ...
}

public OrgDetail extendOrgTrial(String orgId, ExtendOrgTrial request) {
    Organization org = getActiveOrgOrThrow(orgId);
    OrgSubscription sub = org.getSubscription();
    // trialEndsAt += extendDays
    // ...
}
```

---

## 4. Dashboard 통계 통합

### 기능 설명
- `AdminDashboardTab`에 Organization 통계 섹션 추가
- 기존 Stats Cards / Tier Distribution 패턴과 동일

### Backend API

```
GET /api/v1/admin/statistics/organizations
```

### Response DTO

```java
public record OrgStatistics(
    long totalOrganizations,
    long activeOrganizations,       // deletedAt IS NULL
    long freeOrgs,
    long teamOrgs,
    long trialOrgs,
    long activeOrgSubscriptions,    // status = ACTIVE
    long totalOrgMembers
) {}
```

또는 기존 `Statistics` record에 org 필드 추가:

```java
// 기존 Statistics에 추가
long totalOrganizations,
long freeOrgs,
long teamOrgs,
long trialOrgs,
long activeOrgSubscriptions
```

### Frontend 표시

```
┌─────────────────────────────────────────────────┐
│ 🏢 Organization                                  │
│                                                   │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│ │Total Orgs│ │ Active   │ │  Trial   │ │ Active ││
│ │    12    │ │ Subs: 8  │ │ Orgs: 2  │ │Members ││
│ │         │ │          │ │          │ │  156   ││
│ └──────────┘ └──────────┘ └──────────┘ └────────┘│
│                                                   │
│ Plan Distribution                                 │
│ ████████████████░░░░░░░  FREE: 4  TEAM: 8        │
└─────────────────────────────────────────────────┘
```

---

## 5. 삭제된 조직 관리

### 기능 설명
- Active / Deleted 토글 (AdminBoardsTab의 deleted boards 패턴)
- 삭제된 조직 복구 / 영구 삭제

### Backend API

```
GET    /api/v1/admin/organizations/deleted          -- 삭제된 조직 목록
POST   /api/v1/admin/organizations/{orgId}/restore  -- 복구
DELETE /api/v1/admin/organizations/{orgId}/permanent -- 영구 삭제
```

---

## 6. 우선순위 정리

### P0 — 필수 (이번 구현)

| # | 기능 | 관련 API | FE 컴포넌트 |
|---|------|---------|------------|
| 1 | Organization 목록 | `GET /admin/organizations` | AdminOrganizationsTab |
| 2 | Organization 상세 모달 | `GET /admin/organizations/{orgId}` | AdminOrgDetailModal |
| 3 | 구독 관리 | `PATCH .../subscription`, `PATCH .../extend-trial` | 모달 내 구독 섹션 |
| 4 | 삭제된 조직 | `GET .../deleted`, `POST .../restore`, `DELETE .../permanent` | 탭 내 토글 |
| 5 | Dashboard 통계 | `GET /admin/statistics/organizations` | AdminDashboardTab 확장 |
| 6 | 조직 정보 수정 | `PATCH /admin/organizations/{orgId}` | 모달 내 액션 |
| 7 | 소유권 이전 | `POST .../transfer-ownership` | 모달 내 액션 |
| 8 | 영구 삭제 | `DELETE .../permanent` | 모달 Danger Zone |

### P1 — 향후 확장

| # | 기능 | 설명 |
|---|------|------|
| 9 | Org 생성 트렌드 차트 | AdminAnalyticsTab 연동 |
| 10 | Org vs Board 구독 매출 분석 | Revenue breakdown |
| 11 | 조직별 멤버 활동 지표 | Engagement metrics |
| 12 | Org AI 크레딧 관리 | 조직 단위 AI 크레딧 조정 |

---

## 변경 파일 목록

### Backend (신규 없음, 기존 파일 수정)

| 파일 | 변경 내용 |
|------|-----------|
| `domain/admin/dto/AdminResponse.java` | OrgList, OrgSummary, OrgDetail, OrgMemberInfo, OrgStatistics record 추가 |
| `domain/admin/dto/AdminRequest.java` | UpdateOrganization, TransferOrgOwnership, UpdateOrgSubscription, ExtendOrgTrial record 추가 |
| `domain/admin/service/AdminService.java` | Organization 관리 메서드 11개 추가, Repository 3개 주입 |
| `domain/admin/controller/AdminController.java` | Organization 엔드포인트 11개 추가 |
| `domain/organization/repository/OrganizationRepository.java` | findAllForAdmin 쿼리 추가 |

### Frontend (신규 2개 + 기존 수정 4개)

| 파일 | 변경 내용 |
|------|-----------|
| `components/admin/AdminOrganizationsTab.tsx` | **신규** — 조직 목록 탭 |
| `components/admin/AdminOrgDetailModal.tsx` | **신규** — 조직 상세 모달 |
| `pages/AdminPage.tsx` | navItems + Route 추가 |
| `components/admin/AdminDashboardTab.tsx` | Organization 통계 섹션 추가 |
| `utils/api.ts` | 타입 + adminAPI 메서드 추가 |
| `utils/services.ts` | adminService 메서드 추가 |

### i18n (10개 파일)

| 파일 | 변경 내용 |
|------|-----------|
| `i18n/locales/{ko,en,ja,zh,zh-TW,vi,th,es,pt-BR,hi}.json` | `admin.organizations` 키 추가 |

### DB 스키마

변경 없음 — 기존 `organizations`, `organization_members`, `org_subscriptions`, `boards` 테이블 활용.

---

## 설계 결정 사항

| 결정 | 이유 |
|------|------|
| Admin 전용 DTO 별도 생성 | 기존 OrganizationResponse는 user-scoped (myRole 포함). Admin은 system-scoped view 필요 |
| AdminController에 통합 | 기존 패턴 따름 (Users/Boards/Subscriptions 모두 AdminController 안에 있음) |
| 구독 직접 수정 (결제 bypass) | 시스템 관리자 지원 케이스 대응. 기존 Board 구독 admin 패턴과 동일 |
| 멤버/보드 OrgDetail에 함께 로드 | 모달 오픈 시 항상 필요. 성능 이슈 시 별도 엔드포인트로 분리 가능 |
| Org 탭 위치: Boards 다음 | Users → Boards → Organizations 순서 (엔티티 계층 순) |
