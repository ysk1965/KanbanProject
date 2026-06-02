# BRIDGE — AWS 계정 이전(Account Migration) 분석 및 개선 방안

> **목적**: 현재 BRIDGE 서비스의 AWS 인프라를 **다른 AWS 계정**으로 이전하기 위한 (1) 현황 파악, (2) 계정 결합(account-coupling) 분석, (3) 이전 전략·런북, (4) 이전을 기회로 한 개선 권고를 정리한다.
> **작성일**: 2026-06-01
> **분석 범위**: `infrastructure/terraform/**`, `.github/workflows/**`, `backend/` 런타임 설정, 레포지토리 전역 하드코딩 스캔
> **현재 계정**: `997286396624` (`terraform_admin`), 리전 `ap-northeast-2` (서울) + CloudFront ACM 전용 `us-east-1`
> **가정**: 별도 명시가 없으면 **리전은 ap-northeast-2 유지**, **도메인은 `bridgespots.com` 유지**

---

## 0. 한눈에 보는 결론 (Executive Summary)

- **Terraform 코드 자체는 계정 이식성이 높다.** 12자리 계정 ID 하드코딩이 코드/워크플로우에 **전혀 없고**, ARN은 모두 AWS 관리형 정책 ARN 또는 `${var}`/와일드카드다. 계정 결합은 코드가 아니라 **(a) 전역 유일 리소스 이름, (b) 상태(state)·데이터, (c) 외부 비밀값·DNS·인증서**에서 발생한다.
- **이전 난이도의 핵심은 4가지**: ① 데이터를 가진 RDS(유일 자산), ② 전역 유일 S3 버킷 이름 충돌, ③ ACM 인증서 재발급 + Route53 영역 재위임, ④ ~40개 비밀값/식별자 재주입.
- **반드시 바로잡아야 할 문서 오류 (P0)**: CLAUDE.md/일부 문서는 prod DB를 *Aurora Serverless v2*라고 적고 있으나, **실제 prod는 `rds-simple`(표준 `db.t4g.micro`, 단일 AZ)** 를 쓴다(`environments/prod/main.tf:90`). 마이그레이션 경로(스냅샷/복원)와 `infra-scheduler`의 야간 정지 동작이 여기에 좌우되므로 계획의 전제를 정정해야 한다.
- **보안 부채를 이전 기회에 청산**: 평문 `tfvars`의 `db_password`/`jwt_secret`이 **dev·prod 동일**, EB 환경변수도 평문, 디스크에 라이브 `.env` 존재, git에 Firebase Android 키·Toss 테스트 키 커밋됨. 이전 시 **반드시 로테이션 + SSM/Secrets Manager 이관 + OIDC 전환**을 함께 수행한다.
- **현실적 다운타임**: 깨끗한 DB 스냅샷을 위해 쓰기 동결(write-freeze) 시 **약 30~60분**. JWT 로테이션으로 **전체 사용자 1회 강제 재로그인** 발생(의도된 동작).

---

## 1. 현재 인프라 현황 (Inventory)

### 1.1 아키텍처 개요

```
                    Route53 (bridgespots.com 호스팅 영역, TF 생성)
                    + milkyway.pe.kr (data 소스 = 외부 영역 참조)
                              │
        ┌─────────────────────┼─────────────────────────┐
        │                     │                         │
   CloudFront(프론트)    CloudFront(첨부)          api.<domain> (A alias)
   S3: kanban-{env}-      S3: bridge-kanban-              │
   frontend               attachments (공유, data 소스)   ALB (EB 생성)
        │                     │                         │
   ACM us-east-1         OAC + bucket policy        ACM ap-northeast-2
                                                         │
                                              Elastic Beanstalk (t3.small)
                                              ASG 1~2, public subnet, NAT 없음
                                                 │           │
                                              RDS         ElastiCache Redis
                                          db.t4g.micro    cache.t4g.micro
                                          (rds-simple)    (prod만, dev는 Simple 캐시)
                                                 ▲
                                   infra-scheduler Lambda (EventBridge)
                                   야간 KST 01:00~09:00 EB+RDS 정지
```

### 1.2 Terraform 모듈 구성 (10개 모듈 + 2개 환경)

