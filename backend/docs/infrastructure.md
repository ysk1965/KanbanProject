# AWS 인프라 및 배포 전략

## 아키텍처 개요

```
                                    ┌─────────────────────────────────────────────────────────┐
                                    │                        AWS Cloud                         │
                                    │                                                         │
    ┌──────────┐                    │  ┌─────────────────────────────────────────────────┐   │
    │  Users   │                    │  │                   VPC                            │   │
    └────┬─────┘                    │  │                                                  │   │
         │                          │  │  ┌─────────────────┐    ┌─────────────────┐     │   │
         ▼                          │  │  │ Public Subnet A │    │ Public Subnet B │     │   │
┌─────────────────┐                 │  │  │                 │    │                 │     │   │
│   CloudFront    │                 │  │  │  ┌───────────┐  │    │  ┌───────────┐  │     │   │
│      (CDN)      │                 │  │  │  │    ALB    │◄─┼────┼──┤    ALB    │  │     │   │
└────────┬────────┘                 │  │  │  └─────┬─────┘  │    │  └───────────┘  │     │   │
         │                          │  │  └────────┼────────┘    └─────────────────┘     │   │
         ├──────────────────┐       │  │           │                                      │   │
         ▼                  ▼       │  │  ┌────────┼────────┐    ┌─────────────────┐     │   │
┌─────────────────┐  ┌──────────┐   │  │  │ Private Subnet A│    │ Private Subnet B│     │   │
│    S3 Bucket    │  │   ALB    │   │  │  │                 │    │                 │     │   │
│   (Frontend)    │  │          │   │  │  │  ┌───────────┐  │    │  ┌───────────┐  │     │   │
└─────────────────┘  └────┬─────┘   │  │  │  │  EB EC2   │  │    │  │  EB EC2   │  │     │   │
                          │         │  │  │  │ (Backend) │  │    │  │ (Backend) │  │     │   │
                          ▼         │  │  │  └─────┬─────┘  │    │  └───────────┘  │     │   │
                   ┌──────────┐     │  │  └────────┼────────┘    └─────────────────┘     │   │
                   │Elastic   │     │  │           │                                      │   │
                   │Beanstalk │     │  │           ▼                                      │   │
                   └──────────┘     │  │  ┌─────────────────┐    ┌─────────────────┐     │   │
                                    │  │  │   RDS (Aurora    │    │   ElastiCache   │     │   │
                                    │  │  │   PostgreSQL)   │    │    (Redis)      │     │   │
                                    │  │  └─────────────────┘    └─────────────────┘     │   │
                                    │  │                                                  │   │
                                    │  └──────────────────────────────────────────────────┘   │
                                    │                                                         │
                                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
                                    │  │   SES    │  │   ACM    │  │Route 53  │              │
                                    │  │ (Email)  │  │ (SSL)    │  │ (DNS)    │              │
                                    │  └──────────┘  └──────────┘  └──────────┘              │
                                    └─────────────────────────────────────────────────────────┘
```

---

## 환경 구성

| 환경 | 용도 | 배포 브랜치 |
|------|------|-------------|
| **Production** | 실 서비스 | `main` |
| **Development** | 개발 테스트 | `develop` |

---

## AWS 서비스 구성

### 1. 네트워크

| 서비스 | 용도 | 설정 |
|--------|------|------|
| VPC | 격리된 네트워크 | Dev: 10.0.0.0/16, Prod: 10.1.0.0/16 |
| Public Subnet | ALB, EB EC2 (dev) | 2개 AZ |
| Private Subnet | EB EC2 (prod), RDS, Redis | 2개 AZ |
| NAT Gateway | Private → Internet | Prod만 사용 (비용 절감) |

### 2. 컴퓨팅

| 서비스 | 용도 | 스펙 |
|--------|------|------|
| Elastic Beanstalk | Backend API (Spring Boot) | Dev: t3.small × 1-2, Prod: t3.small × 2-4 |
| ALB | 로드 밸런싱, HTTPS 종료 | EB 자동 생성 |

### 3. 데이터베이스

