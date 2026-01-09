# 🏗️ AWS 인프라 및 배포 전략

## 아키텍처 개요

```
                                    ┌─────────────────────────────────────────────────────────┐
                                    │                        AWS Cloud                         │
                                    │                                                         │
    ┌──────────┐                    │  ┌─────────────────────────────────────────────────┐   │
    │  Users   │                    │  │                   VPC (10.0.0.0/16)              │   │
    └────┬─────┘                    │  │                                                  │   │
         │                          │  │  ┌─────────────────┐    ┌─────────────────┐     │   │
         ▼                          │  │  │ Public Subnet A │    │ Public Subnet B │     │   │
┌─────────────────┐                 │  │  │   10.0.1.0/24   │    │   10.0.2.0/24   │     │   │
│   CloudFront    │                 │  │  │                 │    │                 │     │   │
│      (CDN)      │                 │  │  │  ┌───────────┐  │    │  ┌───────────┐  │     │   │
└────────┬────────┘                 │  │  │  │    ALB    │◄─┼────┼──┤    ALB    │  │     │   │
         │                          │  │  │  └─────┬─────┘  │    │  └───────────┘  │     │   │
         ├──────────────────┐       │  │  └────────┼────────┘    └─────────────────┘     │   │
         ▼                  ▼       │  │           │                                      │   │
┌─────────────────┐  ┌──────────┐   │  │  ┌────────┼────────┐    ┌─────────────────┐     │   │
│    S3 Bucket    │  │   API    │   │  │  │ Private Subnet A│    │ Private Subnet B│     │   │
│   (Frontend)    │  │ Gateway  │   │  │  │   10.0.3.0/24   │    │   10.0.4.0/24   │     │   │
└─────────────────┘  └────┬─────┘   │  │  │                 │    │                 │     │   │
                          │         │  │  │  ┌───────────┐  │    │  ┌───────────┐  │     │   │
                          ▼         │  │  │  │ECS Fargate│  │    │  │ECS Fargate│  │     │   │
                   ┌──────────┐     │  │  │  │ (Backend) │  │    │  │ (Backend) │  │     │   │
                   │  Lambda  │     │  │  │  └─────┬─────┘  │    │  └───────────┘  │     │   │
                   │(Optional)│     │  │  └────────┼────────┘    └─────────────────┘     │   │
                   └──────────┘     │  │           │                                      │   │
                                    │  │           ▼                                      │   │
                                    │  │  ┌─────────────────┐    ┌─────────────────┐     │   │
                                    │  │  │   RDS (Aurora   │    │   ElastiCache   │     │   │
                                    │  │  │   PostgreSQL)   │    │    (Redis)      │     │   │
                                    │  │  └─────────────────┘    └─────────────────┘     │   │
                                    │  │                                                  │   │
                                    │  └──────────────────────────────────────────────────┘   │
                                    │                                                         │
                                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
                                    │  │   SES    │  │   SQS    │  │ Secrets  │              │
                                    │  │ (Email)  │  │ (Queue)  │  │ Manager  │              │
                                    │  └──────────┘  └──────────┘  └──────────┘              │
                                    └─────────────────────────────────────────────────────────┘
```

---

## 환경 구성

| 환경 | 용도 | 도메인 |
|------|------|--------|
| **Production** | 실 서비스 | kanban.app |
| **Staging** | QA/테스트 | staging.kanban.app |
| **Development** | 개발 테스트 | dev.kanban.app |

---

## AWS 서비스 구성

### 1. 네트워크
| 서비스 | 용도 | 설정 |
|--------|------|------|
| VPC | 격리된 네트워크 | 10.0.0.0/16 |
| Public Subnet | ALB, NAT Gateway | 2개 AZ |
| Private Subnet | ECS, RDS | 2개 AZ |
| NAT Gateway | Private → Internet | AZ당 1개 |

### 2. 컴퓨팅
| 서비스 | 용도 | 스펙 (Production) |
|--------|------|-------------------|
| ECS Fargate | Backend API | 0.5 vCPU, 1GB RAM × 2 |
| Lambda | 스케줄러 (구독 상태 전환) | 128MB |

### 3. 데이터베이스
| 서비스 | 용도 | 스펙 (Production) |
|--------|------|-------------------|
| Aurora PostgreSQL | 메인 DB | db.t4g.medium |
| ElastiCache Redis | 세션, 캐시 | cache.t4g.micro |

### 4. 스토리지 & CDN
| 서비스 | 용도 |
|--------|------|
| S3 | Frontend 정적 파일, 프로필 이미지 |
| CloudFront | CDN, HTTPS |

### 5. 기타
| 서비스 | 용도 |
|--------|------|
| ALB | 로드 밸런싱, HTTPS 종료 |
| Route 53 | DNS |
| ACM | SSL 인증서 |
| SES | 이메일 발송 (초대) |
| SQS | 비동기 작업 큐 |
| Secrets Manager | DB 비밀번호, API 키 |
| CloudWatch | 로그, 모니터링, 알람 |

---

## 예상 비용 (월간)

### Production 환경
| 서비스 | 예상 비용 |
|--------|----------|
| ECS Fargate (2 tasks) | ~$30 |
| Aurora PostgreSQL | ~$60 |
| ElastiCache Redis | ~$15 |
| ALB | ~$20 |
| CloudFront + S3 | ~$5 |
| NAT Gateway | ~$35 |
| Route 53 | ~$1 |
| 기타 (SES, SQS, Secrets) | ~$5 |
| **합계** | **~$170/월** |