| 모듈 | 생성 리소스 | 핵심 설정 |
|------|------------|----------|
| `vpc` | VPC, IGW, public×2/private×2 subnet, (옵션)NAT+EIP, 라우팅 | dev `10.0.0.0/16` / prod `10.1.0.0/16`, **NAT 비활성** |
| `security-groups` | ALB(80/443), eb_ec2(5000/8080), rds(5432), redis(6379) | SG↔SG 참조(내부) |
| `rds-simple` | `aws_db_instance` PostgreSQL | **db.t4g.micro, gp3 20GB, 15.10, storage_encrypted=true(기본 aws/rds 키)**, prod만 deletion_protection+최종 스냅샷 |
| `rds` (Aurora) | Aurora Serverless v2 | **미사용** — Phase 2 업그레이드 경로로만 존재 |
| `elasticache` | Redis 복제 그룹 | redis7, cache.t4g.micro, 1노드, at-rest 암호화 on, transit off, **prod만 사용** |
| `elastic-beanstalk` | EB App/Env + IAM 역할 2종 + 인스턴스 프로파일 | t3.small, ASG 1~4, 포트 5000, `/actuator/health`, solution stack `64bit Amazon Linux 2023 v4.8.3 running Corretto 21` |
| `s3-cloudfront` | 프론트 S3(`${project}-${env}-frontend`) + CloudFront(OAC) + SPA 라우팅 함수 | CF Function에 `bridgespots.com` 분기 **하드코딩** |
| `acm-certificate` | ACM 인증서(DNS 검증) | us-east-1(CF)/ap-northeast-2(ALB) 두 곳 |
| `route53` | **신규 호스팅 영역 생성** | NS 재위임 필요 |
| `infra-scheduler` | Lambda(py3.12)+EventBridge+SNS+IAM | 야간 EB ASG→0 + RDS 정지, 아침 복원 |

### 1.3 dev vs prod 차이 (중요)

| 항목 | dev | prod |
|------|-----|------|
| **Terraform state backend** | **S3 활성** (`kanban-terraform-state`, key `dev/`) | **주석 처리됨 → 로컬 state 가능성** ⚠️ |
| VPC CIDR | `10.0.0.0/16` | `10.1.0.0/16` |
| ElastiCache | 없음(Simple 캐시) | `cache.t4g.micro` 1노드 |
| RDS 백업 보관 | 1일 | 3일 |
| `spring_profile` | dev | prod |
| S3 lifecycle/tiering | **dev에서만 관리**(공유 버킷) | (dev가 관리) |
| 보조 도메인 `milkyway.pe.kr` | **dev에만 존재**(testprod) | 없음 |
| 출력값 민감도 | rds/redis 평문 | rds/redis `sensitive=true` |

> ⚠️ **명명과 실제의 불일치**: "dev" 환경이 사실상 운영 도메인 `bridgespots.com`과 `milkyway.pe.kr`(testprod)을 동시에 서빙한다. 프론트는 `develop` 브랜치 빌드를 `kanban-dev-frontend`·`kanban-testprod-frontend` **두 버킷**에 배포한다. "prod" Terraform 환경은 존재하나 (로컬 state·ElastiCache 활성 등) 실제 가동 여부를 **이전 전 반드시 확인**해야 한다.

### 1.4 CI/CD (GitHub Actions 4개)

| 워크플로우 | AWS 사용 | 트리거 | 인증 |
|-----------|---------|--------|------|
| `ci.yml` | ❌ 없음 | PR/push (main·develop) | — (계정 변경 불필요) |
| `deploy-dev.yml` | ✅ EB + S3 + CloudFront | CI 성공(develop) | **정적 IAM 키** |
| `terraform.yml` | ✅ plan/apply | PR / push(main) / dispatch | **정적 IAM 키** |
| `deploy-mobile.yml` | ❌ (Firebase/Apple/Play) | 수동 | — |

- **OIDC/role-assume 전혀 없음** — 모든 AWS 워크플로우가 `secrets.AWS_ACCESS_KEY_ID/SECRET` 정적 키 사용.
- `deploy-dev.yml` `env`에 하드코딩: `EB_APPLICATION_NAME=kanban-dev`, `EB_ENVIRONMENT_NAME=kanban-dev-env`, `S3_BUCKET_DEV=kanban-dev-frontend`, `S3_BUCKET_TESTPROD=kanban-testprod-frontend`, RDS id `kanban-dev-db`(웨이크업 스텝).
- 배포 전 `infra-scheduler`로 정지된 인프라를 깨우는 로직 내장(ASG desired=0 감지 → RDS start + ASG 스케일업 + `sleep 180`).

### 1.5 백엔드 런타임 결합점

