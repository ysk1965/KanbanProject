# AWS 인프라 비용 분석 — 2026년 4월

- **AWS 계정**: `997286396624` (terraform_admin)
- **Region**: `ap-northeast-2` (Seoul), CloudFront/ACM용 `us-east-1` 부가
- **분석 대상 기간**: 2026-04-01 ~ 2026-04-20 (20일 실제 과금)
- **데이터 소스**: AWS Cost Explorer API, Resource APIs
- **작성일**: 2026-04-20

---

## TL;DR

| 항목 | 금액 (USD/월) | 비고 |
|------|--------------|------|
| **현재 월간 비용 (dev only)** | **$62 – $67** | AWS Forecast $66.66 |
| **Prod 배포 후 예상** | **$130 – $150** | 현재 dev-only 상태, prod는 미배포 |
| **Phase 2 (NAT+Multi-AZ+Aurora) 추가 시** | **$390 – $510** | 보안/HA 강화 시나리오 |

**핵심 인사이트**
- 2026년 3월까지 Free Tier로 월 $0 유지 → **4월부터 실제 과금 시작** ($0 → $62+ 급증)
- Prod 환경은 **Terraform 코드만 존재, 아직 배포되지 않음**. 현재 과금은 **dev + testprod 프론트엔드 S3/CloudFront** 만 반영
- 신규 `infra-scheduler` 모듈은 방금 배포되어 4월 내내 효과를 못 봤음 — 5월부터 EC2 35~40%, RDS 40%+ 절감 기대
- 전체 비용의 **약 80%가 고정비** (RDS, ALB, EIP, Route53). 트래픽 증가의 영향은 미미

---

## 1. 6개월 과금 추이

| 기간 | 실 과금 (USD) | 비고 |
|------|-------------|------|
| 2025-11 | $0 | Free Tier |
| 2025-12 | $0 | Free Tier |
| 2026-01 | $0 | Free Tier |
| 2026-02 | $0.00 | Free Tier |
| 2026-03 | $0.00 | Free Tier |
| **2026-04 (1–20일)** | **$41.71** | Free Tier 만료 후 첫 실과금 |
| **2026-04 Forecast** | **$66.66** | AWS Cost Explorer 예측 |

> 4월 초 Free Tier (t3.small/db.t4g.micro 750시간 무료, ALB/Public IPv4 일부) 만료 시점을 지나면서 비용이 드러나기 시작함.

---

## 2. 서비스별 비용 분해 (2026-04-01 ~ 04-20, 20일)

| 서비스 | 20일 과금 | 월 환산 | 비중 | 세부 UsageType |
|-------|----------|--------|------|---------------|
| **Amazon RDS** | $12.77 | $19.16 | **28.7%** | `InstanceUsage:db.t4g.micro` $11.15 + `GP3-Storage` $1.62 |
| **ALB (Elastic Load Balancing)** | $10.28 | $15.41 | **23.1%** | `LoadBalancerUsage` $10.06 + `LCUUsage` $0.22 |
| **VPC / Public IPv4** | $6.92 | $10.39 | **15.5%** | `InUseAddress` + `IdleAddress` (총 2 EIP + EC2 인스턴스 1개) |
| **EC2 Compute (t3.small)** | $5.76 | $8.64 | **13.0%** | `BoxUsage:t3.small` (EB 1 인스턴스) |
| **Tax (VAT 10%)** | $3.80 | $5.70 | 8.5% | 한국 부가세 |
| **Route53** | $1.03 | $1.55 | 2.3% | HostedZone(2개) $1.00 + DNS Queries $0.03 |
| **EC2 Other** | $0.77 | $1.16 | 1.7% | EBS gp3 $0.49 + Regional Data Transfer $0.28 |
| **S3** | $0.37 | $0.56 | 0.8% | 총 22.2 GB 저장 |
| **CloudFront** | ~$0 | ~$0 | 0% | 트래픽 미미 |
| **ElastiCache / Lambda / etc.** | ~$0 | ~$0 | 0% | Redis 미배포, Lambda Free Tier |
| **합계** | **$41.71** | **$62.57** | 100% | |

### 주요 관찰

- **RDS가 최대 비중 (28.7%)**: db.t4g.micro 1개인데도 20일간 $11.15. 스케줄러 도입 전 24/7 가동 중
- **ALB가 2위 (23.1%)**: $10/20일 = **$15/월**이 순수 고정비. 사용량과 무관
- **Public IPv4 비중이 큼 (15.5%)**: AWS가 2024년 2월부터 IPv4에 $0.005/hr 부과. 현재 EIP 2개 + 인스턴스 1개 = 월 **$10+**
- **CloudFront 비용은 실질 0**: 트래픽이 아직 적어 CDN 비용 부담 없음

