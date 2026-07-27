# SSM Secrets (source-of-truth)

App secrets move from plaintext `tfvars` / CI `TF_VAR_*` into **SSM SecureString**, with
**dev/prod separation** by path. Terraform reads them and injects into Elastic Beanstalk —
**no backend app change**.

## How it works

- `environments/{dev,prod}` expose two variables:
  - `use_ssm_secrets` (bool, default **false** = legacy tfvars/TF_VAR behavior, backward compatible)
  - `ssm_secret_prefix` (`/kanban/dev` or `/kanban/prod`)
- When `use_ssm_secrets = true`, `data.aws_ssm_parameter.app_secret` reads each key from
  `${ssm_secret_prefix}/<key>` (decrypted), and `local.secret.<key>` feeds the EB module +
  RDS master password. The 14 managed keys are in `local.ssm_secret_keys`.

## Rollout (per environment / account)

```bash
# 1. Seed SSM (TARGET account creds). Source your secrets, then:
export TF_VAR_db_password=...  TF_VAR_jwt_secret=...  # ...the rest
infrastructure/terraform/scripts/seed-ssm-secrets.sh dev            # or: prod [CMK-arn]

# 2. Flip the toggle in environments/<env>/terraform.tfvars:
#    use_ssm_secrets = true
#    (ssm_secret_prefix defaults to /kanban/<env>)

# 3. terraform plan  → confirm secrets now resolve from SSM (no value change)
# 4. Remove the raw secret values from tfvars / CI TF_VAR_* once verified.
```

## IAM

- The CI **terraform** role (`bootstrap/github-oidc`) has `ssm:*` + `kms:*` → can read the
  SecureStrings at plan/apply time.
- Secrets still land in terraform state (encrypted S3 backend) and EB env — the win is a
  single **encrypted, audited, rotatable, dev/prod-separated** source of truth, and **no raw
  secrets in tfvars/CI**. (For "no plaintext in EB at all", switch the app to read SSM at
  runtime — separate, larger change.)

## Notes

- Non-secret IDs (client IDs, product IDs, redirect URIs) stay as plain vars on purpose.
- Rotate `jwt_secret` / `db_password` at cutover by updating the SSM param + re-apply.
- ⚠️ **`config_encryption_key` must never be rotated.** It is the AES-256-GCM key for
  `system_config` values written by the admin AI-key rotation UI (`enc:v1:` prefix). Changing
  it makes already-stored keys undecryptable and silently kills every AI feature. If it ever
  has to change, re-enter every AI key through `/admin/system` right after the apply.