- `S3Config.java`·`CloudWatchConfig.java`에 **`Region.AP_NORTHEAST_2` 하드코딩**(env 오버라이드 없음). `S3FileUploadService.java:307`·`SchemaMigrationInitializer.java:126`은 `https://<bucket>.s3.ap-northeast-2.amazonaws.com/...` URL을 하드코딩.
- AWS 인증은 **`DefaultCredentialsProvider`** → **EB EC2 인스턴스 역할**에 의존. 그러나 Terraform의 `eb_ec2` 역할에는 EB 관리형 정책만 붙어 있고 **`bridge-kanban-attachments` 버킷 접근 권한이 코드화되어 있지 않다** → 현재 콘솔에서 수동 부여된 IAM 드리프트로 추정. **새 계정에서 반드시 명시적으로 재생성** 필요.
- 이메일은 **Gmail SMTP**(SES 아님) — CLAUDE.md의 "SES" 표기는 오류. SES 도메인 인증/DKIM/샌드박스 해제 작업은 **불필요**.
- prod 프로파일은 `DATABASE_URL`, `S3_BUCKET`에 **기본값이 없어** 미설정 시 앱이 기동 실패.

---

## 2. 계정 결합(Account-Coupling) 분석 — "무엇이 깨지는가"

### 2.1 반드시 새로 만들거나 다시 가리켜야 하는 것

| 분류 | 항목 | 결합 이유 | 조치 |
|------|------|----------|------|
| **State** | `kanban-terraform-state`(S3), `kanban-terraform-lock`(DynamoDB) | 전역 유일 / 계정 스코프, **TF로 관리 안 됨(수동 부트스트랩)** | 새 계정에 새 이름으로 사전 생성 |
| **전역 유일 S3** | `bridge-kanban-attachments`, `kanban-dev-frontend`, `kanban-testprod-frontend` (+ `kanban-prod-frontend`) | S3 이름은 전계정 전역 유일 → **구 계정이 보유 중이면 동일 이름 사용 불가** | 새 이름으로 생성 + 객체 복사 |
| **데이터(RDS)** | `kanban-dev-db`, `kanban-prod-db` | 인스턴스 자체 + **기본 `aws/rds` KMS 키(교차계정 공유 불가)** | CMK 재암호화 → 공유 → 복원 |
| **인증서(ACM)** | ALB(ap-northeast-2)+CloudFront(us-east-1) | ARN 계정 스코프, 이전 불가 | **재발급**(DNS 검증) |
| **DNS** | Route53 영역 `bridgespots.com` | 영역 이전 불가 | 새 영역 생성 + **레지스트라 NS 재위임** |
| **CI 자격증명** | `AWS_ACCESS_KEY_ID/SECRET` | 구 계정 IAM | 신규 IAM(권장: OIDC 역할) |
| **CloudFront 배포 ID** | `vars.DEV/TESTPROD_CLOUDFRONT_DISTRIBUTION_ID` | 계정별 ID | 새 배포 ID로 GitHub vars 갱신 |
| **CloudWatch 차원** | `EC2_INSTANCE_ID`, `RDS_INSTANCE_ID` env | 계정별 리소스 ID | 새 ID로 갱신 |
| **IAM(첨부 버킷 접근)** | EB EC2 인스턴스 역할의 S3 권한 | **현재 코드화 안 됨(드리프트)** | 새 계정에 **명시적으로** 정책 추가 |

### 2.2 도메인 유지 시 "그대로 넘어가는" 것 (계정 무관)

- 외부 SaaS 전부: Google OAuth, Gmail SMTP, Claude/OpenAI, Polar.sh(결제), Discord, Slack, Firebase/FCM, Sentry, 모니터링 Slack 웹훅.
- OAuth 리다이렉트 URI / CORS 허용 출처 / 웹훅 엔드포인트는 `bridgespots.com`을 가리키므로 **도메인 유지 시 값 변경 불필요** — 단 **각 콘솔에서 재검증** 필수(아래 위험 R8).
- DB의 `device_tokens`(FCM)는 Firebase 프로젝트가 동일하므로 DB 이관 후에도 유효.

### 2.3 코드/문서에만 있는 식별자 (코드 의존 없음, 문서만 갱신)

- 실제 계정 ID `997286396624` → `docs/infra/aws-infrastructure-report.md`, `docs/reports/infra/aws-cost-analysis-2026-04.md` (문서 전용).
- CloudFront 배포 ID `E3C9295UMI1LW7`(bridgespots), `E22U5C46YWKCL7`(milkyway), `E1F85VN1VYI67C`(첨부), 도메인 `dr1rrmcqa2s6y.cloudfront.net` (문서 전용).
- Route53 영역 ID `Z001600031MWAX7YIP2BO`(bridgespots), `Z04362322QT3T525T8YCY`(milkyway) (문서/가이드 전용).

