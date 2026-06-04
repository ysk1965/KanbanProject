variable "aws_region" {
  description = "Region for the state bucket + lock table (keep same as workloads)"
  type        = string
  default     = "ap-northeast-2"
}

variable "bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform state in the NEW account. The OLD account already holds 'kanban-terraform-state', so this MUST be a new name (account-id suffix guarantees uniqueness)."
  type        = string
  default     = "kanban-terraform-state-259151461692"
}

variable "lock_table_name" {
  description = "DynamoDB table name for state locking"
  type        = string
  default     = "kanban-terraform-lock"
}

variable "force_destroy" {
  description = "Allow destroying the state bucket even if non-empty (keep false for safety)"
  type        = bool
  default     = false
}
