# BRIDGE 프로젝트 보안 취약점 분석 보고서

**작성일**: 2026-02-27
**대상**: BRIDGE (KanbanProject) — Backend + Frontend + Infrastructure
**분석 범위**: OWASP Top 10, 인증/인가, 인프라 설정, CI/CD, 의존성

---

## 요약 (Executive Summary)

| 심각도 | 건수 | 핵심 이슈 |
|--------|------|-----------|
| **Critical** | 4 | Mock 인증 우회, JWT 기본 시크릿, API 키 노출, EB 시크릿 평문 전달 |
| **High** | 12 | JWT localStorage 저장, WebSocket 토큰 노출, 크레딧 결제 우회, IDOR, 프로덕션 테스트 엔드포인트 |
| **Medium** | 16 | @Valid 누락, Rate Limiting 미적용, Sentry 과도 캡처, Redis 암호화 미설정 등 |
| **Low** | 9 | CORS localhost, 약한 패스워드, 파일 업로드 검증 등 |
| **Info** | 6 | 양호 항목 (DOMPurify, 토큰 갱신 등) |
| **합계** | **47** | |

---

## 1. Critical 취약점

### 1.1 [FE] 프로덕션 Mock 인증 우회 (USE_MOCK_ON_ERROR)

- **파일**: `frontend/src/app/utils/services.ts:76`
- **설명**: `const USE_MOCK_ON_ERROR = true`가 하드코딩되어 있어, 백엔드가 일시적으로 불가할 때 `mock-access-token`으로 가짜 인증이 성립됨. 환경 분기 없이 프로덕션에서도 활성화됨.
- **영향**: 백엔드 장애 시 사용자가 mock 토큰으로 "인증"되어 데이터 불일치 및 보안 혼란 발생.
- **수정안**:
  ```typescript
  const USE_MOCK_ON_ERROR = import.meta.env.DEV; // 개발 환경에서만 활성화
  ```

### 1.2 [BE] 예측 가능한 기본 JWT Secret

- **파일**: `backend/src/main/resources/application.yml:38`
- **코드**: `secret: ${JWT_SECRET:your-super-secret-jwt-key-for-development-only-change-in-production}`
- **설명**: 환경변수 미설정 시 예측 가능한 기본값으로 폴백. 이 값은 Git에 커밋되어 공개됨.
- **영향**: 기본값으로 JWT 토큰 위조 가능 → 전체 계정 접근.
- **수정안**: 기본값 제거 (`${JWT_SECRET}`), 미설정 시 애플리케이션 시작 실패하도록 Validation 추가.

### 1.3 [INFRA] 로컬 파일에 실제 Claude API 키 노출

- **파일**: `.env:1`, `backend/src/main/resources/application-local.yml:5-6`
- **설명**: 실제 Anthropic API 키(`sk-ant-api03-...`)가 로컬 파일에 평문 저장. `.gitignore`에 포함되어 Git 추적은 안 되지만 디스크에 존재.
- **영향**: 머신 탈취 시 API 키 유출, 비용 발생.
- **수정안**: 즉시 키 로테이션. macOS Keychain 또는 `direnv`+암호화 저장소 사용. pre-commit hook으로 API 키 패턴 스캔 추가.

### 1.4 [INFRA] Elastic Beanstalk 시크릿 평문 환경변수 전달

- **파일**: `infrastructure/terraform/modules/elastic-beanstalk/main.tf:299-401`
- **설명**: DB_PASSWORD, JWT_SECRET, CLAUDE_API_KEY, OPENAI_API_KEY 등 9개 시크릿이 EB 환경변수로 평문 전달. AWS EB 콘솔, CloudFormation, Terraform state에서 모두 조회 가능.
- **영향**: EB 콘솔 접근권자 또는 Terraform state 탈취 시 전체 시크릿 노출.
- **수정안**: AWS Secrets Manager 또는 SSM Parameter Store(SecureString) 사용. 애플리케이션 시작 시 SDK로 시크릿 fetch.

---

## 2. High 취약점

### 2.1 [FE] JWT 토큰 localStorage 저장