| 서비스 | Dev | Prod |
|--------|-----|------|
| RDS PostgreSQL | db.t4g.micro (Standard) | Aurora Serverless v2 (0.5-4 ACU, Multi-AZ) |
| ElastiCache Redis | 미사용 (Spring Simple Cache) | cache.t4g.micro |
| 백업 보존 | 1일 | 7일 |

### 4. 스토리지 & CDN

| 서비스 | 용도 |
|--------|------|
| S3 | Frontend 정적 파일 호스팅 (OAC 접근 제어) |
| CloudFront | CDN, HTTPS (Dev: PriceClass_100, Prod: PriceClass_All) |

### 5. 기타

| 서비스 | 용도 |
|--------|------|
| Route 53 | DNS (커스텀 도메인, 선택사항) |
| ACM | SSL 인증서 (ap-northeast-2 + us-east-1) |
| SES | 이메일 발송 (초대, Gmail SMTP) |
| CloudWatch | 로그 스트리밍, 30일 보관 |

---

## 예상 비용 (월간)

### Development 환경 (~$45-50/월)

| 서비스 | 예상 비용 |
|--------|----------|
| EC2 (t3.small × 1) | ~$15-20 |
| RDS (db.t4g.micro) | ~$10 |
| ALB | ~$10 |
| CloudFront + S3 | ~$5 |
| NAT Gateway | $0 (미사용) |
| ElastiCache | $0 (미사용) |
| **합계** | **~$45-50/월** |

### Production 환경 (~$150-200/월)

| 서비스 | 예상 비용 |
|--------|----------|
| EC2 (t3.small × 2-4) | ~$40-50 |
| Aurora Serverless v2 (2 instances) | ~$50-80 |
| ElastiCache Redis | ~$10 |
| NAT Gateway | ~$45 |
| ALB | ~$16 |
| CloudFront + S3 | ~$10-20 |
| **합계** | **~$150-200/월** |

### 비용 절감 옵션
- **Reserved Instances**: Aurora, EC2 1년 예약 시 30% 절감
- **NAT Instance**: NAT Gateway 대체 시 $45 → ~$5

---

## 폴더 구조

```
infrastructure/
├── terraform/
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   └── prod/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   │
│   ├── modules/
│   │   ├── vpc/               # VPC, Subnet, NAT, IGW
│   │   ├── security-groups/   # ALB, EC2, RDS, Redis SG
│   │   ├── rds/               # Aurora PostgreSQL (Prod)
│   │   ├── rds-simple/        # Standard PostgreSQL (Dev)
│   │   ├── elasticache/       # Redis
│   │   ├── elastic-beanstalk/ # EB App + Environment + ALB
│   │   ├── s3-cloudfront/     # Frontend 정적 호스팅
│   │   ├── route53/           # DNS
│   │   └── acm-certificate/   # SSL 인증서
│   │
│   └── shared/
│       └── backend.tf         # S3 + DynamoDB for state
│
└── backend/
    ├── Dockerfile             # Multi-stage 빌드
    ├── Procfile               # EB JVM 설정
    └── .ebextensions/         # EB 환경 설정
        ├── 01-env.config      # 환경변수, 배포 정책
        └── 02-healthcheck.config  # ALB 헬스체크, 오토스케일링
```

---

## CI/CD 파이프라인

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────▶│GitHub Action│────▶│  Gradle     │────▶│  Elastic    │
│   Push      │     │  CI/Build   │     │  bootJar    │     │ Beanstalk   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                                                            │
      │              ┌─────────────┐     ┌─────────────┐           │
      └─────────────▶│   S3 Sync   │────▶│ CloudFront  │           │
        (Frontend)   │             │     │ Invalidate  │           │
                     └─────────────┘     └─────────────┘           │

