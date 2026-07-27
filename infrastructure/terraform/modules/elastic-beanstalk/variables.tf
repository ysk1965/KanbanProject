variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EC2 instances"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID for ALB"
  type        = string
}

variable "ec2_security_group_id" {
  description = "Security group ID for EC2 instances"
  type        = string
}

variable "solution_stack_name" {
  description = "Elastic Beanstalk solution stack name"
  type        = string
  default     = "64bit Amazon Linux 2023 v4.12.4 running Corretto 21"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 4
}

variable "spring_profile" {
  description = "Spring profile to activate"
  type        = string
  default     = "prod"
}

variable "database_url" {
  description = "Database JDBC URL"
  type        = string
}

variable "db_username" {
  description = "Database username"
  type        = string
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "redis_host" {
  description = "Redis host"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = string
  default     = "6379"
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Frontend URL for CORS"
  type        = string
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
  description = "Gmail SMTP username for sending emails"
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
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth2 client secret"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── App config / observability ───
variable "spring_autoconfigure_exclude" {
  description = "Spring Boot auto-configurations to exclude. Set when there is no Redis (dev) so RedisAutoConfiguration does not try localhost:6379 → /actuator/health DOWN."
  type        = string
  default     = "org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration"
}

variable "ai_provider" {
  description = "AI provider selection (claude | openai). Empty = app default."
  type        = string
  default     = ""
}

variable "sentry_dsn" {
  description = "Sentry DSN for backend error monitoring. Empty = not set."
  type        = string
  sensitive   = true
  default     = ""
}

variable "sentry_environment" {
  description = "Sentry environment tag (e.g. dev, prod). Empty = not set."
  type        = string
  default     = ""
}

variable "testprod_frontend_url" {
  description = "Test-prod frontend URL for CORS allow-list. Empty = not set."
  type        = string
  default     = ""
}

variable "associate_public_ip" {
  description = "Associate public IP to EC2 instances (true for public subnet without NAT)"
  type        = string
  default     = "false"
}

variable "ssl_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener (empty to disable HTTPS)"
  type        = string
  default     = ""
}

variable "cloudfront_domain" {
  description = "CloudFront domain for S3 attachments bucket (empty to use backend proxy)"
  type        = string
  default     = ""
}

variable "s3_bucket" {
  description = "S3 attachments bucket name for the app (S3_BUCKET env). Empty = app uses its own configured default."
  type        = string
  default     = ""
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
  description = "Polar.sh product ID for Board Monthly subscription"
  type        = string
  default     = ""
}

variable "polar_product_board_yearly" {
  description = "Polar.sh product ID for Board Yearly subscription"
  type        = string
  default     = ""
}

variable "polar_product_org_monthly" {
  description = "Polar.sh product ID for Org Monthly subscription"
  type        = string
  default     = ""
}

variable "polar_product_org_yearly" {
  description = "Polar.sh product ID for Org Yearly subscription"
  type        = string
  default     = ""
}

variable "polar_product_credit_100" {
  description = "Polar.sh product ID for AI Credits 100 pack"
  type        = string
  default     = ""
}

variable "polar_product_credit_500" {
  description = "Polar.sh product ID for AI Credits 500 pack"
  type        = string
  default     = ""
}

variable "polar_product_credit_1000" {
  description = "Polar.sh product ID for AI Credits 1000 pack"
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
  default     = ""
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
  default     = ""
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

variable "config_encryption_key" {
  description = "AES-256-GCM key (base64, 32 bytes) for sensitive system_config values such as rotated AI API keys. WARNING: changing this makes already-stored values undecryptable."
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