- **파일**: `frontend/src/app/utils/api.ts:45-61`
- **설명**: `access_token`과 `refresh_token` 모두 `localStorage`에 저장. XSS 또는 악성 브라우저 확장으로 탈취 가능.
- **영향**: 토큰 탈취 → 사용자 사칭. refresh_token은 장기간 유효하여 피해 확대.
- **수정안**: Refresh token → `httpOnly` 쿠키. Access token → 메모리(변수) 저장, 짧은 만료시간.

### 2.2 [FE] WebSocket URL에 JWT 토큰 노출

- **파일**: `frontend/src/app/utils/collabProvider.ts:50`
- **코드**: `` this.wsUrl = `${wsBase}/ws-collab/${noteId}?token=${token}` ``
- **설명**: 실시간 협업 WebSocket URL에 JWT가 쿼리 파라미터로 포함. 서버 액세스 로그, 프록시 로그, 브라우저 히스토리에 노출.
- **영향**: 로그 접근 시 토큰 탈취 가능. 또한 생성 시 토큰 고정으로 장시간 세션에서 만료된 토큰 사용.
- **수정안**: WebSocket 서브프로토콜 헤더 또는 연결 후 초기 인증 메시지로 토큰 전송. 재연결 시 `localStorage`에서 최신 토큰 재조회.

### 2.3 [FE] 프로덕션 API 응답 전체 콘솔 로깅

- **파일**: `frontend/src/app/utils/api.ts:155-161, 205-239`
- **설명**: 모든 API 요청/응답 데이터가 `console.log`로 출력. 로그인 요청 body(이메일/패스워드), 다이어리, 미팅 노트 등 민감 데이터 포함.
- **영향**: DevTools 또는 콘솔 캡처 확장으로 민감 정보 수집 가능.
- **수정안**: `if (import.meta.env.DEV) { console.log(...) }` 가드 추가.

### 2.4 [BE] AI 크레딧 결제 우회 (paymentKey null 허용)

- **파일**: `backend/src/main/java/com/kanban/domain/subscription/service/AiCreditService.java:121, 209`
- **설명**: `confirmCreditPayment` 메서드에서 `paymentKey`가 null/빈 문자열이면 결제 검증(Toss API 호출) 없이 크레딧이 지급됨.
- **영향**: paymentKey 없이 API 호출 → 무료 크레딧 무한 획득.
- **수정안**: `paymentKey` 필수 검증 추가. null/빈 문자열이면 즉시 거부.

### 2.5 [BE] 노트 협업 WebSocket 접근 권한 미검증 (IDOR)

- **파일**: `backend/src/main/java/com/kanban/global/websocket/NoteCollabHandler.java:83-113`
- **설명**: WebSocket 연결 시 JWT 인증만 검증하고, 해당 노트에 대한 접근 권한(노트 멤버/보드 멤버)은 확인하지 않음.
- **영향**: 인증된 사용자가 noteId만 알면 타인의 비공개 노트 실시간 편집 가능.
- **수정안**: `afterConnectionEstablished`에서 노트 접근 권한 검증 추가.

### 2.6 [BE] OrgSubscription 결제 확인 시 조직 멤버십 미검증

- **파일**: `backend/src/main/java/com/kanban/domain/subscription/controller/OrgSubscriptionController.java:112-121`
- **설명**: `confirmPayment` 엔드포인트에서 인증된 사용자가 해당 조직의 멤버인지 확인하지 않음.
- **영향**: 타 조직의 결제를 조작하거나, 결제 확인 프로세스에 개입 가능.
- **수정안**: 엔드포인트에 조직 멤버십 검증 추가.

### 2.7 [BE] 하드코딩된 관리자 계정 (dev 프로파일)

- **파일**: `backend/src/main/java/com/kanban/global/config/DataInitializer.java:28-29`
- **설명**: DataInitializer에서 고정된 관리자 이메일/패스워드가 하드코딩. `@Profile("local")`로 제한되지 않음.
- **영향**: dev 환경에서 알려진 자격증명으로 관리자 접근 가능.
- **수정안**: `@Profile("local")` 어노테이션 추가. 또는 자격증명을 환경변수로 이동.

### 2.8 [BE] H2 콘솔 permitAll() 전 프로파일 적용

