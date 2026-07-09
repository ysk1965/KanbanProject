variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "enabled" {
  description = "Enable/disable the scheduler (useful for quick toggle)"
  type        = bool
  default     = true
}

variable "shutdown_cron" {
  description = "Cron expression for shutdown (EventBridge format, UTC)"
  type        = string
  default     = "cron(30 18 ? * * *)" # KST 03:30
}

variable "startup_cron" {
  description = "Cron expression for startup (EventBridge format, UTC)"
  type        = string
  default     = "cron(15 23 ? * * *)" # KST 08:15 (warm-up for 08:30 resume)
}

variable "eb_environment_name" {
  description = "Elastic Beanstalk environment name"
  type        = string
}

variable "eb_min_instances" {
  description = "EB ASG min instances (restored on startup)"
  type        = number
  default     = 1
}

variable "eb_max_instances" {
  description = "EB ASG max instances (restored on startup)"
  type        = number
  default     = 2
}

variable "rds_instance_id" {
  description = "RDS instance identifier"
  type        = string
}

variable "notification_email" {
  description = "Email for SNS notifications (empty to skip)"
  type        = string
  default     = ""
}