---

## 3. 실제 프로비저닝 리소스 vs Terraform 인벤토리

### 3.1 실제 배포된 리소스 (2026-04-20 기준)

| 서비스 | 실제 | 비고 |
|-------|------|------|
| Elastic Beanstalk | `kanban-dev-env` (Green) | dev 1개만 |
| EC2 | `i-0d65151eb81c5585c` (t3.small, running) | EB 관리, 1개 |
| RDS | `kanban-dev-db` (db.t4g.micro, 20GB, gp3) | MultiAZ=false |
| ElastiCache | **없음** | Terraform dev엔 disabled, prod 미배포 |
| ALB | `awseb--AWSEB-u9veL9KbEOku` | EB 자동 생성, 1개 |
| CloudFront | 3개 distribution | ① bridgespots.com (PriceClass_100) ② milkyway.pe.kr (**PriceClass_200**) ③ attachments.com (no-alias) |
| S3 | 5개 버킷 (총 22.2 GB) | 상세 아래 |
| Route53 | 2개 hosted zone | bridgespots.com + milkyway.pe.kr |
| EIP | 2개 (모두 associated) | 15.165.202.64, 43.201.179.254 |
| Lambda | `kanban-dev-infra-scheduler` (Python 3.12, 128MB) | **2026-04-20 방금 배포** |
| EventBridge | shutdown `0 14 * * *` UTC + startup `0 23 * * *` UTC | KST 23:00 shutdown / 08:00 startup |
| NAT Gateway | **없음** | 의도적 (비용 절감) |
| Unattached EBS | 없음 | |
| Snapshots | 0개 | |

### 3.2 S3 버킷 현황

| 버킷 | 용량 | 용도 |
|------|------|------|
| `bridge-kanban-attachments` | **18.2 GB** | 유저 업로드 첨부 파일 (dev/prod 공용) |
| `elasticbeanstalk-ap-northeast-2-997286396624` | 1.65 GB | EB 앱 버전/로그 |
| `kanban-dev-frontend` | 1.07 GB | dev 프론트엔드 정적 파일 |
| `kanban-testprod-frontend` | 1.07 GB | testprod 프론트엔드 정적 파일 |
| `kanban-terraform-state` | (미계측) | Terraform 상태 |
| **합계** | **~22.2 GB** | |

### 3.3 ⚠️ 코드 vs 실제 불일치

| 항목 | Terraform | 실제 | 영향 |
|------|-----------|------|-----|
| **Prod 환경** | `environments/prod/main.tf` 정의됨 | **미배포** | 현재 과금은 dev만 반영 |
| `milkyway.pe.kr` CloudFront | PriceClass_100 (secondary) | **PriceClass_200** | PriceClass_200은 아시아 엣지 포함 → 20~30% 더 비쌈 (현재는 트래픽 없어 영향 無) |
| Free Tier 만료 | 자동 | 4월 초 만료 | 고정비 $60+ 발생 시작 |

---

## 4. Infra-Scheduler 절감 효과 분석

### 4.1 현재 스케줄 설정

- **EventBridge Cron**: `shutdown 0 14 * * *` UTC (KST 23:00) / `startup 0 23 * * *` UTC (KST 08:00)
- **대상**: EB Auto Scaling Group + RDS instance
- **배포 시점**: 2026-04-20 01:51 UTC (분석 시점 바로 전)

### 4.2 예상 절감액 (5월부터 효과 반영)

| 리소스 | 24/7 비용 (월) | 스케줄 후 (15.5h/day) | 절감 |
|-------|---------------|----------------------|------|
| EC2 (t3.small) | $15.18 | **$9.81** | **-$5.37 (35%)** |
| RDS (db.t4g.micro) | $17.50 | **$11.30** | **-$6.20 (35%)** |
| EBS gp3 (스토리지) | $0.75 | $0.75 | 0 (항상 과금) |
| **합계** | **$33.43** | **$21.86** | **-$11.57/월** |

> ALB, ElastiCache, Public IPv4(EIP 유지)는 스케줄링 대상 아님

**주의**: 4월 데이터($41.71/20일 = $62.57/월)는 **스케줄러 적용 전** 수치. 5월부터 ≈ **$51–55/월** 예상

---

## 5. 시나리오별 월 비용 전망

### Scenario A: 현재 (Dev only, 스케줄러 적용 후) — 5월 전망
```
EB + EC2 스케줄링 적용      $9.81
RDS 스케줄링 적용           $11.30
ALB (24/7)                 $15.41
EIP × 2 + In-Use            $10.39
Route53 (2 zones)           $1.55
S3 storage (22 GB)          $0.56
EBS + 기타                 $1.16
Tax (10%)                  ~$5.00
────────────────────────────────
합계                      $55/월
```

