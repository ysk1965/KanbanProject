# BRIDGE AWS 인프라 종합 분석 리포트

> **분석일**: 2026-03-16 | **분석 도구**: AWS CLI + Terraform 코드 + 코드베이스 교차 검증
> **AWS 계정**: 997286396624 (terraform_admin) | **리전**: ap-northeast-2 (Seoul)

---

## 1. 인프라 전체 아키텍처

```
                    ┌─────────────────────────────────────────────────┐
                    │              Route 53                          │
                    │  bridgespots.com  │  milkyway.pe.kr            │
                    └────────┬──────────┴──────────┬─────────────────┘
                             │                     │
                    ┌────────▼──────────┐ ┌────────▼──────────┐
                    │  CloudFront (Dev) │ │ CloudFront (Prod) │
                    │  E3C9295UMI1LW7   │ │ E22U5C46YWKCL7    │
                    └────────┬──────────┘ └────────┬──────────┘
                             │                     │
                    ┌────────▼──────────┐ ┌────────▼──────────┐
                    │ S3: kanban-dev-   │ │ S3: kanban-test   │
                    │     frontend      │ │     prod-frontend │
                    └───────────────────┘ └───────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │                  VPC: 10.0.0.0/16                    │
    │                                                      │
    │  ┌─ Public Subnet (2a) ──┐  ┌─ Public Subnet (2b) ─┐│
    │  │  ┌─────────────────┐  │  │                       ││
    │  │  │ ALB (HTTPS:443) │◄─┼──┼── API 요청            ││
    │  │  └────────┬────────┘  │  │                       ││
    │  │  ┌────────▼────────┐  │  │                       ││
    │  │  │ EB EC2 t3.small │  │  │                       ││
    │  │  │ Spring Boot     │  │  │                       ││
    │  │  │ (Corretto 21)   │  │  │                       ││
    │  │  └──┬──────────┬───┘  │  │                       ││
    │  └─────┼──────────┼──────┘  └───────────────────────┘│
    │  ┌─ Private Subnet (2a) ─┐  ┌─ Private Subnet (2b) ─┐│
    │  │  ┌──▼───────┐         │  │                       ││
    │  │  │ RDS PG   │         │  │                       ││
    │  │  │ t4g.micro│         │  │                       ││
    │  │  └──────────┘         │  │                       ││
    │  │  ┌──▼───────┐         │  │                       ││
    │  │  │ Redis    │         │  │                       ││
    │  │  │ t4g.micro│         │  │                       ││
    │  │  └──────────┘         │  │                       ││
    │  └───────────────────────┘  └───────────────────────┘│
    └──────────────────────────────────────────────────────┘

    ┌───────────────────────┐
    │ S3: bridge-kanban-    │ ◄── CloudFront (E1F85VN1VYI67C)
    │     attachments       │     미디어 CDN (별칭 없음)
    └───────────────────────┘
```

---

## 2. 리소스 현황 (AWS CLI 실시간 조회)

### 2.1 Compute

| 리소스 | 상세 | 상태 |
|--------|------|------|
| EC2 (EB) | i-013fba46521f48bac, t3.small, kanban-dev-env | **Running** |
| Public IP | 52.78.206.139 | 할당됨 |
| EB Platform | Corretto 21 / Amazon Linux 2023 v4.10.0 | **Green** |
| Auto Scaling | 1~2 instances (현재 1) | 정상 |
| EB CNAME | kanban-dev-env.eba-wpms53pu.ap-northeast-2.elasticbeanstalk.com | 활성 |

### 2.2 Database & Cache

| 리소스 | 스펙 | 상태 |
|--------|------|------|
| RDS | PostgreSQL 15.10, db.t4g.micro, 20GB gp3, Single-AZ | **Available** |
| RDS Endpoint | kanban-dev-db.ch8qokiugwn4.ap-northeast-2.rds.amazonaws.com:5432 | 접속 가능 |
| ElastiCache | Redis, cache.t4g.micro, 단일 노드 | **Available** |
| Redis Endpoint | kanban-dev-redis-001.zqfxsb.0001.apn2.cache.amazonaws.com:6379 | 접속 가능 |

### 2.3 Storage (S3 5개)

| 버킷 | 생성일 | 용도 |
|-------|--------|------|
| kanban-dev-frontend | 2026-02-02 | Dev 프론트엔드 정적 호스팅 |
| kanban-testprod-frontend | 2026-02-09 | Prod 프론트엔드 정적 호스팅 |
| bridge-kanban-attachments | 2026-03-03 | 첨부파일/사진/아이콘 미디어 |
| kanban-terraform-state | 2026-02-02 | Terraform 상태 관리 |
| elasticbeanstalk-ap-northeast-2-997286396624 | 2026-02-02 | EB 배포 아티팩트 |

