# Runbook — milkyway CloudFront 통합 + 구 계정 정리

> **목표(확정, 2026-06-04):** bridgespots.com · milkyway.pe.kr 두 도메인 모두
> **CloudFront + Route53는 구성 그대로 두되**, *CloudFront는 신 계정(259151461692)에*,
> *Route53 hosted zone만 구 계정(997286396624)에* 둔다(= 문서화된 **Pattern A**).
> 그 외 모든 워크로드(EB·RDS·ALB·S3)는 신 계정. milkyway은 별도 버킷/배포 없이
> **bridgespots와 같은 단일 CloudFront**가 Host 기반 `spa_router`로 서빙한다.
>
> 작성 2026-06-04 · 대상 스택 `infrastructure/terraform/environments/dev` (= 실운영)

---

## 0. 현재 상태 vs 목표

| 구성요소 | 목표 | 현재 (라이브) | 작업 |
|---|---|---|---|
| Route53 `bridgespots.com` zone | 구 계정 | 구 계정 ✅ | 없음 |
| Route53 `milkyway.pe.kr` zone | 구 계정 | 구 계정 ✅ | 없음 |
| `bridgespots.com` 프론트 CF | 신 계정 | 신 `E3JHJCDEI33NCX` ✅ | 없음 (SAN 인증서로 교체만) |
| `milkyway.pe.kr` 프론트 CF | 신 계정 | **구 `E22U5C46YWKCL7`** ❌ | **신 CF로 통합 + 구 CF 폐기** |
| 프론트 S3 origin | 신 계정 | bridgespots=신 ✅ / milkyway=**구** ❌ | milkyway은 신 버킷으로 통합(이미 동일 콘텐츠 적재) |
| EB · RDS · ALB | 신 계정 | 신 ✅ (구에도 **잔존=누수**) | 구 계정 정리 |

**핵심 사실(라이브 확인):**
- 신 프론트 버킷 `kanban-dev-frontend-259151461692`에 `index.html`(milkyway용) + `index-bridgespots.html`이 **이미 함께 적재**돼 있음 → milkyway 전용 버킷 불필요.
- 신 CF `E3JHJCDEI33NCX`의 `spa_router` 함수가 Host로 분기: `bridgespots.com → /index-bridgespots.html`, 그 외(=milkyway) `→ /index.html`. 구 milkyway CF는 함수 없이 `index.html`을 root로 서빙 → **동작 동일**.
- 막는 것 단 하나: 신 CF의 us-east-1 인증서 `d86435b7`가 **bridgespots만** 커버 → 두 도메인 SAN 인증서 필요. 그리고 milkyway alias가 구 CF에 묶여 있음(CloudFront CNAME 전역 유일).

---

## 1. IaC 변경분 (이미 코드에 반영됨 — `infra/aws-account-migration` 브랜치, 미적용)

`terraform validate` 통과. **아직 apply 안 함.**

| 파일 | 변경 | 효과 |
|---|---|---|
| `environments/dev/main.tf` · `module.acm_certificate` | SAN에 `milkyway.pe.kr`, `*.milkyway.pe.kr` 추가 | us-east-1 CloudFront 인증서가 두 도메인 커버 (재발급) |
| `environments/dev/main.tf` · `module.s3_cloudfront` | `domain_aliases`에 milkyway 2개 추가 | 단일 CF가 두 도메인 alias 보유 |
| `environments/dev/main.tf` · `cert_validation` | 검증 레코드 **zone별 라우팅**(`strcontains`) | milkyway 검증 CNAME은 milkyway zone, 나머지는 bridgespots zone |
| `environments/dev/main.tf` · 신규 `frontend_secondary_root/www` | milkyway A alias → 동일 CF | `allow_overwrite`로 apply 시 구 CF→신 CF 재포인팅 |
| `bootstrap/github-oidc/main.tf` · `FrontendBuckets` | ARN `kanban-*-frontend` → `kanban-*-frontend*` | gha-deploy의 실버킷(`…-259151461692`) S3 sync 권한 정상화 |
| `.github/workflows/deploy-dev.yml` | testprod S3 sync + testprod CF 무효화 스텝 제거 | milkyway은 dev 버킷+CF로 커버 → CI 단일화(레드 파이프라인 해소) |

---

