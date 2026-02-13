# AI 크레딧 시스템 기획서

> **버전**: v1.0.0
> **작성일**: 2026-02-13
> **상태**: Draft

---

## 1. 개요

### 1.1 목적
보드별 AI 기능 사용량을 관리하고, 사용량 기반 과금을 통해 수익화하는 시스템.

### 1.2 배경
- 현재 AI 기능(미팅 요약, 노트 제안, 주간 리포트, 스탠드업 요약)은 무제한 사용 가능
- AI 호출 비용은 서비스 측에서 전액 부담 중
- 보드별 사용량 추적은 이미 구현됨 (`ai_usage_logs` 테이블)

### 1.3 핵심 컨셉
- **크레딧 = AI 호출 1회** (달러/토큰 기반이 아닌 **횟수** 기반)
- 사용자는 "남은 AI 크레딧 N회"로 직관적으로 이해
- 티어별 월간 무료 크레딧 제공 + 소진 시 추가 구매 유도

---

## 2. 요금 정책

### 2.1 티어별 월간 크레딧

| 티어 | 월간 무료 크레딧 | 산정 기준 | 실제 원가 |
|------|-----------------|----------|----------|
| **STANDARD** (무료) | 30회/월 | 하루 ~1회 체험 | ~₩40 |
| **TRIAL** (7일) | 100회/7일 | 충분한 체험 | ~₩130 |
| **PREMIUM** (유료) | 200회 + (시트당 50회) | 기본 + 인당 할당 | ~₩500+ |

#### PREMIUM 예시

| 시트 수 | 월간 크레딧 | 1인당 |
|---------|-----------|-------|
| 3명 | 350회 | ~117회 |
| 5명 | 450회 | ~90회 |
| 10명 | 700회 | ~70회 |
| 15명 | 950회 | ~63회 |

### 2.2 추가 크레딧 팩

| 단위 | 가격 | 비고 |
|------|------|------|
| **100회** | **₩1,000** | 최소 구매 단위 |
| 200회 | ₩2,000 | 수량 x2 |
| 500회 | ₩5,000 | 수량 x5 |
| 1,000회 | ₩10,000 | 수량 x10 |

- **구매 수량 자유 조절**: 슬라이더 또는 +/- 버튼으로 100회 단위로 조절
- **즉시 충전**: 결제 완료 시 바로 크레딧 추가
- **만료 없음**: 구매한 추가 크레딧은 소진될 때까지 유지
- **결제 수단**: 토스페이먼츠 (기존 결제 인프라 활용)

### 2.3 원가 분석

| 항목 | 금액 |
|------|------|
| AI 1회 호출 원가 (gpt-4o-mini) | ~₩1.3 |
| 추가 팩 판매가 (100회) | ₩1,000 |
| 추가 팩 원가 (100회) | ~₩130 |
| **마진율** | **~87%** |

### 2.4 크레딧 소진 순서

```
월간 무료 크레딧 → 구매한 추가 크레딧 (FIFO)
```

- 매월 1일(또는 구독 갱신일) 무료 크레딧 리셋
- 미사용 무료 크레딧은 이월 안 됨
- 구매 크레딧은 이월됨 (만료 없음)

---

## 3. 사용자 플로우

### 3.1 정상 사용 (크레딧 잔량 있음)

```
사용자가 AI 기능 요청
    ↓
[크레딧 잔량 체크] → 잔량 있음
    ↓
AI 호출 실행
    ↓
크레딧 1회 차감
    ↓
결과 반환 + 잔량 표시 ("AI 크레딧: 23/30")
```

### 3.2 크레딧 소진 경고 (마지막 크레딧)

```
사용자가 AI 기능 요청
    ↓
[크레딧 잔량 체크] → 잔량 1회 (마지막)
    ↓
AI 호출 실행 + 경고 토스트
    ↓
"이번이 마지막 AI 크레딧입니다. 추가 구매하시겠습니까?"
    ↓
결과 반환 + 토스트 알림 (구매 버튼 포함)
```

### 3.3 크레딧 소진 후 차단

```
사용자가 AI 기능 요청
    ↓
[크레딧 잔량 체크] → 잔량 0회
    ↓
AI 호출 차단
    ↓
크레딧 구매 모달 표시
    ├── "AI 크레딧이 소진되었습니다"
    ├── 수량 선택: [- ] 100회 [ +]  = ₩1,000
    ├── [구매하기] 버튼 (토스페이먼츠)
    └── "다음 달 N일에 무료 크레딧이 갱신됩니다"
```

