# TASK-2026-0304-002: 결제 실패 재시도 안내 UX 구현

> **등급**: 상 | **모드**: development | **도메인**: fullstack | **완료일**: 2026-03-04

---

## 1. 요약

Polar 결제 실패(past_due) 시 즉시 SUSPENDED 처리하던 방식을 **PAST_DUE 상태로 7일 Grace Period** 제공 후 SUSPENDED로 에스컬레이션하는 단계적 전환으로 개선. 사용자에게 결제 실패 알림 및 결제 수단 업데이트 경로(Billing Portal) 제공.

## 2. 변경 사항

### 2.1 Backend — Entity & DTO

| 파일 | 변경 |
|------|------|
| `Subscription.java` | `pastDueSince` 필드, `markPastDue()`, `isPastDue()`, activate 시 pastDueSince 리셋 |
| `OrgSubscription.java` | 동일 필드/메서드 추가 |
| `SubscriptionResponse.java` | `pastDueSince`, `daysPastDue`, `daysUntilSuspension` 계산 필드 |
| `OrgSubscriptionResponse.java` | 동일 3개 필드 추가 |

### 2.2 Backend — Webhook & Service

| 파일 | 변경 |
|------|------|
| `PolarWebhookService.java` | Board: `PAST_DUE → markPastDue()` + 알림 발송, Org: PAST_DUE/SUSPENDED 분리 |
| `SubscriptionService.java` | `getBillingPortalUrl()` — Polar Customer Portal URL 반환 |
| `SubscriptionController.java` | `GET /api/v1/boards/{boardId}/subscription/billing-portal` |

### 2.3 Backend — Scheduler & Repository

| 파일 | 변경 |
|------|------|
| `SubscriptionScheduler.java` | `escalatePastDueSubscriptions()` 매시 :25분 — 7일 경과 시 SUSPENDED |
| `SubscriptionRepository.java` | `findByStatusPastDueAndPastDueSinceBefore()` |
| `OrgSubscriptionRepository.java` | 동일 쿼리 |

### 2.4 Backend — Notification

| 파일 | 변경 |
|------|------|
| `NotificationType.java` | `PAYMENT_FAILED` enum 값 추가 |
| `NotificationService.java` | `createPaymentFailedNotification()` — 인앱 + FCM 푸시 |

### 2.5 Backend — Migration

| 파일 | 내용 |
|------|------|
| `V92__add_past_due_tracking.sql` | `subscriptions.past_due_since`, `org_subscriptions.past_due_since` TIMESTAMP |

### 2.6 Frontend — Types & API

| 파일 | 변경 |
|------|------|
| `types/index.ts` | `SubscriptionStatus`에 `PAST_DUE` 추가, `past_due_since`, `days_past_due`, `days_until_suspension` |
| `api.ts` | `getBillingPortalUrl()` |
| `services.ts` | `getBillingPortalUrl()` 서비스 래퍼 |

### 2.7 Frontend — Components

| 파일 | 변경 |
|------|------|
| `TrialBanner.tsx` | PAST_DUE 단계별 배너: Day 0-3 amber 경고, Day 4-6 red 긴급 + [Update Payment] 버튼 |
| `SubscriptionModal.tsx` | PAST_DUE status badge (amber), Billing Portal 버튼 (Billing 탭), `boardId` prop 추가 |
| `KanbanBoardHeader.tsx` | `onUpdatePayment`, `daysPastDue`, `daysUntilSuspension` prop 추가 → TrialBanner 전달 |
| `BoardModalManager.tsx` | `boardId` prop을 SubscriptionModal에 전달 |
| `KanbanBoardPage.tsx` | `onUpdatePayment` 핸들러 (Billing Portal URL 조회 → 새 탭), 새 props 전달 |

### 2.8 Frontend — i18n (10개 언어)

8개 신규 키: `statusPastDue`, `pastDueWarning`, `pastDueUrgent`, `updatePayment`, `updatePaymentNow`, `updatePaymentMethod`, `updatePaymentFailed`, `paymentMethod`

적용 언어: ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi

## 3. 상태별 사용자 경험

| 상태 | 기능 | 배너 | 알림 | 결제 안내 |
|------|------|------|------|----------|
| ACTIVE | 전체 사용 | 없음 | 없음 | 불필요 |
| PAST_DUE (Day 0-3) | **전체 사용** | amber 경고 | 1회 푸시 | [Update Payment] |
| PAST_DUE (Day 4-6) | **전체 사용** | red 긴급 | — | [Update Payment Now] |
| SUSPENDED (Day 7+) | 읽기 전용 | red 차단 | — | [Subscribe] + [Export] |

## 4. 아키텍처 결정

- **canPerformActions()**: PAST_DUE에서 `true` 유지 (기존 `!= SUSPENDED` 로직 부합)
- **pastDueSince**: `markPastDue()` 최초 호출 시만 설정 (멱등성)
- **activate 시 리셋**: `activateSubscription()`, `activateSeatSubscription()`, `activateTeam()` 호출 시 `pastDueSince = null`
- **스케줄러 주기**: 매시 :25분 (기존 스케줄러와 겹치지 않는 시간)
- **Billing Portal**: Polar Customer Portal URL 동적 생성 (`{baseUrl}/{orgId}/portal`)

## 5. 빌드 검증

- Backend: `./gradlew build --no-daemon` ✅ BUILD SUCCESSFUL
- Frontend: `npm run build` ✅ 빌드 성공

## 6. 검증 체크리스트

- [ ] Polar 웹훅 시뮬레이션 (past_due) → PAST_DUE 상태 전환 확인
- [ ] PAST_DUE 상태에서 보드 기능 정상 사용 가능 확인
- [ ] TrialBanner: Day 0-3 → amber 경고 표시 확인
- [ ] TrialBanner: Day 4-6 → red 긴급 표시 + 남은 일수 확인
- [ ] 7일 경과 후 → 스케줄러에 의해 SUSPENDED 전환 확인
- [ ] [Update Payment] → Polar 포털 새 탭 열기 확인
- [ ] 결제 수단 업데이트 후 → Polar 웹훅 (active) → ACTIVE 복원 확인
- [ ] 푸시 알림 수신 확인
