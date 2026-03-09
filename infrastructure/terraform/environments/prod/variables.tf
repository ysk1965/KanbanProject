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
  default     = "prod"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.1.0.0/16"  # Different CIDR from dev
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
  default     = ""  # Set this to enable custom domain
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