### 3.4 추가 크레딧 구매 플로우

```
[크레딧 구매 모달]
    ↓
수량 선택 (100회 단위, 슬라이더 or +/- 버튼)
    ↓
    ┌─────────────────────────────────┐
    │  AI 크레딧 추가 구매             │
    │                                 │
    │  수량:  [ - ]  300회  [ + ]     │
    │                                 │
    │  금액:  ₩3,000                  │
    │                                 │
    │  현재 잔량: 0회                  │
    │  구매 후:   300회               │
    │                                 │
    │  [구매하기]                      │
    │                                 │
    │  ℹ️ 구매한 크레딧은 만료되지     │
    │     않습니다                     │
    └─────────────────────────────────┘
    ↓
토스페이먼츠 결제
    ↓
결제 완료 → 크레딧 즉시 반영
    ↓
"300 AI 크레딧이 추가되었습니다" 토스트
```

---

## 4. UI 설계

### 4.1 크레딧 잔량 표시 위치

#### A. AI 기능 버튼 옆 (인라인)
```
[✨ AI 제안 생성]  크레딧: 23회 남음
```

#### B. 보드 설정 > 구독 섹션
```
AI 크레딧
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
무료 크레딧:  18 / 30회 (이달)
구매 크레딧:  200회
총 잔량:      218회

[크레딧 추가 구매]

갱신일: 2026년 3월 1일
```

#### C. 어드민 대시보드 (기존 모니터링)
```
보드별 AI 크레딧 현황
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
보드명        | 티어    | 잔량   | 이달 사용
프로젝트 A    | PREMIUM | 312회  | 138회
사이드 PJ     | STANDARD| 5회    | 25회
테스트 보드    | TRIAL  | 87회   | 13회
```

### 4.2 소진 경고 토스트

| 잔량 | 동작 |
|------|------|
| 10회 이하 | 토스트: "AI 크레딧이 N회 남았습니다" (info) |
| 1회 (마지막) | 토스트: "마지막 크레딧입니다" + 구매 버튼 (warning) |
| 0회 | 모달: 구매 유도 (blocking) |

### 4.3 크레딧 구매 모달 와이어프레임

```
┌─────────────────────────────────────────────┐
│  ✨ AI 크레딧 구매                     [✕]  │
│─────────────────────────────────────────────│
│                                             │
│  현재 잔량: 0회                             │
│  다음 무료 갱신: 2026년 3월 1일 (16일 후)    │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  구매 수량                                   │
│                                             │
│  ┌─────┐                     ┌─────┐       │
│  │  -  │   300회 (₩3,000)    │  +  │       │
│  └─────┘                     └─────┘       │
│                                             │
│  ○━━━━━━━━━━●━━━━━━━━━━━━━━━━○             │
│  100      300              1,000            │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  결제 금액                                   │
│                                             │
│             ₩3,000                          │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │          구매하기                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  💡 구매한 크레딧은 만료되지 않습니다        │
│  💡 100회 단위로 조절 가능합니다             │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 5. 데이터 설계

### 5.1 DB 스키마 변경

```sql
-- subscriptions 테이블에 크레딧 필드 추가
ALTER TABLE subscriptions ADD COLUMN monthly_ai_credits INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN monthly_credits_used INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN purchased_credits INT DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN credits_reset_date TIMESTAMP;

-- AI 크레딧 구매 이력
CREATE TABLE ai_credit_purchases (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    credit_amount INT NOT NULL,            -- 구매 크레딧 수
    price_krw INT NOT NULL,                -- 결제 금액 (원)
    pg_provider VARCHAR(20),               -- TOSS, MOCK
    pg_transaction_id VARCHAR(100),        -- PG 거래 ID
    status VARCHAR(20) NOT NULL DEFAULT 'PAID',  -- PAID, REFUNDED
    created_at TIMESTAMP NOT NULL,

    INDEX idx_ai_credit_board (board_id, created_at)
);