### 2.4 CDN (CloudFront 3개)

| Distribution ID | 도메인 | Origin | 상태 |
|-----------------|--------|--------|------|
| E3C9295UMI1LW7 | bridgespots.com, www.bridgespots.com | kanban-dev-frontend.s3 | Deployed |
| E22U5C46YWKCL7 | milkyway.pe.kr, www.milkyway.pe.kr | kanban-testprod-frontend.s3 | Deployed |
| E1F85VN1VYI67C | dr1rrmcqa2s6y.cloudfront.net (별칭 없음) | bridge-kanban-attachments.s3 | Deployed |

### 2.5 Networking

| 리소스 | 상세 |
|--------|------|
| VPC | kanban-dev-vpc (10.0.0.0/16) + default VPC (172.31.0.0/16) |
| Public Subnets | kanban-dev-public-1 (10.0.0.0/24, ap-northeast-2a), kanban-dev-public-2 (10.0.1.0/24, 2b) |
| Private Subnets | kanban-dev-private-1 (10.0.10.0/24, 2a), kanban-dev-private-2 (10.0.11.0/24, 2b) |
| NAT Gateway | **없음** (비용 절감, ~$36/월 절약) |
| ALB | awseb--AWSEB-u9veL9KbEOku, internet-facing, active |
| Target Group | Port 5000, HTTP, instance type |
| Elastic IP | 2개 (13.124.160.127, 3.39.144.166) — ALB/EB 자동 할당 |
| Security Groups | 8개 (ALB, EB-EC2, RDS, Redis, EB 자동생성 등) |

### 2.6 DNS & SSL

| 리소스 | 상세 |
|--------|------|
| Route53 | bridgespots.com (6 records), milkyway.pe.kr (7 records) |
| ACM (ap-northeast-2) | bridgespots.com (ISSUED), milkyway.pe.kr (ISSUED) — ALB용 |
| ACM (us-east-1) | bridgespots.com (ISSUED), milkyway.pe.kr (ISSUED) — CloudFront용 |

### 2.7 IAM Roles

| Role | 용도 |
|------|------|
| kanban-dev-eb-ec2-role | EB EC2 인스턴스 역할 (S3, CloudWatch, SES 등) |
| kanban-dev-eb-service-role | EB 서비스 역할 (Auto Scaling, Health Check 등) |

### 2.8 Monitoring

| CloudWatch Alarm | State | Metric |
|-----------------|-------|--------|
| AlarmHigh (NetworkOut) | OK | Auto Scaling 스케일업 트리거 |
| AlarmLow (NetworkOut) | ALARM | Auto Scaling 스케일다운 (정상 — 저트래픽) |

### 2.9 사용하지 않는 서비스

ECS, Lambda, ECR, NAT Gateway, SSM Parameter Store, SNS, SQS, WAF, Secrets Manager — 모두 **미사용**

---

## 3. 비용 분석

### 3.1 현재 비용: **사실상 $0/월**

| 월 | Blended Cost (USD) |
|----|-------------------|
| 2025년 12월 | $0.00 |
| 2026년 1월 | ~$0.00 |
| 2026년 2월 | ~$0.00 |
| 2026년 3월 (16일까지) | ~$0.00 |

### 3.2 비용 상세

| 서비스 | 비용 | 비고 |
|--------|------|------|
| EC2-Other | +$0.15 | EIP 또는 EBS 스냅샷 |
| Data Transfer | -$0.15 | 크레딧/프로모션으로 상쇄 |
| ELB | +$0.0006 | 최소 ALB 사용량 |
| RDS, S3, CloudFront, ElastiCache | $0.00 | Free Tier 내 |

### 3.3 Free Tier 사용률

| 서비스 | 사용량 | 한도 | 사용률 | 주의 |
|--------|--------|------|--------|------|
| CloudWatch Log Ingestion | 2.33 GB | 5 GB | **47%** | 월말 ~90% 예상 |
| CloudWatch Log Storage | 0.52 GB | 5 GB | 10% | |
| CloudWatch Alarms | 1 | 10 | 10% | |
| Savings Plans / RI | 없음 | - | - | 현 지출 수준에서 불필요 |

---

## 4. Terraform ↔ 실제 AWS 비교

### 4.1 일치 항목

