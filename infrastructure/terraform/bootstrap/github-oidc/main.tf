# GitHub Actions OIDC + CI roles — APPLY IN THE NEW ACCOUNT (259151461692).
# Replaces static AWS_ACCESS_KEY_ID/SECRET in CI with short-lived OIDC role
# assumption (no long-lived keys). One role for terraform.yml, one for deploy-dev.yml.
#
# Usage (new-account creds):
#   terraform init && terraform apply
#   terraform output  # → set the role ARNs as GitHub repo *Variables*

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "kanban"
      ManagedBy = "terraform"
      Purpose   = "github-oidc"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  oidc       = "token.actions.githubusercontent.com"
  account_id = data.aws_caller_identity.current.account_id
}

# GitHub Actions OIDC identity provider (one per account).
# Thumbprints are AWS-published; for the official GitHub provider AWS no longer
# validates them, but the field is required.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# Reference an EXISTING provider when create_oidc_provider = false (one per account)
data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? one(aws_iam_openid_connect_provider.github[*].arn) : one(data.aws_iam_openid_connect_provider.github[*].arn)
}

# ─────────────── Terraform runner role (terraform.yml) ───────────────
resource "aws_iam_role" "terraform" {
  name = var.terraform_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = local.oidc_provider_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "${local.oidc}:aud" = "sts.amazonaws.com" }
          StringLike   = { "${local.oidc}:sub" = var.terraform_role_subs }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "terraform" {
  name = "${var.terraform_role_name}-policy"
  role = aws_iam_role.terraform.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid    = "WorkloadServices"
        Effect = "Allow"
        Action = [
          "ec2:*", "elasticbeanstalk:*", "rds:*", "elasticache:*", "s3:*",
          "cloudfront:*", "route53:*", "acm:*", "autoscaling:*",
          "elasticloadbalancing:*", "lambda:*", "events:*", "sns:*", "logs:*",
          "kms:*", "dynamodb:*", "cloudwatch:*", "cloudformation:*", "ssm:*"
        ]
        Resource = "*"
      },
      {
        # IAM write scoped to project-named resources (no privilege escalation to arbitrary roles)
        Sid    = "IamProjectRoles"
        Effect = "Allow"
        Action = ["iam:*"]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/kanban-*",
          "arn:aws:iam::${local.account_id}:instance-profile/kanban-*",
          "arn:aws:iam::${local.account_id}:policy/kanban-*"
        ]
      },
      {
        Sid      = "IamServiceLinkedAndRead"
        Effect   = "Allow"
        Action   = ["iam:CreateServiceLinkedRole", "iam:Get*", "iam:List*", "iam:PassRole"]
        Resource = "*"
      }
      ],
      var.dns_cross_account_role_arn == "" ? [] : [
        {
          Sid      = "AssumeDnsRole"
          Effect   = "Allow"
          Action   = "sts:AssumeRole"
          Resource = var.dns_cross_account_role_arn
        }
    ])
  })
}

# ─────────────── Deploy role (deploy-dev.yml) ───────────────
resource "aws_iam_role" "deploy" {
  name = var.deploy_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = local.oidc_provider_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "${local.oidc}:aud" = "sts.amazonaws.com" }
          StringLike   = { "${local.oidc}:sub" = var.deploy_role_subs }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "${var.deploy_role_name}-policy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EbDeploy"
        Effect = "Allow"
        Action = [
          "elasticbeanstalk:*", "cloudformation:Describe*", "cloudformation:Get*",
          "autoscaling:Describe*", "autoscaling:UpdateAutoScalingGroup",
          "ec2:Describe*", "elasticloadbalancing:Describe*", "logs:Describe*", "logs:Get*"
        ]
        Resource = "*"
      },
      {
        Sid    = "EbAppBundleBucket"
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketLocation",
          "s3:GetBucketPolicy", "s3:CreateBucket", "s3:PutObjectAcl"
        ]
        Resource = [
          "arn:aws:s3:::elasticbeanstalk-${var.aws_region}-${local.account_id}",
          "arn:aws:s3:::elasticbeanstalk-${var.aws_region}-${local.account_id}/*"
        ]
      },
      {
        Sid    = "FrontendBuckets"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject", "s3:GetBucketLocation"]
        Resource = [
          "arn:aws:s3:::kanban-*-frontend*",
          "arn:aws:s3:::kanban-*-frontend*/*"
        ]
      },
      {
        Sid      = "RdsWakeup"
        Effect   = "Allow"
        Action   = ["rds:StartDBInstance", "rds:DescribeDBInstances"]
        Resource = "*"
      },
      {
        Sid      = "CloudFrontInvalidation"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:ListDistributions"]
        Resource = "*"
      }
    ]
  })
}
