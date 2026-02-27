# TASK-2026-0227-002: v11.0 Organization Subscription

> **Status**: Completed
> **Date**: 2026-02-27
> **Level**: 상
> **Domain**: fullstack (Spring Boot + React)
> **Design Docs**: design-v11.0-org-subscription.md, design-v11.0-implementation-plan.md

---

## Summary

v11.0 Organization Subscription 2-Track 과금 모델 구현 완료.
- Board 단독($5/seat) + Organization($15/seat) 병행 운영
- Org Free → HR Trial(7일) → Team 전환 플로우
- Board→Org 마이그레이션 (Seat 중복 제거 + 크레딧 전환)
- HR 읽기/쓰기 분리 접근 제어
- 10개 언어 i18n 지원

---

## Analysis & Decisions

### 아키텍처 결정

1. **isEffectivelyPremium() 단일 분기점**: ORG_MANAGED → true 1줄 추가로 기존 9개 canAccess 메서드 + 8개 서비스 자동 적용. 기존 코드 무변경.

2. **AI 크레딧 보존**: Board Subscription을 CANCELED하지 않고 ACTIVE 유지 + billingPausedForOrg=true. 월간 크레딧 리셋과 소비가 계속 동작.

3. **SubscriptionStatus 재사용**: Board와 Org 모두 동일한 TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELED enum 공유.

4. **Flyway 버전 시프트**: V82가 OKR 테이블에 이미 사용되어 V83~V85로 변경.

5. **Pessimistic Lock**: seat 변경, 구독 활성화 등 동시성 이슈가 있는 작업에 findByOrganizationIdForUpdate() 사용.

### 대안 검토

- OrgSubscription을 Subscription 테이블에 통합하는 방안 → Board 1:1 구조와 충돌, 별도 테이블 선택
- HR 접근 제어를 AOP로 구현하는 방안 → 명시적 서비스 호출이 더 투명하고 디버깅 용이

---

## SubAgent Execution Summary

| Group | SubAgent | Model | Files | Duration | Status |
|-------|----------|-------|-------|----------|--------|
| A | SA-001 BE Foundation | opus | 15 (10N+5M) | ~3min | ✓ |
| B | SA-002 BE Core Service+API | opus | 4N | ~3min | ✓ |
| C | SA-003 BE Org Integration | sonnet | 5M | ~3.5min | ✓ |
| C | SA-004 BE HR Access | sonnet | 2M | ~2.3min | ✓ |
| C | SA-005 FE Types+API | sonnet | 3M | ~2.2min | ✓ |
| D | SA-006 FE Components | opus | 8 (4N+4M) | ~7min | ✓ |
| E | SA-007 FE i18n | haiku | 10M | ~33min | ✓ |

---

## Changes

### Backend — New Files (14)

| File | Description |
|------|-------------|
| `V83__create_org_subscriptions.sql` | OrgSubscription + OrgPaymentHistory 테이블, 기존 Org FREE 구독 자동 생성 |
| `V84__add_org_subscription_fields.sql` | Organization.trial_used + Subscription 마이그레이션 추적 필드 |
| `V85__add_org_managed_board_tier.sql` | BoardTier CHECK 제약에 ORG_MANAGED 추가 |
| `OrgPlan.java` | FREE, TEAM enum |
| `OrgPaymentType.java` | SUBSCRIPTION, MIGRATION enum |
| `OrgSubscription.java` | Org 구독 엔티티 (팩토리, activateTeam, canAccess*, seat 관리) |
| `OrgPaymentHistory.java` | Org 결제 내역 엔티티 |
| `OrgSubscriptionRepository.java` | 구독 조회 + 비관적 락 + 만료 Trial 조회 |
| `OrgPaymentHistoryRepository.java` | 결제 내역 조회 |
| `OrgSubscriptionService.java` | 핵심 서비스 (activate, expire, migrate, cancel, downgrade) |
| `OrgSubscriptionController.java` | REST API 8개 엔드포인트 |
| `OrgSubscriptionResponse.java` | 구독 응답 DTO (21필드) |
| `MigrationPreviewResponse.java` | 마이그레이션 미리보기 DTO |

### Backend — Modified Files (10)

