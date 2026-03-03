# Polar.sh 대시보드 세팅 가이드

BRIDGE 프로젝트의 결제 시스템(Polar.sh) 초기 설정을 위한 단계별 가이드입니다.

---

## 1. Polar.sh 계정 및 Organization 생성

1. [https://polar.sh](https://polar.sh) 접속 → GitHub 계정으로 로그인
2. **Create Organization** 클릭
3. Organization 이름: `bridgespots` (또는 원하는 이름)
4. 생성 완료 후 **Organization ID** 복사 → `POLAR_ORG_ID`로 사용

---

## 2. Product 생성 (총 7개)

Polar Dashboard → **Products** → **Create Product** 에서 아래 7개 상품을 생성합니다.

### 2-1. 구독 상품 (Recurring, 4개)

| # | 상품명 | 타입 | 가격 | 환경변수 |
|---|--------|------|------|----------|
| 1 | BRIDGE Board — Monthly | Recurring (Monthly) | $5.00/seat/mo | `POLAR_PRODUCT_BOARD_MONTHLY` |
| 2 | BRIDGE Board — Yearly | Recurring (Yearly) | $50.00/seat/yr | `POLAR_PRODUCT_BOARD_YEARLY` |
| 3 | BRIDGE Org — Monthly | Recurring (Monthly) | $15.00/seat/mo | `POLAR_PRODUCT_ORG_MONTHLY` |
| 4 | BRIDGE Org — Yearly | Recurring (Yearly) | $150.00/seat/yr | `POLAR_PRODUCT_ORG_YEARLY` |

**설정 시 주의사항:**
- Payment model: **Recurring**
- 구독 상품은 Polar가 자동으로 갱신/취소를 관리합니다
- 각 상품 생성 후 상품 상세에서 **Product ID** (UUID)를 복사해둡니다

### 2-2. 일회성 상품 (One-time, 3개)

| # | 상품명 | 타입 | 가격 | 환경변수 |
|---|--------|------|------|----------|
| 5 | AI Credits — 100 Pack | One-time | $10.00 | `POLAR_PRODUCT_CREDIT_100` |
| 6 | AI Credits — 500 Pack | One-time | $50.00 | `POLAR_PRODUCT_CREDIT_500` |
| 7 | AI Credits — 1000 Pack | One-time | $100.00 | `POLAR_PRODUCT_CREDIT_1000` |

**설정 시 주의사항:**
- Payment model: **One-time**
- 크레딧 100 미만 → credit-100 상품 사용, 500 미만 → credit-500, 1000 이상 → credit-1000
  (백엔드 `SubscriptionService.resolveAiCreditProductId()` 참조)

---

## 3. Webhook 설정

Polar Dashboard → **Settings** → **Webhooks** → **Add Endpoint**

### Webhook URL

| 환경 | URL |
|------|-----|
| Production | `https://api.bridgespots.com/api/v1/webhooks/polar` |
| Dev | `https://dev-api.bridgespots.com/api/v1/webhooks/polar` |
| Local 테스트 | `https://{ngrok-url}/api/v1/webhooks/polar` |

### 구독할 이벤트 (5개)

반드시 아래 이벤트를 모두 선택합니다:

| 이벤트 | 용도 |
|--------|------|
| `checkout.created` | 체크아웃 생성 로그 (정보성) |
| `subscription.created` | 구독 활성화 (Board/Org) |
| `subscription.updated` | 구독 상태 변경 (갱신/일시중지) |
| `subscription.canceled` | 구독 취소 처리 |
| `order.created` | 일회성 구매 완료 (AI 크레딧, 시트 추가) |

### Webhook Secret

1. Webhook 생성 후 **Signing Secret** 복사
2. `whsec_` 접두사가 포함된 전체 문자열을 그대로 사용
3. → `POLAR_WEBHOOK_SECRET` 환경변수로 등록

**서명 검증 방식**: Standard Webhook (HMAC-SHA256)
- 헤더: `webhook-id`, `webhook-signature`, `webhook-timestamp`
- 리플레이 방지: 5분 타임스탬프 검증 포함
- 코드 참조: `PolarWebhookService.verifySignature()`

---

## 4. API Key 발급

Polar Dashboard → **Settings** → **API Keys** → **Create Token**

- 이름: `bridge-backend-{env}` (예: `bridge-backend-prod`)
- Scope: Organization 전체 권한
- 생성된 키 복사 → `POLAR_API_KEY`

> API Key는 한 번만 표시됩니다. 반드시 즉시 복사하세요.

---

## 5. 환경변수 등록

### 전체 환경변수 목록 (10개)

```env
# Polar.sh 인증
POLAR_API_KEY=polar_at_xxxxxxxxxxxx
POLAR_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
POLAR_ORG_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Board 구독 Product ID
POLAR_PRODUCT_BOARD_MONTHLY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_PRODUCT_BOARD_YEARLY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Org 구독 Product ID
POLAR_PRODUCT_ORG_MONTHLY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_PRODUCT_ORG_YEARLY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# AI 크레딧 Product ID
POLAR_PRODUCT_CREDIT_100=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_PRODUCT_CREDIT_500=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLAR_PRODUCT_CREDIT_1000=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 등록 위치별 가이드

#### AWS (Production/Dev)

```bash
# AWS Systems Manager Parameter Store
aws ssm put-parameter --name "/bridge/prod/POLAR_API_KEY" --value "polar_at_xxx" --type SecureString
aws ssm put-parameter --name "/bridge/prod/POLAR_WEBHOOK_SECRET" --value "whsec_xxx" --type SecureString
aws ssm put-parameter --name "/bridge/prod/POLAR_ORG_ID" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_BOARD_MONTHLY" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_BOARD_YEARLY" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_ORG_MONTHLY" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_ORG_YEARLY" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_CREDIT_100" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_CREDIT_500" --value "xxx" --type String
aws ssm put-parameter --name "/bridge/prod/POLAR_PRODUCT_CREDIT_1000" --value "xxx" --type String
```

#### GitHub Actions (CI/CD)

Repository → Settings → Secrets and variables → Actions:
- `POLAR_API_KEY`, `POLAR_WEBHOOK_SECRET` → Secret
- 나머지 Product ID → Variable (또는 Secret)

#### 로컬 개발

```bash
# 방법 1: 환경변수 직접 설정
export POLAR_API_KEY=polar_at_xxx
export POLAR_WEBHOOK_SECRET=whsec_xxx
# ...

# 방법 2: IntelliJ Run Configuration → Environment variables에 추가

# 방법 3: .env.local 파일 (gitignore 포함 확인)
```

---

## 6. 로컬 Webhook 테스트 (ngrok)

로컬 환경에서 Polar webhook을 수신하려면 ngrok 등 터널링 도구가 필요합니다.

```bash
# 1. ngrok 실행
ngrok http 8080

# 2. ngrok URL 확인 (예: https://abc123.ngrok.io)

# 3. Polar Dashboard에서 테스트용 Webhook Endpoint 추가
#    URL: https://abc123.ngrok.io/api/v1/webhooks/polar

# 4. 백엔드 실행
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'

# 5. Polar Dashboard → Webhooks → 해당 Endpoint → "Send Test Event" 클릭
```

---

## 7. 결제 플로우 검증 체크리스트

### Board 구독

- [ ] Board 구독 시작 → Polar checkout 페이지로 리다이렉트
- [ ] 결제 완료 → `subscription.created` webhook 수신
- [ ] Board tier가 PREMIUM으로 업그레이드
- [ ] AI 크레딧 초기화 확인
- [ ] PaymentSuccessPage에서 polling으로 상태 확인 후 완료 표시

### Org 구독

- [ ] Org 구독 시작 → Polar checkout 리다이렉트
- [ ] 결제 완료 → `subscription.created` webhook (`bridge_type: org_subscription`)
- [ ] OrgSubscription 상태 ACTIVE 전환
- [ ] 소속 Board들 ORG_MANAGED tier 적용

### AI 크레딧

- [ ] 크레딧 구매 → Polar checkout 리다이렉트
- [ ] 결제 완료 → `order.created` webhook (`bridge_type: ai_credit`)
- [ ] purchased_credits 증가 확인

### 시트 추가

- [ ] 시트 추가 구매 → Polar checkout 리다이렉트
- [ ] 결제 완료 → `order.created` webhook (`bridge_type: seat_purchase`)
- [ ] seat_count 증가 확인

### 구독 취소

- [ ] 구독 취소 요청 → `subscription.canceled` webhook
- [ ] Board tier STANDARD 다운그레이드
- [ ] subscription 상태 CANCELED 전환

---

## 8. Polar.sh vs Toss Payments 차이점

| 항목 | Toss Payments (이전) | Polar.sh (현재) |
|------|---------------------|----------------|
| 결제 방식 | SDK 임베드 (프론트에서 결제) | Checkout URL 리다이렉트 |
| 결제 확인 | confirm API 호출 | Webhook 자동 수신 |
| 구독 관리 | 직접 구현 | Polar 자동 관리 (갱신/취소) |
| 정산 | PG사 정산 | Polar MoR (Merchant of Record) |
| 세금 | 직접 처리 | Polar가 글로벌 세금 처리 |
| 통화 | KRW | USD |

---

## 9. 트러블슈팅

### Webhook 수신 안 됨

1. SecurityConfig에서 `/api/v1/webhooks/polar` 경로가 `permitAll()` 인지 확인
2. Polar Dashboard → Webhooks → Delivery History에서 실패 로그 확인
3. 서버 로그에서 `Received Polar webhook` 검색
4. HTTPS 인증서 문제 확인 (Polar는 HTTPS만 지원)

### 서명 검증 실패 (`INVALID_WEBHOOK_SIGNATURE`)

1. `POLAR_WEBHOOK_SECRET` 값이 올바른지 확인 (`whsec_` 접두사 포함)
2. 타임스탬프 오차 확인 (서버 시간이 정확한지, 5분 이내인지)
3. payload가 raw body 그대로 전달되는지 확인 (Spring이 파싱하지 않도록)

### Checkout URL 생성 실패

1. `POLAR_API_KEY` 유효성 확인
2. Product ID가 올바른 UUID인지 확인
3. Polar API 상태 확인: [https://status.polar.sh](https://status.polar.sh)

### 결제 완료 후 상태 미반영

1. PaymentSuccessPage의 polling이 정상 동작하는지 확인
2. Webhook이 정상 수신되었는지 서버 로그 확인
3. `bridge_type` metadata가 올바르게 전달되는지 확인
