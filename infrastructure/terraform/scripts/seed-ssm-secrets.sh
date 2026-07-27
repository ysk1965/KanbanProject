#!/usr/bin/env bash
# Seed app secrets into SSM Parameter Store as SecureString (source-of-truth for
# the SSM secrets pattern; see environments/{dev,prod} use_ssm_secrets toggle).
#
# Run ONCE per environment in the TARGET account. Reads values from TF_VAR_<key>
# env vars (the same ones CI/terraform already use), so you can source your
# existing secret setup and run this.
#
# Usage:
#   export TF_VAR_db_password=... TF_VAR_jwt_secret=... (and the rest)
#   ./seed-ssm-secrets.sh dev                       # default aws/ssm key
#   ./seed-ssm-secrets.sh prod arn:aws:kms:...:key/CMK   # customer CMK
#
# After seeding, set `use_ssm_secrets = true` in that env's terraform.tfvars and
# remove the raw secret values from tfvars/CI TF_VAR.

set -euo pipefail

ENV="${1:?usage: seed-ssm-secrets.sh <dev|prod> [kms-key-id]}"
KMS="${2:-}"
PREFIX="/kanban/${ENV}"

# Must match the keys looked up in local.secret in environments/<env>/main.tf
KEYS=(
  db_password jwt_secret claude_api_key openai_api_key openai_admin_key
  mail_username mail_password polar_api_key polar_webhook_secret
  discord_client_secret discord_bot_token
  slack_client_secret slack_signing_secret slack_token_encryption_key
  google_client_secret sentry_dsn
  config_encryption_key
)

echo "Seeding ${#KEYS[@]} parameters under ${PREFIX} ..."
for k in "${KEYS[@]}"; do
  var="TF_VAR_${k}"
  val="${!var:-}"
  if [ -z "$val" ]; then
    echo "  skip ${k} (env ${var} is empty)"
    continue
  fi
  args=(--name "${PREFIX}/${k}" --type SecureString --value "$val" --overwrite)
  [ -n "$KMS" ] && args+=(--key-id "$KMS")
  aws ssm put-parameter "${args[@]}" >/dev/null
  echo "  put ${PREFIX}/${k}"
done

echo "Done. Verify:"
echo "  aws ssm get-parameters-by-path --path ${PREFIX} --with-decryption --query 'Parameters[].Name' --output text"
