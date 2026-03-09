# TASK-2026-0303-001: Admin Organization Management

> **Status**: Completed
> **Date**: 2026-03-03
> **Level**: 상
> **Domain**: fullstack (Spring Boot + React)
> **Spec Document**: docs/admin-organization-spec.md

---

## Summary

Admin 패널에 Organization 관리 기능 전체 구현 완료 (P0 8개 기능).
- Organization 목록/검색/필터 + 페이지네이션 (활성/삭제 분리)
- Organization 상세 모달 (Info/Members/Boards 3탭)
- 구독 관리 (Plan/Status/BillingCycle/Seat 직접 수정, Trial 연장)
- 삭제/복원/영구삭제 관리
- Dashboard 통계 통합 (7개 지표 + Plan 분포)
- 조직 정보 수정, 소유권 이전
- 10개 언어 i18n 지원 (63키)

---

## Analysis & Decisions

### 아키텍처 결정

1. **AdminBoardsTab 패턴 완전 재사용**: 기존 Admin Board 관리 UI/API 패턴을 Organization에 그대로 적용. 코드 일관성 확보 + 개발 속도 향상.

2. **Admin 전용 DTO 분리**: OrgSummary, OrgDetail, OrgMemberInfo, OrgStatistics 등 Admin 전용 DTO를 AdminResponse.java에 집중. 일반 Organization DTO와 역할 분리.

3. **N+1 방지 — Batch Loading**: `countGroupedByOrgIds()` 패턴으로 멤버 수/보드 수를 한 번에 로딩. 목록 조회 시 N+1 쿼리 완전 제거.

4. **구독 직접 수정 (결제 Bypass)**: Admin이 OrgSubscription의 plan/status/billingCycle/seatCount를 @Setter로 직접 변경. Polar.sh 결제 상태와 불일치 가능성은 Admin 전용이므로 허용.

5. **ErrorCode 추가**: ORGANIZATION_NOT_FOUND(O017), ORGANIZATION_ALREADY_DELETED(O018) — 기존 O001~O016과 충돌 없이 확장.

6. **Organization.restore()**: softDelete()의 역연산으로 `deletedAt = null` 처리. 기존 엔티티 패턴과 일관.

### 대안 검토

- OrganizationRepository에 countMemberAndBoardByOrgId()가 이미 있었으나, 목록 조회 시 N+1 발생 → `countGroupedByOrgIds()` 배치 쿼리 신규 추가
- Admin 전용 Controller 분리 방안 → 기존 AdminController 단일 파일 패턴 유지 (일관성)

---

## SubAgent Execution Summary

| Group | SubAgent | Scope | Files | Status |
|-------|----------|-------|-------|--------|
| A | SA-001 DTOs + Repository | AdminResponse DTO 5종, AdminRequest DTO 4종, OrganizationRepository 쿼리 8개 | 3M | ✓ |
| B | SA-002 BE Service + Controller | AdminService 12 메서드 + AdminController 11 엔드포인트 + Organization.restore() + ErrorCode | 4M | ✓ |
| B | SA-003 FE API + Services + Page | api.ts 4타입+11메서드, services.ts 11메서드, AdminPage.tsx 수정 | 3M | ✓ |
| C | SA-004 AdminOrganizationsTab | 조직 목록 탭 (검색/필터/테이블/페이지네이션) | 1N | ✓ |
| C | SA-005 AdminOrgDetailModal + Dashboard | 상세 모달 (3탭+6액션) + Dashboard 통계 섹션 | 1N+1M | ✓ |
| D | SA-006 i18n 10개 언어 | 63키 × 10개 언어 파일 | 10M | ✓ |

---

## Changes

### Backend — Modified Files (6)

| File | Changes |
|------|---------|
| `admin/dto/AdminResponse.java` | +218 lines: OrgList, OrgSummary, OrgDetail, OrgMemberInfo, OrgStatistics record 추가 |
| `admin/dto/AdminRequest.java` | +37 lines: UpdateOrganization, TransferOrgOwnership, UpdateOrgSubscription, ExtendOrgTrial 추가 |
| `admin/service/AdminService.java` | +299 lines: 12개 Organization 관리 메서드 + 3개 Repository 주입 |
| `admin/controller/AdminController.java` | +116 lines: 11개 REST 엔드포인트 |
| `organization/repository/OrganizationRepository.java` | +49 lines: Admin 전용 쿼리 8개 (findAllForAdmin, findDeletedForAdmin, findByIdForAdmin, countActive, countFreeOrgs, countTeamOrgs, countTrialOrgs, countActiveSubscriptions) |
| `organization/Organization.java` | +4 lines: restore() 메서드 |
| `global/exception/ErrorCode.java` | +2 lines: ORGANIZATION_NOT_FOUND, ORGANIZATION_ALREADY_DELETED |

