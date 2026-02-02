# Terraform Backend Configuration
# This file defines the S3 backend for Terraform state management
#
# IMPORTANT: Before using this configuration, you must create the S3 bucket and DynamoDB table:
#
# 1. Create S3 bucket:
#    aws s3api create-bucket \
#      --bucket kanban-terraform-state \
#      --region ap-northeast-2 \
#      --create-bucket-configuration LocationConstraint=ap-northeast-2
#
# 2. Enable versioning:
#    aws s3api put-bucket-versioning \
#      --bucket kanban-terraform-state \
#      --versioning-configuration Status=Enabled
#
# 3. Create DynamoDB table for state locking:
#    aws dynamodb create-table \
#      --table-name kanban-terraform-lock \
#      --attribute-definitions AttributeName=LockID,AttributeType=S \
#      --key-schema AttributeName=LockID,KeyType=HASH \
#      --billing-mode PAY_PER_REQUEST \
#      --region ap-northeast-2

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after creating S3 bucket and DynamoDB table
  # backend "s3" {
  #   bucket         = "kanban-terraform-state"
  #   key            = "ENV_NAME/terraform.tfstate"  # Replace ENV_NAME with dev or prod
  #   region         = "ap-northeast-2"
  #   encrypt        = true
  #   dynamodb_table = "kanban-terraform-lock"
  # }
}