- **파일**: `backend/src/main/java/com/kanban/global/config/SecurityConfig.java:75`
- **설명**: `/h2-console/**` permitAll() 규칙이 프로파일 조건 없이 전체 적용.
- **영향**: 프로파일 설정 실수 시 프로덕션에서 H2 콘솔 무인증 접근 가능.
- **수정안**: `@Profile("local")` 조건부 SecurityFilterChain 분리.

### 2.9 [INFRA] 프로덕션 Terraform State 로컬 저장

- **파일**: `infrastructure/terraform/environments/prod/main.tf:32-39`
- **설명**: 프로덕션 S3 backend 설정이 주석 처리됨 → state 파일이 개발자 로컬 머신에 존재.
- **영향**: State 파일에 전체 시크릿(DB 패스워드, API 키) 평문 포함. 로컬 머신 분실/탈취 시 전체 인프라 시크릿 노출.
- **수정안**: S3 backend 주석 해제 후 `terraform init`으로 마이그레이션.

### 2.10 [INFRA] 프로덕션 EC2 퍼블릭 서브넷 배치

- **파일**: `infrastructure/terraform/environments/prod/main.tf:75, 123, 130`
- **설명**: `enable_nat_gateway = false`로 EC2가 퍼블릭 서브넷에 퍼블릭 IP로 배치됨.
- **영향**: 보안그룹 설정 실수 시 EC2 직접 접근 가능. 인터넷 스캐닝 대상.
- **수정안**: NAT Gateway 활성화 후 프라이빗 서브넷으로 이동 (~$36/월).

### 2.11 [BE] 테스트 데이터 엔드포인트 프로덕션 노출

- **파일**: `backend/src/main/java/com/kanban/domain/test/TestDataController.java`
- **설명**: `POST /api/v1/test/create-board`, `POST /api/v1/test/create-organization`이 프로파일 제한 없이 전체 환경에서 활성.
- **영향**: 프로덕션에서 인증된 사용자가 테스트 데이터 생성 가능.
- **수정안**: `@Profile({"local", "dev"})` 어노테이션 추가.

### 2.12 [INFRA] Dev 환경 `ddl-auto: update` 사용

- **파일**: `backend/src/main/resources/application.yml:12`
- **설명**: dev 프로파일이 기본 `ddl-auto: update` 상속. Flyway 마이그레이션과 충돌 가능.
- **영향**: 스키마 드리프트, 데이터 손실, Flyway 마이그레이션 실패.
- **수정안**: dev/prod 프로파일에서 `ddl-auto: validate` 설정.

---

## 3. Medium 취약점

### 3.1 [BE] 20+ 컨트롤러 @Valid 누락

- **파일**: 다수 컨트롤러 (`DiaryController`, `MemberController`, `ScheduleController` 등)
- **설명**: `@RequestBody` 파라미터에 `@Valid` 어노테이션이 누락되어 DTO 검증이 동작하지 않음.
- **영향**: 잘못된 입력 데이터가 서비스 레이어까지 도달.
- **수정안**: 모든 `@RequestBody` 파라미터에 `@Valid` 추가.

### 3.2 [BE] IDOR — AiCreditController 보드 멤버십 미검증

- **파일**: `backend/src/main/java/com/kanban/domain/subscription/controller/AiCreditController.java:27-42`
- **설명**: `getCredits`, `purchaseCredits`, `getPurchaseHistory`에서 boardId에 대한 멤버십 확인 없음.
- **영향**: 인증된 사용자가 타 보드의 크레딧 조회/구매/이력 열람 가능.
- **수정안**: `boardService.checkMemberOrAbove(boardId, userId)` 추가.

### 3.3 [BE] Actuator 엔드포인트 무인증 노출

- **파일**: `backend/src/main/java/com/kanban/global/config/SecurityConfig.java:80`, `application.yml:83`
- **설명**: `/actuator/metrics`, `/actuator/hikaricp` 등이 permitAll()로 설정됨.
- **영향**: 시스템 메트릭, DB 커넥션풀 정보 외부 노출.
- **수정안**: Actuator 엔드포인트를 관리자 인증 필수로 변경 또는 내부 포트로 분리.

### 3.4 [BE] 관리자 엔드포인트 Rate Limiting 면제