- VPC, Subnets, Security Groups 구조
- RDS (rds-simple 모듈, db.t4g.micro, PostgreSQL 15.10)
- Elastic Beanstalk (t3.small, Corretto 21, 1~2 instances)
- S3 + CloudFront 프론트엔드 호스팅 (dev + testprod)
- ACM 인증서 (서울 + us-east-1, 2개 도메인)
- Route53 호스팅 존 (bridgespots.com, milkyway.pe.kr)
- ALB 설정 (HTTPS, sticky session, health check /actuator/health)

### 4.2 불일치 항목

| 항목 | Terraform 코드 | 실제 AWS | 위험 |
|------|---------------|----------|------|
| **ElastiCache** | dev/main.tf에서 **주석 처리** | **동작 중** (cache.t4g.micro) | `terraform plan` 시 삭제 시도 가능 |
| **Prod 환경** | 모듈 정의 완료 (prod/main.tf) | **미배포** | testprod는 dev 인프라 위에서 동작 |
| **Elastic IP 2개** | Terraform에 미정의 | 존재 (2개) | Terraform 외부 리소스 |
| **Attachments CF** | 인라인 정의 (별칭 없음) | 동작 중 (dr1rrmcqa2s6y.cloudfront.net) | 커스텀 도메인 미연결 |

---

## 5. 코드베이스 ↔ AWS 인프라 정합성

### 5.1 Backend 환경변수 매핑

| 환경변수 | Terraform 주입 | application.yml | AWS 실제 | 정합성 |
|----------|---------------|-----------------|----------|--------|
| `DATABASE_URL` | RDS JDBC URL | `${DATABASE_URL}` | kanban-dev-db.*.rds.amazonaws.com:5432 | **OK** |
| `DB_USERNAME` | `kanban_admin` | `${DB_USERNAME}` | - | **OK** |
| `DB_PASSWORD` | `var.db_password` | `${DB_PASSWORD}` | - | **OK** |
| `REDIS_HOST` | ElastiCache endpoint | `${REDIS_HOST}` | kanban-dev-redis-001.*.cache.amazonaws.com | **OK** |
| `REDIS_PORT` | `6379` | `${REDIS_PORT}` | 6379 | **OK** |
| `CACHE_TYPE` | 조건부 `redis`/`simple` | `${CACHE_TYPE}` | redis | **OK** |
| `WS_BROKER_TYPE` | **미주입** | `${WS_BROKER_TYPE}` | - | **주의** |
| `FRONTEND_URL` | CF URL 또는 도메인 | `${FRONTEND_URL}` | bridgespots.com | **OK** |
| `S3_BUCKET` | `bridge-kanban-attachments` | `${S3_BUCKET}` | bridge-kanban-attachments | **OK** |
| `CLOUDFRONT_DOMAIN` | Attachments CF 도메인 | `${CLOUDFRONT_DOMAIN}` | dr1rrmcqa2s6y.cloudfront.net | **OK** |
| `SERVER_PORT` | `5000` | `${SERVER_PORT:5000}` | ALB→5000 | **OK** |
| `JWT_SECRET` | `var.jwt_secret` | `${JWT_SECRET}` | - | **OK** |

### 5.2 Frontend 환경변수

| FE 변수 | CI/CD 소스 | 정합성 |
|---------|-----------|--------|
| `VITE_API_BASE_URL` | deploy-dev.yml `DEV_API_URL` | **OK** |
| `VITE_CLOUDFRONT_DOMAIN` | deploy-dev.yml `DEV_CLOUDFRONT_ATTACHMENTS_DOMAIN` | **OK** |
| `VITE_GOOGLE_CLIENT_ID` | GitHub Secrets | **OK** |
| `VITE_FIREBASE_*` (7개) | GitHub Secrets | **OK** |
| `VITE_SENTRY_*` (3개) | GitHub Secrets | **OK** |

### 5.3 CORS Origins

Backend 코드 (SecurityConfig, WebSocketConfig, NoteCollabWebSocketConfig):
```
https://bridgespots.com, https://www.bridgespots.com
https://milkyway.pe.kr, https://www.milkyway.pe.kr
http://localhost:5173, http://localhost:5174, http://localhost:3000
capacitor://localhost, http://localhost, https://localhost
```
→ 실제 CloudFront 도메인과 **일치**

### 5.4 Health Check

| 체크 포인트 | 설정값 | 정합성 |
|-------------|--------|--------|
| EB Health Check | `/actuator/health` (Terraform) | **OK** — actuator 노출 설정됨 |
| ALB Target | Port 5000, HTTP | **OK** — SERVER_PORT=5000 |

### 5.5 CI/CD ↔ AWS

