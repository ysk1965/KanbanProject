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
  default     = "64bit Amazon Linux 2023 v4.8.3 running Corretto 21"
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
