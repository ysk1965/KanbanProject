variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for RDS"
  type        = string
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "kanban"
}

variable "master_username" {
  description = "Master username"
  type        = string
  default     = "kanban_admin"
}

variable "master_password" {
  description = "Master password"
  type        = string
  sensitive   = true
}

variable "min_capacity" {
  description = "Minimum ACU for Serverless v2"
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACU for Serverless v2"
  type        = number
  default     = 2
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "instance_count" {
  description = "Number of Aurora instances"
  type        = number
  default     = 1
}