---

## 3. 보안·정합성 결함 (이전과 함께 청산할 것)

| 우선순위 | 결함 | 위치 | 조치 |
|:--------:|------|------|------|
| **P0** | prod DB가 Aurora가 아니라 `rds-simple`(표준 단일 AZ) — 문서/계획 전제 오류 | `environments/prod/main.tf:90` | 계획·문서 정정, 표준 인스턴스 스냅샷/복원 경로 사용 |
| **P0** | `db_password`/`jwt_secret` **평문 tfvars + dev·prod 동일** | `environments/*/terraform.tfvars` | 로테이션 + dev/prod 분리 + SSM/Secrets Manager |
| **P0** | prod Terraform **state가 로컬일 가능성**(backend 주석 처리) | `environments/prod/main.tf:33-39` | 위치 확인·백업, 새 계정에서 원격 backend로 |
| **P0** | CI 정적 키 단일 인증(OIDC 없음), 최소권한 정책 미문서화 | `*.yml` | OIDC 전환 + 최소권한 정책 작성 |
| **P0** | 첨부 버킷 접근 IAM이 **코드화 안 됨**(수동 드리프트) | `modules/elastic-beanstalk/main.tf` | EB EC2 역할에 S3 정책 명시 |
| **P1** | git **추적 중** Firebase Android 키 `AIza...RCEZM` | `frontend/android/app/google-services.json:18` | 로테이션/제한 |
| **P1** | git 추적 문서에 Toss 테스트 키 | `docs/reports/high/TASK-2026-0214-002-security-fixes.md:109-110` | 로테이션·스크럽 |
| **P1** | 모든 비밀이 **EB 평문 환경변수**(콘솔에서 노출) | `modules/elastic-beanstalk/main.tf` | SSM SecureString 참조로 전환 |
| **P1** | dev·prod 전부 **단일 AZ / NAT 없음 / public subnet** SPOF | `environments/*/main.tf` | 이전 시 Multi-AZ·NAT·private subnet 검토 |
| **P2** | 디스크의 라이브 시크릿 파일·대용량 산출물 | `backend/.env`, `frontend/.env.local`, `backend/deploy.zip`(81MB), `deploy/application.jar`(91MB) | 새 계정으로 그대로 운반 금지, 재생성 |

> 참고: `backend/.env`·`*.env.local`·`terraform.tfvars`는 `.gitignore`에 걸려 **git에는 커밋되지 않았으나 디스크에 라이브 값**으로 존재한다. 새 환경으로 복사하지 말고 로테이션 후 재발급한다.

---

## 4. 이전 전략 (리소스별)

### 4.1 Terraform State
- 구 state는 구 계정 ARN/ID를 담고 있으므로 **그대로 재사용 금지**.
- 새 계정에 **새 이름**의 state 버킷(versioning+SSE+퍼블릭 차단) + 잠금 테이블(PAY_PER_REQUEST) 사전 생성.
- **클린 init(`terraform init -reconfigure`)** 후, 데이터 보유 리소스(RDS, 호스팅 영역, 첨부 버킷)만 **`terraform import`**, 나머지는 신규 `apply`.
- ⚠️ prod state 위치를 **가장 먼저** 확정·백업(로컬이면 유실 시 리소스 고아화).

### 4.2 RDS (유일한 비가역 자산) — `rds-simple` 표준 인스턴스
- 기본 `aws/rds` KMS 키는 **교차계정 공유 불가** → **CMK 재암호화 경로**:
  1. 수동 스냅샷 생성 → 2. 소스 계정 **CMK로 `copy-db-snapshot`(재암호화)** → 3. CMK 키 정책에 새 계정 `kms:Decrypt`+`kms:CreateGrant` 부여 + 스냅샷 공유 → 4. 새 계정에서 **새 계정 CMK로 copy** → 5. `restore-db-instance-from-db-snapshot` → 6. `terraform import`.
- 데이터 20GB 수준이면 **`pg_dump`/`pg_restore`** 도 실용적(KMS 공유 불필요, 버전 관용, 행수 검증 용이).
- 복원 후 **`engine_version=15.10` 고정 + `auto_minor_version_upgrade=false`** 로 plan 드리프트 방지(현재 미설정 → 기본 true).
- prod `deletion_protection=true` → **검증 완료 전까지 구 인스턴스 유지(롤백 소스)**.
- ⚠️ **`infra-scheduler`가 prod RDS를 야간 정지**한다. 새 계정에서 prod 스케줄러 활성 여부를 명시적으로 결정(미결정 시 매일 KST 01:00 prod가 내려감).

