# TASK-2026-0213-001: AI Credit System Implementation

## Summary

AI 크레딧 시스템 Phase 1(MVP) + Phase 2(추가 구매)를 풀스택으로 구현했습니다.
보드별 월간 크레딧 할당, 실시간 잔량 확인, 소진 시 차단 + 추가 결제 유도, 토스페이먼츠 결제 연동까지 전체 파이프라인을 완성했습니다.

**기존 AI 제약 전면 제거**: `isPremium()` 체크, 하루 1회 리포트 제한(`AI_REPORT_DAILY_LIMIT_EXCEEDED`) 등 모든 기존 AI 사용 제한을 크레딧 기반 제어로 교체했습니다.

---

## Analysis

### 문제 정의
- AI 호출 비용(Claude/OpenAI)이 서버 부담으로 직결
- 기존 PREMIUM 전용 + 일일 제한 방식으로는 AI 기능 활용 극대화 불가
- 유저가 비용을 부담하는 크레딧 시스템으로 전환하여 적극적 AI 활용 가능 구조 필요

### 영향 범위
- **Backend**: 7개 신규 파일 + 11개 수정 (Subscription 엔티티 확장, 3개 AI 서비스 연동)
- **Frontend**: 1개 신규 컴포넌트 + 8개 수정 + 10개 i18n 로케일
- **DB**: V32 마이그레이션 (subscriptions ALTER + ai_credit_purchases CREATE + ai_usage_logs ALTER)

### 아키텍처 변경
```
[기존] AI Service → isPremium() / dailyLimit 체크 → AI Provider 호출
[변경] AI Service → AiCreditService.consumeCredit() (비관적 락) → AI Provider 호출
```

---

## Decisions

### D1: 크레딧 = Subscription 엔티티 확장 (별도 테이블 X)
- **선택**: Subscription에 4개 필드 추가 (monthlyAiCredits, monthlyCreditsUsed, purchasedCredits, creditsResetDate)
- **이유**: 보드:구독 = 1:1 관계가 이미 존재, 별도 엔티티 불필요, 트랜잭션 단순화
- **대안**: 별도 AiCredit 엔티티 → 조인 비용 + 트랜잭션 복잡도 증가로 기각

### D2: 비관적 락 (SELECT FOR UPDATE)
- **선택**: `findByBoardIdForUpdate` 쿼리로 동시 크레딧 차감 정합성 보장
- **이유**: AI 호출은 동시에 여러 멤버가 할 수 있으므로 낙관적 락보다 비관적 락이 안전
- **트레이드오프**: 약간의 성능 저하 vs 정합성 보장

### D3: 크레딧 소비 순서 Monthly → Purchased (FIFO)
- **선택**: Subscription.consumeCredits()에서 월간 잔여 우선 차감, 부족분을 구매 크레딧에서 차감
- **이유**: 유저가 구매한 크레딧은 리셋되지 않으므로 월간 무료분 우선 소진이 합리적

### D4: 402 HTTP 상태코드 + CustomEvent 패턴
- **선택**: Backend 402 응답 → Frontend axios 인터셉터에서 `ai-credits-exhausted` 이벤트 발행 → KanbanBoardPage에서 소진 모달 표시
- **이유**: 기존 401 토큰 만료 패턴과 일관성, 컴포넌트 결합도 최소화

### D5: 기존 AI 제약 전면 제거
- **제거**: ReportService.isPremium() 체크, checkDailyLimit(), AI_REPORT_DAILY_LIMIT_EXCEEDED 에러코드
- **이유**: 모든 요금제(TRIAL/STANDARD/PREMIUM)가 크레딧 할당받으므로 별도 게이팅 불필요

---

## SubAgent Summary

| SA-ID | 역할 | 모델 | 파일 수 | 상태 |
|-------|------|------|---------|------|
| SA-001-001 | Backend Domain Foundation | Sonnet | 12 | ✅ |
| SA-001-002 | Backend Business Logic + API | Opus | 8 | ✅ |
| SA-001-003 | Frontend Types + API + i18n | Sonnet | 13 | ✅ |
| SA-001-004 | Frontend Components | Sonnet | 5+ | ✅ |

**실행 전략**: A(순차) → B(병렬: BE Logic + FE Types) → C(순차: FE Components)

---

## Changes

### Backend - 신규 파일 (7)
| 파일 | 설명 |
|------|------|
| `V32__ai_credits.sql` | DB 마이그레이션 (subscriptions 확장 + ai_credit_purchases + ai_usage_logs 확장) |
| `AiCreditPurchase.java` | 구매 이력 엔티티 |
| `AiCreditPurchaseRepository.java` | 구매 이력 레포지토리 |
| `AiCreditRequest.java` | 구매 요청 DTO (creditAmount, paymentKey, orderId, amount) |
| `AiCreditResponse.java` | 크레딧 조회/구매/이력 응답 DTO |
| `AiCreditService.java` | 핵심 서비스 (consumeCredit, getCredits, purchaseCredits, resetMonthlyCredits) |
| `AiCreditController.java` | REST API (GET 조회, POST 구매, GET 이력) |

