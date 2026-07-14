variable "aws_region" {
  description = "Region for the provider (Route53 is global; any region works)"
  type        = string
  default     = "ap-northeast-2"
}

variable "zone_names" {
  description = "Hosted zone domain names that stay in this (legacy) account, e.g. [\"bridgespots.com\", \"milkyway.pe.kr\"]"
  type        = list(string)
}

variable "role_name" {
  description = "Name of the cross-account IAM role to create"
  type        = string
  default     = "kanban-route53-cross-account"
}

variable "trusted_principal_arns" {
  description = "ARNs in the NEW account allowed to assume this role (e.g. the CI/Terraform IAM role or user that runs apply). Use [\"arn:aws:iam::259151461692:root\"] to trust the whole new account."
  type        = list(string)
}

variable "external_id" {
  description = "Optional STS ExternalId required when assuming the role (defense-in-depth). Empty to disable."
  type        = string
  default     = ""
}
