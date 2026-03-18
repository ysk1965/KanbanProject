# 도메인 연결 가이드 (듀얼 도메인)

이 문서는 Terraform을 사용하여 bridgespots.com + milkyway.pe.kr 듀얼 도메인을 AWS 인프라에 연결하는 전체 과정을 설명합니다.

## 현재 상태 (2026-03-16 확인)

| 도메인 | 용도 | Route53 | ACM (서울) | ACM (us-east-1) | CloudFront |
|--------|------|---------|-----------|----------------|------------|
| bridgespots.com | Dev 프론트엔드 | Z001600031MWAX7YIP2BO (6 records) | ISSUED | ISSUED | E3C9295UMI1LW7 |
| milkyway.pe.kr | Testprod 프론트엔드 | Z04362322QT3T525T8YCY (7 records) | ISSUED | ISSUED | E22U5C46YWKCL7 |

### CloudFront 매핑

- **bridgespots.com, www.bridgespots.com** → S3: kanban-dev-frontend
- **milkyway.pe.kr, www.milkyway.pe.kr** → S3: kanban-testprod-frontend
- ALB는 두 도메인 모두 SNI로 처리 (각각 별도 ACM 인증서)

## 📋 목차

1. [사전 준비사항](#사전-준비사항)
2. [Terraform 설정](#terraform-설정)
3. [인프라 배포](#인프라-배포)
4. [네임서버 변경](#네임서버-변경)
5. [DNS 전파 확인](#dns-전파-확인)
6. [GitHub Secrets 업데이트](#github-secrets-업데이트)
7. [세컨더리 도메인 추가](#세컨더리-도메인-추가)
8. [트러블슈팅](#트러블슈팅)

---

## 사전 준비사항

### 필수 도구

- [x] **Terraform** v1.5.0 이상
- [x] **AWS CLI** 설치 및 구성
- [x] **GitHub CLI** (선택사항)

### AWS 자격증명

```bash
# AWS 자격증명 확인
aws sts get-caller-identity

# 출력 예시:
# {
#     "UserId": "AIDACKCEVSQ6C2EXAMPLE",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/your-user"
# }
```

### 도메인 정보

- **Primary 도메인**: bridgespots.com (등록: Hostingkr)
- **Secondary 도메인**: milkyway.pe.kr (등록: 별도)
- **관리 권한**: 두 도메인 모두 네임서버 변경 가능
- Terraform `domain_name` = primary, `secondary_domain_name` = secondary

---

## Terraform 설정

### 1. 작업 디렉토리로 이동

```bash
cd ~/Documents/GitHub/KanbanProject/infrastructure/terraform/environments/prod
```

### 2. terraform.tfvars 파일 생성

```bash
cat > terraform.tfvars <<EOF
# AWS Configuration
aws_region   = "ap-northeast-2"
project_name = "kanban"
environment  = "prod"

# Domain Configuration
domain_name = "bridgespots.com"

# Database Configuration
db_password = "YOUR_SECURE_DB_PASSWORD_HERE"  # 변경 필요!

# JWT Secret (32자 이상)
jwt_secret = "YOUR_SECURE_JWT_SECRET_HERE"    # 변경 필요!
EOF
```

**⚠️ 중요**: `db_password`와 `jwt_secret`을 안전한 값으로 변경하세요!

### 3. 보안 강화 (선택사항)

민감 정보를 환경 변수로 관리:

```bash
export TF_VAR_db_password="your-secure-password"
export TF_VAR_jwt_secret="your-secure-jwt-secret"
```

---

## 인프라 배포

### Phase 1: Terraform 초기화

```bash
terraform init
```

출력 예시:
```
Initializing modules...
Initializing provider plugins...
Terraform has been successfully initialized!
```

### Phase 2: 실행 계획 확인

```bash
terraform plan -out=tfplan
```

예상 리소스:
- Route 53 Hosted Zone (bridgespots.com)
- ACM Certificate (*.bridgespots.com + bridgespots.com)
- CloudFront Distribution (커스텀 도메인 연결)
- Route 53 Records (A, AAAA 레코드)

### Phase 3: 인프라 배포

```bash
terraform apply tfplan
```

**예상 소요 시간**:
- Route 53 생성: ~30초
- ACM 인증서 생성: 즉시 (검증 대기 상태)
- CloudFront 배포: ~10-15분
- DNS 레코드 생성: ~30초

### Phase 4: Name Servers 확인

배포 완료 후 출력되는 네임서버를 메모합니다:

```bash
terraform output route53_name_servers
```

출력 예시:
```
[
  "ns-1234.awsdns-56.org",
  "ns-789.awsdns-01.com",
  "ns-2345.awsdns-67.net",
  "ns-890.awsdns-12.co.uk"
]
```

---

## 네임서버 변경

### Hostingkr에서 네임서버 변경

1. **Hostingkr 로그인**
   - URL: https://www.hostingkr.com
   - 로그인 후 "도메인 관리" 메뉴 선택

2. **bridgespots.com 선택**
   - 도메인 목록에서 bridgespots.com 클릭
   - "네임서버 관리" 또는 "DNS 관리" 선택

3. **AWS 네임서버 입력**

   Terraform output에서 확인한 4개의 네임서버를 입력:
   ```
   ns-1234.awsdns-56.org
   ns-789.awsdns-01.com
   ns-2345.awsdns-67.net
   ns-890.awsdns-12.co.uk
   ```

4. **저장 및 확인**
   - 변경사항 저장
   - 이메일로 확인 메일 수신 (업체에 따라 다름)

### 네임서버 변경 스크린샷 예시

네임서버 설정 화면은 대략 다음과 같습니다:

```
┌─────────────────────────────────────┐
│ 도메인: bridgespots.com             │
│─────────────────────────────────────│
│ 네임서버 1: ns-1234.awsdns-56.org   │
│ 네임서버 2: ns-789.awsdns-01.com    │
│ 네임서버 3: ns-2345.awsdns-67.net   │
│ 네임서버 4: ns-890.awsdns-12.co.uk  │
│─────────────────────────────────────│
│         [저장]        [취소]        │
└─────────────────────────────────────┘
```

---

## DNS 전파 확인

### 1. 네임서버 전파 확인

```bash
# 네임서버 조회
dig NS bridgespots.com +short

# 또는
nslookup -type=NS bridgespots.com
```

**예상 결과**:
AWS 네임서버가 나타나면 성공 (전파 시간: 최대 48시간, 보통 1-2시간)

### 2. 도메인 레코드 확인

```bash
# A 레코드 확인 (Frontend)
dig bridgespots.com +short
dig www.bridgespots.com +short

# A 레코드 확인 (Backend API)
dig api.bridgespots.com +short
```

**예상 결과**:
- `bridgespots.com` → CloudFront IP
- `www.bridgespots.com` → CloudFront IP
- `api.bridgespots.com` → ALB IP

### 3. SSL 인증서 확인

네임서버 전파 후, ACM 인증서가 자동으로 검증됩니다:

```bash
terraform output acm_certificate_arn
```

AWS Console에서 확인:
1. ACM Console (us-east-1 리전) 접속
2. 인증서 상태가 "발급됨"인지 확인

### 4. 웹 브라우저 테스트

```
https://bridgespots.com        → Frontend (React App)
https://www.bridgespots.com    → Frontend (Redirect)
https://api.bridgespots.com    → Backend API
```

---

## GitHub Secrets 업데이트

배포 성공 후 GitHub Repository의 Secrets를 업데이트합니다.

### 1. GitHub Repository Settings 접속

```
https://github.com/YOUR_USERNAME/KanbanProject/settings/secrets/actions
```

### 2. Production Environment Variables 추가/업데이트

| Secret Name | 값 | 설명 |
|-------------|-----|------|
| `PROD_FRONTEND_URL` | `https://bridgespots.com` | Frontend URL |
| `PROD_API_URL` | `https://api.bridgespots.com` | Backend API URL |
| `PROD_CLOUDFRONT_DISTRIBUTION_ID` | Terraform output 확인 | CloudFront 배포 ID |

### 3. Terraform Output에서 값 가져오기

```bash
# Frontend URL
terraform output frontend_url

# Backend API URL
terraform output backend_api_url

# CloudFront Distribution ID
terraform output frontend_cloudfront_distribution_id
```

### 4. GitHub CLI로 업데이트 (선택사항)

```bash
# GitHub CLI 설치 확인
gh --version

# Secrets 업데이트
gh secret set PROD_FRONTEND_URL --body "https://bridgespots.com"
gh secret set PROD_API_URL --body "https://api.bridgespots.com"
gh secret set PROD_CLOUDFRONT_DISTRIBUTION_ID --body "$(terraform output -raw frontend_cloudfront_distribution_id)"
```

---

## 트러블슈팅

### 1. Terraform Apply 실패

**증상**: ACM 인증서 검증 타임아웃

**원인**: 네임서버가 AWS로 변경되지 않아 DNS 검증 실패

**해결**:
```bash
# 네임서버 먼저 변경 후 재시도
terraform destroy -target=module.acm_certificate
terraform apply
```

### 2. DNS 전파가 안됨

**증상**: dig 명령어에서 기존 IP가 나옴

**원인**: DNS 캐시 또는 전파 지연

**해결**:
```bash
# DNS 캐시 플러시 (macOS)
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# DNS 캐시 플러시 (Windows)
ipconfig /flushdns

# 공용 DNS로 조회
dig @8.8.8.8 bridgespots.com
```

### 3. CloudFront 403 에러

**증상**: https://bridgespots.com 접속 시 403 Forbidden

**원인**: S3 버킷에 파일이 없거나 배포가 안됨

**해결**:
```bash
# GitHub Actions 워크플로우 확인
gh workflow list
gh run list --workflow=deploy-prod.yml

# 수동 배포 트리거
gh workflow run deploy-prod.yml
```

### 4. Backend API 연결 실패

**증상**: api.bridgespots.com CORS 에러

**원인**: Backend 환경변수 미설정

**해결**:
1. Elastic Beanstalk Console 접속
2. Configuration → Software → Environment properties
3. `FRONTEND_URL` = `https://bridgespots.com` 확인

---

## 배포 체크리스트

배포 완료 후 다음 항목을 확인하세요:

- [ ] Terraform apply 성공
- [ ] Route 53 네임서버 확인
- [ ] Hostingkr에서 네임서버 변경 완료
- [ ] DNS 전파 확인 (dig 명령어)
- [ ] ACM 인증서 "발급됨" 상태 확인
- [ ] https://bridgespots.com 접속 성공 (SSL 인증서 정상)
- [ ] https://www.bridgespots.com 접속 성공
- [ ] https://api.bridgespots.com 접속 성공
- [ ] GitHub Secrets 업데이트 완료
- [ ] Frontend CORS 정상 작동 확인
- [ ] Backend API 호출 정상 확인

---

## 추가 정보

### Terraform State 백업

```bash
# State 파일 백업
cp terraform.tfstate terraform.tfstate.backup.$(date +%Y%m%d_%H%M%S)

# S3 백엔드로 마이그레이션 (권장)
# main.tf의 backend "s3" 주석 해제 후:
terraform init -migrate-state
```

### 인프라 비용 예측

**실제 월 비용** (2026-03-16 확인): **사실상 $0/월** (Free Tier 내)
- Route 53 Hosted Zone: 2개 × $0.50 = $1.00/월
- ACM Certificate: 무료 (4개)
- CloudFront: Free Tier 내 (3개 distribution)
- RDS: db.t4g.micro Free Tier
- ElastiCache: cache.t4g.micro Free Tier
- EB (EC2 t3.small): Free Tier 범위 내
- 총 실제: ~$0/월 (트래픽 증가 시 변동)

### 도메인 갱신

bridgespots.com 도메인은 Hostingkr에서 계속 관리됩니다:
- 도메인 갱신은 Hostingkr에서 진행
- 네임서버 설정은 유지 (변경 불필요)
- AWS Route 53에서는 DNS 레코드만 관리

---

## 지원

문제가 발생하면 다음을 확인하세요:
- AWS Console → CloudWatch Logs
- Terraform 실행 로그
- GitHub Actions 워크플로우 로그

추가 지원이 필요하면 팀에 문의하세요.

---

## 세컨더리 도메인 추가

### milkyway.pe.kr 설정 (완료됨)

Terraform `secondary_domain_name` 변수로 세컨더리 도메인을 추가합니다.

```hcl
# terraform.tfvars
domain_name           = "bridgespots.com"
secondary_domain_name = "milkyway.pe.kr"
```

세컨더리 도메인 설정 시 자동으로 생성되는 리소스:
1. **Route53 Hosted Zone** — milkyway.pe.kr 전용
2. **ACM 인증서 (서울)** — ALB HTTPS 리스너에 추가
3. **ACM 인증서 (us-east-1)** — CloudFront에 연결
4. **CloudFront Distribution** — S3 testprod-frontend 버킷 연결
5. **ALB HTTPS 리스너 인증서** — SNI로 두 도메인 구분

### CloudFront SPA 라우팅

CloudFront Function이 Host 헤더로 도메인을 분기합니다:
- `bridgespots.com` → `index-bridgespots.html`
- `milkyway.pe.kr` → `index.html`

빌드 시 `vite.config.ts`의 `generateBrandedIndex()` 플러그인이 각 도메인용 HTML을 생성합니다.

### CORS 설정 확인

세컨더리 도메인 추가 시 3곳의 CORS 설정에 도메인을 추가해야 합니다:
1. `backend/.../SecurityConfig.java` (line ~103)
2. `backend/.../WebSocketConfig.java` (line ~52)
3. `backend/.../NoteCollabWebSocketConfig.java` (line ~29)

> 현재 bridgespots.com + milkyway.pe.kr 모두 설정되어 있습니다.