### 비용 절감 옵션
- **Dev/Staging**: 단일 AZ, 더 작은 인스턴스 → ~$50/월
- **Reserved Instances**: Aurora, ElastiCache 1년 예약 시 30% 절감
- **NAT Gateway → NAT Instance**: $35 → $5 (소규모 트래픽 시)

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
│   │   ├── staging/
│   │   │   └── ...
│   │   └── prod/
│   │       └── ...
│   │
│   ├── modules/
│   │   ├── vpc/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   ├── ecs/
│   │   ├── rds/
│   │   ├── elasticache/
│   │   ├── s3-cloudfront/
│   │   ├── alb/
│   │   └── secrets/
│   │
│   └── shared/
│       ├── backend.tf        # S3 + DynamoDB for state
│       └── providers.tf
│
├── docker/
│   ├── backend/
│   │   └── Dockerfile
│   └── frontend/
│       └── Dockerfile
│
└── scripts/
    ├── deploy.sh
    └── destroy.sh
```

---

## CI/CD 파이프라인

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────▶│GitHub Action│────▶│    ECR      │────▶│ECS Fargate  │
│   Push      │     │   Build     │     │   Push      │     │   Deploy    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                                                            │
      │              ┌─────────────┐     ┌─────────────┐           │
      └─────────────▶│   S3 Sync   │────▶│ CloudFront  │◀──────────┘
        (Frontend)   │             │     │ Invalidate  │
                     └─────────────┘     └─────────────┘
```

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging, develop]

env:
  AWS_REGION: ap-northeast-2

jobs:
  # Backend 배포
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build & Push Docker
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/kanban-backend:$IMAGE_TAG ./backend
          docker push $ECR_REGISTRY/kanban-backend:$IMAGE_TAG
      
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster kanban-${{ github.ref_name }} \
            --service backend \
            --force-new-deployment

  # Frontend 배포
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install & Build
        working-directory: frontend
        run: |
          npm ci
          npm run build
      
      - name: Deploy to S3
        run: |
          aws s3 sync frontend/dist s3://kanban-frontend-${{ github.ref_name }} --delete
      
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DIST_ID }} \
            --paths "/*"
```

---

## 배포 전략

### Blue-Green 배포 (Backend)
```
1. 새 Task Definition 등록
2. 새 Task 시작 (Green)
3. Health Check 통과 확인
4. ALB Target Group 전환
5. 이전 Task 종료 (Blue)
```

ECS는 기본적으로 Rolling Update를 지원하며, `minimumHealthyPercent`와 `maximumPercent`로 제어:

```hcl
deployment_configuration {
  minimum_healthy_percent = 100
  maximum_percent         = 200
}
```

### Frontend 배포
```
1. npm run build
2. S3 Sync (--delete)
3. CloudFront Invalidation
```

---

## 스케일링 정책

### ECS Auto Scaling
```hcl
# CPU 70% 이상 시 스케일 아웃
resource "aws_appautoscaling_policy" "cpu" {
  name               = "cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### Aurora Auto Scaling
- Reader 인스턴스 자동 추가 (읽기 부하 분산)
- Production에서만 활성화

---

## 모니터링 및 알람

### CloudWatch Alarms
| 알람 | 조건 | 액션 |
|------|------|------|
| High CPU | ECS CPU > 80% (5분) | Slack 알림 |
| High Memory | ECS Memory > 80% (5분) | Slack 알림 |
| 5xx Errors | ALB 5xx > 10/분 | Slack + PagerDuty |
| DB Connections | RDS 연결 > 80% | Slack 알림 |
| DB Storage | RDS 스토리지 < 20% | Slack 알림 |

### 로그 관리
```
ECS Container → CloudWatch Logs → (선택) S3 아카이브
```

---

## 보안 설정

### Security Groups
```
┌─────────────┐
│     ALB     │ ← 0.0.0.0/0:443
└──────┬──────┘
       │ :3000
       ▼
┌─────────────┐
│ ECS Fargate │ ← ALB SG only
└──────┬──────┘
       │ :5432, :6379
       ▼
┌─────────────┐
│  RDS/Redis  │ ← ECS SG only
└─────────────┘
```

### IAM Roles
| Role | 용도 | 권한 |
|------|------|------|
| ECS Task Role | 애플리케이션 | S3, SES, SQS, Secrets Manager |
| ECS Execution Role | 컨테이너 시작 | ECR Pull, CloudWatch Logs |
| GitHub Actions Role | CI/CD | ECR, ECS, S3, CloudFront |

### Secrets 관리
```hcl
# Secrets Manager에 저장
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- PG_API_KEY (결제)
- OAUTH_CLIENT_SECRET
```

---

## 재해 복구

### 백업 전략
| 대상 | 주기 | 보존 기간 |
|------|------|----------|
| Aurora Snapshot | 자동 (1일) | 7일 |
| Aurora Snapshot | 수동 (주 1회) | 30일 |
| S3 (Frontend) | 버전 관리 | 30일 |

### RTO/RPO
| 환경 | RTO | RPO |
|------|-----|-----|
| Production | 1시간 | 1시간 |
| Staging | 4시간 | 24시간 |
| Development | 24시간 | 7일 |

---

## 빠른 시작 가이드

### 1. 사전 준비
```bash
# AWS CLI 설정
aws configure

# Terraform 설치
brew install terraform

# 상태 저장용 S3 버킷 생성
aws s3 mb s3://kanban-terraform-state
```

### 2. Terraform 초기화 및 배포
```bash
cd infrastructure/terraform/environments/dev

# 초기화
terraform init

# 계획 확인
terraform plan

# 배포
terraform apply
```

### 3. 배포 순서
```
1. VPC (네트워크)
2. Security Groups
3. RDS (DB)
4. ElastiCache (Redis)
5. Secrets Manager
6. ECR (컨테이너 레지스트리)
7. ECS Cluster + Service
8. ALB
9. S3 + CloudFront
10. Route 53 (DNS)
```