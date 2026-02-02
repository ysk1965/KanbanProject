# Route 53 Hosted Zone Module
# Creates a hosted zone for the domain and manages DNS records

# Hosted Zone
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "${var.project_name} ${var.environment} domain"

  tags = {
    Name        = "${var.project_name}-${var.environment}-zone"
    Environment = var.environment
  }
}

# Note: DNS records are managed in the environment-specific main.tf
# This keeps the module simple and avoids circular dependencies