### 4.3 S3
- **`bridge-kanban-attachments`(사용자 업로드, dev·prod 공유, data 소스)**: 전역 이름 충돌 → **새 이름**으로 생성. 구 버킷에 교차계정 read 부여 후 `aws s3 sync`. **Intelligent-Tiering ARCHIVE_ACCESS(90일) 객체는 사전 복원(3~5h)** 후 복사(미복원 시 스킵/실패). `temp/`(1일 만료)는 제외.
  - ⚠️ DB에 저장된 **절대 URL**(`s3://...` 또는 `*.cloudfront.net` 또는 `<bucket>.s3.ap-northeast-2...`) 감사. CloudFront 경로 서빙이면 이름 변경이 투명하지만, 절대 URL 저장분은 재작성 필요(`S3FileUploadService.java:307`, `SchemaMigrationInitializer.java:126`).
  - ⚠️ dev·prod가 **동일 버킷에 bucket policy를 각각 기록**(last-apply-wins) → 새 계정에서 **버킷 단일 소유자 결정 또는 환경별 분리**.
- 프론트 버킷(`kanban-*-frontend`): CI 재배포로 복구 가능. 이름 충돌만 주의.

### 4.4 ElastiCache Redis
- 캐시 + WebSocket Pub/Sub 용도로 **데이터 비영속** → **빈 클러스터 신규 생성**, 데이터 이관 불필요. 콜드 캐시·WS 재동기화는 DB에서 자동 복구.

### 4.5 CloudFront + ACM
- ACM 인증서는 **이전 불가 → 재발급**(ALB ap-northeast-2 + CloudFront us-east-1, `bridgespots.com`+`*.bridgespots.com`). DNS 검증 레코드는 **새(이전 대상) Route53 영역**에 들어가므로, **새 영역이 권한 영역(authoritative)이 된 후** 검증 완료 → EB/CloudFront `apply`가 이를 소비(순서 의존성).
- CloudFront 배포는 **재생성**(새 ID/도메인). 보조 도메인 `milkyway.pe.kr`은 ALB HTTPS 리스너에 `aws_lb_listener_certificate`로 부착 → **재발급·재부착** 필요.

### 4.6 Route53 / 도메인
- 영역은 **새로 생성**(레코드는 TF가 대부분 재생성). 그 후 **레지스트라에서 NS를 새 영역의 4개 NS로 재위임**(권장: 도메인 등록은 구 계정에 두고 NS만 변경; 풀 도메인 이전은 수일 소요).
- ⚠️ **레지스트라 NS TTL(보통 172800s=48h)** 이 진짜 long pole — 사전 단축 불가하므로 **양 영역 병행(overlap) 기간**을 둔다. 레코드 TTL은 컷오버 24~48h 전 60s로 낮춘다.
- `milkyway.pe.kr`은 data 소스(외부 관리 영역) → 새 계정 자격증명으로 접근 가능한지 또는 함께 이전할지 결정(미해결 시 dev plan 실패).

### 4.7 비밀값
- 컷오버 시 **`jwt_secret` 로테이션**(전 사용자 1회 강제 재로그인, 의도된 동작). `db_password`는 복원 인스턴스가 스냅샷 마스터 PW를 승계 → 필요 시 `modify-db-instance`로 변경 후 SSM·EB 동시 갱신.
- **dev/prod 분리된 새 값** 생성, 평문 tfvars/EB 환경변수에서 **SSM SecureString/Secrets Manager**로 이관.

---

## 5. 단계별 런북 (Phase 0 → 6)

### Phase 0 — 사전 결정 (T-2주)
1. **타깃 리전 확정**(ap-northeast-2 유지 가정). 변경 시 `S3Config.java`·`CloudWatchConfig.java`의 `Region.AP_NORTHEAST_2`, `S3FileUploadService.java:307`·`SchemaMigrationInitializer.java:126`의 URL 수정 필수.
2. **prod Terraform state 위치 확정·백업**(로컬이면 최우선 리스크).
3. 도메인 전략 결정(NS 재위임 권장), `milkyway.pe.kr` 동반 이전 여부.
4. 이전과 함께 적용할 개선 확정: Multi-AZ RDS, NAT+private subnet, dev/prod 비밀 분리, OIDC, SSM 이관.
5. 3rd-party 콘솔 화이트리스트 목록화(Google/Discord/Slack/Polar/Toss) + **소스 IP 화이트리스트 여부** 확인(새 EB egress IP 변경됨).
6. DB의 절대 S3/CloudFront URL 저장분 감사.

