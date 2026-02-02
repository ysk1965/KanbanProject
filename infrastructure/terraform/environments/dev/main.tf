# Dev Environment - Low Cost Configuration
# Optimized for development with minimal costs (~$45-50/month)
#
# Cost Savings:
# - No NAT Gateway (EC2 in public subnet)
# - Standard RDS t4g.micro instead of Aurora Serverless
# - No ElastiCache (using Spring Simple Cache)

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "kanban-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "kanban-terraform-lock"
  }
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

# VPC Module - No NAT Gateway for cost savings
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = false  # Cost saving: No NAT Gateway
}

# Security Groups Module
module "security_groups" {
  source = "../../modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# RDS Simple Module - Cost effective PostgreSQL
module "rds" {
  source = "../../modules/rds-simple"

  project_name      = var.project_name
  environment       = var.environment
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.security_groups.rds_security_group_id
  master_password   = var.db_password

  instance_class          = "db.t4g.micro"  # Free tier eligible
  allocated_storage       = 20
  backup_retention_period = 1               # Minimal backup for dev
}

# Elastic Beanstalk Module - Public Subnet (no NAT needed)
module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.public_subnet_ids  # Use public subnets for EC2 (no NAT)
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type       = "t3.micro"
  min_instances       = 1
  max_instances       = 2
  associate_public_ip = "true"  # Public subnet, no NAT

  spring_profile = "dev"
  database_url   = module.rds.jdbc_url
  db_username    = "kanban_admin"
  db_password    = var.db_password
  redis_host     = ""      # No Redis - using Simple Cache
  redis_port     = ""
  jwt_secret     = var.jwt_secret
  frontend_url   = module.s3_cloudfront.cloudfront_url

  depends_on = [module.rds]
}

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  project_name = var.project_name
  environment  = var.environment
}