- **파일**: `backend/src/main/java/com/kanban/global/filter/RateLimitingFilter.java:214`
- **설명**: Admin 경로가 Rate Limiting에서 제외됨.
- **영향**: 관리자 계정 탈취 시 무제한 API 호출 가능.
- **수정안**: 관리자 엔드포인트에도 (더 높은 한도의) Rate Limiting 적용.

### 3.5 [BE] Rate Limiting 버킷 맵 메모리 누수

- **파일**: `backend/src/main/java/com/kanban/global/filter/RateLimitingFilter.java:35-44`
- **설명**: Rate Limiting 버킷이 `ConcurrentHashMap`에 저장되며 만료/퇴거 정책 없음.
- **영향**: 장기 운영 시 메모리 누수 → OOM.
- **수정안**: `Caffeine` 캐시 또는 TTL 기반 만료 정책 적용.

### 3.6 [BE] 비밀번호 재설정 시 검증 부재

- **파일**: `backend/src/main/java/com/kanban/domain/auth/controller/AuthController.java:86-89`
- **설명**: reset-password 엔드포인트에서 새 비밀번호의 강도/길이 검증 없음.
- **영향**: 1자 비밀번호 등 취약한 비밀번호 설정 가능.
- **수정안**: 비밀번호 강도 정책 (최소 8자, 대소문자+숫자+특수문자) 추가.

### 3.7 [BE] 민감 엔드포인트 Rate Limiting 미적용

- **파일**: `backend/src/main/java/com/kanban/global/filter/RateLimitingFilter.java`
- **설명**: 비밀번호 재설정, 이메일 인증 등 민감 엔드포인트에 별도 Rate Limiting 없음.
- **영향**: Brute force 공격 가능.
- **수정안**: 민감 엔드포인트별 별도 (엄격한) Rate Limiting 적용.

### 3.8 [FE] Embed 블록 iframe sandbox 미설정

- **파일**: `frontend/src/app/components/notes/blocks/Embed.tsx:112-137`
- **설명**: 사용자 URL로 iframe 생성 시 `sandbox` 속성 없음. JavaScript 실행, 폼 제출, 팝업 생성 가능.
- **영향**: 악성 URL 임베드 시 노트를 공유받은 팀원 대상 공격 가능.
- **수정안**: `sandbox="allow-scripts allow-same-origin allow-presentation"` 추가.

### 3.9 [FE] Sentry Replay 전체 콘텐츠 캡처

- **파일**: `frontend/src/lib/sentry.ts:44-47`
- **설명**: `maskAllText: false`, `blockAllMedia: false`로 설정. 다이어리, 미팅 노트 등 민감 콘텐츠가 Sentry에 전송.
- **영향**: 개인정보(GDPR 등) 위반 가능성. 서드파티에 민감 데이터 저장.
- **수정안**: 프로덕션에서 `maskAllText: true`, `blockAllMedia: true` 설정.

### 3.10 [FE] 사용자 프로필 localStorage 저장

- **파일**: `frontend/src/app/utils/services.ts:1170, 1209, 1248`, `frontend/src/app/contexts/AuthContext.tsx:171`
- **설명**: 사용자 객체(id, email, name, role 등)가 localStorage에 JSON으로 저장.
- **영향**: XSS 또는 악성 확장으로 PII 수집 가능.
- **수정안**: 최소 데이터만 저장. 세션 시작 시 API에서 프로필 조회.

### 3.11 [FE] 로그아웃 시 서버측 토큰 무효화 미보장

- **파일**: `frontend/src/app/utils/services.ts:1271-1279`
- **설명**: 서버 로그아웃 API 실패 시에도 로컬 토큰만 삭제하고 진행. 서버측 refresh token 유효 상태 유지.
- **영향**: 탈취된 refresh token이 로그아웃 후에도 사용 가능.
- **수정안**: 서버 로그아웃 재시도 로직 추가. 서버측 토큰 로테이션 구현.

### 3.12 [FE] CollabProvider 토큰 미갱신

- **파일**: `frontend/src/app/utils/collabProvider.ts:49-50, 62-64`
- **설명**: 생성자에서 토큰을 한 번 설정 후 재연결 시에도 동일 토큰 사용.
- **영향**: 장시간 세션에서 토큰 만료 후 협업 실시간 동기화 실패.
- **수정안**: `connect()` 호출 시마다 `localStorage`에서 최신 토큰 조회.

