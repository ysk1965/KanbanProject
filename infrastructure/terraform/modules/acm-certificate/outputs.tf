output "certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.main.arn
}

output "certificate_status" {
  description = "ACM certificate status"
  value       = aws_acm_certificate.main.status
}

output "domain_validation_options" {
  description = "Domain validation options for Route 53 records"
  value       = aws_acm_certificate.main.domain_validation_options
}

output "validated_certificate_arn" {
  description = "Validated ACM certificate ARN"
  value       = aws_acm_certificate_validation.main.certificate_arn
}
