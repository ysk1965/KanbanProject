# 런북 — `kanban-dev-db` RDS 계정 이전

> **대상**: 실 운영 DB `kanban-dev-db` (dev 스택, 유일한 비가역 자산)
> **경로**: 구 계정 `997286396624` → 새 계정 `259151461692`, 리전 `ap-northeast-2` 유지
> **방식**: 기본 `aws/rds` 키는 교차계정 공유 불가 → **CMK 재암호화 경로**(스냅샷) + `terraform import`
> **다운타임**: 최종 스냅샷용 쓰기 동결 ~30~60분
> **점검 윈도우**: _TBD (미정 — 확정 시 §7에 박기)_
> 상위 계획: `docs/infra/aws-account-migration-plan.md` §4.2 / Phase 3
> **✅ 실행됨 (2026-06-02)**: 스냅샷+CMK 경로로 복원 성공(프라이빗 RDS라 pg_dump 불가, §6 폴백 미사용). 스냅샷 `kanban-dev-db-migrate`→CMK_OLD 재암호화→공유→새 계정 copy(alias/aws/rds)→빈 RDS를 `rds_snapshot_identifier` apply로 **교체 복원**(import 불필요). 실제 전체 함정·기록은 계획서 **§8** 참조.

소스 DB 속성(코드 기준): postgres, `db.t4g.micro`, gp3 20GB, single-AZ, `storage_encrypted=true`(기본 키), `publicly_accessible=false`, db_name `kanban`, user `kanban_admin`, subnet group `kanban-dev-db-subnet`.

---

## 0. 사전 확인 (읽기 전용, 구 계정)

**실제** 속성을 캡처한다 — 특히 엔진 버전은 auto-minor-upgrade로 15.10보다 높아졌을 수 있다.

```bash
# OLD account creds
aws rds describe-db-instances --db-instance-identifier kanban-dev-db \
  --query 'DBInstances[0].{ver:EngineVersion,class:DBInstanceClass,storage:AllocatedStorage,maxstorage:MaxAllocatedStorage,encrypted:StorageEncrypted,kms:KmsKeyId,multiaz:MultiAZ,pub:PubliclyAccessible,subnet:DBSubnetGroup.DBSubnetGroupName,pg:DBParameterGroups[0].DBParameterGroupName,pending:PendingModifiedValues}' --output table
```

→ 캡처한 `EngineVersion`을 새 계정 `terraform.tfvars`의 `rds_engine_version`에 그대로 박는다(예: 실제가 `15.13`이면 `rds_engine_version = "15.13"`). 불일치 시 import 후 plan 드리프트 발생.

**소스 보호**: dev RDS는 `deletion_protection=false`다 — 윈도우 중 사고 방지로 켜둔다.
```bash
aws rds modify-db-instance --db-instance-identifier kanban-dev-db --deletion-protection --apply-immediately
```

---

## 1. 새 계정 사전 준비

1. **state 백엔드** 적용 — `infrastructure/terraform/bootstrap/state-backend` (별도 런북/README).
2. **RDS용 CMK 생성** (복원본 암호화):
   ```bash
   # NEW account creds
   aws kms create-key --description "kanban RDS encryption" --query 'KeyMetadata.Arn' --output text   # → CMK_NEW
   aws kms create-alias --alias-name alias/kanban-rds --target-key-id <CMK_NEW>
   ```
3. **스테이트리스 인프라 + DB subnet group**을 terraform으로 먼저 생성(복원 타깃 필요). 빈 DB는 만들지 않고 의존성만:
   ```bash
   cd infrastructure/terraform/environments/dev   # 새 계정 backend로 init 완료 상태
   terraform apply \
     -target=module.vpc \
     -target=module.security_groups \
     -target=module.rds.aws_db_subnet_group.main
   # → kanban-dev-db-subnet 생성 + RDS SG 확보 (DB 인스턴스는 아직 X)
   RDS_SG=$(terraform state show module.security_groups | grep -i rds | ...)  # 또는 콘솔에서 RDS SG id 확보
   ```

