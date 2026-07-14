# Terraform State Backend (new account bootstrap)

Creates the remote-state S3 bucket + DynamoDB lock table in the **new account
(`259151461692`)**. Run this **first**, before any `environments/*` apply in the new
account.

Why a bootstrap: the backend can't store its own creation in itself (chicken/egg), so
this config uses **local state**. It contains no secrets — commit `terraform.tfstate`
here, or keep the small file safe.

## Apply (new-account credentials)

```bash
cd infrastructure/terraform/bootstrap/state-backend
export AWS_PROFILE=new-account   # account 259151461692

terraform init
terraform apply        # defaults: bucket kanban-terraform-state-259151461692, lock kanban-terraform-lock

terraform output backend_config_dev
```

## Point the dev environment at it (new account)

The live stack is **dev** (serves bridgespots.com + milkyway; RDS `kanban-dev-db`). The
old account's dev backend points at `kanban-terraform-state` (old account). In the new
account, init the dev env against the **new** bucket with a clean state — do NOT migrate
the old state (it holds old-account ARNs/IDs):

```bash
cd infrastructure/terraform/environments/dev

# Option A — pass backend config at init (keeps main.tf backend block untouched)
terraform init -reconfigure \
  -backend-config="bucket=kanban-terraform-state-259151461692" \
  -backend-config="key=dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=kanban-terraform-lock"

# Option B — edit the backend block in dev/main.tf to the new bucket, then: terraform init -reconfigure
```

Then `terraform apply` to stand up the new-account stack (stateless first), and
`terraform import` the data-bearing resources you bring over — chiefly the restored
**`kanban-dev-db`** (see migration plan §4.2 / Phase 3) and, if kept, the attachments
bucket. DNS records are managed cross-account via Pattern A (zones stay in the old
account — see `../route53-cross-account`).

## Notes

- Bucket: versioning on, SSE-S3 (AES256) + bucket-key, public access fully blocked,
  TLS-only bucket policy.
- Lock table: PAY_PER_REQUEST, `LockID` hash key.
- `prod` env was never deployed; if you later stand up a real prod, give it its own
  `key = "prod/terraform.tfstate"` in the same bucket.