Workflows:
├── ci.yml          # PR/push → Backend Test + Frontend Build
├── deploy-dev.yml  # develop push → Dev 환경 배포
├── deploy-prod.yml # main push → CI → 승인 → Prod 환경 배포
└── terraform.yml   # TF 변경 시 Plan/Apply
```

### 배포 전략

**Development**
- develop 브랜치 push 시 자동 배포
- Backend: Gradle bootJar → EB 배포 (AllAtOnce)
- Frontend: Vite build → S3 Sync → CloudFront Invalidation (조건부)

**Production**
- main 브랜치 push 시 자동 배포
- CI 테스트 통과 필수 → GitHub Environment 승인 필요
- Backend: Gradle bootJar → EB 배포 (Rolling, 50% batch) → Health Check
- Frontend: Vite build → S3 Sync → CloudFront Invalidation

---

## 스케일링 정책

### Elastic Beanstalk Auto Scaling

| 환경 | Min | Max | 배포 방식 |
|------|-----|-----|----------|
| Dev | 1 | 2 | AllAtOnce |
| Prod | 2 | 4 | Rolling (50%) |

- Health-based rolling update
- Auto Scaling cooldown: 360초
- Managed platform update: 매주 일요일 09:00 (minor)

### Aurora Auto Scaling (Prod)
- Serverless v2: 0.5 ~ 4 ACU 자동 스케일링
- Multi-AZ: 2 인스턴스

---

## 보안 설정

### Security Groups

```
┌─────────────┐
│     ALB     │ ← 0.0.0.0/0:80,443
└──────┬──────┘
       │ :5000 (HTTP)
       ▼
┌─────────────┐
│   EB EC2    │ ← ALB SG only
└──────┬──────┘
       │ :5432, :6379
       ▼
┌─────────────┐
│  RDS/Redis  │ ← EC2 SG only
└─────────────┘
```

### 환경 변수 (Terraform → EB)

| 변수 | 설명 |
|------|------|
| `SPRING_PROFILES_ACTIVE` | dev / prod |
| `SERVER_PORT` | 5000 (EB ALB 연동) |
| `DATABASE_URL` | JDBC PostgreSQL URL |
| `DB_USERNAME` / `DB_PASSWORD` | DB 인증 |
| `REDIS_HOST` / `REDIS_PORT` | Redis 연결 (Prod만) |
| `JWT_SECRET` | JWT 서명 키 |
| `FRONTEND_URL` | CORS 허용 Origin |
| `CACHE_TYPE` | redis (Prod) / simple (Dev) |

### Secrets 관리
- Terraform 변수: `db_password`, `jwt_secret` (sensitive 표시)
- GitHub Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_CLIENT_ID`
- GitHub Variables: `DEV_API_URL`, `PROD_API_URL`, CloudFront Distribution ID 등

---

## 재해 복구

### 백업 전략

| 대상 | Dev | Prod |
|------|-----|------|
| RDS 자동 백업 | 1일 보존 | 7일 보존 |
| RDS 삭제 보호 | 비활성 | 활성 |
| Redis 스냅샷 | 없음 | 7일 보존 |
| S3 Frontend | CloudFront 캐시 | CloudFront 캐시 |

---

## 빠른 시작 가이드

### 1. 사전 준비

```bash
# AWS CLI 설정
aws configure

# Terraform 설치
brew install terraform

# 상태 저장용 S3 버킷 생성
aws s3api create-bucket --bucket kanban-terraform-state --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-bucket-versioning --bucket kanban-terraform-state \
  --versioning-configuration Status=Enabled

# DynamoDB 테이블 생성 (state locking)
aws dynamodb create-table --table-name kanban-terraform-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region ap-northeast-2
```

### 2. Terraform 초기화 및 배포

```bash
cd infrastructure/terraform/environments/dev

# 초기화
terraform init

# 계획 확인
terraform plan -var="db_password=YOUR_PASSWORD" -var="jwt_secret=YOUR_SECRET"

# 배포
terraform apply -var="db_password=YOUR_PASSWORD" -var="jwt_secret=YOUR_SECRET"
```

### 3. 배포 순서

```
1. VPC (네트워크)
2. Security Groups
3. RDS (DB)
4. ElastiCache (Prod만 - Redis)
5. ACM 인증서 (커스텀 도메인 사용 시)
6. Route 53 (커스텀 도메인 사용 시)
7. Elastic Beanstalk (ALB 포함)
8. S3 + CloudFront
9. DNS 레코드 (Frontend, API)
```
