variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for RDS"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for RDS"
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.10"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro" # Free tier eligible
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling"
  type        = number
  default     = 100
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

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "publicly_accessible" {
  description = "Whether the RDS is publicly accessible"
  type        = bool
  default     = false
}

variable "kms_key_id" {
  description = "Customer-managed KMS key ARN/ID for storage encryption. Empty = AWS-managed default aws/rds key. Set to a CMK so snapshots can be shared cross-account (account migration)."
  type        = string
  default     = ""
}

variable "snapshot_identifier" {
  description = "Restore the instance from this DB snapshot ID/ARN instead of creating empty. Empty = fresh instance. (Account migration: restore the migrated snapshot.)"
  type        = string
  default     = ""
}

variable "auto_minor_version_upgrade" {
  description = "Allow AWS to auto-apply minor engine upgrades. Keep false to pin the version (avoids plan drift and surprise upgrades during/after migration)."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Override deletion protection. null = protective default (enabled). Set false only for a genuinely disposable DB."
  type        = bool
  default     = null
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy/replace. Default false (protective) — a forced replacement still captures a snapshot. Set true ONLY for genuinely disposable databases."
  type        = bool
  default     = false
}