## 2. 사전 조건 (apply 전 반드시)

> 프로파일: `new-account`=신(259151461692), `default`=구(997286396624). 전부 점검창 권장.

1. **SSM 시크릿 2종 시딩** (apply 클린 plan 선행):
   ```bash
   aws ssm put-parameter --profile new-account --region ap-northeast-2 --type SecureString \
     --name /kanban/dev/sentry_dsn --value '<live SENTRY_DSN>'
   aws ssm put-parameter --profile new-account --region ap-northeast-2 --type SecureString \
     --name /kanban/dev/google_client_secret --value '<live GOOGLE_CLIENT_SECRET>'
   # (현재 EB env 평문값을 그대로 사용. describe-configuration-settings로 키 확인, 값은 콘솔에서 복사)
   ```
2. **gha-deploy ARN 수정 반영** = `bootstrap/github-oidc` 재apply (신 계정, 로컬 state):
   ```bash
   terraform -chdir=infrastructure/terraform/bootstrap/github-oidc init -reconfigure
   AWS_PROFILE=new-account terraform -chdir=infrastructure/terraform/bootstrap/github-oidc apply
   ```
3. **manual apply 경로 확정.** `terraform.yml`은 main push 시 dev를 `apply -auto-approve` 자동 실행한다.
   따라서 **점검창에서 브랜치 기준 수동 apply → 검증 → main 머지(=no-op apply)** 순서로 진행한다.
   (또는 dev environment에 required reviewers 추가.)
4. 신 계정 프로파일이 구 계정 `kanban-route53-cross-account` role을 assume 가능한지 확인
   (`aws.dns` 프로바이더가 milkyway/ bridgespots zone에 레코드 기록).

---

## 3. 컷오버 (점검창, 순서 엄수)

> bridgespots는 전 과정 무중단. **milkyway만 수 분 깜빡임** 가능(CNAME 이양 + CF 배포).

### 3-1. 백업/스냅샷
```bash
# 구 milkyway CF 설정 저장 (롤백용)
aws cloudfront get-distribution-config --id E22U5C46YWKCL7 --profile default > /tmp/E22U5C_backup.json
# 구 Route53 milkyway 레코드 저장
aws route53 list-resource-record-sets --hosted-zone-id Z04362322QT3T525T8YCY --profile default > /tmp/milkyway_rrset_backup.json
```

### 3-2. 구 CF에서 milkyway alias 제거 (CNAME 해제)
CloudFront CNAME은 전역 유일 → 신 CF에 alias를 붙이려면 먼저 구 CF에서 떼야 한다.
콘솔: CloudFront → `E22U5C46YWKCL7` → General → Settings → Alternate domain names에서
`milkyway.pe.kr`, `www.milkyway.pe.kr` 제거 → 저장(배포 수 분).
> ⏱️ 이 시점부터 신 CF가 alias를 받기 전까지 milkyway 깜빡임 시작.

### 3-3. 신 계정 dev 스택 apply
```bash
terraform -chdir=infrastructure/terraform/environments/dev init -reconfigure
AWS_PROFILE=new-account terraform -chdir=infrastructure/terraform/environments/dev plan -out=tf.plan
#   기대 plan: SAN 인증서 신규 생성/검증, 신 CF에 milkyway alias 2개 추가 + 인증서 교체,
#   milkyway 검증 CNAME(milkyway zone) 추가, frontend_secondary_root/www 생성(=milkyway A를 신 CF로 재포인팅).
#   bridgespots 관련은 인증서 ARN 교체(in-place) 외 변화 없어야 함.
AWS_PROFILE=new-account terraform -chdir=infrastructure/terraform/environments/dev apply tf.plan
```
> 인증서 검증(DNS) 때문에 apply가 수 분 걸릴 수 있음(최대 45m 타임아웃). 정상.

