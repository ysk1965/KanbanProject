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
  default     = ""
}

variable "domain_name" {
  description = "Domain name (e.g., bridgespots.com)"
  type        = string
  default     = "" # Set this to enable custom domain
}

variable "secondary_domain_name" {
  description = "Secondary domain name (e.g., milkyway.pe.kr) - shares same backend ALB"
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
