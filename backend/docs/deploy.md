# CI/CD 파이프라인

## 워크플로우 개요

```
.github/workflows/
├── ci.yml          # PR/push 시 테스트 (Backend + Frontend)
├── deploy-dev.yml  # develop push → Dev 환경 자동 배포
├── deploy-prod.yml # main push → CI 테스트 → 승인 → Prod 환경 배포
└── terraform.yml   # Terraform 변경 시 Plan/Apply
```

## 동시 배포 방지

각 워크플로우는 브랜치 기반 concurrency group으로 중복 배포를 방지합니다.

---

## CI 워크플로우 (ci.yml)

**트리거**: PR 또는 push to `main`, `develop`

### Backend 테스트

```yaml
steps:
  - Setup JDK 21 (temurin, Gradle cache)
  - ./gradlew build test --no-daemon

services:
  - PostgreSQL 15-alpine (kanban_test)
  - Redis 7-alpine

env:
  SPRING_PROFILES_ACTIVE: dev
  DATABASE_URL: jdbc:postgresql://localhost:5432/kanban_test
  JWT_SECRET: test-jwt-secret-for-ci-minimum-32-characters
```

### Frontend 테스트

```yaml
steps:
  - Setup Node.js 20 (npm cache)
  - npm ci
  - npm run build  # Type check + Build

env:
  VITE_API_BASE_URL: http://localhost:8080/api/v1
```

---

## Dev 배포 (deploy-dev.yml)

**트리거**: push to `develop` 또는 수동 (workflow_dispatch)

### Backend → Elastic Beanstalk

```yaml
steps:
  1. Checkout
  2. Setup JDK 21
  3. ./gradlew bootJar --no-daemon
  4. Configure AWS credentials
  5. 배포 패키지 생성:
     - build/libs/*.jar → deploy/application.jar
     - Procfile + .ebextensions 복사
     - ZIP 압축
  6. EB 배포 (einaregilsson/beanstalk-deploy@v22)
     - Application: kanban-dev
     - Environment: kanban-dev-env
     - Recovery wait: 120초

env:
  EB_APPLICATION_NAME: kanban-dev
  EB_ENVIRONMENT_NAME: kanban-dev-env
```

### Frontend → S3 + CloudFront

```yaml
steps:
  1. Checkout
  2. Setup Node.js 20
  3. npm ci && npm run build
  4. S3 Sync:
     - Static assets: max-age=31536000,public
     - index.html: no-cache,no-store,must-revalidate
  5. CloudFront Invalidation (설정 시)

env:
  S3_BUCKET: kanban-dev-frontend
  VITE_API_BASE_URL: ${{ vars.DEV_API_URL }}
  VITE_GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
```

**특이사항**: Backend와 Frontend는 **독립적으로 병렬 배포**됩니다.

---

## Prod 배포 (deploy-prod.yml)

**트리거**: push to `main` 또는 수동 (workflow_dispatch)

### 배포 흐름

```
CI 테스트 통과 → Backend 배포 (승인 필요) → Health Check → Frontend 배포 (승인 필요)
```

### 1단계: CI 테스트

```yaml
test:
  uses: ./.github/workflows/ci.yml  # Backend + Frontend 테스트 재사용
```

### 2단계: Backend → Elastic Beanstalk

```yaml
environment: production  # GitHub Environment 수동 승인 필요

steps:
  1. CI 테스트 통과 후 실행
  2. Gradle bootJar → 배포 패키지 생성
  3. EB 배포 (kanban-prod / kanban-prod-env)
  4. Health Check: curl /actuator/health

env:
  EB_APPLICATION_NAME: kanban-prod
  EB_ENVIRONMENT_NAME: kanban-prod-env
```

### 3단계: Frontend → S3 + CloudFront

```yaml
needs: deploy-backend  # Backend 성공 후 실행

steps:
  1. npm ci && npm run build
  2. S3 Sync (immutable cache for assets)
  3. CloudFront Invalidation (필수)

env:
  S3_BUCKET: kanban-prod-frontend
  VITE_API_BASE_URL: ${{ vars.PROD_API_URL }}
```

---

## Terraform 워크플로우 (terraform.yml)

**트리거**:
- PR (terraform 파일 변경 시) → `terraform plan`
- main push (terraform 파일 변경 시) → `terraform apply`
- 수동: 환경(dev/prod) + 액션(plan/apply) 선택

```yaml
steps:
  - Setup Terraform 1.6.0
  - Configure AWS credentials
  - terraform init
  - terraform validate
  - terraform plan / apply

env:
  TF_VAR_db_password: ${{ secrets.DB_PASSWORD }}
  TF_VAR_jwt_secret: ${{ secrets.JWT_SECRET }}
```

---

## 환경별 차이점

| 항목 | Dev | Prod |
|------|-----|------|
| CI 테스트 | 스킵 | 필수 |
| 수동 승인 | 불필요 | GitHub Environment |
| 배포 방식 | AllAtOnce | Rolling (50%) |
| Health Check | 없음 | `/actuator/health` |
| CloudFront Invalidation | 조건부 | 필수 |
| Backend-Frontend 순서 | 병렬 | 순차 (Backend → Frontend) |

---

## 필요 Secrets & Variables

### GitHub Secrets

| Name | 용도 |
|------|------|
| `AWS_ACCESS_KEY_ID` | AWS 인증 |
| `AWS_SECRET_ACCESS_KEY` | AWS 인증 |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `DB_PASSWORD` | Terraform DB 패스워드 |
| `JWT_SECRET` | Terraform JWT 시크릿 |

### GitHub Variables

| Name | 용도 |
|------|------|
| `DEV_API_URL` | Dev API 엔드포인트 |
| `DEV_CLOUDFRONT_DISTRIBUTION_ID` | Dev CloudFront (선택) |
| `PROD_API_URL` | Prod API 엔드포인트 |
| `PROD_CLOUDFRONT_DISTRIBUTION_ID` | Prod CloudFront |
| `PROD_FRONTEND_URL` | Prod Frontend URL |

---

## EB 배포 설정

### Procfile (JVM 설정)

```
web: java -jar -Xmx768m -Xms512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m \
  -Dspring.profiles.active=$SPRING_PROFILES_ACTIVE -Dserver.port=5000 \
  application.jar
```

### .ebextensions/01-env.config

- Health Check: `/actuator/health`
- 배포 방식: Rolling (50% batch)
- CloudWatch 로그: 30일 보관

### .ebextensions/02-healthcheck.config

- ALB Health Check: `/actuator/health` (30초 간격, 200 응답)
- Enhanced Health Reporting
- Auto Scaling Cooldown: 360초
- Managed Updates: 매주 일요일 09:00 (minor)