| File | Change |
|------|--------|
| `BoardTier.java` | + ORG_MANAGED enum |
| `Board.java` | isEffectivelyPremium() ORG_MANAGED 분기 + isOrgManaged() |
| `Organization.java` | + subscription 1:1 + trialUsed + markTrialUsed() |
| `Subscription.java` | + migratedToOrg, billingPausedForOrg 필드/메서드 |
| `ErrorCode.java` | + OS001~OS006 (6개) |
| `OrganizationService.java` | createOrganization()에 Trial 자동 생성 |
| `OrganizationFacadeService.java` | addBoard/createBoard에 Team 체크 + ORG_MANAGED 티어 |
| `SubscriptionScheduler.java` | + expireOrgTrials() 매시간 스케줄러 |
| `OrgAttendanceService.java` | 7개 쓰기 메서드에 HR 접근 체크 |
| `LeaveService.java` | 8개 쓰기 메서드에 HR 접근 체크 |
| `AiCreditService.java` | ORG_MANAGED case 추가 (exhaustive switch) |
| `OrganizationResponse.java` | + currentPlan, subscriptionStatus, trialEndsAt, canCreate*, canAccess* |

### Frontend — New Files (4)

| File | Description |
|------|-------------|
| `OrgSubscriptionBadge.tsx` | Free/Team/HR Trial 뱃지 (countdown 포함) |
| `OrgPlanSelector.tsx` | Free vs Team 비교 카드 |
| `OrgMigrationWizard.tsx` | 3단계 Board→Org 전환 위자드 |
| `OrgBillingSection.tsx` | 결제 정보, Seat 관리, 내역, Danger Zone |

### Frontend — Modified Files (17)

| File | Change |
|------|--------|
| `types/index.ts` | + OrgPlan, OrgSubscription, MigrationPreview 타입, OrganizationSimple 확장 |
| `utils/api.ts` | + orgSubscriptionAPI (8개 메서드) |
| `utils/services.ts` | + orgSubscriptionService |
| `OrgSettingsTab.tsx` | + subscription 서브탭 (5번째) |
| `OrgDashboardTab.tsx` | + OrgSubscriptionBadge 표시 |
| `OrgBoardsTab.tsx` | + ORG_MANAGED 뱃지 + Team 체크 |
| `Sidebar.tsx` | TODO: Org plan indicator (context 부재) |
| `ko.json` ~ `hi.json` (10개) | + orgSubscription 59키 (10개 언어) |

---

## Test Summary

| Test | Result |
|------|--------|
| Backend Build (`gradlew build`) | ✓ PASS |
| Frontend Build (`npm run build`) | ✓ PASS (6926 modules, 10.62s) |
| TypeScript Compilation | ✓ No errors |

---

## Architecture Impact

### 새 도메인 모듈
- `subscription/` 패키지에 Org 구독 관련 엔티티, 서비스, 컨트롤러 추가
- 기존 Board 구독 시스템과 독립적 운영 (별도 테이블, 별도 서비스)

### 크로스 도메인 의존성
- `OrganizationService` → `OrgSubscriptionRepository` (Trial 생성)
- `OrganizationFacadeService` → `OrgSubscriptionService` (Board 편입 체크)
- `OrgAttendanceService`, `LeaveService` → `OrgSubscriptionService` (HR 접근 체크)
- `SubscriptionScheduler` → `OrgSubscriptionService` (Trial 만료)

### API 엔드포인트 추가 (8개)
- `GET/POST/DELETE /api/v1/organizations/{orgId}/subscription/*`
- `POST /api/v1/payments/confirm/org-subscription`

---

## Future Considerations

1. **Toss Payments 실제 연동**: confirmAndActivateTeam()에 실제 PG 연동 필요
2. **결제 실패 스케줄러**: PAST_DUE → SUSPENDED → CANCELED 자동 전환 로직
3. **Trial 만료 알림**: D-3, D-1 푸시 알림 발송
4. **Board 초대 제한**: ORG_MANAGED Board에서 Org 멤버만 초대 가능 UI
5. **전환 유도 배너**: Board 3개+ 보유 시 대시보드 배너
6. **Sidebar Org Plan**: Dashboard에서 org subscription 컨텍스트 전달 필요

---

## Tags

`org-subscription` `billing` `2-track-pricing` `hr-access-control` `board-migration` `seat-management` `i18n`