-- AI 크레딧 사용 로그 (기존 ai_usage_logs 확장)
ALTER TABLE ai_usage_logs ADD COLUMN credit_source VARCHAR(20) DEFAULT 'MONTHLY';
-- credit_source: 'MONTHLY' (무료) 또는 'PURCHASED' (구매)
```

### 5.2 크레딧 계산 로직

```
월간 무료 크레딧 계산:
  STANDARD → 30
  TRIAL    → 100
  PREMIUM  → 200 + (seat_count × 50)

잔량 계산:
  total_remaining = (monthly_ai_credits - monthly_credits_used) + purchased_credits

소진 순서:
  1. monthly 잔량 > 0 → monthly_credits_used++
  2. monthly 잔량 = 0, purchased > 0 → purchased_credits--
  3. 둘 다 0 → 차단 + 구매 모달

월간 리셋:
  매월 구독 갱신일 (또는 매월 1일):
    monthly_credits_used = 0
    monthly_ai_credits = 티어별 재계산
    (purchased_credits는 유지)
```

---

## 6. API 설계

### 6.1 크레딧 조회

```
GET /api/v1/boards/{boardId}/ai-credits

Response:
{
  "monthly_credits": 450,
  "monthly_credits_used": 127,
  "monthly_credits_remaining": 323,
  "purchased_credits": 200,
  "total_remaining": 523,
  "credits_reset_date": "2026-03-01T00:00:00Z",
  "tier": "PREMIUM",
  "seat_count": 5
}
```

### 6.2 크레딧 차감 (AI 호출 시 내부 처리)

```
내부 서비스 호출 (API 노출 안 함):

AiCreditService.consumeCredit(boardId, featureType)
  → 성공: CreditConsumeResult { remaining: 522, source: "MONTHLY", warning: null }
  → 경고: CreditConsumeResult { remaining: 0, source: "PURCHASED", warning: "LAST_CREDIT" }
  → 실패: throw AiCreditExhaustedException
```

### 6.3 크레딧 구매

```
POST /api/v1/boards/{boardId}/ai-credits/purchase
{
  "credit_amount": 300,      // 100 단위
  "payment_key": "toss_xxx", // 토스페이먼츠 결제키
  "order_id": "order_xxx",
  "amount": 3000              // ₩3,000
}

Response:
{
  "purchase_id": "uuid",
  "credit_amount": 300,
  "price_krw": 3000,
  "total_remaining": 823,
  "purchased_at": "2026-02-13T..."
}
```

### 6.4 구매 이력 조회

```
GET /api/v1/boards/{boardId}/ai-credits/purchases

Response:
{
  "purchases": [
    {
      "id": "uuid",
      "credit_amount": 300,
      "price_krw": 3000,
      "status": "PAID",
      "created_at": "2026-02-13T..."
    }
  ]
}
```

### 6.5 AI 호출 응답 헤더 (크레딧 잔량 포함)

```
기존 AI 응답에 크레딧 정보 추가:

POST /api/v1/boards/{boardId}/meetings/{id}/ai-suggestions