### Phase 1 — 새 계정 부트스트랩 & 쿼터 (T-10일)
1. **서비스 쿼터 증설 신청(조기)**: EC2 On-Demand vCPU, EIP(NAT 시), VPC, RDS, CloudFront.
2. **타깃 리전 가용성 확인**: EB solution stack(`...Corretto 21` v4.8.3가 폐기되었을 수 있음 → `aws elasticbeanstalk list-available-solution-stacks`), postgres 15.10, redis 7.0/`redis7` 패밀리, t4g(Graviton) 인스턴스.
3. AWS Organization 가입 시 **SCP가 ap-northeast-2/IAM 생성/TF 리소스를 막지 않는지** 확인.
4. 임시 부트스트랩 admin 자격증명 → **새 state 버킷/잠금 테이블** 사전 생성.
5. **RDS용 CMK** 생성, TF `kms_key_id`에 미리 기입(복원 DB가 처음부터 CMK 암호화).
6. **GitHub OIDC** 설정(`aws_iam_openid_connect_provider` + repo/branch 조건 IAM 역할 + 최소권한 정책: EB, ASG, RDS start, S3, CloudFront 무효화, +TF 관리 전 서비스). (대안: 신규 스코프 IAM 사용자/키.)
7. 비밀값을 **SSM SecureString/Secrets Manager**로 이관 + **dev/prod 분리된 신규 값** 생성.

### Phase 2 — 무중단 스테이트리스 스탠드업 (T-5일)
1. backend를 새 state 버킷으로 → `terraform init -reconfigure`(클린, 구 state 마이그레이션 금지).
2. `terraform apply` 스테이트리스: VPC, SG, ElastiCache(빈), EB(빈), CloudFront, 프론트 버킷(이름 충돌 시 리네임). EB 환경변수(=SSM)에서 외부 비밀 재주입.
3. **새 Route53 영역** 생성(TF) → NS 4개 캡처(`route53_name_servers`).
4. **ACM 인증서 발급**(ALB+CloudFront+보조 도메인). 검증은 새 영역이 권한 영역이 된 후 완료(컷오버 시 위임).
5. **새 첨부 버킷** 생성, 구 버킷 교차계정 read 부여, **ARCHIVE 객체 복원(3~5h)** 후 초기 `aws s3 sync`.
6. 컷오버 24~48h 전: 구 영역 레코드 TTL 60s로 하향.
7. CloudWatch **알람 추가**(RDS CPU/스토리지/메모리, EB 헬스, 스케줄러 Lambda 오류) — 현재 전무.

### Phase 3 — 데이터 이전 (컷오버 윈도우, 쓰기 동결)
1. 유지보수 모드 / 구 prod EB ASG → 0 (쓰기 중단). **구 infra-scheduler 비활성**(충돌 방지).
2. 첨부 버킷 **최종 델타 sync**.
3. 구 `kanban-prod-db` **최종 스냅샷** → CMK 재암호화 copy → 공유 → 새 계정 CMK로 copy → restore → `terraform import`.
4. `engine_version=15.10` 고정 + `auto_minor_version_upgrade=false`. **행수/체크섬 검증**.
5. (선택) `db_password` 로테이션 후 SSM·EB 동시 갱신.
6. 새 EB를 복원 DB + 새 Redis + 새 첨부 버킷으로 지정 → 백엔드 배포 → **`jwt_secret` 로테이션**(1회 전체 로그아웃) → `api.` `/actuator/health`(포트 5000) 워밍 체크.
7. Redis 데이터 이관 금지(신규 빈 클러스터).

### Phase 4 — DNS 컷오버 & 프론트 배포
1. 레지스트라에서 `bridgespots.com` NS를 새 영역 NS로 재위임. apex/`www`/`api.` 해석 확인.
2. 프론트 CI 배포(새 `kanban-*-frontend`) + CloudFront `/*` 무효화(**GitHub vars `DEV/TESTPROD_CLOUDFRONT_DISTRIBUTION_ID` 선갱신**).
3. ACM 검증 완료(인증서 ISSUED) + EB HTTPS 리스너·보조 인증서 부착 확인.