### Frontend — New Files (2)

| File | Description |
|------|-------------|
| `components/admin/AdminOrganizationsTab.tsx` | 381 lines: 조직 목록 탭 (검색, 활성/삭제 토글, 테이블, 페이지네이션) |
| `components/admin/AdminOrgDetailModal.tsx` | 543 lines: 조직 상세 모달 (Info/Members/Boards 3탭, 6개 관리 액션) |

### Frontend — Modified Files (14)

| File | Changes |
|------|---------|
| `pages/AdminPage.tsx` | +5 lines: Building2 아이콘, AdminOrganizationsTab import, navItem + Route |
| `components/admin/AdminDashboardTab.tsx` | +76 lines: Organization 통계 섹션 (7개 지표 + Plan 분포 차트) |
| `utils/api.ts` | +182 lines: AdminOrgSummary, AdminOrgDetail, OrgListResponse, AdminOrgStatistics 타입 + adminAPI 11 메서드 |
| `utils/services.ts` | +87 lines: adminService Organization 메서드 11개 |
| `i18n/locales/ko.json` | +72 lines: admin.organizations 63키 (한국어) |
| `i18n/locales/en.json` | +72 lines: admin.organizations 63키 (영어) |
| `i18n/locales/ja.json` | +72 lines: admin.organizations 63키 (일본어) |
| `i18n/locales/zh.json` | +72 lines: admin.organizations 63키 (중국어 간체) |
| `i18n/locales/zh-TW.json` | +72 lines: admin.organizations 63키 (중국어 번체) |
| `i18n/locales/vi.json` | +72 lines: admin.organizations 63키 (베트남어) |
| `i18n/locales/th.json` | +72 lines: admin.organizations 63키 (태국어) |
| `i18n/locales/es.json` | +72 lines: admin.organizations 63키 (스페인어) |
| `i18n/locales/pt-BR.json` | +72 lines: admin.organizations 63키 (브라질 포르투갈어) |
| `i18n/locales/hi.json` | +72 lines: admin.organizations 63키 (힌디어) |

### Total: 22 files changed (+3,457 / -99 lines)

---

## API Endpoints (11)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/organizations` | 조직 목록 (search, page, size) |
| GET | `/admin/organizations/deleted` | 삭제된 조직 목록 |
| GET | `/admin/organizations/{orgId}` | 조직 상세 |
| PATCH | `/admin/organizations/{orgId}` | 조직 정보 수정 |
| DELETE | `/admin/organizations/{orgId}` | 조직 소프트 삭제 |
| POST | `/admin/organizations/{orgId}/restore` | 삭제된 조직 복원 |
| DELETE | `/admin/organizations/{orgId}/permanent` | 조직 영구 삭제 |
| POST | `/admin/organizations/{orgId}/transfer-ownership` | 소유권 이전 |
| PATCH | `/admin/organizations/{orgId}/subscription` | 구독 정보 직접 수정 |
| PATCH | `/admin/organizations/{orgId}/extend-trial` | Trial 기간 연장 |
| GET | `/admin/organizations/statistics` | 조직 통계 |

---

## Build Verification

| Target | Result |
|--------|--------|
| Backend (`./gradlew build`) | BUILD SUCCESSFUL |
| Frontend (`npm run build`) | Built in 9.40s, no errors |

---

## Architecture Impact

- **AdminService.java**: Repository 주입 3개 추가 (OrganizationRepository, OrgMemberRepository, OrgSubscriptionRepository). Constructor 파라미터 증가하나 Admin 단일 서비스 패턴 유지.
- **AdminController.java**: Organization 엔드포인트 11개 추가. 기존 Board/User/Subscription/Announcement 패턴과 동일 구조.
- **DB 스키마 무변경**: 기존 Organization, OrgSubscription, OrganizationMember 테이블 그대로 활용.
- **보안**: 모든 엔드포인트에 `verifyAdminAccess(principal)` 적용.

---

## Future Considerations

- 조직 활동 로그 (Admin Audit Trail)
- 조직 멤버 일괄 관리 (초대/제거)
- 대시보드 시계열 차트 (일별/월별 조직 생성 추이)
- Polar.sh 결제 상태와 Admin 수동 변경 간 동기화 검증

---

## Tags
`admin`, `organization`, `subscription`, `dashboard`, `i18n`, `fullstack`