---

## 2. 컷오버 — 쓰기 동결 (구 계정)

```bash
# OLD account
# (a) infra-scheduler 비활성 — 마이그레이션 중 EB/RDS를 멋대로 start/stop 못하게
#     terraform로 enabled=false 재적용하거나, EventBridge 규칙을 disable
aws events disable-rule --name <kanban-dev-shutdown-rule>
aws events disable-rule --name <kanban-dev-startup-rule>

# (b) 쓰기 동결 — EB ASG를 0으로 (앱 정지)
aws autoscaling update-auto-scaling-group --auto-scaling-group-name <kanban-dev-asg> \
  --min-size 0 --max-size 0 --desired-capacity 0
```

---

## 3. 스냅샷 → CMK 재암호화 → 공유 → 복사 → 복원

```bash
# ===== OLD account (997286396624) =====
TS=$(date -u +%Y%m%d)

# 3-1. 최종 수동 스냅샷
aws rds create-db-snapshot --db-instance-identifier kanban-dev-db \
  --db-snapshot-identifier kanban-dev-db-migrate-$TS
aws rds wait db-snapshot-completed --db-snapshot-identifier kanban-dev-db-migrate-$TS

# 3-2. 공유용 CMK 생성(CMK_OLD)하고 그 키로 재암호화 copy (기본 aws/rds 키는 공유 불가)
aws kms create-key --description "kanban migrate re-encrypt" --query 'KeyMetadata.Arn' --output text  # → CMK_OLD
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier kanban-dev-db-migrate-$TS \
  --target-db-snapshot-identifier kanban-dev-db-migrate-cmk \
  --kms-key-id <CMK_OLD>
aws rds wait db-snapshot-completed --db-snapshot-identifier kanban-dev-db-migrate-cmk

# 3-3. CMK_OLD 키 정책에 새 계정 Decrypt/CreateGrant 허용 (콘솔 또는 put-key-policy)
#      Statement에 { "Principal": {"AWS":"arn:aws:iam::259151461692:root"},
#        "Action":["kms:Decrypt","kms:CreateGrant","kms:DescribeKey"], "Resource":"*" } 추가

# 3-4. 재암호화 스냅샷을 새 계정과 공유
aws rds modify-db-snapshot-attribute \
  --db-snapshot-identifier kanban-dev-db-migrate-cmk \
  --attribute-name restore --values-to-add 259151461692

# ===== NEW account (259151461692) =====
# 3-5. 공유 스냅샷을 새 계정으로 복사 + CMK_NEW로 재암호화(완전 소유)
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:ap-northeast-2:997286396624:snapshot:kanban-dev-db-migrate-cmk \
  --target-db-snapshot-identifier kanban-dev-db-migrate \
  --kms-key-id <CMK_NEW>
aws rds wait db-snapshot-completed --db-snapshot-identifier kanban-dev-db-migrate

# 3-6. terraform이 만든 subnet group + RDS SG로 복원
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier kanban-dev-db \
  --db-snapshot-identifier kanban-dev-db-migrate \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name kanban-dev-db-subnet \
  --vpc-security-group-ids <NEW_RDS_SG> \
  --no-publicly-accessible --no-multi-az
aws rds wait db-instance-available --db-instance-identifier kanban-dev-db

# 3-7. 마이너 자동 업그레이드 끄기(terraform도 false 강제 — 드리프트 방지)
aws rds modify-db-instance --db-instance-identifier kanban-dev-db \
  --no-auto-minor-version-upgrade --apply-immediately
```

> 복원본은 소스의 master user/password/db_name을 그대로 승계한다. 암호화 키만 CMK_NEW.

---

## 4. terraform import + 드리프트 0 확인 (새 계정)