### Backend - 수정 파일 (11)
| 파일 | 변경 |
|------|------|
| `Subscription.java` | +4 크레딧 필드, +9 크레딧 관리 메서드 |
| `SubscriptionRepository.java` | +findByBoardIdForUpdate (비관적 락), +findDueForCreditReset |
| `SubscriptionResponse.java` | +6 크레딧 정보 필드 (Detail record) |
| `SubscriptionService.java` | +구독 시작 시 크레딧 초기화 |
| `MeetingAIService.java` | +consumeCredit("MEETING_AI", 1) 호출 |
| `NoteAIService.java` | +consumeCredit("NOTE_AI", 1) 호출 |
| `ReportAIService.java` | +consumeCredit("REPORT_TEAM/PERSONAL/STANDUP", 1) 호출 |
| `ReportService.java` | -isPremium() 체크, -checkDailyLimit() 제거 |
| `AiUsageLog.java` | +creditSource, +creditsUsed 필드 |
| `ErrorCode.java` | +AI_CREDITS_EXHAUSTED(402), +AI_CREDIT_PURCHASE_AMOUNT_INVALID, +AI_CREDIT_PURCHASE_FAILED, -AI_REPORT_DAILY_LIMIT_EXCEEDED |
| `MonitoringScheduler.java` | +resetMonthlyAiCredits() 스케줄러 |
| `application.yml` | +ai.credit.reset-cron 설정 |

### Frontend - 신규 파일 (1)
| 파일 | 설명 |
|------|------|
| `AiCreditPurchaseModal.tsx` | 구매 + 소진 경고 통합 모달 (수량 선택, 결제, 경고 모드) |

### Frontend - 수정 파일 (8+)
| 파일 | 변경 |
|------|------|
| `types/index.ts` | +AiCredits, AiCreditPurchaseRequest, AiCreditPurchaseResult, AiCreditPurchaseHistory |
| `services.ts` | +aiCreditService (getCredits, purchase, getPurchases) |
| `api.ts` | +402 응답 인터셉터 → ai-credits-exhausted 이벤트 발행 |
| `MeetingDetailModal.tsx` | +aiCredits prop, 크레딧 잔량 표시, 0일 때 버튼 비활성화 |
| `NoteEditor.tsx` | +aiCredits prop, 크레딧 잔량 표시, 소진 시 비활성화 |
| `KanbanBoardPage.tsx` | +크레딧 상태 관리, 402 이벤트 리스너, 소진 모달 |
| `10개 i18n 로케일` | +ai_credits 섹션 (ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi) |

---

## Test Summary

| 항목 | 결과 |
|------|------|
| Backend compileJava | ✅ PASS |
| Frontend npm run build | ✅ PASS |
| DTO ↔ Type 필드 일치 | ✅ PASS (15/15 필드) |
| API 엔드포인트 일치 | ✅ PASS (3/3) |
| ErrorCode ↔ FE 에러 | ✅ PASS |
| Service 연동 검증 | ✅ PASS (3/3 AI 서비스) |
| Entity ↔ DB 일치 | ✅ PASS (4/4 필드) |

---

## Architecture Impact

### 새로운 패턴
- **크레딧 기반 AI 접근 제어**: isPremium() 이진 체크 → 크레딧 잔량 기반 유연한 제어
- **비관적 락 동시성 제어**: Subscription 엔티티에 SELECT FOR UPDATE 패턴 도입
- **402 → CustomEvent 패턴**: HTTP 상태코드 기반 프론트엔드 이벤트 전파

### 영향받는 모듈
- `subscription`: 크레딧 필드/서비스/컨트롤러 추가 (핵심 확장)
- `meeting/note/report`: AI 서비스에 크레딧 차감 의존성 추가
- `monitoring`: AiUsageLog에 creditSource 추적 필드 추가

### 의존성 변화
```
MeetingAIService → AiCreditService (신규 의존)
NoteAIService → AiCreditService (신규 의존)
ReportAIService → AiCreditService (신규 의존)
MonitoringScheduler → AiCreditService (신규 의존)
```

---

## Future Considerations

1. **AdminPage 크레딧 대시보드**: 현재 미구현 (boardId 컨텍스트 부재). 관리자용 전체 보드 크레딧 현황 API 필요
2. **크레딧 소비 롤백**: AI 호출 실패 시 크레딧 복구 로직 (현재 선차감 → 실패 시 미복구)
3. **크레딧 사용량 통계**: 보드/유저/기능별 크레딧 소비 추이 대시보드
4. **Transcription 크레딧**: 미팅 전사(transcription)는 현재 크레딧 미적용 → 별도 정책 필요

---

## Tags
`ai-credits` `subscription` `payment` `toss-payments` `fullstack` `phase1+2` `billing`
