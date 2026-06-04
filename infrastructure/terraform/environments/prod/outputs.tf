output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eb_environment_url" {
  description = "Elastic Beanstalk environment URL"
  value       = module.elastic_beanstalk.endpoint_url
}

output "eb_environment_name" {
  description = "Elastic Beanstalk environment name"
  value       = module.elastic_beanstalk.environment_name
}

output "eb_application_name" {
  description = "Elastic Beanstalk application name"
  value       = module.elastic_beanstalk.application_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_jdbc_url" {
  description = "RDS JDBC URL"
  value       = module.rds.jdbc_url
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "frontend_s3_bucket" {
  description = "Frontend S3 bucket name"
  value       = module.s3_cloudfront.s3_bucket_name
}

output "frontend_cloudfront_url" {
  description = "Frontend CloudFront URL"
  value       = module.s3_cloudfront.cloudfront_url
}

output "frontend_cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.s3_cloudfront.cloudfront_distribution_id
}

# Route 53 Outputs
output "route53_zone_id" {
  description = "Route 53 hosted zone ID (created in this account, or looked up cross-account)"
  value       = var.domain_name != "" ? local.primary_zone_id : null
}

output "route53_name_servers" {
  description = "Route 53 name servers — only set when the zone is CREATED in this account (dns_account_role_arn empty). Null under Pattern A (zone stays in the legacy account, NS unchanged)."
  value       = one(module.route53[*].name_servers)
}

# ACM Certificate Outputs
output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = var.domain_name != "" ? module.acm_certificate[0].certificate_arn : null
  sensitive   = true
}

# Domain URLs
output "frontend_url" {
  description = "Frontend URL"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : module.s3_cloudfront.cloudfront_url
}

output "backend_api_url" {
  description = "Backend API URL"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "https://${module.elastic_beanstalk.cname}"
}

# Cost info
output "estimated_monthly_cost" {
  description = "Estimated monthly cost (Phase 1)"
  value       = "~$75-95 USD/month (Phase 1: t4g.micro RDS, single Redis, 1x t3.small EC2, no NAT)"
}