### 3-4. 검증
```bash
# milkyway이 신 CF(d1ogwvsu09sa4i)로 해석되는지
dig +short milkyway.pe.kr ; dig +short www.milkyway.pe.kr
# HTTPS 200 + 유효 인증서(SAN에 milkyway 포함)
curl -sI https://milkyway.pe.kr | head -5
curl -sI https://www.milkyway.pe.kr | head -5
# bridgespots 정상 유지 확인
curl -sI https://bridgespots.com | head -5
# 신 CF alias 확인
aws cloudfront get-distribution-config --id E3JHJCDEI33NCX --profile new-account \
  --query 'DistributionConfig.{Aliases:Aliases.Items,Cert:ViewerCertificate.ACMCertificateArn}'
```
- milkyway 페이지가 정상 브랜드로 렌더되는지 브라우저 확인(spa_router → index.html).
- **실패 시 롤백:** 3-2를 역으로 — 구 CF에 milkyway alias 재추가 + Route53 milkyway A를 `d1lh3qblxyq39p`로 복구(`/tmp/*_backup.json` 참고). 신 CF는 alias만 빼면 됨.

---

## 4. 구 계정 정리 (검증 안정화 후, 별도 점검창)

> milkyway이 신 CF로 안정 서빙되고, 첨부 데이터 무결성 검증 끝난 뒤 진행. **읽기 검증 후 삭제.**

### 4-1. 프론트 (milkyway 통합 완료 후)
- 구 CF `E22U5C46YWKCL7` 비활성화 → 삭제 (Route53 미참조 확인 후)
- 구 CF `E3C9295UMI1LW7`, `E1F85VN1VYI67C` (alias 없는 잔재) 삭제
- 구 S3 `kanban-testprod-frontend`, `kanban-dev-frontend` 삭제 (신 버킷과 콘텐츠 대조 후)
- 구 us-east-1 인증서 `db347ab0`(milkyway, 구 계정) 삭제

### 4-2. 백엔드 (~$41/월 누수 제거)
```bash
# 첨부 데이터 무결성 먼저 (신 vs 구 객체 수/용량 대조)
aws s3 ls s3://bridge-kanban-attachments --recursive --summarize --profile default | tail -2
aws s3 ls s3://kanban-attachments-259151461692 --recursive --summarize --profile new-account | tail -2
```
- 검증 OK → 구 EB 환경 `kanban-dev-env` **terminate** (종속 ALB `awseb--AWSEB-u9veL9KbEOku` 자동 정리, ~$17/월↓)
- 구 RDS `kanban-dev-db` **최종 스냅샷 후 삭제** (~$15/월↓). 자동백업 중단.
- 구 첨부 버킷 `bridge-kanban-attachments`(~16GB): 신 계정 이관 검증 후 삭제 (검증 전 보존)
- VPC $9/월 출처 분해(`get-cost-and-usage` UsageType) 후 정리 — ALB/RDS 삭제로 자연 감소 가능

### 4-3. 보안 정리
- 구 계정 정적키 4개 비활성화→삭제: `terraform_admin`×2, `kanban-github-actions`×2 (last-used 확인 후)
- GitHub Secrets 미참조 정적 키 삭제: `gh secret delete AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- 신 계정 `terraform-bootstrap` 키 로테이션/비활성(부트스트랩 완료)
- GitHub var `TESTPROD_CLOUDFRONT_DISTRIBUTION_ID` 삭제(미사용), `DEV_*` secrets/vars 중복 정리

### 4-4. 유지 (의도된 Pattern A)
- 구 계정 Route53 zone 2개 + `kanban-route53-cross-account` role → **유지**
- 정리 후 구 계정 목표 비용 ≈ **$1–2/월** (Route53만)

---

## 5. 사후

- `docs/infra/aws-account-migration-plan.md` — Pattern A 정의 유지(CF=신/Route53=구) 확인, milkyway 통합 반영
- 메모리 `aws-account-migration-route53-pattern-a.md` 갱신: milkyway 단일 CF 통합 완료, CF ID 정정
- `docs/infra/infra-audit-2026-06-04.html` 의 milkyway/legacy 항목 상태 갱신
- bridgespots/milkyway 둘 다 신 CF 단일 distribution으로 서빙되는지 최종 확인

## 6. 영향 요약
- **다운타임:** bridgespots 0, milkyway 수 분(점검창).
- **비용:** 구 계정 $62 → ~$1–2/월 (−$41 누수 + 프론트 잔재 제거). 신 계정 변화 미미(CF는 이미 신 계정).
- **리소스 감소:** CloudFront 3개(구)·milkyway 전용 버킷·구 EB/RDS/ALB 제거. 프론트 distribution 1개로 단일화.