| 파이프라인 단계 | AWS 리소스 | 정합성 |
|---------------|-----------|--------|
| Backend → EB `kanban-dev` | EB 앱/환경 존재 | **OK** |
| Frontend → S3 `kanban-dev-frontend` + CF invalidation | S3 + CF E3C9295 | **OK** |
| Testprod → S3 `kanban-testprod-frontend` + CF invalidation | S3 + CF E22U5C4 | **OK** |
| Terraform state → S3 `kanban-terraform-state` | S3 존재 | **OK** |

---

## 6. 발견된 이슈 (심각도별)

### 🔴 Critical (즉시 조치 필요)

| # | 이슈 | 상세 | 조치 방안 |
|---|------|------|----------|
| C1 | **ElastiCache Terraform Drift** | dev/main.tf에서 ElastiCache 주석 처리됨, AWS에서는 동작 중 | 주석 해제하거나 `terraform import` |
| C2 | **Slack/Discord Redirect URI** | 기본값 `http://localhost:8080/...`. Terraform에서 var로 주입하지만 실제 EB 환경변수 확인 필요 | EB Console에서 실제 값 확인 |

### 🟠 High (개선 권장)

| # | 이슈 | 상세 |
|---|------|------|
| H1 | **CORS Origins 3중 복제** | SecurityConfig, WebSocketConfig, NoteCollabWebSocketConfig에 동일 목록 하드코딩 |
| H2 | **WS_BROKER_TYPE 미주입** | Terraform EB 모듈에서 미주입. Redis 있어도 SimpleBroker로 동작 가능 |
| H3 | **16개 민감 변수 평문** | DB 비밀번호, JWT, API 키 등이 EB 환경변수에 평문 저장. Secrets Manager 미사용 |
| H4 | **WAF 미적용** | ALB에 WAF 없음. SQL Injection, XSS, DDoS 방어 부재 |
| H5 | **DailyStandupScheduler 매분** | 매초/매분 체크하여 리소스 비효율 |

### 🟡 Medium (운영 시 고려)

| # | 이슈 | 상세 |
|---|------|------|
| M1 | **Prod 환경 미배포** | Terraform prod 코드 완성, apply 안 됨. testprod는 dev 위에서 동작 |
| M2 | **Attachments CDN 별칭 없음** | 커스텀 도메인 없이 CloudFront 기본 도메인 사용 |
| M3 | **Single-AZ** | RDS, Redis 모두 단일 AZ. 장애 시 전체 다운 |
| M4 | **CloudWatch Log 47%** | 월말 90% 예상. 초과 시 $0.50/GB 과금 |
| M5 | **EIP Terraform 미관리** | 2개 EIP가 Terraform state에 없음 |
| M6 | **SMTP 하드코딩** | smtp.gmail.com:587 하드코딩 |

### 🟢 Low (참고)

| # | 이슈 | 상세 |
|---|------|------|
| L1 | Redis 전송 암호화 비활성화 | VPC 내부이므로 수용 가능 |
| L2 | Cache TTL 하드코딩 | Java 코드에 5분/30분 TTL |
| L3 | Circuit Breaker 없음 | 외부 API (Polar, Discord, Slack, OpenAI) |
| L4 | index.html canonical URL 불일치 | milkyway.pe.kr vs bridgespots.com (의도된 듀얼 브랜드) |

---

## 7. 종합 정합성 판정

### 점수: **85/100 — 양호 (Good)**

| 영역 | 점수 | 판정 |
|------|------|------|
| Terraform ↔ AWS | 80/100 | ElastiCache drift |
| Backend ↔ AWS | 90/100 | 환경변수 매핑 양호 |
| Frontend ↔ AWS | 95/100 | 거의 완벽 |
| CI/CD ↔ AWS | 95/100 | 파이프라인 정상 |
| 보안 | 70/100 | WAF/Secrets 미비 |
| 비용 최적화 | 98/100 | Free Tier 극대화 |
| 운영 안정성 | 75/100 | Single-AZ, 모니터링 미비 |

### 잘 되고 있는 것

1. 환경변수 기반 설정 체계 — Terraform → EB → Spring Boot 매핑 정확
2. 프론트엔드 빌드 시 환경변수 주입이 CI/CD에서 올바르게 처리
3. S3/CloudFront CDN과 코드의 `resolveFileUrl()` 로직 정확히 맞물림
4. CORS 설정 ↔ 실제 도메인 일치
5. 비용 최적화 극대화 (월 $0)
6. Terraform 모듈화 깔끔, prod 업그레이드 경로 준비됨 (Aurora Serverless v2, Multi-AZ)
7. Multi-domain SPA 라우팅 (CloudFront Function Host 기반 분기)
8. ALB sticky session + WebSocket 연동 정상