Response:
{
  "suggestions": { ... },
  "credits": {
    "remaining": 322,
    "warning": null          // null | "LOW" (≤10) | "LAST"
  }
}
```

---

## 7. 에러 처리

### 7.1 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| `AI_CREDITS_EXHAUSTED` | 402 | 크레딧 소진 (구매 필요) |
| `AI_CREDIT_PURCHASE_AMOUNT_INVALID` | 400 | 100회 단위가 아님 |
| `AI_CREDIT_PURCHASE_FAILED` | 500 | 결제 처리 실패 |

### 7.2 에러 응답

```json
{
  "error": {
    "code": "AI_CREDITS_EXHAUSTED",
    "message": "AI 크레딧이 소진되었습니다",
    "details": {
      "monthly_credits_remaining": 0,
      "purchased_credits_remaining": 0,
      "credits_reset_date": "2026-03-01T00:00:00Z",
      "purchase_url": "/boards/{boardId}/settings/credits"
    }
  }
}
```

---

## 8. 엣지 케이스

### 8.1 동시 호출
- 같은 보드에서 여러 명이 동시에 AI 호출 시
- **해결**: `SELECT ... FOR UPDATE` (비관적 락) 으로 크레딧 차감 원자성 보장
- 순간적으로 0 아래로 내려갈 수 있으나, 음수 허용 후 다음 호출에서 차단

### 8.2 구독 다운그레이드
- PREMIUM → STANDARD 변경 시
- 구매 크레딧은 유지, 월간 크레딧만 30으로 감소
- 이미 사용한 월간 크레딧 > 30이면 월간 잔량 = 0

### 8.3 보드 삭제
- 미사용 구매 크레딧은 환불 불가 (약관 명시)
- 또는 보드 삭제 전 경고: "미사용 AI 크레딧 N회가 있습니다"

### 8.4 시트 수 변경
- PREMIUM 시트 추가 → 즉시 월간 크레딧 증가 (50회/시트)
- PREMIUM 시트 감소 → 다음 갱신일부터 적용

### 8.5 TRIAL 만료
- TRIAL → STANDARD 전환 시 잔여 크레딧 소멸
- 구매 크레딧은 유지

### 8.6 환불
- 구매 후 미사용 크레딧 전액 환불 가능 (7일 이내)
- 부분 사용 시 사용분 제외 환불

---

## 9. 어드민 기능

### 9.1 모니터링 대시보드 추가 항목

| 지표 | 설명 |
|------|------|
| 전체 AI 크레딧 소진율 | 보드별 월간 크레딧 사용률 분포 |
| 추가 구매 전환율 | 무료 소진 → 추가 구매 비율 |
| 추가 구매 매출 | 일별/월별 크레딧 구매 금액 |
| 크레딧 소진 알림 빈도 | 차단당한 횟수 (가격 조정 참고) |

### 9.2 어드민 크레딧 조정
- 특정 보드에 수동으로 크레딧 부여 (CS 대응)
- 프로모션 크레딧 일괄 지급

---

## 10. 구현 범위

### Phase 1: 크레딧 기반 (MVP) - 약 1.5주

| 태스크 | 파일 | 기간 |
|--------|------|------|
| DB 마이그레이션 (V32) | `V32__ai_credits.sql` | 0.5일 |
| Subscription 엔티티 확장 | `Subscription.java` | 0.5일 |
| AiCreditService 구현 | `AiCreditService.java` (신규) | 1일 |
| AI 서비스 크레딧 체크 연동 | `MeetingAIService`, `NoteAIService`, `ReportAIService` | 1일 |
| 크레딧 조회 API | `AiCreditController.java` (신규) | 0.5일 |
| 크레딧 잔량 UI (인라인 + 설정) | `BoardSettings`, AI 버튼 영역 | 1일 |
| 소진 경고/차단 UI | 토스트 + 모달 | 1일 |
| 월간 리셋 스케줄러 | `AiCreditScheduler.java` | 0.5일 |
| i18n (10개 로케일) | `locales/*.json` | 0.5일 |

### Phase 2: 추가 구매 - 약 1주

| 태스크 | 파일 | 기간 |
|--------|------|------|
| 구매 이력 테이블 + 엔티티 | `AiCreditPurchase.java` | 0.5일 |
| 구매 API + 토스페이먼츠 연동 | `AiCreditController`, `TossPaymentsService` | 1일 |
| 구매 모달 UI (수량 선택 + 결제) | `AiCreditPurchaseModal.tsx` (신규) | 1.5일 |
| 구매 이력 조회 UI | 보드 설정 내 | 0.5일 |
| 환불 처리 | `AiCreditRefundService` | 0.5일 |

### Phase 3: 어드민 + 최적화 - 약 0.5주

| 태스크 | 파일 | 기간 |
|--------|------|------|
| 어드민 크레딧 현황 대시보드 | `AdminMonitoringTab.tsx` | 1일 |
| 크레딧 수동 부여 (CS용) | 어드민 API | 0.5일 |
| 동시성 최적화 (비관적 락) | `AiCreditService` | 0.5일 |

---

## 11. 검증 체크리스트

- [ ] STANDARD 보드에서 31번째 AI 호출 시 차단 + 모달 노출
- [ ] PREMIUM 5시트 보드에서 451번째 호출 시 차단
- [ ] 추가 크레딧 100회 구매 후 잔량 정상 증가
- [ ] 월간 갱신일에 무료 크레딧 리셋, 구매 크레딧 유지
- [ ] 마지막 크레딧 사용 시 경고 토스트 + 결과 정상 반환
- [ ] 동시 호출 시 크레딧 정합성 유지
- [ ] 구독 다운그레이드 시 구매 크레딧 보존
- [ ] TRIAL 만료 → STANDARD 전환 시 월간 크레딧 30으로 변경
- [ ] 어드민에서 보드별 크레딧 현황 조회 가능
