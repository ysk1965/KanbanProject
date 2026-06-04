variable "aws_region" {
  description = "Region (used in EB bundle-bucket ARN; keep same as workloads)"
  type        = string
  default     = "ap-northeast-2"
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set false if it ALREADY exists in the account (one provider per account)."
  type        = bool
  default     = true
}

variable "terraform_role_name" {
  description = "IAM role name assumed by terraform.yml"
  type        = string
  default     = "kanban-gha-terraform"
}

variable "deploy_role_name" {
  description = "IAM role name assumed by deploy-dev.yml"
  type        = string
  default     = "kanban-gha-deploy"
}

variable "terraform_role_subs" {
  description = "Allowed OIDC `sub` claims for the terraform role (repo + ref). plan runs on PRs, apply on main."
  type        = list(string)
  default = [
    "repo:ysk1965/KanbanProject:ref:refs/heads/main",
    "repo:ysk1965/KanbanProject:pull_request"
  ]
}

variable "deploy_role_subs" {
  description = "Allowed OIDC `sub` claims for the deploy role. NOTE: deploy-dev.yml triggers via workflow_run, whose token sub uses the DEFAULT branch (main) — keep main here; develop included for safety."
  type        = list(string)
  default = [
    "repo:ysk1965/KanbanProject:ref:refs/heads/main",
    "repo:ysk1965/KanbanProject:ref:refs/heads/develop"
  ]
}

variable "dns_cross_account_role_arn" {
  description = "ARN of the OLD-account Route53 cross-account role (Pattern A) so the terraform role can assume it. Empty to skip."
  type        = string
  default     = ""
}