### 즉시 조치 필요

1. **ElastiCache Terraform 주석 해제** (drift 해결)
2. **WS_BROKER_TYPE=redis** Terraform EB 모듈에 추가
3. Slack/Discord redirect URI 프로덕션 설정 확인

---

## 8. Terraform 모듈 구성

| 모듈 | 위치 | 관리 리소스 |
|------|------|-----------|
| vpc | modules/vpc/ | VPC, IGW, Subnets (2 public + 2 private), Route Tables, NAT GW (optional) |
| security-groups | modules/security-groups/ | ALB SG, EB EC2 SG, RDS SG, Redis SG |
| rds-simple | modules/rds-simple/ | PostgreSQL 15.10 (db.t4g.micro, Free Tier) |
| rds | modules/rds/ | Aurora Serverless v2 (Phase 2용, 미사용) |
| elasticache | modules/elasticache/ | Redis 7.0 Replication Group |
| elastic-beanstalk | modules/elastic-beanstalk/ | EB Application, Environment, IAM Roles, 50+ 환경변수 |
| acm-certificate | modules/acm-certificate/ | SSL/TLS 인증서 (DNS validation) |
| route53 | modules/route53/ | Hosted Zone |
| s3-cloudfront | modules/s3-cloudfront/ | Frontend S3 + CloudFront + OAC + SPA Router Function |

### 환경별 차이

| 설정 | Dev | Prod (계획) |
|------|-----|------------|
| RDS | db.t4g.micro, Single-AZ, 1일 백업 | db.t4g.micro → Multi-AZ, 3일 백업 |
| ElastiCache | 단일 노드 (현재 주석 처리) | 단일 노드 → 2노드 Replica |
| EB Instances | 1~2, AllAtOnce 배포 | 1~2 → min 2, Rolling 배포 |
| NAT Gateway | 없음 | 없음 → 활성화 (EC2 private 이동) |
| CloudFront | PriceClass_100 | PriceClass_All |
| 삭제 보호 | 없음 | RDS deletion protection, final snapshot |

---

## 9. 보안 점검

### 양호

- RDS: VPC Private Subnet, SG로 EB EC2에서만 접근 (port 5432)
- Redis: VPC Private Subnet, SG로 EB EC2에서만 접근 (port 6379)
- S3: Public access block + OAC (CloudFront만 접근)
- HTTPS: ALB + CloudFront 모두 SSL (ACM 인증서)
- RDS 스토리지 암호화 활성화
- JWT 인증 + Rate Limiting Filter
- CORS credentials 허용, max-age 3600s
- HSTS max-age 31536000 (1년)
- Health details 숨김 (show-details: never)

### 개선 필요

| 항목 | 현재 | 권장 | 우선순위 |
|------|------|------|---------|
| WAF | 미사용 | ALB 앞에 WAF 추가 | High |
| Secrets Manager | 미사용 (EB 환경변수 평문) | 민감 정보 이전 | High |
| Redis 전송 암호화 | 비활성화 | VPC 내부 — 수용 가능 | Low |
| EC2 퍼블릭 서브넷 | EB EC2가 public subnet | Private + NAT 이동 | Medium |
| CloudWatch Agent | 미설치 | 메모리/디스크 메트릭 수집 | Medium |

---

## 10. 스케일링 계획 (Phase 2 업그레이드 경로)

Terraform 코드에 이미 정의된 업그레이드 경로:

```
현재 (Dev Phase 1, ~$0/월)
├── RDS: db.t4g.micro, Single-AZ
├── Redis: cache.t4g.micro, 단일 노드
├── EB: t3.small, 1~2 instances, public subnet
└── NAT: 없음

↓ Phase 2 (Prod, ~$75-95/월)
├── RDS: Multi-AZ (multi_az=true), 3일 백업
├── Redis: 2노드 Replica (num_cache_clusters=2)
├── EB: min 2 instances, Rolling 배포
└── NAT: 활성화 (EC2 private 이동)

↓ Phase 3 (Scale, ~$200+/월)
├── RDS: Aurora Serverless v2 (0.5~2 ACU), 모듈 준비됨
├── Redis: cache.t4g.small, Multi-AZ failover
├── EB: t3.medium, 2~4 instances
└── WAF + Secrets Manager 도입
```

---

*이 리포트는 AWS CLI 실시간 조회 결과 + Terraform 코드 + Backend/Frontend 코드베이스 교차 검증을 기반으로 작성되었습니다.*