### Phase 5 — 컷오버 후 검증
1. GitHub Secrets/Variables 갱신: OIDC 역할 ARN(또는 신규 키), `DEV/PROD_API_URL`, `DEV/TESTPROD_CLOUDFRONT_DISTRIBUTION_ID`, `DEV_CLOUDFRONT_ATTACHMENTS_DOMAIN`, EB 앱/환경명(리네임 시), RDS id(`deploy-dev.yml` 웨이크업), `DOMAIN_NAME`, 로테이션된 앱 비밀, `EC2_INSTANCE_ID`/`RDS_INSTANCE_ID`(CloudWatch 차원).
2. **E2E 스모크**: OAuth 로그인(새 JWT), 파일 업/다운(새 버킷·CloudFront), WebSocket/STOMP 보드 동기화(새 Redis), FCM 푸시(기존 토큰·동일 Firebase), Polar/Toss 웹훅 수신, **웹훅 IP 화이트리스트가 구 egress에 묶이지 않았는지** 확인.
3. CloudWatch 로그/커스텀 메트릭/모니터링 Slack 웹훅 동작 + 신규 알람 확인.
4. **비용 할당 태그 활성화**(빌링 콘솔, 계정별 수동).
5. infra-scheduler 동작 확인 + **prod RDS 야간 정지 적용 여부 명시 결정**.

### Phase 6 — 구 계정 폐기 (1~2주 안정화 후)
1. 검증 완료까지 구 계정 read-only 유지(DB 무손상, deletion_protection on, 첨부 공유 read-only, 구 영역 NS 잔여 트래픽).
2. `deletion_protection=false` → 최종 스냅샷 보관 후 구 DB 삭제. 구 첨부/프론트 버킷·CloudFront·영역·EB·state 버킷/잠금 삭제(전역 이름 회수).
3. **구 계정 CI IAM 키·임시 부트스트랩 admin 폐기**, 잔존 공유 비밀 로테이션.
4. 디스크 잔여 산출물(`deploy.zip`, `application.jar`)·죽은 Dockerfile 경로 정리, 구 계정 `.env`/`.env.local`/`tfvars` 잔존 제거.

---

## 6. 개선 권고 (이전을 기회로)

| 영역 | 현재 | 개선안 | 효과 |
|------|------|--------|------|
| **CI 인증** | 정적 IAM 키 | **GitHub OIDC + 스코프 역할** | 장수명 키 제거(최대 보안 개선) |
| **비밀 관리** | 평문 tfvars/EB env, dev·prod 동일 | **SSM SecureString/Secrets Manager**, dev/prod 분리, 로테이션 | 노출 차단·감사성 |
| **State** | 수동 부트스트랩, prod 로컬 의심 | TF state 부트스트랩 모듈화 + 양 환경 원격 backend | state 유실 방지 |
| **DB 복원력** | 단일 AZ db.t4g.micro | **Multi-AZ**, `copy_tags_to_snapshot`, Performance Insights | 가용성/관측성 |
| **네트워크** | public subnet + NAT 없음 | **NAT + private subnet** + S3/CloudWatch/SSM **VPC 엔드포인트** | 노출 축소·egress 비용 절감 |
| **Redis** | 1노드 | `num_cache_clusters>1` 자동 failover | 캐시 SPOF 제거 |
| **암호화** | 기본 `aws/rds`·`aws/s3` 키 | **고객 관리 CMK**(처음부터) | 교차계정·키 정책 통제 |
| **관측성** | 알람/대시보드 전무 | RDS/EB/Lambda **CloudWatch 알람** + 대시보드 | 장애 조기 감지 |
| **리전 하드코딩** | Java 4곳 하드코딩 | `AWS_REGION` 프로퍼티화 | 향후 리전 이동 용이 |
| **이미지/문서** | 산출물·문서에 구 계정 잔존 | 정리 + 문서 계정ID/엔드포인트 갱신 | 혼선 방지 |

---

## 7. 위험 등록부 (Risk Register)