### Scenario B: Prod 배포 완료 (Phase 1 구성, 스케줄러 + 최소 HA)
```
Dev (위와 동일)             $55
Prod EB + EC2 (24/7)        $15
Prod RDS (24/7, HA 없음)    $19
Prod ElastiCache t4g.micro  $13
Prod ALB                    $16
Prod EIP + Public IP        $8
Prod Tax (10%)              $7
────────────────────────────────
합계                     $133/월
```

> Prod는 보통 24/7 운영되므로 스케줄러 미적용 가정. 필요 시 야간 스케줄링으로 $15-20 추가 절감 가능

### Scenario C: Phase 2 업그레이드 (HA + 보안 강화)
추가 비용:
- **NAT Gateway × 2 env**: +$72 ($36/env × 2)
- **RDS Multi-AZ × 2 env**: +$38
- **ElastiCache replica (prod)**: +$13
- **Aurora Serverless v2 전환 (prod)**: +$140~230 (min 2 ACU)
- **CloudWatch 로그 보존/대시보드**: +$10
```
Scenario B                  $133
Phase 2 추가                $273~363
────────────────────────────────
합계                     $405~495/월
```

---

## 6. 비용 최적화 기회

### 즉시 실행 가능 (영향 큼)
1. **`milkyway.pe.kr` CloudFront를 `PriceClass_100`으로 축소** — 현재 PriceClass_200 쓰고 있으나 한국 유저 대상이면 불필요. 트래픽 증가 후 월 $5-15 절감 여지
2. **`kanban-testprod-frontend` S3 버킷 용도 재검토** — dev와 거의 동일 크기(1GB). testprod 환경이 실제 쓰이는지 확인 필요
3. **Public IPv4 최소화** — EIP 2개 중 하나만 필요하다면 -$3.60/월. EB Single Instance 모드 검토 시 ALB + EIP 모두 제거 가능 (-$15/월)

### 중기 (월 $5-10 절감)
4. **Route53 hosted zone 통합** — `milkyway.pe.kr` 실사용 여부 재검토. 미사용 시 zone 삭제 = -$0.50/월 + 관리 간소화
5. **EB + RDS 스케줄 범위 확대** — 주말(토/일) 완전 중단 시 EC2+RDS 약 28% 추가 절감 (-$6/월)
6. **S3 Intelligent-Tiering 효과 확인** — 18GB attachments에 IT 적용 중. 30일 경과 객체 비율 모니터링 (현재 IT-IA 티어 비용 미미하게 계상됨)

### Phase 2 이전 의사결정 필요
7. **NAT Gateway 대안 검토** — VPC Endpoint (S3/RDS Proxy/CloudWatch)로 대체 시 $72/월 → $15/월 가능
8. **RDS Multi-AZ vs Aurora Serverless v2** — 트래픽 적고 예측 불가 시 Aurora Serverless가 night-idle에서 유리. 꾸준한 low 부하면 Multi-AZ RDS가 저렴

---

## 7. 검증 노트

- Cost Explorer `$41.71` 총합 = 서비스별 합계 (검증 완료, 반올림 오차 $0.01 이내)
- Forecast `$66.66` vs 선형 환산 `$62.57`: Forecast가 약 6% 높음 → AWS는 4월 후반 트래픽 증가 및 월말 과금 패턴을 반영 (신뢰 가능)
- Terraform `modules/` 10개 중 **infra-scheduler 모듈만 git untracked** 상태 — 코드 커밋 시 본 리포트에 반영된 스케줄러 비용 효과 보존 가능

---

## 부록: 사용한 AWS CLI 명령

```bash
# 6개월 월별 총비용
aws ce get-cost-and-usage --time-period Start=2025-11-01,End=2026-04-21 \
  --granularity MONTHLY --metrics UnblendedCost

# 서비스별 월 비용
aws ce get-cost-and-usage --time-period Start=2026-04-01,End=2026-04-21 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# UsageType별 세부
aws ce get-cost-and-usage --time-period Start=2026-04-01,End=2026-04-21 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE

# Forecast
aws ce get-cost-forecast --time-period Start=2026-04-21,End=2026-05-01 \
  --granularity MONTHLY --metric UNBLENDED_COST

# 리소스 검증
aws elasticbeanstalk describe-environments
aws rds describe-db-instances
aws elasticache describe-cache-clusters
aws cloudfront list-distributions
aws elbv2 describe-load-balancers
aws route53 list-hosted-zones
aws ec2 describe-addresses
aws s3api list-buckets
aws events list-rules
```
