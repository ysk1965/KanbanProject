variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "kanban"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key (minimum 32 characters)"
  type        = string
  sensitive   = true
}

variable "claude_api_key" {
  description = "Claude API key for AI report generation"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key for AI features"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_admin_key" {
  description = "OpenAI Admin API key for billing/usage monitoring"
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_username" {
  description = "Gmail SMTP username"
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_password" {
  description = "Gmail SMTP app password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth2 client ID"
  type        = string
  default     = "529008418447-slt129ql6e1noruvhat2of5vovke80v3.apps.googleusercontent.com"
}

variable "google_client_secret" {
  description = "Google OAuth2 client secret (sourced from SSM via local.secret when seeded)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ai_provider" {
  description = "AI provider selection (claude | openai). 텍스트·추론 계열만 갈린다 — 음성/이미지는 항상 OpenAI."
  type        = string
  default     = "claude"
}

variable "sentry_dsn" {
  description = "Sentry DSN for backend error monitoring (sourced from SSM via local.secret when seeded)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "testprod_frontend_url" {
  description = "Test-prod frontend URL for CORS allow-list"
  type        = string
  default     = "https://d1lh3qblxyq39p.cloudfront.net"
}

variable "domain_name" {
  description = "Domain name (e.g., bridgespots.com)"
  type        = string
  default     = "" # Set this to enable custom domain
}

variable "attachments_bucket_name" {
  description = "S3 bucket for user attachments (data-source lookup). New account uses a new globally-unique name."
  type        = string
  default     = "kanban-attachments-259151461692"
}

variable "frontend_bucket_name" {
  description = "Override frontend S3 bucket name (global uniqueness). Empty = {project}-{env}-frontend."
  type        = string
  default     = "kanban-dev-frontend-259151461692"
}

variable "dns_account_role_arn" {
  description = "IAM role ARN to assume for managing Route53 records in ANOTHER AWS account (cross-account DNS / Pattern A). Leave empty to create & manage the hosted zone in THIS account."
  type        = string
  default     = "arn:aws:iam::997286396624:role/kanban-route53-cross-account"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version for RDS. Pin to the instance's ACTUAL version (check: aws rds describe-db-instances)."
  type        = string
  # 실제 인스턴스는 15.17이다. 15.10으로 두면 apply가 다운그레이드를 시도해
  # "Cannot find upgrade path from 15.17 to 15.10"으로 스택 전체가 중단된다.
  default = "15.17"
}

variable "rds_kms_key_id" {
  description = "Customer-managed KMS key ARN for RDS storage encryption. Empty = default aws/rds key. Set to the new-account CMK so the cross-account-restored DB matches on terraform import."
  type        = string
  default     = ""
}

variable "rds_snapshot_identifier" {
  description = "Restore RDS from this snapshot instead of creating empty (account-migration cutover). Empty = fresh."
  type        = string
  default     = ""
}

variable "rds_deletion_protection" {
  description = "Override RDS deletion protection (null = prod-only legacy default; set true to protect the live DB)."
  type        = bool
  default     = null
}

variable "use_ssm_secrets" {
  description = "Read app secrets from SSM SecureString (/kanban/<env>/<key>) instead of tfvars/TF_VAR. Seed SSM first via scripts/seed-ssm-secrets.sh."
  type        = bool
  default     = true
}

variable "ssm_secret_prefix" {
  description = "SSM parameter path prefix for app secrets (dev/prod separation)."
  type        = string
  default     = "/kanban/dev"
}

variable "secondary_domain_name" {
  description = "Secondary domain name (e.g., milkyway.pe.kr) - shares same backend ALB"
  type        = string
  default     = "milkyway.pe.kr"
}

# Polar.sh Payment
variable "polar_api_key" {
  description = "Polar.sh API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "polar_webhook_secret" {
  description = "Polar.sh webhook signing secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "polar_org_id" {
  description = "Polar.sh organization ID"
  type        = string
  default     = ""
}

variable "polar_product_board_monthly" {
  description = "Polar.sh product ID for Board Monthly"
  type        = string
  default     = ""
}

variable "polar_product_board_yearly" {
  description = "Polar.sh product ID for Board Yearly"
  type        = string
  default     = ""
}

variable "polar_product_org_monthly" {
  description = "Polar.sh product ID for Org Monthly"
  type        = string
  default     = ""
}

variable "polar_product_org_yearly" {
  description = "Polar.sh product ID for Org Yearly"
  type        = string
  default     = ""
}

variable "polar_product_credit_100" {
  description = "Polar.sh product ID for AI Credits 100"
  type        = string
  default     = ""
}

variable "polar_product_credit_500" {
  description = "Polar.sh product ID for AI Credits 500"
  type        = string
  default     = ""
}

variable "polar_product_credit_1000" {
  description = "Polar.sh product ID for AI Credits 1000"
  type        = string
  default     = ""
}

# Discord Integration
variable "discord_client_id" {
  description = "Discord OAuth2 client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_client_secret" {
  description = "Discord OAuth2 client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_bot_token" {
  description = "Discord bot token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_redirect_uri" {
  description = "Discord OAuth2 redirect URI"
  type        = string
  default     = ""
}

# JIRA OAuth Integration
variable "jira_oauth_client_id" {
  description = "JIRA OAuth2 client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jira_oauth_client_secret" {
  description = "JIRA OAuth2 client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jira_oauth_redirect_uri" {
  description = "JIRA OAuth2 redirect URI"
  type        = string
  default     = "https://api.bridgespots.com/api/v1/jira/oauth/callback"
}

# JIRA 자동수정(Autofix) 파이프라인
# 러너(맥)가 작업을 가져가는 pull 방식이라 서버가 러너를 호출하지 않는다 — 러너 주소도,
# 이 서버의 공개 주소도 설정할 것이 없다. 러너가 자기 runner.conf에 BRIDGE_URL을 들고 있다.
variable "autofix_dispatch_enabled" {
  description = "Hand queued autofix jobs to the runner. False = jobs stay queued."
  type        = bool
  default     = true
}

# GitHub App Integration (자동 보고서 커밋 수집)
variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_app_private_key" {
  description = "GitHub App private key (PEM). 줄바꿈은 \\n 이스케이프 허용"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_app_slug" {
  description = "GitHub App slug (설치 페이지 주소에 쓰임)"
  type        = string
  default     = ""
}

# Confluence OAuth Integration (주간보고 수집) — JIRA와 별개의 앱
variable "confluence_oauth_client_id" {
  description = "Confluence OAuth2 client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "confluence_oauth_client_secret" {
  description = "Confluence OAuth2 client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "confluence_oauth_redirect_uri" {
  description = "Confluence OAuth2 redirect URI"
  type        = string
  default     = "https://api.bridgespots.com/api/v1/confluence/oauth/callback"
}

# Slack App Integration
variable "slack_client_id" {
  description = "Slack App Client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_client_secret" {
  description = "Slack App Client Secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_signing_secret" {
  description = "Slack App Signing Secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_token_encryption_key" {
  description = "AES-256-GCM encryption key for Slack bot tokens"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_redirect_uri" {
  description = "Slack OAuth redirect URI"
  type        = string
  default     = ""
}

variable "slack_user_redirect_uri" {
  description = "Slack user OAuth redirect URI"
  type        = string
  default     = ""
}

# Infrastructure Scheduler
variable "notification_email" {
  description = "Email for infrastructure scheduler notifications"
  type        = string
  default     = ""
}