```bash
cd infrastructure/terraform/environments/dev   # 새 계정 backend

# tfvars: domain_name/secondary_domain_name/dns_account_role_arn(패턴 A) +
#   rds_engine_version = "<§0에서 캡처한 실제 버전>"
#   rds_kms_key_id     = "<CMK_NEW ARN>"
#   rds_deletion_protection = true
#   db_password        = "<소스 master pw 또는 로테이션 값>"

terraform import module.rds.aws_db_instance.main kanban-dev-db
# subnet group이 §1-3 -target 적용으로 이미 state에 있으면 생략, 아니면:
# terraform import module.rds.aws_db_subnet_group.main kanban-dev-db-subnet

terraform plan   # 기대: No changes. (db_password 로테이션 시 그 항목만)
```
plan에 RDS 변경이 잡히면 — `engine_version`(실제와 일치?), `kms_key_id`(CMK_NEW?), `deletion_protection`, `backup_retention_period`를 tfvars/모듈에서 맞춘다.

---

## 5. 데이터 검증 (행수/체크섬)

DB가 public이 아니므로 새 VPC 내 bastion/SSM 세션에서:
```bash
# 테이블 목록 + 행수 (구 vs 신 비교)
psql -h <NEW_ENDPOINT> -U kanban_admin -d kanban -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
# 핵심 테이블 카운트 일치 확인: boards, tasks, features, notes, users, comments ...
```
구 계정에서도 동일 쿼리를 떠서 카운트가 일치하는지 대조.

---

## 6. 대안/폴백 — `pg_dump`/`pg_restore`

20GB 수준이면 KMS 댄스 없이 더 단순(버전 관용·검증 쉬움). KMS 공유가 막히거나 §5 교차검증용:
```bash
# 양쪽 접근 가능한 곳(또는 각각 bastion 경유)에서
pg_dump -h <OLD_ENDPOINT> -U kanban_admin -d kanban -Fc -f kanban.dump
# 새 계정의 (terraform이 만든 빈) DB로 복원
pg_restore -h <NEW_ENDPOINT> -U kanban_admin -d kanban --clean --if-exists --no-owner kanban.dump
```
주의: DB가 public이 아니므로 bastion/SSM 터널 필요. 이 방식은 terraform이 만든 빈 DB에 데이터만 넣으므로 import가 더 단순(인스턴스는 terraform 소유).

---

## 7. 롤백 & 순서 (안전망)

- **구 `kanban-dev-db`는 컷오버 내내 무손상**(읽기 전용). 검증 실패 시 앱+DNS를 구 리소스로 되돌린다(패턴 A 레코드 alias 교체 = ~60초).
- 스냅샷(`kanban-dev-db-migrate*`)은 검증 완료까지 보관.
- 컷오버 순서: ①스케줄러 비활성 → ②EB ASG 0(쓰기 동결) → ③최종 스냅샷·재암호화·복원 → ④import·plan·검증 → ⑤새 EB를 복원 DB로 지정·배포·`jwt_secret` 로테이션·헬스체크 → ⑥DNS 레코드 flip(패턴 A) → ⑦안정화 후 구 인스턴스 deletion_protection 유지한 채 1~2주 보존.
- **점검 윈도우(TBD)**: 확정되면 위 ②~⑥을 그 시간대에 수행, 사용자 공지 포함.

---

## 부록 — 이 런북을 위한 IaC 변경 (완료)

`modules/rds-simple`에 추가:
- `kms_key_id` — CMK 지정(빈 값=기본 키). 복원본이 CMK_NEW면 여기 박아야 import 드리프트 0.
- `auto_minor_version_upgrade` (기본 false) — 버전 핀.
- `deletion_protection` override — 라이브 DB 보호(true 권장).

`environments/{dev,prod}`에 노출: `rds_engine_version`, `rds_kms_key_id`, `rds_deletion_protection` (tfvars.example 참조).
