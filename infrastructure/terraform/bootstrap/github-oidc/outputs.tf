output "oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN"
  value       = local.oidc_provider_arn
}

output "terraform_role_arn" {
  description = "Set as GitHub repo Variable AWS_GHA_TF_ROLE_ARN (used by terraform.yml)"
  value       = aws_iam_role.terraform.arn
}

output "deploy_role_arn" {
  description = "Set as GitHub repo Variable AWS_GHA_DEPLOY_ROLE_ARN (used by deploy-dev.yml)"
  value       = aws_iam_role.deploy.arn
}
