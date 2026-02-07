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

variable "domain_name" {
  description = "Domain name (e.g., bridgespots.com)"
  type        = string
  default     = ""  # Set this to enable custom domain
}
