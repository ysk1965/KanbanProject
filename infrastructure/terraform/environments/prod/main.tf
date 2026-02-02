# Production Environment - Main Configuration
# This file orchestrates all modules for the production environment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after creating S3 bucket
  # backend "s3" {
  #   bucket         = "kanban-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   encrypt        = true
  #   dynamodb_table = "kanban-terraform-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = true
}

# Security Groups Module
module "security_groups" {
  source = "../../modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# RDS Module - Production settings
module "rds" {
  source = "../../modules/rds"

  project_name            = var.project_name
  environment             = var.environment
  private_subnet_ids      = module.vpc.private_subnet_ids
  security_group_id       = module.security_groups.rds_security_group_id
  master_password         = var.db_password
  min_capacity            = 0.5
  max_capacity            = 4     # Higher capacity for production
  instance_count          = 2     # Multi-AZ for high availability
  backup_retention_period = 7     # 7 days backup retention
}

# ElastiCache Module
module "elasticache" {
  source = "../../modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.redis_security_group_id
  node_type          = "cache.t4g.micro"
}

# Elastic Beanstalk Module - Production settings
module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.private_subnet_ids
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type = "t3.small"  # Larger instance for production
  min_instances = 2           # Minimum 2 for high availability
  max_instances = 4

  spring_profile = "prod"
  database_url   = module.rds.jdbc_url
  db_username    = "kanban_admin"
  db_password    = var.db_password
  redis_host     = module.elasticache.redis_endpoint
  redis_port     = "6379"
  jwt_secret     = var.jwt_secret
  frontend_url   = module.s3_cloudfront.cloudfront_url

  depends_on = [module.rds, module.elasticache]
}

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  project_name = var.project_name
  environment  = var.environment
}
