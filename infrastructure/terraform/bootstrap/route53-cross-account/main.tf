# Route53 cross-account access role — APPLY THIS IN THE LEGACY (OLD) ACCOUNT
# that owns the hosted zones (bridgespots.com AND milkyway.pe.kr).
#
# It creates ONE IAM role that the NEW account's Terraform (provider "aws.dns")
# assumes to read the hosted zones and write/overwrite records, WITHOUT moving
# the zones. This keeps DNS authoritative in the old account during/after an
# account migration (Pattern A) and makes cutover a ~60s-revertible record flip
# instead of a multi-day NS re-delegation.
#
# Usage:
#   1. Configure credentials for the OLD account (the zone owner).
#   2. terraform init && terraform apply \
#        -var 'zone_names=["bridgespots.com","milkyway.pe.kr"]' \
#        -var 'trusted_principal_arns=["arn:aws:iam::259151461692:root"]'
#   3. Copy the `role_arn` output into the NEW account's terraform.tfvars as
#      dns_account_role_arn.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Configure this provider with OLD-account credentials (the zone owner).
provider "aws" {
  region = var.aws_region
}

# Look up every retained hosted zone by name
data "aws_route53_zone" "zones" {
  for_each     = toset(var.zone_names)
  name         = each.value
  private_zone = false
}

resource "aws_iam_role" "route53_cross_account" {
  name        = var.role_name
  description = "Cross-account Route53 record management for ${join(", ", var.zone_names)}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = var.trusted_principal_arns }
        Action    = "sts:AssumeRole"
        Condition = var.external_id == "" ? {} : {
          StringEquals = { "sts:ExternalId" = var.external_id }
        }
      }
    ]
  })

  tags = {
    Project   = "kanban"
    ManagedBy = "terraform"
    Purpose   = "cross-account-route53"
  }
}

# Least-privilege: write records ONLY in the named zones, plus the global
# read/lookup actions that don't support resource-level permissions.
resource "aws_iam_role_policy" "route53_records" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.route53_cross_account.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageRecordsInZones"
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListTagsForResource"
        ]
        Resource = [for z in data.aws_route53_zone.zones : z.arn]
      },
      {
        Sid    = "LookupZonesAndChanges"
        Effect = "Allow"
        Action = [
          "route53:ListHostedZones",
          "route53:ListHostedZonesByName",
          "route53:GetChange"
        ]
        Resource = "*"
      }
    ]
  })
}
