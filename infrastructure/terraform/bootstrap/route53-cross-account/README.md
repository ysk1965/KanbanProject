# Route53 Cross-Account Access (Pattern A)

Keep the `bridgespots.com` **and** `milkyway.pe.kr` hosted zones in the **legacy (old)
AWS account** during and after an account migration, while the **new account**
(`259151461692`) manages their DNS records.

## Why

The hosted zones (and therefore the registrars' NS delegation) **never move**. The new
account only writes records into them via an assumed IAM role. This:

- **Eliminates the migration's #1 timing risk** — no NS re-delegation, no 48h registrar
  TTL wait, no "both zones authoritative" overlap window.
- **Makes cutover a record flip** — repoint the `A`/alias records (TTL 60s) from the old
  resources to the new CloudFront/ALB. **Revertible in ~60 seconds.**
- **ACM DNS validation just works** — the validation CNAMEs land in the already-authoritative
  old-account zones, so certs in the new account validate immediately.

Trade-off: the old account is **not fully decommissioned** — it keeps the two Route53 zones
(≈ $0.50/zone/month + queries) and this one IAM role.

## Live environment note

The live BRIDGE service runs on the **`dev`** Terraform stack (it serves both domains;
its state is the S3 backend `kanban-terraform-state/dev/`, RDS `kanban-dev-db`). The
`prod` stack was **never applied** (no state; last plan was 48 all-creates). So the
records to hand off live in the **dev** stack — see the `state rm` list below.

## How it fits together

```
NEW account (terraform/environments/dev)               OLD account (this bootstrap)
┌──────────────────────────────────────────┐          ┌────────────────────────────┐
│ provider "aws" { alias = "dns"            │  assume  │ IAM role                   │
│   assume_role { role_arn = <this ARN> } } │ ───────▶ │  kanban-route53-cross-...  │
│ records for bridgespots.com + milkyway ───┼──writes─▶│  └ ChangeResourceRecordSets│
│   (provider = aws.dns)                     │          │     on BOTH zones          │
└──────────────────────────────────────────┘          └────────────────────────────┘
```

Set `dns_account_role_arn` (the `role_arn` output) in the new account's
`terraform.tfvars`. Leaving it empty keeps the old behavior (zone created in-account).

## Apply (in the OLD account)

```bash
cd infrastructure/terraform/bootstrap/route53-cross-account

# Use OLD-account credentials (the zone owner)
export AWS_PROFILE=old-account   # or AWS_ACCESS_KEY_ID/SECRET for the old account

terraform init
terraform apply \
  -var 'zone_names=["bridgespots.com","milkyway.pe.kr"]' \
  -var 'trusted_principal_arns=["arn:aws:iam::259151461692:root"]'
  # Tighten later: trust the specific CI/Terraform role ARN instead of :root,
  # and optionally add -var 'external_id=<random-string>'.

terraform output role_arn   # → paste into new account's dns_account_role_arn
```

## Cutover sequencing (important)

The old account's existing **dev** state currently owns the same records. After the new
account starts writing them (`allow_overwrite = true`), a later `apply` in the OLD account
would try to revert them. Hand off ownership cleanly:

1. **New account** — set `dns_account_role_arn`, `domain_name=bridgespots.com`,
   `secondary_domain_name=milkyway.pe.kr`, then `terraform apply`. Records still point at
   the OLD resources (no user-visible change yet).
2. **Old account (dev stack)** — stop managing the DNS records so the two states don't fight:
   ```bash
   # in the old account's environments/dev
   terraform state rm \
     'aws_route53_record.frontend_root' \
     'aws_route53_record.frontend_www' \
     'aws_route53_record.backend_api' \
     'aws_route53_record.cert_validation' \
     'aws_route53_record.cert_validation_alb' \
     'aws_route53_record.cert_validation_secondary_alb' \
     'aws_route53_record.backend_api_secondary'
   # The zones themselves (module.route53 / data.aws_route53_zone.secondary) STAY put.
   ```
3. **Cutover** — in the new account, flip the alias targets to the new CloudFront/ALB
   (happens once the new account's resources exist and `terraform apply` runs). TTL is 60s,
   so propagation + rollback are both fast.
4. **Rollback** — re-point the records back to the old resources, or `terraform state rm`
   in the new account and let the old account re-assert them. Recovery is ~60s, not hours.

## Notes

- `bridge-kanban-attachments` (S3) is a **separate** concern from DNS.
- This role grants `ChangeResourceRecordSets` on the **named zones only**, plus the global
  list/lookup actions Route53 requires (they don't support resource-level scoping).