### 3.13 [INFRA] GitHub Actions permissions 미설정

- **파일**: `.github/workflows/` 전체 4개 워크플로우
- **설명**: `permissions:` 블록 미지정으로 기본 권한(과도할 수 있음) 사용.
- **수정안**: `permissions: { contents: read }` 등 최소 권한 설정.

### 3.14 [INFRA] 서드파티 GitHub Action SHA 미고정

- **파일**: `.github/workflows/deploy-dev.yml:107`
- **코드**: `uses: einaregilsson/beanstalk-deploy@v22`
- **설명**: 서드파티 Action이 버전 태그로 참조. 태그 변조 시 악성 코드 실행 가능.
- **수정안**: 전체 커밋 SHA로 고정.

### 3.15 [INFRA] Redis 전송 암호화 미설정

- **파일**: `infrastructure/terraform/modules/elasticache/main.tf:40`
- **코드**: `transit_encryption_enabled = false`
- **설명**: VPC 내부지만 Redis 통신이 평문. VPC 내부 탈취 시 데이터 노출.
- **수정안**: `transit_encryption_enabled = true` + TLS 연결 설정.

### 3.16 [INFRA] Dev Terraform Output에 RDS 엔드포인트 평문 노출

- **파일**: `infrastructure/terraform/environments/dev/outputs.tf:22-29`
- **설명**: `rds_endpoint`, `rds_jdbc_url` 출력에 `sensitive = true` 미설정 (prod는 설정됨).
- **영향**: CI 로그에 DB 연결 정보 노출.
- **수정안**: `sensitive = true` 추가.

---

## 4. Low 취약점

### 4.1 [BE] CORS 설정에 localhost 포함

- **파일**: `backend/src/main/java/com/kanban/global/config/SecurityConfig.java:93`
- **설명**: 프로덕션 CORS에 `http://localhost:5173/5174/3000` 포함.
- **수정안**: 프로파일별 CORS origin 분리.

### 4.2 [BE] Content-Security-Policy 헤더 미설정

- **파일**: `backend/src/main/java/com/kanban/global/config/SecurityConfig.java:51-55`
- **수정안**: CSP 헤더 추가.

### 4.3 [BE] Multipart 크기 제한 불일치

- **파일**: `backend/src/main/resources/application.yml:107-109`
- **설명**: Spring multipart 최대 110MB vs 애플리케이션 로직 제한 5/50MB.
- **수정안**: 일치시키거나 multipart 제한을 50MB로 낮춤.

### 4.4 [BE] UpdateProfileRequest 검증 미설정

- **파일**: `backend/src/main/java/com/kanban/domain/member/dto/UpdateProfileRequest.java`
- **수정안**: `@Size`, `@Pattern` 등 검증 어노테이션 추가.

### 4.5 [BE] PresignRequest 파일명 검증 부재

- **파일**: `backend/src/main/java/com/kanban/domain/.../FileController.java:61-67`
- **설명**: S3 Presign URL 생성 시 파일명 검증 없음. Path traversal 가능성.
- **수정안**: 파일명 패턴 검증 및 sanitization 추가.

### 4.6 [FE] 파일 업로드 클라이언트 검증만 존재

- **파일**: `frontend/src/app/components/SettingsPage.tsx:120-128`, `CommentPanel.tsx:384-393`
- **설명**: 일부 업로드 포인트에서 타입/크기 검증이 클라이언트만.
- **수정안**: 백엔드 검증 확인 및 보강.

### 4.7 [FE] Sentry에 이메일 전송

- **파일**: `frontend/src/lib/sentry.ts:105-108`
- **수정안**: `id`만 전송, `email` 제거 고려.

### 4.8 [INFRA] Docker Compose 약한 DB 패스워드

- **파일**: `docker-compose.yml:11` — `POSTGRES_PASSWORD: kanban123`
- **수정안**: 환경변수 참조로 변경: `${POSTGRES_PASSWORD:-kanban123}`.

### 4.9 [INFRA] Docker Compose Redis 인증 없음

- **파일**: `docker-compose.yml:21-26`
- **수정안**: `command: redis-server --requirepass ${REDIS_PASSWORD:-localdev}` 추가.

---

## 5. Info (양호 항목)

