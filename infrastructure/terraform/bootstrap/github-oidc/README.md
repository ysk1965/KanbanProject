# GitHub Actions OIDC (new account)

Replaces the static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in CI with **short-lived
OIDC role assumption** — no long-lived keys. Apply in the **new account (`259151461692`)**.

Creates:
- `aws_iam_openid_connect_provider` for `token.actions.githubusercontent.com`
- **`kanban-gha-terraform`** — assumed by `terraform.yml` (broad, but IAM scoped to `kanban-*`)
- **`kanban-gha-deploy`** — assumed by `deploy-dev.yml` (EB deploy + S3 + CloudFront + RDS wake)

## 1. Apply

```bash
cd infrastructure/terraform/bootstrap/github-oidc
export AWS_PROFILE=new-account   # 259151461692

terraform init
terraform apply \
  -var 'dns_cross_account_role_arn=arn:aws:iam::997286396624:role/kanban-route53-cross-account'
  # dns_cross_account_role_arn lets the terraform role assume the OLD-account Route53 role (Pattern A).

terraform output   # → terraform_role_arn, deploy_role_arn
```

## 2. Set GitHub repo Variables

`Settings → Secrets and variables → Actions → Variables` (NOT secrets):

| Variable | Value |
|----------|-------|
| `AWS_GHA_TF_ROLE_ARN`     | `terraform_role_arn` output |
| `AWS_GHA_DEPLOY_ROLE_ARN` | `deploy_role_arn` output |

The workflows (`terraform.yml`, `deploy-dev.yml`) are **already migrated** in this repo:
each AWS job has `permissions: { id-token: write }` and uses
`role-to-assume: ${{ vars.AWS_GHA_*_ROLE_ARN }}` instead of static keys. The
`beanstalk-deploy` step now relies on the OIDC session creds (keys removed).

## 3. Transition / ordering (IMPORTANT)

The migrated workflows **require** the OIDC role + variable to exist in whatever account
they target. So **before** pushing these workflow changes to a branch CI runs on:

1. Apply this bootstrap in the **target** account and set the two repo Variables.
2. **If the OLD account is still live during transition**: also apply this bootstrap in the
   OLD account (`997286396624`) and point the Variables there first, OR keep the workflow
   changes on a feature branch until cutover. Otherwise the next `develop`/PR run fails
   auth (no `AWS_GHA_*_ROLE_ARN` / no OIDC provider in old account).
3. At cutover, flip the two Variables to the new-account role ARNs.

## 4. Cleanup (Phase 6)

- Delete the old static-key IAM user and **remove** repo Secrets `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY`.

## Notes / tuning

- **`deploy-dev.yml` triggers via `workflow_run`** — its OIDC token `sub` uses the repo's
  **default branch** (`main`), not `develop`. `deploy_role_subs` includes both. If auth
  fails, add a debug step (`aws sts get-caller-identity` won't show sub; instead inspect
  the token claims) and align `deploy_role_subs` to the actual `sub`.
- The terraform role grants broad service access (`*`) but **IAM is scoped to `kanban-*`**
  resources (+ service-linked roles + read) to avoid privilege escalation. Tighten the
  service list later if desired.
- `prod` plans run in CI but `prod` is not deployed — the terraform role still allows it.