| # | 위험 | 심각도 | 완화책 |
|---|------|:------:|--------|
| R1 | prod RDS 데이터 손실/복원 불가(단일 AZ, 비공유 기본 KMS, prod state 로컬 의심) | **High** | CMK 재암호화 경로, 행수/체크섬 검증, 검증 전 구 인스턴스 보존, prod state 우선 확보 |
| R2 | "prod=Aurora" 잘못된 전제로 마이그레이션 경로 오설계 + 스케줄러 야간 정지 | **High** | `aws_db_instance` 스냅샷/복원 사용, prod 스케줄러 적용 여부 결정, 버전 고정 |
| R3 | CI 정적 키 단일 인증·최소권한 미문서화, 구 키 유효 잔존 | **High** | OIDC+스코프 역할, plan/dispatch로 정책 검증, Phase 6 키 폐기 |
| R4 | 레지스트라 NS TTL(48h) 미하향 + 새 영역 비권한 상태에서 ACM 검증 → EB/CF apply 블록 | **Medium** | 48h 전 TTL 60s, 양 영역 병행, 순서 엄수(영역→위임→ACM→apply) |
| R5 | 전역 유일 S3 이름 충돌(`bridge-kanban-attachments`, `kanban-*-frontend`, state) | **Medium** | 새 이름, env/data 소스/워크플로우/코드 절대 URL 갱신, Phase 6에서 구 이름 회수 |
| R6 | 새 계정 쿼터/플랫폼 버전 미가용으로 standup 중단 | **Medium** | 10일+ 전 쿼터 신청, 리전 가용성 사전 확인, 대체 EB 플랫폼 문자열 준비 |
| R7 | 평문·동일 비밀 + 라이브 `.env` 그대로 운반 → 누출 전파 | **Medium** | 컷오버 시 로테이션·분리, SSM 이관, 구 파일 운반 금지, 추적 중 Firebase/Toss 키 로테이션 |
| R8 | 새 EB egress IP 변경으로 웹훅(Polar/Toss/Slack)·OAuth가 구 IP 신뢰에 막힘 | **Medium** | 도메인 유지여도 각 콘솔 화이트리스트 재검증, IP 화이트리스트면 NAT+고정 EIP 등록 |
| R9 | 전 리소스 단일 AZ/SPOF가 무비판적으로 새 계정에 그대로 이식 | **Low** | Multi-AZ/NAT/엔드포인트 적용 또는 "의도된 비용 절감"으로 명시 문서화 |

---

## 부록 A. 변경 대상 환경변수 (백엔드)

**반드시 변경 (계정 결합)**: `DATABASE_URL`, `DB_USERNAME`, `DB_PASSWORD`, `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, `S3_BUCKET`(전역 유일), `CLOUDFRONT_DOMAIN`, `EC2_INSTANCE_ID`, `RDS_INSTANCE_ID`, (리전 변경 시) `S3Config/CloudWatchConfig`의 하드코딩 리전.
**그대로 유지 (도메인 유지 시)**: `JWT_SECRET`(로테이션 권장), `GOOGLE_CLIENT_ID/SECRET`, `MAIL_*`, `CLAUDE/OPENAI_*`, `POLAR_*`, `DISCORD_*`, `SLACK_*`, `FIREBASE_CREDENTIALS_JSON`, `FRONTEND_URL`(도메인 변경 시 갱신), `*_REDIRECT_URI`(도메인 변경 시 갱신).

## 부록 B. 갱신 대상 GitHub Secrets/Variables

- **Secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`(또는 OIDC 역할 ARN), + 로테이션된 앱 비밀(`DB_PASSWORD`, `JWT_SECRET`, `CLAUDE/OPENAI/MAIL/GOOGLE/POLAR/DISCORD/SLACK/FIREBASE/SENTRY/Toss/Android`).
- **Variables**: `DEV_API_URL`, `PROD_API_URL`, `DEV_CLOUDFRONT_DISTRIBUTION_ID`, `TESTPROD_CLOUDFRONT_DISTRIBUTION_ID`, `DEV_CLOUDFRONT_ATTACHMENTS_DOMAIN`, `DOMAIN_NAME`, (필요 시) `DEPLOY_DISCORD_WEBHOOK_URL`.
- **변경 불필요**: `ci.yml`(AWS 미사용), `deploy-mobile.yml`의 AWS 부분(없음) — 단 API URL/리다이렉트가 바뀌면 `PROD_API_URL` 갱신.

## 부록 C. 분석 산출물 추적성

본 문서는 다음 6개 영역 병렬 감사 + 완전성 비평(gap analysis)을 종합한 것이다: ① TF 환경 루트(dev/prod), ② TF 모듈 10종, ③ CI/CD 4종, ④ 백엔드 런타임 설정, ⑤ 레포 전역 계정결합/비밀 스캔, ⑥ 데이터·State 이전. 1차 확인 근거 파일: `environments/{dev,prod}/main.tf`, `modules/elastic-beanstalk/main.tf`, `modules/rds-simple/main.tf`, `modules/infra-scheduler/main.tf`, `.github/workflows/{deploy-dev,terraform}.yml`, `backend/src/main/resources/application.yml`, `backend/src/main/java/com/kanban/global/config/S3Config.java`, `backend/.ebextensions/*`.
