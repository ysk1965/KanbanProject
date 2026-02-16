# Production Environment - Main Configuration
# This file orchestrates all modules for the production environment
#
# Cost Optimization:
# - No NAT Gateway (EC2 in public subnet with Security Group protection)
# - Security maintained via SG: only ALB can reach EC2 on 5000/8080

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

# Provider for ACM certificate (CloudFront requires us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# VPC Module - No NAT Gateway (EC2 uses public subnet with SG protection)
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = false
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
  node_type          = "cache.t4g.small"
  num_cache_clusters = 2  # Primary + Replica, Multi-AZ
}

# Elastic Beanstalk Module - Production settings
module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.public_subnet_ids  # Use public subnets for EC2 (no NAT)
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type       = "t3.small"
  min_instances       = 2           # Minimum 2 for high availability
  max_instances       = 4
  associate_public_ip = "true"      # Public subnet, no NAT

  spring_profile = "prod"
  database_url   = module.rds.jdbc_url
  db_username    = "kanban_admin"
  db_password    = var.db_password
  redis_host     = module.elasticache.redis_endpoint
  redis_port     = "6379"
  jwt_secret     = var.jwt_secret
  claude_api_key   = var.claude_api_key
  openai_api_key   = var.openai_api_key
  openai_admin_key = var.openai_admin_key
  mail_username    = var.mail_username
  mail_password   = var.mail_password
  google_client_id = var.google_client_id
  frontend_url   = module.s3_cloudfront.cloudfront_url

  depends_on = [module.rds, module.elasticache]
}

# ACM Certificate Module (us-east-1 for CloudFront)
module "acm_certificate" {
  count  = var.domain_name != "" ? 1 : 0
  source = "../../modules/acm-certificate"

  providers = {
    aws = aws.us_east_1
  }

  project_name              = var.project_name
  environment               = var.environment
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
}

# Route 53 Hosted Zone
module "route53" {
  count  = var.domain_name != "" ? 1 : 0
  source = "../../modules/route53"

  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
}

# ACM Certificate Validation Records
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in module.acm_certificate[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = module.route53[0].zone_id
}

# Frontend Domain Records
resource "aws_route53_record" "frontend_root" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

resource "aws_route53_record" "frontend_www" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

# Backend API Domain Record
resource "aws_route53_record" "backend_api" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.elastic_beanstalk.alb_dns_name
    zone_id                = module.elastic_beanstalk.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [module.elastic_beanstalk]
}

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  project_name        = var.project_name
  environment         = var.environment
  acm_certificate_arn = var.domain_name != "" ? module.acm_certificate[0].validated_certificate_arn : ""
  domain_aliases      = var.domain_name != "" ? [var.domain_name, "www.${var.domain_name}"] : []

  depends_on = [module.acm_certificate]
}