| 항목 | 파일 | 상태 |
|------|------|------|
| DOMPurify로 HTML 새니타이징 | `NoteVersionHistory.tsx` | 양호 |
| STOMP WebSocket 재연결 시 토큰 갱신 | `websocket.ts:88-94` | 양호 |
| 토큰 갱신 Race Condition 방지 | `api.ts:248-260` | 양호 |
| 에러 응답 스택트레이스 미노출 | `GlobalExceptionHandler.java` | 양호 |
| S3 퍼블릭 접근 차단 + OAC | `s3-cloudfront/main.tf` | 양호 |
| CloudFront HTTPS 강제 | CloudFront 설정 | 양호 |
| Docker 멀티스테이지 빌드 + non-root 실행 | Dockerfile | 양호 |
| RDS 삭제 보호 + 최종 스냅샷 | prod RDS 설정 | 양호 |
| `.gitignore`에 `.env`, `*.tfstate` 포함 | `.gitignore` | 양호 |
| Native Query 파라미터 바인딩 사용 | Repository 레이어 | 양호 |

---

## 6. 우선순위별 수정 로드맵

### Phase 1: 즉시 수정 (1-3일)

| 순위 | ID | 항목 | 난이도 |
|------|----|------|--------|
| 1 | 1.1 | `USE_MOCK_ON_ERROR` 프로덕션 비활성화 | 낮음 |
| 2 | 1.2 | JWT 기본 시크릿 제거 + 시작 검증 | 낮음 |
| 3 | 1.3 | Claude API 키 로테이션 | 낮음 |
| 4 | 2.4 | 크레딧 결제 paymentKey 필수 검증 | 낮음 |
| 5 | 2.5 | 노트 WebSocket 접근 권한 검증 | 중간 |
| 6 | 2.7 | DataInitializer `@Profile("local")` 추가 | 낮음 |
| 7 | 2.8 | H2 콘솔 프로파일 조건부 적용 | 낮음 |
| 8 | 2.11 | TestDataController `@Profile` 제한 | 낮음 |
| 9 | 2.3 | API 콘솔 로깅 DEV 가드 | 낮음 |

### Phase 2: 단기 수정 (1-2주)

| 순위 | ID | 항목 | 난이도 |
|------|----|------|--------|
| 10 | 1.4 | EB 시크릿 → Secrets Manager 마이그레이션 | 높음 |
| 11 | 2.9 | 프로덕션 Terraform S3 backend 활성화 | 중간 |
| 12 | 2.10 | EC2 프라이빗 서브넷 이동 | 중간 |
| 13 | 3.1 | 컨트롤러 @Valid 일괄 추가 | 중간 |
| 14 | 3.2 | AiCreditController 보드 멤버십 검증 | 낮음 |
| 15 | 3.6 | 비밀번호 강도 정책 추가 | 낮음 |
| 16 | 3.8 | iframe sandbox 속성 추가 | 낮음 |
| 17 | 3.9 | Sentry Replay 마스킹 설정 | 낮음 |

### Phase 3: 중기 개선 (1개월)

| 순위 | ID | 항목 | 난이도 |
|------|----|------|--------|
| 18 | 2.1 | JWT → httpOnly 쿠키 마이그레이션 | 높음 |
| 19 | 2.2 | WebSocket 토큰 전달 방식 변경 | 중간 |
| 20 | 3.5 | Rate Limiting 버킷 캐시 교체 | 중간 |
| 21 | 3.7 | 민감 엔드포인트별 Rate Limiting | 중간 |
| 22 | 3.15 | Redis 전송 암호화 활성화 | 중간 |
| 23 | 4.1 | CORS 프로파일별 분리 | 낮음 |
| 24 | 4.2 | CSP 헤더 추가 | 중간 |

---

## 7. 참고사항

- 이 분석은 정적 코드 리뷰(Static Analysis) 기반이며, 동적 테스트(DAST/Penetration Test)는 포함되지 않음
- 의존성 취약점은 버전 기반 추정이며, `npm audit` / `./gradlew dependencyCheckAnalyze` 실행 권장
- 인프라 스캔은 Terraform 코드 기반이며, 실제 AWS 리소스 상태는 별도 확인 필요
- GDPR/개인정보보호법 컴플라이언스는 별도 법률 검토 권장
