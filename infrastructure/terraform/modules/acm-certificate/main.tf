# ACM Certificate Module for CloudFront
# IMPORTANT: CloudFront requires certificates in us-east-1 region
# This module should be called with an aliased provider for us-east-1

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ACM Certificate
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cert"
    Environment = var.environment
  }
}

# Certificate Validation (only creates validation resource, actual DNS records handled by Route 53 module)
resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn

  # Validation will be completed after Route 53 records are created
  # The timeouts ensure we don't wait forever if there's an issue
  timeouts {
    create = "45m"
  }
}
